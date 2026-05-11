import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const action = searchParams.get('action')

	// Institution filter params (from useInstitutionFilter hook)
	const filterInstitutionCode = searchParams.get('institution_code')
	const filterInstitutionsId = searchParams.get('institutions_id')

	try {
		// Get institutions for dropdown
		// If institution filter is provided, only return that institution
		// Otherwise return all (for super_admin viewing "All Institutions")
		if (action === 'institutions') {
			let query = supabase
				.from('institutions')
				.select('id, name, institution_code, institution_name')
				.eq('is_active', true)

			// Apply institution filter if provided (normal users)
			if (filterInstitutionCode) {
				query = query.eq('institution_code', filterInstitutionCode)
			} else if (filterInstitutionsId) {
				query = query.eq('id', filterInstitutionsId)
			}

			const { data, error } = await query.order('name')

			if (error) throw error
			return NextResponse.json(data)
		}

		// Get sessions for selected institution
		if (action === 'sessions') {
			const institutionId = searchParams.get('institutionId')

			// Use filter institution ID if no specific institutionId provided
			const effectiveInstitutionId = institutionId || filterInstitutionsId
			if (!effectiveInstitutionId) {
				return NextResponse.json({ error: 'Institution ID required' }, { status: 400 })
			}

			const { data, error } = await supabase
				.from('examination_sessions')
				.select('id, session_name, session_code')
				.eq('institutions_id', effectiveInstitutionId)
				.order('session_name', { ascending: false })

			if (error) throw error
			return NextResponse.json(data)
		}

		// Get courses for selected session (only courses with marks entries)
		if (action === 'courses') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')
			const courseType = searchParams.get('courseType') // 'theory' | 'practical'

			// Use filter institution ID if no specific institutionId provided
			const effectiveInstitutionId = institutionId || filterInstitutionsId
			if (!effectiveInstitutionId || !sessionId) {
				return NextResponse.json({ error: 'Institution and Session IDs required' }, { status: 400 })
			}

			// Get distinct course_ids from marks_entry for this institution.
			// We intentionally do NOT filter by sessionId here because practical
			// marks entries sometimes have a different examination_session_id than
			// the selected theory session. The session filter is applied at search time.
			const { data: distinctCourseIds, error: distinctError } = await supabase
				.from('marks_entry')
				.select('course_id')
				.eq('institutions_id', effectiveInstitutionId)
				.not('course_id', 'is', null)

			if (distinctError) throw distinctError

			// Extract unique course IDs using Set (much faster than Map with full objects)
			const uniqueCourseIds = [...new Set(distinctCourseIds?.map(item => item.course_id) || [])]

			if (uniqueCourseIds.length === 0) {
				return NextResponse.json([])
			}

			// Step 2: Fetch course details only for unique course IDs
			let coursesQuery = supabase
				.from('courses')
				.select('id, course_code, course_name, course_type')
				.in('id', uniqueCourseIds)

			// Apply course type filter based on tab
			if (courseType === 'theory') {
				coursesQuery = coursesQuery.ilike('course_type', 'theory')
			} else if (courseType === 'practical') {
				coursesQuery = coursesQuery.not('course_type', 'ilike', 'theory')
			}

			const { data: courses, error: coursesError } = await coursesQuery.order('course_code')

			if (coursesError) throw coursesError

			return NextResponse.json(courses || [])
		}

		// Get courses with marks entries for today's date (for correction page)
		// Flow: Institution -> Date (today, auto) -> Course -> Register Number
		if (action === 'coursesByDate') {
			const institutionId = searchParams.get('institutionId')
			const date = searchParams.get('date') // Format: YYYY-MM-DD

			// Use filter institution ID if no specific institutionId provided
			const effectiveInstitutionId = institutionId || filterInstitutionsId
			if (!effectiveInstitutionId || !date) {
				return NextResponse.json({ error: 'Institution ID and Date required' }, { status: 400 })
			}

			// Get marks entries for the specific date
			// evaluation_date is the date when marks were entered
			const { data: distinctCourseIds, error: distinctError } = await supabase
				.from('marks_entry')
				.select('course_id')
				.eq('institutions_id', effectiveInstitutionId)
				.gte('evaluation_date', `${date}T00:00:00`)
				.lt('evaluation_date', `${date}T23:59:59.999`)
				.not('course_id', 'is', null)

			if (distinctError) throw distinctError

			// Extract unique course IDs
			const uniqueCourseIds = [...new Set(distinctCourseIds?.map(item => item.course_id) || [])]

			if (uniqueCourseIds.length === 0) {
				return NextResponse.json([])
			}

			// Fetch course details
			const { data: courses, error: coursesError } = await supabase
				.from('courses')
				.select('id, course_code, course_name')
				.in('id', uniqueCourseIds)
				.order('course_code')

			if (coursesError) throw coursesError

			return NextResponse.json(courses || [])
		}

		// Get packets that have marks entries (for correction)
		if (action === 'packets') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')
			const courseId = searchParams.get('courseId')

			// Use filter institution ID if no specific institutionId provided
			const effectiveInstitutionId = institutionId || filterInstitutionsId
			if (!effectiveInstitutionId || !sessionId || !courseId) {
				return NextResponse.json({ error: 'Institution, Session, and Course IDs required' }, { status: 400 })
			}

			// Get all packets for this course
			const { data: allPackets, error: packetError } = await supabase
				.from('answer_sheet_packets')
				.select('id, packet_no, total_sheets, institutions_id, examination_session_id, course_id')
				.eq('institutions_id', effectiveInstitutionId)
				.eq('examination_session_id', sessionId)
				.eq('course_id', courseId)
				.order('packet_no')

			if (packetError) {
				console.error('Error fetching packets:', packetError)
				throw packetError
			}

			if (!allPackets || allPackets.length === 0) {
				return NextResponse.json([])
			}

			// Get marks entries for this course to find which packets have marks
			const { data: marksData, error: marksError } = await supabase
				.from('marks_entry')
				.select(`
					student_dummy_number_id,
					student_dummy_numbers:student_dummy_number_id (
						packet_id
					)
				`)
				.eq('institutions_id', effectiveInstitutionId)
				.eq('examination_session_id', sessionId)
				.eq('course_id', courseId)

			if (marksError) {
				console.error('Error checking marks:', marksError)
				return NextResponse.json([])
			}

			// Extract packet IDs that have marks
			const packetIds = allPackets.map(p => p.id)
			const packetsWithMarks = new Set(
				marksData?.map((mark: any) => mark.student_dummy_numbers?.packet_id)
					.filter((id: string) => id && packetIds.includes(id)) || []
			)

			// Filter to only packets that HAVE marks (opposite of mark entry)
			const availablePackets = allPackets.filter(packet => packetsWithMarks.has(packet.id))

			return NextResponse.json(availablePackets)
		}

		// Get students with marks for a packet
		if (action === 'students') {
			const packetId = searchParams.get('packetId')

			if (!packetId) {
				return NextResponse.json({ error: 'Packet ID required' }, { status: 400 })
			}

			// Get packet details
			const { data: packetData, error: packetError } = await supabase
				.from('answer_sheet_packets')
				.select(`
					id,
					packet_no,
					total_sheets,
					institutions_id,
					examination_session_id,
					course_id,
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
				return NextResponse.json({ error: 'Packet not found' }, { status: 404 })
			}

			// Get dummy numbers for this packet with exam_registration -> course_offering to get program_id
			const { data: dummyNumbers, error: dummyError } = await supabase
				.from('student_dummy_numbers')
				.select(`
					id,
					dummy_number,
					exam_registration_id,
					exam_registrations:exam_registration_id (
						course_offering_id,
						course_offerings:course_offering_id (
							program_id
						)
					)
				`)
				.eq('packet_id', packetId)
				.order('dummy_number')

			if (dummyError) {
				console.error('Error fetching dummy numbers:', dummyError)
				throw dummyError
			}

			// Get marks entries for these dummy numbers
			const dummyIds = dummyNumbers?.map(d => d.id) || []
			const { data: marksEntries, error: marksError } = await supabase
				.from('marks_entry')
				.select('id, student_dummy_number_id, total_marks_obtained, total_marks_in_words, evaluator_remarks')
				.in('student_dummy_number_id', dummyIds)
				.eq('course_id', packetData.course_id)

			if (marksError) {
				console.error('Error fetching marks:', marksError)
				throw marksError
			}

			// Create marks map
			const marksMap = new Map(
				marksEntries?.map(m => [m.student_dummy_number_id, m]) || []
			)

			// Build students array with marks
			const students = dummyNumbers?.map(dn => {
				const marks = marksMap.get(dn.id)
				const examReg = dn.exam_registrations as any
				const courseOffering = examReg?.course_offerings as any
				return {
					student_dummy_id: dn.id,
					dummy_number: dn.dummy_number,
					exam_registration_id: dn.exam_registration_id,
					program_id: courseOffering?.program_id || null,
					marks_entry_id: marks?.id || null,
					total_marks_obtained: marks?.total_marks_obtained ?? null,
					total_marks_in_words: marks?.total_marks_in_words || '',
					remarks: marks?.evaluator_remarks || ''
				}
			}) || []

			const courseData = packetData.courses as any

			return NextResponse.json({
				students,
				course_details: {
					subject_code: courseData?.course_code || '',
					subject_name: courseData?.course_name || '',
					maximum_marks: courseData?.external_max_mark || 100,
					minimum_pass_marks: courseData?.external_pass_mark || 40,
					packet_no: packetData.packet_no,
					total_sheets: packetData.total_sheets
				}
			})
		}

		// Search marks entries for correction
		if (action === 'search') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')
			const courseId = searchParams.get('courseId')
			const dummyNumber = searchParams.get('dummyNumber')

			if (!institutionId || !sessionId) {
				return NextResponse.json({ error: 'Institution and Session IDs required' }, { status: 400 })
			}

			let query = supabase
				.from('marks_entry')
				.select(`
					id,
					dummy_number,
					total_marks_obtained,
					total_marks_in_words,
					marks_out_of,
					evaluation_date,
					evaluator_remarks,
					entry_status,
					course_id,
					examination_session_id,
					institutions_id,
					exam_registration_id,
					student_dummy_number_id,
					program_id,
					courses:course_id (
						course_code,
						course_name,
						external_max_mark,
						external_pass_mark
					)
				`)
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)
				.order('dummy_number')

			if (courseId) {
				query = query.eq('course_id', courseId)
			}

			if (dummyNumber) {
				query = query.ilike('dummy_number', `%${dummyNumber}%`)
			}

			const { data, error } = await query.limit(100)

			if (error) throw error
			return NextResponse.json(data)
		}

		// Search by learner register number (session-based)
		if (action === 'searchByRegister') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')
			const courseId = searchParams.get('courseId')
			const registerNumber = searchParams.get('registerNumber')

			// Use filter institution ID if no specific institutionId provided
			const effectiveInstitutionId = institutionId || filterInstitutionsId
			if (!effectiveInstitutionId || !sessionId || !courseId || !registerNumber) {
				return NextResponse.json({ error: 'Institution, Session, Course IDs and Register Number required' }, { status: 400 })
			}

			// Query marks_entry with direct FK join to exam_registrations
			// exam_registrations uses stu_register_no (not register_number)
			const { data: marksEntries, error: marksError } = await supabase
				.from('marks_entry')
				.select(`
					id,
					dummy_number,
					total_marks_obtained,
					total_marks_in_words,
					evaluator_remarks,
					marks_out_of,
					evaluation_date,
					source,
					student_dummy_number_id,
					exam_registration_id,
					exam_registrations!exam_registration_id (
						id,
						stu_register_no,
						course_offering_id,
						course_offerings:course_offering_id (
							program_id
						)
					)
				`)
				.eq('institutions_id', effectiveInstitutionId)
				.eq('examination_session_id', sessionId)
				.eq('course_id', courseId)
				.eq('is_active', true)

			if (marksError) {
				console.error('Error searching marks entries:', marksError)
				throw marksError
			}

			// Filter by register number (case-insensitive)
			const matchingEntries = (marksEntries || []).filter((entry: any) => {
				const examReg = entry.exam_registrations as any
				return examReg?.stu_register_no?.toLowerCase() === registerNumber.trim().toLowerCase()
			})

			if (matchingEntries.length === 0) {
				return NextResponse.json({
					students: [],
					course_details: null
				})
			}

			// Get course details
			const { data: courseData, error: courseError } = await supabase
				.from('courses')
				.select('course_code, course_name, external_max_mark, external_pass_mark')
				.eq('id', courseId)
				.single()

			if (courseError) {
				console.error('Error fetching course:', courseError)
			}

			// Build students array
			const students = matchingEntries.map((entry: any) => {
				const examReg = entry.exam_registrations as any
				const courseOffering = examReg?.course_offerings as any
				return {
					student_dummy_id: entry.student_dummy_number_id,
					dummy_number: entry.dummy_number,
					exam_registration_id: entry.exam_registration_id,
					register_number: examReg?.stu_register_no || registerNumber,
					program_id: courseOffering?.program_id || null,
					marks_entry_id: entry.id,
					total_marks_obtained: entry.total_marks_obtained ?? null,
					total_marks_in_words: entry.total_marks_in_words || '',
					remarks: entry.evaluator_remarks || '',
					marks_out_of: entry.marks_out_of || courseData?.external_max_mark || 100,
					source: entry.source || 'Manual Entry'
				}
			})

			return NextResponse.json({
				students,
				course_details: courseData ? {
					subject_code: courseData.course_code || '',
					subject_name: courseData.course_name || '',
					maximum_marks: courseData.external_max_mark || 100,
					minimum_pass_marks: courseData.external_pass_mark || 40
				} : null
			})
		}

		// Search by learner register number and date (for today's corrections only)
		if (action === 'searchByRegisterAndDate') {
			const institutionId = searchParams.get('institutionId')
			const date = searchParams.get('date') // Format: YYYY-MM-DD
			const courseId = searchParams.get('courseId')
			const registerNumber = searchParams.get('registerNumber')

			// Use filter institution ID if no specific institutionId provided
			const effectiveInstitutionId = institutionId || filterInstitutionsId
			if (!effectiveInstitutionId || !date || !courseId || !registerNumber) {
				return NextResponse.json({ error: 'Institution ID, Date, Course ID and Register Number required' }, { status: 400 })
			}

			// Find marks entries for this course and date, then match by register number
			const { data: marksEntries, error: marksError } = await supabase
				.from('marks_entry')
				.select(`
					id,
					dummy_number,
					total_marks_obtained,
					total_marks_in_words,
					evaluator_remarks,
					marks_out_of,
					student_dummy_number_id,
					exam_registration_id,
					student_dummy_numbers:student_dummy_number_id (
						id,
						dummy_number,
						exam_registration_id,
						exam_registrations:exam_registration_id (
							id,
							register_number,
							course_offering_id,
							course_offerings:course_offering_id (
								program_id
							)
						)
					)
				`)
				.eq('institutions_id', effectiveInstitutionId)
				.eq('course_id', courseId)
				.gte('evaluation_date', `${date}T00:00:00`)
				.lt('evaluation_date', `${date}T23:59:59.999`)

			if (marksError) {
				console.error('Error searching marks entries:', marksError)
				throw marksError
			}

			// Filter by register number
			const matchingEntries = marksEntries?.filter((entry: any) => {
				const examReg = entry.student_dummy_numbers?.exam_registrations as any
				return examReg?.register_number?.toLowerCase() === registerNumber.trim().toLowerCase()
			}) || []

			if (matchingEntries.length === 0) {
				return NextResponse.json({
					students: [],
					course_details: null
				})
			}

			// Get course details
			const { data: courseData, error: courseError } = await supabase
				.from('courses')
				.select('course_code, course_name, external_max_mark, external_pass_mark')
				.eq('id', courseId)
				.single()

			if (courseError) {
				console.error('Error fetching course:', courseError)
			}

			// Build students array
			const students = matchingEntries.map((entry: any) => {
				const dummyNumber = entry.student_dummy_numbers as any
				const examReg = dummyNumber?.exam_registrations as any
				const courseOffering = examReg?.course_offerings as any
				return {
					student_dummy_id: entry.student_dummy_number_id,
					dummy_number: entry.dummy_number || dummyNumber?.dummy_number,
					exam_registration_id: examReg?.id,
					register_number: examReg?.register_number,
					program_id: courseOffering?.program_id || null,
					marks_entry_id: entry.id,
					total_marks_obtained: entry.total_marks_obtained ?? null,
					total_marks_in_words: entry.total_marks_in_words || '',
					remarks: entry.evaluator_remarks || '',
					marks_out_of: entry.marks_out_of || courseData?.external_max_mark || 100
				}
			})

			return NextResponse.json({
				students,
				course_details: courseData ? {
					subject_code: courseData.course_code || '',
					subject_name: courseData.course_name || '',
					maximum_marks: courseData.external_max_mark || 100,
					minimum_pass_marks: courseData.external_pass_mark || 40
				} : null
			})
		}

		// Get correction history for a marks entry
		if (action === 'history') {
			const marksEntryId = searchParams.get('marksEntryId')

			if (!marksEntryId) {
				return NextResponse.json({ error: 'Marks entry ID required' }, { status: 400 })
			}

			const { data, error } = await supabase
				.from('marks_correction_log')
				.select(`
					id,
					old_marks,
					new_marks,
					marks_difference,
					correction_reason,
					correction_type,
					corrected_at,
					corrected_by,
					approval_status,
					users:corrected_by (
						full_name,
						email
					)
				`)
				.eq('marks_entry_id', marksEntryId)
				.order('corrected_at', { ascending: false })

			if (error) throw error
			return NextResponse.json(data)
		}

		// Get all distinct dummy numbers for a course/session/institution
		if (action === 'dummyNumbers') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')
			const courseId = searchParams.get('courseId')

			const effectiveInstitutionId = institutionId || filterInstitutionsId
			if (!effectiveInstitutionId || !sessionId || !courseId) {
				return NextResponse.json({ error: 'Institution, Session, Course IDs required' }, { status: 400 })
			}

			const { data, error } = await supabase
				.from('marks_entry')
				.select('dummy_number')
				.eq('institutions_id', effectiveInstitutionId)
				.eq('examination_session_id', sessionId)
				.eq('course_id', courseId)
				.not('dummy_number', 'is', null)
				.order('dummy_number')

			if (error) throw error

			const uniqueDummyNumbers = [...new Set((data || []).map((d: any) => d.dummy_number).filter(Boolean))]
			return NextResponse.json(uniqueDummyNumbers)
		}

		// Search marks entries by dummy number (Theory tab)
		if (action === 'searchByDummyNumber') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')
			const courseId = searchParams.get('courseId')
			const dummyNumber = searchParams.get('dummyNumber')

			const effectiveInstitutionId = institutionId || filterInstitutionsId
			if (!effectiveInstitutionId || !sessionId || !courseId || !dummyNumber) {
				return NextResponse.json({ error: 'All parameters required' }, { status: 400 })
			}

			const { data: marksEntries, error: marksError } = await supabase
				.from('marks_entry')
				.select(`
					id,
					dummy_number,
					total_marks_obtained,
					total_marks_in_words,
					evaluator_remarks,
					marks_out_of,
					source,
					student_dummy_number_id,
					exam_registration_id,
					exam_registrations!exam_registration_id (
						id,
						stu_register_no,
						course_offering_id,
						course_offerings:course_offering_id (
							program_id
						)
					)
				`)
				.eq('institutions_id', effectiveInstitutionId)
				.eq('examination_session_id', sessionId)
				.eq('course_id', courseId)
				.eq('dummy_number', dummyNumber)
				.eq('is_active', true)

			if (marksError) throw marksError

			const { data: courseData } = await supabase
				.from('courses')
				.select('course_code, course_name, external_max_mark, external_pass_mark')
				.eq('id', courseId)
				.single()

			const students = (marksEntries || []).map((entry: any) => {
				const examReg = entry.exam_registrations as any
				const courseOffering = examReg?.course_offerings as any
				return {
					student_dummy_id: entry.student_dummy_number_id,
					dummy_number: entry.dummy_number,
					exam_registration_id: entry.exam_registration_id,
					register_number: examReg?.stu_register_no || '',
					program_id: courseOffering?.program_id || null,
					marks_entry_id: entry.id,
					total_marks_obtained: entry.total_marks_obtained ?? null,
					total_marks_in_words: entry.total_marks_in_words || '',
					remarks: entry.evaluator_remarks || '',
					marks_out_of: entry.marks_out_of || courseData?.external_max_mark || 100,
					source: entry.source || 'Manual Entry'
				}
			})

			return NextResponse.json({
				students,
				course_details: courseData ? {
					subject_code: courseData.course_code || '',
					subject_name: courseData.course_name || '',
					maximum_marks: courseData.external_max_mark || 100,
					minimum_pass_marks: courseData.external_pass_mark || 40
				} : null
			})
		}

		// Search by dummy number OR register number — filtered by institution + session + course
		if (action === 'searchByDummyOrRegister') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')
			const courseId = searchParams.get('courseId')
			const searchVal = searchParams.get('searchValue')

			const effectiveInstitutionId = institutionId || filterInstitutionsId
			if (!effectiveInstitutionId || !searchVal) {
				return NextResponse.json({ error: 'Institution ID and search value required' }, { status: 400 })
			}

			const baseSelect = `
				id,
				dummy_number,
				total_marks_obtained,
				total_marks_in_words,
				evaluator_remarks,
				marks_out_of,
				source,
				student_dummy_number_id,
				exam_registration_id,
				courses:course_id (
					course_code,
					course_name,
					external_max_mark,
					external_pass_mark
				),
				examination_sessions:examination_session_id (
					session_name
				),
				exam_registrations!exam_registration_id (
					id,
					stu_register_no
				)
			`

			const buildQuery = () => {
				let q = supabase
					.from('marks_entry')
					.select(baseSelect)
					.eq('institutions_id', effectiveInstitutionId)
					.eq('is_active', true)
				if (sessionId) q = q.eq('examination_session_id', sessionId)
				if (courseId) q = q.eq('course_id', courseId)
				return q
			}

			// Try dummy number first (exact match)
			const { data: byDummy, error: dummyErr } = await buildQuery()
				.eq('dummy_number', searchVal.trim().toUpperCase())

			if (dummyErr) throw dummyErr

			let matchedEntries: any[] = byDummy || []
			let searchedBy: 'dummy' | 'register' = 'dummy'

			// If no dummy match, try register number
			if (matchedEntries.length === 0) {
				const { data: allEntries, error: regErr } = await buildQuery().range(0, 9999)

				if (regErr) throw regErr

				matchedEntries = (allEntries || []).filter((entry: any) => {
					const examReg = entry.exam_registrations as any
					return examReg?.stu_register_no?.toLowerCase() === searchVal.trim().toLowerCase()
				})
				searchedBy = 'register'
			}

			// Fetch course details if courseId provided
			let courseDetails = null
			if (courseId) {
				const { data: cd } = await supabase
					.from('courses')
					.select('course_code, course_name, external_max_mark, external_pass_mark')
					.eq('id', courseId)
					.single()
				if (cd) {
					courseDetails = {
						subject_code: cd.course_code || '',
						subject_name: cd.course_name || '',
						maximum_marks: cd.external_max_mark || 100,
						minimum_pass_marks: cd.external_pass_mark || 40
					}
				}
			}

			const students = matchedEntries.map((entry: any) => {
				const examReg = entry.exam_registrations as any
				const course = entry.courses as any
				const session = entry.examination_sessions as any
				return {
					marks_entry_id: entry.id,
					student_dummy_id: entry.student_dummy_number_id,
					dummy_number: entry.dummy_number,
					exam_registration_id: entry.exam_registration_id,
					register_number: examReg?.stu_register_no || '',
					total_marks_obtained: entry.total_marks_obtained ?? null,
					total_marks_in_words: entry.total_marks_in_words || '',
					remarks: entry.evaluator_remarks || '',
					marks_out_of: entry.marks_out_of || course?.external_max_mark || 100,
					source: entry.source || 'Manual Entry',
					course_code: course?.course_code || '',
					course_name: course?.course_name || '',
					external_pass_mark: course?.external_pass_mark || 40,
					session_name: session?.session_name || ''
				}
			})

			return NextResponse.json({
				students,
				searched_by: searchedBy,
				course_details: courseDetails
			})
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

	} catch (error) {
		console.error('External marks correction GET error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Failed to fetch data' },
			{ status: 500 }
		)
	}
}

export async function POST(request: NextRequest) {
	const supabase = getSupabaseServer()

	try {
		const body = await request.json()
		const {
			marks_entry_id,
			new_marks,
			new_marks_in_words,
			correction_reason,
			correction_type,
			reference_number,
			corrected_by
		} = body

		// Validate required fields
		if (!marks_entry_id || new_marks === undefined || !correction_reason || !correction_type) {
			return NextResponse.json({
				error: 'Missing required fields: marks_entry_id, new_marks, correction_reason, correction_type'
			}, { status: 400 })
		}

		if (!corrected_by) {
			return NextResponse.json({ error: 'User authentication required' }, { status: 401 })
		}

		// Get original marks entry
		const { data: originalEntry, error: fetchError } = await supabase
			.from('marks_entry')
			.select('*')
			.eq('id', marks_entry_id)
			.single()

		if (fetchError || !originalEntry) {
			return NextResponse.json({ error: 'Marks entry not found' }, { status: 404 })
		}

		// Check if marks are actually different
		if (originalEntry.total_marks_obtained !== null && originalEntry.total_marks_obtained === new_marks) {
			return NextResponse.json({ error: 'New marks must be different from current marks' }, { status: 400 })
		}

		// Validate new marks against maximum
		const maxMarks = originalEntry.marks_out_of || 100
		if (new_marks > maxMarks) {
			return NextResponse.json({
				error: `Marks cannot exceed maximum (${maxMarks})`
			}, { status: 400 })
		}

		if (new_marks < 0) {
			return NextResponse.json({ error: 'Marks cannot be negative' }, { status: 400 })
		}

		// Start transaction - create correction log
		const { data: correctionLog, error: logError } = await supabase
			.from('marks_correction_log')
			.insert({
				marks_entry_id,
				dummy_number: originalEntry.dummy_number,
				course_id: originalEntry.course_id,
				examination_session_id: originalEntry.examination_session_id,
				institutions_id: originalEntry.institutions_id,
				old_marks: originalEntry.total_marks_obtained,
				new_marks,
				old_marks_in_words: originalEntry.total_marks_in_words,
				new_marks_in_words,
				correction_reason,
				correction_type,
				reference_number: reference_number || null,
				approval_status: 'Approved',
				corrected_by: corrected_by || null
			})
			.select()
			.single()

		if (logError) {
			console.error('Error creating correction log:', logError)
			throw logError
		}

		// Update the marks entry
		const { data: updatedEntry, error: updateError } = await supabase
			.from('marks_entry')
			.update({
				total_marks_obtained: new_marks,
				total_marks_in_words: new_marks_in_words,
				updated_at: new Date().toISOString()
			})
			.eq('id', marks_entry_id)
			.select()
			.single()

		if (updateError) {
			console.error('Error updating marks entry:', updateError)
			throw updateError
		}

		return NextResponse.json({
			success: true,
			message: 'Marks corrected successfully',
			correction_log: correctionLog,
			updated_entry: updatedEntry
		})

	} catch (error) {
		console.error('External marks correction POST error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Failed to correct marks' },
			{ status: 500 }
		)
	}
}
