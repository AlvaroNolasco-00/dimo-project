-- MASTER MIGRATION (2026-04-06)
-- Purpose:
--   Apply the schema changes introduced by the recent SQL scripts in this repo,
--   in a single, idempotent PostgreSQL file.
--
-- How to run:
--   Execute as a database administrator (or any role that can CREATE/GRANT).
--   The script is written to be safe to re-run (IF NOT EXISTS / column checks).
--
-- Notes:
--   - This script does NOT truncate or destroy existing data.
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

-- ---------------------------------------------------------------------------
-- Base tables required by the later ALTER/CREATE steps
-- (created with IF NOT EXISTS so it is safe for DBs that already have data)
-- ---------------------------------------------------------------------------
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

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR UNIQUE NOT NULL,
    description VARCHAR,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_projects_name ON projects (name);

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

CREATE TABLE IF NOT EXISTS order_states (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_system_default BOOLEAN DEFAULT FALSE,
    color VARCHAR(7) DEFAULT '#6c757d',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_order_states (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    order_state_id INTEGER NOT NULL REFERENCES order_states(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    is_visible BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    PRIMARY KEY (project_id, order_state_id)
);

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

-- Create coupons so the later ALTER TABLE coupons steps never fail.
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_coupons_project_id ON coupons (project_id);
CREATE INDEX IF NOT EXISTS ix_coupons_code ON coupons (code);

-- Create orders and order_items; later steps will add columns if missing.
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    client_name VARCHAR(255) NOT NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    delivery_date TIMESTAMP WITH TIME ZONE,
    shipping_address TEXT,
    location_lat NUMERIC(10, 6),
    location_lng NUMERIC(10, 6),
    current_state_id INTEGER REFERENCES order_states(id),
    total_amount NUMERIC(12, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

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

-- ---------------------------------------------------------------------------
-- 1) Delivery zones and history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_zones (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10, 2) DEFAULT 0.00,
    zone_type VARCHAR(50) DEFAULT 'STANDARD_PAID',
    is_active BOOLEAN DEFAULT TRUE,
    coordinates JSON,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE delivery_zones
    ADD COLUMN IF NOT EXISTS coordinates JSON;

CREATE TABLE IF NOT EXISTS delivery_zone_history (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,
    modified_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    previous_state JSONB NOT NULL,
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_delivery_zone_history_zone_id
    ON delivery_zone_history(zone_id);

-- ---------------------------------------------------------------------------
-- 2) Clients (management module) and client addresses
-- ---------------------------------------------------------------------------
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

DO $$
BEGIN
    -- If orders already exist, add the optional client_id link column.
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'client_id'
    ) THEN
        NULL;
    ELSE
        IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders'
        ) THEN
            ALTER TABLE orders
                ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
        END IF;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS client_addresses (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    address_line TEXT NOT NULL,
    zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
    formatted_address TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 3) Coupons and coupon history
-- ---------------------------------------------------------------------------
ALTER TABLE coupons
    ADD COLUMN IF NOT EXISTS single_use BOOLEAN DEFAULT FALSE;

ALTER TABLE coupons
    ADD COLUMN IF NOT EXISTS created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS coupon_history (
    id SERIAL PRIMARY KEY,
    coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    modified_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    previous_state JSONB NOT NULL,
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_coupon_history_coupon_id
    ON coupon_history(coupon_id);

-- ---------------------------------------------------------------------------
-- 4) Orders: public access token, down payment, and foreign keys
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- access_token (unique)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='orders' AND column_name='access_token'
    ) THEN
        ALTER TABLE orders
            ADD COLUMN access_token VARCHAR(255) UNIQUE;
        CREATE INDEX IF NOT EXISTS idx_orders_access_token ON orders(access_token);
    END IF;

    -- down_payment_amount
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='orders' AND column_name='down_payment_amount'
    ) THEN
        ALTER TABLE orders
            ADD COLUMN down_payment_amount NUMERIC(12, 2) DEFAULT 0.00;
    END IF;

    -- coupon_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='orders' AND column_name='coupon_id'
    ) THEN
        ALTER TABLE orders
            ADD COLUMN coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL;
    END IF;

    -- delivery_zone_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='orders' AND column_name='delivery_zone_id'
    ) THEN
        ALTER TABLE orders
            ADD COLUMN delivery_zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 5) Order states: color + default values
