from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from .. import models, schemas, database

router = APIRouter(
    prefix="/api",
    tags=["orders"]
)

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/order-states", response_model=List[schemas.OrderState])
def get_all_order_states(db: Session = Depends(get_db)):
    """
    Get all globally defined order states.
    """
    return db.query(models.OrderState).all()

@router.get("/projects/{project_id}/order-states", response_model=List[schemas.OrderState])
def get_project_order_states(project_id: int, db: Session = Depends(get_db)):
    """
    Get effective order states for a project.
    Returns states that are active for this project.
    Logic:
    1. Fetch all system states.
    2. Fetch project specific config.
    3. If config exists, respect `is_active`.
    4. If no config, default to `is_system_default`.
    """
    # 1. Get all states
    all_states = db.query(models.OrderState).all()
    
    # 2. Get project config
    configs = db.query(models.ProjectOrderState).filter(models.ProjectOrderState.project_id == project_id).all()
    config_map = {c.order_state_id: c for c in configs}
    
    active_states = []
    for state in all_states:
        if state.id in config_map:
            # Explicit config exists
            if config_map[state.id].is_active:
                active_states.append(state)
        else:
            # Fallback to system default
            if state.is_system_default:
                active_states.append(state)
                
    return active_states

@router.put("/projects/{project_id}/order-states", status_code=status.HTTP_204_NO_CONTENT)
def update_project_order_states(project_id: int, state_ids: List[int], db: Session = Depends(get_db)):
    """
    Update the active states for a project.
    Receives a list of state_ids that should be ACTIVE.
    All others will be marked INACTIVE (or just not added if using default logic, 
    but explicit config is safer for "unchecking" a default).
    """
    # Verify project
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get all possible states to know what exists
    all_states = db.query(models.OrderState).all()
    all_state_ids = {s.id for s in all_states}
    
    # Prune invalid IDs from input
    valid_active_ids = set(state_ids).intersection(all_state_ids)
    
    # Upsert logic:
    # We want to create/update records in project_order_states for ALL states
    # to explicitly set is_active=True/False based on the input list.
    
    for state_id in all_state_ids:
        # Check if config exists
        config = db.query(models.ProjectOrderState).filter(
            models.ProjectOrderState.project_id == project_id,
            models.ProjectOrderState.order_state_id == state_id
        ).first()
        
        should_be_active = state_id in valid_active_ids
        
        if config:
            config.is_active = should_be_active
        else:
            new_config = models.ProjectOrderState(
                project_id=project_id,
                order_state_id=state_id,
                is_active=should_be_active,
                is_visible=True # Default visibility
            )
            db.add(new_config)
            
    db.commit()
    return None


@router.post("/projects/{project_id}/orders", response_model=schemas.Order)
def create_order(project_id: int, order_data: schemas.OrderCreate, db: Session = Depends(get_db)):
    # Verify project
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Resolve state
    state_id = order_data.current_state_id
    if not state_id:
        # Get default "Creado" state
        default_state = db.query(models.OrderState).filter(models.OrderState.name == "Creado").first()
        if default_state:
            state_id = default_state.id

    # Create Order
    new_order = models.Order(
        project_id=project_id,
        client_name=order_data.client_name,
        delivery_date=order_data.delivery_date,
        shipping_address=order_data.shipping_address,
        location_lat=order_data.location_lat,
        location_lng=order_data.location_lng,
        notes=order_data.notes,
        current_state_id=state_id,
        total_amount=0 # Calculated below
    )
    db.add(new_order)
    db.flush() # Generate ID

    total_amount = 0
    
    # Create Items
    for item in order_data.items:
        # Calculate subtotal
        subtotal = item.quantity * item.unit_price
        total_amount += subtotal
        
        new_item = models.OrderItem(
            order_id=new_order.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            subtotal=subtotal,
            operative_cost_id=item.operative_cost_id,
            attributes=item.attributes
        )
        db.add(new_item)

    # Update total
    new_order.total_amount = total_amount
    db.commit()
    db.refresh(new_order)
    
    return new_order

@router.get("/projects/{project_id}/orders", response_model=List[schemas.Order])
def get_project_orders(project_id: int, db: Session = Depends(get_db)):
    orders = db.query(models.Order).filter(models.Order.project_id == project_id).all()
    return orders
