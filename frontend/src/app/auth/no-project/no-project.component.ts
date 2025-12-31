import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-no-project',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="no-project-container">
      <div class="card">
        <div class="icon">
          <i class="ph ph-folder-lock"></i>
        </div>
        <h1>Sin Proyecto Asignado</h1>
        <p>Tu usuario ha sido aprobado, pero aún no tienes ningún proyecto asignado.</p>
        <p class="sub-text">Por favor, contacta a un administrador para que te asigne a un proyecto.</p>
        
        <button class="btn-logout" (click)="logout()">
          <i class="ph ph-sign-out"></i> Cerrar Sesión
        </button>
      </div>
    </div>
  `,
    styles: [`
    .no-project-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background-color: var(--bg-color);
      padding: 1rem;
    }

    .card {
      background: var(--card-bg);
      padding: 3rem 2rem;
      border-radius: var(--radius);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
      text-align: center;
      max-width: 450px;
      width: 100%;
      border: 1px solid var(--border-color);
    }

    .icon {
      font-size: 4rem;
      color: var(--text-secondary);
      margin-bottom: 1.5rem;
      
      i {
        background: hsla(260, 100%, 65%, 0.1);
        padding: 1rem;
        border-radius: 50%;
        color: var(--accent-color);
      }
    }

    h1 {
      font-size: 1.6rem;
      margin-bottom: 1rem;
      color: var(--text-primary);
    }

    p {
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 0.5rem;
    }

    .sub-text {
      font-size: 0.9rem;
      margin-bottom: 2rem;
      opacity: 0.8;
    }

    .btn-logout {
      background: transparent;
      border: 1px solid var(--border-color);
      padding: 0.8rem 1.5rem;
      border-radius: var(--radius);
      color: var(--text-primary);
      cursor: pointer;
      font-size: 1rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s ease;

      &:hover {
        background: var(--border-color);
        transform: translateY(-2px);
      }
    }
  `]
})
export class NoProjectComponent {
    authService = inject(AuthService);

    logout() {
        this.authService.logout();
    }
}
