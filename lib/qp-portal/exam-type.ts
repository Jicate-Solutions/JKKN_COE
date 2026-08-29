// Which examinations get a question-paper setter appointment.
//
// Spec §2/§4: the assignment screen is available only when the session's exam
// type is an End Semester Examination. Institutions name that type slightly
// differently ("End Semester Examinations", "End-Sem Exam", code "ESE"), so the
// test is a shape match on the name AND the code rather than an exact string.

export interface ExamTypeLike {
	examination_name?: string | null
	examination_code?: string | null
}

export function isEndSemesterExamType(examType: ExamTypeLike | null | undefined): boolean {
	if (!examType) return false
	const haystack = `${examType.examination_name || ''} ${examType.examination_code || ''}`.toLowerCase()
	// "end sem", "end-semester", "endsemester" — and a standalone ESE code.
	return /end[\s_-]*sem/.test(haystack) || /(^|[^a-z])ese([^a-z]|$)/.test(haystack)
}

/** Human explanation for the refusal, used in API errors and in the UI banner. */
export function endSemesterMismatchMessage(
	sessionName: string,
	examType: ExamTypeLike | null | undefined
): string {
	return `Question paper setters are appointed for End Semester Examinations only. "${sessionName}" is configured as "${examType?.examination_name || 'no exam type'}".`
}
