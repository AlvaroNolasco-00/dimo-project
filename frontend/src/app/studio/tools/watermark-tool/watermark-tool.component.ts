import { Component, output, signal, inject, ChangeDetectionStrategy } from '@angular/core';
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
        @if (wmUrl()) {
          <img [src]="wmUrl()" class="wm-preview" alt="wm" />
        }
      </div>

      <div class="field">
        <label>Position (click canvas to set)</label>
        <div class="xy-inputs">
          <label>X <input type="number" [(ngModel)]="posX" min="0" /></label>
          <label>Y <input type="number" [(ngModel)]="posY" min="0" /></label>
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
            <button [class.active]="shape === s.value" (click)="shape = s.value">{{ s.label }}</button>
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
  `
})
export class WatermarkToolComponent {
  readonly applied = output<Blob>();
  readonly state = inject(StudioStateService);
  private proc = inject(StudioProcessingService);
  private toast = inject(ToastService);

  readonly wmBlob = signal<Blob | null>(null);
  readonly wmUrl = signal<string | null>(null);
  readonly scale = signal(1.0);
  scaleValue = 1.0;
  posX = 0;
  posY = 0;
  shape = 'original';
  readonly shapes = [
    { value: 'original', label: 'Original' },
    { value: 'circle', label: 'Circle' },
    { value: 'square', label: 'Square' },
  ];

  onWmFile(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const blob = new Blob([file], { type: file.type });
    if (this.wmUrl()) URL.revokeObjectURL(this.wmUrl()!);
    this.wmBlob.set(blob);
    this.wmUrl.set(URL.createObjectURL(blob));
  }

  setPosition(x: number, y: number): void {
    this.posX = x;
    this.posY = y;
  }

  async apply(): Promise<void> {
    const blob = this.state.currentBlob();
    const wm = this.wmBlob();
    if (!blob || !wm || this.state.busy()) return;

    const click = this.state.canvasClick();
    const x = click ? click.x : this.posX;
    const y = click ? click.y : this.posY;

    this.state.setBusy(true);
    try {
      const result = await this.proc.watermark(blob, wm, x, y, this.scale(), this.shape);
      this.state.applyResult(result, 'watermark', 'Watermark');
      this.applied.emit(result);
    } catch (e: any) {
      this.toast.error('Watermark failed: ' + (e.message ?? 'Unknown error'));
      this.state.setBusy(false);
    }
  }
}
