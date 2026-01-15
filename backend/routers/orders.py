from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
import shutil
import os
from .. import models, schemas, database
from ..deps import get_db, get_current_user

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
    Optimized to use a single query.
    """
    # Query: Select all OrderStates, join with ProjectOrderState for this project.
    # We want:
    # 1. States that have a config entry with is_active = True
    # 2. States that have NO config entry BUT are system defaults (is_system_default = True)
    
    # Aliased for clarity, though not strictly needed if we access columns directly
    
    results = db.query(models.OrderState, models.ProjectOrderState)\
        .outerjoin(models.ProjectOrderState, 
                   (models.OrderState.id == models.ProjectOrderState.order_state_id) & 
                   (models.ProjectOrderState.project_id == project_id))\
        .all()
        
    active_states = []
    for state, config in results:
        if config:
            # If config exists, respect is_active
            if config.is_active:
                active_states.append(state)
        else:
            # If no config, checkout default
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
def create_order(project_id: int, order_data: schemas.OrderCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
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
        
        # Prepare details
        details_objects = []
        if item.details:
            for d in item.details:
                details_objects.append(models.OrderItemDetail(
                    description=d.description,
                    quantity=d.quantity,
                    image_path=d.image_path
                ))

        new_item = models.OrderItem(
            order_id=new_order.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            subtotal=subtotal,
            operative_cost_id=item.operative_cost_id,
            attributes=item.attributes,
            details=details_objects
        )
        db.add(new_item)

    # Update total
    new_order.total_amount = total_amount
    
    # Log History
    history = models.OrderHistory(
        order_id=new_order.id,
        user_id=current_user.id,
        action_type="CREATED",
        description=f"Pedido creado por {current_user.full_name}"
    )
    db.add(history)
    
    db.commit()
    db.refresh(new_order)
    
    return new_order

@router.get("/projects/{project_id}/orders", response_model=List[schemas.Order])
def get_project_orders(project_id: int, db: Session = Depends(get_db)):
    orders = db.query(models.Order).filter(models.Order.project_id == project_id).all()
    return orders

@router.get("/projects/{project_id}/orders/{order_id}", response_model=schemas.Order)
def get_order(project_id: int, order_id: int, db: Session = Depends(get_db)):
    # Use joinedload to fetch details efficiently
    order = db.query(models.Order)\
        .options(joinedload(models.Order.items).joinedload(models.OrderItem.details))\
        .filter(
            models.Order.project_id == project_id,
            models.Order.id == order_id
        ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@router.put("/projects/{project_id}/orders/{order_id}", response_model=schemas.Order)
def update_order(project_id: int, order_id: int, order_update: schemas.OrderUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    order = db.query(models.Order).filter(
        models.Order.project_id == project_id,
        models.Order.id == order_id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    # Update fields
    # Update fields
    # Check if order is currently Cancelled
    current_state_name = order.state.name if order.state else "N/A"
    if current_state_name == "Cancelado":
        # Allow ONLY notes update
        # If trying to change state OR items OR other fields, forbid it
        # Exception: We verify what is actually being changed.
        
        # Check if state change is attempted (and it's not staying the same)
        if order_update.current_state_id is not None and order_update.current_state_id != order.current_state_id:
             raise HTTPException(status_code=400, detail="No se puede cambiar el estado de un pedido cancelado.")
        
        # Check if items are being updated
        if order_update.items is not None:
             raise HTTPException(status_code=400, detail="No se pueden modificar items de un pedido cancelado.")

        # Notes are allowed
        if order_update.notes is not None and order.notes != order_update.notes:
            history = models.OrderHistory(
                order_id=order.id,
                user_id=current_user.id,
                action_type="UPDATE_DETAILS",
                description="Información adicional actualizada (Pedido Cancelado)"
            )
            db.add(history)
            order.notes = order_update.notes
        
        db.commit()
        db.refresh(order)
        return order


    if order_update.current_state_id is not None and order.current_state_id != order_update.current_state_id:
        old_state_name = order.state.name if order.state else "N/A"
        new_state = db.query(models.OrderState).get(order_update.current_state_id)
        new_state_name = new_state.name if new_state else "Unknown"
        
        history = models.OrderHistory(
            order_id=order.id,
            user_id=current_user.id,
            action_type="STATUS_CHANGE",
            description=f"Estado de la orden actualizado: {old_state_name} -> {new_state_name}"
        )
        db.add(history)
        order.current_state_id = order_update.current_state_id
        
    if order_update.notes is not None and order.notes != order_update.notes:
        history = models.OrderHistory(
            order_id=order.id,
            user_id=current_user.id,
            action_type="UPDATE_DETAILS",
            description="Información adicional actualizada"
        )
        db.add(history)
        order.notes = order_update.notes
        
    # Update items if provided (Full replacement strategy)
    if order_update.items is not None:
        # Log history
        history = models.OrderHistory(
            order_id=order.id,
            user_id=current_user.id,
            action_type="UPDATE_ITEMS",
            description="Items de la orden actualizados"
        )
        db.add(history)

        # Delete existing items
        db.query(models.OrderItem).filter(models.OrderItem.order_id == order_id).delete()
        
        # Add new items
        total_amount = 0
        for item in order_update.items:
            subtotal = item.quantity * item.unit_price
            total_amount += subtotal
            
            # Prepare details
            details_objects = []
            if item.details:
                for d in item.details:
                    details_objects.append(models.OrderItemDetail(
                        description=d.description,
                        quantity=d.quantity,
                        image_path=d.image_path
                    ))

            new_item = models.OrderItem(
                order_id=order.id,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                subtotal=subtotal,
                operative_cost_id=item.operative_cost_id,
                attributes=item.attributes,
                details=details_objects
            )
            db.add(new_item)
            
        order.total_amount = total_amount
        
    db.commit()
    db.refresh(order)
    return order


@router.post("/orders/{order_id}/upload")
async def upload_order_file(order_id: int, file: UploadFile = File(...)):
    # Define upload directory for this order
    upload_dir = f"backend/static/uploads/orders/{order_id}"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Secure filename (basic)
    filename = file.filename.replace(" ", "_")
    file_path = os.path.join(upload_dir, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Construct URL (relative to API base or static mount)
    # Mounted at /api/static
    url = f"/api/static/uploads/orders/{order_id}/{filename}"
    
    return {"url": url, "filename": filename}

@router.get("/orders/{order_id}/history", response_model=List[schemas.OrderHistory])
def get_order_history(order_id: int, db: Session = Depends(get_db)):
    history = db.query(models.OrderHistory)\
        .options(joinedload(models.OrderHistory.user))\
        .filter(models.OrderHistory.order_id == order_id)\
        .order_by(models.OrderHistory.created_at.asc())\
        .all()
    return history
