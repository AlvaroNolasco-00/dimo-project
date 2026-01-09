-- Add color column to order_states
ALTER TABLE order_states ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#6c757d';

-- Update existing states with default colors
-- Using a palette that fits a dark mode / modern aesthetic

-- Creado: Gray/Neutral
UPDATE order_states SET color = '#9ca3af' WHERE name = 'Creado';

-- Edición: Blue/Info
UPDATE order_states SET color = '#3b82f6' WHERE name = 'Edición';

-- Insumos: Orange/Warning (Waiting for materials)
UPDATE order_states SET color = '#f59e0b' WHERE name = 'Insumos';

-- Manufacturando: Purple/Indigo (Active production)
UPDATE order_states SET color = '#6366f1' WHERE name = 'Manufacturando';

-- Revelado: Pink (Special process)
UPDATE order_states SET color = '#ec4899' WHERE name = 'Revelado';

-- Corte: Teal
UPDATE order_states SET color = '#14b8a6' WHERE name = 'Corte';

-- Impresión: Cyan
UPDATE order_states SET color = '#06b6d4' WHERE name = 'Impresión';

-- Control de Calidad: Yellow
UPDATE order_states SET color = '#eab308' WHERE name = 'Control de Calidad';

-- Listo para enviar: Green/Success
UPDATE order_states SET color = '#22c55e' WHERE name = 'Listo para enviar';

-- Enviado: Blue/Primary
UPDATE order_states SET color = '#2563eb' WHERE name = 'Enviado';

-- Entregado: Violate/Darker Success or a distinctive color
UPDATE order_states SET color = '#8b5cf6' WHERE name = 'Entregado';
