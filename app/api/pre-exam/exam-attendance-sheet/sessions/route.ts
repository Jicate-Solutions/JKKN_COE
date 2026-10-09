/**
 * Exam Attendance Sheet - Sessions (FN/AN) Endpoint
 *
 * GET /api/pre-exam/exam-attendance-sheet/sessions?institution_id=XXX&examination_session_id=YYY&exam_date=YYYY-MM-DD
 *
 * Returns available session types (FN/AN) for a specific exam date.
 */

import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllRows } from '@/lib/exam-applications/paginate'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institution_id')
		const sessionId = searchParams.get('examination_session_id')
		const examDate = searchParams.get('exam_date')

		if (!institutionId || !sessionId || !examDate) {
			return NextResponse.json(
				{ error: 'institution_id, examination_session_id, and exam_date are required' },
				{ status: 400 }
			)
		}

		// Paged to completion so Supabase's 1000-row cap cannot hide a session
		let data: any[]
		try {
			data = await fetchAllRows(
				() => supabase
					.from('exam_timetables')
					.select('session')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('exam_date', examDate)
					.eq('is_published', true),
				{ label: 'session types' }
			)
		} catch (error) {
			console.error('[AttendanceSheet/Sessions] Fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch session types' }, { status: 500 })
		}

		// Deduplicate sessions (FN, AN)
		const uniqueSessions = [...new Set(data.map(d => d.session).filter(Boolean))]

		// Sort: FN before AN
		uniqueSessions.sort((a, b) => {
			if (a === 'FN') return -1
			if (b === 'FN') return 1
			return a.localeCompare(b)
		})

		return NextResponse.json(uniqueSessions.map(s => ({ session: s })))
	} catch (e) {
		console.error('[AttendanceSheet/Sessions] Error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
