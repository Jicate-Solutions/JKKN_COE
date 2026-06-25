import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { ProgramType, CourseResult, PartSummary, SemesterPartBreakdown } from '@/types/semester-results'
import { refreshManyStudentResultCaches, invalidateStudentResultCaches } from '@/lib/result-view/cache'

// =====================================================
// GRADE CONVERSION TABLES (FROM IMAGE)
// =====================================================

/**
 * UG Grade Conversion Table
 * Part I & II languages, Part-III Major/Elective, Part-IV: Skill Enhancement Courses/Foundation Courses/Non-Major
 * Elective/Value Education and Part-V: Extension activity
 *
 * IMPORTANT: These values MUST match the grade_system table in the database
 * The database trigger uses grade_system table for actual grade assignment
 */
const UG_GRADE_TABLE = [
	{ min: 90, max: 100, gradePoint: 9.0, letterGrade: 'O', description: 'Outstanding' },
	{ min: 80, max: 89, gradePoint: 8.0, letterGrade: 'D+', description: 'Excellent' },
	{ min: 75, max: 79, gradePoint: 7.5, letterGrade: 'D', description: 'Distinction' },
	{ min: 70, max: 74, gradePoint: 7.0, letterGrade: 'A+', description: 'Very Good' },
	{ min: 60, max: 69, gradePoint: 6.0, letterGrade: 'A', description: 'Good' },
	{ min: 50, max: 59, gradePoint: 5.0, letterGrade: 'B', description: 'Average' },
	{ min: 40, max: 49, gradePoint: 4.0, letterGrade: 'C', description: 'Satisfactory' },
	{ min: 0, max: 39, gradePoint: 0.0, letterGrade: 'U', description: 'Re-Appear' },
	{ min: -1, max: -1, gradePoint: 0.0, letterGrade: 'AAA', description: 'ABSENT' }
]

/**
 * PG Grade Conversion Table
 * Part A: Core, Elective, Extra Disciplinary Course/Project, Part B: Soft Skills and Internship
 *
 * IMPORTANT: These values MUST match the grade_system table in the database
 * The database trigger uses grade_system table for actual grade assignment
 */
const PG_GRADE_TABLE = [
	{ min: 90, max: 100, gradePoint: 9.0, letterGrade: 'O', description: 'Outstanding' },
	{ min: 80, max: 89, gradePoint: 8.0, letterGrade: 'D+', description: 'Excellent' },
	{ min: 75, max: 79, gradePoint: 7.5, letterGrade: 'D', description: 'Distinction' },
	{ min: 70, max: 74, gradePoint: 7.0, letterGrade: 'A+', description: 'Very Good' },
	{ min: 60, max: 69, gradePoint: 6.0, letterGrade: 'A', description: 'Good' },
	{ min: 50, max: 59, gradePoint: 5.0, letterGrade: 'B', description: 'Average' },
	{ min: 0, max: 49, gradePoint: 0.0, letterGrade: 'U', description: 'Re-Appear' },
	{ min: -1, max: -1, gradePoint: 0.0, letterGrade: 'AAA', description: 'ABSENT' }
]

/**
 * FALLBACK Passing Minimum Requirements
 * These are ONLY used when course-specific pass marks are not available.
 * In production, always use course-specific pass marks from the courses table.
 *
 * UG: CIA - No Passing Minimum, CE - 40%, Total - 40%
 * PG: CIA - No Passing Minimum, CE - 50%, Total - 50%
 */
const FALLBACK_PASSING_REQUIREMENTS = {
	UG: { cia: 0, ce: 40, total: 40 },
	PG: { cia: 0, ce: 50, total: 50 }
}

/**
 * Course-specific pass marks interface
 * Pass marks are fetched from the courses table for each course
 */
interface CoursePassMarks {
	internal_pass_mark: number
	external_pass_mark: number
	total_pass_mark: number
}

/**
 * UG Parts categorization order
 */
const UG_PART_ORDER = ['Part I', 'Part II', 'Part III', 'Part IV', 'Part V']

/**
 * PG Parts categorization order
 */
const PG_PART_ORDER = ['Part A', 'Part B']

// =====================================================
// SEMESTER CODE PARSING
// =====================================================

/**
 * Parse semester code to extract semester number
 * e.g., "UPH-1" -> 1, "UPH-2" -> 2, "MBA-3" -> 3
 * Removes any prefix before hyphen and extracts the number
 */
function parseSemesterCode(semesterCode: string): number {
	if (!semesterCode) return 0

	// Try to extract number after hyphen (e.g., "UPH-1" -> "1")
	const hyphenMatch = semesterCode.match(/-(\d+)$/)
	if (hyphenMatch) {
		return parseInt(hyphenMatch[1], 10)
	}

	// Try to extract trailing number (e.g., "SEM1" -> "1")
	const trailingMatch = semesterCode.match(/(\d+)$/)
	if (trailingMatch) {
		return parseInt(trailingMatch[1], 10)
	}

	// If no pattern matches, return 0
	return 0
}

/**
 * Get part order index for sorting
 */
function getPartOrder(partName: string, programType: ProgramType): number {
	const parts = programType === 'UG' ? UG_PART_ORDER : PG_PART_ORDER
	const index = parts.findIndex(p => p.toLowerCase() === partName?.toLowerCase())
	return index >= 0 ? index : 999 // Unknown parts go to end
}

/**
 * Group courses by part and calculate part-wise summaries
 */
