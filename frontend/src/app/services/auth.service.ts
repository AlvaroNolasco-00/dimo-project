import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError, switchMap, map } from 'rxjs/operators';
import { of, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Project } from '../interfaces/project.interface';

interface User {
    email: string;
    is_approved: boolean;
    is_admin: boolean;
    projects?: Project[];
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly TOKEN_KEY = 'dimo_auth_token';
    private readonly PROJECT_KEY = 'dimo_current_project';

    // Signals for reactive state
    private _user = signal<User | null>(null);
    user = this._user.asReadonly();

    private _currentProject = signal<Project | null>(null);
    currentProject = this._currentProject.asReadonly();

    isAuthenticated = computed(() => !!this._user());
    isApproved = computed(() => this._user()?.is_approved ?? false);
    isAdmin = computed(() => this._user()?.is_admin ?? false);

    constructor(private http: HttpClient, private router: Router) {
        // AppInitializer will call checkInitialAuth

        // Restore project if exists
        const savedProject = localStorage.getItem(this.PROJECT_KEY);
        if (savedProject) {
            try {
                this._currentProject.set(JSON.parse(savedProject));
            } catch (e) {
                console.error('Failed to parse saved project', e);
                localStorage.removeItem(this.PROJECT_KEY);
            }
        }
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
            tap(user => {
                this._user.set(user);
                this.validateCurrentProject(user.projects || []);
            }),
            catchError(() => {
                this.logout();
                return of(null);
            })
        );
    }

    private validateCurrentProject(userProjects: Project[]) {
        const current = this._currentProject();
        // If current project is not in user's list (e.g. revoked), or no project selected
        // Only valid if user is NOT admin? Or admins can access any?
        // Spec says: "Un proyecto puede tener N cantidad de usuarios asignados"
        // "Los usuarios admins van a poder ver todos los proyectos"

        if (!current && userProjects.length > 0) {
            this.selectProject(userProjects[0]);
        } else if (current) {
            // Check if still assigned
            const stillAssigned = userProjects.find(p => p.id === current.id);
            if (!stillAssigned) {
                if (userProjects.length > 0) {
                    this.selectProject(userProjects[0]);
                } else {
                    this._currentProject.set(null);
                    localStorage.removeItem(this.PROJECT_KEY);
                }
            }
        }
    }

    selectProject(project: Project) {
        this._currentProject.set(project);
        localStorage.setItem(this.PROJECT_KEY, JSON.stringify(project));
    }

    logout() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.PROJECT_KEY);
        this._user.set(null);
        this._currentProject.set(null);
        this.router.navigate(['/auth/login']);
    }

    getToken(): string | null {
        return localStorage.getItem(this.TOKEN_KEY);
    }
}
