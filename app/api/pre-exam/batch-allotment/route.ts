import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNPrograms } from '@/lib/myjkkn-api'

// ---------------------------------------------------------------------------
// GET — Fetch data for batch allotment page
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const action = searchParams.get('action')
		const supabase = getSupabaseServer()

		// Institution filter params
		const institutionCode = searchParams.get('institution_code')
		const institutionsIdParam = searchParams.get('institutions_id')

		switch (action) {

			// ------------------------------------------------------------------
			// action='institutions'
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
			// Requires: institutionId
			// ------------------------------------------------------------------
			case 'sessions': {
				const institutionId = searchParams.get('institutionId')
				if (!institutionId) return NextResponse.json({ error: 'institutionId required' }, { status: 400 })

				const { data, error } = await supabase
					.from('examination_sessions')
					.select('id, session_name, session_code')
					.eq('institutions_id', institutionId)
					.order('session_name', { ascending: false })

				if (error) {
					console.error('Error fetching sessions:', error)
					return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 400 })
				}
				return NextResponse.json(data)
			}

			// ------------------------------------------------------------------
			// action='practical-courses'
			// Return courses that have published Practical timetable entries.
			// Requires: institutionId, sessionId
			// ------------------------------------------------------------------
			case 'practical-courses': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				if (!institutionId || !sessionId) {
					return NextResponse.json({ error: 'institutionId and sessionId required' }, { status: 400 })
				}

				// Get all practical timetable entries for this institution+session
				const { data: timetables, error: ttError } = await supabase
					.from('exam_timetables')
					.select('course_id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('exam_type', 'Practical')
					.eq('is_published', true)

				if (ttError) {
					console.error('Error fetching practical timetables:', ttError)
					return NextResponse.json({ error: 'Failed to fetch timetables' }, { status: 400 })
				}
				if (!timetables || timetables.length === 0) return NextResponse.json([])

				const courseIds = [...new Set(timetables.map((t: any) => t.course_id).filter(Boolean))]

				if (courseIds.length === 0) return NextResponse.json([])

				const { data: courses, error: courseError } = await supabase
					.from('courses')
					.select('id, course_code, course_name')
					.in('id', courseIds)
					.order('course_code')

				if (courseError) {
					console.error('Error fetching courses:', courseError)
					return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 400 })
				}
				return NextResponse.json(courses || [])
			}

			// ------------------------------------------------------------------
			// action='batches'
			// Return all practical timetable rows for a course, with assignment counts.
			// Sort: exam_date ASC, FN before AN. Each row gets a 1-indexed batch_no.
			// Requires: institutionId, sessionId, courseId
			// ------------------------------------------------------------------
			case 'batches': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				const courseId = searchParams.get('courseId')
				if (!institutionId || !sessionId || !courseId) {
					return NextResponse.json({ error: 'institutionId, sessionId, courseId required' }, { status: 400 })
				}

				// Get timetable rows
				const { data: rows, error } = await supabase
					.from('exam_timetables')
					.select('id, exam_date, session, exam_time, batch_capacity, course_id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('course_id', courseId)
					.eq('exam_type', 'Practical')
					.eq('is_published', true)

				if (error) {
					console.error('Error fetching practical batches:', error)
					return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 400 })
				}
				if (!rows || rows.length === 0) return NextResponse.json([])

				// Sort: date ASC, FN before AN
				const sorted = [...rows].sort((a: any, b: any) => {
					if (a.exam_date !== b.exam_date) return a.exam_date < b.exam_date ? -1 : 1
					const sessionOrder = (s: string) => s === 'FN' ? 0 : 1
					return sessionOrder(a.session) - sessionOrder(b.session)
				})

				// Get assigned counts per timetable from practical_batch_students
				const timetableIds = sorted.map((r: any) => r.id)
				const { data: assignments } = await supabase
					.from('practical_batch_students')
					.select('exam_timetable_id')
					.in('exam_timetable_id', timetableIds)

				const countMap = new Map<string, number>()
				for (const a of assignments || []) {
					countMap.set(a.exam_timetable_id, (countMap.get(a.exam_timetable_id) || 0) + 1)
				}

				const batches = sorted.map((row: any, idx: number) => ({
					...row,
					batch_no: idx + 1,
					assigned_count: countMap.get(row.id) || 0,
				}))

				return NextResponse.json(batches)
			}

			// ------------------------------------------------------------------
			// action='unassigned-students'
			// Return students registered for this course who are NOT yet assigned
			// to ANY practical batch for this course.
			// Sorted by: program_order ASC, is_regular DESC, register_no ASC
			// Requires: institutionId, sessionId, courseId
			// ------------------------------------------------------------------
			case 'unassigned-students': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				const courseId = searchParams.get('courseId')
				if (!institutionId || !sessionId || !courseId) {
					return NextResponse.json({ error: 'institutionId, sessionId, courseId required' }, { status: 400 })
				}

				// Get course_code from courses table
				const { data: course } = await supabase
					.from('courses')
					.select('course_code')
					.eq('id', courseId)
					.single()

				if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

				// Get ALL registrations for this course.
				// fee_paid is not filtered on - the flag is unreliable here, and gating on
				// it left registered learners unallotted.
				const { data: allRegistrations, error: regError } = await supabase
					.from('exam_registrations')
					.select('id, stu_register_no, student_name, is_regular, program_code')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('course_code', (course as any).course_code)
					.range(0, 9999)

				if (regError) {
					console.error('Error fetching registrations:', regError)
					return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 400 })
				}
				if (!allRegistrations || allRegistrations.length === 0) {
					return NextResponse.json({
						students: [],
						total_registered: 0,
						total_assigned: 0,
						total_unassigned: 0,
					})
				}

				// Get ALL timetable rows for this course to find already-assigned students
				const { data: timetables } = await supabase
					.from('exam_timetables')
					.select('id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('course_id', courseId)
					.eq('exam_type', 'Practical')

				const timetableIds = (timetables || []).map((t: any) => t.id)

				// Get already-assigned registration IDs
				let assignedRegIds = new Set<string>()
				if (timetableIds.length > 0) {
					const { data: assigned } = await supabase
						.from('practical_batch_students')
						.select('exam_registration_id')
						.in('exam_timetable_id', timetableIds)

					assignedRegIds = new Set((assigned || []).map((a: any) => a.exam_registration_id))
				}

				// Filter out already-assigned students
				const unassigned = allRegistrations.filter((r: any) => !assignedRegIds.has(r.id))

				// Get program names from MyJKKN
				const programCodes = [...new Set(unassigned.map((r: any) => r.program_code).filter(Boolean))]
				let programNameMap = new Map<string, string>()
				if (programCodes.length > 0) {
					// Fetch program names from MyJKKN via institution's myjkkn_institution_ids
					const { data: inst } = await supabase
						.from('institutions')
						.select('myjkkn_institution_ids')
						.eq('id', institutionId)
						.single()
					const myjkknIds: string[] = (inst as any)?.myjkkn_institution_ids || []
					for (const myjkknInstId of myjkknIds) {
						try {
							const myjkknPrograms = await fetchAllMyJKKNPrograms({
								institution_id: myjkknInstId,
								limit: 100,
							})
							for (const p of myjkknPrograms) {
								const code = p.program_code || (p as any).program_id
								if (code && !programNameMap.has(code)) {
									programNameMap.set(code, p.program_name || '')
								}
							}
						} catch { /* MyJKKN fetch failed — continue without names */ }
					}
				}

				// Sort: program_code ASC -> regular first -> register_no ASC
				const sorted = [...unassigned].sort((a: any, b: any) => {
					const codeA = a.program_code || ''
					const codeB = b.program_code || ''
					if (codeA !== codeB) return codeA.localeCompare(codeB)

					const regA = a.is_regular !== false ? 1 : 0
					const regB = b.is_regular !== false ? 1 : 0
					if (regA !== regB) return regB - regA

					return (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
				})

				const students = sorted.map((s: any, idx: number) => ({
					serial_number: idx + 1,
					exam_registration_id: s.id,
					register_number: s.stu_register_no || '',
					student_name: s.student_name || '',
					is_regular: s.is_regular ?? true,
					program_code: s.program_code || '',
					program_name: programNameMap.get(s.program_code) || '',
				}))

				return NextResponse.json({
					students,
					total_registered: allRegistrations.length,
					total_assigned: assignedRegIds.size,
					total_unassigned: students.length,
				})
			}

			// ------------------------------------------------------------------
			// action='batch-assigned-students'
			// Return students assigned to a specific batch (timetable row).
			// Requires: timetableId
			// ------------------------------------------------------------------
			case 'batch-assigned-students': {
				const timetableId = searchParams.get('timetableId')
				if (!timetableId) return NextResponse.json({ error: 'timetableId required' }, { status: 400 })

				const { data: assignments, error } = await supabase
					.from('practical_batch_students')
					.select('exam_registration_id, institutions_id')
					.eq('exam_timetable_id', timetableId)

				if (error) {
					console.error('Error fetching batch assignments:', error)
					return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 400 })
				}

				const regIds = (assignments || []).map((a: any) => a.exam_registration_id)
				if (regIds.length === 0) return NextResponse.json([])

				// Get institutions_id from first assignment for MyJKKN lookup
				const baInstitutionId = (assignments as any)?.[0]?.institutions_id

				const { data: students, error: studentsError } = await supabase
					.from('exam_registrations')
					.select('id, stu_register_no, student_name, is_regular, program_code')
					.in('id', regIds)

				if (studentsError) {
					console.error('Error fetching assigned students:', studentsError)
					return NextResponse.json({ error: 'Failed to fetch students' }, { status: 400 })
				}

				// Get program names from MyJKKN
				const baProgramCodes = [...new Set((students || []).map((r: any) => r.program_code).filter(Boolean))]
				const baProgramNameMap = new Map<string, string>()
				if (baProgramCodes.length > 0 && baInstitutionId) {
					const { data: baInst } = await supabase
						.from('institutions')
						.select('myjkkn_institution_ids')
						.eq('id', baInstitutionId)
						.single()
					const baMyjkknIds: string[] = (baInst as any)?.myjkkn_institution_ids || []
					for (const myjkknInstId of baMyjkknIds) {
						try {
							const myjkknPrograms = await fetchAllMyJKKNPrograms({
								institution_id: myjkknInstId,
								limit: 100,
							})
							for (const p of myjkknPrograms) {
								const code = p.program_code || (p as any).program_id
								if (code && !baProgramNameMap.has(code)) {
									baProgramNameMap.set(code, p.program_name || '')
								}
							}
						} catch { /* MyJKKN fetch failed — continue without names */ }
					}
				}

				const baSorted = [...(students || [])].sort((a: any, b: any) => {
					const codeA = a.program_code || ''
					const codeB = b.program_code || ''
					if (codeA !== codeB) return codeA.localeCompare(codeB)
					const regA = a.is_regular !== false ? 1 : 0
					const regB = b.is_regular !== false ? 1 : 0
					if (regA !== regB) return regB - regA
					return (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
				})

				const baResult = baSorted.map((s: any, idx: number) => ({
					serial_number: idx + 1,
					exam_registration_id: s.id,
					register_number: s.stu_register_no || '',
					student_name: s.student_name || '',
					is_regular: s.is_regular ?? true,
					program_code: s.program_code || '',
					program_name: baProgramNameMap.get(s.program_code) || '',
				}))

				return NextResponse.json(baResult)
			}

			default:
				return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 })
		}
	} catch (error) {
		console.error('Error in GET /api/pre-exam/batch-allotment:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// ---------------------------------------------------------------------------
// POST — Save batch assignments
// Body: { timetable_id, institutions_id, exam_registration_ids: string[] }
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()
		const { timetable_id, institutions_id, exam_registration_ids } = body

		if (!timetable_id) return NextResponse.json({ error: 'timetable_id required' }, { status: 400 })
		if (!institutions_id) return NextResponse.json({ error: 'institutions_id required' }, { status: 400 })
		if (!Array.isArray(exam_registration_ids) || exam_registration_ids.length === 0) {
			return NextResponse.json({ error: 'exam_registration_ids array required' }, { status: 400 })
		}

		// Verify timetable exists and is Practical
		const { data: timetable, error: ttError } = await supabase
			.from('exam_timetables')
			.select('id, batch_capacity, exam_type')
			.eq('id', timetable_id)
			.single()

		if (ttError || !timetable) {
			return NextResponse.json({ error: 'Timetable entry not found' }, { status: 404 })
		}

		if ((timetable as any).exam_type !== 'Practical') {
			return NextResponse.json({ error: 'Timetable entry is not a Practical exam' }, { status: 400 })
		}

		// Check: current assigned + new assignments must not exceed batch_capacity
		const capacity = (timetable as any).batch_capacity || 0

		const { data: existingAssignments } = await supabase
			.from('practical_batch_students')
			.select('id')
			.eq('exam_timetable_id', timetable_id)

		const currentCount = existingAssignments?.length || 0
		const totalAfterAssign = currentCount + exam_registration_ids.length

		if (totalAfterAssign > capacity) {
			return NextResponse.json({
				error: `Cannot assign ${exam_registration_ids.length} students — batch has ${currentCount}/${capacity} assigned, would exceed capacity`,
			}, { status: 400 })
		}

		// Build insert rows
		const rows = exam_registration_ids.map((regId: string) => ({
			exam_timetable_id: timetable_id,
			exam_registration_id: regId,
			institutions_id,
		}))

		const { data, error } = await supabase
			.from('practical_batch_students')
			.insert(rows)
			.select()

		if (error) {
			if (error.code === '23505') {
				return NextResponse.json({ error: 'Some students are already assigned to this batch' }, { status: 400 })
			}
			if (error.code === '23503') {
				return NextResponse.json({ error: 'Invalid timetable or registration reference' }, { status: 400 })
			}
			console.error('Error saving batch assignments:', error)
			return NextResponse.json({ error: 'Failed to save assignments' }, { status: 500 })
		}

		return NextResponse.json({
			success: true,
			assigned: data?.length || 0,
		}, { status: 201 })
	} catch (error) {
		console.error('Error in POST /api/pre-exam/batch-allotment:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// ---------------------------------------------------------------------------
// DELETE — Remove all assignments for a specific timetable row (re-assign)
// Query param: timetable_id
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const timetableId = searchParams.get('timetable_id')
		const supabase = getSupabaseServer()

		if (!timetableId) return NextResponse.json({ error: 'timetable_id required' }, { status: 400 })

		const { error } = await supabase
			.from('practical_batch_students')
			.delete()
			.eq('exam_timetable_id', timetableId)

		if (error) {
			console.error('Error deleting batch assignments:', error)
			return NextResponse.json({ error: 'Failed to remove assignments' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error in DELETE /api/pre-exam/batch-allotment:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
