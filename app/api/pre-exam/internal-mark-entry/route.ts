import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const action = searchParams.get('action')
		const supabase = getSupabaseServer()

		switch (action) {
			// ─── Cascading filter: programs → semesters → courses ───
			// All steps query course_offerings (small table) — never scans exam_registrations
			case 'filter-cascade': {
				const step = searchParams.get('step')
				const institutionsId = searchParams.get('institutions_id')
				const sessionId = searchParams.get('examination_session_id')

				if (!institutionsId || !sessionId) {
					return NextResponse.json({ error: 'institutions_id and examination_session_id are required' }, { status: 400 })
				}

				// STEP 1: Get distinct program_codes from course_offerings (never scan exam_registrations)
				if (step === 'programs') {
					const { data, error } = await supabase
						.from('course_offerings')
						.select('program_code')
						.eq('institutions_id', institutionsId)
						.eq('examination_session_id', sessionId)
						.eq('is_active', true)

					if (error) {
						console.error('Error fetching programs from course_offerings:', error)
						return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 500 })
					}

					const uniqueCodes = [...new Set((data || []).map(r => r.program_code).filter(Boolean))]
					return NextResponse.json(uniqueCodes.sort())
				}

				// STEP 2: Get distinct semesters for a program, filtered by session's semester_type (ODD/EVEN)
				if (step === 'semesters') {
					const programCode = searchParams.get('program_code')
					if (!programCode) {
						return NextResponse.json({ error: 'program_code is required' }, { status: 400 })
					}

					// Get session's semester_type (ODD or EVEN)
					const { data: sessionData } = await supabase
						.from('examination_sessions')
						.select('semester_type')
						.eq('id', sessionId)
						.single()

					const semesterType = sessionData?.semester_type // 'ODD' or 'EVEN'

					// Get all semesters from course_offerings for this program + session
					const { data, error } = await supabase
						.from('course_offerings')
						.select('semester')
						.eq('institutions_id', institutionsId)
						.eq('examination_session_id', sessionId)
						.eq('program_code', programCode)
						.eq('is_active', true)

					if (error) {
						console.error('Error fetching semesters from course_offerings:', error)
						return NextResponse.json({ error: 'Failed to fetch semesters' }, { status: 500 })
					}

					let semesters = [...new Set((data || []).map(o => o.semester).filter(Boolean))].sort((a, b) => a - b)

					// Filter by semester_type: ODD = 1,3,5,7  EVEN = 2,4,6,8
					if (semesterType === 'ODD') {
						semesters = semesters.filter(s => s % 2 !== 0)
					} else if (semesterType === 'EVEN') {
						semesters = semesters.filter(s => s % 2 === 0)
					}

					return NextResponse.json(semesters)
				}

				// STEP 3: Get courses for a program + semester from course_offerings
				if (step === 'courses') {
					const programCode = searchParams.get('program_code')
					const semester = searchParams.get('semester')

					if (!programCode || !semester) {
						return NextResponse.json({ error: 'program_code and semester are required' }, { status: 400 })
					}

					const { data: offerings, error: coError } = await supabase
						.from('course_offerings')
						.select('id, course_id, program_id, semester, course_code, program_code')
						.eq('institutions_id', institutionsId)
						.eq('examination_session_id', sessionId)
						.eq('program_code', programCode)
						.eq('semester', Number(semester))
						.eq('is_active', true)
						.order('course_code')

					if (coError) {
						console.error('Error fetching course_offerings:', coError)
						return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
					}

					if (!offerings || offerings.length === 0) return NextResponse.json([])

					// Enrich with course_name, internal_max_mark, course_order
					const uniqueCourseCodes = [...new Set(offerings.map(o => o.course_code).filter(Boolean))]

					const [coursesRes, cmRes] = await Promise.all([
						supabase
							.from('courses')
							.select('id, course_code, course_name, internal_max_mark, evaluation_type, course_category')
							.eq('institutions_id', institutionsId)
							.in('course_code', uniqueCourseCodes),
						supabase
							.from('course_mapping')
							.select('course_code, program_code, course_order')
							.eq('program_code', programCode)
							.in('course_code', uniqueCourseCodes)
					])

					const courseByCode = new Map((coursesRes.data || []).map(c => [c.course_code, c]))
					const cmByCode = new Map((cmRes.data || []).map(cm => [cm.course_code, cm]))

					// Deduplicate by course_offering_id, filter to CIA/CIA+ESE only, sort by course_order
					const seen = new Set<string>()
					const results = offerings
						.filter(co => {
							if (seen.has(co.id)) return false
							seen.add(co.id)
							const course = courseByCode.get(co.course_code)
							const evalType = course?.evaluation_type || ''
							return evalType === 'CIA' || evalType === 'CIA + ESE'
						})
						.map(co => {
							const course = courseByCode.get(co.course_code)
							const cm = cmByCode.get(co.course_code)
							return {
								course_offering_id: co.id,
								course_mapping_id: co.course_id,
								course_id: course?.id || co.course_id,
								course_code: co.course_code,
								course_name: course?.course_name || co.course_code,
								internal_max_mark: course?.internal_max_mark || 100,
								course_category: course?.course_category || null,
								course_order: cm?.course_order ?? 999,
								program_id: co.program_id,
								program_code: co.program_code,
								semester: co.semester,
							}
						})
						.sort((a, b) => (a.course_order ?? 999) - (b.course_order ?? 999))

					return NextResponse.json(results)
				}

				return NextResponse.json({ error: 'Invalid step. Use: programs, semesters, courses' }, { status: 400 })
			}

			// ─── Get CIA config for a course (resolves setting → rounds + components) ───
			case 'cia-config': {
				const institutionsId = searchParams.get('institutions_id')
				const sessionId = searchParams.get('examination_session_id')
				const programCode = searchParams.get('program_code')
				const courseType = searchParams.get('course_type')

				if (!institutionsId || !sessionId || !programCode) {
					return NextResponse.json({ error: 'institutions_id, examination_session_id, and program_code are required' }, { status: 400 })
				}

				// Find matching cia_entry_settings
				const { data: allSettings, error: settingsError } = await supabase
					.from('cia_entry_settings')
					.select('*')
					.eq('institutions_id', institutionsId)
					.eq('examination_session_id', sessionId)
					.eq('is_active', true)

				if (settingsError) {
					console.error('Error fetching CIA settings:', settingsError)
					return NextResponse.json({ error: 'Failed to fetch CIA config' }, { status: 500 })
				}

				// Filter: program_code must be in the setting's program_codes array
				// And course_type must match (or setting is 'all')
				const matched = (allSettings || []).find((s: any) => {
					const programMatch = Array.isArray(s.program_codes) && s.program_codes.includes(programCode)
					const typeMatch = s.course_type === 'all' || !courseType || s.course_type === courseType
					return programMatch && typeMatch
				})

				if (!matched) {
					// No setting found — return default 13 components, 1 round
					const defaultComponents = [
						{ code: 'assignment', name: 'Assignment', max_marks: 0 },
						{ code: 'quiz', name: 'Quiz', max_marks: 0 },
						{ code: 'mid_term', name: 'Mid Term', max_marks: 0 },
						{ code: 'presentation', name: 'Presentation', max_marks: 0 },
						{ code: 'attendance', name: 'Attendance', max_marks: 0 },
						{ code: 'lab', name: 'Lab', max_marks: 0 },
						{ code: 'project', name: 'Project', max_marks: 0 },
						{ code: 'seminar', name: 'Seminar', max_marks: 0 },
						{ code: 'viva', name: 'Viva', max_marks: 0 },
						{ code: 'test_1', name: 'Test 1', max_marks: 0 },
						{ code: 'test_2', name: 'Test 2', max_marks: 0 },
						{ code: 'test_3', name: 'Test 3', max_marks: 0 },
						{ code: 'other', name: 'Other', max_marks: 0 },
					]
					return NextResponse.json({
						setting_id: null,
						total_rounds: 1,
						cia_rounds: [{ round: 1, round_name: 'CIA', components: defaultComponents }]
					})
				}

				return NextResponse.json({
					setting_id: matched.id,
					total_rounds: matched.total_rounds,
					use_course_max: matched.use_course_max || false,
					cia_rounds: matched.cia_rounds,
				})
			}

			// ─── Question paper(s) for a question-wise CIA round ───
			// Returns the question list faculty key marks against. Papers are keyed by
			// (cia_setting_id, cia_round, course_offering_id, set_number) — one per A/B set.
			case 'question-paper': {
				const ciaSettingId = searchParams.get('cia_setting_id')
				const ciaRound = searchParams.get('cia_round')
				const courseOfferingId = searchParams.get('course_offering_id')
				const paperSessionId = searchParams.get('examination_session_id')

				if (!ciaRound || !courseOfferingId) {
					return NextResponse.json({ error: 'cia_round and course_offering_id are required' }, { status: 400 })
				}

				// Match on the identity the generator actually writes:
				// (examination_session_id, cia_round, course_offering_id) — the same triple
				// it de-duplicates on. cia_setting_id is NOT filtered here because
				// /api/pre-exam/question-papers stores it as NULL unless a caller passes it,
				// which the Question Papers UI does not.
				let query = supabase
					.from('ia_question_papers')
					.select('id, cia_setting_id, template_id, set_number, set_label, subject_title, max_marks, status, questions')
					.eq('cia_round', Number(ciaRound))
					.eq('course_offering_id', courseOfferingId)
					.eq('is_active', true)
					.order('set_number')

				if (paperSessionId) query = query.eq('examination_session_id', paperSessionId)

				const { data: allPapers, error: papersError } = await query

				if (papersError) {
					console.error('Error fetching question papers:', papersError)
					return NextResponse.json({ error: 'Failed to fetch question paper' }, { status: 500 })
				}

				// Prefer papers stamped with this setting; otherwise fall back to the
				// unstamped ones. A paper belonging to a *different* setting is never used.
				const rows = allPapers || []
				const exact = ciaSettingId ? rows.filter((p: any) => p.cia_setting_id === ciaSettingId) : []
				const papers = exact.length > 0 ? exact : rows.filter((p: any) => !p.cia_setting_id)

				// "Answer any N of M" lives on the template part, not on the paper's
				// questions, so pull the parts for every template these papers came from.
				const templateIds = [...new Set(papers.map((p: any) => p.template_id).filter(Boolean))]
				const answerLimits = new Map<string, number>() // `${template_id}|${part_label}` → num_to_answer
				if (templateIds.length > 0) {
					const { data: templateParts } = await supabase
						.from('ia_template_parts')
						.select('template_id, part_label, num_questions, num_to_answer')
						.in('template_id', templateIds)
						.eq('is_active', true)
					for (const tp of (templateParts || [])) {
						const limit = Number(tp.num_to_answer)
						// Only a real restriction when fewer than the questions on offer
						if (limit > 0 && limit < Number(tp.num_questions || 0)) {
							answerLimits.set(`${tp.template_id}|${tp.part_label}`, limit)
						}
					}
				}

				// Normalize each paper's questions into flat entry columns.
				// Choice alternatives ("OR" questions) stay in the list — a learner answers
				// one of them, so they share a choice_group the UI/validator restricts to
				// a single answer. Group = same part + same question number (6a / 6b).
				const result = papers.map((p: any) => {
					const raw = (Array.isArray(p.questions) ? p.questions : [])
						.slice()
						.sort((a: any, b: any) => (a?.display_order ?? 0) - (b?.display_order ?? 0))

					const questions = raw
						.map((q: any) => ({
							id: String(q?.id ?? ''),
							label: `${q?.question_number ?? ''}${q?.sub_label || ''}`,
							part_label: q?.part_label || null,
							choice_group: `${q?.part_label ?? ''}|${q?.question_number ?? ''}`,
							marks: Number(q?.marks) || 0,
							is_choice_alternative: !!q?.is_choice_alternative,
							// Course outcome + Bloom's level, as tagged on the paper
							co_code: q?.co_code || null,
							k_level: q?.k_level || null,
							question_text: q?.question_text || null,
						}))
						.filter((q: any) => q.id)

					// One entry per part: how many distinct question groups it holds and
					// how many of them a learner may answer.
					const partOrder: string[] = []
					const groupsByPart = new Map<string, Set<string>>()
					for (const q of questions) {
						const part = q.part_label || ''
						if (!groupsByPart.has(part)) { groupsByPart.set(part, new Set()); partOrder.push(part) }
						groupsByPart.get(part)!.add(q.choice_group)
					}
					const parts = partOrder.map(part => ({
						part_label: part,
						group_count: groupsByPart.get(part)!.size,
						num_to_answer: answerLimits.get(`${p.template_id}|${part}`) ?? null,
					}))

					return {
						id: p.id,
						set_number: p.set_number,
						set_label: p.set_label,
						subject_title: p.subject_title,
						max_marks: p.max_marks == null ? null : Number(p.max_marks),
						status: p.status,
						questions,
						parts,
						questions_total: questions.reduce((s: number, q: any) => s + q.marks, 0),
					}
				})

				return NextResponse.json(result)
			}

			case 'learners': {
				const courseOfferingId = searchParams.get('course_offering_id')
				const sessionId = searchParams.get('examination_session_id')
				const programCode = searchParams.get('program_code')
				const ciaRound = searchParams.get('cia_round') || '1'

				if (!courseOfferingId || !sessionId) {
					return NextResponse.json({ error: 'course_offering_id and examination_session_id are required' }, { status: 400 })
				}

				// Get the course_code from the selected offering
				const { data: selectedOffering } = await supabase
					.from('course_offerings')
					.select('course_code')
					.eq('id', courseOfferingId)
					.single()

				const courseCode = selectedOffering?.course_code

				// Fetch learners for this course_code + program
				let regQuery = supabase
					.from('exam_registrations')
					.select('id, student_id, stu_register_no, student_name, course_offering_id, institutions_id, is_regular, program_code')
					.eq('examination_session_id', sessionId)
					.eq('is_regular', true)
					.order('stu_register_no')

				if (courseCode) {
					regQuery = regQuery.eq('course_code', courseCode)
				} else {
					regQuery = regQuery.eq('course_offering_id', courseOfferingId)
				}

				// Filter by program if provided
				if (programCode) {
					regQuery = regQuery.eq('program_code', programCode)
				}

				const { data: registrations, error: regError } = await regQuery.range(0, 9999)

				if (regError) {
					console.error('Error fetching exam registrations:', regError)
					return NextResponse.json({ error: 'Failed to fetch learners' }, { status: 500 })
				}

				if (!registrations || registrations.length === 0) {
					return NextResponse.json([])
				}

				// Fetch existing cia_marks for all learners in this course + session + round
				const allCOIds = [...new Set(registrations.map(r => r.course_offering_id))]
				const { data: existingMarks, error: marksError } = await supabase
					.from('cia_marks')
					.select('*')
					.in('course_offering_id', allCOIds)
					.eq('examination_session_id', sessionId)
					.eq('cia_round', Number(ciaRound))
					.eq('is_active', true)

				if (marksError) {
					console.error('Error fetching existing cia_marks:', marksError)
				}

				// Build lookup: student_id → saved marks
				const marksMap = new Map<string, any>()
				for (const m of (existingMarks || [])) {
					marksMap.set(m.student_id, m)
				}

				// Return ALL learners with saved marks attached
				const result = registrations.map(r => ({
					...r,
					saved_marks: marksMap.get(r.student_id) || null,
				}))

				return NextResponse.json(result)
			}

			case 'pattern-components': {
				const courseId = searchParams.get('course_id')
				const programId = searchParams.get('program_id')
				const institutionsId = searchParams.get('institutions_id')

				if (!courseId || !institutionsId) {
					return NextResponse.json({ error: 'course_id and institutions_id are required' }, { status: 400 })
				}

				// 1. Try course-level association first
				const { data: courseAssoc } = await supabase
					.from('pattern_course_associations')
					.select(`
						pattern_id,
						internal_assessment_patterns:pattern_id (
							id, status
						)
					`)
					.eq('course_id', courseId)
					.eq('is_active', true)
					.lte('effective_from_date', new Date().toISOString().split('T')[0])
					.order('effective_from_date', { ascending: false })
					.limit(1)

				let patternId: string | null = null

				if (courseAssoc && courseAssoc.length > 0) {
					const pattern = (courseAssoc[0] as any).internal_assessment_patterns
					if (pattern?.status === 'active') {
						patternId = courseAssoc[0].pattern_id
					}
				}

				// 2. Try program-level association
				if (!patternId && programId) {
					const { data: progAssoc } = await supabase
						.from('pattern_program_associations')
						.select(`
							pattern_id,
							internal_assessment_patterns:pattern_id (
								id, status
							)
						`)
						.eq('program_id', programId)
						.eq('is_active', true)
						.lte('effective_from_date', new Date().toISOString().split('T')[0])
						.order('effective_from_date', { ascending: false })
						.limit(1)

					if (progAssoc && progAssoc.length > 0) {
						const pattern = (progAssoc[0] as any).internal_assessment_patterns
						if (pattern?.status === 'active') {
							patternId = progAssoc[0].pattern_id
						}
					}
				}

				// 3. Try default pattern for institution
				if (!patternId) {
					const { data: defaultPattern } = await supabase
						.from('internal_assessment_patterns')
						.select('id')
						.eq('institutions_id', institutionsId)
						.eq('is_default', true)
						.eq('status', 'active')
						.order('wef_date', { ascending: false })
						.limit(1)

					if (defaultPattern && defaultPattern.length > 0) {
						patternId = defaultPattern[0].id
					}
				}

				// If no pattern found, return default component list (all 13 components)
				if (!patternId) {
					const defaultComponents = [
						{ component_code: 'assignment', component_name: 'Assignment', display_order: 1 },
						{ component_code: 'quiz', component_name: 'Quiz', display_order: 2 },
						{ component_code: 'mid_term', component_name: 'Mid Term', display_order: 3 },
						{ component_code: 'presentation', component_name: 'Presentation', display_order: 4 },
						{ component_code: 'attendance', component_name: 'Attendance', display_order: 5 },
						{ component_code: 'lab', component_name: 'Lab', display_order: 6 },
						{ component_code: 'project', component_name: 'Project', display_order: 7 },
						{ component_code: 'seminar', component_name: 'Seminar', display_order: 8 },
						{ component_code: 'viva', component_name: 'Viva', display_order: 9 },
						{ component_code: 'test_1', component_name: 'Test 1', display_order: 10 },
						{ component_code: 'test_2', component_name: 'Test 2', display_order: 11 },
						{ component_code: 'test_3', component_name: 'Test 3', display_order: 12 },
						{ component_code: 'other', component_name: 'Other', display_order: 13 },
					]
					return NextResponse.json({ pattern_id: null, components: defaultComponents })
				}

				// Fetch components for the found pattern
				const { data: components, error: compError } = await supabase
					.from('internal_assessment_components')
					.select('id, component_code, component_name, weightage_percentage, display_order, is_mandatory')
					.eq('pattern_id', patternId)
					.eq('is_active', true)
					.order('display_order')

				if (compError) {
					console.error('Error fetching pattern components:', compError)
					return NextResponse.json({ error: 'Failed to fetch pattern components' }, { status: 500 })
				}

				return NextResponse.json({
					pattern_id: patternId,
					components: components || []
				})
			}

			default:
				return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
		}
	} catch (error) {
		console.error('Internal mark entry GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		// ── Resolve audit user from MyJKKN parent app session ──
		// Users live in MyJKKN's Supabase, not COE. The OAuth login flow set an
		// `access_token` cookie containing a JWT issued by MyJKKN. We decode it
		// locally (no network call) to extract the user UUID, falling back to
		// MyJKKN's /api/auth/validate endpoint if the token isn't a JWT.
		// cia_marks.created_by and updated_by are NOT NULL, so we MUST have a user.
		let currentUserId: string | null = null
		const accessToken = (request as NextRequest).cookies.get('access_token')?.value

		if (!accessToken) {
			return NextResponse.json({ error: 'Authentication required — no session cookie found' }, { status: 401 })
		}

		// Primary: decode the JWT payload to read the user ID directly
		try {
			const parts = accessToken.split('.')
			if (parts.length === 3) {
				const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
				const padded = payloadB64 + '='.repeat((4 - payloadB64.length % 4) % 4)
				const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'))
				// JWT standard "sub" claim, or MyJKKN-specific user_id/id
				currentUserId = payload.sub || payload.user_id || payload.id || null
			}
		} catch {
			// JWT decode failed — fall through to validate endpoint
		}

		// Fallback: validate with parent app if JWT decode didn't yield a user
		if (!currentUserId) {
			try {
				const validateRes = await fetch(`${process.env.NEXT_PUBLIC_PARENT_APP_URL}/api/auth/validate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						access_token: accessToken,
						child_app_id: process.env.NEXT_PUBLIC_APP_ID,
					}),
				})
				if (validateRes.ok) {
					const data = await validateRes.json()
					if (data?.user?.id) currentUserId = data.user.id
				}
			} catch (e) {
				console.warn('[pre-exam/internal-mark-entry] Validate fallback failed:', e)
			}
		}

		// Hard requirement: cia_marks.created_by + updated_by are NOT NULL
		if (!currentUserId) {
			return NextResponse.json({ error: 'No authenticated user available for audit trail' }, { status: 401 })
		}

		const {
			institutions_id,
			examination_session_id,
			course_offering_id,
			course_id,
			program_id,
			cia_round = 1,   // CIA round number (default 1 for backward compat)
			max_marks,       // { assignment: 10, quiz: 5, ... }
			learner_marks,   // [{ exam_registration_id, student_id, marks: { assignment: 8, quiz: 4, ... } }]
		} = body

		// Validate required fields
		if (!institutions_id || !examination_session_id || !course_offering_id || !course_id || !program_id) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}

		if (!learner_marks || !Array.isArray(learner_marks) || learner_marks.length === 0) {
			return NextResponse.json({ error: 'No learner marks provided' }, { status: 400 })
		}

		// Component code → cia_marks column mapping
		const markFieldMap: Record<string, string> = {
			'assignment': 'assignment_marks',
			'quiz': 'quiz_marks',
			'mid_term': 'mid_term_marks',
			'presentation': 'presentation_marks',
			'attendance': 'attendance_marks',
			'lab': 'lab_marks',
			'project': 'project_marks',
			'seminar': 'seminar_marks',
			'viva': 'viva_marks',
			'test_1': 'test_1_mark',
			'test_2': 'test_2_mark',
			'test_3': 'test_3_mark',
			'other': 'other_marks',
		}

		const maxFieldMap: Record<string, string> = {
			'assignment': 'max_assignment_marks',
			'quiz': 'max_quiz_marks',
			'mid_term': 'max_mid_term_marks',
			'presentation': 'max_presentation_marks',
			'attendance': 'max_attendance_marks',
			'lab': 'max_lab_marks',
			'project': 'max_project_marks',
			'seminar': 'max_seminar_marks',
			'viva': 'max_viva_marks',
			'test_1': 'max_test_1_mark',
			'test_2': 'max_test_2_mark',
			'test_3': 'max_test_3_mark',
			'other': 'max_other_marks',
		}

		// Calculate total max marks from components
		const totalMaxMarks = Object.values(max_marks || {}).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0)

		// Question-wise rounds send a per-question breakdown alongside the component
		// marks: { [component_code]: { paper_id, set_number, set_label, marks: { [question_id]: mark } } }.
		// The component mark is re-derived from that sum here so a stale client-side
		// total can never be persisted out of step with its questions.
		const questionSum = (questionMarks: any, code: string): number | null => {
			const entry = questionMarks?.[code]
			if (!entry || typeof entry !== 'object' || !entry.marks || typeof entry.marks !== 'object') return null
			return Object.values(entry.marks).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
		}

		// Effective per-component mark for each row, reused by the max-marks validation below
		const effectiveMarks: Record<string, number>[] = []

		// Build insert records
		const records = learner_marks.map((lm: any) => {
			const record: any = {
				institutions_id,
				examination_session_id,
				course_offering_id,
				course_id,
				program_id,
				cia_round: Number(cia_round) || 1,
				exam_registration_id: lm.exam_registration_id,
				student_id: lm.student_id,
				marks_status: 'Submitted',
				is_active: true,
				submission_date: new Date().toISOString().split('T')[0],
				max_internal_marks: totalMaxMarks,
				// Audit: stamped from session-resolved COE user
				created_by: currentUserId,
				submitted_by: currentUserId,
				updated_by: currentUserId,
			}

			// Set component marks and max marks.
			// Standard codes (assignment, quiz, ..., test_3) → dedicated cia_marks columns.
			// Custom codes added via CIA settings (e.g. ai_tools_usage, interactive_mode)
			// → stored in extra_marks / extra_marks_max JSONB. Without this, custom
			// component marks were silently dropped.
			let totalMarks = 0
			const extraMarks: Record<string, number> = {}
			const extraMarksMax: Record<string, number> = {}
			const questionMarks = (lm.question_marks && typeof lm.question_marks === 'object') ? lm.question_marks : {}
			const rowMarks: Record<string, number> = {}
			for (const [code, maxVal] of Object.entries(max_marks || {})) {
				const markField = markFieldMap[code]
				const maxField = maxFieldMap[code]
				const qSum = questionSum(questionMarks, code)
				const mark = qSum != null ? qSum : (Number(lm.marks?.[code]) || 0)
				rowMarks[code] = mark
				if (markField) {
					record[markField] = mark
				} else {
					extraMarks[code] = mark
				}
				if (maxField) {
					record[maxField] = Number(maxVal) || 0
				} else {
					extraMarksMax[code] = Number(maxVal) || 0
				}
				totalMarks += mark
			}

			record.extra_marks = extraMarks
			record.extra_marks_max = extraMarksMax
			// Only write question_marks when the client actually sent a breakdown.
			// Omitting it leaves an existing row's stored questions untouched instead
			// of blanking them (e.g. a re-save made while the paper failed to load).
			if (Object.keys(questionMarks).length > 0) {
				record.question_marks = questionMarks
			}
			record.total_internal_marks = totalMarks
			effectiveMarks.push(rowMarks)
			return record
		})

		// Validate marks don't exceed max
		const errors: string[] = []
		for (let i = 0; i < records.length; i++) {
			const lm = learner_marks[i]
			for (const [code, maxVal] of Object.entries(max_marks || {})) {
				const mark = effectiveMarks[i]?.[code] ?? 0
				const max = Number(maxVal) || 0
				if (mark > max) {
					const regNo = lm.register_no || `Row ${i + 1}`
					errors.push(`${regNo}: ${code} mark (${mark}) exceeds max (${max})`)
				}
			}
		}

		// ── Question-wise rules, enforced server-side ──
		// A learner may answer only one question of an OR pair, and no more than
		// "answer any N" questions in a part. The UI blocks both, but a stale tab or
		// a direct API call must not be able to slip past them.
		const paperIds = [...new Set(
			learner_marks.flatMap((lm: any) =>
				Object.values(lm.question_marks || {}).map((e: any) => e?.paper_id).filter(Boolean)
			)
		)] as string[]

		if (paperIds.length > 0) {
			const { data: paperRows } = await supabase
				.from('ia_question_papers')
				.select('id, template_id, questions')
				.in('id', paperIds)

			const templateIds = [...new Set((paperRows || []).map((p: any) => p.template_id).filter(Boolean))]
			const answerLimits = new Map<string, number>()
			if (templateIds.length > 0) {
				const { data: templateParts } = await supabase
					.from('ia_template_parts')
					.select('template_id, part_label, num_questions, num_to_answer')
					.in('template_id', templateIds)
					.eq('is_active', true)
				for (const tp of (templateParts || [])) {
					const limit = Number(tp.num_to_answer)
					if (limit > 0 && limit < Number(tp.num_questions || 0)) {
						answerLimits.set(`${tp.template_id}|${tp.part_label}`, limit)
					}
				}
			}

			// paper id → question id → { part, group, label, marks }
			const paperIndex = new Map<string, Map<string, any>>()
			for (const p of (paperRows || [])) {
				const index = new Map<string, any>()
				for (const q of (Array.isArray(p.questions) ? p.questions : [])) {
					const part = q?.part_label ?? ''
					index.set(String(q?.id ?? ''), {
						part,
						group: `${part}|${q?.question_number ?? ''}`,
						label: `${q?.question_number ?? ''}${q?.sub_label || ''}`,
						marks: Number(q?.marks) || 0,
						limit: answerLimits.get(`${p.template_id}|${part}`) ?? null,
					})
				}
				paperIndex.set(p.id, index)
			}

			for (const lm of learner_marks) {
				const regNo = lm.register_no || lm.student_id
				for (const entry of Object.values(lm.question_marks || {}) as any[]) {
					const index = paperIndex.get(entry?.paper_id)
					if (!index) continue
					const answeredByGroup = new Map<string, string[]>()
					const groupsByPart = new Map<string, Set<string>>()
					for (const [qId, val] of Object.entries(entry.marks || {})) {
						if (val == null || val === '') continue
						const meta = index.get(qId)
						if (!meta) continue
						if (meta.marks > 0 && Number(val) > meta.marks) {
							errors.push(`${regNo}: Q${meta.label} mark (${val}) exceeds question max (${meta.marks})`)
						}
						answeredByGroup.set(meta.group, [...(answeredByGroup.get(meta.group) || []), meta.label])
						if (!groupsByPart.has(meta.part)) groupsByPart.set(meta.part, new Set())
						groupsByPart.get(meta.part)!.add(meta.group)
					}
					for (const [group, labels] of answeredByGroup) {
						if (labels.length > 1) {
							errors.push(`${regNo}: only one of Q${labels.join(' / Q')} may be answered (OR choice)`)
						}
					}
					for (const [part, groups] of groupsByPart) {
						const limit = [...index.values()].find((m: any) => m.part === part)?.limit
						if (limit != null && groups.size > limit) {
							errors.push(`${regNo}: Part ${part} allows any ${limit} question(s), ${groups.size} answered`)
						}
					}
				}
			}
		}

		if (errors.length > 0) {
			return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
		}

		// Split records: update existing, insert new
		// Check which students already have marks for this course + session + round.
		// No is_active filter — the unique constraint
		// (student_id, course_offering_id, examination_session_id, cia_round)
		// covers soft-deleted rows too, so we must route them to UPDATE instead
		// of INSERT (the update payload sets is_active=true, reactivating the row).
		const studentIdsToCheck = records.map((r: any) => r.student_id)
		const coId = records[0]?.course_offering_id
		const { data: existingRows } = await supabase
			.from('cia_marks')
			.select('id, student_id')
			.eq('course_offering_id', coId)
			.eq('examination_session_id', examination_session_id)
			.eq('cia_round', Number(cia_round) || 1)
			.in('student_id', studentIdsToCheck)

		const existingMap = new Map((existingRows || []).map(r => [r.student_id, r.id]))

		const toInsert: any[] = []
		const toUpdate: { id: string, studentId: string, data: any }[] = []

		for (const record of records) {
			const existingId = existingMap.get(record.student_id)
			if (existingId) {
				// Update existing row
				const { institutions_id: _i, examination_session_id: _e, course_offering_id: _c, student_id: _s, exam_registration_id: _r, cia_round: _cr, ...updateFields } = record
				toUpdate.push({ id: existingId, studentId: record.student_id, data: updateFields })
			} else {
				toInsert.push(record)
			}
		}

		let insertCount = 0
		let updateCount = 0

		// Bulk insert new records
		if (toInsert.length > 0) {
			const { data: inserted, error: insertError } = await supabase
				.from('cia_marks')
				.insert(toInsert)
				.select('id')
			if (insertError) {
				console.error('Error inserting cia_marks:', insertError)
				return NextResponse.json({ error: 'Failed to save new marks', details: insertError.message }, { status: 500 })
			}
			insertCount = inserted?.length || 0
		}

		// Update existing rows in small parallel batches — a sequential loop meant
		// 60 round trips for a full class re-save, which is exactly when a flaky
		// connection drops out half way.
		const UPDATE_BATCH = 10
		const failedRegisterNos: string[] = []
		const regNoByStudent = new Map<string, string>(
			learner_marks.map((lm: any) => [lm.student_id, lm.register_no || lm.student_id])
		)

		for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
			const batch = toUpdate.slice(i, i + UPDATE_BATCH)
			const results = await Promise.all(
				batch.map(({ id, data: updateData }) =>
					supabase
						.from('cia_marks')
						.update(updateData)
						.eq('id', id)
						.then(res => ({ studentId: updateData.student_id, error: res.error }))
						.catch(err => ({ studentId: updateData.student_id, error: err }))
				)
			)
			for (const res of results) {
				if (res.error) {
					console.error('Error updating cia_marks:', res.error)
					failedRegisterNos.push(regNoByStudent.get(res.studentId) || 'unknown')
				} else {
					updateCount++
				}
			}
		}

		// A partial write must never look like a clean save — the caller has to know
		// which learners still need re-saving.
		if (failedRegisterNos.length > 0) {
			return NextResponse.json({
				success: false,
				error: `Saved ${insertCount + updateCount} of ${records.length} learners — ${failedRegisterNos.length} failed. Re-save to retry; learners already saved will simply update.`,
				details: failedRegisterNos,
				count: insertCount + updateCount,
				inserted: insertCount,
				updated: updateCount,
				failed: failedRegisterNos.length,
			}, { status: 500 })
		}

		return NextResponse.json({
			success: true,
			count: insertCount + updateCount,
			inserted: insertCount,
			updated: updateCount,
			failed: 0,
			message: `Saved marks: ${insertCount} new, ${updateCount} updated`
		}, { status: 201 })
	} catch (error) {
		console.error('Internal mark entry POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
