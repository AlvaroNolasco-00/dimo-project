-- Script to create the processing_tasks table for asynchronous task tracking

CREATE TABLE IF NOT EXISTS processing_tasks (
    id VARCHAR(255) PRIMARY KEY,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    result_url TEXT,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups by ID (though it is already a PK)
CREATE INDEX IF NOT EXISTS idx_processing_tasks_id ON processing_tasks(id);

-- Comments for documentation
COMMENT ON TABLE processing_tasks IS 'Table to track long-running image processing tasks (like AI Upscaling) to avoid gateway timeouts.';
COMMENT ON COLUMN processing_tasks.status IS 'Status of the task: PENDING, COMPLETED, FAILED';
COMMENT ON COLUMN processing_tasks.result_url IS 'Path to the resulting processed image file in static storage';

-- Permissions
-- Grant access to the application user
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE processing_tasks TO dimo_app_user;
