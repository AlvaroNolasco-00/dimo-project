from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum


class ProjectRole(str, Enum):
    viewer = "viewer"
    editor = "editor"
    manager = "manager"
    owner = "owner"

ROLE_HIERARCHY = [ProjectRole.viewer, ProjectRole.editor, ProjectRole.manager, ProjectRole.owner]

# --- Cost Types ---
class CostTypeBase(BaseModel):
    name: str
    description: Optional[str] = None
    requires_art: bool = False
    profit_margin: Optional[float] = 0

class CostTypeCreate(CostTypeBase):
    project_id: int

class CostTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    requires_art: Optional[bool] = None
    profit_margin: Optional[float] = None

class CostType(CostTypeBase):
    id: int
    project_id: int
    created_at: datetime

    class Config:
        from_attributes = True

# --- Operative Costs ---
class OperativeCostBase(BaseModel):
    base_cost: float
    attributes: Dict[str, Any] = {}
    parent_cost_id: Optional[int] = None

class OperativeCostCreate(OperativeCostBase):
    cost_type_id: int

class OperativeCostUpdate(BaseModel):
    base_cost: Optional[float] = None
    attributes: Optional[Dict[str, Any]] = None
    parent_cost_id: Optional[int] = None

class OperativeCost(OperativeCostBase):
    id: int
    cost_type_id: int
    created_at: datetime
    cost_type: Optional[CostType] = None

    class Config:
        from_attributes = True

