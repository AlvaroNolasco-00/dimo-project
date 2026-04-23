-- MASTER MIGRATION (2026-04-22)
-- Purpose:
--   Complete, idempotent schema for the DIMO application.
--   Creates ALL tables, indexes, constraints, and seed data from scratch.
--   Safe to re-run — uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--
-- How to run:
--   python -m backend.scripts.run_migrations
--   Or manually via psql: psql -d your_db -f master_migration_20260422.sql
--
-- Notes:
--   - Does NOT truncate or destroy existing data.
--   - If your DB role differs from 'dimo_app_user', adjust the GRANT section.
--   - Some objects may already exist; this script only adds what is missing.

BEGIN;

-- Required for gen_random_uuid() used when generating access tokens.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure the app user can create objects and access existing ones.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dimo_app_user') THEN
        EXECUTE 'GRANT USAGE ON SCHEMA public TO dimo_app_user';
        EXECUTE 'GRANT CREATE ON SCHEMA public TO dimo_app_user';
    END IF;
END
$$;

-- ===========================================================================
-- 1) AUTH & MULTI-TENANCY
-- ===========================================================================

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

CREATE INDEX IF NOT EXISTS ix_users_email ON users (email);

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR UNIQUE NOT NULL,
    description VARCHAR,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_projects_name ON projects (name);