-- ---------------------------------------------------------------------------
ALTER TABLE order_states
    ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#6c757d';

UPDATE order_states SET color = '#9ca3af' WHERE name = 'Creado';
UPDATE order_states SET color = '#3b82f6' WHERE name = 'Edición';
UPDATE order_states SET color = '#f59e0b' WHERE name = 'Insumos';
UPDATE order_states SET color = '#6366f1' WHERE name = 'Manufacturando';
UPDATE order_states SET color = '#ec4899' WHERE name = 'Revelado';
UPDATE order_states SET color = '#14b8a6' WHERE name = 'Corte';
UPDATE order_states SET color = '#06b6d4' WHERE name = 'Impresión';
UPDATE order_states SET color = '#eab308' WHERE name = 'Control de Calidad';
UPDATE order_states SET color = '#22c55e' WHERE name = 'Listo para enviar';
UPDATE order_states SET color = '#2563eb' WHERE name = 'Enviado';
UPDATE order_states SET color = '#8b5cf6' WHERE name = 'Entregado';

-- ---------------------------------------------------------------------------
-- 6) Order history + item details
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON order_history(order_id);

-- Order item details (customer uploads / breakdown images)
CREATE TABLE IF NOT EXISTS order_item_details (
    id SERIAL PRIMARY KEY,
    order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
    description VARCHAR NOT NULL,
    quantity INTEGER DEFAULT 1,
    image_path VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_order_item_details_item_id
    ON order_item_details (order_item_id);

-- ---------------------------------------------------------------------------
-- 7) Processing tasks (async GPU tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processing_tasks (
    id VARCHAR(255) PRIMARY KEY,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    result_url TEXT,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_processing_tasks_id ON processing_tasks(id);

-- ---------------------------------------------------------------------------
-- 8) Catalog: product categories, products, product cost lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_categories (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    description VARCHAR,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    access_token VARCHAR UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_product_category_name_project UNIQUE (name, project_id)
);

CREATE INDEX IF NOT EXISTS ix_product_categories_project_id
    ON product_categories(project_id);

ALTER TABLE product_categories
    ADD COLUMN IF NOT EXISTS access_token VARCHAR UNIQUE;

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
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_products_access_token ON products(access_token);
CREATE INDEX IF NOT EXISTS ix_products_project_id ON products(project_id);

CREATE TABLE IF NOT EXISTS product_cost_lines (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    operative_cost_id INTEGER REFERENCES operative_costs(id) ON DELETE SET NULL,
    label VARCHAR NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_cost NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_product_cost_lines_product_id
    ON product_cost_lines(product_id);

-- Generate tokens for existing categories if missing.
CREATE INDEX IF NOT EXISTS ix_product_categories_access_token
    ON product_categories(access_token);

UPDATE product_categories
SET access_token = gen_random_uuid()::text
WHERE access_token IS NULL;

-- ---------------------------------------------------------------------------
-- 9) Cost type / operative cost additions
-- ---------------------------------------------------------------------------
ALTER TABLE cost_types
    ADD COLUMN IF NOT EXISTS requires_art BOOLEAN DEFAULT FALSE;

ALTER TABLE cost_types
    ADD COLUMN IF NOT EXISTS profit_margin NUMERIC(5, 2) DEFAULT 0;

ALTER TABLE operative_costs
    ADD COLUMN IF NOT EXISTS parent_cost_id INTEGER REFERENCES operative_costs(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 10) Permissions (final)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dimo_app_user') THEN
        -- Broad grants so the app can operate without missing single-table privileges.
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dimo_app_user';
        EXECUTE 'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO dimo_app_user';
    END IF;
END
$$;

COMMIT;

