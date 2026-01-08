from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

# --- Cost Types ---
class CostTypeBase(BaseModel):
    name: str
    description: Optional[str] = None

class CostTypeCreate(CostTypeBase):
    project_id: int

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

class OperativeCostCreate(OperativeCostBase):
    cost_type_id: int

class OperativeCostUpdate(BaseModel):
    base_cost: Optional[float] = None
    attributes: Optional[Dict[str, Any]] = None

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

# --- Order Systems ---

class OrderStateBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_system_default: bool = False

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

class OrderItemBase(BaseModel):
    description: str
    quantity: int = 1
    unit_price: float = 0.0
    attributes: Dict[str, Any] = {}
    
class OrderItemCreate(OrderItemBase):
    operative_cost_id: Optional[int] = None

class OrderItem(OrderItemBase):
    id: int
    order_id: int
    subtotal: float
    created_at: datetime
    operative_cost_id: Optional[int] = None

    class Config:
        from_attributes = True

class OrderBase(BaseModel):
    client_name: str
    delivery_date: Optional[datetime] = None
    shipping_address: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    notes: Optional[str] = None
    total_amount: Optional[float] = 0.0

class OrderCreate(OrderBase):
    project_id: int
    current_state_id: Optional[int] = None # Can be null initially (uses default)
    items: List[OrderItemCreate] = []

class Order(OrderBase):
    id: int
    project_id: int
    current_state_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    state: Optional[OrderState] = None
    items: List[OrderItem] = []

    class Config:
        from_attributes = True

class OrderUpdate(BaseModel):
    current_state_id: Optional[int] = None
    notes: Optional[str] = None
    items: Optional[List[OrderItemCreate]] = None # Use OrderItemCreate for simplicity in full alignment
    # If items are sent, we replace them or merge logic in router 

    class Config:
        from_attributes = True
