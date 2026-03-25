-- Script to add a new authorized user to JKKN COE Portal
-- Replace the values below with the actual user information

-- INSTRUCTIONS:
-- 1. Replace 'user@example.com' with the actual Google email
-- 2. Replace 'John Doe' with the user's full name
-- 3. Set the appropriate role (admin, teacher, student, user)
-- 4. Set is_super_admin to true only for system administrators
-- 5. Run this script in your Supabase SQL Editor

-- Example: Add a regular user
INSERT INTO users (
    email,
    full_name,
    phone_number,
    role,
    institution_id,
    is_super_admin,
    is_active,
    permissions,
    profile_completed,
    created_at,
    updated_at
) VALUES (
    'user@example.com',  -- Replace with actual email
    'John Doe',          -- Replace with actual full name
    NULL,                -- Phone number (optional)
    'user',              -- Role: 'admin', 'teacher', 'student', 'user'
    'JKKN-COE',         -- Institution ID
    false,               -- Is super admin (only for system admins)
    true,                -- Is active (must be true for login)
    '{}',                -- Permissions (JSON object)
    false,               -- Profile completed
    NOW(),               -- Created at
    NOW()                -- Updated at
);

-- Example: Add an admin user with full permissions
-- INSERT INTO users (
--     email,
--     full_name,
--     phone_number,
--     role,
--     institution_id,
--     is_super_admin,
--     is_active,
--     permissions,
--     profile_completed,
--     created_at,
--     updated_at
-- ) VALUES (
--     'admin@jkkn.ac.in',
--     'JKKN Administrator',
--     NULL,
--     'admin',
--     'JKKN-COE',
--     true,
--     true,
--     '{"users.view": true, "users.create": true, "users.edit": true, "users.delete": true, "courses.view": true, "courses.create": true, "courses.edit": true, "courses.delete": true, "batches.view": true, "batches.create": true, "batches.edit": true, "batches.delete": true, "regulations.view": true, "regulations.create": true, "regulations.edit": true, "regulations.delete": true}',
--     true,
--     NOW(),
--     NOW()
-- );

-- Verify the user was added successfully
SELECT id, email, full_name, role, is_active, created_at
FROM users
WHERE email = 'user@example.com';  -- Replace with actual email

-- Quick reference for roles and permissions:
--
-- ROLES:
-- - 'admin': Full system access
-- - 'teacher': Can manage courses and students
-- - 'student': Can view courses and submit assignments
-- - 'user': Basic portal access
--
-- PERMISSIONS (JSON format):
-- Admin permissions:
-- {"users.view": true, "users.create": true, "users.edit": true, "users.delete": true,
--  "courses.view": true, "courses.create": true, "courses.edit": true, "courses.delete": true,
--  "batches.view": true, "batches.create": true, "batches.edit": true, "batches.delete": true,
--  "regulations.view": true, "regulations.create": true, "regulations.edit": true, "regulations.delete": true}
--
-- Teacher permissions:
-- {"courses.view": true, "courses.edit": true, "batches.view": true, "students.view": true}
--
-- Student permissions:
-- {"courses.view": true, "assignments.view": true, "assignments.submit": true}