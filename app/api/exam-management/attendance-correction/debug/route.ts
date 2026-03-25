import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Debug endpoint to check students in database
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()

		// Get total count of students
		const { count: totalStudents, error: countError } = await supabase
			.from('students')
			.select('*', { count: 'exact', head: true })

		if (countError) {
			return NextResponse.json({
				error: 'Error counting students',
				details: countError.message
			}, { status: 500 })
		}

		// Get first 10 students as sample
		const { data: sampleStudents, error: studentsError } = await supabase
			.from('students')
			.select('id, register_number, student_name')
			.order('register_number')
			.limit(10)

		if (studentsError) {
			return NextResponse.json({
				error: 'Error fetching students',
				details: studentsError.message
			}, { status: 500 })
		}

		// Get students with attendance records
		const { data: studentsWithAttendance, error: attendanceError } = await supabase
			.from('exam_attendance')
			.select(`
				id,
				exam_registration_id,
				exam_registrations!inner (
					student_id,
					students!inner (
						register_number,
						student_name
					)
				)
			`)
			.limit(10)

		return NextResponse.json({
			message: 'Debug information for attendance-correction',
			total_students: totalStudents,
			sample_students: sampleStudents,
			students_with_attendance: studentsWithAttendance ? studentsWithAttendance.length : 0,
			sample_attendance_students: studentsWithAttendance ? studentsWithAttendance.slice(0, 5) : []
		})

	} catch (error) {
		console.error('Error in attendance-correction debug:', error)
		return NextResponse.json({
			error: 'Failed to get debug information',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 })
	}
}
