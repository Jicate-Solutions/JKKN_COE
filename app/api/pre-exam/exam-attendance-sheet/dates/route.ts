/**
 * Exam Attendance Sheet - Dates Endpoint
 *
 * GET /api/pre-exam/exam-attendance-sheet/dates?institution_id=XXX&examination_session_id=YYY
 *
 * Returns all unique exam dates from published timetables for a given session.
 * Unlike the exam-attendance dropdown, this is NOT filtered to today's date.
 */

import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institution_id')
		const sessionId = searchParams.get('examination_session_id')

		if (!institutionId || !sessionId) {
			return NextResponse.json({ error: 'institution_id and examination_session_id are required' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('exam_timetables')
			.select('exam_date')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', sessionId)
			.eq('is_published', true)
			.order('exam_date', { ascending: true })

		if (error) {
			return NextResponse.json({ error: 'Failed to fetch exam dates', details: error }, { status: 500 })
		}

		// Deduplicate dates
		const uniqueDates = [...new Set((data || []).map(d => d.exam_date).filter(Boolean))]

		return NextResponse.json(uniqueDates.map(date => ({ exam_date: date })))
	} catch (e) {
		console.error('[AttendanceSheet/Dates] Error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
