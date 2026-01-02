from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional

from .. import models, auth, database
from ..deps import get_db, get_admin_user

router = APIRouter(
    prefix="/api/admin",
    tags=["users"]
)

@router.get("/users")
async def list_users(
    skip: int = 0,
    limit: int = 10,
    search: Optional[str] = None,
    is_approved: Optional[bool] = None,
    is_admin: Optional[bool] = None,
    sort_by: str = "id",
    sort_order: str = "asc",
    db: Session = Depends(get_db), 
    admin: models.User = Depends(get_admin_user)
):
    query = db.query(models.User)
    
    if search:
        search_filter = or_(
            models.User.email.ilike(f"%{search}%"),
            models.User.full_name.ilike(f"%{search}%")
        )
        query = query.filter(search_filter)
    
    if is_approved is not None:
        query = query.filter(models.User.is_approved == is_approved)
    
    if is_admin is not None:
        query = query.filter(models.User.is_admin == is_admin)

    # Sorting
    allowed_sort_fields = ["id", "email", "full_name", "is_approved", "is_admin"]
    if sort_by not in allowed_sort_fields:
        sort_by = "id"
    
    sort_column = getattr(models.User, sort_by)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())
    
    total = query.count()
    users = query.offset(skip).limit(limit).all()
    
    return {
        "total": total,
        "items": [
            {
                "id": u.id, 
                "email": u.email, 
                "full_name": u.full_name,
                "is_approved": u.is_approved, 
                "is_admin": u.is_admin
            } 
            for u in users
        ]
    }

@router.post("/approve/{user_id}")
async def approve_user(user_id: int, db: Session = Depends(get_db), admin: models.User = Depends(get_admin_user)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_approved = True
    db.commit()
    return {"message": f"User {user.email} approved"}

@router.post("/users/create")
async def create_user_by_admin(
    email: str = Form(...),
    full_name: str = Form(...),
    password: str = Form(...),
    is_admin: bool = Form(False),
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user)
):
    # Check if email exists
    db_user = db.query(models.User).filter(models.User.email == email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = models.User(
        email=email,
        full_name=full_name,
        hashed_password=auth.get_password_hash(password),
        is_approved=True, # Auto-approve when created by admin
        is_admin=is_admin
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "User created successfully", "user_id": new_user.id}