-- User <-> Project association with RBAC role
CREATE TABLE IF NOT EXISTS user_projects (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'editor',  -- viewer, editor, manager, owner
    PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS ix_user_projects_user_id ON user_projects(user_id);
CREATE INDEX IF NOT EXISTS ix_user_projects_project_id ON user_projects(project_id);

-- ===========================================================================
-- 2) COSTS (operative costs, cost types)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS cost_types (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    description VARCHAR,
    requires_art BOOLEAN DEFAULT FALSE,
    profit_margin NUMERIC(5, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_cost_type_name_project UNIQUE (name, project_id)
);

CREATE INDEX IF NOT EXISTS ix_cost_types_project_id ON cost_types (project_id);

CREATE TABLE IF NOT EXISTS operative_costs (
    id SERIAL PRIMARY KEY,
    cost_type_id INTEGER REFERENCES cost_types(id) ON DELETE CASCADE,
    parent_cost_id INTEGER REFERENCES operative_costs(id) ON DELETE CASCADE,
    base_cost NUMERIC(10, 2) NOT NULL,
    attributes JSON DEFAULT '{}'::json,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_operative_costs_type ON operative_costs (cost_type_id);
CREATE INDEX IF NOT EXISTS ix_operative_costs_parent ON operative_costs (parent_cost_id);

-- ===========================================================================
-- 3) ORDER STATES (global + per-project config)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS order_states (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_system_default BOOLEAN DEFAULT FALSE,
    color VARCHAR(7) DEFAULT '#6c757d',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Seed default order states (idempotent)
INSERT INTO order_states (name, description, color)
VALUES
    ('Creado', 'Pedido recién creado', '#9ca3af'),
    ('Edición', 'En proceso de diseño/edición', '#3b82f6'),
    ('Insumos', 'Esperando materiales/insumos', '#f59e0b'),
    ('Manufacturando', 'En producción', '#6366f1'),
    ('Revelado', 'Proceso de revelado', '#ec4899'),
    ('Corte', 'En proceso de corte', '#14b8a6'),
    ('Impresión', 'En proceso de impresión', '#06b6d4'),
    ('Control de Calidad', 'Revisión de calidad', '#eab308'),
    ('Listo para enviar', 'Terminado, pendiente de envío', '#22c55e'),
    ('Enviado', 'En camino al cliente', '#2563eb'),
    ('Entregado', 'Entregado al cliente', '#8b5cf6')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS project_order_states (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    order_state_id INTEGER NOT NULL REFERENCES order_states(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    is_visible BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    PRIMARY KEY (project_id, order_state_id)
);

-- ===========================================================================
-- 4) CLIENTS & ADDRESSES
-- ===========================================================================

CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phone_number VARCHAR(50) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    tax_id VARCHAR(50),
    client_type VARCHAR(20) DEFAULT 'retail',
    shipping_address TEXT,
    preferences JSONB DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_client_phone_project UNIQUE (phone_number, project_id)
);

CREATE INDEX IF NOT EXISTS ix_clients_phone ON clients (phone_number);
CREATE INDEX IF NOT EXISTS ix_clients_name ON clients (full_name);
CREATE INDEX IF NOT EXISTS ix_clients_project ON clients (project_id);

CREATE TABLE IF NOT EXISTS client_addresses (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    address_line TEXT NOT NULL,
    zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
    formatted_address TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_client_addresses_client_id ON client_addresses(client_id);

-- ===========================================================================
-- 5) DELIVERY ZONES & HISTORY
-- ===========================================================================

CREATE TABLE IF NOT EXISTS delivery_zones (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10, 2) DEFAULT 0.00,
    zone_type VARCHAR(50) DEFAULT 'STANDARD_PAID',
    is_active BOOLEAN DEFAULT TRUE,
    coordinates JSON,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_delivery_zones_project_id ON delivery_zones(project_id);

CREATE TABLE IF NOT EXISTS delivery_zone_history (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,
    modified_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    previous_state JSONB NOT NULL,
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_delivery_zone_history_zone_id ON delivery_zone_history(zone_id);

-- ===========================================================================
-- 6) COUPONS & HISTORY
-- ===========================================================================

CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    description TEXT,
    discount_type VARCHAR(50) DEFAULT 'FIXED',
    discount_value NUMERIC(10, 2) NOT NULL,
    min_purchase_amount NUMERIC(10, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    single_use BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_coupons_project_id ON coupons (project_id);
CREATE INDEX IF NOT EXISTS ix_coupons_code ON coupons (code);

CREATE TABLE IF NOT EXISTS coupon_history (
    id SERIAL PRIMARY KEY,
    coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    modified_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    previous_state JSONB NOT NULL,
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_coupon_history_coupon_id ON coupon_history(coupon_id);

-- ===========================================================================
-- 7) ORDERS, ITEMS, DETAILS, HISTORY
-- ===========================================================================

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    client_name VARCHAR(255) NOT NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    delivery_date TIMESTAMPTZ,
    shipping_address TEXT,
    location_lat NUMERIC(10, 6),
    location_lng NUMERIC(10, 6),
    current_state_id INTEGER REFERENCES order_states(id),
    total_amount NUMERIC(12, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    access_token VARCHAR(255) UNIQUE,
    down_payment_amount NUMERIC(12, 2) DEFAULT 0.00,
    coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL,
    delivery_zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_orders_project_id ON orders(project_id);
CREATE INDEX IF NOT EXISTS ix_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS ix_orders_state_id ON orders(current_state_id);
CREATE INDEX IF NOT EXISTS ix_orders_access_token ON orders(access_token);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    operative_cost_id INTEGER REFERENCES operative_costs(id) ON DELETE SET NULL,
    attributes JSON DEFAULT '{}'::json,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_order_items_order_id ON order_items (order_id);

CREATE TABLE IF NOT EXISTS order_item_details (
    id SERIAL PRIMARY KEY,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    description VARCHAR NOT NULL,
    quantity INTEGER DEFAULT 1,
    image_path VARCHAR,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_order_item_details_item_id ON order_item_details (order_item_id);

CREATE TABLE IF NOT EXISTS order_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_order_history_order_id ON order_history(order_id);

-- ===========================================================================
-- 8) PROCESSING (async tasks + audit log)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS processing_tasks (
    id VARCHAR(255) PRIMARY KEY,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    result_url TEXT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_processing_tasks_id ON processing_tasks(id);
CREATE INDEX IF NOT EXISTS ix_processing_tasks_status ON processing_tasks(status);

-- Audit log for all image processing operations
CREATE TABLE IF NOT EXISTS processing_audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Identificación de la operación
    operation VARCHAR(50) NOT NULL,   -- REMOVE_BACKGROUND, REMOVE_OBJECTS, ENHANCE_QUALITY, UPSCALE, HALFTONE, CONTOUR_CLIP, WATERMARK, FILTER, TRANSFORM, CROP
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, SUCCESS, FAILED

    -- Tiempos
    duration_ms INTEGER,              -- Milisegundos de procesamiento

    -- Metadata del input
    input_file_size INTEGER,          -- Bytes
    input_width INTEGER,              -- Píxeles
    input_height INTEGER,             -- Píxeles

    -- Metadata del output
    output_file_size INTEGER,         -- Bytes

    -- Contexto de hardware
    accelerator VARCHAR(20),          -- mps, coreml, cpu, cloud_gpu

    -- Parámetros de la operación (JSON flexible)
    parameters JSONB DEFAULT '{}',

    -- Manejo de errores
    error_message TEXT,

    -- Link a ProcessingTask (solo upscale async)
    task_id VARCHAR(255),

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_audit_log_user_id ON processing_audit_log(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_log_operation ON processing_audit_log(operation);
CREATE INDEX IF NOT EXISTS ix_audit_log_created_at ON processing_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_log_status ON processing_audit_log(status);
CREATE INDEX IF NOT EXISTS ix_audit_log_op_date ON processing_audit_log(operation, created_at DESC);

COMMENT ON TABLE processing_audit_log IS 'Bitácora de operaciones de procesamiento de imágenes';
COMMENT ON COLUMN processing_audit_log.operation IS 'Tipo: REMOVE_BACKGROUND, REMOVE_OBJECTS, ENHANCE_QUALITY, UPSCALE, HALFTONE, CONTOUR_CLIP, WATERMARK, FILTER, TRANSFORM, CROP';
COMMENT ON COLUMN processing_audit_log.status IS 'Estado: PENDING, SUCCESS, FAILED';
COMMENT ON COLUMN processing_audit_log.duration_ms IS 'Tiempo total en milisegundos';
COMMENT ON COLUMN processing_audit_log.accelerator IS 'Hardware: mps, coreml, cpu, cloud_gpu';
COMMENT ON COLUMN processing_audit_log.parameters IS 'Parámetros específicos en JSON';
COMMENT ON COLUMN processing_audit_log.task_id IS 'ID del ProcessingTask asociado (solo operaciones async)';

-- ===========================================================================
-- 9) CATALOG (product categories, products, cost lines)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS product_categories (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    description VARCHAR,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    access_token VARCHAR UNIQUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_category_name_project UNIQUE (name, project_id)
);

CREATE INDEX IF NOT EXISTS ix_product_categories_project_id ON product_categories(project_id);
CREATE INDEX IF NOT EXISTS ix_product_categories_access_token ON product_categories(access_token);

-- Generate tokens for categories if missing
UPDATE product_categories
SET access_token = gen_random_uuid()::text
WHERE access_token IS NULL;

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
    name VARCHAR NOT NULL,
    description VARCHAR,
    image_path VARCHAR,
    sale_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    access_token VARCHAR UNIQUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_products_project_id ON products(project_id);
CREATE INDEX IF NOT EXISTS ix_products_access_token ON products(access_token);
CREATE INDEX IF NOT EXISTS ix_products_category_id ON products(category_id);

CREATE TABLE IF NOT EXISTS product_cost_lines (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    operative_cost_id INTEGER REFERENCES operative_costs(id) ON DELETE SET NULL,
    label VARCHAR NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_cost NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_product_cost_lines_product_id ON product_cost_lines(product_id);

-- ===========================================================================
-- 10) ALTER TABLE — Add missing columns to existing tables
--     (handles incremental migrations that added columns after table creation)
-- ===========================================================================

-- user_projects.role (from add_role_to_user_projects.sql)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_projects' AND column_name = 'role'
    ) THEN
        ALTER TABLE user_projects ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'editor';
    END IF;
END
$$;

-- Set existing admin users as owners
UPDATE user_projects up
SET role = 'owner'
FROM users u
WHERE up.user_id = u.id
  AND u.is_admin = TRUE
  AND up.role = 'editor';

-- cost_types.requires_art (from add_requires_art_to_cost_types.sql)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cost_types' AND column_name = 'requires_art'
    ) THEN
        ALTER TABLE cost_types ADD COLUMN requires_art BOOLEAN DEFAULT FALSE;
    END IF;
END
$$;

-- cost_types.profit_margin (from add_profit_margin_to_cost_types.sql)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cost_types' AND column_name = 'profit_margin'
    ) THEN
        ALTER TABLE cost_types ADD COLUMN profit_margin NUMERIC(5, 2) DEFAULT 0;
    END IF;
END
$$;

-- operative_costs.parent_cost_id (from add_parent_cost_id.sql)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operative_costs' AND column_name = 'parent_cost_id'
    ) THEN
        ALTER TABLE operative_costs ADD COLUMN parent_cost_id INTEGER REFERENCES operative_costs(id) ON DELETE CASCADE;
    END IF;
