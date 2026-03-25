import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/reports/statistics
// Generate revaluation statistics dashboard
// =====================================================
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Extract filters
		const institutionCode = searchParams.get('institution_code')
		const institutionsId = searchParams.get('institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')

		// Build base query filters
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
			console.error('[Statistics] Registrations error:', regError)
			return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
		}

		// Fetch all final marks for comparison
		const revaluationIds = registrations?.map((r) => r.id) || []
		let finalMarksQuery = supabase
			.from('revaluation_final_marks')
			.select('*')
			.in('revaluation_registration_id', revaluationIds)

		const { data: finalMarks, error: finalError } = await finalMarksQuery.range(0, 9999)

		if (finalError) {
			console.error('[Statistics] Final marks error:', finalError)
		}

		// =====================================================
		// CALCULATE STATISTICS
		// =====================================================

		const totalApplications = registrations?.length || 0

		// Status breakdown
		const statusCounts = (registrations || []).reduce(
			(acc, r) => {
				acc[r.status] = (acc[r.status] || 0) + 1
				return acc
			},
			{} as Record<string, number>
		)

		// Payment status breakdown
		const paymentStatusCounts = (registrations || []).reduce(
			(acc, r) => {
				acc[r.payment_status] = (acc[r.payment_status] || 0) + 1
				return acc
			},
			{} as Record<string, number>
		)

		// Attempt number distribution
		const attemptCounts = (registrations || []).reduce(
			(acc, r) => {
				acc[r.attempt_number] = (acc[r.attempt_number] || 0) + 1
				return acc
			},
			{} as Record<number, number>
		)

		// Published results analysis
		const publishedMarks = (finalMarks || []).filter((fm) => fm.result_status === 'Published')

		let marksIncreased = 0
		let marksDecreased = 0
		let marksUnchanged = 0
		let passToFailCount = 0
		let failToPassCount = 0
		let totalMarksDifference = 0
		let totalPercentageDifference = 0

		publishedMarks.forEach((fm) => {
			if (fm.marks_difference > 0) marksIncreased++
			else if (fm.marks_difference < 0) marksDecreased++
			else marksUnchanged++

			// Pass status changes
			const wasPass = fm.original_grade !== 'F' && fm.original_percentage >= 40
			const isPass = fm.is_pass

			if (wasPass && !isPass) passToFailCount++
			if (!wasPass && isPass) failToPassCount++

			totalMarksDifference += Math.abs(fm.marks_difference || 0)
			totalPercentageDifference += Math.abs(fm.percentage_difference || 0)
		})

		const publishedCount = publishedMarks.length
		const avgMarkChange = publishedCount > 0 ? totalMarksDifference / publishedCount : 0
		const avgPercentageChange = publishedCount > 0 ? totalPercentageDifference / publishedCount : 0

		// Improvement rate
		const improvementRate = publishedCount > 0 ? (marksIncreased / publishedCount) * 100 : 0

		// Pass rate improvement
		const passRateImprovement =
			publishedCount > 0 ? ((failToPassCount - passToFailCount) / publishedCount) * 100 : 0

		// Turnaround time (application to publication)
		let totalTurnaroundDays = 0
		let turnaroundCount = 0

		registrations?.forEach((r) => {
			if (r.status === 'Published' && r.published_date && r.application_date) {
				const appDate = new Date(r.application_date)
				const pubDate = new Date(r.published_date)
				const days = Math.floor((pubDate.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24))
				if (days >= 0) {
					totalTurnaroundDays += days
					turnaroundCount++
				}
			}
		})

		const avgTurnaroundDays = turnaroundCount > 0 ? totalTurnaroundDays / turnaroundCount : 0

		// Build response
		const statistics = {
			total_applications: totalApplications,
			status_breakdown: statusCounts,
			payment_status_breakdown: paymentStatusCounts,
			attempt_distribution: attemptCounts,
			published_results: {
				total: publishedCount,
				marks_increased: marksIncreased,
				marks_decreased: marksDecreased,
				marks_unchanged: marksUnchanged,
				improvement_rate: improvementRate,
			},
			marks_analysis: {
				avg_mark_change: avgMarkChange,
				avg_percentage_change: avgPercentageChange,
			},
			pass_status_changes: {
				fail_to_pass: failToPassCount,
				pass_to_fail: passToFailCount,
				pass_rate_improvement: passRateImprovement,
			},
			turnaround_time: {
				avg_days: avgTurnaroundDays,
				total_completed: turnaroundCount,
			},
		}

		return NextResponse.json(statistics)
	} catch (error) {
		console.error('[Statistics GET] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
