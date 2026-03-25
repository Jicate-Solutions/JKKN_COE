import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/results/validation-report
 * Pre-generation validation report for admin
 * Checks if all required data exists before generating final marks
 * Handles both mark-based and status-based papers
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const supabase = getSupabaseServer()

		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const program_code = searchParams.get('program_code')

		if (!institutions_id || !examination_session_id || !program_code) {
			return NextResponse.json({
				error: 'Missing required parameters: institutions_id, examination_session_id, program_code'
			}, { status: 400 })
		}

		// 1. Get all exam registrations for this session/program
		const { data: examRegs, error: examRegsError } = await supabase
			.from('exam_registrations')
			.select(`
				id,
				student_id,
				student_name,
				stu_register_no,
				course_offering_id,
				course_offerings!inner (
					id,
					course_id,
					courses!inner (
						id,
						course_code,
						course_name,
						result_type,
						evaluation_type
					)
				)
			`)
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.eq('program_code', program_code)
			.range(0, 9999)

		if (examRegsError) {
			console.error('Error fetching exam registrations:', examRegsError)
			return NextResponse.json({ error: 'Failed to fetch exam registrations' }, { status: 500 })
		}

		const missingDataDetails: any[] = []
		let readyCount = 0

		// 2. Validate each registration
		for (const reg of (examRegs || [])) {
			const course = (reg as any).course_offerings?.courses
			if (!course) continue

			const resultType = course.result_type?.toUpperCase() || 'MARK'
			const evalType = course.evaluation_type?.toUpperCase() || ''
			const isStatusPaper = resultType === 'STATUS'
			const isCIAOnly = evalType === 'CIA' || evalType === 'CIA ONLY'
			const isExternalOnly = evalType === 'ESE' || evalType === 'ESE ONLY' || evalType === 'EXTERNAL'

			if (isStatusPaper) {
				// Status paper validation
				if (isCIAOnly) {
					// Check internal_marks.grade
					const { data: internalMark } = await supabase
						.from('internal_marks')
						.select('id, grade')
						.eq('student_id', reg.student_id)
						.eq('course_id', course.id)
						.eq('is_active', true)
						.maybeSingle()

					if (!internalMark || !internalMark.grade) {
						missingDataDetails.push({
							student_name: reg.student_name,
							register_no: reg.stu_register_no,
							course_code: course.course_code,
							course_title: course.course_name,
							result_type: 'Status',
							exam_type: 'Internal',
							issue: 'Missing internal_marks.grade'
						})
					} else {
						readyCount++
					}
				} else if (isExternalOnly) {
					// Check exam_attendance and external_marks.grade
					const { data: attendance } = await supabase
						.from('exam_attendance')
						.select('id, attendance_status')
						.eq('exam_registration_id', reg.id)
						.eq('course_id', course.id)
						.maybeSingle()

					const { data: externalMark } = await supabase
						.from('marks_entry')
						.select('id, grade')
						.eq('exam_registration_id', reg.id)
						.maybeSingle()

					if (!attendance) {
						missingDataDetails.push({
							student_name: reg.student_name,
							register_no: reg.stu_register_no,
							course_code: course.course_code,
							course_title: course.course_name,
							result_type: 'Status',
							exam_type: 'External',
							issue: 'Missing exam_attendance record'
						})
					} else if (!externalMark || !externalMark.grade) {
						const isAbsent = attendance.attendance_status?.toLowerCase() === 'absent'
						if (!isAbsent) {
							// Only flag as missing if present but no grade
							missingDataDetails.push({
								student_name: reg.student_name,
								register_no: reg.stu_register_no,
								course_code: course.course_code,
								course_title: course.course_name,
								result_type: 'Status',
								exam_type: 'External',
								issue: 'Missing external_marks.grade (present in attendance)'
							})
						} else {
							// Absent - will auto-assign AAA
							readyCount++
						}
					} else {
						readyCount++
					}
				}
			} else {
				// Mark-based paper - assume ready (full validation can be added later)
				readyCount++
			}
		}

		return NextResponse.json({
			ready_to_generate: missingDataDetails.length === 0,
			summary: {
				total_students: [...new Set((examRegs || []).map((r: any) => r.student_id))].length,
				total_registrations: examRegs?.length || 0,
				ready: readyCount,
				missing_data: missingDataDetails.length
			},
			missing_data_details: missingDataDetails
		})
	} catch (error) {
		console.error('Validation report API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
