import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * CV Pass percentage report — board-wise course breakdown.
 *
 * Sources:
 *   - exam_registrations  → total_students (registered for the course in session)
 *   - exam_attendance     → appeared = attendance_status = 'Present'
 *   - marks_entry         → pass count = total_marks_obtained >= courses.external_pass_mark
 *
 * Per course:
 *   total_students = COUNT(exam_registrations) for course in session
 *   appeared       = COUNT(exam_attendance.attendance_status = 'Present') for that course
 *   passed         = COUNT(marks_entry.total_marks_obtained >= course.external_pass_mark)
 */

const BATCH_SIZE = 1000

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('session_id')
		const boardCode = searchParams.get('board_code')

		if (!institutionsId || !sessionId || !boardCode) {
			return NextResponse.json({ error: 'institutions_id, session_id, board_code required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// 1. Get board_type (UG/PG) from board table for fallback threshold
		const { data: boardRow } = await supabase
			.from('board')
			.select('board_type')
			.eq('board_code', boardCode)
			.eq('institutions_id', institutionsId)
			.maybeSingle()
		const boardType = String((boardRow as any)?.board_type || 'UG').toUpperCase()
		const fallbackPassMark = boardType === 'PG' ? 38 : 30

		// 2. Fetch courses for this board with external_pass_mark
		const { data: courses, error: cErr } = await supabase
			.from('courses')
			.select('id, course_code, course_name, external_pass_mark')
			.eq('board_code', boardCode)
			.range(0, 9999)

		if (cErr) {
			console.error('[cv-report/pass-percentage] courses error', cErr)
			return NextResponse.json({ error: cErr.message }, { status: 500 })
		}

		if (!courses || courses.length === 0) {
			console.log('[cv-report/pass-percentage] No courses found for board_code:', boardCode)
			return NextResponse.json([])
		}

		console.log('[cv-report/pass-percentage] Found', courses.length, 'courses for board:', boardCode)

		const courseIds = courses.map(c => c.id)
		const passMarkByCourse = new Map<string, number>()
		for (const c of courses) {
			const pm = Number((c as any).external_pass_mark)
			passMarkByCourse.set(c.id as string, pm > 0 ? pm : fallbackPassMark)
		}

		// 2. Fetch exam_registrations → total_students
		const allRegs: Array<{ id: string; course_id: string }> = []
		for (let offset = 0; ; offset += BATCH_SIZE) {
			const { data, error } = await supabase
				.from('exam_registrations')
				.select('id, course_id')
				.eq('institutions_id', institutionsId)
				.eq('examination_session_id', sessionId)
				.in('course_id', courseIds)
				.range(offset, offset + BATCH_SIZE - 1)
			if (error) {
				console.error('[cv-report/pass-percentage] exam_registrations error', error)
				return NextResponse.json({ error: error.message }, { status: 500 })
			}
			if (!data || data.length === 0) break
			allRegs.push(...(data as any))
			if (data.length < BATCH_SIZE) break
		}

		console.log('[cv-report/pass-percentage] Found', allRegs.length, 'exam registrations')

		const regCountByCourse = new Map<string, number>()
		const examRegIds: string[] = []
		const examRegToCourse = new Map<string, string>()
		for (const r of allRegs) {
			regCountByCourse.set(r.course_id, (regCountByCourse.get(r.course_id) || 0) + 1)
			examRegIds.push(r.id)
			examRegToCourse.set(r.id, r.course_id)
		}

		// 3. Fetch exam_attendance → appeared (attendance_status = 'Present')
		const appearedByCourse = new Map<string, number>()
		for (let i = 0; i < examRegIds.length; i += BATCH_SIZE) {
			const batch = examRegIds.slice(i, i + BATCH_SIZE)
			const { data, error } = await supabase
				.from('exam_attendance')
				.select('exam_registration_id, course_id, attendance_status')
				.in('exam_registration_id', batch)
			if (error) {
				console.error('[cv-report/pass-percentage] exam_attendance error', error)
				continue
			}
			for (const a of data || []) {
				const status = String((a as any).attendance_status || '').toLowerCase()
				if (status === 'present') {
					const cid = (a as any).course_id as string
					appearedByCourse.set(cid, (appearedByCourse.get(cid) || 0) + 1)
				}
			}
		}

		console.log('[cv-report/pass-percentage] Appeared courses:', appearedByCourse.size)

		// 4. Fetch marks_entry → passed (total_marks_obtained >= external_pass_mark)
		const passedByCourse = new Map<string, number>()
		for (let i = 0; i < examRegIds.length; i += BATCH_SIZE) {
			const batch = examRegIds.slice(i, i + BATCH_SIZE)
			const { data, error } = await supabase
				.from('marks_entry')
				.select('exam_registration_id, course_id, total_marks_obtained')
				.in('exam_registration_id', batch)
			if (error) {
				console.error('[cv-report/pass-percentage] marks_entry error', error)
				continue
			}
			for (const m of data || []) {
				const cid = (m as any).course_id as string
				const v = Number((m as any).total_marks_obtained || 0)
				const passMark = passMarkByCourse.get(cid) ?? 30
				if (v >= passMark) {
					passedByCourse.set(cid, (passedByCourse.get(cid) || 0) + 1)
				}
			}
		}

		console.log('[cv-report/pass-percentage] Passed courses:', passedByCourse.size)

		// 5. Build rows
		const allRows = courses.map((c: any) => {
			const total = regCountByCourse.get(c.id) || 0
			const appeared = appearedByCourse.get(c.id) || 0
			const passed = passedByCourse.get(c.id) || 0
			const pass_percentage = appeared > 0 ? Math.round((passed / appeared) * 1000) / 10 : 0
			return {
				semester: '',
				course_code: c.course_code,
				course_name: c.course_name,
				total_students: total,
				appeared,
				passed,
				pass_percentage,
			}
		})

		console.log('[cv-report/pass-percentage] Before filter:', allRows.length, 'rows')

		const rows = allRows
			.filter(r => r.total_students > 0 || r.appeared > 0)
			.sort((a, b) => a.course_code.localeCompare(b.course_code))

		console.log('[cv-report/pass-percentage] After filter:', rows.length, 'rows returned')

		return NextResponse.json(rows)
	} catch (e: any) {
		console.error('[cv-report/pass-percentage] error', e)
		return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
	}
}
