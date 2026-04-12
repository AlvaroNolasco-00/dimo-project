-- Add general profit margin to cost types
ALTER TABLE cost_types
    ADD COLUMN IF NOT EXISTS profit_margin NUMERIC(5, 2) DEFAULT 0;
