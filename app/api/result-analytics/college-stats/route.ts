import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	ResultAnalyticsFilters,
	CollegeDashboardData,
	CollegeResultSummary,
	CollegeResultTrend,
	GenderWiseResult,
	CategoryWiseResult,
	SemesterWiseResult,
	TopPerformer,
	RecentSessionResult
} from '@/types/result-analytics'

// GET /api/result-analytics/college-stats
// Fetches comprehensive college-wise result analytics
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)

		// Parse filters from query params
		const filters: ResultAnalyticsFilters = {
			institution_id: searchParams.get('institution_id') || undefined,
			institution_code: searchParams.get('institution_code') || undefined,
			academic_year_id: searchParams.get('academic_year_id') || undefined,
			academic_year: searchParams.get('academic_year') || undefined,
			examination_session_id: searchParams.get('examination_session_id') || undefined,
			semester: searchParams.get('semester') ? parseInt(searchParams.get('semester')!) : undefined,
			program_id: searchParams.get('program_id') || undefined,
			batch_id: searchParams.get('batch_id') || undefined,
			regulation_id: searchParams.get('regulation_id') || undefined,
			degree_level: (searchParams.get('degree_level') as ResultAnalyticsFilters['degree_level']) || 'All',
			gender: (searchParams.get('gender') as ResultAnalyticsFilters['gender']) || 'All',
		}

		// Build base query for final_marks
		// Note: Removed nested joins (examination_sessions, programs, degrees) to avoid PostgREST errors
		// program_id has no FK constraint, so we fetch programs separately
		let baseQuery = supabase
			.from('final_marks')
			.select(`
				id,
				student_id,
				program_id,
				program_code,
				course_id,
				examination_session_id,
				internal_marks_obtained,
				external_marks_obtained,
				total_marks_obtained,
				percentage,
				grade_points,
				letter_grade,
				is_pass,
				pass_status,
				result_status,
				institutions_id,
				institutions (
					id,
					institution_code,
					name
				)
			`)
			.eq('result_status', 'Published')
			.eq('is_active', true)

		// Apply filters
		if (filters.institution_id) {
			baseQuery = baseQuery.eq('institutions_id', filters.institution_id)
		}
		if (filters.examination_session_id) {
			baseQuery = baseQuery.eq('examination_session_id', filters.examination_session_id)
		}
		if (filters.program_id) {
			baseQuery = baseQuery.eq('program_id', filters.program_id)
		}
		// Note: semester filter not applied - final_marks doesn't have semester column
		// Semester filtering would need to be done via course_offerings join

		const { data: rawMarksData, error: finalMarksError } = await baseQuery

		if (finalMarksError) {
			console.error('Error fetching final marks:', finalMarksError)
			return NextResponse.json({ error: 'Failed to fetch result data' }, { status: 500 })
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
		// Note: programs table does not exist - use program_code from final_marks directly
		const finalMarksData = (rawMarksData || []).map((mark: any) => ({
			...mark,
			examination_sessions: sessionsMap.get(mark.examination_session_id) || null
		}))

		if (!finalMarksData || finalMarksData.length === 0) {
			return NextResponse.json({
				success: true,
				data: {
					summary: getEmptySummary(),
					trends: [],
					gender_wise: [],
					category_wise: [],
					semester_wise: [],
					top_performers: [],
					recent_sessions: []
				} as CollegeDashboardData,
				filters_applied: filters,
				generated_at: new Date().toISOString()
			})
		}

		// Calculate summary statistics
		const summary = calculateSummary(finalMarksData, filters)

		// Calculate trends (last 5 years/sessions)
		const trends = calculateTrends(finalMarksData)

		// Calculate gender-wise results
		const genderWise = calculateGenderWise(finalMarksData)

		// Calculate category-wise results
		const categoryWise = calculateCategoryWise(finalMarksData)

		// Calculate semester-wise results
		const semesterWise = calculateSemesterWise(finalMarksData)

		// Get top performers
		const topPerformers = await getTopPerformers(supabase, filters)

		// Get recent sessions
		const recentSessions = await getRecentSessions(supabase, filters)

		const dashboardData: CollegeDashboardData = {
			summary,
			trends,
			gender_wise: genderWise,
			category_wise: categoryWise,
			semester_wise: semesterWise,
			top_performers: topPerformers,
			recent_sessions: recentSessions
		}

		return NextResponse.json({
			success: true,
			data: dashboardData,
			filters_applied: filters,
			generated_at: new Date().toISOString()
		})

	} catch (error) {
		console.error('Error in college stats API:', error)
		return NextResponse.json({
			error: 'Internal server error',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 })
	}
}

