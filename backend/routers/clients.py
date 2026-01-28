from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas, database
from ..deps import get_db, get_current_user

router = APIRouter(
    prefix="/api",
    tags=["clients"]
)

@router.get("/projects/{project_id}/clients", response_model=List[schemas.Client])
def get_clients(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Lista todos los clientes de un proyecto.
    """
    clients = db.query(models.Client).filter(models.Client.project_id == project_id).all()
    return clients

@router.get("/projects/{project_id}/clients/{client_id}", response_model=schemas.Client)
def get_client(project_id: int, client_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Obtiene los detalles de un cliente específico por ID.
    """
    client = db.query(models.Client).filter(
        models.Client.project_id == project_id,
        models.Client.id == client_id
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return client

@router.get("/projects/{project_id}/clients/search/{phone_number}", response_model=schemas.Client)
def get_client_by_phone(project_id: int, phone_number: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Busca un cliente por su número de teléfono dentro de un proyecto.
    """
    client = db.query(models.Client).filter(
        models.Client.project_id == project_id,
        models.Client.phone_number == phone_number
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado con ese número de teléfono")
    return client

@router.post("/projects/{project_id}/clients", response_model=schemas.Client)
def create_client(project_id: int, client_data: schemas.ClientCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Crea un nuevo cliente. Verifica que el número de teléfono sea único por proyecto.
    """
    # Check if client with same phone already exists in project
    existing = db.query(models.Client).filter(
        models.Client.project_id == project_id,
        models.Client.phone_number == client_data.phone_number
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un cliente con este número de teléfono.")
    
    new_client = models.Client(
        project_id=project_id,
        phone_number=client_data.phone_number,
        full_name=client_data.full_name,
        email=client_data.email,
        tax_id=client_data.tax_id,
        client_type=client_data.client_type,
        shipping_address=client_data.shipping_address,
        preferences=client_data.preferences,
        notes=client_data.notes
    )
    db.add(new_client)
    db.commit()
    db.refresh(new_client)
    return new_client

@router.put("/projects/{project_id}/clients/{client_id}", response_model=schemas.Client)
def update_client(project_id: int, client_id: int, client_update: schemas.ClientUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Actualiza la información de un cliente existente.
    """
    client = db.query(models.Client).filter(
        models.Client.project_id == project_id,
        models.Client.id == client_id
    ).first()
    
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
        
    update_data = client_update.model_dump(exclude_unset=True)
    
    # If phone number is being updated, check for uniqueness
    if "phone_number" in update_data and update_data["phone_number"] != client.phone_number:
        existing = db.query(models.Client).filter(
            models.Client.project_id == project_id,
            models.Client.phone_number == update_data["phone_number"]
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="El nuevo número de teléfono ya está en uso por otro cliente.")

    for key, value in update_data.items():
        setattr(client, key, value)
        
    db.commit()
    db.refresh(client)
    return client

@router.delete("/projects/{project_id}/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(project_id: int, client_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Elimina un cliente.
    """
    client = db.query(models.Client).filter(
        models.Client.project_id == project_id,
        models.Client.id == client_id
    ).first()
    
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
        
    db.delete(client)
    db.commit()
    return None
