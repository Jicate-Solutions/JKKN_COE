import type { SupabaseClient } from '@supabase/supabase-js'
import type {
	BulkLearnerCourses,
	BulkLearnerRef,
	BulkSubjectCandidate,
	BulkSubjectOffering,
	ExamApplicationEligibility,
	ExamApplicationSource,
} from '@/types/exam-applications'
import { collectInvolvedCourseCodes, mergeExamApplicationCourses } from './merge'

const MAX_ROWS = 9999
/** Learners per `.in()` filter - keeps the PostgREST GET URL well under any length limit */
const IN_CHUNK = 60
/** Ids per `.in()` filter for plain uuid lookups */
const ID_CHUNK = 300

export interface BuildBulkCourseListParams {
	institutions_id: string
	examination_session_id: string
	learners: BulkLearnerRef[]
}

export interface BuildSubjectCandidatesParams {
	institutions_id: string
	examination_session_id: string
	course_offering_id: string
	/** Current-paper cohort (programme + semester of the offering), supplied by the caller */
	cohort?: BulkLearnerRef[]
	/**
	 * Restrict candidates to one programme.
	 *
	 * A shared paper (GENERAL TAMIL-I and friends) is offered under a single
	 * programme but carried as a backlog by learners right across the college, so
	 * looking the course code up on its own returned every programme's arrears.
	 * When the operator has picked a programme, only its learners are candidates.
	 * Left empty, every programme holding the arrear is returned - which is what
	 * "All programs" means.
	 */
	program_codes?: string[]
}

/** Uppercased register number used as the learner merge key */
export function learnerKey(learner: { student_id?: string | null; register_number?: string | null }): string {
	const reg = (learner.register_number || '').trim().toUpperCase()
	if (reg) return `reg:${reg}`
	return `sid:${learner.student_id || ''}`
}

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = []
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
	return out
}

function pushToMap<T>(map: Map<string, T[]>, key: string, value: T) {
	const list = map.get(key)
	if (list) list.push(value)
	else map.set(key, [value])
}

/**
 * Fetch rows matching a learner set by student_id and by register number.
 *
 * Two separate `.in()` queries are used instead of one `.or(...in...)` so the request
 * URL stays short and PostgREST never has to parse quoted lists inside an `or` filter.
 * Rows are de-duplicated on `id`.
 */
async function fetchByLearners(
	supabase: SupabaseClient,
	table: string,
	columns: string,
	applyScope: (query: any) => any,
	idColumn: string,
	regColumn: string,
	studentIds: string[],
	registerNumbers: string[]
): Promise<any[]> {
	const rows = new Map<string, any>()
	let index = 0

	const absorb = (data: any[] | null) => {
		for (const row of data || []) {
			rows.set(row.id ?? `row-${index++}`, row)
		}
	}

	for (const batch of chunk(studentIds, ID_CHUNK)) {
		if (batch.length === 0) continue
		const { data, error } = await applyScope(
			supabase.from(table).select(columns).in(idColumn, batch).range(0, MAX_ROWS)
		)
		if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`)
		absorb(data)
	}

	for (const batch of chunk(registerNumbers, IN_CHUNK)) {
		if (batch.length === 0) continue
		const { data, error } = await applyScope(
			supabase.from(table).select(columns).in(regColumn, batch).range(0, MAX_ROWS)
		)
		if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`)
		absorb(data)
	}

	return [...rows.values()]
}

