import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'

/**
 * NAD ABC Pivot CSV Export API
 *
 * Generates CSV in PIVOT format: One row per student with subjects as columns (SUB1, SUB2, etc.)
 * This is the format required for NAD portal bulk upload.
 *
 * Features:
 * - Fetches learner profiles from MyJKKN API for GENDER, DOB, FNAME, MNAME, PHOTO
 * - Theory/Practical marks based on course_category
 * - CERT_NO from semester_results.folio_number
 * - REMARKS mapping: Absent->AB, Reappear->RA, Pass->P
 *
 * GET /api/result-analytics/nad-pivot-export
 *
 * Query Parameters:
 * - institution_id: Filter by institution (optional)
 * - examination_session_id: Filter by exam session (optional)
 * - program_id: Filter by program (optional)
 * - semester: Filter by semester number (optional)
 * - max_subjects: Maximum number of subject columns (default: 20)
 */

// Interface for MyJKKN learner profile data
interface LearnerProfile {
	register_number?: string
	roll_number?: string
	first_name?: string
	last_name?: string
	father_name?: string
	mother_name?: string
	date_of_birth?: string
	gender?: string
	students_photo_url?: string  // Note: MyJKKN uses 'students' (plural)
	student_photo_url?: string
	photo_url?: string
	profile_photo?: string
	image_url?: string
	institution_id?: string
	admission_year?: number | string
	aadhaar_name?: string
	batch_name?: string
}

// Fixed columns for each subject (25 fields per subject - exact NAD format)
const SUBJECT_FIELD_SUFFIXES = [
	'NM',           // 1. Subject Name
	'',             // 2. Subject Code (SUBn itself)
	'MAX',          // 3. Max Marks
	'MIN',          // 4. Min Marks (pass marks)
	'_TH_MAX',      // 5. Theory Max
	'_VV_MRKS',     // 6. Viva Voce Marks
	'_PR_CE_MRKS',  // 7. Practical CE Marks
	'_TH_MIN',      // 8. Theory Min
	'_PR_MAX',      // 9. Practical Max
	'_PR_MIN',      // 10. Practical Min
	'_CE_MAX',      // 11. CE Max (Internal Max)
	'_CE_MIN',      // 12. CE Min (Internal Min)
	'_TH_MRKS',     // 13. Theory Marks
	'_PR_MRKS',     // 14. Practical Marks
	'_CE_MRKS',     // 15. CE Marks (Internal Marks)
	'_TOT',         // 16. Total Marks
	'_GRADE',       // 17. Grade
	'_GRADE_POINTS',// 18. Grade Points
	'_CREDIT',      // 19. Credit
	'_CREDIT_POINTS',// 20. Credit Points
	'_REMARKS',     // 21. Remarks
	'_VV_MIN',      // 22. Viva Min
	'_VV_MAX',      // 23. Viva Max
	'_TH_CE_MRKS',  // 24. Theory CE Marks
	'_CREDIT_ELIGIBILITY' // 25. Credit Eligibility (Y/N)
] as const

const SUBJECT_FIELDS_COUNT = SUBJECT_FIELD_SUFFIXES.length // 25

// Generate column names for a subject number
function getSubjectColumns(subNum: number): string[] {
	const prefix = `SUB${subNum}`
	return SUBJECT_FIELD_SUFFIXES.map(suffix => {
		if (suffix === 'NM') return `${prefix}NM`
		if (suffix === '') return prefix
		return `${prefix}${suffix}`
	})
}

// Fixed header columns (before subjects) - NAD format
// Note: RROLL, MNAME, RESULT, PERCENT, DOI, CERT_NO, CGPA, TOT_GRADE, DEPARTMENT columns kept but values left empty
const FIXED_COLUMNS = [
	'ORG_NAME',
	'COURSE_NAME',         // Degree only e.g. "B.A" (from p.degree_code)
	'STREAM',              // Specialization e.g. "ENGLISH" (from departments.department_name)
	'SESSION',             // Student batch name e.g. "2024-2027"
	'REGN_NO',
	'RROLL',               // Empty - not fetched
	'CNAME',
	'GENDER',              // First letter only (M/F)
	'DOB',
	'FNAME',
	'MNAME',               // Empty - not fetched
	'PHOTO',
	'MRKS_REC_STATUS',     // Always "O"
	'RESULT',              // Empty - not fetched
	'YEAR',                // Extract year from exam session
	'CSV_MONTH',           // Month name from exam session
	'MONTH',               // Month name from exam session
	'PERCENT',             // Empty - not fetched
	'DOI',                 // Empty - not fetched
	'CERT_NO',             // Empty - not fetched
	'SEM',                 // Roman numerals (I, II, III, etc.)
	'EXAM_TYPE',
	'TOT_CREDIT',
	'TOT_CREDIT_POINTS',
	'CGPA',                // Empty - not fetched
	'ABC_ACCOUNT_ID',
	'TERM_TYPE',
	'TOT_GRADE',           // Empty - not fetched
	'DEPARTMENT'           // Empty - not fetched
] as const

