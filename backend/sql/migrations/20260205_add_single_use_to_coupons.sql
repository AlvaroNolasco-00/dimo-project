-- Migration: Add single_use column to coupons table
ALTER TABLE coupons ADD COLUMN single_use BOOLEAN DEFAULT FALSE;
