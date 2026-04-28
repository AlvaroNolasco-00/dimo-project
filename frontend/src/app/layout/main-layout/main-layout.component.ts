import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { SharedSidebarComponent, SidebarItem } from '../../shared/components/sidebar/shared-sidebar.component';
import { NavbarTopComponent } from '../navbar-top/navbar-top.component';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { LayoutService } from '../../services/layout.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, SharedSidebarComponent, NavbarTopComponent, CommonModule],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MainLayoutComponent implements OnInit {
  private router = inject(Router);
  layoutService = inject(LayoutService);
  isSidebarCollapsed = this.layoutService.isSidebarCollapsed;
  private urlSignal = signal('');

  private utilidadesItems: SidebarItem[] = [
    { label: 'Quitar Fondo', icon: 'ph-eraser', route: '/utilidades/remove-bg' },
    { label: 'Borrar Objetos', icon: 'ph-magic-wand', route: '/utilidades/remove-objects' },
    { label: 'Mejorar Calidad', icon: 'ph-sparkle', route: '/utilidades/enhance' },
    { label: 'Upscaling', icon: 'ph-arrows-out-simple', route: '/utilidades/upscale' },
    { label: 'Semitonos', icon: 'ph-grid-nine', route: '/utilidades/halftone' },
    { label: 'Recorte de Contorno', icon: 'ph-scissors', route: '/utilidades/contour-clip' },
    { label: 'Recorte de Foto', icon: 'ph-crop', route: '/utilidades/crop' },
    { label: 'Marca de Agua', icon: 'ph-stamp', route: '/utilidades/watermark' }
  ];

  private gestionItems: SidebarItem[] = [
    { label: 'Pedidos', icon: 'ph-shopping-cart', route: '/gestion/pedidos' },
    { label: 'Clientes', icon: 'ph-users', route: '/gestion/clientes' },
    { label: 'Catálogo', icon: 'ph-storefront', route: '/gestion/catalogo' },
    { label: 'Finanzas', icon: 'ph-currency-dollar', route: '/gestion/finanzas' },
    { label: 'Proyectos', icon: 'ph-briefcase', route: '/gestion/proyectos', isAdminOnly: true },
    { label: 'Bitácora', icon: 'ph-scroll', route: '/gestion/bitacora', isAdminOnly: true }
  ];

  private usuariosItems: SidebarItem[] = [
    { label: 'Listado', icon: 'ph-list-bullets', route: '/usuarios/listado' },
    { label: 'Permisos', icon: 'ph-key', route: '/usuarios/permisos' },
    { label: 'Creación', icon: 'ph-user-plus', route: '/usuarios/creacion', isAdminOnly: true }
  ];

  ngOnInit() {
    this.urlSignal.set(this.router.url);
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.urlSignal.set(event.url);
      });
  }

  showSidebar = computed(() => {
    const url = this.urlSignal();
    return url?.includes('/utilidades') || url?.includes('/gestion') || url?.includes('/usuarios');
  });

  isStudio = computed(() => {
    const url = this.urlSignal();
    return url?.includes('/studio') || url?.includes('/lienzo');
  });

  currentMenuItems = computed(() => {
    const url = this.urlSignal();
    if (url?.includes('/utilidades')) return this.utilidadesItems;
    if (url?.includes('/gestion')) return this.gestionItems;
    if (url?.includes('/usuarios')) return this.usuariosItems;
    return [];
  });

  logoText = computed(() => {
    const url = this.urlSignal();
    if (url?.includes('/utilidades')) return 'photoedit';
    if (url?.includes('/studio')) return 'studio';
    if (url?.includes('/lienzo')) return 'lienzo';
    if (url?.includes('/gestion')) return 'logip';
    if (url?.includes('/usuarios')) return 'admin';
    return 'logip';
  });

  toggleSidebar() {
    this.layoutService.toggleSidebarCollapsed();
  }
}
