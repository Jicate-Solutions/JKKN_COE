import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/reports/course-analysis
// Generate course-wise revaluation analysis
// Shows which courses have most revaluations and mark changes
// =====================================================
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Extract filters
		const institutionCode = searchParams.get('institution_code')
		const institutionsId = searchParams.get('institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')

		// Build base query
		let query = supabase.from('revaluation_registrations').select('*')

		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		} else if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		if (examinationSessionId) {
			query = query.eq('examination_session_id', examinationSessionId)
		}

		const { data: registrations, error: regError } = await query.range(0, 9999)

		if (regError) {
			console.error('[Course Analysis] Registrations error:', regError)
			return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
		}

		// Fetch final marks for published results
		const revaluationIds = registrations?.map((r) => r.id) || []
		const { data: finalMarks, error: finalError } = await supabase
			.from('revaluation_final_marks')
			.select('*')
			.in('revaluation_registration_id', revaluationIds)
			.eq('result_status', 'Published')
			.range(0, 9999)

		if (finalError) {
			console.error('[Course Analysis] Final marks error:', finalError)
		}

		// =====================================================
		// GROUP BY COURSE
		// =====================================================

		const courseMap = new Map<
			string,
			{
				course_id: string
				course_code: string
				course_title: string
				total_revaluations: number
				published_count: number
				marks_increased: number
				marks_decreased: number
				marks_unchanged: number
				fail_to_pass: number
				pass_to_fail: number
				total_marks_difference: number
				max_marks_increase: number
				max_marks_decrease: number
			}
		>()

		// Initialize course data from registrations
		registrations?.forEach((r) => {
			const key = r.course_id
			if (!courseMap.has(key)) {
				courseMap.set(key, {
					course_id: r.course_id,
					course_code: r.course_code,
					course_title: r.course_title,
					total_revaluations: 0,
					published_count: 0,
					marks_increased: 0,
					marks_decreased: 0,
					marks_unchanged: 0,
					fail_to_pass: 0,
					pass_to_fail: 0,
					total_marks_difference: 0,
					max_marks_increase: 0,
					max_marks_decrease: 0,
				})
			}
			const course = courseMap.get(key)!
			course.total_revaluations++
		})

		// Add published marks data
		finalMarks?.forEach((fm) => {
			const reg = registrations?.find((r) => r.id === fm.revaluation_registration_id)
			if (!reg) return

			const key = reg.course_id
			const course = courseMap.get(key)
			if (!course) return

			course.published_count++

			// Mark changes
			if (fm.marks_difference > 0) {
				course.marks_increased++
				course.max_marks_increase = Math.max(course.max_marks_increase, fm.marks_difference)
			} else if (fm.marks_difference < 0) {
				course.marks_decreased++
				course.max_marks_decrease = Math.min(course.max_marks_decrease, fm.marks_difference)
			} else {
				course.marks_unchanged++
			}

			// Pass status changes
			const wasPass = fm.original_percentage >= 40
			const isPass = fm.is_pass

			if (!wasPass && isPass) course.fail_to_pass++
			if (wasPass && !isPass) course.pass_to_fail++

			course.total_marks_difference += Math.abs(fm.marks_difference || 0)
		})

		// Calculate averages and rates
		const courseAnalysis = Array.from(courseMap.values()).map((course) => ({
			...course,
			avg_mark_change:
				course.published_count > 0 ? course.total_marks_difference / course.published_count : 0,
			improvement_rate:
				course.published_count > 0 ? (course.marks_increased / course.published_count) * 100 : 0,
			pass_rate_improvement:
				course.published_count > 0
					? ((course.fail_to_pass - course.pass_to_fail) / course.published_count) * 100
					: 0,
			publication_rate:
				course.total_revaluations > 0
					? (course.published_count / course.total_revaluations) * 100
					: 0,
		}))

		// Sort by total revaluations (descending)
		courseAnalysis.sort((a, b) => b.total_revaluations - a.total_revaluations)

		return NextResponse.json({
			total_courses: courseAnalysis.length,
			courses: courseAnalysis,
		})
	} catch (error) {
		console.error('[Course Analysis GET] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
