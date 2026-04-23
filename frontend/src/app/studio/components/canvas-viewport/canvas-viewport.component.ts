import {
  Component, input, output, signal,
  ChangeDetectionStrategy, ViewChild, ElementRef,
  effect, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import Cropper from 'cropperjs';
import { MaskPainterComponent } from '../mask-painter/mask-painter.component';
import { CanvasPoint } from '../../models/tool.types';

interface DotPos { x: number; y: number; }

@Component({
  selector: 'app-canvas-viewport',
  standalone: true,
  imports: [CommonModule, MaskPainterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="viewport">
      @if (imageUrl()) {
        <div class="image-wrapper" #wrapper [class.clickable]="clickMode()">
          <img
            #img
            [src]="imageUrl()"
            alt="preview"
            (load)="onLoad()"
            (click)="onImageClick($event)"
          />
          @if (maskActive()) {
            <app-mask-painter
              [brushSize]="brushSize()"
              [imageWidth]="naturalWidth()"
              [imageHeight]="naturalHeight()"
              (maskChange)="maskChange.emit($event)"
              (hasMask)="hasMask.emit($event)"
            />
          }
          @if (clickMode() && dotPos()) {
            <div
              class="click-dot"
              [style.left.px]="dotPos()!.x"
              [style.top.px]="dotPos()!.y"
            ></div>
          }
        </div>
      } @else {
        <ng-content></ng-content>
      }
    </div>
  `,
  styles: [`
    :host { display: flex; flex: 1; overflow: hidden; }

    .viewport {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: repeating-conic-gradient(#e8eaf0 0% 25%, #f4f7fe 0% 50%) 0 0 / 20px 20px;
      overflow: hidden;
    }

    .image-wrapper {
      position: relative;
      display: inline-flex;
      line-height: 0;

      &.clickable { cursor: crosshair; }

      img {
        max-width: 100%;
        max-height: calc(100vh - 220px);
        object-fit: contain;
        display: block;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12);
        user-select: none;
      }
    }

    .click-dot {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--accent-color);
      border: 2px solid white;
      transform: translate(-50%, -50%);
      pointer-events: none;
      box-shadow: 0 0 0 2px var(--accent-color);
    }
  `]
})
export class CanvasViewportComponent implements OnDestroy {
  @ViewChild('img') imgRef!: ElementRef<HTMLImageElement>;
  @ViewChild('wrapper') wrapperRef!: ElementRef<HTMLDivElement>;

  readonly imageUrl = input<string | null>(null);
  readonly maskActive = input<boolean>(false);
  readonly clickMode = input<boolean>(false);
  readonly brushSize = input<number>(30);
  readonly cropMode = input<boolean>(false);
  readonly cropAspect = input<number>(NaN);

  readonly imageClick = output<CanvasPoint>();
  readonly maskChange = output<Blob>();
  readonly hasMask = output<boolean>();

  readonly naturalWidth = signal(0);
  readonly naturalHeight = signal(0);
  readonly dotPos = signal<DotPos | null>(null);

  private cropper: Cropper | null = null;

  constructor() {
    effect(() => {
      const active = this.cropMode();
      if (active) {
        // defer so img is rendered
        setTimeout(() => this._initCropper(), 0);
      } else {
        this._destroyCropper();
      }
    });

    effect(() => {
      const ratio = this.cropAspect();
      if (this.cropper) {
        this.cropper.setAspectRatio(isNaN(ratio) ? NaN : ratio);
      }
    });
  }

  private _initCropper(): void {
    this._destroyCropper();
    const img = this.imgRef?.nativeElement;
    if (!img) return;
    this.cropper = new Cropper(img, {
      aspectRatio: isNaN(this.cropAspect()) ? NaN : this.cropAspect(),
      viewMode: 1,
      dragMode: 'move',
      cropBoxMovable: true,
      cropBoxResizable: true,
      zoomable: true,
      autoCropArea: 0.9,
      guides: true,
      background: false,
    });
  }

  private _destroyCropper(): void {
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
  }

  getCroppedBlob(): Promise<Blob | null> {
    return new Promise(resolve => {
      const canvas = this.cropper?.getCroppedCanvas();
      if (!canvas) return resolve(null);
      canvas.toBlob(b => resolve(b), 'image/png');
    });
  }

  ngOnDestroy(): void {
    this._destroyCropper();
  }

  onLoad(): void {
    const img = this.imgRef.nativeElement;
    this.naturalWidth.set(img.naturalWidth);
    this.naturalHeight.set(img.naturalHeight);
    if (this.cropMode()) {
      this._destroyCropper();
      setTimeout(() => this._initCropper(), 0);
    }
  }

  clearDot(): void {
    this.dotPos.set(null);
  }

  onImageClick(e: MouseEvent): void {
    if (!this.clickMode()) return;
    const img = this.imgRef.nativeElement;
    const imgRect = img.getBoundingClientRect();
    const wrapRect = this.wrapperRef.nativeElement.getBoundingClientRect();

    // Pixel coords in image space
    const scaleX = img.naturalWidth / imgRect.width;
    const scaleY = img.naturalHeight / imgRect.height;
    const x = Math.round((e.clientX - imgRect.left) * scaleX);
    const y = Math.round((e.clientY - imgRect.top) * scaleY);

    // Dot position relative to wrapper
    const dotX = e.clientX - wrapRect.left;
    const dotY = e.clientY - wrapRect.top;
    this.dotPos.set({ x: dotX, y: dotY });

    this.imageClick.emit({ x, y });
  }
}
