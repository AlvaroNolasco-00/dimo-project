import uuid
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session
from backend import models
from backend import schemas
from backend.services import storage


def get_categories(db: Session, project_id: int):
    return db.query(models.ProductCategory).filter(
        models.ProductCategory.project_id == project_id
    ).all()


def create_category(db: Session, project_id: int, data: schemas.ProductCategoryCreate, user: models.User):
    existing = db.query(models.ProductCategory).filter(
        models.ProductCategory.name == data.name,
        models.ProductCategory.project_id == project_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre en este proyecto")

    category = models.ProductCategory(
        project_id=project_id,
        name=data.name,
        description=data.description,
        is_active=data.is_active,
        access_token=str(uuid.uuid4()),
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_category(db: Session, category_id: int, data: schemas.ProductCategoryUpdate, user: models.User):
    category = db.query(models.ProductCategory).filter(models.ProductCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    if data.name is not None:
        category.name = data.name
    if data.description is not None:
        category.description = data.description
    if data.is_active is not None:
        category.is_active = data.is_active

    db.commit()
    db.refresh(category)
    return category


def delete_category(db: Session, category_id: int, user: models.User):
    category = db.query(models.ProductCategory).filter(models.ProductCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    db.delete(category)
    db.commit()
    return {"ok": True}


def get_products(db: Session, project_id: int, category_id: int = None):
    query = db.query(models.Product).filter(models.Product.project_id == project_id)
    if category_id is not None:
        query = query.filter(models.Product.category_id == category_id)
    return query.order_by(models.Product.created_at.desc()).all()


def get_product(db: Session, product_id: int):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product


def get_category_by_token(db: Session, token: str):
    category = db.query(models.ProductCategory).filter(
        models.ProductCategory.access_token == token,
        models.ProductCategory.is_active == True
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    products = db.query(models.Product).filter(
        models.Product.category_id == category.id,
        models.Product.is_active == True
    ).order_by(models.Product.created_at.desc()).all()

    return {
        "id": category.id,
        "name": category.name,
        "description": category.description,
        "products": products,
    }


def get_product_by_token(db: Session, token: str):
    product = db.query(models.Product).filter(
        models.Product.access_token == token,
        models.Product.is_active == True
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product


def create_product(db: Session, project_id: int, data: schemas.ProductCreate, user: models.User):
    product = models.Product(
        project_id=project_id,
        category_id=data.category_id,
        name=data.name,
        description=data.description,
        sale_price=data.sale_price,
        is_active=data.is_active,
        access_token=str(uuid.uuid4()),
    )
    db.add(product)
    db.flush()

    for line in data.cost_lines:
        cost_line = models.ProductCostLine(
            product_id=product.id,
            operative_cost_id=line.operative_cost_id,
            label=line.label,
            quantity=line.quantity,
            unit_cost=line.unit_cost,
        )
        db.add(cost_line)

    db.commit()
    db.refresh(product)
    return product


def update_product(db: Session, product_id: int, data: schemas.ProductUpdate, user: models.User):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if data.name is not None:
        product.name = data.name
    if data.description is not None:
        product.description = data.description
    if data.sale_price is not None:
        product.sale_price = data.sale_price
    if data.is_active is not None:
        product.is_active = data.is_active
    if data.category_id is not None:
        product.category_id = data.category_id

    if data.cost_lines is not None:
        # Replace all cost lines
        db.query(models.ProductCostLine).filter(
            models.ProductCostLine.product_id == product_id
        ).delete()
        for line in data.cost_lines:
            cost_line = models.ProductCostLine(
                product_id=product.id,
                operative_cost_id=line.operative_cost_id,
                label=line.label,
                quantity=line.quantity,
                unit_cost=line.unit_cost,
            )
            db.add(cost_line)

    db.commit()
    db.refresh(product)
    return product


def delete_product(db: Session, product_id: int, user: models.User):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    db.delete(product)
    db.commit()
    return {"ok": True}


async def upload_product_image(db: Session, product_id: int, file: UploadFile, user: models.User):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    filename = f"{uuid.uuid4()}_{file.filename.replace(' ', '_')}"
    folder = f"uploads/products/{product_id}"
    content = await file.read()
    url = await storage.upload_file(content, folder, filename)

    product.image_path = url
    db.commit()
    db.refresh(product)
    return {"url": url, "filename": filename}
