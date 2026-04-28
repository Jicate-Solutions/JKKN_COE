import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// Force recompilation - packet_no update logging
interface StudentWithAttendance {
	id: string
	actual_register_number: string
	dummy_number: string
	has_attendance: boolean
}

/**
 * POST /api/post-exam/answer-sheet-packets/generate-packets
 * Generate answer sheet packets based on attendance and course type (UG/PG)
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const { institution_code, exam_session, course_code } = body

		// Validate required fields
		if (!institution_code?.trim()) {
			return NextResponse.json({ error: 'Institution code is required' }, { status: 400 })
		}
		if (!exam_session?.trim()) {
			return NextResponse.json({ error: 'Examination session is required' }, { status: 400 })
		}

		// Fetch institution_id from institution_code
		const { data: institutionData, error: institutionError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', String(institution_code))
			.single()

		if (institutionError || !institutionData) {
			return NextResponse.json({
				error: `Institution with code "${institution_code}" not found.`,
			}, { status: 400 })
		}

		// Fetch examination_session_id from session_code (scoped to the institution
		// to disambiguate when multiple institutions share the same session_code)
		const { data: sessionData, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('id')
			.eq('session_code', String(exam_session))
			.eq('institutions_id', institutionData.id)
			.single()

		if (sessionError || !sessionData) {
			return NextResponse.json({
				error: `Examination session with code "${exam_session}" not found for institution "${institution_code}".`,
			}, { status: 400 })
		}

		// Build courses query
		let coursesQuery = supabase
			.from('courses')
			.select('id, course_code, course_name, course_type')
			.eq('institution_code', String(institution_code))

		// If specific course_code is provided, filter by it
		if (course_code?.trim()) {
			coursesQuery = coursesQuery.eq('course_code', String(course_code))
		}

		const { data: courses, error: coursesError } = await coursesQuery

		if (coursesError) {
			console.error('Error fetching courses:', coursesError)
			return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
		}

		if (!courses || courses.length === 0) {
			return NextResponse.json({
				error: course_code
					? `Course with code "${course_code}" not found.`
					: 'No courses found for this institution.',
			}, { status: 404 })
		}

		let totalPacketsCreated = 0
		let totalStudentsAssigned = 0
		const courseResults: Array<{
			course_code: string
			packets_created: number
			students_assigned: number
			error?: string
			debug?: {
				total_dummy_numbers?: number
				students_with_attendance?: number
				student_ids_sample?: string[]
				update_results?: Array<{
					packet_no: string
					student_ids_count: number
					rows_updated: number
					error?: string
				}>
			}
		}> = []

		// Process each course
		for (const course of courses) {
			try {
				// Delete existing packets for THIS COURSE ONLY to allow regeneration
				await supabase
					.from('answer_sheet_packets')
					.delete()
					.eq('institutions_id', institutionData.id)
					.eq('examination_session_id', sessionData.id)
					.eq('course_id', course.id)

				// Clear existing packet_no and packet_id values for students in THIS COURSE ONLY
				// First get all student_dummy_numbers IDs for this course
				const { data: courseStudents } = await supabase
					.from('student_dummy_numbers')
					.select('id, exam_registrations!inner(course_code)')
					.eq('institutions_id', institutionData.id)
					.eq('examination_session_id', sessionData.id)
					.eq('exam_registrations.course_code', course.course_code)
					.not('packet_id', 'is', null)

				if (courseStudents && courseStudents.length > 0) {
					const studentIds = courseStudents.map(s => s.id)
					await supabase
						.from('student_dummy_numbers')
						.update({ packet_id: null, packet_no: null })
						.in('id', studentIds)
				}

				// Debug tracking for this course
				const debugInfo: {
					total_dummy_numbers?: number
					students_with_attendance?: number
					student_ids_sample?: string[]
					update_results?: Array<{
						packet_no: string
						student_ids_count: number
						rows_updated: number
						error?: string
					}>
				} = {
					update_results: []
				}

				// Fetch all students with dummy numbers for this course
				// Join with exam_registrations to filter by course_code
				const { data: dummyNumbers, error: dummyError } = await supabase
					.from('student_dummy_numbers')
					.select(`
						id,
						actual_register_number,
						dummy_number,
						exam_registration_id,
						exam_registrations!inner(course_code)
					`)
					.eq('institutions_id', institutionData.id)
					.eq('examination_session_id', sessionData.id)
					.eq('exam_registrations.course_code', course.course_code)
					.order('dummy_number', { ascending: true })

				debugInfo.total_dummy_numbers = dummyNumbers?.length || 0

				if (dummyError) {
					console.error(`Error fetching dummy numbers for ${course.course_code}:`, dummyError)
					courseResults.push({
						course_code: course.course_code,
						packets_created: 0,
						students_assigned: 0,
						error: 'Failed to fetch student dummy numbers',
					})
					continue
				}

				if (!dummyNumbers || dummyNumbers.length === 0) {
					courseResults.push({
						course_code: course.course_code,
						packets_created: 0,
						students_assigned: 0,
						error: 'No students found with dummy numbers',
					})
					continue
				}

				// Filter students who have attendance
				const studentsWithAttendance: StudentWithAttendance[] = []

				// Batch-fetch all exam_attendance records for this course/session marked Present
				// Use exam_registration_id for matching (direct relationship, no students table needed)
				const attendanceSet = new Set<string>() // exam_registration_id values with Present attendance

				const { data: attendanceData } = await supabase
					.from('exam_attendance')
					.select('exam_registration_id')
					.eq('examination_session_id', sessionData.id)
					.eq('course_id', course.id)
					.eq('attendance_status', 'Present')
					.range(0, 9999)

				if (attendanceData) {
					for (const att of attendanceData) {
						if (att.exam_registration_id) {
							attendanceSet.add(att.exam_registration_id)
						}
					}
				}

				// Match dummy numbers to attendance via exam_registration_id
				for (const dummy of dummyNumbers) {
					if (dummy.exam_registration_id && attendanceSet.has(dummy.exam_registration_id)) {
						studentsWithAttendance.push({
							id: dummy.id,
							actual_register_number: dummy.actual_register_number,
							dummy_number: dummy.dummy_number,
							has_attendance: true,
						})
					}
				}

				debugInfo.students_with_attendance = studentsWithAttendance.length
				debugInfo.student_ids_sample = studentsWithAttendance.slice(0, 5).map(s => s.id)

				if (studentsWithAttendance.length === 0) {
					courseResults.push({
						course_code: course.course_code,
						packets_created: 0,
						students_assigned: 0,
						error: 'No students with attendance found',
						debug: debugInfo
					})
					continue
				}

				// Determine pack size based on course type
				// UG courses: 25 sheets per packet
				// PG courses: 20 sheets per packet
				const courseType = course.course_type?.toUpperCase() || ''
				const packSize = courseType.includes('PG') ? 20 : 25

				const totalStudents = studentsWithAttendance.length
				const totalPackets = Math.ceil(totalStudents / packSize)

				// Build all packet rows + their student slices up front
				const packetRows: Array<{
					institutions_id: string
					examination_session_id: string
					course_id: string
					packet_no: string
					total_sheets: number
					packet_status: string
					sheets_evaluated: number
					evaluation_progress: number
					is_active: boolean
				}> = []
				const studentSlices: Array<{ packet_no: string; students: StudentWithAttendance[] }> = []

				let studentIndex = 0
				for (let packetIndex = 1; packetIndex <= totalPackets; packetIndex++) {
					const sheetsInPacket = Math.min(packSize, totalStudents - studentIndex)
					const packetNo = `${packetIndex}/${totalPackets}`

					packetRows.push({
						institutions_id: institutionData.id,
						examination_session_id: sessionData.id,
						course_id: course.id,
						packet_no: packetNo,
						total_sheets: sheetsInPacket,
						packet_status: 'Created',
						sheets_evaluated: 0,
						evaluation_progress: 0,
						is_active: true,
					})
					studentSlices.push({
						packet_no: packetNo,
						students: studentsWithAttendance.slice(studentIndex, studentIndex + sheetsInPacket),
					})

					studentIndex += sheetsInPacket
				}

				// Bulk-insert all packets for this course in a single round-trip
				const { data: insertedPackets, error: bulkInsertError } = await supabase
					.from('answer_sheet_packets')
					.insert(packetRows)
					.select('id, packet_no')

				if (bulkInsertError) {
					console.error(`Bulk insert failed for ${course.course_code}:`, bulkInsertError)
					throw bulkInsertError
				}

				totalPacketsCreated += insertedPackets?.length || 0

				// Map packet_no → packet_id for lookup
				const packetIdByNo = new Map<string, string>()
				for (const p of insertedPackets || []) {
					packetIdByNo.set(p.packet_no, p.id)
				}

				// Run all student-dummy-number updates in parallel
				const updateResults = await Promise.all(
					studentSlices.map(async ({ packet_no, students }) => {
						const packetId = packetIdByNo.get(packet_no)
						if (!packetId) {
							return { packet_no, students_count: students.length, rows_updated: 0, error: 'Packet ID not found after insert' }
						}
						const studentIds = students.map((s) => s.id)
						const { data, error } = await supabase
							.from('student_dummy_numbers')
							.update({ packet_id: packetId, packet_no })
							.in('id', studentIds)
							.select('id')
						return {
							packet_no,
							students_count: students.length,
							rows_updated: data?.length || 0,
							error: error ? `${error.code}: ${error.message}` : undefined,
						}
					})
				)

				for (const ur of updateResults) {
					debugInfo.update_results?.push({
						packet_no: ur.packet_no,
						student_ids_count: ur.students_count,
						rows_updated: ur.rows_updated,
						error: ur.error,
					})
					if (!ur.error) {
						totalStudentsAssigned += ur.students_count
					}
				}

				courseResults.push({
					course_code: course.course_code,
					packets_created: totalPackets,
					students_assigned: totalStudents,
					debug: debugInfo
				})
			} catch (error) {
				console.error(`Error processing course ${course.course_code}:`, error)
				courseResults.push({
					course_code: course.course_code,
					packets_created: 0,
					students_assigned: 0,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
			}
		}

		return NextResponse.json({
			success: true,
			message: `Generated ${totalPacketsCreated} packet(s) for ${totalStudentsAssigned} student(s) across ${courses.length} course(s)`,
			total_packets_created: totalPacketsCreated,
			total_students_assigned: totalStudentsAssigned,
			courses_processed: courses.length,
			course_results: courseResults,
		}, { status: 200 })
	} catch (error) {
		console.error('Error in POST /api/post-exam/answer-sheet-packets/generate-packets:', error)
		return NextResponse.json({
			error: error instanceof Error ? error.message : 'Internal server error',
		}, { status: 500 })
	}
}
