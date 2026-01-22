import { Component, computed, signal, inject, effect, ViewChild, AfterViewInit, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { lastValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ImagePersistenceService, SessionImage } from '../services/image-persistence.service';
import { AuthService } from '../services/auth.service';

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
export class EditorComponent implements AfterViewInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private imageService = inject(ImagePersistenceService);
  private sanitizer = inject(DomSanitizer);
  private authService = inject(AuthService);

  @ViewChild(EditorPreviewComponent) previewComponent!: EditorPreviewComponent;

  // Image State
  currentImageBlob = signal<Blob | null>(null);
  currentImageSource = signal<string | null>(null);
  processedImageSource = signal<string | null>(null);
  hasFile = signal(false);
  sessionGallery = signal<SessionImage[]>([]);

  // UI State
  isLoading = signal(false);

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

  // Params - Crop
  cropAspectRatio = signal<number>(NaN); // NaN for free/custom

  // Canvas State (Managed by Preview, but we track history length for controls)
  canvasHistoryLength = signal(0);

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

  ngAfterViewInit() {
    this.loadGallery();
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

    if (this.currentImageSource()) {
      URL.revokeObjectURL(this.currentImageSource()!);
    }
    if (this.processedImageSource()) {
      URL.revokeObjectURL(this.processedImageSource()!);
    }

    this.currentImageBlob.set(file);
    const url = URL.createObjectURL(file);
    this.currentImageSource.set(url);
    this.processedImageSource.set(null);
    this.hasFile.set(true);

    // Reset state
    this.lastClickCoords.set(null);
    this.selectedColors.set([]);
  }

  reset() {
    if (this.currentImageSource()) URL.revokeObjectURL(this.currentImageSource()!);
    if (this.processedImageSource()) URL.revokeObjectURL(this.processedImageSource()!);

    this.currentImageBlob.set(null);
    this.currentImageSource.set(null);
    this.processedImageSource.set(null);
    this.hasFile.set(false);
    this.lastClickCoords.set(null);
    this.selectedColors.set([]);
    this.isLoading.set(false);
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
    let resultBlob: Blob;

    try {
      switch (this.mode()) {
        case 'remove-bg':
          if (this.bgRemovalMode() === 'draw') {
            const maskBlob = await this.previewComponent.getMaskBlob();
            if (!maskBlob) throw new Error('Por favor dibuja una máscara primero');
            resultBlob = await lastValueFrom(this.api.removeBackground(blob, undefined, undefined, maskBlob, this.smartRefine()));
          } else if (this.bgRemovalMode() === 'manual' && this.selectedColors().length > 0) {
            resultBlob = await lastValueFrom(this.api.removeBackground(blob, this.selectedColors(), this.colorTolerance()));
          } else {
            resultBlob = await lastValueFrom(this.api.removeBackground(blob));
          }
          break;

        case 'remove-objects':
          if (this.removalMethod() === 'magic-wand') {
            const coords = this.lastClickCoords();
            if (!coords) throw new Error('Por favor haz clic en la imagen primero');
            resultBlob = await lastValueFrom(this.api.removeObjects(blob, undefined, { ...coords, tolerance: this.colorTolerance() }));
          } else {
            const maskBlob = await this.previewComponent.getMaskBlob();
            if (!maskBlob) throw new Error('Por favor dibuja una máscara primero');
            resultBlob = await lastValueFrom(this.api.removeObjects(blob, maskBlob));
          }
          break;

        case 'enhance':
          resultBlob = await lastValueFrom(this.api.enhanceQuality(blob, this.contrast(), this.brightness(), this.sharpness()));
          break;

        case 'upscale':
          resultBlob = await lastValueFrom(this.api.upscale(blob, this.upscaleFactor(), this.upscaleDetailBoost()));
          break;

        case 'halftone':
          resultBlob = await lastValueFrom(this.api.halftone(blob, this.dotSize(), this.halftoneScale(), this.selectedColors(), this.colorTolerance(), this.halftoneSpacing()));
          break;

        case 'contour-clip':
          if (this.bgRemovalMode() === 'manual') {
            const maskBlob = await this.previewComponent.getMaskBlob();
            if (!maskBlob) throw new Error('Por favor marca el objeto primero');
            resultBlob = await lastValueFrom(this.api.contourClip(blob, maskBlob, 'manual', this.smartRefine()));
          } else {
            resultBlob = await lastValueFrom(this.api.contourClip(blob, undefined, 'auto', false, this.selectedColors(), this.colorTolerance()));
          }
          break;

        case 'crop':
          // Use the preview component to get the cropped blob
          const cropped = await this.previewComponent.getCroppedBlob();
          if (cropped) {
            resultBlob = cropped;
          } else {
            this.isLoading.set(false);
            return;
          }
          break;

        default:
          this.isLoading.set(false);
          return;
      }

      if (this.processedImageSource()) {
        URL.revokeObjectURL(this.processedImageSource()!);
      }
      const url = URL.createObjectURL(resultBlob);
      this.processedImageSource.set(url);

    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error al procesar');
    } finally {
      this.isLoading.set(false);
    }
  }

  // Gallery Actions

  async addToGallery() {
    const src = this.processedImageSource();
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
      alert('No se pudo guardar en la galería');
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
}
