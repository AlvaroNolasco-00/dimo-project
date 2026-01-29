-- Create Order History table to track changes in orders
CREATE TABLE IF NOT EXISTS order_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL, -- e.g., 'CREATED', 'STATUS_CHANGE', 'UPDATE_DETAILS', 'UPDATE_ITEMS'
    description TEXT NOT NULL,       -- Human readable description
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups by order
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON order_history(order_id);

-- PERMISSIONS ASSIGNMENT
-- Replace 'dimo_app_user' with the actual application user if different
GRANT ALL PRIVILEGES ON TABLE order_history TO dimo_app_user;

-- Grant permissions on sequences for SERIAL columns
GRANT USAGE, SELECT, UPDATE ON SEQUENCE order_history_id_seq TO dimo_app_user;
