import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../services/project.service';
import { Project, ProjectCreate, ProjectUser } from '../../interfaces/project.interface';
import { UserService } from '../../services/user.service';
import { ProjectEditComponent } from './components/project-edit/project-edit.component';

@Component({
    selector: 'app-proyectos',
    standalone: true,
    imports: [CommonModule, FormsModule, ProjectEditComponent],
    templateUrl: './proyectos.component.html',
    styleUrl: './proyectos.component.scss'
})
export class ProyectosComponent implements OnInit {
    projectService = inject(ProjectService);
    userService = inject(UserService);

    projects = signal<Project[]>([]);
    isLoading = signal(false);

    // Modal states
    showCreateModal = signal(false);
    showEditModal = signal(false);
    showUsersModal = signal(false);

    // Form data
    newProjectName = '';
    newProjectDesc = '';

    editingProject: Project | null = null;

    selectedProjectForUsers: Project | null = null;
    projectUsers = signal<ProjectUser[]>([]);
    allUsers = signal<any[]>([]);
    searchTerm = '';

    ngOnInit() {
        this.loadProjects();
    }

    loadProjects() {
        this.isLoading.set(true);
        this.projectService.getProjects().subscribe({
            next: (data) => {
                this.projects.set(data);
                this.isLoading.set(false);
            },
            error: (e) => {
                console.error(e);
                this.isLoading.set(false);
            }
        });
    }

    // --- Create ---
    openCreateModal() {
        this.newProjectName = '';
        this.newProjectDesc = '';
        this.showCreateModal.set(true);
    }

    closeCreateModal() {
        this.showCreateModal.set(false);
    }

    createProject() {
        if (!this.newProjectName) return;

        const payload: ProjectCreate = {
            name: this.newProjectName,
            description: this.newProjectDesc
        };

        this.projectService.createProject(payload).subscribe({
            next: (p) => {
                this.projects.update(list => [...list, p]);
                this.closeCreateModal();
            },
            error: (e) => alert('Error creating project: ' + e.error?.detail)
        });
    }

    // --- Edit ---
    openEditModal(p: Project) {
        this.editingProject = p;
        this.showEditModal.set(true);
    }

    closeEditModal() {
        this.showEditModal.set(false);
        this.editingProject = null;
    }

    onProjectUpdated(updated: Project) {
        this.projects.update(list => list.map(p => p.id === updated.id ? updated : p));
        this.closeEditModal();
    }

    // --- Delete ---
    deleteProject(p: Project) {
        if (!confirm(`¿Estás seguro de eliminar el proyecto "${p.name}"?`)) return;

        this.projectService.deleteProject(p.id).subscribe({
            next: () => {
                this.projects.update(list => list.filter(item => item.id !== p.id));
            },
            error: (e) => alert('Error deleting project: ' + e.error?.detail)
        });
    }

    // --- Users ---
    openUsersModal(p: Project) {
        this.selectedProjectForUsers = p;
        this.showUsersModal.set(true);
        this.loadProjectUsers(p.id);
        this.loadAllUsers();
    }

    closeUsersModal() {
        this.showUsersModal.set(false);
        this.selectedProjectForUsers = null;
        this.projectUsers.set([]);
    }

    loadProjectUsers(id: number) {
        this.projectService.getProjectUsers(id).subscribe(users => {
            this.projectUsers.set(users);
        });
    }

    loadAllUsers() {
        // Fetch a large number of users for the dropdown/list
        this.userService.getUsers(1, 1000).subscribe(res => {
            if (res && (res as any).items) {
                this.allUsers.set((res as any).items);
            } else if (Array.isArray(res)) {
                // Fallback if structure is different
                this.allUsers.set(res);
            }
        });
    }

    assignUser(userId: number) {
        if (!this.selectedProjectForUsers) return;
        this.projectService.assignUser(this.selectedProjectForUsers.id, userId).subscribe({
            next: () => {
                this.loadProjectUsers(this.selectedProjectForUsers!.id);
            },
            error: (e) => alert('Error assigning user: ' + e.error?.detail)
        });
    }

    removeUser(userId: number) {
        if (!this.selectedProjectForUsers) return;
        this.projectService.removeUser(this.selectedProjectForUsers.id, userId).subscribe({
            next: () => {
                this.loadProjectUsers(this.selectedProjectForUsers!.id);
            },
            error: (e) => alert('Error removing user: ' + e.error?.detail)
        });
    }

    isAssigned(userId: number): boolean {
        return this.projectUsers().some(u => u.id === userId);
    }
}
