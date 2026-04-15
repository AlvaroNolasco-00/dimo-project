import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProjectRole } from '../interfaces/project.interface';

export const authGuard = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isAuthenticated()) return true;
    router.navigate(['/auth/login']);
    return false;
};

export const approvedGuard = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isAuthenticated() && authService.isApproved()) return true;

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

    if (authService.isAdmin()) return true;
    router.navigate(['/utilidades']);
    return false;
};

export const projectGuard = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isAdmin()) return true;

    const user = authService.user();
    if (user?.projects && user.projects.length > 0) return true;

    router.navigate(['/auth/no-project']);
    return false;
};

/**
 * Factory that creates a guard requiring the current user to have at least
 * `minRole` in the currently selected project.
 */
export const projectRoleGuard = (minRole: ProjectRole) => () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.isAuthenticated()) {
        router.navigate(['/auth/login']);
        return false;
    }
    if (!authService.isApproved()) {
        router.navigate(['/auth/pending-approval']);
        return false;
    }
    if (authService.hasProjectRole(minRole)) return true;

    router.navigate(['/utilidades']);
    return false;
};

export const editorGuard  = projectRoleGuard('editor');
export const managerGuard = projectRoleGuard('manager');
export const ownerGuard   = projectRoleGuard('owner');
