import { Component, signal, inject, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

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
  isProjectDropdownOpen = signal(false);
  @ViewChild('userMenuContainer') userMenuContainer?: ElementRef;
  @ViewChild('projectMenuContainer') projectMenuContainer?: ElementRef;
  private clickListener?: (event: MouseEvent) => void;
  private isToggling = false;

  ngAfterViewInit() {
    // Close dropdown when clicking outside
    this.clickListener = (event: MouseEvent) => {
      // Don't close if we're in the middle of toggling
      if (this.isToggling) {
        return;
      }

      const target = event.target as Node;

      if (this.isDropdownOpen() && this.userMenuContainer) {
        if (!this.userMenuContainer.nativeElement.contains(target)) {
          this.closeDropdown();
        }
      }

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

  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.isToggling = true;
    this.closeProjectDropdown(); // close other
    const newValue = !this.isDropdownOpen();
    this.isDropdownOpen.set(newValue);
    setTimeout(() => { this.isToggling = false; }, 100);
  }

  toggleProjectDropdown(event: Event) {
    event.stopPropagation();
    this.isToggling = true;
    this.closeDropdown(); // close other
    const newValue = !this.isProjectDropdownOpen();
    this.isProjectDropdownOpen.set(newValue);
    setTimeout(() => { this.isToggling = false; }, 100);
  }

  closeDropdown() {
    this.isDropdownOpen.set(false);
  }

  closeProjectDropdown() {
    this.isProjectDropdownOpen.set(false);
  }

  selectProject(project: any) {
    this.authService.selectProject(project);
    this.closeProjectDropdown();
  }

  logout() {
    this.closeDropdown();
    this.authService.logout();
  }

  getUserDisplayName(): string {
    const user = this.authService.user();
    if (!user) return 'Usuario';

    if (user.full_name) {
      return user.full_name.split(' ')[0];
    }

    return user.email || 'Usuario';
  }

  getUserAvatarUrl(): string | null {
    const user = this.authService.user();
    if (!user?.avatar_url) return null;

    if (user.avatar_url.startsWith('http')) {
      return user.avatar_url;
    }
    return `${environment.apiUrl}${user.avatar_url}`;
  }
}
