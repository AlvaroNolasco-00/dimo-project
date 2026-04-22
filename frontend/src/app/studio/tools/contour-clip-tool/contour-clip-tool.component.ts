import { Component, output, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StudioStateService } from '../../services/studio-state.service';
import { StudioProcessingService } from '../../services/studio-processing.service';
import { ToastService } from '../../../services/toast.service';

type ClipMode = 'manual' | 'auto';

@Component({
  selector: 'app-contour-clip-tool',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="tool-panel">
      <h3 class="tool-title"><i class="ph ph-path"></i> Contour Clip</h3>

      <div class="field">
        <label>Mode</label>
        <div class="btn-group">
          <button [class.active]="mode === 'manual'" (click)="setMode('manual')">Paint Mask</button>
          <button [class.active]="mode === 'auto'" (click)="setMode('auto')">By Color</button>
        </div>
      </div>

      @if (mode === 'auto') {
        <div class="field">
          <label>Threshold <span>{{ threshold }}</span></label>
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
              <span class="hint-sm">Click canvas to pick colors</span>
            }
          </div>
        </div>
      }

      @if (mode === 'manual') {
        <p class="hint">Paint the area to keep on canvas, then Apply.</p>
        @if (!state.pendingMask()) { <p class="warn">Draw mask on canvas first.</p> }
      }

      <div class="field">
        <label>Smart Refine</label>
        <label class="toggle">
          <input type="checkbox" [(ngModel)]="refine" />
          <span></span>
        </label>
      </div>

      <button
        class="btn-apply"
        [disabled]="state.busy() || (mode === 'manual' && !state.pendingMask()) || (mode === 'auto' && colors().length === 0)"
        (click)="apply()"
      >
        @if (state.busy()) { <i class="ph ph-spinner spin"></i> Processing... }
        @else { <i class="ph ph-check"></i> Apply }
      </button>
    </div>
  `
})
export class ContourClipToolComponent {
  readonly applied = output<Blob>();
  readonly state = inject(StudioStateService);
  private proc = inject(StudioProcessingService);
  private toast = inject(ToastService);

  mode: ClipMode = 'manual';
  threshold = 30;
  refine = false;
  readonly colors = signal<[number, number, number][]>([]);

  setMode(m: ClipMode): void {
    this.mode = m;
    this.state.setMask(null);
  }

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
      const result = await this.proc.contourClip(blob, this.mode, {
        mask: this.state.pendingMask() ?? undefined,
        refine: this.refine,
        colors: this.colors(),
        threshold: this.threshold,
      });
      this.state.applyResult(result, 'contour-clip', 'Contour Clip');
      this.applied.emit(result);
    } catch (e: any) {
      this.toast.error('Contour Clip failed: ' + (e.message ?? 'Unknown error'));
      this.state.setBusy(false);
    }
  }
}
