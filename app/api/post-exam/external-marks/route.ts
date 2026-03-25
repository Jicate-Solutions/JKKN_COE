import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const action = searchParams.get('action')
		const supabase = getSupabaseServer()

		// Get institution filter params (from useInstitutionFilter hook)
		const institutionCode = searchParams.get('institution_code')
		const institutionsIdParam = searchParams.get('institutions_id')

		switch (action) {
			case 'institutions': {
				// Build query with optional filtering
				let query = supabase
					.from('institutions')
					.select('id, name, institution_code')
					.eq('is_active', true)

				// Apply institution filter if provided (super_admin with specific institution selected)
				if (institutionCode) {
					query = query.eq('institution_code', institutionCode)
				} else if (institutionsIdParam) {
					query = query.eq('id', institutionsIdParam)
				}

				const { data, error } = await query.order('name')

				if (error) {
					console.error('Error fetching institutions:', error)
					return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 400 })
				}

				return NextResponse.json(data)
			}

			case 'sessions': {
				const institutionId = searchParams.get('institutionId')

				if (!institutionId) {
					return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
				}

				const { data, error } = await supabase
					.from('examination_sessions')
					.select('id, session_name, session_code')
					.eq('institutions_id', institutionId)
					.order('session_name')

				if (error) {
					console.error('Error fetching sessions:', error)
					return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 400 })
				}

				return NextResponse.json(data)
			}

			case 'courses': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')

				if (!institutionId || !sessionId) {
					return NextResponse.json(
						{ error: 'Institution ID and session ID are required' },
						{ status: 400 }
					)
				}

				const { data, error } = await supabase
					.from('answer_sheet_packets')
					.select(`
						course_id,
						courses:course_id (
							id,
							course_code,
							course_name
						)
					`)
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)

				if (error) {
					console.error('Error fetching courses:', error)
					return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 400 })
				}

				// Get unique courses
				const courses = Array.from(
					new Map(
						data
							.filter((d: any) => d.courses)
							.map((d: any) => [d.courses.id, d.courses])
					).values()
				)

				return NextResponse.json(courses)
			}

			case 'packets': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				const courseId = searchParams.get('courseId')

				if (!institutionId || !sessionId || !courseId) {
					return NextResponse.json(
						{ error: 'Institution ID, session ID, and course ID are required' },
						{ status: 400 }
					)
				}

				// Get all packets for this course
				const { data: allPackets, error: packetError } = await supabase
					.from('answer_sheet_packets')
					.select('id, packet_no, total_sheets, institutions_id, examination_session_id, course_id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('course_id', courseId)
					.order('packet_no')

				if (packetError) {
					console.error('Error fetching packet numbers:', packetError)
					return NextResponse.json({ error: 'Failed to fetch packet numbers' }, { status: 400 })
				}

				if (!allPackets || allPackets.length === 0) {
					return NextResponse.json([])
				}

				// Get packets that already have marks entered
				const packetIds = allPackets.map(p => p.id)
				const { data: marksData, error: marksError } = await supabase
					.from('marks_entry')
					.select('student_dummy_number_id, student_dummy_numbers!inner(packet_id)')
					.in('student_dummy_numbers.packet_id', packetIds)
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('course_id', courseId)

				if (marksError) {
					console.error('Error checking existing marks:', marksError)
					// If error checking marks, return all packets anyway
					return NextResponse.json(allPackets)
				}

				// Extract packet IDs that have marks
				const packetsWithMarks = new Set(
					marksData?.map((mark: any) => mark.student_dummy_numbers?.packet_id).filter(Boolean) || []
				)

				// Filter out packets that already have marks entered
				const availablePackets = allPackets.filter(packet => !packetsWithMarks.has(packet.id))

				return NextResponse.json(availablePackets)
			}

			case 'students': {
				const packetId = searchParams.get('packetId')

				if (!packetId) {
					return NextResponse.json({ error: 'Packet ID is required' }, { status: 400 })
				}

				// Get packet details first
				const { data: packetData, error: packetError } = await supabase
					.from('answer_sheet_packets')
					.select(`
						id,
						packet_no,
						total_sheets,
						courses:course_id (
							course_code,
							course_name,
							external_max_mark,
							external_pass_mark
						)
					`)
					.eq('id', packetId)
					.single()

				if (packetError || !packetData) {
					console.error('Error fetching packet:', packetError)
					return NextResponse.json({ error: 'Packet not found' }, { status: 404 })
				}

				// Get student dummy numbers with program and semester info
				// Note: Packets are course-based, but can contain students from multiple programs
				const { data: studentData, error: studentError } = await supabase
					.from('student_dummy_numbers')
					.select(`
						id,
						dummy_number,
						exam_registration_id,
						exam_registrations (
							id,
							course_offering_id,
							course_offerings (
								id,
								program_id,
								semester
							)
						)
					`)
					.eq('packet_id', packetId)
					.order('dummy_number')

				if (studentError) {
					console.error('Error fetching students:', studentError)
					return NextResponse.json({ error: 'Failed to fetch students' }, { status: 400 })
				}

				if (!studentData || studentData.length === 0) {
					return NextResponse.json({ error: 'No students found for this packet' }, { status: 404 })
				}

				// Extract semester info from first student (assuming all students in packet have same semester)
				const firstStudent = studentData[0] as any
				const semesterInt = firstStudent?.exam_registrations?.course_offerings?.semester || 1

				// Convert semester number to Roman numeral
				const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
				const semesterNumber = romanNumerals[semesterInt - 1] || 'I'

				// Calculate year group: Semester 1-2 = Year 1, Semester 3-4 = Year 2, etc.
				const semesterType = Math.ceil(semesterInt / 2).toString()

				// Extract course details with semester info
				const courses = packetData.courses as any
				const courseDetails = {
					subject_code: courses.course_code,
					subject_name: courses.course_name,
					maximum_marks: courses.external_max_mark,
					minimum_pass_marks: courses.external_pass_mark,
					packet_no: packetData.packet_no,
					total_sheets: packetData.total_sheets,
					semester_number: semesterNumber,
					semester_year: semesterType, // Year group (1, 2, 3)
				}

				// Format students data - extract program_id from nested relationship
				const students = studentData.map((student: any) => ({
					student_dummy_id: student.id,
					dummy_number: student.dummy_number,
					exam_registration_id: student.exam_registration_id,
					program_id: student.exam_registrations?.course_offerings?.program_id || null,
					total_marks_obtained: null,
					total_marks_in_words: '',
					remarks: '',
				}))

				return NextResponse.json({
					students,
					course_details: courseDetails,
				})
			}

			default:
				return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 })
		}
	} catch (error) {
		console.error('Error in GET /api/post-exam/external-marks:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		const { data, error } = await supabase
			.from('marks_entry')
			.insert(body)
			.select('*')
			.single()

		if (error) {
			console.error('Error saving marks:', error)
			return NextResponse.json({ error: error.message || 'Failed to save marks' }, { status: 400 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Error in POST /api/post-exam/external-marks:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
