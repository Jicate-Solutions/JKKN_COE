import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Fetch all examination sessions for a given institution
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutionId')

		if (!institutionId) {
			return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		const { data: sessions, error: sessionsError } = await supabase
			.from('examination_sessions')
			.select('id, session_code, session_name, semester_type, exam_start_date, exam_end_date')
			.eq('institutions_id', institutionId)
			.order('exam_start_date', { ascending: false })

		if (sessionsError) {
			console.error('Error fetching examination sessions:', sessionsError)
			return NextResponse.json({ error: 'Failed to fetch examination sessions' }, { status: 500 })
		}

		return NextResponse.json(sessions || [])
	} catch (error) {
		console.error('Error in attendance-correction/sessions GET:', error)
		return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
	}
}