END
$$;

-- order_states.color (from update_order_states_color.sql)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_states' AND column_name = 'color'
    ) THEN
        ALTER TABLE order_states ADD COLUMN color VARCHAR(7) DEFAULT '#6c757d';
    END IF;
END
$$;

-- Set colors for existing order states
UPDATE order_states SET color = '#9ca3af' WHERE name = 'Creado' AND color IS NULL;
UPDATE order_states SET color = '#3b82f6' WHERE name = 'Edición' AND color IS NULL;
UPDATE order_states SET color = '#f59e0b' WHERE name = 'Insumos' AND color IS NULL;
UPDATE order_states SET color = '#6366f1' WHERE name = 'Manufacturando' AND color IS NULL;
UPDATE order_states SET color = '#ec4899' WHERE name = 'Revelado' AND color IS NULL;
UPDATE order_states SET color = '#14b8a6' WHERE name = 'Corte' AND color IS NULL;
UPDATE order_states SET color = '#06b6d4' WHERE name = 'Impresión' AND color IS NULL;
UPDATE order_states SET color = '#eab308' WHERE name = 'Control de Calidad' AND color IS NULL;
UPDATE order_states SET color = '#22c55e' WHERE name = 'Listo para enviar' AND color IS NULL;
UPDATE order_states SET color = '#2563eb' WHERE name = 'Enviado' AND color IS NULL;
UPDATE order_states SET color = '#8b5cf6' WHERE name = 'Entregado' AND color IS NULL;

