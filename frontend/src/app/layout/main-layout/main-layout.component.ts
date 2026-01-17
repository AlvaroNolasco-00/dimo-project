import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { SidebarComponent } from '../../sidebar/sidebar.component';
import { NavbarTopComponent } from '../navbar-top/navbar-top.component';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, NavbarTopComponent, CommonModule],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MainLayoutComponent implements OnInit {
  private router = inject(Router);
  private urlSignal = signal('');

  ngOnInit() {
    // Initialize with current URL immediately
    this.urlSignal.set(this.router.url);

    // Update signal when navigation ends
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.urlSignal.set(event.url);
      });
  }

  // Computed that checks if we're on utilidades route
  showSidebar = computed(() => {
    const url = this.urlSignal();
    // Fallback to router.url if signal is empty (shouldn't happen, but safety check)
    const currentUrl = url || this.router.url;
    return currentUrl?.startsWith('/utilidades') ?? false;
  });
}