// Helper function to calculate summary statistics
function calculateSummary(data: any[], filters: ResultAnalyticsFilters): CollegeResultSummary {
	const totalAppeared = data.length
	const passedRecords = data.filter(r => r.is_pass === true)
	const failedRecords = data.filter(r => r.is_pass === false && r.pass_status !== 'Absent')
	const absentRecords = data.filter(r => r.pass_status === 'Absent')

	const totalPassed = passedRecords.length
	const totalFailed = failedRecords.length
	const totalAbsent = absentRecords.length

	// Calculate classification based on percentage
	const distinctionRecords = passedRecords.filter(r => r.percentage >= 75)
	const firstClassRecords = passedRecords.filter(r => r.percentage >= 60 && r.percentage < 75)
	const secondClassRecords = passedRecords.filter(r => r.percentage >= 50 && r.percentage < 60)
	const thirdClassRecords = passedRecords.filter(r => r.percentage >= 40 && r.percentage < 50)
	const passClassRecords = passedRecords.filter(r => r.percentage >= 35 && r.percentage < 40)

	// Calculate averages
	const percentages = data.filter(r => r.percentage != null).map(r => r.percentage)
	const gradePoints = data.filter(r => r.grade_points != null).map(r => r.grade_points)

	const avgPercentage = percentages.length > 0
		? percentages.reduce((a, b) => a + b, 0) / percentages.length
		: 0

	const avgGPA = gradePoints.length > 0
		? gradePoints.reduce((a, b) => a + b, 0) / gradePoints.length
		: 0

	const sortedPercentages = [...percentages].sort((a, b) => a - b)
	const medianPercentage = sortedPercentages.length > 0
		? sortedPercentages[Math.floor(sortedPercentages.length / 2)]
		: 0

	// Get institution info from first record
	const firstRecord = data[0]
	const institution = firstRecord?.institutions
	const examSession = firstRecord?.examination_sessions
	const academicYear = examSession?.academic_years

	return {
		institution_id: institution?.id || '',
		institution_code: institution?.institution_code || '',
		institution_name: institution?.name || '',
		academic_year: academicYear?.academic_year || '',
		examination_session: examSession?.session_name || '',
		examination_session_code: examSession?.session_code || '',

		total_students_appeared: totalAppeared,
		total_students_passed: totalPassed,
		total_students_failed: totalFailed,
		total_students_absent: totalAbsent,
		pass_percentage: totalAppeared > 0 ? (totalPassed / totalAppeared) * 100 : 0,
		fail_percentage: totalAppeared > 0 ? (totalFailed / totalAppeared) * 100 : 0,
		absent_percentage: totalAppeared > 0 ? (totalAbsent / totalAppeared) * 100 : 0,

		distinction_count: distinctionRecords.length,
		first_class_count: firstClassRecords.length,
		second_class_count: secondClassRecords.length,
		third_class_count: thirdClassRecords.length,
		pass_class_count: passClassRecords.length,

		distinction_percentage: totalPassed > 0 ? (distinctionRecords.length / totalPassed) * 100 : 0,
		first_class_percentage: totalPassed > 0 ? (firstClassRecords.length / totalPassed) * 100 : 0,
		second_class_percentage: totalPassed > 0 ? (secondClassRecords.length / totalPassed) * 100 : 0,
		third_class_percentage: totalPassed > 0 ? (thirdClassRecords.length / totalPassed) * 100 : 0,
		pass_class_percentage: totalPassed > 0 ? (passClassRecords.length / totalPassed) * 100 : 0,

		average_percentage: parseFloat(avgPercentage.toFixed(2)),
		average_gpa: parseFloat(avgGPA.toFixed(2)),
		average_cgpa: parseFloat(avgGPA.toFixed(2)), // Using GPA as CGPA approximation
		highest_percentage: Math.max(...percentages, 0),
		lowest_percentage: Math.min(...percentages.filter(p => p > 0), 0),
		median_percentage: medianPercentage,

		total_backlogs: failedRecords.length,
		students_with_backlogs: new Set(failedRecords.map(r => r.student_id)).size,
		backlog_percentage: totalAppeared > 0 ? (failedRecords.length / totalAppeared) * 100 : 0,
		cleared_backlogs: 0, // Would need student_backlogs query
		pending_backlogs: failedRecords.length
	}
}

