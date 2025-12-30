import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-usuarios-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './usuarios-sidebar.component.html',
  styleUrl: './usuarios-sidebar.component.css'
})
export class UsuariosSidebarComponent {
  isCollapsed = signal(false);

  toggle() {
    this.isCollapsed.set(!this.isCollapsed());
  }
}

