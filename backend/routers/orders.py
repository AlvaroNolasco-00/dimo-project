from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
import shutil
import os
import uuid
from .. import models, schemas
from ..core import database
from ..core.deps import get_db, get_current_user
from ..services import orders as order_service

router = APIRouter(
    prefix="/api",
    tags=["orders"]
)

# --- Public Endpoints ---

@router.get("/public/orders/{token}", response_model=schemas.Order)
def get_public_order(token: str, db: Session = Depends(get_db)):
    order = db.query(models.Order).filter(models.Order.access_token == token).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@router.put("/public/orders/{token}", response_model=schemas.Order)
def update_public_order(token: str, order_update: schemas.OrderUpdate, db: Session = Depends(get_db)):
    order = db.query(models.Order).filter(models.Order.access_token == token).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Validation: Public user can only update certain fields or states? 
    # For now allow generic update but ideally we restrict this in service
    # We reuse the service update but pass the existing order.user (which might be null or we mock a 'system' user)
    # Actually, we should catch the 'user' requirement.
    # Let's handle generic updates directly or make a specific service method.
    
    # Mocking a "Client" action in history
    if order_update.notes is not None:
        order.notes = order_update.notes
        
    if order_update.delivery_zone_id is not None:
         order.delivery_zone_id = order_update.delivery_zone_id
         # Trigger recalculation via service or manual logic?
         # Since we don't have user object here, we can't call service.update_order easily.
         # Let's import logic or duplicate simple recalc.
         db.flush()
         db.refresh(order) # Load zone
         
         # Calc
         items_total = sum(item.subtotal for item in order.items)
         
         final_total = float(items_total)
         if order.delivery_zone:
             final_total += float(order.delivery_zone.price)
             
         if order.coupon:
            if order.coupon.discount_type == "PERCENTAGE":
                discount = float(items_total) * (float(order.coupon.discount_value) / 100)
                final_total -= discount
            else:
                final_total -= float(order.coupon.discount_value)
         
         order.total_amount = max(0, final_total)

    if order_update.items is not None:
         # Simplified item update logic for public (uploading/details)
         # We expect the full item structure coming back
         pass # Handled by service if we use it, but service requires User model.
    
    # TODO: Refactor service to allow system/public updates without User model or overload.
    # For now, we will perform a direct update for specific allowed fields
    
    db.commit()
    db.refresh(order)
    return order

@router.post("/public/orders/{token}/upload")
async def upload_public_order_file(token: str, item_id: Optional[int] = None, file: UploadFile = File(...), db: Session = Depends(get_db)):
    order = db.query(models.Order).filter(models.Order.access_token == token).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    upload_dir = f"backend/static/uploads/orders/{order.id}/client"
    os.makedirs(upload_dir, exist_ok=True)
    
    filename = f"{uuid.uuid4()}_{file.filename.replace(' ', '_')}"
    file_path = os.path.join(upload_dir, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    url = f"/api/static/uploads/orders/{order.id}/client/{filename}"

    if item_id:
        # Create detail record to link the file to the item
        # Verify item belongs to order
        item = db.query(models.OrderItem).filter(models.OrderItem.id == item_id, models.OrderItem.order_id == order.id).first()
        if item:
             new_detail = models.OrderItemDetail(
                 order_item_id=item.id,
                 description="Arte subido por cliente",
                 quantity=1,
                 image_path=url
             )
             db.add(new_detail)
             db.commit()

    return {"url": url, "filename": filename}

# --- Configuration Endpoints ---

@router.post("/projects/{project_id}/delivery-zones", response_model=schemas.DeliveryZone)
def create_delivery_zone(project_id: int, zone: schemas.DeliveryZoneCreate, db: Session = Depends(get_db)):
    new_zone = models.DeliveryZone(**zone.dict())
    db.add(new_zone)
    db.commit()
    db.refresh(new_zone)
    return new_zone

@router.get("/projects/{project_id}/delivery-zones", response_model=List[schemas.DeliveryZone])
def get_delivery_zones(project_id: int, db: Session = Depends(get_db)):
    return db.query(models.DeliveryZone).filter(models.DeliveryZone.project_id == project_id).all()

@router.put("/projects/{project_id}/delivery-zones/{zone_id}", response_model=schemas.DeliveryZone)
def update_delivery_zone(project_id: int, zone_id: int, zone_update: schemas.DeliveryZoneCreate, db: Session = Depends(get_db)):
    zone = db.query(models.DeliveryZone).filter(models.DeliveryZone.id == zone_id, models.DeliveryZone.project_id == project_id).first()
    if not zone:
         raise HTTPException(status_code=404, detail="Zone not found")
    
    zone.name = zone_update.name
    zone.price = zone_update.price
    zone.zone_type = zone_update.zone_type
    zone.is_active = zone_update.is_active
    zone.coordinates = zone_update.coordinates
    
    db.commit()
    db.refresh(zone)
    return zone

@router.post("/projects/{project_id}/coupons", response_model=schemas.Coupon)
def create_coupon(project_id: int, coupon: schemas.CouponCreate, db: Session = Depends(get_db)):
    new_coupon = models.Coupon(**coupon.dict())
    db.add(new_coupon)
    db.commit()
    db.refresh(new_coupon)
    return new_coupon

@router.get("/projects/{project_id}/coupons", response_model=List[schemas.Coupon])
def get_coupons(project_id: int, db: Session = Depends(get_db)):
    return db.query(models.Coupon).filter(models.Coupon.project_id == project_id).all()

# --- Existing Endpoints ---

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
    return order_service.get_effective_order_states(db, project_id)

@router.put("/projects/{project_id}/order-states", status_code=status.HTTP_204_NO_CONTENT)
def update_project_order_states(project_id: int, state_ids: List[int], db: Session = Depends(get_db)):
    """
    Update the active states for a project.
    """
    order_service.update_project_order_states_config(db, project_id, state_ids)
    return None


@router.post("/projects/{project_id}/orders", response_model=schemas.Order)
def create_order(project_id: int, order_data: schemas.OrderCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return order_service.create_order(db, project_id, order_data, current_user)

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
    return order_service.update_order(db, project_id, order_id, order_update, current_user)


@router.post("/orders/{order_id}/upload")
async def upload_order_file(order_id: int, file: UploadFile = File(...)):
    # Define upload directory for this order
    # Note: Logic also could be moved to service, but leaving simple file handling here is often acceptable for now
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
