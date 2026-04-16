import { Component, Input } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [NgClass],
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.scss',
})
export class StatCardComponent {
  /** Class applied to the outer .stat-card div (e.g. 'primary', 'info') */
  @Input() cardClass = '';
  /** Class applied to the .stat-icon div (e.g. 'total', 'success', 'failed') */
  @Input() iconClass = '';
  /** Phosphor icon class (e.g. 'ph-ticket') */
  @Input() icon = '';
  @Input() label = '';
  @Input() value: string | number = '';
}
