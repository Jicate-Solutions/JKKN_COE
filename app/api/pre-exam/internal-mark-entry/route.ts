import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const action = searchParams.get('action')
		const supabase = getSupabaseServer()

		switch (action) {
			// ─── Cascading filter: programs → semesters → courses ───
			// Each step queries exam_registrations directly (no row-limit issues)
			case 'filter-cascade': {
				const step = searchParams.get('step')
				const institutionsId = searchParams.get('institutions_id')
				const sessionId = searchParams.get('examination_session_id')

				if (!institutionsId || !sessionId) {
					return NextResponse.json({ error: 'institutions_id and examination_session_id are required' }, { status: 400 })
				}

				// STEP 1: Get distinct program_codes that have regular registrations
				if (step === 'programs') {
					const { data, error } = await supabase
						.from('exam_registrations')
						.select('program_code')
						.eq('institutions_id', institutionsId)
						.eq('examination_session_id', sessionId)
						.eq('is_regular', true)
						.range(0, 49999)

					if (error) {
						console.error('Error fetching registered programs:', error)
						return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 500 })
					}

					const uniqueCodes = [...new Set((data || []).map(r => r.program_code).filter(Boolean))]
					return NextResponse.json(uniqueCodes.sort())
				}

				// STEP 2: Get distinct semesters for a program (via course_offerings join)
				if (step === 'semesters') {
					const programCode = searchParams.get('program_code')
					if (!programCode) {
						return NextResponse.json({ error: 'program_code is required' }, { status: 400 })
					}

					const { data, error } = await supabase
						.from('exam_registrations')
						.select('course_offering_id')
						.eq('institutions_id', institutionsId)
						.eq('examination_session_id', sessionId)
						.eq('program_code', programCode)
						.eq('is_regular', true)
						.range(0, 49999)

					if (error) {
						console.error('Error fetching registrations for semesters:', error)
						return NextResponse.json({ error: 'Failed to fetch semesters' }, { status: 500 })
					}

					const coIds = [...new Set((data || []).map(r => r.course_offering_id).filter(Boolean))]
					if (coIds.length === 0) return NextResponse.json([])

					const { data: offerings, error: coError } = await supabase
						.from('course_offerings')
						.select('semester')
						.in('id', coIds)
						.eq('is_active', true)

					if (coError) {
						console.error('Error fetching semesters from course_offerings:', coError)
						return NextResponse.json({ error: 'Failed to fetch semesters' }, { status: 500 })
					}

					const semesters = [...new Set((offerings || []).map(o => o.semester).filter(Boolean))].sort((a, b) => a - b)
					return NextResponse.json(semesters)
				}

				// STEP 3: Get courses for a program + semester
				if (step === 'courses') {
					const programCode = searchParams.get('program_code')
					const semester = searchParams.get('semester')

					if (!programCode || !semester) {
						return NextResponse.json({ error: 'program_code and semester are required' }, { status: 400 })
					}

					// Get course_offering_ids from exam_registrations for this program
					const { data: regs, error: regError } = await supabase
						.from('exam_registrations')
						.select('course_offering_id, course_code')
						.eq('institutions_id', institutionsId)
						.eq('examination_session_id', sessionId)
						.eq('program_code', programCode)
						.eq('is_regular', true)
						.range(0, 49999)

					if (regError) {
						console.error('Error fetching registrations for courses:', regError)
						return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
					}

					const coIds = [...new Set((regs || []).map(r => r.course_offering_id).filter(Boolean))]
					if (coIds.length === 0) return NextResponse.json([])

					// Fetch course_offerings filtered by semester
					const { data: offerings, error: coError } = await supabase
						.from('course_offerings')
						.select('id, course_id, program_id, semester, course_code, program_code')
						.in('id', coIds)
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
					const cmIds = [...new Set(offerings.map(o => o.course_id).filter(Boolean))]

					const [coursesRes, cmRes] = await Promise.all([
						supabase
							.from('courses')
							.select('id, course_code, course_name, internal_max_mark')
							.eq('institutions_id', institutionsId)
							.in('course_code', uniqueCourseCodes),
						supabase
							.from('course_mapping')
							.select('id, course_order')
							.in('id', cmIds)
					])

					const courseByCode = new Map((coursesRes.data || []).map(c => [c.course_code, c]))
					const cmById = new Map((cmRes.data || []).map(cm => [cm.id, cm]))

					// Deduplicate by course_offering_id
					const seen = new Set<string>()
					const results = offerings
						.filter(co => {
							if (seen.has(co.id)) return false
							seen.add(co.id)
							return true
						})
						.map(co => {
							const course = courseByCode.get(co.course_code)
							const cm = cmById.get(co.course_id)
							return {
								course_offering_id: co.id,
								course_mapping_id: co.course_id,
								course_id: course?.id || co.course_id,
								course_code: co.course_code,
								course_name: course?.course_name || co.course_code,
								internal_max_mark: course?.internal_max_mark || 100,
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
					cia_rounds: matched.cia_rounds,
				})
			}

			case 'learners': {
				const courseOfferingId = searchParams.get('course_offering_id')
				const sessionId = searchParams.get('examination_session_id')
				const ciaRound = searchParams.get('cia_round') || '1'

				if (!courseOfferingId || !sessionId) {
					return NextResponse.json({ error: 'course_offering_id and examination_session_id are required' }, { status: 400 })
				}

				// Fetch regular exam registrations for this course offering
				const { data: registrations, error: regError } = await supabase
					.from('exam_registrations')
					.select('id, student_id, stu_register_no, student_name, course_offering_id, institutions_id, is_regular')
					.eq('course_offering_id', courseOfferingId)
					.eq('examination_session_id', sessionId)
					.eq('is_regular', true)
					.order('stu_register_no')

				if (regError) {
					console.error('Error fetching exam registrations:', regError)
					return NextResponse.json({ error: 'Failed to fetch learners' }, { status: 500 })
				}

				if (!registrations || registrations.length === 0) {
					return NextResponse.json([])
				}

				// Get student IDs that already have cia_marks for this course + session + round
				const studentIds = registrations.map(r => r.student_id)
				const { data: existingMarks, error: marksError } = await supabase
					.from('cia_marks')
					.select('student_id')
					.eq('course_offering_id', courseOfferingId)
					.eq('examination_session_id', sessionId)
					.eq('cia_round', Number(ciaRound))
					.eq('is_active', true)
					.in('student_id', studentIds)

				if (marksError) {
					console.error('Error checking existing cia_marks:', marksError)
					return NextResponse.json({ error: 'Failed to check existing marks' }, { status: 500 })
				}

				const existingStudentIds = new Set((existingMarks || []).map(m => m.student_id))

				// Filter out learners who already have cia_marks
				const filtered = registrations.filter(r => !existingStudentIds.has(r.student_id))

				return NextResponse.json(filtered)
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
			}

			// Set component marks and max marks
			let totalMarks = 0
			for (const [code, maxVal] of Object.entries(max_marks || {})) {
				const markField = markFieldMap[code]
				const maxField = maxFieldMap[code]
				if (markField) {
					const mark = Number(lm.marks?.[code]) || 0
					record[markField] = mark
					totalMarks += mark
				}
				if (maxField) {
					record[maxField] = Number(maxVal) || 0
				}
			}

			record.total_internal_marks = totalMarks
			return record
		})

		// Validate marks don't exceed max
		const errors: string[] = []
		for (let i = 0; i < records.length; i++) {
			const lm = learner_marks[i]
			for (const [code, maxVal] of Object.entries(max_marks || {})) {
				const mark = Number(lm.marks?.[code]) || 0
				const max = Number(maxVal) || 0
				if (mark > max) {
					const regNo = lm.register_no || `Row ${i + 1}`
					errors.push(`${regNo}: ${code} mark (${mark}) exceeds max (${max})`)
				}
			}
		}

		if (errors.length > 0) {
			return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
		}

		// Bulk insert into cia_marks
		const { data, error } = await supabase
			.from('cia_marks')
			.insert(records)
			.select('id, student_id')

		if (error) {
			console.error('Error inserting cia_marks:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'Some learners already have marks for this course offering' }, { status: 400 })
			}
			if (error.code === '23503') {
				return NextResponse.json({ error: 'Invalid reference - check course offering and registration IDs' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to save marks', details: error.message }, { status: 500 })
		}

		return NextResponse.json({
			success: true,
			count: data?.length || 0,
			message: `Successfully saved marks for ${data?.length || 0} learners`
		}, { status: 201 })
	} catch (error) {
		console.error('Internal mark entry POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
