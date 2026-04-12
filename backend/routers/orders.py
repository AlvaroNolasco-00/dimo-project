from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
import uuid
from datetime import datetime, timedelta
from backend import models
from backend import schemas
from backend.core import database
from backend.core.deps import get_db, get_current_user
from backend.services import orders as order_service
from backend.services import storage

router = APIRouter(
    prefix="/api",
    tags=["orders"]
)

@router.get("/projects/{project_id}/coupons/stats", response_model=schemas.CouponStatisticsResponse)
def get_coupon_statistics(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Get all coupons for the project
    coupons = db.query(models.Coupon).filter(models.Coupon.project_id == project_id).all()
    
    # Dates for last month
    now = datetime.now()
    last_month_start = now - timedelta(days=30)
    
    stats_list = []
    total_uses_all = 0
    total_last_month_all = 0
    
    for coupon in coupons:
        # Total uses
        total_uses = db.query(models.Order).filter(models.Order.coupon_id == coupon.id).count()
        
        # Last month uses
        last_month_uses = db.query(models.Order).filter(
            models.Order.coupon_id == coupon.id,
            models.Order.created_at >= last_month_start
        ).count()
        
        stats_list.append(schemas.CouponUsageStats(
            id=coupon.id,
            code=coupon.code,
            total_uses=total_uses,
            last_month_uses=last_month_uses,
            discount_type=coupon.discount_type,
            discount_value=float(coupon.discount_value)
        ))
        
        total_uses_all += total_uses
        total_last_month_all += last_month_uses
    
    # Sort for top used and least used
    top_used = sorted(stats_list, key=lambda x: x.total_uses, reverse=True)
    least_used = sorted(stats_list, key=lambda x: x.total_uses)
    
    return schemas.CouponStatisticsResponse(
        summary={
            "total_coupons": len(coupons),
            "total_uses": total_uses_all,
            "total_last_month": total_last_month_all
        },
        top_used=top_used[:5], # Top 5
        least_used=least_used[:5] # Bottom 5
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
            if order.coupon.single_use and order.client_id:
                already_used = db.query(models.Order).filter(
                    models.Order.client_id == order.client_id,
                    models.Order.coupon_id == order.coupon.id,
                    models.Order.id != order.id
                ).count()
                if already_used > 0:
                    raise HTTPException(status_code=400, detail=f"El cupón {order.coupon.code} ya ha sido utilizado por este cliente.")

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

    filename = f"{uuid.uuid4()}_{file.filename.replace(' ', '_')}"
    folder = f"uploads/orders/{order.id}/client"
    content = await file.read()
    url = await storage.upload_file(content, folder, filename)

    if item_id:
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
def update_delivery_zone(project_id: int, zone_id: int, zone_update: schemas.DeliveryZoneUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    zone = db.query(models.DeliveryZone).filter(models.DeliveryZone.id == zone_id, models.DeliveryZone.project_id == project_id).first()
    if not zone:
         raise HTTPException(status_code=404, detail="Zone not found")
    
    # Save current state to history before update
    previous_state = jsonable_encoder(zone)
    
    history_entry = models.DeliveryZoneHistory(
        zone_id=zone.id,
        modified_by_id=current_user.id,
        previous_state=previous_state,
        change_reason=zone_update.change_reason
    )
    db.add(history_entry)
    
    update_data = zone_update.dict(exclude_unset=True)
    if 'change_reason' in update_data:
        del update_data['change_reason']

    for key, value in update_data.items():
        setattr(zone, key, value)
    
    db.commit()
    db.refresh(zone)
    return zone

@router.get("/projects/{project_id}/delivery-zones/{zone_id}/history", response_model=List[schemas.DeliveryZoneHistory])
def get_delivery_zone_history(project_id: int, zone_id: int, db: Session = Depends(get_db)):
    return db.query(models.DeliveryZoneHistory)\
        .options(joinedload(models.DeliveryZoneHistory.modified_by))\
        .filter(models.DeliveryZoneHistory.zone_id == zone_id)\
        .order_by(models.DeliveryZoneHistory.created_at.desc())\
        .all()

@router.post("/projects/{project_id}/coupons", response_model=schemas.Coupon)
def create_coupon(project_id: int, coupon: schemas.CouponCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    new_coupon = models.Coupon(**coupon.dict())
    new_coupon.created_by_id = current_user.id
    db.add(new_coupon)
    db.commit()
    db.refresh(new_coupon)
    return new_coupon

@router.get("/projects/{project_id}/coupons", response_model=List[schemas.Coupon])
def get_coupons(project_id: int, db: Session = Depends(get_db)):
    return db.query(models.Coupon)\
        .options(joinedload(models.Coupon.created_by))\
        .filter(models.Coupon.project_id == project_id).all()

@router.put("/projects/{project_id}/coupons/{coupon_id}", response_model=schemas.Coupon)
def update_coupon(project_id: int, coupon_id: int, coupon_update: schemas.CouponUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    coupon = db.query(models.Coupon).filter(models.Coupon.id == coupon_id, models.Coupon.project_id == project_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    # Save current state to history before update
    previous_state = jsonable_encoder(coupon)
    # Cleanup state - remove keys that shouldn't be reverted or are too metadata-heavy
    # Actually just keeping code, discount, etc. is fine.
    
    history_entry = models.CouponHistory(
        coupon_id=coupon.id,
        modified_by_id=current_user.id,
        previous_state=previous_state,
        change_reason=coupon_update.change_reason
    )
    db.add(history_entry)
    
    update_data = coupon_update.dict(exclude_unset=True)
    if 'change_reason' in update_data:
        del update_data['change_reason']

    for key, value in update_data.items():
        setattr(coupon, key, value)
    
    db.commit()
    db.refresh(coupon)
    return coupon

@router.get("/projects/{project_id}/coupons/{coupon_id}/history", response_model=List[schemas.CouponHistory])
def get_coupon_history(project_id: int, coupon_id: int, db: Session = Depends(get_db)):
    return db.query(models.CouponHistory)\
        .options(joinedload(models.CouponHistory.modified_by))\
        .filter(models.CouponHistory.coupon_id == coupon_id)\
        .order_by(models.CouponHistory.created_at.desc())\
        .all()

@router.post("/projects/{project_id}/coupons/{coupon_id}/revert/{history_id}", response_model=schemas.Coupon)
def revert_coupon(project_id: int, coupon_id: int, history_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    coupon = db.query(models.Coupon).filter(models.Coupon.id == coupon_id, models.Coupon.project_id == project_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
        
    history = db.query(models.CouponHistory).filter(models.CouponHistory.id == history_id, models.CouponHistory.coupon_id == coupon_id).first()
    if not history:
        raise HTTPException(status_code=404, detail="History record not found")
    
    # Save current state as history BEFORE revert (so we can undo the revert)
    current_state = jsonable_encoder(coupon)
    revert_history = models.CouponHistory(
        coupon_id=coupon.id,
        modified_by_id=current_user.id,
        previous_state=current_state,
        change_reason=f"Reversión al estado del {history.created_at.strftime('%Y-%m-%d %H:%M')}"
    )
    db.add(revert_history)
    
    # Apply previous state
    state = history.previous_state
    # We only revert business fields
    fields_to_revert = ['code', 'description', 'discount_type', 'discount_value', 'min_purchase_amount', 'is_active', 'single_use']
    for field in fields_to_revert:
        if field in state:
            setattr(coupon, field, state[field])
    
    db.commit()
    db.refresh(coupon)
    return coupon

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
    filename = file.filename.replace(" ", "_")
    folder = f"uploads/orders/{order_id}"
    content = await file.read()
    url = await storage.upload_file(content, folder, filename)
    return {"url": url, "filename": filename}

@router.get("/orders/{order_id}/history", response_model=List[schemas.OrderHistory])
def get_order_history(order_id: int, db: Session = Depends(get_db)):
    history = db.query(models.OrderHistory)\
        .options(joinedload(models.OrderHistory.user))\
        .filter(models.OrderHistory.order_id == order_id)\
        .order_by(models.OrderHistory.created_at.asc())\
        .all()
    return history
