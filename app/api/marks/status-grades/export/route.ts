import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/marks/status-grades/export
 *
 * Export status grades data as JSON for client-side Excel generation.
 * The client uses this data to build the Excel file with ExcelJS.
 *
 * Query params:
 *   - institutions_id (required)
 *   - examination_session_id (required)
 *   - course_id (required)
 *   - status_type: 'internal' | 'external' (required)
 *   - mode: 'template' | 'current' (default: 'template')
 */
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		const courseId = searchParams.get('course_id')
		const statusType = searchParams.get('status_type') as 'internal' | 'external'
		const mode = searchParams.get('mode') || 'template'

		if (!institutionsId || !sessionId || !courseId || !statusType) {
			return NextResponse.json({
				error: 'Missing required parameters: institutions_id, examination_session_id, course_id, status_type'
			}, { status: 400 })
		}

		// Get course info
		const { data: course, error: courseError } = await supabase
			.from('courses')
			.select('id, course_code, course_title, evaluation_type, result_type')
			.eq('id', courseId)
			.single()

		if (courseError || !course) {
			return NextResponse.json({ error: 'Course not found' }, { status: 404 })
		}

		// Get exam registrations
		const { data: examRegistrations, error: erError } = await supabase
			.from('exam_registrations')
			.select('id, student_id, stu_register_no, student_name, course_offering_id')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.eq('course_code', course.course_code)
			.order('stu_register_no')
			.range(0, 9999)

		if (erError) {
			console.error('Error fetching exam registrations:', erError)
			return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
		}

		if (!examRegistrations || examRegistrations.length === 0) {
			return NextResponse.json({
				rows: [],
				course_info: {
					course_code: course.course_code,
					course_title: course.course_title
				}
			})
		}

		// Get existing grades if mode is 'current'
		let existingGrades = new Map<string, string | null>()

		if (mode === 'current') {
			const studentIds = examRegistrations.map(er => er.student_id)
			const examRegIds = examRegistrations.map(er => er.id)

			if (statusType === 'internal') {
				const { data: internalMarks } = await supabase
					.from('internal_marks')
					.select('student_id, grade')
					.eq('course_id', courseId)
					.in('student_id', studentIds)
					.eq('is_active', true)
					.range(0, 9999)

				if (internalMarks) {
					for (const im of internalMarks) {
						existingGrades.set(im.student_id, im.grade)
					}
				}
			} else {
				const { data: marksEntries } = await supabase
					.from('marks_entry')
					.select('exam_registration_id, grade')
					.eq('course_id', courseId)
					.in('exam_registration_id', examRegIds)
					.eq('is_active', true)
					.range(0, 9999)

				if (marksEntries) {
					for (const me of marksEntries) {
						existingGrades.set(me.exam_registration_id, me.grade)
					}
				}
			}
		}

		// Build export rows
		const rows = examRegistrations.map(er => {
			const lookupKey = statusType === 'internal' ? er.student_id : er.id
			const currentGrade = existingGrades.get(lookupKey) || ''

			return {
				'Register No': er.stu_register_no || 'N/A',
				'Student Name': er.student_name || 'Unknown',
				'Current Grade': currentGrade,
				'New Grade': mode === 'template' ? '' : currentGrade
			}
		})

		return NextResponse.json({
			rows,
			course_info: {
				course_code: course.course_code,
				course_title: course.course_title
			}
		})
	} catch (error) {
		console.error('Status grades export error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
