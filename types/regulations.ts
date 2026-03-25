// Regulation type definitions
export interface Regulation {
	id: number
	regulation_year: number
	regulation_code: string
	status: boolean
	minimum_internal: number
	minimum_external: number
	minimum_attendance: number
	minimum_total: number
	maximum_internal: number
	maximum_external: number
	maximum_total: number
	maximum_qp_marks: number
	condonation_range_start: number
	condonation_range_end: number
	institutions_id?: string
	institution_code: string
	created_at: string
	updated_at: string
}

export interface RegulationFormData {
	regulation_code: string
	regulation_year: number
	status: boolean
	minimum_internal: number
	minimum_external: number
	minimum_attendance: number | undefined
	minimum_total: number
	maximum_internal: number
	maximum_external: number
	maximum_total: number
	maximum_qp_marks: number
	condonation_range_start: number
	condonation_range_end: number
	institutions_id?: string
	institution_code: string
}

export interface RegulationImportError {
	row: number
	regulation_code: string
	regulation_year: number
	errors: string[]
}

export interface UploadSummary {
	total: number
	success: number
	failed: number
}

export interface InstitutionOption {
	id: string
	institution_code: string
	name?: string
}
