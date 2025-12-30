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

    router.navigate(['/factory']);
    return false;
};
