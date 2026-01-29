-- INSTRUCCIONES:
-- 1. Reemplaza 'nombre_de_tu_usuario' con el usuario que usa tu aplicación (puedes verlo en backend/.env)
-- 2. Ejecuta este script en tu base de datos usando un usuario con permisos de administrador (como 'postgres')

-- Dar permisos de creación en el esquema public
GRANT CREATE ON SCHEMA public TO dimo_app_user;

-- Crear la tabla necesaria
CREATE TABLE IF NOT EXISTS order_item_details (
    id SERIAL PRIMARY KEY,
    order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
    description VARCHAR NOT NULL,
    quantity INTEGER DEFAULT 1,
    image_path VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_order_item_details_item_id ON order_item_details (order_item_id);

-- Dar permisos sobre la nueva tabla y su secuencia
GRANT ALL PRIVILEGES ON TABLE order_item_details TO dimo_app_user;
GRANT ALL PRIVILEGES ON SEQUENCE order_item_details_id_seq TO dimo_app_user;
