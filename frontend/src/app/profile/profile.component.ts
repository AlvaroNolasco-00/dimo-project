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
    passwordMessage = signal('');
    passwordError = signal('');
    validationMessage = '';
    isChangingPassword = signal(false);

    // Password visibility toggles
    showCurrentPassword = signal(false);
    showNewPassword = signal(false);
    showConfirmPassword = signal(false);

    // Avatar
    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
    @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;

    isRegularAccount = true;

    constructor() {
        this.passwordForm = this.fb.group({
            currentPassword: ['', Validators.required],
            newPassword: ['', [Validators.required, Validators.minLength(6)]],
            confirmPassword: ['', Validators.required]
        }, { validators: this.passwordMatchValidator });

        // Sync newPassword value → signal (for strength indicator)
        this.passwordForm.get('newPassword')!.valueChanges.subscribe(val => {
            this.newPasswordValue.set(val || '');
        });
    }

    get userAvatarUrl(): string | null {
        const u = this.user();
        if (u?.avatar_url) {
            if (u.avatar_url.startsWith('http')) return u.avatar_url;
            return `${environment.apiUrl}${u.avatar_url}`;
        }
        return null;
    }

    // Señal reactiva del valor de nueva contraseña (actualizada manualmente en template o via valueChanges)
    newPasswordValue = signal('');

    // Fortaleza de contraseña (0–4)
    passwordStrength = computed(() => {
        const val = this.newPasswordValue();
        if (!val) return 0;
        let score = 0;
        if (val.length >= 6) score++;
        if (val.length >= 10) score++;
        if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;
        return Math.min(score, 4);
    });

    passwordStrengthLabel = computed(() => {
        const labels = ['', 'Muy débil', 'Débil', 'Media', 'Fuerte'];
        return labels[this.passwordStrength()] ?? '';
    });

    passwordStrengthClass = computed(() => {
        const classes = ['', 'strength-weak', 'strength-fair', 'strength-good', 'strength-strong'];
        return classes[this.passwordStrength()] ?? '';
    });

    passwordMatchValidator(g: FormGroup) {
        return g.get('newPassword')?.value === g.get('confirmPassword')?.value
            ? null : { mismatch: true };
    }

    changePassword() {
        if (this.passwordForm.invalid || this.isChangingPassword()) return;
        this.isChangingPassword.set(true);
        this.passwordMessage.set('');
        this.passwordError.set('');

        const { currentPassword, newPassword } = this.passwordForm.value;
        this.authService.changePassword(currentPassword, newPassword).subscribe({
            next: () => {
                this.passwordMessage.set('Contraseña actualizada correctamente.');
                this.passwordForm.reset();
                this.isChangingPassword.set(false);
                setTimeout(() => this.passwordMessage.set(''), 4000);
            },
            error: (err) => {
                this.passwordError.set(err.error?.detail || 'Error al actualizar la contraseña.');
                this.isChangingPassword.set(false);
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

    onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            this.processImage(input.files[0]);
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
                const targetSize = 150;
                canvas.width = targetSize;
                canvas.height = targetSize;
                const minSide = Math.min(img.width, img.height);
                const sx = (img.width - minSide) / 2;
                const sy = (img.height - minSide) / 2;
                ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);
                canvas.toBlob((blob) => {
                    if (blob) {
                        this.authService.updateAvatar(new File([blob], file.name, { type: 'image/png' })).subscribe();
                    }
                }, 'image/png');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}
