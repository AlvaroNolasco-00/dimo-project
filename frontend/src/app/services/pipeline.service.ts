import { Injectable, signal } from '@angular/core';

export type OperationType = 'enhance' | 'upscale' | 'remove-bg' | 'remove-objects' | 'halftone' | 'contour-clip' | 'crop';

export interface Operation {
  id: string;
  type: OperationType;
  params: Record<string, any>;
  timestamp: number;
  inputBlob?: Blob;
  inputUrl?: string;
  inputMode: 'original' | 'chained';
}

export interface ExecutionResult {
  stepIndex: number;
  operationId: string;
  label: string;
  outputUrl: string;
  outputBlob: Blob;
  inputUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class PipelineService {
  operationQueue = signal<Operation[]>([]);
  isPipelineMode = signal(false);

  // Image state — persists across mode/route changes
  hasFile = signal(false);
  currentImageBlob = signal<Blob | null>(null);
  currentImageSource = signal<string | null>(null);
  processedImageSource = signal<string | null>(null);
  pipelineResults = signal<ExecutionResult[]>([]);
  selectedResultIndex = signal<number>(-1);

  private managedUrls = new Set<string>();

  trackUrl(url: string) {
    this.managedUrls.add(url);
  }

  revokeUrl(url: string | null) {
    if (url && this.managedUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.managedUrls.delete(url);
    }
  }

  revokeAllUrls() {
    this.managedUrls.forEach(url => URL.revokeObjectURL(url));
    this.managedUrls.clear();
  }

  togglePipelineMode() {
    this.isPipelineMode.update(v => !v);
    if (!this.isPipelineMode()) {
      this.operationQueue.set([]);
    }
  }

  addOperation(operation: Operation) {
    this.operationQueue.update(queue => [...queue, operation]);
  }

  removeOperation(id: string) {
    this.operationQueue.update(queue => queue.filter(op => op.id !== id));
  }

  moveOperation(fromIndex: number, toIndex: number) {
    this.operationQueue.update(queue => {
      const newQueue = [...queue];
      const [moved] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, moved);
      // Recalculate inputMode: first op is always 'original', rest inherit their existing mode
      return newQueue.map((op, i) =>
        i === 0 ? { ...op, inputMode: 'original' as const } : op
      );
    });
  }

  clearQueue() {
    this.operationQueue.set([]);
  }

  // Sidebar UI state
  sidebarCollapsed = signal(false);
}
