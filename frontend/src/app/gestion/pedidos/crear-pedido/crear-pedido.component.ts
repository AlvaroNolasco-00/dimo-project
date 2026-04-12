import { Component, AfterViewInit, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate, query, stagger, group } from '@angular/animations';
import { Router } from '@angular/router';
import { ApiService } from '../../../services/api.service';


@Component({
  selector: 'app-crear-pedido',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crear-pedido.component.html',
  styleUrl: './crear-pedido.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('stepAnimation', [
      transition(':increment', [
        style({ position: 'relative' }),
        query(':enter, :leave', [
          style({
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            opacity: 0
          })
        ], { optional: true }),
        group([
          query(':leave', [
            animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', style({ transform: 'translateX(-30px)', opacity: 0 }))
          ], { optional: true }),
          query(':enter', [
            style({ transform: 'translateX(30px)', opacity: 0 }),
            animate('400ms 100ms cubic-bezier(0.4, 0, 0.2, 1)', style({ transform: 'translateX(0)', opacity: 1 }))
          ], { optional: true })
        ])
      ]),
      transition(':decrement', [
        style({ position: 'relative' }),
        query(':enter, :leave', [
          style({
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            opacity: 0
          })
        ], { optional: true }),
        group([
          query(':leave', [
            animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', style({ transform: 'translateX(30px)', opacity: 0 }))
          ], { optional: true }),
          query(':enter', [
            style({ transform: 'translateX(-30px)', opacity: 0 }),
            animate('400ms 100ms cubic-bezier(0.4, 0, 0.2, 1)', style({ transform: 'translateX(0)', opacity: 1 }))
          ], { optional: true })
        ])
      ])
    ]),
    trigger('listItem', [
      transition(':enter', [
        style({ transform: 'translateY(10px)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateY(-10px)', opacity: 0 }))
      ])
    ]),
    trigger('successState', [
      transition(':enter', [
        query('.success-icon', [
          style({ transform: 'scale(0)', opacity: 0 }),
          animate('600ms cubic-bezier(0.175, 0.885, 0.32, 1.275)', style({ transform: 'scale(1)', opacity: 1 }))
        ], { optional: true }),
        query('h2, p, .magic-link-box, .form-actions', [
          style({ transform: 'translateY(20px)', opacity: 0 }),
          stagger(100, [
            animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class CrearPedidoComponent implements AfterViewInit, OnInit {
  currentStep: number = 1;
  orderCreated: boolean = false;
  magicLink: string = '';
  errorMessage: string | null = null;

  nuevoPedido = {
    cliente: '',
    notas: '',
    ubicacion: { lat: 0, lng: 0 },
    direccion: '',
    // This will now be an ID
    current_state_id: null as number | null,
    client_id: null as number | null
  };

  // Client management
  clientSearchPhone: string = '';
  isSearchingClient: boolean = false;
  clientFound: boolean = false;
  isClientReadOnly: boolean = false;
  clientData: any = {
    full_name: '',
    email: '',
    phone_number: '',
    tax_id: '',
    // shipping_address removed as per requirement
    notes: ''
  };

  // State management
  projectStates: any[] = [];
  projectId: number = 1; // Default or fetch from service/store

  // Cost management
  costTypes: any[] = [];
  availableOperativeCosts: any[] = [];
  availableDerivedCosts: any[] = [];
  selectedDerivedCostIds = new Set<number>();
  isLoadingDerivedCosts = false;

  // Item management
  items: any[] = [];

  // New Item (The Composite Item)
  newItem = {
    quantity: 1,
    unit_price: 0,
    description: '', // Can be auto-generated or manual
    subItems: [] as any[] // List of { description, quantity, unit_price, cost_type_id, operative_cost_id, attributes }
  };

  editingItemIndex: number | null = null;

  // Temporary Sub-Item (The part being added to the Composite Item)
  tempSubItem = {
    quantity: 1,
    unit_price: 0,
    cost_type_id: null as number | null,
    operative_cost_id: null as number | null,
    description: '',
    attributes: {} as any,
    // Helper for UI
    variantSelections: {} as { [groupName: string]: any }
  };

  selectedCost: any = null; // Track full object to access config

  // Totals
  totalAmount: number = 0;

  // Search Query for items (if needed) or removed
  searchQuery: string = '';

  // Loading States
  isLoadingStates = false;
  isLoadingTypes = false;
  isLoadingCosts = false;
  isSaving = false;
  isSearchingAddress = false;

  private router = inject(Router);
  private apiService = inject(ApiService);
  private cd = inject(ChangeDetectorRef);

  constructor() { }

  ngOnInit(): void {
    // Try to get this project ID from local storage or service if available
    const storedProjId = localStorage.getItem('currentProjectId');
    if (storedProjId) {
      this.projectId = parseInt(storedProjId, 10);
    }

    this.loadProjectStates();
    this.loadCostTypes();
  }

  // --- Stepper Navigation ---

  setStep(step: number) {
    if (step < 1 || step > 3) return;

    // Simple validation before moving forward
    if (this.currentStep === 1 && step > 1) {
      if (!this.clientData.full_name || !this.clientData.phone_number) {
        alert('Por favor completa la información básica del cliente.');
        return;
      }
    }

    this.currentStep = step;

    // Map initialization removed
  }

  // --- Client Logic ---

  searchClient() {
    if (!this.clientSearchPhone || this.isSearchingClient) return;

    this.isSearchingClient = true;
    this.apiService.searchClientByPhone(this.projectId, this.clientSearchPhone).subscribe({
      next: (client) => {
        this.clientData = { ...client };
        this.clientFound = true;
        this.isClientReadOnly = true;
        this.nuevoPedido.client_id = client.id;
        this.nuevoPedido.direccion = client.shipping_address;
        this.cd.detectChanges();
        // Cooldown: mantener animación por 1.5s antes de permitir otro click
        setTimeout(() => {
          this.isSearchingClient = false;
          this.cd.detectChanges();
        }, 1500);
      },
      error: (err) => {
        console.log('Client not found, creating new flow');
        this.clientFound = false;
        this.isClientReadOnly = false;
        this.nuevoPedido.client_id = null;
        this.clientData = {
          full_name: '',
          email: '',
          phone_number: this.clientSearchPhone,
          tax_id: '',
          shipping_address: '',
          notes: ''
        };
        this.cd.detectChanges();
        // Cooldown: mantener animación por 1.5s antes de permitir otro click
        setTimeout(() => {
          this.isSearchingClient = false;
          this.cd.detectChanges();
        }, 1500);
      }
    });
  }

  editFoundClient() {
    if (this.nuevoPedido.client_id) {
      this.router.navigate(['/gestion/clientes/editar', this.nuevoPedido.client_id]);
    }
  }

  resetClientSearch() {
    this.clientSearchPhone = '';
    this.clientFound = false;
    this.isClientReadOnly = false;
    this.nuevoPedido.client_id = null;
    this.clientData = {
      full_name: '',
      email: '',
      phone_number: '',
      tax_id: '',
      notes: ''
    };
  }

  loadProjectStates() {
    this.isLoadingStates = true;
    this.apiService.getProjectOrderStates(this.projectId).subscribe({
      next: (states) => {
        this.projectStates = states;
        // Set default state if available (e.g., 'Creado')
        const defaultState = states.find(s => s.name === 'Creado');
        if (defaultState) {
          this.nuevoPedido.current_state_id = defaultState.id;
        }
        this.isLoadingStates = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error loading states', err);
        this.isLoadingStates = false;
        this.cd.detectChanges();
      }
    });
  }

  loadCostTypes() {
    this.isLoadingTypes = true;
    this.apiService.getCostTypes(this.projectId).subscribe({
      next: (types) => {
        this.costTypes = types;
        this.isLoadingTypes = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error loading cost types', err);
        this.isLoadingTypes = false;
        this.cd.detectChanges();
      }
    });
  }

  // --- Item Logic ---

  // --- Item Logic ---

  onCostTypeChange() {
    this.tempSubItem.operative_cost_id = null;
    this.tempSubItem.unit_price = 0;
    this.availableOperativeCosts = [];
    this.availableDerivedCosts = [];
    this.selectedDerivedCostIds = new Set();
    this.selectedCost = null;

    if (this.tempSubItem.cost_type_id) {
      this.isLoadingCosts = true;
      this.apiService.getOperativeCosts(this.tempSubItem.cost_type_id).subscribe({
        next: (costs) => {
          this.availableOperativeCosts = costs;
          this.isLoadingCosts = false;
          this.cd.detectChanges();
        },
        error: (err) => {
          console.error('Error loading operative costs', err);
          this.isLoadingCosts = false;
          this.cd.detectChanges();
        }
      });
    }
  }

  onOperativeCostChange() {
    this.availableDerivedCosts = [];
    this.selectedDerivedCostIds = new Set();
    this.selectedCost = this.availableOperativeCosts.find(c => c.id == this.tempSubItem.operative_cost_id);

    // Load derived costs for the selected parent cost
    if (this.selectedCost) {
      this.isLoadingDerivedCosts = true;
      this.apiService.getDerivedCosts(this.selectedCost.id).subscribe({
        next: (derived) => {
          this.availableDerivedCosts = derived;
          this.isLoadingDerivedCosts = false;
          this.cd.detectChanges();
        },
        error: () => { this.isLoadingDerivedCosts = false; this.cd.detectChanges(); }
      });
    }

    if (this.selectedCost) {
      const margin = this.getEffectiveMargin(this.selectedCost);
      this.tempSubItem.unit_price = parseFloat(this.selectedCost.base_cost) * (1 + margin / 100);
      this.tempSubItem.variantSelections = {}; // Reset selections

      // Initial Description
      let desc = '';
      const type = this.costTypes.find(t => t.id == this.tempSubItem.cost_type_id);
      if (type) desc += type.name;

      if (this.selectedCost.attributes) {
        // Clone attributes to tempSubItem
        this.tempSubItem.attributes = { ...this.selectedCost.attributes };

        // Filter out internal config keys for description
        const displayAttrs = Object.entries(this.selectedCost.attributes)
          .filter(([k, v]) => !k.startsWith('__'))
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');

        if (displayAttrs) desc += ` - ${displayAttrs}`;

        // Handle Variants Default Selection (Optional: Select first option)
        if (this.selectedCost.attributes.__type === 'variants' && this.selectedCost.attributes.__config?.groups) {
          // We can auto-select the first option if desired, or leave empty
          // For now leaving empty to force user selection if mandatory? 
          // Or simply let them select.
        }

      } else {
        this.tempSubItem.attributes = {};
      }
      this.tempSubItem.description = desc;

    } else {
      this.tempSubItem.unit_price = 0;
      this.tempSubItem.description = '';
      this.tempSubItem.attributes = {};
      this.tempSubItem.variantSelections = {};
    }
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

  onVariantChange() {
    if (!this.selectedCost) return;

    let basePrice = parseFloat(this.selectedCost.base_cost);
    const variantMods = Object.values(this.tempSubItem.variantSelections).reduce((acc: number, val: any) => {
      return acc + (val?.priceMod || 0);
    }, 0);

    const margin = this.getEffectiveMargin(this.selectedCost);
    this.tempSubItem.unit_price = (basePrice + variantMods) * (1 + margin / 100);

    // Update Description
    let desc = '';
    const type = this.costTypes.find(t => t.id == this.tempSubItem.cost_type_id);
    if (type) desc += type.name;

    // Static Attributes
    const displayAttrs = Object.entries(this.selectedCost.attributes || {})
      .filter(([k, v]) => !k.startsWith('__'))
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    if (displayAttrs) desc += ` - ${displayAttrs}`;

    // Variants description
    const variantDesc = Object.entries(this.tempSubItem.variantSelections)
      .map(([group, val]: any) => `${group}: ${val.label}`)
      .join(', ');

    if (variantDesc) desc += ` (${variantDesc})`;

    this.tempSubItem.description = desc;
  }

  addSubItem() {
    if (!this.tempSubItem.operative_cost_id || this.tempSubItem.quantity <= 0) return;

    // Validate Variants
    if (this.selectedCost?.attributes?.__type === 'variants') {
      const groups = this.selectedCost.attributes.__config.groups || [];
      for (const g of groups) {
        if (!this.tempSubItem.variantSelections[g.name]) {
          alert(`Por favor selecciona una opción para: ${g.name}`);
          return;
        }
      }
    }

    // Save Variant Selections to Attributes for persistence
    const finalAttributes = {
      ...this.tempSubItem.attributes,
      selected_variants: this.tempSubItem.variantSelections
    };

    // Add parent cost sub-item
    this.newItem.subItems.push({
      ...this.tempSubItem,
      attributes: finalAttributes
    });

    // Add each selected derived cost as a companion sub-item
    for (const derivedId of this.selectedDerivedCostIds) {
      const derivedCost = this.availableDerivedCosts.find(c => c.id === derivedId);
      if (derivedCost) {
        const derivedAttrs = Object.fromEntries(
          Object.entries(derivedCost.attributes || {}).filter(([k]) => !k.startsWith('__'))
        );
        const derivedDesc = derivedCost.attributes?.['Descripción'] ||
          Object.entries(derivedAttrs).map(([k, v]) => `${k}: ${v}`).join(', ') ||
          'Complemento';

        const derivedMargin = this.getEffectiveMargin(derivedCost);
        const derivedFinalPrice = parseFloat(derivedCost.base_cost) * (1 + derivedMargin / 100);
        this.newItem.subItems.push({
          quantity: this.tempSubItem.quantity,
          unit_price: derivedFinalPrice,
          cost_type_id: derivedCost.cost_type_id,
          operative_cost_id: derivedCost.id,
          description: derivedDesc,
          attributes: { ...derivedCost.attributes },
          variantSelections: {}
        });
      }
    }

    // Update composite item price
    this.updateCompositeItemPrice();

    // Reset temp sub-item
    this.resetTempSubItem();
  }

  removeSubItem(index: number) {
    this.newItem.subItems.splice(index, 1);
    this.updateCompositeItemPrice();
  }

  updateCompositeItemPrice() {
    // The unit price of the Composite Item is the sum of (subItem.price * subItem.qty)
    const compositeUnitPrice = this.newItem.subItems.reduce((acc, sub) => acc + (sub.unit_price * sub.quantity), 0);
    this.newItem.unit_price = compositeUnitPrice;

    // Auto-generate description if empty or simple
    this.generateCompositeDescription();
  }

  generateCompositeDescription() {
    // Example: "2 Camisa M, 1 Estampado"
    const parts = this.newItem.subItems.map(s => `${s.quantity} ${s.description}`);
    this.newItem.description = parts.join(', ');
  }

  resetTempSubItem() {
    this.tempSubItem = {
      quantity: 1,
      unit_price: 0,
      cost_type_id: null,
      operative_cost_id: null,
      description: '',
      attributes: {},
      variantSelections: {}
    };
    this.selectedCost = null;
    this.availableOperativeCosts = [];
    this.availableDerivedCosts = [];
    this.selectedDerivedCostIds = new Set();
  }

  addItem() {
    if (this.newItem.subItems.length === 0 || this.newItem.quantity <= 0) return;

    const subtotal = this.newItem.quantity * this.newItem.unit_price;

    const itemPayload = {
      description: this.newItem.description,
      quantity: this.newItem.quantity,
      unit_price: this.newItem.unit_price,
      subtotal: subtotal,
      // We store the subItems structure in 'attributes' to persist it without backend changes
      attributes: {
        is_composite: true,
        sub_items: this.newItem.subItems
      },
      // These are null because it's a composite item, not a single operative cost
      cost_type_id: null,
      operative_cost_id: null
    };

    if (this.editingItemIndex !== null) {
      // Update existing item
      this.items[this.editingItemIndex] = itemPayload;
    } else {
      // Add new item
      this.items.push(itemPayload);
    }

    this.calculateTotal();
    this.resetNewItem();
  }

  editItem(index: number) {
    const item = this.items[index];

    // Copy main item props
    this.newItem = {
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      // Deep copy sub-items to avoid reference issues while editing
      subItems: JSON.parse(JSON.stringify(item.attributes.sub_items || []))
    };

    this.editingItemIndex = index;

    // Reset temp sub builder
    this.resetTempSubItem();

    // Scroll to form (optional UX improvement)
    const form = document.querySelector('.add-item-container');
    if (form) form.scrollIntoView({ behavior: 'smooth' });
  }

  cancelEdit() {
    this.resetNewItem();
  }

  removeItem(index: number) {
    this.items.splice(index, 1);
    this.calculateTotal();
  }

  calculateTotal() {
    this.totalAmount = this.items.reduce((acc, item) => acc + item.subtotal, 0);
  }

  resetNewItem() {
    this.newItem = {
      quantity: 1,
      unit_price: 0,
      description: '',
      subItems: []
    };
    this.editingItemIndex = null;
    this.resetTempSubItem();
  }

  // --- Quantity Controls ---

  incrementTempSubQty() {
    this.tempSubItem.quantity++;
  }

  decrementTempSubQty() {
    if (this.tempSubItem.quantity > 1) {
      this.tempSubItem.quantity--;
    }
  }

  validateTempSubQty() {
    if (!this.tempSubItem.quantity || this.tempSubItem.quantity < 1) {
      this.tempSubItem.quantity = 1;
    }
  }

  incrementNewItemQty() {
    this.newItem.quantity++;
    this.updateCompositeItemPrice();
  }

  decrementNewItemQty() {
    if (this.newItem.quantity > 1) {
      this.newItem.quantity--;
      this.updateCompositeItemPrice();
    }
  }

  validateNewItemQty() {
    if (!this.newItem.quantity || this.newItem.quantity < 1) {
      this.newItem.quantity = 1;
    }
    this.updateCompositeItemPrice();
  }

  ngAfterViewInit(): void {
    // Map init removed
  }



  guardarPedido() {
    console.log('Guardando pedido:', this.nuevoPedido);
    this.isSaving = true;

    // Construct payload
    const payload: any = {
      project_id: this.projectId,
      delivery_date: null,
      // shipping_address: this.nuevoPedido.direccion, // Removed
      location_lat: this.nuevoPedido.ubicacion.lat,
      location_lng: this.nuevoPedido.ubicacion.lng,
      notes: this.nuevoPedido.notas,
      current_state_id: this.nuevoPedido.current_state_id,
      items: this.items
    };

    this.errorMessage = null;

    if (this.clientFound && this.nuevoPedido.client_id) {
      payload.client_id = this.nuevoPedido.client_id;
      payload.client_name = this.clientData.full_name;
    } else {
      payload.new_client = {
        ...this.clientData,
        project_id: this.projectId
      };
    }

    this.apiService.createOrder(this.projectId, payload).subscribe({
      next: (res) => {
        console.log('Order created', res);
        this.isSaving = false;

        // Show success and link
        this.orderCreated = true;
        this.currentStep = 3;

        // Construct magic link. Assuming the frontend base URL and routing.
        // Example: http://localhost:4200/track/[token]
        const baseUrl = window.location.origin;
        this.magicLink = `${baseUrl}/track/${res.access_token}`;

        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error creating order', err);
        this.isSaving = false;
        this.errorMessage = err.error?.detail || err.error?.message || 'Error al crear el pedido. Por favor verifica los datos e intenta de nuevo.';
        this.cd.detectChanges();
      }
    });
  }

  isCopied: boolean = false;

  copyLink() {
    navigator.clipboard.writeText(this.magicLink).then(() => {
      this.isCopied = true;
      this.cd.detectChanges();

      setTimeout(() => {
        this.isCopied = false;
        this.cd.detectChanges();
      }, 5000);
    });
  }

  getEffectiveMargin(cost: any): number {
    const itemMargin = cost.attributes?.__profit_margin;
    if (itemMargin !== undefined && itemMargin !== null) return Number(itemMargin);
    const type = this.costTypes.find((t: any) => t.id === cost.cost_type_id);
    return Number(type?.profit_margin || 0);
  }

  cancelar() {
    this.router.navigate(['/gestion/pedidos']);
  }
}

