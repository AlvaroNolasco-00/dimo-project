
import { Component, Input, Output, EventEmitter, inject, OnInit, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Project, ProjectUpdate } from '../../../../interfaces/project.interface';
import { ApiService } from '../../../../services/api.service';
import { ProjectService } from '../../../../services/project.service';

@Component({
    selector: 'app-project-edit',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './project-edit.component.html',
    styleUrls: ['./project-edit.component.scss']
})
export class ProjectEditComponent implements OnInit, OnChanges {
    @Input() project: Project | null = null;
    @Output() close = new EventEmitter<void>();
    @Output() saved = new EventEmitter<Project>();

    private apiService = inject(ApiService);
    private projectService = inject(ProjectService);

    editProjectName = '';
    editProjectDesc = '';

    // State Configuration
    allOrderStates: any[] = [];
    projectStatesConfig: { [key: number]: boolean } = {};
    isLoadingStates = false;

    ngOnInit() {
        this.loadAllOrderStates();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['project'] && this.project) {
            this.initializeForm();
        }
    }

    initializeForm() {
        if (!this.project) return;
        this.editProjectName = this.project.name;
        this.editProjectDesc = this.project.description || '';

        // Reset config
        this.projectStatesConfig = {};

        this.loadProjectStates();
    }

    loadAllOrderStates() {
        this.apiService.getAllOrderStates().subscribe(states => {
            this.allOrderStates = states;
            // If we already have a project, we might need to re-apply logic if needed, 
            // but typically project states load after this or in parallel. 
            // The display depends on allOrderStates loop.
        });
    }

    loadProjectStates() {
        if (!this.project) return;
        this.isLoadingStates = true;
        this.apiService.getProjectOrderStates(this.project.id).subscribe({
            next: (activeStates) => {
                activeStates.forEach(s => {
                    this.projectStatesConfig[s.id] = true;
                });
                this.isLoadingStates = false;
            },
            error: () => this.isLoadingStates = false
        });
    }

    toggleState(stateId: number) {
        this.projectStatesConfig[stateId] = !this.projectStatesConfig[stateId];
    }

    onSave() {
        if (!this.project || !this.editProjectName) return;

        const payload: ProjectUpdate = {
            name: this.editProjectName,
            description: this.editProjectDesc
        };

        this.projectService.updateProject(this.project.id, payload).subscribe({
            next: (updated) => {
                this.saveProjectStates(updated.id);
                this.saved.emit(updated);
            },
            error: (e) => alert('Error updating project: ' + e.error?.detail)
        });
    }

    saveProjectStates(projectId: number) {
        const activeIds = this.allOrderStates
            .filter(s => this.projectStatesConfig[s.id])
            .map(s => s.id);

        this.apiService.updateProjectOrderStates(projectId, activeIds).subscribe({
            next: () => console.log('States updated'),
            error: (e) => console.error('Error updating states', e)
        });
    }

    onCancel() {
        this.close.emit();
    }
}
