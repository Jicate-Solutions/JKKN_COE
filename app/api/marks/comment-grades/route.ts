import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/marks/comment-grades
 *
 * Serves dropdown data and learner list for comment-type courses.
 * Comment courses have result_type = 'comment' on the courses table.
 * Grades are written directly to final_marks (no internal_marks or marks_entry step).
 *
 * Actions:
 *   ?action=institutions  — list active institutions
 *   ?action=sessions      — list sessions for an institution
 *   ?action=courses       — list course_offerings where course.result_type = 'comment'
 *   ?action=students      — list exam_registrations + current final_marks grades
 */
export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const action = searchParams.get('action')

	// ── institutions ───────────────────────────────────────────
	if (action === 'institutions') {
		const { data, error } = await supabase
			.from('institutions')
			.select('id, name, institution_code')
			.eq('is_active', true)
			.order('name')
		if (error) return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 })
		return NextResponse.json(data || [])
	}

	// ── sessions ────────────────────────────────────────────────
	if (action === 'sessions') {
		const institutionId = searchParams.get('institutionId')
		if (!institutionId) return NextResponse.json({ error: 'institutionId required' }, { status: 400 })
		const { data, error } = await supabase
			.from('examination_sessions')
			.select('id, session_name, session_code')
			.eq('institutions_id', institutionId)
			.order('created_at', { ascending: false })
		if (error) return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
		return NextResponse.json(data || [])
	}

	// ── programs with comment courses in this session ──────────
	if (action === 'programs') {
		const institutionId = searchParams.get('institutionId')
		const sessionId = searchParams.get('sessionId')
		if (!institutionId || !sessionId) {
			return NextResponse.json({ error: 'institutionId and sessionId required' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('course_offerings')
			.select('program_id, program_code, courses!inner(result_type)')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', sessionId)
			.eq('courses.result_type', 'comment')
			.not('program_code', 'is', null)
			.range(0, 9999)

		if (error) {
			console.error('Error fetching programs:', error)
			return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 500 })
		}

		// Deduplicate by program_code
		const seen = new Set<string>()
		const programs = (data || []).filter(row => {
			if (seen.has(row.program_code)) return false
			seen.add(row.program_code)
			return true
		}).map(row => ({ program_id: row.program_id, program_code: row.program_code }))

		return NextResponse.json(programs)
	}

	// ── courses with result_type = 'comment' ───────────────────
	if (action === 'courses') {
		const institutionId = searchParams.get('institutionId')
		const sessionId = searchParams.get('sessionId')
		const programId = searchParams.get('programId')
		if (!institutionId || !sessionId) {
			return NextResponse.json({ error: 'institutionId and sessionId required' }, { status: 400 })
		}

		// Fetch course_offerings joined to courses, filtered by result_type = 'comment'
		let query = supabase
			.from('course_offerings')
			.select(`
				id,
				course_id,
				program_id,
				program_code,
				courses!inner(id, course_code, course_name, result_type, evaluation_type)
			`)
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', sessionId)
			.eq('courses.result_type', 'comment')

		if (programId) query = query.eq('program_id', programId)

		const { data, error } = await query.range(0, 9999)

		if (error) {
			console.error('Error fetching comment courses:', error)
			return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
		}
		return NextResponse.json(data || [])
	}

	// ── students for a comment course ──────────────────────────
	if (action === 'students') {
		const institutionId = searchParams.get('institutionId')
		const sessionId = searchParams.get('sessionId')
		const courseId = searchParams.get('courseId')
		const courseOfferingId = searchParams.get('courseOfferingId')

		if (!institutionId || !sessionId || !courseOfferingId) {
			return NextResponse.json({ error: 'institutionId, sessionId and courseOfferingId required' }, { status: 400 })
		}

		// Step 1: Get exam registrations via course_offering_id
		const { data: registrations, error: regError } = await supabase
			.from('exam_registrations')
			.select('id, student_id, stu_register_no, student_name')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', sessionId)
			.eq('course_offering_id', courseOfferingId)
			.eq('registration_status', 'Approved')
			.order('stu_register_no')
			.range(0, 9999)

		if (regError) {
			console.error('Error fetching registrations:', regError)
			return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
		}

		if (!registrations || registrations.length === 0) {
			return NextResponse.json({ students: [], total: 0 })
		}

		const examRegIds = registrations.map(r => r.id)

		// Step 2: Get existing final_marks (if any were already saved)
		const { data: finalMarks } = await supabase
			.from('final_marks')
			.select('id, student_id, exam_registration_id, letter_grade, grade_description')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', sessionId)
			.eq('course_id', courseId || '')
			.in('exam_registration_id', examRegIds)
			.range(0, 9999)

		const finalMarksMap = new Map(
			(finalMarks || []).map(fm => [fm.exam_registration_id, fm])
		)

		// Step 3: Build student rows
		const students = registrations.map(reg => {
			const fm = finalMarksMap.get(reg.id)
			return {
				student_id: reg.student_id,
				exam_registration_id: reg.id,
				final_marks_id: fm?.id || null,
				register_number: reg.stu_register_no,
				student_name: reg.student_name,
				current_grade: fm?.letter_grade || null,
				current_description: fm?.grade_description || null,
			}
		})

		return NextResponse.json({ students, total: students.length })
	}

	return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

/**
 * POST /api/marks/comment-grades
 *
 * Save comment grades directly to final_marks for modified learners.
 * Upserts: updates existing rows, inserts new ones.
 * Existing Mark/Status courses are never touched by this route.
 */
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			institutions_id,
			examination_session_id,
			course_id,
			course_offering_id,
			program_id,
			entries,
		} = body

		if (!institutions_id || !examination_session_id || !course_id || !entries?.length) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}

		// Resolve program_id and program_code from course_offerings if not supplied by the client
		let resolvedProgramId = program_id || null
		let resolvedProgramCode: string | null = null
		if (course_offering_id) {
			const { data: co } = await supabase
				.from('course_offerings')
				.select('program_id, program_code')
				.eq('id', course_offering_id)
				.single()
			if (co) {
				resolvedProgramId = resolvedProgramId || co.program_id || null
				resolvedProgramCode = co.program_code || null
			}
		}

		// Look up grade details (grade_points, description, qualify) from grades table
		const gradeValues = [...new Set(entries.map((e: any) => e.grade))] as string[]
		const { data: gradeData } = await supabase
			.from('grades')
			.select('grade, grade_point, description, qualify, result_status')
			.eq('institutions_id', institutions_id)
			.eq('grade_category', 'comment')
			.in('grade', gradeValues)

		const gradeMap = new Map((gradeData || []).map((g: any) => [g.grade, g]))

		const results = {
			successful: 0,
			failed: 0,
			errors: [] as { register_number: string; error: string }[],
		}

		for (const entry of entries) {
			const gradeInfo = gradeMap.get(entry.grade)

			if (entry.final_marks_id) {
				// Update existing final_marks row (only grade-related columns)
				const { error } = await supabase
					.from('final_marks')
					.update({
						letter_grade: entry.grade,
						grade_description: gradeInfo?.description || entry.grade,
						grade_points: gradeInfo?.grade_point ?? 0,
						is_pass: gradeInfo?.qualify ?? true,
						pass_status: gradeInfo?.result_status || 'Pass',
					})
					.eq('id', entry.final_marks_id)

				if (error) {
					console.error('Update error:', error)
					results.failed++
					results.errors.push({ register_number: entry.register_number, error: error.message })
				} else {
					results.successful++
				}
			} else {
				// Insert new final_marks row with all marks = 0
				const { error } = await supabase.from('final_marks').insert({
					institutions_id,
					examination_session_id,
					exam_registration_id: entry.exam_registration_id,
					course_offering_id: course_offering_id || null,
					program_id: resolvedProgramId,
					program_code: resolvedProgramCode,
					course_id,
					student_id: entry.student_id,
					register_number: entry.register_number,
					// All numeric marks zero — comment type has no marks
					internal_marks_obtained: 0,
					internal_marks_maximum: 0,
					external_marks_obtained: 0,
					external_marks_maximum: 0,
					total_marks_obtained: 0,
					total_marks_maximum: 0,
					percentage: 0,
					// Grade fields
					letter_grade: entry.grade,
					grade_description: gradeInfo?.description || entry.grade,
					grade_points: gradeInfo?.grade_point ?? 0,
					is_pass: gradeInfo?.qualify ?? true,
					pass_status: gradeInfo?.result_status || 'Pass',
					result_status: 'Pending',
					is_active: true,
				})

				if (error) {
					console.error('Insert error:', error)
					if (error.code === '23505') {
						// Duplicate — try update instead
						const { error: updateError } = await supabase
							.from('final_marks')
							.update({
								letter_grade: entry.grade,
								grade_description: gradeInfo?.description || entry.grade,
								grade_points: gradeInfo?.grade_point ?? 0,
								is_pass: gradeInfo?.qualify ?? true,
								pass_status: gradeInfo?.result_status || 'Pass',
							})
							.eq('exam_registration_id', entry.exam_registration_id)
							.eq('course_id', course_id)

						if (updateError) {
							results.failed++
							results.errors.push({ register_number: entry.register_number, error: updateError.message })
						} else {
							results.successful++
						}
					} else {
						results.failed++
						results.errors.push({ register_number: entry.register_number, error: error.message })
					}
				} else {
					results.successful++
				}
			}
		}

		return NextResponse.json(results)
	} catch (e) {
		console.error('Comment grades save error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