// Helper: Convert number to Roman numeral
function toRomanNumeral(num: number): string {
	const romanNumerals: [number, string][] = [
		[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
	]
	let result = ''
	for (const [value, numeral] of romanNumerals) {
		while (num >= value) {
			result += numeral
			num -= value
		}
	}
	return result || 'I'
}

// Helper: Derive batch year range from register number prefix
// e.g. "24JUGENG001" → prefix "24" → 2024 → "2024-2027" (3-year program)
function deriveBatchName(registerNumber: string): string {
	const match = registerNumber.match(/^(\d{2})/)
	if (!match) return ''
	const admYear = 2000 + parseInt(match[1])
	return `${admYear}-${admYear + 3}`
}

// Helper: Extract year from exam session (e.g., "Nov-Dec-2025" → "2025")
function extractYear(examSession: string): string {
	if (!examSession) return ''
	const match = examSession.match(/(\d{4})/)
	return match ? match[1] : ''
}

// Helper: Extract month name from exam session (e.g., "Nov-Dec-2025" → "NOVEMBER")
function extractMonth(examSession: string): string {
	if (!examSession) return ''
	const monthMap: Record<string, string> = {
		'jan': 'JANUARY', 'feb': 'FEBRUARY', 'mar': 'MARCH',
		'apr': 'APRIL', 'may': 'MAY', 'jun': 'JUNE',
		'jul': 'JULY', 'aug': 'AUGUST', 'sep': 'SEPTEMBER',
		'oct': 'OCTOBER', 'nov': 'NOVEMBER', 'dec': 'DECEMBER'
	}
	const lower = examSession.toLowerCase()
	for (const [abbrev, full] of Object.entries(monthMap)) {
		if (lower.includes(abbrev)) {
			return full
		}
	}
	return ''
}

// Helper: Parse program name into short form and stream
function parseProgramName(programName: string): { shortForm: string; stream: string } {
	if (!programName) return { shortForm: '', stream: '' }

	// Common patterns: "B.A. ENGLISH", "B.Sc. COMPUTER SCIENCE", "M.A. TAMIL"
	const match = programName.match(/^([A-Z]+\.?[A-Za-z]*\.?)\s+(.+)$/i)
	if (match) {
		return {
			shortForm: match[1].toUpperCase(),  // "B.A", "B.Sc", "M.A"
			stream: match[2].trim()             // "ENGLISH", "COMPUTER SCIENCE"
		}
	}

	// If no match, return program name as short form
	return { shortForm: programName, stream: '' }
}

// Helper: Format gender to first letter (Male → M, Female → F)
function formatGender(gender: string): string {
	if (!gender) return ''
	const g = gender.toLowerCase().trim()
	if (g.startsWith('m')) return 'M'
	if (g.startsWith('f')) return 'F'
	return gender.charAt(0).toUpperCase()
}

interface SubjectData {
	course_code: string
	course_name: string
	course_category: string  // THEORY or PRACTICAL
	total_max_mark: number
	total_min_mark: number
	theory_max_mark: number | null
	theory_min_mark: number | null
	practical_max_mark: number | null
	practical_min_mark: number | null
	internal_max_mark: number | null
	internal_min_mark: number | null
	theory_marks_obtained: number | null
	practical_marks_obtained: number | null
	internal_marks_obtained: number | null
	practical_ce_marks: number | null
	total_marks_obtained: number
	letter_grade: string | null
	grade_points: number | null
	credit: number
	credit_points: number | null
	pass_status: string
	raw_pass_status: string  // For REMARKS mapping
	is_regular: boolean
	subject_order: number
	subject_semester: number  // The course's own semester (from course_offerings.semester)
}

interface StudentData {
	student_id: string
	examination_session_id: string  // Needed for direct semester_results lookup (bypasses view's is_published filter)
	register_number: string
	roll_number: string
	student_name: string
	father_name: string
	mother_name: string
	date_of_birth: string
	gender: string
	photo_url: string
	aadhar_number: string
	program_code: string
	program_name: string
	degree_code: string
	stream_name: string
	batch_name: string
	department_name: string
	institution_name: string
	academic_year: string
	exam_session: string
	semester: number
	sgpa: number
	cgpa: number
	total_credits: number
	total_credits_earned: number | null         // From semester_results.total_credits_earned (source of truth for TOT_CREDIT)
	semester_result_id: string | null           // For bulk lookup of semester_results row
	total_credit_points: number
	total_credit_points_earned: number | null   // From semester_results.total_credit_points (source of truth for TOT_CREDIT_POINTS)
	overall_grade: string
	overall_result: string
	percentage: number
	result_date: string
	folio_number: string  // CERT_NO
	subjects: SubjectData[]
	// Additional fields at end (after all subjects)
	aadhaar_name: string
	admission_year: string
}

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url)
		const countOnly = searchParams.get('count_only') === 'true'

		// Permission gate: count_only previews require nad.view, CSV downloads require nad.export
		const requiredPermission = countOnly ? 'nad.view' : 'nad.export'
		const permResult = await requireUserPermission(requiredPermission)
		if (!permResult.ok) {
			return NextResponse.json(
				{ error: permResult.error },
				{ status: permResult.status },
			)
		}

		const supabase = getSupabaseServer()

		// Parse filter parameters
		const institutionId = searchParams.get('institution_id') || undefined
		const examinationSessionId = searchParams.get('examination_session_id') || undefined
		const programId = searchParams.get('program_id') || undefined
		const semester = searchParams.get('semester') ? parseInt(searchParams.get('semester')!) : undefined
		const maxSubjects = searchParams.get('max_subjects') ? parseInt(searchParams.get('max_subjects')!) : 20

		console.log('NAD Pivot CSV Export - Fetching with filters:', {
			institutionId,
			examinationSessionId,
			programId,
			semester,
			maxSubjects
		})

		// Build query to get per-subject data
		let query = supabase
			.from('nad_abc_upload_view')
			.select('*')

		if (institutionId) {
			query = query.eq('institution_id', institutionId)
		}
		if (examinationSessionId) {
			query = query.eq('examination_session_id', examinationSessionId)
		}
		if (programId) {
			query = query.eq('program_id', programId)
		}
		// NOTE: We do NOT filter by semester_number here.
		// The view's semester_number falls back to co.semester when semester_results
		// is missing, causing arrear students (e.g. Semester 3 students retaking
		// Semester 1 courses) to appear under the wrong semester.
		// Instead we determine each student's real semester post-grouping using
		// max(subject_semester) — the same logic used in galley-report.

		// Order by student then subject
		query = query.order('STUDENT_NAME', { ascending: true })
			.order('subject_order', { ascending: true })

		const { data: viewData, error: viewError } = await query

		if (viewError) {
			console.error('Error fetching from nad_abc_upload_view:', viewError)
			if (viewError.code === '42P01') {
				return NextResponse.json({
					error: 'NAD view not found. Please run the SQL migration.',
					details: 'Execute: supabase/sql/nad_abc_upload_view.sql'
				}, { status: 404 })
			}
			throw viewError
		}

		if (!viewData || viewData.length === 0) {
			return NextResponse.json({
				success: true,
				message: 'No published results found for the selected filters',
				csv: '',
				row_count: 0
			})
		}

		// Group by student (pivot the data)
		const studentMap = new Map<string, StudentData>()

		for (const row of viewData) {
			const studentKey = `${row.student_id}-${row.examination_session_id}`

			if (!studentMap.has(studentKey)) {
				// Initialize student record
				studentMap.set(studentKey, {
					student_id: row.student_id,
					examination_session_id: row.examination_session_id,
					register_number: row.ENROLLMENT_NUMBER || '',
					roll_number: row.ROLL_NUMBER || '',
					student_name: row.STUDENT_NAME || '',
					father_name: row.FATHER_NAME || '',
					mother_name: row.MOTHER_NAME || '',
					date_of_birth: row.DATE_OF_BIRTH || '',
					gender: row.GENDER || '',
					photo_url: '',  // Will be enriched from MyJKKN
					aadhar_number: row.ABC_ID || '',
					program_code: row.PROGRAM_CODE || '',
					program_name: row.PROGRAM_NAME || '',
					department_name: row.PROGRAM_NAME || '', // Use program name as department
					degree_code: row.degree_code || '',
					stream_name: row.stream_name || '',
					batch_name: row.batch_name || '',
					institution_name: row.INSTITUTION_NAME || '',
					academic_year: row.ACADEMIC_YEAR || '',
					exam_session: row.EXAM_SESSION || '',
					semester: row.semester_number || 1,
					sgpa: parseFloat(row.SGPA) || 0,
					cgpa: parseFloat(row.CGPA) || 0,
					total_credits: 0,
					total_credits_earned: null,                       // Populated after view query via bulk fetch
					semester_result_id: row.semester_result_id || null,
					total_credit_points: 0,
					total_credit_points_earned: null,                 // Populated after view query via bulk fetch
					overall_grade: '',
					overall_result: 'PASS',
					percentage: 0,
					result_date: row.RESULT_DATE || '',
					folio_number: row.folio_number || '',  // CERT_NO
					subjects: [],
					// Additional fields (enriched from MyJKKN)
					aadhaar_name: '',
					admission_year: ''
				})
			}

			const student = studentMap.get(studentKey)!

			// Add subject to student - using course_category from view
			const courseCategory = (row.course_category || 'THEORY').toUpperCase()
			const subjectData: SubjectData = {
				course_code: row.SUBJECT_CODE || '',
				course_name: row.SUBJECT_NAME || '',
				course_category: courseCategory,
				total_max_mark: parseInt(row.MAX_MARKS) || 100,
				total_min_mark: Math.round((parseInt(row.MAX_MARKS) || 100) * 0.4), // 40% pass mark
				// Theory columns (from view - populated if course_category = Theory)
				theory_max_mark: row.theory_max_mark ?? null,
				theory_min_mark: row.theory_min_mark ?? null,
				theory_marks_obtained: row.theory_marks_obtained ?? null,
				// Practical columns (from view - populated if course_category = Practical)
				practical_max_mark: row.practical_max_mark ?? null,
				practical_min_mark: row.practical_min_mark ?? null,
				practical_marks_obtained: row.practical_marks_obtained ?? null,
				practical_ce_marks: row.practical_ce_marks ?? null,
				// Internal/CE columns
				internal_max_mark: row.ce_max_mark ?? row.internal_marks_maximum ?? null,
				internal_min_mark: row.ce_min_mark ?? null,
				internal_marks_obtained: row.ce_marks_obtained ?? row.internal_marks_obtained ?? null,
				total_marks_obtained: parseInt(row.MARKS_OBTAINED) || 0,
				letter_grade: row.letter_grade || '',
				grade_points: row.grade_points || 0,
				credit: row.credit || 0,
				credit_points: (row.grade_points || 0) * (row.credit || 0),
				pass_status: row.RESULT_STATUS || 'PASS',
				raw_pass_status: row.raw_pass_status || 'Pass',  // For REMARKS mapping
				is_regular: row.is_regular_subject !== false,
				subject_order: row.subject_order || 0,
			subject_semester: row.subject_semester || 1
			}

			student.subjects.push(subjectData)

			// Update totals
			student.total_credits += subjectData.credit
			student.total_credit_points += subjectData.credit_points || 0

			// Update overall result
			if (subjectData.pass_status === 'FAIL') {
				student.overall_result = 'FAIL'
			}
		}

		// ── Semester correction + arrear-student filtering ─────────────────────
		// The view's semester_number falls back to co.semester when semester_results
		// is missing. Compute each student's real semester as max(subject_semester)
		// across all their subjects (same logic as galley-report). Then filter out
		// students whose real semester does not match the requested semester filter.
		for (const [key, student] of Array.from(studentMap.entries())) {
			const maxSemester = student.subjects.length > 0
				? Math.max(...student.subjects.map(s => s.subject_semester))
				: student.semester
			student.semester = maxSemester
			if (semester && maxSemester !== semester) {
				studentMap.delete(key)
			}
		}

		if (semester && studentMap.size === 0) {
			return NextResponse.json({
				success: true,
				message: 'No published results found for the selected filters',
				csv: '',
				row_count: 0
			})
		}

		// ── Bulk-fetch TOT_CREDIT / TOT_CREDIT_POINTS from semester_results ──────
		// Both columns must come from semester_results (the authoritative values,
		// trigger-maintained via calculate_semester_result). Summing subject-level
		// credits client-side would include RA/failed attempts and drift from the
		// earned-credit count.
		//
		// IMPORTANT: We query semester_results DIRECTLY by (student_id, exam_session_id)
		// instead of relying on view.semester_result_id. The view's LEFT JOIN filters
		// on `is_active = true AND is_published = true`, so draft/unpublished rows get
		// silently dropped — which caused TOT_CREDIT to fall back to the subject-sum
		// (i.e. "credits registered") for any student whose semester result hasn't
		// been published yet. Direct lookup with only `is_active = true` fixes that.
		const studentIdSet = new Set<string>()
		const examSessionIdSet = new Set<string>()
		for (const student of Array.from(studentMap.values())) {
			if (student.student_id) studentIdSet.add(student.student_id)
			if (student.examination_session_id) examSessionIdSet.add(student.examination_session_id)
		}

		if (studentIdSet.size > 0 && examSessionIdSet.size > 0) {
			const { data: srRows, error: srError } = await supabase
				.from('semester_results')
				.select('student_id, examination_session_id, total_credits_earned, total_credit_points, is_published')
				.in('student_id', Array.from(studentIdSet))
				.in('examination_session_id', Array.from(examSessionIdSet))
				.eq('is_active', true)  // Only current active version — NOT gated on is_published

			if (srError) {
				console.error('[NAD Export] Failed to fetch semester_results credits:', srError)
				// Non-fatal — route will fall back to sum of subject credits below.
			} else if (srRows) {
				// Composite key: student_id + examination_session_id → credit values
				const srMap = new Map<string, { credits: number; points: number; published: boolean }>()
				for (const r of srRows) {
					const key = `${r.student_id}-${r.examination_session_id}`
					srMap.set(key, {
						credits: Number(r.total_credits_earned) || 0,
						points: Number(r.total_credit_points) || 0,
						published: !!r.is_published,
					})
				}
				let resolvedCount = 0
				let unpublishedCount = 0
				for (const student of Array.from(studentMap.values())) {
					const key = `${student.student_id}-${student.examination_session_id}`
					const sr = srMap.get(key)
					if (sr) {
						student.total_credits_earned = sr.credits
						student.total_credit_points_earned = sr.points
						resolvedCount++
						if (!sr.published) unpublishedCount++
					}
				}
				console.log(
					`[NAD Export] Resolved semester_results credits for ${resolvedCount}/${studentMap.size} students ` +
					`(${unpublishedCount} from unpublished/draft rows)`
				)
			}
		}

		// ── count_only short-circuit ──────────────────────────────────────────
		// The preview card on /reports/nad calls with count_only=true to learn
		// how many students and subject-rows will be in the download, plus any
		// warnings about unpublished semester_results or missing rows. Returning
		// from the same endpoint that generates the CSV guarantees the preview
		// matches the download byte-for-byte.
		if (countOnly) {
			let subjectRowCount = 0
			let studentsMissingSemesterResult = 0

			for (const student of Array.from(studentMap.values())) {
				subjectRowCount += student.subjects.length
				if (student.total_credits_earned === null) {
					studentsMissingSemesterResult++
				}
			}

			// unpublishedSemesterResultCount is the number of students whose
			// total_credits_earned WAS resolved but from an unpublished row.
			// That count was logged above as `unpublishedCount` — recompute here
			// because the log variable is out of scope after its block.
			let unpublishedSemesterResultCount = 0
			{
				const studentIds = Array.from(studentMap.values()).map(s => s.student_id)
				const examSessionIds = Array.from(
					new Set(Array.from(studentMap.values()).map(s => s.examination_session_id)),
				)
				if (studentIds.length > 0 && examSessionIds.length > 0) {
					const { data: unpubRows } = await supabase
						.from('semester_results')
						.select('student_id, examination_session_id')
						.in('student_id', studentIds)
						.in('examination_session_id', examSessionIds)
						.eq('is_active', true)
						.eq('is_published', false)
					unpublishedSemesterResultCount = unpubRows?.length ?? 0
				}
			}

			return NextResponse.json({
				student_count: studentMap.size,
				subject_row_count: subjectRowCount,
				unpublished_semester_result_count: unpublishedSemesterResultCount,
				students_missing_semester_result: studentsMissingSemesterResult,
				semester_filter_applied: semester ? [semester] : [],
				can_download: studentMap.size > 0,
			})
		}
		// ── end count_only ────────────────────────────────────────────────────

		// Calculate percentage and grade for each student
		for (const student of Array.from(studentMap.values())) {
			// Calculate percentage
			const totalMax = student.subjects.reduce((sum, s) => sum + s.total_max_mark, 0)
			const totalObtained = student.subjects.reduce((sum, s) => sum + s.total_marks_obtained, 0)
			student.percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100 * 100) / 100 : 0

			// Determine overall grade based on CGPA
			if (student.cgpa >= 9) student.overall_grade = 'O'
			else if (student.cgpa >= 8) student.overall_grade = 'A+'
			else if (student.cgpa >= 7) student.overall_grade = 'A'
			else if (student.cgpa >= 6) student.overall_grade = 'B+'
			else if (student.cgpa >= 5.5) student.overall_grade = 'B'
			else if (student.cgpa >= 5) student.overall_grade = 'C'
			else student.overall_grade = 'F'
		}

		// Fetch learner profiles from MyJKKN API for GENDER, DOB, FNAME, MNAME, PHOTO
		// Using batch fetching pattern with pagination (MyJKKN API max 200 records per page)
		const studentsList = Array.from(studentMap.values())

		if (institutionId && studentsList.length > 0) {
			console.log(`[NAD Export] Fetching learner profiles from MyJKKN for institution ${institutionId}...`)

			try {
				const myjkknApiUrl = process.env.MYJKKN_API_URL
				const myjkknApiKey = process.env.MYJKKN_API_KEY

				if (!myjkknApiUrl || !myjkknApiKey) {
					console.warn('[NAD Export] MyJKKN API credentials not configured')
				} else {
					// Get myjkkn_institution_ids from COE institution table
					const { data: institution } = await supabase
						.from('institutions')
						.select('myjkkn_institution_ids')
						.eq('id', institutionId)
						.single()

					const myjkknInstIds: string[] = institution?.myjkkn_institution_ids || []

					if (myjkknInstIds.length > 0) {
						// Fetch all profiles from MyJKKN with pagination
						const allProfiles: LearnerProfile[] = []
						const pageSize = 200  // MyJKKN API max per page

						// MyJKKN ignores institution_id server-side — all learners are returned regardless.
						// Fetching for each myjkkn_institution_id produces identical results, so fetch once.
						const fetchInstId = myjkknInstIds[0]
						let page = 1
						let hasMorePages = true

						while (hasMorePages) {
							const profileParams = new URLSearchParams()
							profileParams.set('institution_id', fetchInstId)
							profileParams.set('limit', String(pageSize))
							profileParams.set('page', String(page))

							try {
								const response = await fetch(
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

								if (response.ok) {
									const data = await response.json()
									const profiles = data.data || []
									allProfiles.push(...profiles)
									hasMorePages = profiles.length === pageSize
									page++
									console.log(`[NAD Export] Fetched page ${page - 1}, ${profiles.length} profiles (total: ${allProfiles.length})`)
								} else {
									console.warn(`[NAD Export] MyJKKN API returned ${response.status}`)
									hasMorePages = false
								}
							} catch (err) {
								console.error(`[NAD Export] Error fetching page ${page}:`, err)
								hasMorePages = false
							}
						}

						console.log(`[NAD Export] Total profiles fetched: ${allProfiles.length}`)

						// Create lookup map by register_number
						const profileMap = new Map<string, LearnerProfile>(
							allProfiles.map(p => [p.register_number || '', p])
						)

						// Enrich student data with MyJKKN profiles
						let enrichedCount = 0
						for (const student of studentsList) {
							const profile = profileMap.get(student.register_number)
							if (profile) {
								// Update with MyJKKN data
								student.gender = profile.gender || student.gender || ''
								// Convert DOB from MyJKKN ISO format (YYYY-MM-DD) to DD-MM-YYYY
								const rawDob = profile.date_of_birth || student.date_of_birth || ''
								if (rawDob && /^\d{4}-\d{2}-\d{2}$/.test(rawDob)) {
									const [y, m, d] = rawDob.split('-')
									student.date_of_birth = `${d}-${m}-${y}`
								} else {
									student.date_of_birth = rawDob
								}
								student.father_name = (profile.father_name || student.father_name || '').trim()
								student.mother_name = profile.mother_name || student.mother_name || ''
								// Check multiple photo field names (MyJKKN may use different names)
								student.photo_url = profile.students_photo_url
									|| profile.student_photo_url
									|| profile.photo_url
									|| profile.profile_photo
									|| profile.image_url
									|| ''
								// Additional fields for end columns
								student.aadhaar_name = profile.aadhaar_name || ''
								student.admission_year = profile.admission_year?.toString() || ''
								// Always use MyJKKN batch_name (source of truth for SESSION column)
								if (profile.batch_name) student.batch_name = profile.batch_name
								enrichedCount++
							}
						}

						console.log(`[NAD Export] Enriched ${enrichedCount} of ${studentsList.length} students with profile data`)

						// Fetch programs from MyJKKN to resolve full program names (e.g. 'B.A ENGLISH')
						// Local programs table only stores the code ('UEN'), not the descriptive name
						try {
							const programNameMap = new Map<string, string>()
							for (const myjkknInstId of myjkknInstIds) {
								// Correct endpoint: /api-management/organizations/programs (not /programs)
								// Use high limit to fetch all programs in one request
								const progRes = await fetch(
									`${myjkknApiUrl}/api-management/organizations/programs?institution_id=${myjkknInstId}&is_active=true&limit=1000`,
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
								if (progRes.ok) {
									const progData = await progRes.json()
									const programs: { program_code?: string; program_id?: string; program_name?: string }[] = progData.data || progData || []
									console.log(`[NAD Export] Fetched ${programs.length} programs from MyJKKN for inst ${myjkknInstId}`)
									for (const prog of programs) {
										// Raw MyJKKN API returns program_id as the code (e.g. "UEN")
										// TypeScript service maps it to program_code — handle both
										const code = prog.program_code || prog.program_id
										if (code && prog.program_name && !programNameMap.has(code)) {
											programNameMap.set(code, prog.program_name)
										}
									}
								} else {
									console.warn(`[NAD Export] Programs fetch returned ${progRes.status} for inst ${myjkknInstId}`)
								}
							}
							// Update each student's degree_code and stream_name from the resolved full program name
							for (const student of studentsList) {
								const fullName = programNameMap.get(student.program_code)
								if (fullName) {
									const parsed = parseProgramName(fullName)
									if (parsed.shortForm) student.degree_code = parsed.shortForm
									if (parsed.stream) student.stream_name = parsed.stream
								}
							}
							console.log(`[NAD Export] Resolved program names for ${programNameMap.size} programs from MyJKKN`)
						} catch (progErr) {
							console.error('[NAD Export] Error fetching MyJKKN programs:', progErr)
						}

					} else {
						console.warn('[NAD Export] No myjkkn_institution_ids found for institution')
					}
				}
			} catch (err) {
				console.error('[NAD Export] Error fetching learner profiles:', err)
				// Continue without enrichment - use existing data
			}
		}

		// Find max subjects needed
		let actualMaxSubjects = 0
		for (const student of Array.from(studentMap.values())) {
			actualMaxSubjects = Math.max(actualMaxSubjects, student.subjects.length)
		}
		actualMaxSubjects = Math.min(actualMaxSubjects, maxSubjects)

		// Generate header row
		const headerRow: string[] = [...FIXED_COLUMNS]
		for (let i = 1; i <= actualMaxSubjects; i++) {
			headerRow.push(...getSubjectColumns(i))
		}
		// Add end columns after all subjects
		headerRow.push('AADHAAR_NAME', 'ADMISSION_YEAR', 'UNSANI_URI_DATA_KEY', 'URI_DATA_KEY')

		// Generate data rows
		const csvRows: string[][] = [headerRow]

		for (const student of Array.from(studentMap.values())) {
			const row: string[] = []

			// Derive COURSE_NAME and STREAM from view fields (degree_code + department_name)
			// Fall back to parseProgramName if the view fields are not populated
			const { shortForm, stream } = parseProgramName(student.program_name)
			const courseName = student.degree_code || shortForm
			const streamName = student.stream_name || stream

			// Fixed columns - matching FIXED_COLUMNS order
			row.push(student.institution_name)                    // ORG_NAME
			row.push(courseName)                                  // COURSE_NAME = "B.A"
			row.push(streamName)                                  // STREAM = "ENGLISH"
			row.push(student.batch_name || deriveBatchName(student.register_number) || student.exam_session)  // SESSION
			row.push(student.register_number)                     // REGN_NO
			row.push('')                                          // RROLL - empty (not fetched)
			row.push(student.student_name)                        // CNAME
			row.push(formatGender(student.gender))                // GENDER - first letter only (M/F)
			row.push(student.date_of_birth)                       // DOB (from MyJKKN)
			row.push('')                                          // FNAME - always empty per NAD requirements
			row.push('')                                          // MNAME - empty (not fetched)
			row.push(student.photo_url)                           // PHOTO (from MyJKKN)
			row.push('O')                                         // MRKS_REC_STATUS - always "O"
			row.push('')                                          // RESULT - empty (not fetched)
			row.push(extractYear(student.exam_session))           // YEAR - extract year from exam session
			row.push(extractMonth(student.exam_session))          // CSV_MONTH - month name from exam session
			row.push(extractMonth(student.exam_session))          // MONTH - month name from exam session
			row.push('')                                          // PERCENT - empty (not fetched)
			row.push('')                                          // DOI - empty (not fetched)
			row.push('')                                          // CERT_NO - empty (not fetched)
			row.push(toRomanNumeral(student.semester))            // SEM - Roman numerals (I, II, III, etc.)
			row.push('REGULAR')                                   // EXAM_TYPE
			// TOT_CREDIT — prefer semester_results.total_credits_earned (authoritative),
			// fall back to subject-credit sum only if the semester_results row is missing.
			row.push(
				(student.total_credits_earned ?? student.total_credits).toString()
			)                                                     // TOT_CREDIT
			// TOT_CREDIT_POINTS — prefer semester_results.total_credit_points (authoritative,
			// decimal), fall back to subject-credit-points sum if the semester result row is missing.
			row.push(
				(student.total_credit_points_earned ?? student.total_credit_points).toString()
			)                                                     // TOT_CREDIT_POINTS
			row.push('')                                          // CGPA - empty (not fetched)
			row.push(student.aadhar_number)                       // ABC_ACCOUNT_ID
			row.push('SEMESTER')                                  // TERM_TYPE
			row.push('')                                          // TOT_GRADE - empty (not fetched)
			row.push('')                                          // DEPARTMENT - empty (not fetched)

			// Subject columns
			for (let i = 0; i < actualMaxSubjects; i++) {
				const subject = student.subjects[i]

				if (subject) {
					const isTheory = subject.course_category === 'THEORY'
					const isPractical = subject.course_category === 'PRACTICAL'

					// Map raw_pass_status to REMARKS: Absent->RA, Reappear->RA, Pass->P
					// Note: AB (Absent) should be mapped to RA per NAD requirements
					let remarks = ''
					const rawStatus = (subject.raw_pass_status || '').toLowerCase()
					if (rawStatus.includes('absent')) {
						remarks = 'RA'  // AB (Absent) → RA
					} else if (rawStatus.includes('reappear') || rawStatus.includes('fail')) {
						remarks = 'RA'
					} else if (rawStatus.includes('pass') || subject.pass_status === 'PASS') {
						remarks = 'P'
					}

					// Grade conversion: AAA → U
					let grade = subject.letter_grade || ''
					if (grade.toUpperCase() === 'AAA') {
						grade = 'U'
					}

					// Credit: if grade_points = 0, credit should be 0
					const credit = (subject.grade_points === 0 || subject.grade_points == null) ? 0 : subject.credit

					// SUBnNM - Subject Name
					row.push(subject.course_name)
					// SUBn - Subject Code
					row.push(subject.course_code)
					// SUBnMAX - Max Marks
					row.push(subject.total_max_mark.toString())
					// SUBnMIN - Min Marks
					row.push(subject.total_min_mark.toString())

					// SUBn_TH_MAX - Theory Max (course.external_max_mark if Theory)
					row.push(isTheory && subject.theory_max_mark != null ? subject.theory_max_mark.toString() : '')

					// SUBn_VV_MRKS - Viva Marks
					row.push('')

					// SUBn_PR_CE_MRKS - Practical CE Marks (final_marks.internal_marks_maximum if Practical)
					row.push(isPractical && subject.practical_ce_marks != null ? subject.practical_ce_marks.toString() : '')

					// SUBn_TH_MIN - Theory Min (course.external_pass_mark if Theory)
					row.push(isTheory && subject.theory_min_mark != null ? subject.theory_min_mark.toString() : '')

					// SUBn_PR_MAX - Practical Max (course.external_max_mark if Practical)
					row.push(isPractical && subject.practical_max_mark != null ? subject.practical_max_mark.toString() : '')

					// SUBn_PR_MIN - Practical Min (course.internal_pass_mark if Practical)
					row.push(isPractical && subject.practical_min_mark != null ? subject.practical_min_mark.toString() : '')

					// SUBn_CE_MAX - CE Max (final_marks.internal_marks_maximum if Theory)
					row.push(isTheory && subject.internal_max_mark != null ? subject.internal_max_mark.toString() : '')

					// SUBn_CE_MIN - CE Min (course.internal_pass_mark if Theory)
					row.push(isTheory && subject.internal_min_mark != null ? subject.internal_min_mark.toString() : '')

					// SUBn_TH_MRKS - Theory Marks (final_marks.external_marks_obtained if Theory)
					row.push(isTheory && subject.theory_marks_obtained != null ? subject.theory_marks_obtained.toString() : '')

					// SUBn_PR_MRKS - Practical Marks (final_marks.external_marks_obtained if Practical)
					row.push(isPractical && subject.practical_marks_obtained != null ? subject.practical_marks_obtained.toString() : '')

					// SUBn_CE_MRKS - CE Marks (final_marks.internal_marks_obtained)
					row.push(subject.internal_marks_obtained != null ? subject.internal_marks_obtained.toString() : '')

					// SUBn_TOT - Total Marks
					row.push(subject.total_marks_obtained.toString())
					// SUBn_GRADE - Grade (AAA → U)
					row.push(grade)
					// SUBn_GRADE_POINTS - Grade Points
					row.push(subject.grade_points?.toString() || '')
					// SUBn_CREDIT - Credit (0 if grade_points = 0)
					row.push(credit.toString())
					// SUBn_CREDIT_POINTS - Credit Points
					row.push(subject.credit_points?.toString() || '')

					// SUBn_REMARKS - Remarks (Absent->RA, Reappear->RA, Pass->P)
					row.push(remarks)

					// SUBn_VV_MIN - Viva Min
					row.push('')
					// SUBn_VV_MAX - Viva Max
					row.push('')
					// SUBn_TH_CE_MRKS - Theory CE Marks
					row.push('')
					// SUBn_CREDIT_ELIGIBILITY - empty (not fetched)
					row.push('')
				} else {
					// Empty subject columns
					row.push(...Array(SUBJECT_FIELDS_COUNT).fill(''))
				}
			}

			// Add end columns after all subjects
			row.push(student.aadhaar_name)       // AADHAAR_NAME (from MyJKKN)
			row.push(student.admission_year)    // ADMISSION_YEAR (from MyJKKN)
			row.push('')                        // UNSANI_URI_DATA_KEY - empty
			row.push('')                        // URI_DATA_KEY - empty

			csvRows.push(row)
		}

		// Convert to CSV string with proper escaping
		const csvContent = csvRows.map(row =>
			row.map(field => {
				const strField = String(field || '')
				if (strField.includes(',') || strField.includes('"') || strField.includes('\n')) {
					return `"${strField.replace(/"/g, '""')}"`
				}
				return strField
			}).join(',')
		).join('\n')

		// Generate filename
		const filterParts: string[] = ['nad_pivot_export']
		if (programId) filterParts.push('program')
		if (semester) filterParts.push(`sem${semester}`)
		filterParts.push(new Date().toISOString().split('T')[0])
		const filename = `${filterParts.join('_')}.csv`

		// Return CSV with download headers
		return new NextResponse(csvContent, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Cache-Control': 'no-cache'
			}
		})

	} catch (error) {
		console.error('Error generating NAD Pivot CSV export:', error)
		return NextResponse.json({
			error: 'Failed to generate NAD Pivot CSV export',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 })
	}
}

