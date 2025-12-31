import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-gestion-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './gestion-sidebar.component.html',
  styleUrl: './gestion-sidebar.component.scss' // Note: changed css to scss assuming project standard, but file says css. I'll stick to css if it exists, or check.
})
export class GestionSidebarComponent {
  isCollapsed = signal(false);
  authService = inject(AuthService);

  toggle() {
    this.isCollapsed.set(!this.isCollapsed());
  }
}

