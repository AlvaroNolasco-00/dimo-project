import { Component, output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { StudioStateService } from '../../services/studio-state.service';
import { StudioProcessingService } from '../../services/studio-processing.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-transform-tool',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="tool-panel">
      <h3 class="tool-title"><i class="ph ph-arrows-clockwise"></i> Transformar</h3>

      <div class="rotate-controls">
        <button class="rot-btn" (click)="rotate(-90)" title="Rotate -90°">
          <i class="ph ph-arrow-counter-clockwise"></i> -90°
        </button>
        <button class="rot-btn" (click)="rotate(90)" title="Rotate +90°">
          <i class="ph ph-arrow-clockwise"></i> +90°
        </button>
      </div>

      <div class="field">
        <label>Rotación <span>{{ rotation | number:'1.0-0' }}°</span></label>
        <input type="range" min="-180" max="180" step="1" [(ngModel)]="rotation" />
      </div>

      <div class="flip-controls">
        <button class="flip-btn" [class.active]="flipH" (click)="flipH = !flipH">
          <i class="ph ph-arrows-horizontal"></i> Flip H
        </button>
        <button class="flip-btn" [class.active]="flipV" (click)="flipV = !flipV">
          <i class="ph ph-arrows-vertical"></i> Flip V
        </button>
      </div>

      <button class="btn-apply" [disabled]="state.busy()" (click)="apply()">
        @if (state.busy()) { <i class="ph ph-spinner spin"></i> Processing... }
        @else { <i class="ph ph-check"></i> Apply }
      </button>
    </div>
  `,
  styles: [`
    .rotate-controls, .flip-controls {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .rot-btn, .flip-btn {
      flex: 1;
      padding: 8px;
      border-radius: var(--radius, 6px);
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.05);
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: var(--transition, all 0.2s);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      &:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
      &.active { background: var(--accent-color); color: #fff; border-color: var(--accent-color); }
    }
  `],
})
export class TransformToolComponent {
  readonly applied = output<Blob>();
  readonly state = inject(StudioStateService);
  private proc = inject(StudioProcessingService);
  private toast = inject(ToastService);

  rotation = 0;
  flipH = false;
  flipV = false;

  rotate(deg: number): void {
    this.rotation = (this.rotation + deg + 360) % 360;
    if (this.rotation > 180) this.rotation -= 360;
  }

  async apply(): Promise<void> {
    const blob = this.state.currentBlob();
    if (!blob || this.state.busy()) return;

    this.state.setBusy(true);
    try {
      const result = await this.proc.transform(blob, this.rotation, this.flipH, this.flipV);
      this.state.applyResult(result, 'transform', 'Transform');
      this.rotation = 0;
      this.flipH = false;
      this.flipV = false;
      this.applied.emit(result);
    } catch (e: any) {
      this.toast.error('Transform failed: ' + (e.message ?? 'Unknown error'));
      this.state.setBusy(false);
    }
  }
}
