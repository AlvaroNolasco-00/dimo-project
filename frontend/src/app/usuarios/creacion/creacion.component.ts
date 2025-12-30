import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-creacion',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './creacion.component.html',
  styleUrl: './creacion.component.scss'
})
export class CreacionComponent {
  userForm: FormGroup;
  loading = false;
  error = '';
  success = '';

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private router: Router
  ) {
    this.userForm = this.fb.group({
      full_name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      is_admin: [false]
    });
  }

  onSubmit() {
    if (this.userForm.valid) {
      this.loading = true;
      this.error = '';
      this.success = '';

      this.userService.createUser(this.userForm.value).subscribe({
        next: () => {
          this.success = 'Usuario creado exitosamente.';
          this.loading = false;
          setTimeout(() => {
            this.router.navigate(['/usuarios/listado']);
          }, 1500);
        },
        error: (err) => {
          this.error = err.error?.detail || 'Error al crear usuario.';
          this.loading = false;
        }
      });
    } else {
      this.userForm.markAllAsTouched();
    }
  }

  onCancel() {
    this.router.navigate(['/usuarios/listado']);
  }
}

