import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * POST /api/results/generate-semester-results
 * Generate semester results and auto-insert backlogs for failed/absent courses
 * Handles both mark-based and status-based papers
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			institutions_id,
			examination_session_id,
			program_id,
			student_ids // Optional: specific students, or all if not provided
		} = body

		if (!institutions_id || !examination_session_id) {
			return NextResponse.json({
				error: 'Missing required fields: institutions_id, examination_session_id'
			}, { status: 400 })
		}

		// 1. Get all final_marks for this session (mark AND status papers)
		let finalMarksQuery = supabase
			.from('final_marks')
			.select(`
				id,
				student_id,
				course_id,
				course_offering_id,
				examination_session_id,
				pass_status,
				is_pass,
				letter_grade,
				courses:course_id (
					id,
					course_code,
					course_name,
					result_type
				)
			`)
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.eq('is_active', true)

		if (program_id) {
			finalMarksQuery = finalMarksQuery.eq('program_id', program_id)
		}

		if (student_ids && student_ids.length > 0) {
			finalMarksQuery = finalMarksQuery.in('student_id', student_ids)
		}

		const { data: finalMarks, error: finalMarksError } = await finalMarksQuery

		if (finalMarksError) {
			console.error('Error fetching final marks:', finalMarksError)
			return NextResponse.json({ error: 'Failed to fetch final marks' }, { status: 500 })
		}

		// 2. Insert backlogs for failed/absent courses (both mark and status papers)
		const backlogsToInsert: any[] = []
		const failedCourses = (finalMarks || []).filter((fm: any) =>
			!fm.is_pass ||
			fm.pass_status === 'Absent' ||
			fm.pass_status === 'Reappear' ||
			fm.letter_grade === 'AAA' // Status paper absent
		)

		for (const failedCourse of failedCourses) {
			// Determine backlog type
			let backlogType: 'Fail' | 'Absent' = 'Fail'
			if (failedCourse.pass_status === 'Absent' || failedCourse.letter_grade === 'AAA') {
				backlogType = 'Absent'
			}

			backlogsToInsert.push({
				student_id: failedCourse.student_id,
				course_id: failedCourse.course_id,
				course_offering_id: failedCourse.course_offering_id,
				examination_session_id: failedCourse.examination_session_id,
				institutions_id,
				backlog_type: backlogType,
				status: 'Active',
				is_active: true
			})
		}

		// 3. Upsert backlogs (prevent duplicates)
		let backlogInsertCount = 0
		if (backlogsToInsert.length > 0) {
			const { data: insertedBacklogs, error: backlogError } = await supabase
				.from('student_backlog')
				.upsert(backlogsToInsert, {
					onConflict: 'student_id,course_id,examination_session_id',
					ignoreDuplicates: false
				})
				.select()

			if (backlogError) {
				console.error('Error inserting backlogs:', backlogError)
			} else {
				backlogInsertCount = insertedBacklogs?.length || 0
			}
		}

		// 4. Generate semester results per student
		const studentsMap = new Map<string, any>()
		for (const fm of (finalMarks || [])) {
			if (!studentsMap.has(fm.student_id)) {
				studentsMap.set(fm.student_id, {
					student_id: fm.student_id,
					total_courses: 0,
					courses_passed: 0,
					courses_failed: 0,
					backlogs: 0
				})
			}
			const studentData = studentsMap.get(fm.student_id)
			studentData.total_courses++
			if (fm.is_pass) {
				studentData.courses_passed++
			} else {
				studentData.courses_failed++
				studentData.backlogs++
			}
		}

		const semesterResults: any[] = []
		for (const [studentId, studentData] of studentsMap.entries()) {
			// Rule: Any backlog = Fail
			const result = studentData.backlogs > 0 ? 'Fail' : 'Pass'

			semesterResults.push({
				student_id: studentId,
				examination_session_id,
				institutions_id,
				program_id,
				total_courses: studentData.total_courses,
				courses_passed: studentData.courses_passed,
				courses_failed: studentData.courses_failed,
				result,
				is_active: true
			})
		}

		// 5. Save semester results
		let semesterSaveCount = 0
		if (semesterResults.length > 0) {
			const { data: savedResults, error: semesterError } = await supabase
				.from('semester_results')
				.upsert(semesterResults, {
					onConflict: 'student_id,examination_session_id'
				})
				.select()

			if (semesterError) {
				console.error('Error saving semester results:', semesterError)
			} else {
				semesterSaveCount = savedResults?.length || 0
			}
		}

		return NextResponse.json({
			success: true,
			students_processed: studentsMap.size,
			passed: semesterResults.filter(sr => sr.result === 'Pass').length,
			failed: semesterResults.filter(sr => sr.result === 'Fail').length,
			backlogs_created: backlogInsertCount,
			semester_results_saved: semesterSaveCount,
			summary: {
				total_backlogs: backlogsToInsert.length,
				mark_backlogs: backlogsToInsert.filter((b: any) => {
					const fm = finalMarks?.find((f: any) => f.student_id === b.student_id && f.course_id === b.course_id)
					return fm?.courses?.result_type !== 'Status'
				}).length,
				status_backlogs: backlogsToInsert.filter((b: any) => {
					const fm = finalMarks?.find((f: any) => f.student_id === b.student_id && f.course_id === b.course_id)
					return fm?.courses?.result_type === 'Status'
				}).length
			}
		})
	} catch (error) {
		console.error('Semester results API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