# --- Projects ---
class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class Project(ProjectBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectWithRole(ProjectBase):
    """Project with the current user's role — used in /auth/me response."""
    id: int
    created_at: datetime
    role: Optional[ProjectRole] = None

    class Config:
        from_attributes = True

class AssignUserToProject(BaseModel):
    role: ProjectRole = ProjectRole.editor

class UpdateProjectRole(BaseModel):
    role: ProjectRole

class ProjectUserWithRole(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    is_approved: bool
    is_admin: bool
    role: ProjectRole

    class Config:
        from_attributes = True

# --- Order Systems ---

class DeliveryZoneHistory(BaseModel):
    id: int
    zone_id: int
    modified_by_id: Optional[int] = None
    modified_by: Optional['UserBasic'] = None
    modified_at: datetime
    previous_state: Dict[str, Any]
    change_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class DeliveryZoneBase(BaseModel):
    name: str
    price: float = 0.0
    zone_type: str = "STANDARD_PAID"
    is_active: bool = True
    coordinates: Optional[List[List[float]]] = None

class DeliveryZoneCreate(DeliveryZoneBase):
    project_id: int

class DeliveryZoneUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    zone_type: Optional[str] = None
    is_active: Optional[bool] = None
    coordinates: Optional[List[List[float]]] = None
    change_reason: Optional[str] = None

class DeliveryZoneHistory(BaseModel):
    id: int
    zone_id: int
    modified_by_id: Optional[int] = None
    modified_by: Optional['UserBasic'] = None
    modified_at: datetime
    previous_state: Dict[str, Any]
    change_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class DeliveryZone(DeliveryZoneBase):
    id: int
    project_id: int
    created_at: datetime
    history: List[DeliveryZoneHistory] = []
    
    class Config:
        from_attributes = True

class CouponBase(BaseModel):
    code: str
    description: Optional[str] = None
    discount_type: str = "FIXED"
    discount_value: float
    min_purchase_amount: float = 0.0
    is_active: bool = True
    single_use: bool = False

class CouponCreate(CouponBase):
    project_id: int

class Coupon(CouponBase):
    id: int
    project_id: int
    created_at: datetime
    created_by_id: Optional[int] = None
    created_by: Optional['UserBasic'] = None
    
    class Config:
        from_attributes = True

class CouponUpdate(BaseModel):
    code: Optional[str] = None
    description: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    min_purchase_amount: Optional[float] = None
    is_active: Optional[bool] = None
    single_use: Optional[bool] = None
    change_reason: Optional[str] = None # Optional reason for the change

class CouponHistory(BaseModel):
    id: int
    coupon_id: int
    modified_by_id: Optional[int] = None
    modified_by: Optional['UserBasic'] = None
    modified_at: datetime
    previous_state: Dict[str, Any]
    change_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# --- Coupon Usage Stats ---
class CouponUsageStats(BaseModel):
    id: int
    code: str
    total_uses: int
    last_month_uses: int
    discount_type: str
    discount_value: float

class CouponStatisticsResponse(BaseModel):
    summary: Dict[str, Any]
    top_used: List[CouponUsageStats]
    least_used: List[CouponUsageStats]


class ClientAddressBase(BaseModel):
    address_line: str
    zone_id: Optional[int] = None
    formatted_address: Optional[str] = None
    is_default: bool = False

class ClientAddressCreate(ClientAddressBase):
    pass

class ClientAddress(ClientAddressBase):
    id: int
    client_id: int
    created_at: datetime
    zone: Optional[DeliveryZone] = None

    class Config:
        from_attributes = True

class OrderStateBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_system_default: bool = False
    color: Optional[str] = "#6c757d"

class OrderState(OrderStateBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectOrderState(BaseModel):
    project_id: int
    order_state_id: int
    is_active: bool
    is_visible: bool
    display_order: int
    state: Optional[OrderState] = None

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True

class OrderItemDetailBase(BaseModel):
    description: str
    quantity: int = 1
    image_path: Optional[str] = None

class OrderItemDetailCreate(OrderItemDetailBase):
    pass

class OrderItemDetail(OrderItemDetailBase):
    id: int
    order_item_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class OrderItemBase(BaseModel):
    description: str
    quantity: int = 1
    unit_price: float = 0.0
    attributes: Dict[str, Any] = {}
    
class OrderItemCreate(OrderItemBase):
    operative_cost_id: Optional[int] = None
    details: List[OrderItemDetailCreate] = []

class OrderItem(OrderItemBase):
    id: int
    order_id: int
    subtotal: float
    created_at: datetime
    operative_cost_id: Optional[int] = None
    details: List[OrderItemDetail] = []

    class Config:
        from_attributes = True

# --- Clients ---
class ClientBase(BaseModel):
    phone_number: str
    full_name: str
    email: Optional[str] = None
    tax_id: Optional[str] = None
    client_type: Optional[str] = "retail"
    shipping_address: Optional[str] = None
    preferences: Dict[str, Any] = {}
    notes: Optional[str] = None

class ClientCreate(ClientBase):
    project_id: int

class ClientUpdate(BaseModel):
    phone_number: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    tax_id: Optional[str] = None
    client_type: Optional[str] = None
    shipping_address: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None

class Client(ClientBase):
    id: int
    project_id: int
    created_at: datetime
    updated_at: datetime
    addresses: List[ClientAddress] = []

    class Config:
        from_attributes = True

# --- Order History ---

class UserBasic(BaseModel):
    id: int
    full_name: str

    class Config:
        from_attributes = True

class OrderHistoryBase(BaseModel):
    action_type: str
    description: str
    created_at: datetime

class OrderHistory(OrderHistoryBase):
    id: int
    order_id: int
    user_id: Optional[int] = None
    user: Optional[UserBasic] = None

    class Config:
        from_attributes = True

class OrderBase(BaseModel):
    client_name: Optional[str] = None
    client_id: Optional[int] = None
    delivery_date: Optional[datetime] = None
    shipping_address: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    notes: Optional[str] = None
    total_amount: Optional[float] = 0.0

    project_id: int
    current_state_id: Optional[int] = None # Can be null initially (uses default)
    coupon_id: Optional[int] = None
    delivery_zone_id: Optional[int] = None
    down_payment_amount: Optional[float] = 0.0
    items: List[OrderItemCreate] = []

class OrderCreate(OrderBase):
    new_client: Optional[ClientCreate] = None

class Order(OrderBase):
    id: int
    project_id: int
    current_state_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    state: Optional[OrderState] = None
    items: List[OrderItem] = []
    
    access_token: Optional[str] = None
    down_payment_amount: float = 0.0
    coupon_id: Optional[int] = None
    coupon: Optional[Coupon] = None
    delivery_zone_id: Optional[int] = None
    delivery_zone: Optional[DeliveryZone] = None
    history: List[OrderHistory] = []

    class Config:
        from_attributes = True

class OrderUpdate(BaseModel):
    current_state_id: Optional[int] = None
    notes: Optional[str] = None
    coupon_id: Optional[int] = None
    delivery_zone_id: Optional[int] = None
    down_payment_amount: Optional[float] = None
    items: Optional[List[OrderItemCreate]] = None # Use OrderItemCreate for simplicity in full alignment
    # If items are sent, we replace them or merge logic in router 

    class Config:
        from_attributes = True

# --- Catalog ---

class ProductCostLineBase(BaseModel):
    label: str
    quantity: int = 1
    unit_cost: float
    operative_cost_id: Optional[int] = None

class ProductCostLineCreate(ProductCostLineBase):
    pass

class ProductCostLine(ProductCostLineBase):
    id: int
    product_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class ProductCategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True

class ProductCategoryCreate(ProductCategoryBase):
    project_id: int

class ProductCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class ProductCategory(ProductCategoryBase):
    id: int
    project_id: int
    access_token: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ProductPublicBasic(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    image_path: Optional[str] = None
    sale_price: float
    access_token: Optional[str] = None

    class Config:
        from_attributes = True


class ProductCategoryPublic(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    products: List[ProductPublicBasic] = []

    class Config:
        from_attributes = True

class ProductBase(BaseModel):
    name: str
    description: Optional[str] = None
    sale_price: float = 0.0
    is_active: bool = True
    category_id: Optional[int] = None

class ProductCreate(ProductBase):
    project_id: int
    cost_lines: List[ProductCostLineCreate] = []

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sale_price: Optional[float] = None
    is_active: Optional[bool] = None
    category_id: Optional[int] = None
    cost_lines: Optional[List[ProductCostLineCreate]] = None

class Product(ProductBase):
    id: int
    project_id: int
    image_path: Optional[str] = None
    access_token: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    category: Optional[ProductCategory] = None
    cost_lines: List[ProductCostLine] = []

    class Config:
        from_attributes = True

# --- Processing Tasks ---
class TaskResponse(BaseModel):
    task_id: str

class TaskStatus(BaseModel):
    id: str
    status: str
    result_url: Optional[str] = None
    error: Optional[str] = None

    class Config:
        from_attributes = True


# --- Processing Audit Log ---
class ProcessingAuditLogEntry(BaseModel):
    id: int
    user_id: Optional[int] = None
    user: Optional[Any] = None
    operation: str
    status: str
    duration_ms: Optional[int] = None
    input_file_size: Optional[int] = None
    input_width: Optional[int] = None
    input_height: Optional[int] = None
    output_file_size: Optional[int] = None
    accelerator: Optional[str] = None
    parameters: Dict[str, Any] = {}
    error_message: Optional[str] = None
    task_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ProcessingAuditLogList(BaseModel):
    items: List[ProcessingAuditLogEntry]
    total: int
    page: int
    page_size: int

class ProcessingAuditStats(BaseModel):
    total_operations: int
    success_count: int
    failure_count: int
    avg_duration_ms: Optional[float] = None
    operations_by_type: Dict[str, int] = {}
    operations_by_user: List[Dict[str, Any]] = []
    operations_by_accelerator: Dict[str, int] = {}
