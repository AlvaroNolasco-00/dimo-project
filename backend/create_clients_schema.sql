-- Script to create the 'clients' table for the Management Module
-- =============================================================
-- Business Rule: 'phone_number' is the primary business identifier.
-- Scope: Clients are scoped per Project (Business).

-- Table: clients
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Core Identity
    phone_number VARCHAR(50) NOT NULL, -- Flexible length for intl formats, editable unique identifier for business
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255), -- Optional
    
    -- Business details (Shirt Sales/Printing)
    tax_id VARCHAR(50), -- Optional (NIT/RFC for invoicing)
    client_type VARCHAR(20) DEFAULT 'retail', -- 'retail', 'wholesale', 'reseller'
    
    -- Logistics
    shipping_address TEXT,
    
    -- Preferences (UX/Smart Data)
    preferences JSONB DEFAULT '{}', 
    -- Example structure based on Customer Service standards:
    -- {
    --   "default_size": "M",
    --   "preferred_fit": "Oversized",
    --   "preferred_technique": "Serigraphy",
    --   "delivery_window": "Afternoon", -- Matutino, Por la tarde, etc.
    --   "communication_channel": "WhatsApp",
    --   "notes": "Always requests sample before batch"
    -- }
    
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT uq_client_phone_project UNIQUE (phone_number, project_id)
);

-- Indexes for search performance
CREATE INDEX IF NOT EXISTS ix_clients_phone ON clients (phone_number);
CREATE INDEX IF NOT EXISTS ix_clients_name ON clients (full_name);
CREATE INDEX IF NOT EXISTS ix_clients_project ON clients (project_id);

-- Link Orders to Clients (Optional relationship for existing orders)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='client_id') THEN
        ALTER TABLE orders ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Permissions
-- Grant access to the application user
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE clients TO dimo_app_user;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE clients_id_seq TO dimo_app_user;
