import { Project } from './project.interface';

export interface User {
    id: number;
    email: string;
    full_name?: string;
    is_approved: boolean;
    is_admin: boolean;
    avatar_url?: string;
    projects?: Project[];
}
