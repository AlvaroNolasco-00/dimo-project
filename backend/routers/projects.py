from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database
from ..deps import get_db, get_current_user, get_admin_user

router = APIRouter(
    prefix="/api/projects",
    tags=["projects"]
)

# --- CRUD Operations ---

@router.get("/", response_model=List[schemas.Project])
def read_projects(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get projects. 
    Admins see all projects.
    Regular users see only assigned projects.
    """
    if current_user.is_admin:
        projects = db.query(models.Project).offset(skip).limit(limit).all()
    else:
        projects = current_user.projects
    return projects

@router.post("/", response_model=schemas.Project)
def create_project(
    project: schemas.ProjectCreate, 
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user)
):
    """
    Create a new project (Admin only).
    """
    db_project = db.query(models.Project).filter(models.Project.name == project.name).first()
    if db_project:
        raise HTTPException(status_code=400, detail="Project with this name already exists")
    
    new_project = models.Project(
        name=project.name,
        description=project.description
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project

@router.put("/{project_id}", response_model=schemas.Project)
def update_project(
    project_id: int, 
    project_update: schemas.ProjectUpdate, 
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user)
):
    """
    Update a project (Admin only).
    """
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project_update.name is not None:
        # Check uniqueness if name is changing
        if project_update.name != db_project.name:
            existing = db.query(models.Project).filter(models.Project.name == project_update.name).first()
            if existing:
                raise HTTPException(status_code=400, detail="Project with this name already exists")
        db_project.name = project_update.name
        
    if project_update.description is not None:
        db_project.description = project_update.description
        
    db.commit()
    db.refresh(db_project)
    return db_project

@router.delete("/{project_id}")
def delete_project(
    project_id: int, 
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user)
):
    """
    Delete a project (Admin only).
    """
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    db.delete(db_project)
    db.commit()
    return {"message": "Project deleted successfully"}

# --- User Assignment ---

@router.post("/{project_id}/users/{user_id}")
def assign_user_to_project(
    project_id: int, 
    user_id: int, 
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user)
):
    """
    Assign a user to a project (Admin only).
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user in project.users:
        raise HTTPException(status_code=400, detail="User already assigned to this project")
        
    project.users.append(user)
    db.commit()
    return {"message": f"User {user.email} assigned to project {project.name}"}

@router.delete("/{project_id}/users/{user_id}")
def remove_user_from_project(
    project_id: int, 
    user_id: int, 
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user)
):
    """
    Remove a user from a project (Admin only).
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user not in project.users:
        raise HTTPException(status_code=400, detail="User is not assigned to this project")
        
    project.users.remove(user)
    db.commit()
    return {"message": f"User {user.email} removed from project {project.name}"}

@router.get("/{project_id}/users")
def get_project_users(
    project_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user)
):
    """
    Get all users assigned to a project (Admin only).
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return [
        {
            "id": u.id, 
            "email": u.email, 
            "full_name": u.full_name,
            "is_approved": u.is_approved, 
            "is_admin": u.is_admin
        } 
        for u in project.users
    ]
