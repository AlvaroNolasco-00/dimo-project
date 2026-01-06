import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ApiService {
    private http = inject(HttpClient);

    removeBackground(image: Blob, colors?: Array<[number, number, number]>, threshold?: number, mask?: Blob, refine: boolean = false): Observable<Blob> {
        const formData = new FormData();
        formData.append('image', image);
        if (mask) {
            formData.append('mask', mask);
            formData.append('refine', refine.toString());
        } else if (colors && colors.length > 0) {
            formData.append('colors', JSON.stringify(colors));
        }
        if (threshold !== undefined) {
            formData.append('threshold', threshold.toString());
        }
        return this.http.post(`${environment.apiUrl}/remove-background`, formData, { responseType: 'blob' });
    }

    removeObjects(image: Blob, mask?: Blob, coordinates?: { x: number, y: number, tolerance?: number }): Observable<Blob> {
        const formData = new FormData();
        formData.append('image', image);

        if (mask) {
            // Manual mask mode
            formData.append('mask', mask);
        } else if (coordinates) {
            // Magic wand mode
            formData.append('x', coordinates.x.toString());
            formData.append('y', coordinates.y.toString());
            if (coordinates.tolerance !== undefined) {
                formData.append('tolerance', coordinates.tolerance.toString());
            }
        }

        return this.http.post(`${environment.apiUrl}/remove-objects`, formData, { responseType: 'blob' });
    }

    enhanceQuality(image: Blob, contrast: number, brightness: number, sharpness: number): Observable<Blob> {
        const formData = new FormData();
        formData.append('image', image);
        formData.append('contrast', contrast.toString());
        formData.append('brightness', brightness.toString());
        formData.append('sharpness', sharpness.toString());
        return this.http.post(`${environment.apiUrl}/enhance-quality`, formData, { responseType: 'blob' });
    }

    upscale(image: Blob, factor: number = 2.0, detailBoost: number = 1.5): Observable<Blob> {
        const formData = new FormData();
        formData.append('image', image);
        formData.append('factor', factor.toString());
        formData.append('detail_boost', detailBoost.toString());
        return this.http.post(`${environment.apiUrl}/upscale`, formData, { responseType: 'blob' });
    }

    halftone(image: Blob, dotSize: number, scale: number, colors?: Array<[number, number, number]>, threshold?: number, spacing: number = 0): Observable<Blob> {
        const formData = new FormData();
        formData.append('image', image);
        formData.append('dot_size', dotSize.toString());
        formData.append('scale', scale.toString());
        formData.append('spacing', spacing.toString());
        if (colors && colors.length > 0) {
            formData.append('colors', JSON.stringify(colors));
        }
        if (threshold !== undefined) {
            formData.append('threshold', threshold.toString());
        }
        return this.http.post(`${environment.apiUrl}/halftone`, formData, { responseType: 'blob' });
    }

    contourClip(image: Blob, mask?: Blob, mode: string = 'manual', refine: boolean = false, colors?: Array<[number, number, number]>, threshold: number = 30): Observable<Blob> {
        const formData = new FormData();
        formData.append('image', image);
        if (mask) {
            formData.append('mask', mask);
        }
        formData.append('mode', mode);
        formData.append('refine', refine.toString());
        if (colors && colors.length > 0) {
            formData.append('colors', JSON.stringify(colors));
            formData.append('threshold', threshold.toString());
        }
        return this.http.post(`${environment.apiUrl}/contour-clip`, formData, { responseType: 'blob' });
    }

    applyWatermark(baseImage: Blob, watermarkImage: Blob, x: number, y: number, scale: number = 1.0, shape: string = 'original'): Observable<Blob> {
        const formData = new FormData();
        formData.append('base_image', baseImage);
        formData.append('watermark_image', watermarkImage);
        formData.append('x', x.toString());
        formData.append('y', y.toString());
        formData.append('scale', scale.toString());
        formData.append('shape', shape);
        return this.http.post(`${environment.apiUrl}/watermark`, formData, { responseType: 'blob' });
    }

    // --- Orders ---

    getProjectOrderStates(projectId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/projects/${projectId}/order-states`);
    }

    getAllOrderStates(): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/order-states`);
    }

    updateProjectOrderStates(projectId: number, activeStateIds: number[]): Observable<any> {
        return this.http.put(`${environment.apiUrl}/projects/${projectId}/order-states`, activeStateIds);
    }

    createOrder(projectId: number, orderData: any): Observable<any> {
        return this.http.post<any>(`${environment.apiUrl}/projects/${projectId}/orders`, orderData);
    }

    getProjectOrders(projectId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/projects/${projectId}/orders`);
    }

    // --- Costs ---

    getCostTypes(projectId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/finance/cost-types?project_id=${projectId}`);
    }

    getOperativeCosts(costTypeId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/finance/costs?cost_type_id=${costTypeId}`);
    }
}

