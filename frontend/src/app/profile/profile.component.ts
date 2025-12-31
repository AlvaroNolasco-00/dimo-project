import { Component, computed, inject, signal, ViewChild, ElementRef, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';
import { User } from '../interfaces/user.interface';


@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './profile.component.html',
    styleUrl: './profile.component.scss'
})
export class ProfileComponent {
    authService = inject(AuthService);
    fb = inject(FormBuilder);

    user: Signal<User | null> = this.authService.user;



    // Forms
    passwordForm: FormGroup;

    // UI State
    isEditingAvatar = false;
    passwordMessage = '';
    passwordError = '';
    validationMessage = '';

    // New avatar preview
    avatarPreview = signal<string | null>(null);

    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
    @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;

    constructor() {
        this.passwordForm = this.fb.group({
            currentPassword: ['', Validators.required],
            newPassword: ['', [Validators.required, Validators.minLength(6)]],
            confirmPassword: ['', Validators.required]
        }, { validators: this.passwordMatchValidator });
    }

    isRegularAccount = true; // Hardcoded for now

    get userAvatarUrl(): string | null {
        const u = this.user();
        if (u?.avatar_url) {
            // Check if it's a full URL or relative path
            if (u.avatar_url.startsWith('http')) {
                return u.avatar_url;
            }
            return `${environment.apiUrl}${u.avatar_url}`;
        }
        // Default dummy
        return null;
    }

    passwordMatchValidator(g: FormGroup) {
        return g.get('newPassword')?.value === g.get('confirmPassword')?.value
            ? null : { mismatch: true };
    }

    onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const file = input.files[0];
            this.processImage(file);
        }
    }

    processImage(file: File) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
            const img = new Image();
            img.onload = () => {
                const canvas = this.canvas.nativeElement;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                // Resize / Crop logic
                const targetSize = 150;
                canvas.width = targetSize;
                canvas.height = targetSize;

                // Calculate aspect ratio
                const minSide = Math.min(img.width, img.height);
                const sx = (img.width - minSide) / 2;
                const sy = (img.height - minSide) / 2;

                // Draw cropped functionality
                ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);

                // Convert to blob
                canvas.toBlob((blob) => {
                    if (blob) {
                        const resizedFile = new File([blob], file.name, { type: 'image/png' });
                        this.uploadAvatar(resizedFile);
                    }
                }, 'image/png');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    uploadAvatar(file: File) {
        this.authService.updateAvatar(file).subscribe({
            next: (res) => {
                // Updated via signal in service, but we can force refresh if needed
                this.isEditingAvatar = false;
            },
            error: (err) => console.error('Upload failed', err)
        });
    }

    changePassword() {
        if (this.passwordForm.invalid) return;

        const { currentPassword, newPassword } = this.passwordForm.value;
        this.authService.changePassword(currentPassword, newPassword).subscribe({
            next: () => {
                this.passwordMessage = 'Contraseña actualizada correctamente.';
                this.passwordError = '';
                this.passwordForm.reset();
            },
            error: (err) => {
                this.passwordError = err.error.detail || 'Error al actualizar contraseña.';
                this.passwordMessage = '';
            }
        });
    }

    validateEmail() {
        this.authService.sendVerificationEmail().subscribe({
            next: () => {
                this.validationMessage = 'Se ha enviado un correo de validación.';
                setTimeout(() => this.validationMessage = '', 3000);
            },
            error: () => this.validationMessage = 'Error al enviar correo.'
        });
    }

    triggerFileInput() {
        this.fileInput.nativeElement.click();
    }
}
