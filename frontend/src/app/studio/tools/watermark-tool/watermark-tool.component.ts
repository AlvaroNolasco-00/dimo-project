import {
  Component, output, signal, inject, ChangeDetectionStrategy,
  ViewChild, ElementRef, effect
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StudioStateService } from '../../services/studio-state.service';
import { StudioProcessingService } from '../../services/studio-processing.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-watermark-tool',
  standalone: true,
  imports: [FormsModule, CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tool-panel">
      <h3 class="tool-title"><i class="ph ph-stamp"></i> Watermark</h3>

      <div class="field">
        <label>Watermark Image</label>
        <button class="btn-upload" (click)="wmInput.click()">
          <i class="ph ph-upload-simple"></i>
          {{ wmBlob() ? 'Change' : 'Upload' }}
        </button>
        <input #wmInput type="file" accept="image/*" (change)="onWmFile($event)" />
      </div>

      @if (wmUrl()) {
        <div class="field">
          <label>Preview</label>
          <div class="preview-wrap">
            <canvas #previewCanvas class="wm-composite-preview"></canvas>
          </div>
        </div>
      }

      <div class="field">
        <label>Position (click canvas to set)</label>
        <div class="xy-inputs">
          <label>X <input type="number" [ngModel]="posX()" (ngModelChange)="posX.set($event)" min="0" /></label>
          <label>Y <input type="number" [ngModel]="posY()" (ngModelChange)="posY.set($event)" min="0" /></label>
        </div>
        @if (state.canvasClick()) {
          <p class="hint-sm">Canvas position set ✓</p>
        }
      </div>

      <div class="field">
        <label>Scale <span>{{ scale() }}</span></label>
        <input type="range" min="0.1" max="3.0" step="0.05" [(ngModel)]="scaleValue" (ngModelChange)="scale.set($event)" />
      </div>

      <div class="field">
        <label>Shape</label>
        <div class="btn-group">
          @for (s of shapes; track s.value) {
            <button [class.active]="shape() === s.value" (click)="shape.set(s.value)">{{ s.label }}</button>
          }
        </div>
      </div>

      <button
        class="btn-apply"
        [disabled]="state.busy() || !wmBlob()"
        (click)="apply()"
      >
        @if (state.busy()) { <i class="ph ph-spinner spin"></i> Processing... }
        @else { <i class="ph ph-check"></i> Apply }
      </button>
    </div>
  `,
  styles: [`
    .preview-wrap {
      background: repeating-conic-gradient(#1a1a1a 0% 25%, #222 0% 50%) 50% / 16px 16px;
      border-radius: var(--radius, 6px);
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .wm-composite-preview {
      display: block;
      max-width: 100%;
      height: auto;
    }
  `],
})
export class WatermarkToolComponent {
  readonly applied = output<Blob>();
  readonly state = inject(StudioStateService);
  private proc = inject(StudioProcessingService);
  private toast = inject(ToastService);

  @ViewChild('previewCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly wmBlob = signal<Blob | null>(null);
  readonly wmUrl = signal<string | null>(null);
  readonly scale = signal(1.0);
  scaleValue = 1.0;
  readonly posX = signal(0);
  readonly posY = signal(0);
  readonly shape = signal('original');

  readonly shapes = [
    { value: 'original', label: 'Original' },
    { value: 'circle', label: 'Circle' },
    { value: 'square', label: 'Square' },
  ];

  constructor() {
    effect(() => {
      const baseUrl = this.state.currentUrl();
      const wmUrl = this.wmUrl();
      const click = this.state.canvasClick();
      const px = click ? click.x : this.posX();
      const py = click ? click.y : this.posY();
      const sc = this.scale();
      const sh = this.shape();

      if (!baseUrl || !wmUrl) return;
      this.renderPreview(baseUrl, wmUrl, px, py, sc, sh);
    });
  }

  onWmFile(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const blob = new Blob([file], { type: file.type });
    if (this.wmUrl()) URL.revokeObjectURL(this.wmUrl()!);
    this.wmBlob.set(blob);
    this.wmUrl.set(URL.createObjectURL(blob));
  }

  private renderPreview(
    baseUrl: string, wmUrl: string,
    x: number, y: number, scale: number, shape: string
  ): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const baseImg = new Image();
    baseImg.crossOrigin = 'anonymous';
    const wmImg = new Image();
    wmImg.crossOrigin = 'anonymous';

    baseImg.onload = () => {
      wmImg.onload = () => {
        canvas.width = baseImg.naturalWidth;
        canvas.height = baseImg.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baseImg, 0, 0);

        let sw = wmImg.naturalWidth * scale;
        let sh = wmImg.naturalHeight * scale;

        if (shape === 'square') {
          const size = Math.min(sw, sh);
          sw = size;
          sh = size;
        }

        const drawX = x - sw / 2;
        const drawY = y - sh / 2;

        ctx.save();
        if (shape === 'circle') {
          ctx.beginPath();
          ctx.arc(x, y, Math.min(sw, sh) / 2, 0, Math.PI * 2);
          ctx.clip();
        } else if (shape === 'square') {
          ctx.beginPath();
          ctx.rect(drawX, drawY, sw, sh);
          ctx.clip();
        }

        ctx.drawImage(wmImg, drawX, drawY, sw, sh);
        ctx.restore();
      };
      wmImg.src = wmUrl;
    };
    baseImg.src = baseUrl;
  }

  async apply(): Promise<void> {
    const blob = this.state.currentBlob();
    const wm = this.wmBlob();
    if (!blob || !wm || this.state.busy()) return;

    const click = this.state.canvasClick();
    const x = click ? click.x : this.posX();
    const y = click ? click.y : this.posY();

    this.state.setBusy(true);
    try {
      const result = await this.proc.watermark(blob, wm, x, y, this.scale(), this.shape());
      this.state.applyResult(result, 'watermark', 'Watermark');
      this.applied.emit(result);
    } catch (e: any) {
      this.toast.error('Watermark failed: ' + (e.message ?? 'Unknown error'));
      this.state.setBusy(false);
    }
  }
}
