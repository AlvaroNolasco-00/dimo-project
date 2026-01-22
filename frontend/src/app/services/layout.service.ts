import { Injectable, signal } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class LayoutService {
    // Signal to track if the sidebar is open on mobile
    sidebarOpen = signal(false);

    // Toggle the sidebar state
    toggleSidebar() {
        this.sidebarOpen.update(value => !value);
    }

    // Explicitly close the sidebar (e.g. when clicking backdrop or navigating)
    closeSidebar() {
        this.sidebarOpen.set(false);
    }

    openSidebar() {
        this.sidebarOpen.set(true);
    }

    // Signal to track if the sidebar is collapsed (desktop)
    isSidebarCollapsed = signal(false);

    toggleSidebarCollapsed() {
        this.isSidebarCollapsed.update(value => !value);
    }

    setSidebarCollapsed(value: boolean) {
        this.isSidebarCollapsed.set(value);
    }
}
