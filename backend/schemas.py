from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

# --- Cost Types ---
class CostTypeBase(BaseModel):
    name: str
    description: Optional[str] = None

class CostTypeCreate(CostTypeBase):
    pass

class CostType(CostTypeBase):
    id: int
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
