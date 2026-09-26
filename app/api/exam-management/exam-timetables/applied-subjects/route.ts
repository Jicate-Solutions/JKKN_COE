import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllPaginated, fetchBatchedIn } from '@/lib/exam-clash'

/** Import accepts Theory / Practical / Project / Field Work / Group Project; fold the rest onto Theory */
const IMPORT_EXAM_TYPES = ['Theory', 'Practical', 'Project', 'Field Work', 'Group Project']
function toExamType(category: string | null | undefined): string {
	const value = String(category || '').trim()
	return IMPORT_EXAM_TYPES.includes(value) ? value : 'Theory'
}

/**
 * GET — subjects applied for in an examination session, one row per course code.
 * Feeds the "Applied Subjects" sheet of the exam timetable import template.
 * Students = distinct learners whose registration is fee-paid: Approved and either
 * final-approved (payment_date) or, for sessions approved before the final
 * approval step existed (no payment_date anywhere), flagged fee_paid.
 * Papers are keyed by the OFFERING's course_code - exam_registrations.course_code
 * can point at a stray duplicate master row.
 * Exam Date / Session are filled when the course is already in exam_timetables.
 * The institution is taken from the session itself (sessions are institution-scoped).
 */
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const examination_session_id = searchParams.get('examination_session_id')

		if (!examination_session_id) {
			return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		}

		const { data: examSession, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('id, session_code, institutions_id, institutions:institutions_id(institution_code)')
			.eq('id', examination_session_id)
			.single()

		if (sessionError || !examSession) {
			return NextResponse.json({ error: 'Examination session not found' }, { status: 404 })
		}
		const institutions_id = (examSession as any).institutions_id
		const session_code = (examSession as any).session_code
		const inst = (examSession as any).institutions
		const institution_code = (Array.isArray(inst) ? inst[0] : inst)?.institution_code || ''

		// 1. Fee-paid approved registrations for the session
		const registrations = await fetchAllPaginated((from, to) =>
			supabase
				.from('exam_registrations')
				.select('id, course_offering_id, course_code, student_id, stu_register_no')
				.eq('institutions_id', institutions_id)
				.eq('examination_session_id', examination_session_id)
				.eq('registration_status', 'Approved')
				.or('payment_date.not.is.null,fee_paid.eq.true')
				.order('id')
				.range(from, to)
		)

		if (registrations.length === 0) {
			return NextResponse.json({ institution_code, session_code, subjects: [] })
		}

		// 2. Offerings carry the authoritative course code + master course
		const offeringIds = [...new Set(registrations.map((r: any) => r.course_offering_id).filter(Boolean))] as string[]
		const offerings = await fetchBatchedIn(offeringIds, (batch) =>
			supabase
				.from('course_offerings')
				.select('id, course_id, course_code, courses:course_id(course_code, course_name, course_category)')
				.in('id', batch)
		)
		const offeringById = new Map<string, any>()
		for (const o of offerings) offeringById.set(o.id, o)

		// 3. Distinct learners per course code
		const byCode = new Map<string, { learners: Set<string>; course_id: string | null; course: any }>()
		for (const r of registrations) {
			const offering = offeringById.get(r.course_offering_id)
			const course = (Array.isArray(offering?.courses) ? offering.courses[0] : offering?.courses) || null
			const code = offering?.course_code || course?.course_code || r.course_code
			if (!code) continue
			let entry = byCode.get(code)
			if (!entry) {
				entry = { learners: new Set<string>(), course_id: offering?.course_id || null, course }
				byCode.set(code, entry)
			}
			if (!entry.course && course) {
				entry.course = course
				entry.course_id = offering?.course_id || null
			}
			const learnerKey = r.student_id || r.stu_register_no
			if (learnerKey) entry.learners.add(learnerKey)
		}

		// 4. Already-scheduled date + session per course
		const timetables = await fetchAllPaginated((from, to) =>
			supabase
				.from('exam_timetables')
				.select('id, course_id, exam_date, session')
				.eq('institutions_id', institutions_id)
				.eq('examination_session_id', examination_session_id)
				.order('id')
				.range(from, to)
		)
		const scheduledByCourse = new Map<string, { exam_date: string; session: string }>()
		for (const t of timetables) {
			if (t.course_id && !scheduledByCourse.has(t.course_id)) {
				scheduledByCourse.set(t.course_id, { exam_date: t.exam_date, session: t.session })
			}
		}

		const subjects = [...byCode.entries()]
			.map(([course_code, entry]) => {
				const scheduled = entry.course_id ? scheduledByCourse.get(entry.course_id) : undefined
				return {
					course_code,
					course_name: entry.course?.course_name || '',
					exam_type: toExamType(entry.course?.course_category),
					students: entry.learners.size,
					exam_date: scheduled?.exam_date || '',
					session: scheduled?.session || '',
				}
			})
			.sort((a, b) => a.course_code.localeCompare(b.course_code))

		return NextResponse.json({ institution_code, session_code, subjects })
	} catch (error) {
		console.error('[applied-subjects] error:', error)
		return NextResponse.json({ error: 'Failed to fetch applied subjects' }, { status: 500 })
	}
}
