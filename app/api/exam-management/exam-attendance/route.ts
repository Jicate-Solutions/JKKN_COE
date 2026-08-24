import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { getISTDate } from '@/lib/utils/date-utils'

// GET: Fetch exam attendance records or student list
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const mode = searchParams.get('mode') // 'check' or 'list'
		const institution_id = searchParams.get('institution_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const course_code = searchParams.get('course_code')
		const exam_date = searchParams.get('exam_date')
		const program_code = searchParams.get('program_code')
		const session = searchParams.get('session')

		// MODE: Check if attendance already exists
		if (mode === 'check' && institution_id && examination_session_id && course_code && exam_date && session && program_code) {
			console.log('Checking attendance with params:', { institution_id, examination_session_id, course_code, exam_date, session, program_code })

			// Step 1: Get course_id from course_code
			const { data: courseData, error: courseError } = await supabase
				.from('courses')
				.select('id')
				.eq('course_code', course_code)
				.single()

			if (courseError || !courseData) {
				console.error('Course not found:', courseError)
				return NextResponse.json({ error: 'Course not found', details: courseError }, { status: 404 })
			}

			const courseId = courseData.id

			// Step 2: Find timetable row(s) for this course/date/session, then disambiguate by program
			const timetableId = await resolveTimetableId(supabase, {
				institution_id, examination_session_id, course_id: courseId,
				exam_date, session, program_code, course_code,
			})

			if (timetableId === 'error') {
				return NextResponse.json({ error: 'Failed to find exam timetable' }, { status: 500 })
			}

			if (!timetableId) {
				console.log('No exam timetable found')
				return NextResponse.json({ exists: false, data: [] })
			}

			console.log('Found exam timetable:', timetableId)

			// Step 3: Check if attendance records exist for this program (using program_code)
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
				.eq('program_code', program_code)
				.order('exam_registrations(stu_register_no)', { ascending: true })

			if (attendanceError) {
				console.error('Error checking existing attendance:', attendanceError)
				return NextResponse.json({ error: 'Failed to check attendance', details: attendanceError }, { status: 500 })
			}

			console.log('Attendance records found:', attendanceRecords?.length || 0)

			// Map to flatten the nested structure
			const mappedRecords = (attendanceRecords || []).map((att: any) => ({
				...att,
				stu_register_no: att.exam_registrations.stu_register_no,
				student_name: att.exam_registrations.student_name,
				attempt_number: att.exam_registrations.attempt_number
			}))

			return NextResponse.json({
				exists: (attendanceRecords && attendanceRecords.length > 0),
				data: mappedRecords
			})
		}

		// MODE: List students for attendance entry
		if (mode === 'list' && institution_id && examination_session_id && course_code && exam_date && session && program_code) {
			console.log('Fetching student list with params:', { institution_id, examination_session_id, course_code, exam_date, session, program_code })

			// Step 1: Get course_id from course_code
			const { data: courseData, error: courseError } = await supabase
				.from('courses')
				.select('id')
				.eq('course_code', course_code)
				.single()

			if (courseError || !courseData) {
				console.error('Course not found:', courseError)
				return NextResponse.json({ error: 'Course not found', details: courseError }, { status: 404 })
			}

			const courseId = courseData.id

			// Step 2: Resolve timetable row scoped to this program (disambiguates duplicates)
			const timetableId = await resolveTimetableId(supabase, {
				institution_id, examination_session_id, course_id: courseId,
				exam_date, session, program_code, course_code,
			})

			if (timetableId === 'error') {
				return NextResponse.json({ error: 'Failed to verify exam schedule' }, { status: 500 })
			}

			if (!timetableId) {
				console.log('No published exam timetable found for these criteria')
				return NextResponse.json({ error: 'No exam scheduled for this course on the selected date and session', details: 'Check exam timetable settings' }, { status: 404 })
			}

			console.log('Exam timetable verified:', timetableId)

			// Step 3: Check if attendance already exists (join with exam_registrations, using program_code)
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
				.eq('program_code', program_code)
				.order('exam_registrations(stu_register_no)', { ascending: true })

			if (checkAttendanceError) {
				console.error('Error checking existing attendance:', checkAttendanceError)
			}

			// If attendance exists, return the existing records
			if (existingAttendance && existingAttendance.length > 0) {
				console.log('Attendance already exists, returning saved records:', existingAttendance.length)

				// Map records to match the expected format
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

			// Step 4: Get registered students from exam_registrations
			// Filter by: institution_id, examination_session_id, program_code, course_code
			//
			// fee_paid is deliberately NOT filtered on. The flag is unreliable in this
			// database - tens of thousands of rows carry fee_paid = true with no amount
			// and no payment_date - so gating on it silently dropped learners who had
			// genuinely registered. Fee collection is tracked by the exam application
			// flow, not by this flag. (Hall tickets still gate on it, by CoE policy.)
			console.log('Fetching registered students from exam_registrations with filters:', {
				institution_id,
				examination_session_id,
				program_code,
				course_code
			})

			const { data: registeredStudents, error: regError } = await supabase
				.from('exam_registrations')
				.select('id, student_id, stu_register_no, student_name, is_regular, attempt_number')
				.eq('institutions_id', institution_id)
				.eq('examination_session_id', examination_session_id)
				.eq('program_code', program_code)
				.eq('course_code', course_code)
				.order('stu_register_no', { ascending: true })

			if (regError) {
				console.error('Error fetching exam registrations:', regError)
				return NextResponse.json({
					error: 'Failed to fetch registered students',
					details: regError,
					step: 'exam_registrations_fetch'
				}, { status: 500 })
			}

			console.log('Registered students found:', registeredStudents?.length || 0)

			if (!registeredStudents || registeredStudents.length === 0) {
				// Nothing is filtered out any more, so an empty result means the
				// registrations genuinely do not exist - no probe needed to explain it.
				return NextResponse.json({
					error: `No exam_registrations rows exist for program ${program_code} + course ${course_code} in this session. Check that registrations were created.`,
					step: 'exam_registrations_fetch',
					filters: { institution_id, examination_session_id, program_code, course_code }
				}, { status: 404 })
			}

			// Step 5: Use exam_registration data directly (student_name is already stored)
			// No need to call MyJKKN API - exam_registrations already has student_name
			console.log('Using exam_registration data directly (optimized - no MyJKKN API call)')

			const cleanedData = registeredStudents.map((reg: any) => ({
				id: reg.id,
				student_id: reg.student_id,
				stu_register_no: reg.stu_register_no || '',
				student_name: reg.student_name || '',
				attempt_number: reg.attempt_number || 1,
				is_regular: reg.is_regular ?? true,
				exam_registration_id: reg.id
			}))

			// Sort by stu_register_no ASC, then is_regular DESC
			cleanedData.sort((a: any, b: any) => {
				const regNoCompare = (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
				if (regNoCompare !== 0) return regNoCompare
				// is_regular DESC: true comes before false
				return (b.is_regular ? 1 : 0) - (a.is_regular ? 1 : 0)
			})

			console.log('Final student list:', cleanedData.length)
			return NextResponse.json(cleanedData)
		}

		return NextResponse.json({ error: 'Invalid request. Please specify mode=check or mode=list' }, { status: 400 })
	} catch (e) {
		console.error('Exam attendance GET error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST: Save exam attendance records
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		console.log('POST /api/exam-management/exam-attendance - Request body:', {
			institutions_id: body.institutions_id,
			exam_session_code: body.exam_session_code,
			course_code: body.course_code,
			program_code: body.program_code,
			session_code: body.session_code,
			exam_date: body.exam_date,
			attendance_records_count: body.attendance_records?.length || 0,
		})

		// Validate required fields
		if (!body.institutions_id || !body.exam_session_code || !body.course_code || !body.program_code || !body.session_code || !body.exam_date) {
			console.error('Validation failed - missing required fields')
			return NextResponse.json({
				error: 'Required fields: institutions_id, exam_session_code, course_code, program_code, session_code, exam_date'
			}, { status: 400 })
		}

		if (!body.attendance_records || !Array.isArray(body.attendance_records)) {
			return NextResponse.json({
				error: 'attendance_records array is required'
			}, { status: 400 })
		}

		// Step 1: Get course_id from course_code
		const { data: courseData, error: courseError } = await supabase
			.from('courses')
			.select('id')
			.eq('course_code', body.course_code)
			.single()

		if (courseError || !courseData) {
			return NextResponse.json({
				error: 'Course not found. Please verify the course code.'
			}, { status: 400 })
		}

		const courseId = courseData.id

		// Step 2: Resolve timetable row scoped to this program (disambiguates duplicates)
		const timetableId = await resolveTimetableId(supabase, {
			institution_id: body.institutions_id,
			examination_session_id: body.exam_session_code,
			course_id: courseId,
			exam_date: body.exam_date,
			session: body.session_code,
			program_code: body.program_code,
			course_code: body.course_code,
		})

		if (timetableId === 'error') {
			return NextResponse.json({
				error: 'Failed to lookup exam timetable.'
			}, { status: 500 })
		}

		if (!timetableId) {
			console.error('No exam timetable found for the given criteria')
			return NextResponse.json({
				error: 'Exam timetable not found. Please ensure the exam is scheduled and published for this date and session.'
			}, { status: 404 })
		}

		console.log('Exam timetable ID resolved:', timetableId)

		// Step 3: Check if attendance already exists for this program (using program_code)
		const { data: existingAttendance, error: checkError } = await supabase
			.from('exam_attendance')
			.select('id')
			.eq('exam_timetable_id', timetableId)
			.eq('program_code', body.program_code)
			.limit(1)

		if (checkError) {
			console.error('Error checking existing attendance:', checkError)
			return NextResponse.json({ error: 'Failed to check existing attendance', details: checkError }, { status: 500 })
		}

		if (existingAttendance && existingAttendance.length > 0) {
			return NextResponse.json({
				error: 'Attendance already recorded for this exam session. Cannot modify.'
			}, { status: 400 })
		}

		// Step 4: Prepare attendance records for insertion (using program_code instead of program_id)
		const attendancePayloads = body.attendance_records.map((record: any) => ({
			institutions_id: body.institutions_id,
			examination_session_id: body.exam_session_code,
			program_code: body.program_code,  // Store program_code directly (MyJKKN compatible)
			course_id: courseId,
			exam_timetable_id: timetableId,
			exam_registration_id: record.exam_registration_id,
			student_id: record.student_id,
			// Denormalized fields from exam_registration
			attempt_number: record.attempt_number || 1,
			is_regular: record.is_regular ?? true,
			// Use attendance_status as the source of truth
			attendance_status: record.is_absent ? 'Absent' : 'Present',
			entry_time: record.entry_time || null,  // Time when student entered exam hall
			remarks: record.remarks || null,
			verified_by: body.submitted_by || null,
			created_by: body.submitted_by || null,
		}))

		// Step 5: Insert all attendance records
		console.log('Inserting attendance records. Count:', attendancePayloads.length)
		console.log('Sample payload:', attendancePayloads[0])

		const { data: insertedData, error: insertError } = await supabase
			.from('exam_attendance')
			.insert(attendancePayloads)
			.select()

		if (insertError) {
			console.error('Error inserting attendance records:', insertError)

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

		console.log('Attendance saved successfully. Records:', insertedData?.length)

		return NextResponse.json({
			success: true,
			message: `Attendance saved successfully. ${presentCount} present, ${absentCount} absent out of ${totalStudents} students.`,
			records_saved: insertedData.length
		}, { status: 201 })
	} catch (e) {
		console.error('Exam attendance POST error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT: Update existing attendance records (super_admin only).
// Body: { editor_email: string, attendance_records: [{ exam_registration_id, is_absent, remarks }] }
// Server re-verifies super_admin from DB; the client claim is not trusted.
export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const editorEmail: string | undefined = body.editor_email
		const records: any[] = body.attendance_records || []

		if (!editorEmail) {
			return NextResponse.json({ error: 'editor_email is required' }, { status: 400 })
		}
		if (!Array.isArray(records) || records.length === 0) {
			return NextResponse.json({ error: 'attendance_records array is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Server-side super_admin verification — do NOT trust client-provided flag
		const { data: editor, error: editorError } = await supabase
			.from('users')
			.select('id, is_super_admin, role')
			.eq('email', editorEmail)
			.maybeSingle()

		if (editorError || !editor) {
			console.error('PUT exam_attendance: editor lookup failed:', editorError)
			return NextResponse.json({ error: 'Editor not found' }, { status: 403 })
		}

		const isSuperAdmin = editor.is_super_admin === true || editor.role === 'super_admin'
		if (!isSuperAdmin) {
			return NextResponse.json({ error: 'Only super_admin can edit recorded attendance' }, { status: 403 })
		}

		const editorId = editor.id
		const nowISO = new Date().toISOString()

		// Update each record by exam_registration_id (unique with exam_timetable_id constraint).
		// We let the trigger update updated_at; we set verified_by + verified_at as the audit pair.
		const updates = records.map((r: any) => ({
			exam_registration_id: r.exam_registration_id as string,
			is_absent: !!r.is_absent,
			attendance_status: r.is_absent ? 'Absent' : 'Present',
			remarks: typeof r.remarks === 'string' ? r.remarks : null,
		}))

		let updatedCount = 0
		const errors: any[] = []

		for (const u of updates) {
			const { error: updErr, count } = await supabase
				.from('exam_attendance')
				.update({
					is_absent: u.is_absent,
					attendance_status: u.attendance_status,
					remarks: u.remarks,
					verified_by: editorId,
					verified_at: nowISO,
				}, { count: 'exact' })
				.eq('exam_registration_id', u.exam_registration_id)

			if (updErr) {
				console.error('PUT exam_attendance: row update failed:', u.exam_registration_id, updErr)
				errors.push({ exam_registration_id: u.exam_registration_id, error: updErr.message })
			} else {
				updatedCount += count || 0
			}
		}

		console.log(`PUT exam_attendance: ${updatedCount} rows updated by super_admin ${editorEmail} (${editorId}). Errors: ${errors.length}`)

		if (errors.length > 0) {
			return NextResponse.json({
				success: false,
				records_updated: updatedCount,
				errors,
			}, { status: 207 }) // 207 Multi-Status — partial success
		}

		return NextResponse.json({
			success: true,
			records_updated: updatedCount,
			edited_by: editorEmail,
			edited_at: nowISO,
		})
	} catch (e) {
		console.error('Exam attendance PUT error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * Find the exam_timetable row for a (course, date, session, institution, examination_session)
 * and disambiguate to this program when multiple rows match.
 *
 * Same course can have timetable rows under different programs' course_offerings on the same
 * date/session. We pick the row whose course_offering_id maps to (program_code, course_code).
 * Falls back to the single matching row if only one exists.
 *
 * Returns: timetable_id string, null (not found), or 'error' on failure.
 */
async function resolveTimetableId(
	supabase: ReturnType<typeof getSupabaseServer>,
	params: {
		institution_id: string
		examination_session_id: string
		course_id: string
		exam_date: string
		session: string
		program_code: string
		course_code: string
	}
): Promise<string | null | 'error'> {
	const { data: rows, error } = await supabase
		.from('exam_timetables')
		.select('id, course_offering_id')
		.eq('institutions_id', params.institution_id)
		.eq('examination_session_id', params.examination_session_id)
		.eq('course_id', params.course_id)
		.eq('exam_date', params.exam_date)
		.eq('session', params.session)
		.eq('is_published', true)

	if (error) {
		console.error('resolveTimetableId: query failed:', error)
		return 'error'
	}

	if (!rows || rows.length === 0) return null
	if (rows.length === 1) return rows[0].id

	console.log(`resolveTimetableId: ${rows.length} candidate rows, disambiguating by program_code=${params.program_code}`)

	// Multiple rows — disambiguate by matching course_offering_id to this program's offering
	const offeringIds = rows.map((r: any) => r.course_offering_id).filter(Boolean)
	if (offeringIds.length === 0) {
		// All rows lack course_offering_id; cannot disambiguate — pick first
		console.warn('resolveTimetableId: no course_offering_id on any candidate row; picking first')
		return rows[0].id
	}

	const { data: offerings } = await supabase
		.from('course_offerings')
		.select('id')
		.in('id', offeringIds)
		.eq('program_code', params.program_code)
		.eq('course_code', params.course_code)

	const matchedOfferingIds = new Set((offerings || []).map((o: any) => o.id))
	const match = rows.find((r: any) => r.course_offering_id && matchedOfferingIds.has(r.course_offering_id))
	if (match) return match.id

	// No offering-based match — fall back to first row to preserve prior behavior
	console.warn('resolveTimetableId: no offering match for program; falling back to first candidate')
	return rows[0].id
}
