import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../services/api.service';

@Component({
  selector: 'app-detalle-pedido',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './detalle-pedido.component.html',
  styleUrl: './detalle-pedido.component.scss'
})
export class DetallePedidoComponent implements OnInit {
  order: any = null;
  projectStates: any[] = [];
  isLoading = true;
  isSaving = false;

  // Edit State
  projectId: number = 1;
  orderId: number | null = null;

  // Item Editing
  editingItemIndex: number | null = null;
  newItemBuilder: any = {
    description: '',
    quantity: 1,
    unit_price: 0,
    subItems: []
  };
  tempSubItem: any = { description: '', quantity: 1, unit_price: 0 };

  // History
  history: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private apiService: ApiService,
    private cd: ChangeDetectorRef
  ) { }

  ngOnInit() {
    const storedProjId = localStorage.getItem('currentProjectId');
    if (storedProjId) this.projectId = parseInt(storedProjId, 10);

    this.route.params.subscribe(params => {
      this.orderId = +params['id'];
      if (this.orderId) {
        this.loadData();
      }
    });
  }

  loadData() {
    this.isLoading = true;
    // Load States
    this.apiService.getProjectOrderStates(this.projectId).subscribe({
      next: (states) => this.projectStates = states
    });

    // Load Order
    if (this.orderId) {
      this.apiService.getOrder(this.projectId, this.orderId).subscribe({
        next: (data) => {
          this.order = data;
          this.isLoading = false;
          this.loadHistory();
          this.cd.markForCheck();
        },
        error: (err) => {
          console.error('Error loading order', err);
          this.isLoading = false;
        }
      });
    }
  }

  saveGeneralChanges() {
    if (!this.orderId || !this.order) return;
    this.isSaving = true;

    const payload = {
      current_state_id: this.order.current_state_id,
      notes: this.order.notes
    };

    this.apiService.updateOrder(this.projectId, this.orderId, payload).subscribe({
      next: (updated) => {
        this.order = updated;
        this.isSaving = false;
        this.loadHistory();
        alert('Cambios guardados correctamente');
      },
      error: (err) => {
        console.error('Error updating order', err);
        this.isSaving = false;
      }
    });
  }

  // --- Item Management --- //

  // Similar logic to CrearPedidoComponent but adapted for in-place editing of the order object

  deleteItem(index: number) {
    if (!confirm('¿Estás seguro de eliminar este item?')) return;
    this.order.items.splice(index, 1);
    this.saveItems(); // Auto-save on structural changes
  }

  saveItems() {
    if (!this.orderId) return;

    // Payload for items update
    const payload = {
      items: this.order.items.map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        attributes: item.attributes, // sub_items with image_url will be here
        operative_cost_id: item.operative_cost_id
      }))
    };

    console.log('Saving items payload:', payload);

    this.apiService.updateOrder(this.projectId, this.orderId, payload).subscribe({
      next: (updated) => {
        this.order = updated; // Refresh to get recalculated totals
        this.loadHistory();
        this.cd.markForCheck();
      },
      error: (err) => console.error('Error saving items', err)
    });
  }

  // --- Sub-Item Attachment Management ---

  uploadSubItemFile(itemIndex: number, subItemIndex: number, event: any) {
    const file = event.target.files[0];
    if (!file || !this.orderId) return;

    this.isSaving = true;
    this.apiService.uploadOrderFile(this.orderId, file).subscribe({
      next: (res) => {
        // Update the specific sub-item in the attributes
        const item = this.order.items[itemIndex];
        if (item.attributes && item.attributes.sub_items && item.attributes.sub_items[subItemIndex]) {
          item.attributes.sub_items[subItemIndex].image_url = res.url;
          this.saveItems(); // This persists the changes via attributes update
        }
        this.isSaving = false;
        alert("Archivo subido y asociado correctamente");
      },
      error: (err) => {
        console.error("Upload failed", err);
        alert("Error al subir archivo");
        this.isSaving = false;
      }
    });
  }

  // Remove Detail logic is no longer relevant as we attach to existing sub-items
  // Users delete sub-items via editing the item itself in current flow (or we assume sub-items come from creation)


  // Helper for Status Color

  // Helper for Status Color
  getStateClass(stateName: string | undefined): string {
    if (!stateName) return '';
    return stateName.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, '-');
  }

  getKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  loadHistory() {
    if (!this.orderId) return;
    this.apiService.getOrderHistory(this.orderId).subscribe({
      next: (data) => {
        this.history = data;
        this.cd.markForCheck();
      },
      error: (err) => console.error('Error loading history', err)
    });
  }

  // --- Image Viewer ---
  showImageViewer = false;
  currentImageUrl: string | null = null;

  openImageViewer(url: string) {
    this.currentImageUrl = url;
    this.showImageViewer = true;
  }

  closeImageViewer() {
    this.showImageViewer = false;
    this.currentImageUrl = null;
  }
}

