-- TRUNCATE existing data as requested
TRUNCATE TABLE operative_costs, cost_types RESTART IDENTITY CASCADE;

-- Add project_id to cost_types
ALTER TABLE cost_types 
ADD COLUMN project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE;

-- Drop old unique constraint (if name was unique globally)
ALTER TABLE cost_types DROP CONSTRAINT IF EXISTS cost_types_name_key;

-- Add new composite unique constraint
ALTER TABLE cost_types 
ADD CONSTRAINT uq_cost_type_name_project UNIQUE (name, project_id);

-- GRANT NECESSARY PERMISSIONS to the application user
-- We grant only what's needed for the backend to operate
GRANT SELECT, INSERT ON TABLE cost_types TO dimo_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operative_costs TO dimo_app_user;

-- Also sequences for SERIAL columns (needed for INSERTs)
GRANT USAGE, SELECT, UPDATE ON SEQUENCE cost_types_id_seq TO dimo_app_user;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE operative_costs_id_seq TO dimo_app_user;
