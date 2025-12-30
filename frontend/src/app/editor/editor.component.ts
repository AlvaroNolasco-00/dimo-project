import { Component, computed, signal, inject, effect, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.css'
})
export class EditorComponent implements AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);

  @ViewChild('maskCanvas') maskCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('originalImage') originalImage?: ElementRef<HTMLImageElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  currentImageBlob = signal<Blob | null>(null);
  currentImageSource = signal<string | null>(null); // URL for preview
  processedImageSource = signal<string | null>(null);

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

  mode = signal('remove-bg');

  // Computeds for Title/Desc
  title = computed(() => {
    switch (this.mode()) {
      case 'remove-bg': return 'Quitar Fondo';
      case 'remove-objects': return 'Borrar Objetos';
      case 'enhance': return 'Mejorar Calidad';
      case 'upscale': return 'Upscaling';
      case 'halftone': return 'Semitonos';
      case 'contour-clip': return 'Recorte de Contorno';
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
  }

  ngAfterViewInit() {
    // Canvas will be initialized when image loads
  }

  onImageLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    if ((this.mode() === 'remove-objects' || (this.mode() === 'remove-bg' && this.bgRemovalMode() === 'draw') || (this.mode() === 'contour-clip' && this.bgRemovalMode() === 'manual')) && this.maskCanvas) {
      this.initCanvas(img.naturalWidth, img.naturalHeight);
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

    // Reset file input native element
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  process() {
    const blob = this.currentImageBlob();
    if (!blob) return;

    this.isLoading.set(true);
    let obs;

    switch (this.mode()) {
      case 'remove-bg':
        if (this.bgRemovalMode() === 'draw') {
          this.canvasToBlob().then((maskBlob) => {
            if (!maskBlob) {
              alert('Por favor dibuja una máscara primero');
              this.isLoading.set(false);
              return;
            }
            this.api.removeBackground(blob, undefined, undefined, maskBlob, this.smartRefine()).subscribe({
              next: (resBlob) => {
                if (this.processedImageSource()) {
                  URL.revokeObjectURL(this.processedImageSource()!);
                }
                const url = URL.createObjectURL(resBlob);
                this.processedImageSource.set(url);
                this.isLoading.set(false);
              },
              error: (err) => {
                console.error(err);
                alert('Error al procesar');
                this.isLoading.set(false);
              }
            });
          });
          return;
        } else if (this.bgRemovalMode() === 'manual' && this.selectedColors().length > 0) {
          obs = this.api.removeBackground(blob, this.selectedColors(), this.colorTolerance());
        } else {
          obs = this.api.removeBackground(blob);
        }
        break;
      case 'remove-objects':
        if (this.removalMethod() === 'magic-wand') {
          const coords = this.lastClickCoords();
          if (!coords) {
            alert('Por favor haz clic en la imagen primero');
            this.isLoading.set(false);
            return;
          }
          obs = this.api.removeObjects(blob, undefined, { ...coords, tolerance: this.colorTolerance() });
        } else {
          // Use canvas mask
          this.canvasToBlob().then((maskBlob) => {
            if (!maskBlob) {
              alert('Por favor dibuja una máscara primero');
              this.isLoading.set(false);
              return;
            }
            this.api.removeObjects(blob, maskBlob).subscribe({
              next: (resBlob) => {
                if (this.processedImageSource()) {
                  URL.revokeObjectURL(this.processedImageSource()!);
                }
                const url = URL.createObjectURL(resBlob);
                this.processedImageSource.set(url);
                this.isLoading.set(false);
              },
              error: (err) => {
                console.error(err);
                alert('Error al procesar');
                this.isLoading.set(false);
              }
            });
          });
          return; // Exit early since we handle async differently
        }
        break;
      case 'enhance':
        obs = this.api.enhanceQuality(blob, this.contrast(), this.brightness(), this.sharpness());
        break;
      case 'upscale':
        obs = this.api.upscale(blob, this.upscaleFactor(), this.upscaleDetailBoost());
        break;
      case 'halftone':
        obs = this.api.halftone(blob, this.dotSize(), this.halftoneScale(), this.selectedColors(), this.colorTolerance(), this.halftoneSpacing());
        break;
      case 'contour-clip':
        if (this.bgRemovalMode() === 'manual') {
          this.canvasToBlob().then((maskBlob) => {
            if (!maskBlob) {
              alert('Por favor marca el objeto primero');
              this.isLoading.set(false);
              return;
            }
            this.api.contourClip(blob, maskBlob, 'manual', this.smartRefine()).subscribe({
              next: (resBlob) => {
                if (this.processedImageSource()) {
                  URL.revokeObjectURL(this.processedImageSource()!);
                }
                this.processedImageSource.set(URL.createObjectURL(resBlob));
                this.isLoading.set(false);
              },
              error: () => {
                alert('Error al procesar el recorte manual');
                this.isLoading.set(false);
              }
            });
          });
          return;
        } else {
          obs = this.api.contourClip(blob, undefined, 'auto', false, this.selectedColors(), this.colorTolerance());
        }
        break;
      default:
        this.isLoading.set(false);
        return;
    }

    obs.subscribe({
      next: (resBlob) => {
        if (this.processedImageSource()) {
          URL.revokeObjectURL(this.processedImageSource()!);
        }
        const url = URL.createObjectURL(resBlob);
        this.processedImageSource.set(url);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        alert('Error al procesar');
        this.isLoading.set(false);
      }
    });
  }
}
