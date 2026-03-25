import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/reports/comparison
// Generate comparison report (before/after revaluation)
// Used for admin review and decision-making
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
		const status = searchParams.get('status')

		// Build base query for registrations
		let query = supabase.from('revaluation_registrations').select('*')

		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		} else if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		if (examinationSessionId) {
			query = query.eq('examination_session_id', examinationSessionId)
		}

		if (revaluationRegistrationId) {
			query = query.eq('id', revaluationRegistrationId)
		}

		if (status) {
			query = query.eq('status', status)
		}

		const { data: registrations, error: regError } = await query.range(0, 9999)

		if (regError) {
			console.error('[Comparison Report] Registrations error:', regError)
			return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
		}

		// Fetch final marks for these registrations
		const revaluationIds = registrations?.map((r) => r.id) || []

		const { data: finalMarks, error: finalError } = await supabase
			.from('revaluation_final_marks')
			.select('*')
			.in('revaluation_registration_id', revaluationIds)
			.range(0, 9999)

		if (finalError) {
			console.error('[Comparison Report] Final marks error:', finalError)
		}

		// =====================================================
		// BUILD COMPARISON DATA
		// =====================================================

		const comparisonData = (registrations || []).map((reg) => {
			const finalMark = finalMarks?.find((fm) => fm.revaluation_registration_id === reg.id)

			return {
				revaluation_registration_id: reg.id,
				student_register_number: reg.student_register_number,
				student_name: reg.student_name,
				course_code: reg.course_code,
				course_title: reg.course_title,
				attempt_number: reg.attempt_number,
				status: reg.status,
				application_date: reg.application_date,
				published_date: reg.published_date,
				// Original marks
				original: finalMark
					? {
							marks: finalMark.original_marks_obtained,
							percentage: finalMark.original_percentage,
							grade: finalMark.original_grade,
							pass_status: finalMark.original_percentage >= 40 ? 'Pass' : 'Fail',
						}
					: null,
				// Revaluation marks
				revaluation: finalMark
					? {
							marks: finalMark.total_marks_obtained,
							percentage: finalMark.percentage,
							grade: finalMark.letter_grade,
							pass_status: finalMark.pass_status,
						}
					: null,
				// Comparison
				comparison: finalMark
					? {
							marks_difference: finalMark.marks_difference,
							percentage_difference: finalMark.percentage_difference,
							grade_changed: finalMark.original_grade !== finalMark.letter_grade,
							pass_status_changed:
								(finalMark.original_percentage >= 40) !== finalMark.is_pass,
							is_improvement: finalMark.is_better_than_original,
							recommended_use_revaluation: finalMark.is_better_than_original,
						}
					: null,
				// Status flags
				has_final_marks: !!finalMark,
				is_published: reg.status === 'Published',
				result_status: finalMark?.result_status || null,
			}
		})

		// Sort by latest first
		comparisonData.sort((a, b) => {
			const dateA = new Date(a.application_date || 0)
			const dateB = new Date(b.application_date || 0)
			return dateB.getTime() - dateA.getTime()
		})

		// Calculate summary statistics
		const withFinalMarks = comparisonData.filter((c) => c.has_final_marks)
		const totalWithMarks = withFinalMarks.length

		const summary = {
			total_revaluations: comparisonData.length,
			with_final_marks: totalWithMarks,
			improvements: withFinalMarks.filter((c) => c.comparison?.is_improvement).length,
			degradations: withFinalMarks.filter(
				(c) => c.comparison && !c.comparison.is_improvement && c.comparison.marks_difference < 0
			).length,
			no_change: withFinalMarks.filter((c) => c.comparison?.marks_difference === 0).length,
			grade_changes: withFinalMarks.filter((c) => c.comparison?.grade_changed).length,
			pass_status_changes: withFinalMarks.filter((c) => c.comparison?.pass_status_changed).length,
			fail_to_pass: withFinalMarks.filter(
				(c) =>
					c.original &&
					c.revaluation &&
					c.original.pass_status === 'Fail' &&
					c.revaluation.pass_status === 'Pass'
			).length,
			pass_to_fail: withFinalMarks.filter(
				(c) =>
					c.original &&
					c.revaluation &&
					c.original.pass_status === 'Pass' &&
					c.revaluation.pass_status === 'Fail'
			).length,
			published: comparisonData.filter((c) => c.is_published).length,
		}

		return NextResponse.json({
			summary,
			data: comparisonData,
		})
	} catch (error) {
		console.error('[Comparison Report GET] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