/** UPPER course_code set for every course the given learners have already cleared */
export async function fetchPassedCourseCodes(
	supabase: SupabaseClient,
	institutions_id: string,
	studentIds: string[]
): Promise<Map<string, Set<string>>> {
	const byStudent = new Map<string, Set<string>>()
	if (studentIds.length === 0) return byStudent

	const passedRows: any[] = []
	for (const batch of chunk(studentIds, ID_CHUNK)) {
		const { data, error } = await supabase
			.from('final_marks')
			.select('student_id, course_id')
			.eq('institutions_id', institutions_id)
			.eq('is_pass', true)
			.in('student_id', batch)
			.range(0, MAX_ROWS)
		if (error) {
			console.error('[exam-applications:bulk] final_marks error:', error)
			return byStudent
		}
		passedRows.push(...(data || []))
	}

	if (passedRows.length === 0) return byStudent

	const courseIds = [...new Set(passedRows.map(r => r.course_id).filter(Boolean))]
	const codeById = new Map<string, string>()
	for (const batch of chunk(courseIds, ID_CHUNK)) {
		const { data } = await supabase.from('courses').select('id, course_code').in('id', batch)
		for (const c of data || []) {
			if (c.course_code) codeById.set(c.id, String(c.course_code).trim().toUpperCase())
		}
	}

	for (const row of passedRows) {
		const code = codeById.get(row.course_id)
		if (!code || !row.student_id) continue
		const set = byStudent.get(row.student_id)
		if (set) set.add(code)
		else byStudent.set(row.student_id, new Set([code]))
	}

	return byStudent
}

/** UPPER course_code -> courses master row */
async function fetchCourseDetails(supabase: SupabaseClient, codes: string[]): Promise<Map<string, any>> {
	const details = new Map<string, any>()
	for (const batch of chunk(codes, 500)) {
		if (batch.length === 0) continue
		const { data } = await supabase
			.from('courses')
			.select('course_code, course_name, course_type, credit, course_category, exam_duration')
			.in('course_code', batch)
		for (const c of data || []) {
			if (c.course_code) details.set(String(c.course_code).trim().toUpperCase(), c)
		}
	}
	return details
}

/**
 * Learner-wise bulk builder: the merged Exam Application course list (current papers
 * from the offer list + pending backlogs + anything already registered) for many
 * learners at once.
 *
 * Every source is fetched in a handful of batched queries rather than per learner, so
 * a 500-learner cohort costs the same number of round trips as a single learner.
 */
