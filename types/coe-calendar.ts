export type CoeCalendarCategory =
	| 'CIA_I'
	| 'CIA_II'
	| 'MODEL_EXAM'
	| 'PRACTICAL_EXAM'
	| 'SEMESTER_THEORY'
	| 'GENERAL'

export type CoeCalendarProgrammeType = 'UG' | 'PG' | 'BOTH'

export type CoeCalendarStatus = 'ACTIVE' | 'INACTIVE'

export interface CoeCalendarEvent {
	id: string
	institutions_id: string
	institution_code: string | null
	academic_year: string
	programme_type: CoeCalendarProgrammeType
	exam_category: CoeCalendarCategory
	event_title: string
	event_description: string | null
	event_start_date: string // ISO date: 'YYYY-MM-DD'
	event_end_date: string   // ISO date: 'YYYY-MM-DD'
	is_bulk_uploaded: boolean
	status: CoeCalendarStatus
	created_at: string
	updated_at: string
}

export interface CoeCalendarFormData {
	event_title: string
	event_description: string
	exam_category: CoeCalendarCategory | ''
	programme_type: CoeCalendarProgrammeType | ''
	academic_year: string
	event_start_date: string
	event_end_date: string
	status: CoeCalendarStatus
	institutions_id: string
	institution_code: string
}

export const COE_CATEGORY_CONFIG: Record<CoeCalendarCategory, {
	label: string
	color: string
	bgColor: string
	textColor: string
}> = {
	CIA_I:           { label: 'CIA-I',        color: 'bg-blue-500',   bgColor: 'bg-blue-50 dark:bg-blue-500/10',    textColor: 'text-blue-700 dark:text-blue-400' },
	CIA_II:          { label: 'CIA-II',        color: 'bg-amber-500',  bgColor: 'bg-amber-50 dark:bg-amber-500/10',  textColor: 'text-amber-700 dark:text-amber-400' },
	MODEL_EXAM:      { label: 'Model Exam',    color: 'bg-purple-500', bgColor: 'bg-purple-50 dark:bg-purple-500/10',textColor: 'text-purple-700 dark:text-purple-400' },
	PRACTICAL_EXAM:  { label: 'Practical',     color: 'bg-teal-500',   bgColor: 'bg-teal-50 dark:bg-teal-500/10',   textColor: 'text-teal-700 dark:text-teal-400' },
	SEMESTER_THEORY: { label: 'Semester',      color: 'bg-rose-500',   bgColor: 'bg-rose-50 dark:bg-rose-500/10',   textColor: 'text-rose-700 dark:text-rose-400' },
	GENERAL:         { label: 'General',       color: 'bg-slate-400',  bgColor: 'bg-slate-50 dark:bg-slate-500/10', textColor: 'text-slate-600 dark:text-slate-400' },
}

export const COE_CATEGORIES: CoeCalendarCategory[] = [
	'CIA_I', 'CIA_II', 'MODEL_EXAM', 'PRACTICAL_EXAM', 'SEMESTER_THEORY', 'GENERAL',
]

export const COE_PROGRAMME_TYPES: CoeCalendarProgrammeType[] = ['UG', 'PG', 'BOTH']
