import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const action = searchParams.get('action')
		const supabase = getSupabaseServer()

		const institutionCode = searchParams.get('institution_code')
		const institutionsIdParam = searchParams.get('institutions_id')

		switch (action) {

			// ------------------------------------------------------------------
			// action='institutions'
			// ------------------------------------------------------------------
			case 'institutions': {
				let query = supabase
					.from('institutions')
					.select('id, name, institution_code')
					.eq('is_active', true)

				if (institutionCode) {
					query = query.eq('institution_code', institutionCode)
				} else if (institutionsIdParam) {
					query = query.eq('id', institutionsIdParam)
				}

				const { data, error } = await query.order('name')
				if (error) {
					return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 400 })
				}
				return NextResponse.json(data)
			}

			// ------------------------------------------------------------------
			// action='sessions'
			// ------------------------------------------------------------------
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
					return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 400 })
				}
				return NextResponse.json(data)
			}

			// ------------------------------------------------------------------
			// action='practical-courses'
			// Courses that have practical marks entered (any date, not just today)
			// ------------------------------------------------------------------
			case 'practical-courses': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')

				if (!institutionId || !sessionId) {
					return NextResponse.json(
						{ error: 'Institution ID and session ID are required' },
						{ status: 400 }
					)
				}

				// Get distinct course_ids that have practical marks entered
				const { data: marksEntries, error: marksError } = await supabase
					.from('marks_entry')
					.select('course_id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('source', 'Practical Entry')

				if (marksError) {
					return NextResponse.json({ error: 'Failed to fetch practical courses' }, { status: 400 })
				}

				const distinctCourseIds = [...new Set((marksEntries || []).map((m: any) => m.course_id).filter(Boolean))]

				if (distinctCourseIds.length === 0) {
					return NextResponse.json([])
				}

				const { data: courses, error: coursesError } = await supabase
					.from('courses')
					.select('id, course_code, course_name, external_max_mark')
					.in('id', distinctCourseIds)
					.order('course_code')

				if (coursesError) {
					return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 400 })
				}

				return NextResponse.json(courses || [])
			}

			// ------------------------------------------------------------------
			// action='practical-batches'
			// Batches that have marks entered for a given course (any date)
			// ------------------------------------------------------------------
			case 'practical-batches': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				const courseId = searchParams.get('courseId')

				if (!institutionId || !sessionId || !courseId) {
					return NextResponse.json(
						{ error: 'Institution ID, session ID, and course ID are required' },
						{ status: 400 }
					)
				}

				// Get all practical timetable rows for this course (any date)
				const { data: rows, error } = await supabase
					.from('exam_timetables')
					.select('id, exam_date, session, exam_time, batch_capacity, course_id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('course_id', courseId)
					.eq('exam_type', 'Practical')
					.eq('is_published', true)
					.order('exam_date', { ascending: true })

				if (error || !rows || rows.length === 0) {
					return NextResponse.json([])
				}

				// Sort: FN before AN within same date
				const sorted = [...rows].sort((a: any, b: any) => {
					const dateCmp = (a.exam_date || '').localeCompare(b.exam_date || '')
					if (dateCmp !== 0) return dateCmp
					const sessionOrder = (s: string) => s === 'FN' ? 0 : 1
					return sessionOrder(a.session) - sessionOrder(b.session)
				})

				// Only include batches where marks have been entered
				const batchIds = sorted.map((r: any) => r.id)
				const { data: batchStudents } = await supabase
					.from('practical_batch_students')
					.select('exam_timetable_id, exam_registration_id')
					.in('exam_timetable_id', batchIds)

				const regIdsByBatch = new Map<string, string[]>()
				for (const bs of batchStudents || []) {
					const list = regIdsByBatch.get(bs.exam_timetable_id) || []
					list.push(bs.exam_registration_id)
					regIdsByBatch.set(bs.exam_timetable_id, list)
				}

				// Get all marks for this course+session
				const { data: existingMarks } = await supabase
					.from('marks_entry')
					.select('exam_registration_id')
					.eq('course_id', courseId)
					.eq('examination_session_id', sessionId)
					.eq('institutions_id', institutionId)
					.eq('source', 'Practical Entry')

				const markedRegIds = new Set(
					(existingMarks || []).map((m: any) => m.exam_registration_id)
				)

				// Filter to batches that have at least one mark entered
				const batchesWithMarks = sorted.filter((row: any) => {
					const regIds = regIdsByBatch.get(row.id) || []
					return regIds.some(id => markedRegIds.has(id))
				})

				// Attach batch_no
				const batchNoMap = new Map<string, number>()
				sorted.forEach((row: any, idx: number) => {
					batchNoMap.set(row.id, idx + 1)
				})

				const batches = batchesWithMarks.map((row: any) => ({
					...row,
					batch_no: batchNoMap.get(row.id) || 0,
				}))

				return NextResponse.json(batches)
			}

			// ------------------------------------------------------------------
			// action='practical-marks-data'
			// Fetch all data needed to generate the practical foil sheet PDF
			// ------------------------------------------------------------------
			case 'practical-marks-data': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				const courseId = searchParams.get('courseId')
				const timetableId = searchParams.get('timetableId')

				if (!institutionId || !sessionId || !courseId || !timetableId) {
					return NextResponse.json(
						{ error: 'All parameters are required' },
						{ status: 400 }
					)
				}

				// Get course details
				const { data: course } = await supabase
					.from('courses')
					.select('id, course_code, course_name, external_max_mark, external_pass_mark')
					.eq('id', courseId)
					.single()

				if (!course) {
					return NextResponse.json({ error: 'Course not found' }, { status: 404 })
				}

				// Get batch students
				const { data: batchAssignments } = await supabase
					.from('practical_batch_students')
					.select('exam_registration_id')
					.eq('exam_timetable_id', timetableId)

				if (!batchAssignments || batchAssignments.length === 0) {
					return NextResponse.json({ error: 'No students in this batch' }, { status: 404 })
				}

				const regIds = batchAssignments.map((a: any) => a.exam_registration_id)

				// Get student details
				const { data: registrations } = await supabase
					.from('exam_registrations')
					.select('id, stu_register_no, student_name, is_regular, program_code')
					.in('id', regIds)

				// Sort by program_order → regular first → register_no
				const programCodes = [...new Set((registrations || []).map((r: any) => r.program_code).filter(Boolean))]
				const programOrderMap = new Map<string, number>()
				if (programCodes.length > 0) {
					const { data: programs } = await supabase
						.from('programs')
						.select('program_code, program_order')
						.in('program_code', programCodes)
					for (const p of programs || []) {
						programOrderMap.set(p.program_code, p.program_order ?? 999)
					}
				}

				const sortedStudents = [...(registrations || [])].sort((a: any, b: any) => {
					const orderA = programOrderMap.get(a.program_code) ?? 999
					const orderB = programOrderMap.get(b.program_code) ?? 999
					if (orderA !== orderB) return orderA - orderB
					if (a.is_regular !== b.is_regular) return b.is_regular === true ? 1 : -1
					return (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
				})

				// Get existing marks
				const { data: existingMarks } = await supabase
					.from('marks_entry')
					.select('exam_registration_id, total_marks_obtained, evaluator_remarks')
					.eq('course_id', courseId)
					.eq('examination_session_id', sessionId)
					.eq('source', 'Practical Entry')
					.in('exam_registration_id', regIds)

				const marksMap = new Map<string, any>()
				for (const m of existingMarks || []) {
					marksMap.set(m.exam_registration_id, m)
				}

				// Get attendance records for absent check
				const { data: attendanceRecords } = await supabase
					.from('exam_attendance')
					.select('exam_registration_id, attendance_status')
					.eq('exam_timetable_id', timetableId)

				const attendanceMap = new Map<string, string>()
				for (const a of attendanceRecords || []) {
					attendanceMap.set(a.exam_registration_id, a.attendance_status)
				}

				const students = sortedStudents.map((s: any, idx: number) => {
					const mark = marksMap.get(s.id)
					const isAbsentInAttendance = attendanceMap.get(s.id) === 'Absent'
					let status: string | null = null
					let total_marks_obtained: number | null = null
					let evaluator_remarks: string | null = null

					if (mark) {
						if (mark.evaluator_remarks === 'AB') {
							status = 'AB'
							evaluator_remarks = 'RA RE-APPEAR'
						} else {
							status = 'Present'
							total_marks_obtained = mark.total_marks_obtained != null ? Number(mark.total_marks_obtained) : null
							evaluator_remarks = mark.evaluator_remarks || null
						}
					} else if (isAbsentInAttendance) {
						status = 'AB'
						evaluator_remarks = 'RA RE-APPEAR'
					}

					return {
						serial_number: idx + 1,
						register_number: s.stu_register_no || '',
						student_name: s.student_name || '',
						total_marks_obtained,
						status,
						evaluator_remarks,
					}
				})

				// Get examiner assignments
				const { data: examinerAssignments } = await supabase
					.from('exam_timetable_examiners')
					.select('examiner_type, staff_name, examiner_id')
					.eq('exam_timetable_id', timetableId)

				let internalExaminer: { name: string } | null = null
				let externalExaminer: { name: string; designation: string | null; institution: string | null } | null = null

				for (const ea of examinerAssignments || []) {
					if (ea.examiner_type === 'internal') {
						internalExaminer = { name: ea.staff_name || '' }
					} else if (ea.examiner_type === 'external' && ea.examiner_id) {
						const { data: ext } = await supabase
							.from('examiners')
							.select('full_name, designation, institution_name')
							.eq('id', ea.examiner_id)
							.single()
						if (ext) {
							externalExaminer = {
								name: (ext as any).full_name || '',
								designation: (ext as any).designation || null,
								institution: (ext as any).institution_name || null,
							}
						}
					}
				}

				return NextResponse.json({
					course_details: {
						course_code: (course as any).course_code,
						course_name: (course as any).course_name,
						maximum_marks: (course as any).external_max_mark,
						minimum_pass_marks: (course as any).external_pass_mark || 0,
					},
					students,
					examiners: {
						internal: internalExaminer,
						external: externalExaminer,
					},
					total_students: students.length,
				})
			}

			// ------------------------------------------------------------------
			// action='external-courses'
			// Courses that have answer_sheet_packets with marks entered
			// ------------------------------------------------------------------
			case 'external-courses': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')

				if (!institutionId || !sessionId) {
					return NextResponse.json(
						{ error: 'Institution ID and session ID are required' },
						{ status: 400 }
					)
				}

				// Get courses from answer_sheet_packets that have marks
				const { data: packets, error: packetError } = await supabase
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

				if (packetError) {
					return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 400 })
				}

				// Get unique courses
				const courses = Array.from(
					new Map(
						(packets || [])
							.filter((d: any) => d.courses)
							.map((d: any) => [d.courses.id, d.courses])
					).values()
				)

				return NextResponse.json(courses)
			}

			// ------------------------------------------------------------------
			// action='external-packets'
			// Packets that HAVE marks entered (opposite of mark entry page)
			// ------------------------------------------------------------------
			case 'external-packets': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				const courseId = searchParams.get('courseId')

				if (!institutionId || !sessionId || !courseId) {
					return NextResponse.json(
						{ error: 'Institution ID, session ID, and course ID are required' },
						{ status: 400 }
					)
				}

				const { data: allPackets, error: packetError } = await supabase
					.from('answer_sheet_packets')
					.select('id, packet_no, total_sheets, institutions_id, examination_session_id, course_id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('course_id', courseId)
					.order('packet_no')

				if (packetError || !allPackets || allPackets.length === 0) {
					return NextResponse.json([])
				}

				// Check which packets have marks
				const packetIds = allPackets.map(p => p.id)
				const { data: marksData } = await supabase
					.from('marks_entry')
					.select('student_dummy_number_id, student_dummy_numbers!inner(packet_id)')
					.in('student_dummy_numbers.packet_id', packetIds)
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('course_id', courseId)

				const packetsWithMarks = new Set(
					(marksData || []).map((mark: any) => mark.student_dummy_numbers?.packet_id).filter(Boolean)
				)

				// Return only packets that HAVE marks
				const completedPackets = allPackets.filter(packet => packetsWithMarks.has(packet.id))

				return NextResponse.json(completedPackets)
			}

			// ------------------------------------------------------------------
			// action='external-marks-data'
			// Fetch all data needed to generate the external foil sheet PDF
			// ------------------------------------------------------------------
			case 'external-marks-data': {
				const packetId = searchParams.get('packetId')

				if (!packetId) {
					return NextResponse.json({ error: 'Packet ID is required' }, { status: 400 })
				}

				// Get packet + course details
				const { data: packetData } = await supabase
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

				if (!packetData) {
					return NextResponse.json({ error: 'Packet not found' }, { status: 404 })
				}

				// Get student dummy numbers with marks
				const { data: studentDummies } = await supabase
					.from('student_dummy_numbers')
					.select(`
						id,
						dummy_number,
						exam_registration_id,
						exam_registrations (
							id,
							program_code,
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

				if (!studentDummies || studentDummies.length === 0) {
					return NextResponse.json({ error: 'No students found in packet' }, { status: 404 })
				}

				// Get marks for these dummy numbers
				const dummyIds = studentDummies.map((s: any) => s.id)
				const { data: marksData } = await supabase
					.from('marks_entry')
					.select('student_dummy_number_id, total_marks_obtained, total_marks_in_words, evaluator_remarks')
					.in('student_dummy_number_id', dummyIds)

				const marksMap = new Map<string, any>()
				for (const m of marksData || []) {
					marksMap.set(m.student_dummy_number_id, m)
				}

				// Extract semester info and program_code from first student
				const firstStudent = studentDummies[0] as any
				const semesterInt = firstStudent?.exam_registrations?.course_offerings?.semester || 1
				const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
				const semesterNumber = romanNumerals[semesterInt - 1] || 'I'
				const semesterType = Math.ceil(semesterInt / 2).toString()
				const programCode = firstStudent?.exam_registrations?.program_code || ''

				const courses = packetData.courses as any
				const courseDetails = {
					subject_code: courses.course_code,
					subject_name: courses.course_name,
					maximum_marks: courses.external_max_mark,
					minimum_pass_marks: courses.external_pass_mark,
					packet_no: packetData.packet_no,
					total_sheets: packetData.total_sheets,
					semester_number: semesterNumber,
					semester_year: semesterType,
					program_code: programCode,
				}

				const students = studentDummies.map((s: any) => {
					const mark = marksMap.get(s.id)
					return {
						dummy_number: s.dummy_number,
						total_marks_obtained: mark?.total_marks_obtained != null ? Number(mark.total_marks_obtained) : null,
						total_marks_in_words: mark?.total_marks_in_words || '',
						remarks: mark?.evaluator_remarks || '',
					}
				})

				return NextResponse.json({
					course_details: courseDetails,
					students,
				})
			}

			default:
				return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 })
		}
	} catch (error) {
		console.error('Error in GET /api/post-exam/foil-sheet-download:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
