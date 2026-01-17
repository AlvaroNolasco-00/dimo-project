import { Component, OnInit, inject, effect, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { lastValueFrom } from 'rxjs';

export interface Pedido {
  id: number;
  client_name: string;
  delivery_date: string;
  created_at: string;
  current_state_id: number;
  state?: {
    name: string;
    color?: string;
  };
  notes: string;
  total_amount: number;
}

@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './pedidos.component.html',
  styleUrl: './pedidos.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PedidosComponent implements OnInit {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private router = inject(Router);

  // State Signals
  isLoading = signal(false);
  projectId = signal<number | null>(null);

  // Data Signals
  allOrders = signal<Pedido[]>([]);
  projectStates = signal<any[]>([]);

  // Filter & Sort Signals
  selectedStateId = signal<number | null>(null);
  sortField = signal<'delivery_date' | 'created_at' | 'id' | 'client_name'>('delivery_date');
  sortOrder = signal<'asc' | 'desc'>('asc');

  // Computed Views
  filteredOrders = computed(() => {
    let result = [...this.allOrders()];
    const stateId = this.selectedStateId();
    const field = this.sortField();
    const order = this.sortOrder();

    // Filter
    if (stateId) {
      result = result.filter(o => o.current_state_id == stateId);
    }

    // Sort
    result.sort((a, b) => {
      let valA: any = a[field];
      let valB: any = b[field];

      const isAEmpty = valA === null || valA === undefined || valA === '';
      const isBEmpty = valB === null || valB === undefined || valB === '';

      if (isAEmpty && isBEmpty) return 0;
      if (isAEmpty) return 1;
      if (isBEmpty) return -1;

      if (field === 'delivery_date' || field === 'created_at') {
        const timeA = new Date(valA).getTime();
        const timeB = new Date(valB).getTime();
        const isANaN = isNaN(timeA);
        const isBNaN = isNaN(timeB);

        if (isANaN && isBNaN) return 0;
        if (isANaN) return 1;
        if (isBNaN) return -1;

        if (timeA < timeB) return order === 'asc' ? -1 : 1;
        if (timeA > timeB) return order === 'asc' ? 1 : -1;
        return 0;
      }

      if (valA < valB) return order === 'asc' ? -1 : 1;
      if (valA > valB) return order === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  });

  top3Entregas = computed(() => {
    const now = new Date().getTime();
    return [...this.allOrders()]
      .filter(o => o.delivery_date && new Date(o.delivery_date).getTime() >= now)
      .sort((a, b) => new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime())
      .slice(0, 3);
  });

  constructor() {
    effect(() => {
      const project = this.authService.currentProject();
      if (project) {
        this.projectId.set(project.id);
        this.loadData();
      }
    }); // Effect cleans up automatically
  }

  ngOnInit() { }

  async loadData() {
    const pid = this.projectId();
    if (!pid) return;

    this.isLoading.set(true);
    try {
      const [states, orders] = await Promise.all([
        lastValueFrom(this.apiService.getProjectOrderStates(pid)),
        lastValueFrom(this.apiService.getProjectOrders(pid))
      ]);
      this.projectStates.set(states);
      this.allOrders.set(orders);
    } catch (err) {
      console.error('Error loading data', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  onSort(field: 'delivery_date' | 'created_at' | 'id' | 'client_name') {
    if (this.sortField() === field) {
      this.sortOrder.update(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortOrder.set('asc');
    }
  }

  onFilterChange() {
    // No-op, signals auto-update computed
  }

  getStateName(order: Pedido): string {
    return order.state?.name || 'Desconocido';
  }

  getStateClass(order: Pedido): string {
    const state = this.getStateName(order).toLowerCase();
    return state
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, '-');
  }

  viewOrder(id: number) {
    this.router.navigate(['/gestion/pedidos', id]);
  }
}

