/**
 * Fetch Database Schema from Supabase
 * This script fetches the current database schema from Supabase
 * and generates migration files
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('❌ Missing Supabase credentials in .env.local')
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fetchSchema() {
	console.log('🔍 Fetching database schema from Supabase...\n')

	try {
		// Fetch all tables in public schema
		const { data: tables, error: tablesError } = await supabase.rpc('get_schema_info', {})

		if (tablesError) {
			// Fallback: Query information_schema directly
			const { data: tablesData, error: fallbackError } = await supabase
				.from('information_schema.tables')
				.select('*')
				.eq('table_schema', 'public')

			if (fallbackError) {
				console.log('⚠️  RPC function not available, querying pg_catalog directly...\n')

				// Query tables
				const tablesQuery = `
					SELECT
						table_name,
						table_type
					FROM information_schema.tables
					WHERE table_schema = 'public'
					AND table_type = 'BASE TABLE'
					ORDER BY table_name;
				`

				const { data: pgTables, error: pgError } = await supabase.rpc('exec_sql', {
					query: tablesQuery
				})

				if (pgError) {
					console.error('❌ Error fetching tables:', pgError.message)
					console.log('\n📝 Manual steps to fetch schema:')
					console.log('1. Go to your Supabase Dashboard')
					console.log('2. Navigate to SQL Editor')
					console.log('3. Run the following query:\n')
					console.log(tablesQuery)
					console.log('\n4. Copy the results and create migration files manually')
					return
				}

				console.log('✅ Found tables:', pgTables)
			}
		}

		// For now, let's list existing tables by querying them
		console.log('📋 Querying existing tables...\n')

		const tableNames = [
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

		const schemaInfo = {}

		for (const tableName of tableNames) {
			try {
				const { data, error } = await supabase
					.from(tableName)
					.select('*')
					.limit(1)

				if (!error) {
					console.log(`✅ ${tableName}`)
					schemaInfo[tableName] = {
						exists: true,
						sampleData: data
					}
				} else {
					console.log(`⚠️  ${tableName} - ${error.message}`)
				}
			} catch (err) {
				console.log(`❌ ${tableName} - ${err.message}`)
			}
		}

		console.log('\n📊 Schema Summary:')
		console.log('================')
		const existingTables = Object.keys(schemaInfo).filter(t => schemaInfo[t].exists)
		console.log(`Total tables found: ${existingTables.length}`)
		console.log('Tables:', existingTables.join(', '))

		// Save schema info
		const outputPath = path.join(__dirname, '..', 'supabase', 'schema-dump.json')
		fs.writeFileSync(outputPath, JSON.stringify(schemaInfo, null, 2))
		console.log(`\n💾 Schema info saved to: ${outputPath}`)

		console.log('\n💡 Next steps:')
		console.log('1. Review the existing migration files in supabase/migrations/')
		console.log('2. Use Supabase Dashboard > SQL Editor to view full schema')
		console.log('3. Run: npx supabase db pull (after logging in with: npx supabase login)')

	} catch (error) {
		console.error('❌ Error:', error.message)
		console.log('\n📝 Alternative approach:')
		console.log('1. Open Supabase Dashboard: https://supabase.com/dashboard/project/qtsuqhduiuagjjtlalbh')
		console.log('2. Go to SQL Editor')
		console.log('3. Run: \\d+ to see all tables')
		console.log('4. Run: \\d+ table_name for each table structure')
	}
}

fetchSchema()
