import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../../services/api.service';
import { ProjectService } from '../../../services/project.service';
import Swal from 'sweetalert2';

@Component({
    selector: 'app-cliente-form',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './cliente-form.component.html',
    styleUrl: './cliente-form.component.scss'
})
export class ClienteFormComponent implements OnInit {
    isSaving = false;
    isEditMode = false;
    clientId: number | null = null;
    projectId: number | null = null;

    client = {
        phone_number: '',
        full_name: '',
        email: '',
        tax_id: '',
        client_type: 'retail',
        shipping_address: '',
        notes: '',
        preferences: {
            default_size: '',
            preferred_fit: '',
            preferred_technique: '',
            delivery_window: '',
            communication_channel: 'WhatsApp'
        }
    };

    sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
    techniques = ['Serigrafía', 'DTF', 'Bordado', 'Sublimación', 'Vinil Textil'];
    windows = ['Matutino (8am - 12pm)', 'Vespertino (1pm - 6pm)', 'Todo el día'];
    channels = ['WhatsApp', 'Llamada', 'Correo', 'Instagram', 'Facebook'];

    constructor(
        private apiService: ApiService,
        private projectService: ProjectService,
        private router: Router,
        private route: ActivatedRoute,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit() {
        this.projectService.getSelectedProjectId().subscribe(id => {
            this.projectId = id;
        });

        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.isEditMode = true;
            this.clientId = parseInt(id, 10);
            this.loadClient();
        }
    }

    loadClient() {
        if (!this.projectId || !this.clientId) return;
        this.apiService.getClient(this.projectId, this.clientId).subscribe({
            next: (data) => {
                this.client = {
                    ...data,
                    preferences: {
                        ...this.client.preferences,
                        ...(data.preferences || {})
                    }
                };
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error loading client:', err);
                Swal.fire('Error', 'No se pudo cargar la información del cliente', 'error');
                this.router.navigate(['/gestion/clientes']);
            }
        });
    }

    saveClient() {
        if (!this.projectId) {
            Swal.fire('Error', 'No se ha seleccionado ningún proyecto', 'error');
            return;
        }

        if (!this.client.phone_number || !this.client.full_name) {
            Swal.fire('Atención', 'Nombre y Teléfono son obligatorios', 'warning');
            return;
        }

        this.isSaving = true;

        const payload = {
            ...this.client,
            project_id: this.projectId
        };

        const action = this.isEditMode && this.clientId
            ? this.apiService.updateClient(this.projectId, this.clientId, payload)
            : this.apiService.createClient(this.projectId, payload);

        action.subscribe({
            next: () => {
                Swal.fire('Éxito', `Cliente ${this.isEditMode ? 'actualizado' : 'creado'} correctamente`, 'success');
                this.router.navigate(['/gestion/clientes']);
            },
            error: (err) => {
                console.error('Error saving client:', err);
                const errorMsg = err.error?.detail || 'Ocurrió un error inesperado al guardar el cliente';
                Swal.fire('Error', errorMsg, 'error');
                this.isSaving = false;
                this.cdr.detectChanges();
            }
        });
    }

    cancel() {
        this.router.navigate(['/gestion/clientes']);
    }
}
