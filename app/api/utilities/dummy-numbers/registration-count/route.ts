import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { ACTIVE_REGISTRATION_STATUSES } from '@/lib/exam-registration-status'

// GET: Count exam_registrations matching the given filters
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const course_code = searchParams.get('course_code')

		if (!institutions_id || !examination_session_id) {
			return NextResponse.json({ error: 'institutions_id and examination_session_id are required' }, { status: 400 })
		}

		// Find course_offering IDs that match the course_code for this session
		let coQuery = supabase
			.from('course_offerings')
			.select('id')
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)

		if (course_code) {
			const codes = course_code.split(',').filter(Boolean)
			if (codes.length === 1) {
				coQuery = coQuery.eq('course_code', codes[0])
			} else if (codes.length > 1) {
				coQuery = coQuery.in('course_code', codes)
			}
		}

		const { data: offerings, error: coError } = await coQuery.range(0, 9999)
		if (coError) {
			return NextResponse.json({ error: 'Failed to fetch course offerings' }, { status: 500 })
		}

		const offeringIds = (offerings || []).map(o => o.id)
		if (offeringIds.length === 0) {
			return NextResponse.json({ count: 0 })
		}

		// Count registrations for those course offerings
		const { count, error } = await supabase
			.from('exam_registrations')
			.select('id', { count: 'exact', head: true })
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.in('registration_status', ACTIVE_REGISTRATION_STATUSES)
			.in('course_offering_id', offeringIds)

		if (error) {
			return NextResponse.json({ error: 'Failed to count registrations' }, { status: 500 })
		}

		return NextResponse.json({ count: count || 0 })
	} catch (error) {
		console.error('Registration count error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
