import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CostType {
    id: number;
    name: string;
    description: string;
    created_at: string;
}

export interface OperativeCost {
    id: number;
    cost_type_id: number;
    base_cost: number;
    attributes: any; // Dynamic JSON
    created_at: string;
}

@Injectable({
    providedIn: 'root'
})
export class FinanceService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apiUrl}/finance`;

    getCostTypes(projectId?: number): Observable<CostType[]> {
        let params: any = {};
        if (projectId) params.project_id = projectId;
        return this.http.get<CostType[]>(`${this.apiUrl}/cost-types`, { params });
    }

    createCostType(costType: { name: string, description: string, project_id: number }): Observable<CostType> {
        return this.http.post<CostType>(`${this.apiUrl}/cost-types`, costType);
    }

    getCosts(costTypeId?: number): Observable<OperativeCost[]> {
        let params: any = {};
        if (costTypeId) {
            params.cost_type_id = costTypeId;
        }
        return this.http.get<OperativeCost[]>(`${this.apiUrl}/costs`, { params });
    }

    createCost(cost: { cost_type_id: number, base_cost: number, attributes: any }): Observable<OperativeCost> {
        return this.http.post<OperativeCost>(`${this.apiUrl}/costs`, cost);
    }

    updateCost(id: number, cost: { base_cost?: number, attributes?: any }): Observable<OperativeCost> {
        return this.http.put<OperativeCost>(`${this.apiUrl}/costs/${id}`, cost);
    }

    deleteCost(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/costs/${id}`);
    }
}
