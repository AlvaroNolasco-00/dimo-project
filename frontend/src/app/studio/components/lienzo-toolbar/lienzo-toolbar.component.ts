import {
  Component, inject, ChangeDetectionStrategy, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LienzoStateService } from '../../services/lienzo-state.service';

@Component({
  selector: 'app-lienzo-toolbar',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div class="group">
        <span class="toolbar-brand">Lienzo</span>
      </div>

      <div class="group">
        <label class="size-field">
          <span>Ancho</span>
          <input
            type="number"
            [ngModel]="state.size().widthCm"
            (ngModelChange)="onWidthChange($event)"
            min="1" max="200" step="0.5"
          />
          <span class="unit">cm</span>
        </label>

        <span class="size-x">×</span>

        <label class="size-field">
          <span>Alto</span>
          <input
            type="number"
            [ngModel]="state.size().heightCm"
            (ngModelChange)="onHeightChange($event)"
            min="1" max="200" step="0.5"
          />
          <span class="unit">cm</span>
        </label>
      </div>

      <div class="group">
        <label class="bg-color-field" title="Color de fondo (solo edición, no se exporta)">
          <i class="ph ph-paint-bucket"></i>
          <input
            type="color"
            [ngModel]="state.editBgColor()"
            (ngModelChange)="state.setEditBgColor($event)"
          />
        </label>
        <button
          class="btn-toolbar"
          [style.display]="state.editBgColor() === '#ffffff' ? 'none' : 'flex'"
          (click)="state.setEditBgColor('#ffffff')"
          title="Restablecer fondo blanco"
        >
          <i class="ph ph-arrow-counter-clockwise"></i>
        </button>
        <div class="divider"></div>
      </div>

      <div class="group">
        <button class="btn-toolbar" (click)="fileInput.click()" title="Agregar imagen">
          <i class="ph ph-image-square"></i>
          <span>Agregar</span>
        </button>
        <input
          #fileInput
          type="file"
          accept="image/*"
          multiple
          (change)="onFiles($event)"
        />

        <button
          class="btn-toolbar danger"
          [disabled]="!state.selectedId()"
          (click)="state.deleteSelected()"
          title="Eliminar seleccionada"
        >
          <i class="ph ph-trash"></i>
        </button>

        <div class="divider"></div>

        <button
          class="btn-toolbar"
          (click)="onFitToView()"
          title="Ajustar vista"
        >
          <i class="ph ph-arrows-in"></i>
        </button>

        <button
          class="btn-download"
          [disabled]="!state.hasImages()"
          (click)="state.exportPng()"
          title="Descargar PNG"
        >
          <i class="ph ph-download-simple"></i>
          <span>Exportar</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      height: 56px;
      background: var(--card-bg);
      border-bottom: 1px solid rgba(0,0,0,0.06);
      flex-shrink: 0;
      gap: 12px;
    }

    .group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .toolbar-brand {
      font-weight: 700;
      font-size: 18px;
      color: var(--accent-color);
      letter-spacing: -0.5px;
    }

    .size-field {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--text-secondary);

      span:first-child { font-weight: 500; }

      input {
        width: 60px;
        height: 30px;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        background: var(--bg-color);
        color: var(--text-primary);
        text-align: center;
        font-size: 13px;
        padding: 0 4px;
        outline: none;
        transition: border-color 0.2s;

        &:focus { border-color: var(--accent-color); }
      }

      .unit {
        font-size: 11px;
        color: var(--text-secondary);
        opacity: 0.6;
      }
    }

    .size-x {
      color: var(--text-secondary);
      font-size: 14px;
      opacity: 0.5;
    }

    .btn-toolbar {
      height: 34px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 12px;
      font-size: 13px;
      font-weight: 500;
      transition: background 0.15s;

      &:hover:not(:disabled) { background: var(--bg-color); }
      &:disabled { opacity: 0.35; cursor: not-allowed; }

      i { font-size: 17px; }

      &.danger:hover:not(:disabled) {
        background: rgba(220, 53, 69, 0.1);
        color: #dc3545;
      }
    }

    .divider {
      width: 1px;
      height: 24px;
      background: var(--border-color);
      margin: 0 2px;
    }

    .btn-download {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 16px;
      height: 34px;
      border-radius: 8px;
      border: none;
      background: var(--accent-color);
      color: white;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;

      &:hover:not(:disabled) { background: var(--accent-hover); }
      &:disabled { opacity: 0.4; cursor: not-allowed; }

      i { font-size: 16px; }
    }

    input[type="file"] { display: none; }

    .bg-color-field {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 8px;
      height: 34px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 13px;
      transition: border-color 0.15s;

      &:hover { border-color: var(--accent-color); }

      i { font-size: 16px; }

      input[type="color"] {
        width: 22px;
        height: 22px;
        border: none;
        border-radius: 4px;
        padding: 0;
        cursor: pointer;
        background: none;
        outline: none;
      }
    }
  `],
})
export class LienzoToolbarComponent {
  readonly state = inject(LienzoStateService);

  fitToView = signal<(() => void) | null>(null);

  onWidthChange(val: number): void {
    if (val > 0) {
      this.state.setSize(val, this.state.size().heightCm);
    }
  }

  onHeightChange(val: number): void {
    if (val > 0) {
      this.state.setSize(this.state.size().widthCm, val);
    }
  }

  async onFiles(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await this.state.addImage(files[i]);
    }
    input.value = '';
  }

  onFitToView(): void {
    const fn = this.fitToView();
    if (fn) fn();
  }
}
