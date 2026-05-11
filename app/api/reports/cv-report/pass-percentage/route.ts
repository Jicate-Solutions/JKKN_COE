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
// Smaller batch for `.in('exam_registration_id', batch)` queries — large IN
// clauses (1000 UUIDs ≈ 37KB) blow past PostgREST's URL length limit and the
// query silently truncates. The attendance/QP-count reports use 200 too.
const IN_BATCH_SIZE = 200
// Max concurrent Supabase calls — prevents overwhelming the connection pool
const CONCURRENCY = 8

/** Run async tasks with bounded concurrency instead of serially. */
async function runBatches<T>(tasks: Array<() => PromiseLike<T>>, concurrency = CONCURRENCY): Promise<T[]> {
	const results: T[] = new Array(tasks.length)
	let idx = 0
	async function worker() {
		while (idx < tasks.length) {
			const i = idx++
			results[i] = await tasks[i]()
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
	return results
}

const ROMAN: Record<number, string> = {
	1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V',
	6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X',
}

function semesterToRoman(semesterCode: string): string {
	if (!semesterCode) return ''
	const match = String(semesterCode).match(/(\d+)/)
	if (!match) return ''
	const n = parseInt(match[1], 10)
	return ROMAN[n] || String(n)
}

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

		const courseCodes = courses.map(c => (c as any).course_code as string)
		const courseIds = courses.map(c => c.id as string)
		const courseIdByCode = new Map<string, string>()
		const passMarkByCourseId = new Map<string, number>()
		const passMarkByCourseCode = new Map<string, number>()
		for (const c of courses) {
			const pm = Number((c as any).external_pass_mark)
			const passMark = pm > 0 ? pm : fallbackPassMark
			courseIdByCode.set((c as any).course_code as string, c.id as string)
			passMarkByCourseId.set(c.id as string, passMark)
			passMarkByCourseCode.set((c as any).course_code as string, passMark)
		}

		// 1b. Fetch semester_code + course_order from course_mapping — parallel batches
		const semesterByCourseId = new Map<string, string>()
		const orderByCourseId = new Map<string, number>()
		const cmBatches = Array.from(
			{ length: Math.ceil(courseIds.length / BATCH_SIZE) },
			(_, i) => courseIds.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE),
		)
		const cmResults = await runBatches(cmBatches.map(batch => () =>
			supabase
				.from('course_mapping')
				.select('course_id, semester_code, course_order')
				.in('course_id', batch)
				.eq('is_active', true)
				.range(0, 99999)
		))
		for (const { data: mappings } of cmResults) {
			for (const cm of mappings || []) {
				const cid = (cm as any).course_id as string
				if (!semesterByCourseId.has(cid)) {
					semesterByCourseId.set(cid, String((cm as any).semester_code ?? ''))
					orderByCourseId.set(cid, Number((cm as any).course_order ?? 999))
				}
			}
		}

		// 2. Fetch exam_registrations — first page gets total count, remaining pages in parallel
		const firstPage = await supabase
			.from('exam_registrations')
			.select('id, course_code', { count: 'exact', head: false })
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.in('course_code', courseCodes)
			.range(0, BATCH_SIZE - 1)
		if (firstPage.error) {
			console.error('[cv-report/pass-percentage] exam_registrations error', firstPage.error)
			return NextResponse.json({ error: firstPage.error.message }, { status: 500 })
		}
		const allRegs: Array<{ id: string; course_code: string }> = [...((firstPage.data as any) || [])]
		const totalRegs = firstPage.count ?? 0
		if (totalRegs > BATCH_SIZE) {
			const pageCount = Math.ceil(totalRegs / BATCH_SIZE)
			const pageResults = await runBatches(
				Array.from({ length: pageCount - 1 }, (_, i) => {
					const offset = (i + 1) * BATCH_SIZE
					return () => supabase
						.from('exam_registrations')
						.select('id, course_code')
						.eq('institutions_id', institutionsId)
						.eq('examination_session_id', sessionId)
						.in('course_code', courseCodes)
						.range(offset, offset + BATCH_SIZE - 1)
				})
			)
			for (const { data, error } of pageResults) {
				if (error) {
					console.error('[cv-report/pass-percentage] exam_registrations page error', error)
					continue
				}
				allRegs.push(...(data as any || []))
			}
		}

		console.log('[cv-report/pass-percentage] Found', allRegs.length, 'exam registrations')

		const regCountByCourseCode = new Map<string, number>()
		const examRegIds: string[] = []
		const courseCodeByRegId = new Map<string, string>()
		for (const r of allRegs) {
			regCountByCourseCode.set(r.course_code, (regCountByCourseCode.get(r.course_code) || 0) + 1)
			examRegIds.push(r.id)
			courseCodeByRegId.set(r.id, r.course_code)
		}

		// 3. Appeared — parallel IN batches (IN_BATCH_SIZE=200 avoids PostgREST URL length limit)
		const presentRegIdsAll = new Set<string>()
		const attendanceResults = await runBatches(
			Array.from(
				{ length: Math.ceil(examRegIds.length / IN_BATCH_SIZE) },
				(_, i) => {
					const batch = examRegIds.slice(i * IN_BATCH_SIZE, (i + 1) * IN_BATCH_SIZE)
					return () => supabase
						.from('exam_attendance')
						.select('exam_registration_id, attendance_status')
						.in('exam_registration_id', batch)
						.range(0, 99999)
				},
			)
		)
		for (const { data, error } of attendanceResults) {
			if (error) { console.error('[cv-report/pass-percentage] exam_attendance error', error); continue }
			for (const a of data || []) {
				if (String((a as any).attendance_status || '').toLowerCase() === 'present')
					presentRegIdsAll.add((a as any).exam_registration_id as string)
			}
		}
		const appearedByCourseCode = new Map<string, number>()
		for (const regId of presentRegIdsAll) {
			const code = courseCodeByRegId.get(regId)
			if (code) appearedByCourseCode.set(code, (appearedByCourseCode.get(code) || 0) + 1)
		}

		console.log('[cv-report/pass-percentage] Appeared courses:', appearedByCourseCode.size)

		// 4. Marks — parallel IN batches (IN_BATCH_SIZE=200 for same URL-length reason)
		const passedByCourseId = new Map<string, number>()
		const marksResults = await runBatches(
			Array.from(
				{ length: Math.ceil(examRegIds.length / IN_BATCH_SIZE) },
				(_, i) => {
					const batch = examRegIds.slice(i * IN_BATCH_SIZE, (i + 1) * IN_BATCH_SIZE)
					return () => supabase
						.from('marks_entry')
						.select('exam_registration_id, course_id, total_marks_obtained')
						.in('exam_registration_id', batch)
						.range(0, 99999)
				},
			)
		)
		for (const { data, error } of marksResults) {
			if (error) { console.error('[cv-report/pass-percentage] marks_entry error', error); continue }
			for (const m of data || []) {
				const cid = (m as any).course_id as string
				const v = Number((m as any).total_marks_obtained || 0)
				const passMark = passMarkByCourseId.get(cid) ?? fallbackPassMark
				if (v >= passMark) passedByCourseId.set(cid, (passedByCourseId.get(cid) || 0) + 1)
			}
		}

		console.log('[cv-report/pass-percentage] Passed courses:', passedByCourseId.size)

		// 5. Build rows
		const allRows = courses.map((c: any) => {
			const total = regCountByCourseCode.get(c.course_code) || 0
			const appeared = appearedByCourseCode.get(c.course_code) || 0
			const passed = passedByCourseId.get(c.id) || 0
			const pass_percentage = appeared > 0 ? Math.round((passed / appeared) * 1000) / 10 : 0
			const semCode = semesterByCourseId.get(c.id) || ''
			const semNum = (semCode.match(/(\d+)/) || ['', '0'])[1]
			return {
				semester: semesterToRoman(semCode),
				_semNum: parseInt(semNum, 10) || 0,
				course_code: c.course_code,
				course_name: c.course_name,
				total_students: total,
				appeared,
				passed,
				pass_percentage,
				_order: orderByCourseId.get(c.id) ?? 999,
			}
		})

		console.log('[cv-report/pass-percentage] Before filter:', allRows.length, 'rows')

		const rows = allRows
			.filter(r => r.total_students > 0 || r.appeared > 0)
			.sort((a, b) => {
				if (a._semNum !== b._semNum) return a._semNum - b._semNum
				if (a._order !== b._order) return a._order - b._order
				return a.course_code.localeCompare(b.course_code)
			})
			.map(({ _order, _semNum, ...rest }) => rest)

		console.log('[cv-report/pass-percentage] After filter:', rows.length, 'rows returned')

		return NextResponse.json(rows)
	} catch (e: any) {
		console.error('[cv-report/pass-percentage] error', e)
		return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
	}
}