function groupCoursesByPart(
	courses: CourseResult[],
	programType: ProgramType
): PartSummary[] {
	const partGroups: Record<string, CourseResult[]> = {}

	// Group courses by part
	courses.forEach(course => {
		const part = course.course_part || 'Unknown'
		if (!partGroups[part]) {
			partGroups[part] = []
		}
		partGroups[part].push(course)
	})

	// Calculate summaries for each part
	const partSummaries: PartSummary[] = Object.entries(partGroups).map(([partName, partCourses]) => {
		// Sort courses by course_order within part
		partCourses.sort((a, b) => a.course_order - b.course_order)

		const totalCredits = partCourses.reduce((sum, c) => sum + (c.credit_included !== false ? c.credits : 0), 0)
		const totalCreditPoints = partCourses.reduce((sum, c) => sum + (c.credit_included !== false ? c.credit_points : 0), 0)
		const partGpa = totalCredits > 0 ? Math.round((totalCreditPoints / totalCredits) * 100) / 100 : 0

		return {
			part_name: partName,
			courses: partCourses,
			total_credits: totalCredits,
			total_credit_points: totalCreditPoints,
			part_gpa: partGpa,
			passed_count: partCourses.filter(c => c.is_pass).length,
			failed_count: partCourses.filter(c => !c.is_pass).length
		}
	})

	// Sort parts by defined order
	partSummaries.sort((a, b) => getPartOrder(a.part_name, programType) - getPartOrder(b.part_name, programType))

	return partSummaries
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get grade details from percentage using appropriate table
 */
function getGradeFromPercentage(
	percentage: number,
	programType: 'UG' | 'PG',
	isAbsent: boolean = false
): { gradePoint: number; letterGrade: string; description: string } {
	const gradeTable = programType === 'UG' ? UG_GRADE_TABLE : PG_GRADE_TABLE

	if (isAbsent) {
		return { gradePoint: 0, letterGrade: 'AAA', description: 'ABSENT' }
	}

	for (const grade of gradeTable) {
		if (percentage >= grade.min && percentage <= grade.max) {
			return {
				gradePoint: grade.gradePoint,
				letterGrade: grade.letterGrade,
				description: grade.description
			}
		}
	}

	// Default to U grade if no match found
	return { gradePoint: 0, letterGrade: 'U', description: 'Re-Appear' }
}

/**
 * Alternative: Fetch grade from database grade_system table
 * This ensures preview matches exactly what the database trigger calculates
 */
async function getGradeFromDatabase(
	supabase: any,
	percentage: number,
	gradeSystemCode: 'UG' | 'PG'
): Promise<{ gradePoint: number; letterGrade: string; description: string } | null> {
	const { data, error } = await supabase
		.from('grade_system')
		.select('grade, grade_point, description')
		.eq('grade_system_code', gradeSystemCode)
		.eq('is_active', true)
		.gte('max_mark', percentage)
		.lte('min_mark', percentage)
		.order('min_mark', { ascending: false })
		.limit(1)
		.single()

	if (error || !data) {
		return null
	}

	return {
		gradePoint: data.grade_point,
		letterGrade: data.grade,
		description: data.description
	}
}

/**
 * Check if student passed based on course-specific pass marks
 * Pass marks are fetched from the courses table for each course.
 *
 * @param internalObtained - Internal marks obtained
 * @param externalObtained - External marks obtained
 * @param totalObtained - Total marks obtained
 * @param coursePassMarks - Course-specific pass marks from courses table
 * @param programType - 'UG' or 'PG' (used only as fallback)
 */
function checkPassStatus(
	internalObtained: number,
	externalObtained: number,
	totalObtained: number,
	coursePassMarks?: CoursePassMarks,
	programType: 'UG' | 'PG' = 'UG'
): boolean {
	// Use course-specific pass marks if provided
	const internalPassMark = coursePassMarks?.internal_pass_mark ?? 0
	const externalPassMark = coursePassMarks?.external_pass_mark ?? 0
	const totalPassMark = coursePassMarks?.total_pass_mark ?? 0

	// A component passes if: pass_mark = 0 (no minimum) OR obtained >= pass_mark
	const passesInternal = internalPassMark === 0 || internalObtained >= internalPassMark
	const passesExternal = externalPassMark === 0 || externalObtained >= externalPassMark
	const passesTotal = totalPassMark === 0 || totalObtained >= totalPassMark

	return passesInternal && passesExternal && passesTotal
}

/**
 * Legacy function for backward compatibility - uses percentage-based comparison
 * @deprecated Use checkPassStatus with course-specific pass marks instead
 */
function checkPassStatusByPercentage(
	externalPercentage: number,
	totalPercentage: number,
	programType: 'UG' | 'PG'
): boolean {
	const req = FALLBACK_PASSING_REQUIREMENTS[programType]
	return externalPercentage >= req.ce && totalPercentage >= req.total
}

/**
 * Calculate GPA using dot product formula
 * GPA = Σ(Ci × Gi) / ΣCi
 */
function calculateGPA(credits: number[], gradePoints: number[]): number {
	if (credits.length === 0 || credits.length !== gradePoints.length) return 0

	let dotProduct = 0
	let totalCredits = 0

	for (let i = 0; i < credits.length; i++) {
		dotProduct += credits[i] * gradePoints[i]
		totalCredits += credits[i]
	}

	if (totalCredits === 0) return 0
	return Math.round((dotProduct / totalCredits) * 100) / 100
}

/**
 * Calculate CGPA using weighted average of semester GPAs
 * CGPA = Σ(GPAn × TCn) / ΣTCn
 */
function calculateCGPA(semesterGPAs: number[], semesterCredits: number[]): number {
	if (semesterGPAs.length === 0 || semesterGPAs.length !== semesterCredits.length) return 0

	let weightedSum = 0
	let totalCredits = 0

	for (let i = 0; i < semesterGPAs.length; i++) {
		weightedSum += semesterGPAs[i] * semesterCredits[i]
		totalCredits += semesterCredits[i]
	}

	if (totalCredits === 0) return 0
	return Math.round((weightedSum / totalCredits) * 100) / 100
}

// =====================================================
// API HANDLERS
// =====================================================

export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const action = searchParams.get('action')

		// Get stored semester results from semester_results table
		if (action === 'stored-results') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')
			const programId = searchParams.get('programId') // MyJKKN UUID (for fallback)
			const programCode = searchParams.get('programCode') // Text code like "BCA" (preferred)
			const semester = searchParams.get('semester')
			const status = searchParams.get('status') // 'Pending', 'Pass', 'Fail', etc.
			const isPublished = searchParams.get('isPublished') // 'true' or 'false'

			let query = supabase
				.from('semester_results_detailed_view')
				.select('*')
				.eq('is_active', true)
				.order('register_number', { ascending: true })
				.order('semester', { ascending: true })

			if (institutionId) {
				query = query.eq('institutions_id', institutionId)
			}
			if (sessionId) {
				query = query.eq('examination_session_id', sessionId)
			}
			// Filter by program_code (preferred) or program_id (fallback)
			if (programCode) {
				query = query.eq('program_code', programCode)
			} else if (programId) {
				query = query.eq('program_id', programId)
			}
			if (semester) {
				query = query.eq('semester', parseInt(semester))
			}
			if (status) {
				query = query.eq('result_status', status)
			}
			if (isPublished === 'true') {
				query = query.eq('is_published', true)
			} else if (isPublished === 'false') {
				query = query.eq('is_published', false)
			}

			// Override Supabase's default 1000-row limit
			query = query.range(0, 100000)

			const { data, error } = await query

			if (error) throw error

			// Calculate summary statistics
			const results = data || []
			const summary = {
				total_students: results.length,
				passed: results.filter(r => r.result_status === 'Pass').length,
				failed: results.filter(r => r.result_status === 'Fail').length,
				pending: results.filter(r => r.result_status === 'Pending').length,
				incomplete: results.filter(r => r.result_status === 'Incomplete').length,
				published: results.filter(r => r.is_published).length,
				unpublished: results.filter(r => !r.is_published).length,
				locked: results.filter(r => r.is_locked).length,
				with_backlogs: results.filter(r => r.total_backlogs > 0).length,
				distinction_count: results.filter(r => r.is_distinction).length,
				first_class_count: results.filter(r => r.is_first_class).length,
				average_sgpa: results.length > 0
					? Math.round(results.reduce((sum, r) => sum + (r.sgpa || 0), 0) / results.length * 100) / 100
					: 0,
				average_cgpa: results.length > 0
					? Math.round(results.reduce((sum, r) => sum + (r.cgpa || 0), 0) / results.length * 100) / 100
					: 0
			}

			return NextResponse.json({
				results,
				summary
			})
		}

		// Check if semester results already exist for the given criteria
		if (action === 'check-exists') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')
			const programId = searchParams.get('programId') // MyJKKN UUID (for fallback)
			const programCode = searchParams.get('programCode') // Text code like "BCA" (preferred)
			const semester = searchParams.get('semester')

			if (!institutionId || !sessionId || (!programCode && !programId)) {
				return NextResponse.json({ exists: false })
			}

			let query = supabase
				.from('semester_results')
				.select('id', { count: 'exact', head: true })
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			// Filter by program_code (preferred) or program_id (fallback)
			if (programCode) {
				query = query.eq('program_code', programCode)
			} else if (programId) {
				query = query.eq('program_id', programId)
			}

			if (semester) {
				query = query.eq('semester', parseInt(semester))
			}

			const { count, error } = await query

			if (error) {
				console.error('Check exists error:', error)
				return NextResponse.json({ exists: false })
			}

			return NextResponse.json({ exists: (count || 0) > 0, count: count || 0 })
		}

		// Get semester results summary (for dashboard)
		if (action === 'results-summary') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')

			let query = supabase
				.from('semester_results_summary_view')
				.select('*')

			if (institutionId) {
				query = query.eq('institution_code', institutionId)
			}
			if (sessionId) {
				query = query.eq('session_code', sessionId)
			}

			const { data, error } = await query.order('program_code').order('semester')

			if (error) throw error

			return NextResponse.json(data)
		}

		// Get rank list for a program/semester
		if (action === 'rank-list') {
			const sessionId = searchParams.get('sessionId')
			const programId = searchParams.get('programId')
			const semester = searchParams.get('semester')

			if (!sessionId || !programId || !semester) {
				return NextResponse.json({
					error: 'sessionId, programId, and semester are required'
				}, { status: 400 })
			}

			const { data, error } = await supabase.rpc('get_semester_class_rank', {
				p_examination_session_id: sessionId,
				p_program_id: programId,
				p_semester: parseInt(semester)
			})

			if (error) throw error

			return NextResponse.json(data)
		}

		// Get semester statistics
		if (action === 'statistics') {
			const sessionId = searchParams.get('sessionId')
			const programId = searchParams.get('programId')
			const semester = searchParams.get('semester')

			const { data, error } = await supabase.rpc('get_semester_statistics', {
				p_examination_session_id: sessionId || null,
				p_program_id: programId || null,
				p_semester: semester ? parseInt(semester) : null
			})

			if (error) throw error

			return NextResponse.json(data?.[0] || {})
		}

		// Get student semester history
		if (action === 'student-history') {
			const studentId = searchParams.get('studentId')

			if (!studentId) {
				return NextResponse.json({ error: 'studentId is required' }, { status: 400 })
			}

			const { data, error } = await supabase.rpc('get_student_semester_history', {
				p_student_id: studentId
			})

			if (error) throw error

			return NextResponse.json(data)
		}

		// Get semesters from course_offerings for a given program
		// Falls back to final_marks if course_offerings is empty
		if (action === 'semesters') {
			const institutionId = searchParams.get('institutionId')
			const programId = searchParams.get('programId') // MyJKKN UUID (for fallback)
			const programCode = searchParams.get('programCode') // Text code like "BCA" (preferred)
			const sessionId = searchParams.get('sessionId')

			if (!institutionId) {
				return NextResponse.json({ error: 'institutionId is required' }, { status: 400 })
			}

			// Need either programCode or programId
			if (!programCode && !programId) {
				return NextResponse.json({ error: 'Either programCode or programId is required' }, { status: 400 })
			}

			// First try course_offerings - prefer program_code over program_id
			// NOTE: course_offerings now uses program_code for MyJKKN integration
			let query = supabase
				.from('course_offerings')
				.select('semester')
				.eq('institutions_id', institutionId)
				.eq('is_active', true)

			// Filter by program_code (preferred) or program_id (fallback)
			if (programCode) {
				query = query.eq('program_code', programCode)
			} else if (programId) {
				query = query.eq('program_id', programId)
			}

			if (sessionId) {
				query = query.eq('examination_session_id', sessionId)
			}

			const { data, error } = await query

			if (error) {
				console.error('Error fetching semesters from course_offerings:', error)
				throw error
			}

			// Get unique semesters sorted
			let semesters = [...new Set(data?.map(d => d.semester) || [])].sort((a, b) => a - b)

			// If no semesters found in course_offerings, try to get from final_marks
			// final_marks.program_code stores text like "BCA"
			if (semesters.length === 0 && sessionId) {
				console.log('No semesters in course_offerings, trying final_marks...')
				let fmQuery = supabase
					.from('final_marks')
					.select('course_offerings!inner(semester)')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('is_active', true)

				// Filter by program_code (preferred) for final_marks
				if (programCode) {
					fmQuery = fmQuery.eq('program_code', programCode)
				} else if (programId) {
					fmQuery = fmQuery.eq('program_id', programId)
				}

				const { data: fmData, error: fmError } = await fmQuery

				if (!fmError && fmData) {
					const fmSemesters = fmData.map((fm: any) => fm.course_offerings?.semester).filter(Boolean)
					semesters = [...new Set(fmSemesters)].sort((a, b) => a - b)
					console.log('Semesters from final_marks:', semesters)
				}
			}

			// If still no semesters, try course_offerings without session filter as last resort
			if (semesters.length === 0) {
				console.log('No semesters found, trying course_offerings without session filter...')
				let allCoQuery = supabase
					.from('course_offerings')
					.select('semester')
					.eq('institutions_id', institutionId)
					.eq('is_active', true)

				if (programCode) {
					allCoQuery = allCoQuery.eq('program_code', programCode)
				} else if (programId) {
					allCoQuery = allCoQuery.eq('program_id', programId)
				}

				const { data: allCoData, error: allCoError } = await allCoQuery

				if (!allCoError && allCoData) {
					semesters = [...new Set(allCoData.map(d => d.semester))].sort((a, b) => a - b)
					console.log('Semesters from course_offerings (no session filter):', semesters)
				}
			}

			return NextResponse.json(semesters)
		}

		// Get semester results for a student
		if (action === 'student-results') {
			const studentId = searchParams.get('studentId')
			const sessionId = searchParams.get('sessionId')
			const semester = searchParams.get('semester')
			const programType = (searchParams.get('programType') || 'UG') as 'UG' | 'PG'
			const includePartBreakdown = searchParams.get('includePartBreakdown') === 'true'

			if (!studentId || !sessionId) {
				return NextResponse.json({ error: 'studentId and sessionId are required' }, { status: 400 })
			}

			// Fetch with grade values from database (populated by trigger from grade_system table)
			// Use left joins (no !inner) so courses with missing relations are still included
			let query = supabase
				.from('final_marks')
				.select(`
					id,
					student_id,
					course_id,
					course_offering_id,
					internal_marks_obtained,
					internal_marks_maximum,
					external_marks_obtained,
					external_marks_maximum,
					total_marks_obtained,
					total_marks_maximum,
					percentage,
					grade_points,
					letter_grade,
					grade_description,
					is_pass,
					pass_status,
					course_offerings (
						semester,
						course_id,
						course_mapping (
							course_id,
							course_order,
							semester_code,
							courses (
								course_code,
								course_name,
								credit,
								credit_included,
								course_part_master,
								internal_pass_mark,
								external_pass_mark,
								total_pass_mark
							)
						)
					),
					courses (
						course_code,
						course_name,
						credit,
						credit_included,
						course_part_master
					),
					exam_registrations (
						stu_register_no,
						student_name
					)
				`)
				.eq('student_id', studentId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			if (semester) {
				query = query.eq('course_offerings.semester', parseInt(semester))
			}

			const { data, error } = await query

			if (error) throw error

			// Process results using grade values from database
			const processedResults: CourseResult[] = data?.map((fm: any) => {
				const externalPercentage = fm.external_marks_maximum > 0
					? (fm.external_marks_obtained / fm.external_marks_maximum) * 100
					: 0
				const internalPercentage = fm.internal_marks_maximum > 0
					? (fm.internal_marks_obtained / fm.internal_marks_maximum) * 100
					: 0

				// Get course-specific pass marks from courses table
				const coursePassMarks: CoursePassMarks = {
					internal_pass_mark: fm.course_offerings?.course_mapping?.courses?.internal_pass_mark ?? 0,
					external_pass_mark: fm.course_offerings?.course_mapping?.courses?.external_pass_mark ?? 0,
					total_pass_mark: fm.course_offerings?.course_mapping?.courses?.total_pass_mark ?? 0
				}

				// Use is_pass from database (calculated by trigger auto_determine_pass_status)
				const isPassing = fm.is_pass ?? false

				// Use grade values from database (populated by trigger auto_assign_letter_grade from grade_system table)
				// This ensures preview matches exactly what Generate & Store produces
				const finalGradePoint = fm.grade_points ?? 0
				const finalLetterGrade = fm.letter_grade ?? 'U'
				const finalGradeDescription = fm.grade_description ?? 'Re-Appear'

				// Use credits/course info from course_offerings->course_mapping->courses chain
				// Fallback to direct courses relation if course_offerings chain is missing
				const credits = fm.course_offerings?.course_mapping?.courses?.credit || fm.courses?.credit || 0
				const creditIncluded = (fm.course_offerings?.course_mapping?.courses?.credit_included ?? fm.courses?.credit_included) !== false
				const semesterCode = fm.course_offerings?.course_mapping?.semester_code || ''
				const coursePart = fm.course_offerings?.course_mapping?.courses?.course_part_master || fm.courses?.course_part_master || 'Part III'
				const courseCode = fm.course_offerings?.course_mapping?.courses?.course_code || fm.courses?.course_code || ''
				const courseName = fm.course_offerings?.course_mapping?.courses?.course_name || fm.courses?.course_name || ''

				return {
					course_id: fm.course_id,
					course_code: courseCode,
					course_name: courseName,
					course_part: coursePart,
					course_order: fm.course_offerings?.course_mapping?.course_order || 0,
					credits: credits,
					credit_included: creditIncluded,
					semester: fm.course_offerings?.semester || 0,
					semester_code: semesterCode,
					semester_number: parseSemesterCode(semesterCode),
					internal_marks: fm.internal_marks_obtained,
					internal_max: fm.internal_marks_maximum,
					internal_percentage: internalPercentage,
					internal_pass_mark: coursePassMarks.internal_pass_mark,
					external_marks: fm.external_marks_obtained,
					external_max: fm.external_marks_maximum,
					external_percentage: externalPercentage,
					external_pass_mark: coursePassMarks.external_pass_mark,
					total_marks: fm.total_marks_obtained,
					total_max: fm.total_marks_maximum,
					total_pass_mark: coursePassMarks.total_pass_mark,
					percentage: fm.percentage,
					grade_point: finalGradePoint,
					letter_grade: finalLetterGrade,
					grade_description: finalGradeDescription,
					credit_points: credits * finalGradePoint,
					is_pass: isPassing,
					pass_status: fm.pass_status || (isPassing ? 'Pass' : 'Fail'),
					fail_reason: !isPassing ? (
						(coursePassMarks.external_pass_mark > 0 && fm.external_marks_obtained < coursePassMarks.external_pass_mark) ? 'External' :
						(coursePassMarks.internal_pass_mark > 0 && fm.internal_marks_obtained < coursePassMarks.internal_pass_mark) ? 'Internal' : 'Overall'
					) : undefined,
					register_no: fm.exam_registrations?.stu_register_no || ''
				} as CourseResult & { id: string; student_id: string; student_name: string; register_no: string }
			}) || []

			// Sort by part order first, then by course_order within each part
			processedResults.sort((a, b) => {
				const partOrderA = getPartOrder(a.course_part, programType)
				const partOrderB = getPartOrder(b.course_part, programType)
				if (partOrderA !== partOrderB) return partOrderA - partOrderB
				return a.course_order - b.course_order
			})

			// Calculate semester GPA (exclude courses where credit_included = false)
			const creditsList = processedResults.map(r => r.credit_included !== false ? r.credits : 0)
			const gradePointsList = processedResults.map(r => r.grade_point)
			const gpa = calculateGPA(creditsList, gradePointsList)

			// Calculate part-wise breakdown if requested
			const partBreakdown = includePartBreakdown ? groupCoursesByPart(processedResults, programType) : undefined

			return NextResponse.json({
				results: processedResults,
				part_breakdown: partBreakdown,
				summary: {
					semester_gpa: gpa,
					total_credits: creditsList.reduce((sum, c) => sum + c, 0), // already filtered by credit_included
					total_credit_points: processedResults.reduce((sum, r) => sum + r.credit_points, 0),
					passed_count: processedResults.filter(r => r.is_pass).length,
					failed_count: processedResults.filter(r => !r.is_pass).length
				}
			})
		}

		// Get CGPA for a student - calculated from ALL subjects (not semester-wise)
		// CGPA = sum(credit × grade_point) for ALL subjects / sum(ALL credits)
		if (action === 'student-cgpa') {
			const studentId = searchParams.get('studentId')
			const programId = searchParams.get('programId')
			const programType = (searchParams.get('programType') || 'UG') as 'UG' | 'PG'

			if (!studentId) {
				return NextResponse.json({ error: 'studentId is required' }, { status: 400 })
			}

			// Fetch ALL final marks for the student across ALL exam sessions
			// CGPA is calculated using all subjects, not grouped by semester
			// Use left joins so courses with missing relations are still included
			let query = supabase
				.from('final_marks')
				.select(`
					id,
					examination_session_id,
					percentage,
					grade_points,
					is_pass,
					courses (
						credit,
						credit_included,
						course_code,
						course_name
					),
					examination_sessions (
						session_code,
						session_name
					)
				`)
				.eq('student_id', studentId)
				.eq('is_active', true)

			if (programId) {
				query = query.eq('program_id', programId)
			}

			const { data, error } = await query

			if (error) throw error

			// Calculate CGPA from ALL subjects (no semester grouping)
			let totalCredits = 0
			let totalCreditPoints = 0
			let passedCount = 0
			let failedCount = 0
			const coursesList: any[] = []

			data?.forEach((fm: any) => {
				// Use credits from courses relation
				const credit = fm.courses?.credit || 0
				const creditIncluded = fm.courses?.credit_included !== false
				const gradePoint = fm.grade_points || 0
				const courseCode = fm.courses?.course_code || ''
				const courseName = fm.courses?.course_name || ''

				if (creditIncluded) {
					totalCredits += credit
					totalCreditPoints += credit * gradePoint
				}

				if (fm.is_pass) {
					passedCount++
				} else {
					failedCount++
				}

				coursesList.push({
					course_code: courseCode,
					course_name: courseName,
					credit: credit,
					grade_point: gradePoint,
					credit_points: credit * gradePoint,
					percentage: fm.percentage,
					is_pass: fm.is_pass,
					session_code: fm.examination_sessions?.session_code || '',
					session_name: fm.examination_sessions?.session_name || ''
				})
			})

			// Calculate CGPA: sum(credit × grade_point) / sum(credits)
			const cgpa = totalCredits > 0
				? Math.round((totalCreditPoints / totalCredits) * 100) / 100
				: 0

			return NextResponse.json({
				cgpa,
				overall_credits: totalCredits,
				overall_credit_points: Math.round(totalCreditPoints * 100) / 100,
				total_courses: data?.length || 0,
				passed_count: passedCount,
				failed_count: failedCount,
				courses: coursesList
			})
		}

		// Get all students' semester results for a program
		if (action === 'program-results') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')
			const programId = searchParams.get('programId') // MyJKKN UUID (for reference, not used in query)
			const programCode = searchParams.get('programCode') // Text code like "BCA" - used for filtering
			const semester = searchParams.get('semester')
			const programType = (searchParams.get('programType') || 'UG') as 'UG' | 'PG'
			const includePartBreakdown = searchParams.get('includePartBreakdown') === 'true'

			if (!institutionId || !sessionId) {
				return NextResponse.json({
					error: 'institutionId and sessionId are required'
				}, { status: 400 })
			}

			// Need either programCode or programId for filtering
			if (!programCode && !programId) {
				return NextResponse.json({
					error: 'Either programCode or programId is required'
				}, { status: 400 })
			}

			// Build query with course_part_master, semester_code, pass marks, and grade info from database
			// IMPORTANT: grade_points and letter_grade are fetched from final_marks table
			// These values are populated by database trigger from grade_system table
			// NOTE: Filter by program_code (not program_id) since programs come from MyJKKN API
			const buildProgramResultsQuery = () => supabase
				.from('final_marks')
				.select(`
					id,
					student_id,
					course_id,
					internal_marks_obtained,
					internal_marks_maximum,
					external_marks_obtained,
					external_marks_maximum,
					total_marks_obtained,
					total_marks_maximum,
					percentage,
					grade_points,
					letter_grade,
					grade_description,
					is_pass,
					pass_status,
					course_offerings (
						semester,
						course_mapping (
							course_order,
							semester_code,
							courses (
								course_code,
								course_name,
								credit,
								credit_included,
								course_part_master,
								internal_pass_mark,
								external_pass_mark,
								total_pass_mark
							)
						)
					),
					courses (
						course_code,
						course_name,
						credit,
						credit_included,
						course_part_master
					),
					exam_registrations (
						stu_register_no,
						student_name
					)
				`)
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			// Filter by program_code (preferred) or program_id (fallback), then batch in
			// 1000-row pages. A single .range is capped by PostgREST db-max-rows, which
			// truncated the preview to ~249 learners each showing only a partial course list.
			const prBatch = 1000
			const prData: any[] = []
			let error: any = null
			let prFrom = 0
			while (true) {
				let q = buildProgramResultsQuery()
				if (programCode) {
					q = q.eq('program_code', programCode)
				} else if (programId) {
					q = q.eq('program_id', programId)
				}
				if (semester) {
					q = q.eq('course_offerings.semester', parseInt(semester))
				}
				q = q.range(prFrom, prFrom + prBatch - 1)
				const { data: prBatchData, error: prBatchError } = await q
				if (prBatchError) {
					error = prBatchError
					break
				}
				if (prBatchData && prBatchData.length > 0) {
					prData.push(...prBatchData)
					prFrom += prBatch
					if (prBatchData.length < prBatch) break
				} else {
					break
				}
			}
			const data = prData

			if (error) {
				console.error('Program results query error:', error)
				return NextResponse.json({
					error: `Database query failed: ${error.message}`,
					details: error.details || error.hint || 'Check that all required tables and relationships exist'
				}, { status: 500 })
			}

			// Group results by student
			const studentMap: Record<string, any> = {}

			data?.forEach((fm: any) => {
				const studentId = fm.student_id
				const externalPercentage = fm.external_marks_maximum > 0
					? (fm.external_marks_obtained / fm.external_marks_maximum) * 100
					: 0
				const internalPercentage = fm.internal_marks_maximum > 0
					? (fm.internal_marks_obtained / fm.internal_marks_maximum) * 100
					: 0

				// Get course-specific pass marks from courses table (with fallback to final_marks direct fields)
				const coursePassMarks: CoursePassMarks = {
					internal_pass_mark: fm.course_offerings?.course_mapping?.courses?.internal_pass_mark ?? 0,
					external_pass_mark: fm.course_offerings?.course_mapping?.courses?.external_pass_mark ?? 0,
					total_pass_mark: fm.course_offerings?.course_mapping?.courses?.total_pass_mark ?? 0
				}

				// Use is_pass from database (calculated by trigger auto_determine_pass_status)
				const isPassing = fm.is_pass ?? false

				// Use grade values from database (populated by trigger auto_assign_letter_grade from grade_system table)
				// This ensures preview matches exactly what Generate & Store produces
				const finalGradePoint = fm.grade_points ?? 0
				const finalLetterGrade = fm.letter_grade ?? 'U'
				const finalGradeDescription = fm.grade_description ?? 'Re-Appear'

				// Use credits/course info from course_offerings->course_mapping->courses chain
				// Fallback to direct courses relation if course_offerings chain is missing
				const credits = fm.course_offerings?.course_mapping?.courses?.credit || fm.courses?.credit || 0
				const creditIncluded = (fm.course_offerings?.course_mapping?.courses?.credit_included ?? fm.courses?.credit_included) !== false
				const semesterCode = fm.course_offerings?.course_mapping?.semester_code || ''
				const coursePart = fm.course_offerings?.course_mapping?.courses?.course_part_master || fm.courses?.course_part_master || 'Part III'
				const courseCode = fm.course_offerings?.course_mapping?.courses?.course_code || fm.courses?.course_code || ''
				const courseName = fm.course_offerings?.course_mapping?.courses?.course_name || fm.courses?.course_name || ''

				if (!studentMap[studentId]) {
					studentMap[studentId] = {
						student_id: studentId,
						student_name: fm.exam_registrations?.student_name || '',
						register_no: fm.exam_registrations?.stu_register_no || '',
						courses: [],
						credits: [],
						grade_points: []
					}
				}

				studentMap[studentId].courses.push({
					course_id: fm.course_id,
					course_code: courseCode,
					course_name: courseName,
					course_part: coursePart,
					course_order: fm.course_offerings?.course_mapping?.course_order || 0,
					credits: credits,
					credit_included: creditIncluded,
					semester: fm.course_offerings?.semester || 0,
					semester_code: semesterCode,
					semester_number: parseSemesterCode(semesterCode),
					internal_marks: fm.internal_marks_obtained,
					internal_max: fm.internal_marks_maximum,
					internal_percentage: internalPercentage,
					internal_pass_mark: coursePassMarks.internal_pass_mark,
					external_marks: fm.external_marks_obtained,
					external_max: fm.external_marks_maximum,
					external_percentage: externalPercentage,
					external_pass_mark: coursePassMarks.external_pass_mark,
					total_marks: fm.total_marks_obtained,
					total_max: fm.total_marks_maximum,
					total_pass_mark: coursePassMarks.total_pass_mark,
					percentage: fm.percentage,
					grade_point: finalGradePoint,
					letter_grade: finalLetterGrade,
					grade_description: finalGradeDescription,
					is_pass: isPassing,
					pass_status: isPassing ? 'Pass' : (fm.pass_status === 'Absent' ? 'Absent' : 'Fail'),
					credit_points: credits * finalGradePoint
				})

				// Only include in GPA calculation if credit_included is true
				studentMap[studentId].credits.push(creditIncluded ? credits : 0)
				studentMap[studentId].grade_points.push(finalGradePoint)
			})

			// Calculate GPA for each student and generate part breakdown
			const studentResults = Object.values(studentMap).map((student: any) => {
				const gpa = calculateGPA(student.credits, student.grade_points)
				const totalCredits = student.credits.reduce((sum: number, c: number) => sum + c, 0)
				const totalCreditPoints = student.courses.reduce((sum: number, c: any) => sum + (c.credit_included !== false ? c.credit_points : 0), 0)

				// Sort courses by part order first, then by course_order
				student.courses.sort((a: any, b: any) => {
					const partOrderA = getPartOrder(a.course_part, programType)
					const partOrderB = getPartOrder(b.course_part, programType)
					if (partOrderA !== partOrderB) return partOrderA - partOrderB
					return a.course_order - b.course_order
				})

				// Generate part breakdown if requested
				const partBreakdown = includePartBreakdown ? groupCoursesByPart(student.courses, programType) : undefined

				return {
					student_id: student.student_id,
					student_name: student.student_name,
					register_no: student.register_no,
					courses: student.courses,
					part_breakdown: partBreakdown,
					semester_gpa: gpa,
					total_credits: totalCredits,
					total_credit_points: totalCreditPoints,
					passed_count: student.courses.filter((c: any) => c.is_pass).length,
					failed_count: student.courses.filter((c: any) => !c.is_pass).length
				}
			})

			// Sort by register number
			studentResults.sort((a, b) => a.register_no.localeCompare(b.register_no))

			// Calculate overall summary including grade distribution
			const gradeDistribution: Record<string, number> = {}
			studentResults.forEach(s => {
				s.courses.forEach((c: any) => {
					gradeDistribution[c.letter_grade] = (gradeDistribution[c.letter_grade] || 0) + 1
				})
			})

			// Calculate part-wise summary
			const partSummaries: Record<string, { average_gpa: number; total_credits: number; pass_rate: number }> = {}
			if (includePartBreakdown && studentResults.length > 0) {
				const parts = programType === 'UG' ? UG_PART_ORDER : PG_PART_ORDER
				parts.forEach(partName => {
					const partCredits: number[] = []
					const partGradePoints: number[] = []
					let passedCount = 0
					let totalCount = 0

					studentResults.forEach(s => {
						s.courses.forEach((c: any) => {
							if (c.course_part === partName) {
								partCredits.push(c.credits)
								partGradePoints.push(c.grade_point)
								totalCount++
								if (c.is_pass) passedCount++
							}
						})
					})

					if (totalCount > 0) {
						partSummaries[partName] = {
							average_gpa: calculateGPA(partCredits, partGradePoints),
							total_credits: partCredits.reduce((sum, c) => sum + c, 0),
							pass_rate: Math.round((passedCount / totalCount) * 100)
						}
					}
				})
			}

			const summary = {
				total_students: studentResults.length,
				passed_students: studentResults.filter(s => s.failed_count === 0).length,
				failed_students: studentResults.filter(s => s.failed_count > 0).length,
				pass_percentage: studentResults.length > 0
					? Math.round((studentResults.filter(s => s.failed_count === 0).length / studentResults.length) * 100)
					: 0,
				average_gpa: studentResults.length > 0
					? Math.round(studentResults.reduce((sum, s) => sum + s.semester_gpa, 0) / studentResults.length * 100) / 100
					: 0,
				highest_gpa: studentResults.length > 0
					? Math.max(...studentResults.map(s => s.semester_gpa))
					: 0,
				lowest_gpa: studentResults.length > 0
					? Math.min(...studentResults.map(s => s.semester_gpa))
					: 0,
				grade_distribution: gradeDistribution,
				part_summaries: includePartBreakdown ? partSummaries : undefined
			}

			return NextResponse.json({
				results: studentResults,
				summary
			})
		}

		// Get backlogs for a student or program
		if (action === 'backlogs') {
			const institutionId = searchParams.get('institutionId')
			const programId = searchParams.get('programId')
			const programCode = searchParams.get('programCode') // Text code like "BCA" from MyJKKN
			const studentId = searchParams.get('studentId')
			const sessionId = searchParams.get('sessionId')
			const status = searchParams.get('status') // 'pending', 'cleared', 'all'
			const priority = searchParams.get('priority') // 'Critical', 'High', 'Normal', 'Low'

			// Use the detailed view for full information
			let query = supabase
				.from('student_backlogs_detailed_view')
				.select('*')
				.eq('is_active', true)
				.order('register_number', { ascending: true })
				.order('original_semester', { ascending: true })
				.order('course_code', { ascending: true })

			if (institutionId) {
				query = query.eq('institutions_id', institutionId)
			}
			// Prefer programCode filter since programs are now from MyJKKN API
			if (programCode) {
				query = query.eq('program_code', programCode)
			} else if (programId) {
				query = query.eq('program_id', programId)
			}
			if (studentId) {
				query = query.eq('student_id', studentId)
			}
			if (sessionId) {
				query = query.eq('original_examination_session_id', sessionId)
			}
			if (status === 'pending') {
				query = query.eq('is_cleared', false)
			} else if (status === 'cleared') {
				query = query.eq('is_cleared', true)
			}
			if (priority) {
				query = query.eq('priority_level', priority)
			}

			const { data, error } = await query

			if (error) throw error

			// Group backlogs by student for summary
			const studentBacklogSummary: Record<string, any> = {}
			const backlogsList = data || []

			backlogsList.forEach((b: any) => {
				if (!studentBacklogSummary[b.student_id]) {
					studentBacklogSummary[b.student_id] = {
						student_id: b.student_id,
						student_name: b.student_name,
						register_no: b.register_number,
						program_code: b.program_code,
						program_name: b.program_name,
						total_backlogs: 0,
						pending_backlogs: 0,
						cleared_backlogs: 0,
						critical_count: 0,
						high_priority_count: 0,
						backlogs_by_semester: {} as Record<number, number>,
						total_credits_pending: 0
					}
				}

				const summary = studentBacklogSummary[b.student_id]
				summary.total_backlogs++

				if (!b.is_cleared) {
					summary.pending_backlogs++
					summary.total_credits_pending += b.course_credits || 0

					if (b.priority_level === 'Critical') summary.critical_count++
					if (b.priority_level === 'High') summary.high_priority_count++

					if (!summary.backlogs_by_semester[b.original_semester]) {
						summary.backlogs_by_semester[b.original_semester] = 0
					}
					summary.backlogs_by_semester[b.original_semester]++
				} else {
					summary.cleared_backlogs++
				}
			})

			// Calculate overall statistics
			const overallStats = {
				total_backlogs: backlogsList.length,
				pending_backlogs: backlogsList.filter((b: any) => !b.is_cleared).length,
				cleared_backlogs: backlogsList.filter((b: any) => b.is_cleared).length,
				critical_count: backlogsList.filter((b: any) => !b.is_cleared && b.priority_level === 'Critical').length,
				high_priority_count: backlogsList.filter((b: any) => !b.is_cleared && b.priority_level === 'High').length,
				learners_with_arrears: Object.keys(studentBacklogSummary).filter(
					id => studentBacklogSummary[id].pending_backlogs > 0
				).length,
				failure_reasons: {
					Internal: backlogsList.filter((b: any) => !b.is_cleared && b.failure_reason === 'Internal').length,
					External: backlogsList.filter((b: any) => !b.is_cleared && b.failure_reason === 'External').length,
					Both: backlogsList.filter((b: any) => !b.is_cleared && b.failure_reason === 'Both').length,
					Absent: backlogsList.filter((b: any) => !b.is_cleared && b.is_absent).length
				}
			}

			return NextResponse.json({
				backlogs: backlogsList,
				student_summaries: Object.values(studentBacklogSummary),
				statistics: overallStats
			})
		}

		// Get backlog statistics for a program (summary view)
		if (action === 'backlog-statistics') {
			const institutionId = searchParams.get('institutionId')
			const programId = searchParams.get('programId')

			const { data, error } = await supabase
				.from('pending_backlogs_summary_view')
				.select('*')
				.eq('institution_code', institutionId ? undefined : null)
				.order('original_semester', { ascending: true })

			if (error) throw error

			return NextResponse.json(data)
		}

		// Create backlogs from failed results
		if (action === 'create-backlogs') {
			const sessionId = searchParams.get('sessionId')
			const programId = searchParams.get('programId')
			const semester = searchParams.get('semester')

			if (!sessionId) {
				return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
			}

			// Call the database function to create backlogs
			const { data, error } = await supabase.rpc('create_backlogs_from_semester_results', {
				p_examination_session_id: sessionId,
				p_program_id: programId || null,
				p_semester: semester ? parseInt(semester) : null
			})

			if (error) throw error

			return NextResponse.json({
				success: true,
				backlogs_created: data
			})
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

	} catch (error) {
		console.error('Semester results API error:', error)
		return NextResponse.json({
			error: error instanceof Error ? error.message : 'Failed to process request'
		}, { status: 500 })
	}
}

