import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-pending-approval',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <div class="header">
          <div class="icon">🕒</div>
          <h1>Acceso Pendiente</h1>
        </div>
        
        <div class="content">
          <p>Tu cuenta <strong>{{ authService.user()?.email }}</strong> aún no ha sido aprobada por un administrador.</p>
          <p>Por favor, contacta a soporte o espera a que tu acceso sea validado.</p>
        </div>
        
        <div class="actions">
          <button class="btn-secondary" (click)="checkStatus()">Verificar Estado</button>
          <button class="btn-logout" (click)="logout()">Cerrar Sesión</button>
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
      padding: 3rem;
      border-radius: 20px;
      width: 100%;
      max-width: 500px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
    h1 {
      color: white;
      font-size: 1.8rem;
      margin-bottom: 1.5rem;
    }
    .content {
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 2rem;
    }
    strong {
      color: white;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    button {
      padding: 0.75rem;
      border-radius: 10px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.3s ease;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    .btn-logout {
      background: #ef4444;
      color: white;
    }
    .btn-logout:hover {
      background: #dc2626;
    }
  `]
})
export class PendingApprovalComponent {
  authService = inject(AuthService);
  private router = inject(Router);

  checkStatus() {
    this.authService.fetchMe().subscribe(user => {
      if (user?.is_approved) {
        this.router.navigate(['/factory']);
      }
    });
  }

  logout() {
    this.authService.logout();
  }
}
