import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * POST /api/post-exam/answer-sheet-packets/generate-packets-program-wise
 *
 * Generates answer-sheet packets for a course, but unlike the standard
 * /generate-packets endpoint, students are GROUPED BY program_code within
 * each course so a packet only contains students from one program.
 *
 * Example: course has 47 students — 26 in PEN (PG, 20/packet), 21 in PZO.
 *   PEN → 1/4 (20 students), 2/4 (6 students)
 *   PZO → 3/4 (20 students), 4/4 (1 student)
 *
 * Program order = ascending by the lowest dummy_number assigned in that program.
 * Within each program, students are packed in dummy_number order.
 *
 * Body: { institution_code, exam_session, course_code }
 */
interface StudentWithProgram {
	id: string
	actual_register_number: string
	dummy_number: string
	program_code: string
}

export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const { institution_code, exam_session, course_code } = body

		if (!institution_code?.trim()) {
			return NextResponse.json({ error: 'Institution code is required' }, { status: 400 })
		}
		if (!exam_session?.trim()) {
			return NextResponse.json({ error: 'Examination session is required' }, { status: 400 })
		}
		if (!course_code?.trim()) {
			return NextResponse.json({ error: 'Course code is required' }, { status: 400 })
		}

		// Resolve institution
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

		// Resolve session (scoped to institution)
		const { data: sessionData, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('id')
			.eq('session_code', String(exam_session))
			.eq('institutions_id', institutionData.id)
			.single()

		if (sessionError || !sessionData) {
			return NextResponse.json({
				error: `Examination session "${exam_session}" not found for institution "${institution_code}".`,
			}, { status: 400 })
		}

		// Resolve course
		const { data: course, error: courseError } = await supabase
			.from('courses')
			.select('id, course_code, course_name, board_code')
			.eq('institution_code', String(institution_code))
			.eq('course_code', String(course_code))
			.single()

		if (courseError || !course) {
			return NextResponse.json({
				error: `Course "${course_code}" not found for institution "${institution_code}".`,
			}, { status: 400 })
		}

		// Determine pack size from board_type (UG=25, PG=20)
		let packSize = 25
		if (course.board_code) {
			const { data: boardRow } = await supabase
				.from('board')
				.select('board_type')
				.eq('institutions_id', institutionData.id)
				.eq('board_code', course.board_code)
				.maybeSingle()
			const boardType = boardRow?.board_type ? String(boardRow.board_type).toUpperCase() : undefined
			if (boardType === 'PG') packSize = 20
		}

		// Clear existing packets for THIS course only (so regeneration is clean)
		await supabase
			.from('answer_sheet_packets')
			.delete()
			.eq('institutions_id', institutionData.id)
			.eq('examination_session_id', sessionData.id)
			.eq('course_id', course.id)

		// Clear packet_no/packet_id on student_dummy_numbers for this course
		const { data: priorAssigned } = await supabase
			.from('student_dummy_numbers')
			.select('id, exam_registrations!inner(course_code)')
			.eq('institutions_id', institutionData.id)
			.eq('examination_session_id', sessionData.id)
			.eq('exam_registrations.course_code', course.course_code)
			.not('packet_id', 'is', null)

		if (priorAssigned && priorAssigned.length > 0) {
			await supabase
				.from('student_dummy_numbers')
				.update({ packet_id: null, packet_no: null })
				.in('id', priorAssigned.map(s => s.id))
		}

		// Fetch students with dummy numbers + program_code via exam_registrations
		const { data: dummyRows, error: dummyError } = await supabase
			.from('student_dummy_numbers')
			.select(`
				id,
				actual_register_number,
				dummy_number,
				exam_registration_id,
				exam_registrations!inner(course_code, program_code)
			`)
			.eq('institutions_id', institutionData.id)
			.eq('examination_session_id', sessionData.id)
			.eq('exam_registrations.course_code', course.course_code)
			.order('dummy_number', { ascending: true })
			.range(0, 99999)

		if (dummyError) {
			console.error('Error fetching student_dummy_numbers:', dummyError)
			return NextResponse.json({ error: 'Failed to fetch student dummy numbers' }, { status: 500 })
		}

		if (!dummyRows || dummyRows.length === 0) {
			return NextResponse.json({
				success: false,
				error: 'No students with dummy numbers found for this course',
				total_packets_created: 0,
				total_students_assigned: 0,
			}, { status: 200 })
		}

		// Fetch Present attendance
		const { data: attendanceData } = await supabase
			.from('exam_attendance')
			.select('exam_registration_id')
			.eq('examination_session_id', sessionData.id)
			.eq('course_id', course.id)
			.eq('attendance_status', 'Present')
			.range(0, 99999)

		const presentRegIds = new Set<string>()
		for (const a of attendanceData || []) {
			if (a.exam_registration_id) presentRegIds.add(a.exam_registration_id)
		}

		// Build the students-with-attendance list (carry program_code along)
		const studentsWithAttendance: StudentWithProgram[] = []
		for (const row of dummyRows as any[]) {
			if (!row.exam_registration_id || !presentRegIds.has(row.exam_registration_id)) continue
			const programCode = row.exam_registrations?.program_code || ''
			if (!programCode) continue
			studentsWithAttendance.push({
				id: row.id,
				actual_register_number: row.actual_register_number,
				dummy_number: row.dummy_number,
				program_code: programCode,
			})
		}

		if (studentsWithAttendance.length === 0) {
			return NextResponse.json({
				success: false,
				error: 'No students with attendance found for this course',
				total_packets_created: 0,
				total_students_assigned: 0,
			}, { status: 200 })
		}

		// Group by program_code
		const byProgram = new Map<string, StudentWithProgram[]>()
		for (const s of studentsWithAttendance) {
			if (!byProgram.has(s.program_code)) byProgram.set(s.program_code, [])
			byProgram.get(s.program_code)!.push(s)
		}

		// Sort within each program by dummy_number (string compare works for zero-padded numbers)
		for (const arr of byProgram.values()) {
			arr.sort((a, b) => a.dummy_number.localeCompare(b.dummy_number, undefined, { numeric: true }))
		}

		// Order programs by the lowest dummy_number in each program (ascending)
		const sortedPrograms = Array.from(byProgram.entries())
			.map(([pc, students]) => ({
				program_code: pc,
				students,
				min_dummy: students[0]?.dummy_number ?? '',
			}))
			.sort((a, b) => a.min_dummy.localeCompare(b.min_dummy, undefined, { numeric: true }))

		// Compute total packets across all programs for this course
		const totalPackets = sortedPrograms.reduce(
			(sum, p) => sum + Math.ceil(p.students.length / packSize),
			0,
		)

		// Build packets + their student slices
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
			remarks: string | null
		}> = []
		const studentSlices: Array<{ packet_no: string; students: StudentWithProgram[] }> = []
		const programBreakdown: Array<{ program_code: string; students: number; packets: number }> = []

		let packetIndex = 1
		for (const prog of sortedPrograms) {
			const programStudents = prog.students
			let i = 0
			let packetsForThisProgram = 0
			while (i < programStudents.length) {
				const sheets = Math.min(packSize, programStudents.length - i)
				const packetNo = `${packetIndex}/${totalPackets}`

				packetRows.push({
					institutions_id: institutionData.id,
					examination_session_id: sessionData.id,
					course_id: course.id,
					packet_no: packetNo,
					total_sheets: sheets,
					packet_status: 'Created',
					sheets_evaluated: 0,
					evaluation_progress: 0,
					is_active: true,
					remarks: `Program: ${prog.program_code}`,
				})
				studentSlices.push({
					packet_no: packetNo,
					students: programStudents.slice(i, i + sheets),
				})

				i += sheets
				packetIndex++
				packetsForThisProgram++
			}
			programBreakdown.push({
				program_code: prog.program_code,
				students: programStudents.length,
				packets: packetsForThisProgram,
			})
		}

		// Bulk insert packets
		const { data: insertedPackets, error: insertError } = await supabase
			.from('answer_sheet_packets')
			.insert(packetRows)
			.select('id, packet_no')

		if (insertError) {
			console.error('Error inserting packets:', insertError)
			return NextResponse.json({ error: insertError.message }, { status: 500 })
		}

		const packetIdByNo = new Map<string, string>()
		for (const p of insertedPackets || []) {
			packetIdByNo.set(p.packet_no, p.id)
		}

		// Update student_dummy_numbers with packet_id + packet_no
		let totalStudentsAssigned = 0
		await Promise.all(
			studentSlices.map(async ({ packet_no, students }) => {
				const packetId = packetIdByNo.get(packet_no)
				if (!packetId) return
				const ids = students.map(s => s.id)
				const { data } = await supabase
					.from('student_dummy_numbers')
					.update({ packet_id: packetId, packet_no })
					.in('id', ids)
					.select('id')
				totalStudentsAssigned += data?.length || 0
			}),
		)

		return NextResponse.json({
			success: true,
			message: `Generated ${totalPackets} packet(s) for ${totalStudentsAssigned} student(s), grouped by program`,
			total_packets_created: totalPackets,
			total_students_assigned: totalStudentsAssigned,
			courses_processed: 1,
			pack_size: packSize,
			course_results: [{
				course_code: course.course_code,
				packets_created: totalPackets,
				students_assigned: totalStudentsAssigned,
				program_breakdown: programBreakdown,
			}],
		}, { status: 200 })
	} catch (error) {
		console.error('Error in POST generate-packets-program-wise:', error)
		return NextResponse.json({
			error: error instanceof Error ? error.message : 'Internal server error',
		}, { status: 500 })
	}
}