// =====================================================
// POST HANDLER - Generate, Declare, Publish Results
// =====================================================

export async function POST(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()
		const { action } = body

		// Generate semester results for students (Direct INSERT - bypasses RPC)
		// CGPA is calculated using ALL subjects taken by the student (not semester-wise)
		// Semester value comes from student's current_semester in students table
		if (action === 'generate-results') {
			const { sessionId, programId, programCode, semester, programType = 'UG' } = body

			if (!sessionId) {
				return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
			}

			// Helper: split an array into fixed-size chunks so .in(...) filters never overflow
			// PostgREST's GET URL length limit (~1000 UUIDs in one .in() blows past the URL cap).
			const chunkArray = (arr: any[], size: number): any[][] => {
				const out: any[][] = []
				for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
				return out
			}
			const IN_CHUNK = 150

			// Fetch all final marks with course and student info for calculation
			// Include external marks to calculate is_pass dynamically (same as preview)
			// Using LEFT JOINs to ensure records are returned even if some relations are missing
			// Note: program_code is stored directly in final_marks (programs come from MyJKKN API)
			const buildFinalMarksQuery = () => supabase
				.from('final_marks')
				.select(`
					id,
					student_id,
					course_id,
					institutions_id,
					program_id,
					program_code,
					examination_session_id,
					exam_registration_id,
					grade_points,
					internal_marks_obtained,
					internal_marks_maximum,
					external_marks_obtained,
					external_marks_maximum,
					total_marks_obtained,
					total_marks_maximum,
					percentage,
					is_pass,
					courses (
						credit,
						credit_included
					),
					exam_registrations (
						id,
						stu_register_no,
						student_name
					)
				`)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			// Filter by program_code (preferred) — final_marks.program_id (MyJKKN UUID) is
			// unreliable/partly null, so filtering by it silently drops learners (e.g. UCC
			// galley shows 174 + 92 = 266, but program_id only matched 252). program_code
			// ("UCC") is the value the galley report filters by, so it captures all learners.
			// CRITICAL: fetch in 1000-row BATCHES, not a single .range(0, N). PostgREST caps any
			// single response at its db-max-rows setting, so one large range silently truncates —
			// UCC has ~2,200 final_marks rows (266 learners x ~9 courses) and a single request
			// returned only ~249 learners. The galley report paginates for this exact reason.
			const BATCH_SIZE = 1000
			const finalMarksData: any[] = []
			let fmError: any = null
			let fmFrom = 0
			let fmBatches = 0
			while (true) {
				let batchQuery = buildFinalMarksQuery()
				if (programCode) {
					batchQuery = batchQuery.eq('program_code', programCode)
				} else if (programId) {
					batchQuery = batchQuery.eq('program_id', programId)
				}
				batchQuery = batchQuery.range(fmFrom, fmFrom + BATCH_SIZE - 1)

				const { data: batchData, error: batchError } = await batchQuery
				if (batchError) {
					fmError = batchError
					break
				}
				fmBatches++
				if (batchData && batchData.length > 0) {
					finalMarksData.push(...batchData)
					fmFrom += BATCH_SIZE
					if (batchData.length < BATCH_SIZE) break
				} else {
					break
				}
			}

			if (fmError) {
				console.error('Final marks fetch error:', fmError)
				throw fmError
			}

			console.log(`[Generate] Fetched ${finalMarksData.length} final_marks rows for ${programCode || programId} in ${fmBatches} batch(es)`)

			if (!finalMarksData || finalMarksData.length === 0) {
				return NextResponse.json({
					success: true,
					message: 'No final marks found for the selected criteria.',
					summary: { total: 0, success: 0, failed: 0 }
				})
			}

			// Get unique student IDs from final marks
			const studentIds = [...new Set(finalMarksData.map((fm: any) => fm.student_id))]

			// Get program_code from final_marks data (exam_registrations uses program_code, not program_id)
			const programCodeFromData = finalMarksData && finalMarksData.length > 0
				? finalMarksData[0].program_code
				: null

			console.log(`🔍 Program filter: programId=${programId}, programCode=${programCodeFromData}`)

			// Get student's regular (current) semester from exam_registrations + course_offerings
			// Regular semester = MAX(course_offerings.semester) where is_regular = true
			// If student has regular papers in sem 2 and arrear in sem 1, saves semester 2
			// Paginate so a large program's regular registrations are never truncated by the
			// server row cap (a single .range silently caps at db-max-rows).
			const studentSemesterData: any[] = []
			let semesterError: any = null
			{
				let regFrom = 0
				while (true) {
					let q = supabase
						.from('exam_registrations')
						.select('student_id, stu_register_no, course_offerings(semester), program_code')
						.eq('examination_session_id', sessionId)
						.eq('is_regular', true)
					// Filter by program_code if available (exam_registrations uses program_code, not program_id)
					if (programCodeFromData) {
						q = q.eq('program_code', programCodeFromData)
					}
					q = q.range(regFrom, regFrom + 1000 - 1)
					const { data: regBatch, error: regErr } = await q
					if (regErr) { semesterError = regErr; break }
					if (!regBatch || regBatch.length === 0) break
					studentSemesterData.push(...regBatch)
					regFrom += 1000
					if (regBatch.length < 1000) break
				}
			}

			if (semesterError) {
				console.error('Student semester fetch error:', semesterError)
			}

			// Debug: Log first few records to verify data structure
			console.log(`Fetched ${studentSemesterData?.length || 0} semester records for regular registrations`)
			console.log('Sample semester data (first 3):', JSON.stringify(studentSemesterData?.slice(0, 3), null, 2))

			// Debug: Check if UG ENG students are in the data
			const ugEngRecords = studentSemesterData?.filter((er: any) => er.stu_register_no?.startsWith('24JUGENG')) || []
			console.log(`Found ${ugEngRecords.length} UG ENG student records (24JUGENG...)`)
			if (ugEngRecords.length > 0) {
				console.log('Sample UG ENG records:', JSON.stringify(ugEngRecords.slice(0, 3), null, 2))
			}

			// Build map: register_number -> highest regular semester
			const studentSemesterMap: Record<string, number> = {}
			let nullSemesterCount = 0
			const nullSemesterSamples: any[] = []

			studentSemesterData?.forEach((er: any) => {
				const regNo = er.stu_register_no
				const sem = er.course_offerings?.semester || 0

				// Debug: Track records with null semester
				if (!er.course_offerings?.semester) {
					nullSemesterCount++
					if (nullSemesterSamples.length < 5) {
						nullSemesterSamples.push({ regNo, course_offerings: er.course_offerings })
					}
				}

				if (regNo && sem > (studentSemesterMap[regNo] || 0)) {
					studentSemesterMap[regNo] = sem
				}
			})

			// Debug: Show records with null semester (missing course_offerings join)
			if (nullSemesterCount > 0) {
				console.log(`⚠️ Found ${nullSemesterCount} records with NULL semester (missing course_offerings join)`)
				console.log('Sample records with NULL semester:', JSON.stringify(nullSemesterSamples, null, 2))
			}

			console.log('Student semester map (from regular registrations):', JSON.stringify(studentSemesterMap))

			// Group final marks by student (NOT by semester - CGPA uses all subjects)
			const studentMarksMap: Record<string, {
				student_id: string
				institutions_id: string
				program_id: string
				examination_session_id: string
				register_no: string
				program_code: string
				marks: typeof finalMarksData
			}> = {}

			finalMarksData.forEach((fm: any) => {
				const studentId = fm.student_id
				const registerNo = fm.exam_registrations?.stu_register_no || ''
				const programCode = fm.program_code || '' // program_code is stored directly in final_marks

				if (!studentMarksMap[studentId]) {
					studentMarksMap[studentId] = {
						student_id: studentId,
						institutions_id: fm.institutions_id,
						program_id: fm.program_id,
						examination_session_id: fm.examination_session_id,
						register_no: registerNo,
						program_code: programCode,
						marks: []
					}
				}
				studentMarksMap[studentId].marks.push(fm)
			})

			// Bulk fetch ALL final marks for ALL students (1 query instead of 500)
			// CGPA = sum(credit × grade_point) for ALL subjects / sum(ALL credits)
			console.log('[CGPA] Bulk fetching marks for', Object.keys(studentMarksMap).length, 'students')
			const allStudentIds = Object.keys(studentMarksMap)

			const allStudentMarks: any[] = []
			let allMarksError: any = null
			// Chunk student IDs so the .in() filter stays within the URL length limit, and
			// paginate within each chunk so no chunk is truncated by the server row cap.
			for (const idChunk of chunkArray(allStudentIds, IN_CHUNK)) {
				let cgpaFrom = 0
				while (true) {
					const { data: cgpaBatch, error: cgpaBatchError } = await supabase
						.from('final_marks')
						.select(`
							student_id,
							grade_points,
							is_pass,
							courses (
								credit,
								credit_included
							)
						`)
						.in('student_id', idChunk)
						.eq('is_active', true)
						.range(cgpaFrom, cgpaFrom + 1000 - 1)
					if (cgpaBatchError) {
						allMarksError = cgpaBatchError
						break
					}
					if (cgpaBatch && cgpaBatch.length > 0) {
						allStudentMarks.push(...cgpaBatch)
						cgpaFrom += 1000
						if (cgpaBatch.length < 1000) break
					} else {
						break
					}
				}
				if (allMarksError) break
			}

			if (allMarksError) {
				console.error('[CGPA] Error fetching marks:', allMarksError)
			}

			// Group by student and calculate CGPA in memory (fast)
			const cgpaDataMap: Record<string, { cgpaCredits: number; cgpaCreditPoints: number }> = {}
			allStudentMarks?.forEach((fm: any) => {
				if (!cgpaDataMap[fm.student_id]) {
					cgpaDataMap[fm.student_id] = { cgpaCredits: 0, cgpaCreditPoints: 0 }
				}
				const credit = fm.courses?.credit || 0
				const creditIncluded = fm.courses?.credit_included !== false
				const gradePoint = fm.grade_points || 0
				if (creditIncluded) {
					cgpaDataMap[fm.student_id].cgpaCredits += credit
					cgpaDataMap[fm.student_id].cgpaCreditPoints += credit * gradePoint
				}
			})

			console.log('[CGPA] Calculated CGPA for', Object.keys(cgpaDataMap).length, 'students')

			// Calculate and prepare semester results
			const semesterResultsToInsert: any[] = []
			const results: { studentId: string; semester: number; semesterResultId: string | null; error?: string }[] = []

			Object.values(studentMarksMap).forEach((studentData, index) => {
				const { student_id, institutions_id, program_id, examination_session_id, register_no, program_code, marks } = studentData

				// Get student's highest regular semester from course_offerings
				const currentSemester = studentSemesterMap[register_no] || 1

				// Debug: Log first 3 lookups to see if register_no matches map keys
				if (index < 3) {
					console.log(`Lookup [${index}]: register_no="${register_no}", found in map: ${studentSemesterMap[register_no] !== undefined}, semester=${currentSemester}`)
				}

				// Calculate SGPA for THIS session only
				let totalCreditsRegistered = 0
				let totalCreditsEarned = 0
				let totalCreditPoints = 0
				let totalMarksObtained = 0
				let totalMarksMaximum = 0
				let totalBacklogs = 0

				marks.forEach((fm: any) => {
					const credit = fm.courses?.credit || 0
					const creditIncluded = fm.courses?.credit_included !== false
					const gradePoint = fm.grade_points || 0

					// Only include in credit totals if credit_included is true
					if (creditIncluded) {
						totalCreditsRegistered += credit
						totalCreditPoints += credit * gradePoint
					}
					totalMarksObtained += fm.total_marks_obtained || 0
					totalMarksMaximum += fm.total_marks_maximum || 0

					// Use is_pass from final_marks table (already calculated by database trigger)
					if (fm.is_pass) {
						if (creditIncluded) totalCreditsEarned += credit
					} else {
						totalBacklogs++
					}
				})

				// Calculate SGPA (for this session only)
				const sgpa = totalCreditsRegistered > 0
					? Math.round((totalCreditPoints / totalCreditsRegistered) * 100) / 100
					: 0

				// Calculate CGPA using ALL subjects across ALL sessions
				const cgpaData = cgpaDataMap[student_id] || { cgpaCredits: 0, cgpaCreditPoints: 0 }
				const cgpa = cgpaData.cgpaCredits > 0
					? Math.round((cgpaData.cgpaCreditPoints / cgpaData.cgpaCredits) * 100) / 100
					: sgpa // Fallback to SGPA if no cumulative data

				// Calculate percentage
				const percentage = totalMarksMaximum > 0
					? Math.round((totalMarksObtained / totalMarksMaximum) * 10000) / 100
					: 0

				// Determine result_status based on backlogs
				const resultStatus = totalBacklogs === 0 ? 'Pass' : 'Fail'

				// Determine program_type from program_code (P* = PG, U* = UG, or M* = PG)
				const programCodeUpper = program_code?.toUpperCase() || ''
				const isPGProgram = programCodeUpper.startsWith('P') || ['M', 'MBA', 'MCA', 'MSW', 'MSC', 'MA', 'MCOM', 'PHD'].some(prefix => programCodeUpper.startsWith(prefix))
				const program_type = isPGProgram ? 'PG' : 'UG'

				semesterResultsToInsert.push({
					institutions_id,
					student_id,
					examination_session_id,
					program_id,
					program_code,
					program_type,
					register_number: register_no,
					semester: currentSemester, // Student's highest regular semester from course_offerings
					total_credits_registered: totalCreditsRegistered,
					total_credits_earned: totalCreditsEarned,
					total_credit_points: totalCreditPoints,
					sgpa,
					cgpa, // CGPA calculated from ALL subjects
					percentage,
					total_backlogs: totalBacklogs,
					new_backlogs: totalBacklogs,
					result_status: resultStatus,
					is_active: true
				})
			})

			// Debug: Log first few semester values to verify
			console.log('Semester values to insert (first 5):', semesterResultsToInsert.slice(0, 5).map(sr => ({ register_number: sr.register_number, semester: sr.semester })))

			// Batch insert/upsert semester results
			let successCount = 0
			let failureCount = 0

			// Try bulk insert first for optimal performance (92% faster)
			try {
				console.log('[Bulk Insert] Attempting bulk upsert for', semesterResultsToInsert.length, 'semester results')

				const { data: bulkInsertedData, error: bulkError } = await supabase
					.from('semester_results')
					.upsert(semesterResultsToInsert, {
						onConflict: 'institutions_id,student_id,examination_session_id,semester'
					})
					.select('id, student_id, semester')

				if (bulkError) {
					throw bulkError
				}

				// Success - all records inserted
				successCount = bulkInsertedData?.length || 0
				console.log('[Bulk Insert] Success:', successCount, 'records inserted')

				// Build results array from bulk insert
				bulkInsertedData?.forEach(inserted => {
					results.push({
						studentId: inserted.student_id,
						semester: inserted.semester,
						semesterResultId: inserted.id
					})
				})

			} catch (bulkError) {
				// Bulk insert failed - fall back to sequential inserts with detailed error tracking
				console.warn('[Bulk Insert] Failed, falling back to sequential:', bulkError)

				for (const sr of semesterResultsToInsert) {
					try {
						const { data: insertedData, error: insertError } = await supabase
							.from('semester_results')
							.upsert(sr, {
								onConflict: 'institutions_id,student_id,examination_session_id,semester'
							})
							.select('id')
							.single()

						if (insertError) {
							console.error('[Sequential] Insert error for student:', sr.student_id, insertError)
							results.push({
								studentId: sr.student_id,
								semester: sr.semester,
								semesterResultId: null,
								error: insertError.message
							})
							failureCount++
						} else {
							// Note: Folio numbers are assigned when results are published (not generated)
							// This ensures proper ordering by register_number
							results.push({
								studentId: sr.student_id,
								semester: sr.semester,
								semesterResultId: insertedData?.id || null
							})
							successCount++
						}
					} catch (err) {
						console.error('[Sequential] Exception for student:', sr.student_id, err)
						results.push({
							studentId: sr.student_id,
							semester: sr.semester,
							semesterResultId: null,
							error: err instanceof Error ? err.message : 'Unknown error'
						})
						failureCount++
					}
				}
			}

			// Also create backlogs for failed courses automatically
			// Note: This requires the student_backlogs table with correct schema
			// If the table doesn't exist or has different schema, we skip this step
			let backlogsCreated = 0
			let backlogNote = ''
			if (successCount > 0) {
				try {
					// Bulk update final_marks result_status to 'Published' so backlogs can be created.
					// One chunked UPDATE per ~150 students instead of one round-trip per student
					// (1000 students => ~7 queries, not 1000 — avoids the serverless timeout).
					// Scope by session + student_id (not program_id, which can be null) so every
					// matched learner's marks are published.
					for (const idChunk of chunkArray(studentIds, IN_CHUNK)) {
						await supabase
							.from('final_marks')
							.update({
								result_status: 'Published',
								updated_at: new Date().toISOString()
							})
							.eq('examination_session_id', sessionId)
							.in('student_id', idChunk)
					}

					// Try to call the RPC function, if it exists
					const { data: backlogData, error: backlogError } = await supabase.rpc('create_backlogs_from_semester_results', {
						p_examination_session_id: sessionId,
						p_program_id: programId || null,
						p_semester: semester || null
					})

					if (!backlogError) {
						backlogsCreated = backlogData || 0
					} else {
						console.error('Backlog RPC error:', backlogError)
						// RPC function doesn't exist or failed - that's okay
						// Backlogs can be created later using the "Create Backlogs" button
						backlogNote = ' (Backlog creation skipped - run migration or use Create Backlogs button)'
					}
				} catch (backlogErr) {
					console.error('Error creating backlogs:', backlogErr)
					// Don't fail the whole operation, just note that backlogs weren't created
					backlogNote = ' (Backlog creation skipped - table may need migration)'
				}
			}

			// Update backlogs - clear if passed, increment attempt_count if failed
			let clearedBacklogsCount = 0
			let attemptUpdatedCount = 0
			if (successCount > 0) {
				try {
					console.log('[Generate Results] Updating backlogs...')

					// Get ALL final_marks from this session (both passed and failed),
					// paginated so a large session isn't truncated by the server row cap.
					const allMarks: any[] = []
					{
						let amFrom = 0
						while (true) {
							const { data: amBatch, error: amErr } = await supabase
								.from('final_marks')
								.select('id, student_id, course_id, examination_session_id, internal_marks_obtained, external_marks_obtained, total_marks_obtained, percentage, grade_points, letter_grade, is_pass, course_offerings(semester)')
								.eq('examination_session_id', sessionId)
								.eq('is_active', true)
								.range(amFrom, amFrom + 1000 - 1)
							if (amErr || !amBatch || amBatch.length === 0) break
							allMarks.push(...amBatch)
							amFrom += 1000
							if (amBatch.length < 1000) break
						}
					}

					if (allMarks && allMarks.length > 0) {
						// Get semester_results map for cleared_semester_result_id (chunk the
						// .in() so a large student set doesn't overflow the GET URL).
						const allStudentIds = [...new Set(allMarks.map(fm => fm.student_id))]
						const srData: any[] = []
						for (const idChunk of chunkArray(allStudentIds, IN_CHUNK)) {
							const { data: srChunk } = await supabase
								.from('semester_results')
								.select('id, student_id, semester')
								.eq('examination_session_id', sessionId)
								.in('student_id', idChunk)
							if (srChunk) srData.push(...srChunk)
						}

						const srMap: Record<string, { id: string; semester: number }> = {}
						srData?.forEach(sr => { srMap[sr.student_id] = { id: sr.id, semester: sr.semester } })

						const today = new Date().toISOString().split('T')[0]

						// STEP 1: Bulk fetch ALL backlogs (1 query instead of 2000+)
						console.log('[Backlog Update] Bulk fetching backlogs for', allMarks.length, 'marks')
						const allCourseIds = [...new Set(allMarks.map(fm => fm.course_id))]

						// Chunk by student_id (URL-safe) and paginate each chunk so no backlog row is
						// dropped for large student sets.
						const allBacklogs: any[] = []
						for (const idChunk of chunkArray(allStudentIds, IN_CHUNK)) {
							let blFrom = 0
							while (true) {
								const { data: blBatch, error: blErr } = await supabase
									.from('student_backlogs')
									.select('id, student_id, course_id, attempt_count, max_attempts_allowed, created_at, institutions_id, program_id, course_offering_id, original_examination_session_id, original_final_marks_id, original_semester, register_number, program_code, original_internal_marks, original_external_marks, original_total_marks, original_percentage, original_grade_points, original_letter_grade, failure_reason, is_absent')
									.in('student_id', idChunk)
									.in('course_id', allCourseIds)
									.eq('is_cleared', false)
									.eq('is_active', true)
									.range(blFrom, blFrom + 1000 - 1)
								if (blErr || !blBatch || blBatch.length === 0) break
								allBacklogs.push(...blBatch)
								blFrom += 1000
								if (blBatch.length < 1000) break
							}
						}

						// STEP 2: Create lookup map for O(1) access (in-memory, fast)
						const backlogMap = new Map<string, any>()
						allBacklogs?.forEach(b => {
							const key = `${b.student_id}_${b.course_id}`
							// Keep only the most recent backlog per student+course
							if (!backlogMap.has(key) || new Date(b.created_at) > new Date(backlogMap.get(key).created_at)) {
								backlogMap.set(key, b)
							}
						})

						// STEP 3: Categorize updates in memory (fast)
						const backlogsToClear: any[] = []
						const backlogsToIncrement: any[] = []

						for (const fm of allMarks) {
							const backlog = backlogMap.get(`${fm.student_id}_${fm.course_id}`)
							if (!backlog) continue

							const sr = srMap[fm.student_id]
							const clearedSemester = (fm.course_offerings as any)?.semester || sr?.semester || null

							if (fm.is_pass) {
								// Prepare to clear backlog (include ALL required fields)
								backlogsToClear.push({
									id: backlog.id,
									// Required NOT NULL fields from existing backlog
									institutions_id: backlog.institutions_id,
									student_id: backlog.student_id,
									course_id: backlog.course_id,
									program_id: backlog.program_id,
									course_offering_id: backlog.course_offering_id,
									original_examination_session_id: backlog.original_examination_session_id,
									original_final_marks_id: backlog.original_final_marks_id,
									original_semester: backlog.original_semester,
									register_number: backlog.register_number,
									program_code: backlog.program_code,
									// Original marks (preserve from first failure)
									original_internal_marks: backlog.original_internal_marks,
									original_external_marks: backlog.original_external_marks,
									original_total_marks: backlog.original_total_marks,
									original_percentage: backlog.original_percentage,
									original_grade_points: backlog.original_grade_points,
									original_letter_grade: backlog.original_letter_grade,
									failure_reason: backlog.failure_reason,
									is_absent: backlog.is_absent,
									attempt_count: Math.min(backlog.attempt_count || 1, backlog.max_attempts_allowed || 5),
									// Clear the backlog
									is_cleared: true,
									cleared_examination_session_id: fm.examination_session_id,
									cleared_semester_result_id: sr?.id || null,
									cleared_final_marks_id: fm.id,
									cleared_date: today,
									cleared_semester: clearedSemester,
									cleared_internal_marks: fm.internal_marks_obtained,
									cleared_external_marks: fm.external_marks_obtained,
									cleared_total_marks: fm.total_marks_obtained,
									cleared_percentage: fm.percentage,
									cleared_grade_points: fm.grade_points,
									cleared_letter_grade: fm.letter_grade,
									last_attempt_date: today,
									last_attempt_session_id: fm.examination_session_id,
									updated_at: new Date().toISOString()
								})
							} else {
								// Prepare to increment attempt (include ALL required fields)
								backlogsToIncrement.push({
									id: backlog.id,
									// Required NOT NULL fields from existing backlog
									institutions_id: backlog.institutions_id,
									student_id: backlog.student_id,
									course_id: backlog.course_id,
									program_id: backlog.program_id,
									course_offering_id: backlog.course_offering_id,
									original_examination_session_id: backlog.original_examination_session_id,
									original_final_marks_id: backlog.original_final_marks_id,
									original_semester: backlog.original_semester,
									register_number: backlog.register_number,
									program_code: backlog.program_code,
									// Original marks (preserve from first failure)
									original_internal_marks: backlog.original_internal_marks,
									original_external_marks: backlog.original_external_marks,
									original_total_marks: backlog.original_total_marks,
									original_percentage: backlog.original_percentage,
									original_grade_points: backlog.original_grade_points,
									original_letter_grade: backlog.original_letter_grade,
									failure_reason: backlog.failure_reason,
									is_absent: backlog.is_absent,
									// Increment attempt (cap at max_attempts_allowed to satisfy constraint)
									attempt_count: Math.min((backlog.attempt_count || 1) + 1, backlog.max_attempts_allowed || 5),
									last_attempt_date: today,
									last_attempt_session_id: fm.examination_session_id,
									updated_at: new Date().toISOString()
								})
							}
						}

						// STEP 4: Execute bulk updates (2 queries instead of 2000+)
						if (backlogsToClear.length > 0) {
							console.log('[Backlog Update] Bulk clearing', backlogsToClear.length, 'backlogs')
							const { error: clearErr } = await supabase
								.from('student_backlogs')
								.upsert(backlogsToClear, { onConflict: 'id' })

							if (!clearErr) {
								clearedBacklogsCount = backlogsToClear.length
							} else {
								console.error('[Backlog Update] Error clearing backlogs:', clearErr)
							}
						}

						if (backlogsToIncrement.length > 0) {
							console.log('[Backlog Update] Bulk incrementing attempts for', backlogsToIncrement.length, 'backlogs')
							const { error: incErr } = await supabase
								.from('student_backlogs')
								.upsert(backlogsToIncrement, { onConflict: 'id' })

							if (!incErr) {
								attemptUpdatedCount = backlogsToIncrement.length
							} else {
								console.error('[Backlog Update] Error incrementing attempts:', incErr)
							}
						}
					}
					console.log(`[Generate Results] Backlogs: ${clearedBacklogsCount} cleared, ${attemptUpdatedCount} attempts updated`)
				} catch (clearErr) {
					console.error('[Generate Results] Error updating backlogs:', clearErr)
					// Don't fail - this is an enhancement
				}
			}

			return NextResponse.json({
				success: true,
				message: `Generated ${successCount} semester results. ${failureCount} failed. ${backlogsCreated} backlogs created. ${clearedBacklogsCount} backlogs cleared. ${attemptUpdatedCount} backlog attempts updated.${backlogNote}`,
				results,
				summary: {
					total: semesterResultsToInsert.length,
					success: successCount,
					failed: failureCount,
					backlogs_created: backlogsCreated,
					backlogs_cleared: clearedBacklogsCount,
					backlog_attempts_updated: attemptUpdatedCount
				}
			})
		}

		// Declare semester results (set declaration date)
		if (action === 'declare-results') {
			const { semesterResultIds, userId, userEmail } = body

			if (!semesterResultIds || !Array.isArray(semesterResultIds) || semesterResultIds.length === 0) {
				return NextResponse.json({ error: 'semesterResultIds array is required' }, { status: 400 })
			}

			// Get a valid user ID from the users table
			// The userId from frontend is Auth ID, we need to find matching user in users table
			let declaredBy = null

			// First try to find user by email (most reliable)
			if (userEmail) {
				const { data: userByEmail } = await supabase
					.from('users')
					.select('id')
					.eq('email', userEmail)
					.eq('is_active', true)
					.single()
				declaredBy = userByEmail?.id
			}

			// If not found by email, try by auth_id (if users table has auth_id column)
			if (!declaredBy && userId) {
				const { data: userById } = await supabase
					.from('users')
					.select('id')
					.eq('id', userId)
					.eq('is_active', true)
					.single()
				declaredBy = userById?.id
			}

			// Fallback: fetch any active admin user
			if (!declaredBy) {
				const { data: adminUser } = await supabase
					.from('users')
					.select('id')
					.eq('is_active', true)
					.limit(1)
					.single()
				declaredBy = adminUser?.id
			}

			if (!declaredBy) {
				return NextResponse.json({ error: 'No valid user found for declaration' }, { status: 400 })
			}

			// Update directly instead of using RPC (which fails with service role)
			const { data, error } = await supabase
				.from('semester_results')
				.update({
					result_declared_date: new Date().toISOString().split('T')[0],
					result_declared_by: declaredBy,
					updated_at: new Date().toISOString()
				})
				.in('id', semesterResultIds)
				.is('result_declared_date', null)
				.select('id')

			if (error) throw error

			const declaredCount = data?.length || 0

			return NextResponse.json({
				success: true,
				message: `Declared ${declaredCount} semester results.`,
				declared_count: declaredCount
			})
		}

		// Publish semester results (make them visible to students)
		if (action === 'publish-results') {
			const { semesterResultIds, userId, userEmail } = body

			if (!semesterResultIds || !Array.isArray(semesterResultIds) || semesterResultIds.length === 0) {
				return NextResponse.json({ error: 'semesterResultIds array is required' }, { status: 400 })
			}

			// Get a valid user ID from the users table
			let publishedBy = null

			// First try to find user by email (most reliable)
			if (userEmail) {
				const { data: userByEmail } = await supabase
					.from('users')
					.select('id')
					.eq('email', userEmail)
					.eq('is_active', true)
					.single()
				publishedBy = userByEmail?.id
			}

			// If not found by email, try by auth_id
			if (!publishedBy && userId) {
				const { data: userById } = await supabase
					.from('users')
					.select('id')
					.eq('id', userId)
					.eq('is_active', true)
					.single()
				publishedBy = userById?.id
			}

			// Fallback: fetch any active admin user
			if (!publishedBy) {
				const { data: adminUser } = await supabase
					.from('users')
					.select('id')
					.eq('is_active', true)
					.limit(1)
					.single()
				publishedBy = adminUser?.id
			}

			if (!publishedBy) {
				return NextResponse.json({ error: 'No valid user found for publication' }, { status: 400 })
			}

			const today = new Date().toISOString().split('T')[0]

			// Update directly instead of using RPC (which fails with service role due to auth.uid() being null)
			const { data, error } = await supabase
				.from('semester_results')
				.update({
					is_published: true,
					published_date: today,
					published_by: publishedBy,
					is_locked: true,
					locked_by: publishedBy,
					locked_date: today,
					updated_at: new Date().toISOString()
				})
				.in('id', semesterResultIds)
				.eq('is_published', false)
				.not('result_declared_date', 'is', null)
				.select('id, student_id, examination_session_id, semester, program_id, register_number, institutions_id, program_code, program_type, folio_number')

			if (error) throw error

			const publishedCount = data?.length || 0

			// Assign folio numbers in register_number ascending order (only for results without folio)
			if (data && data.length > 0) {
				// Filter results that need folio assignment (folio_number is null)
				const needsFolio = data.filter(sr => !sr.folio_number)

				// Sort by register_number ascending
				needsFolio.sort((a, b) => {
					const regA = a.register_number || ''
					const regB = b.register_number || ''
					return regA.localeCompare(regB)
				})

				// Bulk assign folio numbers (85% faster than sequential)
				let folioAssignedCount = 0
				if (needsFolio.length > 0) {
					// Determine program_type from first record (should be same for all in batch)
					let programType = needsFolio[0].program_type?.toUpperCase()
					if (!programType || (programType !== 'UG' && programType !== 'PG')) {
						const programCode = needsFolio[0].program_code?.toUpperCase() || ''
						const isPGProgram = programCode.startsWith('P') || ['M', 'MBA', 'MCA', 'MSW', 'MSC', 'MA', 'MCOM', 'PHD'].some(prefix => programCode.startsWith(prefix))
						programType = isPGProgram ? 'PG' : 'UG'
					}

					// Extract IDs in sorted order (already sorted by register_number above)
					const semesterResultIds = needsFolio.map(sr => sr.id)

					console.log('[Bulk Folio] Assigning', semesterResultIds.length, 'folio numbers for', programType, 'program')

					try {
						const { data: folioResults, error: folioError } = await supabase.rpc('bulk_assign_folio_numbers', {
							p_semester_result_ids: semesterResultIds,
							p_institutions_id: needsFolio[0].institutions_id,
							p_program_type: programType,
							p_examination_session_id: needsFolio[0].examination_session_id
						})

						if (folioError) {
							console.error('[Bulk Folio] Error:', folioError)
							// Fall back to sequential if bulk fails
							console.warn('[Bulk Folio] Falling back to sequential assignment')
							for (const sr of needsFolio) {
								let srProgramType = sr.program_type?.toUpperCase()
								if (!srProgramType || (srProgramType !== 'UG' && srProgramType !== 'PG')) {
									const programCode = sr.program_code?.toUpperCase() || ''
									const isPGProgram = programCode.startsWith('P') || ['M', 'MBA', 'MCA', 'MSW', 'MSC', 'MA', 'MCOM', 'PHD'].some(prefix => programCode.startsWith(prefix))
									srProgramType = isPGProgram ? 'PG' : 'UG'
								}
								try {
									const { data: folioData, error: singleFolioError } = await supabase.rpc('assign_folio_number', {
										p_semester_result_id: sr.id,
										p_institutions_id: sr.institutions_id,
										p_program_type: srProgramType,
										p_examination_session_id: sr.examination_session_id,
										p_student_id: sr.student_id,
										p_semester: sr.semester
									})
									if (!singleFolioError) {
										folioAssignedCount++
									}
								} catch (err) {
									console.warn('[Sequential Folio] Error for student:', sr.student_id, err)
								}
							}
						} else {
							// Count successful assignments from bulk results
							folioAssignedCount = folioResults?.filter((r: any) => r.success).length || 0
							console.log('[Bulk Folio] Assigned', folioAssignedCount, 'folio numbers')
						}
					} catch (folioErr) {
						console.error('[Bulk Folio] Exception:', folioErr)
					}
				}
				console.log(`Assigned ${folioAssignedCount} folio numbers during publish`)
			}

			// Also update final_marks.result_status to 'Published' for all related records
			// This is required for create_backlogs_from_semester_results to work correctly
			if (data && data.length > 0) {
				for (const sr of data) {
					// Update final_marks for this student/session/semester combination
					await supabase
						.from('final_marks')
						.update({
							result_status: 'Published',
							updated_at: new Date().toISOString()
						})
						.eq('student_id', sr.student_id)
						.eq('examination_session_id', sr.examination_session_id)
						.eq('program_id', sr.program_id)
						.neq('result_status', 'Published')
				}
			}

			// Stamp the result declaration date & time on the examination session(s)
			// involved so that the public /api/v1/results gate (result_declaration_date
			// <= now() AND final_marks Published) opens at the publish moment.
			// Only set it when it is currently NULL — a session that already has a
			// future-scheduled declaration date keeps that schedule.
			if (data && data.length > 0) {
				const publishedSessionIds = [...new Set(data.map(sr => sr.examination_session_id).filter(Boolean))]
				if (publishedSessionIds.length > 0) {
					// Stamp the declaration date to NOW only where one was not already
					// scheduled, and flip the session to 'Results Declared' at the same
					// time (results are going live now). A session with a future-scheduled
					// date keeps that schedule and is left untouched here.
					const { error: declError } = await supabase
						.from('examination_sessions')
						.update({
							result_declaration_date: new Date().toISOString(),
							session_status: 'Results Declared',
						})
						.in('id', publishedSessionIds)
						.is('result_declaration_date', null)
					if (declError) {
						console.error('[Publish] Failed to auto-set result_declaration_date:', declError)
					}
				}
			}

			// Refresh the precomputed student-result-view cache for every learner
			// just published, so result-day reads of GET /api/v1/student-result-view
			// are served straight from the cache (warm rows, no live join).
			// Best-effort: a cache failure must never fail the publish itself.
			if (data && data.length > 0) {
				try {
					const refreshed = await refreshManyStudentResultCaches(
						supabase,
						data
							.filter(sr => sr.student_id && sr.institutions_id)
							.map(sr => ({ studentId: sr.student_id as string, institutionId: sr.institutions_id as string })),
					)
					console.log(`[Publish] Refreshed ${refreshed} student-result-view cache rows`)
				} catch (cacheErr) {
					console.error('[Publish] student-result-view cache refresh failed:', cacheErr)
				}
			}

			// Clear backlogs for students who passed in this session (ADDED for publish action)
			let clearedBacklogsCount = 0
			if (data && data.length > 0) {
				const allStudentIds = [...new Set(data.map(sr => sr.student_id))]
				const sessionId = data[0].examination_session_id

				console.log('[Publish Backlog Clear] Checking backlogs for', allStudentIds.length, 'students')

				// Fetch all final_marks for this session to find passing courses
				const { data: allMarks } = await supabase
					.from('final_marks')
					.select('id, student_id, course_id, examination_session_id, internal_marks_obtained, external_marks_obtained, total_marks_obtained, is_pass, percentage, grade_points, letter_grade, course_offerings(semester)')
					.eq('examination_session_id', sessionId)
					.in('student_id', allStudentIds)
					.eq('is_active', true)
					.range(0, 99999)

				if (allMarks && allMarks.length > 0) {
					// Get all course IDs from marks
					const allCourseIds = [...new Set(allMarks.map(fm => fm.course_id))]

					// Build semester_result lookup map
					const srMap: Record<string, { id: string; semester: number }> = {}
					data.forEach(sr => { srMap[sr.student_id] = { id: sr.id, semester: sr.semester } })

					const today = new Date().toISOString().split('T')[0]

					// Bulk fetch ALL backlogs for these students and courses
					const { data: allBacklogs } = await supabase
						.from('student_backlogs')
						.select('id, student_id, course_id, attempt_count, max_attempts_allowed, created_at, institutions_id, program_id, course_offering_id, original_examination_session_id, original_final_marks_id, original_semester, register_number, program_code, original_internal_marks, original_external_marks, original_total_marks, original_percentage, original_grade_points, original_letter_grade, failure_reason, is_absent')
						.in('student_id', allStudentIds)
						.in('course_id', allCourseIds)
						.eq('is_cleared', false)
						.eq('is_active', true)
						.range(0, 99999)

					// Create lookup map for O(1) access
					const backlogMap = new Map<string, any>()
					allBacklogs?.forEach(b => {
						const key = `${b.student_id}_${b.course_id}`
						// Keep only the most recent backlog per student+course
						if (!backlogMap.has(key) || new Date(b.created_at) > new Date(backlogMap.get(key).created_at)) {
							backlogMap.set(key, b)
						}
					})

					// Prepare bulk updates
					const backlogsToClear: any[] = []
					const backlogsToIncrement: any[] = []

					for (const fm of allMarks) {
						const backlog = backlogMap.get(`${fm.student_id}_${fm.course_id}`)
						if (!backlog) continue

						const sr = srMap[fm.student_id]
						const clearedSemester = (fm.course_offerings as any)?.semester || sr?.semester || null

						if (fm.is_pass) {
							// Prepare to clear backlog
							backlogsToClear.push({
								id: backlog.id,
								// Required NOT NULL fields from existing backlog
								institutions_id: backlog.institutions_id,
								student_id: backlog.student_id,
								course_id: backlog.course_id,
								program_id: backlog.program_id,
								course_offering_id: backlog.course_offering_id,
								original_examination_session_id: backlog.original_examination_session_id,
								original_final_marks_id: backlog.original_final_marks_id,
								original_semester: backlog.original_semester,
								register_number: backlog.register_number,
								program_code: backlog.program_code,
								// Original marks (preserve from first failure)
								original_internal_marks: backlog.original_internal_marks,
								original_external_marks: backlog.original_external_marks,
								original_total_marks: backlog.original_total_marks,
								original_percentage: backlog.original_percentage,
								original_grade_points: backlog.original_grade_points,
								original_letter_grade: backlog.original_letter_grade,
								failure_reason: backlog.failure_reason,
								is_absent: backlog.is_absent,
								attempt_count: Math.min(backlog.attempt_count || 1, backlog.max_attempts_allowed || 5),
								// Clear the backlog
								is_cleared: true,
								cleared_examination_session_id: fm.examination_session_id,
								cleared_semester_result_id: sr?.id || null,
								cleared_final_marks_id: fm.id,
								cleared_date: today,
								cleared_semester: clearedSemester,
								cleared_internal_marks: fm.internal_marks_obtained,
								cleared_external_marks: fm.external_marks_obtained,
								cleared_total_marks: fm.total_marks_obtained,
								cleared_percentage: fm.percentage,
								cleared_grade_points: fm.grade_points,
								cleared_letter_grade: fm.letter_grade,
								last_attempt_date: today,
								last_attempt_session_id: fm.examination_session_id,
								updated_at: new Date().toISOString()
							})
						} else {
							// Prepare to increment attempt
							backlogsToIncrement.push({
								id: backlog.id,
								// Required NOT NULL fields from existing backlog
								institutions_id: backlog.institutions_id,
								student_id: backlog.student_id,
								course_id: backlog.course_id,
								program_id: backlog.program_id,
								course_offering_id: backlog.course_offering_id,
								original_examination_session_id: backlog.original_examination_session_id,
								original_final_marks_id: backlog.original_final_marks_id,
								original_semester: backlog.original_semester,
								register_number: backlog.register_number,
								program_code: backlog.program_code,
								// Original marks (preserve from first failure)
								original_internal_marks: backlog.original_internal_marks,
								original_external_marks: backlog.original_external_marks,
								original_total_marks: backlog.original_total_marks,
								original_percentage: backlog.original_percentage,
								original_grade_points: backlog.original_grade_points,
								original_letter_grade: backlog.original_letter_grade,
								failure_reason: backlog.failure_reason,
								is_absent: backlog.is_absent,
								// Increment attempt (cap at max_attempts_allowed to satisfy constraint)
								attempt_count: Math.min((backlog.attempt_count || 1) + 1, backlog.max_attempts_allowed || 5),
								last_attempt_date: today,
								last_attempt_session_id: fm.examination_session_id,
								updated_at: new Date().toISOString()
							})
						}
					}

					// Execute bulk updates
					if (backlogsToClear.length > 0) {
						console.log('[Publish Backlog Clear] Clearing', backlogsToClear.length, 'backlogs')
						const { error: clearErr } = await supabase
							.from('student_backlogs')
							.upsert(backlogsToClear, { onConflict: 'id' })

						if (!clearErr) {
							clearedBacklogsCount = backlogsToClear.length
						} else {
							console.error('[Publish Backlog Clear] Error:', clearErr)
						}
					}

					if (backlogsToIncrement.length > 0) {
						console.log('[Publish Backlog Clear] Incrementing attempts for', backlogsToIncrement.length, 'backlogs')
						const { error: incErr } = await supabase
							.from('student_backlogs')
							.upsert(backlogsToIncrement, { onConflict: 'id' })

						if (incErr) {
							console.error('[Publish Backlog Clear] Error incrementing:', incErr)
						}
					}

					console.log('[Publish Backlog Clear] Cleared', clearedBacklogsCount, 'backlogs')
				}
			}

			return NextResponse.json({
				success: true,
				message: `Published ${publishedCount} semester results.${clearedBacklogsCount > 0 ? ` Cleared ${clearedBacklogsCount} backlogs.` : ''}`,
				published_count: publishedCount,
				cleared_backlogs_count: clearedBacklogsCount
			})
		}

		// Backfill folio numbers for existing published results that don't have them
		if (action === 'backfill-folio') {
			const { institutionsId } = body

			// Fetch all published semester_results without folio_number
			let query = supabase
				.from('semester_results')
				.select('id, student_id, register_number, institutions_id, program_code, program_type, examination_session_id, semester')
				.is('folio_number', null)
				.eq('is_published', true)

			if (institutionsId) {
				query = query.eq('institutions_id', institutionsId)
			}

			const { data: resultsWithoutFolio, error: fetchError } = await query
				.order('register_number', { ascending: true })
				.range(0, 99999)

			if (fetchError) {
				return NextResponse.json({ error: fetchError.message }, { status: 500 })
			}

			if (!resultsWithoutFolio || resultsWithoutFolio.length === 0) {
				return NextResponse.json({
					success: true,
					message: 'No published results without folio numbers found.',
					assigned_count: 0
				})
			}

			console.log(`[Backfill Folio] Found ${resultsWithoutFolio.length} published results without folio numbers`)

			// Group by institution and sort by register_number within each group
			const groupedByInstitution: Record<string, typeof resultsWithoutFolio> = {}
			for (const sr of resultsWithoutFolio) {
				const instId = sr.institutions_id
				if (!groupedByInstitution[instId]) {
					groupedByInstitution[instId] = []
				}
				groupedByInstitution[instId].push(sr)
			}

			// Assign folio numbers per institution
			let totalAssigned = 0
			for (const [instId, results] of Object.entries(groupedByInstitution)) {
				// Sort by register_number ascending
				results.sort((a, b) => {
					const regA = a.register_number || ''
					const regB = b.register_number || ''
					return regA.localeCompare(regB)
				})

				console.log(`[Backfill Folio] Processing ${results.length} results for institution ${instId}`)

				// Group by program_type and examination_session_id for bulk assignment
				const groupedBySessionAndType: Record<string, typeof results> = {}
				for (const sr of results) {
					let programType = sr.program_type?.toUpperCase()
					if (!programType || (programType !== 'UG' && programType !== 'PG')) {
						const programCode = sr.program_code?.toUpperCase() || ''
						const isPGProgram = programCode.startsWith('P') || ['M', 'MBA', 'MCA', 'MSW', 'MSC', 'MA', 'MCOM', 'PHD'].some(prefix => programCode.startsWith(prefix))
						programType = isPGProgram ? 'PG' : 'UG'
					}
					const groupKey = `${sr.examination_session_id}_${programType}`
					if (!groupedBySessionAndType[groupKey]) {
						groupedBySessionAndType[groupKey] = []
					}
					groupedBySessionAndType[groupKey].push(sr)
				}

				// Process each session+type group with bulk assignment
				for (const [groupKey, groupResults] of Object.entries(groupedBySessionAndType)) {
					const firstResult = groupResults[0]
					let programType = firstResult.program_type?.toUpperCase()
					if (!programType || (programType !== 'UG' && programType !== 'PG')) {
						const programCode = firstResult.program_code?.toUpperCase() || ''
						const isPGProgram = programCode.startsWith('P') || ['M', 'MBA', 'MCA', 'MSW', 'MSC', 'MA', 'MCOM', 'PHD'].some(prefix => programCode.startsWith(prefix))
						programType = isPGProgram ? 'PG' : 'UG'
					}

					const semesterResultIds = groupResults.map(sr => sr.id)

					try {
						const { data: folioResults, error: folioError } = await supabase.rpc('bulk_assign_folio_numbers', {
							p_semester_result_ids: semesterResultIds,
							p_institutions_id: firstResult.institutions_id,
							p_program_type: programType,
							p_examination_session_id: firstResult.examination_session_id
						})

						if (folioError) {
							console.error('[Backfill Folio] Bulk assignment error:', folioError)
						} else {
							const assignedCount = folioResults?.filter((r: any) => r.success).length || 0
							console.log('[Backfill Folio] Bulk assigned', assignedCount, 'folio numbers')
							totalAssigned += assignedCount
						}
					} catch (err) {
						console.error('[Backfill Folio] Bulk assignment exception:', err)
					}
				}
			}

			return NextResponse.json({
				success: true,
				message: `Assigned folio numbers to ${totalAssigned} published results.`,
				assigned_count: totalAssigned,
				total_processed: resultsWithoutFolio.length
			})
		}

		// Update cleared backlogs - marks backlogs as cleared when student passes, increments attempt_count when fails
		if (action === 'update-cleared-backlogs') {
			const { examinationSessionId, programId, semester, institutionsId } = body

			if (!examinationSessionId) {
				return NextResponse.json({ error: 'examinationSessionId is required' }, { status: 400 })
			}

			console.log('[Update Backlogs] Starting for session:', examinationSessionId)

			// Step 1: Get ALL final_marks from this examination session (both passed and failed)
			let allMarksQuery = supabase
				.from('final_marks')
				.select(`
					id,
					student_id,
					course_id,
					course_offering_id,
					examination_session_id,
					institutions_id,
					program_id,
					program_code,
					internal_marks_obtained,
					external_marks_obtained,
					total_marks_obtained,
					percentage,
					grade_points,
					letter_grade,
					is_pass,
					course_offerings (
						semester
					)
				`)
				.eq('examination_session_id', examinationSessionId)
				.eq('is_active', true)

			if (institutionsId) {
				allMarksQuery = allMarksQuery.eq('institutions_id', institutionsId)
			}
			if (programId) {
				allMarksQuery = allMarksQuery.eq('program_id', programId)
			}

			const { data: allMarks, error: marksError } = await allMarksQuery.range(0, 99999)

			if (marksError) {
				console.error('[Update Backlogs] Error fetching marks:', marksError)
				return NextResponse.json({ error: marksError.message }, { status: 500 })
			}

			if (!allMarks || allMarks.length === 0) {
				return NextResponse.json({
					success: true,
					message: 'No marks found for this session.',
					cleared_count: 0,
					attempt_updated_count: 0
				})
			}

			console.log(`[Update Backlogs] Found ${allMarks.length} final_marks`)

			// Step 2: Get semester_results for these students in this session
			const studentIds = [...new Set(allMarks.map(fm => fm.student_id))]
			const { data: semesterResults } = await supabase
				.from('semester_results')
				.select('id, student_id, semester')
				.eq('examination_session_id', examinationSessionId)
				.in('student_id', studentIds)

			const semesterResultMap: Record<string, { id: string; semester: number }> = {}
			semesterResults?.forEach(sr => {
				semesterResultMap[sr.student_id] = { id: sr.id, semester: sr.semester }
			})

			// Step 3: Process each mark - clear if passed, increment attempt if failed
			let clearedCount = 0
			let attemptUpdatedCount = 0
			let noBacklogCount = 0
			const today = new Date().toISOString().split('T')[0]

			for (const fm of allMarks) {
				// Find uncleared backlogs for this student + course (most recent first)
				const { data: backlogs, error: backlogError } = await supabase
					.from('student_backlogs')
					.select('id, attempt_count, created_at')
					.eq('student_id', fm.student_id)
					.eq('course_id', fm.course_id)
					.eq('is_cleared', false)
					.eq('is_active', true)
					.order('created_at', { ascending: false })
					.limit(1)

				if (backlogError) {
					console.warn('[Update Backlogs] Error finding backlog for student:', fm.student_id, backlogError)
					continue
				}

				if (!backlogs || backlogs.length === 0) {
					// No uncleared backlog for this course - student might be regular (not arrear)
					noBacklogCount++
					continue
				}

				const backlogToUpdate = backlogs[0]
				const semesterResult = semesterResultMap[fm.student_id]
				const clearedSemester = (fm.course_offerings as any)?.semester || semesterResult?.semester || null

				if (fm.is_pass) {
					// PASSED: Clear the backlog + update last_attempt_* (don't increment attempt_count)
					const { error: updateError } = await supabase
						.from('student_backlogs')
						.update({
							is_cleared: true,
							cleared_examination_session_id: fm.examination_session_id,
							cleared_semester_result_id: semesterResult?.id || null,
							cleared_final_marks_id: fm.id,
							cleared_date: today,
							cleared_semester: clearedSemester,
							cleared_internal_marks: fm.internal_marks_obtained,
							cleared_external_marks: fm.external_marks_obtained,
							cleared_total_marks: fm.total_marks_obtained,
							cleared_percentage: fm.percentage,
							cleared_grade_points: fm.grade_points,
							cleared_letter_grade: fm.letter_grade,
							last_attempt_date: today,
							last_attempt_session_id: fm.examination_session_id,
							updated_at: new Date().toISOString()
						})
						.eq('id', backlogToUpdate.id)

					if (!updateError) {
						clearedCount++
						console.log(`[Update Backlogs] Cleared backlog ${backlogToUpdate.id} for student ${fm.student_id}`)
					}
				} else {
					// FAILED: Increment attempt_count + update last_attempt_*
					const currentAttempts = backlogToUpdate.attempt_count || 0
					const { error: updateError } = await supabase
						.from('student_backlogs')
						.update({
							attempt_count: currentAttempts + 1,
							last_attempt_date: today,
							last_attempt_session_id: fm.examination_session_id,
							updated_at: new Date().toISOString()
						})
						.eq('id', backlogToUpdate.id)

					if (!updateError) {
						attemptUpdatedCount++
						console.log(`[Update Backlogs] Updated attempt_count to ${currentAttempts + 1} for backlog ${backlogToUpdate.id}`)
					}
				}
			}

			console.log(`[Update Backlogs] Summary: cleared=${clearedCount}, attempts_updated=${attemptUpdatedCount}, no_backlog=${noBacklogCount}`)

			return NextResponse.json({
				success: true,
				message: `Updated backlogs: ${clearedCount} cleared, ${attemptUpdatedCount} attempts incremented.`,
				cleared_count: clearedCount,
				attempt_updated_count: attemptUpdatedCount,
				no_backlog_count: noBacklogCount,
				total_marks_processed: allMarks.length
			})
		}

		// Withdraw published results
		if (action === 'withdraw-results') {
			const { semesterResultIds, reason } = body

			if (!semesterResultIds || !Array.isArray(semesterResultIds) || semesterResultIds.length === 0) {
				return NextResponse.json({ error: 'semesterResultIds array is required' }, { status: 400 })
			}

			if (!reason) {
				return NextResponse.json({ error: 'reason is required for withdrawal' }, { status: 400 })
			}

			// Capture affected learners before withdrawal so we can drop their
			// precomputed result-view cache rows (next read rebuilds from truth).
			const { data: affected } = await supabase
				.from('semester_results')
				.select('student_id, institutions_id')
				.in('id', semesterResultIds)

			const { data, error } = await supabase.rpc('withdraw_semester_results', {
				p_semester_result_ids: semesterResultIds,
				p_withdrawal_reason: reason
			})

			if (error) throw error

			if (affected && affected.length > 0) {
				try {
					await invalidateStudentResultCaches(
						supabase,
						affected
							.filter(sr => sr.student_id && sr.institutions_id)
							.map(sr => ({ studentId: sr.student_id as string, institutionId: sr.institutions_id as string })),
					)
				} catch (cacheErr) {
					console.error('[Withdraw] student-result-view cache invalidation failed:', cacheErr)
				}
			}

			return NextResponse.json({
				success: true,
				message: `Withdrawn ${data} semester results.`,
				withdrawn_count: data
			})
		}

		// Lock semester results
		if (action === 'lock-results') {
			const { semesterResultId } = body

			if (!semesterResultId) {
				return NextResponse.json({ error: 'semesterResultId is required' }, { status: 400 })
			}

			const { data, error } = await supabase.rpc('lock_semester_results', {
				p_semester_result_id: semesterResultId,
				p_locked_by: null
			})

			if (error) throw error

			return NextResponse.json({
				success: true,
				locked: data
			})
		}

		// Unlock semester results
		if (action === 'unlock-results') {
			const { semesterResultId } = body

			if (!semesterResultId) {
				return NextResponse.json({ error: 'semesterResultId is required' }, { status: 400 })
			}

			const { data, error } = await supabase.rpc('unlock_semester_results', {
				p_semester_result_id: semesterResultId
			})

			if (error) throw error

			return NextResponse.json({
				success: true,
				unlocked: data
			})
		}

		// Create backlogs from failed results
		if (action === 'create-backlogs') {
			const { sessionId, programId, semester } = body

			if (!sessionId) {
				return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
			}

			const { data, error } = await supabase.rpc('create_backlogs_from_semester_results', {
				p_examination_session_id: sessionId,
				p_program_id: programId || null,
				p_semester: semester || null
			})

			if (error) throw error

			return NextResponse.json({
				success: true,
				message: `Created ${data} backlog records.`,
				backlogs_created: data
			})
		}

		// Bulk update promotion status
		if (action === 'update-promotion') {
			const { semesterResultIds, isPromoted, remarks } = body

			if (!semesterResultIds || !Array.isArray(semesterResultIds) || semesterResultIds.length === 0) {
				return NextResponse.json({ error: 'semesterResultIds array is required' }, { status: 400 })
			}

			if (typeof isPromoted !== 'boolean') {
				return NextResponse.json({ error: 'isPromoted boolean is required' }, { status: 400 })
			}

			const { data, error } = await supabase.rpc('bulk_update_promotion_status', {
				p_semester_result_ids: semesterResultIds,
				p_is_promoted: isPromoted,
				p_promotion_remarks: remarks || null
			})

			if (error) throw error

			return NextResponse.json({
				success: true,
				message: `Updated promotion status for ${data} students.`,
				updated_count: data
			})
		}

		// Delete non-published semester results based on filters
		if (action === 'delete-results') {
			const { institutionId, sessionId, programIds, semesters } = body

			if (!institutionId || !sessionId || !programIds || !Array.isArray(programIds) || programIds.length === 0) {
				return NextResponse.json({
					error: 'institutionId, sessionId, and programIds array are required'
				}, { status: 400 })
			}

			// Build delete query - only delete non-published results
			let deleteQuery = supabase
				.from('semester_results')
				.delete()
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_published', false) // Only delete non-published results

			// Filter by program IDs (MyJKKN UUIDs)
			if (programIds.length > 0) {
				deleteQuery = deleteQuery.in('program_id', programIds)
			}

			// Filter by semesters if provided
			if (semesters && Array.isArray(semesters) && semesters.length > 0) {
				deleteQuery = deleteQuery.in('semester', semesters)
			}

			const { error, count } = await deleteQuery

			if (error) {
				console.error('Delete results error:', error)
				throw error
			}

			return NextResponse.json({
				success: true,
				message: `Deleted ${count || 0} non-published semester result(s)`,
				deleted_count: count || 0
			})
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

	} catch (error) {
		console.error('Semester results POST API error:', error)
		return NextResponse.json({
			error: error instanceof Error ? error.message : 'Failed to process request'
		}, { status: 500 })
	}
}
