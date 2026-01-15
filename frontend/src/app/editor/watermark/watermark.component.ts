import { Component, ElementRef, ViewChild, signal, inject, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ApiService } from '../../services/api.service';
import { ImagePersistenceService, SessionImage } from '../../services/image-persistence.service';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-watermark',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './watermark.component.html',
    styleUrl: './watermark.component.scss'
})
export class WatermarkComponent implements AfterViewInit {
    private api = inject(ApiService);
    private imageService = inject(ImagePersistenceService);
    private authService = inject(AuthService);
    private sanitizer = inject(DomSanitizer);

    @ViewChild('editorCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;
    @ViewChild('fileInputBase') fileInputBase?: ElementRef<HTMLInputElement>;
    @ViewChild('fileInputWatermark') fileInputWatermark?: ElementRef<HTMLInputElement>;

    // Image source strings for preview/logic
    baseImageSrc = signal<string | null>(null);
    watermarkImageSrc = signal<string | null>(null);
    resultImageSrc = signal<string | null>(null);

    // Blobs for processing
    baseImageBlob: Blob | null = null;
    watermarkImageBlob: Blob | null = null;

    // Images for canvas drawing
    baseImgObj: HTMLImageElement | null = null;
    watermarkImgObj: HTMLImageElement | null = null;

    // Canvas State
    canvasCtx: CanvasRenderingContext2D | null = null;

    // Watermark Position & Props
    wmX = 0;
    wmY = 0;
    wmWidth = 0;
    wmHeight = 0;
    wmScale = signal(1.0);
    wmShape = signal<string>('original'); // 'original', 'circle', 'square', 'rect-4-3', 'rect-3-4'

    isDragging = false;
    dragOffsetX = 0;
    dragOffsetY = 0;

    isLoading = signal(false);
    downloadFilename = signal('watermark-result.png');
    sessionGallery = signal<SessionImage[]>([]);

    ngAfterViewInit() {
        if (this.canvasRef) {
            this.canvasCtx = this.canvasRef.nativeElement.getContext('2d');
        }
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

    getSafeUrl(blob: Blob): SafeUrl {
        return this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(blob));
    }

    async addToGallery() {
        const src = this.resultImageSrc();
        if (!src) return;

        let blob: Blob | null = null;
        try {
            const resp = await fetch(src);
            blob = await resp.blob();
        } catch (e) {
            console.error('Error fetching blob from URL', e);
        }

        if (!blob) return;

        // Generate a name
        const name = `Watermark ${this.sessionGallery().length + 1}`;

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
        // Load as BASE image
        this.baseImageBlob = item.blob;
        const url = URL.createObjectURL(item.blob);
        this.baseImageSrc.set(url);
        this.resultImageSrc.set(null);

        const img = new Image();
        img.onload = () => {
            this.baseImgObj = img;
            this.initCanvas();
        };
        img.src = url;
    }

    async deleteFromGallery(id: string, event: Event) {
        event.stopPropagation();
        try {
            await this.imageService.deleteImage(id);
            this.sessionGallery.update(prev => prev.filter(img => img.id !== id));
        } catch (e) {
            console.error(e);
        }
    }

    triggerBaseUpload() {
        this.fileInputBase?.nativeElement.click();
    }

    triggerWatermarkUpload() {
        this.fileInputWatermark?.nativeElement.click();
    }

    onBaseSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files?.length) {
            const file = input.files[0];
            this.baseImageBlob = file;
            const url = URL.createObjectURL(file);
            this.baseImageSrc.set(url);
            this.resultImageSrc.set(null);

            const img = new Image();
            img.onload = () => {
                this.baseImgObj = img;
                this.initCanvas();
            };
            img.src = url;
        }
    }

    onWatermarkSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files?.length) {
            const file = input.files[0];
            const url = URL.createObjectURL(file);
            this.resultImageSrc.set(null);

            // Minify logic: Load image, resize if needed, create new blob/url
            const img = new Image();
            img.onload = () => {
                const { width, height } = this.calculateAspectRatioFit(img.naturalWidth, img.naturalHeight, 300, 300);

                // Create an offscreen canvas to resize
                const offCanvas = document.createElement('canvas');
                offCanvas.width = width;
                offCanvas.height = height;
                const ctx = offCanvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    offCanvas.toBlob((blob) => {
                        if (blob) {
                            this.watermarkImageBlob = blob;
                            const resizedUrl = URL.createObjectURL(blob);
                            this.watermarkImageSrc.set(resizedUrl);

                            // Create new image obj from resized
                            this.watermarkImgObj = new Image();
                            this.watermarkImgObj.onload = () => {
                                this.wmWidth = width;
                                this.wmHeight = height;
                                // Default position: Bottom Right with some padding
                                if (this.baseImgObj) {
                                    this.wmX = this.baseImgObj.width - width - 20;
                                    this.wmY = this.baseImgObj.height - height - 20;
                                    // Ensure not out of bounds if base is small
                                    if (this.wmX < 0) this.wmX = 0;
                                    if (this.wmY < 0) this.wmY = 0;
                                } else {
                                    this.wmX = 0;
                                    this.wmY = 0;
                                }
                                this.drawCanvas();
                            };
                            this.watermarkImgObj.src = resizedUrl;
                        }
                    }, 'image/png');
                }
            };
            img.src = url;
        }
    }

    calculateAspectRatioFit(srcWidth: number, srcHeight: number, maxWidth: number, maxHeight: number) {
        const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
        const finalRatio = ratio < 1 ? ratio : 1;
        return { width: Math.round(srcWidth * finalRatio), height: Math.round(srcHeight * finalRatio) };
    }

    initCanvas() {
        if (!this.canvasRef || !this.baseImgObj) return;
        const canvas = this.canvasRef.nativeElement;
        canvas.width = this.baseImgObj.width;
        canvas.height = this.baseImgObj.height;
        this.drawCanvas();
    }

    drawCanvas() {
        if (!this.canvasCtx || !this.canvasRef || !this.baseImgObj) return;

        // Clear
        this.canvasCtx.clearRect(0, 0, this.canvasRef.nativeElement.width, this.canvasRef.nativeElement.height);
        this.canvasCtx.save();

        // Draw Base
        this.canvasCtx.drawImage(this.baseImgObj, 0, 0);
        this.canvasCtx.restore();

        // Draw Watermark
        if (this.watermarkImgObj) {
            this.canvasCtx.save();

            // Calculate scaled dimensions
            const scaledW = this.wmWidth * this.wmScale();
            const scaledH = this.wmHeight * this.wmScale();

            // Define drawing area
            // We need to apply shape clipping
            this.canvasCtx.beginPath();
            const centerX = this.wmX + scaledW / 2;
            const centerY = this.wmY + scaledH / 2;

            switch (this.wmShape()) {
                case 'circle':
                    const radius = Math.min(scaledW, scaledH) / 2;
                    this.canvasCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                    this.canvasCtx.clip();
                    break;
                case 'square':
                    const size = Math.min(scaledW, scaledH);
                    this.canvasCtx.rect(centerX - size / 2, centerY - size / 2, size, size);
                    this.canvasCtx.clip();
                    break;
                case 'rect-4-3':
                    let w43 = scaledW;
                    let h43 = scaledW / (4 / 3);
                    if (h43 > scaledH) {
                        h43 = scaledH;
                        w43 = scaledH * (4 / 3);
                    }
                    this.canvasCtx.rect(centerX - w43 / 2, centerY - h43 / 2, w43, h43);
                    this.canvasCtx.clip();
                    break;
                case 'rect-3-4':
                    let w34 = scaledW;
                    let h34 = scaledW / (3 / 4);
                    if (h34 > scaledH) {
                        h34 = scaledH;
                        w34 = scaledH * (3 / 4);
                    }
                    this.canvasCtx.rect(centerX - w34 / 2, centerY - h34 / 2, w34, h34);
                    this.canvasCtx.clip();
                    break;
                default:
                    break;
            }

            this.canvasCtx.drawImage(this.watermarkImgObj, this.wmX, this.wmY, scaledW, scaledH);
            this.canvasCtx.restore();
        }
    }

    // Drag Logic
    onMouseDown(event: MouseEvent) {
        if (!this.watermarkImgObj) return;

        const { offsetX, offsetY } = this.getMousePos(event);
        const scaledW = this.wmWidth * this.wmScale();
        const scaledH = this.wmHeight * this.wmScale();

        // Check if clicked exactly on watermark
        if (offsetX >= this.wmX && offsetX <= this.wmX + scaledW &&
            offsetY >= this.wmY && offsetY <= this.wmY + scaledH) {
            this.isDragging = true;
            this.dragOffsetX = offsetX - this.wmX;
            this.dragOffsetY = offsetY - this.wmY;
        }
    }

    onMouseMove(event: MouseEvent) {
        if (!this.isDragging || !this.baseImgObj) return;

        const { offsetX, offsetY } = this.getMousePos(event);
        let newX = offsetX - this.dragOffsetX;
        let newY = offsetY - this.dragOffsetY;

        // Type checking for safety although baseImgObj check is above
        const baseW = this.baseImgObj.width;
        const baseH = this.baseImgObj.height;
        const scaledW = this.wmWidth * this.wmScale();
        const scaledH = this.wmHeight * this.wmScale();

        // Constrain to bounds
        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX + scaledW > baseW) newX = baseW - scaledW;
        if (newY + scaledH > baseH) newY = baseH - scaledH;

        this.wmX = newX;
        this.wmY = newY;
        this.drawCanvas();
    }

    onMouseUp() {
        this.isDragging = false;
    }

    getMousePos(evt: MouseEvent) {
        if (!this.canvasRef) return { offsetX: 0, offsetY: 0 };
        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        const scaleX = this.canvasRef.nativeElement.width / rect.width;
        const scaleY = this.canvasRef.nativeElement.height / rect.height;
        return {
            offsetX: (evt.clientX - rect.left) * scaleX,
            offsetY: (evt.clientY - rect.top) * scaleY
        };
    }

    process() {
        if (!this.baseImageBlob || !this.watermarkImageBlob) return;

        this.isLoading.set(true);

        this.api.applyWatermark(
            this.baseImageBlob,
            this.watermarkImageBlob,
            Math.round(this.wmX),
            Math.round(this.wmY),
            this.wmScale(),
            this.wmShape()
        ).subscribe({
            next: (resBlob) => {
                const url = URL.createObjectURL(resBlob);
                this.resultImageSrc.set(url);
                this.isLoading.set(false);

                // Generate filename with timestamp
                const now = new Date();
                const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
                this.downloadFilename.set(`watermark-result-${timestamp}.png`);
            },
            error: (err) => {
                console.error(err);
                alert('Error al aplicar marca de agua');
                this.isLoading.set(false);
            }
        });
    }
}
