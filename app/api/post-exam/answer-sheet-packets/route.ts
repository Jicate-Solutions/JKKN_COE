import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/post-exam/answer-sheet-packets
 * Fetch all answer sheet packets with filtering
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionCode = searchParams.get('institution_code')
		const examSession = searchParams.get('exam_session')
		const courseCode = searchParams.get('course_code')
		const status = searchParams.get('status')

		// Build query
		let query = supabase
			.from('answer_sheet_packets_detail_view')
			.select('*')
			.order('created_at', { ascending: false })

		// Apply filters
		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		}
		if (examSession) {
			query = query.eq('session_code', examSession)
		}
		if (courseCode) {
			query = query.eq('course_code', courseCode)
		}
		if (status && status !== 'all') {
			query = query.eq('packet_status', status)
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching answer sheet packets:', error)
			return NextResponse.json({ error: 'Failed to fetch packets' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('Error in GET /api/post-exam/answer-sheet-packets:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * POST /api/post-exam/answer-sheet-packets
 * Create a new answer sheet packet manually
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			institution_code,
			exam_session,
			course_code,
			packet_no,
			total_sheets,
			packet_status = 'Created',
			remarks,
			is_active = true,
		} = body

		// Validate required fields
		if (!institution_code?.trim()) {
			return NextResponse.json({ error: 'Institution code is required' }, { status: 400 })
		}
		if (!exam_session?.trim()) {
			return NextResponse.json({ error: 'Examination session is required' }, { status: 400 })
		}
		if (!course_code?.trim()) {
			return NextResponse.json({ error: 'Course code is required' }, { status: 400 })
		}
		if (!packet_no?.trim()) {
			return NextResponse.json({ error: 'Packet number is required' }, { status: 400 })
		}
		if (!total_sheets || Number(total_sheets) <= 0) {
			return NextResponse.json({ error: 'Total sheets must be greater than 0' }, { status: 400 })
		}

		// Fetch institution_id from institution_code
		const { data: institutionData, error: institutionError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', String(institution_code))
			.single()

		if (institutionError || !institutionData) {
			return NextResponse.json({
				error: `Institution with code "${institution_code}" not found. Please ensure the institution exists.`,
			}, { status: 400 })
		}

		// Fetch examination_session_id from session_code
		const { data: sessionData, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('id')
			.eq('session_code', String(exam_session))
			.single()

		if (sessionError || !sessionData) {
			return NextResponse.json({
				error: `Examination session with code "${exam_session}" not found. Please ensure the session exists.`,
			}, { status: 400 })
		}

		// Fetch course_id from course_code
		const { data: courseData, error: courseError } = await supabase
			.from('courses')
			.select('id')
			.eq('course_code', String(course_code))
			.single()

		if (courseError || !courseData) {
			return NextResponse.json({
				error: `Course with code "${course_code}" not found. Please ensure the course exists.`,
			}, { status: 400 })
		}

		// Insert packet
		const { data, error } = await supabase
			.from('answer_sheet_packets')
			.insert({
				institutions_id: institutionData.id,
				examination_session_id: sessionData.id,
				course_id: courseData.id,
				packet_no: String(packet_no),
				total_sheets: Number(total_sheets),
				packet_status,
				remarks: remarks || null,
				is_active,
				sheets_evaluated: 0,
				evaluation_progress: 0,
			})
			.select('*')
			.single()

		if (error) {
			console.error('Error creating packet:', error)

			// Handle duplicate key constraint violation (23505)
			if (error.code === '23505') {
				return NextResponse.json({
					error: `Packet "${packet_no}" already exists for this institution/session/course combination.`,
				}, { status: 400 })
			}

			// Handle foreign key constraint violation (23503)
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select valid institution, session, and course.',
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to create packet' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('Error in POST /api/post-exam/answer-sheet-packets:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
