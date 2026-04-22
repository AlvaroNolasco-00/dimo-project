import { Component, output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { StudioStateService } from '../../services/studio-state.service';
import { StudioProcessingService } from '../../services/studio-processing.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-enhance-tool',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="tool-panel">
      <h3 class="tool-title"><i class="ph ph-sparkle"></i> Enhance</h3>

      <div class="field">
        <label>Contrast <span>{{ contrast | number:'1.2-2' }}</span></label>
        <input type="range" min="0.5" max="2.0" step="0.05" [(ngModel)]="contrast" />
      </div>

      <div class="field">
        <label>Brightness <span>{{ brightness | number:'1.2-2' }}</span></label>
        <input type="range" min="0.5" max="2.0" step="0.05" [(ngModel)]="brightness" />
      </div>

      <div class="field">
        <label>Sharpness <span>{{ sharpness | number:'1.2-2' }}</span></label>
        <input type="range" min="0.5" max="3.0" step="0.1" [(ngModel)]="sharpness" />
      </div>

      <button class="btn-apply" [disabled]="state.busy()" (click)="apply()">
        @if (state.busy()) { <i class="ph ph-spinner spin"></i> Processing... }
        @else { <i class="ph ph-check"></i> Apply }
      </button>

      <button class="btn-reset" (click)="resetDefaults()">Reset defaults</button>
    </div>
  `
})
export class EnhanceToolComponent {
  readonly applied = output<Blob>();
  readonly state = inject(StudioStateService);
  private proc = inject(StudioProcessingService);
  private toast = inject(ToastService);

  contrast = 1.2;
  brightness = 1.1;
  sharpness = 1.3;

  resetDefaults(): void {
    this.contrast = 1.2;
    this.brightness = 1.1;
    this.sharpness = 1.3;
  }

  async apply(): Promise<void> {
    const blob = this.state.currentBlob();
    if (!blob || this.state.busy()) return;

    this.state.setBusy(true);
    try {
      const result = await this.proc.enhanceQuality(blob, this.contrast, this.brightness, this.sharpness);
      this.state.applyResult(result, 'enhance', 'Enhance');
      this.applied.emit(result);
    } catch (e: any) {
      this.toast.error('Enhance failed: ' + (e.message ?? 'Unknown error'));
      this.state.setBusy(false);
    }
  }
}
