import { Component, ElementRef, ViewChild, signal, inject, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
    selector: 'app-watermark',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './watermark.component.html',
    styleUrl: './watermark.component.scss'
})
export class WatermarkComponent implements AfterViewInit {
    private api = inject(ApiService);

    @ViewChild('editorCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;
    @ViewChild('fileInputBase') fileInputBase?: ElementRef<HTMLInputElement>;
    @ViewChild('fileInputWatermark') fileInputWatermark?: ElementRef<HTMLInputElement>;

    // Image source strings for preview/logic
    baseImageSrc = signal<string | null>(null);
    watermarkImageSrc = signal<string | null>(null);
    resultImageSrc = signal<string | null>(null);

    // Blobs for processing
    baseImageBlob: Blob | null = null;
    watermarkImageBlob: Blob | null = null; // This will continue to hold original blob until processed? 
    // Actually, we need to send the RESIZED watermark blob to backend.

    // Images for canvas drawing
    baseImgObj: HTMLImageElement | null = null;
    watermarkImgObj: HTMLImageElement | null = null;

    // Canvas State
    canvasCtx: CanvasRenderingContext2D | null = null;

    // Watermark Position
    wmX = 0;
    wmY = 0;
    wmWidth = 0;
    wmHeight = 0;

    isDragging = false;
    dragOffsetX = 0;
    dragOffsetY = 0;

    isLoading = signal(false);

    ngAfterViewInit() {
        if (this.canvasRef) {
            this.canvasCtx = this.canvasRef.nativeElement.getContext('2d');
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
        // If image is smaller than max, keep original size? Or upscale?
        // Requirement said "maximo de 300px". So if smaller, we can keep it or let ratio handle it.
        // If ratio > 1 (image is smaller), we probably just want to keep original size unless user wants it bigger?
        // Usually "max 300px" implies downscaling only.
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

        // Draw Base
        this.canvasCtx.drawImage(this.baseImgObj, 0, 0);

        // Draw Watermark
        if (this.watermarkImgObj) {
            this.canvasCtx.drawImage(this.watermarkImgObj, this.wmX, this.wmY, this.wmWidth, this.wmHeight);
        }
    }

    // Drag Logic
    onMouseDown(event: MouseEvent) {
        if (!this.watermarkImgObj) return;

        const { offsetX, offsetY } = this.getMousePos(event);

        // Check if clicked exactly on watermark
        if (offsetX >= this.wmX && offsetX <= this.wmX + this.wmWidth &&
            offsetY >= this.wmY && offsetY <= this.wmY + this.wmHeight) {
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

        // Constrain to bounds
        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX + this.wmWidth > baseW) newX = baseW - this.wmWidth;
        if (newY + this.wmHeight > baseH) newY = baseH - this.wmHeight;

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

        this.api.applyWatermark(this.baseImageBlob, this.watermarkImageBlob, Math.round(this.wmX), Math.round(this.wmY)).subscribe({
            next: (resBlob) => {
                const url = URL.createObjectURL(resBlob);
                this.resultImageSrc.set(url);
                this.isLoading.set(false);
            },
            error: (err) => {
                console.error(err);
                alert('Error al aplicar marca de agua');
                this.isLoading.set(false);
            }
        });
    }
}
