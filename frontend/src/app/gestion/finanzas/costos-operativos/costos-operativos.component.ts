import { Component, inject, ChangeDetectorRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService, CostType, OperativeCost } from '../../../services/finance.service';
import { AuthService } from '../../../services/auth.service';
import Swal from 'sweetalert2';

export interface CamisaCost {
  talla: string;
  material: string;
  tipo: string;
  infoAdicional: string;
  costo: number;
}

export interface EstampadoCost {
  posicion: string;
  tamano: string;
  costo: number;
}

@Component({
  selector: 'app-costos-operativos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './costos-operativos.component.html',
  styleUrl: './costos-operativos.component.scss'
})

export class CostosOperativosComponent {
  costTypes: CostType[] = [];
  groupedCosts: { [key: number]: OperativeCost[] } = {};
  typeColumns: { [key: number]: string[] } = {};

  showTypeModal = false;
  showCostModal = false;

  // Forms
  newTypeName = '';
  newTypeDesc = '';

  selectedTypeId: number | null = null;
  editingCostId: number | null = null;
  newCostBase: number = 0;
  newCostAttributes: { key: string, value: string }[] = [];

  private financeService = inject(FinanceService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  constructor() {
    effect(() => {
      const project = this.authService.currentProject();
      if (project) {
        this.loadData(project.id);
      } else {
        this.costTypes = [];
        this.groupedCosts = {};
      }
    });
  }

  loadData(projectId: number) {
    this.financeService.getCostTypes(projectId).subscribe((types: CostType[]) => {
      this.costTypes = types;
      this.groupedCosts = {}; // Clear previous data
      this.typeColumns = {};

      this.costTypes.forEach(type => {
        this.financeService.getCosts(type.id).subscribe((costs: OperativeCost[]) => {
          this.groupedCosts[type.id] = costs;
          this.updateColumns(type.id);
          this.cdr.detectChanges();
        });
      });
      this.cdr.detectChanges();
    });
  }

  updateColumns(typeId: number) {
    const costs = this.groupedCosts[typeId] || [];
    const keys = new Set<string>();
    costs.forEach(c => {
      Object.keys(c.attributes || {}).forEach(k => keys.add(k));
    });
    this.typeColumns[typeId] = Array.from(keys);
  }

  // --- Cost Type Logic ---
  openTypeModal() {
    this.newTypeName = '';
    this.newTypeDesc = '';
    this.showTypeModal = true;
  }

  closeTypeModal() {
    this.showTypeModal = false;
  }

  saveType() {
    if (!this.newTypeName) return;
    const project = this.authService.currentProject();
    if (!project) return;

    this.financeService.createCostType({
      name: this.newTypeName,
      description: this.newTypeDesc,
      project_id: project.id
    })
      .subscribe(() => {
        this.loadData(project.id);
        this.closeTypeModal();
      });
  }

  // --- Cost Logic ---
  openCostModal(typeId: number) {
    this.selectedTypeId = typeId;
    this.editingCostId = null;
    this.newCostBase = 0;

    // Pre-fill attributes based on existing columns
    this.newCostAttributes = (this.typeColumns[typeId] || []).map(key => ({ key, value: '' }));
    if (this.newCostAttributes.length === 0) {
      this.newCostAttributes.push({ key: '', value: '' });
    }

    this.showCostModal = true;
  }

  closeCostModal() {
    this.showCostModal = false;
    this.selectedTypeId = null;
    this.editingCostId = null;
  }

  addAttribute() {
    this.newCostAttributes.push({ key: '', value: '' });
  }

  removeAttribute(index: number) {
    this.newCostAttributes.splice(index, 1);
  }

  async saveCost() {
    if (!this.selectedTypeId) return;

    const attributes: any = {};
    this.newCostAttributes.forEach(attr => {
      if (attr.key) attributes[attr.key] = attr.value;
    });

    const payload = {
      cost_type_id: this.selectedTypeId,
      base_cost: this.newCostBase,
      attributes: attributes
    };

    if (this.editingCostId) {
      // Edit Mode
      const result = await Swal.fire({
        title: '¿Confirmar edición?',
        text: "Se actualizarán los datos del costo.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Sí, guardar',
        cancelButtonText: 'Cancelar'
      });

      if (result.isConfirmed) {
        this.financeService.updateCost(this.editingCostId, payload).subscribe(() => {
          Swal.fire('Guardado', 'El costo ha sido actualizado.', 'success');
          this.refreshData();
          this.closeCostModal();
        });
      }
    } else {
      // Create Mode
      this.financeService.createCost(payload).subscribe(() => {
        this.refreshData();
        this.closeCostModal();
      });
    }
  }

  async deleteCost(costId: number) {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: "No podrás revertir esta acción",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      this.financeService.deleteCost(costId).subscribe(() => {
        Swal.fire('Eliminado!', 'El costo ha sido eliminado.', 'success');
        this.refreshData();
      });
    }
  }

  private refreshData() {
    const project = this.authService.currentProject();
    if (project) this.loadData(project.id);
  }

  get isAdmin() {
    return this.authService.isAdmin();
  }

  editCost(cost: OperativeCost) {
    this.selectedTypeId = cost.cost_type_id;
    this.editingCostId = cost.id;
    this.newCostBase = cost.base_cost;

    // Convert attributes object to array for form
    this.newCostAttributes = [];
    if (cost.attributes) {
      Object.keys(cost.attributes).forEach(key => {
        this.newCostAttributes.push({ key, value: cost.attributes[key] });
      });
    }

    // Ensure at least one empty if none
    if (this.newCostAttributes.length === 0) {
      this.newCostAttributes.push({ key: '', value: '' });
    }

    this.showCostModal = true;
  }
}


