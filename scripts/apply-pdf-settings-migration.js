require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
	console.error('❌ Missing Supabase environment variables')
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false
	}
})

async function applyMigration() {
	console.log('🚀 Starting PDF Institution Settings Migration...\n')

	try {
		// Step 1: Check current table state
		console.log('📝 Step 1: Checking current table state...')

		const { data: existingData, error: checkError } = await supabase
			.from('pdf_institution_settings')
			.select('id, institution_code, template_type')
			.limit(1)

		if (checkError && checkError.message.includes('Could not find')) {
			console.log('❌ Table pdf_institution_settings does NOT exist')
			console.log('\n⚠️  Please run the CREATE TABLE migration first:')
			console.log('   File: supabase/migrations/20251213_create_pdf_institution_settings.sql\n')
			process.exit(1)
		}

		console.log('✅ Table pdf_institution_settings exists!')

		// Step 2: Check for missing columns
		console.log('\n📝 Step 2: Checking for missing columns...')

		const { data: sample } = await supabase
			.from('pdf_institution_settings')
			.select('*')
			.limit(1)

		const existingColumns = sample && sample.length > 0 ? Object.keys(sample[0]) : []

		const requiredColumns = [
			'template_type', 'logo_position',
			'secondary_logo_url', 'secondary_logo_width', 'secondary_logo_height',
			'header_background_color', 'footer_background_color',
			'watermark_enabled',
			'font_size_body', 'font_size_subheading',
			'border_color',
			'page_numbering_enabled', 'page_numbering_format', 'page_numbering_position',
			'signature_section_enabled', 'signature_labels', 'signature_line_width',
			'created_by', 'updated_by'
		]

		const missingColumns = requiredColumns.filter(c => !existingColumns.includes(c))

		if (missingColumns.length === 0) {
			console.log('✅ All required columns exist!')
			console.log('\n🎉 Migration already applied! No action needed.\n')

			// Show current state
			await showCurrentState()
			return
		}

		console.log(`\n❌ Missing ${missingColumns.length} columns:`)
		missingColumns.forEach(c => console.log(`   - ${c}`))

		// Step 3: Output SQL for manual execution
		console.log('\n\n⚠️  MANUAL MIGRATION REQUIRED')
		console.log('\nPlease execute the following SQL in your Supabase SQL Editor:')
		console.log('━'.repeat(80))

		// Read and output the ALTER migration SQL
		const sqlContent = fs.readFileSync('./supabase/migrations/20251213_alter_pdf_institution_settings.sql', 'utf-8')
		console.log(sqlContent)

		console.log('━'.repeat(80))
		console.log('\n📍 Steps:')
		console.log('1. Go to: https://supabase.com/dashboard')
		console.log('2. Select your project')
		console.log('3. Go to SQL Editor (left sidebar)')
		console.log('4. Click "New Query"')
		console.log('5. Copy the SQL above and paste it')
		console.log('6. Click "Run" button')
		console.log('7. Run this script again to verify\n')

	} catch (error) {
		console.error('\n❌ Migration check failed:', error.message)
		process.exit(1)
	}
}

async function showCurrentState() {
	console.log('\n📊 Current PDF Settings State:')

	const { data, error, count } = await supabase
		.from('pdf_institution_settings')
		.select('id, institution_code, template_type, active', { count: 'exact' })

	if (error) {
		console.log('   Could not fetch data:', error.message)
		return
	}

	console.log(`   Total records: ${count || data.length}`)
	console.log('\n   Records:')

	data.forEach((row, i) => {
		console.log(`   ${i + 1}. ${row.institution_code} - ${row.template_type || 'default'} (active: ${row.active})`)
	})
}

applyMigration()
