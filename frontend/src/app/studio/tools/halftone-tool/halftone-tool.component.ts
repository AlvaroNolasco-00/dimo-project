import { Component, output, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StudioStateService } from '../../services/studio-state.service';
import { StudioProcessingService } from '../../services/studio-processing.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-halftone-tool',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="tool-panel">
      <h3 class="tool-title"><i class="ph ph-circles-three"></i> Halftone</h3>

      <div class="field">
        <label>Dot Size <span>{{ dotSize }}</span></label>
        <input type="range" min="3" max="30" [(ngModel)]="dotSize" />
      </div>

      <div class="field">
        <label>Scale <span>{{ scale }}</span></label>
        <input type="range" min="0.5" max="2.0" step="0.1" [(ngModel)]="scale" />
      </div>

      <div class="field">
        <label>Spacing <span>{{ spacing }}</span></label>
        <input type="range" min="0" max="20" [(ngModel)]="spacing" />
      </div>

      <div class="field">
        <label>Color Threshold <span>{{ threshold }}</span></label>
        <input type="range" min="5" max="80" [(ngModel)]="threshold" />
      </div>

      <div class="field">
        <label>Remove Colors (canvas click)</label>
        <div class="color-chips">
          @for (c of colors(); track $index) {
            <span class="chip" [style.background]="toHex(c)" (click)="removeColor($index)">
              <i class="ph ph-x"></i>
            </span>
          }
          @if (colors().length === 0) {
            <span class="hint-sm">Click canvas to add colors to remove</span>
          }
        </div>
      </div>

      <button class="btn-apply" [disabled]="state.busy()" (click)="apply()">
        @if (state.busy()) { <i class="ph ph-spinner spin"></i> Processing... }
        @else { <i class="ph ph-check"></i> Apply }
      </button>
    </div>
  `
})
export class HalftoneToolComponent {
  readonly applied = output<Blob>();
  readonly state = inject(StudioStateService);
  private proc = inject(StudioProcessingService);
  private toast = inject(ToastService);

  dotSize = 10;
  scale = 1.0;
  spacing = 0;
  threshold = 30;
  readonly colors = signal<[number, number, number][]>([]);

  addColor(r: number, g: number, b: number): void {
    this.colors.update(cs => [...cs, [r, g, b]]);
  }

  removeColor(i: number): void {
    this.colors.update(cs => cs.filter((_, idx) => idx !== i));
  }

  toHex([r, g, b]: [number, number, number]): string {
    return `rgb(${r},${g},${b})`;
  }

  async apply(): Promise<void> {
    const blob = this.state.currentBlob();
    if (!blob || this.state.busy()) return;

    this.state.setBusy(true);
    try {
      const result = await this.proc.halftone(blob, this.dotSize, this.scale, this.spacing, this.threshold, this.colors().length ? this.colors() : undefined);
      this.state.applyResult(result, 'halftone', 'Halftone');
      this.applied.emit(result);
    } catch (e: any) {
      this.toast.error('Halftone failed: ' + (e.message ?? 'Unknown error'));
      this.state.setBusy(false);
    }
  }
}
