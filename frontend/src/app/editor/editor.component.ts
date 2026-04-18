import { Component, computed, signal, inject, effect, ViewChild, OnDestroy, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, PipelineOperationDTO, PipelineResponse } from '../services/api.service';
import { lastValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ImagePersistenceService, SessionImage } from '../services/image-persistence.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { PipelineService, Operation, OperationType, ExecutionResult } from '../services/pipeline.service';

// Sub-components
import { EditorUploadComponent } from './components/editor-upload/editor-upload.component';
import { EditorPreviewComponent } from './components/editor-preview/editor-preview.component';
import { EditorControlsComponent } from './components/editor-controls/editor-controls.component';
import { EditorSidebarComponent } from './components/editor-sidebar/editor-sidebar.component';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EditorUploadComponent,
    EditorPreviewComponent,
    EditorControlsComponent,
    EditorSidebarComponent
  ],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.scss',
  // encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditorComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private imageService = inject(ImagePersistenceService);
  private sanitizer = inject(DomSanitizer);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private pipelineService = inject(PipelineService);

  @ViewChild(EditorPreviewComponent) previewComponent!: EditorPreviewComponent;

  // Image State — all persisted in PipelineService so they survive mode/route changes
  currentImageBlob = this.pipelineService.currentImageBlob;
  currentImageSource = this.pipelineService.currentImageSource;
  processedImageSource = this.pipelineService.processedImageSource;
  hasFile = this.pipelineService.hasFile;
  sessionGallery = signal<SessionImage[]>([]);

  // Operation Pipeline State — persisted in PipelineService (survives route changes)
  operationQueue = this.pipelineService.operationQueue;
  isPipelineMode = this.pipelineService.isPipelineMode;

  // Pipeline Execution Results — persisted in PipelineService
  pipelineResults = this.pipelineService.pipelineResults;
  selectedResultIndex = this.pipelineService.selectedResultIndex;

  // Chain mode: next step uses previous step's output as input
  chainWithPrevious = signal(true);

  // Unified display source: selected pipeline step, or single-step result
  displayImageSource = computed(() => {
    const results = this.pipelineResults();
    if (results.length === 0) return this.processedImageSource();
    const idx = this.selectedResultIndex();
    return (idx >= 0 && idx < results.length)
      ? results[idx].outputUrl
      : results[results.length - 1].outputUrl;
  });

  // "Before" image for comparison: always the original uploaded image so each step shows
  // "original vs cumulative result" rather than "previous step vs current step"
  pipelineCurrentSource = computed(() => {
    const results = this.pipelineResults();
    if (results.length === 0) return this.currentImageSource();
    return this.currentImageSource();
  });

  // Image Stats
  inputDimensions = signal<{ width: number; height: number } | null>(null);
  outputFileSize = signal<number | null>(null);
  outputDimensions = signal<{ width: number; height: number } | null>(null);

  // UI State
  isLoading = signal(false);
  processingState = signal<{
    step: string;
    progress: number;
    estimatedSecondsRemaining: number | null;
  } | null>(null);

  // Params - Enhance
  contrast = signal(1.2);
  brightness = signal(1.1);
  sharpness = signal(1.3);

  // Params - Upscale
  upscaleFactor = signal(2);
  upscaleDetailBoost = signal(1.5);

  // Params - Background removal
  bgRemovalMode = signal<'auto' | 'manual' | 'draw'>('auto');
  smartRefine = signal(true);
  selectedColors = signal<Array<[number, number, number]>>([]);
  colorTolerance = signal(30);

  // Params - Object removal
  removalMethod = signal<'brush' | 'magic-wand'>('brush');
  lastClickCoords = signal<{ x: number, y: number } | null>(null);
  brushSize = signal(20);

  // Params - Halftone
  dotSize = signal(10);
  halftoneScale = signal(1.0);
  halftoneSpacing = signal(0);

  // Params - Output
  customFilename = '';
  processedAt = signal<Date | null>(null);

  suggestedFilename = computed(() => {
    const modeSlug: Record<string, string> = {
      'remove-bg': 'sin-fondo',
      'remove-objects': 'sin-objetos',
      'enhance': 'mejorado',
      'upscale': 'upscale',
      'halftone': 'semitonos',
      'contour-clip': 'recorte',
      'crop': 'recortado',
    };
    const slug = modeSlug[this.mode()] ?? this.mode();
    const d = this.processedAt() ?? new Date();
    const fecha = d.getFullYear().toString() +
      (d.getMonth() + 1).toString().padStart(2, '0') +
      d.getDate().toString().padStart(2, '0');
    const hora = d.getHours().toString().padStart(2, '0') +
      d.getMinutes().toString().padStart(2, '0') +
      d.getSeconds().toString().padStart(2, '0');
    return `${slug}-${fecha}-${hora}`;
  });

  // Params - Crop
  cropAspectRatio = signal<number>(NaN); // NaN for free/custom

  // Canvas State (Managed by Preview, but we track history length for controls)
  canvasHistoryLength = signal(0);

  // URL tracking delegated to PipelineService so URLs survive route changes

  mode = signal('remove-bg');

  // Computeds for Title/Desc
  protected readonly isNaN = isNaN;
  protected readonly NaN = NaN;
  title = computed(() => {
    switch (this.mode()) {
      case 'remove-bg': return 'Quitar Fondo';
      case 'remove-objects': return 'Borrar Objetos';
      case 'enhance': return 'Mejorar Calidad';
      case 'upscale': return 'Upscaling';
      case 'halftone': return 'Semitonos';
      case 'contour-clip': return 'Recorte de Contorno';
      case 'crop': return 'Recortar Foto';
      default: return 'Editor';
    }
  });

  description = computed(() => {
    switch (this.mode()) {
      case 'remove-bg': return 'Elimina el fondo de tus imágenes automáticamente con IA o seleccionando colores.';
      case 'remove-objects': return 'Elimina objetos indeseados (Demo automática).';
      case 'enhance': return 'Ajusta nitidez, contraste y brillo.';
      case 'upscale': return `Aumenta la resolución de tu imagen hasta ${this.upscaleFactor()}x.`;
      case 'halftone': return 'Convierte tu foto en arte de semitonos profesionales.';
      case 'contour-clip': return 'Recorta el contorno de un objeto seleccionándolo manualmente o de forma automática.';
      case 'crop': return 'Recorta tu imagen con proporciones predefinidas o personalizadas.';
      default: return '';
    }
  });

  constructor() {
    this.route.url.subscribe(segments => {
      if (segments.length > 0) {
        this.mode.set(segments[0].path);
        this.processedImageSource.set(null);
      }
    });

    // Reload gallery when current project changes
    effect(() => {
      const project = this.authService.currentProject();
      if (project) {
        this.loadGallery();
      } else {
        this.sessionGallery.set([]);
      }
    });
  }

  async loadGallery() {
    try {
      const projectId = this.authService.currentProject()?.id;
      if (!projectId) {
        this.sessionGallery.set([]);
        return;
      }
      const images = await this.imageService.getAllImages(projectId);
      this.sessionGallery.set(images);
    } catch (err) {
      console.error('Error loading gallery', err);
    }
  }

  handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;

    this.pipelineService.revokeAllUrls();

    this.currentImageBlob.set(file);
    const url = URL.createObjectURL(file);
    this.pipelineService.trackUrl(url);
    this.currentImageSource.set(url);
    this.processedImageSource.set(null);
    this.pipelineResults.set([]);
    this.selectedResultIndex.set(-1);
    this.hasFile.set(true);

    // Reset stats
    this.inputDimensions.set(null);
    this.outputFileSize.set(null);
    this.outputDimensions.set(null);
    this.loadDimensions(url).then(dims => this.inputDimensions.set(dims));

    // Reset state
    this.lastClickCoords.set(null);
    this.selectedColors.set([]);
    this.previewComponent?.setViewMode('comparison');
  }

  reset() {
    this.pipelineService.revokeAllUrls();

    this.currentImageBlob.set(null);
    this.currentImageSource.set(null);
    this.processedImageSource.set(null);
    this.pipelineResults.set([]);
    this.selectedResultIndex.set(-1);
    this.hasFile.set(false);
    this.lastClickCoords.set(null);
    this.selectedColors.set([]);
    this.isLoading.set(false);
    this.inputDimensions.set(null);
    this.outputFileSize.set(null);
    this.outputDimensions.set(null);
    this.previewComponent?.setViewMode('comparison');
  }

  // Actions from Sub-components

  onPreviewPointSelected(point: { x: number, y: number }) {
    this.lastClickCoords.set(point);
  }

  onPreviewColorPicked(color: [number, number, number]) {
    this.selectedColors.update(colors => [...colors, color]);
  }

  onHistoryChange(length: number) {
    this.canvasHistoryLength.set(length);
  }

  // Processing Logic

  async process() {
    const blob = this.currentImageBlob();
    if (!blob) return;

    this.isLoading.set(true);
    this.processingState.set({ step: 'Iniciando...', progress: 0, estimatedSecondsRemaining: null });
    let resultBlob: Blob;

    try {
      switch (this.mode()) {
        case 'remove-bg':
          this.processingState.set({ step: 'Analizando imagen...', progress: 20, estimatedSecondsRemaining: 5 });
          if (this.bgRemovalMode() === 'draw') {
            const maskBlob = await this.previewComponent.getMaskBlob();
            if (!maskBlob) throw new Error('Por favor dibuja una máscara primero');
            this.processingState.set({ step: 'Eliminando fondo con IA...', progress: 50, estimatedSecondsRemaining: 3 });
            resultBlob = await lastValueFrom(this.api.removeBackground(blob, undefined, undefined, maskBlob, this.smartRefine()));
          } else if (this.bgRemovalMode() === 'manual' && this.selectedColors().length > 0) {
            this.processingState.set({ step: 'Procesando colores seleccionados...', progress: 50, estimatedSecondsRemaining: 3 });
            resultBlob = await lastValueFrom(this.api.removeBackground(blob, this.selectedColors(), this.colorTolerance()));
          } else {
            this.processingState.set({ step: 'Eliminando fondo automáticamente...', progress: 50, estimatedSecondsRemaining: 5 });
            resultBlob = await lastValueFrom(this.api.removeBackground(blob));
          }
          break;

        case 'remove-objects':
          this.processingState.set({ step: 'Detectando objetos...', progress: 20, estimatedSecondsRemaining: 5 });
          if (this.removalMethod() === 'magic-wand') {
            const coords = this.lastClickCoords();
            if (!coords) throw new Error('Por favor haz clic en la imagen primero');
            this.processingState.set({ step: 'Reconstruyendo área...', progress: 50, estimatedSecondsRemaining: 3 });
            resultBlob = await lastValueFrom(this.api.removeObjects(blob, undefined, { ...coords, tolerance: this.colorTolerance() }));
          } else {
            const maskBlob = await this.previewComponent.getMaskBlob();
            if (!maskBlob) throw new Error('Por favor dibuja una máscara primero');
            this.processingState.set({ step: 'Eliminando objetos...', progress: 50, estimatedSecondsRemaining: 5 });
            resultBlob = await lastValueFrom(this.api.removeObjects(blob, maskBlob));
          }
          break;

        case 'enhance':
          this.processingState.set({ step: 'Aplicando mejoras...', progress: 30, estimatedSecondsRemaining: 2 });
          resultBlob = await lastValueFrom(this.api.enhanceQuality(blob, this.contrast(), this.brightness(), this.sharpness()));
          break;

        case 'upscale':
          resultBlob = await lastValueFrom(this.api.upscale(blob, this.upscaleFactor(), this.upscaleDetailBoost(), (progress, step) => {
            this.processingState.set({ step, progress, estimatedSecondsRemaining: this.calculateRemainingTime(progress, 30) });
          }));
          break;

        case 'halftone':
          this.processingState.set({ step: 'Generando semitonos...', progress: 30, estimatedSecondsRemaining: 3 });
          resultBlob = await lastValueFrom(this.api.halftone(blob, this.dotSize(), this.halftoneScale(), this.selectedColors(), this.colorTolerance(), this.halftoneSpacing()));
          break;

        case 'contour-clip':
          this.processingState.set({ step: 'Detectando contorno...', progress: 20, estimatedSecondsRemaining: 5 });
          if (this.bgRemovalMode() === 'manual') {
            const maskBlob = await this.previewComponent.getMaskBlob();
            if (!maskBlob) throw new Error('Por favor marca el objeto primero');
            this.processingState.set({ step: 'Recortando objeto...', progress: 50, estimatedSecondsRemaining: 3 });
            resultBlob = await lastValueFrom(this.api.contourClip(blob, maskBlob, 'manual', this.smartRefine()));
          } else {
            this.processingState.set({ step: 'Recortando automáticamente...', progress: 50, estimatedSecondsRemaining: 5 });
            resultBlob = await lastValueFrom(this.api.contourClip(blob, undefined, 'auto', false, this.selectedColors(), this.colorTolerance()));
          }
          break;

        case 'crop':
          this.processingState.set({ step: 'Recortando imagen...', progress: 50, estimatedSecondsRemaining: 1 });
          // Use the preview component to get the cropped blob
          const cropped = await this.previewComponent.getCroppedBlob();
          if (cropped) {
            resultBlob = cropped;
          } else {
            this.isLoading.set(false);
            this.processingState.set(null);
            return;
          }
          break;

        default:
          this.isLoading.set(false);
          this.processingState.set(null);
          return;
      }

      this.processingState.set({ step: 'Finalizando...', progress: 95, estimatedSecondsRemaining: 1 });

      this.pipelineService.revokeUrl(this.processedImageSource());
      const url = URL.createObjectURL(resultBlob);
      this.pipelineService.trackUrl(url);
      this.processedImageSource.set(url);
      this.processedAt.set(new Date());

      this.outputFileSize.set(resultBlob.size);
      this.outputDimensions.set(null);
      if (this.mode() === 'upscale') {
        this.loadDimensions(url).then(dims => this.outputDimensions.set(dims));
      }

    } catch (err: any) {
      console.error(err);
      const errorMessage = err.message || 'Error al procesar';
      this.toastService.error(errorMessage, true, () => this.process());
    } finally {
      this.isLoading.set(false);
      this.processingState.set(null);
    }
  }

  private calculateRemainingTime(progress: number, estimatedTotalSeconds: number): number {
    const remainingPercentage = 100 - progress;
    return Math.round((remainingPercentage / 100) * estimatedTotalSeconds);
  }

  // Gallery Actions

  async addToGallery() {
    const src = this.displayImageSource();
    let blob: Blob | null = null;

    if (src) {
      try {
        const resp = await fetch(src);
        blob = await resp.blob();
      } catch (e) {
        console.error('Error fetching blob from URL', e);
      }
    } else {
      blob = this.currentImageBlob();
    }

    if (!blob) return;

    const name = `${this.title()} ${this.sessionGallery().length + 1}`;

    try {
      const projectId = this.authService.currentProject()?.id;
      const saved = await this.imageService.saveImage(blob, name, projectId);

      if (projectId === this.authService.currentProject()?.id) {
        this.sessionGallery.update(prev => [saved, ...prev]);
      }
    } catch (e) {
      console.error(e);
      this.toastService.error('No se pudo guardar en la galería', true, () => this.addToGallery());
    }
  }

  loadFromGallery(item: SessionImage) {
    const file = new File([item.blob], item.name, { type: item.blob.type });
    this.handleFile(file);
  }

  async deleteFromGallery(id: string) {
    try {
      await this.imageService.deleteImage(id);
      this.sessionGallery.update(prev => prev.filter(img => img.id !== id));
    } catch (e) {
      console.error(e);
    }
  }

  private loadDimensions(src: string): Promise<{ width: number; height: number }> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = src;
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  ngOnDestroy() {
    // URLs are managed by PipelineService — not revoked here so they survive route changes
  }

  // Pipeline Management Methods

  togglePipelineMode() {
    this.pipelineService.togglePipelineMode();
  }

  async addToPipeline() {
    const queueHasItems = this.operationQueue().length > 0;
    const inputMode = queueHasItems && this.chainWithPrevious() ? 'chained' : 'original';
    const mode = this.mode() as OperationType;
    const params = this.getCurrentParams();

    // Capture mask at add-time for operations that need canvas drawing
    let maskBlob: Blob | undefined;
    if (mode === 'remove-bg' && params['mode'] === 'draw') {
      maskBlob = (await this.previewComponent?.getMaskBlob()) ?? undefined;
      if (!maskBlob) {
        this.toastService.warning('Dibuja una máscara primero para el modo de dibujo');
        return;
      }
    } else if (mode === 'remove-objects' && params['method'] !== 'magic-wand') {
      maskBlob = (await this.previewComponent?.getMaskBlob()) ?? undefined;
      if (!maskBlob) {
        this.toastService.warning('Dibuja una máscara primero');
        return;
      }
    } else if (mode === 'contour-clip' && params['mode'] === 'manual') {
      maskBlob = (await this.previewComponent?.getMaskBlob()) ?? undefined;
      if (!maskBlob) {
        this.toastService.warning('Marca el objeto primero');
        return;
      }
    }

    // Capture magic-wand coords at add-time
    if (mode === 'remove-objects' && params['method'] === 'magic-wand') {
      const coords = this.lastClickCoords();
      if (!coords) {
        this.toastService.warning('Haz clic en la imagen primero para seleccionar área');
        return;
      }
      params['x'] = coords.x;
      params['y'] = coords.y;
    }

    const operation: Operation = {
      id: Date.now().toString(),
      type: mode,
      params,
      timestamp: Date.now(),
      inputBlob: this.currentImageBlob() ?? undefined,
      inputUrl: this.currentImageSource() ?? undefined,
      inputMode,
      maskBlob,
    };

    this.pipelineService.addOperation(operation);
    this.toastService.success('Operación agregada al pipeline');
  }

  removeFromPipeline(operationId: string) {
    this.pipelineService.removeOperation(operationId);
  }

  moveOperationInQueue(fromIndex: number, toIndex: number) {
    this.pipelineService.moveOperation(fromIndex, toIndex);
  }

  async executePipeline() {
    const queue = this.operationQueue();
    if (queue.length === 0) {
      this.toastService.warning('No hay operaciones en el pipeline');
      return;
    }

    const fallbackBlob = this.currentImageBlob();
    if (!fallbackBlob) return;

    // Revoke previous pipeline result URLs before new execution
    this.pipelineResults().forEach(r => this.pipelineService.revokeUrl(r.outputUrl));
    this.pipelineResults.set([]);
    this.selectedResultIndex.set(-1);

    this.isLoading.set(true);
    const newResults: ExecutionResult[] = [];

    try {
      // Partition queue into segments: chained groups (2+ ops) vs singles
      // A group starts with any op. Subsequent ops with inputMode='chained' extend the group.
      const segments: Array<{ ops: Operation[]; startIndex: number }> = [];
      let currentSegment: Operation[] = [];
      let segmentStart = 0;

      for (let i = 0; i < queue.length; i++) {
        const op = queue[i];
        if (op.inputMode === 'chained' && currentSegment.length > 0) {
          currentSegment.push(op);
        } else {
          if (currentSegment.length > 0) {
            segments.push({ ops: currentSegment, startIndex: segmentStart });
          }
          currentSegment = [op];
          segmentStart = i;
        }
      }
      if (currentSegment.length > 0) {
        segments.push({ ops: currentSegment, startIndex: segmentStart });
      }

      let globalIndex = 0;
      for (const segment of segments) {
        const { ops, startIndex } = segment;

        if (ops.length >= 2) {
          // Chained group → single backend pipeline call
          this.processingState.set({
            step: `Procesando pasos ${startIndex + 1}–${startIndex + ops.length}/${queue.length} en servidor...`,
            progress: Math.round((globalIndex / queue.length) * 100),
            estimatedSecondsRemaining: null
          });

          const sourceOp = ops[0];
          // Source image: first op's captured blob or fallback
          let sourceBlob: Blob;
          if (startIndex > 0 && newResults[startIndex - 1]) {
            sourceBlob = newResults[startIndex - 1].outputBlob;
          } else {
            sourceBlob = sourceOp.inputBlob ?? fallbackBlob;
          }

          const pipelineOps: PipelineOperationDTO[] = ops.map(op => ({
            type: op.type,
            params: op.params,
            input_mode: op.inputMode,
          }));

          const masks = new Map<number, Blob>();
          ops.forEach((op, idx) => {
            if (op.maskBlob) masks.set(idx, op.maskBlob);
          });

          const response: PipelineResponse = await lastValueFrom(
            this.api.executePipeline(sourceBlob, pipelineOps, masks)
          );

          for (const stepResult of response.results) {
            const absoluteIndex = startIndex + stepResult.step_index;
            const op = ops[stepResult.step_index];

            if (stepResult.status === 'failed') {
              throw new Error(`Paso ${absoluteIndex + 1} (${this.getOperationName(op.type)}): ${stepResult.error}`);
            }

            const resultBlob = this.base64ToBlob(stepResult.image_base64!);
            const url = URL.createObjectURL(resultBlob);
            this.pipelineService.trackUrl(url);
            newResults[absoluteIndex] = {
              stepIndex: absoluteIndex,
              operationId: op.id,
              label: this.getOperationName(op.type),
              outputUrl: url,
              outputBlob: resultBlob,
              inputUrl: absoluteIndex > 0 ? newResults[absoluteIndex - 1]?.outputUrl : op.inputUrl,
            };
          }

          globalIndex += ops.length;

        } else {
          // Single op → existing individual endpoint
          const op = ops[0];
          this.processingState.set({
            step: `Procesando ${startIndex + 1}/${queue.length}: ${this.getOperationName(op.type)}`,
            progress: Math.round((globalIndex / queue.length) * 100),
            estimatedSecondsRemaining: null
          });

          let inputBlob: Blob;
          let inputUrl: string | undefined;
          if (op.inputMode === 'chained' && startIndex > 0 && newResults[startIndex - 1]) {
            inputBlob = newResults[startIndex - 1].outputBlob;
            inputUrl = newResults[startIndex - 1].outputUrl;
          } else {
            inputBlob = op.inputBlob ?? fallbackBlob;
            inputUrl = op.inputUrl;
          }

          const resultBlob = await this.executeOperation(inputBlob, op);
          const url = URL.createObjectURL(resultBlob);
          this.pipelineService.trackUrl(url);
          newResults[startIndex] = {
            stepIndex: startIndex,
            operationId: op.id,
            label: this.getOperationName(op.type),
            outputUrl: url,
            outputBlob: resultBlob,
            inputUrl,
          };

          globalIndex += 1;
        }
      }

      this.pipelineResults.set(newResults);
      this.selectedResultIndex.set(-1);
      this.processedAt.set(new Date());

      const lastResult = newResults[newResults.length - 1];
      if (lastResult) {
        this.outputFileSize.set(lastResult.outputBlob.size);
        this.outputDimensions.set(null);
        if (lastResult.label === 'Upscaling') {
          this.loadDimensions(lastResult.outputUrl).then(dims => this.outputDimensions.set(dims));
        }
      }

      this.toastService.success('Pipeline completado exitosamente');
      this.pipelineService.clearQueue();
    } catch (err: any) {
      console.error(err);
      this.toastService.error(err.message || 'Error al ejecutar pipeline', true, () => this.executePipeline());
    } finally {
      this.isLoading.set(false);
      this.processingState.set(null);
    }
  }

  private base64ToBlob(b64: string): Blob {
    const byteString = atob(b64);
    const arr = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      arr[i] = byteString.charCodeAt(i);
    }
    return new Blob([arr], { type: 'image/png' });
  }

  selectPipelineStep(index: number) {
    this.selectedResultIndex.set(index);
    const result = this.pipelineResults()[index];
    if (result) {
      this.outputFileSize.set(result.outputBlob.size);
      this.outputDimensions.set(null);
      if (result.label === 'Upscaling') {
        this.loadDimensions(result.outputUrl).then(dims => this.outputDimensions.set(dims));
      }
    }
  }

  useStepAsSource(result: ExecutionResult) {
    // Revoke all URLs except the one becoming the new base
    this.pipelineResults().forEach(r => {
      if (r.outputUrl !== result.outputUrl) this.pipelineService.revokeUrl(r.outputUrl);
    });

    const oldSource = this.currentImageSource();
    if (oldSource && oldSource !== result.outputUrl) this.pipelineService.revokeUrl(oldSource);

    const oldProcessed = this.processedImageSource();
    if (oldProcessed && oldProcessed !== result.outputUrl) this.pipelineService.revokeUrl(oldProcessed);

    this.pipelineResults.set([]);
    this.selectedResultIndex.set(-1);
    this.processedImageSource.set(null);
    this.pipelineService.clearQueue();

    // Load step result as new base image
    this.currentImageBlob.set(result.outputBlob);
    this.currentImageSource.set(result.outputUrl); // reuse existing blob URL

    // Reset stats — new base image
    this.inputDimensions.set(null);
    this.outputFileSize.set(null);
    this.outputDimensions.set(null);
    this.loadDimensions(result.outputUrl).then(dims => this.inputDimensions.set(dims));

    // Reset canvas/selection state
    this.lastClickCoords.set(null);
    this.selectedColors.set([]);
    this.previewComponent?.setViewMode('comparison');

    this.toastService.success(`Paso ${result.stepIndex + 1} cargado como imagen base`);
  }

  private getCurrentParams(): Record<string, any> {
    switch (this.mode()) {
      case 'enhance':
        return { contrast: this.contrast(), brightness: this.brightness(), sharpness: this.sharpness() };
      case 'upscale':
        return { factor: this.upscaleFactor(), detailBoost: this.upscaleDetailBoost() };
      case 'remove-bg':
        return { mode: this.bgRemovalMode(), smartRefine: this.smartRefine(), selectedColors: this.selectedColors(), colorTolerance: this.colorTolerance() };
      case 'remove-objects':
        return { method: this.removalMethod(), brushSize: this.brushSize(), colorTolerance: this.colorTolerance() };
      case 'halftone':
        return { dotSize: this.dotSize(), scale: this.halftoneScale(), spacing: this.halftoneSpacing(), selectedColors: this.selectedColors(), colorTolerance: this.colorTolerance() };
      case 'contour-clip':
        return { mode: this.bgRemovalMode(), smartRefine: this.smartRefine(), selectedColors: this.selectedColors(), colorTolerance: this.colorTolerance() };
      case 'crop':
        return { aspectRatio: this.cropAspectRatio() };
      default:
        return {};
    }
  }

  protected getParamsSummary(op: Operation): string[] {
    const p = op.params;
    switch (op.type) {
      case 'enhance':
        return [`Contraste: ${p['contrast']}`, `Brillo: ${p['brightness']}`, `Nitidez: ${p['sharpness']}`];
      case 'upscale':
        return [`${p['factor']}x`, `Detalle: ${p['detailBoost']}`];
      case 'remove-bg': {
        const chips = [`Modo: ${p['mode']}`];
        if (p['mode'] !== 'auto') chips.push(`Tolerancia: ${p['colorTolerance']}`);
        if (p['mode'] === 'draw' && p['smartRefine']) chips.push('Smart Refine');
        return chips;
      }
      case 'remove-objects': {
        const chips = [`Método: ${p['method']}`];
        if (p['method'] === 'brush') chips.push(`Pincel: ${p['brushSize']}px`);
        else chips.push(`Tolerancia: ${p['colorTolerance']}`);
        return chips;
      }
      case 'halftone':
        return [`Punto: ${p['dotSize']}px`, `Escala: ${p['scale']}`, `Sep: ${p['spacing']}px`];
      case 'contour-clip': {
        const chips = [`Modo: ${p['mode']}`];
        if (p['mode'] === 'manual' && p['smartRefine']) chips.push('Smart Refine');
        return chips;
      }
      case 'crop':
        return [isNaN(p['aspectRatio']) ? 'Libre' : `Relación: ${p['aspectRatio'].toFixed(2)}`];
      default:
        return [];
    }
  }

  protected getOperationName(type: OperationType): string {
    const names: Record<OperationType, string> = {
      enhance: 'Mejorar Calidad',
      upscale: 'Upscaling',
      'remove-bg': 'Quitar Fondo',
      'remove-objects': 'Borrar Objetos',
      halftone: 'Semitonos',
      'contour-clip': 'Recorte de Contorno',
      crop: 'Recortar'
    };
    return names[type] || type;
  }

  private async executeOperation(blob: Blob, operation: Operation): Promise<Blob> {
    const { type, params } = operation;

    switch (type) {
      case 'enhance':
        return await lastValueFrom(this.api.enhanceQuality(blob, params['contrast'], params['brightness'], params['sharpness']));
      case 'upscale':
        return await lastValueFrom(this.api.upscale(blob, params['factor'], params['detailBoost']));
      case 'remove-bg':
        if (params['mode'] === 'draw') {
          const maskBlob = await this.previewComponent.getMaskBlob();
          if (!maskBlob) throw new Error('Por favor dibuja una máscara primero');
          return await lastValueFrom(this.api.removeBackground(blob, undefined, undefined, maskBlob, params['smartRefine']));
        } else if (params['mode'] === 'manual' && params['selectedColors']?.length > 0) {
          return await lastValueFrom(this.api.removeBackground(blob, params['selectedColors'], params['colorTolerance']));
        } else {
          return await lastValueFrom(this.api.removeBackground(blob));
        }
      case 'remove-objects':
        if (params['method'] === 'magic-wand') {
          const coords = this.lastClickCoords();
          if (!coords) throw new Error('Por favor haz clic en la imagen primero');
          return await lastValueFrom(this.api.removeObjects(blob, undefined, { ...coords, tolerance: params['colorTolerance'] }));
        } else {
          const maskBlob = await this.previewComponent.getMaskBlob();
          if (!maskBlob) throw new Error('Por favor dibuja una máscara primero');
          return await lastValueFrom(this.api.removeObjects(blob, maskBlob));
        }
      case 'halftone':
        return await lastValueFrom(this.api.halftone(blob, params['dotSize'], params['scale'], params['selectedColors'], params['colorTolerance'], params['spacing']));
      case 'contour-clip':
        if (params['mode'] === 'manual') {
          const maskBlob = await this.previewComponent.getMaskBlob();
          if (!maskBlob) throw new Error('Por favor marca el objeto primero');
          return await lastValueFrom(this.api.contourClip(blob, maskBlob, 'manual', params['smartRefine']));
        } else {
          return await lastValueFrom(this.api.contourClip(blob, undefined, 'auto', false, params['selectedColors'], params['colorTolerance']));
        }
      case 'crop':
        const cropped = await this.previewComponent.getCroppedBlob();
        if (!cropped) throw new Error('Por favor selecciona un área para recortar');
        return cropped;
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }
}
