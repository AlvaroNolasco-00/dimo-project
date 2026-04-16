import { Component, computed, signal, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TOOL_HELP_CONTENT } from './tool-help-content';

@Component({
  selector: 'app-tool-help',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tool-help.component.html',
  styleUrl: './tool-help.component.scss'
})
export class ToolHelpComponent {
  toolId = input.required<string>();

  isOpen = signal(false);

  content = computed(() => TOOL_HELP_CONTENT[this.toolId()]);

  toggle(event: Event) {
    event.stopPropagation();
    this.isOpen.update(v => !v);
  }

  close() {
    this.isOpen.set(false);
  }
}
