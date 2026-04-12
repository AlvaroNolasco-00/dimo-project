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
    processingState = input<{ step: string; progress: number; estimatedSecondsRemaining: number | null } | null>(null);
    mode = input.required<string>();

    // Params affecting preview interaction
    removalMethod = input<'brush' | 'magic-wand'>('brush');
    bgRemovalMode = input<'auto' | 'manual' | 'draw'>('auto');
    brushSize = input(20);
    cropAspectRatio = input<number>(NaN);

    // Enhance params for real-time preview
    contrast = input(1.2);
    brightness = input(1.1);
    sharpness = input(1.3);

    // Outputs
    imageLoaded = output<HTMLImageElement>();
    colorPicked = output<[number, number, number]>();
    pointSelected = output<{ x: number, y: number }>();
    canvasHistoryChange = output<number>(); // Emits history length

    @ViewChild('maskCanvas') maskCanvas?: ElementRef<HTMLCanvasElement>;
    @ViewChild('originalImage') originalImage?: ElementRef<HTMLImageElement>;

    // Utility properties for template
    protected readonly Math = Math;

    // Internal state
    isDrawing = signal(false);
    canvasInitialized = signal(false);
    canvasHistory = signal<ImageData[]>([]);
    showMaskPreview = signal(false);
    brushCursorPosition = signal({ x: 0, y: 0 });
    brushCursorVisible = signal(false);
    viewMode = signal<'original' | 'comparison' | 'resultado'>('comparison');
    sliderPosition = signal(50);
    isDraggingSlider = signal(false);
    private cropperInstance: Cropper | null = null;
    private _naturalWidth = 0;
    private _naturalHeight = 0;

    // Zoom and Pan state
    zoomLevel = signal(1);
    panOffset = signal({ x: 0, y: 0 });
    isPanning = signal(false);
    panStartPos = signal({ x: 0, y: 0 });

    // Optimized stroke-based history
    private strokeHistory: Array<Array<{ x: number; y: number; size: number }>> = [];
    private currentStroke: Array<{ x: number; y: number; size: number }> = [];

    // Check if we're in a brush mode
    isInBrushMode = computed(() => {
        const mode = this.mode();
        const method = this.removalMethod();
        const bgMode = this.bgRemovalMode();
        return (mode === 'remove-objects' && method === 'brush') ||
               (mode === 'remove-bg' && bgMode === 'draw') ||
               (mode === 'contour-clip' && bgMode === 'manual');
    });

    // Computed CSS filter string for real-time preview in enhance mode
    previewFilters = computed(() => {
        if (this.mode() !== 'enhance') return '';
        const c = this.contrast();
        const b = this.brightness();
        const s = this.sharpness();
        // CSS filters: brightness, contrast, and simulate sharpness with slight saturation
        return `brightness(${b}) contrast(${c}) saturate(${1 + (s - 1) * 0.3})`;
    });

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

        // Notify parent of history change (now uses stroke history)
        // Handled in stopDrawing and undo methods

        // When the user switches to a draw mode, the @if block renders the canvas
        // into the DOM. We wait one tick for Angular to finish, then init the canvas.
        effect(() => {
            const mode = this.mode();
            const bgMode = this.bgRemovalMode();
            const method = this.removalMethod();
            const needsCanvas =
                (mode === 'remove-objects' && method !== 'magic-wand') ||
                (mode === 'remove-bg' && bgMode === 'draw') ||
                (mode === 'contour-clip' && bgMode === 'manual');

            if (needsCanvas && this._naturalWidth > 0) {
                setTimeout(() => this.initCanvas(this._naturalWidth, this._naturalHeight));
            }
        });
    }

    ngOnDestroy() {
        this.destroyCropper();
    }

    onImageLoad(event: Event) {
        const img = event.target as HTMLImageElement;
        this._naturalWidth = img.naturalWidth;
        this._naturalHeight = img.naturalHeight;
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

        // Pixel dimensions (sent to backend)
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);

        // Draw edge outline
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, width - 2, height - 2);

        // CSS dimensions: match the image's rendered position/size exactly
        this.syncCanvasToImage();
        this.canvasInitialized.set(true);
    }

    // Brush cursor tracking
    onCanvasMouseMove(event: MouseEvent) {
        if (!this.isInBrushMode()) return;
        const canvas = this.maskCanvas?.nativeElement;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        this.brushCursorPosition.set({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        });
        this.brushCursorVisible.set(true);
    }

    onCanvasMouseLeave() {
        this.brushCursorVisible.set(false);
    }

    toggleMaskPreview() {
        this.showMaskPreview.update(v => !v);
    }

    // Comparison slider methods
    setViewMode(mode: 'original' | 'comparison' | 'resultado') {
        this.viewMode.set(mode);
    }

    startSliderDrag(event: MouseEvent | TouchEvent) {
        event.preventDefault();
        this.isDraggingSlider.set(true);
        this.updateSliderPosition(event);
    }

    onSliderDrag(event: MouseEvent | TouchEvent) {
        if (!this.isDraggingSlider()) return;
        event.preventDefault();
        this.updateSliderPosition(event);
    }

    stopSliderDrag() {
        this.isDraggingSlider.set(false);
    }

    private updateSliderPosition(event: MouseEvent | TouchEvent) {
        const container = event.currentTarget as HTMLElement;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        this.sliderPosition.set(percentage);
    }

    private syncCanvasToImage() {
        const canvas = this.maskCanvas?.nativeElement;
        const img = this.originalImage?.nativeElement;
        if (!canvas || !img) return;

        // offsetLeft/Top/Width/Height are relative to offsetParent (.canvas-container)
        canvas.style.left = img.offsetLeft + 'px';
        canvas.style.top = img.offsetTop + 'px';
        canvas.style.width = img.offsetWidth + 'px';
        canvas.style.height = img.offsetHeight + 'px';
    }

    startDrawing(event: MouseEvent) {
        if (this.mode() === 'remove-objects' && this.removalMethod() !== 'brush') return;
        if (this.mode() === 'remove-bg' && this.bgRemovalMode() !== 'draw') return;
        if (this.mode() === 'contour-clip' && this.bgRemovalMode() !== 'manual') return;
        this.saveStrokeHistory();
        this.currentStroke = [];
        this.isDrawing.set(true);
        this.draw(event);
    }

    draw(event: MouseEvent) {
        if (!this.isDrawing()) return;

        const canvas = this.maskCanvas?.nativeElement;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Canvas CSS size now matches image rendered size exactly (set by syncCanvasToImage).
        // getBoundingClientRect gives us the rendered size for the scale factors.
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;
        const size = this.brushSize() / 2;

        ctx.fillStyle = 'white';
        ctx.shadowBlur = 2;
        ctx.shadowColor = 'white';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // Reset shadow

        // Track stroke for optimized undo
        this.currentStroke.push({ x, y, size });
    }

    stopDrawing() {
        this.isDrawing.set(false);
        // Save completed stroke to history
        if (this.currentStroke.length > 0) {
            this.strokeHistory.push([...this.currentStroke]);
            this.currentStroke = [];
            this.canvasHistoryChange.emit(this.strokeHistory.length);
        }
    }

    // History & Actions
    saveStrokeHistory() {
        // Optimized: Track strokes instead of full canvas snapshots
        // This avoids expensive getImageData/putImageData operations
    }

    undo() {
        if (this.strokeHistory.length === 0) return;

        const canvas = this.maskCanvas?.nativeElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Remove last stroke
        this.strokeHistory.pop();

        // Clear and replay all remaining strokes
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

        ctx.fillStyle = 'white';
        ctx.shadowBlur = 2;
        ctx.shadowColor = 'white';

        for (const stroke of this.strokeHistory) {
            for (const point of stroke) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.shadowBlur = 0;
        this.canvasHistoryChange.emit(this.strokeHistory.length);
    }

    clearCanvas() {
        const canvas = this.maskCanvas?.nativeElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Clear stroke history
        this.strokeHistory = [];
        this.currentStroke = [];
        this.canvasHistoryChange.emit(0);
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

    // Zoom and Pan Methods
    setZoom(level: number) {
        this.zoomLevel.set(Math.max(0.5, Math.min(5, level)));
    }

    zoomIn() {
        this.zoomLevel.update(z => Math.min(5, z + 0.25));
    }

    zoomOut() {
        this.zoomLevel.update(z => Math.max(0.5, z - 0.25));
    }

    resetZoom() {
        this.zoomLevel.set(1);
        this.panOffset.set({ x: 0, y: 0 });
    }

    startPan(event: MouseEvent) {
        if (event.button !== 1 && event.button !== 2) return; // Middle or right click
        event.preventDefault();
        this.isPanning.set(true);
        this.panStartPos.set({ x: event.clientX, y: event.clientY });
    }

    onPan(event: MouseEvent) {
        if (!this.isPanning()) return;
        event.preventDefault();
        const dx = event.clientX - this.panStartPos().x;
        const dy = event.clientY - this.panStartPos().y;
        this.panOffset.update(pos => ({ x: pos.x + dx, y: pos.y + dy }));
        this.panStartPos.set({ x: event.clientX, y: event.clientY });
    }

    stopPan() {
        this.isPanning.set(false);
    }

    onWheel(event: WheelEvent) {
        if (event.ctrlKey) {
            event.preventDefault();
            const delta = event.deltaY > 0 ? -0.1 : 0.1;
            this.zoomLevel.update(z => Math.max(0.5, Math.min(5, z + delta)));
        }
    }
}