export async function buildBulkExamApplicationCourses(
	supabase: SupabaseClient,
	params: BuildBulkCourseListParams
): Promise<BulkLearnerCourses[]> {
	const { institutions_id, examination_session_id, learners } = params
	if (learners.length === 0) return []

	const studentIds = [...new Set(learners.map(l => (l.student_id || '').trim()).filter(Boolean))]
	const registerNumbers = [...new Set(learners.map(l => (l.register_number || '').trim()).filter(Boolean))]

	// ── 1. All offerings in this session (indexed per programme below) ──
	const { data: offeringRows, error: offeringError } = await supabase
		.from('course_offerings')
		.select('id, course_id, course_code, program_code, program_id, semester, is_active, max_enrollment, enrolled_count')
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)
		.range(0, MAX_ROWS)

	if (offeringError) {
		console.error('[exam-applications:bulk] course_offerings error:', offeringError)
		throw new Error('Failed to fetch course offerings')
	}

	const offerings = offeringRows || []
	if (offerings.length > MAX_ROWS) {
		console.warn(`[exam-applications:bulk] course_offerings hit the ${MAX_ROWS} row cap - some offerings may be missing`)
	}

	const offeringsByProgram = new Map<string, any[]>()
	for (const offering of offerings) {
		const code = (offering.program_code || '').trim().toUpperCase()
		pushToMap(offeringsByProgram, code, offering)
	}

	// ── 2. Existing registrations for these learners in this session ──
	const registrations = await fetchByLearners(
		supabase,
		'exam_registrations',
		'id, student_id, stu_register_no, course_offering_id, course_code, registration_status, program_code, attempt_number, is_regular',
		(q: any) => q.eq('institutions_id', institutions_id).eq('examination_session_id', examination_session_id),
		'student_id',
		'stu_register_no',
		studentIds,
		registerNumbers
	)

	// ── 3. Pending backlogs for these learners ──
	let backlogs: any[] = []
	try {
		backlogs = await fetchByLearners(
			supabase,
			'student_backlogs_detailed_view',
			'id, student_id, register_number, program_code, course_id, course_code, course_name, course_credits, original_semester, attempt_count, max_attempts_allowed, failure_reason, priority_level, is_cleared, is_active',
			(q: any) => q.eq('institutions_id', institutions_id).eq('is_cleared', false).eq('is_active', true),
			'student_id',
			'register_number',
			studentIds,
			registerNumbers
		)
	} catch (e) {
		// A missing/renamed view must not break the whole page - degrade gracefully.
		console.error('[exam-applications:bulk] student_backlogs_detailed_view error:', e)
	}

	// ── 4. Already-cleared courses per learner ──
	const passedByStudent = await fetchPassedCourseCodes(supabase, institutions_id, studentIds)

	// ── 5. Course master rows for everything that could surface ──
	const courseDetails = await fetchCourseDetails(
		supabase,
		collectInvolvedCourseCodes({ offerings, registrations, backlogs })
	)

	// ── 6. Index the per-learner rows ──
	const regsBySid = new Map<string, any[]>()
	const regsByReg = new Map<string, any[]>()
	for (const row of registrations) {
		if (row.student_id) pushToMap(regsBySid, row.student_id, row)
		const reg = (row.stu_register_no || '').trim().toUpperCase()
		if (reg) pushToMap(regsByReg, reg, row)
	}

	const backlogsBySid = new Map<string, any[]>()
	const backlogsByReg = new Map<string, any[]>()
	for (const row of backlogs) {
		if (row.student_id) pushToMap(backlogsBySid, row.student_id, row)
		const reg = (row.register_number || '').trim().toUpperCase()
		if (reg) pushToMap(backlogsByReg, reg, row)
	}

	const pick = (bySid: Map<string, any[]>, byReg: Map<string, any[]>, learner: BulkLearnerRef) => {
		const rows = new Map<string, any>()
		for (const row of bySid.get((learner.student_id || '').trim()) || []) rows.set(row.id, row)
		const reg = (learner.register_number || '').trim().toUpperCase()
		for (const row of byReg.get(reg) || []) rows.set(row.id, row)
		return [...rows.values()]
	}

	// ── 7. Merge per learner ──
	return learners.map(learner => {
		const programCode = (learner.program_code || '').trim()
		const learnerRegistrations = pick(regsBySid, regsByReg, learner)
		const learnerBacklogs = pick(backlogsBySid, backlogsByReg, learner)

		// Offerings visible to this learner: their own programme, plus the offering for
		// any course they hold a backlog in. A shared/common course can be offered under
		// a different programme than the learner's, and without this the arrear paper
		// would resolve as "Not Offered".
		let learnerOfferings = programCode
			? (offeringsByProgram.get(programCode.toUpperCase()) || [])
			: offerings

		if (programCode && learnerBacklogs.length > 0) {
			const owned = new Set(learnerOfferings.map((o: any) => o.id))
			const backlogCodes = new Set(
				learnerBacklogs.map((b: any) => String(b.course_code || '').trim().toUpperCase()).filter(Boolean)
			)
			const extra = offerings.filter(
				(o: any) => !owned.has(o.id) && backlogCodes.has(String(o.course_code || '').trim().toUpperCase())
			)
			if (extra.length > 0) learnerOfferings = [...learnerOfferings, ...extra]
		}

		const semester = learner.semester != null && Number(learner.semester) > 0 ? Number(learner.semester) : null

		const courses = mergeExamApplicationCourses({
			offerings: learnerOfferings,
			registrations: learnerRegistrations,
			backlogs: learnerBacklogs,
			passedCourseCodes: passedByStudent.get((learner.student_id || '').trim()) || new Set<string>(),
			courseDetails,
			program_code: programCode || null,
			semester,
		})

		return {
			key: learnerKey(learner),
			student_id: learner.student_id || null,
			register_number: (learner.register_number || '').trim(),
			student_name: (learner.student_name || '').trim(),
			program_code: programCode || null,
			semester,
			courses,
			eligible_count: courses.filter(c => c.is_eligible).length,
			backlog_count: courses.filter(c => c.is_backlog).length,
			registered_count: courses.filter(c => c.is_registered).length,
			// Priced by the caller (the API route owns the fee-master lookup).
			fee: null,
		}
	})
}

/**
 * Subject-wise bulk builder: every learner who can apply for one course offering.
 *
 * Two learner pools are merged:
 *   1. Current paper - the programme + semester cohort passed in by the caller
 *      (it comes from MyJKKN, which only the browser session can page through)
 *   2. Backlog       - learners anywhere in the institution holding an uncleared
 *      backlog for this course code, whatever semester they are now in
 *
 * Learners already registered for the course in this session are returned too, marked
 * ineligible, so the operator can see who is covered without re-selecting them.
 */
