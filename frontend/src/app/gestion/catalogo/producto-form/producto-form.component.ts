import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { CatalogService, ProductCategory, ProductCostLineCreate } from '../../../services/catalog.service';
import { FinanceService, CostType, OperativeCost } from '../../../services/finance.service';
import { ProjectService } from '../../../services/project.service';
import { environment } from '../../../../environments/environment';
import { CostSelectorComponent } from '../../../shared/components/cost-selector/cost-selector.component';
import { QuantityControlComponent } from '../../../shared/components/quantity-control/quantity-control.component';
import Swal from 'sweetalert2';

interface CostLineForm extends ProductCostLineCreate {
    _id?: number; // local tracking id
}

@Component({
    selector: 'app-producto-form',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, CostSelectorComponent, QuantityControlComponent],
    templateUrl: './producto-form.component.html',
    styleUrl: './producto-form.component.scss'
})
export class ProductoFormComponent implements OnInit {
    projectId: number | null = null;
    productId: number | null = null;
    isEditMode = false;
    saving = false;
    loading = false;

    // Form fields
    name = '';
    description = '';
    salePrice = 0;
    isActive = true;
    selectedCategoryId: number | null = null;

    // Image
    imageFile: File | null = null;
    imagePreview: string | null = null;
    existingImagePath: string | null = null;
    apiBaseUrl = environment.apiUrl.replace('/api', '');
    Math = Math;

    // Cost builder
    costLines: CostLineForm[] = [];
    costTypes: CostType[] = [];
    selectedCostTypeId: number | null = null;
    availableCosts: OperativeCost[] = [];
    selectedCostId: number | null = null;
    selectedCost: OperativeCost | null = null;
    availableDerivedCosts: OperativeCost[] = [];
    selectedDerivedCostIds = new Set<number>();
    isLoadingDerivedCosts = false;
    variantSelections: { [groupName: string]: any } = {};
    newLineLabel = '';
    newLineQty = 1;
    newLineUnitCost = 0;
    private lineCounter = 0;

    // Categories
    categories: ProductCategory[] = [];

