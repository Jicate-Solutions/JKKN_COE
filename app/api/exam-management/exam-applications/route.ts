import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { buildExamApplicationCourses } from '@/lib/exam-applications/course-list'
import { fetchAllRows } from '@/lib/exam-applications/paginate'
import { buildRegistrationPricer } from '@/lib/exam-fee/calculate'
import type { ExamApplicationSubmitResult } from '@/types/exam-applications'

/**
 * Exam Application API
 *
 * An exam application is stored using the existing exam_registrations table so the
 * downstream exam pipeline (timetables, hall tickets, marks) keeps working unchanged.
 * Courses coming from a backlog are written as arrear registrations (is_regular=false,
 * attempt_number = attempt_count + 1) and the matching backlog row is flagged.
 */

/**
 * Status stamped on rows created through the Exam Application flow. It distinguishes
 * an application from a registration entered directly on the Exam Registrations page.
 */
const APPLICATION_STATUS = 'Applied'

// GET: applied courses for a learner in a session
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const student_id = searchParams.get('student_id')
		const register_number = (searchParams.get('register_number') || '').trim()

		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}
		if (!examination_session_id) {
			return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		}
		if (!student_id && !register_number) {
			return NextResponse.json({ error: 'Either student_id or register_number is required' }, { status: 400 })
		}

		const clauses: string[] = []
		if (student_id) clauses.push(`student_id.eq.${student_id}`)
		if (register_number) clauses.push(`stu_register_no.eq."${register_number.replace(/"/g, '')}"`)

		let data: any[]
		try {
			// Paged rather than `.range(0, 9999)`, which the server silently truncates
			// at 1000 rows. `created_at` is not unique, so fetchAllRows adds `id` as the
			// tiebreaker - without one, rows drift between pages and some are lost.
			data = await fetchAllRows<any>(
				() => supabase
					.from('exam_registrations')
					.select('*, course_offering:course_offerings(id, course_code, program_code, semester)')
					.eq('institutions_id', institutions_id)
					.eq('examination_session_id', examination_session_id)
					.or(clauses.join(',')),
				{ orderColumn: 'created_at', ascending: false, label: 'exam_registrations' }
			)
		} catch (error) {
			console.error('Exam applications fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch exam applications' }, { status: 500 })
		}

		return NextResponse.json({ data: data || [], total: (data || []).length })
	} catch (e) {
		console.error('Exam applications API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST: submit an exam application (final eligibility validation happens here)
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const institutions_id = body.institutions_id
		const examination_session_id = body.examination_session_id
		const student_id = body.student_id || null
		const register_number = (body.register_number || '').trim()
		const student_name = (body.student_name || '').trim()
		const program_code = (body.program_code || '').trim() || null
		const semester = body.semester != null ? Number(body.semester) : null
		const requestedCourses: any[] = Array.isArray(body.courses) ? body.courses : []

		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}
		if (!examination_session_id) {
			return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		}
		// exam_registrations declares stu_register_no and student_name NOT NULL, so both
		// are mandatory here even though the course list can be built from student_id alone.
		if (!register_number) {
			return NextResponse.json({ error: 'register_number is required' }, { status: 400 })
		}
		if (!student_name) {
			return NextResponse.json({ error: 'student_name is required' }, { status: 400 })
		}
		if (requestedCourses.length === 0) {
			return NextResponse.json({ error: 'Select at least one course to apply for' }, { status: 400 })
		}

		// ---------------------------------------------------------
		// 1. Rebuild the authoritative course list server-side
		// ---------------------------------------------------------
		const courses = await buildExamApplicationCourses(supabase, {
			institutions_id,
			examination_session_id,
			student_id,
			register_number: register_number || null,
			program_code,
			semester: Number.isFinite(semester) && (semester as number) > 0 ? semester : null,
		})

		const byCode = new Map(courses.map(c => [c.key, c]))

		// Per-paper exam fee at the learner's programme tier, from exam_fee_master.
		// Mark statement / application / late fine are once-per-session charges and
		// are deliberately not stamped on a paper row.
		const pricer = await buildRegistrationPricer(supabase, {
			institutions_id,
			examination_session_id,
			course_codes: courses.map(c => c.course_code),
			courses,
		})

		// ---------------------------------------------------------
		// 2. Resolve denormalized code columns once
		// ---------------------------------------------------------
		let institution_code = body.institution_code || null
		if (!institution_code) {
			const { data: inst } = await supabase
				.from('institutions')
				.select('institution_code')
				.eq('id', institutions_id)
				.maybeSingle()
			institution_code = inst?.institution_code || null
		}
		if (!institution_code) {
			return NextResponse.json({ error: 'Institution not found' }, { status: 400 })
		}

		let session_code = body.session_code || null
		if (!session_code) {
			const { data: sess } = await supabase
				.from('examination_sessions')
				.select('session_code')
				.eq('id', examination_session_id)
				.maybeSingle()
			session_code = sess?.session_code || null
		}
		if (!session_code) {
			return NextResponse.json({ error: 'Examination session not found' }, { status: 400 })
		}

		// ---------------------------------------------------------
		// 3. Validate + insert each selected course
		// ---------------------------------------------------------
		const results: ExamApplicationSubmitResult[] = []
		const backlogIdsToFlag: string[] = []
		const now = new Date().toISOString()

		for (const requested of requestedCourses) {
			const rawCode = String(requested?.course_code || '').trim()
			const key = rawCode.toUpperCase()
			const course = byCode.get(key)

			if (!rawCode) {
				results.push({ course_code: rawCode || '(blank)', status: 'failed', reason: 'Missing course code' })
				continue
			}
			if (!course) {
				results.push({ course_code: rawCode, status: 'failed', reason: 'Course is not part of this learner application list' })
				continue
			}
			if (course.is_registered) {
				results.push({ course_code: rawCode, status: 'skipped', reason: 'Already registered in this session' })
				continue
			}
			if (!course.is_eligible || !course.course_offering_id) {
				results.push({
					course_code: rawCode,
					status: 'failed',
					reason: course.eligibility_reason || `Not eligible (${course.eligibility_status})`,
				})
				continue
			}

			const insertPayload = {
				institutions_id,
				institution_code,
				student_id,
				stu_register_no: register_number,
				student_name,
				examination_session_id,
				session_code,
				course_offering_id: course.course_offering_id,
				course_code: course.course_code,
				program_code: course.program_code || program_code,
				registration_date: now,
				registration_status: APPLICATION_STATUS,
				is_regular: !course.is_backlog,
				attempt_number: course.attempt_number,
				fee_paid: false,
				fee_amount: pricer.priceFor(course.program_code || program_code, course.course_code),
			}

			const { data: inserted, error: insertError } = await supabase
				.from('exam_registrations')
				.insert([insertPayload])
				.select('id')
				.single()

			if (insertError) {
				if (insertError.code === '23505') {
					results.push({ course_code: rawCode, status: 'skipped', reason: 'Already registered in this session' })
				} else if (insertError.code === '23503') {
					results.push({ course_code: rawCode, status: 'failed', reason: 'Invalid reference (offering or session no longer exists)' })
				} else if (insertError.code === '23502') {
					const field = insertError.message?.match(/column "(\w+)"/)?.[1]?.replace(/_/g, ' ') || 'a required field'
					results.push({ course_code: rawCode, status: 'failed', reason: `Missing required value: ${field}` })
				} else if (insertError.code === '23514') {
					results.push({ course_code: rawCode, status: 'failed', reason: 'Rejected by a database check constraint' })
				} else {
					console.error('Exam application insert error:', insertError)
					results.push({ course_code: rawCode, status: 'failed', reason: insertError.message || 'Failed to save' })
				}
				continue
			}

			results.push({ course_code: rawCode, status: 'created', registration_id: inserted?.id })
			if (course.is_backlog && course.backlog_id) backlogIdsToFlag.push(course.backlog_id)
		}

		// ---------------------------------------------------------
		// 4. Flag the backlogs that were applied for as arrear-registered
		// ---------------------------------------------------------
		if (backlogIdsToFlag.length > 0) {
			const { error: backlogError } = await supabase
				.from('student_backlogs')
				.update({
					is_registered_for_arrear: true,
					arrear_registration_date: now.slice(0, 10),
					arrear_exam_session_id: examination_session_id,
					updated_at: now,
				})
				.in('id', backlogIdsToFlag)

			if (backlogError) {
				// The registrations are already saved - surface it but do not fail the request.
				console.error('Exam application backlog flag error:', backlogError)
			}
		}

		const created = results.filter(r => r.status === 'created').length
		const skipped = results.filter(r => r.status === 'skipped').length
		const failed = results.filter(r => r.status === 'failed').length

		return NextResponse.json(
			{
				success: failed === 0,
				summary: { total: results.length, created, skipped, failed },
				results,
			},
			{ status: created > 0 ? 201 : 200 }
		)
	} catch (e) {
		console.error('Exam application submit error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

// DELETE: withdraw an applied course
export async function DELETE(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		const { error } = await supabase.from('exam_registrations').delete().eq('id', id)

		if (error) {
			if (error.code === '23503') {
				return NextResponse.json({ error: 'Cannot withdraw - marks or timetable records already exist' }, { status: 400 })
			}
			console.error('Exam application delete error:', error)
			return NextResponse.json({ error: 'Failed to withdraw the applied course' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (e) {
		console.error('Exam application delete error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
