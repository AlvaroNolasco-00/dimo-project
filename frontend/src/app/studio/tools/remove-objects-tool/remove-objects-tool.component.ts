import { Component, output, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StudioStateService } from '../../services/studio-state.service';
import { StudioProcessingService } from '../../services/studio-processing.service';
import { ToastService } from '../../../services/toast.service';

type ObjMode = 'brush' | 'magic-wand';

@Component({
  selector: 'app-remove-objects-tool',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="tool-panel">
      <h3 class="tool-title"><i class="ph ph-magic-wand"></i> Remove Objects</h3>

      <div class="field">
        <label>Method</label>
        <div class="btn-group">
          <button [class.active]="mode === 'brush'" (click)="setMode('brush')">Brush Mask</button>
          <button [class.active]="mode === 'magic-wand'" (click)="setMode('magic-wand')">Magic Wand</button>
        </div>
      </div>

      @if (mode === 'brush') {
        <div class="field">
          <label>Brush Size <span>{{ brushSize }}px</span></label>
          <input type="range" min="5" max="80" [(ngModel)]="brushSize" />
        </div>
        <p class="hint">Paint over object to remove on canvas, then Apply.</p>
        @if (!state.pendingMask()) {
          <p class="warn">Draw on canvas first.</p>
        }
      }

      @if (mode === 'magic-wand') {
        <div class="field">
          <label>Tolerance <span>{{ tolerance }}</span></label>
          <input type="range" min="5" max="80" [(ngModel)]="tolerance" />
        </div>
        @if (state.canvasClick()) {
          <p class="hint-sm">Click at ({{ state.canvasClick()!.x }}, {{ state.canvasClick()!.y }}) — ready.</p>
        } @else {
          <p class="warn">Click on canvas to set target point.</p>
        }
      }

      <button
        class="btn-apply"
        [disabled]="state.busy() || (mode === 'brush' && !state.pendingMask()) || (mode === 'magic-wand' && !state.canvasClick())"
        (click)="apply()"
      >
        @if (state.busy()) { <i class="ph ph-spinner spin"></i> Processing... }
        @else { <i class="ph ph-check"></i> Apply }
      </button>
    </div>
  `
})
export class RemoveObjectsToolComponent {
  readonly applied = output<Blob>();
  readonly state = inject(StudioStateService);
  private proc = inject(StudioProcessingService);
  private toast = inject(ToastService);

  mode: ObjMode = 'brush';
  brushSize = 30;
  tolerance = 30;

  setMode(m: ObjMode): void {
    this.mode = m;
    this.state.setMask(null);
  }

  async apply(): Promise<void> {
    const blob = this.state.currentBlob();
    if (!blob || this.state.busy()) return;

    this.state.setBusy(true);
    try {
      const result = await this.proc.removeObjects(blob, this.mode, {
        mask: this.state.pendingMask() ?? undefined,
        x: this.state.canvasClick()?.x,
        y: this.state.canvasClick()?.y,
        tolerance: this.tolerance,
      });
      this.state.applyResult(result, 'remove-objects', 'Remove Objects');
      this.applied.emit(result);
    } catch (e: any) {
      this.toast.error('Remove Objects failed: ' + (e.message ?? 'Unknown error'));
      this.state.setBusy(false);
    }
  }
}
