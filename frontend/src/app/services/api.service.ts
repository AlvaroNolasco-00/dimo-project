import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, timer, throwError, of } from 'rxjs';
import { switchMap, filter, take, tap, map, expand, delay } from 'rxjs/operators';

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

    upscale(image: Blob, factor: number = 2.0, detailBoost: number = 1.5, progressCallback?: (progress: number, step: string) => void): Observable<Blob> {
        const formData = new FormData();
        formData.append('image', image);
        formData.append('factor', factor.toString());
        formData.append('detail_boost', detailBoost.toString());

        return this.http.post<{ task_id: string }>(`${environment.apiUrl}/upscale`, formData).pipe(
            switchMap(res => this.pollTaskWithProgress(res.task_id, progressCallback)),
            switchMap(task => {
                const finalUrl = task.result_url.startsWith('http')
                    ? task.result_url
                    : `${environment.apiUrl.replace(/\/api$/, '')}${task.result_url}`;
                return this.http.get(finalUrl, { responseType: 'blob' });
            })
        );
    }

    private pollTask(taskId: string): Observable<any> {
        // Polling con exponential backoff: 5s → 10s → 15s → 20s → 25s (max 30s)
        return of({ attempt: 0, delay: 5000 }).pipe(
            expand(({ attempt, delay }) => {
                return timer(delay).pipe(
                    switchMap(() => this.http.get<any>(`${environment.apiUrl}/processing/tasks/${taskId}`)),
                    switchMap(task => {
                        if (task.status === 'COMPLETED' || task.status === 'FAILED') {
                            return of({ task, done: true } as const);
                        }
                        const nextDelay = Math.min(30000, 5000 + (attempt + 1) * 5000);
                        return of({ attempt: attempt + 1, delay: nextDelay } as const);
                    })
                );
            }),
            filter((result): result is { task: any; done: true } => 'done' in result && result.done),
            take(1),
            switchMap(({ task }) => {
                if (task.status === 'FAILED') {
                    return throwError(() => new Error(task.error || 'Upscale task failed'));
                }
                return of(task);
            })
        );
    }

    private pollTaskWithProgress(taskId: string, progressCallback?: (progress: number, step: string) => void): Observable<any> {
        let pollCount = 0;
        const maxPolls = 10; // ~100 seconds max

        if (progressCallback) {
            progressCallback(20, 'Iniciando tarea de upscale...');
        }

        // Polling con exponential backoff: 5s → 10s → 15s → 20s → 25s (max 30s)
        return of({ attempt: 0, delay: 5000 }).pipe(
            expand(({ attempt, delay }) => {
                return timer(delay).pipe(
                    switchMap(() => {
                        pollCount++;
                        const progress = Math.min(80, 20 + (pollCount / maxPolls) * 60);
                        if (progressCallback) {
                            progressCallback(progress, 'Procesando en GPU...');
                        }
                        return this.http.get<any>(`${environment.apiUrl}/processing/tasks/${taskId}`);
                    }),
                    switchMap(task => {
                        if (task.status === 'COMPLETED' || task.status === 'FAILED') {
                            return of({ task, done: true } as const);
                        }
                        const nextDelay = Math.min(30000, 5000 + (attempt + 1) * 5000);
                        return of({ attempt: attempt + 1, delay: nextDelay } as const);
                    })
                );
            }),
            filter((result): result is { task: any; done: true } => 'done' in result && result.done),
            take(1),
            switchMap(({ task }) => {
                if (task.status === 'FAILED') {
                    return throwError(() => new Error(task.error || 'Upscale task failed'));
                }
                if (progressCallback) {
                    progressCallback(90, 'Descargando resultado...');
                }
                return of(task);
            })
        );
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

    contourClip(image: Blob, mask?: Blob, mode: string = 'manual', refine: boolean = false, colors?: Array<[number, number, number]>, threshold: number = 30, progressCallback?: (progress: number, step: string) => void): Observable<Blob> {
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
        return this.http.post<{ task_id: string }>(`${environment.apiUrl}/contour-clip`, formData).pipe(
            switchMap(res => this.pollTaskWithProgress(res.task_id, progressCallback)),
            switchMap(task => {
                const finalUrl = task.result_url.startsWith('http')
                    ? task.result_url
                    : `${environment.apiUrl.replace(/\/api$/, '')}${task.result_url}`;
                return this.http.get(finalUrl, { responseType: 'blob' });
            })
        );
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

    getOrder(projectId: number, orderId: number): Observable<any> {
        return this.http.get<any>(`${environment.apiUrl}/projects/${projectId}/orders/${orderId}`);
    }

    updateOrder(projectId: number, orderId: number, data: any): Observable<any> {
        return this.http.put<any>(`${environment.apiUrl}/projects/${projectId}/orders/${orderId}`, data);
    }

    getOrderHistory(orderId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/orders/${orderId}/history`);
    }

    uploadOrderFile(orderId: number, file: File): Observable<{ url: string, filename: string }> {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post<{ url: string, filename: string }>(`${environment.apiUrl}/orders/${orderId}/upload`, formData);
    }

    // --- Public Order Access ---

    getPublicOrder(token: string): Observable<any> {
        return this.http.get<any>(`${environment.apiUrl}/public/orders/${token}`);
    }

    updatePublicOrder(token: string, data: any): Observable<any> {
        return this.http.put<any>(`${environment.apiUrl}/public/orders/${token}`, data);
    }

    uploadPublicOrderFile(token: string, file: File, itemId?: number): Observable<{ url: string, filename: string }> {
        const formData = new FormData();
        formData.append('file', file);
        if (itemId) {
            formData.append('item_id', itemId.toString());
        }
        return this.http.post<{ url: string, filename: string }>(`${environment.apiUrl}/public/orders/${token}/upload?item_id=${itemId || ''}`, formData);
    }

    // --- Configs (Zones / Coupons) ---

    getDeliveryZones(projectId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/projects/${projectId}/delivery-zones`);
    }

    createDeliveryZone(projectId: number, zone: any): Observable<any> {
        return this.http.post<any>(`${environment.apiUrl}/projects/${projectId}/delivery-zones`, zone);
    }

    updateDeliveryZone(projectId: number, zoneId: number, zone: any): Observable<any> {
        return this.http.put<any>(`${environment.apiUrl}/projects/${projectId}/delivery-zones/${zoneId}`, zone);
    }

    getDeliveryZoneHistory(projectId: number, zoneId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/projects/${projectId}/delivery-zones/${zoneId}/history`);
    }

    getCoupons(projectId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/projects/${projectId}/coupons`);
    }

    createCoupon(projectId: number, coupon: any): Observable<any> {
        return this.http.post<any>(`${environment.apiUrl}/projects/${projectId}/coupons`, coupon);
    }

    updateCoupon(projectId: number, couponId: number, coupon: any): Observable<any> {
        return this.http.put<any>(`${environment.apiUrl}/projects/${projectId}/coupons/${couponId}`, coupon);
    }

    getCouponHistory(projectId: number, couponId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/projects/${projectId}/coupons/${couponId}/history`);
    }

    revertCoupon(projectId: number, couponId: number, historyId: number): Observable<any> {
        return this.http.post<any>(`${environment.apiUrl}/projects/${projectId}/coupons/${couponId}/revert/${historyId}`, {});
    }

    getCouponStatistics(projectId: number): Observable<any> {
        return this.http.get<any>(`${environment.apiUrl}/projects/${projectId}/coupons/stats`);
    }


    // --- Costs ---

    getCostTypes(projectId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/finance/cost-types?project_id=${projectId}`);
    }

    getOperativeCosts(costTypeId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/finance/costs?cost_type_id=${costTypeId}`);
    }

    getDerivedCosts(parentCostId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/finance/costs?parent_cost_id=${parentCostId}`);
    }

    // --- Clients ---

    getProjectClients(projectId: number): Observable<any[]> {
        return this.http.get<any[]>(`${environment.apiUrl}/projects/${projectId}/clients`);
    }

    getClient(projectId: number, clientId: number): Observable<any> {
        return this.http.get<any>(`${environment.apiUrl}/projects/${projectId}/clients/${clientId}`);
    }

    searchClientByPhone(projectId: number, phone: string): Observable<any> {
        return this.http.get<any>(`${environment.apiUrl}/projects/${projectId}/clients/search/${phone}`);
    }

    createClient(projectId: number, clientData: any): Observable<any> {
        return this.http.post<any>(`${environment.apiUrl}/projects/${projectId}/clients`, clientData);
    }

    updateClient(projectId: number, clientId: number, clientData: any): Observable<any> {
        return this.http.put<any>(`${environment.apiUrl}/projects/${projectId}/clients/${clientId}`, clientData);
    }

    deleteClient(projectId: number, clientId: number): Observable<any> {
        return this.http.delete<any>(`${environment.apiUrl}/projects/${projectId}/clients/${clientId}`);
    }

    // --- Geocoding ---
    getReverseGeocoding(lat: number, lng: number): Observable<any> {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        return this.http.get<any>(url);
    }

    // --- Bitácora de Auditoría ---
    getProcessingAuditLog(params: {
        page?: number;
        page_size?: number;
        user_id?: number;
        operation?: string;
        status?: string;
        date_from?: string;
        date_to?: string;
    }): Observable<any> {
        const query = Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
            .join('&');
        return this.http.get<any>(`${environment.apiUrl}/audit/processing${query ? '?' + query : ''}`);
    }

    getProcessingAuditStats(days: number = 30): Observable<any> {
        return this.http.get<any>(`${environment.apiUrl}/audit/processing/stats?days=${days}`);
    }

    executePipeline(image: Blob, operations: PipelineOperationDTO[], masks: Map<number, Blob>): Observable<PipelineResponse> {
        const formData = new FormData();
        formData.append('image', image);
        formData.append('operations', JSON.stringify(operations));
        masks.forEach((maskBlob, index) => {
            formData.append(`mask_${index}`, maskBlob);
        });
        return this.http.post<PipelineResponse>(`${environment.apiUrl}/pipeline`, formData);
    }
}

export interface PipelineOperationDTO {
    type: string;
    params: Record<string, any>;
    input_mode: 'original' | 'chained';
}

export interface PipelineStepResult {
    step_index: number;
    operation_type: string;
    status: 'success' | 'failed';
    error?: string;
    image_base64?: string;
    duration_ms?: number;
}

export interface PipelineResponse {
    pipeline_id: string;
    total_steps: number;
    completed_steps: number;
    status: 'completed' | 'partial_failure';
    results: PipelineStepResult[];
}

