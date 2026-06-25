/**
 * Hall Ticket Generation API Route
 *
 * GET  /api/pre-exam/hall-tickets?institution_code=XXX&examination_session_id=YYY&program_id=ZZZ&semester_ids=1,2
 *
 * Fetches hall ticket data for students:
 * - Uses exam_registrations as the primary source (stu_register_no, student_name from MyJKKN imports)
 * - Joins with exam_timetables, course_offerings, course_mapping
 * - Returns data structured for PDF generation
 * - Groups subjects by student (keyed by stu_register_no)
 */

import { NextResponse, NextRequest } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	HallTicketData,
	HallTicketStudent,
	HallTicketSubject,
	HallTicketApiResponse
} from '@/types/hall-ticket'

export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Required parameters
		const institution_code = searchParams.get('institution_code')
		const examination_session_id = searchParams.get('examination_session_id')

		// Required filters
		const program_code = searchParams.get('program_code') // Program code like "BCA", "MCA"

		// Optional filters
		const program_name = searchParams.get('program_name') // Passed from page dropdown (fallback for MyJKKN API)
		const semester_ids = searchParams.get('semester_ids') // comma-separated
		const student_ids = searchParams.get('student_ids') // comma-separated
		// Supplementary sessions: show all registered learners (no semester level)
		// and include them regardless of fee_paid (often unpaid at hall-ticket time).
		const supplementary = searchParams.get('supplementary') === 'true'

		// Validate required parameters
		if (!institution_code) {
			return NextResponse.json({
				success: false,
				error: 'Institution code is required'
			} as HallTicketApiResponse, { status: 400 })
		}

		if (!examination_session_id) {
			return NextResponse.json({
				success: false,
				error: 'Examination session ID is required'
			} as HallTicketApiResponse, { status: 400 })
		}

		if (!program_code) {
			return NextResponse.json({
				success: false,
				error: 'Program code is required'
			} as HallTicketApiResponse, { status: 400 })
		}

		// Get institution details - try case-insensitive match first
		let institution = null
		let instError = null

		console.log('[HallTickets] Looking up institution with code:', institution_code)

		// First try exact match - use * to get all available fields
		const { data: exactMatch, error: exactError } = await supabase
			.from('institutions')
			.select('*')
			.eq('institution_code', institution_code)
			.single()

		console.log('[HallTickets] Exact match result:', { found: !!exactMatch, error: exactError?.message, code: exactError?.code })

		if (exactMatch) {
			institution = exactMatch
		} else {
			// Try case-insensitive match using ilike
			const { data: ilikeMatch, error: ilikeError } = await supabase
				.from('institutions')
				.select('*')
				.ilike('institution_code', institution_code)
				.limit(1)
				.single()

			if (ilikeMatch) {
				institution = ilikeMatch
				console.log(`[HallTickets] Found institution with case-insensitive match: "${ilikeMatch.institution_code}" for input "${institution_code}"`)
			} else {
				instError = ilikeError || exactError
			}
		}

		if (!institution) {
			console.error('Institution lookup error:', {
				institution_code,
				error: instError?.message,
				code: instError?.code
			})
			return NextResponse.json({
				success: false,
				error: `Institution with code "${institution_code}" not found`
			} as HallTicketApiResponse, { status: 404 })
		}

		// Get examination session details (with exam type name for the PDF heading)
		const { data: examSession, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('id, session_code, session_name, exam_type_id, exam_types(examination_name)')
			.eq('id', examination_session_id)
			.single()

		if (sessionError || !examSession) {
			console.error('Examination session lookup error:', {
				examination_session_id,
				error: sessionError?.message,
				code: sessionError?.code
			})
			return NextResponse.json({
				success: false,
				error: `Examination session not found (ID: ${examination_session_id})`
			} as HallTicketApiResponse, { status: 404 })
		}

		// Get PDF settings for institution (if available)
		const { data: pdfSettings } = await supabase
			.from('pdf_institution_settings')
			.select('*')
			.eq('institution_code', institution_code)
			.eq('active', true)
			.order('wef_date', { ascending: false })
			.limit(1)
			.single()

		// Build query for exam registrations with all related data
		// Note: Student data (stu_register_no, student_name) is stored directly in exam_registrations
		// from MyJKKN imports, so we don't join to the students table
		// Note: programs table doesn't exist locally - programs are from MyJKKN API
		// Note: exam_timetables FK goes FROM exam_timetables TO course_offerings,
		//       so we fetch timetables separately instead of embedding in course_offerings
		// Schema relationship:
		// exam_registrations → course_offerings (via course_offering_id)
		// course_offerings.course_id → course_mapping.id (FK to course_mapping, NOT courses)
		// course_mapping.course_id → courses.id
		// course_mapping has course_order for sorting
		// Actual schema relationships:
		// course_offerings.course_id → courses.id (direct FK via course_offerings_course_id_fkey1)
		// course_offerings.course_mapping_id → course_mapping.id (for course_order)
		// course_mapping.course_id → courses.id
		let registrationsQuery = supabase
			.from('exam_registrations')
			.select(`
				id,
				student_id,
				course_offering_id,
				stu_register_no,
				student_name,
				registration_status,
				program_code,
				is_regular,
				course_offerings(
					id,
					course_id,
					course_mapping_id,
					program_code,
					semester,
					courses(id, course_code, course_name, has_hall_ticket),
					course_mapping(id, course_order)
				)
			`)
			.eq('examination_session_id', examination_session_id)
			.eq('institutions_id', institution.id)
			.eq('registration_status', 'Approved')

		// ESE requires fee payment; supplementary includes regardless of fee_paid
		if (!supplementary) {
			registrationsQuery = registrationsQuery.eq('fee_paid', true)
		}

		// Apply mandatory program filter
		registrationsQuery = registrationsQuery.eq('program_code', program_code)

		// Paginate to fetch ALL registrations — PostgREST max-rows cap overrides range()
		// so we must page through 1000 at a time to guarantee completeness
		const allRegistrations: any[] = []
		const PAGE_SIZE = 1000
		let page = 0
		let regError: any = null

		while (true) {
			const { data: pageData, error: pageError } = await registrationsQuery.range(
				page * PAGE_SIZE,
				(page + 1) * PAGE_SIZE - 1
			)
			if (pageError) { regError = pageError; break }
			if (!pageData || pageData.length === 0) break
			allRegistrations.push(...pageData)
			if (pageData.length < PAGE_SIZE) break // last page
			page++
		}

		const registrations = allRegistrations
		console.log(`[HallTickets] Total registrations fetched (${page + 1} pages): ${registrations.length}`)

		if (regError) {
			console.error('Error fetching registrations:', regError)
			return NextResponse.json({
				success: false,
				error: 'Failed to fetch exam registrations'
			} as HallTicketApiResponse, { status: 500 })
		}

		// Collect all course_codes to fetch timetables by course_code
		// exam_timetables.course_id -> courses.id, so we need to match by course_code
		const courseCodes = new Set<string>()
		for (const reg of registrations || []) {
			const courseOffering = reg.course_offerings as any
			const courseCode = courseOffering?.courses?.course_code
			if (courseCode) {
				courseCodes.add(courseCode)
			}
		}

		// Fetch exam timetables by course_code (via courses join) for this exam session
		// exam_timetables has course_id -> courses.id, so we join to get course_code
		let timetablesByCourseCode = new Map<string, any>()
		// Also collect all timetable IDs → timetable data for batch override lookups
		const timetableByIdMap = new Map<string, { exam_date: string; session: string; exam_time: string }>()
		if (courseCodes.size > 0) {
			const { data: timetables, error: ttError } = await supabase
				.from('exam_timetables')
				.select(`
					id,
					course_id,
					exam_date,
					session,
					exam_time,
					duration_minutes,
					is_published,
					courses(id, course_code)
				`)
				.eq('examination_session_id', examination_session_id)
				.range(0, 9999)

			if (ttError) {
				console.error('Error fetching exam timetables:', ttError)
				// Continue without timetables - they will show "To Be Announced"
			} else {
				// Map timetables by course_code for quick lookup
				for (const tt of timetables || []) {
					const courseCode = (tt.courses as any)?.course_code
					if (courseCode && courseCodes.has(courseCode)) {
						timetablesByCourseCode.set(courseCode, tt)
					}
					// Store every timetable by ID for batch override resolution
					timetableByIdMap.set(tt.id, {
						exam_date: tt.exam_date || 'To Be Announced',
						session: tt.session || '',
						exam_time: tt.exam_time || ''
					})
				}
			}
		}

		// ====================================================================
		// Fetch practical_batch_students to override dates for practical/project exams
		// When students are assigned to batches, they may have different dates/sessions
		// than the default timetable row for that course.
		// Strategy: use timetable IDs we already fetched (small set, ~100 IDs)
		// to query practical_batch_students. Then resolve each student's
		// batch timetable from the timetableByIdMap we built above.
		// ====================================================================
		const practicalBatchMap = new Map<string, { exam_date: string; session: string; exam_time: string }>()

		if (timetableByIdMap.size > 0) {
			const allTimetableIds = Array.from(timetableByIdMap.keys())

			// Fetch in chunks of 200 timetable IDs (much fewer than registration IDs)
			const TT_CHUNK = 200
			for (let i = 0; i < allTimetableIds.length; i += TT_CHUNK) {
				const ttChunk = allTimetableIds.slice(i, i + TT_CHUNK)
				const { data: batchStudents, error: batchError } = await supabase
					.from('practical_batch_students')
					.select('exam_registration_id, exam_timetable_id')
					.in('exam_timetable_id', ttChunk)
					.range(0, 9999)

				if (batchError) {
					console.warn('[HallTickets] Error fetching practical_batch_students chunk:', batchError.message)
				} else if (batchStudents) {
					for (const bs of batchStudents) {
						if (bs.exam_registration_id && bs.exam_timetable_id) {
							const tt = timetableByIdMap.get(bs.exam_timetable_id)
							if (tt) {
								practicalBatchMap.set(bs.exam_registration_id, tt)
							}
						}
					}
				}
			}
			console.log(`[HallTickets] Found ${practicalBatchMap.size} practical batch overrides`)
		}

		// Parse semester numbers if provided (expecting numbers like 1, 2, 3)
		const semesterNumbersList = semester_ids ? semester_ids.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)) : []
		const studentIdsList = student_ids ? student_ids.split(',').map(s => s.trim()) : []

		// ====================================================================
		// Fetch program name from MyJKKN API (to show "Code - Name" format)
		// ====================================================================
		const programNameMap = new Map<string, string>()
		const myjkknIds: string[] = institution.myjkkn_institution_ids || []

		if (myjkknIds.length > 0) {
			try {
				const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
				const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

				if (myjkknApiKey) {
					for (const myjkknInstId of myjkknIds) {
						const progParams = new URLSearchParams({
							institution_id: myjkknInstId,
							limit: '100',
							is_active: 'true'
						})
						const progRes = await fetch(
							`${myjkknApiUrl}/api-management/programs?${progParams.toString()}`,
							{
								method: 'GET',
								headers: {
									'Authorization': `Bearer ${myjkknApiKey}`,
									'Accept': 'application/json',
								},
								cache: 'no-store',
							}
						)
						if (progRes.ok) {
							const progData = await progRes.json()
							const programs = progData.data || []
							for (const p of programs) {
								const code = p.program_id || p.program_code
								if (code && !programNameMap.has(code)) {
									programNameMap.set(code, p.program_name || p.name || code)
								}
							}
						}
					}
				}
			} catch (progError) {
				console.warn('[HallTickets] Failed to fetch program names from MyJKKN:', progError)
			}
		}
		// Fallback: use program_name passed from the page dropdown
		if (program_code && !programNameMap.has(program_code) && program_name) {
			programNameMap.set(program_code, program_name)
		}
		console.log(`[HallTickets] Program name map:`, Object.fromEntries(programNameMap))

		// Group registrations by student (using stu_register_no as the key since student data is in exam_registrations)
		// ARREAR SUPPORT: Semester filter identifies WHICH students to include,
		// but ALL their registered papers are shown (including arrears from other semesters)
		const studentMap = new Map<string, {
			stu_register_no: string,
			student_name: string,
			subjects: HallTicketSubject[],
			programCode: string,
			programName: string
		}>()

		// First pass: identify students who have REGULAR (non-arrear) registrations in selected semesters
		// A student with only arrear papers in the selected semester is excluded.
		const studentsInSelectedSemesters = new Set<string>()
		if (semesterNumbersList.length > 0) {
			for (const reg of registrations || []) {
				if (!reg.stu_register_no || !reg.course_offerings) continue
				const courseOffering = reg.course_offerings as any
				const semesterNumber = courseOffering.semester
				// Only qualify via regular papers (is_regular = true); arrear-only students are excluded
				if (semesterNumber && semesterNumbersList.includes(semesterNumber) && reg.is_regular !== false) {
					studentsInSelectedSemesters.add(reg.stu_register_no)
				}
			}
		}

		// Second pass: build student data with ALL subjects for matched students
		for (const reg of registrations || []) {
			if (!reg.stu_register_no || !reg.course_offerings) continue

			// Semester filter: include only students who have at least one registration
			// in selected semesters, but include ALL their subjects (including arrears)
			if (semesterNumbersList.length > 0 && !studentsInSelectedSemesters.has(reg.stu_register_no)) {
				continue
			}

			// Filter by student IDs if specified (using stu_register_no)
			if (studentIdsList.length > 0 && !studentIdsList.includes(reg.stu_register_no)) {
				continue
			}

			const courseOffering = reg.course_offerings as any
			const studentKey = reg.stu_register_no
			const pCode = reg.program_code || 'N/A'

			if (!studentMap.has(studentKey)) {
				// Format program as "Code - Name" using MyJKKN program name
				const pName = programNameMap.get(pCode) || ''
				studentMap.set(studentKey, {
					stu_register_no: reg.stu_register_no,
					student_name: reg.student_name || '',
					subjects: [],
					programCode: pCode,
					programName: pName ? `${pCode} - ${pName}` : pCode
				})
			}

			// Direct access: course_offerings.courses (via course_id FK)
			// course_order from: course_offerings.course_mapping (via course_mapping_id FK)
			const course = courseOffering.courses
			const courseMapping = courseOffering.course_mapping
			const courseCode = course?.course_code

			// Skip courses where has_hall_ticket is explicitly false
			if (course?.has_hall_ticket === false) continue

			// Get exam timetable by course_code (matches exam date correctly)
			const timetable = courseCode ? timetablesByCourseCode.get(courseCode) : null

			// Check if this registration has a practical batch override
			// (student assigned to a specific batch with different date/session)
			const batchOverride = practicalBatchMap.get(reg.id)

			// Create subject entry with course_order for sorting
			// For practical/project exams: use batch-specific date/session if available
			const subject: HallTicketSubject = {
				serial_number: 0, // Will be assigned later
				subject_code: courseCode || 'N/A',
				subject_name: course?.course_name || 'To Be Announced',
				exam_date: batchOverride?.exam_date || timetable?.exam_date || 'To Be Announced',
				exam_time: batchOverride?.session || timetable?.session || '',
				semester: `Semester ${courseOffering.semester || 1}`,
				course_order: courseMapping?.course_order || 999 // course_order is in course_mapping
			}

			studentMap.get(studentKey)!.subjects.push(subject)
		}

		// ====================================================================
		// Fetch DOB and photos from MyJKKN API directly (like semester marksheet)
		// ====================================================================
		const registerNumbers = Array.from(studentMap.keys())
		const learnerProfileMap = new Map<string, { date_of_birth: string | null; student_photo_url: string | null }>()

		if (registerNumbers.length > 0 && myjkknIds.length > 0) {
			console.log(`[HallTickets] Fetching learner profiles from MyJKKN API for ${registerNumbers.length} students...`)

			try {
				const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
				const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

				if (myjkknApiKey) {
					const registerNumberSet = new Set(registerNumbers)
					let allFound = false

					for (const myjkknInstId of myjkknIds) {
						if (allFound) break

						let page = 1
						const pageSize = 200
						let hasMorePages = true

						while (hasMorePages) {
							const profileParams = new URLSearchParams()
							profileParams.set('institution_id', myjkknInstId)
							profileParams.set('limit', String(pageSize))
							profileParams.set('page', String(page))

							console.log(`[HallTickets] Querying MyJKKN API institution_id: ${myjkknInstId}, page: ${page}`)

							const profileResponse = await fetch(
								`${myjkknApiUrl}/api-management/learners/profiles?${profileParams.toString()}`,
								{
									method: 'GET',
									headers: {
										'Authorization': `Bearer ${myjkknApiKey}`,
										'Accept': 'application/json',
										'Content-Type': 'application/json',
									},
									cache: 'no-store',
								}
							)

							if (profileResponse.ok) {
								const profileData = await profileResponse.json()
								const profiles = profileData.data || []
								console.log(`[HallTickets] MyJKKN institution ${myjkknInstId} page ${page} returned ${profiles.length} profiles`)

								for (const lp of profiles) {
									const regNo = lp.register_number
									if (regNo && registerNumberSet.has(regNo) && !learnerProfileMap.has(regNo.toUpperCase())) {
										const photoUrl = lp.student_photo_url || lp.photo_url || lp.profile_photo || lp.image_url || null
										let dobFormatted: string | null = null

										if (lp.date_of_birth) {
											try {
												const dob = new Date(lp.date_of_birth)
												if (!isNaN(dob.getTime())) {
													dobFormatted = `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${dob.getFullYear()}`
												}
											} catch {
												dobFormatted = lp.date_of_birth
											}
										}

										const myjkknFullName = lp.student_name || lp.full_name || ''
										const constructedName = myjkknFullName ||
											[lp.first_name, lp.last_name].filter(Boolean).join(' ')
										learnerProfileMap.set(regNo.toUpperCase(), {
											date_of_birth: dobFormatted,
											student_photo_url: photoUrl,
											student_name: constructedName || null
										})
									}
								}

								// Early exit: stop paging once all needed profiles are found
								if (learnerProfileMap.size >= registerNumbers.length) {
									console.log(`[HallTickets] All ${registerNumbers.length} profiles found — skipping remaining pages`)
									allFound = true
									break
								}

								hasMorePages = profiles.length === pageSize
								page++
							} else {
								hasMorePages = false
							}
						}
					}
				} else {
					console.log('[HallTickets] No MyJKKN API key configured')
				}
			} catch (myjkknError) {
				console.warn('[HallTickets] MyJKKN API error (non-critical):', myjkknError)
			}

			console.log(`[HallTickets] Final: ${learnerProfileMap.size} profiles mapped from MyJKKN for ${registerNumbers.length} students`)
		}

		// Convert map to array and sort
		const students: HallTicketStudent[] = []

		for (const [, value] of studentMap) {
			const { stu_register_no, student_name, subjects, programName } = value
			// Lookup using uppercase key for consistent matching
			const learnerProfile = learnerProfileMap.get(stu_register_no.toUpperCase())

			if (learnerProfile) {
				console.log(`[HallTickets] Profile found for ${stu_register_no}: DOB=${learnerProfile.date_of_birth}, Photo=${learnerProfile.student_photo_url ? 'YES' : 'NO'}`)
			} else {
				console.log(`[HallTickets] No profile in map for ${stu_register_no}`)
			}

			// Sort subjects by semester ascending (arrears first: 1, 2, 3...)
			// then by course_order (ascending) within same semester
			subjects.sort((a, b) => {
				const getSemesterNum = (sem: string): number => {
					const match = sem.match(/(\d+)/)
					return match ? parseInt(match[1], 10) : 0
				}
				const semA = getSemesterNum(a.semester)
				const semB = getSemesterNum(b.semester)

				if (semA !== semB) return semA - semB

				const orderA = a.course_order ?? 999
				const orderB = b.course_order ?? 999
				if (orderA !== orderB) return orderA - orderB

				return a.subject_code.localeCompare(b.subject_code)
			})

			// Assign serial numbers after sorting
			subjects.forEach((s, i) => {
				s.serial_number = i + 1
			})

			// DOB is already formatted as DD-MM-YYYY from MyJKKN API
			const hallTicketStudent: HallTicketStudent = {
				register_number: stu_register_no,
				student_name: learnerProfile?.student_name || student_name,
				date_of_birth: learnerProfile?.date_of_birth || '',
				program: programName,
				emis: '',
				student_photo_url: learnerProfile?.student_photo_url || undefined,
				subjects: subjects,
				semester_group: undefined
			}

			students.push(hallTicketStudent)
		}

		// Sort students by register number (ascending)
		students.sort((a, b) => a.register_number.localeCompare(b.register_number))

		// Check if no students found
		if (students.length === 0) {
			return NextResponse.json({
				success: false,
				error: 'No records available. No students found matching the criteria.',
				student_count: 0
			} as HallTicketApiResponse, { status: 404 })
		}

		// Build response data
		const hallTicketData: HallTicketData = {
			institution: {
				institution_name: institution.name,
				institution_code: institution.institution_code,
				accreditation_text: pdfSettings?.accreditation_text ||
					institution.accredited_by ||
					'(Accredited by NAAC, Approved by AICTE, Recognized by\nUGC Under Section 2(f) & 12(B), Affiliated to Periyar University)',
				address: pdfSettings?.address ||
					[institution.address_line1, institution.address_line2, institution.city, institution.state]
						.filter(Boolean)
						.join(', ') ||
					'Komarapalayam- 638 183, Namakkal District, Tamil Nadu.',
				logo_url: pdfSettings?.logo_url || '',
				secondary_logo_url: pdfSettings?.secondary_logo_url,
				primary_color: pdfSettings?.primary_color,
				secondary_color: pdfSettings?.secondary_color,
				coe_name: pdfSettings?.coe_name || '',
				coe_qualifications: pdfSettings?.coe_qualifications || '',
				coe_contact: pdfSettings?.coe_contact || ''
			},
			session: {
				session_code: examSession.session_code,
				session_name: examSession.session_name,
				exam_heading: (() => {
					const examTypeName = (examSession.exam_types as any)?.examination_name || ''
					// Supplementary sessions get a distinct heading; everything else keeps "SEMESTER EXAMINATION"
					return /supplement/i.test(examTypeName) ? 'SUPPLEMENTARY EXAMINATION' : 'SEMESTER EXAMINATION'
				})()
			},
			students: students
		}

		return NextResponse.json({
			success: true,
			data: hallTicketData,
			student_count: students.length
		} as HallTicketApiResponse)

	} catch (error) {
		console.error('Hall ticket API error:', error)
		return NextResponse.json({
			success: false,
			error: 'Internal server error'
		} as HallTicketApiResponse, { status: 500 })
	}
}

/**
 * Format exam time based on session (FN/AN)
 * Returns time in readable format: "10.00 A.M. to 01.00 P.M."
 */
function formatExamTime(session: string, examTime?: string): string {
	if (!session) return 'To Be Announced'

	const sessionUpper = session.toUpperCase()

	if (sessionUpper === 'FN' || sessionUpper.includes('FORENOON')) {
		return '10.00 A.M. to 01.00 P.M.'
	} else if (sessionUpper === 'AN' || sessionUpper.includes('AFTERNOON')) {
		return '02.00 P.M. to 05.00 P.M.'
	}

	return examTime || session
}
