/**
 * Practical Batches API for Exam Attendance Sheet
 *
 * GET /api/pre-exam/exam-attendance-sheet/batches?institution_id=X&examination_session_id=Y&exam_date=Z&session=FN
 *
 * Returns practical timetable rows for a given date + session, with per-course batch numbers.
 */

import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institution_id')
		const sessionId = searchParams.get('examination_session_id')
		const examDate = searchParams.get('exam_date')
		const session = searchParams.get('session')

		if (!institutionId || !sessionId || !examDate || !session) {
			return NextResponse.json({ error: 'All params required' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('exam_timetables')
			.select('id, exam_date, session, batch_capacity, course_id, courses(course_code, course_name)')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', sessionId)
			.eq('exam_date', examDate)
			.eq('session', session)
			.eq('exam_type', 'Practical')
			.eq('is_published', true)
			.order('exam_date', { ascending: true })

		if (error) {
			console.error('[AttendanceSheet/Batches] Error:', error)
			return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
		}

		// Sort FN before AN, then by date
		const sorted = (data || []).sort((a: any, b: any) => {
			const dateCompare = a.exam_date.localeCompare(b.exam_date)
			if (dateCompare !== 0) return dateCompare
			return a.session === 'FN' ? -1 : 1
		})

		// Group by course_id to assign per-course batch numbers
		const courseGroups = new Map<string, any[]>()
		for (const row of sorted) {
			const cid = row.course_id
			if (!courseGroups.has(cid)) courseGroups.set(cid, [])
			courseGroups.get(cid)!.push(row)
		}

		const result: any[] = []
		for (const [, rows] of courseGroups) {
			rows.forEach((row: any, idx: number) => {
				result.push({
					...row,
					batch_no: idx + 1,
					course_code: row.courses?.course_code,
					course_name: row.courses?.course_name,
				})
			})
		}

		return NextResponse.json(result)
	} catch (e) {
		console.error('[AttendanceSheet/Batches] Internal error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
