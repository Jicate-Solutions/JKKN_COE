import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { createHash } from 'crypto'

// Helper function to convert number to words
function numberToWords(num: number): string {
	if (num === 0) return 'Zero'

	const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
		'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
	const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

	const intPart = Math.floor(num)
	const decimalPart = Math.round((num - intPart) * 100)

	let words = ''

	if (intPart >= 100) {
		words += ones[Math.floor(intPart / 100)] + ' Hundred '
		const remainder = intPart % 100
		if (remainder >= 20) {
			words += tens[Math.floor(remainder / 10)] + ' ' + ones[remainder % 10]
		} else if (remainder > 0) {
			words += ones[remainder]
		}
	} else if (intPart >= 20) {
		words += tens[Math.floor(intPart / 10)] + ' ' + ones[intPart % 10]
	} else if (intPart > 0) {
		words += ones[intPart]
	}

	if (decimalPart > 0) {
		words = words.trim() + ' Point '
		if (decimalPart >= 20) {
			words += tens[Math.floor(decimalPart / 10)] + ' ' + ones[decimalPart % 10]
		} else {
			words += ones[decimalPart]
		}
	}

	return words.trim() || 'Zero'
}

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const action = searchParams.get('action')
		const supabase = getSupabaseServer()

		switch (action) {
			case 'institutions': {
				const { data, error } = await supabase
					.from('institutions')
					.select('id, name, institution_code, myjkkn_institution_ids')
					.eq('is_active', true)
					.order('name')

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

			case 'programs': {
				const institutionId = searchParams.get('institutionId')

				if (!institutionId) {
					return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
				}

				const { data, error } = await supabase
					.from('programs')
					.select('id, program_code, program_name')
					.eq('institutions_id', institutionId)
					.eq('is_active', true)
					.order('program_name')

				if (error) {
					console.error('Error fetching programs:', error)
					return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 400 })
				}

				return NextResponse.json(data)
			}

			case 'courses': {
				const institutionId = searchParams.get('institutionId')

				if (!institutionId) {
					return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
				}

				const { data, error } = await supabase
					.from('courses')
					.select('id, course_code, course_name, external_max_mark')
					.eq('institutions_id', institutionId)
					.order('course_code')

				if (error) {
					console.error('Error fetching courses:', error)
					return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 400 })
				}

				return NextResponse.json(data)
			}

			// Fetch all sessions (for super_admin with "All Institutions")
			case 'all-sessions': {
				const { data, error } = await supabase
					.from('examination_sessions')
					.select('id, session_name, session_code, institutions_id')
					.order('session_name')

				if (error) {
					console.error('Error fetching all sessions:', error)
					return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 400 })
				}

				return NextResponse.json(data)
			}

			// Fetch all programs (for super_admin with "All Institutions")
			case 'all-programs': {
				const { data, error } = await supabase
					.from('programs')
					.select('id, program_code, program_name')
					.eq('is_active', true)
					.order('program_name')

				if (error) {
					console.error('Error fetching all programs:', error)
					return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 400 })
				}

				return NextResponse.json(data)
			}

			// Fetch all courses (for super_admin with "All Institutions")
			case 'all-courses': {
				const { data, error } = await supabase
					.from('courses')
					.select('id, course_code, course_name, external_max_mark')
					.order('course_code')

				if (error) {
					console.error('Error fetching all courses:', error)
					return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 400 })
				}

				return NextResponse.json(data)
			}

			case 'marks': {
				// institutionId is now optional - uses institution filter from query params
				const institutionId = searchParams.get('institutionId') || searchParams.get('institutions_id')
				const sessionId = searchParams.get('sessionId')
				const programId = searchParams.get('programId')
				const courseId = searchParams.get('courseId')

				console.log('=== DEBUG: Fetching external marks ===')
				console.log('Filters:', { institutionId, sessionId, programId, courseId })

				// Supabase default limit is 1000 rows - need to paginate to get all records
				const pageSize = 1000
				let allData: any[] = []
				let page = 0
				let hasMore = true

				while (hasMore) {
					let query = supabase
						.from('marks_entry')
						.select(`
							id,
							institutions_id,
							examination_session_id,
							exam_registration_id,
							student_dummy_number_id,
							program_id,
							course_id,
							dummy_number,
							total_marks_obtained,
							marks_out_of,
							percentage,
							entry_status,
							evaluator_remarks,
							source,
							created_at,
							institutions (
								id,
								name,
								institution_code
							),
							student_dummy_numbers (
								id,
								dummy_number,
								exam_registrations (
									id,
									student_name
								)
							),
							exam_registrations (
								id,
								student_name,
								stu_register_no,
								course_offering_id,
								course_offerings (
									id,
									course_mapping_id,
									course_mapping (
										id,
										course_order
									)
								)
							),
							courses (
								id,
								course_code,
								course_name
							),
							examination_sessions (
								id,
								session_name,
								session_code
							)
						`)

					// Apply filters BEFORE range (required for proper pagination)
					// Filter for external marks only (no examiner assignment)
					query = query.is('examiner_assignment_id', null)

					if (institutionId) {
						query = query.eq('institutions_id', institutionId)
					}
					if (sessionId) {
						query = query.eq('examination_session_id', sessionId)
					}
					if (programId) {
						query = query.eq('program_id', programId)
					}
					if (courseId) {
						query = query.eq('course_id', courseId)
					}

					// Apply order and range AFTER filters
					query = query.order('created_at', { ascending: false })
						.range(page * pageSize, (page + 1) * pageSize - 1)

					const { data: pageData, error: pageError } = await query

					console.log(`=== Page ${page}: Fetched ${pageData?.length || 0} records ===`)

					if (pageError) {
						console.error('Error fetching marks page:', page, pageError)
						return NextResponse.json({ error: `Failed to fetch external marks: ${pageError.message}` }, { status: 400 })
					}

					if (pageData && pageData.length > 0) {
						allData = allData.concat(pageData)
						console.log(`Page ${page}: Added ${pageData.length} records, total so far: ${allData.length}`)
						page++
						// Continue fetching if we got a full page (might be more data)
						hasMore = pageData.length === pageSize
						console.log(`hasMore: ${hasMore} (pageData.length=${pageData.length}, pageSize=${pageSize})`)
					} else {
						console.log(`Page ${page}: No more data`)
						hasMore = false
					}
				}

				const data = allData
				const error = null

				console.log('=== DEBUG: Query result ===')
				console.log('Total records fetched:', data?.length || 0)
				console.log('Pages fetched:', page)
				console.log('Filters applied:', { institutionId, sessionId, programId, courseId })

				if (error) {
					console.error('Error fetching external marks:', error)
					return NextResponse.json({ error: `Failed to fetch external marks: ${error.message}` }, { status: 400 })
				}

				// Transform data for display - include institution info
				// Note: program_name not included as programs come from MyJKKN API
				const transformedData = data?.map(mark => {
					const dummyNumData = mark.student_dummy_numbers as any
					const dummyExamReg = dummyNumData?.exam_registrations as any
					const directExamReg = mark.exam_registrations as any
					const institutionData = mark.institutions as any

					// Get student name - try dummy number path first, then direct exam_registrations
					const studentName = dummyExamReg?.student_name || directExamReg?.student_name || 'Unknown'
					// Get display identifier - dummy number if available, else register number
					const displayNumber = dummyNumData?.dummy_number || mark.dummy_number || directExamReg?.stu_register_no || 'N/A'
					// Get course_order from course_mapping via exam_registrations -> course_offerings -> course_mapping
					const courseOrder = directExamReg?.course_offerings?.course_mapping?.course_order || 999

					return {
						...mark,
						student_name: studentName,
						dummy_number: displayNumber,
						register_number: directExamReg?.stu_register_no || '',
						course_code: (mark.courses as any)?.course_code || '',
						course_name: (mark.courses as any)?.course_name || '',
						course_order: courseOrder,
						program_name: '', // Programs come from MyJKKN API, not local DB
						session_name: (mark.examination_sessions as any)?.session_name || '',
						remarks: mark.evaluator_remarks || '',
						institution_code: institutionData?.institution_code || '',
						institution_name: institutionData?.name || ''
					}
				})

				// Sort by institution_code, then session_name, then course_order
				transformedData?.sort((a, b) => {
					// First by institution_code
					const instCompare = (a.institution_code || '').localeCompare(b.institution_code || '')
					if (instCompare !== 0) return instCompare
					// Then by session_name
					const sessionCompare = (a.session_name || '').localeCompare(b.session_name || '')
					if (sessionCompare !== 0) return sessionCompare
					// Then by course_order
					return (a.course_order || 999) - (b.course_order || 999)
				})

				return NextResponse.json(transformedData)
			}

			default:
				return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
		}
	} catch (error) {
		console.error('External marks bulk API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()
		const { action } = body

		if (action === 'bulk-upload') {
			return handleBulkUpload(supabase, body)
		} else if (action === 'bulk-delete') {
			return handleBulkDelete(supabase, body)
		} else {
			return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
		}
	} catch (error) {
		console.error('External marks bulk POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

async function handleBulkUpload(supabase: any, body: any) {
	const {
		lookup_mode = 'dummy_number', // 'dummy_number' or 'register_number'
		marks_data,
		file_name,
		file_size,
		file_type,
		uploaded_by
	} = body

	// Validate required fields - now uses institution_code from each row
	if (!marks_data || !Array.isArray(marks_data) || marks_data.length === 0) {
		return NextResponse.json({
			error: 'Missing required fields: marks_data array is required'
		}, { status: 400 })
	}

	// Validate uploaded_by is provided
	if (!uploaded_by) {
		return NextResponse.json({
			error: 'Missing required field: uploaded_by is required'
		}, { status: 400 })
	}

	// Step 1: Fetch all institutions for code-to-id mapping
	const { data: allInstitutions } = await supabase
		.from('institutions')
		.select('id, institution_code')
		.eq('is_active', true)

	const institutionCodeToId = new Map<string, string>(
		allInstitutions?.map((i: any) => [i.institution_code?.toUpperCase(), i.id]) || []
	)

	// Step 2: Get unique institution codes from marks_data
	const uniqueInstCodes = new Set<string>(
		marks_data.map((row: any) => String(row.institution_code || '').toUpperCase().trim()).filter(Boolean)
	)

	// Validate all institution codes exist
	const invalidInstCodes: string[] = []
	uniqueInstCodes.forEach(code => {
		if (!institutionCodeToId.has(code)) {
			invalidInstCodes.push(code)
		}
	})

	if (invalidInstCodes.length > 0) {
		return NextResponse.json({
			error: `Invalid institution code(s): ${invalidInstCodes.join(', ')}. Please check the Institution Code column in your Excel file.`
		}, { status: 400 })
	}

	// Step 3: Get institution IDs to fetch data for
	const institutionIdsToFetch: string[] = []
	uniqueInstCodes.forEach(code => {
		const id = institutionCodeToId.get(code)
		if (id) institutionIdsToFetch.push(id)
	})

	console.log('=== DEBUG: Institution-based External Marks Import ===')
	console.log('uniqueInstCodes:', Array.from(uniqueInstCodes))
	console.log('institutionIdsToFetch:', institutionIdsToFetch)
	console.log('lookup_mode:', lookup_mode)

	// Generate file hash
	const fileContent = JSON.stringify(marks_data)
	const file_hash = createHash('sha256').update(fileContent).digest('hex')

	// Process marks - no batch record since we support multi-institution
	const results = {
		successful: 0,
		failed: 0,
		skipped: 0,
		errors: [] as any[],
		validation_errors: [] as any[]
	}

	// Fetch all student dummy numbers with exam registrations for relevant institutions
	// Note: Supabase default limit is 1000 rows per request, so we paginate
	let dummyNumbers: any[] = []
	const pageSize = 1000

	for (const instId of institutionIdsToFetch) {
		let page = 0
		let hasMore = true

		while (hasMore) {
			const { data, error } = await supabase
				.from('student_dummy_numbers')
				.select(`
					id,
					dummy_number,
					exam_registration_id,
					exam_registrations!inner (
						id,
						student_id,
						student_name,
						institutions_id,
						examination_session_id,
						course_offering_id,
						program_code,
						course_offerings!inner (
							id,
							course_id,
							program_id,
							courses!inner (
								id,
								course_code,
								external_max_mark
							)
						)
					)
				`)
				.eq('exam_registrations.institutions_id', instId)
				.range(page * pageSize, (page + 1) * pageSize - 1)

			if (error) {
				console.error('Error fetching dummy numbers page:', page, 'for institution:', instId, error)
				break
			}

			if (data && data.length > 0) {
				dummyNumbers = dummyNumbers.concat(data)
				page++
				hasMore = data.length === pageSize
			} else {
				hasMore = false
			}
		}
	}

	// Fetch exam attendance data for all relevant institutions
	// Note: exam_attendance has unique constraint on (institutions_id, exam_registration_id)
	let allAttendanceData: any[] = []
	const attPageSize = 1000

	for (const instId of institutionIdsToFetch) {
		let attPage = 0
		let attHasMore = true

		while (attHasMore) {
			const { data: attendanceData, error: attendanceError } = await supabase
				.from('exam_attendance')
				.select('exam_registration_id, attendance_status')
				.eq('institutions_id', instId)
				.range(attPage * attPageSize, (attPage + 1) * attPageSize - 1)

			if (attendanceError) {
				console.error('Error fetching attendance data page:', attPage, 'for institution:', instId, attendanceError)
				break
			}

			if (attendanceData && attendanceData.length > 0) {
				allAttendanceData = allAttendanceData.concat(attendanceData)
				attPage++
				attHasMore = attendanceData.length === attPageSize
			} else {
				attHasMore = false
			}
		}
	}

	// Build attendance map: exam_registration_id -> attendance_status ('Present' or 'Absent')
	// Note: If no attendance record exists, attendance_status will be null (not defaulted)
	const attendanceMap = new Map<string, { is_absent: boolean; attendance_status: string | null }>()
	allAttendanceData.forEach((att: any) => {
		attendanceMap.set(att.exam_registration_id, {
			is_absent: att.attendance_status === 'Absent',
			attendance_status: att.attendance_status || null
		})
	})

	console.log('=== DEBUG: Attendance Data ===')
	console.log('Total attendance records fetched:', allAttendanceData.length)

	console.log('=== DEBUG: Student Dummy Numbers ===')
	console.log('Total dummy numbers fetched:', dummyNumbers?.length || 0)

	// Get courses for all relevant institutions
	let courses: any[] = []
	for (const instId of institutionIdsToFetch) {
		const { data: instCourses } = await supabase
			.from('courses')
			.select('id, course_code, external_max_mark, institutions_id')
			.eq('institutions_id', instId)

		if (instCourses) {
			courses = courses.concat(instCourses)
		}
	}

	// Get sessions for all relevant institutions (for register_number mode)
	let examSessions: any[] = []
	for (const instId of institutionIdsToFetch) {
		const { data: instSessions } = await supabase
			.from('examination_sessions')
			.select('id, session_code, institutions_id')
			.eq('institutions_id', instId)

		if (instSessions) {
			examSessions = examSessions.concat(instSessions)
		}
	}

	// Build session map: institution_id|session_code -> session_id
	const sessionMap = new Map<string, string>(
		examSessions?.map((s: any) => [`${s.institutions_id}|${s.session_code?.toLowerCase()?.trim()}`, s.id]) || []
	)

	// Note: Programs come from MyJKKN API, not local DB
	// We use program_id from course_offerings which is already available in exam_registrations
	// No need to fetch programs separately - this avoids performance lag from API calls

	// For register_number mode, fetch exam_registrations with stu_register_no for all relevant institutions
	let examRegistrations: any[] = []
	if (lookup_mode === 'register_number') {
		const regPageSize = 1000

		for (const instId of institutionIdsToFetch) {
			let regPage = 0
			let regHasMore = true

			while (regHasMore) {
				const { data: regData, error: regError } = await supabase
					.from('exam_registrations')
					.select(`
						id,
						stu_register_no,
						student_id,
						student_name,
						institutions_id,
						examination_session_id,
						course_offering_id,
						program_code,
						examination_sessions!inner (
							id,
							session_code
						),
						course_offerings!inner (
							id,
							course_id,
							program_id,
							courses!inner (
								id,
								course_code,
								external_max_mark
							)
						)
					`)
					.eq('institutions_id', instId)
					.not('stu_register_no', 'is', null)
					.range(regPage * regPageSize, (regPage + 1) * regPageSize - 1)

				if (regError) {
					console.error('Error fetching exam registrations page:', regPage, 'for institution:', instId, regError)
					break
				}

				if (regData && regData.length > 0) {
					examRegistrations = examRegistrations.concat(regData)
					regPage++
					regHasMore = regData.length === regPageSize
				} else {
					regHasMore = false
				}
			}
		}

		console.log('=== DEBUG: Exam Registrations (register_number mode) ===')
		console.log('Total exam registrations fetched:', examRegistrations.length)
	}

	// Build maps for fast lookup
	// Map: institution_id|dummy_number|course_code -> student info (for multi-institution support)
	const dummyMap = new Map<string, {
		student_dummy_id: string
		dummy_number: string
		exam_registration_id: string
		student_id: string
		student_name: string
		course_id: string
		course_code: string
		course_offering_id: string
		program_id: string
		program_code: string | null
		examination_session_id: string
		institutions_id: string
		external_max_mark: number
		is_absent: boolean
		attendance_status: string | null // null means no attendance record exists
	}>()

	dummyNumbers?.forEach((dn: any) => {
		const dummyNo = dn.dummy_number?.toLowerCase()?.trim()
		const courseCode = dn.exam_registrations?.course_offerings?.courses?.course_code?.toLowerCase()?.trim()
		const courseId = dn.exam_registrations?.course_offerings?.courses?.id
		const examRegId = dn.exam_registrations?.id
		const instId = dn.exam_registrations?.institutions_id
		if (dummyNo && courseCode && courseId && examRegId && instId) {
			const key = `${instId}|${dummyNo}|${courseCode}`
			// Look up attendance from exam_attendance table (unique constraint: institutions_id, exam_registration_id)
			const attendance = attendanceMap.get(examRegId)
			dummyMap.set(key, {
				student_dummy_id: dn.id,
				dummy_number: dn.dummy_number,
				exam_registration_id: examRegId,
				student_id: dn.exam_registrations.student_id,
				student_name: dn.exam_registrations.student_name,
				course_id: courseId,
				course_code: dn.exam_registrations.course_offerings.courses.course_code,
				course_offering_id: dn.exam_registrations.course_offerings.id,
				program_id: dn.exam_registrations.course_offerings.program_id,
				program_code: dn.exam_registrations.program_code || null,
				examination_session_id: dn.exam_registrations.examination_session_id,
				institutions_id: instId,
				external_max_mark: dn.exam_registrations.course_offerings.courses.external_max_mark || 100,
				is_absent: attendance?.is_absent || false,
				attendance_status: attendance?.attendance_status || null // null means no attendance record
			})
		}
	})

	// Map for register_number mode: institution_id|register_number|subject_code|session_code -> student info
	const registerMap = new Map<string, {
		exam_registration_id: string
		student_id: string
		student_name: string
		register_number: string
		course_id: string
		course_code: string
		course_offering_id: string
		program_id: string
		program_code: string | null
		examination_session_id: string
		institutions_id: string
		external_max_mark: number
		is_absent: boolean
		attendance_status: string | null // null means no attendance record exists
	}>()

	// Also need to find the student_dummy_number for register_number mode
	// Build a map: exam_registration_id -> student_dummy_number_id
	const regToDummyMap = new Map<string, string>()
	dummyNumbers?.forEach((dn: any) => {
		const examRegId = dn.exam_registrations?.id
		if (examRegId) {
			regToDummyMap.set(examRegId, dn.id)
		}
	})

	if (lookup_mode === 'register_number') {
		examRegistrations?.forEach((reg: any) => {
			const registerNo = reg.stu_register_no?.toLowerCase()?.trim()
			const courseCode = reg.course_offerings?.courses?.course_code?.toLowerCase()?.trim()
			const sessionCode = reg.examination_sessions?.session_code?.toLowerCase()?.trim()
			const courseId = reg.course_offerings?.courses?.id
			const examRegId = reg.id
			const instId = reg.institutions_id

			if (registerNo && courseCode && sessionCode && courseId && examRegId && instId) {
				const key = `${instId}|${registerNo}|${courseCode}|${sessionCode}`
				const attendance = attendanceMap.get(examRegId)
				registerMap.set(key, {
					exam_registration_id: examRegId,
					student_id: reg.student_id,
					student_name: reg.student_name,
					register_number: reg.stu_register_no,
					course_id: courseId,
					course_code: reg.course_offerings.courses.course_code,
					course_offering_id: reg.course_offerings.id,
					program_id: reg.course_offerings.program_id,
					program_code: reg.program_code || null,
					examination_session_id: reg.examination_session_id,
					institutions_id: instId,
					external_max_mark: reg.course_offerings.courses.external_max_mark || 100,
					is_absent: attendance?.is_absent || false,
					attendance_status: attendance?.attendance_status || null // null means no attendance record
				})
			}
		})
	}

	// Course map: institution_id|course_code -> course info
	const courseMap = new Map<string, { id: string; course_code: string; external_max_mark: number }>(
		courses?.map((c: any) => [`${c.institutions_id}|${c.course_code?.toLowerCase()}`, c]) || []
	)

	console.log('=== DEBUG: Lookup Maps ===')
	console.log('Lookup mode:', lookup_mode)
	console.log('dummyMap keys (first 10):', Array.from(dummyMap.keys()).slice(0, 10))
	console.log('registerMap keys (first 10):', Array.from(registerMap.keys()).slice(0, 10))
	console.log('courseMap keys:', Array.from(courseMap.keys()))
	console.log('sessionMap keys:', Array.from(sessionMap.keys()))

	// Process each row
	for (let i = 0; i < marks_data.length; i++) {
		const row = marks_data[i]
		const rowNumber = i + 2 // +2 for Excel header row
		const rowErrors: string[] = []

		// Get institution_id from row's institution_code
		const rowInstCode = String(row.institution_code || '').toUpperCase().trim()
		const rowInstId = institutionCodeToId.get(rowInstCode)

		if (!rowInstId) {
			rowErrors.push(`Invalid institution code "${row.institution_code}"`)
			results.failed++
			results.validation_errors.push({
				row: rowNumber,
				dummy_number: row.dummy_number || row.register_number || 'N/A',
				course_code: row.course_code || row.subject_code || 'N/A',
				errors: rowErrors
			})
			continue
		}

		// Lookup based on mode
		let studentInfo: any = null
		let studentDummyId: string | null = null
		let displayIdentifier = ''

		if (lookup_mode === 'register_number') {
			// Register number mode: institution_id + register_number + subject_code + session_code
			const registerNo = String(row.register_number || '').toLowerCase().trim()
			const subjectCode = String(row.subject_code || row.course_code || '').toLowerCase().trim()
			const sessionCode = String(row.session_code || '').toLowerCase().trim()
			const lookupKey = `${rowInstId}|${registerNo}|${subjectCode}|${sessionCode}`
			displayIdentifier = row.register_number || 'N/A'

			const regInfo = registerMap.get(lookupKey)

			if (i < 3) {
				console.log(`=== DEBUG: Row ${i + 1} Lookup (register_number mode) ===`)
				console.log('Looking for:', { rowInstId, registerNo, subjectCode, sessionCode, lookupKey })
				console.log('Found:', regInfo ? 'YES' : 'NO')
			}

			if (!regInfo) {
				// Check specific issues for better error messages
				const courseKey = `${rowInstId}|${subjectCode}`
				const sessionKey = `${rowInstId}|${sessionCode}`
				if (!courseMap.has(courseKey)) {
					rowErrors.push(`Subject/Course with code "${row.subject_code || row.course_code}" not found for institution "${row.institution_code}"`)
				} else if (!sessionMap.has(sessionKey)) {
					rowErrors.push(`Session with code "${row.session_code}" not found for institution "${row.institution_code}"`)
				} else {
					rowErrors.push(`No exam registration found for register number "${row.register_number}" in subject "${row.subject_code || row.course_code}" for session "${row.session_code}"`)
				}
				results.failed++
				results.validation_errors.push({
					row: rowNumber,
					dummy_number: displayIdentifier,
					course_code: row.subject_code || row.course_code || 'N/A',
					errors: rowErrors
				})
				continue
			}

			// Get the student_dummy_number_id from regToDummyMap (optional - may be null)
			studentDummyId = regToDummyMap.get(regInfo.exam_registration_id) || null

			// Note: studentDummyId can be null for Register Number mode
			// External marks can be uploaded without dummy numbers allocated

			// Convert to common format
			studentInfo = {
				student_dummy_id: studentDummyId, // Can be null for register number mode
				dummy_number: displayIdentifier, // Use register number as display
				exam_registration_id: regInfo.exam_registration_id,
				student_id: regInfo.student_id,
				student_name: regInfo.student_name,
				course_id: regInfo.course_id,
				course_code: regInfo.course_code,
				course_offering_id: regInfo.course_offering_id,
				program_id: regInfo.program_id,
				program_code: regInfo.program_code, // From exam_registrations.program_code
				examination_session_id: regInfo.examination_session_id,
				institutions_id: regInfo.institutions_id,
				external_max_mark: regInfo.external_max_mark,
				is_absent: regInfo.is_absent,
				attendance_status: regInfo.attendance_status
			}
		} else {
			// Dummy number mode (default): institution_id + dummy_number + course_code
			const dummyNo = String(row.dummy_number || '').toLowerCase().trim()
			const courseCode = String(row.course_code || '').toLowerCase().trim()
			const lookupKey = `${rowInstId}|${dummyNo}|${courseCode}`
			displayIdentifier = row.dummy_number || 'N/A'

			studentInfo = dummyMap.get(lookupKey)

			if (i < 3) {
				console.log(`=== DEBUG: Row ${i + 1} Lookup (dummy_number mode) ===`)
				console.log('Looking for:', { rowInstId, dummyNo, courseCode, lookupKey })
				console.log('Found:', studentInfo ? 'YES' : 'NO')
				if (studentInfo) {
					console.log('Attendance:', {
						is_absent: studentInfo.is_absent,
						attendance_status: studentInfo.attendance_status
					})
				}
			}

			// Provide specific error messages if not found
			if (!studentInfo) {
				const courseKey = `${rowInstId}|${courseCode}`
				if (!courseMap.has(courseKey)) {
					rowErrors.push(`Course with code "${row.course_code}" not found for institution "${row.institution_code}"`)
				} else {
					rowErrors.push(`No exam registration found for dummy number "${row.dummy_number}" in course "${row.course_code}" for institution "${row.institution_code}"`)
				}
				results.failed++
				results.validation_errors.push({
					row: rowNumber,
					dummy_number: displayIdentifier,
					course_code: row.course_code || 'N/A',
					errors: rowErrors
				})
				continue
			}
		}

		// ATTENDANCE VALIDATION - Only allow marks for students with attendance_status = 'Present'
		// If no attendance record exists (null), block the upload
		if (studentInfo.attendance_status === null) {
			rowErrors.push('No attendance record found. Attendance must be marked before entering marks.')
			results.failed++
			results.validation_errors.push({
				row: rowNumber,
				dummy_number: displayIdentifier,
				course_code: row.subject_code || row.course_code || 'N/A',
				errors: rowErrors
			})
			continue
		}
		if (studentInfo.attendance_status !== 'Present') {
			rowErrors.push(`Student attendance status is "${studentInfo.attendance_status}". Marks can only be entered for students marked as Present.`)
			results.failed++
			results.validation_errors.push({
				row: rowNumber,
				dummy_number: displayIdentifier,
				course_code: row.subject_code || row.course_code || 'N/A',
				errors: rowErrors
			})
			continue
		}

		// Parse marks
		const totalMarks = parseFloat(String(row.total_marks_obtained || 0))
		const marksOutOf = parseFloat(String(row.marks_out_of || studentInfo.external_max_mark || 100))
		const remarks = String(row.remarks || '').trim()

		// Validate marks - strict validation
		if (isNaN(totalMarks)) {
			rowErrors.push('Total marks obtained must be a valid number')
		} else if (totalMarks < 0) {
			rowErrors.push('Total marks obtained cannot be negative')
		} else if (totalMarks === 0) {
			rowErrors.push('Total marks obtained cannot be 0 (zero marks not accepted)')
		}
		if (isNaN(marksOutOf) || marksOutOf <= 0) {
			rowErrors.push('Marks out of must be a positive number greater than 0')
		}
		if (!isNaN(totalMarks) && !isNaN(marksOutOf) && totalMarks > marksOutOf) {
			rowErrors.push(`Total marks (${totalMarks}) cannot exceed marks out of (${marksOutOf})`)
		}

		if (rowErrors.length > 0) {
			results.failed++
			results.validation_errors.push({
				row: rowNumber,
				dummy_number: displayIdentifier,
				course_code: row.subject_code || row.course_code || 'N/A',
				errors: rowErrors
			})
			continue
		}

		try {
			// Check if record already exists - if so, skip (don't update)
			// For Register Number mode (no dummy number), check by exam_registration_id
			// For Dummy Number mode, check by student_dummy_number_id
			let existingQuery = supabase
				.from('marks_entry')
				.select('id, dummy_number, total_marks_obtained')
				.eq('institutions_id', studentInfo.institutions_id)
				.eq('course_id', studentInfo.course_id)

			if (studentInfo.student_dummy_id) {
				// Dummy Number mode - check by student_dummy_number_id
				existingQuery = existingQuery.eq('student_dummy_number_id', studentInfo.student_dummy_id)
			} else {
				// Register Number mode - check by exam_registration_id
				existingQuery = existingQuery.eq('exam_registration_id', studentInfo.exam_registration_id)
			}

			const { data: existing } = await existingQuery.maybeSingle()

			if (existing) {
				// Skip - marks already exist for this student/course
				results.skipped++
				results.validation_errors.push({
					row: rowNumber,
					dummy_number: displayIdentifier,
					course_code: row.subject_code || row.course_code || 'N/A',
					errors: [`Marks already exist for this student (${existing.total_marks_obtained} marks). Skipped to prevent overwrite.`]
				})
				continue
			}

			const marksDataObj: any = {
				total_marks_obtained: totalMarks,
				marks_out_of: marksOutOf,
				total_marks_in_words: numberToWords(totalMarks),
				evaluator_remarks: remarks || null,
				evaluation_date: new Date().toISOString().split('T')[0],
				entry_status: 'Draft'
			}

			// Insert new record only - use institution_id from the row's student info
			// student_dummy_number_id can be null for Register Number mode
			// program_id from course_offerings, program_code from exam_registrations
			const insertData: any = {
				institutions_id: studentInfo.institutions_id,
				examination_session_id: studentInfo.examination_session_id,
				exam_registration_id: studentInfo.exam_registration_id,
				student_dummy_number_id: studentInfo.student_dummy_id || null,
				program_id: studentInfo.program_id || null, // From course_offerings.program_id
				program_code: studentInfo.program_code || null, // From exam_registrations.program_code
				course_id: studentInfo.course_id,
				dummy_number: studentInfo.dummy_number,
				source: 'Bulk Upload',
				...marksDataObj
			}

			const { error: insertError } = await supabase
				.from('marks_entry')
				.insert(insertData)

			if (insertError) {
				throw insertError
			}
			results.successful++
		} catch (error: any) {
			results.failed++
			let errorMessage = error.message || 'Database error'
			if (error.code === '23505') {
				errorMessage = 'Duplicate entry for this student and course'
			} else if (error.code === '23503') {
				if (error.message?.includes('student_dummy_number_id')) {
					errorMessage = 'Student dummy number not found in system'
				} else if (error.message?.includes('course_id')) {
					errorMessage = 'Course not found in system'
				} else {
					errorMessage = `Foreign key constraint violation: ${error.detail || error.message}`
				}
			}
			results.errors.push({
				row: rowNumber,
				dummy_number: displayIdentifier,
				course_code: row.subject_code || row.course_code,
				error: errorMessage
			})
		}
	}

	// Determine final status
	let finalStatus = 'Completed'
	if (results.failed === marks_data.length && results.successful === 0) {
		finalStatus = 'Failed'
	} else if (results.failed > 0 || results.skipped > 0) {
		finalStatus = 'Partial'
	}

	// Return result (no batch tracking for multi-institution upload)
	return NextResponse.json({
		status: finalStatus,
		total: marks_data.length,
		successful: results.successful,
		failed: results.failed,
		skipped: results.skipped,
		errors: results.errors,
		validation_errors: results.validation_errors
	})
}

async function handleBulkDelete(supabase: any, body: any) {
	try {
		const { ids } = body

		console.log('=== DEBUG: Bulk Delete ===')
		console.log('IDs to delete:', ids)

		if (!ids || !Array.isArray(ids) || ids.length === 0) {
			return NextResponse.json({ error: 'No IDs provided for deletion' }, { status: 400 })
		}

		// First, fetch the marks entries to check their source and entry_status
		const { data: entriesToCheck, error: fetchError } = await supabase
			.from('marks_entry')
			.select('id, source, entry_status, dummy_number')
			.in('id', ids)

		if (fetchError) {
			console.error('Error fetching entries to check:', fetchError)
			return NextResponse.json({
				error: 'Failed to verify records for deletion',
				details: fetchError
			}, { status: 500 })
		}

		// Filter entries that can be deleted:
		// - Must be from 'Bulk Upload' source (NOT 'Manual Entry')
		// - Must have entry_status = 'Draft'
		const deletableIds: string[] = []
		const nonDeletableEntries: { id: string; dummy_number: string; reason: string }[] = []

		entriesToCheck?.forEach((entry: any) => {
			if (entry.source === 'Manual Entry') {
				nonDeletableEntries.push({
					id: entry.id,
					dummy_number: entry.dummy_number,
					reason: 'Cannot delete Manual Entry records from this page'
				})
			} else if (entry.entry_status !== 'Draft') {
				nonDeletableEntries.push({
					id: entry.id,
					dummy_number: entry.dummy_number,
					reason: `Cannot delete records with status "${entry.entry_status}" (only Draft allowed)`
				})
			} else {
				deletableIds.push(entry.id)
			}
		})

		console.log('Deletable IDs:', deletableIds.length)
		console.log('Non-deletable entries:', nonDeletableEntries.length)

		// If no entries can be deleted, return error
		if (deletableIds.length === 0) {
			return NextResponse.json({
				error: 'None of the selected records can be deleted',
				non_deletable: nonDeletableEntries,
				message: 'Only Bulk Upload records with Draft status can be deleted from this page'
			}, { status: 400 })
		}

		// Delete only the deletable entries
		const { data, error } = await supabase
			.from('marks_entry')
			.delete()
			.in('id', deletableIds)
			.select()

		console.log('Delete result - data:', data, 'error:', error)

		if (error) {
			console.error('Error deleting external marks:', error)
			return NextResponse.json({
				error: `Failed to delete records: ${error.message || error.code || 'Unknown error'}`,
				details: error
			}, { status: 500 })
		}

		// Return result with info about non-deletable entries
		const response: any = {
			success: true,
			deleted: data?.length || 0,
			message: `Successfully deleted ${data?.length || 0} record(s)`
		}

		if (nonDeletableEntries.length > 0) {
			response.skipped = nonDeletableEntries.length
			response.non_deletable = nonDeletableEntries
			response.message = `Deleted ${data?.length || 0} record(s). ${nonDeletableEntries.length} record(s) could not be deleted.`
		}

		return NextResponse.json(response, { status: 200 })
	} catch (err: any) {
		console.error('Unexpected error in handleBulkDelete:', err)
		return NextResponse.json({
			error: `Unexpected error: ${err.message || 'Unknown error'}`
		}, { status: 500 })
	}
}

export async function DELETE(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		// Hard delete
		const { error } = await supabase
			.from('marks_entry')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting external mark:', error)
			return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 })
		}

		return NextResponse.json({ message: 'Record deleted successfully' })
	} catch (error) {
		console.error('External marks bulk DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
