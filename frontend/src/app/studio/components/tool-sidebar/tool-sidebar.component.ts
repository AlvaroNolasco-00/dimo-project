import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TOOLS, ToolDef, ToolId } from '../../models/tool.types';

@Component({
  selector: 'app-tool-sidebar',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="tool-sidebar">
      @for (tool of tools; track tool.id) {
        <button
          class="tool-btn"
          [class.active]="activeTool() === tool.id"
          [disabled]="!hasImage() && !tool.alwaysEnabled"
          (click)="toolSelect.emit(tool.id)"
          [title]="tool.description"
        >
          <i class="ph {{ tool.icon }}"></i>
          <span>{{ tool.label }}</span>
        </button>
      }
    </nav>
  `,
  styles: [`
    .tool-sidebar {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 112px;
      flex-shrink: 0;
      padding: 12px 8px;
      background: var(--card-bg);
      border-right: 1px solid rgba(0,0,0,0.06);
      overflow-y: auto;
      max-height: 100%;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .tool-sidebar::-webkit-scrollbar { width: 4px; }
    .tool-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }

    .tool-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 10px 8px;
      border-radius: 12px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition);
      font-size: 11px;
      font-family: 'Outfit', sans-serif;
      font-weight: 500;

      i { font-size: 22px; }

      &:hover:not(:disabled) {
        background: var(--bg-color);
        color: var(--text-primary);
      }

      &.active {
        background: rgba(var(--accent-rgb), 0.1);
        color: var(--accent-color);
      }

      &:disabled { opacity: 0.3; cursor: not-allowed; }
    }
  `]
})
export class ToolSidebarComponent {
  readonly activeTool = input<ToolId | null>(null);
  readonly hasImage = input<boolean>(false);
  readonly toolSelect = output<ToolId>();

  readonly tools: ToolDef[] = TOOLS;
}