// Helper function to calculate trends
function calculateTrends(data: any[]): CollegeResultTrend[] {
	const sessionMap = new Map<string, any[]>()

	data.forEach(record => {
		const sessionKey = record.examination_sessions?.session_code || 'Unknown'
		if (!sessionMap.has(sessionKey)) {
			sessionMap.set(sessionKey, [])
		}
		sessionMap.get(sessionKey)!.push(record)
	})

	const trends: CollegeResultTrend[] = []

	sessionMap.forEach((records, sessionCode) => {
		const totalAppeared = records.length
		const totalPassed = records.filter(r => r.is_pass === true).length
		const percentages = records.filter(r => r.percentage != null).map(r => r.percentage)
		const avgPercentage = percentages.length > 0
			? percentages.reduce((a, b) => a + b, 0) / percentages.length
			: 0

		const distinctionCount = records.filter(r => r.is_pass && r.percentage >= 75).length
		const firstClassCount = records.filter(r => r.is_pass && r.percentage >= 60 && r.percentage < 75).length

		const examSession = records[0]?.examination_sessions
		const academicYear = examSession?.academic_years

		trends.push({
			academic_year: academicYear?.academic_year || '',
			examination_session: examSession?.session_name || sessionCode,
			total_appeared: totalAppeared,
			total_passed: totalPassed,
			pass_percentage: totalAppeared > 0 ? (totalPassed / totalAppeared) * 100 : 0,
			average_percentage: parseFloat(avgPercentage.toFixed(2)),
			distinction_count: distinctionCount,
			first_class_count: firstClassCount
		})
	})

	return trends.slice(-5) // Return last 5 sessions
}

// Helper function to calculate gender-wise results
// Note: Gender data not available from users table, would need separate students query
function calculateGenderWise(data: any[]): GenderWiseResult[] {
	// Since final_marks references users (not students), gender is not available
	// Return aggregate data grouped as "All" since we can't determine gender
	const totalAppeared = data.length
	const passedRecords = data.filter(r => r.is_pass === true)
	const totalPassed = passedRecords.length
	const totalFailed = data.filter(r => r.is_pass === false).length

	const percentages = data.filter(r => r.percentage != null).map(r => r.percentage)
	const avgPercentage = percentages.length > 0
		? percentages.reduce((a, b) => a + b, 0) / percentages.length
		: 0

	return [{
		gender: 'All',
		total_appeared: totalAppeared,
		total_passed: totalPassed,
		total_failed: totalFailed,
		pass_percentage: totalAppeared > 0 ? (totalPassed / totalAppeared) * 100 : 0,
		average_percentage: parseFloat(avgPercentage.toFixed(2)),
		distinction_count: passedRecords.filter(r => r.percentage >= 75).length,
		first_class_count: passedRecords.filter(r => r.percentage >= 60 && r.percentage < 75).length
	}]
}

// Helper function to calculate category-wise results
// Note: Category data not available from users table, would need separate students query
function calculateCategoryWise(data: any[]): CategoryWiseResult[] {
	// Since final_marks references users (not students), category is not available
	// Return aggregate data grouped as "All" since we can't determine category
	const totalAppeared = data.length
	const totalPassed = data.filter(r => r.is_pass === true).length
	const totalFailed = data.filter(r => r.is_pass === false).length

	const percentages = data.filter(r => r.percentage != null).map(r => r.percentage)
	const avgPercentage = percentages.length > 0
		? percentages.reduce((a, b) => a + b, 0) / percentages.length
		: 0

	return [{
		category: 'All',
		total_appeared: totalAppeared,
		total_passed: totalPassed,
		total_failed: totalFailed,
		pass_percentage: totalAppeared > 0 ? (totalPassed / totalAppeared) * 100 : 0,
		average_percentage: parseFloat(avgPercentage.toFixed(2))
	}]
}

// Helper function to calculate semester-wise results
function calculateSemesterWise(data: any[]): SemesterWiseResult[] {
	const semesterMap = new Map<number, any[]>()

	data.forEach(record => {
		const semester = record.semester || 0
		if (!semesterMap.has(semester)) {
			semesterMap.set(semester, [])
		}
		semesterMap.get(semester)!.push(record)
	})

	const results: SemesterWiseResult[] = []

	semesterMap.forEach((records, semester) => {
		const totalAppeared = records.length
		const totalPassed = records.filter(r => r.is_pass === true).length
		const failedCount = records.filter(r => r.is_pass === false).length

		const gradePoints = records.filter(r => r.grade_points != null).map(r => r.grade_points)
		const avgGPA = gradePoints.length > 0
			? gradePoints.reduce((a, b) => a + b, 0) / gradePoints.length
			: 0

		results.push({
			semester,
			semester_name: `Semester ${semester}`,
			total_appeared: totalAppeared,
			total_passed: totalPassed,
			pass_percentage: totalAppeared > 0 ? (totalPassed / totalAppeared) * 100 : 0,
			average_gpa: parseFloat(avgGPA.toFixed(2)),
			backlogs_count: failedCount
		})
	})

	return results.sort((a, b) => a.semester - b.semester)
}

