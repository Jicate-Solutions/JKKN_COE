import type { CoeRoleTag } from '@/lib/coe-calendar/visibility'

export type { CoeRoleTag }

/**
 * Category codes are no longer a closed union — they live in
 * `coe_calendar_categories` and can be added from the database. The literal
 * union below is kept for the seeded codes so existing call sites keep their
 * autocomplete, but any string is accepted.
 */
export type CoeCalendarCategory =
	| 'CIA_I'
	| 'CIA_II'
	| 'MODEL_EXAM'
	| 'PRACTICAL_EXAM'
	| 'SEMESTER_THEORY'
	| 'FEES'
	| 'COE_TASK'
	| 'GENERAL'
	| (string & {})

export type CoeCalendarProgrammeType = 'UG' | 'PG' | 'BOTH'

export type CoeCalendarStatus = 'ACTIVE' | 'INACTIVE'

export interface CoeCalendarEvent {
	id: string
	institutions_id: string
	institution_code: string | null
	myjkkn_institution_ids: string[] | null
	academic_year: string
	programme_type: CoeCalendarProgrammeType
	exam_category: CoeCalendarCategory
	event_title: string
	event_description: string | null
	event_start_date: string // ISO date: 'YYYY-MM-DD'
	event_end_date: string   // ISO date: 'YYYY-MM-DD'
	visible_to_roles: CoeRoleTag[]
	/** Programme codes this event targets. null = every programme. */
	program_codes: string[] | null
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
	visible_to_roles: CoeRoleTag[]
	/** Empty = applies to every programme. */
	program_codes: string[]
	status: CoeCalendarStatus
	institutions_id: string
	institution_code: string
}

/** Row of `coe_calendar_categories`. */
export interface CoeCalendarCategoryRecord {
	id: string
	code: string
	label: string
	description: string | null
	color_code: string
	bg_class: string | null
	text_class: string | null
	icon_name: string | null
	default_visible_to_roles: CoeRoleTag[]
	sort_order: number
	/** Owning institution — every category belongs to exactly one. */
	institutions_id: string
	myjkkn_institution_ids: string[] | null
	is_active: boolean
}

export interface CoeCategoryStyle {
	label: string
	color: string
	bgColor: string
	textColor: string
}

/**
 * Static fallback styles.
 *
 * Categories are database-driven now, but this map keeps rendering correct
 * before the categories request resolves, and for any consumer that has not
 * been wired to the categories endpoint. `resolveCategoryStyle` prefers live
 * data and falls back here.
 */
export const COE_CATEGORY_CONFIG: Record<string, CoeCategoryStyle> = {
	CIA_I:           { label: 'CIA-I',      color: 'bg-blue-500',   bgColor: 'bg-blue-50 dark:bg-blue-500/10',       textColor: 'text-blue-700 dark:text-blue-400' },
	CIA_II:          { label: 'CIA-II',     color: 'bg-amber-500',  bgColor: 'bg-amber-50 dark:bg-amber-500/10',     textColor: 'text-amber-700 dark:text-amber-400' },
	MODEL_EXAM:      { label: 'Model Exam', color: 'bg-purple-500', bgColor: 'bg-purple-50 dark:bg-purple-500/10',   textColor: 'text-purple-700 dark:text-purple-400' },
	PRACTICAL_EXAM:  { label: 'Practical',  color: 'bg-teal-500',   bgColor: 'bg-teal-50 dark:bg-teal-500/10',       textColor: 'text-teal-700 dark:text-teal-400' },
	SEMESTER_THEORY: { label: 'Semester',   color: 'bg-rose-500',   bgColor: 'bg-rose-50 dark:bg-rose-500/10',       textColor: 'text-rose-700 dark:text-rose-400' },
	FEES:            { label: 'Fees',       color: 'bg-emerald-500', bgColor: 'bg-emerald-50 dark:bg-emerald-500/10', textColor: 'text-emerald-700 dark:text-emerald-400' },
	COE_TASK:        { label: 'COE Task',   color: 'bg-indigo-500', bgColor: 'bg-indigo-50 dark:bg-indigo-500/10',   textColor: 'text-indigo-700 dark:text-indigo-400' },
	GENERAL:         { label: 'General',    color: 'bg-slate-400',  bgColor: 'bg-slate-50 dark:bg-slate-500/10',     textColor: 'text-slate-600 dark:text-slate-400' },
}

const UNKNOWN_CATEGORY_STYLE: CoeCategoryStyle = {
	label: 'Unknown',
	color: 'bg-slate-400',
	bgColor: 'bg-slate-50 dark:bg-slate-500/10',
	textColor: 'text-slate-600 dark:text-slate-400',
}

/**
 * Resolves display styling for a category code, preferring live category rows
 * and falling back to the static map. Never returns undefined — an unrecognised
 * code renders as a neutral chip rather than crashing on a missing key.
 *
 * When `institutionsId` is supplied, prefers that institution's row — the same
 * code can exist once per institution after full scoping.
 */
export function resolveCategoryStyle(
	code: string,
	categories?: readonly CoeCalendarCategoryRecord[],
	institutionsId?: string | null,
): CoeCategoryStyle {
	const record = institutionsId
		? categories?.find(c => c.code === code && c.institutions_id === institutionsId)
			|| categories?.find(c => c.code === code)
		: categories?.find(c => c.code === code)
	if (record) {
		return {
			label: record.label,
			color: COE_CATEGORY_CONFIG[code]?.color || 'bg-slate-400',
			bgColor: record.bg_class || COE_CATEGORY_CONFIG[code]?.bgColor || UNKNOWN_CATEGORY_STYLE.bgColor,
			textColor: record.text_class || COE_CATEGORY_CONFIG[code]?.textColor || UNKNOWN_CATEGORY_STYLE.textColor,
		}
	}
	return COE_CATEGORY_CONFIG[code] || { ...UNKNOWN_CATEGORY_STYLE, label: code }
}

export const COE_CATEGORIES: CoeCalendarCategory[] = [
	'CIA_I', 'CIA_II', 'MODEL_EXAM', 'PRACTICAL_EXAM',
	'SEMESTER_THEORY', 'FEES', 'COE_TASK', 'GENERAL',
]

export const COE_PROGRAMME_TYPES: CoeCalendarProgrammeType[] = ['UG', 'PG', 'BOTH']
