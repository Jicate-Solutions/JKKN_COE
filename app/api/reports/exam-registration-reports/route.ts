import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// Helper: fetch all pages from Supabase in parallel batches
async function fetchAllPaginated(
	queryFn: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>,
	pageSize = 1000
): Promise<any[]> {
	// Fetch first page to get initial data + check if more needed
	const { data: firstPage, error } = await queryFn(0, pageSize - 1)
	if (error || !firstPage || firstPage.length === 0) return firstPage || []
	if (firstPage.length < pageSize) return firstPage

	// Fetch remaining pages in parallel (estimate up to 20 pages = 20k rows)
	const allData = [...firstPage]
	let page = 1
	let hasMore = true

	while (hasMore) {
		// Fetch next 4 pages in parallel
		const pagePromises = []
		for (let i = 0; i < 4 && hasMore; i++) {
			const p = page + i
			pagePromises.push(queryFn(p * pageSize, (p + 1) * pageSize - 1))
		}
		const results = await Promise.all(pagePromises)
		for (const r of results) {
			if (r.data && r.data.length > 0) {
				allData.push(...r.data)
				if (r.data.length < pageSize) { hasMore = false; break }
			} else {
				hasMore = false
				break
			}
		}
		page += pagePromises.length
	}
	return allData
}

// Helper: run batched .in() queries in parallel
async function fetchBatchedIn<T>(
	ids: string[],
	batchFn: (batch: string[]) => Promise<{ data: T[] | null; error: any }>,
	batchSize = 200
): Promise<T[]> {
	if (ids.length === 0) return []
	const batches: string[][] = []
	for (let i = 0; i < ids.length; i += batchSize) {
		batches.push(ids.slice(i, i + batchSize))
	}
	const results = await Promise.all(batches.map(batch => batchFn(batch)))
	const all: T[] = []
	for (const r of results) {
		if (r.data) all.push(...r.data)
	}
	return all
}

