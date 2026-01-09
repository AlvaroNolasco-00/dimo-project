CREATE TABLE IF NOT EXISTS order_item_details (
    id SERIAL PRIMARY KEY,
    order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
    description VARCHAR NOT NULL,
    quantity INTEGER DEFAULT 1,
    image_path VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_order_item_details_item_id ON order_item_details (order_item_id);
