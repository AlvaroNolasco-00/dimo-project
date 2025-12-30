import { Component, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as L from 'leaflet';

@Component({
  selector: 'app-crear-pedido',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crear-pedido.component.html',
  styleUrl: './crear-pedido.component.scss'
})
export class CrearPedidoComponent implements AfterViewInit {
  nuevoPedido = {
    cliente: '',
    fechaEntrega: '',
    etapa: 'Producción',
    notas: '',
    ubicacion: { lat: 0, lng: 0 },
    direccion: ''
  };

  etapas = ['Producción', 'Diseño', 'Empaquetado', 'Enviado'];

  private map!: L.Map;
  private marker: L.Marker | null = null;
  searchQuery: string = '';

  constructor(private router: Router) { }

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
    // Logic to save order would go here
    this.router.navigate(['/gestion/pedidos']);
  }

  cancelar() {
    this.router.navigate(['/gestion/pedidos']);
  }
}

