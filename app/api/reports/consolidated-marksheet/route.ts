import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNPrograms } from '@/services/myjkkn-service'
import { generateUniversityDataExcel, type UniversityDataRow } from '@/lib/utils/generate-university-data-excel'

// =====================================================
// GRADE CONVERSION TABLE (UG)
// =====================================================

const UG_GRADE_TABLE = [
	{ min: 90, max: 100, gradePoint: 10.0, letterGrade: 'O', description: 'Outstanding' },
	{ min: 80, max: 89, gradePoint: 9.0, letterGrade: 'A+', description: 'Excellent' },
	{ min: 70, max: 79, gradePoint: 8.0, letterGrade: 'A', description: 'Good' },
	{ min: 60, max: 69, gradePoint: 7.0, letterGrade: 'B+', description: 'Above Average' },
	{ min: 50, max: 59, gradePoint: 6.0, letterGrade: 'B', description: 'Average' },
	{ min: 40, max: 49, gradePoint: 5.0, letterGrade: 'C', description: 'Satisfactory' },
	{ min: 0, max: 39, gradePoint: 0.0, letterGrade: 'U', description: 'Re-Appear' },
	{ min: -1, max: -1, gradePoint: 0.0, letterGrade: 'AAA', description: 'ABSENT' }
]

// Part descriptions mapping (UG: I-V, PG: A-B)
const PART_DESCRIPTIONS: Record<string, string> = {
	'Part I': 'Language I (Tamil/Hindi/French etc.)',
	'Part II': 'Language II (English)',
	'Part III': 'Core/Major Subjects',
	'Part IV': 'Allied/Skill Enhancement/Foundation',
	'Part V': 'Extension Activities/Projects',
	'Part A': 'Core/Major Subjects',
	'Part B': 'Electives/Skill Enhancement/Project'
}

// Part order for sorting (UG parts first, then PG parts — a learner only has one set)
const PART_ORDER = ['Part I', 'Part II', 'Part III', 'Part IV', 'Part V', 'Part A', 'Part B']

/**
 * Get grade details from percentage
 * Supports continuous/interpolated grade points
 */
function getGradeFromPercentage(
	percentage: number,
	isAbsent: boolean = false
): { gradePoint: number; letterGrade: string; description: string } {
	if (isAbsent) {
		return { gradePoint: 0, letterGrade: 'AAA', description: 'ABSENT' }
	}

	const continuousGP = Math.round((percentage / 10) * 10) / 10

	for (const grade of UG_GRADE_TABLE) {
		if (percentage >= grade.min && percentage <= grade.max) {
			return {
				gradePoint: continuousGP,
				letterGrade: grade.letterGrade,
				description: grade.description
			}
		}
	}

	return { gradePoint: 0, letterGrade: 'U', description: 'Re-Appear' }
}

/**
 * Check if student passed based on pass marks
 * UG: Passing requires 40% in ESE AND 40% in Total
 * PG: Passing requires 50% in ESE AND 50% in Total
 *
 * CIA-only courses have NO ESE component — only the Total threshold is checked.
 */
function checkPassStatus(
	eseMarks: number,
	eseMax: number,
	totalMarks: number,
	totalMax: number,
	passingPercentage: number = 40,
	evalType: string = 'CIA + ESE'
): { isPassing: boolean; result: string } {
	const totalPercentage = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0
	const passesTotal = totalPercentage >= passingPercentage

	const hasESE = evalType !== 'CIA' && eseMax > 0
	const esePercentage = hasESE ? (eseMarks / eseMax) * 100 : 0
	const passesESE = hasESE ? esePercentage >= passingPercentage : true

	if (passesESE && passesTotal) {
		return { isPassing: true, result: 'PASS' }
	}
	return { isPassing: false, result: 'RA' }
}

/**
 * Check if program is PG based on code or name
 */
function isPGProgram(programCode: string, programName?: string): boolean {
	const code = programCode?.toUpperCase() || ''
	const name = programName?.toUpperCase() || ''

	const pgCodePrefixes = ['M', 'MBA', 'MCA', 'MSW', 'MSC', 'MA', 'MCOM', 'PHD', 'PG']
	if (pgCodePrefixes.some(prefix => code.startsWith(prefix))) {
		return true
	}

	if (code.includes('PG')) {
		return true
	}

	const pgNamePatterns = ['M.SC', 'MSC', 'M.A.', 'M.A ', 'MA ', 'M.COM', 'MCOM', 'MBA', 'MCA', 'M.PHIL', 'MPHIL', 'PH.D', 'PHD', 'POST GRADUATE', 'POSTGRADUATE', 'MASTER']
	if (pgNamePatterns.some(pattern => name.includes(pattern))) {
		return true
	}

	return false
}

/**
 * Get part order for sorting
 */
function getPartOrder(partName: string): number {
	const index = PART_ORDER.findIndex(p => p.toLowerCase() === partName?.toLowerCase())
	return index >= 0 ? index : 999
}

/**
 * Derive classification label from CGPA
 */
function getClassification(cgpa: number): string {
	if (cgpa >= 8.5) return 'First Class with Distinction'
	if (cgpa >= 6.0) return 'First Class'
	if (cgpa >= 5.0) return 'Second Class'
	if (cgpa >= 4.0) return 'Pass'
	return 'Re-Appear'
}

// =====================================================
// SHARED TYPES
// =====================================================

interface CourseResult {
	courseCode: string
	courseName: string
	part: string
	partDescription: string
	semester: number
	semesterCode: string
	courseOrder: number
	credits: number
	eseMax: number
	ciaMax: number
	totalMax: number
	eseMarks: number
	ciaMarks: number
	totalMarks: number
	percentage: number
	gradePoint: number
	letterGrade: string
	creditPoints: number
	isPassing: boolean
	result: string
	resultType?: string
	passStatus?: string
	creditValue?: number
	passMarks?: number
	isAbsent?: boolean
	isMalpractice?: boolean
	isIneligible?: boolean
	isTermFail?: boolean
	isFinalFail?: boolean
	creditIncluded?: boolean
	monthYear?: string  // Examination month & year, e.g. "JUN'24"
}

interface PartBreakdown {
	partName: string
	partDescription: string
	courses: CourseResult[]
	totalCredits: number
	totalCreditPoints: number
	partCGPA: number
	creditsEarned: number
	classification: string
}

// =====================================================
// CORE FINAL_MARKS SELECT FRAGMENT (reused in batch)
// =====================================================

const FINAL_MARKS_SELECT = `
	id,
	student_id,
	course_id,
	credit,
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
	examination_session_id,
	result_status,
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
				result_type,
				evaluation_type
			)
		)
	),
	exam_registrations (
		stu_register_no,
		student_name
	),
	examination_sessions (
		session_name,
		month_year,
		exam_start_date
	)
`

// =====================================================
// PROCESS ONE FINAL_MARKS ROW → CourseResult
// =====================================================

function processFinalMarkRow(fm: any, passingPercentage: number): CourseResult | null {
	const courseData = fm.course_offerings?.course_mapping?.courses
	if (!courseData) return null

	const resultType: string = courseData.result_type || 'Mark'
	const isSpecialType = resultType === 'comment' || resultType === 'credit' || resultType === 'Status'
	const evalType: string = (courseData.evaluation_type || 'CIA + ESE').trim().toUpperCase()

	const eseMarks = fm.external_marks_obtained || 0
	const ciaMarks = fm.internal_marks_obtained || 0
	const totalMarks = fm.total_marks_obtained || 0
	const eseMax = fm.external_marks_maximum || 0
	const ciaMax = fm.internal_marks_maximum || 0
	const totalMax = fm.total_marks_maximum || 0
	const percentage = fm.percentage || (totalMax > 0 ? (totalMarks / totalMax) * 100 : 0)

	let gradePoint = fm.grade_points
	let letterGrade = fm.letter_grade

	if (!isSpecialType && (gradePoint === null || gradePoint === undefined)) {
		const gradeInfo = getGradeFromPercentage(percentage)
		gradePoint = gradeInfo.gradePoint
		letterGrade = gradeInfo.letterGrade
	}

	const isAbsent = !isSpecialType && (
		(eseMarks === 0 && ciaMarks === 0 && totalMarks === 0) ||
		(letterGrade === 'AAA')
	)
	const passMarks = isSpecialType ? 0 : Math.ceil(totalMax * (passingPercentage / 100))

	const specialIsPassing = letterGrade === 'AAA' ? false : (fm.is_pass ?? true)
	const { isPassing, result } = isSpecialType
		? { isPassing: specialIsPassing, result: fm.pass_status || 'PASS' }
		: checkPassStatus(eseMarks, eseMax, totalMarks, totalMax, passingPercentage, evalType)

	const finalGradePoint = isSpecialType ? 0 : ((isPassing && !isAbsent) ? (gradePoint || 0) : 0)
	const credits = courseData.credit || 0
	const creditIncluded = courseData.credit_included !== false
	const creditPoints = isSpecialType ? 0 : credits * finalGradePoint

	const part = courseData.course_part_master || 'Part III'

	// CIA-only / ESE-only component resolution (same logic as semester route)
	const resolvedEseMax = isSpecialType ? 0 : (evalType === 'CIA' ? 0 : (eseMax || 75))
	const resolvedCiaMax = isSpecialType ? 0 : (evalType === 'ESE' ? 0 : (ciaMax || 25))

	return {
		courseCode: courseData.course_code,
		courseName: courseData.course_name,
		part,
		partDescription: PART_DESCRIPTIONS[part] || '',
		semester: fm.course_offerings?.semester || 1,
		semesterCode: fm.course_offerings?.course_mapping?.semester_code || '',
		courseOrder: fm.course_offerings?.course_mapping?.course_order || 0,
		credits,
		eseMax: resolvedEseMax,
		ciaMax: resolvedCiaMax,
		totalMax: isSpecialType ? 0 : (totalMax || 100),
		eseMarks,
		ciaMarks,
		totalMarks,
		percentage: Math.round(percentage * 100) / 100,
		gradePoint: Math.round(finalGradePoint * 10) / 10,
		letterGrade: letterGrade || (isSpecialType ? '-' : 'U'),
		creditPoints: Math.round(creditPoints * 10) / 10,
		isPassing,
		result,
		resultType,
		passStatus: fm.pass_status || undefined,
		creditValue: fm.credit != null ? Number(fm.credit) : undefined,
		passMarks,
		isAbsent,
		isMalpractice: false,
		isIneligible: false,
		isTermFail: !isSpecialType && !isPassing && !isAbsent,
		isFinalFail: !isSpecialType && !isPassing && !isAbsent,
		creditIncluded,
		monthYear: formatExamMonthYear(fm.examination_sessions)
	}
}

