import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	ResultAnalyticsFilters,
	SubjectAnalysisDashboardData,
	SubjectResultSummary,
	SubjectTrend,
	SubjectFailureAnalysis,
	SubjectComparisonData,
	InternalExternalComparison,
	SubjectHeatmapData
} from '@/types/result-analytics'

// GET /api/result-analytics/subject-stats
// Fetches subject-wise result analytics
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)

		// Parse filters
		const filters: ResultAnalyticsFilters = {
			institution_id: searchParams.get('institution_id') || undefined,
			academic_year_id: searchParams.get('academic_year_id') || undefined,
			examination_session_id: searchParams.get('examination_session_id') || undefined,
			program_id: searchParams.get('program_id') || undefined,
			semester: searchParams.get('semester') ? parseInt(searchParams.get('semester')!) : undefined,
		}

		// Build query for final_marks with course details
		// Note: programs table does not exist - use program_code from final_marks
		let query = supabase
			.from('final_marks')
			.select(`
				id,
				student_id,
				program_id,
				program_code,
				course_id,
				examination_session_id,
				course_offering_id,
				internal_marks_obtained,
				internal_marks_maximum,
				external_marks_obtained,
				external_marks_maximum,
				total_marks_obtained,
				total_marks_maximum,
				percentage,
				grade_points,
				is_pass,
				pass_status,
				institutions_id,
				courses (
					id,
					course_code,
					course_name,
					course_category,
					credit
				),
				course_offerings (
					semester
				)
			`)
			.eq('result_status', 'Published')
			.eq('is_active', true)

		// Apply filters
		if (filters.institution_id) {
			query = query.eq('institutions_id', filters.institution_id)
		}
		if (filters.examination_session_id) {
			query = query.eq('examination_session_id', filters.examination_session_id)
		}
		if (filters.program_id) {
			query = query.eq('program_id', filters.program_id)
		}

		const { data: rawMarksData, error } = await query.range(0, 9999)

		if (error) {
			console.error('Error fetching subject stats:', error)
			return NextResponse.json({ error: 'Failed to fetch subject data' }, { status: 500 })
		}

		// Fetch examination sessions separately to avoid nested join issues
		const sessionIds = [...new Set((rawMarksData || []).map((m: any) => m.examination_session_id).filter(Boolean))]
		let sessionsMap = new Map<string, any>()

		if (sessionIds.length > 0) {
			const { data: sessionsData } = await supabase
				.from('examination_sessions')
				.select(`id, session_code, session_name, academic_year_id`)
				.in('id', sessionIds)

			sessionsData?.forEach((s: any) => sessionsMap.set(s.id, s))

			// Fetch academic years for sessions
			const academicYearIds = [...new Set(sessionsData?.map((s: any) => s.academic_year_id).filter(Boolean) || [])]

			if (academicYearIds.length > 0) {
				const { data: academicYearsData } = await supabase
					.from('academic_years')
					.select(`id, academic_year`)
					.in('id', academicYearIds)

				// Enrich sessions with academic year data
				academicYearsData?.forEach((ay: any) => {
					sessionsMap.forEach((session, sessionId) => {
						if (session.academic_year_id === ay.id) {
							sessionsMap.set(sessionId, {
								...session,
								academic_years: ay
							})
						}
					})
				})
			}
		}

		// Enrich marks data with examination sessions
		const finalMarksData = (rawMarksData || []).map((mark: any) => ({
			...mark,
			examination_sessions: sessionsMap.get(mark.examination_session_id) || null
		}))

		if (!finalMarksData || finalMarksData.length === 0) {
			return NextResponse.json({
				success: true,
				data: {
					subjects: [],
					trends: [],
					failure_analysis: [],
					difficult_subjects: [],
					easy_subjects: [],
					comparison_data: [],
					internal_external_comparison: [],
					heatmap_data: []
				} as SubjectAnalysisDashboardData,
				filters_applied: filters,
				generated_at: new Date().toISOString()
			})
		}

		// Group by course
		const courseMap = new Map<string, any[]>()
		finalMarksData.forEach((record: any) => {
			const courseId = record.course_id
			if (!courseMap.has(courseId)) {
				courseMap.set(courseId, [])
			}
			courseMap.get(courseId)!.push(record)
		})

		// Calculate subject summaries
		const subjects: SubjectResultSummary[] = []

		courseMap.forEach((records, courseId) => {
			const summary = calculateSubjectSummary(records)
			subjects.push(summary)
		})

		// Sort by difficulty index descending
		subjects.sort((a, b) => b.difficulty_index - a.difficulty_index)

		// Difficult subjects (top 10 by difficulty)
		const difficultSubjects = subjects.slice(0, 10)

		// Easy subjects (bottom 10 by difficulty, i.e., highest pass rates)
		const easySubjects = [...subjects].sort((a, b) => a.difficulty_index - b.difficulty_index).slice(0, 10)

		// Failure analysis
		const failureAnalysis = subjects
			.filter(s => s.fail_percentage > 20) // Subjects with >20% failure
			.map(s => ({
				course_id: s.course_id,
				course_code: s.course_code,
				course_name: s.course_name,
				total_failures: s.total_students_failed,
				failure_reason_internal: s.failed_internal,
				failure_reason_external: s.failed_external,
				failure_reason_both: s.failed_both,
				failure_reason_absent: s.total_students_absent,
				improvement_suggestions: generateImprovementSuggestions(s)
			}))

		// Calculate trends
		const trends = calculateSubjectTrends(finalMarksData)

		// Comparison data for charts
		const comparisonData: SubjectComparisonData[] = subjects.map(s => ({
			course_code: s.course_code,
			course_name: s.course_name,
			pass_percentage: s.pass_percentage,
			average_marks: s.average_total_marks,
			difficulty_index: s.difficulty_index,
			total_students: s.total_students_appeared
		}))

		// Internal vs External comparison
		const internalExternalComparison = calculateInternalExternalComparison(subjects)

		// Heatmap data (program x semester x subject)
		const heatmapData = calculateHeatmapData(finalMarksData)

		const dashboardData: SubjectAnalysisDashboardData = {
			subjects,
			trends,
			failure_analysis: failureAnalysis,
			difficult_subjects: difficultSubjects,
			easy_subjects: easySubjects,
			comparison_data: comparisonData,
			internal_external_comparison: internalExternalComparison,
			heatmap_data: heatmapData
		}

		return NextResponse.json({
			success: true,
			data: dashboardData,
			filters_applied: filters,
			generated_at: new Date().toISOString()
		})

	} catch (error) {
		console.error('Error in subject stats API:', error)
		return NextResponse.json({
			error: 'Internal server error',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 })
	}
}

