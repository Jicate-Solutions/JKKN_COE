/**
 * Applies migration: 20260502_add_valuation_date_to_packets.sql
 *
 * Adds `valuation_date` column to public.answer_sheet_packets so Central
 * Valuation dates can be planned at packet granularity.
 *
 * Run:  node scripts/apply-packet-valuation-date-migration.js
 */

require('dotenv').config({ path: '.env.local' })
require('dotenv').config({ path: '.env' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
	console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
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
	'20260502_add_valuation_date_to_packets.sql',
)

async function alreadyApplied() {
	const { data, error } = await supabase
		.from('answer_sheet_packets')
		.select('valuation_date')
		.limit(1)
	if (error) {
		if (/valuation_date.*does not exist/i.test(error.message)) return false
		if (/Could not find the .*valuation_date.* column/i.test(error.message)) return false
		console.error('Pre-check failed:', error.message)
		return null
	}
	return true
}

async function main() {
	console.log('🚀 Per-packet valuation_date migration')
	console.log('   Project:', supabaseUrl)
	console.log()

	const exists = await alreadyApplied()
	if (exists === true) {
		console.log('✅ Already applied — answer_sheet_packets.valuation_date exists.')
		process.exit(0)
	}
	if (exists === null) process.exit(1)

	const sql = fs.readFileSync(sqlFile, 'utf8')

	console.log('📝 Attempting via rpc("exec_sql") ...')
	const { error } = await supabase.rpc('exec_sql', { sql_query: sql })
	if (!error) {
		console.log('✅ Migration applied successfully.')
		const verify = await alreadyApplied()
		console.log(verify ? '✅ Verified: column exists.' : '⚠ Could not verify column.')
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
