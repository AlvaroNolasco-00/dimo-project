import { Component, OnInit, ChangeDetectorRef, OnDestroy, NgZone } from '@angular/core';
import Swal from 'sweetalert2';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { UserService, User } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-listado',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './listado.component.html',
  styleUrl: './listado.component.scss'
})
export class ListadoComponent implements OnInit, OnDestroy {
  users: User[] = [];
  total = 0;
  page = 1;
  limit = 10;
  loading = false;
  search = '';
  filterStatus: boolean | null = null;
  filterRole: boolean | null = null;
  sortBy = 'id';
  sortOrder = 'asc';
  Math = Math; // For ceiling in template
  private searchSubject = new Subject<string>();

  isAdmin = false;

  constructor(
    private userService: UserService,
    private authService: AuthService, // Inject AuthService
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) { }

  ngOnInit() {
    this.isAdmin = this.authService.isAdmin();
    this.loadUsers();

    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(searchValue => {
      this.search = searchValue;
      this.page = 1;
      this.loadUsers();
    });
  }

  ngOnDestroy() {
    this.searchSubject.complete();
  }

  loadUsers() {
    this.loading = true;
    this.cdr.detectChanges(); // Inmediatamente mostramos el loader

    console.log('Fetching users with:', { page: this.page, search: this.search, status: this.filterStatus, role: this.filterRole, sort: this.sortBy, order: this.sortOrder });

    this.userService.getUsers(this.page, this.limit, this.search, this.filterStatus as any, this.filterRole as any, this.sortBy, this.sortOrder).subscribe({
      next: (res) => {
        this.zone.run(() => {
          console.log('Users received:', res);
          this.users = [...res.items];
          this.total = res.total;
          this.loading = false;
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.zone.run(() => {
          console.error('Error loading users:', err);
          this.loading = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  sort(column: string) {
    if (this.sortBy === column) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = column;
      this.sortOrder = 'asc';
    }
    this.loadUsers();
  }

  onFilterChange() {
    this.page = 1;
    this.loadUsers();
  }

  onSearch(event: any) {
    const value = event.target.value;
    this.searchSubject.next(value);
  }

  changePage(newPage: number) {
    if (newPage >= 1 && newPage <= Math.ceil(this.total / this.limit)) {
      this.page = newPage;
      this.loadUsers();
    }
  }

  approve(user: User) {
    Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Deseas aprobar al usuario ${user.full_name}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, aprobar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.userService.approveUser(user.id).subscribe({
          next: () => {
            Swal.fire(
              'Aprobado',
              'El usuario ha sido aprobado exitosamente.',
              'success'
            );
            this.loadUsers();
          },
          error: (err) => {
            console.error('Error approving user:', err);
            Swal.fire(
              'Error',
              'Hubo un problema al aprobar al usuario.',
              'error'
            );
          }
        });
      }
    });
  }
}

