// Shared helpers for exam-timetable learner-clash detection.
// Used by both the schedule save guard and the live pre-check endpoint so the
// two can never diverge.

import { ACTIVE_REGISTRATION_STATUSES } from '@/lib/exam-registration-status'

// Fetch all pages from a Supabase query (bypasses the default 1000-row cap).
export async function fetchAllPaginated(
	queryFn: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>,
	pageSize = 1000
): Promise<any[]> {
	const all: any[] = []
	let page = 0
	let hasMore = true
	while (hasMore && all.length < 1000000) {
		const { data, error } = await queryFn(page * pageSize, (page + 1) * pageSize - 1)
		if (error) throw error
		if (data && data.length > 0) {
			all.push(...data)
			page++
			hasMore = data.length === pageSize
		} else {
			hasMore = false
		}
	}
	return all
}

// Fetch rows for a large list of ids using batched .in() queries.
export async function fetchBatchedIn(
	ids: string[],
	queryFn: (batch: string[]) => Promise<{ data: any[] | null; error: any }>,
	batchSize = 300
): Promise<any[]> {
	const out: any[] = []
	for (let i = 0; i < ids.length; i += batchSize) {
		const batch = ids.slice(i, i + batchSize)
		const { data, error } = await queryFn(batch)
		if (error) throw error
		if (data) out.push(...data)
	}
	return out
}

export interface LearnerClash {
	stu_register_no: string
	student_name: string
	course_codes: string[]
}

export interface ClashOffering {
	course_offering_id: string
	course_code?: string
	// Present when the offering is an existing timetable row being re-placed in the same
	// operation — it must not be counted as a rival exam still occupying the slot.
	exam_timetable_id?: string
}

/**
 * Detect learners who would sit two DIFFERENT course codes in the same date + session.
 * Considers the offerings being placed against each other AND against exams already
 * scheduled in this session on the same slot.
 */
export async function detectLearnerClashes(
	supabase: any,
	params: {
		institutions_id: string
		examination_session_id: string
		exam_date: string
		session: string // caller uppercases (FN / AN)
		offerings: ClashOffering[]
	}
): Promise<LearnerClash[]> {
	const { institutions_id, examination_session_id, exam_date, session, offerings } = params

	const savedOfferingIds = [...new Set(offerings.map((o) => o.course_offering_id).filter(Boolean))]
	if (savedOfferingIds.length === 0) return []

	const codeByOffering = new Map<string, string>()
	for (const o of offerings) {
		if (o.course_offering_id) codeByOffering.set(o.course_offering_id, o.course_code || '')
	}
	const savedTimetableIds = new Set(offerings.map((o) => o.exam_timetable_id).filter(Boolean))

	// Exams already scheduled in this session on the SAME date + session.
	const slotTimetables = await fetchAllPaginated((from, to) =>
		supabase
			.from('exam_timetables')
			.select('id, course_offering_id')
			.eq('examination_session_id', examination_session_id)
			.eq('exam_date', exam_date)
			.eq('session', session)
			.range(from, to)
	)

	const slotOfferingIds = new Set<string>(savedOfferingIds)
	for (const t of slotTimetables as any[]) {
		if (savedTimetableIds.has(t.id)) continue // being re-saved here
		if (t.course_offering_id) slotOfferingIds.add(t.course_offering_id)
	}

	// Approved registrations for all offerings on this slot → learners per course code.
	const slotRegs = await fetchBatchedIn([...slotOfferingIds], (batch) =>
		supabase
			.from('exam_registrations')
			.select('student_id, stu_register_no, student_name, course_offering_id, course_code')
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.in('registration_status', ACTIVE_REGISTRATION_STATUSES)
			.in('course_offering_id', batch)
	)

	type LearnerSlot = { register_no: string; student_name: string; codes: Map<string, string> }
	const byLearner = new Map<string, LearnerSlot>()
	for (const r of slotRegs as any[]) {
		if (!slotOfferingIds.has(r.course_offering_id)) continue
		const learnerKey = r.stu_register_no || r.student_id
		if (!learnerKey) continue
		const code = r.course_code || codeByOffering.get(r.course_offering_id) || ''
		if (!code) continue
		let ls = byLearner.get(learnerKey)
		if (!ls) {
			ls = { register_no: r.stu_register_no || '', student_name: r.student_name || '', codes: new Map() }
			byLearner.set(learnerKey, ls)
		}
		if (!ls.codes.has(code)) ls.codes.set(code, r.course_offering_id)
	}

	const conflicts: LearnerClash[] = []
	for (const ls of byLearner.values()) {
		if (ls.codes.size > 1) {
			conflicts.push({
				stu_register_no: ls.register_no,
				student_name: ls.student_name,
				course_codes: [...ls.codes.keys()].sort(),
			})
		}
	}
	conflicts.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no))
	return conflicts
}
