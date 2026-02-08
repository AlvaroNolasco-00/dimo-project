import { Component, EventEmitter, Input, OnInit, Output, OnDestroy, AfterViewInit, OnChanges, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { MoneyMaskDirective } from '../../../../directives/money-mask.directive';


@Component({
  selector: 'app-map-zone-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyMaskDirective],

  templateUrl: './map-zone-selector.component.html',
  styleUrl: './map-zone-selector.component.scss'
})
export class MapZoneSelectorComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @Input() open = false;
  @Input() zone: any = null;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<any>();

  zoneName = '';
  zonePrice: number = 0;
  zoneType = 'STANDARD_PAID';
  changeReason = '';

  private map: L.Map | null = null;
  private polygon: L.Polygon | null = null;
  private markers: L.Marker[] = [];
  coordinates: L.LatLng[] = [];

  private cdr = inject(ChangeDetectorRef);

  constructor() { }

  ngOnInit() { }

  ngAfterViewInit() {
    if (this.open) {
      this.initMap();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['open']) {
      if (this.open) {
        if (!this.map) {
          setTimeout(() => this.initMap(), 100);
        } else if (this.zone) {
          this.loadExistingZone();
        }
      } else {
        this.destroyMap();
      }
    } else if (this.open && changes['zone'] && this.zone) {
      this.loadExistingZone();
    }
  }

  destroyMap() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.markers = [];
    this.polygon = null;
    this.coordinates = [];
  }

  initMap() {
    if (this.map) return;

    // Fix Leaflet default icon paths
    const DefaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      tooltipAnchor: [16, -28],
      shadowSize: [41, 41]
    });
    L.Marker.prototype.options.icon = DefaultIcon;

    // Default center (can be adjusted or passed as input)
    const lat = 13.6893;
    const lng = -89.1872;

    this.map = L.map('map-container').setView([lat, lng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.addPoint(e.latlng);
    });

    if (this.zone) {
      this.loadExistingZone();
    }
  }

  loadExistingZone() {
    if (!this.zone || !this.map) return;
    this.map.invalidateSize();

    this.clearMap();
    this.zoneName = this.zone.name;
    this.zonePrice = this.zone.price;
    this.zoneType = this.zone.zone_type;

    let coords = this.zone.coordinates;
    if (typeof coords === 'string') {
      try {
        coords = JSON.parse(coords);
      } catch (e) {
        console.error('Error parsing zone coordinates', e);
        coords = [];
      }
    }

    if (coords && Array.isArray(coords)) {
      coords.forEach((coord: any) => {
        // Handle both [lat, lng] and {lat, lng} formats
        const latlng = Array.isArray(coord) ? L.latLng(coord[0], coord[1]) : L.latLng(coord.lat, coord.lng);
        this.addPoint(latlng);
      });

      // Fit map to polygon
      if (this.polygon) {
        this.map.fitBounds(this.polygon.getBounds());
      }
    }

    // Trigger change detection to ensure fields are updated in the UI
    this.changeReason = ''; // Reset reason when loading
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 0);
  }

  addPoint(latlng: L.LatLng) {
    if (!this.map) return;

    this.coordinates.push(latlng);

    // Add visual marker
    const marker = L.marker(latlng, {
      draggable: true
    }).addTo(this.map);

    marker.on('drag', () => {
      this.updatePolygon();
    });

    this.markers.push(marker);
    this.updatePolygon();
  }

  updatePolygon() {
    if (!this.map) return;

    const latlngs = this.markers.map(m => m.getLatLng());

    if (this.polygon) {
      this.polygon.setLatLngs(latlngs);
    } else if (latlngs.length > 2) {
      this.polygon = L.polygon(latlngs, { color: 'var(--accent-color)' }).addTo(this.map);
    }
    this.coordinates = latlngs;
  }

  clearMap() {
    this.markers.forEach(m => m.remove());
    this.markers = [];
    this.coordinates = [];
    if (this.polygon) {
      this.polygon.remove();
      this.polygon = null;
    }
  }

  onSave() {
    if (!this.zoneName) return;
    if (this.coordinates.length < 3) {
      // Need at least 3 points for a polygon
      return;
    }

    this.save.emit({
      name: this.zoneName,
      price: this.zonePrice,
      zone_type: this.zoneType,
      coordinates: this.coordinates.map(c => [c.lat, c.lng]),
      change_reason: this.changeReason
    });

    this.onClose();
  }

  onClose() {
    this.close.emit();
    this.resetForm();
  }

  resetForm() {
    this.zoneName = '';
    this.zonePrice = 0;
    this.zoneType = 'STANDARD_PAID';
    this.changeReason = '';
    this.clearMap();
  }

  ngOnDestroy() {
    this.destroyMap();
  }
}
