// End-Semester question papers (ese_question_papers).
//
// The end-semester counterpart of ia_question_papers. The two are deliberately
// the same shape from `questions` down, so the scaffold, the editor, the
// validator and the PDF renderer are shared rather than forked — what differs is
// that an ESE paper has no CIA round, carries its exam type, and cannot exist
// without a format (template_id is NOT NULL).
//
// Migration: supabase/migrations/20260829_ese_question_papers.sql

import type { IaQuestionObject } from '@/lib/ia/paper-scaffold'

export type EsePaperStatus = 'draft' | 'submitted' | 'approved' | 'locked'

export interface EseQuestionPaper {
	id: string
	institutions_id: string
	institution_code: string | null

	examination_session_id: string
	exam_type_id: string | null

	course_offering_id: string | null
	course_id: string | null
	course_code: string | null
	program_code: string | null
	semester: number | null

	template_id: string
	template_version: number | null

	set_number: number
	set_label: string | null

	subject_title: string | null
	exam_date: string | null
	duration_minutes: number | null
	max_marks: number | null

	questions: IaQuestionObject[]
	default_font: string | null

	status: EsePaperStatus

	submitted_at: string | null
	approved_by: string | null
	approved_at: string | null
	locked_at: string | null

	created_by: string | null
	is_active: boolean
	created_at: string
	updated_at: string
}

/** A list row: the questions array is replaced by counts to keep payloads small. */
export interface EseQuestionPaperListRow
	extends Omit<EseQuestionPaper, 'questions'> {
	/** At least one question has text. */
	authored: boolean
	authored_count: number
	question_count: number
	template_name: string | null
	/** The assignment covering this paper, when one has been made. */
	assignment: {
		id: string
		status: string
		examiner_kind: 'internal' | 'external'
		examiner_name: string | null
		examiner_email: string | null
		valid_from: string
		valid_to: string
		order_ref_no: string | null
	} | null
}

/**
 * One generable subject: a course offering in an end-semester session, with the
 * format that would be used and whether a paper already exists for it.
 */
export interface EseGenerableRow {
	course_offering_id: string
	course_id: string | null
	course_code: string
	subject_title: string
	course_category: string | null
	program_code: string
	program_type: 'ug' | 'pg'
	semester: number
	set_number: number
	set_label: string | null

	/** Suggested format, resolved from course category + programme type. */
	suggested_template_id: string | null
	suggested_template_name: string | null
	/** Why no format applies, when suggested_template_id is null. */
	no_template_reason: string | null

	/** Set once the paper has been generated. */
	paper_id: string | null
	paper_status: EsePaperStatus | null
	paper_template_id: string | null
	paper_template_name: string | null
	max_marks: number | null
	duration_minutes: number | null
	authored: boolean
	authored_count: number
	question_count: number

	assigned: boolean
	assignment_status: string | null
	examiner_name: string | null
}

export interface EseGenerateInput {
	institutions_id: string
	institution_code?: string | null
	examination_session_id: string
	/** Which offerings to generate for, and with which format. */
	items: { course_offering_id: string; set_number: number; template_id: string }[]
	/** Rebuild the question skeleton of a paper that already exists. */
	rebuild?: boolean
}

export interface EseGenerateResult {
	success: boolean
	created: number
	rebuilt: number
	skipped: number
	failed: { course_code: string; reason: string }[]
	message: string
}