    constructor(
        private catalogService: CatalogService,
        private financeService: FinanceService,
        private projectService: ProjectService,
        private router: Router,
        private route: ActivatedRoute,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit() {
        this.productId = this.route.snapshot.paramMap.get('id')
            ? Number(this.route.snapshot.paramMap.get('id'))
            : null;
        this.isEditMode = this.productId !== null;

        this.projectService.getSelectedProjectId().subscribe(id => {
            this.projectId = id;
            if (id) this.loadInitialData();
        });
    }

    loadInitialData() {
        if (!this.projectId) return;
        this.loading = true;

        this.catalogService.getCategories(this.projectId).subscribe(cats => {
            this.categories = cats;
            this.cdr.detectChanges();
        });

        this.financeService.getCostTypes(this.projectId).subscribe(types => {
            this.costTypes = types;
            this.cdr.detectChanges();
        });

        if (this.isEditMode && this.productId) {
            this.catalogService.getProduct(this.projectId, this.productId).subscribe({
                next: (product) => {
                    this.name = product.name;
                    this.description = product.description || '';
                    this.salePrice = product.sale_price;
                    this.isActive = product.is_active;
                    this.selectedCategoryId = product.category_id || null;
                    this.existingImagePath = product.image_path || null;
                    this.costLines = product.cost_lines.map(l => ({
                        _id: ++this.lineCounter,
                        label: l.label,
                        quantity: l.quantity,
                        unit_cost: l.unit_cost,
                        operative_cost_id: l.operative_cost_id
                    }));
                    this.loading = false;
                    this.cdr.detectChanges();
                },
                error: () => { this.loading = false; this.cdr.detectChanges(); }
            });
        } else {
            this.loading = false;
        }
    }

    onSelectorCostTypeChange(id: number | null) {
        this.selectedCostTypeId = id;
        this.onCostTypeChange();
    }

    onSelectorCostChange(id: number | null) {
        this.selectedCostId = id;
        this.onCostSelected();
    }

    onCostTypeChange() {
        this.selectedCostId = null;
        this.selectedCost = null;
        this.availableCosts = [];
        this.availableDerivedCosts = [];
        this.selectedDerivedCostIds = new Set();
        this.variantSelections = {};
        this.newLineUnitCost = 0;
        if (!this.selectedCostTypeId) return;
        this.financeService.getCosts(this.selectedCostTypeId).subscribe(costs => {
            this.availableCosts = costs;
            this.cdr.detectChanges();
        });
    }

    onCostSelected() {
        this.availableDerivedCosts = [];
        this.selectedDerivedCostIds = new Set();
        this.variantSelections = {};

        if (!this.selectedCostId) {
            this.selectedCost = null;
            this.newLineUnitCost = 0;
            return;
        }

        this.selectedCost = this.availableCosts.find(c => c.id === Number(this.selectedCostId)) || null;
        if (!this.selectedCost) return;

        const margin = this.getEffectiveMargin(this.selectedCost);
        this.newLineUnitCost = this.selectedCost.base_cost * (1 + margin / 100);
        const type = this.costTypes.find(t => t.id === this.selectedCost!.cost_type_id);
        this.newLineLabel = type ? type.name : '';

        this.isLoadingDerivedCosts = true;
        this.financeService.getCosts(undefined, this.selectedCost.id).subscribe({
            next: (derived) => {
                this.availableDerivedCosts = derived;
                this.isLoadingDerivedCosts = false;
                this.cdr.detectChanges();
            },
            error: () => { this.isLoadingDerivedCosts = false; this.cdr.detectChanges(); }
        });
    }

    onVariantChange() {
        if (!this.selectedCost) return;
        const variantMods = Object.values(this.variantSelections).reduce((acc: number, val: any) => acc + (val?.priceMod || 0), 0);
        const margin = this.getEffectiveMargin(this.selectedCost);
        this.newLineUnitCost = (this.selectedCost.base_cost + variantMods) * (1 + margin / 100);
        this.cdr.detectChanges();
    }

    toggleDerivedCost(id: number) {
        if (this.selectedDerivedCostIds.has(id)) {
            this.selectedDerivedCostIds.delete(id);
        } else {
            this.selectedDerivedCostIds.add(id);
        }
    }

    isDerivedCostSelected(id: number): boolean {
        return this.selectedDerivedCostIds.has(id);
    }

    addCostLine() {
        if (!this.selectedCost) return;

        if (this.selectedCost.attributes?.__type === 'variants') {
            const groups = this.selectedCost.attributes.__config?.groups || [];
            for (const g of groups) {
                if (!this.variantSelections[g.name]) {
                    alert(`Por favor selecciona una opción para: ${g.name}`);
                    return;
                }
            }
        }

        this.costLines.push({
            _id: ++this.lineCounter,
            label: this.newLineLabel || this.selectedCost.attributes?.name || `Costo #${this.lineCounter}`,
            quantity: this.newLineQty,
            unit_cost: this.newLineUnitCost,
            operative_cost_id: this.selectedCost.id
        });

        for (const derivedId of this.selectedDerivedCostIds) {
            const derived = this.availableDerivedCosts.find(c => c.id === derivedId);
            if (derived) {
                const derivedLabel = derived.attributes?.['Descripción'] ||
                    Object.entries(derived.attributes || {}).filter(([k]) => !k.startsWith('__')).map(([k, v]) => `${k}: ${v}`).join(', ') ||
                    'Complemento';
                const derivedMargin = this.getEffectiveMargin(derived);
                this.costLines.push({
                    _id: ++this.lineCounter,
                    label: derivedLabel,
                    quantity: this.newLineQty,
                    unit_cost: derived.base_cost * (1 + derivedMargin / 100),
                    operative_cost_id: derived.id
                });
            }
        }

        this.selectedCostId = null;
        this.selectedCost = null;
        this.newLineLabel = '';
        this.newLineQty = 1;
        this.newLineUnitCost = 0;
        this.availableDerivedCosts = [];
        this.selectedDerivedCostIds = new Set();
        this.variantSelections = {};
        this.cdr.detectChanges();
    }

    removeCostLine(lineId: number) {
        this.costLines = this.costLines.filter(l => l._id !== lineId);
    }

    get baseCost(): number {
        return this.costLines.reduce((sum, l) => sum + l.unit_cost * l.quantity, 0);
    }

    get margin(): number {
        if (this.baseCost === 0) return 0;
        return ((this.salePrice - this.baseCost) / this.baseCost) * 100;
    }

    get marginClass(): string {
        if (this.margin < 0) return 'negative';
        if (this.margin < 20) return 'low';
        if (this.margin < 50) return 'medium';
        return 'good';
    }

    onImageSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            this.imageFile = input.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                this.imagePreview = e.target?.result as string;
                this.cdr.detectChanges();
            };
            reader.readAsDataURL(this.imageFile);
        }
    }

    removeImage() {
        this.imageFile = null;
        this.imagePreview = null;
    }

    getImageSrc(): string | null {
        if (this.imagePreview) return this.imagePreview;
        if (this.existingImagePath) return `${this.apiBaseUrl}${this.existingImagePath}`;
        return null;
    }

    async save() {
        if (!this.name.trim() || !this.projectId) return;

        if (this.costLines.length > 0 && this.salePrice < this.baseCost) {
            Swal.fire({
                icon: 'warning',
                title: 'Precio de venta inválido',
                text: `El precio de venta ($${this.salePrice.toFixed(2)}) no puede ser menor al costo total del producto ($${this.baseCost.toFixed(2)}).`,
                confirmButtonText: 'Entendido'
            });
            return;
        }

        this.saving = true;

        const costLines: ProductCostLineCreate[] = this.costLines.map(l => ({
            label: l.label,
            quantity: l.quantity,
            unit_cost: l.unit_cost,
            operative_cost_id: l.operative_cost_id
        }));

        try {
            let productId: number;

            if (this.isEditMode && this.productId) {
                const updated = await this.catalogService.updateProduct(this.projectId, this.productId, {
                    name: this.name,
                    description: this.description,
                    sale_price: this.salePrice,
                    is_active: this.isActive,
                    category_id: this.selectedCategoryId || undefined,
                    cost_lines: costLines
                }).toPromise();
                productId = updated!.id;
            } else {
                const created = await this.catalogService.createProduct(this.projectId, {
                    name: this.name,
                    description: this.description,
                    sale_price: this.salePrice,
                    is_active: this.isActive,
                    category_id: this.selectedCategoryId || undefined,
                    cost_lines: costLines
                }).toPromise();
                productId = created!.id;
            }

            if (this.imageFile) {
                await this.catalogService.uploadProductImage(this.projectId, productId, this.imageFile).toPromise();
            }

            Swal.fire({
                icon: 'success',
                title: this.isEditMode ? 'Producto actualizado' : 'Producto creado',
                timer: 1500,
                showConfirmButton: false
            });
            this.router.navigate(['/gestion/catalogo']);
        } catch (err: any) {
            this.saving = false;
            const msg = err?.error?.detail || 'No se pudo guardar el producto';
            Swal.fire('Error', msg, 'error');
        }
    }

    getEffectiveMargin(cost: OperativeCost): number {
        const itemMargin = cost.attributes?.__profit_margin;
        if (itemMargin !== undefined && itemMargin !== null) return Number(itemMargin);
        const type = this.costTypes.find(t => t.id === cost.cost_type_id);
        return Number(type?.profit_margin || 0);
    }

    cancel() {
        this.router.navigate(['/gestion/catalogo']);
    }
}
