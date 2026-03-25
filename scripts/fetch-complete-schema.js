/**
 * Fetch Complete Database Schema from Supabase
 * Generates CREATE TABLE statements with proper column types, constraints, and defaults
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('❌ Missing Supabase credentials')
	process.exit(1)
}

// Extract database connection info from Supabase URL
const projectRef = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)[1]

console.log('🔍 Fetching complete schema from Supabase...')
console.log('📊 Project Reference:', projectRef)
console.log('')

// Since we can't directly query information_schema through the REST API,
// we'll provide SQL queries that can be run in the Supabase SQL Editor

const schemaQueries = {
	tables: `
-- Get all tables in public schema
SELECT
	table_name,
	table_type
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;
`,

	columns: `
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
`,

	constraints: `
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
`,

	indexes: `
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
`,

	triggers: `
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
`,

	policies: `
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
`,

	fullSchema: `
-- Generate complete CREATE TABLE statements for all tables
SELECT
	'-- Table: ' || table_name || E'\n' ||
	'CREATE TABLE ' || table_name || ' (' || E'\n' ||
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
		',' || E'\n'
		ORDER BY ordinal_position
	) || E'\n' ||
	');' || E'\n'
	AS create_statement
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                   'verification_codes', 'institutions', 'departments', 'degrees',
                   'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
GROUP BY table_name
ORDER BY table_name;
`
}

// Save queries to files
const outputDir = path.join(__dirname, '..', 'supabase', 'schema-queries')
if (!fs.existsSync(outputDir)) {
	fs.mkdirSync(outputDir, { recursive: true })
}

console.log('📝 Generating SQL query files...\n')

Object.entries(schemaQueries).forEach(([name, query]) => {
	const filename = `${name}.sql`
	const filepath = path.join(outputDir, filename)
	fs.writeFileSync(filepath, query.trim())
	console.log(`✅ Created: ${filename}`)
})

// Create a master query file
const masterQuery = `
-- ========================================
-- JKKN COE Database Schema Export Queries
-- Generated: ${new Date().toISOString()}
-- ========================================

-- INSTRUCTIONS:
-- 1. Open Supabase Dashboard: https://supabase.com/dashboard/project/${projectRef}
-- 2. Go to: SQL Editor
-- 3. Run each query below in sequence
-- 4. Copy the results to generate migration files

-- ========================================
-- Query 1: Get Complete CREATE TABLE Statements
-- ========================================
${schemaQueries.fullSchema}

-- ========================================
-- Query 2: Get Column Details
-- ========================================
${schemaQueries.columns}

-- ========================================
-- Query 3: Get Constraints
-- ========================================
${schemaQueries.constraints}

-- ========================================
-- Query 4: Get Indexes
-- ========================================
${schemaQueries.indexes}

-- ========================================
-- Query 5: Get Triggers
-- ========================================
${schemaQueries.triggers}

-- ========================================
-- Query 6: Get RLS Policies
-- ========================================
${schemaQueries.policies}
`

const masterFilepath = path.join(outputDir, 'MASTER_SCHEMA_EXPORT.sql')
fs.writeFileSync(masterFilepath, masterQuery.trim())

console.log('\n📋 Summary:')
console.log('===========')
console.log(`✅ Generated ${Object.keys(schemaQueries).length + 1} SQL query files`)
console.log(`📁 Location: ${outputDir}`)

console.log('\n🚀 Next Steps:')
console.log('==============')
console.log('1. Open Supabase Dashboard SQL Editor:')
console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql`)
console.log('')
console.log('2. Run the queries from MASTER_SCHEMA_EXPORT.sql')
console.log(`   File: ${masterFilepath}`)
console.log('')
console.log('3. The "fullSchema" query will generate complete CREATE TABLE statements')
console.log('   Copy these results to update your migration files')
console.log('')
console.log('💡 Tip: Start with the "fullSchema" query for quick CREATE TABLE statements')

// Also create a README
const readmePath = path.join(outputDir, 'README.md')
const readmeContent = `# Schema Export Queries

This directory contains SQL queries to export the complete database schema from Supabase.

## Quick Start

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/${projectRef}/sql)
2. Run \`MASTER_SCHEMA_EXPORT.sql\` queries
3. Copy results to update migration files

## Files

- **MASTER_SCHEMA_EXPORT.sql** - All queries in one file
- **fullSchema.sql** - Complete CREATE TABLE statements
- **columns.sql** - Column details with types and defaults
- **constraints.sql** - Primary keys, foreign keys, unique constraints
- **indexes.sql** - Index definitions
- **triggers.sql** - Trigger definitions
- **policies.sql** - Row Level Security policies

## Most Useful Query

The **fullSchema.sql** query generates ready-to-use CREATE TABLE statements for all tables.
This is the fastest way to update your migration files.

## Generated

${new Date().toISOString()}
`

fs.writeFileSync(readmePath, readmeContent)

console.log('')
console.log('📖 Created README.md with instructions')
console.log('')
console.log('✨ Done! You can now run the SQL queries in Supabase Dashboard.')
