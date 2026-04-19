import { Component, OnInit, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CatalogService, ProductCategory } from '../../../services/catalog.service';
import { ProjectService } from '../../../services/project.service';
import Swal from 'sweetalert2';
import { environment } from '../../../../environments/environment';

@Component({
    selector: 'app-categorias',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './categorias.component.html',
    styleUrl: './categorias.component.scss'
})
export class CategoriasComponent implements OnInit {
    categories: ProductCategory[] = [];
    loading = false;
    projectId: number | null = null;

    showForm = false;
    editingId: number | null = null;
    formData = { name: '', description: '', is_active: true };
    saving = false;

    constructor(
        private catalogService: CatalogService,
        private projectService: ProjectService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit() {
        this.projectService.getSelectedProjectId().subscribe(id => {
            this.projectId = id;
            if (id) this.loadCategories();
        });
    }

    loadCategories() {
        if (!this.projectId) return;
        this.loading = true;
        this.catalogService.getCategories(this.projectId).subscribe({
            next: (data) => {
                this.categories = data;
                this.loading = false;
                this.cdr.detectChanges();
            },
            error: () => {
                this.loading = false;
                this.cdr.detectChanges();
            }
        });
    }

    openNewForm() {
        this.editingId = null;
        this.formData = { name: '', description: '', is_active: true };
        this.showForm = true;
    }

    openEditForm(cat: ProductCategory) {
        this.editingId = cat.id;
        this.formData = { name: cat.name, description: cat.description || '', is_active: cat.is_active };
        this.showForm = true;
    }

    closeForm() {
        this.showForm = false;
        this.editingId = null;
    }

    save() {
        if (!this.formData.name.trim() || !this.projectId) return;
        this.saving = true;

        const action = this.editingId
            ? this.catalogService.updateCategory(this.projectId, this.editingId, this.formData)
            : this.catalogService.createCategory(this.projectId, this.formData);

        action.subscribe({
            next: () => {
                this.saving = false;
                this.closeForm();
                this.loadCategories();
            },
            error: (err) => {
                this.saving = false;
                const msg = err?.error?.detail || 'No se pudo guardar la categoría';
                Swal.fire('Error', msg, 'error');
            }
        });
    }

    getCategoryLink(cat: ProductCategory): string {
        return `${window.location.origin}/catalogo/${cat.access_token}`;
    }

    copyLink(cat: ProductCategory) {
        if (!cat.access_token) {
            Swal.fire({ icon: 'warning', title: 'Sin link', text: 'Esta categoría no tiene link público todavía. Guárdala de nuevo para generarlo.', confirmButtonText: 'OK' });
            return;
        }
        navigator.clipboard.writeText(this.getCategoryLink(cat)).then(() => {
            Swal.fire({ icon: 'success', title: 'Link copiado', timer: 1200, showConfirmButton: false });
        });
    }

    deleteCategory(cat: ProductCategory) {
        Swal.fire({
            title: '¿Eliminar categoría?',
            text: `Se eliminará "${cat.name}". Los productos mantendrán sus datos pero quedarán sin categoría.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        }).then(result => {
            if (result.isConfirmed) {
                this.catalogService.deleteCategory(this.projectId, cat.id).subscribe({
                    next: () => this.loadCategories(),
                    error: () => Swal.fire('Error', 'No se pudo eliminar la categoría', 'error')
                });
            }
        });
    }
}
