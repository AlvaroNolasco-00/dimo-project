import { Component, Input, Output, EventEmitter, inject, signal, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

export interface SidebarItem {
    label: string;
    icon: string;
    route: string;
    isAdminOnly?: boolean;
}

@Component({
    selector: 'app-shared-sidebar',
    standalone: true,
    imports: [CommonModule, RouterLink, RouterLinkActive],
    templateUrl: './shared-sidebar.component.html',
    styleUrls: ['./shared-sidebar.component.scss']
})
export class SharedSidebarComponent implements AfterViewInit, OnDestroy {
    @Input() menuItems: SidebarItem[] = [];
    @Input() logoText: string = 'logip';
    @Input() showUpgradeCard: boolean = true;
    @Input() isCollapsed: boolean = false;

    @Output() toggleCollapse = new EventEmitter<void>();

    authService = inject(AuthService);
    isDropdownOpen = signal(false);
    showPlansModal = signal(false);

    plans = [
        {
            name: 'Básico',
            price: 'Gratis',
            features: ['1 Proyecto', 'Analíticas Básicas', 'Soporte Comunitario'],
            current: true
        },
        {
            name: 'Pro',
            price: '$29/mo',
            features: ['Proyectos Ilimitados', 'Analíticas Avanzadas', 'Soporte Prioritario', 'Marca Personalizada'],
            current: false,
            recommended: true
        },
        {
            name: 'Empresarial',
            price: 'A medida',
            features: ['SSO', 'Logs de Auditoría', 'Gerente Dedicado', 'SLA'],
            current: false
        }
    ];

    @ViewChild('userMenuContainer') userMenuContainer?: ElementRef;
    private clickListener?: (event: MouseEvent) => void;
    private isToggling = false;

    onToggle() {
        this.toggleCollapse.emit();
    }

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
        };
        document.addEventListener('click', this.clickListener);
    }

    ngOnDestroy() {
        if (this.clickListener) {
            document.removeEventListener('click', this.clickListener);
        }
    }

    toggleDropdown(event: Event) {
        if (this.isCollapsed) return; // Don't toggle if collapsed (or handle differently)
        event.stopPropagation();
        this.isToggling = true;
        const newValue = !this.isDropdownOpen();
        this.isDropdownOpen.set(newValue);
        setTimeout(() => { this.isToggling = false; }, 100);
    }

    closeDropdown() {
        this.isDropdownOpen.set(false);
    }

    openPlans(event: Event) {
        event.stopPropagation();
        this.showPlansModal.set(true);
        this.closeDropdown();
    }

    closePlans() {
        this.showPlansModal.set(false);
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

