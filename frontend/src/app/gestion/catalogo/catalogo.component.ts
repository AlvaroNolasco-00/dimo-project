import { Component, ChangeDetectionStrategy, computed, signal, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogService, Product, ProductCategory } from '../../services/catalog.service';
import { ProjectService } from '../../services/project.service';
import { environment } from '../../../environments/environment';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-catalogo',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './catalogo.component.html',
    styleUrl: './catalogo.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogoComponent {
    private catalogService = inject(CatalogService);
    private projectService = inject(ProjectService);

    private projectId = toSignal(this.projectService.getSelectedProjectId(), { initialValue: null });

    products = signal<Product[]>([]);
    categories = signal<ProductCategory[]>([]);
    loading = signal(false);
    selectedCategoryId = signal<number | null>(null);
    searchQuery = signal('');

    filteredProducts = computed(() => {
        let result = this.products();
        const catId = this.selectedCategoryId();
        const q = this.searchQuery().toLowerCase().trim();
        if (catId !== null) result = result.filter(p => p.category_id === catId);
        if (q) result = result.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.description?.toLowerCase().includes(q) ?? false)
        );
        return result;
    });

    readonly Math = Math;
    readonly apiBaseUrl = environment.apiUrl.replace('/api', '');

    constructor() {
        effect(() => {
            const id = this.projectId();
            if (id) this.loadData(id);
        });
    }

    private loadData(projectId: number) {
        this.loading.set(true);
        this.catalogService.getCategories(projectId).subscribe({
            next: (cats) => {
                this.categories.set(cats);
                this.catalogService.getProducts(projectId).subscribe({
                    next: (prods) => {
                        this.products.set(prods);
                        this.loading.set(false);
                    },
                    error: () => this.loading.set(false)
                });
            },
            error: () => this.loading.set(false)
        });
    }

    filterByCategory(id: number | null) {
        this.selectedCategoryId.set(id);
    }

    getImageUrl(path: string | undefined): string {
        if (!path) return '';
        if (path.startsWith('http')) return path;
        return `${this.apiBaseUrl}${path}`;
    }

    getBaseCost(product: Product): number {
        return product.cost_lines.reduce((sum, l) => sum + l.unit_cost * l.quantity, 0);
    }

    getMargin(product: Product): number {
        const base = this.getBaseCost(product);
        if (base === 0) return 0;
        return ((product.sale_price - base) / base) * 100;
    }

    getPublicLink(product: Product): string {
        return `${window.location.origin}/shop/${product.access_token}`;
    }

    copyLink(product: Product) {
        navigator.clipboard.writeText(this.getPublicLink(product)).then(() => {
            Swal.fire({ icon: 'success', title: 'Link copiado', timer: 1200, showConfirmButton: false });
        });
    }

    toggleActive(product: Product) {
        this.catalogService.updateProduct(this.projectId()!, product.id, { is_active: !product.is_active }).subscribe({
            next: (updated) => {
                this.products.update(prods => prods.map(p => p.id === updated.id ? updated : p));
            }
        });
    }

    deleteProduct(product: Product) {
        Swal.fire({
            title: '¿Eliminar producto?',
            text: `Se eliminará "${product.name}" permanentemente.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        }).then(result => {
            if (result.isConfirmed) {
                this.catalogService.deleteProduct(this.projectId()!, product.id).subscribe({
                    next: () => {
                        this.products.update(prods => prods.filter(p => p.id !== product.id));
                    },
                    error: () => Swal.fire('Error', 'No se pudo eliminar el producto', 'error')
                });
            }
        });
    }
}
