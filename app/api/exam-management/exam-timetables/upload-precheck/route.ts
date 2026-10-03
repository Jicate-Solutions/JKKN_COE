import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllPaginated, detectLearnerClashes, type ClashOffering, type LearnerClash } from '@/lib/exam-clash'

interface UploadRow {
	row: number
	institutions_id: string
	examination_session_id: string
	course_code: string
	exam_date: string
	session: string
}

interface SlotClash {
	exam_date: string
	session: string
	course_codes: string[]
	rows: number[]
	conflict_count: number
	conflicts: LearnerClash[]
}

/**
 * POST — learner-clash pre-check for the bulk timetable upload.
 * Read-only. Runs the same detection as the schedule page, once per date + session in the
 * file, so the upload can flag learners who would sit two different courses in one slot
 * (against the other rows of the file AND exams already scheduled) before anything is saved.
 *
 * Body: { rows: [{ row, institutions_id, examination_session_id, course_code, exam_date, session }] }
 */
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const rows: UploadRow[] = (Array.isArray(body?.rows) ? body.rows : [])
			.map((r: any) => ({
				row: Number(r?.row) || 0,
				institutions_id: String(r?.institutions_id || ''),
				examination_session_id: String(r?.examination_session_id || ''),
				course_code: String(r?.course_code || '').trim(),
				exam_date: String(r?.exam_date || '').trim(),
				session: String(r?.session || '').trim().toUpperCase(),
			}))
			.filter((r: UploadRow) =>
				r.institutions_id && r.examination_session_id && r.course_code &&
				/^\d{4}-\d{2}-\d{2}$/.test(r.exam_date) && ['FN', 'AN'].includes(r.session)
			)

		if (rows.length === 0) {
			return NextResponse.json({ conflict_count: 0, slots: [] })
		}

		// Offerings and existing timetables are per institution + examination session
		const groups = new Map<string, UploadRow[]>()
		for (const r of rows) {
			const key = `${r.institutions_id}|${r.examination_session_id}`
			const list = groups.get(key)
			if (list) list.push(r)
			else groups.set(key, [r])
		}

		const slots: SlotClash[] = []

		for (const groupRows of groups.values()) {
			const { institutions_id, examination_session_id } = groupRows[0]

			// A course code can have several offering copies (one per programme) and learners
			// register against any of them, so every copy counts for the code.
			const offerings = await fetchAllPaginated((from, to) =>
				supabase
					.from('course_offerings')
					.select('id, course_code')
					.eq('institutions_id', institutions_id)
					.eq('examination_session_id', examination_session_id)
					.order('id')
					.range(from, to)
			)
			const offeringIdsByCode = new Map<string, string[]>()
			const codeByOfferingId = new Map<string, string>()
			for (const o of offerings as any[]) {
				if (!o.course_code) continue
				codeByOfferingId.set(o.id, o.course_code)
				const ids = offeringIdsByCode.get(o.course_code)
				if (ids) ids.push(o.id)
				else offeringIdsByCode.set(o.course_code, [o.id])
			}

			// Exams already scheduled in this session, by slot
			const timetables = await fetchAllPaginated((from, to) =>
				supabase
					.from('exam_timetables')
					.select('id, course_offering_id, exam_date, session')
					.eq('examination_session_id', examination_session_id)
					.order('id')
					.range(from, to)
			)
			const scheduledCodesBySlot = new Map<string, Set<string>>()
			for (const t of timetables as any[]) {
				const code = codeByOfferingId.get(t.course_offering_id)
				if (!code) continue
				const key = `${String(t.exam_date).slice(0, 10)}|${String(t.session).toUpperCase()}`
				const set = scheduledCodesBySlot.get(key)
				if (set) set.add(code)
				else scheduledCodesBySlot.set(key, new Set([code]))
			}

			const rowsBySlot = new Map<string, UploadRow[]>()
			for (const r of groupRows) {
				const key = `${r.exam_date}|${r.session}`
				const list = rowsBySlot.get(key)
				if (list) list.push(r)
				else rowsBySlot.set(key, [r])
			}

			for (const [slotKey, slotRows] of rowsBySlot) {
				const { exam_date, session } = slotRows[0]
				const uploadedCodes = new Set(slotRows.map((r) => r.course_code))
				const slotCodes = new Set([...uploadedCodes, ...(scheduledCodesBySlot.get(slotKey) || [])])

				// One course alone on the slot can't clash with anything
				if (slotCodes.size < 2) continue

				const slotOfferings: ClashOffering[] = []
				for (const code of slotCodes) {
					for (const id of offeringIdsByCode.get(code) || []) {
						slotOfferings.push({ course_offering_id: id, course_code: code })
					}
				}

				const conflicts = (await detectLearnerClashes(supabase, {
					institutions_id,
					examination_session_id,
					exam_date,
					session,
					offerings: slotOfferings,
				}))
					// Only clashes this upload is part of — clashes purely between exams
					// already on the timetable are not this file's doing.
					.filter((c) => c.course_codes.some((code) => uploadedCodes.has(code)))

				if (conflicts.length === 0) continue

				const clashingCodes = new Set(conflicts.flatMap((c) => c.course_codes))
				const involvedRows = slotRows.filter((r) => clashingCodes.has(r.course_code))
				slots.push({
					exam_date,
					session,
					course_codes: [...new Set(involvedRows.map((r) => r.course_code))].sort(),
					rows: involvedRows.map((r) => r.row).sort((a, b) => a - b),
					conflict_count: conflicts.length,
					conflicts: conflicts.slice(0, 100), // cap payload; count reflects the true total
				})
			}
		}

		slots.sort((a, b) => a.exam_date.localeCompare(b.exam_date) || b.session.localeCompare(a.session))

		return NextResponse.json({
			conflict_count: slots.reduce((sum, s) => sum + s.conflict_count, 0),
			slots,
		})
	} catch (e) {
		console.error('[upload precheck] error:', e)
		return NextResponse.json({ error: 'Pre-check failed' }, { status: 500 })
	}
}
