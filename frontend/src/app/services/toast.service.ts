import { Injectable, signal, ComponentRef, ApplicationRef, Injector, Type } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ToastConfig {
  id: number;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  actionLabel?: string;
  action?: () => void;
  retryable?: boolean;
  retryAction?: () => Promise<void>;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private _toasts = signal<ToastConfig[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(config: Omit<ToastConfig, 'id'>) {
    const id = Date.now();
    const toastWithId: ToastConfig = { ...config, id };
    this._toasts.update(t => [...t, toastWithId]);

    // Auto-dismiss after duration (default 5s)
    const duration = config.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  success(message: string, duration?: number) {
    return this.show({ message, type: 'success', duration });
  }

  error(message: string, retryable = false, retryAction?: () => Promise<void>) {
    return this.show({ 
      message, 
      type: 'error', 
      duration: 0, // Don't auto-dismiss errors
      retryable,
      retryAction 
    });
  }

  warning(message: string, duration?: number) {
    return this.show({ message, type: 'warning', duration });
  }

  info(message: string, duration?: number) {
    return this.show({ message, type: 'info', duration });
  }

  dismiss(id: number) {
    this._toasts.update(t => t.filter(toast => toast.id !== id));
  }

  clear() {
    this._toasts.set([]);
  }
}
