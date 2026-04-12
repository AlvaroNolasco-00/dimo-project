import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, ToastConfig } from '../../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss'
})
export class ToastContainerComponent {
  private toastService = inject(ToastService);
  readonly toasts = this.toastService.toasts;

  dismiss(id: number) {
    this.toastService.dismiss(id);
  }

  async retry(toast: ToastConfig) {
    if (toast.retryAction) {
      try {
        await toast.retryAction();
        this.toastService.dismiss(toast.id);
      } catch (err) {
        console.error('Retry failed:', err);
      }
    }
  }
}
