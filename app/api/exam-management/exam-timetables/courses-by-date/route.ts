import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET - Fetch all courses for a specific exam date and session
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institution_id = searchParams.get('institution_id')
		const exam_date = searchParams.get('exam_date')
		const session = searchParams.get('session')

		if (!institution_id || !exam_date || !session) {
			return NextResponse.json({
				error: 'Institution ID, exam date, and session are required'
			}, { status: 400 })
		}

		// Fetch all exam timetables for this date and session
		const { data: timetables, error: timetableError } = await supabase
			.from('exam_timetables')
			.select(`
				*,
				course_offerings(
					id,
					course_id,
					program_id,
					course_mapping:course_id(id, course_code, course_title),
					programs(id, program_code, program_name)
				)
			`)
			.eq('institutions_id', institution_id)
			.eq('exam_date', exam_date)
			.eq('session', session)
			.order('created_at', { ascending: false })

		if (timetableError) {
			console.error('Error fetching timetables:', timetableError)
			return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
		}

		// For each course, get student count
		const enrichedCourses = await Promise.all((timetables || []).map(async (tt) => {
			const { count: studentCount } = await supabase
				.from('exam_registrations')
				.select('id', { count: 'exact', head: true })
				.eq('exam_timetable_id', tt.id)

			return {
				exam_timetable_id: tt.id,
				course_code: tt.course_offerings?.course_mapping?.course_code || 'N/A',
				course_name: tt.course_offerings?.course_mapping?.course_title || 'N/A',
				program_code: tt.course_offerings?.programs?.program_code || 'N/A',
				program_name: tt.course_offerings?.programs?.program_name || 'N/A',
				student_count: studentCount || 0,
			}
		}))

		return NextResponse.json(enrichedCourses)
	} catch (e) {
		console.error('Courses by date API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
