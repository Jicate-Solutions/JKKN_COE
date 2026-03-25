import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/final-marks
// Fetch revaluation final marks with filters
// =====================================================
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Extract filters
		const institutionCode = searchParams.get('institution_code')
		const institutionsId = searchParams.get('institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')
		const revaluationRegistrationId = searchParams.get('revaluation_registration_id')
		const resultStatus = searchParams.get('result_status')

		// Build query
		let query = supabase.from('revaluation_final_marks').select('*')

		// Institution filter
		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		} else if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		// Other filters
		if (examinationSessionId) query = query.eq('examination_session_id', examinationSessionId)
		if (revaluationRegistrationId)
			query = query.eq('revaluation_registration_id', revaluationRegistrationId)
		if (resultStatus) query = query.eq('result_status', resultStatus)

		// Order by latest first
		query = query.order('calculated_at', { ascending: false })

		// Override default row limit
		const { data, error } = await query.range(0, 9999)

		if (error) {
			console.error('[Revaluation Final Marks GET] Error:', error)
			return NextResponse.json({ error: 'Failed to fetch final marks' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('[Revaluation Final Marks GET] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =====================================================
// POST /api/revaluation/final-marks
// Calculate revaluation final marks with comparison
// =====================================================
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		// Validate required fields
		if (!body.revaluation_registration_id) {
			return NextResponse.json({ error: 'Revaluation registration ID is required' }, { status: 400 })
		}

		// Fetch revaluation registration
		const { data: reval, error: revalError } = await supabase
			.from('revaluation_registrations')
			.select(
				`
				id,
				institutions_id,
				institution_code,
				examination_session_id,
				exam_registration_id,
				course_offering_id,
				course_id,
				student_id,
				student_register_number,
				status
			`
			)
			.eq('id', body.revaluation_registration_id)
			.single()

		if (revalError || !reval) {
			return NextResponse.json({ error: 'Revaluation registration not found' }, { status: 404 })
		}

		// Check status
		if (reval.status !== 'Evaluated') {
			return NextResponse.json(
				{ error: `Cannot calculate final marks - status is ${reval.status}` },
				{ status: 400 }
			)
		}

		// Check for duplicate
		const { data: existing } = await supabase
			.from('revaluation_final_marks')
			.select('id')
			.eq('revaluation_registration_id', body.revaluation_registration_id)
			.maybeSingle()

		if (existing) {
			return NextResponse.json(
				{ error: 'Final marks already calculated for this revaluation' },
				{ status: 400 }
			)
		}

		// =====================================================
		// FETCH ORIGINAL FINAL MARKS
		// =====================================================
		const { data: originalFinal, error: originalError } = await supabase
			.from('final_marks')
			.select(
				`
				id,
				internal_marks_obtained,
				internal_marks_maximum,
				external_marks_obtained,
				external_marks_maximum,
				total_marks_obtained,
				total_marks_maximum,
				percentage,
				grace_marks,
				letter_grade,
				grade_points,
				credit,
				total_grade_points,
				is_pass,
				is_distinction,
				is_first_class,
				pass_status,
				internal_marks_id
			`
			)
			.eq('exam_registration_id', reval.exam_registration_id)
			.eq('course_offering_id', reval.course_offering_id)
			.single()

		if (originalError || !originalFinal) {
			return NextResponse.json({ error: 'Original final marks not found' }, { status: 404 })
		}

		// =====================================================
		// FETCH REVALUATION MARKS (VERIFIED)
		// =====================================================
		const { data: revalMarks, error: revalMarksError } = await supabase
			.from('revaluation_marks')
			.select(
				`
				id,
				total_marks_obtained,
				marks_out_of,
				percentage
			`
			)
			.eq('revaluation_registration_id', body.revaluation_registration_id)
			.eq('entry_status', 'Verified')
			.single()

		if (revalMarksError || !revalMarks) {
			return NextResponse.json({ error: 'Verified revaluation marks not found' }, { status: 404 })
		}

		// =====================================================
		// CALCULATE NEW FINAL MARKS
		// Internal marks stay the same (from original)
		// External marks replaced with revaluation marks
		// =====================================================

		const internalMarks = originalFinal.internal_marks_obtained
		const internalMax = originalFinal.internal_marks_maximum
		const externalMarks = revalMarks.total_marks_obtained
		const externalMax = revalMarks.marks_out_of

		const totalMarks = internalMarks + externalMarks
		const totalMax = internalMax + externalMax
		const percentage = (totalMarks / totalMax) * 100

		// Fetch grading scheme to determine grade
		const { data: courseOffering } = await supabase
			.from('course_offerings')
			.select('grading_scheme_id, course_mapping:course_id(courses:course_id(credit))')
			.eq('id', reval.course_offering_id)
			.single()

		let letterGrade: string | null = null
		let gradePoints: number | null = null
		let gradeDescription: string | null = null

		if (courseOffering?.grading_scheme_id) {
			const { data: gradeRange } = await supabase
				.from('grade_ranges')
				.select('letter_grade, grade_point, description')
				.eq('grading_scheme_id', courseOffering.grading_scheme_id)
				.lte('min_percentage', percentage)
				.gte('max_percentage', percentage)
				.maybeSingle()

			if (gradeRange) {
				letterGrade = gradeRange.letter_grade
				gradePoints = gradeRange.grade_point
				gradeDescription = gradeRange.description
			}
		}

		// Calculate grade points
		const credit = (courseOffering?.course_mapping as any)?.courses?.credit || 0
		const totalGradePoints = gradePoints !== null ? gradePoints * credit : null

		// Determine pass status
		const isPass = percentage >= 40 // Standard pass mark
		const isDistinction = percentage >= 75
		const isFirstClass = percentage >= 60

		// Compare with original
		const originalMarks = originalFinal.total_marks_obtained
		const originalPercentage = originalFinal.percentage
		const originalGrade = originalFinal.letter_grade

		const marksDifference = totalMarks - originalMarks
		const percentageDifference = percentage - originalPercentage
		const isBetterThanOriginal = marksDifference > 0

		// Fetch program code
		const { data: examReg } = await supabase
			.from('exam_registrations')
			.select('program_code')
			.eq('id', reval.exam_registration_id)
			.single()

		// =====================================================
		// CREATE REVALUATION FINAL MARKS
		// =====================================================
		const { data, error } = await supabase
			.from('revaluation_final_marks')
			.insert({
				institutions_id: reval.institutions_id,
				institution_code: reval.institution_code,
				examination_session_id: reval.examination_session_id,
				revaluation_registration_id: reval.id,
				exam_registration_id: reval.exam_registration_id,
				course_offering_id: reval.course_offering_id,
				course_id: reval.course_id,
				student_id: reval.student_id,
				internal_marks_id: originalFinal.internal_marks_id,
				revaluation_marks_id: revalMarks.id,
				original_final_marks_id: originalFinal.id,
				// Internal marks (unchanged)
				internal_marks_obtained: internalMarks,
				internal_marks_maximum: internalMax,
				internal_percentage: (internalMarks / internalMax) * 100,
				// External marks (revaluation)
				external_marks_obtained: externalMarks,
				external_marks_maximum: externalMax,
				external_percentage: (externalMarks / externalMax) * 100,
				// Total marks
				total_marks_obtained: totalMarks,
				total_marks_maximum: totalMax,
				percentage,
				// Grace marks (carry from original)
				grace_marks: originalFinal.grace_marks || 0,
				grace_marks_reason: null,
				grace_marks_approved_by: null,
				grace_marks_approved_date: null,
				// Grade
				letter_grade: letterGrade,
				grade_points: gradePoints,
				grade_description: gradeDescription,
				credit,
				total_grade_points: totalGradePoints,
				// Pass status
				is_pass: isPass,
				is_distinction: isDistinction,
				is_first_class: isFirstClass,
				pass_status: isPass ? 'Pass' : 'Fail',
				// Comparison
				original_marks_obtained: originalMarks,
				original_percentage: originalPercentage,
				original_grade: originalGrade,
				marks_difference: marksDifference,
				percentage_difference: percentageDifference,
				is_better_than_original: isBetterThanOriginal,
				// Status
				result_status: 'Pending',
				is_locked: false,
				// Calculation
				calculated_by: body.calculated_by_user_id || null,
				calculated_at: new Date().toISOString(),
				calculation_notes: body.calculation_notes || null,
				// Audit
				remarks: null,
				is_active: true,
				created_by: body.created_by_user_id || null,
				// Denormalized
				register_number: reval.student_register_number,
				program_code: examReg?.program_code || '',
			})
			.select()
			.single()

		if (error) {
			console.error('[Revaluation Final Marks POST] Error:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'Final marks already calculated' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to calculate final marks' }, { status: 500 })
		}

		// Update revaluation status to Verified
		await supabase
			.from('revaluation_registrations')
			.update({
				status: 'Verified',
				updated_at: new Date().toISOString(),
			})
			.eq('id', reval.id)

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('[Revaluation Final Marks POST] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
