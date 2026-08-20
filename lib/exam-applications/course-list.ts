import type { SupabaseClient } from '@supabase/supabase-js'
import type {
	ExamApplicationCourse,
	ExamApplicationEligibility,
	ExamApplicationSource,
} from '@/types/exam-applications'

export interface BuildCourseListParams {
	institutions_id: string
	examination_session_id: string
	student_id?: string | null
	register_number?: string | null
	program_code?: string | null
	semester?: number | null
}

interface Draft {
	key: string
	course_code: string
	course_name: string
	course_type: string | null
	course_credit: number | null
	semester: number | null
	sources: Set<ExamApplicationSource>
	course_offering_id: string | null
	course_id: string | null
	program_code: string | null
	is_registered: boolean
	registration_id: string | null
	registration_status: string | null
	is_backlog: boolean
	backlog_id: string | null
	attempt_count: number
	max_attempts_allowed: number
	failure_reason: string | null
	priority_level: string | null
	original_semester: number | null
}

const MAX_ROWS = 9999

/** Build a PostgREST `or` filter that matches the learner by id and/or register number */
function studentClause(
	studentId: string | null | undefined,
	registerNo: string | null | undefined,
	idColumn: string,
	regColumn: string
) {
	const clauses: string[] = []
	if (studentId) clauses.push(`${idColumn}.eq.${studentId}`)
	if (registerNo) clauses.push(`${regColumn}.eq."${registerNo.replace(/"/g, '')}"`)
	return clauses.join(',')
}

function emptyDraft(code: string): Draft {
	return {
		key: code.trim().toUpperCase(),
		course_code: code.trim(),
		course_name: '',
		course_type: null,
		course_credit: null,
		semester: null,
		sources: new Set<ExamApplicationSource>(),
		course_offering_id: null,
		course_id: null,
		program_code: null,
		is_registered: false,
		registration_id: null,
		registration_status: null,
		is_backlog: false,
		backlog_id: null,
		attempt_count: 0,
		max_attempts_allowed: 0,
		failure_reason: null,
		priority_level: null,
		original_semester: null,
	}
}

/**
 * Builds the merged, de-duplicated and eligibility-validated course list that backs
 * the Exam Application module. This is the single source of truth used by both the
 * GET courses endpoint and the POST submit endpoint (final server-side validation),
 * so the UI can never submit something the server would not accept.
 */
