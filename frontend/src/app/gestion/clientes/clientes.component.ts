import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ProjectService } from '../../services/project.service';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-clientes',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './clientes.component.html',
    styleUrl: './clientes.component.scss'
})
export class ClientesComponent implements OnInit {
    clients: any[] = [];
    filteredClients: any[] = [];
    loading = false;
    searchQuery = '';
    projectId: number | null = null;

    constructor(
        private apiService: ApiService,
        private projectService: ProjectService,
        private cdr: ChangeDetectorRef,
        private router: Router
    ) { }

    ngOnInit() {
        this.projectService.getSelectedProjectId().subscribe(id => {
            this.projectId = id;
            if (this.projectId) {
                this.loadClients();
            }
        });
    }

    loadClients() {
        if (!this.projectId) return;
        this.loading = true;
        this.apiService.getProjectClients(this.projectId).subscribe({
            next: (data) => {
                this.clients = data;
                this.filterClients();
                this.loading = false;
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error loading clients:', err);
                this.loading = false;
                this.cdr.detectChanges();
            }
        });
    }

    filterClients() {
        const query = this.searchQuery.toLowerCase();
        this.filteredClients = this.clients.filter(c =>
            c.full_name?.toLowerCase().includes(query) ||
            c.phone_number?.includes(query) ||
            c.email?.toLowerCase().includes(query)
        );
    }

    onSearchChange() {
        this.filterClients();
    }

    editClient(client: any) {
        this.router.navigate(['/gestion/clientes/editar', client.id]);
    }

    deleteClient(client: any) {
        Swal.fire({
            title: '¿Estás seguro?',
            text: `¿Deseas eliminar al cliente ${client.full_name}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed && this.projectId) {
                this.apiService.deleteClient(this.projectId, client.id).subscribe({
                    next: () => {
                        Swal.fire('Eliminado', 'Cliente eliminado correctamente', 'success');
                        this.loadClients();
                    },
                    error: (err) => {
                        console.error('Error deleting client:', err);
                        Swal.fire('Error', 'No se pudo eliminar al cliente', 'error');
                    }
                });
            }
        });
    }
}
