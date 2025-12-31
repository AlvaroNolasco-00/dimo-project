import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, RouterModule } from '@angular/router';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  email = '';
  full_name = '';
  password = '';
  loading = false;

  private authService = inject(AuthService);
  private router = inject(Router);

  onSubmit(e: Event) {
    e.preventDefault();
    this.loading = true;

    const formData = new FormData();
    formData.append('email', this.email);
    formData.append('full_name', this.full_name);
    formData.append('password', this.password);

    this.authService.register(formData).subscribe({
      next: () => {
        this.loading = false;
        Swal.fire({
          icon: 'success',
          title: 'Registro Exitoso',
          text: 'Tu cuenta ha sido creada. Un administrador debe aprobar tu acceso para poder utilizar la plataforma.',
          background: '#1e293b',
          color: '#fff',
          confirmButtonColor: '#3b82f6'
        }).then(() => {
          this.router.navigate(['/auth/login']);
        });
      },
      error: (err) => {
        this.loading = false;
        const msg = err.error?.detail || 'No se pudo completar el registro.';
        Swal.fire({
          icon: 'error',
          title: 'Error de registro',
          text: msg,
          background: '#1e293b',
          color: '#fff',
          confirmButtonColor: '#3b82f6'
        });
      }
    });
  }
}
