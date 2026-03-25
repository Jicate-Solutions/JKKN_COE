/**
 * Seed SMTP Configuration Sample Data
 *
 * This script creates sample SMTP configuration for testing.
 * Run after the examiners migration has been applied.
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

async function seedSmtpConfig() {
	console.log('Seeding SMTP Configuration...\n')

	try {
		// Check if table exists
		const { data: tableCheck, error: checkError } = await supabase
			.from('smtp_configuration')
			.select('id')
			.limit(1)

		if (checkError && checkError.code === '42P01') {
			console.log('❌ smtp_configuration table does not exist!')
			console.log('   Please run the examiner migration first.')
			console.log('   SQL file: supabase/migrations/20251213_create_examiners_table.sql')
			return
		}

		// Sample SMTP configurations
		const sampleConfigs = [
			{
				institution_code: 'JKKN001',
				smtp_host: 'smtp.gmail.com',
				smtp_port: 587,
				smtp_secure: true,
				smtp_user: 'coe@jkkn.edu.in',
				smtp_password_encrypted: 'encrypted_password_placeholder', // Replace in production
				sender_email: 'coe@jkkn.edu.in',
				sender_name: 'Controller of Examinations - JKKN',
				default_cc_emails: ['principal@jkkn.edu.in', 'deputy.coe@jkkn.edu.in'],
				is_active: true
			},
			{
				institution_code: 'JKKN002',
				smtp_host: 'smtp.office365.com',
				smtp_port: 587,
				smtp_secure: true,
				smtp_user: 'examinations@jkkncollege.edu.in',
				smtp_password_encrypted: 'encrypted_password_placeholder',
				sender_email: 'examinations@jkkncollege.edu.in',
				sender_name: 'Office of Controller of Examinations',
				default_cc_emails: ['admin@jkkncollege.edu.in'],
				is_active: false
			}
		]

		// Check existing records
		const { data: existing } = await supabase
			.from('smtp_configuration')
			.select('institution_code')

		const existingCodes = existing?.map(e => e.institution_code) || []
		console.log(`Found ${existingCodes.length} existing SMTP configurations`)

		// Insert only new configs
		let insertedCount = 0
		let skippedCount = 0

		for (const config of sampleConfigs) {
			if (existingCodes.includes(config.institution_code)) {
				console.log(`⏭️  Skipping ${config.institution_code} - already exists`)
				skippedCount++
				continue
			}

			const { data, error } = await supabase
				.from('smtp_configuration')
				.insert(config)
				.select()
				.single()

			if (error) {
				console.error(`❌ Failed to insert ${config.institution_code}:`, error.message)
			} else {
				console.log(`✅ Created SMTP config for ${config.institution_code}`)
				console.log(`   Host: ${config.smtp_host}:${config.smtp_port}`)
				console.log(`   Sender: ${config.sender_email}`)
				console.log(`   Active: ${config.is_active}`)
				insertedCount++
			}
		}

		console.log('\n📊 Summary:')
		console.log(`   Inserted: ${insertedCount}`)
		console.log(`   Skipped: ${skippedCount}`)

		// List all configs
		const { data: allConfigs } = await supabase
			.from('smtp_configuration')
			.select('id, institution_code, smtp_host, smtp_port, sender_email, is_active')
			.order('created_at', { ascending: false })

		if (allConfigs && allConfigs.length > 0) {
			console.log('\n📧 All SMTP Configurations:')
			console.log('─'.repeat(80))
			allConfigs.forEach((cfg, i) => {
				const status = cfg.is_active ? '🟢 Active' : '🔴 Inactive'
				console.log(`${i + 1}. ${cfg.institution_code}`)
				console.log(`   ${cfg.smtp_host}:${cfg.smtp_port} | ${cfg.sender_email} | ${status}`)
			})
		}

		console.log('\n🎉 SMTP configuration seeding complete!')
		console.log('\n⚠️  IMPORTANT: Replace "encrypted_password_placeholder" with actual')
		console.log('   encrypted SMTP passwords before sending emails in production.')

	} catch (error) {
		console.error('Seeding error:', error)
	}
}

seedSmtpConfig()
