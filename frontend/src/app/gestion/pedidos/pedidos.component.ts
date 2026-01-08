import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

export interface Pedido {
  id: number;
  client_name: string;
  delivery_date: string;
  created_at: string;
  current_state_id: number;
  state?: {
    name: string;
  };
  notes: string;
  total_amount: number;
}

@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './pedidos.component.html',
  styleUrl: './pedidos.component.scss'
})
export class PedidosComponent implements OnInit {
  // Data
  allOrders: Pedido[] = [];
  filteredOrders: Pedido[] = [];
  top3Entregas: Pedido[] = [];

  // Filter State
  projectStates: any[] = [];
  selectedStateId: number | null = null;
  projectId: number = 1; // Default or fetched

  // Sort State
  sortField: 'delivery_date' | 'created_at' | 'id' | 'client_name' = 'delivery_date';
  sortOrder: 'asc' | 'desc' = 'asc';

  isLoading = false;

  constructor(
    private apiService: ApiService,
    private cd: ChangeDetectorRef,
    private router: Router
  ) { }

  ngOnInit() {
    const storedProjId = localStorage.getItem('currentProjectId');
    if (storedProjId) {
      this.projectId = parseInt(storedProjId, 10);
    }

    this.loadData();
  }

  loadData() {
    this.isLoading = true;

    // Load States for Filter
    this.apiService.getProjectOrderStates(this.projectId).subscribe({
      next: (states) => {
        this.projectStates = states;
      },
      error: (err) => console.error('Error loading states', err)
    });

    // Load Orders
    this.apiService.getProjectOrders(this.projectId).subscribe({
      next: (orders) => {
        this.allOrders = orders;
        this.applyFilters();
        this.updateTop3();
        this.isLoading = false;
        this.cd.markForCheck();
      },
      error: (err) => {
        console.error('Error loading orders', err);
        this.isLoading = false;
      }
    });
  }

  applyFilters() {
    let result = [...this.allOrders];

    if (this.selectedStateId) {
      result = result.filter(o => o.current_state_id == this.selectedStateId);
    }

    this.sortOrders(result);
    this.filteredOrders = result;
    this.cd.markForCheck();
  }

  sortOrders(list: Pedido[]) {
    list.sort((a, b) => {
      let valA: any = a[this.sortField];
      let valB: any = b[this.sortField];

      // Handle dates
      if (this.sortField === 'delivery_date' || this.sortField === 'created_at') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }

      if (valA < valB) return this.sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  onSort(field: 'delivery_date' | 'created_at' | 'id' | 'client_name') {
    if (this.sortField === field) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortOrder = 'asc'; // Default new sort to asc
    }
    this.applyFilters(); // Re-apply sort
  }

  onFilterChange() {
    this.applyFilters();
  }

  updateTop3() {
    // Top 3 closest future deliveries
    const now = new Date().getTime();
    this.top3Entregas = [...this.allOrders]
      .filter(o => o.delivery_date && new Date(o.delivery_date).getTime() >= now)
      .sort((a, b) => new Date(a.delivery_date).getTime() - new Date(b.delivery_date).getTime())
      .slice(0, 3);
  }

  getStateName(order: Pedido): string {
    return order.state?.name || 'Desconocido';
  }

  getStateClass(order: Pedido): string {
    const state = this.getStateName(order).toLowerCase();
    return state
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/\s+/g, '-'); // Replace spaces with hyphens
  }

  viewOrder(id: number) {
    this.router.navigate(['/gestion/pedidos', id]);
  }
}

