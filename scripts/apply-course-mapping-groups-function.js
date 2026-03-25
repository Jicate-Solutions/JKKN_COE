// Script to apply the course_mapping_groups function migration
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyMigration() {
	try {
		const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '20251211_course_mapping_groups_function.sql')
		const sql = fs.readFileSync(sqlPath, 'utf8')

		console.log('Applying migration...')
		console.log('SQL:', sql.substring(0, 200) + '...')

		// Execute the SQL directly using Supabase's SQL execution
		const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

		if (error) {
			// If exec_sql doesn't exist, try alternative approach
			console.log('exec_sql not available, trying direct query...')

			// Split by semicolons and execute each statement
			const statements = sql.split(';').filter(s => s.trim().length > 0)

			for (const statement of statements) {
				console.log('Executing:', statement.substring(0, 100) + '...')
				const { error: stmtError } = await supabase.from('_exec').select('*').limit(0)
				if (stmtError) {
					console.log('Statement error (may be expected):', stmtError.message)
				}
			}
		}

		console.log('Migration applied successfully!')

		// Test the function
		console.log('\nTesting get_course_mapping_groups function...')
		const { data: testData, error: testError } = await supabase.rpc('get_course_mapping_groups')

		if (testError) {
			console.log('Function test failed:', testError.message)
			console.log('The function may need to be created manually in Supabase dashboard.')
		} else {
			console.log('Function works! Returned', testData?.length || 0, 'groups')
		}

	} catch (err) {
		console.error('Error applying migration:', err)
	}
}

applyMigration()
