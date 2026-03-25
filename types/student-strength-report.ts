// Types for Student Strength Pre-Exam Report

export interface YearCount {
	aided: number
	sf: number
	total: number
}

export interface ProgramStrengthRow {
	s_no: number
	program_code: string
	program_name: string
	program_type: 'UG' | 'PG'
	program_order: number
	year_counts: Record<number, YearCount> // year number (1, 2, 3...) -> counts
}

export interface SubtotalRow {
	year_counts: Record<number, YearCount>
	grand: YearCount // sum across ALL years
}

export interface StudentStrengthReport {
	institution_name: string
	institution_code: string
	exam_session_name: string
	generated_at: string
	has_aided: boolean     // true if this institution has AIDED+SF split
	max_year: number       // highest academic year present in data
	ug_rows: ProgramStrengthRow[]
	pg_rows: ProgramStrengthRow[]
	ug_subtotal: SubtotalRow
	pg_subtotal: SubtotalRow
	grand_total: SubtotalRow
}
