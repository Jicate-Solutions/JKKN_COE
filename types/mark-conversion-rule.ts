export interface AttendanceSlab {
	min_pct: number
	max_pct: number
	award_pct: number
}

export interface ComponentRule {
	raw_out_of?: number
	converts_to?: number
	strategy?: 'use_slabs'
}

export interface RoundRule {
	components: string[]
	cap_total: number
}

export type FinalFormula = 'sum' | 'average' | 'best_of'

export interface FinalRule {
	formula: FinalFormula
	rounds: string[]
	best_of?: number
	extras?: Array<{ component: string; marks: number }>
	compare_to: 'course.internal_max_marks'
}

export interface MarkConversionRule {
	id: string
	institutions_id: string
	institution_code: string
	regulation_id: string | null
	regulation_code: string | null
	wef_date: string
	rule_name: string
	description: string | null
	attendance_slabs: AttendanceSlab[]
	component_rules: Record<string, ComponentRule>
	round_rules: Record<string, RoundRule>
	final_rule: FinalRule
	is_active: boolean
	created_at: string
	updated_at: string
	created_by: string | null
	updated_by: string | null
}
