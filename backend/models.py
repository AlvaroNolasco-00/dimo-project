from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, DateTime, Numeric, func, Table
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSON
from .database import Base

# Association table for User <-> Project
user_projects = Table(
    "user_projects",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("project_id", Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_approved = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    avatar_url = Column(String, nullable=True)

    projects = relationship("Project", secondary=user_projects, back_populates="users")

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String)
    created_at = Column(DateTime, server_default=func.now())

    users = relationship("User", secondary=user_projects, back_populates="projects")

class CostType(Base):
    __tablename__ = "cost_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(String)
    created_at = Column(DateTime, server_default=func.now())

class OperativeCost(Base):
    __tablename__ = "operative_costs"

    id = Column(Integer, primary_key=True, index=True)
    cost_type_id = Column(Integer, ForeignKey("cost_types.id", ondelete="CASCADE"))
    base_cost = Column(Numeric(10, 2), nullable=False)
    attributes = Column(JSON, default={})
    created_at = Column(DateTime, server_default=func.now())

    cost_type = relationship("CostType")
