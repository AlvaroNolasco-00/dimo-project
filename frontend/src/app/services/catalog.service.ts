import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProductCostLine {
    id: number;
    product_id: number;
    operative_cost_id?: number;
    label: string;
    quantity: number;
    unit_cost: number;
    created_at: string;
}

export interface ProductCategory {
    id: number;
    project_id: number;
    name: string;
    description?: string;
    is_active: boolean;
    access_token?: string;
    created_at: string;
}

export interface PublicProduct {
    id: number;
    name: string;
    description?: string;
    image_path?: string;
    sale_price: number;
    access_token?: string;
}

export interface PublicCategory {
    id: number;
    name: string;
    description?: string;
    products: PublicProduct[];
}

export interface Product {
    id: number;
    project_id: number;
    category_id?: number;
    name: string;
    description?: string;
    image_path?: string;
    sale_price: number;
    is_active: boolean;
    access_token?: string;
    created_at: string;
    updated_at: string;
    category?: ProductCategory;
    cost_lines: ProductCostLine[];
}

export interface ProductCostLineCreate {
    label: string;
    quantity: number;
    unit_cost: number;
    operative_cost_id?: number;
}

export interface ProductCreate {
    project_id: number;
    name: string;
    description?: string;
    sale_price: number;
    is_active: boolean;
    category_id?: number;
    cost_lines: ProductCostLineCreate[];
}

export interface ProductUpdate {
    name?: string;
    description?: string;
    sale_price?: number;
    is_active?: boolean;
    category_id?: number;
    cost_lines?: ProductCostLineCreate[];
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apiUrl}/catalog`;

    // Categories
    getCategories(projectId: number): Observable<ProductCategory[]> {
        return this.http.get<ProductCategory[]>(`${this.apiUrl}/projects/${projectId}/categories`);
    }

    createCategory(projectId: number, data: { name: string; description?: string; is_active?: boolean }): Observable<ProductCategory> {
        return this.http.post<ProductCategory>(`${this.apiUrl}/projects/${projectId}/categories`, data);
    }

    updateCategory(projectId: number, id: number, data: { name?: string; description?: string; is_active?: boolean }): Observable<ProductCategory> {
        return this.http.put<ProductCategory>(`${this.apiUrl}/projects/${projectId}/categories/${id}`, data);
    }

    deleteCategory(projectId: number, id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/projects/${projectId}/categories/${id}`);
    }

    // Products
    getProducts(projectId: number, categoryId?: number): Observable<Product[]> {
        const params: any = {};
        if (categoryId !== undefined) params.category_id = categoryId;
        return this.http.get<Product[]>(`${this.apiUrl}/projects/${projectId}/products`, { params });
    }

    getProduct(projectId: number, id: number): Observable<Product> {
        return this.http.get<Product>(`${this.apiUrl}/projects/${projectId}/products/${id}`);
    }

    createProduct(projectId: number, data: ProductCreate): Observable<Product> {
        return this.http.post<Product>(`${this.apiUrl}/projects/${projectId}/products`, data);
    }

    updateProduct(projectId: number, id: number, data: ProductUpdate): Observable<Product> {
        return this.http.put<Product>(`${this.apiUrl}/projects/${projectId}/products/${id}`, data);
    }

    deleteProduct(projectId: number, id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/projects/${projectId}/products/${id}`);
    }

    uploadProductImage(projectId: number, id: number, file: File): Observable<{ url: string; filename: string }> {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post<{ url: string; filename: string }>(
            `${this.apiUrl}/projects/${projectId}/products/${id}/upload`, formData
        );
    }

    // Public
    getPublicProduct(token: string): Observable<Product> {
        return this.http.get<Product>(`${environment.apiUrl}/catalog/public/products/${token}`);
    }

    getPublicCategory(token: string): Observable<PublicCategory> {
        return this.http.get<PublicCategory>(`${environment.apiUrl}/catalog/public/categories/${token}`);
    }
}
