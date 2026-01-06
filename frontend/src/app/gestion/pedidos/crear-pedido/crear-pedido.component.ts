import { Component, AfterViewInit, OnInit, ChangeDetectorRef } from '@angular/core';
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

  // New Item (The Composite Item)
  newItem = {
    quantity: 1,
    unit_price: 0,
    description: '', // Can be auto-generated or manual
    subItems: [] as any[] // List of { description, quantity, unit_price, cost_type_id, operative_cost_id, attributes }
  };

  editingItemIndex: number | null = null;

  // Temporary Sub-Item (The part being added to the Composite Item)
  tempSubItem = {
    quantity: 1,
    unit_price: 0,
    cost_type_id: null as number | null,
    operative_cost_id: null as number | null,
    description: '',
    attributes: {}
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
    private apiService: ApiService,
    private cd: ChangeDetectorRef
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
        this.cd.markForCheck();
      },
      error: (err) => {
        console.error('Error loading states', err);
        this.isLoadingStates = false;
        this.cd.markForCheck();
      }
    });
  }

  loadCostTypes() {
    this.isLoadingTypes = true;
    this.apiService.getCostTypes(this.projectId).subscribe({
      next: (types) => {
        this.costTypes = types;
        this.isLoadingTypes = false;
        this.cd.markForCheck();
      },
      error: (err) => {
        console.error('Error loading cost types', err);
        this.isLoadingTypes = false;
        this.cd.markForCheck();
      }
    });
  }

  // --- Item Logic ---

  // --- Item Logic ---

  onCostTypeChange() {
    // Reset operative cost selection when type changes
    this.tempSubItem.operative_cost_id = null;
    this.tempSubItem.unit_price = 0;
    this.availableOperativeCosts = [];

    if (this.tempSubItem.cost_type_id) {
      this.isLoadingCosts = true;
      this.apiService.getOperativeCosts(this.tempSubItem.cost_type_id).subscribe({
        next: (costs) => {
          this.availableOperativeCosts = costs;
          this.isLoadingCosts = false;
          this.cd.markForCheck();
        },
        error: (err) => {
          console.error('Error loading operative costs', err);
          this.isLoadingCosts = false;
          this.cd.markForCheck();
        }
      });
    }
  }

  onOperativeCostChange() {
    const selectedCost = this.availableOperativeCosts.find(c => c.id == this.tempSubItem.operative_cost_id);

    if (selectedCost) {
      this.tempSubItem.unit_price = parseFloat(selectedCost.base_cost);

      let desc = '';
      const type = this.costTypes.find(t => t.id == this.tempSubItem.cost_type_id);
      if (type) desc += type.name;

      if (selectedCost.attributes) {
        // Clone attributes to tempSubItem so we can save them
        this.tempSubItem.attributes = { ...selectedCost.attributes };
        const attrs = Object.values(selectedCost.attributes).join(' ');
        if (attrs) desc += ` - ${attrs}`;
      } else {
        this.tempSubItem.attributes = {};
      }
      this.tempSubItem.description = desc;
    } else {
      this.tempSubItem.unit_price = 0;
      this.tempSubItem.description = '';
      this.tempSubItem.attributes = {};
    }
  }

  addSubItem() {
    if (!this.tempSubItem.operative_cost_id || this.tempSubItem.quantity <= 0) return;

    // Add to subItems list
    this.newItem.subItems.push({ ...this.tempSubItem });

    // Update composite item price
    this.updateCompositeItemPrice();

    // Reset temp sub-item, but keep cost type logic if desired? 
    // Best to reset fully to allow adding a different type next
    this.resetTempSubItem();
  }

  removeSubItem(index: number) {
    this.newItem.subItems.splice(index, 1);
    this.updateCompositeItemPrice();
  }

  updateCompositeItemPrice() {
    // The unit price of the Composite Item is the sum of (subItem.price * subItem.qty)
    const compositeUnitPrice = this.newItem.subItems.reduce((acc, sub) => acc + (sub.unit_price * sub.quantity), 0);
    this.newItem.unit_price = compositeUnitPrice;

    // Auto-generate description if empty or simple
    this.generateCompositeDescription();
  }

  generateCompositeDescription() {
    // Example: "2 Camisa M, 1 Estampado"
    const parts = this.newItem.subItems.map(s => `${s.quantity} ${s.description}`);
    this.newItem.description = parts.join(', ');
  }

  resetTempSubItem() {
    this.tempSubItem = {
      quantity: 1,
      unit_price: 0,
      cost_type_id: null,
      operative_cost_id: null,
      description: '',
      attributes: {}
    };
    // Don't necessarily clear availableOperativeCosts if we want to keep selecting from same type, 
    // but looking at UI flow, valid to reset.
    this.availableOperativeCosts = [];
  }

  addItem() {
    if (this.newItem.subItems.length === 0 || this.newItem.quantity <= 0) return;

    const subtotal = this.newItem.quantity * this.newItem.unit_price;

    const itemPayload = {
      description: this.newItem.description,
      quantity: this.newItem.quantity,
      unit_price: this.newItem.unit_price,
      subtotal: subtotal,
      // We store the subItems structure in 'attributes' to persist it without backend changes
      attributes: {
        is_composite: true,
        sub_items: this.newItem.subItems
      },
      // These are null because it's a composite item, not a single operative cost
      cost_type_id: null,
      operative_cost_id: null
    };

    if (this.editingItemIndex !== null) {
      // Update existing item
      this.items[this.editingItemIndex] = itemPayload;
    } else {
      // Add new item
      this.items.push(itemPayload);
    }

    this.calculateTotal();
    this.resetNewItem();
  }

  editItem(index: number) {
    const item = this.items[index];

    // Copy main item props
    this.newItem = {
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      // Deep copy sub-items to avoid reference issues while editing
      subItems: JSON.parse(JSON.stringify(item.attributes.sub_items || []))
    };

    this.editingItemIndex = index;

    // Reset temp sub builder
    this.resetTempSubItem();

    // Scroll to form (optional UX improvement)
    const form = document.querySelector('.add-item-container');
    if (form) form.scrollIntoView({ behavior: 'smooth' });
  }

  cancelEdit() {
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
      quantity: 1,
      unit_price: 0,
      description: '',
      subItems: []
    };
    this.editingItemIndex = null;
    this.resetTempSubItem();
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

