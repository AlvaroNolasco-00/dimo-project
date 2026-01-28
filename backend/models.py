from sqlalchemy import UniqueConstraint
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
    orders = relationship("Order", back_populates="project", cascade="all, delete-orphan")
    order_states_config = relationship("ProjectOrderState", back_populates="project", cascade="all, delete-orphan")

class CostType(Base):
    __tablename__ = "cost_types"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint('name', 'project_id', name='uq_cost_type_name_project'),
    )

class OperativeCost(Base):
    __tablename__ = "operative_costs"

    id = Column(Integer, primary_key=True, index=True)
    cost_type_id = Column(Integer, ForeignKey("cost_types.id", ondelete="CASCADE"))
    base_cost = Column(Numeric(10, 2), nullable=False)
    attributes = Column(JSON, default={})
    created_at = Column(DateTime, server_default=func.now())

    cost_type = relationship("CostType")

class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    
    phone_number = Column(String(50), nullable=False)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    tax_id = Column(String(50), nullable=True)
    client_type = Column(String(20), default='retail')
    shipping_address = Column(String, nullable=True)
    preferences = Column(JSON, default={})
    notes = Column(String, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    project = relationship("Project")
    orders = relationship("Order", back_populates="client")

    __table_args__ = (
        UniqueConstraint('phone_number', 'project_id', name='uq_client_phone_project'),
    )

# --- Order System Models ---

class OrderState(Base):
    __tablename__ = "order_states"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)
    description = Column(String)
    is_system_default = Column(Boolean, default=False)
    color = Column(String(7), default="#6c757d")
    created_at = Column(DateTime, server_default=func.now())

class ProjectOrderState(Base):
    __tablename__ = "project_order_states"

    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    order_state_id = Column(Integer, ForeignKey("order_states.id", ondelete="CASCADE"), primary_key=True)
    is_active = Column(Boolean, default=True)
    is_visible = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)

    # Relationships
    project = relationship("Project", back_populates="order_states_config")
    state = relationship("OrderState")

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    
    client_name = Column(String, nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    delivery_date = Column(DateTime, nullable=True)
    shipping_address = Column(String, nullable=True)
    location_lat = Column(Numeric(10, 6), nullable=True)
    location_lng = Column(Numeric(10, 6), nullable=True)
    
    current_state_id = Column(Integer, ForeignKey("order_states.id"), nullable=True)
    total_amount = Column(Numeric(12, 2), default=0.00)
    notes = Column(String, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    project = relationship("Project", back_populates="orders")
    client = relationship("Client", back_populates="orders")
    state = relationship("OrderState")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    history = relationship("OrderHistory", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    
    description = Column(String, nullable=False)
    quantity = Column(Integer, default=1)
    unit_price = Column(Numeric(10, 2), default=0.00)
    subtotal = Column(Numeric(12, 2), default=0.00)
    
    operative_cost_id = Column(Integer, ForeignKey("operative_costs.id", ondelete="SET NULL"), nullable=True)
    attributes = Column(JSON, default={})
    
    created_at = Column(DateTime, server_default=func.now())


    # Relationships
    order = relationship("Order", back_populates="items")
    operative_cost = relationship("OperativeCost")
    details = relationship("OrderItemDetail", back_populates="item", cascade="all, delete-orphan")

class OrderItemDetail(Base):
    __tablename__ = "order_item_details"

    id = Column(Integer, primary_key=True, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False)
    description = Column(String, nullable=False)
    quantity = Column(Integer, default=1)
    image_path = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    item = relationship("OrderItem", back_populates="details")

class OrderHistory(Base):
    __tablename__ = "order_history"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    action_type = Column(String, nullable=False) # STATUS_CHANGE, DETAILS_UPDATE, NOTE_ADDED
    description = Column(String, nullable=False)
    
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    order = relationship("Order", back_populates="history")
    user = relationship("User")


