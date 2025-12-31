import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService, CostType, OperativeCost } from '../../../services/finance.service';

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
  newCostBase: number = 0;
  newCostAttributes: { key: string, value: string }[] = [];

  private financeService = inject(FinanceService);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.financeService.getCostTypes().subscribe((types: CostType[]) => {
      this.costTypes = types;
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
    this.financeService.createCostType({ name: this.newTypeName, description: this.newTypeDesc })
      .subscribe(() => {
        this.loadData();
        this.closeTypeModal();
      });
  }

  // --- Cost Logic ---
  openCostModal(typeId: number) {
    this.selectedTypeId = typeId;
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
  }

  addAttribute() {
    this.newCostAttributes.push({ key: '', value: '' });
  }

  removeAttribute(index: number) {
    this.newCostAttributes.splice(index, 1);
  }

  saveCost() {
    if (!this.selectedTypeId) return;

    const attributes: any = {};
    this.newCostAttributes.forEach(attr => {
      if (attr.key) attributes[attr.key] = attr.value;
    });

    this.financeService.createCost({
      cost_type_id: this.selectedTypeId,
      base_cost: this.newCostBase,
      attributes: attributes
    }).subscribe(() => {
      // Reload specific type logic could be optimized, but reloading all is safer for now
      this.loadData();
      this.closeCostModal();
    });
  }

  // --- Edit Logic (Placeholder for now) ---
  editCost(cost: any) {
    // Ideally open simple prompt or reuse modal
    alert('Edit functionality ID: ' + cost.id);
  }
}


