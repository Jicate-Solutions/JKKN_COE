// Internal Assessment Question Paper Template type definitions
// Following JKKN terminology (learners, learning facilitators).
// Design doc: docs/plans/2026-07-17-ia-question-paper-templates.md

export type ExamScope = 'cia' | 'ese' | 'all'
export type TemplateStatus = 'draft' | 'active' | 'archived'
export type PaperStatus = 'draft' | 'submitted' | 'approved' | 'locked'
// A single course-type token. 'theory_practical' is legacy (pre multi-select) and
// is read as theory + practical.
export type CourseTypeApplicability = 'theory' | 'practical' | 'project' | 'theory_practical' | 'all'
// What is actually stored: one or more tokens joined by commas ('theory,practical'),
// or 'all'. Parse/serialize via lib/ia/course-type-applicability.ts.
export type CourseTypeApplicabilityValue = string
export type ProgramTypeApplicability = 'ug' | 'pg' | 'diploma' | 'certificate' | 'all'

// ============================================================================
// QUESTION TYPE REGISTRY (per-institution configurable)
// ============================================================================

export interface IaQuestionType {
	id: string
	institutions_id: string
	institution_code: string
	type_code: string
	type_label: string
	description?: string
	is_objective: boolean
	has_options: boolean
	default_option_count?: number | null
	display_order: number
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface IaQuestionTypeFormData {
	type_code: string
	type_label: string
	description: string
	is_objective: boolean
	has_options: boolean
	default_option_count: string
	display_order: string
	is_active: boolean
}

// ============================================================================
// PAPER TEMPLATE (header + parts)
// ============================================================================

export interface IaTemplatePart {
	id: string
	template_id: string
	part_label: string
	part_title?: string
	instruction?: string
	question_type_code: string
	num_questions: number
	// "Answer any N": how many of num_questions count toward marks. NULL = all.
	num_to_answer?: number | null
	marks_per_question: number
	has_choice: boolean
	choice_group_size: number
	option_count?: number | null
	capture_co: boolean
	capture_klevel: boolean
	part_max_marks: number
	display_order: number
	is_active: boolean
	created_at?: string
	updated_at?: string
}

export interface IaPaperTemplate {
	id: string
	institutions_id: string
	institution_code: string
	regulation_id?: string
	regulation_code?: string

	template_code: string
	template_name: string
	description?: string

	exam_scope: ExamScope
	course_type_applicability: CourseTypeApplicabilityValue
	program_type_applicability: ProgramTypeApplicability

	total_marks: number
	duration_minutes?: number | null

	capture_co: boolean
	capture_klevel: boolean

	wef_date: string
	version_number: number
	status: TemplateStatus
	is_default: boolean

	created_by?: string
	approved_by?: string
	approved_at?: string
	is_active: boolean
	created_at: string
	updated_at: string

	// Joined
	ia_template_parts?: IaTemplatePart[]
}

// Form shapes used by the designer UI
export interface IaTemplatePartFormData {
	part_label: string
	part_title: string
	instruction: string
	question_type_code: string
	num_questions: string
	num_to_answer: string
	marks_per_question: string
	has_choice: boolean
	choice_group_size: string
	option_count: string
	capture_co: boolean
	capture_klevel: boolean
	display_order: string
}

export interface IaPaperTemplateFormData {
	institution_code: string
	regulation_code: string
	template_code: string
	template_name: string
	description: string
	exam_scope: ExamScope
	course_type_applicability: CourseTypeApplicabilityValue
	program_type_applicability: ProgramTypeApplicability
	duration_minutes: string
	capture_co: boolean
	capture_klevel: boolean
	wef_date: string
	is_default: boolean
	is_active: boolean
	parts: IaTemplatePartFormData[]
}

// ============================================================================
// COURSE OUTCOMES MASTER
// ============================================================================

export interface IaCourseOutcome {
	id: string
	institutions_id: string
	course_id: string
	course_code: string
	co_code: string
	co_description?: string
	display_order: number
	is_active: boolean
	created_at: string
	updated_at: string
}

// ============================================================================
// QUESTION PAPER INSTANCE + QUESTIONS (Phase 2)
// ============================================================================

export interface IaPaperQuestionOption {
	key: string
	text: string
}

export interface IaPaperQuestion {
	id: string
	paper_id: string
	part_id?: string
	part_label?: string
	question_number: number
	sub_label?: string
	is_choice_alternative: boolean
	question_type_code?: string
	question_text?: string
	marks?: number
	options?: IaPaperQuestionOption[]
	correct_option?: string
	co_code?: string
	k_level?: string
	display_order: number
}

export interface IaQuestionPaper {
	id: string
	institutions_id: string
	examination_session_id: string
	cia_setting_id?: string
	cia_round?: number
	cia_round_name?: string
	course_offering_id?: string
	course_id?: string
	course_code?: string
	program_code?: string
	semester?: number
	template_id?: string
	template_version?: number
	set_number: number
	set_label?: string
	subject_title?: string
	exam_date?: string
	duration_minutes?: number
	max_marks?: number
	status: PaperStatus
	paper_setter_id?: string
	created_at: string
	updated_at: string

	// Computed by the list API: true when the paper has ≥1 question with text
	authored?: boolean

	// Questions live in this JSONB array (source of truth)
	questions?: IaPaperQuestion[]
	// Legacy per-row join, kept for transition-period fallback
	ia_paper_questions?: IaPaperQuestion[]
}

// ============================================================================
// K-LEVEL (Bloom) reference — seeded from the question-bank skill
// ============================================================================

export const K_LEVELS: { code: string; label: string }[] = [
	{ code: 'K1', label: 'K1 — Remember' },
	{ code: 'K2', label: 'K2 — Understand' },
	{ code: 'K3', label: 'K3 — Apply' },
	{ code: 'K4', label: 'K4 — Analyze' },
	{ code: 'K5', label: 'K5 — Evaluate' },
	{ code: 'K6', label: 'K6 — Create' },
]
