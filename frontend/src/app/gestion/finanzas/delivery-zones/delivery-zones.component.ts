import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../services/api.service';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MapZoneSelectorComponent } from './map-zone-selector/map-zone-selector.component';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-delivery-zones',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MapZoneSelectorComponent],
  templateUrl: './delivery-zones.component.html',
  styleUrl: './delivery-zones.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeliveryZonesComponent implements OnInit {
  zones: any[] = [];
  projectId: number = 1; // Default
  loading = true;
  showMapModal = false;
  editingZone: any = null;
  showHistoryModal = false;
  zoneHistory: any[] = [];
  selectedZoneName: string = '';

  private cd = inject(ChangeDetectorRef);

  constructor(private api: ApiService) { }

  ngOnInit() {
    const stored = localStorage.getItem('currentProjectId');
    if (stored) this.projectId = parseInt(stored, 10);
    this.loadZones();
  }

  loadZones() {
    this.loading = true;
    this.cd.detectChanges();
    this.api.getDeliveryZones(this.projectId).subscribe({
      next: (data) => {
        this.zones = data;
        this.loading = false;
        this.cd.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  addZone() {
    this.editingZone = null;
    this.showMapModal = true;
    this.cd.detectChanges();
  }

  editZone(zone: any) {
    this.editingZone = { ...zone };
    this.showMapModal = true;
    this.cd.detectChanges();
  }

  handleSaveZone(zoneData: any) {
    const payload = {
      ...zoneData,
      project_id: this.projectId,
      is_active: this.editingZone ? this.editingZone.is_active : true
    };

    const request = this.editingZone
      ? this.api.updateDeliveryZone(this.projectId, this.editingZone.id, payload)
      : this.api.createDeliveryZone(this.projectId, payload);

    request.subscribe({
      next: () => {
        const isEdit = !!this.editingZone;
        this.showMapModal = false;
        this.editingZone = null;
        Swal.fire({
          title: isEdit ? 'Actualizada' : 'Creada',
          text: `Zona ${isEdit ? 'actualizada' : 'creada'} correctamente`,
          icon: 'success',
          buttonsStyling: false,
          customClass: {
            confirmButton: 'btn-primary'
          }
        });
        this.loadZones();
        this.cd.detectChanges();
      }
    });
  }

  viewHistory(zone: any) {
    this.selectedZoneName = zone.name;
    this.api.getDeliveryZoneHistory(this.projectId, zone.id).subscribe({
      next: (history) => {
        this.zoneHistory = history;
        this.showHistoryModal = true;
        this.cd.detectChanges();
      }
    });
  }

  getChangedProperties(state: any): string[] {
    // This is a simplified version, it could be more sophisticated
    return Object.keys(state).filter(key =>
      ['name', 'price', 'zone_type', 'is_active'].includes(key)
    );
  }

  toggleZone(zone: any) {
    const updated = { ...zone, is_active: !zone.is_active, project_id: this.projectId };
    this.api.updateDeliveryZone(this.projectId, zone.id, updated).subscribe({
      next: () => {
        zone.is_active = !zone.is_active; // optimistic update
        this.cd.detectChanges();
      }
    });
  }
}
