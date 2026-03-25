import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Valid status grades - must match DB check constraints
 */
const VALID_STATUS_GRADES = ['Commended', 'Highly Commended', 'AAA'] as const

function isValidStatusGrade(grade: string): boolean {
	return VALID_STATUS_GRADES.includes(grade as typeof VALID_STATUS_GRADES[number])
}

/**
 * GET /api/marks/status-grades
 *
 * Fetch students and their current status grades for a given course.
 *
 * Query params:
 *   - institutions_id (required)
 *   - examination_session_id (required)
 *   - course_id (required)
 *   - status_type: 'internal' | 'external' (required)
 */
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const action = searchParams.get('action')

		// =========================================================
		// Action-based routing for dropdown data
		// =========================================================
		if (action) {
			switch (action) {
				case 'institutions': {
					const institutionCode = searchParams.get('institution_code')
					const institutionsId = searchParams.get('institutions_id')

					let query = supabase
						.from('institutions')
						.select('id, name, institution_code')
						.eq('is_active', true)

					if (institutionCode) {
						query = query.eq('institution_code', institutionCode)
					} else if (institutionsId) {
						query = query.eq('id', institutionsId)
					}

					const { data, error } = await query.order('name')
					if (error) {
						console.error('Error fetching institutions:', error)
						return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 })
					}
					return NextResponse.json(data || [])
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
						.order('session_name', { ascending: false })

					if (error) {
						console.error('Error fetching sessions:', error)
						return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
					}
					return NextResponse.json(data || [])
				}

				case 'programs': {
					const institutionId = searchParams.get('institutionId')
					const statusType = searchParams.get('statusType') // 'Internal' or 'External'

					if (!institutionId) {
						return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
					}

					const sessionId = searchParams.get('sessionId')

					// Step 1: Get COE institution to access myjkkn_institution_ids
					const { data: institution, error: instError } = await supabase
						.from('institutions')
						.select('id, institution_code, myjkkn_institution_ids')
						.eq('id', institutionId)
						.single()

					if (instError || !institution) {
						console.error('[Status Grades Programs API] Institution not found:', instError)
						return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
					}

					const myjkknInstitutionIds: string[] = institution.myjkkn_institution_ids || []

					if (myjkknInstitutionIds.length === 0) {
						console.log('[Status Grades Programs API] No myjkkn_institution_ids found')
						return NextResponse.json([])
					}

					console.log('[Status Grades Programs API] Using MyJKKN institution IDs:', myjkknInstitutionIds)

					// Step 2: Get course_offerings to find which programs have Status-type courses
					let coQuery = supabase
						.from('course_offerings')
						.select(`
							program_id,
							courses:course_id (
								id,
								evaluation_type,
								result_type
							)
						`)
						.eq('institutions_id', institutionId)

					if (sessionId) {
						coQuery = coQuery.eq('examination_session_id', sessionId)
					}

					const { data: courseOfferings, error: coError } = await coQuery.range(0, 9999)

					if (coError) {
						console.error('[Status Grades Programs API] Error fetching course offerings:', coError)
						return NextResponse.json({ error: 'Failed to fetch course offerings' }, { status: 500 })
					}

					console.log(`[Status Grades Programs API] Found ${courseOfferings?.length || 0} course offerings`)

					// Debug: Show sample course offerings
					if (courseOfferings && courseOfferings.length > 0) {
						const sample = courseOfferings.slice(0, 3).map((co: any) => ({
							program_id: co.program_id,
							result_type: co.courses?.result_type,
							eval_type: co.courses?.evaluation_type
						}))
						console.log('[Status Grades Programs API] Sample course offerings:', sample)
					}

					// Filter program_ids (codes) based on statusType and evaluation_type
					const programCodesSet = new Set<string>()

					for (const co of (courseOfferings || [])) {
						const course = co.courses as any
						if (!course || !co.program_id) continue

						// CRITICAL: Only include Status-type courses (result_type = 'Status')
						const resultType = course.result_type?.toUpperCase() || ''
						if (resultType !== 'STATUS') continue

						// Filter by evaluation_type based on statusType
						const evalType = course.evaluation_type?.toUpperCase() || ''

						let shouldInclude = false
						if (statusType === 'Internal') {
							// Only CIA courses
							shouldInclude = evalType === 'CIA' || evalType === 'CIA ONLY'
						} else if (statusType === 'External') {
							// Only External/ESE courses
							shouldInclude = evalType === 'EXTERNAL' || evalType === 'ESE' || evalType === 'ESE ONLY'
						} else {
							// No status type filter - include all status courses
							shouldInclude = true
						}

						if (shouldInclude) {
							// program_id in course_offerings is the program CODE (like "PCH", "UCH")
							programCodesSet.add(co.program_id)
						}
					}

					console.log(`[Status Grades Programs API] Filtered to ${programCodesSet.size} unique program codes:`, Array.from(programCodesSet))

					if (programCodesSet.size === 0) {
						console.log('[Status Grades Programs API] No programs found after filtering')
						return NextResponse.json([])
					}

					// Step 3: Fetch programs from MyJKKN API
					const allPrograms: any[] = []
					const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

					for (const myjkknInstId of myjkknInstitutionIds) {
						try {
							console.log(`[Status Grades Programs API] Fetching programs for MyJKKN inst: ${myjkknInstId}`)

							const params = new URLSearchParams({
								limit: '100',
								is_active: 'true',
								institution_id: myjkknInstId
							})

							const res = await fetch(`${baseUrl}/api/myjkkn/programs?${params.toString()}`)

							if (!res.ok) {
								console.error(`[Status Grades Programs API] HTTP error ${res.status} for inst ${myjkknInstId}`)
								continue
							}

							const response = await res.json()
							const programs = response.data || response || []

							// Client-side filter by institution_id (MyJKKN API may not filter server-side)
							const filteredPrograms = Array.isArray(programs)
								? programs.filter((p: any) => p.institution_id === myjkknInstId && p.is_active !== false)
								: []

							console.log(`[Status Grades Programs API] Programs found for ${myjkknInstId}:`, filteredPrograms.length)
							allPrograms.push(...filteredPrograms)
						} catch (error) {
							console.error(`[Status Grades Programs API] Error fetching programs for inst ${myjkknInstId}:`, error)
						}
					}

					// Step 4: Filter MyJKKN programs to only those with Status courses and deduplicate by program_code
					console.log('[Status Grades Programs API] Program codes from course_offerings:', Array.from(programCodesSet))
					console.log('[Status Grades Programs API] Sample MyJKKN programs:', allPrograms.slice(0, 3).map(p => ({ program_id: p.program_id, program_code: p.program_code })))

					const programMap = new Map<string, any>()
					for (const prog of allPrograms) {
						// MyJKKN returns program_id as the CODE (e.g., "PCH", "UCH"), NOT a UUID
						const code = prog.program_id || prog.program_code

						// Only include programs that have Status-type courses in course_offerings
						if (code && programCodesSet.has(code) && !programMap.has(code)) {
							console.log(`[Status Grades Programs API] ✓ Matched program: ${code}`)
							programMap.set(code, {
								id: code, // Use code as ID for compatibility
								program_code: code,
								program_name: prog.program_name || prog.name || code
							})
						}
					}

					// Sort by program_code
					const uniquePrograms = Array.from(programMap.values()).sort((a, b) =>
						a.program_code.localeCompare(b.program_code)
					)

					console.log('[Status Grades Programs API] Returning', uniquePrograms.length, 'programs:', uniquePrograms.map(p => p.program_code).join(', '))

					return NextResponse.json(uniquePrograms)
				}

				case 'courses': {
					const institutionId = searchParams.get('institutionId')
					const sessionId = searchParams.get('sessionId')
					const programId = searchParams.get('programId')
					const statusType = searchParams.get('statusType') // 'Internal' or 'External'

					if (!institutionId) {
						return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
					}

					// Get courses with result_type = 'Status' that have exam registrations
					// First get course_offerings for this session/program
					let coQuery = supabase
						.from('course_offerings')
						.select(`
							id,
							course_id,
							courses:course_id (
								id,
								course_code,
								course_name,
								evaluation_type,
								result_type,
								institutions_id
							)
						`)
						.eq('institutions_id', institutionId)

					if (sessionId) {
						coQuery = coQuery.eq('examination_session_id', sessionId)
					}
					if (programId) {
						coQuery = coQuery.eq('program_id', programId)
					}

					const { data: courseOfferings, error: coError } = await coQuery.range(0, 9999)

					if (coError) {
						console.error('Error fetching course offerings:', coError)
						console.error('Full error details:', JSON.stringify(coError, null, 2))
						return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
					}

					// Filter for status-type courses only and deduplicate
					const seenCourseIds = new Set<string>()
					const statusCourses: any[] = []

					for (const co of (courseOfferings || [])) {
						const course = co.courses as any
						if (!course) continue
						if (course.result_type?.toUpperCase() !== 'STATUS') continue
						if (seenCourseIds.has(course.id)) continue

						// Filter by evaluation_type based on selected status type
						const evalType = course.evaluation_type?.toUpperCase() || ''
						if (statusType === 'Internal') {
							// Only CIA courses
							if (evalType !== 'CIA' && evalType !== 'CIA ONLY') continue
						} else if (statusType === 'External') {
							// Only External/ESE courses
							if (evalType !== 'EXTERNAL' && evalType !== 'ESE' && evalType !== 'ESE ONLY') continue
						}

						seenCourseIds.add(course.id)
						statusCourses.push({
							id: course.id,
							course_code: course.course_code,
							course_title: course.course_name, // Use course_name from DB
							evaluation_type: course.evaluation_type,
							result_type: course.result_type
						})
					}

					// Sort by course_code
					statusCourses.sort((a, b) => (a.course_code || '').localeCompare(b.course_code || ''))

					return NextResponse.json(statusCourses)
				}

				default:
					return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
			}
		}

		// =========================================================
		// Main GET: Fetch students with status grades for a course
		// =========================================================
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		const courseId = searchParams.get('course_id')
		const statusType = searchParams.get('status_type') as 'internal' | 'external'

		if (!institutionsId || !sessionId || !courseId || !statusType) {
			return NextResponse.json({
				error: 'Missing required parameters: institutions_id, examination_session_id, course_id, status_type'
			}, { status: 400 })
		}

		if (statusType !== 'internal' && statusType !== 'external') {
			return NextResponse.json({ error: 'status_type must be "internal" or "external"' }, { status: 400 })
		}

		// 1. Get course info to validate it is a status paper
		const { data: course, error: courseError } = await supabase
			.from('courses')
			.select('id, course_code, course_title, evaluation_type, result_type')
			.eq('id', courseId)
			.single()

		if (courseError || !course) {
			return NextResponse.json({ error: 'Course not found' }, { status: 404 })
		}

		if (course.result_type?.toUpperCase() !== 'STATUS') {
			return NextResponse.json({ error: 'This course is not a status-based paper' }, { status: 400 })
		}

		// 2. Get exam registrations for this course/session/institution
		const { data: examRegistrations, error: erError } = await supabase
			.from('exam_registrations')
			.select(`
				id,
				student_id,
				student_name,
				stu_register_no,
				course_offering_id,
				course_code
			`)
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.eq('course_code', course.course_code)
			.order('stu_register_no')
			.range(0, 9999)

		if (erError) {
			console.error('Error fetching exam registrations:', erError)
			return NextResponse.json({ error: 'Failed to fetch exam registrations' }, { status: 500 })
		}

		if (!examRegistrations || examRegistrations.length === 0) {
			return NextResponse.json({
				students: [],
				course_info: {
					course_code: course.course_code,
					course_title: course.course_title,
					evaluation_type: course.evaluation_type,
					result_type: course.result_type
				},
				total: 0
			})
		}

		// 3. Fetch existing grades from the appropriate table
		const studentIds = examRegistrations.map(er => er.student_id)
		const examRegIds = examRegistrations.map(er => er.id)

		let existingGrades: Map<string, { id: string; grade: string | null }> = new Map()

		if (statusType === 'internal') {
			// Fetch from internal_marks table
			const { data: internalMarks, error: imError } = await supabase
				.from('internal_marks')
				.select('id, student_id, grade')
				.eq('course_id', courseId)
				.in('student_id', studentIds)
				.eq('is_active', true)
				.range(0, 9999)

			if (imError) {
				console.error('Error fetching internal marks:', imError)
			} else if (internalMarks) {
				for (const im of internalMarks) {
					existingGrades.set(im.student_id, { id: im.id, grade: im.grade })
				}
			}
		} else {
			// Fetch from marks_entry table
			const { data: marksEntries, error: meError } = await supabase
				.from('marks_entry')
				.select('id, exam_registration_id, grade')
				.eq('course_id', courseId)
				.in('exam_registration_id', examRegIds)
				.eq('is_active', true)
				.range(0, 9999)

			if (meError) {
				console.error('Error fetching marks entries:', meError)
			} else if (marksEntries) {
				for (const me of marksEntries) {
					existingGrades.set(me.exam_registration_id, { id: me.id, grade: me.grade })
				}
			}
		}

		// 4. Build response rows
		const students = examRegistrations.map(er => {
			const lookupKey = statusType === 'internal' ? er.student_id : er.id
			const existing = existingGrades.get(lookupKey)

			return {
				id: existing?.id || er.id,
				student_id: er.student_id,
				exam_registration_id: er.id,
				register_no: er.stu_register_no || 'N/A',
				student_name: er.student_name || 'Unknown',
				course_id: courseId,
				course_code: course.course_code,
				course_name: course.course_title,
				current_grade: existing?.grade || null,
				new_grade: '',
				is_modified: false,
				is_saving: false,
				error: null,
				source_table: statusType === 'internal' ? 'internal_marks' : 'marks_entry',
				source_record_id: existing?.id || null
			}
		})

		return NextResponse.json({
			students,
			course_info: {
				course_code: course.course_code,
				course_title: course.course_title,
				evaluation_type: course.evaluation_type,
				result_type: course.result_type
			},
			total: students.length
		})
	} catch (error) {
		console.error('Status grades GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * POST /api/marks/status-grades
 *
 * Save a single status grade entry.
 *
 * Body:
 *   - student_id (required)
 *   - exam_registration_id (required)
 *   - course_id (required)
 *   - examination_session_id (required)
 *   - institutions_id (required)
 *   - status_type: 'internal' | 'external' (required)
 *   - grade: 'Commended' | 'Highly Commended' | 'AAA' (required)
 */
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			student_id,
			exam_registration_id,
			course_id,
			examination_session_id,
			institutions_id,
			status_type,
			grade
		} = body

		// Validate required fields
		if (!student_id || !exam_registration_id || !course_id || !examination_session_id || !institutions_id || !status_type || !grade) {
			return NextResponse.json({
				error: 'Missing required fields: student_id, exam_registration_id, course_id, examination_session_id, institutions_id, status_type, grade'
			}, { status: 400 })
		}

		// Validate grade value
		if (!isValidStatusGrade(grade)) {
			return NextResponse.json({
				error: `Invalid grade value "${grade}". Must be one of: ${VALID_STATUS_GRADES.join(', ')}`
			}, { status: 400 })
		}

		// Validate status_type
		if (status_type !== 'internal' && status_type !== 'external') {
			return NextResponse.json({ error: 'status_type must be "internal" or "external"' }, { status: 400 })
		}

		// Validate course is a status paper
		const { data: course, error: courseError } = await supabase
			.from('courses')
			.select('id, result_type, course_code')
			.eq('id', course_id)
			.single()

		if (courseError || !course) {
			return NextResponse.json({ error: 'Course not found' }, { status: 404 })
		}

		if (course.result_type?.toUpperCase() !== 'STATUS') {
			return NextResponse.json({ error: 'This course is not a status-based paper' }, { status: 400 })
		}

		// Validate student exists in exam_registrations
		const { data: examReg, error: erError } = await supabase
			.from('exam_registrations')
			.select('id, course_offering_id')
			.eq('id', exam_registration_id)
			.single()

		if (erError || !examReg) {
			return NextResponse.json({ error: 'Exam registration not found' }, { status: 404 })
		}

		if (status_type === 'internal') {
			// Update or insert internal_marks.grade
			const { data: existing } = await supabase
				.from('internal_marks')
				.select('id')
				.eq('student_id', student_id)
				.eq('course_id', course_id)
				.eq('is_active', true)
				.maybeSingle()

			if (existing) {
				// Update existing record
				const { data, error } = await supabase
					.from('internal_marks')
					.update({ grade, updated_at: new Date().toISOString() })
					.eq('id', existing.id)
					.select('id, grade')
					.single()

				if (error) {
					console.error('Error updating internal marks grade:', error)
					return NextResponse.json({ error: 'Failed to update grade' }, { status: 500 })
				}

				return NextResponse.json({ success: true, data, action: 'updated' })
			} else {
				// Insert new record with grade only (status papers have 0 marks)
				const { data, error } = await supabase
					.from('internal_marks')
					.insert({
						institutions_id,
						examination_session_id,
						exam_registration_id,
						course_offering_id: examReg.course_offering_id,
						program_id: null,
						course_id,
						student_id,
						grade,
						total_internal_marks: 0,
						max_internal_marks: 0,
						submission_date: new Date().toISOString().split('T')[0],
						marks_status: 'Draft',
						is_active: true
					})
					.select('id, grade')
					.single()

				if (error) {
					console.error('Error inserting internal marks grade:', error)
					if (error.code === '23505') {
						return NextResponse.json({ error: 'Grade already exists for this student and course' }, { status: 400 })
					}
					return NextResponse.json({ error: `Failed to save grade: ${error.message}` }, { status: 500 })
				}

				return NextResponse.json({ success: true, data, action: 'created' }, { status: 201 })
			}
		} else {
			// Update or insert marks_entry.grade
			const { data: existing } = await supabase
				.from('marks_entry')
				.select('id')
				.eq('exam_registration_id', exam_registration_id)
				.eq('course_id', course_id)
				.eq('is_active', true)
				.maybeSingle()

			if (existing) {
				// Update existing record
				const { data, error } = await supabase
					.from('marks_entry')
					.update({ grade, updated_at: new Date().toISOString() })
					.eq('id', existing.id)
					.select('id, grade')
					.single()

				if (error) {
					console.error('Error updating marks entry grade:', error)
					return NextResponse.json({ error: 'Failed to update grade' }, { status: 500 })
				}

				return NextResponse.json({ success: true, data, action: 'updated' })
			} else {
				// For marks_entry, we need more required fields - check if dummy number exists
				// For status papers without full external mark entry, create a minimal record
				const { data: dummyNumber } = await supabase
					.from('student_dummy_numbers')
					.select('id')
					.eq('exam_registration_id', exam_registration_id)
					.maybeSingle()

				const insertData: any = {
					institutions_id,
					examination_session_id,
					exam_registration_id,
					course_id,
					grade,
					total_marks_obtained: 0,
					total_marks_in_words: 'ZERO',
					marks_out_of: 0,
					evaluation_date: new Date().toISOString().split('T')[0],
					source: 'Status Grade Entry',
					entry_status: 'Draft',
					is_active: true
				}

				// Add optional fields if available
				if (dummyNumber) {
					insertData.student_dummy_number_id = dummyNumber.id
					insertData.dummy_number = 'STATUS'
				}

				const { data, error } = await supabase
					.from('marks_entry')
					.insert(insertData)
					.select('id, grade')
					.single()

				if (error) {
					console.error('Error inserting marks entry grade:', error)
					if (error.code === '23505') {
						return NextResponse.json({ error: 'Grade already exists for this student and course' }, { status: 400 })
					}
					return NextResponse.json({ error: `Failed to save grade: ${error.message}` }, { status: 500 })
				}

				return NextResponse.json({ success: true, data, action: 'created' }, { status: 201 })
			}
		}
	} catch (error) {
		console.error('Status grades POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * PUT /api/marks/status-grades
 *
 * Bulk update status grades for multiple students.
 *
 * Body:
 *   - institutions_id (required)
 *   - examination_session_id (required)
 *   - course_id (required)
 *   - status_type: 'internal' | 'external' (required)
 *   - grades: [{ student_id, exam_registration_id, grade }] (required)
 */
export async function PUT(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			institutions_id,
			examination_session_id,
			course_id,
			status_type,
			grades
		} = body

		if (!institutions_id || !examination_session_id || !course_id || !status_type || !grades || !Array.isArray(grades)) {
			return NextResponse.json({
				error: 'Missing required fields: institutions_id, examination_session_id, course_id, status_type, grades[]'
			}, { status: 400 })
		}

		if (grades.length === 0) {
			return NextResponse.json({ error: 'No grades to update' }, { status: 400 })
		}

		// Validate all grades
		const invalidGrades = grades.filter((g: any) => !isValidStatusGrade(g.grade))
		if (invalidGrades.length > 0) {
			return NextResponse.json({
				error: `Invalid grade values found. All grades must be one of: ${VALID_STATUS_GRADES.join(', ')}`
			}, { status: 400 })
		}

		// Validate course is status type
		const { data: course } = await supabase
			.from('courses')
			.select('id, result_type, course_code')
			.eq('id', course_id)
			.single()

		if (!course || course.result_type?.toUpperCase() !== 'STATUS') {
			return NextResponse.json({ error: 'Course is not a status-based paper' }, { status: 400 })
		}

		const results = {
			total: grades.length,
			successful: 0,
			failed: 0,
			errors: [] as { student_id: string; register_no: string; error: string }[]
		}

		const now = new Date().toISOString()
		const today = now.split('T')[0]

		if (status_type === 'internal') {
			// Batch-fetch all existing internal_marks records for these students + course
			const allStudentIds = grades.map((g: any) => g.student_id).filter(Boolean)

			const { data: existingRecords } = await supabase
				.from('internal_marks')
				.select('id, student_id')
				.eq('course_id', course_id)
				.in('student_id', allStudentIds)
				.eq('is_active', true)
				.range(0, 9999)

			// Build Map: student_id -> existing record id
			const existingMap = new Map<string, string>()
			if (existingRecords) {
				for (const rec of existingRecords) {
					existingMap.set(rec.student_id, rec.id)
				}
			}

			// Batch-fetch exam_registrations for course_offering_id (needed for inserts)
			const examRegIds = grades
				.filter((g: any) => !existingMap.has(g.student_id))
				.map((g: any) => g.exam_registration_id)
				.filter(Boolean)

			const examRegMap = new Map<string, string>()
			if (examRegIds.length > 0) {
				const { data: examRegs } = await supabase
					.from('exam_registrations')
					.select('id, course_offering_id')
					.in('id', examRegIds)
					.range(0, 9999)

				if (examRegs) {
					for (const er of examRegs) {
						examRegMap.set(er.id, er.course_offering_id)
					}
				}
			}

			// Separate into updates and inserts
			const recordsToUpdate: any[] = []
			const recordsToInsert: any[] = []

			for (const gradeEntry of grades) {
				const { student_id, exam_registration_id, grade } = gradeEntry
				const existingId = existingMap.get(student_id)

				if (existingId) {
					recordsToUpdate.push({ id: existingId, grade, updated_at: now })
				} else {
					recordsToInsert.push({
						institutions_id,
						examination_session_id,
						exam_registration_id,
						course_offering_id: examRegMap.get(exam_registration_id) || null,
						program_id: null,
						course_id,
						student_id,
						grade,
						total_internal_marks: 0,
						max_internal_marks: 0,
						submission_date: today,
						marks_status: 'Draft',
						is_active: true
					})
				}
			}

			// Bulk upsert updates (using upsert with onConflict: 'id')
			if (recordsToUpdate.length > 0) {
				const { error: updateError } = await supabase
					.from('internal_marks')
					.upsert(recordsToUpdate, { onConflict: 'id' })

				if (updateError) {
					console.error('Bulk update internal_marks error:', updateError)
					results.failed += recordsToUpdate.length
					for (const rec of recordsToUpdate) {
						const entry = grades.find((g: any) => existingMap.get(g.student_id) === rec.id)
						results.errors.push({
							student_id: entry?.student_id || '',
							register_no: entry?.register_no || 'N/A',
							error: updateError.message || 'Failed to update grade'
						})
					}
				} else {
					results.successful += recordsToUpdate.length
				}
			}

			// Bulk insert new records
			if (recordsToInsert.length > 0) {
				const { error: insertError } = await supabase
					.from('internal_marks')
					.insert(recordsToInsert)

				if (insertError) {
					console.error('Bulk insert internal_marks error:', insertError)
					results.failed += recordsToInsert.length
					for (const rec of recordsToInsert) {
						results.errors.push({
							student_id: rec.student_id,
							register_no: grades.find((g: any) => g.student_id === rec.student_id)?.register_no || 'N/A',
							error: insertError.message || 'Failed to save grade'
						})
					}
				} else {
					results.successful += recordsToInsert.length
				}
			}
		} else {
			// External - marks_entry
			const allExamRegIds = grades.map((g: any) => g.exam_registration_id).filter(Boolean)

			const { data: existingRecords } = await supabase
				.from('marks_entry')
				.select('id, exam_registration_id')
				.eq('course_id', course_id)
				.in('exam_registration_id', allExamRegIds)
				.eq('is_active', true)
				.range(0, 9999)

			// Build Map: exam_registration_id -> existing record id
			const existingMap = new Map<string, string>()
			if (existingRecords) {
				for (const rec of existingRecords) {
					existingMap.set(rec.exam_registration_id, rec.id)
				}
			}

			// Separate into updates and inserts
			const recordsToUpdate: any[] = []
			const recordsToInsert: any[] = []

			for (const gradeEntry of grades) {
				const { exam_registration_id, grade } = gradeEntry
				const existingId = existingMap.get(exam_registration_id)

				if (existingId) {
					recordsToUpdate.push({ id: existingId, grade, updated_at: now })
				} else {
					recordsToInsert.push({
						institutions_id,
						examination_session_id,
						exam_registration_id,
						course_id,
						grade,
						total_marks_obtained: 0,
						total_marks_in_words: 'ZERO',
						marks_out_of: 0,
						evaluation_date: today,
						source: 'Status Grade Entry',
						entry_status: 'Draft',
						is_active: true
					})
				}
			}

			// Bulk upsert updates
			if (recordsToUpdate.length > 0) {
				const { error: updateError } = await supabase
					.from('marks_entry')
					.upsert(recordsToUpdate, { onConflict: 'id' })

				if (updateError) {
					console.error('Bulk update marks_entry error:', updateError)
					results.failed += recordsToUpdate.length
					for (const rec of recordsToUpdate) {
						const entry = grades.find((g: any) => existingMap.get(g.exam_registration_id) === rec.id)
						results.errors.push({
							student_id: entry?.student_id || '',
							register_no: entry?.register_no || 'N/A',
							error: updateError.message || 'Failed to update grade'
						})
					}
				} else {
					results.successful += recordsToUpdate.length
				}
			}

			// Bulk insert new records
			if (recordsToInsert.length > 0) {
				const { error: insertError } = await supabase
					.from('marks_entry')
					.insert(recordsToInsert)

				if (insertError) {
					console.error('Bulk insert marks_entry error:', insertError)
					results.failed += recordsToInsert.length
					for (const rec of recordsToInsert) {
						results.errors.push({
							student_id: grades.find((g: any) => g.exam_registration_id === rec.exam_registration_id)?.student_id || '',
							register_no: grades.find((g: any) => g.exam_registration_id === rec.exam_registration_id)?.register_no || 'N/A',
							error: insertError.message || 'Failed to save grade'
						})
					}
				} else {
					results.successful += recordsToInsert.length
				}
			}
		}

		return NextResponse.json(results)
	} catch (error) {
		console.error('Status grades PUT error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