// Calculate summary for a single subject/course
function calculateSubjectSummary(records: any[]): SubjectResultSummary {
	const firstRecord = records[0]
	const course = firstRecord?.courses
	const program = firstRecord?.programs
	const courseOffering = firstRecord?.course_offerings

	const totalAppeared = records.length
	const passedRecords = records.filter(r => r.is_pass === true)
	const failedRecords = records.filter(r => r.is_pass === false && r.pass_status !== 'Absent')
	const absentRecords = records.filter(r => r.pass_status === 'Absent')

	const totalPassed = passedRecords.length
	const totalFailed = failedRecords.length
	const totalAbsent = absentRecords.length

	// Max marks - use the correct field names from final_marks table
	const maxInternal = firstRecord?.internal_marks_maximum || 40
	const maxExternal = firstRecord?.external_marks_maximum || 60
	const maxTotal = firstRecord?.total_marks_maximum || 100
	const passMarks = maxTotal * 0.4 // Assuming 40% pass marks

	// Calculate averages
	const internalMarks = records.filter(r => r.internal_marks_obtained != null).map(r => r.internal_marks_obtained)
	const externalMarks = records.filter(r => r.external_marks_obtained != null).map(r => r.external_marks_obtained)
	const totalMarks = records.filter(r => r.total_marks_obtained != null).map(r => r.total_marks_obtained)
	const percentages = records.filter(r => r.percentage != null).map(r => r.percentage)

	const avgInternal = internalMarks.length > 0
		? internalMarks.reduce((a, b) => a + b, 0) / internalMarks.length
		: 0

	const avgExternal = externalMarks.length > 0
		? externalMarks.reduce((a, b) => a + b, 0) / externalMarks.length
		: 0

	const avgTotal = totalMarks.length > 0
		? totalMarks.reduce((a, b) => a + b, 0) / totalMarks.length
		: 0

	const avgPercentage = percentages.length > 0
		? percentages.reduce((a, b) => a + b, 0) / percentages.length
		: 0

	// Statistics
	const sortedMarks = [...totalMarks].sort((a, b) => a - b)
	const medianMarks = sortedMarks.length > 0
		? sortedMarks[Math.floor(sortedMarks.length / 2)]
		: 0

	// Standard deviation
	const mean = avgTotal
	const squaredDiffs = totalMarks.map(m => Math.pow(m - mean, 2))
	const avgSquaredDiff = squaredDiffs.length > 0
		? squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length
		: 0
	const stdDev = Math.sqrt(avgSquaredDiff)

	// Failure analysis
	const internalPassThreshold = maxInternal * 0.4
	const externalPassThreshold = maxExternal * 0.4

	const failedInternal = failedRecords.filter(r =>
		r.internal_marks_obtained != null &&
		r.internal_marks_obtained < internalPassThreshold &&
		(r.external_marks_obtained == null || r.external_marks_obtained >= externalPassThreshold)
	).length

	const failedExternal = failedRecords.filter(r =>
		r.external_marks_obtained != null &&
		r.external_marks_obtained < externalPassThreshold &&
		(r.internal_marks_obtained == null || r.internal_marks_obtained >= internalPassThreshold)
	).length

	const failedBoth = failedRecords.filter(r =>
		r.internal_marks_obtained != null &&
		r.external_marks_obtained != null &&
		r.internal_marks_obtained < internalPassThreshold &&
		r.external_marks_obtained < externalPassThreshold
	).length

	// Difficulty index (0-1 scale, higher = more difficult)
	const difficultyIndex = totalAppeared > 0
		? 1 - (totalPassed / totalAppeared)
		: 0

	// Pass percentage
	const passPercentage = totalAppeared > 0 ? (totalPassed / totalAppeared) * 100 : 0

	return {
		course_id: course?.id || '',
		course_code: course?.course_code || '',
		course_name: course?.course_name || '',
		course_category: course?.course_category || '',
		credit: course?.credit || 0,
		semester: courseOffering?.semester || 0,
		program_code: program?.program_code || '',
		program_name: program?.program_name || '',

		max_internal_marks: maxInternal,
		max_external_marks: maxExternal,
		max_total_marks: maxTotal,
		pass_marks: passMarks,

		total_students_appeared: totalAppeared,
		total_students_passed: totalPassed,
		total_students_failed: totalFailed,
		total_students_absent: totalAbsent,
		pass_percentage: parseFloat(passPercentage.toFixed(2)),
		fail_percentage: parseFloat(((totalFailed / totalAppeared) * 100).toFixed(2)),
		absent_percentage: parseFloat(((totalAbsent / totalAppeared) * 100).toFixed(2)),

		average_internal_marks: parseFloat(avgInternal.toFixed(2)),
		average_external_marks: parseFloat(avgExternal.toFixed(2)),
		average_total_marks: parseFloat(avgTotal.toFixed(2)),
		average_percentage: parseFloat(avgPercentage.toFixed(2)),
		highest_marks: Math.max(...totalMarks, 0),
		lowest_marks: Math.min(...totalMarks.filter(m => m > 0), 0),
		median_marks: medianMarks,
		standard_deviation: parseFloat(stdDev.toFixed(2)),

		failed_internal: failedInternal,
		failed_external: failedExternal,
		failed_both: failedBoth,
		internal_fail_percentage: totalFailed > 0 ? (failedInternal / totalFailed) * 100 : 0,
		external_fail_percentage: totalFailed > 0 ? (failedExternal / totalFailed) * 100 : 0,

		difficulty_index: parseFloat(difficultyIndex.toFixed(3)),
		discrimination_index: 0 // Would require item-level analysis

	}
}

