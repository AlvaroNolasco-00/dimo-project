import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError, switchMap, map } from 'rxjs/operators';
import { of, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

interface User {
    email: string;
    is_approved: boolean;
    is_admin: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly TOKEN_KEY = 'dimo_auth_token';

    // Signals for reactive state
    private _user = signal<User | null>(null);
    user = this._user.asReadonly();

    isAuthenticated = computed(() => !!this._user());
    isApproved = computed(() => this._user()?.is_approved ?? false);
    isAdmin = computed(() => this._user()?.is_admin ?? false);

    constructor(private http: HttpClient, private router: Router) {
        // AppInitializer will call checkInitialAuth
    }

    checkInitialAuth(): Observable<boolean> {
        const token = localStorage.getItem(this.TOKEN_KEY);
        if (token) {
            return this.fetchMe().pipe(
                map(user => !!user),
                catchError(() => {
                    return of(true); // Don't block app startup
                })
            );
        }
        return of(true);
    }

    login(credentials: FormData): Observable<any> {
        return this.http.post<any>(`${environment.apiUrl}/auth/login`, credentials).pipe(
            tap(res => {
                localStorage.setItem(this.TOKEN_KEY, res.access_token);
            }),
            switchMap(() => this.fetchMe())
        );
    }

    register(credentials: FormData): Observable<any> {
        return this.http.post<any>(`${environment.apiUrl}/auth/register`, credentials);
    }

    fetchMe(): Observable<User | null> {
        return this.http.get<User>(`${environment.apiUrl}/auth/me`).pipe(
            tap(user => this._user.set(user)),
            catchError(() => {
                this.logout();
                return of(null);
            })
        );
    }

    logout() {
        localStorage.removeItem(this.TOKEN_KEY);
        this._user.set(null);
        this.router.navigate(['/auth/login']);
    }

    getToken(): string | null {
        return localStorage.getItem(this.TOKEN_KEY);
    }
}
