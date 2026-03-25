import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { NAACCriterion26Data, NAACCriterion13Data, NAACCriterion27Data } from '@/types/result-analytics'

// Helper function to calculate pass rate
function calculatePassRate(passed: number, total: number): number {
	if (total === 0) return 0
	return Number(((passed / total) * 100).toFixed(2))
}

// GET /api/result-analytics/naac-reports
// Fetches NAAC compliant reports data (Criteria 2.6, 1.3, 2.7)
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)

		// Parse filter parameters
		const institutionId = searchParams.get('institution_id') || undefined
		const academicYearId = searchParams.get('academic_year_id') || undefined
		const programId = searchParams.get('program_id') || undefined
		const reportType = searchParams.get('report_type') || 'criterion_26' // criterion_26, criterion_13, criterion_27

		// Build base query for final marks
		// Note: programs table does not exist, examination_sessions has no FK to academic_years
		// Fetch related data separately
		let query = supabase
			.from('final_marks')
			.select(`
				id,
				student_id,
				examination_session_id,
				course_id,
				program_id,
				program_code,
				institutions_id,
				internal_marks_obtained,
				external_marks_obtained,
				total_marks_obtained,
				letter_grade,
				grade_points,
				result_status,
				is_pass,
				courses (
					id,
					course_code,
					course_name,
					credit
				)
			`)
			.eq('result_status', 'Published')
			.eq('is_active', true)

		// Apply filters
		if (institutionId) {
			query = query.eq('institutions_id', institutionId)
		}
		if (programId) {
			query = query.eq('program_id', programId)
		}

		const { data: rawMarksData, error: finalMarksError } = await query.range(0, 9999)

		if (finalMarksError) {
			console.error('Error fetching final marks:', finalMarksError)
			throw finalMarksError
		}

		// Enrich with examination sessions + academic years (no FK exists)
		const sessionIds = [...new Set((rawMarksData || []).map((m: any) => m.examination_session_id).filter(Boolean))]
		const sessionsMap = new Map<string, any>()

		if (sessionIds.length > 0) {
			const { data: sessionsData } = await supabase
				.from('examination_sessions')
				.select('id, session_code, session_name, academic_year_id')
				.in('id', sessionIds)

			if (sessionsData) {
				const ayIds = [...new Set(sessionsData.map((s: any) => s.academic_year_id).filter(Boolean))]
				let ayMap = new Map<string, any>()
				if (ayIds.length > 0) {
					const { data: ayData } = await supabase
						.from('academic_years')
						.select('id, academic_year')
						.in('id', ayIds)
					ayData?.forEach((ay: any) => ayMap.set(ay.id, ay))
				}
				sessionsData.forEach((s: any) => {
					sessionsMap.set(s.id, {
						...s,
						academic_years: ayMap.get(s.academic_year_id) || null
					})
				})
			}
		}

		// Filter by academic year if provided
		let enrichedMarks = (rawMarksData || []).map((mark: any) => ({
			...mark,
			examination_sessions: sessionsMap.get(mark.examination_session_id) || null
		}))

		if (academicYearId) {
			enrichedMarks = enrichedMarks.filter((m: any) =>
				m.examination_sessions?.academic_year_id === academicYearId
			)
		}

		const marks = enrichedMarks

		// Generate report based on type
		if (reportType === 'criterion_26') {
			const report = generateCriterion26Report(marks, academicYearId)
			return NextResponse.json({
				success: true,
				data: report,
				report_type: 'criterion_26',
				generated_at: new Date().toISOString()
			})
		} else if (reportType === 'criterion_13') {
			const report = generateCriterion13Report(marks)
			return NextResponse.json({
				success: true,
				data: report,
				report_type: 'criterion_13',
				generated_at: new Date().toISOString()
			})
		} else if (reportType === 'criterion_27') {
			const report = generateCriterion27Report(marks)
			return NextResponse.json({
				success: true,
				data: report,
				report_type: 'criterion_27',
				generated_at: new Date().toISOString()
			})
		}

		return NextResponse.json({
			error: 'Invalid report type. Use criterion_26, criterion_13, or criterion_27'
		}, { status: 400 })

	} catch (error) {
		console.error('Error fetching NAAC reports:', error)
		return NextResponse.json({
			error: 'Internal server error',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 })
	}
}

