import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [NgClass],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss',
})
export class ModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() cssClass = '';
  @Input() closeOnBackdrop = true;
  @Output() closed = new EventEmitter<void>();

  onBackdrop() {
    if (this.closeOnBackdrop) this.closed.emit();
  }
}
