import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNPrograms } from '@/services/myjkkn-service'
import { handleDeleteWithDependencyCheck } from '@/lib/delete-helpers'

// Module-level cache for MyJKKN programs with 5-minute TTL
let programsCache: { data: any[]; timestamp: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getCachedMyJKKNPrograms() {
	if (programsCache && Date.now() - programsCache.timestamp < CACHE_TTL) {
		return programsCache.data
	}
	const data = await fetchAllMyJKKNPrograms({ limit: 10000, is_active: true })
	programsCache = { data, timestamp: Date.now() }
	return data
}

// GET - Fetch all course offer with course title from course_mapping
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const examinationSessionId = searchParams.get('examination_session_id')
		const courseId = searchParams.get('course_id')
		const institutionId = searchParams.get('institutions_id')
		const institutionCode = searchParams.get('institution_code')
		const programId = searchParams.get('program_id')
		const programCode = searchParams.get('program_code')
		const semester = searchParams.get('semester')
		const isActive = searchParams.get('is_active')

		// Step 1: fetch course_offerings in paginated batches (PostgREST caps at 1000 per request)
		const PAGE_SIZE = 1000
		const MAX_ROWS = 100000
		let offerings: any[] = []

		for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
			let query = supabase
				.from('course_offerings')
				.select('*')
				.order('created_at', { ascending: false })
				.range(offset, offset + PAGE_SIZE - 1)

			if (examinationSessionId) {
				query = query.eq('examination_session_id', examinationSessionId)
			}
			if (courseId) {
				query = query.eq('course_id', courseId)
			}
			if (institutionId) {
				query = query.eq('institutions_id', institutionId)
			}
			if (institutionCode) {
				query = query.eq('institution_code', institutionCode)
			}
			if (programId) {
				query = query.eq('program_id', programId)
			}
			if (programCode) {
				query = query.eq('program_code', programCode)
			}
			if (semester) {
				query = query.eq('semester', parseInt(semester))
			}
			if (isActive !== null && isActive !== undefined) {
				query = query.eq('is_active', isActive === 'true')
			}

			const { data: batch, error: batchError } = await query

			if (batchError) {
				console.error('Course offer table error:', batchError)
				return NextResponse.json({ error: 'Failed to fetch course offer' }, { status: 500 })
			}

			offerings = offerings.concat(batch || [])

			// Stop if we got fewer rows than the page size (no more data)
			if (!batch || batch.length < PAGE_SIZE) break
		}

		// Step 2: look up course details from courses table by course_code (denormalized key)
		const courseCodes = [...new Set((offerings || []).map((o: any) => o.course_code).filter(Boolean))] as string[]
		const courseDetailsMap = new Map<string, { course_name: string; course_type: string | null; course_category: string | null; board_code: string | null }>()

		if (courseCodes.length > 0) {
			const batchSize = 500
			for (let i = 0; i < courseCodes.length; i += batchSize) {
				const batch = courseCodes.slice(i, i + batchSize)
				const { data: cData } = await supabase
					.from('courses')
					.select('course_code, course_name, course_type, course_category, board_code')
					.in('course_code', batch)
				;(cData || []).forEach((c: any) => {
					if (c.course_code) {
						courseDetailsMap.set(c.course_code, {
							course_name: c.course_name || null,
							course_type: c.course_type || null,
							course_category: c.course_category || null,
							board_code: c.board_code || null,
						})
					}
				})
			}
		}

		// Step 2b: look up board details for courses that have a board_code
		const boardCodes = [...new Set(
			Array.from(courseDetailsMap.values())
				.map(c => c.board_code)
				.filter(Boolean)
		)] as string[]
		const boardDetailsMap = new Map<string, { board_name: string; board_order: number | null }>()

		if (boardCodes.length > 0) {
			const { data: boardData } = await supabase
				.from('board')
				.select('board_code, board_name, board_order')
				.in('board_code', boardCodes)
			;(boardData || []).forEach((b: any) => {
				if (b.board_code) {
					boardDetailsMap.set(b.board_code, {
						board_name: b.board_name || null,
						board_order: b.board_order ?? null,
					})
				}
			})
		}

		// Step 3: enrich each offering with course details and board data
		const transformedData = (offerings || []).map((item: any) => {
			const courseDetail = courseDetailsMap.get(item.course_code)
			const boardDetail = courseDetail?.board_code ? boardDetailsMap.get(courseDetail.board_code) : null
			return {
				...item,
				course_name: courseDetail?.course_name || null,
				course_title: courseDetail?.course_name || null,
				course_type: courseDetail?.course_type || null,
				course_category: courseDetail?.course_category || null,
				board_code: courseDetail?.board_code || null,
				board_name: boardDetail?.board_name || null,
				board_order: boardDetail?.board_order ?? null,
			}
		})

		return NextResponse.json(transformedData)
	} catch (e) {
		console.error('Course offer API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST - Create new course offer
// Supports both UUID-based (from form) and code-based (from import) requests
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Determine if this is a code-based import request or UUID-based form request
		const isCodeBasedImport = !body.institutions_id && body.institution_code

		// Variables to store resolved data
		let institutionId: string
		let institutionCode: string
		let courseMappingId: string
		let courseId: string
		let courseCode: string
		let examSessionId: string
		let sessionCode: string
		let programId: string
		let programCode: string
		let semester: number
		let semesterCode: string

		if (isCodeBasedImport) {
			// === CODE-BASED IMPORT FLOW ===
			// Resolve codes to UUIDs

			// 1. Resolve institution_code -> institutions_id
			if (!body.institution_code) {
				return NextResponse.json({
					error: 'Institution Code is required for import'
				}, { status: 400 })
			}

			const { data: instData, error: instError } = await supabase
				.from('institutions')
				.select('id, institution_code, myjkkn_institution_ids')
				.eq('institution_code', body.institution_code)
				.maybeSingle()

			if (instError || !instData) {
				return NextResponse.json({
					error: `Institution "${body.institution_code}" not found. Please check the institution code.`
				}, { status: 400 })
			}

			institutionId = instData.id
			institutionCode = instData.institution_code

			// 2. Resolve session_code -> examination_session_id
			if (!body.session_code) {
				return NextResponse.json({
					error: 'Session Code is required for import'
				}, { status: 400 })
			}

			const { data: sessionData, error: sessionError } = await supabase
				.from('examination_sessions')
				.select('id, session_code')
				.eq('session_code', body.session_code)
				.eq('institutions_id', institutionId)
				.maybeSingle()

			if (sessionError || !sessionData) {
				return NextResponse.json({
					error: `Examination session "${body.session_code}" not found for institution "${body.institution_code}". Please check the session code.`
				}, { status: 400 })
			}

			examSessionId = sessionData.id
			sessionCode = sessionData.session_code

			// 3. Resolve program_code -> program_id from MyJKKN
			if (!body.program_code) {
				return NextResponse.json({
					error: 'Program Code is required for import'
				}, { status: 400 })
			}

			// Fetch programs from MyJKKN and find by program_code
			const myjkknPrograms = await getCachedMyJKKNPrograms()
			const programArray = Array.isArray(myjkknPrograms) ? myjkknPrograms : []

			// MyJKKN uses program_id as CODE field (e.g., "BCA", "UEN")
			const program = programArray.find((p: any) =>
				p.program_id === body.program_code || p.program_code === body.program_code
			)

			if (!program) {
				return NextResponse.json({
					error: `Program "${body.program_code}" not found in MyJKKN. Please check the program code.`
				}, { status: 400 })
			}

			programId = program.id // MyJKKN UUID
			programCode = program.program_id || program.program_code // CODE field

			// 4. Resolve semester_code from semester_name or use directly
			// Import provides semester_code directly (already resolved from semester_name in frontend)
			if (!body.semester_code) {
				return NextResponse.json({
					error: 'Semester Code is required for import'
				}, { status: 400 })
			}
			semesterCode = body.semester_code

			// 5. Get semester number from body or extract from semester_code
			if (body.semester) {
				semester = parseInt(body.semester)
			} else {
				// Try to extract semester number from semester_code (e.g., "INST-PROG-Sem1" -> 1)
				const semMatch = semesterCode.match(/Sem(\d+)/i)
				semester = semMatch ? parseInt(semMatch[1]) : 1
			}

			// 6. Resolve course_code -> course_mapping_id
			// Find course_mapping by institution_code, program_code, semester_code, and course_code
			if (!body.course_code) {
				return NextResponse.json({
					error: 'Course Code is required for import'
				}, { status: 400 })
			}

			const { data: cmData, error: cmError } = await supabase
				.from('course_mapping')
				.select('id, course_id, course_code')
				.eq('institution_code', institutionCode)
				.eq('program_code', programCode)
				.eq('semester_code', semesterCode)
				.eq('course_code', body.course_code)
				.maybeSingle()

			if (cmError || !cmData) {
				return NextResponse.json({
					error: `Course "${body.course_code}" not found in course mapping for institution "${institutionCode}", program "${programCode}", semester "${semesterCode}". Please ensure the course is mapped first.`
				}, { status: 400 })
			}

			courseMappingId = cmData.id
			courseId = cmData.course_id
			courseCode = cmData.course_code

		} else {
			// === UUID-BASED FORM FLOW ===
			// Original validation logic

			// Validate required fields
			if (!body.institutions_id) {
				return NextResponse.json({
					error: 'Institution is required'
				}, { status: 400 })
			}

			if (!body.course_mapping_id) {
				return NextResponse.json({
					error: 'Course is required'
				}, { status: 400 })
			}

			if (!body.examination_session_id) {
				return NextResponse.json({
					error: 'Examination session is required'
				}, { status: 400 })
			}

			if (!body.program_id) {
				return NextResponse.json({
					error: 'Program is required'
				}, { status: 400 })
			}

			if (!body.semester) {
				return NextResponse.json({
					error: 'Semester is required'
				}, { status: 400 })
			}

			// Validate semester range
			semester = parseInt(body.semester)
			if (semester < 1 || semester > 12) {
				return NextResponse.json({
					error: 'Semester must be between 1 and 12'
				}, { status: 400 })
			}

			// Validate foreign key - institutions and get institution_code
			const { data: institutionData, error: institutionError } = await supabase
				.from('institutions')
				.select('id, institution_code')
				.eq('id', body.institutions_id)
				.maybeSingle()

			if (institutionError || !institutionData) {
				return NextResponse.json({
					error: `Institution not found. Please select a valid institution.`
				}, { status: 400 })
			}

			institutionId = institutionData.id
			institutionCode = institutionData.institution_code

			// Validate foreign key - examination_sessions and get session_code
			const { data: examSessionData, error: examSessionError } = await supabase
				.from('examination_sessions')
				.select('id, session_code')
				.eq('id', body.examination_session_id)
				.maybeSingle()

			if (examSessionError || !examSessionData) {
				return NextResponse.json({
					error: `Examination session not found. Please select a valid examination session.`
				}, { status: 400 })
			}

			examSessionId = examSessionData.id
			sessionCode = examSessionData.session_code

			// Validate foreign key - course_mapping table and get course_code
			const { data: courseMappingData, error: courseMappingError } = await supabase
				.from('course_mapping')
				.select('id, course_code, course_id')
				.eq('id', body.course_mapping_id)
				.maybeSingle()

			if (courseMappingError || !courseMappingData) {
				return NextResponse.json({
					error: `Course not found. Please select a valid course.`
				}, { status: 400 })
			}

			courseMappingId = courseMappingData.id
			courseId = courseMappingData.course_id
			courseCode = courseMappingData.course_code

			// Validate program from MyJKKN API and get program_code
			// body.program_id is MyJKKN program UUID
			// We need to fetch from MyJKKN to get program_id (CODE field) for program_code
			try {
				const myjkknPrograms = await getCachedMyJKKNPrograms()
				const programArray = Array.isArray(myjkknPrograms) ? myjkknPrograms : []
				const program = programArray.find((p: any) => p.id === body.program_id)

				if (!program) {
					return NextResponse.json({
						error: `Program not found in MyJKKN. Please select a valid program.`
					}, { status: 400 })
				}

				// MyJKKN uses program_id as the CODE field (e.g., "BCA"), not as UUID
				programId = body.program_id
				programCode = program.program_id || program.program_code || ''
				if (!programCode) {
					return NextResponse.json({
						error: `Program code not found for program.`
					}, { status: 400 })
				}
			} catch (error) {
				console.error('Error fetching program from MyJKKN:', error)
				return NextResponse.json({
					error: `Failed to validate program. Please try again.`
				}, { status: 500 })
			}

			// Validate semester_code is provided
			if (!body.semester_code || !body.semester_code.trim()) {
				return NextResponse.json({
					error: 'Semester code is required'
				}, { status: 400 })
			}
			semesterCode = body.semester_code
		}

		// === COMMON VALIDATION AND INSERT LOGIC ===

		// Validate numeric fields
		const maxEnrollment = body.max_enrollment ? parseInt(body.max_enrollment) : null
		const enrolledCount = body.enrolled_count ? parseInt(body.enrolled_count) : 0

		if (maxEnrollment !== null && maxEnrollment <= 0) {
			return NextResponse.json({
				error: 'Max enrollment must be greater than 0 or null'
			}, { status: 400 })
		}

		if (enrolledCount < 0) {
			return NextResponse.json({
				error: 'Enrolled count cannot be negative'
			}, { status: 400 })
		}

		if (maxEnrollment !== null && enrolledCount > maxEnrollment) {
			return NextResponse.json({
				error: 'Enrolled count cannot exceed max enrollment'
			}, { status: 400 })
		}

		// Check for existing offering with same unique constraint
		// Unique constraint: (institutions_id, course_mapping_id, examination_session_id, program_code, semester_code)
		const { data: existingOffering, error: checkError } = await supabase
			.from('course_offerings')
			.select('id, is_active')
			.eq('institutions_id', institutionId)
			.eq('course_mapping_id', courseMappingId)
			.eq('examination_session_id', examSessionId)
			.eq('program_code', programCode)
			.eq('semester_code', semesterCode)
			.maybeSingle()

		if (existingOffering) {
			return NextResponse.json({
				error: `This course offering already exists in the system.`,
				existingId: existingOffering.id,
				existingIsActive: existingOffering.is_active,
				details: {
					institution: institutionCode,
					course: courseCode,
					program: programCode,
					semester: semesterCode,
					session: sessionCode
				},
				suggestion: 'Please edit the existing offering or select a different combination of program and semester.'
			}, { status: 409 })
		}

		const insertPayload: any = {
			institutions_id: institutionId,
			institution_code: institutionCode,
			course_mapping_id: courseMappingId,
			course_id: courseId,
			course_code: courseCode,
			examination_session_id: examSessionId,
			session_code: sessionCode,
			program_id: programId,
			program_code: programCode,
			semester: semester,
			semester_code: semesterCode,
			section: body.section || null,
			faculty_id: body.faculty_id || null,
			max_enrollment: maxEnrollment,
			enrolled_count: enrolledCount,
			is_active: body.is_active ?? true,
			created_by: body.created_by || null,
		}

		const { data, error } = await supabase
			.from('course_offerings')
			.insert([insertPayload])
			.select()
			.single()

		if (error) {
			console.error('Error creating course offer:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: `This course offering already exists in the system.`,
					details: 'A duplicate entry was detected. Please verify your selection and try again, or edit the existing offering.',
					suggestion: 'Check if you need to update an existing offering instead of creating a new one.'
				}, { status: 409 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select valid institution, examination session, course, and program.'
				}, { status: 400 })
			}

			// Handle check constraint violation
			if (error.code === '23514') {
				return NextResponse.json({
					error: 'Invalid value. Please check your input values (semester: 1-12, enrollment constraints).'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to create course offer' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (e) {
		console.error('Course offer creation error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT - Update course offer
export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		if (!body.id) {
			return NextResponse.json({ error: 'Course offer ID is required' }, { status: 400 })
		}

		// Validate semester if provided
		if (body.semester) {
			const semester = parseInt(body.semester)
			if (semester < 1 || semester > 12) {
				return NextResponse.json({
					error: 'Semester must be between 1 and 12'
				}, { status: 400 })
			}
		}

		// Variables to store code values
		let institutionCode: string | undefined
		let sessionCode: string | undefined
		let courseCode: string | undefined
		let programCode: string | undefined

		// Validate foreign key - institutions (if provided)
		if (body.institutions_id) {
			const { data: institutionData, error: institutionError } = await supabase
				.from('institutions')
				.select('id, institution_code')
				.eq('id', body.institutions_id)
				.maybeSingle()

			if (institutionError || !institutionData) {
				return NextResponse.json({
					error: `Institution not found. Please select a valid institution.`
				}, { status: 400 })
			}
			institutionCode = institutionData.institution_code
		}

		// Validate foreign key - examination_sessions (if provided)
		if (body.examination_session_id) {
			const { data: examSessionData, error: examSessionError } = await supabase
				.from('examination_sessions')
				.select('id, session_code')
				.eq('id', body.examination_session_id)
				.maybeSingle()

			if (examSessionError || !examSessionData) {
				return NextResponse.json({
					error: `Examination session not found. Please select a valid examination session.`
				}, { status: 400 })
			}
			sessionCode = examSessionData.session_code
		}

		// Validate foreign key - course_mapping (if provided)
		if (body.course_mapping_id) {
			const { data: courseMappingData, error: courseMappingError } = await supabase
				.from('course_mapping')
				.select('id, course_code, course_id')
				.eq('id', body.course_mapping_id)
				.maybeSingle()

			if (courseMappingError || !courseMappingData) {
				return NextResponse.json({
					error: `Course not found. Please select a valid course.`
				}, { status: 400 })
			}
			courseCode = courseMappingData.course_code
		}

		// Validate program from MyJKKN API and get program_code (if provided)
		if (body.program_id) {
			try {
				const myjkknPrograms = await getCachedMyJKKNPrograms()
				const programArray = Array.isArray(myjkknPrograms) ? myjkknPrograms : []
				const program = programArray.find((p: any) => p.id === body.program_id)

				if (!program) {
					return NextResponse.json({
						error: `Program not found in MyJKKN. Please select a valid program.`
					}, { status: 400 })
				}

				// MyJKKN uses program_id as the CODE field (e.g., "BCA"), not as UUID
				programCode = program.program_id || program.program_code || undefined
				if (!programCode) {
					return NextResponse.json({
						error: `Program code not found for program.`
					}, { status: 400 })
				}
			} catch (error) {
				console.error('Error fetching program from MyJKKN:', error)
				return NextResponse.json({
					error: `Failed to validate program. Please try again.`
				}, { status: 500 })
			}
		}

		// Validate numeric fields if provided
		if (body.max_enrollment !== undefined) {
			const maxEnrollment = body.max_enrollment ? parseInt(body.max_enrollment) : null
			if (maxEnrollment !== null && maxEnrollment <= 0) {
				return NextResponse.json({
					error: 'Max enrollment must be greater than 0 or null'
				}, { status: 400 })
			}
		}

		if (body.enrolled_count !== undefined) {
			const enrolledCount = parseInt(body.enrolled_count)
			if (enrolledCount < 0) {
				return NextResponse.json({
					error: 'Enrolled count cannot be negative'
				}, { status: 400 })
			}
		}

		// Get course_id from course_mapping if course_mapping_id is provided
		let courseIdForDb: string | undefined
		if (body.course_mapping_id && courseCode) {
			// We already validated course_mapping and have courseMappingData
			const { data: cmData } = await supabase
				.from('course_mapping')
				.select('course_id')
				.eq('id', body.course_mapping_id)
				.maybeSingle()
			courseIdForDb = cmData?.course_id
		}

		// Check for duplicate when updating unique fields
		// Only check if updating any of the unique constraint fields
		if (body.institutions_id || body.course_mapping_id || body.examination_session_id || body.program_id || body.semester_code) {
			// Get current record to compare
			const { data: currentRecord } = await supabase
				.from('course_offerings')
				.select('institutions_id, course_mapping_id, examination_session_id, program_code, semester_code')
				.eq('id', body.id)
				.maybeSingle()

			if (currentRecord) {
				const finalInstitutionId = body.institutions_id || currentRecord.institutions_id
				const finalCourseMappingId = body.course_mapping_id || currentRecord.course_mapping_id
				const finalSessionId = body.examination_session_id || currentRecord.examination_session_id
				const finalProgramCode = programCode || currentRecord.program_code
				const finalSemesterCode = body.semester_code || currentRecord.semester_code

				// Check if another record exists with these values
				const { data: duplicateCheck } = await supabase
					.from('course_offerings')
					.select('id')
					.eq('institutions_id', finalInstitutionId)
					.eq('course_mapping_id', finalCourseMappingId)
					.eq('examination_session_id', finalSessionId)
					.eq('program_code', finalProgramCode)
					.eq('semester_code', finalSemesterCode)
					.neq('id', body.id)
					.maybeSingle()

				if (duplicateCheck) {
					return NextResponse.json({
						error: 'Cannot update: This would create a duplicate course offering.',
						details: 'Another offering already exists with this combination of institution, course, session, program, and semester.',
						suggestion: 'Please choose a different program or semester, or cancel this edit and modify the existing offering instead.'
					}, { status: 409 })
				}
			}
		}

		const updatePayload: any = {
			institutions_id: body.institutions_id,
			institution_code: institutionCode,
			course_mapping_id: body.course_mapping_id,
			course_id: courseIdForDb,
			course_code: courseCode,
			examination_session_id: body.examination_session_id,
			session_code: sessionCode,
			program_id: body.program_id,
			program_code: programCode,
			semester: body.semester ? parseInt(body.semester) : undefined,
			semester_code: body.semester_code || undefined, // Add semester_code from MyJKKN
			section: body.section,
			faculty_id: body.faculty_id,
			max_enrollment: body.max_enrollment ? parseInt(body.max_enrollment) : null,
			enrolled_count: body.enrolled_count !== undefined ? parseInt(body.enrolled_count) : undefined,
			is_active: body.is_active,
			updated_by: body.updated_by || null,
		}

		// Remove undefined fields
		Object.keys(updatePayload).forEach(key => {
			if (updatePayload[key] === undefined) {
				delete updatePayload[key]
			}
		})

		const { data, error } = await supabase
			.from('course_offerings')
			.update(updatePayload)
			.eq('id', body.id)
			.select()
			.single()

		if (error) {
			console.error('Error updating course offer:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Cannot update: This would create a duplicate course offering.',
					details: 'A duplicate entry was detected during the update.',
					suggestion: 'Please verify your changes and ensure you are not creating a duplicate offering.'
				}, { status: 409 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select valid references.'
				}, { status: 400 })
			}

			// Handle check constraint violation
			if (error.code === '23514') {
				return NextResponse.json({
					error: 'Invalid value. Please check your input values (semester: 1-12, enrollment constraints).'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to update course offer' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('Course offer update error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE - Delete course offer
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Course offer ID is required' }, { status: 400 })
		}

		return handleDeleteWithDependencyCheck('course_offerings', id, request)
	} catch (e) {
		console.error('Course offer deletion error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