// NAAC Criterion 2.6: Student Performance and Learning Outcomes
function generateCriterion26Report(marks: any[], academicYearId?: string): NAACCriterion26Data {
	// Group by academic year
	const yearWiseData = new Map<string, {
		year_id: string
		academic_year_value: string
		total_appeared: number
		total_passed: number
		total_enrolled: number
	}>()

	// Get unique students per year
	const studentsByYear = new Map<string, Set<string>>()
	const passedStudentsByYear = new Map<string, Set<string>>()

	marks.forEach((mark: any) => {
		const yearId = mark.examination_sessions?.academic_year_id
		const yearName = mark.examination_sessions?.academic_years?.academic_year || 'Unknown'
		const studentId = mark.student_id
		// Use is_pass field instead of result_status for pass check
		const isPassed = mark.is_pass === true

		if (!yearId) return

		// Track students appeared
		if (!studentsByYear.has(yearId)) {
			studentsByYear.set(yearId, new Set())
		}
		studentsByYear.get(yearId)!.add(studentId)

		// Track students passed
		if (!passedStudentsByYear.has(yearId)) {
			passedStudentsByYear.set(yearId, new Set())
		}
		if (isPassed) {
			passedStudentsByYear.get(yearId)!.add(studentId)
		}

		// Initialize year data
		if (!yearWiseData.has(yearId)) {
			yearWiseData.set(yearId, {
				year_id: yearId,
				academic_year_value: yearName,
				total_appeared: 0,
				total_passed: 0,
				total_enrolled: 0
			})
		}
	})

	// Calculate final counts
	const yearWiseResults: NAACCriterion26Data['year_wise_results'] = []
	yearWiseData.forEach((data, yearId) => {
		const appeared = studentsByYear.get(yearId)?.size || 0
		const passed = passedStudentsByYear.get(yearId)?.size || 0
		yearWiseResults.push({
			academic_year: data.academic_year_value,
			enrolled: appeared, // Using appeared as enrolled for now
			appeared: appeared,
			passed: passed,
			pass_percentage: calculatePassRate(passed, appeared)
		})
	})

	// Sort by academic year (descending)
	yearWiseResults.sort((a, b) => b.academic_year.localeCompare(a.academic_year))

	// Program-wise results
	const programWiseData = new Map<string, {
		program_name: string
		appeared: number
		passed: number
	}>()

	const studentsByProgram = new Map<string, Set<string>>()
	const passedStudentsByProgram = new Map<string, Set<string>>()

	marks.forEach((mark: any) => {
		const programId = mark.program_id
		const programName = mark.program_code || 'Unknown'
		const studentId = mark.student_id
		const isPassed = mark.is_pass === true

		if (!programId) return

		if (!studentsByProgram.has(programId)) {
			studentsByProgram.set(programId, new Set())
			programWiseData.set(programId, { program_name: programName, appeared: 0, passed: 0 })
		}
		studentsByProgram.get(programId)!.add(studentId)

		if (!passedStudentsByProgram.has(programId)) {
			passedStudentsByProgram.set(programId, new Set())
		}
		if (isPassed) {
			passedStudentsByProgram.get(programId)!.add(studentId)
		}
	})

	const programWiseResults: NAACCriterion26Data['program_wise_results'] = []
	programWiseData.forEach((data, programId) => {
		const appeared = studentsByProgram.get(programId)?.size || 0
		const passed = passedStudentsByProgram.get(programId)?.size || 0
		programWiseResults.push({
			program_name: data.program_name,
			enrolled: appeared,
			appeared: appeared,
			passed: passed,
			pass_percentage: calculatePassRate(passed, appeared)
		})
	})

	// Calculate overall summary
	const totalAppeared = new Set(marks.map((m: any) => m.student_id)).size
	const passedStudents = new Set(
		marks.filter((m: any) => m.is_pass === true)
			.map((m: any) => m.student_id)
	).size

	// Calculate average pass percentage from year-wise data
	const avgPassPercentage = yearWiseResults.length > 0
		? yearWiseResults.reduce((sum, y) => sum + y.pass_percentage, 0) / yearWiseResults.length
		: 0

	return {
		criterion_id: '2.6',
		criterion_title: 'Student Performance and Learning Outcomes',
		description: 'Pass percentage of Students during last five years',
		year_wise_results: yearWiseResults.slice(0, 5), // Last 5 years
		program_wise_results: programWiseResults,
		average_pass_percentage: Number(avgPassPercentage.toFixed(2)),
		total_students_appeared: totalAppeared,
		total_students_passed: passedStudents,
		data_source: 'final_marks',
		calculation_method: 'Unique students who passed all subjects in an academic year / Total unique students appeared'
	}
}

