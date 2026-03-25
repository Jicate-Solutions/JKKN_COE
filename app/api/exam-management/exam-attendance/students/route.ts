import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Fetch students for attendance based on exam parameters
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const exam_session_code = searchParams.get('exam_session_code')
		const course_code = searchParams.get('course_code')
		const program_code = searchParams.get('program_code')
		const session_code = searchParams.get('session_code')

		if (!institutions_id || !exam_session_code || !course_code || !program_code || !session_code) {
			return NextResponse.json({
				error: 'Missing required parameters: institutions_id, exam_session_code, course_code, program_code, session_code'
			}, { status: 400 })
		}

		// Fetch students from exam_registrations
		// Note: This query assumes exam_registrations has relationships to courses, programs, sessions
		// You may need to adjust based on your actual schema
		const { data: registrations, error } = await supabase
			.from('exam_registrations')
			.select(`
				id,
				attempt_number,
				student_id,
				students (
					id,
					register_number,
					first_name,
					last_name,
					middle_name
				)
			`)
			.eq('institutions_id', institutions_id)
			.eq('registration_status', 'Approved')
			.order('students(register_number)', { ascending: true })

		if (error) {
			console.error('Error fetching students for attendance:', error)
			return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
		}

		// Transform and sort the data
		const students = (registrations || [])
			.filter(reg => reg.students) // Filter out null students
			.map(reg => ({
				exam_registration_id: reg.id,
				student_id: reg.students.id,
				register_number: reg.students.register_number,
				student_name: `${reg.students.first_name} ${reg.students.middle_name || ''} ${reg.students.last_name}`.trim(),
				exam_attempt: reg.attempt_number || 1,
				is_absent: false,
				remarks: null
			}))
			.sort((a, b) => {
				// Primary sort by register_number
				const regCompare = (a.register_number || '').localeCompare(b.register_number || '')
				if (regCompare !== 0) return regCompare

				// Secondary sort by exam_attempt
				return a.exam_attempt - b.exam_attempt
			})

		return NextResponse.json(students)
	} catch (e) {
		console.error('Students for attendance API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
