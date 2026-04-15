from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend import models
from backend import schemas
from backend.core.deps import get_db, get_current_user, get_admin_user, check_project_role
from backend.schemas import ProjectRole

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
    """Get projects. Admins see all; regular users see only assigned ones."""
    if current_user.is_admin:
        return db.query(models.Project).offset(skip).limit(limit).all()
    return current_user.projects

@router.post("/", response_model=schemas.Project)
def create_project(
    project: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user)
):
    """Create a new project (Admin only)."""
    if db.query(models.Project).filter(models.Project.name == project.name).first():
        raise HTTPException(status_code=400, detail="Project with this name already exists")

    new_project = models.Project(name=project.name, description=project.description)
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project

@router.put("/{project_id}", response_model=schemas.Project)
def update_project(
    project_id: int,
    project_update: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user)
):
    """Update a project (Admin only)."""
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project_update.name is not None and project_update.name != db_project.name:
        if db.query(models.Project).filter(models.Project.name == project_update.name).first():
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
    _admin: models.User = Depends(get_admin_user)
):
    """Delete a project (Admin only)."""
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(db_project)
    db.commit()
    return {"message": "Project deleted successfully"}

# --- User Assignment ---

@router.get("/{project_id}/users", response_model=List[schemas.ProjectUserWithRole])
def get_project_users(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get all users assigned to a project with their roles. Requires manager+ or admin."""
    check_project_role(project_id, current_user, db, ProjectRole.manager)

    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    memberships = db.query(models.UserProject).filter(
        models.UserProject.project_id == project_id
    ).all()

    result = []
    for m in memberships:
        u = m.user
        result.append(schemas.ProjectUserWithRole(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            is_approved=u.is_approved,
            is_admin=u.is_admin,
            role=ProjectRole(m.role),
        ))
    return result

@router.post("/{project_id}/users/{user_id}")
def assign_user_to_project(
    project_id: int,
    user_id: int,
    body: schemas.AssignUserToProject,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Assign a user to a project with a role. Requires owner role or admin."""
    check_project_role(project_id, current_user, db, ProjectRole.owner)

    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.query(models.UserProject).filter(
        models.UserProject.user_id == user_id,
        models.UserProject.project_id == project_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already assigned to this project")

    membership = models.UserProject(
        user_id=user_id,
        project_id=project_id,
        role=body.role.value,
    )
    db.add(membership)
    db.commit()
    return {"message": f"User {user.email} assigned to project {project.name} with role '{body.role.value}'"}

@router.patch("/{project_id}/users/{user_id}/role")
def update_user_project_role(
    project_id: int,
    user_id: int,
    body: schemas.UpdateProjectRole,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Change a user's role within a project. Requires owner role or admin."""
    check_project_role(project_id, current_user, db, ProjectRole.owner)

    membership = db.query(models.UserProject).filter(
        models.UserProject.user_id == user_id,
        models.UserProject.project_id == project_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="User is not assigned to this project")

    membership.role = body.role.value
    db.commit()
    return {"message": f"Role updated to '{body.role.value}'"}

@router.delete("/{project_id}/users/{user_id}")
def remove_user_from_project(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Remove a user from a project. Requires owner role or admin."""
    check_project_role(project_id, current_user, db, ProjectRole.owner)

    membership = db.query(models.UserProject).filter(
        models.UserProject.user_id == user_id,
        models.UserProject.project_id == project_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=400, detail="User is not assigned to this project")

    db.delete(membership)
    db.commit()
    return {"message": "User removed from project"}
