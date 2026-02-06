import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { environment } from '../../../environments/environment';
import { switchMap, tap, debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
import * as L from 'leaflet';
import { AfterViewInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

// Fix for default Leaflet icons in Angular/Webpack
const iconRetinaUrl = 'assets/marker-icon-2x.png';
const iconUrl = 'assets/marker-icon.png';
const shadowUrl = 'assets/marker-shadow.png';
const iconDefault = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = iconDefault;

@Component({
  selector: 'app-order-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-view.html',
  styleUrl: './order-view.scss',
})
export class OrderViewComponent implements OnInit, AfterViewInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);

  token = signal<string>('');
  order = signal<any>(null);
  loading = signal<boolean>(true);
  deliveryZones = signal<any[]>([]);

  selectedZoneId = signal<number | null>(null);
  notes = signal<string>('');
  uploading = signal<boolean>(false);
  viewingImage = signal<string | null>(null);
  modalVisible = signal<boolean>(false);
  userLocation = signal<{ lat: number; lng: number } | null>(null);
  locationLoading = signal<boolean>(false);
  locationError = signal<string | null>(null);

  addressLoading = signal<boolean>(false);
  addressError = signal<string | null>(null);

  private map: L.Map | null = null;
  private polygons: { [key: number]: L.Polygon } = {};
  availableZones = signal<any[]>([]);

  private mapMove$ = new Subject<{ lat: number; lng: number }>();

  // Address fields
  addressStreet = signal<string>('');
  addressNumber = signal<string>('');
  addressColony = signal<string>('');
  addressCity = signal<string>('');
  addressReferences = signal<string>('');

  filteredZones = computed(() => {
    const zones = this.deliveryZones();
    const loc = this.userLocation();

    if (!loc) return zones;

    const filtered = zones.filter(zone => {
      // If zone has no coordinates, we show it (standard fallback)
      if (!zone.coordinates || !Array.isArray(zone.coordinates) || zone.coordinates.length < 3) {
        return true;
      }
      return this.isPointInPolygon(loc.lat, loc.lng, zone.coordinates);
    });

    // If filtering results in nothing, fallback to showing all active zones
    return filtered.length > 0 ? filtered : zones;
  });

  // Computed totals
  get subtotal() {
    const o = this.order();
    if (!o || !o.items) return 0;
    return o.items.reduce((acc: number, item: any) => acc + (parseFloat(item.subtotal) || 0), 0);
  }

  get deliveryCost() {
    if (!this.selectedZoneId()) return 0;
    const zone = this.deliveryZones().find(z => z.id === this.selectedZoneId());
    return zone ? parseFloat(zone.price) : 0;
  }

  get discount() {
    const o = this.order();
    if (!o || !o.coupon) return 0;
    const sub = this.subtotal;
    if (o.coupon.discount_type === 'PERCENTAGE') {
      return sub * (parseFloat(o.coupon.discount_value) / 100);
    }
    return parseFloat(o.coupon.discount_value);
  }

  get total() {
    return Math.max(0, (this.subtotal + this.deliveryCost) - this.discount);
  }

  ngOnInit() {
    this.route.params.pipe(
      tap(params => this.token.set(params['token'])),
      switchMap(params => this.api.getPublicOrder(params['token'])),
      tap(order => {
        this.order.set(this.processOrder(order));
        this.notes.set(order.notes || '');
        if (order.delivery_zone_id) {
          this.selectedZoneId.set(order.delivery_zone_id);
        }
        // Initialize address fields if they exist
        if (order.address_street) this.addressStreet.set(order.address_street);
        if (order.address_number) this.addressNumber.set(order.address_number);
        if (order.address_colony) this.addressColony.set(order.address_colony);
        if (order.address_city) this.addressCity.set(order.address_city);
        if (order.address_references) this.addressReferences.set(order.address_references);
      }),
      switchMap(order => this.api.getDeliveryZones(order.project_id))
    ).subscribe({
      next: (zones) => {
        this.deliveryZones.set((zones || []).filter((z: any) => z.is_active));
        this.loading.set(false);
        this.initMapDelayed();
      },
      error: (err) => {
        console.error(err);
        this.loading.set(false);
      }
    });

    // Initialize map move subscription for geocoding
    this.mapMove$.pipe(
      debounceTime(800),
      distinctUntilChanged((prev, curr) => prev.lat === curr.lat && prev.lng === curr.lng),
      filter(() => this.availableZones().length > 0),
      switchMap(coords => {
        this.addressLoading.set(true);
        this.addressError.set(null);
        return this.api.getReverseGeocoding(coords.lat, coords.lng);
      })
    ).subscribe({
      next: (res) => {
        this.addressLoading.set(false);
        if (res && res.address) {
          const addr = res.address;

          // Log for debugging
          console.log('Geocoding result:', addr);

          // Autofill fields
          // Road is the street
          this.addressStreet.set(addr.road || addr.pedestrian || addr.path || '');

          // House number
          this.addressNumber.set(addr.house_number || '');

          // Colony / Neighborhood
          this.addressColony.set(addr.suburb || addr.neighbourhood || addr.residential || addr.village || '');

          // City
          this.addressCity.set(addr.city || addr.town || addr.municipality || '');
        }
      },
      error: (err) => {
        console.error('Geocoding error:', err);
        this.addressLoading.set(false);
        this.addressError.set('No se pudo obtener la dirección automáticamente.');
      }
    });
  }

  ngAfterViewInit() {
    // Initialization is called after data is loaded in ngOnInit
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
  }

  private initMapDelayed() {
    // Wait for the DOM and Data to be ready
    setTimeout(() => this.initMap(), 100);
  }

  private initMap() {
    if (this.map || !document.getElementById('map')) return;

    const defaultLat = 13.6894; // San Salvador or project default
    const defaultLng = -89.1872;

    this.map = L.map('map', {
      center: [defaultLat, defaultLng],
      zoom: 13,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // Initial check on load
    const initialCenter = this.map.getCenter();
    this.checkZone(initialCenter.lat, initialCenter.lng);

    // Listen to map moves to update location based on center
    this.map.on('move', () => {
      const center = this.map!.getCenter();
      this.checkZone(center.lat, center.lng);
    });

    // Draw polygons for visual reference
    this.drawZones();

    // If user has a location stored or we can detect it
    if (this.order()?.lat && this.order()?.lng) {
      this.setMarkerPosition(this.order().lat, this.order().lng);
    } else {
      this.requestLocation(true);
    }
  }

  private drawZones() {
    if (!this.map) return;

    const colors = [
      '#4318FF', // Purple/Accent
      '#01B574', // Green
      '#FFB547', // Orange/Warning
      '#EE5D50', // Red/Danger
      '#3965FF', // Blue/Info
      '#7551FF', // Indigo
      '#00B5D8', // Cyan
      '#E31A1C', // Strong Red
      '#33A02C', // Forest Green
      '#FF7F00'  // Strong Orange
    ];

    this.deliveryZones().forEach((zone, index) => {
      if (zone.coordinates && Array.isArray(zone.coordinates) && zone.coordinates.length >= 3) {
        const color = colors[index % colors.length];

        L.polygon(zone.coordinates, {
          color: color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 2,
          dashArray: '5, 5'
        }).addTo(this.map!).bindTooltip(zone.name, {
          permanent: false,
          direction: 'center',
          className: 'zone-tooltip'
        });
      }
    });
  }

  private checkZone(lat: number, lng: number) {
    this.userLocation.set({ lat, lng });

    // Find ALL zones that contain this point
    const matchingZones = this.deliveryZones().filter(zone =>
      zone.coordinates && this.isPointInPolygon(lat, lng, zone.coordinates)
    );

    this.availableZones.set(matchingZones);

    // Logic for selection:
    if (matchingZones.length === 1) {
      // Auto-select if only one option
      this.selectedZoneId.set(matchingZones[0].id);
    } else if (matchingZones.length === 0) {
      // Clear if no coverage
      this.selectedZoneId.set(null);
    } else {
      // Multiple zones: If current selection is NOT in the new list, clear it
      const currentSelected = this.selectedZoneId();
      if (currentSelected && !matchingZones.some(z => z.id === currentSelected)) {
        this.selectedZoneId.set(null);
      }
      // If none selected yet, we wait for user choice
    }

    // Trigger geocoding via Subject
    this.mapMove$.next({ lat, lng });
  }

  getSelectedZoneName() {
    const zone = this.deliveryZones().find(z => z.id === this.selectedZoneId());
    return zone ? zone.name : '';
  }

  private processOrder(order: any) {
    if (order && order.items) {
      const baseUrl = environment.apiUrl.replace(/\/api$/, '');

      order.items = order.items.map((item: any) => {
        const artDetail = (item.details || []).find((d: any) => d.image_path);
        let previewUrl = null;

        if (artDetail && artDetail.image_path) {
          if (artDetail.image_path.startsWith('http')) {
            previewUrl = artDetail.image_path;
          } else {
            // Ensure we handle leading slashes correctly
            const path = artDetail.image_path.startsWith('/') ? artDetail.image_path : `/${artDetail.image_path}`;
            previewUrl = `${baseUrl}${path}`;
          }
        }

        return {
          ...item,
          has_art: !!artDetail,
          art_preview: previewUrl
        };
      });
    }
    return order;
  }

  onFileSelected(event: any, itemId?: number) {
    const file = event.target.files[0];
    if (!file || !this.token()) return;

    this.uploading.set(true);
    this.api.uploadPublicOrderFile(this.token(), file, itemId).pipe(
      switchMap(() => this.api.getPublicOrder(this.token()))
    ).subscribe({
      next: (updatedOrder) => {
        this.order.set(this.processOrder(updatedOrder));
        this.uploading.set(false);
        // We removed the alert to make it more fluid, or we could use a toast
      },
      error: () => {
        alert('Error al subir archivo');
        this.uploading.set(false);
      }
    });
  }

  submitOrder() {
    if (!this.selectedZoneId()) return;

    const payload = {
      notes: this.notes(),
      delivery_zone_id: this.selectedZoneId(),
      address_street: this.addressStreet(),
      address_number: this.addressNumber(),
      address_colony: this.addressColony(),
      address_city: this.addressCity(),
      address_references: this.addressReferences(),
      lat: this.userLocation()?.lat,
      lng: this.userLocation()?.lng
    };

    this.loading.set(true);
    this.api.updatePublicOrder(this.token(), payload).subscribe({
      next: (updatedOrder) => {
        this.order.set(this.processOrder(updatedOrder));
        this.loading.set(false);
        alert("¡Información actualizada con éxito! Tu pedido está siendo revisado.");
      },
      error: (err) => {
        console.error(err);
        this.loading.set(false);
        alert("Error al enviar orden");
      }
    });
  }

  openImage(url: string) {
    this.viewingImage.set(url);
    this.modalVisible.set(true);
  }

  closeImage() {
    this.modalVisible.set(false);
  }

  private setMarkerPosition(lat: number, lng: number) {
    if (this.map) {
      this.map.setView([lat, lng], 16);
      this.checkZone(lat, lng);
    }
  }

  requestLocation(highAccuracy: boolean = true) {
    if (!navigator.geolocation) {
      this.locationError.set('Tu navegador no soporta geolocalización');
      return;
    }

    // Only reset state if this is the first attempt (high accuracy)
    if (highAccuracy) {
      this.locationLoading.set(true);
      this.locationError.set(null);
      this.userLocation.set(null);
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.setMarkerPosition(lat, lng);
        this.locationLoading.set(false);
        this.locationError.set(null);
      },
      (err) => {
        console.warn(`Geolocation error (highAccuracy=${highAccuracy}):`, err.message);

        // If high accuracy fails, automatically try low accuracy (coarse)
        if (highAccuracy && (err.code === err.POSITION_UNAVAILABLE || err.code === err.TIMEOUT)) {
          console.log('Retrying with low accuracy...');
          this.requestLocation(false);
          return;
        }

        this.locationLoading.set(false);

        switch (err.code) {
          case err.PERMISSION_DENIED:
            this.locationError.set('Permiso denegado. Por favor, habilita el acceso a la ubicación.');
            break;
          case err.POSITION_UNAVAILABLE:
            this.locationError.set('No pudimos determinar tu ubicación exacta. Por favor selecciona tu zona manualmente.');
            break;
          case err.TIMEOUT:
            this.locationError.set('Se agotó el tiempo de espera para obtener tu ubicación.');
            break;
          default:
            this.locationError.set('Ocurrió un error inesperado al obtener tu ubicación.');
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: highAccuracy ? 5000 : 10000,
        maximumAge: 0
      }
    );
  }

  private isPointInPolygon(lat: number, lng: number, polygon: any[][]) {
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const latI = parseFloat(polygon[i][0] as any);
      const lngI = parseFloat(polygon[i][1] as any);
      const latJ = parseFloat(polygon[j][0] as any);
      const lngJ = parseFloat(polygon[j][1] as any);

      const intersect = ((latI > lat) !== (latJ > lat)) &&
        (lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI);
      if (intersect) isInside = !isInside;
    }
    return isInside;
  }
}