/**
 * Convert an examination_sessions row to a compact "MON'YY" label.
 * Priority: explicit `month_year` field → derive from `exam_start_date`.
 */
function formatExamMonthYear(session: any): string {
	if (!session) return ''
	const sess = Array.isArray(session) ? session[0] : session
	if (!sess) return ''

	// If month_year is already in DB (e.g. "JUN 2024"), normalise it
	if (sess.month_year) {
		const m = String(sess.month_year).trim().toUpperCase()
		// Match "JUN 2024" / "JUN2024" / "JUN-2024" / "JUN/2024"
		const parts = m.match(/^([A-Z]{3,})[\s\-\/]?(\d{4})$/)
		if (parts) {
			return `${parts[1].slice(0, 3)}-${parts[2].slice(-2)}`
		}
		return m
	}

	if (sess.exam_start_date) {
		const d = new Date(sess.exam_start_date)
		if (!isNaN(d.getTime())) {
			const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
			return `${month}-${String(d.getFullYear()).slice(-2)}`
		}
	}

	return ''
}

// =====================================================
// BEST-ATTEMPT DEDUPLICATION
// When a learner has multiple final_marks rows for the
// same course_id (arrear re-attempts), keep the row
// with the highest total_marks_obtained.
// =====================================================

function deduplicateBestAttempt(rows: any[]): any[] {
	const bestMap = new Map<string, any>()
	for (const row of rows) {
		const courseId: string = row.course_id
		if (!courseId) continue
		const existing = bestMap.get(courseId)
		if (!existing) {
			bestMap.set(courseId, row)
		} else {
			const existingTotal = existing.total_marks_obtained || 0
			const currentTotal = row.total_marks_obtained || 0
			if (currentTotal > existingTotal) {
				bestMap.set(courseId, row)
			}
		}
	}
	return Array.from(bestMap.values())
}

// =====================================================
// ELIGIBILITY CHECK
// Consolidated marksheet is issued ONLY when a learner
// has passed every course across every semester (no backlog).
// =====================================================

interface EligibilityFailure {
	courseCode: string
	courseName: string
	semester: number
	part: string
	totalMarks: number
	totalMax: number
	result: string
}

function getEligibilityStatus(
	courses: CourseResult[],
	totalSemesters: number = 0
): {
	eligible: boolean
	failedCount: number
	failedCourses: EligibilityFailure[]
	missingSemesters: number[]
	semestersAttempted: number[]
} {
	const failed = courses.filter(c => !c.isPassing)

	// Semester-coverage check — every semester 1..totalSemesters must have at least one course
	const attemptedSet = new Set<number>(courses.map(c => c.semester).filter(s => s > 0))
	const semestersAttempted = Array.from(attemptedSet).sort((a, b) => a - b)
	const missingSemesters: number[] = []
	if (totalSemesters > 0) {
		for (let s = 1; s <= totalSemesters; s++) {
			if (!attemptedSet.has(s)) missingSemesters.push(s)
		}
	}

	const eligible = failed.length === 0 && missingSemesters.length === 0

	return {
		eligible,
		failedCount: failed.length,
		failedCourses: failed.map(c => ({
			courseCode: c.courseCode,
			courseName: c.courseName,
			semester: c.semester,
			part: c.part,
			totalMarks: c.totalMarks,
			totalMax: c.totalMax,
			result: c.result
		})),
		missingSemesters,
		semestersAttempted
	}
}

// =====================================================
// BUILD PART BREAKDOWN FROM FLAT COURSE LIST
// =====================================================

function buildPartBreakdown(courses: CourseResult[]): PartBreakdown[] {
	const partGroups: Record<string, PartBreakdown> = {}

	for (const course of courses) {
		if (!partGroups[course.part]) {
			partGroups[course.part] = {
				partName: course.part,
				partDescription: PART_DESCRIPTIONS[course.part] || '',
				courses: [],
				totalCredits: 0,
				totalCreditPoints: 0,
				partCGPA: 0,
				creditsEarned: 0,
				classification: ''
			}
		}
		partGroups[course.part].courses.push(course)
		if (course.creditIncluded !== false) {
			partGroups[course.part].totalCredits += course.credits
			partGroups[course.part].totalCreditPoints += course.creditPoints
			if (course.isPassing) {
				partGroups[course.part].creditsEarned += course.credits
			}
		}
	}

	for (const part of Object.values(partGroups)) {
		part.partCGPA = part.totalCredits > 0
			? Math.round((part.totalCreditPoints / part.totalCredits) * 100) / 100
			: 0
		part.classification = getClassification(part.partCGPA)
	}

	return Object.values(partGroups).sort((a, b) =>
		getPartOrder(a.partName) - getPartOrder(b.partName)
	)
}

// =====================================================
// COMPUTE SUMMARY FIELDS
// =====================================================

function computeSummary(courses: CourseResult[], formattedFolio: string | null) {
	const totalCredits = courses.reduce((s, c) => s + (c.creditIncluded !== false ? c.credits : 0), 0)
	const totalCreditPoints = courses.reduce((s, c) => s + (c.creditIncluded !== false ? c.creditPoints : 0), 0)
	const creditsEarned = courses
		.filter(c => c.isPassing && c.creditIncluded !== false)
		.reduce((s, c) => s + c.credits, 0)
	const cgpa = totalCredits > 0
		? Math.round((totalCreditPoints / totalCredits) * 100) / 100
		: 0
	const hasFailures = courses.some(c => !c.isPassing)
	const overallResult: 'PASS' | 'NEEDS IMPROVEMENT' = hasFailures ? 'NEEDS IMPROVEMENT' : 'PASS'
	const classification = getClassification(cgpa)

	return {
		totalCourses: courses.length,
		totalCredits,
		creditsEarned,
		totalCreditPoints: Math.round(totalCreditPoints * 100) / 100,
		cgpa,
		overallResult,
		classification,
		formattedFolio: formattedFolio || null
	}
}

// =====================================================
// MYJKKN PROFILE FETCH HELPERS
// =====================================================

