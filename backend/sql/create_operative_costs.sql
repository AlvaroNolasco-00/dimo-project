-- Tabla para definir los Tipos de Costo (Ej: Camisas, Estampados)
CREATE TABLE IF NOT EXISTS cost_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para costos operativos con atributos dinámicos (JSONB)
-- Esto permite guardar 'talla', 'material' para camisas, 
-- y 'posicion', 'tamano' para estampados en la misma estructura.
CREATE TABLE IF NOT EXISTS operative_costs (
    id SERIAL PRIMARY KEY,
    cost_type_id INTEGER REFERENCES cost_types(id) ON DELETE CASCADE,
    base_cost DECIMAL(10, 2) NOT NULL,
    attributes JSONB DEFAULT '{}', -- Ej: {"talla": "S", "material": "Algodón"}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_operative_costs_type ON operative_costs (cost_type_id);

-- Insertar tipos iniciales
INSERT INTO cost_types (name, description) VALUES 
('Camisas', 'Costos asociados a prendas base'),
('Estampados', 'Costos de servicios de estampado')
ON CONFLICT (name) DO NOTHING;
