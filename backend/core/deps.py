from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import Callable
from backend import models
from backend.core import auth
from backend.schemas import ProjectRole, ROLE_HIERARCHY
from .database import get_db

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


def _role_level(role: str) -> int:
    """Returns numeric level for a role string. Higher = more permissions."""
    try:
        return ROLE_HIERARCHY.index(ProjectRole(role))
    except (ValueError, KeyError):
        return -1


def check_project_role(
    project_id: int,
    user: models.User,
    db: Session,
    min_role: ProjectRole,
) -> models.UserProject:
    """
    Utility for manual role checks inside handlers.
    Superadmins bypass the check and return a synthetic membership with 'owner' role.
    Raises HTTP 403 if user lacks the required role.
    """
    if user.is_admin:
        # Synthetic membership — admins are implicitly owners of every project
        synthetic = models.UserProject()
        synthetic.user_id = user.id
        synthetic.project_id = project_id
        synthetic.role = ProjectRole.owner.value
        return synthetic

    membership = db.query(models.UserProject).filter(
        models.UserProject.user_id == user.id,
        models.UserProject.project_id == project_id,
    ).first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No access to this project",
        )

    if _role_level(membership.role) < _role_level(min_role.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires '{min_role.value}' role or higher in this project",
        )

    return membership


def require_project_role(min_role: ProjectRole) -> Callable:
    """
    Dependency factory for route-level role enforcement.
    Works for routes that expose `project_id` as a path parameter.

    Usage:
        @router.get("/projects/{project_id}/something")
        def handler(
            project_id: int,
            current_user = Depends(require_project_role(ProjectRole.manager)),
            db: Session = Depends(get_db),
        ): ...
    """
    async def dependency(
        project_id: int,
        current_user: models.User = Depends(get_approved_user),
        db: Session = Depends(get_db),
    ) -> models.User:
        check_project_role(project_id, current_user, db, min_role)
        return current_user

    return dependency
