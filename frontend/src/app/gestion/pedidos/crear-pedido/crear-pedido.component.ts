import { Component, AfterViewInit, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../../services/api.service';
import * as L from 'leaflet';

@Component({
  selector: 'app-crear-pedido',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crear-pedido.component.html',
  styleUrl: './crear-pedido.component.scss'
})
export class CrearPedidoComponent implements AfterViewInit, OnInit {
  nuevoPedido = {
    cliente: '',
    fechaEntrega: '',
    notas: '',
    ubicacion: { lat: 0, lng: 0 },
    direccion: '',
    // This will now be an ID
    current_state_id: null as number | null
  };

  // State management
  projectStates: any[] = [];
  projectId: number = 1; // Default or fetch from service/store

  // Cost management
  costTypes: any[] = [];
  availableOperativeCosts: any[] = [];

  // Item management
  items: any[] = [];
  newItem = {
    description: '',
    quantity: 1,
    unit_price: 0,
    attributes: {},   // e.g. { size: 'L', position: 'Back' }
    cost_type_id: null as number | null,
    operative_cost_id: null as number | null
  };

  // Totals
  totalAmount: number = 0;

  private map!: L.Map;
  private marker: L.Marker | null = null;
  searchQuery: string = '';

  // Loading States
  isLoadingStates = false;
  isLoadingTypes = false;
  isLoadingCosts = false;
  isSaving = false;
  isSearchingAddress = false;

  constructor(
    private router: Router,
    private apiService: ApiService
  ) { }

  ngOnInit(): void {
    // Try to get project ID from local storage or service if available
    const storedProjId = localStorage.getItem('currentProjectId');
    if (storedProjId) {
      this.projectId = parseInt(storedProjId, 10);
    }

    this.loadProjectStates();
    this.loadCostTypes();
  }

  loadProjectStates() {
    this.isLoadingStates = true;
    this.apiService.getProjectOrderStates(this.projectId).subscribe({
      next: (states) => {
        this.projectStates = states;
        // Set default state if available (e.g., 'Creado')
        const defaultState = states.find(s => s.name === 'Creado');
        if (defaultState) {
          this.nuevoPedido.current_state_id = defaultState.id;
        }
        this.isLoadingStates = false;
      },
      error: (err) => {
        console.error('Error loading states', err);
        this.isLoadingStates = false;
      }
    });
  }

  loadCostTypes() {
    this.isLoadingTypes = true;
    this.apiService.getCostTypes(this.projectId).subscribe({
      next: (types) => {
        this.costTypes = types;
        this.isLoadingTypes = false;
      },
      error: (err) => {
        console.error('Error loading cost types', err);
        this.isLoadingTypes = false;
      }
    });
  }

  // --- Item Logic ---

  onCostTypeChange() {
    // Reset operative cost selection when type changes
    this.newItem.operative_cost_id = null;
    this.newItem.unit_price = 0;
    this.availableOperativeCosts = [];

    if (this.newItem.cost_type_id) {
      this.isLoadingCosts = true;
      this.apiService.getOperativeCosts(this.newItem.cost_type_id).subscribe({
        next: (costs) => {
          this.availableOperativeCosts = costs;
          this.isLoadingCosts = false;
        },
        error: (err) => {
          console.error('Error loading operative costs', err);
          this.isLoadingCosts = false;
        }
      });
    }
  }

  onOperativeCostChange() {
    const selectedCost = this.availableOperativeCosts.find(c => c.id == this.newItem.operative_cost_id);

    if (selectedCost) {
      this.newItem.unit_price = parseFloat(selectedCost.base_cost);

      // Optionally auto-fill description with cost name + type? 
      // Since OperativeCost doesn't have a name itself (it's linked to CostType + attributes), 
      // we might want to construct a description or just rely on the user.
      // However, the requirement says "el item del tipo de costo".
      // If OperativeCost has attributes like 'Size: L', we can format that.

      let desc = '';
      const type = this.costTypes.find(t => t.id == this.newItem.cost_type_id);
      if (type) desc += type.name;

      if (selectedCost.attributes) {
        const attrs = Object.values(selectedCost.attributes).join(' ');
        if (attrs) desc += ` - ${attrs}`;
      }
      this.newItem.description = desc;
    } else {
      this.newItem.unit_price = 0;
    }
  }

  addItem() {
    if (!this.newItem.description || this.newItem.quantity <= 0) return;

    const subtotal = this.newItem.quantity * this.newItem.unit_price;

    this.items.push({
      ...this.newItem,
      subtotal: subtotal
    });

    this.calculateTotal();
    this.resetNewItem();
  }

  removeItem(index: number) {
    this.items.splice(index, 1);
    this.calculateTotal();
  }

  calculateTotal() {
    this.totalAmount = this.items.reduce((acc, item) => acc + item.subtotal, 0);
  }

  resetNewItem() {
    this.newItem = {
      description: '',
      quantity: 1,
      unit_price: 0,
      attributes: {},
      cost_type_id: null,
      operative_cost_id: null
    };
    this.availableOperativeCosts = [];
  }

  // --- Map Logic ---

  ngAfterViewInit(): void {
    this.initMap();
  }

  private initMap(): void {
    // Center map on a default location (e.g., Mexico City or user location)
    // Using Mexico City coordinates as default: 19.4326, -99.1332
    this.map = L.map('map').setView([19.4326, -99.1332], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.addMarker(e.latlng.lat, e.latlng.lng);
    });
  }

  private addMarker(lat: number, lng: number): void {
    if (this.marker) {
      this.map.removeLayer(this.marker);
    }

    const icon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    this.marker = L.marker([lat, lng], { icon }).addTo(this.map);
    this.nuevoPedido.ubicacion = { lat, lng };

    // Reverse geocoding could go here to get address from coordinates if desired
  }

  async searchAddress() {
    if (!this.searchQuery) return;

    this.isSearchingAddress = true;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(this.searchQuery)}`);
      const data = await response.json();

      if (data && data.length > 0) {
        const result = data[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);

        this.map.setView([lat, lng], 16);
        this.addMarker(lat, lng);
        this.nuevoPedido.direccion = result.display_name;
      }
    } catch (error) {
      console.error('Error searching address:', error);
    } finally {
      this.isSearchingAddress = false;
    }
  }

  guardarPedido() {
    console.log('Guardando pedido:', this.nuevoPedido);
    this.isSaving = true;

    // Construct payload
    const payload = {
      project_id: this.projectId,
      client_name: this.nuevoPedido.cliente,
      delivery_date: this.nuevoPedido.fechaEntrega ? new Date(this.nuevoPedido.fechaEntrega) : null,
      shipping_address: this.nuevoPedido.direccion,
      location_lat: this.nuevoPedido.ubicacion.lat,
      location_lng: this.nuevoPedido.ubicacion.lng,
      notes: this.nuevoPedido.notas,
      current_state_id: this.nuevoPedido.current_state_id,
      items: this.items
    };

    this.apiService.createOrder(this.projectId, payload).subscribe({
      next: (res) => {
        console.log('Order created', res);
        this.isSaving = false;
        this.router.navigate(['/gestion/pedidos']);
      },
      error: (err) => {
        console.error('Error creating order', err);
        // Ideally show a toast/alert here
        this.isSaving = false;
      }
    });
  }

  cancelar() {
    this.router.navigate(['/gestion/pedidos']);
  }
}

