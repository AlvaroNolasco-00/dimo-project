-- Add parent_cost_id to operative_costs to allow derived costs
ALTER TABLE operative_costs ADD COLUMN parent_cost_id INTEGER REFERENCES operative_costs(id) ON DELETE CASCADE;
