import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-gestion-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './gestion-sidebar.component.html',
  styleUrl: './gestion-sidebar.component.css'
})
export class GestionSidebarComponent {
  isCollapsed = signal(false);

  toggle() {
    this.isCollapsed.set(!this.isCollapsed());
  }
}

