-- Bitácora de auditoría para operaciones de procesamiento de imágenes
-- Ejecutar manualmente en la base de datos de producción

BEGIN;

CREATE TABLE IF NOT EXISTS processing_audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Identificación de la operación
    operation VARCHAR(50) NOT NULL,   -- REMOVE_BACKGROUND, REMOVE_OBJECTS, ENHANCE_QUALITY, UPSCALE, HALFTONE, CONTOUR_CLIP, WATERMARK
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, SUCCESS, FAILED

    -- Tiempos
    duration_ms INTEGER,              -- Tiempo de procesamiento en milisegundos

    -- Metadata del input
    input_file_size INTEGER,          -- Tamaño del archivo en bytes
    input_width INTEGER,              -- Ancho en píxeles
    input_height INTEGER,             -- Alto en píxeles

    -- Metadata del output
    output_file_size INTEGER,         -- Tamaño del resultado en bytes

    -- Contexto de hardware
    accelerator VARCHAR(20),          -- mps, coreml, cpu, cloud_gpu

    -- Parámetros de la operación (JSON flexible por tipo)
    parameters JSONB DEFAULT '{}',

    -- Manejo de errores
    error_message TEXT,

    -- Link a ProcessingTask (solo para upscale async)
    task_id VARCHAR(255),

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Índices para patrones de consulta comunes
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id
    ON processing_audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_operation
    ON processing_audit_log(operation);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
    ON processing_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_status
    ON processing_audit_log(status);

-- Índice compuesto para filtrar por operación + rango de fechas
CREATE INDEX IF NOT EXISTS idx_audit_log_op_date
    ON processing_audit_log(operation, created_at DESC);

COMMENT ON TABLE processing_audit_log IS 'Bitácora de operaciones de procesamiento de imágenes: usuario, duración, parámetros, errores';
COMMENT ON COLUMN processing_audit_log.operation IS 'Tipo de operación: REMOVE_BACKGROUND, REMOVE_OBJECTS, ENHANCE_QUALITY, UPSCALE, HALFTONE, CONTOUR_CLIP, WATERMARK';
COMMENT ON COLUMN processing_audit_log.status IS 'Estado: PENDING (async en progreso), SUCCESS, FAILED';
COMMENT ON COLUMN processing_audit_log.duration_ms IS 'Tiempo total de procesamiento en milisegundos';
COMMENT ON COLUMN processing_audit_log.accelerator IS 'Hardware usado: mps, coreml, cpu, cloud_gpu';
COMMENT ON COLUMN processing_audit_log.parameters IS 'Parámetros específicos de la operación en formato JSON';
COMMENT ON COLUMN processing_audit_log.task_id IS 'ID del ProcessingTask asociado (solo operaciones async como upscale)';

-- Permisos (ajustar nombre de usuario según entorno)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dimo_app_user') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE processing_audit_log TO dimo_app_user';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE processing_audit_log_id_seq TO dimo_app_user';
    END IF;
END
$$;

COMMIT;
