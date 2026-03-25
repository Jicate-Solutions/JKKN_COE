import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Fetch practical attendance records or student list for a batch
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const mode = searchParams.get('mode') // 'check' or 'list'
		const timetableId = searchParams.get('timetable_id')

		// MODE: Check if attendance already exists for this batch
		if (mode === 'check' && timetableId) {
			console.log('Checking practical attendance for timetable:', timetableId)

			const { data: attendanceRecords, error: attendanceError } = await supabase
				.from('exam_attendance')
				.select(`
					*,
					exam_registrations!inner(
						stu_register_no,
						student_name,
						attempt_number,
						is_regular
					)
				`)
				.eq('exam_timetable_id', timetableId)
				.order('exam_registrations(stu_register_no)', { ascending: true })

			if (attendanceError) {
				console.error('Error checking practical attendance:', attendanceError)
				return NextResponse.json({ error: 'Failed to check attendance', details: attendanceError }, { status: 500 })
			}

			console.log('Practical attendance records found:', attendanceRecords?.length || 0)

			// Map to flatten the nested structure
			const mappedRecords = (attendanceRecords || []).map((att: any) => ({
				...att,
				stu_register_no: att.exam_registrations.stu_register_no,
				student_name: att.exam_registrations.student_name,
				attempt_number: att.exam_registrations.attempt_number,
				is_regular: att.exam_registrations.is_regular
			}))

			return NextResponse.json({
				exists: (attendanceRecords && attendanceRecords.length > 0),
				data: mappedRecords
			})
		}

		// MODE: List students for attendance entry
		if (mode === 'list' && timetableId) {
			console.log('Loading students for practical attendance, timetable:', timetableId)

			// Step 1: Get exam_registration_ids from practical_batch_students
			const { data: batchStudents, error: batchError } = await supabase
				.from('practical_batch_students')
				.select('exam_registration_id')
				.eq('exam_timetable_id', timetableId)

			if (batchError) {
				console.error('Error fetching batch students:', batchError)
				return NextResponse.json({ error: 'Failed to fetch batch students', details: batchError }, { status: 500 })
			}

			if (!batchStudents || batchStudents.length === 0) {
				return NextResponse.json({
					error: 'No students assigned to this batch',
					details: 'Assign students to this batch in the Batch Allotment page first'
				}, { status: 404 })
			}

			const registrationIds = batchStudents.map((bs: any) => bs.exam_registration_id)
			console.log('Batch students found:', registrationIds.length)

			// Step 2: Check if attendance already exists
			const { data: existingAttendance, error: checkAttendanceError } = await supabase
				.from('exam_attendance')
				.select(`
					*,
					exam_registrations!inner(
						stu_register_no,
						student_name,
						attempt_number,
						is_regular
					)
				`)
				.eq('exam_timetable_id', timetableId)
				.in('exam_registration_id', registrationIds)
				.order('exam_registrations(stu_register_no)', { ascending: true })

			if (checkAttendanceError) {
				console.error('Error checking existing attendance:', checkAttendanceError)
			}

			// If attendance exists, return the existing records in view-mode format
			if (existingAttendance && existingAttendance.length > 0) {
				console.log('Attendance already exists, returning saved records:', existingAttendance.length)

				const mappedRecords = existingAttendance.map((att: any) => ({
					id: att.exam_registration_id,
					student_id: att.student_id,
					stu_register_no: att.exam_registrations.stu_register_no,
					student_name: att.exam_registrations.student_name,
					attempt_number: att.exam_registrations.attempt_number,
					is_regular: att.exam_registrations.is_regular,
					// Include attendance status for viewing
					is_absent: att.is_absent,
					attendance_status: att.attendance_status,
					remarks: att.remarks
				}))

				return NextResponse.json(mappedRecords)
			}

			// Step 3: Get student details from exam_registrations
			const { data: registeredStudents, error: regError } = await supabase
				.from('exam_registrations')
				.select('id, student_id, stu_register_no, student_name, is_regular, attempt_number')
				.in('id', registrationIds)

			if (regError) {
				console.error('Error fetching exam registrations:', regError)
				return NextResponse.json({
					error: 'Failed to fetch registered students',
					details: regError
				}, { status: 500 })
			}

			if (!registeredStudents || registeredStudents.length === 0) {
				return NextResponse.json({
					error: 'No registered students found for this batch',
					details: 'Check exam_registrations for the assigned students'
				}, { status: 404 })
			}

			// Step 4: Clean and sort student data
			const cleanedData = registeredStudents.map((reg: any) => ({
				id: reg.id,
				student_id: reg.student_id,
				stu_register_no: reg.stu_register_no || '',
				student_name: reg.student_name || '',
				attempt_number: reg.attempt_number || 1,
				is_regular: reg.is_regular ?? true
			}))

			// Sort: is_regular DESC, stu_register_no ASC, attempt_number ASC
			cleanedData.sort((a: any, b: any) => {
				// is_regular DESC: true comes before false
				const regA = a.is_regular ? 1 : 0
				const regB = b.is_regular ? 1 : 0
				if (regA !== regB) return regB - regA
				// stu_register_no ASC
				const regNoCompare = (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
				if (regNoCompare !== 0) return regNoCompare
				// attempt_number ASC
				return (a.attempt_number || 1) - (b.attempt_number || 1)
			})

			console.log('Final student list for practical attendance:', cleanedData.length)
			return NextResponse.json(cleanedData)
		}

		return NextResponse.json({ error: 'Invalid request. Please specify mode=check or mode=list with timetable_id' }, { status: 400 })
	} catch (e) {
		console.error('Practical attendance GET error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST: Save practical attendance records for a batch
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		console.log('POST /api/exam-management/practical-attendance - Request body:', {
			institutions_id: body.institutions_id,
			examination_session_id: body.examination_session_id,
			exam_timetable_id: body.exam_timetable_id,
			course_id: body.course_id,
			attendance_records_count: body.attendance_records?.length || 0,
		})

		// Step 1: Validate required fields
		if (!body.institutions_id || !body.examination_session_id || !body.exam_timetable_id || !body.course_id) {
			console.error('Validation failed - missing required fields')
			return NextResponse.json({
				error: 'Required fields: institutions_id, examination_session_id, exam_timetable_id, course_id'
			}, { status: 400 })
		}

		if (!body.attendance_records || !Array.isArray(body.attendance_records)) {
			return NextResponse.json({
				error: 'attendance_records array is required'
			}, { status: 400 })
		}

		// Step 2: Verify timetable is Practical and published
		const { data: timetableData, error: timetableError } = await supabase
			.from('exam_timetables')
			.select('id, exam_type, is_published')
			.eq('id', body.exam_timetable_id)
			.single()

		if (timetableError || !timetableData) {
			console.error('Timetable not found:', timetableError)
			return NextResponse.json({
				error: 'Exam timetable not found. Please verify the timetable ID.'
			}, { status: 404 })
		}

		if ((timetableData as any).exam_type !== 'Practical') {
			return NextResponse.json({
				error: 'This timetable entry is not a Practical exam'
			}, { status: 400 })
		}

		if (!(timetableData as any).is_published) {
			return NextResponse.json({
				error: 'This timetable entry is not published yet'
			}, { status: 400 })
		}

		// Step 3: Check no existing attendance for this batch
		const { data: existingAttendance, error: checkError } = await supabase
			.from('exam_attendance')
			.select('id')
			.eq('exam_timetable_id', body.exam_timetable_id)
			.limit(1)

		if (checkError) {
			console.error('Error checking existing attendance:', checkError)
			return NextResponse.json({ error: 'Failed to check existing attendance', details: checkError }, { status: 500 })
		}

		if (existingAttendance && existingAttendance.length > 0) {
			return NextResponse.json({
				error: 'Attendance already recorded for this batch. Cannot modify.'
			}, { status: 400 })
		}

		// Step 4: Prepare attendance records for insertion
		// Note: Use attendance_status as source of truth (matching theory attendance pattern)
		const attendancePayloads = body.attendance_records.map((record: any) => ({
			institutions_id: body.institutions_id,
			examination_session_id: body.examination_session_id,
			program_code: record.program_code || body.program_code || null,
			course_id: body.course_id,
			exam_timetable_id: body.exam_timetable_id,
			exam_registration_id: record.exam_registration_id,
			student_id: record.student_id,
			attempt_number: record.attempt_number || 1,
			is_regular: record.is_regular ?? true,
			attendance_status: record.is_absent ? 'Absent' : 'Present',
			remarks: record.remarks || null,
			verified_by: body.verified_by || body.submitted_by || null,
			created_by: body.created_by || body.submitted_by || null,
		}))

		// Step 5: Insert all attendance records
		console.log('Inserting practical attendance records. Count:', attendancePayloads.length)
		console.log('Sample payload:', attendancePayloads[0])

		const { data: insertedData, error: insertError } = await supabase
			.from('exam_attendance')
			.insert(attendancePayloads)
			.select()

		if (insertError) {
			console.error('Error inserting practical attendance records:', insertError)

			if (insertError.code === '23505') {
				return NextResponse.json({
					error: 'Attendance record already exists for one or more students.'
				}, { status: 400 })
			}

			if (insertError.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please ensure all IDs exist in their respective tables. Error: ' + insertError.message
				}, { status: 400 })
			}

			return NextResponse.json({
				error: 'Failed to save attendance records: ' + insertError.message,
				details: insertError
			}, { status: 500 })
		}

		const presentCount = body.attendance_records.filter((r: any) => !r.is_absent).length
		const absentCount = body.attendance_records.filter((r: any) => r.is_absent).length
		const totalStudents = body.attendance_records.length

		console.log('Practical attendance saved successfully. Records:', insertedData?.length)

		return NextResponse.json({
			success: true,
			message: `Attendance saved successfully. ${presentCount} present, ${absentCount} absent out of ${totalStudents} students.`,
			records_saved: insertedData.length
		}, { status: 201 })
	} catch (e) {
		console.error('Practical attendance POST error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
