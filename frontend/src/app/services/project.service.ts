import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Project, ProjectCreate, ProjectUpdate, ProjectUser } from '../interfaces/project.interface';

@Injectable({
    providedIn: 'root'
})
export class ProjectService {
    private apiUrl = `${environment.apiUrl}/projects`;

    constructor(private http: HttpClient) { }

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
