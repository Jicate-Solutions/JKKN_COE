/**
 * Applies migration: 20260514_create_institution_seating_settings.sql
 *
 * Creates the per-institution seating-rules table used by the
 * pre-exam/exam-attendance-sheet seating tab.
 *
 * Run:  node scripts/apply-institution-seating-settings-migration.js
 */

require('dotenv').config({ path: '.env.local' })
require('dotenv').config({ path: '.env' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
	console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: { autoRefreshToken: false, persistSession: false },
})

const sqlFile = path.join(
	__dirname,
	'..',
	'supabase',
	'migrations',
	'20260514_create_institution_seating_settings.sql',
)

async function alreadyApplied() {
	const { error } = await supabase
		.from('institution_seating_settings')
		.select('id')
		.limit(1)
	if (error) {
		if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) return false
		console.error('Pre-check failed:', error.message)
		return null
	}
	return true
}

async function main() {
	console.log('🚀 institution_seating_settings migration')
	console.log('   Project:', supabaseUrl)
	console.log()

	const exists = await alreadyApplied()
	if (exists === true) {
		console.log('✅ Already applied — institution_seating_settings exists.')
		console.log('🔁 Asking PostgREST to reload its schema cache...')
		const { error: reloadErr } = await supabase.rpc('exec_sql', {
			sql_query: "NOTIFY pgrst, 'reload schema';",
		})
		if (reloadErr) {
			console.log('⚠ Could not reload via exec_sql:', reloadErr.message)
			console.log('   Run this in Supabase SQL Editor: NOTIFY pgrst, \'reload schema\';')
		} else {
			console.log('✅ PostgREST schema cache reload requested.')
		}
		process.exit(0)
	}
	if (exists === null) process.exit(1)

	const sql = fs.readFileSync(sqlFile, 'utf8')

	console.log('📝 Attempting via rpc("exec_sql") ...')
	const { error } = await supabase.rpc('exec_sql', { sql_query: sql })
	if (!error) {
		console.log('✅ Migration applied successfully.')
		const verify = await alreadyApplied()
		console.log(verify ? '✅ Verified: table exists.' : '⚠ Could not verify table.')
		process.exit(0)
	}

	console.log('⚠ exec_sql RPC unavailable:', error.message)
	console.log()
	console.log('━'.repeat(72))
	console.log('MANUAL STEP — paste this into Supabase Dashboard → SQL Editor:')
	console.log('━'.repeat(72))
	console.log(sql)
	console.log('━'.repeat(72))
	process.exit(2)
}

main().catch(e => {
	console.error('❌ Unexpected error:', e)
	process.exit(1)
})
