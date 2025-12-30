import { Component, signal, inject, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-navbar-top',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar-top.component.html',
  styleUrl: './navbar-top.component.scss'
})
export class NavbarTopComponent implements AfterViewInit, OnDestroy {
  authService = inject(AuthService);
  isDropdownOpen = signal(false);
  @ViewChild('userMenuContainer') userMenuContainer?: ElementRef;
  private clickListener?: (event: MouseEvent) => void;
  private isToggling = false;

  ngAfterViewInit() {
    // Close dropdown when clicking outside
    this.clickListener = (event: MouseEvent) => {
      // Don't close if we're in the middle of toggling
      if (this.isToggling) {
        return;
      }

      if (this.isDropdownOpen() && this.userMenuContainer) {
        const target = event.target as Node;
        if (!this.userMenuContainer.nativeElement.contains(target)) {
          this.closeDropdown();
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

  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.isToggling = true;
    const newValue = !this.isDropdownOpen();
    this.isDropdownOpen.set(newValue);

    // Reset flag after a short delay to allow the click event to complete
    setTimeout(() => {
      this.isToggling = false;
    }, 100);
  }

  closeDropdown() {
    this.isDropdownOpen.set(false);
  }

  logout() {
    this.closeDropdown();
    this.authService.logout();
  }

  getUserDisplayName(): string {
    const user = this.authService.user();
    if (!user) return 'Usuario';
    return user.email || 'Usuario';
  }
}

