import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isAuthenticated()) {
        return true;
    }

    router.navigate(['/auth/login']);
    return false;
};

export const approvedGuard = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isAuthenticated() && authService.isApproved()) {
        return true;
    }

    if (authService.isAuthenticated()) {
        router.navigate(['/auth/pending-approval']);
        return false;
    }

    router.navigate(['/auth/login']);
    return false;
};

export const adminGuard = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isAdmin()) {
        return true;
    }

    router.navigate(['/utilidades']);
    return false;
};
export const projectGuard = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // Allow if admin
    if (authService.isAdmin()) {
        return true;
    }

    // Check if user has projects
    const user = authService.user();
    if (user && user.projects && user.projects.length > 0) {
        return true;
    }

    // Otherwise redirect
    router.navigate(['/auth/no-project']);
    return false;
};
