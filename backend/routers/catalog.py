from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from backend import models
from backend import schemas
from backend.core.database import get_db
from backend.core.deps import get_current_user, check_project_role
from backend.schemas import ProjectRole
from backend.services import catalog as catalog_service

router = APIRouter(
    prefix="/api/catalog",
    tags=["catalog"],
    responses={404: {"description": "Not found"}},
)

# --- CATEGORIES ---

@router.get("/projects/{project_id}/categories", response_model=List[schemas.ProductCategory])
def list_categories(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    check_project_role(project_id, current_user, db, ProjectRole.viewer)
    return catalog_service.get_categories(db, project_id)


@router.post("/projects/{project_id}/categories", response_model=schemas.ProductCategory)
def create_category(
    project_id: int,
    data: schemas.ProductCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    check_project_role(project_id, current_user, db, ProjectRole.manager)
    return catalog_service.create_category(db, project_id, data, current_user)


@router.put("/projects/{project_id}/categories/{category_id}", response_model=schemas.ProductCategory)
def update_category(
    project_id: int,
    category_id: int,
    data: schemas.ProductCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    category = db.query(models.ProductCategory).filter(models.ProductCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    check_project_role(category.project_id, current_user, db, ProjectRole.manager)
    return catalog_service.update_category(db, category_id, data, current_user)


@router.delete("/projects/{project_id}/categories/{category_id}")
def delete_category(
    project_id: int,
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    category = db.query(models.ProductCategory).filter(models.ProductCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    check_project_role(category.project_id, current_user, db, ProjectRole.manager)
    return catalog_service.delete_category(db, category_id, current_user)


# --- PRODUCTS ---

@router.get("/projects/{project_id}/products", response_model=List[schemas.Product])
def list_products(
    project_id: int,
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    check_project_role(project_id, current_user, db, ProjectRole.viewer)
    return catalog_service.get_products(db, project_id, category_id)


@router.get("/projects/{project_id}/products/{product_id}", response_model=schemas.Product)
def get_product(
    project_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    check_project_role(product.project_id, current_user, db, ProjectRole.viewer)
    return catalog_service.get_product(db, product_id)


@router.post("/projects/{project_id}/products", response_model=schemas.Product)
def create_product(
    project_id: int,
    data: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    check_project_role(project_id, current_user, db, ProjectRole.manager)
    return catalog_service.create_product(db, project_id, data, current_user)


@router.put("/projects/{project_id}/products/{product_id}", response_model=schemas.Product)
def update_product(
    project_id: int,
    product_id: int,
    data: schemas.ProductUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    check_project_role(product.project_id, current_user, db, ProjectRole.manager)
    return catalog_service.update_product(db, product_id, data, current_user)


@router.delete("/projects/{project_id}/products/{product_id}")
def delete_product(
    project_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    check_project_role(product.project_id, current_user, db, ProjectRole.manager)
    return catalog_service.delete_product(db, product_id, current_user)


@router.post("/projects/{project_id}/products/{product_id}/upload")
async def upload_product_image(
    project_id: int,
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    check_project_role(product.project_id, current_user, db, ProjectRole.manager)
    return await catalog_service.upload_product_image(db, product_id, file, current_user)


# --- PUBLIC ---

@router.get("/public/products/{token}", response_model=schemas.Product)
def get_public_product(token: str, db: Session = Depends(get_db)):
    return catalog_service.get_product_by_token(db, token)


@router.get("/public/categories/{token}", response_model=schemas.ProductCategoryPublic)
def get_public_category(token: str, db: Session = Depends(get_db)):
    return catalog_service.get_category_by_token(db, token)
