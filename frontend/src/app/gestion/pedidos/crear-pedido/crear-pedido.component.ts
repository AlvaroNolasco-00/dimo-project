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

  // Item management
  items: any[] = [];
  newItem = {
    description: '',
    quantity: 1,
    unit_price: 0,
    attributes: {}   // e.g. { size: 'L', position: 'Back' }
  };

  // Totals
  totalAmount: number = 0;

  private map!: L.Map;
  private marker: L.Marker | null = null;
  searchQuery: string = '';

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
  }

  loadProjectStates() {
    this.apiService.getProjectOrderStates(this.projectId).subscribe({
      next: (states) => {
        this.projectStates = states;
        // Set default state if available (e.g., 'Creado')
        const defaultState = states.find(s => s.name === 'Creado');
        if (defaultState) {
          this.nuevoPedido.current_state_id = defaultState.id;
        }
      },
      error: (err) => console.error('Error loading states', err)
    });
  }

  // --- Item Logic ---

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
      attributes: {}
    };
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
    }
  }

  guardarPedido() {
    console.log('Guardando pedido:', this.nuevoPedido);

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
        this.router.navigate(['/gestion/pedidos']);
      },
      error: (err) => {
        console.error('Error creating order', err);
        // Ideally show a toast/alert here
      }
    });
  }

  cancelar() {
    this.router.navigate(['/gestion/pedidos']);
  }
}

