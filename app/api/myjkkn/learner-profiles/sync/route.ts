import { NextRequest, NextResponse } from 'next/server'
import { fetchMyJKKNLearnerProfiles } from '@/lib/myjkkn-api'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * POST /api/myjkkn/learner-profiles/sync
 *
 * Syncs learner profiles from MyJKKN API to local Supabase table.
 * This provides a fallback/cache for when MyJKKN API is unavailable.
 */
export async function POST(request: NextRequest) {
	const { searchParams } = new URL(request.url)
	const institution_id = searchParams.get('institution_id')

	try {
		// Fetch all profiles from MyJKKN API
		console.log('[Sync] Fetching learner profiles from MyJKKN API...')

		const response = await fetchMyJKKNLearnerProfiles({
			limit: 100000,
			institution_id: institution_id || undefined,
		})

		const profiles = response.data || []
		console.log(`[Sync] Fetched ${profiles.length} profiles from MyJKKN`)

		if (profiles.length === 0) {
			return NextResponse.json({
				success: true,
				message: 'No profiles to sync',
				total: 0,
				inserted: 0,
				updated: 0,
				skipped: 0,
				errors: 0,
				source: 'myjkkn',
			})
		}

		const supabase = getSupabaseServer()
		let inserted = 0
		let updated = 0
		let skipped = 0
		let errors = 0

		// Process in batches of 100 for better performance
		const BATCH_SIZE = 100

		for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
			const batch = profiles.slice(i, i + BATCH_SIZE)

			// Prepare records for upsert
			const records = batch.map((profile: any) => ({
				id: profile.id,
				application_id: profile.application_id || null,
				migrated_at: profile.migrated_at || null,
				migration_source: profile.migration_source || 'myjkkn_sync',
				lifecycle_status: profile.lifecycle_status || 'unknown',
				first_name: profile.first_name || '',
				last_name: profile.last_name || '',
				date_of_birth: profile.date_of_birth || '',
				gender: profile.gender || '',
				religion: profile.religion || '',
				community: profile.community || '',
				caste: profile.caste || null,
				father_name: profile.father_name || '',
				father_occupation: profile.father_occupation || null,
				father_mobile: profile.father_mobile || '',
				mother_name: profile.mother_name || '',
				mother_occupation: profile.mother_occupation || null,
				mother_mobile: profile.mother_mobile || '',
				annual_income: profile.annual_income || null,
				last_school: profile.last_school || '',
				board_of_study: profile.board_of_study || '',
				tenth_marks: profile.tenth_marks || {},
				twelfth_marks: profile.twelfth_marks || {},
				medical_cutoff_marks: profile.medical_cutoff_marks || null,
				engineering_cutoff_marks: profile.engineering_cutoff_marks || null,
				neet_roll_number: profile.neet_roll_number || null,
				neet_score: profile.neet_score || null,
				counseling_applied: profile.counseling_applied || false,
				counseling_number: profile.counseling_number || null,
				quota: profile.quota || null,
				category: profile.category || null,
				entry_type: profile.entry_type || '',
				student_mobile: profile.student_mobile || profile.phone || '',
				student_email: profile.student_email || profile.email || '',
				permanent_address_street: profile.permanent_address_street || profile.address || '',
				permanent_address_taluk: profile.permanent_address_taluk || null,
				permanent_address_district: profile.permanent_address_district || profile.city || '',
				permanent_address_pin_code: profile.permanent_address_pin_code || profile.pincode || '',
				permanent_address_state: profile.permanent_address_state || profile.state || '',
				accommodation_type: profile.accommodation_type || '',
				hostel_type: profile.hostel_type || null,
				food_type: profile.food_type || null,
				bus_required: profile.bus_required || false,
				bus_route: profile.bus_route || null,
				bus_pickup_location: profile.bus_pickup_location || null,
				reference_type: profile.reference_type || null,
				reference_name: profile.reference_name || null,
				reference_contact: profile.reference_contact || null,
				institution_id: profile.institution_id || null,
				degree_id: profile.degree_id || null,
				department_id: profile.department_id || null,
				program_id: profile.program_id || null,
				semester_id: profile.semester_id || null,
				section_id: profile.section_id || null,
				academic_year_id: profile.academic_year_id || null,
				regulation_id: profile.regulation_id || null,
				batch_id: profile.batch_id || null,
				roll_number: profile.roll_number || null,
				register_number: profile.register_number || null,
				college_email: profile.college_email || null,
				student_photo_url: profile.student_photo_url || null,
				is_profile_complete: profile.is_profile_complete || false,
				aadhar_number: profile.aadhar_number || null,
				enquiry_date: profile.enquiry_date || null,
				blood_group: profile.blood_group || null,
				admission_year: profile.admission_year || null,
				scholarship_type: profile.scholarship_type || null,
				updated_at: new Date().toISOString(),
			}))

			// Upsert batch (insert or update on conflict)
			const { data, error } = await supabase
				.from('learners_profiles')
				.upsert(records, {
					onConflict: 'id',
					ignoreDuplicates: false,
				})
				.select('id')

			if (error) {
				console.error(`[Sync] Batch error:`, error)
				errors += batch.length

				// Try individual inserts for failed batch
				for (const record of records) {
					const { error: singleError } = await supabase
						.from('learners_profiles')
						.upsert(record, { onConflict: 'id' })

					if (singleError) {
						console.error(`[Sync] Individual error for ${record.id}:`, singleError.message)
						errors++
					} else {
						updated++
					}
				}
				// Adjust counts
				errors -= batch.length
			} else {
				// All records in batch processed successfully
				updated += batch.length
			}

			// Log progress every 500 records
			if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= profiles.length) {
				console.log(`[Sync] Progress: ${Math.min(i + BATCH_SIZE, profiles.length)}/${profiles.length}`)
			}
		}

		// Some records may have been inserts vs updates - we track as updates since upsert
		// For accurate counts, we'd need to check existing records first
		inserted = 0 // Can't distinguish without querying existing first
		const totalProcessed = updated + errors

		console.log(`[Sync] Complete: ${updated} processed, ${errors} errors`)

		return NextResponse.json({
			success: errors === 0,
			message: errors === 0
				? `Successfully synced ${updated} learner profiles from MyJKKN`
				: `Synced with ${errors} errors`,
			total: profiles.length,
			inserted,
			updated,
			skipped,
			errors,
			source: 'myjkkn',
		})
	} catch (error) {
		console.error('[Sync] Error syncing learner profiles:', error)

		return NextResponse.json(
			{
				success: false,
				message: error instanceof Error ? error.message : 'Failed to sync learner profiles',
				total: 0,
				inserted: 0,
				updated: 0,
				skipped: 0,
				errors: 1,
			},
			{ status: 500 }
		)
	}
}
