-- ========================================
-- JKKN COE Database Schema Export Queries
-- Generated: 2025-11-08T05:08:18.223Z
-- ========================================

-- INSTRUCTIONS:
-- 1. Open Supabase Dashboard: https://supabase.com/dashboard/project/qtsuqhduiuagjjtlalbh
-- 2. Go to: SQL Editor
-- 3. Run each query below in sequence
-- 4. Copy the results to generate migration files

-- ========================================
-- Query 1: Get Complete CREATE TABLE Statements
-- ========================================

-- Generate complete CREATE TABLE statements for all tables
SELECT
	'-- Table: ' || table_name || E'
' ||
	'CREATE TABLE ' || table_name || ' (' || E'
' ||
	string_agg(
		'  ' || column_name || ' ' ||
		CASE
			WHEN data_type = 'character varying' THEN 'VARCHAR(' || character_maximum_length || ')'
			WHEN data_type = 'character' THEN 'CHAR(' || character_maximum_length || ')'
			WHEN data_type = 'timestamp with time zone' THEN 'TIMESTAMP WITH TIME ZONE'
			WHEN data_type = 'timestamp without time zone' THEN 'TIMESTAMP'
			WHEN data_type = 'USER-DEFINED' THEN udt_name
			ELSE UPPER(data_type)
		END ||
		CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END ||
		CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
		',' || E'
'
		ORDER BY ordinal_position
	) || E'
' ||
	');' || E'
'
	AS create_statement
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                   'verification_codes', 'institutions', 'departments', 'degrees',
                   'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
GROUP BY table_name
ORDER BY table_name;


-- ========================================
-- Query 2: Get Column Details
-- ========================================

-- Get all columns with data types, defaults, and nullability
SELECT
	table_name,
	column_name,
	data_type,
	character_maximum_length,
	column_default,
	is_nullable,
	udt_name,
	ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                   'verification_codes', 'institutions', 'departments', 'degrees',
                   'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
ORDER BY table_name, ordinal_position;


-- ========================================
-- Query 3: Get Constraints
-- ========================================

-- Get all constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK)
SELECT
	tc.table_name,
	tc.constraint_name,
	tc.constraint_type,
	kcu.column_name,
	ccu.table_name AS foreign_table_name,
	ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
	ON tc.constraint_name = kcu.constraint_name
	AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
	ON ccu.constraint_name = tc.constraint_name
	AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
AND tc.table_name IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                      'verification_codes', 'institutions', 'departments', 'degrees',
                      'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;


-- ========================================
-- Query 4: Get Indexes
-- ========================================

-- Get all indexes
SELECT
	tablename AS table_name,
	indexname AS index_name,
	indexdef AS index_definition
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                  'verification_codes', 'institutions', 'departments', 'degrees',
                  'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
ORDER BY tablename, indexname;


-- ========================================
-- Query 5: Get Triggers
-- ========================================

-- Get all triggers
SELECT
	trigger_name,
	event_manipulation,
	event_object_table AS table_name,
	action_statement,
	action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                           'verification_codes', 'institutions', 'departments', 'degrees',
                           'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
ORDER BY event_object_table, trigger_name;


-- ========================================
-- Query 6: Get RLS Policies
-- ========================================

-- Get all RLS policies
SELECT
	schemaname,
	tablename AS table_name,
	policyname AS policy_name,
	permissive,
	roles,
	cmd,
	qual,
	with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                  'verification_codes', 'institutions', 'departments', 'degrees',
                  'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
ORDER BY tablename, policyname;