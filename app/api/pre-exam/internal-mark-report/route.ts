import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const supabase = getSupabaseServer()
		const action = searchParams.get('action')

		// Reuse filter-cascade from internal-mark-entry for programs/semesters/courses
		// Assessment options — NO date filtering (show all rounds)
		if (action === 'assessments') {
			const institutionsId = searchParams.get('institutions_id')
			const sessionId = searchParams.get('examination_session_id')

			if (!institutionsId || !sessionId) {
				return NextResponse.json({ error: 'institutions_id and examination_session_id required' }, { status: 400 })
			}

			const { data, error } = await supabase
				.from('cia_entry_settings')
				.select('*')
				.eq('institutions_id', institutionsId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			if (error) {
				return NextResponse.json({ error: 'Failed to fetch assessments' }, { status: 500 })
			}

			// Return ALL rounds without date filtering
			const options: any[] = []
			for (const setting of (data || [])) {
				for (const round of (setting.cia_rounds || [])) {
					options.push({
						id: `${setting.id}__${round.round}`,
						label: `${setting.setting_name} - ${round.round_name}`,
						setting,
						round,
					})
				}
			}
			return NextResponse.json(options)
		}

		// Get report data — learners with marks + dummy numbers
		if (action === 'report-data') {
			const courseOfferingId = searchParams.get('course_offering_id')
			const sessionId = searchParams.get('examination_session_id')
			const programCode = searchParams.get('program_code')
			const ciaRound = searchParams.get('cia_round') || '1'

			if (!courseOfferingId || !sessionId) {
				return NextResponse.json({ error: 'course_offering_id and examination_session_id required' }, { status: 400 })
			}

			// Get course_code from offering
			const { data: offering } = await supabase
				.from('course_offerings')
				.select('course_code')
				.eq('id', courseOfferingId)
				.single()

			const courseCode = offering?.course_code

			// Fetch registrations
			let regQuery = supabase
				.from('exam_registrations')
				.select('id, student_id, stu_register_no, student_name, course_offering_id')
				.eq('examination_session_id', sessionId)
				.eq('is_regular', true)
				.order('stu_register_no')

			if (courseCode) regQuery = regQuery.eq('course_code', courseCode)
			else regQuery = regQuery.eq('course_offering_id', courseOfferingId)
			if (programCode) regQuery = regQuery.eq('program_code', programCode)

			const { data: registrations, error: regError } = await regQuery.range(0, 9999)
			if (regError) return NextResponse.json({ error: 'Failed to fetch learners' }, { status: 500 })
			if (!registrations || registrations.length === 0) return NextResponse.json([])

			// Fetch cia_marks for this round
			const allCOIds = [...new Set(registrations.map(r => r.course_offering_id))]
			const { data: marks } = await supabase
				.from('cia_marks')
				.select('*')
				.in('course_offering_id', allCOIds)
				.eq('examination_session_id', sessionId)
				.eq('cia_round', Number(ciaRound))
				.eq('is_active', true)
				.range(0, 9999)

			const marksMap = new Map<string, any>()
			for (const m of (marks || [])) marksMap.set(m.student_id, m)

			// Fetch dummy numbers
			const regIds = registrations.map(r => r.id)
			const { data: dummyNumbers } = await supabase
				.from('student_dummy_numbers')
				.select('exam_registration_id, dummy_number')
				.in('exam_registration_id', regIds)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			const dummyMap = new Map<string, string>()
			for (const d of (dummyNumbers || [])) dummyMap.set(d.exam_registration_id, d.dummy_number)

			// Build result
			const result = registrations.map(r => ({
				...r,
				dummy_number: dummyMap.get(r.id) || '-',
				saved_marks: marksMap.get(r.student_id) || null,
			}))

			return NextResponse.json(result)
		}

		// Consolidated report: all courses for a program + semester + CIA round
		if (action === 'consolidated') {
			const institutionsId = searchParams.get('institutions_id')
			const sessionId = searchParams.get('examination_session_id')
			const programCode = searchParams.get('program_code')
			const semester = searchParams.get('semester')
			const ciaRound = searchParams.get('cia_round') || '1'

			if (!institutionsId || !sessionId || !programCode || !semester) {
				return NextResponse.json({ error: 'institutions_id, examination_session_id, program_code, and semester are required' }, { status: 400 })
			}

			// 1. Get all registrations for this program
			const { data: regs } = await supabase
				.from('exam_registrations')
				.select('id, student_id, stu_register_no, student_name, course_offering_id, course_code')
				.eq('institutions_id', institutionsId)
				.eq('examination_session_id', sessionId)
				.eq('program_code', programCode)
				.eq('is_regular', true)
				.range(0, 49999)

			if (!regs || regs.length === 0) return NextResponse.json({ courses: [], learners: [] })

			// 2. Extract all unique course_offering_ids + course_codes
			const courseCodeSet = new Set<string>()
			const coIdSet = new Set<string>()
			for (const r of regs) {
				if (r.course_code) courseCodeSet.add(r.course_code)
				if (r.course_offering_id) coIdSet.add(r.course_offering_id)
			}

			// 3. Get course details (name, max mark) + course_mapping for order
			const uniqueCourseCodes = [...courseCodeSet]
			const [coursesRes, cmRes] = await Promise.all([
				supabase.from('courses')
					.select('course_code, course_name, internal_max_mark, evaluation_type, course_category')
					.eq('institutions_id', institutionsId)
					.in('course_code', uniqueCourseCodes),
				supabase.from('course_mapping')
					.select('course_code, course_order')
					.eq('program_code', programCode)
					.in('course_code', uniqueCourseCodes),
			])

			const courseByCode = new Map((coursesRes.data || []).map(c => [c.course_code, c]))
			const cmByCode = new Map((cmRes.data || []).map(cm => [cm.course_code, cm]))

			// 4. Filter course_offerings to ONLY those matching the target semester
			const allCoIds = [...coIdSet]
			const { data: offerings } = await supabase
				.from('course_offerings')
				.select('id, course_code, semester')
				.in('id', allCoIds)
				.eq('semester', Number(semester))

			const validCourseCodes = new Set<string>()
			const coIdsBySemester = new Set<string>()
			for (const o of (offerings || [])) {
				const course = courseByCode.get(o.course_code)
				const evalType = course?.evaluation_type || ''
				if (evalType === 'CIA' || evalType === 'CIA + ESE') {
					validCourseCodes.add(o.course_code)
					coIdsBySemester.add(o.id)
				}
			}

			// 5. Build learner map from registrations that match semester course_offering_ids
			// This ensures only students registered in THIS semester appear
			const learnerMap = new Map<string, { register_number: string, student_name: string }>()
			for (const r of regs) {
				if (r.course_offering_id && coIdsBySemester.has(r.course_offering_id)) {
					if (r.stu_register_no && !learnerMap.has(r.stu_register_no)) {
						learnerMap.set(r.stu_register_no, { register_number: r.stu_register_no, student_name: r.student_name })
					}
				}
			}

			// Build sorted course list
			const courses = [...validCourseCodes]
				.map(code => {
					const course = courseByCode.get(code)
					const cm = cmByCode.get(code)
					return {
						course_code: code,
						course_name: course?.course_name || code,
						internal_max_mark: course?.internal_max_mark || 0,
						course_category: course?.course_category || null,
						course_order: cm?.course_order ?? 999,
					}
				})
				.sort((a, b) => a.course_order - b.course_order)

			// 4. Fetch all CIA marks for this semester's courses + round
			const validCoIds = [...coIdsBySemester]
			const { data: allMarks } = validCoIds.length > 0
				? await supabase.from('cia_marks')
					.select('student_id, course_offering_id, total_internal_marks')
					.in('course_offering_id', validCoIds)
					.eq('examination_session_id', sessionId)
					.eq('cia_round', Number(ciaRound))
					.eq('is_active', true)
					.range(0, 49999)
				: { data: [] }

			// Build marks lookup: student_id → course_code → total
			// Need to map course_offering_id → course_code
			const coIdToCode = new Map<string, string>()
			for (const o of (offerings || [])) coIdToCode.set(o.id, o.course_code)

			const marksMatrix = new Map<string, Map<string, number>>()
			for (const m of (allMarks || [])) {
				const code = coIdToCode.get(m.course_offering_id)
				if (!code) continue
				// Find register number from student_id
				const reg = regs.find(r => r.student_id === m.student_id)
				if (!reg) continue
				const regNo = reg.stu_register_no
				if (!marksMatrix.has(regNo)) marksMatrix.set(regNo, new Map())
				marksMatrix.get(regNo)!.set(code, m.total_internal_marks || 0)
			}

			// 5. Build learner rows sorted by register number
			const sortedLearners = [...learnerMap.entries()]
				.sort((a, b) => a[0].localeCompare(b[0]))
				.map(([regNo, info], idx) => {
					const courseMarks: Record<string, number | null> = {}
					let total = 0
					for (const c of courses) {
						const mark = marksMatrix.get(regNo)?.get(c.course_code) ?? null
						courseMarks[c.course_code] = mark
						if (mark != null && mark > 0) total += mark
					}
					return {
						serial_number: idx + 1,
						register_number: regNo,
						student_name: info.student_name,
						course_marks: courseMarks,
						total,
					}
				})

			return NextResponse.json({ courses, learners: sortedLearners })
		}

		// Pending Mark Entry: all programs > semesters > courses with entry status
		// Scalable: fetches distinct programs first, then processes per-program
		if (action === 'pending-mark-entry') {
			const institutionsId = searchParams.get('institutions_id')
			const sessionId = searchParams.get('examination_session_id')
			const ciaRound = searchParams.get('cia_round') || '1'
			const programCodesParam = searchParams.get('program_codes') // comma-separated from assessment setting
			const courseTypesParam = searchParams.get('course_types') // comma-separated from assessment setting

			if (!institutionsId || !sessionId) {
				return NextResponse.json({ error: 'institutions_id and examination_session_id required' }, { status: 400 })
			}

			const allowedCourseTypes = courseTypesParam ? courseTypesParam.split(',').map(c => c.trim().toLowerCase()).filter(Boolean) : null

			// 1. Get distinct program_codes from course_offerings (small table, not exam_registrations)
			const { data: coRows, error: coError } = await supabase
				.from('course_offerings')
				.select('program_code')
				.eq('institutions_id', institutionsId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			if (coError) return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 500 })
			if (!coRows || coRows.length === 0) return NextResponse.json([])

			const allProgramCodes = [...new Set(coRows.map(r => r.program_code).filter(Boolean))]

			// Filter by assessment's program_codes if provided
			const allowedPrograms = programCodesParam ? programCodesParam.split(',').map(c => c.trim()).filter(Boolean) : null
			const programCodes = allowedPrograms
				? allProgramCodes.filter(c => allowedPrograms.includes(c))
				: allProgramCodes

			if (programCodes.length === 0) return NextResponse.json([])

			// 2. Process each program independently — keeps queries small & scalable
			const result: any[] = []

			for (const progCode of programCodes.sort()) {
				// 2a. Get registrations for THIS program only
				const { data: progRegs } = await supabase
					.from('exam_registrations')
					.select('id, student_id, course_offering_id, course_code')
					.eq('institutions_id', institutionsId)
					.eq('examination_session_id', sessionId)
					.eq('program_code', progCode)
					.eq('is_regular', true)
					.range(0, 49999)

				if (!progRegs || progRegs.length === 0) continue

				const progCoIds = [...new Set(progRegs.map(r => r.course_offering_id).filter(Boolean))]
				const progCourseCodes = [...new Set(progRegs.map(r => r.course_code).filter(Boolean))]
				if (progCoIds.length === 0) continue

				// 2b. Get course_offerings for semester info
				const { data: offerings } = await supabase
					.from('course_offerings')
					.select('id, course_code, semester')
					.in('id', progCoIds)
					.eq('is_active', true)

				const coIdToSemester = new Map<string, number>()
				const coIdToCode = new Map<string, string>()
				for (const o of (offerings || [])) {
					coIdToSemester.set(o.id, o.semester)
					coIdToCode.set(o.id, o.course_code)
				}

				// 2c. Get course details
				const { data: coursesData } = await supabase
					.from('courses')
					.select('course_code, course_name, internal_max_mark, evaluation_type, course_category')
					.eq('institutions_id', institutionsId)
					.in('course_code', progCourseCodes)

				const courseByCode = new Map((coursesData || []).map(c => [c.course_code, c]))

				// 2d. Get course_mapping for ordering
				const { data: cmData } = await supabase
					.from('course_mapping')
					.select('course_code, course_order')
					.eq('program_code', progCode)
					.in('course_code', progCourseCodes)

				const cmByCourse = new Map<string, number>()
				for (const cm of (cmData || [])) {
					cmByCourse.set(cm.course_code, cm.course_order ?? 999)
				}

				// 2e. Get cia_marks for this program's course_offerings
				const { data: progMarks } = await supabase
					.from('cia_marks')
					.select('student_id, course_offering_id')
					.in('course_offering_id', progCoIds)
					.eq('examination_session_id', sessionId)
					.eq('cia_round', Number(ciaRound))
					.eq('is_active', true)
					.range(0, 49999)

				const marksPerCO = new Map<string, Set<string>>()
				for (const m of (progMarks || [])) {
					if (!marksPerCO.has(m.course_offering_id)) marksPerCO.set(m.course_offering_id, new Set())
					marksPerCO.get(m.course_offering_id)!.add(m.student_id)
				}

				// 2f. Group registrations by course_offering_id → student_ids
				const coStudents = new Map<string, Set<string>>()
				for (const r of progRegs) {
					if (!r.course_offering_id) continue
					if (!coStudents.has(r.course_offering_id)) coStudents.set(r.course_offering_id, new Set())
					coStudents.get(r.course_offering_id)!.add(r.student_id)
				}

				// 2g. Build semester → courses
				const semMap = new Map<number, any[]>()
				for (const [coId, studentIds] of coStudents.entries()) {
					const semester = coIdToSemester.get(coId)
					if (semester === undefined) continue

					const courseCode = coIdToCode.get(coId)
					if (!courseCode) continue

					const course = courseByCode.get(courseCode)
					if (!course) continue

					const evalType = course.evaluation_type || ''
					if (evalType !== 'CIA' && evalType !== 'CIA + ESE') continue

					if (allowedCourseTypes && allowedCourseTypes.length > 0) {
						const cat = (course.course_category || '').toLowerCase()
						if (!cat || !allowedCourseTypes.includes(cat)) continue
					}

					const totalLearners = studentIds.size
					const marksSet = marksPerCO.get(coId) || new Set()
					const enteredCount = [...studentIds].filter(sid => marksSet.has(sid)).length

					if (enteredCount >= totalLearners) continue

					const status = enteredCount === 0 ? 'not_started' : 'partial'

					if (!semMap.has(semester)) semMap.set(semester, [])
					semMap.get(semester)!.push({
						course_offering_id: coId,
						course_code: courseCode,
						course_name: course.course_name,
						course_category: course.course_category,
						internal_max_mark: course.internal_max_mark,
						total_learners: totalLearners,
						entered_count: enteredCount,
						pending_count: totalLearners - enteredCount,
						status,
						course_order: cmByCourse.get(courseCode) ?? 999,
					})
				}

				for (const courses of semMap.values()) {
					courses.sort((a, b) => a.course_order - b.course_order)
				}

				const semesters = [...semMap.entries()]
					.sort((a, b) => a[0] - b[0])
					.map(([sem, courses]) => ({ semester: sem, courses }))

				if (semesters.length > 0) {
					result.push({ program_code: progCode, semesters })
				}
			}

			return NextResponse.json(result)
		}

		// Pending learner detail: for a specific course, list learners without marks
		if (action === 'pending-learner-detail') {
			const courseOfferingId = searchParams.get('course_offering_id')
			const sessionId = searchParams.get('examination_session_id')
			const programCode = searchParams.get('program_code')
			const ciaRound = searchParams.get('cia_round') || '1'

			if (!courseOfferingId || !sessionId) {
				return NextResponse.json({ error: 'course_offering_id and examination_session_id required' }, { status: 400 })
			}

			// Get course_code from offering
			const { data: offering } = await supabase
				.from('course_offerings')
				.select('course_code, semester')
				.eq('id', courseOfferingId)
				.single()

			const courseCode = offering?.course_code

			// Fetch registrations
			let regQuery2 = supabase
				.from('exam_registrations')
				.select('id, student_id, stu_register_no, student_name, course_offering_id')
				.eq('examination_session_id', sessionId)
				.eq('is_regular', true)
				.order('stu_register_no')

			if (courseCode) regQuery2 = regQuery2.eq('course_code', courseCode)
			else regQuery2 = regQuery2.eq('course_offering_id', courseOfferingId)
			if (programCode) regQuery2 = regQuery2.eq('program_code', programCode)

			const { data: registrations } = await regQuery2.range(0, 9999)
			if (!registrations || registrations.length === 0) return NextResponse.json([])

			// Get course_offering_ids from registrations that match
			const matchCoIds = [...new Set(registrations.map(r => r.course_offering_id))]

			// Fetch existing marks
			const { data: marks } = await supabase
				.from('cia_marks')
				.select('student_id')
				.in('course_offering_id', matchCoIds)
				.eq('examination_session_id', sessionId)
				.eq('cia_round', Number(ciaRound))
				.eq('is_active', true)
				.range(0, 49999)

			const markedStudents = new Set((marks || []).map(m => m.student_id))

			// Return only learners WITHOUT marks
			const pending = registrations
				.filter(r => !markedStudents.has(r.student_id))
				.map((r, idx) => ({
					serial_number: idx + 1,
					register_number: r.stu_register_no,
					student_name: r.student_name,
				}))

			return NextResponse.json(pending)
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
	} catch (error) {
		console.error('Internal mark report error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}