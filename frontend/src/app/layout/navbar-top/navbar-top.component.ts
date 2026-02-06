import { Component, signal, inject, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LayoutService } from '../../services/layout.service';


interface NavMenuItem {
  label: string;
  icon: string;
  route: string;
  roles?: string[];
  children?: NavMenuItem[];
}

@Component({
  selector: 'app-navbar-top',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar-top.component.html',
  styleUrl: './navbar-top.component.scss'
})
export class NavbarTopComponent implements AfterViewInit, OnDestroy {
  authService = inject(AuthService);
  layoutService = inject(LayoutService);

  isProjectDropdownOpen = signal(false);
  activeDropdown = signal<string | null>(null);

  @ViewChild('projectMenuContainer') projectMenuContainer?: ElementRef;
  private clickListener?: (event: MouseEvent) => void;
  private isToggling = false;

  menuItems: NavMenuItem[] = [
    {
      label: 'Utilidades',
      icon: 'ph-toolbox',
      route: '/utilidades',
      children: [
        { label: 'Remove BG', route: '/utilidades/remove-bg', icon: 'ph-eraser' },
        { label: 'Remove Objects', route: '/utilidades/remove-objects', icon: 'ph-magic-wand' },
        { label: 'Enhance', route: '/utilidades/enhance', icon: 'ph-sparkle' },
        { label: 'Upscale', route: '/utilidades/upscale', icon: 'ph-arrows-out-simple' },
        { label: 'Halftone', route: '/utilidades/halftone', icon: 'ph-dots-nine' },
        { label: 'Contour Clip', route: '/utilidades/contour-clip', icon: 'ph-scissors' },
        { label: 'Crop', route: '/utilidades/crop', icon: 'ph-crop' },
        { label: 'Watermark', route: '/utilidades/watermark', icon: 'ph-stamp' }
      ]
    },
    {
      label: 'Usuarios',
      icon: 'ph-users',
      route: '/usuarios',
      roles: ['admin'],
      children: [
        { label: 'Listado', route: '/usuarios/listado', icon: 'ph-list' },
        { label: 'Permisos', route: '/usuarios/permisos', icon: 'ph-lock-key' },
        { label: 'Creación', route: '/usuarios/creacion', icon: 'ph-plus-circle' }
      ]
    },
    {
      label: 'Gestión',
      icon: 'ph-folder-open',
      route: '/gestion',
      children: [
        { label: 'Pedidos', route: '/gestion/pedidos', icon: 'ph-shopping-cart' },
        { label: 'Clientes', route: '/gestion/clientes', icon: 'ph-users-three' },
        { label: 'Finanzas', route: '/gestion/finanzas', icon: 'ph-currency-dollar' },
        { label: 'Proyectos', route: '/gestion/proyectos', icon: 'ph-folder-notch', roles: ['admin'] }
      ]
    }
  ];

  ngAfterViewInit() {
    // Close dropdown when clicking outside
    this.clickListener = (event: MouseEvent) => {
      // Don't close if we're in the middle of toggling
      if (this.isToggling) {
        return;
      }

      const target = event.target as Node;

      if (this.isProjectDropdownOpen() && this.projectMenuContainer) {
        if (!this.projectMenuContainer.nativeElement.contains(target)) {
          this.closeProjectDropdown();
        }
      }
    };
    document.addEventListener('click', this.clickListener);
  }

  ngOnDestroy() {
    if (this.clickListener) {
      document.removeEventListener('click', this.clickListener);
    }
  }

  toggleSidebar() {
    this.layoutService.toggleSidebar();
  }

  toggleProjectDropdown(event: Event) {
    if ((this.authService.user()?.projects || []).length <= 1) {
      return;
    }
    event.stopPropagation();
    this.isToggling = true;
    const newValue = !this.isProjectDropdownOpen();
    this.isProjectDropdownOpen.set(newValue);
    setTimeout(() => { this.isToggling = false; }, 100);
  }

  closeProjectDropdown() {
    this.isProjectDropdownOpen.set(false);
  }

  selectProject(project: any) {
    this.authService.selectProject(project);
    this.closeProjectDropdown();
  }

  setActiveDropdown(label: string | null) {
    this.activeDropdown.set(label);
  }
}

