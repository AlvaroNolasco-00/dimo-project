import { Component, Input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-quantity-control',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './quantity-control.component.html',
  styleUrl: './quantity-control.component.scss',
})
export class QuantityControlComponent {
  value = model<number>(1);
  @Input() min = 1;

  increment() {
    this.value.update(v => v + 1);
  }

  decrement() {
    if (this.value() > this.min) this.value.update(v => v - 1);
  }

  onInput(event: Event) {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && val >= this.min) this.value.set(val);
  }
}
