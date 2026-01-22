import { Component, signal, ChangeDetectionStrategy, OnInit, inject, PLATFORM_ID, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LayoutService } from '../services/layout.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  layoutService = inject(LayoutService);
  isCollapsed = this.layoutService.isSidebarCollapsed;

  // Computed to combine local collapsed state with mobile open state if needed
  // For mobile, we primarily check layoutService.sidebarOpen
  isMobileOpen = this.layoutService.sidebarOpen;

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      if (window.innerWidth <= 768) {
        this.layoutService.setSidebarCollapsed(true);
      }
    }
  }

  toggle() {
    this.layoutService.toggleSidebarCollapsed();
  }
}
