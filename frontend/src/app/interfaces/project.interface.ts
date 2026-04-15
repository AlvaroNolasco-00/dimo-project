export type ProjectRole = 'viewer' | 'editor' | 'manager' | 'owner';

export const ROLE_HIERARCHY: ProjectRole[] = ['viewer', 'editor', 'manager', 'owner'];

export function roleLevel(role: ProjectRole | null | undefined): number {
    if (!role) return -1;
    return ROLE_HIERARCHY.indexOf(role);
}

export interface Project {
    id: number;
    name: string;
    description?: string;
    created_at?: string;
    /** Role of the current user in this project — present in /auth/me response */
    role?: ProjectRole;
}

export interface ProjectCreate {
    name: string;
    description?: string;
}

export interface ProjectUpdate {
    name?: string;
    description?: string;
}

export interface ProjectUser {
    id: number;
    email: string;
    full_name: string;
    is_approved: boolean;
    is_admin: boolean;
    role: ProjectRole;
}

export interface AssignUserToProject {
    role: ProjectRole;
}

export interface UpdateProjectRole {
    role: ProjectRole;
}
