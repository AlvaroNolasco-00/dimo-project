-- Migration: Add coupon history and creator tracking
-- Date: 2026-02-06
-- Description: Adds created_by_id to coupons table and creates coupon_history table.

-- 1. Add created_by_id to coupons table
ALTER TABLE coupons ADD COLUMN created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 2. Create coupon_history table
CREATE TABLE coupon_history (
    id SERIAL PRIMARY KEY,
    coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    modified_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    previous_state JSONB NOT NULL,
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Add index for performance
CREATE INDEX ix_coupon_history_coupon_id ON coupon_history(coupon_id);
