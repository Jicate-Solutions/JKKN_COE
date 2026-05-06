import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Pass percentage report — board-wise course breakdown.
 *
 * Source: final_marks (result_status='Published')
 * Aggregation per course_id:
 *   total_students = registrations for that course in this session
 *   appeared       = final_marks rows where pass_status != 'Absent'
 *   passed         = final_marks rows where is_pass = true
 */
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

		const { data: courses, error: cErr } = await supabase
			.from('courses')
			.select('id, course_code, course_name')
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

		const { data: regs } = await supabase
			.from('exam_registrations')
			.select('course_id')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.in('course_id', courseIds)
			.range(0, 99999)

		console.log('[cv-report/pass-percentage] Found', regs?.length || 0, 'exam registrations')

		const regCountByCourse = new Map<string, number>()
		for (const r of regs || []) {
			regCountByCourse.set(r.course_id as string, (regCountByCourse.get(r.course_id as string) || 0) + 1)
		}

		const { data: marks, error: mErr } = await supabase
			.from('final_marks')
			.select('course_id, is_pass, pass_status')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.in('course_id', courseIds)
			.range(0, 99999)

		console.log('[cv-report/pass-percentage] Found', marks?.length || 0, 'final_marks rows')

		if (mErr) {
			console.error('[cv-report/pass-percentage] final_marks error', mErr)
			return NextResponse.json({ error: mErr.message }, { status: 500 })
		}

		const appearedByCourse = new Map<string, number>()
		const passedByCourse = new Map<string, number>()
		for (const m of marks || []) {
			const cid = m.course_id as string
			const status = (m.pass_status || '').toLowerCase()
			if (status !== 'absent') {
				appearedByCourse.set(cid, (appearedByCourse.get(cid) || 0) + 1)
			}
			if (m.is_pass) {
				passedByCourse.set(cid, (passedByCourse.get(cid) || 0) + 1)
			}
		}

		const allRows = courses.map((c: any) => {
			const total = regCountByCourse.get(c.id) || 0
			const appeared = appearedByCourse.get(c.id) || 0
			const passed = passedByCourse.get(c.id) || 0
			const pass_percentage = appeared > 0 ? Math.round((passed / appeared) * 1000) / 10 : 0
			return {
				semester: c.semester ?? '',
				course_code: c.course_code,
				course_name: c.course_name,
				total_students: total,
				appeared,
				passed,
				pass_percentage,
				_order: c.course_order ?? 0,
			}
		})

		console.log('[cv-report/pass-percentage] Before filter:', allRows.length, 'rows')

		const rows = allRows
			.filter(r => r.total_students > 0 || r.appeared > 0)
			.sort((a, b) => {
				const semA = typeof a.semester === 'number' ? a.semester : parseInt(String(a.semester) || '0', 10) || 0
				const semB = typeof b.semester === 'number' ? b.semester : parseInt(String(b.semester) || '0', 10) || 0
				if (semA !== semB) return semA - semB
				if (a._order !== b._order) return a._order - b._order
				return a.course_code.localeCompare(b.course_code)
			})
			.map(({ _order, ...rest }) => rest)

		console.log('[cv-report/pass-percentage] After filter:', rows.length, 'rows returned')

		return NextResponse.json(rows)
	} catch (e: any) {
		console.error('[cv-report/pass-percentage] error', e)
		return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
	}
}
