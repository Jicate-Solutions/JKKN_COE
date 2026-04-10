import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchMyJKKNStaff } from '@/lib/myjkkn-api'

// ---------------------------------------------------------------------------
// GET — Fetch data for examiner allotment page
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const action = searchParams.get('action')
		const supabase = getSupabaseServer()

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
			// action='boards'
			// Distinct boards with practical/project timetable entries
			// ------------------------------------------------------------------
			case 'boards': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				if (!institutionId || !sessionId) {
					return NextResponse.json({ error: 'institutionId and sessionId required' }, { status: 400 })
				}

				// 1. Get practical timetable course_ids
				const { data: timetables } = await supabase
					.from('exam_timetables')
					.select('course_id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('exam_type', 'Practical')
					.eq('is_published', true)

				if (!timetables || timetables.length === 0) return NextResponse.json([])

				const courseIds = [...new Set(timetables.map((t: any) => t.course_id).filter(Boolean))]
				if (courseIds.length === 0) return NextResponse.json([])

				// 2. Get board_code from courses
				const { data: courses } = await supabase
					.from('courses')
					.select('board_code')
					.in('id', courseIds)

				const boardCodes = [...new Set((courses || []).map((c: any) => c.board_code).filter(Boolean))]
				if (boardCodes.length === 0) return NextResponse.json([])

				// 3. Get board names from board table
				const { data: boards } = await supabase
					.from('board')
					.select('board_code, board_name, board_type, board_order')
					.in('board_code', boardCodes)
					.order('board_order')

				const result = (boards || []).map((b: any) => ({
					board_code: b.board_code,
					board_name: b.board_name || b.board_code,
					board_type: b.board_type || '',
					board_order: b.board_order || 0,
				}))

				// Add any board_codes from courses not in board table
				const foundCodes = new Set(result.map((r: any) => r.board_code))
				for (const code of boardCodes) {
					if (!foundCodes.has(code)) {
						result.push({ board_code: code, board_name: code, board_type: '', board_order: 999 })
					}
				}

				result.sort((a: any, b: any) => a.board_order - b.board_order || a.board_code.localeCompare(b.board_code))

				return NextResponse.json(result)
			}

			// ------------------------------------------------------------------
			// action='timetable-rows'
			// All practical timetable entries with course info, student counts,
			// and examiner assignments. Optional boardCode filter.
			// Sort: exam_date ASC -> FN before AN -> batch_no ASC
			// ------------------------------------------------------------------
			case 'timetable-rows': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				const boardCode = searchParams.get('boardCode')
				if (!institutionId || !sessionId) {
					return NextResponse.json({ error: 'institutionId and sessionId required' }, { status: 400 })
				}

				// Get all practical timetable entries
				const { data: allTimetables, error: ttError } = await supabase
					.from('exam_timetables')
					.select('id, exam_date, session, exam_time, batch_capacity, course_id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('exam_type', 'Practical')
					.eq('is_published', true)
					.range(0, 49999)

				if (ttError) {
					console.error('Error fetching timetables:', ttError)
					return NextResponse.json({ error: 'Failed to fetch timetables' }, { status: 400 })
				}
				if (!allTimetables || allTimetables.length === 0) return NextResponse.json([])

				const courseIds = [...new Set(allTimetables.map((t: any) => t.course_id).filter(Boolean))]

				const { data: courses } = await supabase
					.from('courses')
					.select('id, course_code, course_name, exam_duration, course_category, board_code')
					.in('id', courseIds)

				const courseMap = new Map<string, any>()
				for (const c of courses || []) {
					courseMap.set(c.id, c)
				}

				// Board filter: narrow to matching course_ids by board_code
				let timetables = allTimetables
				if (boardCode) {
					const allowedCourseIds = new Set<string>()
					for (const c of courses || []) {
						if (c.board_code === boardCode) {
							allowedCourseIds.add(c.id)
						}
					}
					timetables = timetables.filter((t: any) => allowedCourseIds.has(t.course_id))
				}

				if (timetables.length === 0) return NextResponse.json([])

				// Sort: exam_date ASC -> FN before AN
				const sorted = [...timetables].sort((a: any, b: any) => {
					if (a.exam_date !== b.exam_date) return a.exam_date < b.exam_date ? -1 : 1
					const sessionOrder = (s: string) => s === 'FN' ? 0 : 1
					return sessionOrder(a.session) - sessionOrder(b.session)
				})

				// Compute batch_no per course
				const batchCounters = new Map<string, number>()
				for (const row of sorted) {
					const key = (row as any).course_id
					const num = (batchCounters.get(key) || 0) + 1
					batchCounters.set(key, num);
					(row as any).batch_no = num
				}

				// Student counts + register ranges + examiner assignments
				const timetableIds = sorted.map((t: any) => t.id)

				// Group timetable IDs by board_code — fetch batch students per board
				// (per-board fetch works reliably; "all at once" hits server limits)
				const boardTimetableMap = new Map<string, string[]>()
				for (const t of sorted) {
					const bc = courseMap.get(t.course_id)?.board_code || 'UNKNOWN'
					if (!boardTimetableMap.has(bc)) boardTimetableMap.set(bc, [])
					boardTimetableMap.get(bc)!.push(t.id)
				}

				// Fetch batch students per board in parallel
				const batchStudentPromises = [...boardTimetableMap.values()].map(async (ids) => {
					const all: any[] = []
					let offset = 0
					const PAGE = 1000
					while (true) {
						const { data, error } = await supabase
							.from('practical_batch_students')
							.select('exam_timetable_id, exam_registration_id')
							.in('exam_timetable_id', ids)
							.range(offset, offset + PAGE - 1)
						if (error) { console.error('Error fetching batch students:', error); break }
						if (!data || data.length === 0) break
						all.push(...data)
						if (data.length < PAGE) break
						offset += PAGE
					}
					return all
				})

				// Paginated fetch helper for registrations
				async function fetchAllPages(table: string, selectCols: string, filterCol: string, filterValues: string[], pageSize = 1000): Promise<any[]> {
					const all: any[] = []
					const ID_BATCH = 100
					for (let i = 0; i < filterValues.length; i += ID_BATCH) {
						const idChunk = filterValues.slice(i, i + ID_BATCH)
						let offset = 0
						while (true) {
							const { data, error } = await supabase
								.from(table)
								.select(selectCols)
								.in(filterCol, idChunk)
								.range(offset, offset + pageSize - 1)
							if (error) { console.error(`Error fetching ${table}:`, error); break }
							if (!data || data.length === 0) break
							all.push(...data)
							if (data.length < pageSize) break
							offset += pageSize
						}
					}
					return all
				}

				const [batchStudentResults, { data: examinerAssignments }] = await Promise.all([
					Promise.all(batchStudentPromises),
					supabase
						.from('exam_timetable_examiners')
						.select('exam_timetable_id, examiner_type, staff_id, staff_name, staff_mobile, staff_designation, examiner_id')
						.in('exam_timetable_id', timetableIds)
						.range(0, 49999),
				])

				const batchStudents = batchStudentResults.flat()

				const studentCountMap = new Map<string, number>()
				for (const a of batchStudents) {
					studentCountMap.set(a.exam_timetable_id, (studentCountMap.get(a.exam_timetable_id) || 0) + 1)
				}

				const internalMap = new Map<string, any>()
				const externalMap = new Map<string, any>()
				const skilledMap = new Map<string, any>()
				const programmerMap = new Map<string, any>()
				for (const ea of examinerAssignments || []) {
					if (ea.examiner_type === 'internal') {
						internalMap.set(ea.exam_timetable_id, {
							staff_id: ea.staff_id,
							staff_name: ea.staff_name,
							staff_mobile: ea.staff_mobile,
							staff_designation: ea.staff_designation || '',
						})
					} else if (ea.examiner_type === 'external') {
						externalMap.set(ea.exam_timetable_id, {
							examiner_id: ea.examiner_id,
						})
					} else if (ea.examiner_type === 'skilled') {
						skilledMap.set(ea.exam_timetable_id, {
							staff_id: ea.staff_id,
							staff_name: ea.staff_name,
							staff_mobile: ea.staff_mobile,
							staff_designation: ea.staff_designation || '',
						})
					} else if (ea.examiner_type === 'programmer') {
						programmerMap.set(ea.exam_timetable_id, {
							staff_id: ea.staff_id,
							staff_name: ea.staff_name,
							staff_mobile: ea.staff_mobile,
							staff_designation: ea.staff_designation || '',
						})
					}
				}

				// Get external examiner details
				const examinerIds = [...new Set(
					(examinerAssignments || [])
						.filter((ea: any) => ea.examiner_type === 'external' && ea.examiner_id)
						.map((ea: any) => ea.examiner_id)
				)]

				const examinerDetailsMap = new Map<string, any>()
				if (examinerIds.length > 0) {
					const { data: examiners } = await supabase
						.from('examiners')
						.select('id, full_name, mobile, designation, department, institution_name, institution_address, address, city, state, pincode')
						.in('id', examinerIds)

					for (const e of examiners || []) {
						examinerDetailsMap.set(e.id, e)
					}
				}

				// Compute register ranges per timetable
				const registerRangeMap = new Map<string, { min: string; max: string }>()
				if (batchStudents && batchStudents.length > 0) {
					const regIds = [...new Set(batchStudents.map((bs: any) => bs.exam_registration_id).filter(Boolean))]

					if (regIds.length > 0) {
						// Use paginated fetch for registrations
						const allRegistrations = await fetchAllPages(
							'exam_registrations',
							'id, stu_register_no',
							'id',
							regIds
						)

						const regMap = new Map<string, string>()
						for (const r of allRegistrations) {
							if (r.stu_register_no) regMap.set(r.id, r.stu_register_no)
						}

						for (const bs of batchStudents) {
							const regNo = regMap.get(bs.exam_registration_id)
							if (!regNo) continue
							const existing = registerRangeMap.get(bs.exam_timetable_id)
							if (!existing) {
								registerRangeMap.set(bs.exam_timetable_id, { min: regNo, max: regNo })
							} else {
								if (regNo < existing.min) existing.min = regNo
								if (regNo > existing.max) existing.max = regNo
							}
						}
					}
				}

				// Build response
				const rows = sorted.map((t: any, idx: number) => {
					const course = courseMap.get(t.course_id) || {}
					const internal = internalMap.get(t.id) || null
					const external = externalMap.get(t.id) || null
					const skilled = skilledMap.get(t.id) || null
					const programmer = programmerMap.get(t.id) || null
					const externalDetail = external?.examiner_id
						? examinerDetailsMap.get(external.examiner_id) || null
						: null

					return {
						serial_number: idx + 1,
						timetable_id: t.id,
						exam_date: t.exam_date,
						session: t.session,
						exam_time: t.exam_time,
						batch_no: t.batch_no,
						batch_capacity: t.batch_capacity,
						course_id: t.course_id,
						course_code: course.course_code || '',
						course_title: course.course_name || '',
						course_category: course.course_category || '',
						board_code: course.board_code || '',
						exam_duration: course.exam_duration || null,
						student_count: studentCountMap.get(t.id) || 0,
						register_range: registerRangeMap.get(t.id) || null,
						internal_examiner: internal,
						external_examiner: externalDetail ? {
							examiner_id: externalDetail.id,
							full_name: externalDetail.full_name,
							mobile: externalDetail.mobile,
							designation: externalDetail.designation,
							department: externalDetail.department,
							institution_name: externalDetail.institution_name,
							institution_address: externalDetail.institution_address || '',
							address: externalDetail.address || '',
							city: externalDetail.city || '',
							state: externalDetail.state || '',
							pincode: externalDetail.pincode || '',
						} : null,
						skilled_examiner: skilled,
						programmer_examiner: programmer,
					}
				})

				return NextResponse.json(rows)
			}

			// ------------------------------------------------------------------
			// action='staff-search'
			// Proxy to MyJKKN staff API for internal examiner search
			// ------------------------------------------------------------------
			case 'staff-search': {
				const institutionId = searchParams.get('institutionId')
				const search = searchParams.get('search')
				if (!institutionId) return NextResponse.json({ error: 'institutionId required' }, { status: 400 })

				const { data: institution } = await supabase
					.from('institutions')
					.select('myjkkn_institution_ids')
					.eq('id', institutionId)
					.single()

				const myjkknIds = (institution as any)?.myjkkn_institution_ids || []
				if (myjkknIds.length === 0) return NextResponse.json([])

				const allStaff: any[] = []
				const seenIds = new Set<string>()

				for (const myjkknInstId of myjkknIds) {
					try {
						const response = await fetchMyJKKNStaff({
							institution_id: myjkknInstId,
							search: search || undefined,
							limit: 20,
							is_active: true,
						})
						const staffList = response?.data || response || []
						const searchLower = (search || '').toLowerCase()
						for (const s of Array.isArray(staffList) ? staffList : []) {
							// Filter by first_name only
							if (searchLower && !(s.first_name || '').toLowerCase().includes(searchLower)) continue
							if (s.id && !seenIds.has(s.id)) {
								seenIds.add(s.id)
								allStaff.push({
									id: s.id,
									staff_code: s.staff_code || '',
									name: s.first_name || '',
									designation: s.designation || '',
									department_code: s.department_code || '',
									phone: s.phone || '',
								})
							}
						}
					} catch (err) {
						console.error(`Error fetching staff for MyJKKN inst ${myjkknInstId}:`, err)
					}
				}

				return NextResponse.json(allStaff)
			}

			// ------------------------------------------------------------------
			// action='examiner-search'
			// Search local examiners table for external examiner
			// ------------------------------------------------------------------
			case 'examiner-search': {
				const search = searchParams.get('search')

				let query = supabase
					.from('examiners')
					.select('id, full_name, mobile, designation, department, institution_name')
					.eq('status', 'ACTIVE')

				if (search) {
					query = query.or(`full_name.ilike.%${search}%,mobile.ilike.%${search}%,department.ilike.%${search}%,institution_name.ilike.%${search}%`)
				}

				const { data, error } = await query.limit(30).order('full_name')

				if (error) {
					console.error('Error searching examiners:', error)
					return NextResponse.json({ error: 'Failed to search examiners' }, { status: 400 })
				}
				return NextResponse.json(data || [])
			}

			// ------------------------------------------------------------------
			// action='register-ranges'
			// Min & max register numbers per timetable_id from batch allotment
			// Query: timetableIds (comma-separated)
			// ------------------------------------------------------------------
			case 'register-ranges': {
				const timetableIdsParam = searchParams.get('timetableIds')
				if (!timetableIdsParam) {
					return NextResponse.json({ error: 'timetableIds required' }, { status: 400 })
				}

				const timetableIds = timetableIdsParam.split(',').filter(Boolean)
				if (timetableIds.length === 0) return NextResponse.json({})

				// Paginated fetch helper (same as timetable-rows action)
				async function fetchAllPagesRR(table: string, selectCols: string, filterCol: string, filterValues: string[], pageSize = 1000): Promise<any[]> {
					const all: any[] = []
					const ID_BATCH = 100
					for (let i = 0; i < filterValues.length; i += ID_BATCH) {
						const idChunk = filterValues.slice(i, i + ID_BATCH)
						let offset = 0
						while (true) {
							const { data, error } = await supabase
								.from(table)
								.select(selectCols)
								.in(filterCol, idChunk)
								.range(offset, offset + pageSize - 1)
							if (error) { console.error(`Error fetching ${table}:`, error); break }
							if (!data || data.length === 0) break
							all.push(...data)
							if (data.length < pageSize) break
							offset += pageSize
						}
					}
					return all
				}

				const batchAssignments = await fetchAllPagesRR(
					'practical_batch_students',
					'exam_timetable_id, exam_registration_id',
					'exam_timetable_id',
					timetableIds
				)

				if (batchAssignments.length === 0) return NextResponse.json({})

				// Get unique registration IDs
				const regIds = [...new Set(batchAssignments.map((ba: any) => ba.exam_registration_id))]

				const registrations = await fetchAllPagesRR(
					'exam_registrations',
					'id, stu_register_no',
					'id',
					regIds
				)

				// Build registration lookup
				const regMap = new Map<string, string>()
				for (const r of registrations || []) {
					if (r.stu_register_no) regMap.set(r.id, r.stu_register_no)
				}

				// Compute min/max per timetable_id
				const rangeMap: Record<string, { min: string; max: string }> = {}
				for (const ba of batchAssignments) {
					const regNo = regMap.get(ba.exam_registration_id)
					if (!regNo) continue

					if (!rangeMap[ba.exam_timetable_id]) {
						rangeMap[ba.exam_timetable_id] = { min: regNo, max: regNo }
					} else {
						if (regNo < rangeMap[ba.exam_timetable_id].min) {
							rangeMap[ba.exam_timetable_id].min = regNo
						}
						if (regNo > rangeMap[ba.exam_timetable_id].max) {
							rangeMap[ba.exam_timetable_id].max = regNo
						}
					}
				}

				return NextResponse.json(rangeMap)
			}

			default:
				return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 })
		}
	} catch (error) {
		console.error('Error in GET /api/pre-exam/examiner-allotment:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// ---------------------------------------------------------------------------
// PUT — Upsert examiner assignment (auto-save)
// Body: { timetable_id, examiner_type, institutions_id, ...examiner data }
// ---------------------------------------------------------------------------

export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()
		const { timetable_id, examiner_type, institutions_id } = body

		if (!timetable_id) return NextResponse.json({ error: 'timetable_id required' }, { status: 400 })
		if (!examiner_type || !['internal', 'external', 'skilled', 'programmer'].includes(examiner_type)) {
			return NextResponse.json({ error: 'examiner_type must be internal, external, skilled, or programmer' }, { status: 400 })
		}

		const upsertData: any = {
			exam_timetable_id: timetable_id,
			examiner_type,
			institutions_id: institutions_id || null,
			updated_at: new Date().toISOString(),
		}

		if (examiner_type === 'internal' || examiner_type === 'skilled' || examiner_type === 'programmer') {
			upsertData.staff_id = body.staff_id || null
			upsertData.staff_name = body.staff_name || null
			upsertData.staff_mobile = body.staff_mobile || null
			upsertData.staff_designation = body.staff_designation || null
			upsertData.examiner_id = null
		} else {
			upsertData.examiner_id = body.examiner_id || null
			upsertData.staff_id = null
			upsertData.staff_name = null
			upsertData.staff_mobile = null
		}

		const { data, error } = await supabase
			.from('exam_timetable_examiners')
			.upsert(upsertData, {
				onConflict: 'exam_timetable_id,examiner_type',
			})
			.select()
			.single()

		if (error) {
			console.error('Error upserting examiner assignment:', error)
			return NextResponse.json({ error: 'Failed to save examiner assignment' }, { status: 500 })
		}

		return NextResponse.json({ success: true, data })
	} catch (error) {
		console.error('Error in PUT /api/pre-exam/examiner-allotment:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// ---------------------------------------------------------------------------
// DELETE — Remove examiner assignment
// Query: ?timetable_id=xxx&examiner_type=internal|external|skilled|programmer
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const timetableId = searchParams.get('timetable_id')
		const examinerType = searchParams.get('examiner_type')
		const supabase = getSupabaseServer()

		if (!timetableId) return NextResponse.json({ error: 'timetable_id required' }, { status: 400 })
		if (!examinerType || !['internal', 'external', 'skilled', 'programmer'].includes(examinerType)) {
			return NextResponse.json({ error: 'examiner_type must be internal, external, skilled, or programmer' }, { status: 400 })
		}

		const { error } = await supabase
			.from('exam_timetable_examiners')
			.delete()
			.eq('exam_timetable_id', timetableId)
			.eq('examiner_type', examinerType)

		if (error) {
			console.error('Error deleting examiner assignment:', error)
			return NextResponse.json({ error: 'Failed to remove examiner assignment' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error in DELETE /api/pre-exam/examiner-allotment:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
