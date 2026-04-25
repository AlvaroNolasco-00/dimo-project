import {
  Component, inject, ChangeDetectionStrategy, computed, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LienzoStateService } from '../../services/lienzo-state.service';
import { pxToCm, cmToPx } from '../../models/lienzo.types';

type SizeUnit = 'px' | 'cm';

@Component({
  selector: 'app-lienzo-props',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (img(); as sel) {
      <div class="props">
        <h3 class="props-title">Propiedades</h3>

        <section class="prop-section">
          <span class="section-label">Posición</span>
          <div class="field-row">
            <label class="prop-field">
              <span>X</span>
              <input
                type="number"
                [ngModel]="roundVal(sel.x)"
                (ngModelChange)="onUpdate('x', $event)"
                step="1"
              />
              <span class="unit">px</span>
            </label>
            <label class="prop-field">
              <span>Y</span>
              <input
                type="number"
                [ngModel]="roundVal(sel.y)"
                (ngModelChange)="onUpdate('y', $event)"
                step="1"
              />
              <span class="unit">px</span>
            </label>
          </div>
        </section>

        <section class="prop-section">
          <span class="section-label">Tamaño</span>
          <div class="field-row">
            <label class="prop-field">
              <span>W</span>
              <input
                type="number"
                [ngModel]="displayWidth()"
                (ngModelChange)="onResize('width', $event)"
                [min]="sizeUnit() === 'cm' ? 0.1 : 10"
                step="0.1"
              />
            </label>
            <label class="prop-field">
              <span>H</span>
              <input
                type="number"
                [ngModel]="displayHeight()"
                (ngModelChange)="onResize('height', $event)"
                [min]="sizeUnit() === 'cm' ? 0.1 : 10"
                step="0.1"
              />
            </label>
            <select class="unit-select" [ngModel]="sizeUnit()" (ngModelChange)="sizeUnit.set($event)">
              <option value="px">px</option>
              <option value="cm">cm</option>
            </select>
          </div>
          <div class="field-row info-row">
            <span class="info-text">{{ infoText() }}</span>
            <label class="lock-label">
              <input type="checkbox" [ngModel]="lockAspect" (ngModelChange)="lockAspect = $event" />
              <i [class]="lockAspect ? 'ph ph-lock-simple' : 'ph ph-lock-simple-open'"></i>
              <span>Aspecto</span>
            </label>
          </div>
        </section>

        <section class="prop-section">
          <span class="section-label">Rotación</span>
          <div class="field-row">
            <input
              class="rotation-slider"
              type="range"
              min="0" max="360" step="1"
              [ngModel]="normalizedRotation()"
              (ngModelChange)="onUpdate('rotation', $event)"
            />
            <label class="prop-field narrow">
              <input
                type="number"
                [ngModel]="normalizedRotation()"
                (ngModelChange)="onUpdate('rotation', $event)"
                min="0" max="360" step="1"
              />
              <span class="unit">°</span>
            </label>
          </div>
        </section>

        <section class="prop-section">
          <span class="section-label">Orden Z</span>
          <div class="field-row">
            <button class="btn-z" (click)="state.reorder(sel.id, 'up')" title="Traer al frente">
              <i class="ph ph-arrow-up"></i>
            </button>
            <button class="btn-z" (click)="state.reorder(sel.id, 'down')" title="Enviar atrás">
              <i class="ph ph-arrow-down"></i>
            </button>
          </div>
        </section>

        <button class="btn-delete" (click)="state.removeImage(sel.id)">
          <i class="ph ph-trash"></i>
          <span>Eliminar imagen</span>
        </button>
      </div>
    } @else {
      <div class="empty">
        <i class="ph ph-cursor-click"></i>
        <p>Selecciona una imagen en el lienzo</p>
      </div>
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 260px;
      flex-shrink: 0;
      background: var(--card-bg);
      border-left: 1px solid rgba(0,0,0,0.06);
      overflow-y: auto;
    }

    .props {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .props-title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .prop-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
      opacity: 0.7;
    }

    .field-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .prop-field {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      font-size: 12px;
      color: var(--text-secondary);

      span:first-child {
        font-weight: 600;
        width: 14px;
        flex-shrink: 0;
      }

      input {
        width: 100%;
        height: 28px;
        border-radius: 6px;
        border: 1px solid var(--border-color);
        background: var(--bg-color);
        color: var(--text-primary);
        text-align: center;
        font-size: 12px;
        padding: 0 2px;
        outline: none;
        transition: border-color 0.2s;

        &:focus { border-color: var(--accent-color); }
      }

      .unit {
        font-size: 10px;
        opacity: 0.5;
        flex-shrink: 0;
      }

      &.narrow {
        flex: 0 0 70px;

        input { width: 48px; }
      }
    }

    .unit-select {
      height: 28px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-color);
      color: var(--text-primary);
      font-size: 11px;
      padding: 0 4px;
      outline: none;
      cursor: pointer;

      &:focus { border-color: var(--accent-color); }
    }

    .info-row {
      justify-content: space-between;
    }

    .info-text {
      font-size: 11px;
      color: var(--text-secondary);
      opacity: 0.6;
    }

    .lock-label {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--text-secondary);
      cursor: pointer;

      input[type="checkbox"] { display: none; }
      i { font-size: 14px; }
    }

    .rotation-slider {
      flex: 1;
      height: 4px;
      accent-color: var(--accent-color);
      cursor: pointer;
    }

    .btn-z {
      height: 28px;
      width: 28px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-color);
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: background 0.15s;

      &:hover { background: var(--border-color); }
    }

    .btn-delete {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 34px;
      border-radius: 8px;
      border: 1px solid rgba(220,53,69,0.2);
      background: rgba(220,53,69,0.06);
      color: #dc3545;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      margin-top: 8px;

      &:hover { background: rgba(220,53,69,0.12); }

      i { font-size: 15px; }
    }

    .empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--text-secondary);
      text-align: center;
      padding: 24px;

      i { font-size: 36px; opacity: 0.4; }
      p { margin: 0; font-size: 13px; opacity: 0.6; }
    }
  `],
})
export class LienzoPropsComponent {
  readonly state = inject(LienzoStateService);

  lockAspect = true;
  sizeUnit = signal<SizeUnit>('px');

  readonly img = this.state.selectedImage;

  readonly displayWidth = computed(() => {
    const sel = this.img();
    if (!sel) return 0;
    return this.sizeUnit() === 'cm' ? pxToCm(sel.width) : Math.round(sel.width);
  });

  readonly displayHeight = computed(() => {
    const sel = this.img();
    if (!sel) return 0;
    return this.sizeUnit() === 'cm' ? pxToCm(sel.height) : Math.round(sel.height);
  });

  readonly infoText = computed(() => {
    const sel = this.img();
    if (!sel) return '';
    const pxW = Math.round(sel.width);
    const pxH = Math.round(sel.height);
    const cmW = pxToCm(sel.width);
    const cmH = pxToCm(sel.height);
    if (this.sizeUnit() === 'px') {
      return `${pxW} × ${pxH} px | ${cmW} × ${cmH} cm`;
    } else {
      return `${cmW} × ${cmH} cm | ${pxW} × ${pxH} px`;
    }
  });

  readonly normalizedRotation = computed(() => {
    const sel = this.img();
    if (!sel) return 0;
    return Math.round(((sel.rotation % 360) + 360) % 360);
  });

  readonly widthCm = computed(() => {
    const sel = this.img();
    return sel ? pxToCm(sel.width) : 0;
  });

  readonly heightCm = computed(() => {
    const sel = this.img();
    return sel ? pxToCm(sel.height) : 0;
  });

  roundVal(n: number): number {
    return Math.round(n);
  }

  onUpdate(prop: 'x' | 'y' | 'rotation', value: number): void {
    const sel = this.img();
    if (!sel) return;
    this.state.updateImage(sel.id, { [prop]: +value });
  }

  onResize(prop: 'width' | 'height', value: number): void {
    const sel = this.img();
    if (!sel) return;
    const minValue = this.sizeUnit() === 'cm' ? 0.1 : 10;
    if (value < minValue) return;
    const aspect = sel.naturalWidth / sel.naturalHeight;
    const pxValue = this.sizeUnit() === 'cm' ? cmToPx(value) : value;

    if (this.lockAspect) {
      if (prop === 'width') {
        this.state.updateImage(sel.id, { width: pxValue, height: pxValue / aspect });
      } else {
        this.state.updateImage(sel.id, { height: pxValue, width: pxValue * aspect });
      }
    } else {
      this.state.updateImage(sel.id, { [prop]: pxValue });
    }
  }
}
