-- SQL Script to setup Order Workflow Tables and Permissions
-- Environment: PostgreSQL

-- 1. Create Delivery Zones Table
CREATE TABLE IF NOT EXISTS delivery_zones (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10, 2) DEFAULT 0.00,
    zone_type VARCHAR(50) DEFAULT 'STANDARD_PAID',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create Coupons Table
CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    description TEXT,
    discount_type VARCHAR(50) DEFAULT 'FIXED',
    discount_value NUMERIC(10, 2) NOT NULL,
    min_purchase_amount NUMERIC(10, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Client Addresses Table
CREATE TABLE IF NOT EXISTS client_addresses (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    address_line TEXT NOT NULL,
    zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
    formatted_address TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Order Item Details Table (for customer uploads and specifics)
CREATE TABLE IF NOT EXISTS order_item_details (
    id SERIAL PRIMARY KEY,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    quantity INTEGER DEFAULT 1,
    image_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Update Orders Table (Adding workflow columns)
-- Use DO block to check if columns exist before adding
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='orders' AND COLUMN_NAME='access_token') THEN
        ALTER TABLE orders ADD COLUMN access_token VARCHAR(255) UNIQUE;
        CREATE INDEX idx_orders_access_token ON orders(access_token);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='orders' AND COLUMN_NAME='down_payment_amount') THEN
        ALTER TABLE orders ADD COLUMN down_payment_amount NUMERIC(12, 2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='orders' AND COLUMN_NAME='coupon_id') THEN
        ALTER TABLE orders ADD COLUMN coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='orders' AND COLUMN_NAME='delivery_zone_id') THEN
        ALTER TABLE orders ADD COLUMN delivery_zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 6. Permissions Allocation
-- This section ensures the database user has the necessary rights to operate the app.

-- Grant usage on the schema (assuming public)
GRANT USAGE ON SCHEMA public TO CURRENT_USER;

-- Grant permissions on the new tables
GRANT ALL PRIVILEGES ON TABLE delivery_zones TO CURRENT_USER;
GRANT ALL PRIVILEGES ON TABLE coupons TO CURRENT_USER;
GRANT ALL PRIVILEGES ON TABLE client_addresses TO CURRENT_USER;
GRANT ALL PRIVILEGES ON TABLE order_item_details TO CURRENT_USER;

-- Grant permissions on the sequences for auto-incrementing IDs
GRANT USAGE, SELECT ON SEQUENCE delivery_zones_id_seq TO CURRENT_USER;
GRANT USAGE, SELECT ON SEQUENCE coupons_id_seq TO CURRENT_USER;
GRANT USAGE, SELECT ON SEQUENCE client_addresses_id_seq TO CURRENT_USER;
GRANT USAGE, SELECT ON SEQUENCE order_item_details_id_seq TO CURRENT_USER;

-- If a specific user 'dimo_user' exists, you should run:
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dimo_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dimo_user;

-- Set comments for documentation
COMMENT ON TABLE delivery_zones IS 'Zonas de entrega y precios asociados por proyecto';
COMMENT ON TABLE coupons IS 'Cupones de descuento (fijos o porcentuales) por proyecto';
COMMENT ON TABLE client_addresses IS 'Direcciones guardadas de los clientes';
COMMENT ON COLUMN orders.access_token IS 'Token unico para acceso publico al pedido sin autenticacion';
COMMENT ON COLUMN orders.down_payment_amount IS 'Monto del anticipo requerido o pagado';
