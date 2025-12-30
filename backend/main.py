from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import or_

import backend.processing as processing
from . import models, auth, database
from .database import engine, get_db

# Create DB tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="PhotoEdit Suite API")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = auth.decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    email: str = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user

async def get_approved_user(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account not approved yet. Please wait for an administrator to approve your account."
        )
    return current_user

async def get_admin_user(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user

app = FastAPI(title="PhotoEdit Suite API")

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# --- AUTH ENDPOINTS ---

@app.post("/api/auth/register")
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

@app.post("/api/auth/login")
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

@app.get("/api/auth/me")
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    return {
        "email": current_user.email,
        "is_approved": current_user.is_approved,
        "is_admin": current_user.is_admin
    }

# --- ADMIN ENDPOINTS ---

@app.get("/api/admin/users")
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

@app.post("/api/admin/approve/{user_id}")
async def approve_user(user_id: int, db: Session = Depends(get_db), admin: models.User = Depends(get_admin_user)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_approved = True
    db.commit()
    return {"message": f"User {user.email} approved"}

# --- IMAGE PROCESSING ENDPOINTS (PROTECTED) ---

@app.post("/api/remove-objects")
async def api_remove_objects(
    image: UploadFile = File(...),
    mask: Optional[UploadFile] = File(None),
    x: Optional[int] = Form(None),
    y: Optional[int] = Form(None),
    tolerance: int = Form(30),
    user: models.User = Depends(get_approved_user)
):
    """
    Remove objects from image using one of two modes:
    1. Manual mask mode: Provide 'mask' file (from canvas drawing)
    2. Flood fill mode: Provide 'x' and 'y' coordinates (magic wand)
    """
    try:
        image_bytes = await image.read()
        
        # Mode 1: Manual mask provided
        if mask is not None:
            mask_bytes = await mask.read()
            result = processing.remove_objects(image_bytes, mask_bytes)
            return Response(content=result, media_type="image/png")
        
        # Mode 2: Coordinates provided (flood fill)
        elif x is not None and y is not None:
            # Generate mask from point
            mask_bytes = processing.create_mask_from_point(image_bytes, x, y, tolerance)
            # Apply inpainting with generated mask
            result = processing.remove_objects(image_bytes, mask_bytes)
            return Response(content=result, media_type="image/png")
        
        else:
            raise HTTPException(
                status_code=400, 
                detail="Either 'mask' file or both 'x' and 'y' coordinates must be provided"
            )
            
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/remove-background")
async def api_remove_background(
    image: UploadFile = File(...),
    mask: Optional[UploadFile] = File(None),
    colors: Optional[str] = Form(None),
    threshold: int = Form(30),
    refine: bool = Form(False),
    user: models.User = Depends(get_approved_user)
):
    try:
        image_bytes = await image.read()
        
        # Mode 1: Manual mask provided
        if mask is not None:
            mask_bytes = await mask.read()
            result = processing.remove_background_with_mask(image_bytes, mask_bytes, refine)
            return Response(content=result, media_type="image/png")
            
        # Mode 2: Specific colors provided
        elif colors:
            import json
            # Expecting colors as a JSON string of list of lists/tuples, e.g. "[[255, 0, 0]]"
            try:
                colors_list = json.loads(colors)
                result = processing.remove_specific_colors(image_bytes, colors_list, threshold)
            except Exception as e:
                 raise HTTPException(status_code=400, detail=f"Invalid color format: {str(e)}")
        
        # Mode 3: Automatic background removal (rembg)
        else:
            result = processing.remove_background(image_bytes)
            
        return Response(content=result, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/enhance-quality")
async def api_enhance_quality(
    image: UploadFile = File(...),
    contrast: float = Form(1.2),
    brightness: float = Form(1.1),
    sharpness: float = Form(1.3),
    user: models.User = Depends(get_approved_user)
):
    try:
        image_bytes = await image.read()
        result = processing.enhance_quality(image_bytes, contrast, brightness, sharpness)
        return Response(content=result, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upscale")
async def api_upscale(
    image: UploadFile = File(...), 
    factor: float = Form(2.0),
    detail_boost: float = Form(1.5),
    user: models.User = Depends(get_approved_user)
):
    try:
        if factor <= 0:
            raise HTTPException(status_code=400, detail="Upscale factor must be greater than 0")
            
        image_bytes = await image.read()
        result = processing.upscale_image(image_bytes, factor, detail_boost)
        return Response(content=result, media_type="image/png")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/halftone")
async def api_halftone(
    image: UploadFile = File(...),
    dot_size: int = Form(10),
    scale: float = Form(1.0),
    colors: Optional[str] = Form(None),
    threshold: int = Form(30),
    spacing: int = Form(0),
    user: models.User = Depends(get_approved_user)
):
    try:
        image_bytes = await image.read()
        
        colors_list = None
        if colors:
            import json
            try:
                colors_list = json.loads(colors)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid color format: {str(e)}")
        
        result = processing.generate_halftone(
            image_bytes, 
            dot_size=dot_size, 
            scale=scale, 
            remove_colors=colors_list, 
            tolerance=threshold,
            spacing=spacing
        )
        return Response(content=result, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/contour-clip")
async def api_contour_clip(
    image: UploadFile = File(...),
    mask: Optional[UploadFile] = File(None),
    mode: str = Form('manual'),
    refine: bool = Form(False),
    colors: Optional[str] = Form(None),
    threshold: int = Form(30),
    user: models.User = Depends(get_approved_user)
):
    try:
        image_bytes = await image.read()
        mask_bytes = None
        if mask:
            mask_bytes = await mask.read()
            
        colors_list = None
        if colors:
            import json
            try:
                colors_list = json.loads(colors)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid color format: {str(e)}")
            
        result = processing.contour_clip(image_bytes, mask_bytes, mode, refine, colors_list, threshold)
        return Response(content=result, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# app.mount("/", StaticFiles(directory="frontend/dist/frontend/browser", html=True), name="static")

import uvicorn
if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
