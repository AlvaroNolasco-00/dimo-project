import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HistoryEntry } from '../../models/tool.types';

@Component({
  selector: 'app-history-strip',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="history-strip">
      <span class="label">History</span>
      <div class="entries">
        @for (entry of stack(); track entry.id; let i = $index) {
          <button
            class="entry"
            [class.active]="i === cursor()"
            (click)="jump.emit(i)"
            [title]="entry.label"
          >
            <img [src]="entry.objectUrl" [alt]="entry.label" />
            <span>{{ entry.label }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .history-strip {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 80px;
      padding: 0 16px;
      background: var(--card-bg);
      border-top: 1px solid rgba(0,0,0,0.06);
      flex-shrink: 0;
    }

    .label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }

    .entries {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      flex: 1;
      padding: 4px 0;

      &::-webkit-scrollbar { height: 3px; }
    }

    .entry {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      flex-shrink: 0;
      padding: 4px;
      border-radius: 8px;
      border: 2px solid transparent;
      background: var(--bg-color);
      cursor: pointer;
      transition: all var(--transition);

      &:hover { border-color: var(--text-secondary); }
      &.active { border-color: var(--accent-color); }

      img {
        width: 44px;
        height: 44px;
        object-fit: cover;
        border-radius: 4px;
        display: block;
      }

      span {
        font-size: 9px;
        color: var(--text-secondary);
        max-width: 52px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  `]
})
export class HistoryStripComponent {
  readonly stack = input<HistoryEntry[]>([]);
  readonly cursor = input<number>(-1);
  readonly jump = output<number>();
}
