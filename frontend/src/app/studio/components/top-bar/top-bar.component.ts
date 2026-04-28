import { Component, input, output, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-studio-top-bar',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="top-bar">
      <div class="left">
        <button class="btn-icon upload-btn" (click)="fileInput.click()" title="Open image">
          <i class="ph ph-folder-open"></i>
        </button>
        <input #fileInput type="file" accept="image/*" (change)="onFile($event)" />
        @if (filename()) {
          <span class="filename">{{ filename() }}</span>
        } @else {
          <span class="filename muted">No image</span>
        }
      </div>

      <div class="center">
        <div class="mode-switcher">
          <button class="mode-btn active">Editor</button>
          <button class="mode-btn" (click)="router.navigate(['/lienzo'])">
            <i class="ph ph-squares-four"></i>
            Lienzo
          </button>
        </div>
      </div>

      <div class="right">
        <button class="btn-icon" [disabled]="!canUndo()" (click)="undo.emit()" title="Undo">
          <i class="ph ph-arrow-counter-clockwise"></i>
        </button>
        <button class="btn-icon" [disabled]="!canRedo()" (click)="redo.emit()" title="Redo">
          <i class="ph ph-arrow-clockwise"></i>
        </button>
        <button class="btn-icon" [disabled]="!hasImage()" (click)="reset.emit()" title="Reset to original">
          <i class="ph ph-arrow-u-up-left"></i>
        </button>
        <div class="divider"></div>
        <button class="btn-download" [disabled]="!hasImage()" (click)="download.emit()" title="Download">
          <i class="ph ph-download-simple"></i>
          <span>Download</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      height: 56px;
      background: var(--card-bg);
      border-bottom: 1px solid rgba(0,0,0,0.06);
      flex-shrink: 0;
    }

    .left, .right { display: flex; align-items: center; gap: 8px; flex: 1; }
    .right { justify-content: flex-end; }
    .center { flex: 0 0 auto; }

    .mode-switcher {
      display: flex;
      align-items: center;
      gap: 2px;
      background: var(--bg-color);
      border-radius: 10px;
      padding: 3px;
    }

    .mode-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 5px 14px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 600;
      font-family: 'Outfit', sans-serif;
      cursor: pointer;
      transition: all 0.15s;

      i { font-size: 15px; }

      &:hover:not(.active) { color: var(--text-primary); }

      &.active {
        background: var(--card-bg);
        color: var(--accent-color);
        box-shadow: 0 1px 3px rgba(0,0,0,0.12);
      }
    }

    .filename {
      font-size: 13px;
      color: var(--text-primary);
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      &.muted { color: var(--text-secondary); }
    }

    .btn-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      border: none;
      background: transparent;
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      transition: background var(--transition);

      &:hover:not(:disabled) { background: var(--bg-color); }
      &:disabled { opacity: 0.35; cursor: not-allowed; }
    }

    .upload-btn { color: var(--accent-color); }

    .divider {
      width: 1px;
      height: 24px;
      background: var(--border-color);
      margin: 0 4px;
    }

    .btn-download {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 16px;
      height: 36px;
      border-radius: 10px;
      border: none;
      background: var(--accent-color);
      color: white;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background var(--transition);

      &:hover:not(:disabled) { background: var(--accent-hover); }
      &:disabled { opacity: 0.4; cursor: not-allowed; }

      i { font-size: 16px; }
    }

    input[type="file"] { display: none; }
  `]
})
export class TopBarComponent {
  readonly router = inject(Router);
  readonly filename = input<string>('');
  readonly hasImage = input<boolean>(false);
  readonly canUndo = input<boolean>(false);
  readonly canRedo = input<boolean>(false);

  readonly fileSelected = output<File>();
  readonly undo = output<void>();
  readonly redo = output<void>();
  readonly reset = output<void>();
  readonly download = output<void>();

  onFile(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.fileSelected.emit(file);
  }
}
