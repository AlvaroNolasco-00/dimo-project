from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Set
from .. import models, schemas
from fastapi import HTTPException
import os
import shutil
import uuid
import uuid

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

    # Create or Resolve Client
    client_id = order_data.client_id
    client_name = order_data.client_name

    if order_data.new_client:
        # Check for existing client
        existing_client = db.query(models.Client).filter(
            models.Client.project_id == project_id,
            models.Client.phone_number == order_data.new_client.phone_number
        ).first()

        if existing_client:
            client_id = existing_client.id
            client_name = existing_client.full_name
            # Optional: Update basic info if needed, for now just reuse
        else:
            # Create new client
            new_client = models.Client(
                project_id=project_id,
                phone_number=order_data.new_client.phone_number,
                full_name=order_data.new_client.full_name,
                email=order_data.new_client.email,
                tax_id=order_data.new_client.tax_id,
                client_type=order_data.new_client.client_type,
                shipping_address=order_data.new_client.shipping_address,
                preferences=order_data.new_client.preferences,
                notes=order_data.new_client.notes
            )
            db.add(new_client)
            db.flush()
            client_id = new_client.id
            client_name = new_client.full_name
    elif client_id:
        # If client_id provided but no name, fetch name for the record
        client = db.query(models.Client).get(client_id)
        if client:
            client_name = client.full_name

    # Resolve state
    state_id = order_data.current_state_id
    if not state_id:
        default_state = db.query(models.OrderState).filter(models.OrderState.name == "Creado").first()
        if default_state:
            state_id = default_state.id

    # Fidelity Logic
    applied_coupon_id = order_data.coupon_id
    if not applied_coupon_id and client_id:
        past_orders_count = db.query(models.Order).filter(
            models.Order.client_id == client_id,
            models.Order.project_id == project_id
        ).count()
        
        if past_orders_count >= 5: # Threshold
             fidelity_coupon = db.query(models.Coupon).filter(
                models.Coupon.project_id == project_id,
                models.Coupon.code == "FIDELITY",
                models.Coupon.is_active == True
            ).first()
             if fidelity_coupon:
                 applied_coupon_id = fidelity_coupon.id
    
    # Validation for single use coupons
    if applied_coupon_id:
        coupon = db.query(models.Coupon).get(applied_coupon_id)
        if coupon and coupon.single_use and client_id:
            already_used = db.query(models.Order).filter(
                models.Order.client_id == client_id,
                models.Order.coupon_id == coupon.id
            ).count()
            if already_used > 0:
                raise HTTPException(status_code=400, detail=f"El cupón {coupon.code} ya ha sido utilizado por este cliente.")

    # Create Order
    new_order = models.Order(
        project_id=project_id,
        client_name=client_name or "Unknown Client",
        client_id=client_id,
        delivery_date=order_data.delivery_date,
        shipping_address=order_data.shipping_address,
        location_lat=order_data.location_lat,
        location_lng=order_data.location_lng,
        notes=order_data.notes,
        current_state_id=state_id,
        total_amount=0,
        access_token=str(uuid.uuid4()),
        down_payment_amount=order_data.down_payment_amount or 0.0,
        coupon_id=applied_coupon_id,
        delivery_zone_id=order_data.delivery_zone_id
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

    new_order.total_amount = calculate_total(new_order, total_amount)
    
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

def calculate_total(order: models.Order, items_total: float) -> float:
    final_total = items_total
    
    # Add Delivery (if applicable)
    if order.delivery_zone:
        final_total += float(order.delivery_zone.price)

    if order.coupon:
        if order.coupon.discount_type == "PERCENTAGE":
            discount = items_total * (float(order.coupon.discount_value) / 100)
            final_total -= discount
        else:
             final_total -= float(order.coupon.discount_value)
    
    return max(0, final_total)

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
            
        order.total_amount = calculate_total(order, total_amount)
    
    if order_update.down_payment_amount is not None:
         order.down_payment_amount = order_update.down_payment_amount
         
    if order_update.coupon_id is not None and order.coupon_id != order_update.coupon_id:
        if order_update.coupon_id:
            coupon = db.query(models.Coupon).get(order_update.coupon_id)
            if coupon and coupon.single_use and order.client_id:
                already_used = db.query(models.Order).filter(
                    models.Order.client_id == order.client_id,
                    models.Order.coupon_id == coupon.id,
                    models.Order.id != order.id
                ).count()
                if already_used > 0:
                    raise HTTPException(status_code=400, detail=f"El cupón {coupon.code} ya ha sido utilizado por este cliente.")
        
        order.coupon_id = order_update.coupon_id
        # Recalculate total
        current_items_total = sum(item.subtotal for item in order.items)
        order.total_amount = calculate_total(order, float(current_items_total))

    if order_update.delivery_zone_id is not None: # Check if changed
         if order.delivery_zone_id != order_update.delivery_zone_id:
             order.delivery_zone_id = order_update.delivery_zone_id
             # Recalculate
             # Need to refresh relationship to get price
             db.flush() 
             db.refresh(order)
             current_items_total = sum(item.subtotal for item in order.items)
             order.total_amount = calculate_total(order, float(current_items_total))
        
    db.commit()
    db.refresh(order)
    return order