// Helper: fetch paginated MyJKKN API for a single institution
async function fetchMyJKKNPaginated(
	apiUrl: string,
	endpoint: string,
	myjkknInstId: string,
	apiKey: string,
	pgSize = 200,
	earlyStopFn?: (profiles: any[]) => boolean
): Promise<any[]> {
	const all: any[] = []
	let pg = 1
	let hasMore = true

	while (hasMore) {
		const params = new URLSearchParams({
			institution_id: myjkknInstId,
			limit: String(pgSize),
			page: String(pg),
		})
		try {
			const response = await fetch(
				`${apiUrl}/api-management/${endpoint}?${params.toString()}`,
				{
					method: 'GET',
					headers: {
						'Authorization': `Bearer ${apiKey}`,
						'Accept': 'application/json',
						'Content-Type': 'application/json',
					},
					cache: 'no-store',
				}
			)
			if (response.ok) {
				const data = await response.json()
				const items = data.data || data || []
				all.push(...items)
				if (items.length < pgSize) { hasMore = false; break }
				// Early termination if caller says we have enough
				if (earlyStopFn && earlyStopFn(all)) { hasMore = false; break }
				pg++
			} else {
				hasMore = false
			}
		} catch {
			hasMore = false
		}
	}
	return all
}

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const report_type = searchParams.get('report_type')

		if (!institutions_id || !examination_session_id || !report_type) {
			return NextResponse.json(
				{ error: 'institutions_id, examination_session_id, and report_type are required' },
				{ status: 400 }
			)
		}

		// ── Phase 1: Fetch institution, session, and registrations in parallel ──
		const [{ data: institution }, { data: session }, allRegistrations] = await Promise.all([
			supabase.from('institutions').select('id, institution_code, name, myjkkn_institution_ids').eq('id', institutions_id).single(),
			supabase.from('examination_sessions').select('id, session_code, session_name').eq('id', examination_session_id).single(),
			fetchAllPaginated((from, to) =>
				supabase
					.from('exam_registrations')
					.select('id, stu_register_no, student_name, is_regular, attempt_number, fee_paid, fee_amount, program_code, course_offering_id, course_code')
					.eq('institutions_id', institutions_id)
					.eq('examination_session_id', examination_session_id)
					.order('stu_register_no', { ascending: true })
					.order('id', { ascending: true })
					.range(from, to)
			),
		])

		if (!institution || !session) {
			return NextResponse.json({ error: 'Institution or Session not found' }, { status: 404 })
		}

		if (allRegistrations.length === 0) {
			return NextResponse.json({
				report_type,
				institution_name: institution.name,
				institution_code: institution.institution_code,
				session_name: session.session_name,
				session_code: session.session_code,
				generated_at: new Date().toISOString(),
				data: [],
			})
		}

		// ── Phase 2: All independent lookups in parallel ──
		const courseOfferingIds = [...new Set(allRegistrations.map(r => r.course_offering_id).filter(Boolean))]
		const myjkknIds: string[] = institution.myjkkn_institution_ids || []
		const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
		const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

		const [
			allOfferings,
			allBoards,
			localPrograms,
			myjkknProgramsRaw,
		] = await Promise.all([
			// Course offerings (parallel batches)
			fetchBatchedIn(courseOfferingIds, (batch) =>
				supabase
					.from('course_offerings')
					.select('id, course_code, program_code, semester, course_id, courses:course_id(course_name, board_id, board_code, course_category)')
					.in('id', batch)
			),
			// All boards
			supabase.from('board').select('id, board_code, board_name, board_order, board_type').then(r => r.data || []),
			// Local programs
			supabase.from('programs').select('program_code, program_name, program_order').eq('institutions_id', institutions_id).eq('is_active', true).then(r => r.data || []),
			// MyJKKN programs (all institutions in parallel)
			(myjkknIds.length > 0 && myjkknApiKey)
				? Promise.all(myjkknIds.map(id => fetchMyJKKNPaginated(myjkknApiUrl, 'organizations/programs', id, myjkknApiKey)))
					.then(results => results.flat())
					.catch(() => [] as any[])
				: Promise.resolve([] as any[]),
		])

		// ── Phase 2b: Course mapping (needs course_ids from offerings) — parallel with MyJKKN profiles ──
		const uniqueCourseIds = [...new Set(allOfferings.map(o => o.course_id).filter(Boolean))]
		const registerNumbers = [...new Set(allRegistrations.map(r => r.stu_register_no).filter(Boolean))]
		const registerNumberSet = new Set(registerNumbers)

		const [courseMappings, myjkknProfilesRaw] = await Promise.all([
			// Course mapping (parallel batches)
			fetchBatchedIn(uniqueCourseIds, (batch) =>
				supabase.from('course_mapping').select('course_id, course_order').in('course_id', batch)
			),
			// MyJKKN learner profiles (all institutions in parallel, with early termination)
			(registerNumbers.length > 0 && myjkknIds.length > 0 && myjkknApiKey)
				? (() => {
					const foundSet = new Set<string>()
					return Promise.all(myjkknIds.map(instId =>
						fetchMyJKKNPaginated(myjkknApiUrl, 'learners/profiles', instId, myjkknApiKey, 200, (profiles) => {
							for (const p of profiles) {
								if (p.register_number && registerNumberSet.has(p.register_number)) {
									foundSet.add(p.register_number.toUpperCase())
								}
							}
							return foundSet.size >= registerNumbers.length
						})
					)).then(results => results.flat()).catch(() => [] as any[])
				})()
				: Promise.resolve([] as any[]),
		])

		// ── Phase 3: Build lookup maps (pure computation, fast) ──

		// Board maps
		const boardMap = new Map<string, { board_code: string; board_order: number; board_type: string | null }>()
		const boardCodeMap = new Map<string, { board_code: string; board_order: number; board_type: string | null }>()
		const boardNameMap = new Map<string, string>()
		for (const b of allBoards) {
			const info = { board_code: b.board_code, board_order: b.board_order ?? 999, board_type: b.board_type || null }
			boardMap.set(b.id, info)
			boardCodeMap.set(b.board_code, info)
			if (b.board_name) boardNameMap.set(b.board_code, b.board_name)
		}

		// Course mapping order
		const courseMappingOrderMap = new Map<string, number>()
		for (const m of courseMappings) {
			if (m.course_id && !courseMappingOrderMap.has(m.course_id)) {
				courseMappingOrderMap.set(m.course_id, m.course_order ?? 999)
			}
		}

		// Program names, order, and type (UG/PG)
		const programNameMap = new Map<string, string>()
		const programOrderMap = new Map<string, number>()
		const programTypeMap = new Map<string, string>()
		// MyJKKN programs first (primary source for program_order + program_type)
		for (const p of myjkknProgramsRaw) {
			const code = p.program_id || p.program_code || ''
			if (code && !programOrderMap.has(code)) {
				const order = p.program_order ?? p.sort_order
				if (order != null) programOrderMap.set(code, order)
			}
			if (code && !programNameMap.has(code)) {
				const pName = p.program_name || p.name || ''
				if (pName) programNameMap.set(code, pName)
			}
			if (code && !programTypeMap.has(code)) {
				const pType = (p.program_type || p.degree_type || '').toString().toUpperCase()
				if (pType === 'UG' || pType === 'PG') programTypeMap.set(code, pType)
			}
		}
		// Local programs as fallback for names and order
		for (const lp of localPrograms) {
			if (lp.program_code && lp.program_name && !programNameMap.has(lp.program_code)) {
				programNameMap.set(lp.program_code, lp.program_name)
			}
			if (lp.program_code && lp.program_order != null && !programOrderMap.has(lp.program_code)) {
				programOrderMap.set(lp.program_code, lp.program_order)
			}
		}
		// Fallback: use board_order as program_order (board_code = program_code in this system)
		for (const [boardCode, boardInfo] of boardCodeMap) {
			if (!programOrderMap.has(boardCode)) {
				programOrderMap.set(boardCode, boardInfo.board_order)
			}
		}
		// Program orders resolved: MyJKKN API → local programs → board_order fallback

		// MyJKKN learner name + DOB + gender maps
		const isStudentWise = report_type === 'student-wise-application' || report_type === 'student-wise-registration'
		const nameMap = new Map<string, string>()
		const dobMap = new Map<string, string>()
		const genderMap = new Map<string, string>()
		for (const lp of myjkknProfilesRaw) {
			const regNo = lp.register_number
			if (!regNo || !registerNumberSet.has(regNo)) continue
			const key = regNo.toUpperCase()
			if (!nameMap.has(key)) {
				const fullName = lp.student_name || lp.full_name || [lp.first_name, lp.last_name].filter(Boolean).join(' ')
				if (fullName) nameMap.set(key, fullName)
			}
			if (isStudentWise && !genderMap.has(key) && lp.gender) {
				const g = String(lp.gender).trim()
				if (g) genderMap.set(key, g.charAt(0).toUpperCase() + g.slice(1).toLowerCase())
			}
			if ((report_type === 'student-fee-details' || report_type === 'student-exam-registration' || report_type === 'student-wise-application' || report_type === 'student-wise-registration') && !dobMap.has(key) && lp.date_of_birth) {
				try {
					const dob = new Date(lp.date_of_birth)
					if (!isNaN(dob.getTime())) {
						dobMap.set(key, `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${dob.getFullYear()}`)
					} else {
						dobMap.set(key, lp.date_of_birth)
					}
				} catch {
					dobMap.set(key, lp.date_of_birth)
				}
			}
		}
		console.log(`[ExamReports] Names: ${nameMap.size}/${registerNumbers.length}, DOBs: ${dobMap.size}/${registerNumbers.length} from MyJKKN`)

		// Offering map
		const offeringMap = new Map(
			allOfferings.map(o => {
				const courseData = o.courses as any
				let boardInfo = courseData?.board_code
					? boardCodeMap.get(courseData.board_code)
					: boardMap.get(courseData?.board_id)

				if (!boardInfo && o.course_code && o.course_code.length >= 5) {
					const prefix = o.course_code.substring(2, 5)
					boardInfo = boardCodeMap.get(prefix)
					if (!boardInfo && o.program_code) boardInfo = boardCodeMap.get(o.program_code)
				}

				const programBoardInfo = boardCodeMap.get(o.program_code)

				return [o.id, {
					course_code: o.course_code,
					course_id: o.course_id,
					course_order: courseMappingOrderMap.get(o.course_id) ?? 999,
					board_type: boardInfo?.board_type || null,
					program_type: programTypeMap.get(o.program_code) || null,
					program_code: o.program_code,
					program_name: programNameMap.get(o.program_code) || boardNameMap.get(o.program_code) || null,
					semester: o.semester,
					course_name: (o.courses as any)?.course_name || null,
					course_category: (o.courses as any)?.course_category || null,
					board_code: boardInfo?.board_code || null,
					board_name: boardNameMap.get(boardInfo?.board_code || '') || null,
					board_order: boardInfo?.board_order ?? 999,
					program_order: programOrderMap.get(o.program_code) ?? 999,
					program_board_order: programBoardInfo?.board_order ?? 999,
				}]
			})
		)

		// Secondary lookup: course_code → offering data (for fallback when offering ID doesn't match)
		const courseCodeToOffering = new Map<string, any>()
		for (const [, offering] of offeringMap) {
			if (offering.course_code && !courseCodeToOffering.has(offering.course_code)) {
				courseCodeToOffering.set(offering.course_code, offering)
			}
		}

		// Find course_codes that are in registrations but not in any offering — fetch from courses table
		const unmatchedCodes = [...new Set(
			allRegistrations
				.filter(r => r.course_code && !offeringMap.has(r.course_offering_id) && !courseCodeToOffering.has(r.course_code))
				.map(r => r.course_code)
		)]
		const directCourses = unmatchedCodes.length > 0
			? await fetchBatchedIn(unmatchedCodes, (batch) =>
				supabase.from('courses').select('course_code, course_name, board_id, board_code, course_category').in('course_code', batch)
			)
			: []
		const directCourseMap = new Map(directCourses.map((c: any) => [c.course_code, c]))

		// ── Phase 4: Enrich registrations ──
		const enriched = allRegistrations.map(r => {
			const regNo = r.stu_register_no?.toUpperCase()
			// Use offering map → same course_code from another offering → direct courses lookup → minimal fallback
			const existingOffering = offeringMap.get(r.course_offering_id)
			let offering = existingOffering
			if (!offering && r.course_code) {
				// Try another offering with the same course_code (gets course_name, semester, etc.)
				const byCode = courseCodeToOffering.get(r.course_code)
				if (byCode) {
					// Use the other offering's data but override program_code from registration
					offering = { ...byCode, program_code: r.program_code || byCode.program_code }
				} else {
					// Build from direct courses lookup + registration data
					const directCourse = directCourseMap.get(r.course_code)
					const boardInfo = directCourse?.board_code
						? boardCodeMap.get(directCourse.board_code)
						: boardCodeMap.get(r.program_code)
					offering = {
						course_code: r.course_code,
						course_id: null,
						course_order: 999,
						board_type: boardInfo?.board_type || null,
						program_type: programTypeMap.get(r.program_code) || null,
						program_code: r.program_code || '',
						program_name: programNameMap.get(r.program_code) || boardNameMap.get(r.program_code) || null,
						semester: null,
						course_name: directCourse?.course_name || null,
						course_category: directCourse?.course_category || null,
						board_code: boardInfo?.board_code || null,
						board_name: boardNameMap.get(boardInfo?.board_code || '') || null,
						board_order: boardInfo?.board_order ?? 999,
						program_order: programOrderMap.get(r.program_code) ?? 999,
						program_board_order: boardCodeMap.get(r.program_code)?.board_order ?? 999,
					}
				}
			}
			return {
				...r,
				course_offering: offering,
				student_board_type: boardCodeMap.get(r.program_code)?.board_type || programTypeMap.get(r.program_code) || null,
				student_name: (regNo && nameMap.get(regNo)) || r.student_name,
				...(regNo && dobMap.has(regNo) ? { date_of_birth: dobMap.get(regNo) } : {}),
				...(regNo && genderMap.has(regNo) ? { gender: genderMap.get(regNo) } : {}),
			}
		})

		// ── Phase 5: Date-wise report enrichment (timetable + attendance) ──
		const isDateWiseReport = report_type === 'exam-date-wise-registration' || report_type === 'exam-date-wise-attendance' || report_type === 'board-wise-exam-timetable' || report_type === 'exam-date-wise-summary' || report_type === 'qp-packing-list'

		if (isDateWiseReport) {
			const registrationIds = enriched.map(r => r.id)

			// Fetch timetables (3 strategies) + practical batch allotment + attendance in parallel
			const [timetablesByOffering, timetablesByCourseId, practicalBatchRows, attendanceData] = await Promise.all([
				// Strategy 2: by course_offering_id
				fetchBatchedIn(courseOfferingIds, (batch) =>
					supabase
						.from('exam_timetables')
						.select('course_offering_id, exam_date, session')
						.eq('institutions_id', institutions_id)
						.eq('examination_session_id', examination_session_id)
						.eq('is_published', true)
						.in('course_offering_id', batch)
				),
				// Strategy 3: by course_id (for shared courses)
				fetchBatchedIn(uniqueCourseIds, (batch) =>
					supabase
						.from('exam_timetables')
						.select('course_id, exam_date, session')
						.eq('institutions_id', institutions_id)
						.eq('examination_session_id', examination_session_id)
						.eq('is_published', true)
						.in('course_id', batch)
				),
				// Strategy 1 (highest priority): practical batch allotment per learner
				// Each practical learner is allotted to a specific exam_timetable (date+session)
				fetchBatchedIn(registrationIds, (batch) =>
					supabase
						.from('practical_batch_students')
						.select('exam_registration_id, exam_timetables:exam_timetable_id(exam_date, session, is_published)')
						.in('exam_registration_id', batch)
				),
				// Attendance (only for attendance report)
				report_type === 'exam-date-wise-attendance'
					? fetchBatchedIn(
						registrationIds,
						(batch) => supabase.from('exam_attendance').select('exam_registration_id, attendance_status').in('exam_registration_id', batch)
					)
					: Promise.resolve([]),
			])

			// Build practical batch map: registration_id → {exam_date, session}
			// Highest priority — handles courses with multiple dates/sessions (e.g. practicals)
			const practicalTimetableMap = new Map<string, { exam_date: string; session: string }>()
			for (const pb of practicalBatchRows as any[]) {
				const tt = pb.exam_timetables
				if (pb.exam_registration_id && tt && tt.is_published && tt.exam_date) {
					practicalTimetableMap.set(pb.exam_registration_id, { exam_date: tt.exam_date, session: tt.session })
				}
			}

			// Build timetable maps
			const timetableByOfferingMap = new Map<string, { exam_date: string; session: string }>()
			for (const tt of timetablesByOffering) {
				if (tt.course_offering_id && !timetableByOfferingMap.has(tt.course_offering_id)) {
					timetableByOfferingMap.set(tt.course_offering_id, { exam_date: tt.exam_date, session: tt.session })
				}
			}
			const timetableByCourseIdMap = new Map<string, { exam_date: string; session: string }>()
			for (const tt of timetablesByCourseId) {
				if (tt.course_id && !timetableByCourseIdMap.has(tt.course_id)) {
					timetableByCourseIdMap.set(tt.course_id, { exam_date: tt.exam_date, session: tt.session })
				}
			}

			// Offering → course_id lookup
			const offeringToCourseId = new Map<string, string>()
			for (const o of allOfferings) {
				if (o.id && o.course_id) offeringToCourseId.set(o.id, o.course_id)
			}

			// Attendance set
			const attendancePresentSet = new Set<string>()
			for (const att of attendanceData) {
				if (att.attendance_status === 'Present') attendancePresentSet.add(att.exam_registration_id)
			}

			// Attach to enriched rows — priority: practical batch (per-learner) → offering → course_id
			// Track which strategy resolved each row (for diagnostics)
			const unresolvedDiag = new Map<string, {
				count: number
				course_name: string | null
				program_code: string | null
				course_offering_id: string | null
				course_id_known: boolean
				has_practical_batch_unpublished: boolean
				sample_register_no: string
			}>()

			for (const row of enriched) {
				const practicalTt = practicalTimetableMap.get(row.id)
				if (practicalTt) {
					row.exam_date = practicalTt.exam_date
					row.exam_session = practicalTt.session
				} else {
					const tt = timetableByOfferingMap.get(row.course_offering_id)
					if (tt) {
						row.exam_date = tt.exam_date
						row.exam_session = tt.session
					} else {
						const courseId = offeringToCourseId.get(row.course_offering_id)
						if (courseId) {
							const ttFallback = timetableByCourseIdMap.get(courseId)
							if (ttFallback) {
								row.exam_date = ttFallback.exam_date
								row.exam_session = ttFallback.session
							}
						}
					}
				}
				if (report_type === 'exam-date-wise-attendance') {
					row.is_present = attendancePresentSet.has(row.id)
				}

				// Diagnostic: track rows that ended up without an exam_date
				if (!row.exam_date) {
					const co = row.course_offering
					const code = co?.course_code || row.course_code || 'UNKNOWN'
					const courseId = offeringToCourseId.get(row.course_offering_id) || null
					if (!unresolvedDiag.has(code)) {
						unresolvedDiag.set(code, {
							count: 0,
							course_name: co?.course_name || null,
							program_code: co?.program_code || row.program_code || null,
							course_offering_id: row.course_offering_id || null,
							course_id_known: !!courseId,
							has_practical_batch_unpublished: false,
							sample_register_no: row.stu_register_no || '',
						})
					}
					unresolvedDiag.get(code)!.count++
				}
			}

			// Diagnostic: detect practical_batch_students rows that exist but reference unpublished timetables
			const unpublishedPbRegIds = new Set<string>()
			for (const pb of practicalBatchRows as any[]) {
				const tt = pb.exam_timetables
				if (pb.exam_registration_id && tt && !tt.is_published) {
					unpublishedPbRegIds.add(pb.exam_registration_id)
				}
			}
			if (unpublishedPbRegIds.size > 0) {
				for (const row of enriched) {
					if (!row.exam_date && unpublishedPbRegIds.has(row.id)) {
						const code = row.course_offering?.course_code || row.course_code || 'UNKNOWN'
						const entry = unresolvedDiag.get(code)
						if (entry) entry.has_practical_batch_unpublished = true
					}
				}
			}

			if (unresolvedDiag.size > 0) {
				console.warn(`[ExamReports] ${unresolvedDiag.size} course(s) DROPPED from ${report_type} (no exam_date resolved):`)
				for (const [code, info] of unresolvedDiag) {
					console.warn(`  • ${code} (${info.course_name || 'no name'}) | program=${info.program_code} | regs=${info.count} | offering_id=${info.course_offering_id} | course_id_known=${info.course_id_known} | unpublished_practical_batch=${info.has_practical_batch_unpublished} | sample_learner=${info.sample_register_no}`)
				}
			}
		}

		// Student Exam Registration (program-wise & student-wise): only regular papers (is_regular = true)
		const responseData = (report_type === 'student-exam-registration' || report_type === 'student-wise-registration')
			? enriched.filter((r: any) => r.is_regular === true)
			: enriched

		return NextResponse.json({
			report_type,
			institution_name: institution.name,
			institution_code: institution.institution_code,
			session_name: session.session_name,
			session_code: session.session_code,
			generated_at: new Date().toISOString(),
			data: responseData,
		})
	} catch (e) {
		console.error('Exam registration reports API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
