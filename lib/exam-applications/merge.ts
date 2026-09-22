import type {
	ExamApplicationCourse,
	ExamApplicationEligibility,
	ExamApplicationSource,
} from '@/types/exam-applications'
import { isFinalApprovedRegistration } from '@/lib/exam-registration-status'

/**
 * Shared merge + eligibility engine for the Exam Application module.
 *
 * The single-learner builder (lib/exam-applications/course-list.ts) and the bulk
 * builder (lib/exam-applications/bulk-course-list.ts) both feed their already
 * fetched rows into this file, so one learner and five hundred learners are always
 * judged by exactly the same rules.
 */

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
	/** Stamped by final approval - tells a final-approved row from a merely approved one */
	payment_date: string | null
	/** The registration is a current (regular) paper - false for an arrear attempt */
	is_regular_registration: boolean
	is_backlog: boolean
	backlog_id: string | null
	attempt_count: number
	max_attempts_allowed: number
	failure_reason: string | null
	priority_level: string | null
	original_semester: number | null
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
		payment_date: null,
		is_regular_registration: false,
		is_backlog: false,
		backlog_id: null,
		attempt_count: 0,
		max_attempts_allowed: 0,
		failure_reason: null,
		priority_level: null,
		original_semester: null,
	}
}

export interface MergeCourseInput {
	/** course_offerings rows already scoped to the learner programme + session */
	offerings: any[]
	/** exam_registrations rows for this learner + session */
	registrations: any[]
	/** uncleared student_backlogs_detailed_view rows for this learner */
	backlogs: any[]
	/** UPPER-cased course codes the learner has already cleared */
	passedCourseCodes: Set<string>
	/** UPPER-cased course_code -> courses master row (may be a superset) */
	courseDetails: Map<string, any>
	program_code?: string | null
	semester?: number | null
}

/**
 * Every course code that could end up in a merged list. Used to prefetch the
 * courses master rows in a single round trip before merging.
 */
export function collectInvolvedCourseCodes(input: {
	offerings?: any[]
	registrations?: any[]
	backlogs?: any[]
}): string[] {
	const codes = new Set<string>()
	const add = (value: any) => {
		const code = String(value || '').trim()
		if (code) codes.add(code)
	}
	;(input.offerings || []).forEach(o => add(o.course_code))
	;(input.registrations || []).forEach(r => add(r.course_code))
	;(input.backlogs || []).forEach(b => add(b.course_code))
	return [...codes]
}

/**
 * Index offerings by course code. When the same course is offered more than once,
 * prefer an active offering, then one matching the learner current semester.
 */
export function indexOfferingsByCode(offerings: any[], semester?: number | null): Map<string, any> {
	const byCode = new Map<string, any>()
	for (const offering of offerings) {
		const code = (offering.course_code || '').trim().toUpperCase()
		if (!code) continue
		const existing = byCode.get(code)
		if (!existing) {
			byCode.set(code, offering)
			continue
		}
		const betterActive = offering.is_active !== false && existing.is_active === false
		const betterSemester =
			semester != null && offering.semester === semester && existing.semester !== semester
		if (betterActive || betterSemester) byCode.set(code, offering)
	}
	return byCode
}

/**
 * Merge the three sources (Exam Registration / Backlog / Offer List) into one
 * de-duplicated, eligibility-validated course list for a single learner.
 */
