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
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <h1>Crear Cuenta</h1>
          <p>Únete a PhotoEdit Suite hoy</p>
        </div>
        
        <form (submit)="onSubmit($event)">
          <div class="form-group">
            <label for="email">Correo Electrónico</label>
            <input type="email" id="email" [(ngModel)]="email" name="email" required placeholder="tu@email.com">
          </div>
          
          <div class="form-group">
            <label for="password">Contraseña</label>
            <input type="password" id="password" [(ngModel)]="password" name="password" required placeholder="••••••••">
          </div>
          
          <button type="submit" [disabled]="loading" class="btn-primary">
            {{ loading ? 'Registrando...' : 'Registrarse' }}
          </button>
        </form>
        
        <div class="auth-footer">
           <p>¿Ya tienes cuenta? <a routerLink="/auth/login">Inicia sesión</a></p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .auth-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      font-family: 'Inter', sans-serif;
    }
    .auth-card {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 2.5rem;
      border-radius: 20px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .auth-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    .auth-header h1 {
      color: white;
      font-size: 2rem;
      margin-bottom: 0.5rem;
      font-weight: 700;
    }
    .auth-header p {
      color: #94a3b8;
    }
    .form-group {
      margin-bottom: 1.5rem;
    }
    label {
      display: block;
      color: #cbd5e1;
      margin-bottom: 0.5rem;
      font-size: 0.9rem;
    }
    input {
      width: 100%;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 0.75rem 1rem;
      border-radius: 10px;
      color: white;
      transition: all 0.3s ease;
    }
    input:focus {
      outline: none;
      border-color: #3b82f6;
      background: rgba(0, 0, 0, 0.3);
    }
    .btn-primary {
      width: 100%;
      background: #3b82f6;
      color: white;
      border: none;
      padding: 0.75rem;
      border-radius: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.3s ease;
      margin-top: 1rem;
    }
    .btn-primary:hover {
      background: #2563eb;
    }
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .auth-footer {
      text-align: center;
      margin-top: 1.5rem;
      font-size: 0.9rem;
      color: #94a3b8;
    }
    .auth-footer a {
      color: #3b82f6;
      text-decoration: none;
      font-weight: 600;
    }
  `]
})
export class RegisterComponent {
  email = '';
  password = '';
  loading = false;

  private authService = inject(AuthService);
  private router = inject(Router);

  onSubmit(e: Event) {
    e.preventDefault();
    this.loading = true;

    const formData = new FormData();
    formData.append('email', this.email);
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
