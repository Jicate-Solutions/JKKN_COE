import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/student-eligibility
// Check student eligibility for revaluation application
// =====================================================

export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const registerNumber = searchParams.get('register_number')?.toUpperCase()
	const examinationSessionId = searchParams.get('examination_session_id')
	const institutionsId = searchParams.get('institutions_id')
	// Which revaluation type the learner is applying for — drives the fee
	// (Revaluation / Retotaling / Copy of Answer Script). Defaults to REVALUATION.
	const revaluationType = (searchParams.get('revaluation_type') || 'REVALUATION').toUpperCase()

	// Validation
	if (!registerNumber) {
		return NextResponse.json({ error: 'Register number is required' }, { status: 400 })
	}

	if (!examinationSessionId) {
		return NextResponse.json({ error: 'Examination session is required' }, { status: 400 })
	}

	if (!institutionsId) {
		return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
	}

	try {
		// =====================================================
		// 1. RESOLVE STUDENT IDENTITY FROM EXAM REGISTRATIONS
		// =====================================================
		// NOTE: There is no `learners` table in COE. The authoritative source
		// of a learner's register number is exam_registrations.stu_register_no,
		// which also denormalizes student_id (a public.users id), student_name
		// and program_code. (final_marks_detailed_view derives stu_register_no
		// via a LEFT JOIN, so it can be NULL and is unreliable for lookup.)

		const { data: examReg, error: studentError } = await supabase
			.from('exam_registrations')
			.select('student_id, stu_register_no, student_name, program_code')
			.eq('stu_register_no', registerNumber)
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', examinationSessionId)
			.limit(1)
			.maybeSingle()

		if (studentError) {
			console.error('Student fetch error:', studentError)
			return NextResponse.json({ error: 'Failed to fetch student' }, { status: 500 })
		}

		if (!examReg) {
			return NextResponse.json(
				{
					error: 'No exam registration found for this register number in the selected examination session.',
				},
				{ status: 404 }
			)
		}

		// Best-effort program name for display (program_code -> program_name)
		let programName: string | null = null
		if (examReg.program_code) {
			const { data: prog } = await supabase
				.from('programs')
				.select('program_name')
				.eq('program_code', examReg.program_code)
				.limit(1)
				.maybeSingle()

			programName = prog?.program_name || null
		}

		const student = {
			id: examReg.student_id,
			register_number: examReg.stu_register_no,
			name: examReg.student_name,
			program_code: examReg.program_code,
			program_name: programName,
		}

		// =====================================================
		// 2. FETCH STUDENT PHOTO FROM MYJKKN API
		// =====================================================

		let photoUrl: string | null = null

		try {
			// Fetch institution to get myjkkn_institution_ids
			const { data: institution } = await supabase
				.from('institutions')
				.select('myjkkn_institution_ids')
				.eq('id', institutionsId)
				.single()

			const myjkknIds = institution?.myjkkn_institution_ids || []

			if (myjkknIds.length > 0) {
				// Fetch learner profile via the internal MyJKKN proxy route
				// (handles API key + correct upstream path). register_number is an
				// exact match; institution filtering is applied client-side below.
				const origin = new URL(request.url).origin
				const myjkknResponse = await fetch(
					`${origin}/api/myjkkn/learner-profiles?` +
						`register_number=${encodeURIComponent(registerNumber)}&` +
						`limit=1000&fetchAll=true`
				)

				if (myjkknResponse.ok) {
					const myjkknData = await myjkknResponse.json()
					const profiles = myjkknData.data || myjkknData || []

					// Find matching profile (match register number; institution match
					// is best-effort since MyJKKN institution_id may differ)
					const profile = profiles.find(
						(p: any) =>
							(p.register_number || '').toUpperCase() === registerNumber
					)

					if (profile?.student_photo_url) {
						photoUrl = profile.student_photo_url
					}
				}
			}
		} catch (photoError) {
			console.warn('Failed to fetch student photo:', photoError)
			// Continue without photo - not critical
		}

		// =====================================================
		// 3. FETCH FINAL MARKS (THEORY COURSES ONLY)
		// =====================================================

		const { data: finalMarks, error: marksError } = await supabase
			.from('final_marks')
			.select(
				`
				id,
				course_id,
				course_offering_id,
				exam_registration_id,
				internal_marks_obtained,
				internal_marks_maximum,
				external_marks_obtained,
				external_marks_maximum,
				total_marks_obtained,
				total_marks_maximum,
				percentage,
				letter_grade,
				is_pass,
				pass_status,
				result_status,
				courses:course_id (
					id,
					course_code,
					course_name,
					course_category
				),
				course_offerings:course_offering_id (
					semester
				)
			`
			)
			.eq('student_id', student.id)
			.eq('examination_session_id', examinationSessionId)
			.eq('result_status', 'Published')
			.neq('pass_status', 'Absent')

		if (marksError) {
			console.error('Final marks fetch error:', marksError)
			return NextResponse.json({ error: 'Failed to fetch student results' }, { status: 500 })
		}

		if (!finalMarks || finalMarks.length === 0) {
			return NextResponse.json(
				{
					error: 'No published results found for this register number. Student must have published final marks to apply for revaluation.',
				},
				{ status: 404 }
			)
		}

		// =====================================================
		// 4. FILTER THEORY COURSES ONLY
		// =====================================================

		const theoryCourses = finalMarks.filter(
			(mark: any) => mark.courses?.course_category === 'Theory'
		)

		if (theoryCourses.length === 0) {
			return NextResponse.json(
				{
					student: {
						id: student.id,
						name: student.name,
						register_number: student.register_number,
						program_code: student.program_code,
						program_name: student.program_name,
						photo_url: photoUrl,
					},
					eligible_courses: [],
					theory_subject_count: 0,
					message: 'No theory courses found for this student',
				},
				{ status: 200 }
			)
		}

		// =====================================================
		// 5. RESOLVE THE PER-PAPER FEE (type + UG/PG based)
		// =====================================================
		// Program level is encoded in the CAS register number (…UG… / …PG…),
		// with the program name as a fallback (Master… => PG).
		const programLevel: 'UG' | 'PG' =
			registerNumber.includes('PG') ||
			/\bM\.?|MASTER/i.test(student.program_name || '')
				? 'PG'
				: 'UG'

		const today = new Date().toISOString().split('T')[0]

		// Preferred: type + level rate (matches the fee circular). A row with
		// program_level 'ALL' applies to both UG and PG (e.g. Retotaling).
		const { data: rateRows } = await supabase
			.from('revaluation_fee_rates')
			.select('fee_per_paper, program_level')
			.eq('institutions_id', institutionsId)
			.eq('revaluation_type', revaluationType)
			.in('program_level', [programLevel, 'ALL'])
			.eq('is_active', true)
			.lte('effective_from', today)
			.or(`effective_to.is.null,effective_to.gte.${today}`)

		// Prefer an exact UG/PG match over an 'ALL' row when both exist
		const rate =
			rateRows?.find((r: any) => r.program_level === programLevel) ||
			rateRows?.find((r: any) => r.program_level === 'ALL') ||
			null

		let perPaperFee: number | null = rate ? Number(rate.fee_per_paper) : null
		let feeConfig: any = null

		// Fallback: legacy attempt-based config (other institutions not yet
		// migrated to the rate table).
		if (perPaperFee === null) {
			const { data: legacy } = await supabase
				.from('revaluation_fee_config')
				.select('*')
				.eq('institutions_id', institutionsId)
				.eq('is_active', true)
				.lte('effective_from', today)
				.gte('effective_to', today)
				.maybeSingle()
			feeConfig = legacy
		}

		if (perPaperFee === null && !feeConfig) {
			return NextResponse.json(
				{ error: 'No active fee configuration found. Please contact administrator.' },
				{ status: 400 }
			)
		}

		// =====================================================
		// 6. CHECK EXISTING REVALUATION ATTEMPTS
		// =====================================================

		const courseIds = theoryCourses.map((mark: any) => mark.course_id)

		const { data: existingRevaluations } = await supabase
			.from('revaluation_registrations')
			.select('course_id, attempt_number, status')
			.eq('student_id', student.id)
			.eq('examination_session_id', examinationSessionId)
			.in('course_id', courseIds)

		// Create a map of course_id -> attempts
		const attemptsMap = new Map()
		existingRevaluations?.forEach((reval: any) => {
			const existing = attemptsMap.get(reval.course_id) || []
			existing.push(reval)
			attemptsMap.set(reval.course_id, existing)
		})

		// =====================================================
		// 7. BUILD ELIGIBLE COURSES LIST
		// =====================================================

		const eligibleCourses = theoryCourses.map((mark: any) => {
			const courseRevaluations = attemptsMap.get(mark.course_id) || []

			// Check for active (non-final) revaluations
			const activeRevaluation = courseRevaluations.find(
				(r: any) => !['Published', 'Cancelled'].includes(r.status)
			)

			// Count total attempts
			const attemptCount = courseRevaluations.length
			const nextAttemptNumber = attemptCount + 1

			// Determine eligibility
			let isEligible = true
			let reason = ''

			if (activeRevaluation) {
				isEligible = false
				reason = `Revaluation already in progress (${activeRevaluation.status})`
			} else if (attemptCount >= 3) {
				isEligible = false
				reason = 'Maximum 3 attempts reached'
			}

			// Calculate fee
			let feeAmount = 0
			if (nextAttemptNumber === 1) feeAmount = feeConfig.attempt_1_fee
			else if (nextAttemptNumber === 2) feeAmount = feeConfig.attempt_2_fee
			else if (nextAttemptNumber === 3) feeAmount = feeConfig.attempt_3_fee

			return {
				course_id: mark.course_id,
				course_code: mark.courses.course_code,
				course_name: mark.courses.course_name,
				semester: mark.course_offerings?.semester ?? null,
				internal_marks: mark.internal_marks_obtained,
				external_marks: mark.external_marks_obtained,
				total_marks: mark.total_marks_obtained,
				percentage: mark.percentage,
				letter_grade: mark.letter_grade,
				result: mark.is_pass ? 'Pass' : 'Fail',
				pass_status: mark.pass_status,
				attempt_number: nextAttemptNumber,
				fee_amount: feeAmount,
				is_eligible: isEligible,
				reason: reason || null,
				course_offering_id: mark.course_offering_id,
				exam_registration_id: mark.exam_registration_id,
			}
		})

		// =====================================================
		// 8. RETURN RESPONSE
		// =====================================================

		return NextResponse.json({
			student: {
				id: student.id,
				name: student.name,
				register_number: student.register_number,
				program_code: student.program_code,
				program_name: student.program_name,
				photo_url: photoUrl,
			},
			eligible_courses: eligibleCourses,
			theory_subject_count: theoryCourses.length,
		})
	} catch (error) {
		console.error('Student eligibility check error:', error)
		return NextResponse.json({ error: 'Failed to check student eligibility' }, { status: 500 })
	}
}