-- delivery_zones.coordinates (from add_coordinates_to_zones.sql)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'delivery_zones' AND column_name = 'coordinates'
    ) THEN
        ALTER TABLE delivery_zones ADD COLUMN coordinates JSON;
    END IF;
END
$$;

-- coupons.single_use
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'coupons' AND column_name = 'single_use'
    ) THEN
        ALTER TABLE coupons ADD COLUMN single_use BOOLEAN DEFAULT FALSE;
    END IF;
END
$$;

-- coupons.created_by_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'coupons' AND column_name = 'created_by_id'
    ) THEN
        ALTER TABLE coupons ADD COLUMN created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- orders.access_token
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'access_token'
    ) THEN
        ALTER TABLE orders ADD COLUMN access_token VARCHAR(255) UNIQUE;
        CREATE INDEX IF NOT EXISTS ix_orders_access_token ON orders(access_token);
    END IF;
END
$$;

-- orders.down_payment_amount
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'down_payment_amount'
    ) THEN
        ALTER TABLE orders ADD COLUMN down_payment_amount NUMERIC(12, 2) DEFAULT 0.00;
    END IF;
END
$$;

-- orders.coupon_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'coupon_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- orders.delivery_zone_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'delivery_zone_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN delivery_zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- orders.client_id (link to clients table)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'client_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- product_categories.access_token (from add_category_access_token.sql)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'product_categories' AND column_name = 'access_token'
    ) THEN
        ALTER TABLE product_categories ADD COLUMN access_token VARCHAR UNIQUE;
        CREATE INDEX IF NOT EXISTS ix_product_categories_access_token ON product_categories(access_token);
    END IF;
END
$$;

-- Generate tokens for existing categories if missing
UPDATE product_categories
SET access_token = gen_random_uuid()::text
WHERE access_token IS NULL;

-- ===========================================================================
-- 11) PERMISSIONS (final — after all tables and columns created)
-- ===========================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dimo_app_user') THEN
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dimo_app_user';
        EXECUTE 'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO dimo_app_user';
    END IF;
END
$$;

COMMIT;
