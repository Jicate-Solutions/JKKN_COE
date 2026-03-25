import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/marks/credit-entry
 *
 * Serves dropdown data and learner list for credit-type courses.
 * Credit courses have result_type = 'credit' on the courses table.
 * Only final_marks.credit is written — no grades, no marks.
 *
 * Actions:
 *   ?action=institutions
 *   ?action=sessions
 *   ?action=courses    — course_offerings where course.result_type = 'credit'
 *   ?action=students   — exam_registrations + credit assignment status
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

	// ── programs with credit courses in this session ───────────
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
			.eq('courses.result_type', 'credit')
			.not('program_code', 'is', null)
			.range(0, 9999)

		if (error) {
			console.error('Error fetching programs:', error)
			return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 500 })
		}

		const seen = new Set<string>()
		const programs = (data || []).filter(row => {
			if (seen.has(row.program_code)) return false
			seen.add(row.program_code)
			return true
		}).map(row => ({ program_id: row.program_id, program_code: row.program_code }))

		return NextResponse.json(programs)
	}

	// ── courses with result_type = 'credit' ────────────────────
	if (action === 'courses') {
		const institutionId = searchParams.get('institutionId')
		const sessionId = searchParams.get('sessionId')
		const programId = searchParams.get('programId')
		if (!institutionId || !sessionId) {
			return NextResponse.json({ error: 'institutionId and sessionId required' }, { status: 400 })
		}

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
			.eq('courses.result_type', 'credit')

		if (programId) query = query.eq('program_id', programId)

		const { data, error } = await query.range(0, 9999)

		if (error) {
			console.error('Error fetching credit courses:', error)
			return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
		}
		return NextResponse.json(data || [])
	}

	// ── students for a credit course ───────────────────────────
	if (action === 'students') {
		const institutionId = searchParams.get('institutionId')
		const sessionId = searchParams.get('sessionId')
		const courseId = searchParams.get('courseId')
		const courseOfferingId = searchParams.get('courseOfferingId')

		if (!institutionId || !sessionId || !courseOfferingId) {
			return NextResponse.json({ error: 'institutionId, sessionId and courseOfferingId required' }, { status: 400 })
		}

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

		if (!registrations?.length) {
			return NextResponse.json({ students: [], total: 0 })
		}

		const examRegIds = registrations.map(r => r.id)

		const { data: finalMarks } = await supabase
			.from('final_marks')
			.select('id, student_id, exam_registration_id, credit')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', sessionId)
			.eq('course_id', courseId || '')
			.in('exam_registration_id', examRegIds)
			.range(0, 9999)

		const finalMarksMap = new Map(
			(finalMarks || []).map(fm => [fm.exam_registration_id, fm])
		)

		const students = registrations.map(reg => {
			const fm = finalMarksMap.get(reg.id)
			return {
				student_id: reg.student_id,
				exam_registration_id: reg.id,
				final_marks_id: fm?.id || null,
				register_number: reg.stu_register_no,
				student_name: reg.student_name,
				already_assigned: !!fm && fm.credit != null,
				credit_value: fm?.credit ?? null,
			}
		})

		return NextResponse.json({ students, total: students.length })
	}

	return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

/**
 * POST /api/marks/credit-entry
 *
 * Assign credit value to all learners in a credit-type course.
 * Writes only to final_marks.credit — no grade, no marks.
 * Existing Mark/Status/comment courses are never touched by this route.
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
			credit_value,
			entries,
		} = body

		if (!institutions_id || !examination_session_id || !course_id || !entries?.length || credit_value == null) {
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

		const results = {
			successful: 0,
			failed: 0,
			errors: [] as { register_number: string; error: string }[],
		}

		for (const entry of entries) {
			if (entry.final_marks_id) {
				// Update existing row — only the credit column
				const { error } = await supabase
					.from('final_marks')
					.update({ credit: credit_value })
					.eq('id', entry.final_marks_id)

				if (error) {
					results.failed++
					results.errors.push({ register_number: entry.register_number, error: error.message })
				} else {
					results.successful++
				}
			} else {
				// Insert new final_marks row with all marks = 0, credit = credit_value
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
					// All numeric marks zero — credit type has no marks
					internal_marks_obtained: 0,
					internal_marks_maximum: 0,
					external_marks_obtained: 0,
					external_marks_maximum: 0,
					total_marks_obtained: 0,
					total_marks_maximum: 0,
					percentage: 0,
					// Credit assignment
					credit: credit_value,
					is_pass: true,
					pass_status: 'Credit',
					result_status: 'Pending',
					is_active: true,
				})

				if (error) {
					if (error.code === '23505') {
						// Duplicate — update credit on existing row
						const { error: updateError } = await supabase
							.from('final_marks')
							.update({ credit: credit_value })
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
		console.error('Credit entry save error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
