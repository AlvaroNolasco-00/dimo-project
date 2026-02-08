-- Migration to add delivery zone history
CREATE TABLE IF NOT EXISTS delivery_zone_history (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,
    modified_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    previous_state JSONB NOT NULL,
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_delivery_zone_history_zone_id ON delivery_zone_history(zone_id);

-- Grant permissions to the application user
GRANT ALL PRIVILEGES ON TABLE delivery_zone_history TO dimo_app_user;
GRANT ALL PRIVILEGES ON SEQUENCE delivery_zone_history_id_seq TO dimo_app_user;