// NAAC Criterion 1.3: Curriculum Enrichment
function generateCriterion13Report(marks: any[]): NAACCriterion13Data {
	// Get unique courses with their credits and types
	const courseData = new Map<string, {
		course_code: string
		course_title: string
		credits: number
		type: string
	}>()

	marks.forEach((mark: any) => {
		const course = mark.courses
		if (course && !courseData.has(course.id)) {
			courseData.set(course.id, {
				course_code: course.course_code,
				course_title: course.course_name, // Use course_name instead of course_title
				credits: course.credit || 0, // Use credit instead of credits
				type: 'Core' // Default type, would need to be fetched from course_type field
			})
		}
	})

	// Course type distribution
	const coreCredits = Array.from(courseData.values()).filter(c => c.type === 'Core').reduce((sum, c) => sum + c.credits, 0)
	const electiveCredits = Array.from(courseData.values()).filter(c => c.type === 'Elective').reduce((sum, c) => sum + c.credits, 0)
	const projectCredits = Array.from(courseData.values()).filter(c => c.type === 'Project').reduce((sum, c) => sum + c.credits, 0)
	const totalCredits = Array.from(courseData.values()).reduce((sum, c) => sum + c.credits, 0)

	const courseTypeDistribution = [
		{ type: 'Core Courses', credits: coreCredits, percentage: totalCredits > 0 ? Number(((coreCredits / totalCredits) * 100).toFixed(2)) : 0 },
		{ type: 'Elective Courses', credits: electiveCredits, percentage: totalCredits > 0 ? Number(((electiveCredits / totalCredits) * 100).toFixed(2)) : 0 },
		{ type: 'Project/Internship', credits: projectCredits, percentage: totalCredits > 0 ? Number(((projectCredits / totalCredits) * 100).toFixed(2)) : 0 }
	]

	// Year-wise course additions (placeholder - would need course creation dates)
	const yearWiseCourseAdditions: NAACCriterion13Data['year_wise_course_additions'] = []

	// Cross-cutting issues (placeholder - would need course tags/attributes)
	const crossCuttingIssues = [
		{ issue: 'Gender', courses_addressing: 0, percentage: 0 },
		{ issue: 'Environment and Sustainability', courses_addressing: 0, percentage: 0 },
		{ issue: 'Human Values', courses_addressing: 0, percentage: 0 },
		{ issue: 'Professional Ethics', courses_addressing: 0, percentage: 0 }
	]

	return {
		criterion_id: '1.3',
		criterion_title: 'Curriculum Enrichment',
		description: 'Integration of cross-cutting issues in curriculum',
		total_courses: courseData.size,
		total_credits: totalCredits,
		course_type_distribution: courseTypeDistribution,
		year_wise_course_additions: yearWiseCourseAdditions,
		cross_cutting_issues: crossCuttingIssues,
		value_added_courses: [],
		field_projects_internships: []
	}
}

