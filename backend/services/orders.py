from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Set
from .. import models, schemas
from fastapi import HTTPException
import os
import shutil

# --- Order States Logic ---

def get_effective_order_states(db: Session, project_id: int) -> List[models.OrderState]:
    """
    Get effective order states for a project.
    """
    results = db.query(models.OrderState, models.ProjectOrderState)\
        .outerjoin(models.ProjectOrderState, 
                   (models.OrderState.id == models.ProjectOrderState.order_state_id) & 
                   (models.ProjectOrderState.project_id == project_id))\
        .all()
        
    active_states = []
    for state, config in results:
        if config:
            if config.is_active:
                active_states.append(state)
        else:
            if state.is_system_default:
                active_states.append(state)
                
    return active_states

def update_project_order_states_config(db: Session, project_id: int, state_ids: List[int]):
    """
    Update the active states for a project.
    """
    # Verify project
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get all possible states
    all_states = db.query(models.OrderState).all()
    all_state_ids = {s.id for s in all_states}
    
    # Prune invalid IDs
    valid_active_ids = set(state_ids).intersection(all_state_ids)
    
    for state_id in all_state_ids:
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
                is_visible=True
            )
            db.add(new_config)
            
    db.commit()

# --- Orders Logic ---

def create_order(db: Session, project_id: int, order_data: schemas.OrderCreate, user: models.User) -> models.Order:
    # Verify project
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Resolve state
    state_id = order_data.current_state_id
    if not state_id:
        default_state = db.query(models.OrderState).filter(models.OrderState.name == "Creado").first()
        if default_state:
            state_id = default_state.id

    # Create Order
    new_order = models.Order(
        project_id=project_id,
        client_name=order_data.client_name,
        client_id=order_data.client_id,
        delivery_date=order_data.delivery_date,
        shipping_address=order_data.shipping_address,
        location_lat=order_data.location_lat,
        location_lng=order_data.location_lng,
        notes=order_data.notes,
        current_state_id=state_id,
        total_amount=0
    )
    db.add(new_order)
    db.flush()

    total_amount = 0
    
    # Create Items
    for item in order_data.items:
        subtotal = item.quantity * item.unit_price
        total_amount += subtotal
        
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

    new_order.total_amount = total_amount
    
    # Log History
    history = models.OrderHistory(
        order_id=new_order.id,
        user_id=user.id,
        action_type="CREATED",
        description=f"Pedido creado por {user.full_name}"
    )
    db.add(history)
    
    db.commit()
    db.refresh(new_order)
    return new_order

def update_order(db: Session, project_id: int, order_id: int, order_update: schemas.OrderUpdate, user: models.User) -> models.Order:
    order = db.query(models.Order).filter(
        models.Order.project_id == project_id,
        models.Order.id == order_id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    current_state_name = order.state.name if order.state else "N/A"
    
    # Access check for Cancelled orders
    if current_state_name == "Cancelado":
        if order_update.current_state_id is not None and order_update.current_state_id != order.current_state_id:
             raise HTTPException(status_code=400, detail="No se puede cambiar el estado de un pedido cancelado.")
        
        if order_update.items is not None:
             raise HTTPException(status_code=400, detail="No se pueden modificar items de un pedido cancelado.")

        if order_update.notes is not None and order.notes != order_update.notes:
            history = models.OrderHistory(
                order_id=order.id,
                user_id=user.id,
                action_type="UPDATE_DETAILS",
                description="Información adicional actualizada (Pedido Cancelado)"
            )
            db.add(history)
            order.notes = order_update.notes
        
        db.commit()
        db.refresh(order)
        return order

    # Normal Update
    if order_update.current_state_id is not None and order.current_state_id != order_update.current_state_id:
        old_state_name = order.state.name if order.state else "N/A"
        new_state = db.query(models.OrderState).get(order_update.current_state_id)
        new_state_name = new_state.name if new_state else "Unknown"
        
        history = models.OrderHistory(
            order_id=order.id,
            user_id=user.id,
            action_type="STATUS_CHANGE",
            description=f"Estado de la orden actualizado: {old_state_name} -> {new_state_name}"
        )
        db.add(history)
        order.current_state_id = order_update.current_state_id
        
    if order_update.notes is not None and order.notes != order_update.notes:
        history = models.OrderHistory(
            order_id=order.id,
            user_id=user.id,
            action_type="UPDATE_DETAILS",
            description="Información adicional actualizada"
        )
        db.add(history)
        order.notes = order_update.notes
        
    if order_update.items is not None:
        history = models.OrderHistory(
            order_id=order.id,
            user_id=user.id,
            action_type="UPDATE_ITEMS",
            description="Items de la orden actualizados"
        )
        db.add(history)

        db.query(models.OrderItem).filter(models.OrderItem.order_id == order_id).delete()
        
        total_amount = 0
        for item in order_update.items:
            subtotal = item.quantity * item.unit_price
            total_amount += subtotal
            
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
