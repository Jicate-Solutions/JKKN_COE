import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { numberToWords } from '@/services/post-exam/external-mark-entry-service'

// ---------------------------------------------------------------------------
// GET — query-param driven action dispatch
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const action = searchParams.get('action')
		const supabase = getSupabaseServer()

		// Institution filter params (from useInstitutionFilter hook)
		const institutionCode = searchParams.get('institution_code')
		const institutionsIdParam = searchParams.get('institutions_id')

		switch (action) {

			// ------------------------------------------------------------------
			// action='institutions'
			// Return active institutions, filtered if params are provided.
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
					console.error('Error fetching institutions:', error)
					return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 400 })
				}

				return NextResponse.json(data)
			}

			// ------------------------------------------------------------------
			// action='sessions'
			// Return examination sessions for a given institution.
			// Requires: institutionId
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
					console.error('Error fetching sessions:', error)
					return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 400 })
				}

				return NextResponse.json(data)
			}

			// ------------------------------------------------------------------
			// action='practical-courses'
			// Return distinct courses that have published Practical timetable rows
			// for the given institution + session.
			// Requires: institutionId, sessionId
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

				// Step 1: get practical timetable rows scheduled for TODAY only
				const today = new Date().toISOString().split('T')[0]

				const { data: timetableRows, error: ttError } = await supabase
					.from('exam_timetables')
					.select('id, course_id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('exam_type', 'Practical')
					.eq('is_published', true)
					.eq('exam_date', today)

				if (ttError) {
					console.error('Error fetching practical timetables:', ttError)
					return NextResponse.json({ error: 'Failed to fetch practical courses' }, { status: 400 })
				}

				if (!timetableRows || timetableRows.length === 0) {
					return NextResponse.json([])
				}

				// Step 2: Only include batches where attendance has been taken
				const timetableIds = timetableRows.map((r: any) => r.id)
				const { data: attendanceRows } = await supabase
					.from('exam_attendance')
					.select('exam_timetable_id')
					.in('exam_timetable_id', timetableIds)

				const attendedTimetableIds = new Set(
					(attendanceRows || []).map((a: any) => a.exam_timetable_id)
				)

				// Filter to only timetable rows that have attendance
				const attendedRows = timetableRows.filter((r: any) => attendedTimetableIds.has(r.id))

				if (attendedRows.length === 0) {
					return NextResponse.json([])
				}

				// Step 3: distinct course_id values from attended batches only
				const distinctCourseIds = [...new Set(attendedRows.map((r: any) => r.course_id).filter(Boolean))]

				if (distinctCourseIds.length === 0) {
					return NextResponse.json([])
				}

				// Step 4: fetch those courses
				const { data: courses, error: coursesError } = await supabase
					.from('courses')
					.select('id, course_code, course_name, external_max_mark')
					.in('id', distinctCourseIds)
					.order('course_code')

				if (coursesError) {
					console.error('Error fetching courses:', coursesError)
					return NextResponse.json({ error: 'Failed to fetch practical courses' }, { status: 400 })
				}

				return NextResponse.json(courses || [])
			}

			// ------------------------------------------------------------------
			// action='practical-batches'
			// Return all practical timetable rows for a course — each row IS a batch.
			// Adds a 1-indexed batch_no field.
			// Sort: exam_date ASC, FN before AN.
			// Requires: institutionId, sessionId, courseId
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

				// Auto-filter to today's date only
				const today = new Date().toISOString().split('T')[0]

				const { data: rows, error } = await supabase
					.from('exam_timetables')
					.select('id, exam_date, session, exam_time, batch_capacity, course_id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('course_id', courseId)
					.eq('exam_type', 'Practical')
					.eq('is_published', true)
					.eq('exam_date', today)
					.order('exam_date', { ascending: true })

				if (error) {
					console.error('Error fetching practical batches:', error)
					return NextResponse.json({ error: 'Failed to fetch practical batches' }, { status: 400 })
				}

				if (!rows || rows.length === 0) {
					return NextResponse.json([])
				}

				// Sort: FN before AN within same date
				const sorted = [...rows].sort((a: any, b: any) => {
					const sessionOrder = (s: string) => s === 'FN' ? 0 : 1
					return sessionOrder(a.session) - sessionOrder(b.session)
				})

				// Only show batches where attendance has been taken
				const batchIds = sorted.map((r: any) => r.id)

				const { data: attendanceRecords } = await supabase
					.from('exam_attendance')
					.select('exam_timetable_id')
					.in('exam_timetable_id', batchIds)

				const attendedBatchIds = new Set(
					(attendanceRecords || []).map((a: any) => a.exam_timetable_id)
				)

				const attendedBatches = sorted.filter((row: any) => attendedBatchIds.has(row.id))

				if (attendedBatches.length === 0) {
					return NextResponse.json([])
				}

				// Get student counts per batch
				const { data: batchStudentCounts } = await supabase
					.from('practical_batch_students')
					.select('exam_timetable_id')
					.in('exam_timetable_id', batchIds)

				const studentCountMap = new Map<string, number>()
				for (const bs of batchStudentCounts || []) {
					const key = bs.exam_timetable_id
					studentCountMap.set(key, (studentCountMap.get(key) || 0) + 1)
				}

				// Hide batches where ALL present students already have marks entered
				const attendedBatchIdsList = attendedBatches.map((r: any) => r.id)

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

				// Get ALL attendance per batch (not just present) to handle all-absent batches
				const { data: allBatchAttendance } = await supabase
					.from('exam_attendance')
					.select('exam_timetable_id, exam_registration_id, attendance_status')
					.in('exam_timetable_id', attendedBatchIdsList)

				const filteredBatches = attendedBatches.filter((row: any) => {
					const allInBatch = (allBatchAttendance || [])
						.filter((a: any) => a.exam_timetable_id === row.id)
					const presentInBatch = allInBatch
						.filter((a: any) => a.attendance_status === 'Present')

					if (allInBatch.length === 0) return true // No attendance yet — still show

					if (presentInBatch.length === 0) {
						// All-absent batch: hide if all absent students have marks saved
						return !allInBatch.every((a: any) => markedRegIds.has(a.exam_registration_id))
					}

					// Mixed batch: complete if ALL present students have marks
					const allMarked = presentInBatch.every(
						(a: any) => markedRegIds.has(a.exam_registration_id)
					)
					return !allMarked // Hide completed batches
				})

				// Attach 1-indexed batch_no (based on all sorted batches, not just filtered)
				const batchNoMap = new Map<string, number>()
				sorted.forEach((row: any, idx: number) => {
					batchNoMap.set(row.id, idx + 1)
				})

				const batches = filteredBatches.map((row: any) => ({
					...row,
					batch_no: batchNoMap.get(row.id) || 0,
					student_count: studentCountMap.get(row.id) || 0,
				}))

				return NextResponse.json(batches)
			}

			// ------------------------------------------------------------------
			// action='batch-students'
			// Return students assigned to a specific practical batch (timetable row).
			// Queries practical_batch_students table for batch assignments.
			// Includes any existing marks_entry records for those students.
			// Requires: institutionId, sessionId, courseId, timetableId
			// ------------------------------------------------------------------
			case 'batch-students': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				const courseId = searchParams.get('courseId')
				const timetableId = searchParams.get('timetableId')

				if (!institutionId || !sessionId || !courseId || !timetableId) {
					return NextResponse.json(
						{ error: 'Institution ID, session ID, course ID, and timetable ID are required' },
						{ status: 400 }
					)
				}

				// Step 1: Get course details
				const { data: course, error: courseError } = await supabase
					.from('courses')
					.select('id, course_code, course_name, external_max_mark, external_pass_mark')
					.eq('id', courseId)
					.single()

				if (courseError || !course) {
					console.error('Error fetching course:', courseError)
					return NextResponse.json({ error: 'Course not found' }, { status: 404 })
				}

				// Step 2: Get students assigned to this batch from practical_batch_students
				const { data: batchAssignments, error: batchError } = await supabase
					.from('practical_batch_students')
					.select('exam_registration_id')
					.eq('exam_timetable_id', timetableId)

				if (batchError) {
					console.error('Error fetching batch assignments:', batchError)
					return NextResponse.json({ error: 'Failed to fetch batch assignments' }, { status: 400 })
				}

				if (!batchAssignments || batchAssignments.length === 0) {
					return NextResponse.json({
						students: [],
						course_details: {
							course_code: (course as any).course_code,
							course_name: (course as any).course_name,
							maximum_marks: (course as any).external_max_mark,
						},
						total_students: 0,
					})
				}

				// Step 3: Get student details from exam_registrations
				const regIds = batchAssignments.map((a: any) => a.exam_registration_id)

				const { data: registrations, error: regError } = await supabase
					.from('exam_registrations')
					.select('id, stu_register_no, student_name, is_regular, program_code')
					.in('id', regIds)

				if (regError) {
					console.error('Error fetching registrations:', regError)
					return NextResponse.json({ error: 'Failed to fetch student registrations' }, { status: 400 })
				}

				// Step 4: Sort by program_order ASC → regular first → register_no ASC
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

					if (a.is_regular !== b.is_regular) {
						return b.is_regular === true ? 1 : -1
					}

					return (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
				})

				// Step 5: Fetch attendance records for this batch
				// Note: attendance_status is the source of truth ('Present'/'Absent')
				// is_absent column may not be set by the attendance save handler
				const { data: attendanceRecords } = await supabase
					.from('exam_attendance')
					.select('exam_registration_id, attendance_status')
					.eq('exam_timetable_id', timetableId)

				const attendanceMap = new Map<string, string>()
				for (const a of attendanceRecords || []) {
					attendanceMap.set(a.exam_registration_id, a.attendance_status)
				}

				// Step 6: Check existing marks_entry for these students
				const { data: existingMarks } = await supabase
					.from('marks_entry')
					.select('id, exam_registration_id, total_marks_obtained, evaluator_remarks, entry_status')
					.eq('course_id', courseId)
					.eq('examination_session_id', sessionId)
					.eq('source', 'Practical Entry')
					.in('exam_registration_id', regIds)

				const marksMap = new Map<string, any>()
				for (const m of existingMarks || []) {
					marksMap.set(m.exam_registration_id, m)
				}

				// Step 7: Build response — pre-fill absent from attendance
				const students = sortedStudents.map((student: any, idx: number) => {
					const existing = marksMap.get(student.id)
					const isAbsentInAttendance = attendanceMap.get(student.id) === 'Absent'
					let status: string | null = null
					let total_marks_obtained: number | null = null
					let evaluator_remarks: string | null = null

					if (existing) {
						if (existing.evaluator_remarks === 'AB') {
							status = 'AB'
							total_marks_obtained = null
							evaluator_remarks = 'RA RE-APPEAR'
						} else {
							status = 'Present'
							total_marks_obtained = existing.total_marks_obtained != null
								? Number(existing.total_marks_obtained)
								: null
							evaluator_remarks = existing.evaluator_remarks || null
						}
					} else if (isAbsentInAttendance) {
						// Pre-fill absent from attendance — locked on frontend
						status = 'AB'
						total_marks_obtained = null
						evaluator_remarks = 'RA RE-APPEAR'
					}

					return {
						serial_number: idx + 1,
						exam_registration_id: student.id,
						register_number: student.stu_register_no || '',
						student_name: student.student_name || '',
						is_regular: student.is_regular ?? true,
						program_code: student.program_code || null,
						total_marks_obtained,
						status,
						evaluator_remarks,
						has_existing_marks: !!existing,
						is_absent_in_attendance: isAbsentInAttendance,
					}
				})

				// Step 8: Fetch examiner assignments for this batch
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
					students,
					course_details: {
						course_code: (course as any).course_code,
						course_name: (course as any).course_name,
						maximum_marks: (course as any).external_max_mark,
						minimum_pass_marks: (course as any).external_pass_mark || 0,
					},
					examiners: {
						internal: internalExaminer,
						external: externalExaminer,
					},
					total_students: students.length,
				})
			}

			default:
				return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 })
		}
	} catch (error) {
		console.error('Error in GET /api/post-exam/practical-marks:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// ---------------------------------------------------------------------------
// POST — save practical marks for a batch of students
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		const {
			institutions_id,
			examination_session_id,
			course_id,
			timetable_id,
			marks,
		} = body

		// ------------------------------------------------------------------
		// Validate required fields
		// ------------------------------------------------------------------
		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}
		if (!examination_session_id) {
			return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		}
		if (!course_id) {
			return NextResponse.json({ error: 'course_id is required' }, { status: 400 })
		}
		if (!timetable_id) {
			return NextResponse.json({ error: 'timetable_id is required' }, { status: 400 })
		}
		if (!Array.isArray(marks) || marks.length === 0) {
			return NextResponse.json({ error: 'marks array is required and must not be empty' }, { status: 400 })
		}

		// ------------------------------------------------------------------
		// Fetch course to get max marks
		// ------------------------------------------------------------------
		const { data: course, error: courseError } = await supabase
			.from('courses')
			.select('course_code, external_max_mark, external_pass_mark')
			.eq('id', course_id)
			.single()

		if (courseError || !course) {
			console.error('Error fetching course for practical marks POST:', courseError)
			return NextResponse.json({ error: 'Course not found' }, { status: 404 })
		}

		const maxMarks: number = (course as any).external_max_mark || 100
		const passMarks: number = (course as any).external_pass_mark || Math.ceil(maxMarks * 0.4)
		const evaluationDate = new Date().toISOString().split('T')[0]

		// ------------------------------------------------------------------
		// Process each mark entry: validate → upsert
		// ------------------------------------------------------------------
		let saved = 0
		const errors: Array<{ exam_registration_id: string; error: string }> = []

		for (const entry of marks) {
			const { exam_registration_id, register_number, total_marks_obtained, status } = entry

			if (!exam_registration_id) {
				errors.push({ exam_registration_id: 'unknown', error: 'exam_registration_id is required' })
				continue
			}

			// Validate: AB students cannot have marks
			const isAbsent = status === 'AB'
			if (isAbsent && total_marks_obtained != null) {
				errors.push({
					exam_registration_id,
					error: 'Absent (AB) students cannot have marks',
				})
				continue
			}

			// Validate: marks cannot exceed maximum
			if (!isAbsent && total_marks_obtained != null && Number(total_marks_obtained) > maxMarks) {
				errors.push({
					exam_registration_id,
					error: `Marks ${total_marks_obtained} exceed maximum allowed ${maxMarks}`,
				})
				continue
			}

			// Derive evaluator_remarks and marks value
			const marksValue: number | null = isAbsent ? null : (total_marks_obtained ?? null)
			let evaluatorRemarks: string
			if (isAbsent) {
				evaluatorRemarks = 'AB'
			} else if (marksValue != null) {
				evaluatorRemarks = marksValue >= passMarks ? 'PASS' : 'FAIL'
			} else {
				evaluatorRemarks = ''
			}

			// Build the marks_entry payload
			// Note: marks_entry has no exam_timetable_id column
			// dummy_number is NOT NULL — use register_number as placeholder for practical entries
			// total_marks_obtained is NOT NULL — use 0 for absent students
			const effectiveMarks = isAbsent ? 0 : (marksValue ?? 0)
			const payload: Record<string, unknown> = {
				institutions_id,
				examination_session_id,
				exam_registration_id,
				course_id,
				dummy_number: register_number || exam_registration_id,
				total_marks_obtained: effectiveMarks,
				total_marks_in_words: isAbsent ? 'AB' : (marksValue != null ? numberToWords(marksValue) : 'ZERO'),
				marks_out_of: maxMarks,
				evaluator_remarks: evaluatorRemarks,
				evaluation_date: evaluationDate,
				source: 'Practical Entry',
				entry_status: 'Submitted',
			}

			// Check if a record already exists for this student + course (Practical Entry)
			const { data: existing, error: lookupError } = await supabase
				.from('marks_entry')
				.select('id')
				.eq('exam_registration_id', exam_registration_id)
				.eq('course_id', course_id)
				.eq('examination_session_id', examination_session_id)
				.eq('source', 'Practical Entry')
				.maybeSingle()

			if (lookupError) {
				console.error('Error checking existing mark for', exam_registration_id, lookupError)
				errors.push({ exam_registration_id, error: 'Failed to check existing marks' })
				continue
			}

			if (existing) {
				// UPDATE existing record
				const { error: updateError } = await supabase
					.from('marks_entry')
					.update(payload)
					.eq('id', existing.id)

				if (updateError) {
					console.error('Error updating mark for', exam_registration_id, updateError)
					errors.push({ exam_registration_id, error: updateError.message || 'Failed to update mark' })
					continue
				}
			} else {
				// INSERT new record
				const { error: insertError } = await supabase
					.from('marks_entry')
					.insert(payload)

				if (insertError) {
					console.error('Error inserting mark for', exam_registration_id, insertError)
					errors.push({ exam_registration_id, error: insertError.message || 'Failed to save mark' })
					continue
				}
			}

			saved++
		}

		if (saved === 0 && errors.length > 0) {
			return NextResponse.json({
				success: false,
				error: errors[0]?.error || 'Failed to save any marks',
				saved: 0,
				errors,
				total: marks.length,
			}, { status: 400 })
		}

		return NextResponse.json({
			success: true,
			saved,
			errors,
			total: marks.length,
		})
	} catch (error) {
		console.error('Error in POST /api/post-exam/practical-marks:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