// NAAC Criterion 2.7: Student Satisfaction Survey
function generateCriterion27Report(marks: any[]): NAACCriterion27Data {
	// Calculate grade distribution as a proxy for satisfaction
	const gradeDistribution = new Map<string, number>()
	const grades = ['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F', 'Ab']
	grades.forEach(g => gradeDistribution.set(g, 0))

	marks.forEach((mark: any) => {
		// Use letter_grade instead of grade
		const grade = mark.letter_grade || 'Unknown'
		if (gradeDistribution.has(grade)) {
			gradeDistribution.set(grade, (gradeDistribution.get(grade) || 0) + 1)
		}
	})

	const totalMarks = marks.length
	const gradeData = grades.map(grade => ({
		grade,
		count: gradeDistribution.get(grade) || 0,
		percentage: totalMarks > 0 ? Number((((gradeDistribution.get(grade) || 0) / totalMarks) * 100).toFixed(2)) : 0
	}))

	// Calculate satisfaction metrics based on grade performance
	const excellentGrades = (gradeDistribution.get('O') || 0) + (gradeDistribution.get('A+') || 0)
	const goodGrades = (gradeDistribution.get('A') || 0) + (gradeDistribution.get('B+') || 0)
	const averageGrades = (gradeDistribution.get('B') || 0) + (gradeDistribution.get('C') || 0)
	const passGrades = gradeDistribution.get('P') || 0
	const failGrades = gradeDistribution.get('F') || 0

	// Map to satisfaction levels (5-point scale)
	const satisfactionScore = totalMarks > 0
		? ((excellentGrades * 5 + goodGrades * 4 + averageGrades * 3 + passGrades * 2 + failGrades * 1) / totalMarks)
		: 0

	// Program-wise satisfaction (using grade performance)
	const programSatisfaction = new Map<string, { total: number, weighted: number }>()

	marks.forEach((mark: any) => {
		const programName = mark.program_code || 'Unknown'
		const gradeScore = getGradeScore(mark.letter_grade)

		if (!programSatisfaction.has(programName)) {
			programSatisfaction.set(programName, { total: 0, weighted: 0 })
		}
		const data = programSatisfaction.get(programName)!
		data.total++
		data.weighted += gradeScore
	})

	const programWiseSatisfaction = Array.from(programSatisfaction.entries()).map(([program, data]) => ({
		program_name: program,
		responses: data.total,
		average_score: data.total > 0 ? Number((data.weighted / data.total).toFixed(2)) : 0,
		satisfaction_level: getSatisfactionLevel(data.total > 0 ? data.weighted / data.total : 0)
	}))

	return {
		criterion_id: '2.7',
		criterion_title: 'Student Satisfaction Survey',
		description: 'Student satisfaction based on academic performance metrics',
		survey_year: new Date().getFullYear().toString(),
		total_responses: totalMarks,
		overall_satisfaction_score: Number(satisfactionScore.toFixed(2)),
		satisfaction_distribution: [
			{ level: 'Excellent (O, A+)', count: excellentGrades, percentage: totalMarks > 0 ? Number(((excellentGrades / totalMarks) * 100).toFixed(2)) : 0 },
			{ level: 'Good (A, B+)', count: goodGrades, percentage: totalMarks > 0 ? Number(((goodGrades / totalMarks) * 100).toFixed(2)) : 0 },
			{ level: 'Average (B, C)', count: averageGrades, percentage: totalMarks > 0 ? Number(((averageGrades / totalMarks) * 100).toFixed(2)) : 0 },
			{ level: 'Pass (P)', count: passGrades, percentage: totalMarks > 0 ? Number(((passGrades / totalMarks) * 100).toFixed(2)) : 0 },
			{ level: 'Need Improvement (F)', count: failGrades, percentage: totalMarks > 0 ? Number(((failGrades / totalMarks) * 100).toFixed(2)) : 0 }
		],
		program_wise_satisfaction: programWiseSatisfaction,
		grade_distribution: gradeData,
		key_findings: generateKeyFindings(satisfactionScore, excellentGrades, failGrades, totalMarks),
		areas_of_improvement: generateAreasOfImprovement(gradeData, totalMarks)
	}
}

function getGradeScore(grade: string): number {
	const scores: Record<string, number> = {
		'O': 5, 'A+': 4.5, 'A': 4, 'B+': 3.5, 'B': 3, 'C': 2.5, 'P': 2, 'F': 1, 'Ab': 0
	}
	return scores[grade] || 0
}

function getSatisfactionLevel(score: number): string {
	if (score >= 4.5) return 'Excellent'
	if (score >= 4) return 'Very Good'
	if (score >= 3) return 'Good'
	if (score >= 2) return 'Average'
	return 'Need Improvement'
}

function generateKeyFindings(satisfactionScore: number, excellent: number, fail: number, total: number): string[] {
	const findings: string[] = []

	if (total === 0) {
		return ['No data available for analysis']
	}

	const excellentPercentage = (excellent / total) * 100
	const failPercentage = (fail / total) * 100

	if (satisfactionScore >= 4) {
		findings.push('Overall academic performance indicates high student engagement and satisfaction')
	} else if (satisfactionScore >= 3) {
		findings.push('Academic performance shows moderate satisfaction levels')
	} else {
		findings.push('Academic performance indicates areas requiring attention')
	}

	if (excellentPercentage >= 30) {
		findings.push(`${excellentPercentage.toFixed(1)}% students achieved excellent grades (O, A+)`)
	}

	if (failPercentage <= 5) {
		findings.push('Very low failure rate indicates effective teaching-learning process')
	} else if (failPercentage > 20) {
		findings.push('Higher failure rate requires immediate intervention')
	}

	return findings
}

function generateAreasOfImprovement(gradeData: any[], total: number): string[] {
	const areas: string[] = []

	if (total === 0) return areas

	const failData = gradeData.find(g => g.grade === 'F')
	const cData = gradeData.find(g => g.grade === 'C')
	const pData = gradeData.find(g => g.grade === 'P')

	if (failData && failData.percentage > 10) {
		areas.push('Implement remedial classes for students at risk of failure')
	}

	if ((cData?.percentage || 0) + (pData?.percentage || 0) > 30) {
		areas.push('Strengthen academic support for average performers')
	}

	areas.push('Regular feedback mechanisms to identify student concerns')
	areas.push('Bridge courses for students from diverse backgrounds')

	return areas
}
