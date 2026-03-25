/**
 * Apply Examiner Management Migration
 *
 * This script creates the examiner management tables for Phase 1.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyMigration() {
	console.log('Applying Examiner Management Migration...\n')

	try {
		// Read the SQL file
		const sqlPath = './supabase/migrations/20251213_create_examiners_table.sql'
		const sql = readFileSync(sqlPath, 'utf-8')

		console.log('Step 1: Checking if examiners table exists...')
		const { data: tableCheck, error: checkError } = await supabase
			.from('examiners')
			.select('id')
			.limit(1)

		if (!checkError) {
			console.log('✅ Examiners table already exists!')

			// Count existing records
			const { count } = await supabase
				.from('examiners')
				.select('*', { count: 'exact', head: true })

			console.log(`   Found ${count || 0} existing examiner records`)
		} else {
			console.log('⚠️  Examiners table does not exist or error:', checkError.message)
			console.log('\n📋 Please run the following SQL in Supabase Dashboard > SQL Editor:\n')
			console.log('=' .repeat(80))
			console.log(sql)
			console.log('=' .repeat(80))
			console.log('\n')
		}

		// Check for other tables
		const tables = [
			'examiner_board_associations',
			'examiner_email_verification',
			'examiner_email_logs',
			'smtp_configuration',
			'examiner_appointments',
		]

		console.log('\nStep 2: Checking related tables...')
		for (const table of tables) {
			const { error } = await supabase.from(table).select('id').limit(1)
			if (!error) {
				console.log(`✅ ${table} exists`)
			} else if (error.code === '42P01') {
				console.log(`❌ ${table} does not exist`)
			} else {
				console.log(`⚠️  ${table}: ${error.message}`)
			}
		}

		console.log('\n🎉 Migration check complete!')
		console.log('\nIf tables are missing, copy the SQL from the migration file and run it in Supabase Dashboard.')

	} catch (error) {
		console.error('Migration error:', error)
	}
}

applyMigration()
