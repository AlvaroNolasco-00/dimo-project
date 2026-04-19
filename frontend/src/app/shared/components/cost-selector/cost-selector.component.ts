import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuantityControlComponent } from '../quantity-control/quantity-control.component';

@Component({
  selector: 'app-cost-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, QuantityControlComponent],
  templateUrl: './cost-selector.component.html',
  styleUrl: './cost-selector.component.scss',
})
export class CostSelectorComponent {
  // Data
  @Input() costTypes: any[] = [];
  @Input() availableCosts: any[] = [];

  // Current selection state (parent-controlled)
  @Input() selectedCostTypeId: number | null = null;
  @Input() selectedCostId: number | null = null;
  @Input() selectedCost: any | null = null;

  // Loading flags
  @Input() isLoadingTypes = false;
  @Input() isLoadingCosts = false;
  @Input() isLoadingDerivedCosts = false;

  // Derived costs
  @Input() availableDerivedCosts: any[] = [];
  @Input() selectedDerivedCostIds: Set<number> = new Set();

  // Variant selections (object mutated in place; parent recalculates on variantChange)
  @Input() variantSelections: { [groupName: string]: any } = {};

  // Hint when parent has variants but none picked yet
  @Input() variantHintVisible = false;

  // Price display
  @Input() currentPrice = 0;
  @Input() description = '';

  // Footer config
  @Input() quantity = 1;
  @Input() showLabelInput = false;
  @Input() label = '';
  @Input() addButtonText = 'Agregar';
  @Input() addDisabled = false;

  // Label customization
  @Input() typeSelectLabel = 'Tipo de Costo';
  @Input() costSelectLabel = 'Costo';

  // Events
  @Output() costTypeChange = new EventEmitter<number | null>();
  @Output() costChange = new EventEmitter<number | null>();
  @Output() variantChange = new EventEmitter<void>();
  @Output() derivedCostToggle = new EventEmitter<number>();
  @Output() quantityChange = new EventEmitter<number>();
  @Output() labelChange = new EventEmitter<string>();
  @Output() add = new EventEmitter<void>();

  getEffectiveMargin(cost: any): number {
    const itemMargin = cost.attributes?.__profit_margin;
    if (itemMargin !== undefined && itemMargin !== null) return Number(itemMargin);
    const type = this.costTypes.find((t: any) => t.id === cost.cost_type_id);
    return Number(type?.profit_margin || 0);
  }

  isDerivedCostSelected(id: number): boolean {
    return this.selectedDerivedCostIds.has(id);
  }

  onVariantSelect(groupName: string, option: any) {
    this.variantSelections[groupName] = option;
    this.variantChange.emit();
  }
}
