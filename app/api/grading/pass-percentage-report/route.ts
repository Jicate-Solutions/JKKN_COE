import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNPrograms } from '@/lib/myjkkn-api'

const BATCH_SIZE = 1000

export async function GET(request: NextRequest) {
	const supabase = getSupabaseServer()
	const searchParams = request.nextUrl.searchParams

	const type = searchParams.get('type')
	const institutionId = searchParams.get('institution_id')
	const sessionId = searchParams.get('session_id')
	const reportType = searchParams.get('report_type') // 'board' | 'program'
	const boardCode = searchParams.get('board_code')
	const programCode = searchParams.get('program_code')

	try {
		// ─── Dropdown: Institutions ───────────────────────────────
		if (type === 'institutions') {
			const { data, error } = await supabase
				.from('institutions')
				.select('id, institution_code, name')
				.eq('is_active', true)
				.order('name')

			if (error) throw error
			return NextResponse.json((data || []).map(inst => ({
				id: inst.id,
				institution_code: inst.institution_code,
				institution_name: inst.name
			})))
		}

		// ─── Dropdown: Sessions ──────────────────────────────────
		if (type === 'sessions') {
			if (!institutionId) {
				return NextResponse.json({ error: 'institution_id is required' }, { status: 400 })
			}

			const { data, error } = await supabase
				.from('examination_sessions')
				.select('id, session_name, session_code, semester_type, exam_start_date')
				.eq('institutions_id', institutionId)
				.order('exam_start_date', { ascending: false })

			if (error) throw error
			return NextResponse.json((data || []).map(s => ({
				id: s.id,
				session_name: s.session_name,
				session_code: s.session_code,
				session_type: s.semester_type
			})))
		}

		// ─── Dropdown: Boards ────────────────────────────────────
		if (type === 'boards') {
			if (!institutionId) {
				return NextResponse.json({ error: 'institution_id is required' }, { status: 400 })
			}

			const { data, error } = await supabase
				.from('board')
				.select('id, board_code, board_name, display_name, board_order, board_type')
				.eq('institutions_id', institutionId)
				.eq('status', true)
				.order('board_order', { ascending: true })

			if (error) throw error
			return NextResponse.json((data || []).map(b => ({
				id: b.id,
				board_code: b.board_code,
				board_name: b.display_name || b.board_name,
				board_type: b.board_type || 'UG'
			})))
		}

		// ─── Dropdown: Programs ──────────────────────────────────
		if (type === 'programs') {
			if (!institutionId || !sessionId) {
				return NextResponse.json({ error: 'institution_id and session_id are required' }, { status: 400 })
			}

			// Fetch program_code + board_code from course_offerings → courses
			const { data: coRows, error: coError } = await supabase
				.from('course_offerings')
				.select('program_code, courses:course_id (board_code)')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			if (coError) throw coError

			const activeCodes = new Set((coRows || []).map((r: any) => r.program_code).filter(Boolean))
			if (activeCodes.size === 0) return NextResponse.json([])

			// Get board types to determine UG/PG for each program
			const { data: boardRows } = await supabase
				.from('board')
				.select('board_code, board_type')
				.eq('institutions_id', institutionId)

			const boardTypeMap = new Map((boardRows || []).map(b => [b.board_code, b.board_type || 'UG']))

			// Map each program_code to its board_type (UG/PG)
			const programTypeMap = new Map<string, string>()
			for (const co of (coRows || [])) {
				const progCode = co.program_code
				const boardCode = (co as any).courses?.board_code
				if (progCode && boardCode && !programTypeMap.has(progCode)) {
					programTypeMap.set(progCode, boardTypeMap.get(boardCode) || 'UG')
				}
			}

			// Enrich with MyJKKN program names
			const { data: institution } = await supabase
				.from('institutions')
				.select('myjkkn_institution_ids')
				.eq('id', institutionId)
				.single()

			let myjkknPrograms: any[] = []
			if (institution?.myjkkn_institution_ids?.length > 0) {
				try {
					myjkknPrograms = await fetchAllMyJKKNPrograms({ all: true } as any)
				} catch (e) {
					console.error('[Pass % Report] MyJKKN programs fetch failed:', e)
				}
			}

			const programMeta = new Map<string, { id: string; name: string; order: number }>()
			for (const p of myjkknPrograms) {
				const code = p?.program_id || p?.program_code
				if (!code || programMeta.has(code)) continue
				programMeta.set(code, {
					id: p.id || '',
					name: p.program_name || p.name || code,
					order: p.program_order ?? p.sort_order ?? 999,
				})
			}

			const result = Array.from(activeCodes).map(code => {
				const meta = programMeta.get(code)
				return {
					id: meta?.id || code,
					program_code: code,
					program_name: meta?.name || code,
					program_order: meta?.order ?? 999,
					program_type: programTypeMap.get(code) || 'UG',
				}
			}).sort((a, b) => {
				if (a.program_order !== b.program_order) return a.program_order - b.program_order
				return a.program_code.localeCompare(b.program_code)
			})

			return NextResponse.json(result)
		}

		// ─── Main Report ─────────────────────────────────────────
		if (!institutionId || !sessionId || !reportType) {
			return NextResponse.json({
				error: 'institution_id, session_id, and report_type are required'
			}, { status: 400 })
		}

		if (reportType === 'board' && !boardCode) {
			return NextResponse.json({ error: 'board_code is required for board-wise report' }, { status: 400 })
		}
		if (reportType === 'program' && !programCode) {
			return NextResponse.json({ error: 'program_code is required for program-wise report' }, { status: 400 })
		}

		console.log(`[Pass % Report] Generating ${reportType} report for institution=${institutionId}, session=${sessionId}`)

		// ── Step 1: Get institution info ──
		const { data: instData } = await supabase
			.from('institutions')
			.select('id, institution_code, name, myjkkn_institution_ids')
			.eq('id', institutionId)
			.single()

		if (!instData) {
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		// ── Step 2: Get session info ──
		const { data: sessionData } = await supabase
			.from('examination_sessions')
			.select('id, session_name, session_code')
			.eq('id', sessionId)
			.single()

		if (!sessionData) {
			return NextResponse.json({ error: 'Session not found' }, { status: 404 })
		}

		// ── Step 3: Get board/program info ──
		let boardInfo: { id: string; board_code: string; board_name: string; board_type: string } | null = null
		let programInfo: { program_code: string; program_name: string } | null = null

		if (reportType === 'board') {
			const { data: board } = await supabase
				.from('board')
				.select('id, board_code, board_name, display_name, board_type')
				.eq('board_code', boardCode)
				.eq('institutions_id', institutionId)
				.single()

			boardInfo = board ? {
				id: board.id,
				board_code: board.board_code,
				board_name: board.display_name || board.board_name,
				board_type: board.board_type || 'UG'
			} : null
		}

		if (reportType === 'program') {
			let progName = programCode!
			try {
				const allProgs = await fetchAllMyJKKNPrograms({ all: true } as any)
				const found = allProgs.find((p: any) => (p.program_id || p.program_code) === programCode)
				if (found) progName = found.program_name || found.name || programCode!
			} catch { /* fallback to code */ }
			programInfo = { program_code: programCode!, program_name: progName }
		}

		// ── Step 4: Fetch final_marks with course + offering joins ──
		// Uses the same pattern as Galley Report Course Analysis
		const finalMarksSelect = `
			id,
			internal_marks_obtained,
			external_marks_obtained,
			is_pass,
			pass_status,
			letter_grade,
			student_id,
			program_code,
			course_id,
			courses:course_id (
				id,
				course_code,
				course_name,
				evaluation_type,
				board_code
			),
			course_offerings:course_offering_id (
				semester
			)
		`

		// Paginated fetch of final_marks
		const allFinalMarks: any[] = []

		for (let offset = 0; ; offset += BATCH_SIZE) {
			let query = supabase
				.from('final_marks')
				.select(finalMarksSelect)
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)
				.range(offset, offset + BATCH_SIZE - 1)

			// For program-wise, filter by program_code directly
			if (reportType === 'program') {
				query = query.eq('program_code', programCode)
			}

			const { data, error } = await query

			if (error) throw error
			if (!data || data.length === 0) break

			allFinalMarks.push(...data)
			if (data.length < BATCH_SIZE) break
		}

		console.log(`[Pass % Report] Fetched ${allFinalMarks.length} final_marks records`)

		// ── Step 5: Filter by board (if board-wise) ──
		let filteredMarks = allFinalMarks
		if (reportType === 'board') {
			filteredMarks = allFinalMarks.filter(m => m.courses?.board_code === boardCode)
			console.log(`[Pass % Report] After board filter: ${filteredMarks.length} marks`)
		}

		// ── Step 5b: Fetch course_order from course_mapping ──
		const courseOrderMap = new Map<string, number>() // key: "course_id|program_code" → course_order
		const courseIds = [...new Set(filteredMarks.map(m => m.course_id).filter(Boolean))]
		if (courseIds.length > 0) {
			// Batch fetch course_mapping for all course_ids
			for (let i = 0; i < courseIds.length; i += BATCH_SIZE) {
				const batch = courseIds.slice(i, i + BATCH_SIZE)
				const { data: mappings } = await supabase
					.from('course_mapping')
					.select('course_id, program_code, course_order')
					.in('course_id', batch)

				if (mappings) {
					mappings.forEach((cm: any) => {
						const key = `${cm.course_id}|${cm.program_code || ''}`
						courseOrderMap.set(key, cm.course_order ?? 999)
						// Also store by course_id alone as fallback
						if (!courseOrderMap.has(cm.course_id)) {
							courseOrderMap.set(cm.course_id, cm.course_order ?? 999)
						}
					})
				}
			}
		}

		// ── Step 6: Enrich program names from MyJKKN ──
		const programNameMap = new Map<string, string>()
		try {
			const allProgs = await fetchAllMyJKKNPrograms({ all: true } as any)
			for (const p of allProgs) {
				const code = p?.program_id || p?.program_code
				if (code) programNameMap.set(code, p.program_name || p.name || code)
			}
		} catch { /* fallback to codes */ }

		// ── Step 7: Aggregate by Course → Programme ──
		// Key: "course_code|program_code"
		// Group into courses first, then programs within each course
		interface CourseProgData {
			course_code: string
			course_name: string
			semester: number
			course_order: number
			program_code: string
			program_name: string
			registered: number
			appeared: number
			absent: number
			passed: number
			reappear: number
		}

		const courseProgMap = new Map<string, CourseProgData>()

		filteredMarks.forEach(mark => {
			if (!mark.courses) return

			const courseCode = mark.courses.course_code
			const courseName = mark.courses.course_name
			const progCode = mark.program_code || 'UNKNOWN'
			const semester = mark.course_offerings?.semester || 0
			const key = `${courseCode}|${progCode}`

			// Resolve course_order: prefer program-specific, fallback to course_id-only
			const orderKey = `${mark.course_id}|${progCode}`
			const courseOrder = courseOrderMap.get(orderKey) ?? courseOrderMap.get(mark.course_id) ?? 999

			if (!courseProgMap.has(key)) {
				courseProgMap.set(key, {
					course_code: courseCode,
					course_name: courseName,
					semester,
					course_order: courseOrder,
					program_code: progCode,
					program_name: programNameMap.get(progCode) || progCode,
					registered: 0,
					appeared: 0,
					absent: 0,
					passed: 0,
					reappear: 0
				})
			}

			const data = courseProgMap.get(key)!
			data.registered++

			// Absent logic — same as Galley Report Course Analysis
			const evalType = (mark.courses?.evaluation_type || 'CIA + ESE').trim().toUpperCase()
			let isAbsent = false

			if (evalType === 'CIA') {
				isAbsent = mark.pass_status === 'Absent' ||
					mark.pass_status === 'AAA' ||
					mark.letter_grade === 'AAA' ||
					mark.internal_marks_obtained === null
			} else if (evalType === 'ESE') {
				isAbsent = mark.pass_status === 'Absent' ||
					mark.pass_status === 'AAA' ||
					mark.letter_grade === 'AAA' ||
					mark.external_marks_obtained === null
			} else {
				// CIA + ESE
				isAbsent = mark.pass_status === 'Absent' ||
					mark.pass_status === 'AAA' ||
					mark.letter_grade === 'AAA' ||
					(mark.external_marks_obtained === null && mark.internal_marks_obtained !== null)
			}

			if (isAbsent) {
				data.absent++
			} else {
				data.appeared++
				if (mark.is_pass) {
					data.passed++
				} else if (mark.pass_status === 'Reappear' || mark.pass_status === 'RA' || mark.letter_grade === 'U') {
					data.reappear++
				}
			}
		})

		// ── Step 8: Build structured response grouped by course ──
		// Group data by course_code
		const courseGroupMap = new Map<string, {
			course_code: string
			course_name: string
			semester: number
			course_order: number
			programs: Array<{
				semester: number
				program_code: string
				program_name: string
				total_students: number
				appeared: number
				passed: number
				pass_percentage: number
			}>
		}>()

		courseProgMap.forEach(cpd => {
			if (!courseGroupMap.has(cpd.course_code)) {
				courseGroupMap.set(cpd.course_code, {
					course_code: cpd.course_code,
					course_name: cpd.course_name,
					semester: cpd.semester,
					course_order: cpd.course_order,
					programs: []
				})
			}

			const passPercentage = cpd.appeared > 0
				? Math.round((cpd.passed / cpd.appeared) * 100)
				: 0

			courseGroupMap.get(cpd.course_code)!.programs.push({
				semester: cpd.semester,
				program_code: cpd.program_code,
				program_name: cpd.program_name,
				total_students: cpd.registered,
				appeared: cpd.appeared,
				passed: cpd.passed,
				pass_percentage: passPercentage
			})
		})

		// Sort courses by semester ASC → course_order ASC → course_code, sort programs within each course
		const courses = Array.from(courseGroupMap.values())
			.sort((a, b) => {
				if (a.semester !== b.semester) return a.semester - b.semester
				if (a.course_order !== b.course_order) return a.course_order - b.course_order
				return a.course_code.localeCompare(b.course_code)
			})
			.map(course => ({
				...course,
				programs: course.programs.sort((a, b) => a.program_name.localeCompare(b.program_name))
			}))

		return NextResponse.json({
			institution: { id: instData.id, name: instData.name, code: instData.institution_code },
			session: { id: sessionData.id, name: sessionData.session_name, code: sessionData.session_code },
			report_type: reportType,
			board: boardInfo,
			program: programInfo,
			courses,
			generated_at: new Date().toISOString()
		})

	} catch (error: any) {
		console.error('[Pass % Report] Error:', error)
		return NextResponse.json({ error: error.message || 'Failed to generate report' }, { status: 500 })
	}
}
