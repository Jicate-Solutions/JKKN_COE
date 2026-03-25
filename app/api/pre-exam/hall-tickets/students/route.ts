/**
 * Hall Ticket Students API
 *
 * GET /api/pre-exam/hall-tickets/students?institution_code=XXX&examination_session_id=YYY&program_code=ZZZ&semester=3
 *
 * Returns distinct students from exam_registrations who are eligible for hall tickets
 * (registration_status = 'Approved', fee_paid = true).
 * Used for the learner dropdown on the hall tickets page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institution_code = searchParams.get('institution_code')
		const examination_session_id = searchParams.get('examination_session_id')
		const program_code = searchParams.get('program_code')
		const semester = searchParams.get('semester') // optional semester number filter

		if (!institution_code || !examination_session_id || !program_code) {
			return NextResponse.json(
				{ error: 'institution_code, examination_session_id, and program_code are required' },
				{ status: 400 }
			)
		}

		// Look up institution ID
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', institution_code)
			.single()

		if (instError || !institution) {
			return NextResponse.json(
				{ error: `Institution "${institution_code}" not found` },
				{ status: 404 }
			)
		}

		// Query distinct students from approved & fee-paid registrations
		const { data: registrations, error: regError } = await supabase
			.from('exam_registrations')
			.select('stu_register_no, student_name, is_regular, course_offering_id, course_offerings(semester)')
			.eq('institutions_id', institution.id)
			.eq('examination_session_id', examination_session_id)
			.eq('program_code', program_code)
			.eq('registration_status', 'Approved')
			.eq('fee_paid', true)
			.range(0, 9999)

		if (regError) {
			console.error('[HallTicket Students] Query error:', regError)
			return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
		}

		const semesterNum = semester ? parseInt(semester, 10) : null

		// First pass: qualify students who have at least one is_regular=true registration
		// in the requested semester (mirrors hall tickets API qualification logic)
		const qualifiedStudents = new Set<string>()
		for (const reg of registrations || []) {
			if (!reg.stu_register_no) continue
			const co = reg.course_offerings as any
			const regSemester = co?.semester
			if (semesterNum !== null) {
				if (regSemester === semesterNum && reg.is_regular !== false) {
					qualifiedStudents.add(reg.stu_register_no)
				}
			} else {
				// No semester filter: still require is_regular to exclude arrear-only students
				if (reg.is_regular !== false) {
					qualifiedStudents.add(reg.stu_register_no)
				}
			}
		}

		// Second pass: build unique student entries for qualified students only
		const studentMap = new Map<string, { stu_register_no: string; student_name: string }>()
		for (const reg of registrations || []) {
			if (!reg.stu_register_no || !qualifiedStudents.has(reg.stu_register_no)) continue
			if (!studentMap.has(reg.stu_register_no)) {
				studentMap.set(reg.stu_register_no, {
					stu_register_no: reg.stu_register_no,
					student_name: reg.student_name || ''
				})
			}
		}

		// Convert to sorted array
		const students = Array.from(studentMap.values())
			.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no))

		return NextResponse.json({
			students,
			total: students.length
		})
	} catch (err) {
		console.error('[HallTicket Students] Error:', err)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