/** Fetch photo/DOB/name maps for a set of register numbers using MyJKKN pagination */
async function fetchMyJKKNProfileMaps(
	myjkknIds: string[],
	registerNumbers: string[]
): Promise<{
	photoMap: Record<string, string>
	dobMap: Record<string, string>
	nameMap: Record<string, string>
	extInfoMap: Record<string, any>
}> {
	const photoMap: Record<string, string> = {}
	const dobMap: Record<string, string> = {}
	const nameMap: Record<string, string> = {}
	const extInfoMap: Record<string, any> = {}

	if (registerNumbers.length === 0 || myjkknIds.length === 0) {
		return { photoMap, dobMap, nameMap, extInfoMap }
	}

	const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
	const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

	if (!myjkknApiKey) {
		console.log('[Consolidated Marksheet] No MyJKKN API key configured')
		return { photoMap, dobMap, nameMap, extInfoMap }
	}

	const norm = (s: any) => (s ?? '').toString().trim().toUpperCase()
	const regNoByNorm = new Map<string, string>()
	registerNumbers.forEach(rn => regNoByNorm.set(norm(rn), rn))

	const applyProfile = (lp: any) => {
		const candidates = [
			lp.register_number, lp.registration_number,
			lp.roll_number, lp.rollno, lp.roll_no,
			lp.application_number,
		]
		let regNo: string | undefined
		for (const c of candidates) {
			const hit = regNoByNorm.get(norm(c))
			if (hit) { regNo = hit; break }
		}
		if (!regNo) return

		const profilePhotoUrl = lp.student_photo_url || lp.photo_url || lp.profile_photo || lp.image_url
		if (profilePhotoUrl && !photoMap[regNo]) photoMap[regNo] = profilePhotoUrl

		if (lp.date_of_birth && !dobMap[regNo]) {
			const dob = new Date(lp.date_of_birth)
			if (!isNaN(dob.getTime())) {
				dobMap[regNo] = `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${dob.getFullYear()}`
			}
		}

		if (!nameMap[regNo]) {
			const constructedName = lp.student_name || lp.full_name || [lp.first_name, lp.last_name].filter(Boolean).join(' ')
			if (constructedName) nameMap[regNo] = constructedName
		}

		if (!extInfoMap[regNo]) {
			extInfoMap[regNo] = {
				firstName: lp.first_name || undefined,
				lastName: lp.last_name || undefined,
				fatherName: lp.father_name || undefined,
				motherName: lp.mother_name || undefined,
				gender: lp.gender || undefined,
				admissionYear: lp.admission_year?.toString() || undefined
			}
		}
	}

	const pageSize = 1000
	const MAX_PAGES = 1000
	const PAGE_CONCURRENCY = 5

	const fetchPage = async (myjkknInstId: string, page: number): Promise<any[] | null> => {
		const p = new URLSearchParams()
		p.set('institution_id', myjkknInstId)
		p.set('limit', String(pageSize))
		p.set('page', String(page))
		try {
			const resp = await fetch(`${myjkknApiUrl}/api-management/learners/profiles?${p.toString()}`, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${myjkknApiKey}`,
					'Accept': 'application/json',
					'Content-Type': 'application/json',
				},
				cache: 'no-store',
			})
			if (!resp.ok) return null
			const json = await resp.json()
			return json.data || []
		} catch {
			return null
		}
	}

	for (const myjkknInstId of myjkknIds) {
		let startPage = 1
		let done = false
		while (!done && startPage <= MAX_PAGES) {
			const pageNums = Array.from({ length: PAGE_CONCURRENCY }, (_, i) => startPage + i)
			const results = await Promise.all(pageNums.map(pg => fetchPage(myjkknInstId, pg)))
			for (const profiles of results) {
				if (!profiles || profiles.length === 0) { done = true; continue }
				profiles.forEach(applyProfile)
			}
			if (registerNumbers.every(rn => photoMap[rn] && dobMap[rn])) done = true
			startPage += PAGE_CONCURRENCY
		}
	}

	// Targeted fallback: for any register number still missing photo OR dob,
	// hit the MyJKKN endpoint with ?register_number=... filter. Pagination may
	// have skipped them if MyJKKN's institution_id filter didn't include the
	// learner's current institution registration.
	const stillMissing = registerNumbers.filter(
		rn => !(photoMap[rn] && dobMap[rn] && nameMap[rn])
	)
	if (stillMissing.length > 0) {
		console.log(`[Consolidated Marksheet] ${stillMissing.length} learner(s) missing after pagination — running targeted register_number lookup`)
		for (const regNo of stillMissing) {
			const p = new URLSearchParams()
			p.set('register_number', regNo)
			p.set('limit', '200')
			try {
				const resp = await fetch(
					`${myjkknApiUrl}/api-management/learners/profiles?${p.toString()}`,
					{
						method: 'GET',
						headers: {
							'Authorization': `Bearer ${myjkknApiKey}`,
							'Accept': 'application/json',
							'Content-Type': 'application/json',
						},
						cache: 'no-store',
					}
				)
				if (resp.ok) {
					const json = await resp.json()
					const profiles: any[] = json.data || []
					profiles.forEach(applyProfile)
					if (profiles.length > 0) {
						console.log(`[Consolidated Marksheet] Targeted lookup found ${profiles.length} profile(s) for ${regNo}`)
					}
				}
			} catch (e) {
				console.warn(`[Consolidated Marksheet] Targeted lookup error for ${regNo}:`, e)
			}
		}
	}

	return { photoMap, dobMap, nameMap, extInfoMap }
}

/** Fallback: fill missing photo/DOB from local learners_profiles mirror (table is optional) */
async function fillFromLocalProfiles(
	supabase: ReturnType<typeof getSupabaseServer>,
	registerNumbers: string[],
	photoMap: Record<string, string>,
	dobMap: Record<string, string>,
	nameMap: Record<string, string>
): Promise<void> {
	const stillMissing = registerNumbers.filter(rn => !photoMap[rn] || !dobMap[rn])
	if (stillMissing.length === 0) return

	const LP_CHUNK = 50
	for (let i = 0; i < stillMissing.length; i += LP_CHUNK) {
		const chunk = stillMissing.slice(i, i + LP_CHUNK)
		const { data: lpRows, error: lpErr } = await supabase
			.from('learners_profiles')
			.select('register_number, first_name, last_name, date_of_birth, student_photo_url')
			.in('register_number', chunk)
		if (lpErr) {
			// learners_profiles table doesn't exist in this deployment — silently skip
			if (lpErr.code === 'PGRST205') return
			console.warn('[Consolidated Marksheet] learners_profiles fallback error (non-critical):', lpErr)
			break
		}
		;(lpRows || []).forEach((lp: any) => {
			const regNo = lp.register_number
			if (!regNo) return
			if (!photoMap[regNo] && lp.student_photo_url) photoMap[regNo] = lp.student_photo_url
			if (!dobMap[regNo] && lp.date_of_birth) {
				const dob = new Date(lp.date_of_birth)
				if (!isNaN(dob.getTime())) {
					dobMap[regNo] = `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${dob.getFullYear()}`
				}
			}
			if (!nameMap[regNo]) {
				const nm = [lp.first_name, lp.last_name].filter(Boolean).join(' ')
				if (nm) nameMap[regNo] = nm
			}
		})
	}
}

/** Resolve program UUID from program_code using the local programs table */
async function resolveProgramUuid(
	supabase: ReturnType<typeof getSupabaseServer>,
	programCode: string,
	institutionId: string
): Promise<string | null> {
	const { data: prog } = await supabase
		.from('programs')
		.select('id')
		.eq('program_code', programCode)
		.eq('institutions_id', institutionId)
		.single()
	return prog?.id || null
}

/**
 * Resolve the total number of semesters a program runs for.
 * UG (program_duration_yrs <= 3) → 6 semesters
 * PG (program_duration_yrs > 3 is not typical; PG is usually 2 yrs → 4 semesters)
 *
 * Defaults to 6 for UG and 4 for PG when program_duration_yrs is missing.
 */
async function resolveTotalSemesters(
	supabase: ReturnType<typeof getSupabaseServer>,
	programCode: string,
	institutionId: string,
	isPG: boolean
): Promise<number> {
	const { data: prog } = await supabase
		.from('programs')
		.select('program_duration_yrs')
		.eq('program_code', programCode)
		.eq('institutions_id', institutionId)
		.maybeSingle()

	const yrs = prog?.program_duration_yrs
	if (typeof yrs === 'number' && yrs > 0) {
		return yrs * 2
	}
	return isPG ? 4 : 6
}

/**
 * In-memory cache for MyJKKN program lists, keyed by MyJKKN institution id.
 * Successful fetches are cached for 10 minutes; failures are negative-cached
 * for 60 seconds so a flaky/slow MyJKKN API (10s timeout x retry per call)
 * cannot stall every report request for 20+ seconds.
 */
const myjkknProgramsCache = new Map<string, { data: any[]; expires: number }>()
const PROGRAMS_CACHE_TTL_MS = 10 * 60 * 1000
const PROGRAMS_NEGATIVE_CACHE_TTL_MS = 60 * 1000

/** Fetch the MyJKKN program list for one institution id, with caching */
async function fetchMyJKKNProgramsCached(myjkknInstId: string): Promise<any[]> {
	const cached = myjkknProgramsCache.get(myjkknInstId)
	if (cached && cached.expires > Date.now()) {
		return cached.data
	}
	try {
		const programs = await fetchAllMyJKKNPrograms({
			institution_id: myjkknInstId,
			limit: 100,
			is_active: true
		})
		myjkknProgramsCache.set(myjkknInstId, {
			data: programs,
			expires: Date.now() + PROGRAMS_CACHE_TTL_MS
		})
		return programs
	} catch (fetchErr) {
		// Negative-cache the failure so subsequent requests don't repeat
		// the 10s-timeout-plus-retry stall
		myjkknProgramsCache.set(myjkknInstId, {
			data: [],
			expires: Date.now() + PROGRAMS_NEGATIVE_CACHE_TTL_MS
		})
		throw fetchErr
	}
}

/**
 * Resolve the program name for a code — LOCAL FIRST, MyJKKN as fallback.
 * The local programs mirror table already stores program_name (and the
 * generate action auto-creates mirror rows), so most lookups never need
 * the external API. A mirror row whose name equals the code is treated as
 * a placeholder and still falls through to MyJKKN.
 */
async function resolveProgramName(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionId: string,
	myjkknIds: string[],
	programCode: string
): Promise<string> {
	// 1. Local programs mirror (fast, no external dependency)
	try {
		const { data: localProg } = await supabase
			.from('programs')
			.select('program_name')
			.eq('program_code', programCode)
			.eq('institutions_id', institutionId)
			.maybeSingle()
		const localName = localProg?.program_name?.trim()
		if (localName && localName.toUpperCase() !== programCode.toUpperCase()) {
			return localName
		}
	} catch (err) {
		console.warn('[Consolidated Marksheet] Local program name lookup error:', err)
	}

	// 2. MyJKKN fallback (cached per MyJKKN institution id)
	for (const myjkknInstId of myjkknIds) {
		try {
			const programs = await fetchMyJKKNProgramsCached(myjkknInstId)
			const match = programs.find((p: any) =>
				p.program_id === programCode || p.program_code === programCode
			)
			if (match) {
				return match.program_name || (match as any).name || ''
			}
		} catch (err) {
			console.warn('[Consolidated Marksheet] Program name lookup error:', err)
		}
	}
	return ''
}

/**
 * Resolve the cumulative GRADE + CLASSIFICATION for a CGPA using the
 * cgpa_grade_system table — institution-specific bands first, then the global
 * defaults (institutions_id IS NULL). Falls back to the hardcoded
 * classification bands if the table is absent or no band matches.
 *
 * Pass a pre-fetched `bands` array (institution + global rows) to avoid a DB
 * round-trip per learner in batch mode.
 */
function pickCgpaBand(rows: any[] | null | undefined, cgpa: number): any {
	return (rows || []).find(
		r => cgpa >= Number(r.min_cgpa) && cgpa <= Number(r.max_cgpa)
	)
}

async function fetchCgpaBands(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionId: string,
	isPG: boolean
): Promise<{ instBands: any[]; defaultBands: any[] }> {
	const code = isPG ? 'PG' : 'UG'
	let instBands: any[] = []
	let defaultBands: any[] = []
	try {
		const [{ data: instRows }, { data: defRows }] = await Promise.all([
			supabase
				.from('cgpa_grade_system')
				.select('grade, classification, min_cgpa, max_cgpa')
				.eq('institutions_id', institutionId)
				.eq('grade_system_code', code)
				.eq('is_active', true),
			supabase
				.from('cgpa_grade_system')
				.select('grade, classification, min_cgpa, max_cgpa')
				.is('institutions_id', null)
				.eq('grade_system_code', code)
				.eq('is_active', true)
		])
		instBands = instRows || []
		defaultBands = defRows || []
	} catch (e) {
		console.warn('[Consolidated Marksheet] cgpa_grade_system lookup failed (non-critical):', e)
	}
	return { instBands, defaultBands }
}

/**
 * Regulation rule: "First Class with Exemplary" and "First Class with
 * Distinction" are awarded ONLY to candidates who passed every course in the
 * FIRST appearance (no arrear/re-appearance history). Others with the same
 * CGPA are classified "First Class".
 */
function hasArrearHistory(rawRows: any[], passingPercentage: number): boolean {
	const attemptCount = new Map<string, number>()
	for (const row of rawRows) {
		if (!row.course_id) continue
		const n = (attemptCount.get(row.course_id) || 0) + 1
		if (n > 1) return true // re-attempt of the same course = arrear
		attemptCount.set(row.course_id, n)
	}
	// Any failing attempt on record also breaks "first appearance"
	for (const row of rawRows) {
		const c = processFinalMarkRow(row, passingPercentage)
		if (c && !c.isPassing) return true
	}
	return false
}

function resolveCumulativeGrade(
	bands: { instBands: any[]; defaultBands: any[] },
	cgpa: number,
	firstAppearance: boolean = true
): { cumulativeGrade: string; classification: string } {
	const row = pickCgpaBand(bands.instBands, cgpa) || pickCgpaBand(bands.defaultBands, cgpa)
	if (row) {
		let classification = row.classification || getClassification(cgpa)
		if (!firstAppearance && /exemplary|distinction/i.test(classification)) {
			classification = 'First Class'
		}
		return {
			cumulativeGrade: row.grade || '',
			classification
		}
	}
	// Table missing / no band matched → hardcoded classification, no letter grade
	let fallback = getClassification(cgpa)
	if (!firstAppearance && /exemplary|distinction/i.test(fallback)) {
		fallback = 'First Class'
	}
	return { cumulativeGrade: '', classification: fallback }
}

/**
 * Derive the BRANCH from a program name by stripping the leading degree
 * abbreviation. e.g. ("M.Sc. MATHEMATICS", "M.Sc") -> "MATHEMATICS".
 * Matching is tolerant of dots/spaces/case. Falls back to dropping the first
 * dotted token when the degree code doesn't match the prefix.
 */
function stripDegreePrefix(programName: string, degreeCode: string): string {
	const name = (programName || '').trim()
	if (!name) return ''

	const normalize = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase()
	const dc = normalize(degreeCode)

	if (dc) {
		let normAcc = ''
		for (let i = 0; i < name.length; i++) {
			normAcc += normalize(name[i])
			if (normAcc === dc) {
				return name.slice(i + 1).replace(/^[\s.\-]+/, '').trim()
			}
			if (normAcc.length >= dc.length) break
		}
	}

	// Fallback: drop the first whitespace token if it looks like a degree abbrev
	const parts = name.split(/\s+/)
	if (parts.length > 1 && /\./.test(parts[0])) {
		return parts.slice(1).join(' ').trim()
	}
	return name
}

// =====================================================
// API HANDLER
// =====================================================

export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const action = searchParams.get('action')

		// =====================================================
		// ACTION: by-folio
		// Resolves a consolidated_results row by formatted_folio_number
		// and returns its (studentId, institutionId, programCode) so the
		// share page can reuse the existing student-marksheet pipeline.
		// =====================================================
		if (action === 'by-folio') {
			const folio = searchParams.get('folio')
			if (!folio) {
				return NextResponse.json({ error: 'folio is required' }, { status: 400 })
			}

			const { data: row, error: folioErr } = await supabase
				.from('consolidated_results')
				.select(`
					student_id,
					institutions_id,
					program_id,
					formatted_folio_number,
					cgpa,
					result_class,
					last_examination_session_id,
					programs ( program_code )
				`)
				.eq('formatted_folio_number', folio)
				.maybeSingle()

			if (folioErr) {
				console.error('[Consolidated Marksheet - by-folio] Lookup error:', folioErr)
				return NextResponse.json({ error: 'Folio lookup failed' }, { status: 500 })
			}

			if (!row) {
				return NextResponse.json(
					{ error: 'Folio not found', folio },
					{ status: 404 }
				)
			}

			const programRow = Array.isArray(row.programs) ? row.programs[0] : row.programs
			const programCode = programRow?.program_code || ''

			return NextResponse.json({
				folio: row.formatted_folio_number,
				studentId: row.student_id,
				institutionId: row.institutions_id,
				programCode
			})
		}

		// =====================================================
		// ACTION: programs
		// Returns the list of programs for an institution
		// (same pattern as semester-marksheet)
		// =====================================================
		if (action === 'programs') {
			const institutionId = searchParams.get('institutionId')

			if (!institutionId) {
				return NextResponse.json({ error: 'institutionId is required' }, { status: 400 })
			}

			const { data: institution, error: instError } = await supabase
				.from('institutions')
				.select('id, institution_code, myjkkn_institution_ids')
				.eq('id', institutionId)
				.single()

			if (instError || !institution) {
				console.error('[Consolidated Marksheet API - programs] Institution not found:', instError)
				return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
			}

			const myjkknInstitutionIds: string[] = institution.myjkkn_institution_ids || []

			if (myjkknInstitutionIds.length === 0) {
				return NextResponse.json({ programs: [] })
			}

			const allPrograms: any[] = []

			for (const myjkknInstId of myjkknInstitutionIds) {
				try {
					const programs = await fetchMyJKKNProgramsCached(myjkknInstId)

					const filteredPrograms = Array.isArray(programs)
						? programs.filter((p: any) => p.institution_id === myjkknInstId && p.is_active !== false)
						: []

					allPrograms.push(...filteredPrograms)
				} catch (error) {
					console.error(`[Consolidated Marksheet API - programs] Error fetching programs for inst ${myjkknInstId}:`, error)
				}
			}

			// Deduplicate by program_code (MyJKKN uses program_id as the CODE field)
			const programMap = new Map<string, { name: string; order: number }>()
			for (const prog of allPrograms) {
				const code = prog.program_id || prog.program_code
				if (code && !programMap.has(code)) {
					programMap.set(code, {
						name: prog.program_name || prog.name || code,
						order: prog.program_order ?? prog.sort_order ?? 999
					})
				}
			}

			const programs = Array.from(programMap.entries())
				.map(([code, { name, order }]) => ({
					program_code: code,
					program_name: name,
					program_order: order
				}))
				.sort((a, b) => {
					if (a.program_order !== b.program_order) return a.program_order - b.program_order
					return a.program_code.localeCompare(b.program_code)
				})

			console.log('[Consolidated Marksheet API - programs] Returning', programs.length, 'programs')
			return NextResponse.json({ programs })
		}

		// =====================================================
		// ACTION: students
		// Distinct learners from final_marks (result_status=Published)
		// filtered by institutionId + programCode. No session filter.
		// =====================================================
		if (action === 'students') {
			const institutionId = searchParams.get('institutionId')
			const programCode = searchParams.get('programCode')

			if (!institutionId) {
				return NextResponse.json({ error: 'institutionId is required' }, { status: 400 })
			}

			// Eligibility: only return learners who have passed ALL courses across
			// all semesters (no backlogs). We fetch the same fields the marksheet
			// uses and run the per-course pass check so the filter is identical
			// to what student-marksheet enforces.
			let query = supabase
				.from('final_marks')
				.select(FINAL_MARKS_SELECT)
				.eq('institutions_id', institutionId)
				.eq('result_status', 'Published')
				.eq('is_active', true)
				.range(0, 999999)

			if (programCode) {
				query = query.eq('program_code', programCode)
			}

			const { data: fmRows, error: fmErr } = await query

			if (fmErr) {
				console.error('[Consolidated Marksheet API - students] Error:', fmErr)
				throw fmErr
			}

			// Resolve program name from MyJKKN so isPGProgram can match by name
			// (program codes like "PMA" don't start with the M/MBA/MSC prefixes, so
			//  we MUST consult the program_name pattern to classify them correctly).
			let programNameStudents = ''
			if (programCode) {
				const { data: instRow } = await supabase
					.from('institutions')
					.select('myjkkn_institution_ids')
					.eq('id', institutionId)
					.single()
				const myjkknIdsStudents: string[] = instRow?.myjkkn_institution_ids || []
				programNameStudents = await resolveProgramName(supabase, institutionId, myjkknIdsStudents, programCode)
			}

			// Determine passing % from program code+name (UG=40, PG=50)
			const isPGStudents = isPGProgram(programCode || '', programNameStudents)
			const passingPercentageStudents = isPGStudents ? 50 : 40

			// Resolve expected total semesters for this program (UG=6, PG=4 typical)
			const totalSemestersStudents = programCode
				? await resolveTotalSemesters(supabase, programCode, institutionId, isPGStudents)
				: 0

			console.log(`[Consolidated Marksheet - students] programCode=${programCode} programName=${programNameStudents} isPG=${isPGStudents} passing%=${passingPercentageStudents} totalSemesters=${totalSemestersStudents}`)

			// Group rows by student_id, then dedupe best-attempt per course
			const studentGroups: Record<string, { rows: any[]; registerNo: string; name: string }> = {}
			for (const row of (fmRows || [])) {
				const sid = row.student_id
				if (!sid) continue
				if (!studentGroups[sid]) {
					const examReg = Array.isArray(row.exam_registrations)
						? row.exam_registrations[0]
						: row.exam_registrations
					studentGroups[sid] = {
						rows: [],
						registerNo: examReg?.stu_register_no || '',
						name: examReg?.student_name || ''
					}
				}
				studentGroups[sid].rows.push(row)
			}

			// Keep only learners who have:
			//  (a) passed every attempted course, AND
			//  (b) attempted every semester of the program (1..totalSemestersStudents)
			const students: { id: string; registerNo: string; name: string }[] = []
			for (const [sid, group] of Object.entries(studentGroups)) {
				const deduped = deduplicateBestAttempt(group.rows)
				const courses = deduped
					.map(fm => processFinalMarkRow(fm, passingPercentageStudents))
					.filter((c): c is CourseResult => c !== null)
				const { eligible } = getEligibilityStatus(courses, totalSemestersStudents)
				if (!eligible) continue
				students.push({ id: sid, registerNo: group.registerNo, name: group.name })
			}

			students.sort((a, b) => a.registerNo.localeCompare(b.registerNo))

			return NextResponse.json({
				students,
				total: students.length,
				note: 'Only learners who have cleared every course are listed.'
			})
		}

		// =====================================================
		// ACTION: student-marksheet
		// Full consolidated marksheet for a single learner
		// =====================================================
		if (action === 'student-marksheet') {
			const studentId = searchParams.get('studentId')
			const institutionId = searchParams.get('institutionId')
			const programCode = searchParams.get('programCode')

			if (!studentId || !institutionId) {
				return NextResponse.json(
					{ error: 'studentId and institutionId are required' },
					{ status: 400 }
				)
			}

			// --- Fetch all Published final_marks for this student (all sessions/semesters) ---
			const { data: rawFinalMarks, error: fmError } = await supabase
				.from('final_marks')
				.select(FINAL_MARKS_SELECT)
				.eq('student_id', studentId)
				.eq('result_status', 'Published')
				.eq('is_active', true)
				.range(0, 99999)

			if (fmError) {
				console.error('[Consolidated Marksheet] Error fetching final marks:', fmError)
				throw fmError
			}

			if (!rawFinalMarks || rawFinalMarks.length === 0) {
				return NextResponse.json(
					{ error: 'No published marks found for this learner' },
					{ status: 404 }
				)
			}

			// Extract basic registration info from first row
			const examReg = Array.isArray(rawFinalMarks[0]?.exam_registrations)
				? rawFinalMarks[0]?.exam_registrations[0]
				: rawFinalMarks[0]?.exam_registrations
			const registerNo = examReg?.stu_register_no || ''
			let learnerName = examReg?.student_name || ''

			// --- Deduplicate: best attempt per course ---
			const deduped = deduplicateBestAttempt(rawFinalMarks)

			// --- Determine effective programCode (from param or first row) ---
			const effectiveProgramCode = programCode || rawFinalMarks[0]?.program_code || ''

			// --- Resolve institution's myjkkn_institution_ids ---
			const { data: institutionRow } = await supabase
				.from('institutions')
				.select('myjkkn_institution_ids')
				.eq('id', institutionId)
				.single()

			const myjkknIds: string[] = institutionRow?.myjkkn_institution_ids || []

			// --- Fetch program name (local mirror first, MyJKKN fallback) ---
			let programName = ''
			if (effectiveProgramCode) {
				programName = await resolveProgramName(supabase, institutionId, myjkknIds, effectiveProgramCode)
			}

			const isPG = isPGProgram(effectiveProgramCode, programName)
			const passingPercentage = isPG ? 50 : 40

			// --- Resolve program UUID for consolidated_results lookup ---
			let programUuid: string | null = null
			if (effectiveProgramCode) {
				programUuid = await resolveProgramUuid(supabase, effectiveProgramCode, institutionId)
			}

			// --- Fetch folio from consolidated_results ---
			let formattedFolio: string | null = null
			let lastSessionId: string | null = null
			let lastSessionName = ''
			let lastMonthYear = ''
			let lastMonth = ''
			let lastYear = ''

			if (programUuid) {
				const { data: consolidatedRow } = await supabase
					.from('consolidated_results')
					.select('formatted_folio_number, cgpa, result_class, last_examination_session_id')
					.eq('student_id', studentId)
					.eq('institutions_id', institutionId)
					.eq('program_id', programUuid)
					.single()

				if (consolidatedRow) {
					formattedFolio = consolidatedRow.formatted_folio_number || null
					lastSessionId = consolidatedRow.last_examination_session_id || null
				}
			}

			// --- Determine last examination session from marks (all unique session ids) ---
			// Fallback: pick the session with the highest semester or latest created_at
			const sessionIds = [...new Set(rawFinalMarks.map((r: any) => r.examination_session_id).filter(Boolean))]

			if (!lastSessionId && sessionIds.length > 0) {
				// Use the last session from which marks exist (highest semester)
				// Find max semester across rows per session
				const sessionMaxSemester: Record<string, number> = {}
				for (const fm of rawFinalMarks) {
					const sid = fm.examination_session_id
					if (!sid) continue
					const sem = fm.course_offerings?.semester || 0
					sessionMaxSemester[sid] = Math.max(sessionMaxSemester[sid] || 0, sem)
				}
				const maxSem = Math.max(...Object.values(sessionMaxSemester))
				const candidateSessions = Object.entries(sessionMaxSemester)
					.filter(([, sem]) => sem === maxSem)
					.map(([sid]) => sid)
				lastSessionId = candidateSessions[0] || sessionIds[sessionIds.length - 1]
			}

			// --- Fetch last session details ---
			if (lastSessionId) {
				const { data: sessionRow } = await supabase
					.from('examination_sessions')
					.select('session_name, month_year, exam_start_date')
					.eq('id', lastSessionId)
					.single()
				if (sessionRow) {
					lastSessionName = sessionRow.session_name || ''
					lastMonthYear = sessionRow.month_year || ''
					// Parse month/year from exam_start_date or month_year
					if (sessionRow.exam_start_date) {
						const d = new Date(sessionRow.exam_start_date)
						if (!isNaN(d.getTime())) {
							lastMonth = d.toLocaleString('en-US', { month: 'long' })
							lastYear = String(d.getFullYear())
						}
					}
				}
			}

			// --- Fetch learner profile from MyJKKN ---
			let dateOfBirth: string | null = null
			let photoUrl: string | null = null
			let learnerExtendedInfo: {
				firstName?: string
				lastName?: string
				fatherName?: string
				motherName?: string
				gender?: string
				admissionYear?: string
			} = {}

			if (registerNo) {
				console.log(`[Consolidated Marksheet] ===== LEARNER PROFILE LOOKUP =====`)
				console.log(`[Consolidated Marksheet] registerNo: "${registerNo}"`)

				try {
					const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
					const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

					let matchingProfile: any = null

					if (myjkknApiKey && myjkknIds.length > 0) {
						for (const myjkknInstId of myjkknIds) {
							if (matchingProfile) break

							let page = 1
							const pageSize = 1000
							let hasMorePages = true

							while (hasMorePages && !matchingProfile) {
								const profileParams = new URLSearchParams()
								profileParams.set('institution_id', myjkknInstId)
								profileParams.set('limit', String(pageSize))
								profileParams.set('page', String(page))

								const profileResponse = await fetch(
									`${myjkknApiUrl}/api-management/learners/profiles?${profileParams.toString()}`,
									{
										method: 'GET',
										headers: {
											'Authorization': `Bearer ${myjkknApiKey}`,
											'Accept': 'application/json',
											'Content-Type': 'application/json',
										},
										cache: 'no-store',
									}
								)

								if (profileResponse.ok) {
									const profileData = await profileResponse.json()
									const profiles = profileData.data || []

									matchingProfile = profiles.find((p: any) =>
										p.register_number === registerNo
									)

									hasMorePages = profiles.length === pageSize
									page++
								} else {
									hasMorePages = false
								}
							}
						}
					} else if (!myjkknApiKey) {
						console.log('[Consolidated Marksheet] No MyJKKN API key configured')
					}

					// Targeted fallback: if pagination didn't find the learner
					// (e.g. they're filed under a different MyJKKN institution_id),
					// hit the endpoint with ?register_number= directly.
					if (!matchingProfile && myjkknApiKey && registerNo) {
						console.log(`[Consolidated Marksheet] Pagination missed ${registerNo} — running targeted register_number lookup`)
						try {
							const targetParams = new URLSearchParams()
							targetParams.set('register_number', registerNo)
							targetParams.set('limit', '200')
							const targetResp = await fetch(
								`${myjkknApiUrl}/api-management/learners/profiles?${targetParams.toString()}`,
								{
									method: 'GET',
									headers: {
										'Authorization': `Bearer ${myjkknApiKey}`,
										'Accept': 'application/json',
										'Content-Type': 'application/json',
									},
									cache: 'no-store',
								}
							)
							if (targetResp.ok) {
								const targetData = await targetResp.json()
								const targetProfiles = targetData.data || []
								// IMPORTANT: only accept an exact register_number match.
								// Do NOT fall back to targetProfiles[0] — MyJKKN's
								// register_number query sometimes returns unrelated
								// profiles when no exact match exists, and picking
								// the first one would attach a stranger's data
								// (name, DOB, photo) to the wrong learner.
								matchingProfile = targetProfiles.find((p: any) =>
									p.register_number === registerNo
								) || null
								if (matchingProfile) {
									console.log(`[Consolidated Marksheet] Targeted lookup found profile for ${registerNo}`)
								}
							}
						} catch (e) {
							console.warn(`[Consolidated Marksheet] Targeted lookup error for ${registerNo}:`, e)
						}
					}

					if (matchingProfile) {
						const profilePhotoUrl = matchingProfile.student_photo_url ||
							matchingProfile.photo_url ||
							matchingProfile.profile_photo ||
							matchingProfile.image_url
						if (profilePhotoUrl) photoUrl = profilePhotoUrl

						if (matchingProfile.date_of_birth) {
							const dob = new Date(matchingProfile.date_of_birth)
							const dobYear = dob.getFullYear()
							if (!isNaN(dob.getTime()) && dobYear >= 1900 && dobYear <= 2050) {
								dateOfBirth = `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${dobYear}`
							}
						}

						learnerExtendedInfo = {
							firstName: matchingProfile.first_name || undefined,
							lastName: matchingProfile.last_name || undefined,
							fatherName: matchingProfile.father_name || undefined,
							motherName: matchingProfile.mother_name || undefined,
							gender: matchingProfile.gender || undefined,
							admissionYear: matchingProfile.admission_year?.toString() || undefined
						}

						const myjkknFullName = matchingProfile.student_name || matchingProfile.full_name || ''
						const constructedName = myjkknFullName ||
							[matchingProfile.first_name, matchingProfile.last_name].filter(Boolean).join(' ')
						if (constructedName) learnerName = constructedName
					} else {
						console.log(`[Consolidated Marksheet] No matching profile found in MyJKKN for: ${registerNo}`)
					}
				} catch (myjkknError) {
					console.error('[Consolidated Marksheet] MyJKKN API error (non-critical):', myjkknError)
				}

				// Fallback: local learners_profiles mirror
				if (!photoUrl || !dateOfBirth) {
					try {
						const { data: lpRows } = await supabase
							.from('learners_profiles')
							.select('first_name, last_name, date_of_birth, student_photo_url')
							.eq('register_number', registerNo)
							.limit(1)
						const lp: any = lpRows?.[0]
						if (lp) {
							if (!photoUrl && lp.student_photo_url) photoUrl = lp.student_photo_url
							if (!dateOfBirth && lp.date_of_birth) {
								const dob = new Date(lp.date_of_birth)
								if (!isNaN(dob.getTime())) {
									dateOfBirth = `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${dob.getFullYear()}`
								}
							}
							if (!learnerName) {
								const nm = [lp.first_name, lp.last_name].filter(Boolean).join(' ')
								if (nm) learnerName = nm
							}
							console.log(`[Consolidated Marksheet] Filled photo/DOB from local learners_profiles mirror for ${registerNo}`)
						}
					} catch (lpErr) {
						console.warn('[Consolidated Marksheet] learners_profiles fallback error (non-critical):', lpErr)
					}
				}
			}

			// --- Process and sort courses ---
			const courses: CourseResult[] = deduped
				.map(fm => processFinalMarkRow(fm, passingPercentage))
				.filter((c): c is CourseResult => c !== null)

			// Sort: semester ASC → part order → courseOrder
			courses.sort((a, b) => {
				const semDiff = a.semester - b.semester
				if (semDiff !== 0) return semDiff
				const partDiff = getPartOrder(a.part) - getPartOrder(b.part)
				if (partDiff !== 0) return partDiff
				return a.courseOrder - b.courseOrder
			})

			// --- Eligibility gate ---
			// Consolidated marksheet is issued ONLY when:
			//   (a) every attempted course is passed (no backlogs), AND
			//   (b) every semester of the program has been attempted (program complete).
			const totalSemestersStudent = effectiveProgramCode
				? await resolveTotalSemesters(supabase, effectiveProgramCode, institutionId, isPG)
				: 0

			const eligibility = getEligibilityStatus(courses, totalSemestersStudent)
			if (!eligibility.eligible) {
				const reasonParts: string[] = []
				if (eligibility.failedCount > 0) {
					reasonParts.push(`${eligibility.failedCount} course(s) not cleared`)
				}
				if (eligibility.missingSemesters.length > 0) {
					const romans = eligibility.missingSemesters.map(s => {
						const map: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII' }
						return map[s] || String(s)
					})
					reasonParts.push(`semester(s) ${romans.join(', ')} not yet attempted`)
				}

				return NextResponse.json(
					{
						error: `Learner is not eligible for a consolidated marksheet — ${reasonParts.join(' and ')}.`,
						eligible: false,
						failedCount: eligibility.failedCount,
						failedCourses: eligibility.failedCourses,
						missingSemesters: eligibility.missingSemesters,
						semestersAttempted: eligibility.semestersAttempted,
						totalSemesters: totalSemestersStudent,
						student: { id: studentId, name: learnerName, registerNo }
					},
					{ status: 422 }
				)
			}

			const partBreakdown = buildPartBreakdown(courses)
			const summary = computeSummary(courses, formattedFolio)

			// Cumulative GRADE + CLASSIFICATION from the cgpa_grade_system table.
			// Exemplary/Distinction only for first-appearance passes (no arrears).
			const firstAppearance = !hasArrearHistory(rawFinalMarks, passingPercentage)
			const cgpaBands = await fetchCgpaBands(supabase, institutionId, isPG)
			const { cumulativeGrade, classification: cumulativeClassification } = resolveCumulativeGrade(cgpaBands, summary.cgpa, firstAppearance)
			const summaryWithGrade = { ...summary, cumulativeGrade, classification: cumulativeClassification }

			return NextResponse.json({
				eligible: true,
				student: {
					id: studentId,
					name: learnerName,
					firstName: learnerExtendedInfo.firstName,
					lastName: learnerExtendedInfo.lastName,
					registerNo,
					dateOfBirth,
					photoUrl,
					fatherName: learnerExtendedInfo.fatherName,
					motherName: learnerExtendedInfo.motherName,
					gender: learnerExtendedInfo.gender,
					admissionYear: learnerExtendedInfo.admissionYear
				},
				program: {
					code: effectiveProgramCode,
					name: programName,
					isPG
				},
				lastAppearance: {
					sessionId: lastSessionId,
					sessionName: lastSessionName,
					monthYear: lastMonthYear,
					month: lastMonth,
					year: lastYear
				},
				courses,
				partBreakdown,
				summary: summaryWithGrade,
				generatedDate: new Date().toLocaleDateString('en-IN', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric'
				})
			})
		}

		// =====================================================
		// ACTION: batch-marksheet
		// Full consolidated marksheets for all learners in a
		// program (institutionId + programCode required).
		// =====================================================
		if (action === 'batch-marksheet') {
			const institutionId = searchParams.get('institutionId')
			const programCode = searchParams.get('programCode')

			if (!institutionId) {
				return NextResponse.json({ error: 'institutionId is required' }, { status: 400 })
			}

			// --- Build cohort: distinct student_ids from Published final_marks ---
			let cohortQuery = supabase
				.from('final_marks')
				.select('student_id')
				.eq('institutions_id', institutionId)
				.eq('result_status', 'Published')
				.eq('is_active', true)
				.range(0, 999999)

			if (programCode) {
				cohortQuery = cohortQuery.eq('program_code', programCode)
			}

			const { data: cohortRows, error: cohortError } = await cohortQuery
			if (cohortError) throw cohortError

			const allStudentIds = [...new Set((cohortRows || []).map((r: any) => r.student_id).filter(Boolean))]

			if (allStudentIds.length === 0) {
				return NextResponse.json({ marksheets: [], total: 0 })
			}

			console.log(`[Consolidated Marksheet Batch] Cohort size: ${allStudentIds.length}`)

			// --- Fetch all Published final_marks for the cohort in chunks ---
			// (chunks of 40 to avoid URL truncation at PostgREST)
			const FM_CHUNK_SIZE = 40
			const idChunks: string[][] = []
			for (let i = 0; i < allStudentIds.length; i += FM_CHUNK_SIZE) {
				idChunks.push(allStudentIds.slice(i, i + FM_CHUNK_SIZE))
			}

			const fmChunkResults = await Promise.all(
				idChunks.map(chunk =>
					supabase
						.from('final_marks')
						.select(FINAL_MARKS_SELECT)
						.in('student_id', chunk)
						.eq('result_status', 'Published')
						.eq('is_active', true)
						.range(0, 999999)
				)
			)

			const fmChunkError = fmChunkResults.find(r => r.error)?.error
			if (fmChunkError) throw fmChunkError

			const allFinalMarks = fmChunkResults.flatMap(r => r.data || [])
			console.log(`[Consolidated Marksheet Batch] Fetched ${allFinalMarks.length} final_marks rows across ${idChunks.length} chunks`)

			// --- Institution myjkkn_institution_ids ---
			const { data: institutionRow } = await supabase
				.from('institutions')
				.select('myjkkn_institution_ids')
				.eq('id', institutionId)
				.single()

			const myjkknIds: string[] = institutionRow?.myjkkn_institution_ids || []

			// --- Program name + PG detection ---
			const effectiveProgramCode = programCode || ''
			let batchProgramName = ''
			if (effectiveProgramCode) {
				batchProgramName = await resolveProgramName(supabase, institutionId, myjkknIds, effectiveProgramCode)
			}
			const batchIsPG = isPGProgram(effectiveProgramCode, batchProgramName)
			const batchPassingPercentage = batchIsPG ? 50 : 40

			// --- Resolve program UUID for consolidated_results lookup ---
			let programUuid: string | null = null
			if (effectiveProgramCode) {
				programUuid = await resolveProgramUuid(supabase, effectiveProgramCode, institutionId)
			}

			// --- Resolve expected total semesters for eligibility (program complete check) ---
			const totalSemestersBatch = effectiveProgramCode
				? await resolveTotalSemesters(supabase, effectiveProgramCode, institutionId, batchIsPG)
				: 0

			// --- Kick off consolidated_results folio fetch concurrently ---
			const folioMap: Record<string, string | null> = {}
			const consolidatedFolioPromise: Promise<void> = (async () => {
				if (!programUuid || allStudentIds.length === 0) return
				const { data: crRows, error: crErr } = await supabase
					.from('consolidated_results')
					.select('student_id, formatted_folio_number')
					.in('student_id', allStudentIds)
					.eq('institutions_id', institutionId)
					.eq('program_id', programUuid)
					.range(0, 999999)
				if (crErr) {
					console.error('[Consolidated Marksheet Batch] consolidated_results error:', crErr)
					return
				}
				for (const row of (crRows || [])) {
					folioMap[row.student_id] = row.formatted_folio_number || null
				}
			})()

			// --- Group final_marks by student ---
			const studentRawMap: Record<string, { rows: any[]; registerNo: string; name: string }> = {}
			for (const fm of allFinalMarks) {
				const sid = fm.student_id
				if (!sid) continue
				if (!studentRawMap[sid]) {
					const examReg = Array.isArray(fm.exam_registrations)
						? fm.exam_registrations[0]
						: fm.exam_registrations
					studentRawMap[sid] = {
						rows: [],
						registerNo: examReg?.stu_register_no || '',
						name: examReg?.student_name || ''
					}
				}
				studentRawMap[sid].rows.push(fm)
			}

			// --- Fetch photo/DOB/name maps from MyJKKN ---
			const registerNumbers = Object.values(studentRawMap).map(s => s.registerNo).filter(Boolean)
			const { photoMap, dobMap, nameMap, extInfoMap } = await fetchMyJKKNProfileMaps(myjkknIds, registerNumbers)

			// Fallback from local mirror
			await fillFromLocalProfiles(supabase, registerNumbers, photoMap, dobMap, nameMap)

			console.log(`[Consolidated Marksheet Batch] Photo/DOB/Name enrichment: ${Object.keys(photoMap).length} photos, ${Object.keys(dobMap).length} DOBs, ${Object.keys(nameMap).length} names`)

			// --- Await folio promise ---
			await consolidatedFolioPromise

			// --- Cumulative-grade bands (fetched once, reused per learner) ---
			const batchCgpaBands = await fetchCgpaBands(supabase, institutionId, batchIsPG)

			// --- Build individual marksheets, skipping ineligible learners ---
			const marksheets: any[] = []
			const skippedLearners: { id: string; registerNo: string; name: string; failedCount: number }[] = []

			for (const [sid, student] of Object.entries(studentRawMap)) {
				const deduped = deduplicateBestAttempt(student.rows)

				const courses: CourseResult[] = deduped
					.map(fm => processFinalMarkRow(fm, batchPassingPercentage))
					.filter((c): c is CourseResult => c !== null)

				// Eligibility gate — skip learners with any backlog OR incomplete program
				const { eligible, failedCount, missingSemesters } = getEligibilityStatus(courses, totalSemestersBatch)
				if (!eligible) {
					skippedLearners.push({
						id: sid,
						registerNo: student.registerNo,
						name: student.name,
						failedCount,
						missingSemesters
					} as any)
					continue
				}

				// Sort: semester ASC → part order → courseOrder
				courses.sort((a, b) => {
					const semDiff = a.semester - b.semester
					if (semDiff !== 0) return semDiff
					const partDiff = getPartOrder(a.part) - getPartOrder(b.part)
					if (partDiff !== 0) return partDiff
					return a.courseOrder - b.courseOrder
				})

				const partBreakdown = buildPartBreakdown(courses)
				const folio = folioMap[sid] ?? null
				const summary = computeSummary(courses, folio)
				// Exemplary/Distinction only for first-appearance passes (no arrears)
				const batchFirstAppearance = !hasArrearHistory(student.rows, batchPassingPercentage)
				const { cumulativeGrade, classification: cumulativeClassification } = resolveCumulativeGrade(batchCgpaBands, summary.cgpa, batchFirstAppearance)
				const summaryWithGrade = { ...summary, cumulativeGrade, classification: cumulativeClassification }
				const ext = extInfoMap[student.registerNo] || {}

				const maxSem = Math.max(...courses.map(c => c.semester), 0)

				marksheets.push({
					student: {
						id: sid,
						name: nameMap[student.registerNo] || student.name,
						firstName: ext.firstName,
						lastName: ext.lastName,
						registerNo: student.registerNo,
						dateOfBirth: dobMap[student.registerNo] || null,
						photoUrl: photoMap[student.registerNo] || null,
						fatherName: ext.fatherName,
						motherName: ext.motherName,
						gender: ext.gender,
						admissionYear: ext.admissionYear
					},
					program: {
						code: effectiveProgramCode,
						name: batchProgramName || effectiveProgramCode,
						isPG: batchIsPG
					},
					lastAppearance: {
						sessionId: null,
						sessionName: '',
						monthYear: '',
						month: '',
						year: '',
						maxSemester: maxSem
					},
					courses,
					partBreakdown,
					summary: summaryWithGrade
				})
			}

			// Sort by register number
			marksheets.sort((a, b) =>
				a.student.registerNo.localeCompare(b.student.registerNo)
			)

			console.log(`[Consolidated Marksheet Batch] eligible=${marksheets.length} skipped=${skippedLearners.length}`)

			return NextResponse.json({
				marksheets,
				total: marksheets.length,
				skipped: skippedLearners.length,
				skippedLearners
			})
		}

		// =====================================================
		// ACTION: university-data-export
		// Excel (.xlsx) in the university degree-data upload format.
		// One row per consolidated_results record for the selected
		// institution + program.
		//   NEW_CODE  <- institutions.code
		//   REG_NO / MAJ_PER (cgpa) / MAJ_CLSS_E (part_a_classification) /
		//     YR_COMP (last_appearance_month + year)  <- consolidated_results
		//   ENG_NAME / GENDER  <- MyJKKN learners/profiles
		//   E_DEGNAME / E_BRANCHNA / DEGREE  <- MyJKKN programs
		//   TAMIL_NAME / T_INITIAL / MEDIUM  <- no source, emitted blank
		// =====================================================
		if (action === 'university-data-export') {
			const institutionId = searchParams.get('institutionId')
			const programCode = searchParams.get('programCode')

			if (!institutionId || !programCode) {
				return NextResponse.json(
					{ error: 'institutionId and programCode are required' },
					{ status: 400 }
				)
			}

			// --- Institution: NEW_CODE (institutions.code) + MyJKKN ids ---
			// select('*') so we read `code` when present without crashing the
			// query if the column is absent in a given deployment.
			const { data: inst, error: instErr } = await supabase
				.from('institutions')
				.select('*')
				.eq('id', institutionId)
				.single()

			if (instErr) {
				console.error('[University Data Export] Institution lookup error:', instErr)
				return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
			}

			const newCode = (inst as any)?.code || inst?.institution_code || ''
			const myjkknIds: string[] = inst?.myjkkn_institution_ids || []

			// --- Resolve program UUID (fallback to program_code filter) ---
			const programUuid = await resolveProgramUuid(supabase, programCode, institutionId)

			// --- Consolidated results for the cohort ---
			let crQuery = supabase
				.from('consolidated_results')
				.select('register_number, cgpa, result_class, part_a_classification, last_appearance_month, last_appearance_year')
				.eq('institutions_id', institutionId)
				.eq('is_active', true)
				.order('register_number', { ascending: true })
				.range(0, 999999)

			if (programUuid) {
				crQuery = crQuery.eq('program_id', programUuid)
			} else {
				crQuery = crQuery.eq('program_code', programCode)
			}

			const { data: crRows, error: crErr } = await crQuery
			if (crErr) {
				console.error('[University Data Export] consolidated_results error:', crErr)
				throw crErr
			}

			const consolidatedRows = crRows || []
			if (consolidatedRows.length === 0) {
				return NextResponse.json(
					{ error: 'No consolidated results found for the selected institution and program. Generate consolidated results first.' },
					{ status: 404 }
				)
			}

			// --- Degree / branch / medium from LOCAL tables (no MyJKKN) ---
			//   For a program name like "M.Sc. MATHEMATICS":
			//   E_DEGNAME  <- degrees.degree_name ("MASTER OF SCIENCE"), via degree_id/degree_code
			//   E_BRANCHNA <- program name minus the degree prefix ("MATHEMATICS")
			//   DEGREE     <- programs.program_name (full, e.g. "M.Sc. MATHEMATICS")
			//   MEDIUM     <- ENGLISH by default, TAMIL for a Tamil program
			let degreeName = ''
			let programName = ''
			let branchName = ''
			let medium = 'ENGLISH'
			{
				const { data: progRow } = await supabase
					.from('programs')
					.select('program_name, degree_code, degree_id')
					.eq('program_code', programCode)
					.eq('institutions_id', institutionId)
					.maybeSingle()

				programName = (progRow?.program_name || '').trim()
				const degreeCode = progRow?.degree_code || ''
				const degreeId = (progRow as any)?.degree_id || null

				// Load the institution's degrees (fall back to institution_code scope)
				let degList: any[] = []
				const { data: byInst } = await supabase
					.from('degrees')
					.select('id, degree_code, degree_name')
					.eq('institutions_id', institutionId)
				degList = byInst || []
				if (degList.length === 0 && inst?.institution_code) {
					const { data: byCode } = await supabase
						.from('degrees')
						.select('id, degree_code, degree_name')
						.eq('institution_code', inst.institution_code)
					degList = byCode || []
				}

				const normalize = (s: string) => (s || '').replace(/[^a-z0-9]/gi, '').toLowerCase()

				// E_DEGNAME: match by degree_id, then degree_code, then by the
				// degree abbreviation that prefixes the program name.
				let degRow: any = null
				if (degreeId) degRow = degList.find(d => d.id === degreeId)
				if (!degRow && degreeCode) {
					degRow = degList.find(d => normalize(d.degree_code) === normalize(degreeCode))
				}
				if (!degRow && programName) {
					const normName = normalize(programName)
					const candidates = degList
						.filter(d => d.degree_code && normName.startsWith(normalize(d.degree_code)))
						.sort((a, b) => normalize(b.degree_code).length - normalize(a.degree_code).length)
					degRow = candidates[0] || null
				}
				degreeName = (degRow?.degree_name || '').toUpperCase()

				// E_BRANCHNA = program name minus the degree abbreviation
				// (use the matched degree's code when available)
				const effectiveDegreeCode = degRow?.degree_code || degreeCode
				branchName = stripDegreePrefix(programName, effectiveDegreeCode).toUpperCase()

				// MEDIUM: Tamil program -> TAMIL, else ENGLISH
				if (/tamil/i.test(programName)) medium = 'TAMIL'
			}

			// --- ENG_NAME + GENDER (first_name, last_name, gender) ---
			// Perf: the local learners_profiles mirror (an indexed copy of the
			// MyJKKN learners/profiles data) is queried FIRST. Full MyJKKN
			// pagination over a whole institution takes ~90s, so it is only used
			// as a targeted, parallel fallback for register numbers the mirror
			// doesn't have.
			const registerNumbers = consolidatedRows
				.map((r: any) => r.register_number)
				.filter(Boolean)
			const extInfoMap: Record<string, { firstName?: string; lastName?: string; gender?: string }> = {}

			// 1. Local mirror (fast, chunked)
			{
				const LP_CHUNK = 100
				for (let i = 0; i < registerNumbers.length; i += LP_CHUNK) {
					const chunk = registerNumbers.slice(i, i + LP_CHUNK)
					const { data: lpRows, error: lpErr } = await supabase
						.from('learners_profiles')
						.select('register_number, first_name, last_name, gender')
						.in('register_number', chunk)
					if (lpErr) {
						if (lpErr.code === 'PGRST205') break // mirror table absent
						console.warn('[University Data Export] learners_profiles error:', lpErr)
						break
					}
					for (const lp of (lpRows || [])) {
						if (!lp.register_number) continue
						extInfoMap[lp.register_number] = {
							firstName: lp.first_name || undefined,
							lastName: lp.last_name || undefined,
							gender: lp.gender || undefined
						}
					}
				}
			}

			// 1.5 Local COE students table (register_number, first_name, last_name, gender).
			// Covers graduated learners that neither the mirror nor MyJKKN's active
			// profiles API returns.
			const missingAfterMirror = registerNumbers.filter(rn => {
				const e = extInfoMap[rn]
				return !e || (!e.firstName && !e.lastName) || !e.gender
			})
			if (missingAfterMirror.length > 0) {
				const ST_CHUNK = 100
				for (let i = 0; i < missingAfterMirror.length; i += ST_CHUNK) {
					const chunk = missingAfterMirror.slice(i, i + ST_CHUNK)
					const { data: stRows, error: stErr } = await supabase
						.from('students')
						.select('register_number, first_name, last_name, gender')
						.in('register_number', chunk)
					if (stErr) {
						console.warn('[University Data Export] students fallback error:', stErr)
						break
					}
					for (const st of (stRows || [])) {
						if (!st.register_number) continue
						const e = extInfoMap[st.register_number] || {}
						extInfoMap[st.register_number] = {
							firstName: e.firstName || st.first_name || undefined,
							lastName: e.lastName || st.last_name || undefined,
							gender: e.gender || st.gender || undefined
						}
					}
				}
			}

			// 2. MyJKKN targeted fallback for anyone still missing name/gender
			const stillMissing = registerNumbers.filter(rn => {
				const e = extInfoMap[rn]
				return !e || (!e.firstName && !e.lastName) || !e.gender
			})
			if (stillMissing.length > 0 && myjkknIds.length > 0) {
				const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
				const myjkknApiKey = process.env.MYJKKN_API_KEY || ''
				if (myjkknApiKey) {
					const CONCURRENCY = 6
					for (let i = 0; i < stillMissing.length; i += CONCURRENCY) {
						const batch = stillMissing.slice(i, i + CONCURRENCY)
						await Promise.all(batch.map(async (regNo) => {
							try {
								const p = new URLSearchParams()
								p.set('register_number', regNo)
								p.set('limit', '200')
								const resp = await fetch(
									`${myjkknApiUrl}/api-management/learners/profiles?${p.toString()}`,
									{
										method: 'GET',
										headers: {
											'Authorization': `Bearer ${myjkknApiKey}`,
											'Accept': 'application/json',
											'Content-Type': 'application/json',
										},
										cache: 'no-store',
									}
								)
								if (!resp.ok) return
								const json = await resp.json()
								const profiles: any[] = json.data || []
								// Only accept an exact register_number match
								const match = profiles.find((pp: any) => pp.register_number === regNo)
								if (match) {
									const e = extInfoMap[regNo] || {}
									extInfoMap[regNo] = {
										firstName: e.firstName || match.first_name || undefined,
										lastName: e.lastName || match.last_name || undefined,
										gender: e.gender || match.gender || undefined
									}
								}
							} catch (e) {
								console.warn(`[University Data Export] targeted profile lookup failed for ${regNo}:`, e)
							}
						}))
					}
				}
			}

			// --- Build rows ---
			const excelRows: UniversityDataRow[] = consolidatedRows.map((r: any) => {
				const ext = extInfoMap[r.register_number] || {}
				// ENG_NAME = learners_profile.first_name + last_name
				const engName = [ext.firstName, ext.lastName].filter(Boolean).join(' ').toUpperCase()
				const yrComp = [r.last_appearance_month, r.last_appearance_year]
					.filter(v => v !== null && v !== undefined && v !== '')
					.join(' ')
				return {
					NEW_CODE: newCode,
					REG_NO: r.register_number || '',
					// MAJ_PER = overall CGPA as a numeric cell (per user mapping)
					MAJ_PER: r.cgpa !== null && r.cgpa !== undefined ? Number(r.cgpa) : '',
					// MAJ_CLSS_E = Part A classification (uppercase); fall back to overall result_class
					MAJ_CLSS_E: (r.part_a_classification || r.result_class || '').toString().toUpperCase(),
					YR_COMP: yrComp,
					E_DEGNAME: degreeName,
					E_BRANCHNA: branchName,
					ENG_NAME: engName,
					TAMIL_NAME: '',
					T_INITIAL: '',
					// DEGREE = full program name (e.g. "M.Sc. MATHEMATICS")
					DEGREE: programName,
					MEDIUM: medium,
					GENDER: (ext.gender || '').toString().toUpperCase()
				}
			})

			const buffer = await generateUniversityDataExcel(excelRows)
			const filename = `University_Data_${programCode}_${consolidatedRows.length}.xlsx`

			return new NextResponse(new Uint8Array(buffer), {
				status: 200,
				headers: {
					'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
					'Content-Disposition': `attachment; filename="${filename}"`,
					'Cache-Control': 'no-store'
				}
			})
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

	} catch (error) {
		console.error('[Consolidated Marksheet API] Unhandled error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Failed to process request' },
			{ status: 500 }
		)
	}
}

// =====================================================
// POST HANDLER — for write actions
// Action: generate
// Writes consolidated_results rows for the selected eligible learners
// and assigns folio numbers via bulk_assign_consolidated_folio_numbers RPC.
// =====================================================

export async function POST(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()
		const action = body.action

		if (action !== 'generate') {
			return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
		}

		const institutionId: string | undefined = body.institutionId
		const programCode: string | undefined = body.programCode
		const studentIds: string[] | undefined = Array.isArray(body.studentIds) ? body.studentIds : undefined

		if (!institutionId || !programCode) {
			return NextResponse.json(
				{ error: 'institutionId and programCode are required' },
				{ status: 400 }
			)
		}

		// Resolve institution + MyJKKN id mapping for program name lookup
		const { data: institutionRow } = await supabase
			.from('institutions')
			.select('myjkkn_institution_ids')
			.eq('id', institutionId)
			.single()
		const myjkknIds: string[] = institutionRow?.myjkkn_institution_ids || []

		let programName = await resolveProgramName(supabase, institutionId, myjkknIds, programCode)

		const isPG = isPGProgram(programCode, programName)
		const passingPercentage = isPG ? 50 : 40
		const programType: 'UG' | 'PG' = isPG ? 'PG' : 'UG'

		// Resolve program UUID — auto-create local mirror row if missing.
		// Programs in this app live in MyJKKN; the local `programs` table is a
		// thin reference target for consolidated_results.program_id FK.
		let programUuid = await resolveProgramUuid(supabase, programCode, institutionId)
		if (!programUuid) {
			const { data: created, error: createErr } = await supabase
				.from('programs')
				.insert({
					institutions_id: institutionId,
					program_code: programCode,
					program_name: programName || programCode,
					program_type: programType,
					program_duration_yrs: isPG ? 2 : 3,
					is_active: true
				})
				.select('id')
				.single()
			if (createErr) {
				console.error('[Consolidated Generate] Failed to auto-create programs row:', createErr)
				return NextResponse.json(
					{ error: 'Program not found in local mirror and auto-create failed', detail: createErr.message },
					{ status: 500 }
				)
			}
			programUuid = created.id
			console.log(`[Consolidated Generate] Auto-created programs row for ${programCode} → ${programUuid}`)
		}
		const totalSemesters = await resolveTotalSemesters(supabase, programCode, institutionId, isPG)

		// Fetch final_marks for the cohort
		let fmQuery = supabase
			.from('final_marks')
			.select(FINAL_MARKS_SELECT)
			.eq('institutions_id', institutionId)
			.eq('program_code', programCode)
			.eq('result_status', 'Published')
			.eq('is_active', true)
			.range(0, 999999)

		if (studentIds && studentIds.length > 0) {
			fmQuery = fmQuery.in('student_id', studentIds)
		}

		const { data: fmRows, error: fmErr } = await fmQuery
		if (fmErr) throw fmErr

		// Group by student
		const studentGroups: Record<string, { rows: any[]; registerNo: string; name: string }> = {}
		for (const row of (fmRows || [])) {
			const sid = row.student_id
			if (!sid) continue
			if (!studentGroups[sid]) {
				const examReg = Array.isArray(row.exam_registrations)
					? row.exam_registrations[0]
					: row.exam_registrations
				studentGroups[sid] = {
					rows: [],
					registerNo: examReg?.stu_register_no || '',
					name: examReg?.student_name || ''
				}
			}
			studentGroups[sid].rows.push(row)
		}

		// Per-learner compute + upsert
		const generated: { id: string; studentId: string; registerNo: string; name: string }[] = []
		const skipped: { studentId: string; registerNo: string; reason: string }[] = []
		const generatedRowIds: string[] = []

		for (const [sid, group] of Object.entries(studentGroups)) {
			const deduped = deduplicateBestAttempt(group.rows)
			const courses = deduped
				.map(fm => processFinalMarkRow(fm, passingPercentage))
				.filter((c): c is CourseResult => c !== null)

			const { eligible, failedCount, missingSemesters } = getEligibilityStatus(courses, totalSemesters)
			if (!eligible) {
				skipped.push({
					studentId: sid,
					registerNo: group.registerNo,
					reason: failedCount > 0
						? `${failedCount} backlog(s)`
						: `missing semester(s) ${missingSemesters.join(', ')}`
				})
				continue
			}

			const partBreakdown = buildPartBreakdown(courses)
			const summary = computeSummary(courses, null)

			// Determine last appearance session
			let lastSessionId: string | null = null
			let lastMonth = ''
			let lastYear = 0
			const sessionMaxSemester: Record<string, { semester: number; sess: any }> = {}
			for (const fm of deduped) {
				const sid2 = fm.examination_session_id
				if (!sid2) continue
				const sem = fm.course_offerings?.semester || 0
				const sess = Array.isArray(fm.examination_sessions)
					? fm.examination_sessions[0]
					: fm.examination_sessions
				const prev = sessionMaxSemester[sid2]
				if (!prev || sem > prev.semester) {
					sessionMaxSemester[sid2] = { semester: sem, sess }
				}
			}
			const sortedSessions = Object.entries(sessionMaxSemester)
				.sort(([, a], [, b]) => b.semester - a.semester)
			if (sortedSessions.length > 0) {
				const [topId, { sess }] = sortedSessions[0]
				lastSessionId = topId
				if (sess?.exam_start_date) {
					const d = new Date(sess.exam_start_date)
					if (!isNaN(d.getTime())) {
						lastMonth = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
						lastYear = d.getFullYear()
					}
				}
			}

			// Build part columns (UG: I-V, PG: A-B)
			const partColMap: Record<string, { credits: number; cgpa: number | null; classification: string | null }> = {}
			for (const p of partBreakdown) {
				partColMap[p.partName] = {
					credits: p.creditsEarned,
					cgpa: p.partCGPA || null,
					classification: p.classification || null
				}
			}
			const partRow = {
				part_i_credits_earned: partColMap['Part I']?.credits || 0,
				part_i_cgpa: partColMap['Part I']?.cgpa,
				part_i_classification: partColMap['Part I']?.classification,
				part_ii_credits_earned: partColMap['Part II']?.credits || 0,
				part_ii_cgpa: partColMap['Part II']?.cgpa,
				part_ii_classification: partColMap['Part II']?.classification,
				part_iii_credits_earned: partColMap['Part III']?.credits || 0,
				part_iii_cgpa: partColMap['Part III']?.cgpa,
				part_iii_classification: partColMap['Part III']?.classification,
				part_iv_credits_earned: partColMap['Part IV']?.credits || 0,
				part_iv_cgpa: partColMap['Part IV']?.cgpa,
				part_iv_classification: partColMap['Part IV']?.classification,
				part_v_credits_earned: partColMap['Part V']?.credits || 0,
				part_v_cgpa: partColMap['Part V']?.cgpa,
				part_v_classification: partColMap['Part V']?.classification,
				part_a_credits_earned: partColMap['Part A']?.credits || 0,
				part_a_cgpa: partColMap['Part A']?.cgpa,
				part_a_classification: partColMap['Part A']?.classification,
				part_b_credits_earned: partColMap['Part B']?.credits || 0,
				part_b_cgpa: partColMap['Part B']?.cgpa,
				part_b_classification: partColMap['Part B']?.classification
			}

			const upsertRow = {
				institutions_id: institutionId,
				student_id: sid,
				program_id: programUuid,
				program_code: programCode,
				program_type: programType,
				register_number: group.registerNo,
				last_examination_session_id: lastSessionId,
				last_appearance_month: lastMonth || null,
				last_appearance_year: lastYear || null,
				total_credits_registered: summary.totalCredits,
				total_credits_earned: summary.creditsEarned,
				total_credit_points: summary.totalCreditPoints,
				cgpa: summary.cgpa,
				percentage: summary.cgpa > 0 ? Math.min(100, summary.cgpa * 10) : 0,
				// DB constraint allows only: Distinction | First Class | Second Class | Pass | Fail
				// The summary.classification field uses richer human labels for UI/PDF;
				// map them to the constrained set for the DB column.
				result_class: ((cgpa: number) => {
					if (cgpa >= 8.5) return 'Distinction'
					if (cgpa >= 6.0) return 'First Class'
					if (cgpa >= 5.0) return 'Second Class'
					if (cgpa >= 4.0) return 'Pass'
					return 'Fail'
				})(summary.cgpa),
				is_distinction: summary.cgpa >= 8.5,
				is_first_class: summary.cgpa >= 6.0 && summary.cgpa < 8.5,
				total_backlogs: 0,
				result_status: 'Pass',
				result_declared_date: new Date().toISOString().slice(0, 10),
				...partRow
			}

			// Upsert by (institutions_id, student_id, program_id)
			const { data: upserted, error: upsertErr } = await supabase
				.from('consolidated_results')
				.upsert(upsertRow, {
					onConflict: 'institutions_id,student_id,program_id',
					ignoreDuplicates: false
				})
				.select('id, folio_number')
				.single()

			if (upsertErr) {
				console.error('[Consolidated Generate] Upsert error for', sid, upsertErr)
				skipped.push({ studentId: sid, registerNo: group.registerNo, reason: 'Database upsert failed' })
				continue
			}

			generated.push({
				id: upserted.id,
				studentId: sid,
				registerNo: group.registerNo,
				name: group.name
			})
			if (!upserted.folio_number) {
				generatedRowIds.push(upserted.id)
			}
		}

		// Bulk-assign folios for newly-created rows that don't have one yet
		let folioAssignedCount = 0
		const folioResults: any[] = []
		if (generatedRowIds.length > 0) {
			const { data: rpcRes, error: rpcErr } = await supabase.rpc(
				'bulk_assign_consolidated_folio_numbers',
				{ p_consolidated_result_ids: generatedRowIds }
			)
			if (rpcErr) {
				console.error('[Consolidated Generate] Folio RPC error:', rpcErr)
			} else if (rpcRes) {
				folioResults.push(...rpcRes)
				folioAssignedCount = rpcRes.filter((r: any) => r.success).length
			}
		}

		console.log(`[Consolidated Generate] generated=${generated.length} skipped=${skipped.length} folios=${folioAssignedCount}`)

		return NextResponse.json({
			generated: generated.length,
			folioAssignedCount,
			folioResults,
			learners: generated,
			skipped
		})
	} catch (error) {
		console.error('[Consolidated Marksheet POST] Unhandled error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Failed to generate consolidated marksheets' },
			{ status: 500 }
		)
	}
}
