import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-usuarios-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './usuarios-sidebar.component.html',
  styleUrl: './usuarios-sidebar.component.css'
})
export class UsuariosSidebarComponent {
  isCollapsed = signal(false);
  isAdmin = false;

  constructor(private authService: AuthService) {
    this.isAdmin = this.authService.isAdmin();
  }

  toggle() {
    this.isCollapsed.set(!this.isCollapsed());
  }
}

