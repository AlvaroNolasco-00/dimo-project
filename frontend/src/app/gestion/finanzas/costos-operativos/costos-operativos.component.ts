import { Component, inject, ChangeDetectorRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService, CostType, OperativeCost } from '../../../services/finance.service';
import { AuthService } from '../../../services/auth.service';
import { ModalComponent } from '../../../shared/components/modal/modal.component';
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
  imports: [CommonModule, FormsModule, ModalComponent],
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
  newTypeRequiresArt = false;
  newTypeProfitMargin = 0;
  editingTypeId: number | null = null;

  selectedTypeId: number | null = null;
  editingCostId: number | null = null;
  costMode: 'simple' | 'variants' | 'material' = 'simple';
  newCostBase: number = 0;
  newCostProfitMargin: number = 0;
  newCostAttributes: { key: string, value: string }[] = [];

  // Variant Mode Data
  variantGroups: { name: string, options: { label: string, priceMod: number }[] }[] = [];

  // Material Mode Data
  materialDims = { width: 0, height: 0, unit: 'cm' };

  // Derived Costs Data
  derivedCosts: OperativeCost[] = [];
  showDerivedForm = false;
  selectedDerivedTypeId: number | null = null;
  newDerivedBaseCost = 0;
  newDerivedVariantSelection = ''; // For backward compatibility if needed, but we'll use array
  selectedDerivedVariants: string[] = [];
  newDerivedDescription = '';

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
      Object.keys(c.attributes || {}).forEach(k => {
        if (!k.startsWith('__')) keys.add(k);
      });
    });
    this.typeColumns[typeId] = Array.from(keys);
  }

  // --- Cost Type Logic ---
  openTypeModal() {
    this.newTypeName = '';
    this.newTypeDesc = '';
    this.newTypeRequiresArt = false;
    this.newTypeProfitMargin = 0;
    this.editingTypeId = null;
    this.showTypeModal = true;
  }

  openEditTypeModal(type: CostType) {
    this.newTypeName = type.name;
    this.newTypeDesc = type.description;
    this.newTypeRequiresArt = type.requires_art;
    this.newTypeProfitMargin = type.profit_margin || 0;
    this.editingTypeId = type.id;
    this.showTypeModal = true;
  }

  closeTypeModal() {
    this.showTypeModal = false;
    this.editingTypeId = null;
  }

  saveType() {
    if (!this.newTypeName) return;
    const project = this.authService.currentProject();
    if (!project) return;

    if (this.editingTypeId) {
      this.financeService.updateCostType(this.editingTypeId, {
        name: this.newTypeName,
        description: this.newTypeDesc,
        requires_art: this.newTypeRequiresArt,
        profit_margin: this.newTypeProfitMargin
      }).subscribe(() => {
        this.loadData(project.id);
        this.closeTypeModal();
      });
    } else {
      this.financeService.createCostType({
        name: this.newTypeName,
        description: this.newTypeDesc,
        project_id: project.id,
        requires_art: this.newTypeRequiresArt,
        profit_margin: this.newTypeProfitMargin
      }).subscribe(() => {
        this.loadData(project.id);
        this.closeTypeModal();
      });
    }
  }

  // --- Cost Logic ---
  openCostModal(typeId: number) {
    this.selectedTypeId = typeId;
    this.editingCostId = null;
    this.newCostBase = 0;
    this.newCostProfitMargin = 0;
    this.costMode = 'simple';
    this.variantGroups = [];
    this.materialDims = { width: 0, height: 0, unit: 'cm' };

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

  // Variant Helpers
  addVariantGroup() {
    this.variantGroups.push({ name: '', options: [{ label: '', priceMod: 0 }] });
  }

  removeVariantGroup(index: number) {
    this.variantGroups.splice(index, 1);
  }

  addVariantOption(groupIndex: number) {
    this.variantGroups[groupIndex].options.push({ label: '', priceMod: 0 });
  }

  removeVariantOption(groupIndex: number, optionIndex: number) {
    this.variantGroups[groupIndex].options.splice(optionIndex, 1);
  }

  async saveCost() {
    if (!this.selectedTypeId) return;

    const attributes: any = {};
    this.newCostAttributes.forEach(attr => {
      if (attr.key) attributes[attr.key] = attr.value;
    });

    // Add Metadata based on Mode
    if (this.costMode === 'variants') {
      attributes['__type'] = 'variants';
      attributes['__config'] = { groups: this.variantGroups };
    } else if (this.costMode === 'material') {
      attributes['__type'] = 'material';
      attributes['__config'] = { dims: this.materialDims };
    }

    if (this.newCostProfitMargin > 0) {
      attributes['__profit_margin'] = this.newCostProfitMargin;
    } else {
      delete attributes['__profit_margin'];
    }

    const payload = {
      cost_type_id: this.selectedTypeId,
      base_cost: this.newCostBase,
      attributes: attributes
    };

    if (this.editingCostId) {
      // Edit Mode
      this.financeService.updateCost(this.editingCostId, payload).subscribe(() => {
        Swal.fire('Guardado', 'El costo ha sido actualizado.', 'success');
        this.refreshData();
        this.closeCostModal();
      });
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
    this.newCostProfitMargin = cost.attributes?.['__profit_margin'] || 0;

    // Detect Mode
    const attrs = cost.attributes || {};
    if (attrs['__type'] === 'variants') {
      this.costMode = 'variants';
      this.variantGroups = attrs['__config']?.groups || [];
    } else if (attrs['__type'] === 'material') {
      this.costMode = 'material';
      this.materialDims = attrs['__config']?.dims || { width: 0, height: 0, unit: 'cm' };
    } else {
      this.costMode = 'simple';
      this.variantGroups = [];
      this.materialDims = { width: 0, height: 0, unit: 'cm' };
    }

    // Convert attributes object to array for form, filtering metadata
    this.newCostAttributes = [];
    Object.keys(attrs).forEach(key => {
      if (!key.startsWith('__')) {
        this.newCostAttributes.push({ key, value: attrs[key] });
      }
    });

    // Ensure at least one empty if none
    if (this.newCostAttributes.length === 0) {
      this.newCostAttributes.push({ key: '', value: '' });
    }

    this.showCostModal = true;
    this.loadDerivedCosts(cost.id);
  }

  loadDerivedCosts(parentId: number) {
    this.financeService.getCosts(undefined, parentId).subscribe(costs => {
      this.derivedCosts = costs;
    });
  }

  toggleDerivedForm() {
    this.showDerivedForm = !this.showDerivedForm;
    this.selectedDerivedTypeId = null;
    this.newDerivedBaseCost = 0;
    this.newDerivedVariantSelection = '';
    this.selectedDerivedVariants = [];
    this.newDerivedDescription = '';
  }

  saveDerivedCost() {
    if (!this.editingCostId || !this.selectedDerivedTypeId) return;

    this.financeService.createCost({
      cost_type_id: this.selectedDerivedTypeId,
      base_cost: this.newDerivedBaseCost,
      parent_cost_id: this.editingCostId,
      attributes: {
        '__dependent_variants': this.selectedDerivedVariants,
        'Descripción': this.newDerivedDescription,
        '__type': 'derived'
      }
    }).subscribe(() => {
      this.loadDerivedCosts(this.editingCostId!);
      this.toggleDerivedForm();
    });
  }

  deleteDerivedCost(id: number) {
    this.financeService.deleteCost(id).subscribe(() => {
      if (this.editingCostId) this.loadDerivedCosts(this.editingCostId);
    });
  }

  getAvailableVariants(): string[] {
    const variants: string[] = [];
    this.variantGroups.forEach(group => {
      group.options.forEach(opt => {
        variants.push(`${group.name}: ${opt.label}`);
      });
    });
    return variants;
  }

  getTypeName(typeId: number): string {
    return this.costTypes.find(t => t.id === typeId)?.name || 'Desconocido';
  }

  toggleVariantSelection(variant: string) {
    const index = this.selectedDerivedVariants.indexOf(variant);
    if (index === -1) {
      this.selectedDerivedVariants.push(variant);
    } else {
      this.selectedDerivedVariants.splice(index, 1);
    }
  }

  isVariantSelected(variant: string): boolean {
    return this.selectedDerivedVariants.includes(variant);
  }

  getEffectiveMargin(cost: OperativeCost): number {
    const itemMargin = cost.attributes?.['__profit_margin'];
    if (itemMargin !== undefined && itemMargin !== null) return Number(itemMargin);
    const type = this.costTypes.find(t => t.id === cost.cost_type_id);
    return Number(type?.profit_margin || 0);
  }

  getFinalPrice(cost: OperativeCost): number {
    return Number(cost.base_cost) * (1 + this.getEffectiveMargin(cost) / 100);
  }

  get computedFinalPrice(): number {
    return this.newCostBase * (1 + this.newCostProfitMargin / 100);
  }
}


