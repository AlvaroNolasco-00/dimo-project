import { Component, computed, signal, inject, effect, ViewChild, ElementRef, AfterViewInit, OnDestroy, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { lastValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import Cropper from 'cropperjs';
import { ImagePersistenceService, SessionImage } from '../services/image-persistence.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private imageService = inject(ImagePersistenceService);
  private sanitizer = inject(DomSanitizer);
  private authService = inject(AuthService);

  @ViewChild('maskCanvas') maskCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('originalImage') originalImage?: ElementRef<HTMLImageElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  currentImageBlob = signal<Blob | null>(null);
  currentImageSource = signal<string | null>(null); // URL for preview
  processedImageSource = signal<string | null>(null);
  sessionGallery = signal<SessionImage[]>([]);

  isLoading = signal(false);
  isDragging = signal(false);

  // Enhance params
  contrast = signal(1.2);
  brightness = signal(1.1);
  sharpness = signal(1.3);

  // Upscale params
  upscaleFactor = signal(2);
  upscaleDetailBoost = signal(1.5);

  // Background removal params
  // Background removal params
  bgRemovalMode = signal<'auto' | 'manual' | 'draw'>('auto');
  smartRefine = signal(true);
  selectedColors = signal<Array<[number, number, number]>>([]);
  colorTolerance = signal(30);

  // Object removal params
  removalMethod = signal<'brush' | 'magic-wand'>('brush');
  lastClickCoords = signal<{ x: number, y: number } | null>(null);
  brushSize = signal(20);
  isDrawing = signal(false);
  canvasInitialized = signal(false);

  // Halftone params
  dotSize = signal(10);
  halftoneScale = signal(1.0);
  halftoneSpacing = signal(0);

  // Output params
  customFilename = '';
  canvasHistory = signal<ImageData[]>([]);

  // Cropper params
  private cropperInstance: Cropper | null = null;
  cropAspectRatio = signal<number>(NaN); // NaN for free/custom

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

  // Color picker helper methods
  openColorPicker(input: HTMLInputElement) {
    // Hack: Set a random value briefly so that selecting black (default #000000)
    // triggers a change event.
    input.value = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    input.click();
  }

  addColorFromPicker(hexColor: string) {
    const rgb = this.hexToRgb(hexColor);
    if (rgb) {
      this.selectedColors.update(colors => [...colors, rgb]);
    }
  }

  removeColor(index: number) {
    this.selectedColors.update(colors => colors.filter((c, i) => i !== index));
  }

  hexToRgb(hex: string): [number, number, number] | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : null;
  }

  constructor() {
    this.route.url.subscribe(segments => {
      // route path is e.g. 'remove-bg'
      if (segments.length > 0) {
        this.mode.set(segments[0].path);
        // Reset processed image when changing mode?
        // Maybe optional. Let's keep the uploaded image but reset processed.
        this.processedImageSource.set(null);
      }
    });

    // Reload gallery when current project changes
    effect(() => {
      const project = this.authService.currentProject();
      if (project) {
        this.loadGallery();
      } else {
        // Ideally clear gallery or show empty
        this.sessionGallery.set([]);
      }
    });

    // Re-init cropper when mode changes to 'crop'
    effect(() => {
      const currentMode = this.mode();
      if (currentMode === 'crop') {
        // Use setTimeout to allow view to update (if ngIf changes)
        setTimeout(() => {
          if (this.originalImage?.nativeElement && this.currentImageSource()) {
            this.initCropper(this.originalImage.nativeElement);
          }
        });
      } else {
        this.destroyCropper();
      }
    });
  }

  ngAfterViewInit() {
    // Canvas will be initialized when image loads
    this.loadGallery();
  }

  async loadGallery() {
    try {
      const projectId = this.authService.currentProject()?.id;
      // If we want strict mode, only load if projectId exists
      // But maybe for "no-project" it's empty?
      if (!projectId) {
        this.sessionGallery.set([]);
        return;
      }
      const images = await this.imageService.getAllImages(projectId);
      this.sessionGallery.set(images);

      // Generate URLs for thumbnails (optional, but needed for img src)
      // Note: We might want to revoke these eventually, but for a session cache it's okay-ish.
      // A better approach is to create ObjectURLs only when rendering or on load.
      // For now, let's just rely on the template creating URLs or create them here.
      // Actually, Angular templates re-running createObjectURL is bad.
      // Let's attach ephemeral URLs to the objects in the signal if needed,
      // or just use a method in the template (efficient enough for small lists).
    } catch (err) {
      console.error('Error loading gallery', err);
    }
  }

  // Helper for template to avoid constant re-creation, though simple method call is easier for now.
  // Ideally we map the Blobs to URLs once.
  getSafeUrl(blob: Blob): SafeUrl {
    return this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(blob));
  }

  async addToGallery() {
    // Prefer processed image, fallback to current
    const src = this.processedImageSource();
    let blob: Blob | null = null;

    if (src) {
      // If we have a URL, we need to fetch the blob again OR use the underlying blob if we stored it?
      // We do not store the processed blob in a variable, only the URL.
      // So we fetch it from the blob URL.
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

    // Create a name based on mode + time or index
    const name = `${this.title()} ${this.sessionGallery().length + 1}`;

    try {
      const projectId = this.authService.currentProject()?.id;
      const saved = await this.imageService.saveImage(blob, name, projectId);

      // If we saved with a projectId that matches current view, update UI
      // If we rely on subscription/effect, we might double update or not need this manual update.
      // But manual update is faster UI feedback.
      if (projectId === this.authService.currentProject()?.id) {
        this.sessionGallery.update(prev => [saved, ...prev]);
      }
      // Optional: Toast or feedback
    } catch (e) {
      console.error(e);
      alert('No se pudo guardar en la galería');
    }
  }

  loadFromGallery(item: SessionImage) {
    // Set as current image
    this.handleFile(item.blob as any); // handleFile expects File, but Blob is close enough mostly. 
    // actually handleFile checks .type and creates objectURL. 
    // We might need to construct a File object or adjust handleFile.
    // Let's create a File from Blob to be safe and compatible.
    const file = new File([item.blob], item.name, { type: item.blob.type });
    this.handleFile(file);
  }

  async deleteFromGallery(id: string, event: Event) {
    event.stopPropagation(); // Prevent clicking the item
    try {
      await this.imageService.deleteImage(id);
      this.sessionGallery.update(prev => prev.filter(img => img.id !== id));
    } catch (e) {
      console.error(e);
    }
  }
  onImageLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    if ((this.mode() === 'remove-objects' && this.removalMethod() !== 'magic-wand') || (this.mode() === 'remove-bg' && this.bgRemovalMode() === 'draw') || (this.mode() === 'contour-clip' && this.bgRemovalMode() === 'manual')) {
      this.initCanvas(img.naturalWidth, img.naturalHeight);
    }
    if (this.mode() === 'crop') {
      this.initCropper(img);
    }
  }

  ngOnDestroy() {
    this.destroyCropper();
  }

  initCropper(imageElement: HTMLImageElement) {
    this.destroyCropper();

    // Check if we are in free mode or fixed
    const isFree = isNaN(this.cropAspectRatio());

    this.cropperInstance = new Cropper(imageElement, {
      aspectRatio: this.cropAspectRatio(),
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 0.9, // Make it large
      zoomable: true,
      scalable: false,

      // Always allow moving/resizing the box for consistency unless explicitly not desired?
      // User struggled when it was locked. Let's make it flexible.
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,

      background: false,
      responsive: true,
      guides: true,
      center: true,
      highlight: true,
      modal: true,
    });
  }

  destroyCropper() {
    if (this.cropperInstance) {
      this.cropperInstance.destroy();
      this.cropperInstance = null;
    }
  }

  setAspectRatio(ratio: number) {
    this.cropAspectRatio.set(ratio);
    // Re-initialize to reset the crop box and options completely
    if (this.originalImage?.nativeElement) {
      this.initCropper(this.originalImage.nativeElement);
    }
  }

  initCanvas(width: number, height: number) {
    const canvas = this.maskCanvas?.nativeElement;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill with black (non-mask area)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);

    this.canvasInitialized.set(true);
  }

  saveHistory() {
    const canvas = this.maskCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    this.canvasHistory.update(history => [...history, imageData].slice(-10)); // Keep last 10 steps
  }

  undo() {
    const history = this.canvasHistory();
    if (history.length === 0) return;

    const canvas = this.maskCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prevState = history[history.length - 1];
    ctx.putImageData(prevState, 0, 0);
    this.canvasHistory.set(history.slice(0, -1));
  }

  startDrawing(event: MouseEvent) {
    if (this.mode() === 'remove-objects' && this.removalMethod() !== 'brush') return;
    if (this.mode() === 'remove-bg' && this.bgRemovalMode() !== 'draw') return;
    if (this.mode() === 'contour-clip' && this.bgRemovalMode() !== 'manual') return;
    this.saveHistory();
    this.isDrawing.set(true);
    this.draw(event);
  }

  onImageClick(event: MouseEvent) {
    const img = this.originalImage?.nativeElement;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = Math.round((event.clientX - rect.left) * scaleX);
    const y = Math.round((event.clientY - rect.top) * scaleY);

    if (this.mode() === 'remove-objects' && this.removalMethod() === 'magic-wand') {
      this.lastClickCoords.set({ x, y });
    } else if (this.mode() === 'remove-bg' || (this.mode() === 'contour-clip' && this.bgRemovalMode() === 'auto')) {
      // Pick color from image
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const color: [number, number, number] = [pixel[0], pixel[1], pixel[2]];
        this.selectedColors.set([...this.selectedColors(), color]);
      }
    }
  }

  draw(event: MouseEvent) {
    if (!this.isDrawing()) return;
    if (this.mode() === 'remove-objects' && this.removalMethod() !== 'brush') return;
    if (this.mode() === 'remove-bg' && this.bgRemovalMode() !== 'draw') return;
    if (this.mode() === 'contour-clip' && this.bgRemovalMode() !== 'manual') return;

    const canvas = this.maskCanvas?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    // Draw white circle (mask area)
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x, y, this.brushSize() / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  stopDrawing() {
    this.isDrawing.set(false);
  }

  clearCanvas() {
    const canvas = this.maskCanvas?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  canvasToBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const canvas = this.maskCanvas?.nativeElement;
      if (!canvas) {
        resolve(null);
        return;
      }
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }


  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.handleFile(input.files[0]);
      // Reset input value so the same file can be selected again
      input.value = '';
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    if (event.dataTransfer?.files.length) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;

    // Revoke old URL to avoid memory leaks
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

    // Reset state for new image
    this.lastClickCoords.set(null);
    this.canvasHistory.set([]);
    this.canvasInitialized.set(false);
  }

  reset() {
    // Revoke URLs
    if (this.currentImageSource()) {
      URL.revokeObjectURL(this.currentImageSource()!);
    }
    if (this.processedImageSource()) {
      URL.revokeObjectURL(this.processedImageSource()!);
    }

    this.currentImageBlob.set(null);
    this.currentImageSource.set(null);
    this.processedImageSource.set(null);

    // Reset all tool states
    this.lastClickCoords.set(null);
    this.selectedColors.set([]);
    this.canvasHistory.set([]);
    this.canvasInitialized.set(false);
    this.isLoading.set(false);
    this.destroyCropper();

    // Reset file input native element
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  async process() {
    const blob = this.currentImageBlob();
    if (!blob) return;

    this.isLoading.set(true);
    let resultBlob: Blob;

    try {
      switch (this.mode()) {
        case 'remove-bg':
          if (this.bgRemovalMode() === 'draw') {
            const maskBlob = await this.canvasToBlob();
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
            const maskBlob = await this.canvasToBlob();
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
            const maskBlob = await this.canvasToBlob();
            if (!maskBlob) throw new Error('Por favor marca el objeto primero');
            resultBlob = await lastValueFrom(this.api.contourClip(blob, maskBlob, 'manual', this.smartRefine()));
          } else {
            resultBlob = await lastValueFrom(this.api.contourClip(blob, undefined, 'auto', false, this.selectedColors(), this.colorTolerance()));
          }
          break;

        case 'crop':
          if (!this.cropperInstance) return;
          const croppedBlob = await new Promise<Blob | null>((resolve) => this.cropperInstance!.getCroppedCanvas().toBlob(resolve, 'image/png'));
          if (croppedBlob) {
            resultBlob = croppedBlob;
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
}
