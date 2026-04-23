import { Component, output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { StudioStateService } from '../../services/studio-state.service';
import { StudioProcessingService } from '../../services/studio-processing.service';
import { ToastService } from '../../../services/toast.service';

interface FilterDef { id: string; label: string; icon: string; description: string; }

const FILTERS: FilterDef[] = [
  { id: 'grayscale',  label: 'B&N',       icon: 'ph-circle',        description: 'Convierte la imagen a escala de grises, eliminando todo el color.' },
  { id: 'sepia',      label: 'Sepia',     icon: 'ph-sun',           description: 'Aplica un tono marrón cálido, estilo fotografía antigua.' },
  { id: 'vintage',    label: 'Vintage',   icon: 'ph-camera',        description: 'Reduce el contraste y saturación, añadiendo un tinte retro suave.' },
  { id: 'cinematic',  label: 'Cine',      icon: 'ph-film-strip',    description: 'Aumenta contraste y aplica gradación teal & orange de cine.' },
  { id: 'vivid',      label: 'Vivid',     icon: 'ph-sparkle',       description: 'Realza los colores para un look vibrante y saturado.' },
  { id: 'cool',       label: 'Cool',      icon: 'ph-snowflake',     description: 'Añade un tinte azulado, sensación fría y tranquila.' },
  { id: 'warm',       label: 'Warm',      icon: 'ph-fire',          description: 'Añade un tinte anaranjado, sensación cálida y acogedora.' },
  { id: 'fade',       label: 'Fade',      icon: 'ph-cloud',         description: 'Aclara y reduce contraste, estilo fotografía desvanecida.' },
  { id: 'noir',       label: 'Noir',      icon: 'ph-moon',          description: 'Blanco y negro de alto contraste, estilo noir cinematográfico.' },
  { id: 'dramatic',   label: 'Dramatic',  icon: 'ph-lightning',     description: 'Contraste extremo con colores intensos para impacto visual.' },
];

@Component({
  selector: 'app-filters-tool',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="tool-panel">
      <h3 class="tool-title"><i class="ph ph-palette"></i> Filtros</h3>

      <div class="filter-grid">
        @for (f of filters; track f.id) {
          <button
            class="filter-card"
            [class.active]="selectedFilter === f.id"
            (click)="selectFilter(f.id)"
          >
            <i class="ph {{ f.icon }}"></i>
            <span>{{ f.label }}</span>
          </button>
        }
      </div>

      @if (selectedFilterInfo) {
        <div class="filter-info">
          <strong>{{ selectedFilterInfo.label }}</strong>
          <p>{{ selectedFilterInfo.description }}</p>
        </div>

        <div class="field">
          <label>Intensidad <span>{{ intensity | number:'1.0-0' }}%</span></label>
          <input type="range" min="0" max="100" step="5" [(ngModel)]="intensity" />
        </div>
      }

      <button class="btn-apply" [disabled]="!selectedFilter || state.busy()" (click)="apply()">
        @if (state.busy()) { <i class="ph ph-spinner spin"></i> Processing... }
        @else { <i class="ph ph-check"></i> Apply }
      </button>
    </div>
  `,
  styles: [`
    .filter-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
      margin-bottom: 12px;
    }
    .filter-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 8px 4px;
      border-radius: var(--radius, 6px);
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.05);
      color: var(--text-secondary);
      font-size: 11px;
      cursor: pointer;
      transition: var(--transition, all 0.2s);
      i { font-size: 18px; }
      &:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
      &.active { background: var(--accent-color); color: #fff; border-color: var(--accent-color); }
    }
    .filter-info {
      padding: 10px 12px;
      border-radius: var(--radius, 6px);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      margin-bottom: 12px;
      strong {
        display: block;
        font-size: 13px;
        color: var(--text-primary);
        margin-bottom: 4px;
      }
      p {
        margin: 0;
        font-size: 12px;
        color: var(--text-secondary);
        line-height: 1.4;
      }
    }
  `],
})
export class FiltersToolComponent {
  readonly applied = output<Blob>();
  readonly state = inject(StudioStateService);
  private proc = inject(StudioProcessingService);
  private toast = inject(ToastService);

  readonly filters = FILTERS;
  selectedFilter = '';
  intensity = 100;

  get selectedFilterInfo(): FilterDef | null {
    return this.filters.find(f => f.id === this.selectedFilter) ?? null;
  }

  selectFilter(id: string): void {
    this.selectedFilter = this.selectedFilter === id ? '' : id;
  }

  async apply(): Promise<void> {
    const blob = this.state.currentBlob();
    if (!blob || !this.selectedFilter || this.state.busy()) return;

    this.state.setBusy(true);
    try {
      const result = await this.proc.applyFilter(blob, this.selectedFilter, this.intensity / 100);
      this.state.applyResult(result, 'filters', `Filter: ${this.selectedFilter}`);
      this.applied.emit(result);
    } catch (e: any) {
      this.toast.error('Filter failed: ' + (e.message ?? 'Unknown error'));
      this.state.setBusy(false);
    }
  }
}
