export interface Project {
    id: number;
    name: string;
    description?: string;
    created_at?: string;
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
}
