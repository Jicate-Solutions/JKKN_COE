import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { buildExamApplicationCourses } from '@/lib/exam-applications/course-list'

/**
 * Exam Application - Course List API
 *
 * Returns the merged, de-duplicated course list for a single learner in one
 * examination session. Courses are gathered from three sources:
 *   1. Exam Registration - existing rows in exam_registrations
 *   2. Backlog / Arrear  - uncleared rows in student_backlogs_detailed_view
 *   3. Offer List        - course_offerings for the programme + semester
 *
 * Duplicates are merged by course code and every row carries its eligibility.
 */
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const student_id = searchParams.get('student_id')
		const register_number = (searchParams.get('register_number') || '').trim()
		const program_code = (searchParams.get('program_code') || '').trim()
		const semesterParam = searchParams.get('semester')

		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}
		if (!examination_session_id) {
			return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		}
		if (!student_id && !register_number) {
			return NextResponse.json({ error: 'Either student_id or register_number is required' }, { status: 400 })
		}

		const parsedSemester = semesterParam ? parseInt(semesterParam, 10) : NaN
		const semester = Number.isFinite(parsedSemester) && parsedSemester > 0 ? parsedSemester : null

		const courses = await buildExamApplicationCourses(supabase, {
			institutions_id,
			examination_session_id,
			student_id: student_id || null,
			register_number: register_number || null,
			program_code: program_code || null,
			semester,
		})

		const summary = {
			total: courses.length,
			eligible: courses.filter(c => c.is_eligible).length,
			registered: courses.filter(c => c.is_registered).length,
			backlog: courses.filter(c => c.is_backlog).length,
			offer_list: courses.filter(c => c.sources.includes('Offer List')).length,
			not_eligible: courses.filter(c => !c.is_eligible).length,
		}

		return NextResponse.json({ data: courses, summary })
	} catch (e) {
		console.error('Exam application courses API error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