// Helper function to get top performers
async function getTopPerformers(supabase: any, filters: ResultAnalyticsFilters): Promise<TopPerformer[]> {
	// Note: semester_results.student_id has NO FK to students table
	// We must fetch semester_results and students separately
	let query = supabase
		.from('semester_results')
		.select(`
			id,
			student_id,
			program_id,
			program_code,
			register_number,
			semester,
			sgpa,
			cgpa,
			percentage
		`)
		.eq('is_active', true)
		.not('cgpa', 'is', null)
		.order('cgpa', { ascending: false })
		.limit(10)

	if (filters.institution_id) {
		query = query.eq('institutions_id', filters.institution_id)
	}
	if (filters.examination_session_id) {
		query = query.eq('examination_session_id', filters.examination_session_id)
	}

	const { data, error } = await query

	if (error) {
		console.error('Error fetching top performers:', error)
		return []
	}

	if (!data || data.length === 0) {
		return []
	}

	// Fetch students separately (no FK constraint on student_id)
	const studentIds = [...new Set(data.map((r: any) => r.student_id).filter(Boolean))]
	let studentsMap = new Map<string, any>()

	if (studentIds.length > 0) {
		const { data: studentsData } = await supabase
			.from('students')
			.select('id, first_name, last_name, roll_number')
			.in('id', studentIds)

		studentsData?.forEach((s: any) => studentsMap.set(s.id, s))
	}

	return data.map((record: any, index: number) => {
		const student = studentsMap.get(record.student_id)
		return {
			student_id: record.student_id,
			register_number: record.register_number || student?.roll_number || '',
			student_name: student
				? `${student.first_name || ''} ${student.last_name || ''}`.trim()
				: '',
			program_name: record.program_code || '',
			semester: record.semester,
			cgpa: record.cgpa || 0,
			percentage: record.percentage || 0,
			rank: index + 1
		}
	})
}

// Helper function to get recent sessions
async function getRecentSessions(supabase: any, filters: ResultAnalyticsFilters): Promise<RecentSessionResult[]> {
	let query = supabase
		.from('examination_sessions')
		.select(`
			id,
			session_code,
			session_name,
			exam_start_date,
			session_status
		`)
		.order('exam_start_date', { ascending: false })
		.limit(5)

	if (filters.institution_id) {
		query = query.eq('institutions_id', filters.institution_id)
	}

	const { data: sessions, error: sessionsError } = await query

	if (sessionsError) {
		console.error('Error fetching recent sessions:', sessionsError)
		return []
	}

	// Get student counts and pass percentages for each session
	const results: RecentSessionResult[] = []

	for (const session of sessions || []) {
		const { count: totalCount } = await supabase
			.from('final_marks')
			.select('id', { count: 'exact', head: true })
			.eq('examination_session_id', session.id)
			.eq('result_status', 'Published')

		const { count: passedCount } = await supabase
			.from('final_marks')
			.select('id', { count: 'exact', head: true })
			.eq('examination_session_id', session.id)
			.eq('result_status', 'Published')
			.eq('is_pass', true)

		const totalStudents = totalCount || 0
		const passPercentage = totalStudents > 0 ? ((passedCount || 0) / totalStudents) * 100 : 0

		results.push({
			examination_session_id: session.id,
			session_code: session.session_code,
			session_name: session.session_name,
			exam_date: session.exam_start_date,
			total_students: totalStudents,
			pass_percentage: parseFloat(passPercentage.toFixed(2)),
			status: session.session_status === 'Completed' ? 'Published' : session.session_status === 'Active' ? 'Processing' : 'Pending'
		})
	}

	return results
}

// Helper function to return empty summary
function getEmptySummary(): CollegeResultSummary {
	return {
		institution_id: '',
		institution_code: '',
		institution_name: '',
		academic_year: '',
		examination_session: '',
		examination_session_code: '',
		total_students_appeared: 0,
		total_students_passed: 0,
		total_students_failed: 0,
		total_students_absent: 0,
		pass_percentage: 0,
		fail_percentage: 0,
		absent_percentage: 0,
		distinction_count: 0,
		first_class_count: 0,
		second_class_count: 0,
		third_class_count: 0,
		pass_class_count: 0,
		distinction_percentage: 0,
		first_class_percentage: 0,
		second_class_percentage: 0,
		third_class_percentage: 0,
		pass_class_percentage: 0,
		average_percentage: 0,
		average_gpa: 0,
		average_cgpa: 0,
		highest_percentage: 0,
		lowest_percentage: 0,
		median_percentage: 0,
		total_backlogs: 0,
		students_with_backlogs: 0,
		backlog_percentage: 0,
		cleared_backlogs: 0,
		pending_backlogs: 0
	}
}
