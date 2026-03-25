-- Quick User Addition Script for JKKN COE Portal
-- Run this in your Supabase SQL Editor to add authorized users

-- IMPORTANT: Replace the email below with your actual Google account email
-- The email MUST match exactly what Google provides during authentication

-- Add a new authorized user (modify values as needed)
INSERT INTO users (
    id,
    email,
    full_name,
    role,
    is_active,
    permissions,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'your-email@gmail.com',  -- ← CHANGE THIS to your Google account email
    'Your Name',             -- ← CHANGE THIS to your full name
    'admin',                 -- ← Set role: 'admin', 'teacher', 'student', or 'user'
    true,                    -- ← MUST be true to allow login
    '{"dashboard": true, "users": true, "reports": true}',  -- ← Adjust permissions as needed
    NOW(),
    NOW()
)
ON CONFLICT (email)
DO UPDATE SET
    is_active = true,        -- Reactivate if user exists but was inactive
    role = EXCLUDED.role,    -- Update role if needed
    updated_at = NOW();

-- Verify the user was added/updated successfully
SELECT
    email,
    full_name as name,
    role,
    is_active as "Active?",
    created_at as "Created",
    updated_at as "Updated"
FROM users
WHERE email = 'your-email@gmail.com';  -- ← CHANGE THIS to match the email above

-- Common Roles and Their Typical Permissions:
--
-- Admin:
--   role: 'admin'
--   permissions: '{"dashboard": true, "users": true, "reports": true, "settings": true}'
--
-- Teacher:
--   role: 'teacher'
--   permissions: '{"dashboard": true, "students": true, "grades": true}'
--
-- Student:
--   role: 'student'
--   permissions: '{"dashboard": true, "profile": true, "results": true}'
--
-- Basic User:
--   role: 'user'
--   permissions: '{"dashboard": true}'

-- To check all existing users:
-- SELECT email, full_name, role, is_active FROM users ORDER BY created_at DESC;

-- To deactivate a user:
-- UPDATE users SET is_active = false WHERE email = 'user@example.com';

-- To reactivate a user:
-- UPDATE users SET is_active = true WHERE email = 'user@example.com';