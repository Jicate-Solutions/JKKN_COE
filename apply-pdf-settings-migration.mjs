/**
 * Apply PDF Settings WEF Migration
 *
 * This script adds template_name, wef_date, wef_time columns to pdf_institution_settings
 * and removes the unique constraint on template_type to allow multiple templates.
 */

import { createClient } from '@supabase/supabase-js'
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
	console.log('Applying PDF Settings WEF Migration...\n')

	try {
		// First, let's check what columns exist by fetching a record
		console.log('Step 1: Checking current table structure...')
		const { data: testData, error: testError } = await supabase
			.from('pdf_institution_settings')
			.select('*')
			.limit(1)

		if (testError) {
			console.error('Error accessing table:', testError.message)
			return
		}

		const existingColumns = testData && testData[0] ? Object.keys(testData[0]) : []
		console.log('Existing columns:', existingColumns.join(', '))

		const hasTemplateName = existingColumns.includes('template_name')
		const hasWefDate = existingColumns.includes('wef_date')
		const hasWefTime = existingColumns.includes('wef_time')

		if (hasTemplateName && hasWefDate && hasWefTime) {
			console.log('\n✅ All required columns already exist!')
		} else {
			console.log('\n⚠️  Missing columns detected. Please run the following SQL in Supabase Dashboard > SQL Editor:\n')
		}

		// Generate SQL for missing columns
		let sql = ''

		if (!hasTemplateName) {
			sql += `-- Add template_name column
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS template_name VARCHAR(100);

`
		}

		if (!hasWefDate) {
			sql += `-- Add wef_date column
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS wef_date DATE DEFAULT CURRENT_DATE;

`
		}

		if (!hasWefTime) {
			sql += `-- Add wef_time column
ALTER TABLE pdf_institution_settings
ADD COLUMN IF NOT EXISTS wef_time TIME DEFAULT '00:00:00';

`
		}

		// Always include these statements
		sql += `-- Update existing records with default template_name
UPDATE pdf_institution_settings
SET template_name = CONCAT(institution_code, '_', template_type, '_default')
WHERE template_name IS NULL;

-- Make template_name NOT NULL (after populating)
ALTER TABLE pdf_institution_settings
ALTER COLUMN template_name SET NOT NULL;

-- Drop old unique constraint (allows duplicate template_type)
ALTER TABLE pdf_institution_settings
DROP CONSTRAINT IF EXISTS unique_institution_template;

-- Add indexes for WEF queries
CREATE INDEX IF NOT EXISTS idx_pdf_settings_template_name
ON pdf_institution_settings(template_name);

CREATE INDEX IF NOT EXISTS idx_pdf_settings_wef
ON pdf_institution_settings(institution_code, template_type, wef_date DESC, wef_time DESC);

CREATE INDEX IF NOT EXISTS idx_pdf_settings_active_template
ON pdf_institution_settings(institution_code, template_name, active)
WHERE active = true;
`

		if (!hasTemplateName || !hasWefDate || !hasWefTime) {
			console.log(sql)
		}

		// If columns exist, try to update records via Supabase client
		if (hasTemplateName && hasWefDate && hasWefTime) {
			console.log('\nStep 2: Checking for records without template_name...')
			const { data: records, error: fetchErr } = await supabase
				.from('pdf_institution_settings')
				.select('id, institution_code, template_type, template_name, wef_date, wef_time')

			if (fetchErr) {
				console.error('Error fetching records:', fetchErr.message)
				return
			}

			console.log(`Found ${records?.length || 0} records`)

			let updatedCount = 0
			for (const record of records || []) {
				const updates = {}

				if (!record.template_name) {
					updates.template_name = `${record.institution_code}_${record.template_type}_default`
				}
				if (!record.wef_date) {
					updates.wef_date = new Date().toISOString().split('T')[0]
				}
				if (!record.wef_time) {
					updates.wef_time = '00:00'
				}

				if (Object.keys(updates).length > 0) {
					const { error: updateErr } = await supabase
						.from('pdf_institution_settings')
						.update(updates)
						.eq('id', record.id)

					if (updateErr) {
						console.log(`  - Warning: Could not update record ${record.id}:`, updateErr.message)
					} else {
						console.log(`  - Updated record ${record.id}:`, updates)
						updatedCount++
					}
				}
			}

			if (updatedCount > 0) {
				console.log(`\n✅ Updated ${updatedCount} records`)
			} else {
				console.log('\n✅ All records already have required fields')
			}
		}

		console.log('\n🎉 Migration check complete!')

	} catch (error) {
		console.error('Migration error:', error)
	}
}

applyMigration()