// Generate improvement suggestions based on failure patterns
function generateImprovementSuggestions(subject: SubjectResultSummary): string[] {
	const suggestions: string[] = []

	if (subject.internal_fail_percentage > 40) {
		suggestions.push('Focus on continuous assessment and regular assignments')
		suggestions.push('Consider more frequent internal tests with feedback')
	}

	if (subject.external_fail_percentage > 40) {
		suggestions.push('Provide more practice with previous year question papers')
		suggestions.push('Organize special classes for exam preparation')
	}

	if (subject.failed_both > subject.total_students_failed * 0.3) {
		suggestions.push('Comprehensive remedial classes needed')
		suggestions.push('Review teaching methodology and course delivery')
	}

	if (subject.average_percentage < 50) {
		suggestions.push('Simplify course content delivery')
		suggestions.push('Use more visual aids and practical examples')
	}

	if (subject.difficulty_index > 0.5) {
		suggestions.push('Consider revising syllabus or assessment criteria')
		suggestions.push('Provide additional study materials and resources')
	}

	return suggestions.length > 0 ? suggestions : ['Monitor performance in next session']
}

// Calculate subject trends across sessions
function calculateSubjectTrends(data: any[]): SubjectTrend[] {
	const trendMap = new Map<string, Map<string, any[]>>()

	data.forEach((record: any) => {
		const courseCode = record.courses?.course_code || 'Unknown'
		const sessionCode = record.examination_sessions?.session_code || 'Unknown'

		if (!trendMap.has(courseCode)) {
			trendMap.set(courseCode, new Map())
		}
		const sessionMap = trendMap.get(courseCode)!
		if (!sessionMap.has(sessionCode)) {
			sessionMap.set(sessionCode, [])
		}
		sessionMap.get(sessionCode)!.push(record)
	})

	const trends: SubjectTrend[] = []

	trendMap.forEach((sessionMap, courseCode) => {
		sessionMap.forEach((records, sessionCode) => {
			const totalAppeared = records.length
			const totalPassed = records.filter(r => r.is_pass === true).length
			const totalMarks = records.filter(r => r.total_marks_obtained != null).map(r => r.total_marks_obtained)
			const avgMarks = totalMarks.length > 0
				? totalMarks.reduce((a, b) => a + b, 0) / totalMarks.length
				: 0

			const examSession = records[0]?.examination_sessions
			const academicYear = examSession?.academic_years

			trends.push({
				academic_year: academicYear?.academic_year || '',
				examination_session: examSession?.session_name || sessionCode,
				course_code: courseCode,
				course_name: records[0]?.courses?.course_name || '',
				total_appeared: totalAppeared,
				total_passed: totalPassed,
				pass_percentage: totalAppeared > 0 ? (totalPassed / totalAppeared) * 100 : 0,
				average_marks: parseFloat(avgMarks.toFixed(2))
			})
		})
	})

	return trends
}

