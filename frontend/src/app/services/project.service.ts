import { Injectable, inject, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';
import { Project, ProjectCreate, ProjectUpdate, ProjectUser } from '../interfaces/project.interface';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class ProjectService {
    private apiUrl = `${environment.apiUrl}/projects`;
    private authService = inject(AuthService);
    private injector = inject(Injector);

    private selectedProjectId$ = toObservable(this.authService.currentProject, { injector: this.injector }).pipe(
        map(p => p ? p.id : null)
    );

    constructor(private http: HttpClient) { }

    getSelectedProjectId(): Observable<number | null> {
        return this.selectedProjectId$;
    }

    getProjects(skip: number = 0, limit: number = 100): Observable<Project[]> {
        return this.http.get<Project[]>(`${this.apiUrl}/?skip=${skip}&limit=${limit}`);
    }

    createProject(project: ProjectCreate): Observable<Project> {
        return this.http.post<Project>(this.apiUrl, project);
    }

    updateProject(id: number, project: ProjectUpdate): Observable<Project> {
        return this.http.put<Project>(`${this.apiUrl}/${id}`, project);
    }

    deleteProject(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${id}`);
    }

    assignUser(projectId: number, userId: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/${projectId}/users/${userId}`, {});
    }

    removeUser(projectId: number, userId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${projectId}/users/${userId}`);
    }

    getProjectUsers(projectId: number): Observable<ProjectUser[]> {
        return this.http.get<ProjectUser[]>(`${this.apiUrl}/${projectId}/users`);
    }
}
