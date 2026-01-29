-- MASTER DATABASE SETUP SCRIPT
-- ============================
-- Description: This script sets up the entire database schema for the application,
--              creates the application user, and assigns strict permissions.
-- Safe to run by: Database Administrator (DBA)
-- Created: 2024 (Consolidated Version)

-- 1. USER & ROLE MANAGEMENT
-- =========================
-- Check if user exists, if not create it (Idempotent approach for role)
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'dimo_app_user') THEN

      CREATE ROLE dimo_app_user WITH LOGIN PASSWORD 'secure_password_placeholder';
   END IF;
END
$do$;

-- 2. SCHEMA DEFINITION
-- ====================
-- Tables are created in dependency order (parents first, then children)

-- Table: users (System Administrators and App Users)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR,
    email VARCHAR UNIQUE,
    hashed_password VARCHAR,
    is_approved BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    avatar_url VARCHAR,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Table: projects
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR UNIQUE NOT NULL,
    description VARCHAR,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_projects_name ON projects (name);

-- Table: user_projects (Many-to-Many: Users <-> Projects)
CREATE TABLE IF NOT EXISTS user_projects (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, project_id)
);

-- Table: cost_types (Categorization of costs per project)
CREATE TABLE IF NOT EXISTS cost_types (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    description VARCHAR,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_cost_type_name_project UNIQUE (name, project_id)
);

-- Table: operative_costs (Detailed costs for cost types)
CREATE TABLE IF NOT EXISTS operative_costs (
    id SERIAL PRIMARY KEY,
    cost_type_id INTEGER REFERENCES cost_types(id) ON DELETE CASCADE,
    base_cost DECIMAL(10, 2) NOT NULL,
    attributes JSONB DEFAULT '{}', -- e.g. {"size": "M", "color": "Blue"}
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_operative_costs_type ON operative_costs (cost_type_id);

-- Table: order_states (Global catalog)
CREATE TABLE IF NOT EXISTS order_states (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_system_default BOOLEAN DEFAULT FALSE,
    color VARCHAR(7) DEFAULT '#6c757d',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Table: project_order_states (Project specific state config)
CREATE TABLE IF NOT EXISTS project_order_states (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    order_state_id INTEGER NOT NULL REFERENCES order_states(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    is_visible BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    PRIMARY KEY (project_id, order_state_id)
);

-- Table: orders
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- Client Info
    client_name VARCHAR(255) NOT NULL,
    delivery_date TIMESTAMP,
    shipping_address TEXT,
    location_lat NUMERIC(10, 6),
    location_lng NUMERIC(10, 6),
    -- State & Financials
    current_state_id INTEGER REFERENCES order_states(id),
    total_amount NUMERIC(12, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Table: order_items
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    operative_cost_id INTEGER REFERENCES operative_costs(id) ON DELETE SET NULL,
    attributes JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Table: order_item_details (Sub-items/Breakdown)
CREATE TABLE IF NOT EXISTS order_item_details (
    id SERIAL PRIMARY KEY,
    order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
    description VARCHAR NOT NULL,
    quantity INTEGER DEFAULT 1,
    image_path VARCHAR,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_order_item_details_item_id ON order_item_details (order_item_id);

-- Table: order_history (Audit log)
CREATE TABLE IF NOT EXISTS order_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL, 
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON order_history(order_id);

-- 3. DEFAULT DATA INSERTION
-- =========================

-- Default Order States
INSERT INTO order_states (name, description, is_system_default) VALUES
('Creado', 'La orden ha sido creada pero no procesada.', TRUE),
('Edición', 'Orden en etapa de cambios y ajustes.', TRUE),
('Insumos', 'Orden en espera o recolección de materiales.', TRUE),
('Manufacturando', 'Orden en proceso de producción.', TRUE),
('Revelado', 'Proceso de revelado de pantallas (Serigrafía).', FALSE),
('Corte', 'Corte de tela.', FALSE),
('Impresión', 'Proceso de estampado.', FALSE),
('Control de Calidad', 'Revisión final del producto.', FALSE),
('Listo para enviar', 'Orden terminada esperando envío.', TRUE),
('Enviado', 'Orden en transito.', TRUE),
('Entregado', 'Orden recibida por el cliente.', TRUE)
ON CONFLICT (name) DO NOTHING;

-- 4. PERMISSIONS & SECURITY
-- =========================
-- Grant permissions specifically for the application user

-- GRANT CONNECT ON DATABASE dimo_project TO dimo_app_user; 
-- ^ Note: Commented out because database names differ on Koyeb/managed platforms.
-- If needed, run manually: GRANT CONNECT ON DATABASE your_database_name TO dimo_app_user;

GRANT USAGE ON SCHEMA public TO dimo_app_user;

-- Grant CRUD on all application tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE projects TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_projects TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cost_types TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operative_costs TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE order_states TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_order_states TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE orders TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE order_items TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE order_item_details TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE order_history TO dimo_app_user;

-- Grant Sequence Usage (Required for SERIAL/AUTO INCREMENT)
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO dimo_app_user;

-- ==========================================================
-- END OF SCRIPT
-- ==========================================================
