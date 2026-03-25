import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// Server-side cache for batch upload lookup data (avoids 10MB request limit)
// Key: cache_id, Value: { lookupData, timestamp }
const batchUploadCache = new Map<string, {
	institutions_id: string // The institution ID from global filter
	institutionMapping: Record<string, string>
	sessionLookup: Record<string, any>
	registerLookup: Record<string, any>
	existingAttendanceLookup: Record<string, boolean>
	timestamp: number
}>()

// Clean up old cache entries (older than 30 minutes)
function cleanupCache() {
	const now = Date.now()
	const maxAge = 30 * 60 * 1000 // 30 minutes
	for (const [key, value] of batchUploadCache.entries()) {
		if (now - value.timestamp > maxAge) {
			batchUploadCache.delete(key)
		}
	}
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

			case 'attendance': {
				// institutionId is optional - uses institution filter from query params
				const institutionId = searchParams.get('institutionId') || searchParams.get('institutions_id')
				const sessionId = searchParams.get('sessionId')

				console.log('=== DEBUG: Fetching exam attendance ===')
				console.log('Filters:', { institutionId, sessionId })

				// Supabase default limit is 1000 rows - need to paginate to get all records
				const pageSize = 1000
				let allData: any[] = []
				let page = 0
				let hasMore = true

				while (hasMore) {
					let query = supabase
						.from('exam_attendance')
						.select(`
							id,
							institutions_id,
							examination_session_id,
							exam_registration_id,
							student_id,
							program_code,
							course_id,
							attendance_status,
							entry_time,
							verified_by,
							identity_verified,
							remarks,
							attempt_number,
							is_regular,
							exam_timetable_id,
							created_at,
							status,
							institutions (
								id,
								name,
								institution_code
							),
							exam_registrations (
								id,
								student_name,
								stu_register_no
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
						.order('created_at', { ascending: false })
						.range(page * pageSize, (page + 1) * pageSize - 1)

					// Apply institution filter only if provided
					if (institutionId) {
						query = query.eq('institutions_id', institutionId)
					}
					if (sessionId) {
						query = query.eq('examination_session_id', sessionId)
					}

					const { data: pageData, error: pageError } = await query

					if (pageError) {
						console.error('Error fetching attendance page:', page, pageError)
						return NextResponse.json({ error: `Failed to fetch exam attendance: ${pageError.message}` }, { status: 400 })
					}

					if (pageData && pageData.length > 0) {
						allData = allData.concat(pageData)
						page++
						hasMore = pageData.length === pageSize
					} else {
						hasMore = false
					}
				}

				console.log('=== DEBUG: Query result ===')
				console.log('data count:', allData?.length || 0)
				console.log('pages fetched:', page)

				// Transform data for display - include institution info
				const transformedData = allData?.map(att => {
					const directExamReg = att.exam_registrations as any
					const institutionData = att.institutions as any
					const courseData = att.courses as any
					const sessionData = att.examination_sessions as any

					return {
						...att,
						student_name: directExamReg?.student_name || 'Unknown',
						register_number: directExamReg?.stu_register_no || '',
						course_code: courseData?.course_code || '',
						course_name: courseData?.course_name || '',
						session_name: sessionData?.session_name || '',
						session_code: sessionData?.session_code || '',
						institution_code: institutionData?.institution_code || '',
						institution_name: institutionData?.name || ''
					}
				})

				return NextResponse.json(transformedData)
			}

			default:
				return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
		}
	} catch (error) {
		console.error('Exam attendance bulk API error:', error)
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
		} else if (action === 'prepare-batch-upload') {
			return handlePrepareBatchUpload(supabase, body)
		} else if (action === 'process-batch') {
			return handleProcessBatch(supabase, body)
		} else {
			return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
		}
	} catch (error) {
		console.error('Exam attendance bulk POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

async function handleBulkUpload(supabase: any, body: any) {
	const {
		attendance_data,
		uploaded_by
	} = body

	// Validate required fields
	if (!attendance_data || !Array.isArray(attendance_data) || attendance_data.length === 0) {
		return NextResponse.json({
			error: 'Missing required fields: attendance_data array is required'
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

	// Step 2: Get unique institution codes from attendance_data
	const uniqueInstCodes = new Set<string>(
		attendance_data.map((row: any) => String(row.institution_code || '').toUpperCase().trim()).filter(Boolean)
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

	console.log('=== DEBUG: Institution-based Exam Attendance Import ===')
	console.log('uniqueInstCodes:', Array.from(uniqueInstCodes))
	console.log('institutionIdsToFetch:', institutionIdsToFetch)

	// Process attendance
	const results = {
		successful: 0,
		failed: 0,
		skipped: 0,
		errors: [] as any[],
		validation_errors: [] as any[]
	}

	// Fetch examination sessions for all relevant institutions
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

	// Build session map: institution_id|session_code -> session info
	const sessionMap = new Map<string, { id: string; session_code: string; institutions_id: string }>(
		examSessions?.map((s: any) => [`${s.institutions_id}|${s.session_code?.toLowerCase()?.trim()}`, s]) || []
	)

	// Fetch exam registrations with student details for all relevant institutions
	let examRegistrations: any[] = []
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
					is_regular,
					attempt_number,
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
							course_code
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

	console.log('=== DEBUG: Exam Registrations ===')
	console.log('Total exam registrations fetched:', examRegistrations.length)

	// Build registration map: institution_id|register_number|course_code|session_code -> registration info
	const registerMap = new Map<string, {
		exam_registration_id: string
		student_id: string
		student_name: string
		register_number: string
		course_id: string
		course_code: string
		course_offering_id: string
		program_id: string
		program_code: string
		examination_session_id: string
		institutions_id: string
		is_regular: boolean
		attempt_number: number
	}>()

	examRegistrations?.forEach((reg: any) => {
		const registerNo = reg.stu_register_no?.toLowerCase()?.trim()
		const courseCode = reg.course_offerings?.courses?.course_code?.toLowerCase()?.trim()
		const sessionCode = reg.examination_sessions?.session_code?.toLowerCase()?.trim()
		const courseId = reg.course_offerings?.courses?.id
		const examRegId = reg.id
		const instId = reg.institutions_id

		if (registerNo && courseCode && sessionCode && courseId && examRegId && instId) {
			const key = `${instId}|${registerNo}|${courseCode}|${sessionCode}`
			registerMap.set(key, {
				exam_registration_id: examRegId,
				student_id: reg.student_id,
				student_name: reg.student_name,
				register_number: reg.stu_register_no,
				course_id: courseId,
				course_code: reg.course_offerings.courses.course_code,
				course_offering_id: reg.course_offerings.id,
				program_id: reg.course_offerings.program_id,
				program_code: reg.program_code || '',
				examination_session_id: reg.examination_session_id,
				institutions_id: instId,
				is_regular: reg.is_regular ?? true,
				attempt_number: reg.attempt_number ?? 1
			})
		}
	})

	console.log('=== DEBUG: Lookup Map ===')
	console.log('registerMap keys (first 10):', Array.from(registerMap.keys()).slice(0, 10))

	// Fetch existing attendance records to check for duplicates
	let existingAttendance: any[] = []
	const attPageSize = 1000

	for (const instId of institutionIdsToFetch) {
		let attPage = 0
		let attHasMore = true

		while (attHasMore) {
			const { data: attData, error: attError } = await supabase
				.from('exam_attendance')
				.select('id, institutions_id, exam_registration_id')
				.eq('institutions_id', instId)
				.range(attPage * attPageSize, (attPage + 1) * attPageSize - 1)

			if (attError) {
				console.error('Error fetching existing attendance page:', attPage, 'for institution:', instId, attError)
				break
			}

			if (attData && attData.length > 0) {
				existingAttendance = existingAttendance.concat(attData)
				attPage++
				attHasMore = attData.length === attPageSize
			} else {
				attHasMore = false
			}
		}
	}

	// Build existing attendance map: institutions_id|exam_registration_id -> attendance record
	const existingAttendanceMap = new Map<string, any>(
		existingAttendance?.map((a: any) => [`${a.institutions_id}|${a.exam_registration_id}`, a]) || []
	)

	console.log('=== DEBUG: Existing Attendance ===')
	console.log('Total existing attendance records:', existingAttendance.length)

	// Process each row
	for (let i = 0; i < attendance_data.length; i++) {
		const row = attendance_data[i]
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
				register_number: row.register_number || 'N/A',
				course_code: row.course_code || 'N/A',
				errors: rowErrors
			})
			continue
		}

		// Lookup registration by: institution_id + register_number + course_code + session_code
		const registerNo = String(row.register_number || '').toLowerCase().trim()
		const courseCode = String(row.course_code || '').toLowerCase().trim()
		const sessionCode = String(row.session_code || '').toLowerCase().trim()
		const lookupKey = `${rowInstId}|${registerNo}|${courseCode}|${sessionCode}`
		const displayIdentifier = row.register_number || 'N/A'

		const regInfo = registerMap.get(lookupKey)

		if (i < 3) {
			console.log(`=== DEBUG: Row ${i + 1} Lookup ===`)
			console.log('Looking for:', { rowInstId, registerNo, courseCode, sessionCode, lookupKey })
			console.log('Found:', regInfo ? 'YES' : 'NO')
		}

		if (!regInfo) {
			// Check specific issues for better error messages
			const sessionKey = `${rowInstId}|${sessionCode}`
			if (!sessionMap.has(sessionKey)) {
				rowErrors.push(`Session with code "${row.session_code}" not found for institution "${row.institution_code}"`)
			} else {
				rowErrors.push(`No exam registration found for register number "${row.register_number}" in course "${row.course_code}" for session "${row.session_code}"`)
			}
			results.failed++
			results.validation_errors.push({
				row: rowNumber,
				register_number: displayIdentifier,
				course_code: row.course_code || 'N/A',
				errors: rowErrors
			})
			continue
		}

		// Check for duplicate - unique constraint: (institutions_id, exam_registration_id)
		const existingKey = `${regInfo.institutions_id}|${regInfo.exam_registration_id}`
		if (existingAttendanceMap.has(existingKey)) {
			results.skipped++
			results.validation_errors.push({
				row: rowNumber,
				register_number: displayIdentifier,
				course_code: row.course_code || 'N/A',
				errors: ['Attendance already exists for this registration. Skipped to prevent duplicate.']
			})
			continue
		}

		// Parse attendance status
		const attendanceStatusRaw = String(row.attendance_status || 'Present').trim()
		let attendanceStatus = 'Present'
		if (['absent', 'ab', 'a', 'no', 'n', '0', 'false'].includes(attendanceStatusRaw.toLowerCase())) {
			attendanceStatus = 'Absent'
		}

		// Parse entry time (optional)
		let entryTime: string | null = null
		if (row.entry_time) {
			const timeStr = String(row.entry_time).trim()
			// Accept formats: HH:MM, HH:MM:SS, or Excel decimal time
			if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr)) {
				entryTime = timeStr
			} else if (!isNaN(parseFloat(timeStr))) {
				// Excel stores time as decimal (0.5 = 12:00)
				const totalSeconds = Math.round(parseFloat(timeStr) * 24 * 60 * 60)
				const hours = Math.floor(totalSeconds / 3600)
				const minutes = Math.floor((totalSeconds % 3600) / 60)
				const seconds = totalSeconds % 60
				entryTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
			}
		}

		// Parse identity verified (optional)
		const identityVerifiedRaw = String(row.identity_verified || '').toUpperCase().trim()
		const identityVerified = ['TRUE', 'YES', '1', 'Y'].includes(identityVerifiedRaw)

		// Parse remarks (optional)
		const remarks = String(row.remarks || '').trim() || null

		if (rowErrors.length > 0) {
			results.failed++
			results.validation_errors.push({
				row: rowNumber,
				register_number: displayIdentifier,
				course_code: row.course_code || 'N/A',
				errors: rowErrors
			})
			continue
		}

		try {
			// Insert attendance record
			const insertData: any = {
				institutions_id: regInfo.institutions_id,
				exam_registration_id: regInfo.exam_registration_id,
				student_id: regInfo.student_id,
				examination_session_id: regInfo.examination_session_id,
				course_id: regInfo.course_id,
				program_id: regInfo.program_id,
				program_code: regInfo.program_code,
				attendance_status: attendanceStatus,
				entry_time: entryTime,
				identity_verified: identityVerified,
				remarks: remarks,
				is_regular: regInfo.is_regular,
				attempt_number: regInfo.attempt_number,
				status: true,
				created_by: uploaded_by
			}

			const { error: insertError } = await supabase
				.from('exam_attendance')
				.insert(insertData)

			if (insertError) {
				throw insertError
			}

			// Add to existing map to prevent duplicates in same batch
			existingAttendanceMap.set(existingKey, { id: 'new', ...insertData })

			results.successful++
		} catch (error: any) {
			results.failed++
			let errorMessage = error.message || 'Database error'
			if (error.code === '23505') {
				errorMessage = 'Duplicate entry - attendance already exists for this registration'
				results.failed--
				results.skipped++
			} else if (error.code === '23503') {
				if (error.message?.includes('exam_registration_id')) {
					errorMessage = 'Exam registration not found in system'
				} else if (error.message?.includes('course_id')) {
					errorMessage = 'Course not found in system'
				} else {
					errorMessage = `Foreign key constraint violation: ${error.detail || error.message}`
				}
			}
			results.errors.push({
				row: rowNumber,
				register_number: displayIdentifier,
				course_code: row.course_code || 'N/A',
				error: errorMessage
			})
		}
	}

	// Determine final status
	let finalStatus = 'Completed'
	if (results.failed === attendance_data.length && results.successful === 0) {
		finalStatus = 'Failed'
	} else if (results.failed > 0 || results.skipped > 0) {
		finalStatus = 'Partial'
	}

	return NextResponse.json({
		status: finalStatus,
		total: attendance_data.length,
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

		// Delete the entries
		const { data, error } = await supabase
			.from('exam_attendance')
			.delete()
			.in('id', ids)
			.select()

		console.log('Delete result - data:', data, 'error:', error)

		if (error) {
			console.error('Error deleting exam attendance:', error)
			return NextResponse.json({
				error: `Failed to delete records: ${error.message || error.code || 'Unknown error'}`,
				details: error
			}, { status: 500 })
		}

		return NextResponse.json({
			success: true,
			deleted: data?.length || 0,
			message: `Successfully deleted ${data?.length || 0} record(s)`
		}, { status: 200 })
	} catch (err: any) {
		console.error('Unexpected error in handleBulkDelete:', err)
		return NextResponse.json({
			error: `Unexpected error: ${err.message || 'Unknown error'}`
		}, { status: 500 })
	}
}

// Prepare batch upload - fetches lookup data once and caches it server-side
async function handlePrepareBatchUpload(supabase: any, body: any) {
	const { institutions_id } = body

	if (!institutions_id) {
		return NextResponse.json({
			error: 'Missing required field: institutions_id is required. Please select an institution.'
		}, { status: 400 })
	}

	// Validate institution exists
	const { data: institution, error: instError } = await supabase
		.from('institutions')
		.select('id, institution_code')
		.eq('id', institutions_id)
		.eq('is_active', true)
		.single()

	if (instError || !institution) {
		return NextResponse.json({
			error: 'Invalid or inactive institution selected.'
		}, { status: 400 })
	}

	// Build institution mapping (single institution)
	const institutionCodeToId = new Map<string, string>([
		[institution.institution_code?.toUpperCase(), institution.id]
	])

	// Use the selected institution for data fetch
	const institutionIdsToFetch: string[] = [institutions_id]

	// Fetch examination sessions for all relevant institutions
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

	// Build session map
	const sessionLookup: Record<string, { id: string; session_code: string; institutions_id: string }> = {}
	examSessions?.forEach((s: any) => {
		const key = `${s.institutions_id}|${s.session_code?.toLowerCase()?.trim()}`
		sessionLookup[key] = s
	})

	// Fetch exam registrations with student details
	let examRegistrations: any[] = []
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
					is_regular,
					attempt_number,
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
							course_code
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

	// Build registration lookup
	const registerLookup: Record<string, {
		exam_registration_id: string
		student_id: string
		student_name: string
		register_number: string
		course_id: string
		course_code: string
		course_offering_id: string
		program_id: string
		program_code: string
		examination_session_id: string
		institutions_id: string
		is_regular: boolean
		attempt_number: number
	}> = {}

	examRegistrations?.forEach((reg: any) => {
		const registerNo = reg.stu_register_no?.toLowerCase()?.trim()
		const courseCode = reg.course_offerings?.courses?.course_code?.toLowerCase()?.trim()
		const sessionCode = reg.examination_sessions?.session_code?.toLowerCase()?.trim()
		const courseId = reg.course_offerings?.courses?.id
		const examRegId = reg.id
		const instId = reg.institutions_id

		if (registerNo && courseCode && sessionCode && courseId && examRegId && instId) {
			const key = `${instId}|${registerNo}|${courseCode}|${sessionCode}`
			registerLookup[key] = {
				exam_registration_id: examRegId,
				student_id: reg.student_id,
				student_name: reg.student_name,
				register_number: reg.stu_register_no,
				course_id: courseId,
				course_code: reg.course_offerings.courses.course_code,
				course_offering_id: reg.course_offerings.id,
				program_id: reg.course_offerings.program_id,
				program_code: reg.program_code || '',
				examination_session_id: reg.examination_session_id,
				institutions_id: instId,
				is_regular: reg.is_regular ?? true,
				attempt_number: reg.attempt_number ?? 1
			}
		}
	})

	// Fetch existing attendance records
	let existingAttendance: any[] = []
	const attPageSize = 1000

	for (const instId of institutionIdsToFetch) {
		let attPage = 0
		let attHasMore = true

		while (attHasMore) {
			const { data: attData, error: attError } = await supabase
				.from('exam_attendance')
				.select('id, institutions_id, exam_registration_id')
				.eq('institutions_id', instId)
				.range(attPage * attPageSize, (attPage + 1) * attPageSize - 1)

			if (attError) {
				console.error('Error fetching existing attendance page:', attPage, 'for institution:', instId, attError)
				break
			}

			if (attData && attData.length > 0) {
				existingAttendance = existingAttendance.concat(attData)
				attPage++
				attHasMore = attData.length === attPageSize
			} else {
				attHasMore = false
			}
		}
	}

	// Build existing attendance lookup
	const existingAttendanceLookup: Record<string, boolean> = {}
	existingAttendance?.forEach((a: any) => {
		existingAttendanceLookup[`${a.institutions_id}|${a.exam_registration_id}`] = true
	})

	// Convert institutionCodeToId map to object for JSON
	const institutionMapping: Record<string, string> = {}
	institutionCodeToId.forEach((id, code) => {
		institutionMapping[code] = id
	})

	// Generate a unique cache ID and store lookup data server-side
	// This avoids sending large lookup data back and forth (which can exceed 10MB limit)
	const cacheId = `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`

	// Clean up old cache entries
	cleanupCache()

	// Store in server-side cache
	batchUploadCache.set(cacheId, {
		institutions_id: institutions_id, // Store institution ID from global filter
		institutionMapping,
		sessionLookup,
		registerLookup,
		existingAttendanceLookup,
		timestamp: Date.now()
	})

	console.log('=== DEBUG: Batch Upload Prepared ===')
	console.log('Cache ID:', cacheId)
	console.log('Register lookup entries:', Object.keys(registerLookup).length)
	console.log('Existing attendance entries:', Object.keys(existingAttendanceLookup).length)

	return NextResponse.json({
		success: true,
		cache_id: cacheId, // Only send cache ID, not the actual data
		stats: {
			institutions: institutionIdsToFetch.length,
			sessions: examSessions.length,
			registrations: examRegistrations.length,
			existingAttendance: existingAttendance.length
		}
	})
}

// Process a single batch of attendance records
async function handleProcessBatch(supabase: any, body: any) {
	const {
		batch_data,
		uploaded_by,
		cache_id,
		batch_start_index
	} = body

	if (!batch_data || !Array.isArray(batch_data) || batch_data.length === 0) {
		return NextResponse.json({
			error: 'Missing required fields: batch_data array is required'
		}, { status: 400 })
	}

	if (!cache_id) {
		return NextResponse.json({
			error: 'Missing required field: cache_id is required'
		}, { status: 400 })
	}

	// Retrieve lookup data from server-side cache
	const cachedData = batchUploadCache.get(cache_id)
	if (!cachedData) {
		return NextResponse.json({
			error: 'Cache expired or invalid. Please restart the upload process.'
		}, { status: 400 })
	}

	// Use institutions_id from cache (from global filter) instead of Excel row
	const { institutions_id, sessionLookup, registerLookup, existingAttendanceLookup } = cachedData

	const results = {
		successful: 0,
		failed: 0,
		skipped: 0,
		errors: [] as any[],
		validation_errors: [] as any[],
		newExistingKeys: [] as string[] // Track newly added for duplicate prevention in subsequent batches
	}

	// Process each row in the batch
	for (let i = 0; i < batch_data.length; i++) {
		const row = batch_data[i]
		const rowNumber = (batch_start_index || 0) + i + 2 // +2 for Excel header row
		const rowErrors: string[] = []

		// Use institution from global filter (stored in cache)
		const rowInstId = institutions_id

		// Lookup registration using institution from global filter
		const registerNo = String(row.register_number || '').toLowerCase().trim()
		const courseCode = String(row.course_code || '').toLowerCase().trim()
		const sessionCode = String(row.session_code || '').toLowerCase().trim()
		const lookupKey = `${rowInstId}|${registerNo}|${courseCode}|${sessionCode}`
		const displayIdentifier = row.register_number || 'N/A'

		const regInfo = registerLookup[lookupKey]

		if (!regInfo) {
			const sessionKey = `${rowInstId}|${sessionCode}`
			if (!sessionLookup[sessionKey]) {
				rowErrors.push(`Session with code "${row.session_code}" not found for the selected institution`)
			} else {
				rowErrors.push(`No exam registration found for register number "${row.register_number}" in course "${row.course_code}" for session "${row.session_code}"`)
			}
			results.failed++
			results.validation_errors.push({
				row: rowNumber,
				register_number: displayIdentifier,
				course_code: row.course_code || 'N/A',
				errors: rowErrors,
				original_data: row
			})
			continue
		}

		// Check for duplicate
		const existingKey = `${regInfo.institutions_id}|${regInfo.exam_registration_id}`
		if (existingAttendanceLookup[existingKey]) {
			results.skipped++
			results.validation_errors.push({
				row: rowNumber,
				register_number: displayIdentifier,
				course_code: row.course_code || 'N/A',
				errors: ['Attendance already exists for this registration. Skipped to prevent duplicate.'],
				original_data: row
			})
			continue
		}

		// Parse attendance status
		const attendanceStatusRaw = String(row.attendance_status || 'Present').trim()
		let attendanceStatus = 'Present'
		if (['absent', 'ab', 'a', 'no', 'n', '0', 'false'].includes(attendanceStatusRaw.toLowerCase())) {
			attendanceStatus = 'Absent'
		}

		// Parse entry time
		let entryTime: string | null = null
		if (row.entry_time) {
			const timeStr = String(row.entry_time).trim()
			if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr)) {
				entryTime = timeStr
			} else if (!isNaN(parseFloat(timeStr))) {
				const totalSeconds = Math.round(parseFloat(timeStr) * 24 * 60 * 60)
				const hours = Math.floor(totalSeconds / 3600)
				const minutes = Math.floor((totalSeconds % 3600) / 60)
				const seconds = totalSeconds % 60
				entryTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
			}
		}

		// Parse identity verified
		const identityVerifiedRaw = String(row.identity_verified || '').toUpperCase().trim()
		const identityVerified = ['TRUE', 'YES', '1', 'Y'].includes(identityVerifiedRaw)

		// Parse remarks
		const remarks = String(row.remarks || '').trim() || null

		try {
			// Insert attendance record
			const insertData: any = {
				institutions_id: regInfo.institutions_id,
				exam_registration_id: regInfo.exam_registration_id,
				student_id: regInfo.student_id,
				examination_session_id: regInfo.examination_session_id,
				course_id: regInfo.course_id,
				program_id: regInfo.program_id,
				program_code: regInfo.program_code,
				attendance_status: attendanceStatus,
				entry_time: entryTime,
				identity_verified: identityVerified,
				remarks: remarks,
				is_regular: regInfo.is_regular,
				attempt_number: regInfo.attempt_number,
				status: true,
				created_by: uploaded_by
			}

			const { error: insertError } = await supabase
				.from('exam_attendance')
				.insert(insertData)

			if (insertError) {
				throw insertError
			}

			// Track for duplicate prevention - update cache directly
			existingAttendanceLookup[existingKey] = true
			results.newExistingKeys.push(existingKey)
			results.successful++
		} catch (error: any) {
			results.failed++
			let errorMessage = error.message || 'Database error'
			if (error.code === '23505') {
				errorMessage = 'Duplicate entry - attendance already exists for this registration'
				results.failed--
				results.skipped++
			} else if (error.code === '23503') {
				if (error.message?.includes('exam_registration_id')) {
					errorMessage = 'Exam registration not found in system'
				} else if (error.message?.includes('course_id')) {
					errorMessage = 'Course not found in system'
				} else {
					errorMessage = `Foreign key constraint violation: ${error.detail || error.message}`
				}
			}
			results.errors.push({
				row: rowNumber,
				register_number: displayIdentifier,
				course_code: row.course_code || 'N/A',
				errors: [errorMessage],
				original_data: row
			})
		}
	}

	return NextResponse.json({
		successful: results.successful,
		failed: results.failed,
		skipped: results.skipped,
		errors: results.errors,
		validation_errors: results.validation_errors,
		newExistingKeys: results.newExistingKeys
	})
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
			.from('exam_attendance')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting exam attendance:', error)
			return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 })
		}

		return NextResponse.json({ message: 'Record deleted successfully' })
	} catch (error) {
		console.error('Exam attendance bulk DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
