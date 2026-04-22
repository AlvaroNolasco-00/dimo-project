import { Injectable, signal, computed, effect } from '@angular/core';
import { ToolId, CanvasPoint } from '../models/tool.types';
import { StudioHistoryService } from './studio-history.service';

@Injectable({ providedIn: 'root' })
export class StudioStateService {
  constructor(private history: StudioHistoryService) {
    effect(() => {
      const entry = this.history.current();
      if (entry) {
        this._currentBlob.set(entry.blob);
      }
    });
  }

  private _currentBlob = signal<Blob | null>(null);
  private _filename = signal<string>('');
  private _activeToolId = signal<ToolId | null>(null);
  private _busy = signal<boolean>(false);
  private _progress = signal<number | null>(null);
  private _pendingMask = signal<Blob | null>(null);
  private _canvasClick = signal<CanvasPoint | null>(null);
  private _maskMode = signal<boolean>(false);

  readonly currentBlob = this._currentBlob.asReadonly();
  readonly filename = this._filename.asReadonly();
  readonly activeToolId = this._activeToolId.asReadonly();
  readonly busy = this._busy.asReadonly();
  readonly progress = this._progress.asReadonly();
  readonly pendingMask = this._pendingMask.asReadonly();
  readonly canvasClick = this._canvasClick.asReadonly();
  readonly maskMode = this._maskMode.asReadonly();

  readonly hasImage = computed(() => this._currentBlob() !== null);
  readonly currentUrl = computed(() => {
    const entry = this.history.current();
    return entry ? entry.objectUrl : null;
  });

  loadImage(file: File): void {
    this.history.clear();
    this._filename.set(file.name);
    this._pendingMask.set(null);
    this._activeToolId.set(null);

    const blob = new Blob([file], { type: file.type });
    this._currentBlob.set(blob);
    this.history.push(blob, 'original', 'Original');
  }

  setTool(id: ToolId | null): void {
    this._activeToolId.set(id);
    this._pendingMask.set(null);
    this._canvasClick.set(null);
    this._maskMode.set(false);
  }

  setMaskMode(active: boolean): void {
    this._maskMode.set(active);
  }

  setBusy(busy: boolean, progress: number | null = null): void {
    this._busy.set(busy);
    this._progress.set(progress);
  }

  setMask(mask: Blob | null): void {
    this._pendingMask.set(mask);
  }

  setCanvasClick(point: CanvasPoint): void {
    this._canvasClick.set(point);
  }

  applyResult(blob: Blob, toolId: ToolId, label: string): void {
    this.history.push(blob, toolId, label);
    this._pendingMask.set(null);
    this._canvasClick.set(null);
    this._busy.set(false);
    this._progress.set(null);
  }

  reset(): void {
    const stack = this.history.stack();
    if (stack.length > 0) {
      this.history.jumpTo(0);
    }
  }

  download(): void {
    const blob = this._currentBlob();
    if (!blob) return;

    const name = this._filename() || 'image';
    const base = name.replace(/\.[^.]+$/, '');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studio-${base}-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
