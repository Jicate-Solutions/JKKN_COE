import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	ResultAnalyticsFilters,
	ProgramAnalysisDashboardData,
	ProgramResultSummary,
	ProgramTrend,
	WeakProgram,
	ProgramComparisonData,
	DegreeLevelSummary
} from '@/types/result-analytics'

// GET /api/result-analytics/program-stats
// Fetches program-wise result analytics
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)

		// Parse filters
		const filters: ResultAnalyticsFilters = {
			institution_id: searchParams.get('institution_id') || undefined,
			academic_year_id: searchParams.get('academic_year_id') || undefined,
			examination_session_id: searchParams.get('examination_session_id') || undefined,
			degree_level: (searchParams.get('degree_level') as ResultAnalyticsFilters['degree_level']) || 'All',
			semester: searchParams.get('semester') ? parseInt(searchParams.get('semester')!) : undefined,
		}

		// Build query for final_marks grouped by program
		// Note: programs table does not exist - use program_code stored on final_marks
		let query = supabase
			.from('final_marks')
			.select(`
				id,
				student_id,
				program_id,
				program_code,
				examination_session_id,
				course_offering_id,
				percentage,
				grade_points,
				is_pass,
				pass_status,
				institutions_id
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

		const { data: rawMarksData, error } = await query.range(0, 9999)

		if (error) {
			console.error('Error fetching program stats:', error)
			return NextResponse.json({ error: 'Failed to fetch program data' }, { status: 500 })
		}

		if (!rawMarksData || rawMarksData.length === 0) {
			return NextResponse.json({
				success: true,
				data: {
					programs: [],
					trends: [],
					weak_programs: [],
					top_programs: [],
					comparison_chart_data: [],
					degree_level_summary: []
				} as ProgramAnalysisDashboardData,
				filters_applied: filters,
				generated_at: new Date().toISOString()
			})
		}

		// Fetch examination sessions separately to avoid nested join issues
		const sessionIds = [...new Set(rawMarksData.map((m: any) => m.examination_session_id).filter(Boolean))]
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
		const finalMarksData = rawMarksData.map((mark: any) => ({
			...mark,
			examination_sessions: sessionsMap.get(mark.examination_session_id) || null
		}))

		const filteredData = finalMarksData

		// Group by program_code (since programs table doesn't exist)
		const programMap = new Map<string, any[]>()
		filteredData.forEach((record: any) => {
			const key = record.program_code || record.program_id || 'Unknown'
			if (!programMap.has(key)) {
				programMap.set(key, [])
			}
			programMap.get(key)!.push(record)
		})

		// Calculate program summaries
		const programs: ProgramResultSummary[] = []
		const collegeAvg = calculateCollegeAverage(filteredData)

		programMap.forEach((records, programId) => {
			const summary = calculateProgramSummary(records, collegeAvg)
			programs.push(summary)
		})

		// Sort by pass percentage descending
		programs.sort((a, b) => b.pass_percentage - a.pass_percentage)

		// Identify weak programs (below college average by more than 10%)
		const weakPrograms = identifyWeakPrograms(programs, collegeAvg)

		// Get top programs (top 5 by pass percentage)
		const topPrograms = programs.slice(0, 5)

		// Calculate trends
		const trends = calculateProgramTrends(filteredData)

		// Prepare comparison chart data
		const comparisonData: ProgramComparisonData[] = programs.map(p => ({
			program_code: p.program_code,
			program_name: p.program_name,
			pass_percentage: p.pass_percentage,
			average_cgpa: p.average_cgpa,
			total_students: p.total_students_appeared,
			backlogs_count: p.total_backlogs
		}))

		// Calculate degree level summary
		const degreeLevelSummary = calculateDegreeLevelSummary(programs)

		const dashboardData: ProgramAnalysisDashboardData = {
			programs,
			trends,
			weak_programs: weakPrograms,
			top_programs: topPrograms,
			comparison_chart_data: comparisonData,
			degree_level_summary: degreeLevelSummary
		}

		return NextResponse.json({
			success: true,
			data: dashboardData,
			filters_applied: filters,
			generated_at: new Date().toISOString()
		})

	} catch (error) {
		console.error('Error in program stats API:', error)
		return NextResponse.json({
			error: 'Internal server error',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 })
	}
}

// Calculate college-wide average pass percentage
function calculateCollegeAverage(data: any[]): number {
	const totalAppeared = data.length
	const totalPassed = data.filter(r => r.is_pass === true).length
	return totalAppeared > 0 ? (totalPassed / totalAppeared) * 100 : 0
}

// Calculate summary for a single program
function calculateProgramSummary(records: any[], collegeAvg: number): ProgramResultSummary {
	const firstRecord = records[0]
	const programCode = firstRecord?.program_code || 'Unknown'

	const totalAppeared = records.length
	const passedRecords = records.filter(r => r.is_pass === true)
	const failedRecords = records.filter(r => r.is_pass === false)
	const totalPassed = passedRecords.length
	const totalFailed = failedRecords.length

	// Calculate classification
	const distinctionCount = passedRecords.filter(r => r.percentage >= 75).length
	const firstClassCount = passedRecords.filter(r => r.percentage >= 60 && r.percentage < 75).length
	const secondClassCount = passedRecords.filter(r => r.percentage >= 50 && r.percentage < 60).length
	const passClassCount = passedRecords.filter(r => r.percentage >= 35 && r.percentage < 50).length

	// Calculate averages
	const percentages = records.filter(r => r.percentage != null).map(r => r.percentage)
	const gradePoints = records.filter(r => r.grade_points != null).map(r => r.grade_points)

	const avgPercentage = percentages.length > 0
		? percentages.reduce((a, b) => a + b, 0) / percentages.length
		: 0

	const avgCGPA = gradePoints.length > 0
		? gradePoints.reduce((a, b) => a + b, 0) / gradePoints.length
		: 0

	const passPercentage = totalAppeared > 0 ? (totalPassed / totalAppeared) * 100 : 0

	// Unique students with backlogs
	const studentsWithBacklogs = new Set(failedRecords.map(r => r.student_id)).size

	return {
		program_id: firstRecord?.program_id || '',
		program_code: programCode,
		program_name: programCode, // programs table doesn't exist; use code as name
		degree_code: '',
		degree_name: '',
		degree_level: '',
		department_code: '',
		department_name: '',
		regulation_code: '',

		total_students_appeared: totalAppeared,
		total_students_passed: totalPassed,
		total_students_failed: totalFailed,
		pass_percentage: parseFloat(passPercentage.toFixed(2)),
		fail_percentage: parseFloat(((totalFailed / totalAppeared) * 100).toFixed(2)),

		distinction_count: distinctionCount,
		first_class_count: firstClassCount,
		second_class_count: secondClassCount,
		pass_class_count: passClassCount,
		fail_count: totalFailed,

		average_percentage: parseFloat(avgPercentage.toFixed(2)),
		average_cgpa: parseFloat(avgCGPA.toFixed(2)),
		highest_cgpa: Math.max(...gradePoints, 0),
		lowest_cgpa: gradePoints.filter(g => g > 0).length > 0 ? Math.min(...gradePoints.filter(g => g > 0)) : 0,

		total_backlogs: totalFailed,
		students_with_backlogs: studentsWithBacklogs,
		avg_backlogs_per_student: studentsWithBacklogs > 0 ? totalFailed / studentsWithBacklogs : 0,

		is_above_college_average: passPercentage >= collegeAvg,
		variance_from_average: parseFloat((passPercentage - collegeAvg).toFixed(2))
	}
}

// Identify weak programs
function identifyWeakPrograms(programs: ProgramResultSummary[], collegeAvg: number): WeakProgram[] {
	const threshold = collegeAvg - 10 // 10% below average is considered weak

	return programs
		.filter(p => p.pass_percentage < threshold)
		.map(p => ({
			program_id: p.program_id,
			program_code: p.program_code,
			program_name: p.program_name,
			pass_percentage: p.pass_percentage,
			college_average: parseFloat(collegeAvg.toFixed(2)),
			variance: p.variance_from_average,
			total_backlogs: p.total_backlogs,
			critical_subjects: [], // Would need subject-level analysis
			recommendation: generateRecommendation(p, collegeAvg)
		}))
}

// Generate recommendation for weak programs
function generateRecommendation(program: ProgramResultSummary, collegeAvg: number): string {
	if (program.pass_percentage < collegeAvg - 20) {
		return 'Urgent: Comprehensive review and remedial classes required'
	} else if (program.pass_percentage < collegeAvg - 10) {
		return 'Attention needed: Additional tutorials and focused teaching recommended'
	} else {
		return 'Monitor: Track performance in upcoming sessions'
	}
}

// Calculate program trends
function calculateProgramTrends(data: any[]): ProgramTrend[] {
	const trendMap = new Map<string, Map<string, any[]>>()

	data.forEach(record => {
		const programCode = record.program_code || 'Unknown'
		const academicYear = record.examination_sessions?.academic_years?.academic_year || 'Unknown'

		if (!trendMap.has(programCode)) {
			trendMap.set(programCode, new Map())
		}
		const yearMap = trendMap.get(programCode)!
		if (!yearMap.has(academicYear)) {
			yearMap.set(academicYear, [])
		}
		yearMap.get(academicYear)!.push(record)
	})

	const trends: ProgramTrend[] = []

	trendMap.forEach((yearMap, programCode) => {
		yearMap.forEach((records, academicYear) => {
			const totalAppeared = records.length
			const totalPassed = records.filter(r => r.is_pass === true).length
			const gradePoints = records.filter(r => r.grade_points != null).map(r => r.grade_points)
			const avgCGPA = gradePoints.length > 0
				? gradePoints.reduce((a, b) => a + b, 0) / gradePoints.length
				: 0

			trends.push({
				academic_year: academicYear,
				program_code: programCode,
				program_name: programCode,
				total_appeared: totalAppeared,
				total_passed: totalPassed,
				pass_percentage: totalAppeared > 0 ? (totalPassed / totalAppeared) * 100 : 0,
				average_cgpa: parseFloat(avgCGPA.toFixed(2))
			})
		})
	})

	return trends
}

// Calculate degree level summary
function calculateDegreeLevelSummary(programs: ProgramResultSummary[]): DegreeLevelSummary[] {
	const levelMap = new Map<string, ProgramResultSummary[]>()

	programs.forEach(p => {
		// Use degree_name as level since degree_level column doesn't exist
		const level = p.degree_name || 'Unknown'
		if (!levelMap.has(level)) {
			levelMap.set(level, [])
		}
		levelMap.get(level)!.push(p)
	})

	const summaries: DegreeLevelSummary[] = []

	levelMap.forEach((progs, level) => {
		const totalStudents = progs.reduce((sum, p) => sum + p.total_students_appeared, 0)
		const totalPassed = progs.reduce((sum, p) => sum + p.total_students_passed, 0)
		const avgCGPA = progs.reduce((sum, p) => sum + p.average_cgpa, 0) / progs.length

		summaries.push({
			degree_level: level,
			total_programs: progs.length,
			total_students: totalStudents,
			average_pass_percentage: totalStudents > 0 ? (totalPassed / totalStudents) * 100 : 0,
			average_cgpa: parseFloat(avgCGPA.toFixed(2))
		})
	})

	return summaries
}
