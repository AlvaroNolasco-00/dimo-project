import { Component, output, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StudioStateService } from '../../services/studio-state.service';
import { StudioProcessingService } from '../../services/studio-processing.service';
import { ToastService } from '../../../services/toast.service';

type BgMode = 'auto' | 'colors' | 'draw';

@Component({
  selector: 'app-remove-bg-tool',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="tool-panel">
      <h3 class="tool-title"><i class="ph ph-eraser"></i> Remove Background</h3>

      <div class="field">
        <label>Mode</label>
        <div class="btn-group">
          <button [class.active]="mode === 'auto'" (click)="setMode('auto')">Auto (AI)</button>
          <button [class.active]="mode === 'colors'" (click)="setMode('colors')">By Color</button>
          <button [class.active]="mode === 'draw'" (click)="setMode('draw')">Paint Mask</button>
        </div>
      </div>

      @if (mode === 'colors') {
        <div class="field">
          <label>Tolerance <span>{{ threshold }}</span></label>
          <input type="range" min="5" max="80" [(ngModel)]="threshold" />
        </div>
        <div class="field">
          <label>Colors (click canvas to pick)</label>
          <div class="color-chips">
            @for (c of colors(); track $index) {
              <span class="chip" [style.background]="toHex(c)" (click)="removeColor($index)">
                <i class="ph ph-x"></i>
              </span>
            }
            @if (colors().length === 0) {
              <span class="hint-sm">Click on canvas to pick colors</span>
            }
          </div>
        </div>
      }

      @if (mode === 'draw') {
        <div class="field">
          <label>Smart Refine</label>
          <label class="toggle">
            <input type="checkbox" [(ngModel)]="refine" />
            <span></span>
          </label>
        </div>
        <p class="hint">Paint over background on canvas, then Apply.</p>
        @if (!state.pendingMask()) {
          <p class="warn">Draw on canvas first.</p>
        }
      }

      <button
        class="btn-apply"
        [disabled]="state.busy() || (mode === 'draw' && !state.pendingMask()) || (mode === 'colors' && colors().length === 0)"
        (click)="apply()"
      >
        @if (state.busy()) { <i class="ph ph-spinner spin"></i> Processing... }
        @else { <i class="ph ph-check"></i> Apply }
      </button>
    </div>
  `
})
export class RemoveBgToolComponent {
  readonly applied = output<Blob>();
  readonly state = inject(StudioStateService);
  private proc = inject(StudioProcessingService);
  private toast = inject(ToastService);

  mode: BgMode = 'auto';
  threshold = 30;
  refine = false;
  readonly colors = signal<[number, number, number][]>([]);

  setMode(m: BgMode): void {
    this.mode = m;
    this.state.setMask(null);
  }

  addColorFromClick(r: number, g: number, b: number): void {
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
      const result = await this.proc.removeBackground(blob, this.mode, {
        mask: this.state.pendingMask() ?? undefined,
        colors: this.colors(),
        threshold: this.threshold,
        refine: this.refine,
      });
      this.state.applyResult(result, 'remove-bg', 'Remove BG');
      this.applied.emit(result);
    } catch (e: any) {
      this.toast.error('Remove BG failed: ' + (e.message ?? 'Unknown error'));
      this.state.setBusy(false);
    }
  }
}
