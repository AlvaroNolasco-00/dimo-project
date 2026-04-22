import { Component, output, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StudioStateService } from '../../services/studio-state.service';
import { StudioProcessingService } from '../../services/studio-processing.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-upscale-tool',
  standalone: true,
  imports: [FormsModule, CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tool-panel">
      <h3 class="tool-title"><i class="ph ph-arrows-out"></i> Upscale</h3>

      <div class="field">
        <label>Factor</label>
        <div class="btn-group">
          @for (f of factors; track f) {
            <button [class.active]="factor === f" (click)="factor = f">{{ f }}×</button>
          }
        </div>
      </div>

      <div class="field">
        <label>Detail Boost <span>{{ detailBoost }}</span></label>
        <input type="range" min="1.0" max="2.0" step="0.1" [(ngModel)]="detailBoost" />
      </div>

      @if (state.busy() && state.progress() !== null) {
        <div class="progress-wrapper">
          <div class="progress-bar" [style.width.%]="state.progress()"></div>
          <span>{{ state.progress() }}%</span>
        </div>
      }

      <p class="hint">Upscale runs async on server — may take 20–90 seconds.</p>

      <button class="btn-apply" [disabled]="state.busy()" (click)="apply()">
        @if (state.busy()) { <i class="ph ph-spinner spin"></i> Processing... }
        @else { <i class="ph ph-check"></i> Apply ({{ factor }}×) }
      </button>
    </div>
  `
})
export class UpscaleToolComponent {
  readonly applied = output<Blob>();
  readonly state = inject(StudioStateService);
  private proc = inject(StudioProcessingService);
  private toast = inject(ToastService);

  factor = 2;
  detailBoost = 1.5;
  readonly factors = [2, 3, 4];

  async apply(): Promise<void> {
    const blob = this.state.currentBlob();
    if (!blob || this.state.busy()) return;

    this.state.setBusy(true, 0);
    try {
      const result = await this.proc.upscale(blob, this.factor, this.detailBoost, p => {
        this.state.setBusy(true, p);
      });
      this.state.applyResult(result, 'upscale', `Upscale ${this.factor}×`);
      this.applied.emit(result);
    } catch (e: any) {
      this.toast.error('Upscale failed: ' + (e.message ?? 'Unknown error'));
      this.state.setBusy(false);
    }
  }
}
