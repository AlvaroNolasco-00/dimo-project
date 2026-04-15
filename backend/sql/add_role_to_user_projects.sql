-- Migration: Add role column to user_projects table
-- Roles: viewer, editor, manager, owner
-- Default: editor (preserves existing behavior for current members)

ALTER TABLE user_projects
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'editor';

-- Set existing superadmin users (is_admin=true) as owner in their projects
UPDATE user_projects up
SET role = 'owner'
FROM users u
WHERE up.user_id = u.id
  AND u.is_admin = TRUE;
