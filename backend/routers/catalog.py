from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional

from backend import models
from backend import schemas
from backend.core.database import get_db
from backend.core.deps import get_current_user
from backend.services import catalog as catalog_service

router = APIRouter(
    prefix="/api/catalog",
    tags=["catalog"],
    responses={404: {"description": "Not found"}},
)

# --- CATEGORIES ---

@router.get("/categories", response_model=List[schemas.ProductCategory])
def list_categories(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return catalog_service.get_categories(db, project_id)


@router.post("/categories", response_model=schemas.ProductCategory)
def create_category(
    data: schemas.ProductCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return catalog_service.create_category(db, data, current_user)


@router.put("/categories/{category_id}", response_model=schemas.ProductCategory)
def update_category(
    category_id: int,
    data: schemas.ProductCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return catalog_service.update_category(db, category_id, data, current_user)


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return catalog_service.delete_category(db, category_id, current_user)


# --- PRODUCTS ---

@router.get("/products", response_model=List[schemas.Product])
def list_products(
    project_id: int,
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return catalog_service.get_products(db, project_id, category_id)


@router.get("/products/{product_id}", response_model=schemas.Product)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return catalog_service.get_product(db, product_id)


@router.post("/products", response_model=schemas.Product)
def create_product(
    data: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return catalog_service.create_product(db, data, current_user)


@router.put("/products/{product_id}", response_model=schemas.Product)
def update_product(
    product_id: int,
    data: schemas.ProductUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return catalog_service.update_product(db, product_id, data, current_user)


@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return catalog_service.delete_product(db, product_id, current_user)


@router.post("/products/{product_id}/upload")
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return await catalog_service.upload_product_image(db, product_id, file, current_user)


# --- PUBLIC ---

@router.get("/public/products/{token}", response_model=schemas.Product)
def get_public_product(token: str, db: Session = Depends(get_db)):
    return catalog_service.get_product_by_token(db, token)


@router.get("/public/categories/{token}", response_model=schemas.ProductCategoryPublic)
def get_public_category(token: str, db: Session = Depends(get_db)):
    return catalog_service.get_category_by_token(db, token)
