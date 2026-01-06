
import { Component, Output, EventEmitter, inject, OnInit, signal, effect, input, untracked, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
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
    styleUrls: ['./project-edit.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectEditComponent implements OnInit {
    project = input<Project | null>(null);
    @Output() close = new EventEmitter<void>();
    @Output() saved = new EventEmitter<Project>();

    private apiService = inject(ApiService);
    private projectService = inject(ProjectService);
    private cdr = inject(ChangeDetectorRef);

    editProjectName = '';
    editProjectDesc = '';

    // State Configuration
    allOrderStates: any[] = [];
    projectStatesConfig: { [key: number]: boolean } = {};
    isLoadingStates = false;

    constructor() {
        effect(() => {
            const currentProject = this.project();
            if (currentProject) {
                untracked(() => this.initializeForm());
            }
        });
    }

    ngOnInit() {
        this.loadAllOrderStates();
    }

    initializeForm() {
        const p = this.project();
        if (!p) return;
        this.editProjectName = p.name;
        this.editProjectDesc = p.description || '';

        // Reset config
        this.projectStatesConfig = {};

        this.loadProjectStates();
        this.cdr.markForCheck();
    }

    loadAllOrderStates() {
        this.apiService.getAllOrderStates().subscribe(states => {
            this.allOrderStates = states;
            this.cdr.markForCheck();
        });
    }

    loadProjectStates() {
        const p = this.project();
        if (!p) return;
        this.isLoadingStates = true;
        this.cdr.markForCheck();

        this.apiService.getProjectOrderStates(p.id).subscribe({
            next: (activeStates) => {
                activeStates.forEach(s => {
                    this.projectStatesConfig[s.id] = true;
                });
                this.isLoadingStates = false;
                this.cdr.markForCheck();
            },
            error: () => {
                this.isLoadingStates = false;
                this.cdr.markForCheck();
            }
        });
    }

    toggleState(stateId: number) {
        this.projectStatesConfig[stateId] = !this.projectStatesConfig[stateId];
        // Note: Change detection is triggered automatically by the (change) event in HTML
    }

    onSave() {
        const p = this.project();
        if (!p || !this.editProjectName) return;

        const payload: ProjectUpdate = {
            name: this.editProjectName,
            description: this.editProjectDesc
        };

        this.projectService.updateProject(p.id, payload).subscribe({
            next: (updated) => {
                this.saveProjectStates(updated.id);
                this.saved.emit(updated);
                this.cdr.markForCheck();
            },
            error: (e) => {
                alert('Error updating project: ' + e.error?.detail);
                this.cdr.markForCheck();
            }
        });
    }

    saveProjectStates(projectId: number) {
        const activeIds = this.allOrderStates
            .filter(s => this.projectStatesConfig[s.id])
            .map(s => s.id);

        this.apiService.updateProjectOrderStates(projectId, activeIds).subscribe({
            next: () => {
                console.log('States updated');
                this.cdr.markForCheck();
            },
            error: (e) => {
                console.error('Error updating states', e);
                this.cdr.markForCheck();
            }
        });
    }

    onCancel() {
        this.close.emit();
    }
}
