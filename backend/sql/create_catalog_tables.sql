-- Catalog Module: product categories, products, and product cost lines
-- Migration script — safe to run on an existing database (idempotent).
-- Run as the database owner / superuser, then the app user gets the grants below.

-- ============================================================
-- 1. TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS product_categories (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    description VARCHAR,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_product_category_name_project UNIQUE (name, project_id)
);

CREATE INDEX IF NOT EXISTS ix_product_categories_project_id ON product_categories(project_id);

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

CREATE INDEX IF NOT EXISTS ix_product_cost_lines_product_id ON product_cost_lines(product_id);

-- ============================================================
-- 2. PERMISSIONS FOR APP USER
-- ============================================================
-- Adjust 'dimo_app_user' if your app connects with a different role.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE product_categories TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE products           TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE product_cost_lines TO dimo_app_user;

-- Sequences for SERIAL columns (needed for INSERT)
GRANT USAGE, SELECT, UPDATE ON SEQUENCE product_categories_id_seq TO dimo_app_user;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE products_id_seq            TO dimo_app_user;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE product_cost_lines_id_seq  TO dimo_app_user;
