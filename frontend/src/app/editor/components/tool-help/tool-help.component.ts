import { Component, computed, signal, input, HostListener, ElementRef, inject } from '@angular/core';
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
  private elementRef = inject(ElementRef);

  toolId = input.required<string>();

  isOpen = signal(false);

  content = computed(() => TOOL_HELP_CONTENT[this.toolId()]);

  toggle(event: Event) {
    event.stopPropagation();
    this.isOpen.update(v => !v);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (this.isOpen() && !this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }
}
