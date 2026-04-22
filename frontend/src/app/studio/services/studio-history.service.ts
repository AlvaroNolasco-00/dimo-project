import { Injectable, signal, computed } from '@angular/core';
import { HistoryEntry, ToolId } from '../models/tool.types';

const MAX_HISTORY = 20;

@Injectable({ providedIn: 'root' })
export class StudioHistoryService {
  private _stack = signal<HistoryEntry[]>([]);
  private _cursor = signal<number>(-1);

  readonly stack = this._stack.asReadonly();
  readonly cursor = this._cursor.asReadonly();
  readonly canUndo = computed(() => this._cursor() > 0);
  readonly canRedo = computed(() => this._cursor() < this._stack().length - 1);
  readonly current = computed<HistoryEntry | null>(() => {
    const s = this._stack();
    const c = this._cursor();
    return c >= 0 ? s[c] : null;
  });

  push(blob: Blob, toolId: ToolId | 'original', label: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      blob,
      objectUrl,
      toolId,
      label,
      timestamp: Date.now(),
    };

    // Truncate forward history
    const cursor = this._cursor();
    const trimmed = this._stack().slice(0, cursor + 1);

    let next = [...trimmed, entry];
    if (next.length > MAX_HISTORY) {
      const removed = next.shift()!;
      URL.revokeObjectURL(removed.objectUrl);
    }

    this._stack.set(next);
    this._cursor.set(next.length - 1);
  }

  undo(): void {
    if (this.canUndo()) this._cursor.update(c => c - 1);
  }

  redo(): void {
    if (this.canRedo()) this._cursor.update(c => c + 1);
  }

  jumpTo(index: number): void {
    if (index >= 0 && index < this._stack().length) {
      this._cursor.set(index);
    }
  }

  clear(): void {
    this._stack().forEach(e => URL.revokeObjectURL(e.objectUrl));
    this._stack.set([]);
    this._cursor.set(-1);
  }
}
