import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	try {
		const searchParams = request.nextUrl.searchParams
		const institutionId = searchParams.get('institution_id')
		const sessionCode = searchParams.get('session_code')

		// Validate required parameters
		if (!institutionId || !sessionCode) {
			return NextResponse.json(
				{ error: 'institution_id and session_code are required' },
				{ status: 400 }
			)
		}

		const supabase = getSupabaseServer()

		// Fetch institution and session in parallel (independent queries)
		const [institutionResult, sessionResult] = await Promise.all([
			supabase
				.from('institutions')
				.select('id, name, institution_code')
				.eq('id', institutionId)
				.single(),
			supabase
				.from('examination_sessions')
				.select('id, session_code, session_name')
				.eq('session_code', sessionCode)
				.single()
		])

		const { data: institution, error: institutionError } = institutionResult
		const { data: session, error: sessionError } = sessionResult

		if (institutionError || !institution) {
			return NextResponse.json(
				{ error: 'Institution not found', details: institutionError?.message, searched_id: institutionId },
				{ status: 404 }
			)
		}

		if (sessionError || !session) {
			return NextResponse.json(
				{ error: 'Examination session not found', details: sessionError?.message, searched: sessionCode },
				{ status: 404 }
			)
		}

		// Fetch attendance data using the SQL query
		console.log('📊 Calling RPC function with params:', {
			p_institution_code: institution.institution_code,
			p_session_code: sessionCode
		})

		const { data: attendanceData, error: attendanceError } = await supabase.rpc(
			'get_exam_attendance_report',
			{
				p_institution_code: institution.institution_code,
				p_session_code: sessionCode
			}
		)

		if (attendanceError) {
			console.error('❌ RPC Error:', attendanceError)
		} else {
			console.log('✅ RPC Success, records:', attendanceData?.length || 0)
		}

		// If RPC function doesn't exist, use manual query
		if (attendanceError) {
			console.log('RPC function not found, using manual query')

			// Manual query implementation
			const { data: manualData, error: manualError } = await supabase
				.from('exam_registrations')
				.select(`
					id,
					institutions_id,
					course_offering_id,
					course_offerings!inner (
						id,
						course_id,
						program_id,
						examination_session_id,
						courses!inner (
							id,
							course_code,
							course_name,
							course_title,
							course_category
						),
						examination_sessions!inner (
							id,
							session_code
						)
					),
					exam_attendance!inner (
						id,
						attendance_status,
						exam_timetable_id,
						exam_timetables (
							id,
							exam_date,
							session
						)
					)
				`)
				.eq('institutions_id', institution.id)

			if (manualError) {
				console.error('Manual query error:', manualError)
				return NextResponse.json(
					{ error: 'Failed to fetch attendance data' },
					{ status: 500 }
				)
			}

			// Process the manual data to match the expected format
			const processedData = processManualAttendanceData(manualData, sessionCode)

			return NextResponse.json({
				institutionName: institution.name,
				institutionCode: institution.institution_code,
				sessionCode: session.session_code,
				sessionName: session.session_name,
				records: processedData
			})
		}

		// Process RPC response
		return NextResponse.json({
			institutionName: institution.name,
			institutionCode: institution.institution_code,
			sessionCode: session.session_code,
			sessionName: session.session_name,
			records: attendanceData || []
		})

	} catch (error) {
		console.error('Error fetching attendance report data:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}

// Helper function to process manual query data
function processManualAttendanceData(data: any[], sessionCode: string) {
	const groupedData: Record<string, {
		exam_date: string
		exam_session: string
		course_code: string
		course_name: string
		course_category: string
		total_students: Set<string>
		present_count: Set<string>
		absent_count: Set<string>
	}> = {}

	data.forEach((record) => {
		// Filter by session code
		if (record.course_offerings?.examination_sessions?.session_code !== sessionCode) {
			return
		}

		const attendance = record.exam_attendance?.[0]
		if (!attendance) return

		const timetable = attendance.exam_timetables
		if (!timetable) return

		const course = record.course_offerings?.courses
		if (!course) return

		// Format date as DD-MM-YYYY
		const examDate = new Date(timetable.exam_date)
		const formattedDate = `${examDate.getDate().toString().padStart(2, '0')}-${(examDate.getMonth() + 1).toString().padStart(2, '0')}-${examDate.getFullYear()}`

		const key = `${formattedDate}_${timetable.session}_${course.course_code}`

		if (!groupedData[key]) {
			groupedData[key] = {
				exam_date: formattedDate,
				exam_session: timetable.session,
				course_code: course.course_code,
				course_name: course.course_title || course.course_name,
				course_category: course.course_category || '-',
				total_students: new Set(),
				present_count: new Set(),
				absent_count: new Set()
			}
		}

		// Add student to total
		groupedData[key].total_students.add(record.id)

		// Count attendance
		if (attendance.attendance_status === 'Present') {
			groupedData[key].present_count.add(record.id)
		} else if (attendance.attendance_status === 'Absent') {
			groupedData[key].absent_count.add(record.id)
		}
	})

	// Convert to array format
	return Object.values(groupedData).map((group) => {
		const total = group.total_students.size
		const present = group.present_count.size
		const absent = group.absent_count.size
		const percentage = total > 0 ? (present / total) * 100 : 0

		return {
			exam_date: group.exam_date,
			exam_session: group.exam_session,
			course_code: group.course_code,
			course_name: group.course_name,
			course_category: group.course_category,
			total_students: total,
			present_count: present,
			absent_count: absent,
			attendance_percentage: percentage
		}
	})
}
