import { Component, output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { StudioStateService } from '../../services/studio-state.service';
import { StudioProcessingService } from '../../services/studio-processing.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-color-tool',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="tool-panel">
      <h3 class="tool-title"><i class="ph ph-paint-brush"></i> Color</h3>

      <div class="field">
        <label>Hue <span>{{ hue | number:'1.0-0' }}°</span></label>
        <input type="range" min="-180" max="180" step="5" [(ngModel)]="hue" />
      </div>

      <div class="field">
        <label>Saturation <span>{{ saturation | number:'1.2-2' }}x</span></label>
        <input type="range" min="0" max="3.0" step="0.05" [(ngModel)]="saturation" />
      </div>

      <div class="field">
        <label>Lightness <span>{{ lightness | number:'1.2-2' }}x</span></label>
        <input type="range" min="0.3" max="2.0" step="0.05" [(ngModel)]="lightness" />
      </div>

      <button class="btn-apply" [disabled]="state.busy()" (click)="apply()">
        @if (state.busy()) { <i class="ph ph-spinner spin"></i> Processing... }
        @else { <i class="ph ph-check"></i> Apply }
      </button>

      <button class="btn-reset" (click)="resetDefaults()">Reset defaults</button>
    </div>
  `,
})
export class ColorToolComponent {
  readonly applied = output<Blob>();
  readonly state = inject(StudioStateService);
  private proc = inject(StudioProcessingService);
  private toast = inject(ToastService);

  hue = 0;
  saturation = 1.0;
  lightness = 1.0;

  resetDefaults(): void {
    this.hue = 0;
    this.saturation = 1.0;
    this.lightness = 1.0;
  }

  async apply(): Promise<void> {
    const blob = this.state.currentBlob();
    if (!blob || this.state.busy()) return;

    this.state.setBusy(true);
    try {
      const result = await this.proc.colorCorrect(blob, this.hue, this.saturation, this.lightness);
      this.state.applyResult(result, 'color', 'Color Correction');
      this.applied.emit(result);
    } catch (e: any) {
      this.toast.error('Color correction failed: ' + (e.message ?? 'Unknown error'));
      this.state.setBusy(false);
    }
  }
}