/**
 * POST endpoint for getting preview data (not CSV download)
 */
export async function POST(req: NextRequest) {
	try {
		const body = await req.json()
		const {
			institution_id,
			examination_session_id,
			program_id,
			semester,
			preview_only = false
		} = body

		if (!preview_only) {
			// Build URL with query parameters and call GET
			const url = new URL(req.url)
			if (institution_id) url.searchParams.set('institution_id', institution_id)
			if (examination_session_id) url.searchParams.set('examination_session_id', examination_session_id)
			if (program_id) url.searchParams.set('program_id', program_id)
			if (semester) url.searchParams.set('semester', String(semester))

			const newReq = new NextRequest(url, { method: 'GET' })
			return GET(newReq)
		}

		// Preview mode - return JSON summary
		const supabase = getSupabaseServer()

		let query = supabase
			.from('nad_abc_upload_view')
			.select('student_id, STUDENT_NAME, PROGRAM_CODE, semester_number', { count: 'exact' })

		if (institution_id) query = query.eq('institution_id', institution_id)
		if (examination_session_id) query = query.eq('examination_session_id', examination_session_id)
		if (program_id) query = query.eq('program_id', program_id)
		if (semester) query = query.eq('semester_number', semester)

		const { data, count, error } = await query

		if (error) throw error

		// Count unique students
		const uniqueStudents = new Set(data?.map(r => r.student_id) || [])
		const subjectCounts = new Map<string, number>()
		for (const row of data || []) {
			const key = row.student_id
			subjectCounts.set(key, (subjectCounts.get(key) || 0) + 1)
		}

		const maxSubjects = Math.max(...Array.from(subjectCounts.values()), 0)
		const totalColumns = FIXED_COLUMNS.length + (maxSubjects * 25)

		return NextResponse.json({
			success: true,
			preview: {
				total_students: uniqueStudents.size,
				total_subject_records: count || 0,
				max_subjects_per_student: maxSubjects,
				total_columns: totalColumns,
				fixed_columns: FIXED_COLUMNS.length,
				subject_columns_per_subject: 25
			}
		})

	} catch (error) {
		console.error('Error in NAD Pivot preview:', error)
		return NextResponse.json({
			error: 'Failed to generate preview',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 })
	}
}
