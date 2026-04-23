import { Component, inject, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StudioStateService } from '../../services/studio-state.service';

interface AspectPreset { label: string; value: number; }

const PRESETS: AspectPreset[] = [
  { label: 'Libre',  value: NaN },
  { label: '1:1',    value: 1 },
  { label: '4:3',    value: 4 / 3 },
  { label: '3:4',    value: 3 / 4 },
  { label: '16:9',   value: 16 / 9 },
  { label: '9:16',   value: 9 / 16 },
];

@Component({
  selector: 'app-crop-tool',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tool-panel">
      <h3 class="tool-title"><i class="ph ph-crop"></i> Recorte</h3>

      <div class="field">
        <label>Proporción</label>
        <div class="aspect-grid">
          @for (p of presets; track p.label) {
            <button
              class="aspect-btn"
              [class.active]="isActive(p.value)"
              (click)="selectAspect(p.value)"
            >{{ p.label }}</button>
          }
        </div>
      </div>

      <p class="hint-sm">Arrastra el recuadro sobre la imagen para ajustar.</p>

      <button class="btn-apply" [disabled]="state.busy()" (click)="applyClicked.emit()">
        @if (state.busy()) { <i class="ph ph-spinner spin"></i> Aplicando... }
        @else { <i class="ph ph-check"></i> Aplicar recorte }
      </button>
    </div>
  `,
  styles: [`
    .aspect-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .aspect-btn {
      padding: 4px 10px;
      border-radius: var(--radius, 6px);
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.05);
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
      transition: var(--transition, all 0.2s);
      &:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
      &.active { background: var(--accent-color); color: #fff; border-color: var(--accent-color); }
    }
    .hint-sm {
      font-size: 11px;
      color: var(--text-secondary);
      margin: 8px 0 0;
      line-height: 1.4;
    }
  `],
})
export class CropToolComponent {
  readonly state = inject(StudioStateService);

  readonly aspectChange = output<number>();
  readonly applyClicked = output<void>();

  readonly presets = PRESETS;
  private _aspect = signal<number>(NaN);

  isActive(value: number): boolean {
    const cur = this._aspect();
    return isNaN(value) ? isNaN(cur) : cur === value;
  }

  selectAspect(value: number): void {
    this._aspect.set(value);
    this.aspectChange.emit(value);
  }
}
