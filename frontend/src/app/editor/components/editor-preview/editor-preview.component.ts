import { Component, ElementRef, ViewChild, input, signal, computed, effect, OnDestroy, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import Cropper from 'cropperjs';

@Component({
    selector: 'app-editor-preview',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './editor-preview.component.html',
    styleUrl: './editor-preview.component.scss'
})
export class EditorPreviewComponent implements OnDestroy {
    // Inputs from parent
    currentImageSource = input<string | null>(null);
    processedImageSource = input<string | null>(null);
    isLoading = input(false);
    mode = input.required<string>();

    // Params affecting preview interaction
    removalMethod = input<'brush' | 'magic-wand'>('brush');
    bgRemovalMode = input<'auto' | 'manual' | 'draw'>('auto');
    brushSize = input(20);
    cropAspectRatio = input<number>(NaN);

    // Outputs
    imageLoaded = output<HTMLImageElement>();
    colorPicked = output<[number, number, number]>();
    pointSelected = output<{ x: number, y: number }>();
    canvasHistoryChange = output<number>(); // Emits history length

    @ViewChild('maskCanvas') maskCanvas?: ElementRef<HTMLCanvasElement>;
    @ViewChild('originalImage') originalImage?: ElementRef<HTMLImageElement>;

    // Internal state
    isDrawing = signal(false);
    canvasInitialized = signal(false);
    canvasHistory = signal<ImageData[]>([]);
    private cropperInstance: Cropper | null = null;

    constructor() {
        // Re-init cropper when crop params change, but only if mode is crop
        effect(() => {
            const ratio = this.cropAspectRatio();
            if (this.mode() === 'crop' && this.originalImage?.nativeElement) {
                this.initCropper(this.originalImage.nativeElement);
            }
        });

        // Cleanup cropper if mode changes away from crop
        effect(() => {
            if (this.mode() !== 'crop') {
                this.destroyCropper();
            }
        });

        // Notify parent of history change
        effect(() => {
            this.canvasHistoryChange.emit(this.canvasHistory().length);
        });
    }

    ngOnDestroy() {
        this.destroyCropper();
    }

    onImageLoad(event: Event) {
        const img = event.target as HTMLImageElement;
        this.imageLoaded.emit(img);

        if ((this.mode() === 'remove-objects' && this.removalMethod() !== 'magic-wand') || (this.mode() === 'remove-bg' && this.bgRemovalMode() === 'draw') || (this.mode() === 'contour-clip' && this.bgRemovalMode() === 'manual')) {
            this.initCanvas(img.naturalWidth, img.naturalHeight);
        }
        if (this.mode() === 'crop') {
            this.initCropper(img);
        }
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
            this.pointSelected.emit({ x, y });
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
                this.colorPicked.emit(color);
            }
        }
    }

    // Canvas Methods
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

    startDrawing(event: MouseEvent) {
        if (this.mode() === 'remove-objects' && this.removalMethod() !== 'brush') return;
        if (this.mode() === 'remove-bg' && this.bgRemovalMode() !== 'draw') return;
        if (this.mode() === 'contour-clip' && this.bgRemovalMode() !== 'manual') return;
        this.saveHistory();
        this.isDrawing.set(true);
        this.draw(event);
    }

    draw(event: MouseEvent) {
        if (!this.isDrawing()) return;
        // Checks are redundant if startDrawing handles it, but good for safety

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

    // History & Actions
    saveHistory() {
        const canvas = this.maskCanvas?.nativeElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        this.canvasHistory.update(history => [...history, imageData].slice(-10));
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

    clearCanvas() {
        const canvas = this.maskCanvas?.nativeElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Public methods for Parent to call
    getMaskBlob(): Promise<Blob | null> {
        return new Promise((resolve) => {
            const canvas = this.maskCanvas?.nativeElement;
            if (!canvas) {
                resolve(null);
                return;
            }
            canvas.toBlob((blob) => resolve(blob), 'image/png');
        });
    }

    // Cropper Methods
    initCropper(imageElement: HTMLImageElement) {
        this.destroyCropper();

        this.cropperInstance = new Cropper(imageElement, {
            aspectRatio: this.cropAspectRatio(),
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 0.9,
            zoomable: true,
            scalable: false,
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

    getCroppedBlob(): Promise<Blob | null> {
        if (!this.cropperInstance) return Promise.resolve(null);
        return new Promise<Blob | null>((resolve) => this.cropperInstance!.getCroppedCanvas().toBlob(resolve, 'image/png'));
    }
}
