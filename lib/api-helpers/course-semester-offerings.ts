import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The offerings whose registrations make up the learner list of one course in one
 * semester: every offering of the selected offering's course code in the same session
 * and the SAME semester.
 *
 * It spans programs because a learner can be registered against another program's copy
 * of a shared elective. It stops at the semester because a program can offer one course
 * code in two semesters of a session (CEC352 in ECE semesters 5 and 7), and matching
 * registrations on the course code alone listed the other semester's learners too.
 *
 * Always contains `courseOfferingId` itself.
 */
export async function offeringIdsOfCourseInSemester(
	supabase: SupabaseClient,
	courseOfferingId: string,
	examinationSessionId: string,
): Promise<string[]> {
	const { data: selected } = await supabase
		.from('course_offerings')
		.select('course_code, semester, institutions_id')
		.eq('id', courseOfferingId)
		.single()

	if (!selected?.course_code || selected.semester == null) return [courseOfferingId]

	const { data: sameCourse, error } = await supabase
		.from('course_offerings')
		.select('id')
		.eq('institutions_id', selected.institutions_id)
		.eq('examination_session_id', examinationSessionId)
		.eq('course_code', selected.course_code)
		.eq('semester', selected.semester)

	if (error) {
		console.error('Error fetching offerings of the course:', error)
	}

	return [...new Set([courseOfferingId, ...(sameCourse || []).map(o => o.id as string)])]
}