export async function buildSubjectWiseCandidates(
	supabase: SupabaseClient,
	params: BuildSubjectCandidatesParams
): Promise<{ offering: BulkSubjectOffering; candidates: BulkSubjectCandidate[] }> {
	const { institutions_id, examination_session_id, course_offering_id, cohort = [] } = params
	const programFilter = new Set((params.program_codes || []).map(c => String(c || '').trim().toUpperCase()).filter(Boolean))
	const matchesProgram = (code: any) =>
		programFilter.size === 0 || programFilter.has(String(code || '').trim().toUpperCase())

	// ── 1. The selected offering ──
	const { data: offeringRow, error: offeringError } = await supabase
		.from('course_offerings')
		.select('id, course_id, course_code, program_code, program_id, semester, semester_code, examination_session_id, is_active, max_enrollment, enrolled_count')
		.eq('id', course_offering_id)
		.eq('institutions_id', institutions_id)
		.maybeSingle()

	if (offeringError) {
		console.error('[exam-applications:subject] course_offerings error:', offeringError)
		throw new Error('Failed to fetch the course offering')
	}
	if (!offeringRow) {
		throw new Error('Course offering not found for this institution')
	}
	if (offeringRow.examination_session_id && offeringRow.examination_session_id !== examination_session_id) {
		throw new Error('Course offering does not belong to the selected examination session')
	}

	const courseCode = String(offeringRow.course_code || '').trim()

	const { data: courseRow } = await supabase
		.from('courses')
		.select('course_code, course_name, course_type, credit, course_category, exam_duration')
		.eq('course_code', courseCode)
		.maybeSingle()

	const offering: BulkSubjectOffering = {
		course_offering_id: offeringRow.id,
		course_code: courseCode,
		course_name: courseRow?.course_name || '',
		course_credit: courseRow?.credit ?? null,
		program_code: offeringRow.program_code || null,
		semester: offeringRow.semester ?? null,
		semester_code: offeringRow.semester_code || null,
		is_active: offeringRow.is_active !== false,
		max_enrollment: offeringRow.max_enrollment ?? null,
		enrolled_count: offeringRow.enrolled_count ?? null,
	}

	// ── 2. Backlog holders for this course code ──
	let backlogs: any[] = []
	{
		let backlogQuery = supabase
			.from('student_backlogs_detailed_view')
			.select('id, student_id, register_number, student_name, program_code, course_id, course_code, original_semester, attempt_count, max_attempts_allowed, failure_reason, priority_level')
			.eq('institutions_id', institutions_id)
			.eq('is_cleared', false)
			.eq('is_active', true)
			.eq('course_code', courseCode)

		// One programme narrows in the query; several are filtered in memory, which
		// keeps the PostgREST URL short for a whole-tier selection.
		if (programFilter.size === 1) backlogQuery = backlogQuery.eq('program_code', [...programFilter][0])

		const { data, error } = await backlogQuery.range(0, MAX_ROWS)
		if (error) {
			console.error('[exam-applications:subject] student_backlogs_detailed_view error:', error)
		} else {
			backlogs = data || []
		}
	}

	// ── 3. Registrations for this course code in this session ──
	const { data: registrationRows, error: registrationError } = await supabase
		.from('exam_registrations')
		.select('id, student_id, stu_register_no, student_name, course_offering_id, course_code, registration_status, program_code')
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)
		.eq('course_code', courseCode)
		.range(0, MAX_ROWS)

	if (registrationError) {
		console.error('[exam-applications:subject] exam_registrations error:', registrationError)
		throw new Error('Failed to fetch existing registrations')
	}
	const registrations = registrationRows || []

	// ── 4. Merge the pools ──
	interface CandidateDraft {
		key: string
		student_id: string | null
		register_number: string
		student_name: string
		program_code: string | null
		semester: number | null
		sources: Set<ExamApplicationSource>
		is_backlog: boolean
		backlog_id: string | null
		attempt_count: number
		max_attempts_allowed: number
		failure_reason: string | null
		priority_level: string | null
		original_semester: number | null
		is_registered: boolean
		registration_id: string | null
		registration_status: string | null
	}

	const drafts = new Map<string, CandidateDraft>()

	const upsert = (learner: { student_id?: string | null; register_number?: string | null }): CandidateDraft | null => {
		const register = (learner.register_number || '').trim()
		const sid = (learner.student_id || '').trim()
		if (!register && !sid) return null
		const key = learnerKey({ student_id: sid, register_number: register })
		let draft = drafts.get(key)
		if (!draft) {
			draft = {
				key,
				student_id: sid || null,
				register_number: register,
				student_name: '',
				program_code: null,
				semester: null,
				sources: new Set<ExamApplicationSource>(),
				is_backlog: false,
				backlog_id: null,
				attempt_count: 0,
				max_attempts_allowed: 0,
				failure_reason: null,
				priority_level: null,
				original_semester: null,
				is_registered: false,
				registration_id: null,
				registration_status: null,
			}
			drafts.set(key, draft)
		}
		if (!draft.student_id && sid) draft.student_id = sid
		if (!draft.register_number && register) draft.register_number = register
		return draft
	}

	// 4a. Current paper cohort
	for (const learner of cohort.filter(l => matchesProgram(l.program_code))) {
		const draft = upsert(learner)
		if (!draft) continue
		draft.sources.add('Offer List')
		draft.student_name = draft.student_name || (learner.student_name || '').trim()
		draft.program_code = draft.program_code || learner.program_code || offering.program_code
		if (draft.semester == null && learner.semester != null) draft.semester = Number(learner.semester)
	}

	// 4b. Backlog holders
	for (const backlog of backlogs.filter(b => matchesProgram(b.program_code))) {
		const draft = upsert({ student_id: backlog.student_id, register_number: backlog.register_number })
		if (!draft) continue
		draft.sources.add('Backlog')
		draft.is_backlog = true
		draft.backlog_id = backlog.id
		draft.attempt_count = backlog.attempt_count ?? 0
		draft.max_attempts_allowed = backlog.max_attempts_allowed ?? 0
		draft.failure_reason = backlog.failure_reason || null
		draft.priority_level = backlog.priority_level || null
		draft.original_semester = backlog.original_semester ?? null
		draft.student_name = draft.student_name || (backlog.student_name || '').trim()
		draft.program_code = draft.program_code || backlog.program_code || null
		if (draft.semester == null) draft.semester = backlog.original_semester ?? null
	}

	// 4c. Already registered
	for (const registration of registrations.filter(r => matchesProgram(r.program_code))) {
		const draft = upsert({ student_id: registration.student_id, register_number: registration.stu_register_no })
		if (!draft) continue
		draft.sources.add('Exam Registration')
		draft.is_registered = true
		draft.registration_id = registration.id
		draft.registration_status = registration.registration_status || null
		draft.student_name = draft.student_name || (registration.student_name || '').trim()
		draft.program_code = draft.program_code || registration.program_code || null
	}

	// ── 4b. Does each candidate already hold ANY registration this session? ──
	// The mark statement and application fee are charged once per session, so a
	// learner with existing registrations has already paid them.
	const sessionRegisteredSids = new Set<string>()
	const sessionRegisteredRegs = new Set<string>()
	{
		const sids = [...new Set([...drafts.values()].map(d => d.student_id).filter(Boolean))] as string[]
		const regs = [...new Set([...drafts.values()].map(d => d.register_number).filter(Boolean))]

		const absorb = (rows: any[] | null) => {
			for (const row of rows || []) {
				if (row.student_id) sessionRegisteredSids.add(row.student_id)
				const reg = (row.stu_register_no || '').trim().toUpperCase()
				if (reg) sessionRegisteredRegs.add(reg)
			}
		}

		const scope = (q: any) =>
			q.eq('institutions_id', institutions_id).eq('examination_session_id', examination_session_id)

		for (const batch of chunk(sids, ID_CHUNK)) {
			const { data, error } = await scope(
				supabase.from('exam_registrations').select('student_id, stu_register_no').in('student_id', batch)
			).range(0, MAX_ROWS)
			if (error) { console.error('[exam-applications:subject] session registrations error:', error); break }
			absorb(data)
		}
		for (const batch of chunk(regs, IN_CHUNK)) {
			const { data, error } = await scope(
				supabase.from('exam_registrations').select('student_id, stu_register_no').in('stu_register_no', batch)
			).range(0, MAX_ROWS)
			if (error) { console.error('[exam-applications:subject] session registrations error:', error); break }
			absorb(data)
		}
	}

	// ── 5. Learners who already cleared this course ──
	const passedStudentIds = new Set<string>()
	const candidateStudentIds = [...drafts.values()].map(d => d.student_id).filter(Boolean) as string[]
	const courseId = offeringRow.course_id || backlogs.find(b => b.course_id)?.course_id || null
	if (courseId && candidateStudentIds.length > 0) {
		for (const batch of chunk(candidateStudentIds, ID_CHUNK)) {
			const { data, error } = await supabase
				.from('final_marks')
				.select('student_id')
				.eq('institutions_id', institutions_id)
				.eq('course_id', courseId)
				.eq('is_pass', true)
				.in('student_id', batch)
				.range(0, MAX_ROWS)
			if (error) {
				console.error('[exam-applications:subject] final_marks error:', error)
				break
			}
			for (const row of data || []) {
				if (row.student_id) passedStudentIds.add(row.student_id)
			}
		}
	}

	// ── 6. Resolve eligibility (same ladder as the single-learner list) ──
	const seatsFull =
		offering.max_enrollment != null && (offering.enrolled_count ?? 0) >= offering.max_enrollment

	const candidates: BulkSubjectCandidate[] = [...drafts.values()].map(draft => {
		let status: ExamApplicationEligibility = 'Eligible'
		let reason: string | null = null

		if (draft.is_registered) {
			status = 'Already Registered'
			reason = `Already registered in this session (${draft.registration_status || 'Pending'})`
		} else if (!draft.is_backlog && draft.student_id && passedStudentIds.has(draft.student_id)) {
			status = 'Already Passed'
			reason = 'Learner has already cleared this course'
		} else if (!offering.is_active) {
			status = 'Inactive Offering'
			reason = 'The course offering is inactive for this session'
		} else if (seatsFull) {
			status = 'Seats Full'
			reason = `Offering is full (${offering.enrolled_count}/${offering.max_enrollment})`
		}

		const sources = [...draft.sources]
		const sourceLabel = sources.length === 0
			? '-'
			: sources.length > 1 ? 'Multiple Sources' : sources[0]

		return {
			key: draft.key,
			student_id: draft.student_id,
			register_number: draft.register_number,
			// exam_registrations.student_name is NOT NULL - fall back to the register number
			// so a backlog holder with no name on file can still be applied for.
			student_name: draft.student_name || draft.register_number,
			program_code: draft.program_code,
			semester: draft.semester,
			sources,
			source_label: sourceLabel,
			is_backlog: draft.is_backlog,
			backlog_id: draft.backlog_id,
			attempt_number: draft.is_backlog ? (draft.attempt_count || 0) + 1 : 1,
			attempt_count: draft.attempt_count,
			max_attempts_allowed: draft.max_attempts_allowed,
			failure_reason: draft.failure_reason,
			priority_level: draft.priority_level,
			original_semester: draft.original_semester,
			is_registered: draft.is_registered,
			registration_id: draft.registration_id,
			registration_status: draft.registration_status,
			is_eligible: status === 'Eligible',
			eligibility_status: status,
			eligibility_reason: reason,
			has_session_registration:
				(draft.student_id ? sessionRegisteredSids.has(draft.student_id) : false) ||
				sessionRegisteredRegs.has(draft.register_number.toUpperCase()),
			// Priced by the caller (the API route owns the fee-master lookup).
			fee_level: null,
			fee_amount: null,
			learner_charge: 0,
			fine: 0,
			fee_total: 0,
		}
	})

	candidates.sort((a, b) => a.register_number.localeCompare(b.register_number))

	return { offering, candidates }
}
