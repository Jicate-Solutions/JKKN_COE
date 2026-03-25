/**
 * Generate Schema Dump from Supabase
 * This script connects to Supabase and generates a complete schema dump
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

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
	auth: {
		persistSession: false
	}
})

async function generateSchemaDump() {
	console.log('🔍 Generating schema dump from Supabase...\n')

	const tables = [
		'users',
		'roles',
		'permissions',
		'role_permissions',
		'user_roles',
		'verification_codes',
		'institutions',
		'departments',
		'degrees',
		'programs',
		'regulations',
		'semesters',
		'courses',
		'sections',
		'students'
	]

	const schemaSQL = []
	schemaSQL.push('-- Schema Dump Generated: ' + new Date().toISOString())
	schemaSQL.push('-- Project: JKKN COE')
	schemaSQL.push('-- Source: Supabase Remote Database\n')

	for (const tableName of tables) {
		console.log(`📊 Analyzing table: ${tableName}`)

		try {
			// Get a sample row to understand structure
			const { data, error } = await supabase
				.from(tableName)
				.select('*')
				.limit(1)

			if (error) {
				console.log(`   ⚠️  Table not accessible: ${error.message}`)
				continue
			}

			if (data && data.length > 0) {
				const columns = Object.keys(data[0])
				console.log(`   ✅ Columns found: ${columns.join(', ')}`)

				schemaSQL.push(`\n-- Table: ${tableName}`)
				schemaSQL.push(`-- Columns: ${columns.join(', ')}`)

				// Get row count
				const { count } = await supabase
					.from(tableName)
					.select('*', { count: 'exact', head: true })

				console.log(`   📈 Row count: ${count || 0}`)
				schemaSQL.push(`-- Row count: ${count || 0}`)
			} else {
				console.log(`   ℹ️  Table exists but is empty`)
				schemaSQL.push(`\n-- Table: ${tableName}`)
				schemaSQL.push(`-- Status: Empty`)
			}
		} catch (err) {
			console.log(`   ❌ Error: ${err.message}`)
		}
	}

	// Save schema dump
	const outputPath = path.join(__dirname, '..', 'supabase', 'migrations', 'schema-dump.sql')
	fs.writeFileSync(outputPath, schemaSQL.join('\n'))

	console.log(`\n✅ Schema dump saved to: ${outputPath}`)
	console.log('\n📋 Summary:')
	console.log('===========')
	console.log(`Total tables analyzed: ${tables.length}`)

	console.log('\n💡 To get the complete schema with CREATE TABLE statements:')
	console.log('1. Open Supabase Dashboard: https://supabase.com/dashboard/project/qtsuqhduiuagjjtlalbh')
	console.log('2. Go to: Database > Schema Visualizer')
	console.log('3. Or use: SQL Editor and run:')
	console.log(`
SELECT
    'CREATE TABLE ' || table_name || ' (' ||
    string_agg(column_name || ' ' || data_type, ', ') ||
    ');' as create_statement
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('${tables.join("','")}')
GROUP BY table_name
ORDER BY table_name;
	`)
}

generateSchemaDump().catch(console.error)
