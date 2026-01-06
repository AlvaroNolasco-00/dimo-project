from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(
    prefix="/api/finance",
    tags=["finance"],
    responses={404: {"description": "Not found"}},
)

# --- COST TYPES ---

@router.post("/cost-types", response_model=schemas.CostType)
def create_cost_type(
    cost_type: schemas.CostTypeCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Check if exists for this project
    db_cost_type = db.query(models.CostType).filter(
        models.CostType.name == cost_type.name,
        models.CostType.project_id == cost_type.project_id
    ).first()
    
    if db_cost_type:
        raise HTTPException(status_code=400, detail="Cost type already exists in this project")
    
    new_cost_type = models.CostType(
        name=cost_type.name, 
        description=cost_type.description,
        project_id=cost_type.project_id
    )
    db.add(new_cost_type)
    db.commit()
    db.refresh(new_cost_type)
    return new_cost_type

@router.get("/cost-types", response_model=List[schemas.CostType])
def read_cost_types(
    project_id: int = None,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.CostType)
    if project_id:
        query = query.filter(models.CostType.project_id == project_id)
    
    cost_types = query.offset(skip).limit(limit).all()
    return cost_types

# --- OPERATIVE COSTS ---

@router.post("/costs", response_model=schemas.OperativeCost)
def create_operative_cost(
    cost: schemas.OperativeCostCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Verify type exists
    cost_type = db.query(models.CostType).filter(models.CostType.id == cost.cost_type_id).first()
    if not cost_type:
        raise HTTPException(status_code=404, detail="Cost type not found")

    new_cost = models.OperativeCost(
        cost_type_id=cost.cost_type_id,
        base_cost=cost.base_cost,
        attributes=cost.attributes
    )
    db.add(new_cost)
    db.commit()
    db.refresh(new_cost)
    return new_cost

@router.get("/costs", response_model=List[schemas.OperativeCost])
def read_operative_costs(
    cost_type_id: int = None,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.OperativeCost)
    if cost_type_id:
        query = query.filter(models.OperativeCost.cost_type_id == cost_type_id)
    
    costs = query.offset(skip).limit(limit).all()
    return costs

@router.put("/costs/{cost_id}", response_model=schemas.OperativeCost)
def update_operative_cost(
    cost_id: int,
    cost_update: schemas.OperativeCostUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_cost = db.query(models.OperativeCost).filter(models.OperativeCost.id == cost_id).first()
    if not db_cost:
        raise HTTPException(status_code=404, detail="Cost not found")
    
    if cost_update.base_cost is not None:
        db_cost.base_cost = cost_update.base_cost
    
    if cost_update.attributes is not None:
        db_cost.attributes = cost_update.attributes

    db.commit()
    db.refresh(db_cost)
    return db_cost

@router.delete("/costs/{cost_id}")
def delete_operative_cost(
    cost_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")

    db_cost = db.query(models.OperativeCost).filter(models.OperativeCost.id == cost_id).first()
    if not db_cost:
        raise HTTPException(status_code=404, detail="Cost not found")
    
    db.delete(db_cost)
    db.commit()
    return {"ok": True}