export async function buildExamApplicationCourses(
	supabase: SupabaseClient,
	params: BuildCourseListParams
): Promise<ExamApplicationCourse[]> {
	const {
		institutions_id,
		examination_session_id,
		student_id,
		register_number,
		program_code,
		semester,
	} = params

	// -------------------------------------------------------------
	// 1. Course offerings available in the selected examination session
	// -------------------------------------------------------------
	let offeringQuery = supabase
		.from('course_offerings')
		.select('id, course_id, course_code, program_code, program_id, semester, is_active, max_enrollment, enrolled_count')
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)
		.range(0, MAX_ROWS)

	if (program_code) {
		offeringQuery = offeringQuery.eq('program_code', program_code)
	}

	const { data: offeringRows, error: offeringError } = await offeringQuery
	if (offeringError) {
		console.error('[exam-applications] course_offerings error:', offeringError)
		throw new Error('Failed to fetch course offerings')
	}

	const offerings = offeringRows || []

	// Index offerings by course code. When the same course is offered more than once,
	// prefer an active offering, then one matching the learner current semester.
	const offeringByCode = new Map<string, any>()
	for (const offering of offerings) {
		const code = (offering.course_code || '').trim().toUpperCase()
		if (!code) continue
		const existing = offeringByCode.get(code)
		if (!existing) {
			offeringByCode.set(code, offering)
			continue
		}
		const betterActive = offering.is_active !== false && existing.is_active === false
		const betterSemester =
			semester != null && offering.semester === semester && existing.semester !== semester
		if (betterActive || betterSemester) offeringByCode.set(code, offering)
	}

	// -------------------------------------------------------------
	// 2. Existing exam registrations for this learner + session
	// -------------------------------------------------------------
	const regClause = studentClause(student_id, register_number, 'student_id', 'stu_register_no')
	let registrations: any[] = []
	if (regClause) {
		const { data: registrationRows, error: registrationError } = await supabase
			.from('exam_registrations')
			.select('id, course_offering_id, course_code, registration_status, program_code, attempt_number, is_regular')
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.or(regClause)
			.range(0, MAX_ROWS)

		if (registrationError) {
			console.error('[exam-applications] exam_registrations error:', registrationError)
			throw new Error('Failed to fetch exam registrations')
		}
		registrations = registrationRows || []
	}

	// -------------------------------------------------------------
	// 3. Pending backlogs (uncleared arrears) for this learner
	// -------------------------------------------------------------
	let backlogs: any[] = []
	if (regClause) {
		const backlogClause = studentClause(student_id, register_number, 'student_id', 'register_number')
		const { data: backlogRows, error: backlogError } = await supabase
			.from('student_backlogs_detailed_view')
			.select('id, student_id, register_number, program_code, course_id, course_code, course_name, course_credits, original_semester, attempt_count, max_attempts_allowed, failure_reason, priority_level, is_cleared, is_active')
			.eq('institutions_id', institutions_id)
			.eq('is_cleared', false)
			.eq('is_active', true)
			.or(backlogClause)
			.range(0, MAX_ROWS)

		if (backlogError) {
			// A missing/renamed view must not break the whole page - degrade gracefully.
			console.error('[exam-applications] student_backlogs_detailed_view error:', backlogError)
		} else {
			backlogs = backlogRows || []
		}
	}

	// -------------------------------------------------------------
	// 4. Courses the learner has already passed (never shown as backlog)
	// -------------------------------------------------------------
	const passedCourseCodes = new Set<string>()
	if (student_id) {
		const { data: passedRows, error: passedError } = await supabase
			.from('final_marks')
			.select('course_id')
			.eq('institutions_id', institutions_id)
			.eq('student_id', student_id)
			.eq('is_pass', true)
			.range(0, MAX_ROWS)

		if (passedError) {
			console.error('[exam-applications] final_marks error:', passedError)
		} else if (passedRows && passedRows.length > 0) {
			const passedCourseIds = [...new Set(passedRows.map((r: any) => r.course_id).filter(Boolean))]
			for (let i = 0; i < passedCourseIds.length; i += 500) {
				const batch = passedCourseIds.slice(i, i + 500)
				const { data: courseRows } = await supabase
					.from('courses')
					.select('id, course_code')
					.in('id', batch)
				for (const c of courseRows || []) {
					if (c.course_code) passedCourseCodes.add(String(c.course_code).trim().toUpperCase())
				}
			}
		}
	}

	// -------------------------------------------------------------
	// 5. Merge the three sources, de-duplicating by course code
	// -------------------------------------------------------------
	const drafts = new Map<string, Draft>()

	const upsert = (code: string | null | undefined): Draft | null => {
		const clean = (code || '').trim()
		if (!clean) return null
		const key = clean.toUpperCase()
		let draft = drafts.get(key)
		if (!draft) {
			draft = emptyDraft(clean)
			drafts.set(key, draft)
		}
		return draft
	}

	const offeringById = new Map(offerings.map((o: any) => [o.id, o]))

	// 5a. Source: Exam Registration
	for (const registration of registrations) {
		const offering = registration.course_offering_id ? offeringById.get(registration.course_offering_id) : null
		const draft = upsert(registration.course_code || offering?.course_code)
		if (!draft) continue
		draft.sources.add('Exam Registration')
		draft.is_registered = true
		draft.registration_id = registration.id
		draft.registration_status = registration.registration_status || null
		draft.course_offering_id = registration.course_offering_id || draft.course_offering_id
		draft.program_code = draft.program_code || registration.program_code || offering?.program_code || null
		draft.course_id = draft.course_id || offering?.course_id || null
		if (draft.semester == null && offering?.semester != null) draft.semester = offering.semester
	}

	// 5b. Source: Backlog / Arrear (already-passed courses are never listed as backlog)
	for (const backlog of backlogs) {
		const code = (backlog.course_code || '').trim()
		if (!code) continue
		if (passedCourseCodes.has(code.toUpperCase())) continue
		const draft = upsert(code)
		if (!draft) continue
		draft.sources.add('Backlog')
		draft.is_backlog = true
		draft.backlog_id = backlog.id
		draft.attempt_count = backlog.attempt_count ?? 0
		draft.max_attempts_allowed = backlog.max_attempts_allowed ?? 0
		draft.failure_reason = backlog.failure_reason || null
		draft.priority_level = backlog.priority_level || null
		draft.original_semester = backlog.original_semester ?? null
		draft.course_name = draft.course_name || backlog.course_name || ''
		draft.course_credit = draft.course_credit ?? backlog.course_credits ?? null
		draft.course_id = draft.course_id || backlog.course_id || null
		draft.program_code = draft.program_code || backlog.program_code || null
		if (draft.semester == null) draft.semester = backlog.original_semester ?? null
	}

	// 5c. Source: Offer List (offerings for the learner programme + current semester)
	for (const offering of offerings) {
		if (offering.is_active === false) continue
		if (semester != null && offering.semester !== semester) continue
		const draft = upsert(offering.course_code)
		if (!draft) continue
		draft.sources.add('Offer List')
		draft.course_offering_id = draft.course_offering_id || offering.id
		draft.course_id = draft.course_id || offering.course_id || null
		draft.program_code = draft.program_code || offering.program_code || null
		if (draft.semester == null) draft.semester = offering.semester ?? null
	}

	if (drafts.size === 0) return []

	// -------------------------------------------------------------
	// 6. Enrich with course master data (name, type, credit)
	// -------------------------------------------------------------
	const codes = [...drafts.values()].map(d => d.course_code)
	const courseDetails = new Map<string, any>()
	for (let i = 0; i < codes.length; i += 500) {
		const batch = codes.slice(i, i + 500)
		const { data: courseRows } = await supabase
			.from('courses')
			.select('course_code, course_name, course_type, credit')
			.in('course_code', batch)
		for (const c of courseRows || []) {
			if (c.course_code) courseDetails.set(String(c.course_code).trim().toUpperCase(), c)
		}
	}

	// -------------------------------------------------------------
	// 7. Resolve eligibility
	// -------------------------------------------------------------
	const results: ExamApplicationCourse[] = []

	for (const draft of drafts.values()) {
		const detail = courseDetails.get(draft.key)
		const offering = draft.course_offering_id
			? offeringById.get(draft.course_offering_id) || offeringByCode.get(draft.key)
			: offeringByCode.get(draft.key)

		const resolvedOfferingId = draft.course_offering_id || offering?.id || null

		let status: ExamApplicationEligibility = 'Eligible'
		let reason: string | null = null

		if (draft.is_registered) {
			status = 'Already Registered'
			reason = `Already registered in this session (${draft.registration_status || 'Pending'})`
		} else if (!draft.is_backlog && passedCourseCodes.has(draft.key)) {
			status = 'Already Passed'
			reason = 'Learner has already cleared this course'
		} else if (!resolvedOfferingId || !offering) {
			status = 'Not Offered'
			reason = 'No course offering exists for this course in the selected session'
		} else if (offering.is_active === false) {
			status = 'Inactive Offering'
			reason = 'The course offering is inactive for this session'
		} else if (
			draft.is_backlog &&
			draft.max_attempts_allowed > 0 &&
			draft.attempt_count >= draft.max_attempts_allowed
		) {
			status = 'Attempts Exhausted'
			reason = `All ${draft.max_attempts_allowed} permitted attempts have been used`
		} else if (
			offering.max_enrollment != null &&
			(offering.enrolled_count ?? 0) >= offering.max_enrollment
		) {
			status = 'Seats Full'
			reason = `Offering is full (${offering.enrolled_count}/${offering.max_enrollment})`
		}

		const sources = [...draft.sources]
		const sourceLabel = sources.length === 0
			? '-'
			: sources.length > 1 ? 'Multiple Sources' : sources[0]

		results.push({
			key: draft.key,
			course_code: draft.course_code,
			course_name: draft.course_name || detail?.course_name || '',
			course_type: detail?.course_type ?? draft.course_type ?? null,
			course_credit: detail?.credit ?? draft.course_credit ?? null,
			semester: draft.semester ?? offering?.semester ?? null,
			sources,
			source_label: sourceLabel,
			course_offering_id: resolvedOfferingId,
			course_id: draft.course_id || offering?.course_id || null,
			program_code: draft.program_code || offering?.program_code || program_code || null,
			is_eligible: status === 'Eligible',
			eligibility_status: status,
			eligibility_reason: reason,
			is_registered: draft.is_registered,
			registration_id: draft.registration_id,
			registration_status: draft.registration_status,
			is_backlog: draft.is_backlog,
			backlog_id: draft.backlog_id,
			attempt_number: draft.is_backlog ? (draft.attempt_count || 0) + 1 : 1,
			attempt_count: draft.attempt_count,
			max_attempts_allowed: draft.max_attempts_allowed,
			failure_reason: draft.failure_reason,
			priority_level: draft.priority_level,
			original_semester: draft.original_semester,
		})
	}

	results.sort((a, b) => {
		const sa = a.semester ?? 99
		const sb = b.semester ?? 99
		if (sa !== sb) return sa - sb
		return a.course_code.localeCompare(b.course_code)
	})

	return results
}
