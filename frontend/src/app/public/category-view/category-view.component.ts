import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CatalogService, PublicCategory, PublicProduct } from '../../services/catalog.service';
import { environment } from '../../../environments/environment';

@Component({
    selector: 'app-category-view',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './category-view.component.html',
    styleUrl: './category-view.component.scss'
})
export class CategoryViewComponent implements OnInit {
    category: PublicCategory | null = null;
    loading = true;
    notFound = false;
    apiBaseUrl = environment.apiUrl.replace('/api', '');

    constructor(
        private route: ActivatedRoute,
        private catalogService: CatalogService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit() {
        const token = this.route.snapshot.paramMap.get('token');
        if (!token) { this.notFound = true; this.loading = false; return; }

        this.catalogService.getPublicCategory(token).subscribe({
            next: (cat) => {
                this.category = cat;
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

    getWhatsAppLink(product: PublicProduct): string {
        const msg = encodeURIComponent(`Hola! Me interesa el producto: ${product.name}`);
        return `https://wa.me/?text=${msg}`;
    }
}
