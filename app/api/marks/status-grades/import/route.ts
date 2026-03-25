import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Valid status grades - must match DB check constraints
 */
const VALID_STATUS_GRADES = ['Commended', 'Highly Commended', 'AAA'] as const

function isValidStatusGrade(grade: string): boolean {
	return VALID_STATUS_GRADES.includes(grade as typeof VALID_STATUS_GRADES[number])
}

/**
 * POST /api/marks/status-grades/import
 *
 * Import status grades from parsed Excel data.
 * The client-side parses the Excel file and sends the parsed rows.
 *
 * Body:
 *   - institutions_id (required)
 *   - examination_session_id (required)
 *   - course_id (required)
 *   - status_type: 'internal' | 'external' (required)
 *   - grades: [{ register_no, grade }] (required)
 */
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			institutions_id,
			examination_session_id,
			course_id,
			status_type,
			grades
		} = body

		// Validate required fields
		if (!institutions_id || !examination_session_id || !course_id || !status_type) {
			return NextResponse.json({
				error: 'Missing required fields: institutions_id, examination_session_id, course_id, status_type'
			}, { status: 400 })
		}

		if (!grades || !Array.isArray(grades) || grades.length === 0) {
			return NextResponse.json({ error: 'No grade data provided' }, { status: 400 })
		}

		if (status_type !== 'internal' && status_type !== 'external') {
			return NextResponse.json({ error: 'status_type must be "internal" or "external"' }, { status: 400 })
		}

		// Validate course is a status paper
		const { data: course, error: courseError } = await supabase
			.from('courses')
			.select('id, result_type, course_code')
			.eq('id', course_id)
			.single()

		if (courseError || !course) {
			return NextResponse.json({ error: 'Course not found' }, { status: 404 })
		}

		if (course.result_type?.toUpperCase() !== 'STATUS') {
			return NextResponse.json({ error: 'This course is not a status-based paper' }, { status: 400 })
		}

		// Get exam registrations for lookup
		const { data: examRegistrations, error: erError } = await supabase
			.from('exam_registrations')
			.select('id, student_id, stu_register_no, student_name, course_offering_id')
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.eq('course_code', course.course_code)
			.range(0, 9999)

		if (erError) {
			console.error('Error fetching exam registrations:', erError)
			return NextResponse.json({ error: 'Failed to fetch exam registrations' }, { status: 500 })
		}

		// Build register_no -> exam_registration map
		const regNoMap = new Map<string, {
			id: string
			student_id: string
			course_offering_id: string
		}>()

		for (const er of (examRegistrations || [])) {
			const regNo = er.stu_register_no?.toLowerCase()?.trim()
			if (regNo) {
				regNoMap.set(regNo, {
					id: er.id,
					student_id: er.student_id,
					course_offering_id: er.course_offering_id
				})
			}
		}

		const results = {
			total: grades.length,
			successful: 0,
			failed: 0,
			skipped: 0,
			errors: [] as { row: number; register_no: string; error: string }[]
		}

		// Process each row
		for (let i = 0; i < grades.length; i++) {
			const row = grades[i]
			const rowNumber = i + 2 // +2 for Excel header row (1-indexed)
			const registerNo = String(row.register_no || '').trim()
			const grade = String(row.grade || '').trim()

			// Validate register number
			if (!registerNo) {
				results.failed++
				results.errors.push({
					row: rowNumber,
					register_no: registerNo || 'EMPTY',
					error: 'Register number is required'
				})
				continue
			}

			// Validate grade
			if (!grade) {
				results.skipped++
				continue // Skip empty grades
			}

			if (!isValidStatusGrade(grade)) {
				results.failed++
				results.errors.push({
					row: rowNumber,
					register_no: registerNo,
					error: `Invalid grade "${grade}". Must be one of: ${VALID_STATUS_GRADES.join(', ')}`
				})
				continue
			}

			// Find exam registration
			const examReg = regNoMap.get(registerNo.toLowerCase())
			if (!examReg) {
				results.failed++
				results.errors.push({
					row: rowNumber,
					register_no: registerNo,
					error: `Student with register number "${registerNo}" not found in exam registrations for this course`
				})
				continue
			}

			try {
				if (status_type === 'internal') {
					// Upsert internal_marks.grade
					const { data: existing } = await supabase
						.from('internal_marks')
						.select('id')
						.eq('student_id', examReg.student_id)
						.eq('course_id', course_id)
						.eq('is_active', true)
						.maybeSingle()

					if (existing) {
						const { error } = await supabase
							.from('internal_marks')
							.update({ grade, updated_at: new Date().toISOString() })
							.eq('id', existing.id)

						if (error) throw error
					} else {
						const { error } = await supabase
							.from('internal_marks')
							.insert({
								institutions_id,
								examination_session_id,
								exam_registration_id: examReg.id,
								course_offering_id: examReg.course_offering_id,
								program_id: null,
								course_id,
								student_id: examReg.student_id,
								grade,
								total_internal_marks: 0,
								max_internal_marks: 0,
								submission_date: new Date().toISOString().split('T')[0],
								marks_status: 'Draft',
								is_active: true
							})

						if (error) throw error
					}
				} else {
					// Upsert marks_entry.grade
					const { data: existing } = await supabase
						.from('marks_entry')
						.select('id')
						.eq('exam_registration_id', examReg.id)
						.eq('course_id', course_id)
						.eq('is_active', true)
						.maybeSingle()

					if (existing) {
						const { error } = await supabase
							.from('marks_entry')
							.update({ grade, updated_at: new Date().toISOString() })
							.eq('id', existing.id)

						if (error) throw error
					} else {
						const { error } = await supabase
							.from('marks_entry')
							.insert({
								institutions_id,
								examination_session_id,
								exam_registration_id: examReg.id,
								course_id,
								grade,
								total_marks_obtained: 0,
								total_marks_in_words: 'ZERO',
								marks_out_of: 0,
								evaluation_date: new Date().toISOString().split('T')[0],
								source: 'Excel Import - Status Grade',
								entry_status: 'Draft',
								is_active: true
							})

						if (error) throw error
					}
				}

				results.successful++
			} catch (err: any) {
				results.failed++
				results.errors.push({
					row: rowNumber,
					register_no: registerNo,
					error: err.message || 'Database error'
				})
			}
		}

		return NextResponse.json(results)
	} catch (error) {
		console.error('Status grades import error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
