from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
import shutil
import os
from .. import models, schemas
from ..core import database
from ..core.deps import get_db, get_current_user
from ..services import orders as order_service

router = APIRouter(
    prefix="/api",
    tags=["orders"]
)

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
