import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { CatalogService, Product } from '../../services/catalog.service';
import { environment } from '../../../environments/environment';

@Component({
    selector: 'app-product-view',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './product-view.component.html',
    styleUrl: './product-view.component.scss'
})
export class ProductViewComponent implements OnInit {
    product: Product | null = null;
    loading = true;
    notFound = false;
    imageModalOpen = false;
    apiBaseUrl = environment.apiUrl.replace('/api', '');

    constructor(
        private route: ActivatedRoute,
        private catalogService: CatalogService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit() {
        const token = this.route.snapshot.paramMap.get('token');
        if (!token) { this.notFound = true; this.loading = false; return; }

        this.catalogService.getPublicProduct(token).subscribe({
            next: (p) => {
                this.product = p;
                this.loading = false;
                this.cdr.detectChanges();
            },
            error: () => {
                this.notFound = true;
                this.loading = false;
                this.cdr.detectChanges();
            }
        });
    }

    getImageUrl(path: string | undefined): string | null {
        if (!path) return null;
        if (path.startsWith('http')) return path;
        return `${this.apiBaseUrl}${path}`;
    }

    get baseCost(): number {
        if (!this.product) return 0;
        return this.product.cost_lines.reduce((sum, l) => sum + l.unit_cost * l.quantity, 0);
    }

    openImageModal() {
        if (this.product && this.getImageUrl(this.product.image_path)) {
            this.imageModalOpen = true;
        }
    }

    closeImageModal() {
        this.imageModalOpen = false;
    }

    @HostListener('document:keydown.escape')
    onEscape() {
        this.imageModalOpen = false;
    }

    getWhatsAppLink(): string {
        const name = this.product?.name || 'este producto';
        const msg = encodeURIComponent(`Hola! Me interesa el producto: ${name}`);
        return `https://wa.me/?text=${msg}`;
    }
}
