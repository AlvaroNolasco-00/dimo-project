import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface User {
    id: number;
    email: string;
    full_name: string;
    is_approved: boolean;
    is_admin: boolean;
}

export interface UserListResponse {
    total: number;
    items: User[];
}

@Injectable({
    providedIn: 'root'
})
export class UserService {
    private apiUrl = `${environment.apiUrl}/admin/users`;

    constructor(private http: HttpClient) { }

    getUsers(page: number, limit: number, search: string = '', isApproved?: boolean, isAdmin?: boolean, sortBy: string = 'id', sortOrder: string = 'asc'): Observable<UserListResponse> {
        let params = new HttpParams()
            .set('skip', ((page - 1) * limit).toString())
            .set('limit', limit.toString())
            .set('sort_by', sortBy)
            .set('sort_order', sortOrder);

        if (search) {
            params = params.set('search', search);
        }

        if (isApproved !== undefined && isApproved !== null) {
            params = params.set('is_approved', isApproved.toString());
        }

        if (isAdmin !== undefined && isAdmin !== null) {
            params = params.set('is_admin', isAdmin.toString());
        }

        return this.http.get<UserListResponse>(this.apiUrl, { params });
    }

    approveUser(userId: number): Observable<any> {
        return this.http.post(`${environment.apiUrl}/admin/approve/${userId}`, {});
    }
}
