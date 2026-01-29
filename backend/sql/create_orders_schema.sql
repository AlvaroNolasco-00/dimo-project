-- Create Order States table (Global catalog of possible states)
CREATE TABLE IF NOT EXISTS order_states (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_system_default BOOLEAN DEFAULT FALSE, -- If true, new projects get this enabled by default
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Project Specific Order States configuration
-- Allows projects to toggle states on/off and control visibility
CREATE TABLE IF NOT EXISTS project_order_states (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    order_state_id INTEGER NOT NULL REFERENCES order_states(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,  -- Can this project use this state?
    is_visible BOOLEAN DEFAULT TRUE, -- Should this appear in simple lists?
    display_order INTEGER DEFAULT 0, -- For sorting
    PRIMARY KEY (project_id, order_state_id)
);

-- Create Orders table
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Client/Delivery Info
    client_name VARCHAR(255) NOT NULL,
    delivery_date DATE,
    shipping_address TEXT,
    location_lat NUMERIC(10, 6), -- Latitude
    location_lng NUMERIC(10, 6), -- Longitude
    
    -- State
    current_state_id INTEGER REFERENCES order_states(id),
    
    -- Financials (denormalized total for quick access, but calculated from items)
    total_amount NUMERIC(12, 2) DEFAULT 0.00,
    
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Order Items table
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Item details
    description VARCHAR(255) NOT NULL, -- e.g. "Camisa Talla L"
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- quantity * unit_price
    
    -- Structured data for specific types (optional links)
    -- If it's linked to an operative cost defined in the system
    operative_cost_id INTEGER REFERENCES operative_costs(id) ON DELETE SET NULL,
    
    -- Flexible JSON for specific attributes (e.g. {size: "L", color: "Red", position: "Back"})
    attributes JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INSERT DEFAULT STATES
INSERT INTO order_states (name, description, is_system_default) VALUES
('Creado', 'La orden ha sido creada pero no procesada.', TRUE),
('Edición', 'Orden en etapa de cambios y ajustes.', TRUE),
('Insumos', 'Orden en espera o recolección de materiales.', TRUE),
('Manufacturando', 'Orden en proceso de producción.', TRUE),
('Revelado', 'Proceso de revelado de pantallas (Serigrafía).', FALSE), -- Optional
('Corte', 'Corte de tela.', FALSE), -- Optional
('Impresión', 'Proceso de estampado.', FALSE), -- Optional
('Control de Calidad', 'Revisión final del producto.', FALSE), -- Optional
('Listo para enviar', 'Orden terminada esperando envío.', TRUE),
('Enviado', 'Orden en transito.', TRUE),
('Entregado', 'Orden recibida por el cliente.', TRUE)
ON CONFLICT (name) DO NOTHING;

-- PERMISSIONS ASSIGNMENT
-- Replace 'dimo_app_user' with the actual application user if different
GRANT ALL PRIVILEGES ON TABLE order_states TO dimo_app_user;
GRANT ALL PRIVILEGES ON TABLE project_order_states TO dimo_app_user;
GRANT ALL PRIVILEGES ON TABLE orders TO dimo_app_user;
GRANT ALL PRIVILEGES ON TABLE order_items TO dimo_app_user;

-- Grant permissions on sequences for SERIAL columns
GRANT USAGE, SELECT, UPDATE ON SEQUENCE order_states_id_seq TO dimo_app_user;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE orders_id_seq TO dimo_app_user;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE order_items_id_seq TO dimo_app_user;