// Calculate internal vs external comparison
function calculateInternalExternalComparison(subjects: SubjectResultSummary[]): InternalExternalComparison[] {
	return subjects.map(s => {
		const internalPct = s.max_internal_marks > 0
			? (s.average_internal_marks / s.max_internal_marks) * 100
			: 0
		const externalPct = s.max_external_marks > 0
			? (s.average_external_marks / s.max_external_marks) * 100
			: 0

		// Simple correlation approximation
		const correlation = Math.abs(internalPct - externalPct) < 20 ? 0.8 : 0.5

		return {
			course_code: s.course_code,
			course_name: s.course_name,
			avg_internal_percentage: parseFloat(internalPct.toFixed(2)),
			avg_external_percentage: parseFloat(externalPct.toFixed(2)),
			correlation: correlation
		}
	})
}

// Calculate heatmap data for visualization
function calculateHeatmapData(data: any[]): SubjectHeatmapData[] {
	const heatmap: SubjectHeatmapData[] = []
	const groupMap = new Map<string, any[]>()

	data.forEach((record: any) => {
		const semester = record.course_offerings?.semester || 0
		const key = `${record.program_code || 'UNK'}-${semester}-${record.courses?.course_code || 'UNK'}`
		if (!groupMap.has(key)) {
			groupMap.set(key, [])
		}
		groupMap.get(key)!.push(record)
	})

	groupMap.forEach((records, key) => {
		const [programCode, semester, courseCode] = key.split('-')
		const totalAppeared = records.length
		const totalPassed = records.filter(r => r.is_pass === true).length
		const passPercentage = totalAppeared > 0 ? (totalPassed / totalAppeared) * 100 : 0

		heatmap.push({
			program_code: programCode,
			semester: parseInt(semester),
			course_code: courseCode,
			pass_percentage: parseFloat(passPercentage.toFixed(2)),
			color_intensity: passPercentage // 0-100 for coloring
		})
	})

	return heatmap
}
