from fastapi import APIRouter, Depends, HTTPException, status, Form, UploadFile, File
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
import os
from datetime import datetime

from backend import models
from backend.core import auth, database
from backend.core.deps import get_db, get_current_user
from backend.services import storage

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"]
)

@router.post("/register")
async def register(email: str = Form(...), full_name: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # First user is admin and approved automatically
    user_count = db.query(models.User).count()
    is_first = user_count == 0
    
    new_user = models.User(
        email=email,
        full_name=full_name,
        hashed_password=auth.get_password_hash(password),
        is_approved=is_first,
        is_admin=is_first
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User created successfully. Wait for admin approval." if not is_first else "Admin user created."}

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = auth.create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me")
async def read_users_me(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.is_admin:
        all_projs = db.query(models.Project).all()
        projects_list = [{"id": p.id, "name": p.name, "role": "owner"} for p in all_projs]
    else:
        memberships = db.query(models.UserProject).filter(
            models.UserProject.user_id == current_user.id
        ).all()
        membership_map = {m.project_id: m.role for m in memberships}
        projects_list = [
            {"id": p.id, "name": p.name, "role": membership_map.get(p.id)}
            for p in current_user.projects
        ]

    return {
        "email": current_user.email,
        "full_name": current_user.full_name,
        "is_approved": current_user.is_approved,
        "is_admin": current_user.is_admin,
        "avatar_url": current_user.avatar_url,
        "projects": projects_list
    }

@router.post("/change-password")
async def change_password(
    current_password: str = Form(...),
    new_password: str = Form(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not auth.verify_password(current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")
    
    current_user.hashed_password = auth.get_password_hash(new_password)
    db.commit()
    return {"message": "Password updated successfully"}

@router.post("/avatar")
async def update_avatar(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        file_extension = os.path.splitext(file.filename)[1]
        filename = f"avatar_{current_user.id}_{int(datetime.utcnow().timestamp())}{file_extension}"

        content = await file.read()
        avatar_url = await storage.upload_file(content, "", filename)

        old_avatar_url = current_user.avatar_url
        current_user.avatar_url = avatar_url
        db.commit()

        # Eliminar avatar anterior (no falla si no existe)
        if old_avatar_url:
            await storage.delete_file(old_avatar_url)

        return {"avatar_url": avatar_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/validate-email")
async def validate_email(
    current_user: models.User = Depends(get_current_user)
):
    # Mock implementation
    print(f"Sending validation email to {current_user.email}")
    return {"message": "Validation email sent"}
