import { Injectable, signal } from '@angular/core';

export type OperationType = 'enhance' | 'upscale' | 'remove-bg' | 'remove-objects' | 'halftone' | 'contour-clip' | 'crop';

export interface Operation {
  id: string;
  type: OperationType;
  params: Record<string, any>;
  timestamp: number;
  inputBlob?: Blob;
  inputUrl?: string;
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
      return newQueue;
    });
  }

  clearQueue() {
    this.operationQueue.set([]);
  }
}