export function mergeExamApplicationCourses(input: MergeCourseInput): ExamApplicationCourse[] {
	const { offerings, registrations, backlogs, passedCourseCodes, courseDetails, program_code, semester } = input

	const offeringByCode = indexOfferingsByCode(offerings, semester)
	const offeringById = new Map(offerings.map((o: any) => [o.id, o]))

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

	// Source: Exam Registration
	for (const registration of registrations) {
		const offering = registration.course_offering_id ? offeringById.get(registration.course_offering_id) : null
		const draft = upsert(registration.course_code || offering?.course_code)
		if (!draft) continue
		draft.sources.add('Exam Registration')
		draft.is_registered = true
		draft.registration_id = registration.id
		draft.registration_status = registration.registration_status || null
		draft.payment_date = registration.payment_date || null
		// NULL is a legacy row the Exam Registration module wrote - a regular paper
		draft.is_regular_registration = registration.is_regular !== false
		draft.course_offering_id = registration.course_offering_id || draft.course_offering_id
		draft.program_code = draft.program_code || registration.program_code || offering?.program_code || null
		draft.course_id = draft.course_id || offering?.course_id || null
		if (draft.semester == null && offering?.semester != null) draft.semester = offering.semester
	}

	// Source: Backlog / Arrear (already-passed courses are never listed as backlog)
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

	// Source: Offer List (offerings for the learner programme + current semester)
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

	// Current papers come first. A learner who still holds a registered current
	// paper they have not applied for may not apply for an arrear - the Current
	// Papers tab has to be done before the Arrear tab. A learner with NO current
	// paper this session (arrears only) is not held to this and applies directly.
	const isOpenCurrentPaper = (draft: Draft): boolean => {
		if (!draft.is_registered || !draft.is_regular_registration) return false
		const value = String(draft.registration_status || '').trim().toUpperCase()
		if (['CANCELLED', 'REJECTED', 'WITHDRAWN'].includes(value)) return false
		return value !== 'APPLIED' && !isFinalApprovedRegistration(draft)
	}
	const openCurrentPapers = [...drafts.values()].filter(isOpenCurrentPaper).length

	const results: ExamApplicationCourse[] = []

	for (const draft of drafts.values()) {
		const detail = courseDetails.get(draft.key)
		const offering = draft.course_offering_id
			? offeringById.get(draft.course_offering_id) || offeringByCode.get(draft.key)
			: offeringByCode.get(draft.key)

		const resolvedOfferingId = draft.course_offering_id || offering?.id || null

		let status: ExamApplicationEligibility = 'Eligible'
		let reason: string | null = null

		// Attempt limits are deliberately not part of this ladder: a backlog holder
		// past max_attempts_allowed can still be applied for, so attempt_count and
		// max_attempts_allowed are carried through for display only.
		//
		// A registration existing is NOT the same as it having been applied for.
		// Registration and application happen on the same screen, so a paper the
		// learner is registered for but has not applied for must stay actionable -
		// applying then UPDATES that row instead of inserting a second one. Treating
		// every registration as done left those rows reachable from neither tab.
		//
		// Final approval moves 'Applied' on to 'Approved'. That row is further along,
		// not un-applied: left actionable it read as never applied for, and applying
		// again dragged it back to 'Applied' over the fee the approval had settled.
		const registrationStatus = String(draft.registration_status || '').trim().toUpperCase()
		const finalApproved = isFinalApprovedRegistration(draft)
		const applicationDone = registrationStatus === 'APPLIED' || finalApproved
		const registrationBlocked = ['CANCELLED', 'REJECTED', 'WITHDRAWN'].includes(registrationStatus)
		const registeredNotApplied = draft.is_registered && !applicationDone && !registrationBlocked

		if (draft.is_registered && finalApproved) {
			status = 'Already Approved'
			reason = 'Applied for and final-approved in this session'
		} else if (draft.is_registered && applicationDone) {
			status = 'Already Applied'
			reason = 'Already applied for in this session'
		} else if (draft.is_registered && registrationBlocked) {
			status = 'Already Registered'
			reason = `Registration is ${draft.registration_status} - it cannot be applied for`
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
			!registeredNotApplied &&
			offering.max_enrollment != null &&
			(offering.enrolled_count ?? 0) >= offering.max_enrollment
		) {
			status = 'Seats Full'
			reason = `Offering is full (${offering.enrolled_count}/${offering.max_enrollment})`
		}

		// Tested last, so a paper with a harder stop (not offered, already passed)
		// still says so. The open current papers themselves stay 'Eligible' - they
		// are exactly what has to be applied for first.
		// Only arrears are held back: a backlog paper, or an arrear
		// registration awaiting application. A current-semester paper from the offer
		// list is itself a current paper and is never blocked by the others.
		const isArrearPaper = draft.is_backlog || (draft.is_registered && !draft.is_regular_registration)
		if (status === 'Eligible' && openCurrentPapers > 0 && isArrearPaper && !isOpenCurrentPaper(draft)) {
			status = 'Current Papers Pending'
			reason = `Apply the ${openCurrentPapers} registered current paper${openCurrentPapers === 1 ? '' : 's'} first - arrears can be applied for only after the current papers`
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
			course_category: detail?.course_category ?? null,
			exam_duration: detail?.exam_duration ?? null,
			// Priced by the caller via lib/exam-fee/calculate.ts - the merge engine
			// stays free of fee-master lookups.
			fee_head: null,
			fee_amount: null,
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
			requires_update: status === 'Eligible' && registeredNotApplied && Boolean(draft.registration_id),
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
