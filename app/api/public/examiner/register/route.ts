import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Public Examiner Registration API
 * No authentication required - used for examiner willingness form
 * Supports both arts (default) and engineering form types
 */
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()
		const formType = body.form_type || 'arts'

		// Validate required fields
		if (!body.full_name?.trim()) {
			return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
		}
		if (!body.email?.trim()) {
			return NextResponse.json({ error: 'Email is required' }, { status: 400 })
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(body.email)) {
			return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
		}

		// Check for common email typos
		const emailDomain = body.email.split('@')[1]?.toLowerCase()
		const typoPatterns = ['gmial.com', 'gmal.com', 'gamil.com', 'gnail.com', 'yaho.com', 'hotmal.com']
		if (typoPatterns.includes(emailDomain)) {
			return NextResponse.json({
				error: `Possible typo in email domain: ${emailDomain}. Did you mean gmail.com or yahoo.com?`
			}, { status: 400 })
		}

		const email = body.email.toLowerCase().trim()

		// Check if examiner already exists
		const { data: existingExaminer } = await supabase
			.from('examiners')
			.select('id, status')
			.eq('email', email)
			.single()

		if (existingExaminer) {
			if (existingExaminer.status === 'PENDING') {
				return NextResponse.json({
					error: 'Your registration is already pending approval. You will be notified once approved.',
					status: 'PENDING'
				}, { status: 400 })
			}
			if (existingExaminer.status === 'ACTIVE') {
				return NextResponse.json({
					error: 'You are already registered as an examiner.',
					status: 'ACTIVE'
				}, { status: 400 })
			}
			if (existingExaminer.status === 'REJECTED') {
				return NextResponse.json({
					error: 'Your previous registration was rejected. Please contact the examination office.',
					status: 'REJECTED'
				}, { status: 400 })
			}
		}

		// Resolve institution_code → institution_id (shared by both form types)
		let institution_id: string | null = null
		const institution_code = body.institution_code?.trim() || null

		if (institution_code) {
			const { data: inst } = await supabase
				.from('institutions')
				.select('id')
				.eq('institution_code', institution_code)
				.maybeSingle()
			institution_id = inst?.id ?? null
		}

		if (formType === 'engineering') {
			// ── Engineering form registration ──────────────────────────

			// Build additional_data JSONB with specializations and courses
			const additionalData: Record<string, unknown> = {}

			// Specializations
			const specializations: Record<string, string> = {}
			if (body.ug_specialization?.trim()) specializations.ug = body.ug_specialization.trim()
			if (body.pg_specialization?.trim()) specializations.pg = body.pg_specialization.trim()
			if (body.phd_specialization?.trim()) specializations.phd = body.phd_specialization.trim()
			if (Object.keys(specializations).length > 0) {
				additionalData.specializations = specializations
			}

			// Courses (theory and practical)
			const courses: Record<string, unknown> = {}
			if (Array.isArray(body.theory_courses) && body.theory_courses.length > 0) {
				const filtered = body.theory_courses.filter(
					(c: { course?: string; times?: string }) => c.course?.trim()
				)
				if (filtered.length > 0) courses.theory = filtered
			}
			if (Array.isArray(body.practical_courses) && body.practical_courses.length > 0) {
				const filtered = body.practical_courses.filter(
					(c: { course?: string; times?: string }) => c.course?.trim()
				)
				if (filtered.length > 0) courses.practical = filtered
			}
			if (Object.keys(courses).length > 0) {
				additionalData.courses = courses
			}

			// Store designation_other and department_other if provided
			if (body.designation_other?.trim()) {
				additionalData.designation_other = body.designation_other.trim()
			}
			if (body.department_other?.trim()) {
				additionalData.department_other = body.department_other.trim()
			}

			// Resolve effective designation/department (use "other" value when selected)
			const effectiveDesignation = body.designation === 'Other'
				? body.designation_other?.trim() || 'Other'
				: body.designation?.trim() || null
			const effectiveDepartment = body.department === 'Other'
				? body.department_other?.trim() || 'Other'
				: body.department?.trim() || null

			const insertPayload = {
				form_type: 'engineering',
				full_name: body.full_name.trim().toUpperCase(),
				email,
				mobile: body.mobile?.trim() || null,
				salutation: body.salutation?.trim() || null,
				gender: body.gender?.trim() || null,
				designation: effectiveDesignation,
				department: effectiveDepartment,
				highest_qualification: body.highest_qualification?.trim() || null,
				aicte_faculty_code: body.aicte_faculty_code?.trim() || null,
				personal_email: body.personal_email?.toLowerCase().trim() || null,
				official_email: body.official_email?.toLowerCase().trim() || null,
				institution_name: body.institution_name?.trim() || null,
				institution_address: body.address_pincode?.trim() || null,
				institution_coe_contact: body.institution_coe_contact?.trim() || null,
				institution_coe_email: body.institution_coe_email?.toLowerCase().trim() || null,
				teaching_exp_years: parseInt(body.teaching_exp_years) || 0,
				industry_exp_years: parseInt(body.industry_exp_years) || 0,
				total_exp_years: parseInt(body.total_exp_years) || 0,
				area_of_expertise: body.area_of_expertise?.trim() || null,
				willingness_roles: Array.isArray(body.willingness_roles) ? body.willingness_roles : [],
				google_profile_picture: body.google_profile_picture?.trim() || null,
				declaration_acknowledged: body.declaration_acknowledged ?? false,
				additional_data: Object.keys(additionalData).length > 0 ? additionalData : {},
				examiner_type: 'ALL' as const,
				is_internal: false,
				email_verified: body.email_verified ?? false,
				status: 'PENDING' as const,
				institution_code,
				institution_id,
			}

			const { data: examiner, error: insertError } = await supabase
				.from('examiners')
				.insert([insertPayload])
				.select()
				.single()

			if (insertError) {
				console.error('Error creating engineering examiner:', insertError)
				if (insertError.code === '23505') {
					return NextResponse.json({ error: 'An examiner with this email already exists' }, { status: 400 })
				}
				return NextResponse.json({ error: 'Failed to register. Please try again.' }, { status: 500 })
			}

			// Engineering examiners do not use board associations

			return NextResponse.json({
				success: true,
				message: 'Your registration has been submitted successfully. You will be notified once approved.',
				examiner_id: examiner.id,
			}, { status: 201 })

		} else {
			// ── Arts form registration (existing logic) ────────────────

			// Determine examiner type based on board selections
			let examinerType = 'UG'
			const hasUG = body.ug_board_code && body.ug_board_code !== 'None'
			const hasPG = body.pg_board_code && body.pg_board_code !== 'None'

			if (hasUG && hasPG) {
				examinerType = 'UG_PG'
			} else if (hasPG) {
				examinerType = 'PG'
			} else if (body.willing_for_practical) {
				examinerType = 'PRACTICAL'
			} else if (body.willing_for_scrutiny) {
				examinerType = 'SCRUTINY'
			}

			// Create examiner record
			const insertPayload = {
				full_name: body.full_name.trim(),
				email: email,
				mobile: body.mobile?.trim() || null,
				designation: body.designation?.trim() || null,
				department: body.department?.trim() || null,
				institution_name: body.institution_name?.trim() || null,
				institution_address: body.institution_address?.trim() || null,
				ug_experience_years: parseInt(body.ug_experience_years) || 0,
				pg_experience_years: parseInt(body.pg_experience_years) || 0,
				examiner_type: examinerType,
				is_internal: false,
				email_verified: body.email_verified ?? false,
				status: 'PENDING',
				institution_code,
				institution_id,
			}

			const { data: examiner, error: insertError } = await supabase
				.from('examiners')
				.insert([insertPayload])
				.select()
				.single()

			if (insertError) {
				console.error('Error creating examiner:', insertError)
				if (insertError.code === '23505') {
					return NextResponse.json({ error: 'An examiner with this email already exists' }, { status: 400 })
				}
				return NextResponse.json({ error: 'Failed to register. Please try again.' }, { status: 500 })
			}

			// Add board associations
			const boardAssociations = []
			const boardIdUpdates: { ug_board_id?: string; pg_board_id?: string } = {}

			// Get UG board if selected
			if (hasUG) {
				const { data: ugBoard } = await supabase
					.from('board')
					.select('id, board_code')
					.eq('board_code', body.ug_board_code)
					.single()

				if (ugBoard) {
					boardIdUpdates.ug_board_id = ugBoard.id
					boardAssociations.push({
						examiner_id: examiner.id,
						board_id: ugBoard.id,
						board_code: ugBoard.board_code,
						willing_for_valuation: body.willing_for_valuation ?? true,
						willing_for_practical: body.willing_for_practical ?? false,
						willing_for_scrutiny: body.willing_for_scrutiny ?? false,
						is_active: true,
					})
				}
			}

			// Get PG board if selected
			if (hasPG) {
				const { data: pgBoard } = await supabase
					.from('board')
					.select('id, board_code')
					.eq('board_code', body.pg_board_code)
					.single()

				if (pgBoard) {
					boardIdUpdates.pg_board_id = pgBoard.id
					boardAssociations.push({
						examiner_id: examiner.id,
						board_id: pgBoard.id,
						board_code: pgBoard.board_code,
						willing_for_valuation: body.willing_for_valuation ?? true,
						willing_for_practical: body.willing_for_practical ?? false,
						willing_for_scrutiny: body.willing_for_scrutiny ?? false,
						is_active: true,
					})
				}
			}

			if (boardAssociations.length > 0) {
				await supabase.from('examiner_board_associations').insert(boardAssociations)
			}

			// Store ug_board_id / pg_board_id directly on examiners row
			if (Object.keys(boardIdUpdates).length > 0) {
				await supabase.from('examiners').update(boardIdUpdates).eq('id', examiner.id)
			}

			return NextResponse.json({
				success: true,
				message: 'Your registration has been submitted successfully. You will be notified once approved.',
				examiner_id: examiner.id,
			}, { status: 201 })
		}
	} catch (e) {
		console.error('Public examiner registration error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
