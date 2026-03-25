/**
 * MyJKKN Reference Cache Types
 *
 * Types for the local cache of MyJKKN API entities.
 * Used when COE tables store MyJKKN UUIDs and need to resolve them to actual data.
 */

// Entity types that can be cached (matches the SQL enum)
export type MyJKKNEntityType =
	| 'program'
	| 'semester'
	| 'regulation'
	| 'batch'
	| 'learner_profile'
	| 'staff'
	| 'department'
	| 'institution'

// Cached entity record from the database
export interface MyJKKNCacheRecord {
	id: string
	myjkkn_id: string
	entity_type: MyJKKNEntityType
	entity_code: string | null
	entity_name: string | null
	entity_data: Record<string, unknown>
	institution_id: string | null
	is_active: boolean
	last_synced_at: string
	created_at: string
	updated_at: string
}

// Resolved entity with typed data
export interface ResolvedProgram {
	id: string
	program_code: string
	program_name: string
	short_name?: string
	institution_id?: string
	department_id?: string
	degree_id?: string
	duration_years?: number
	total_semesters?: number
	is_active: boolean
}

export interface ResolvedSemester {
	id: string
	semester_code?: string
	semester_name: string
	semester_number?: number
	institution_id?: string
	program_id?: string
	is_active: boolean
}

export interface ResolvedRegulation {
	id: string
	regulation_code: string
	regulation_name: string
	description?: string
	effective_year?: number
	end_year?: number
	institution_id?: string
	is_active: boolean
}

export interface ResolvedBatch {
	id: string
	batch_code?: string
	batch_name: string
	start_year?: number
	end_year?: number
	institution_id?: string
	program_id?: string
	regulation_id?: string
	is_active: boolean
}

export interface ResolvedLearnerProfile {
	id: string
	register_number?: string
	roll_number?: string
	first_name: string
	last_name?: string
	full_name: string
	email?: string
	phone?: string
	institution_id?: string
	program_id?: string
	department_id?: string
	batch_id?: string
	current_semester?: number
	admission_year?: number
	is_active: boolean
}

export interface ResolvedStaff {
	id: string
	staff_code?: string
	first_name: string
	last_name?: string
	full_name: string
	email?: string
	phone?: string
	designation?: string
	department_id?: string
	institution_id?: string
	is_active: boolean
}

export interface ResolvedDepartment {
	id: string
	department_code: string
	department_name: string
	short_name?: string
	institution_id?: string
	is_active: boolean
}

export interface ResolvedInstitution {
	id: string
	institution_code: string
	name: string
	short_name?: string
	is_active: boolean
}

// Union type for all resolved entities
export type ResolvedEntity =
	| ResolvedProgram
	| ResolvedSemester
	| ResolvedRegulation
	| ResolvedBatch
	| ResolvedLearnerProfile
	| ResolvedStaff
	| ResolvedDepartment
	| ResolvedInstitution

// Map entity type to resolved type
export interface EntityTypeMap {
	program: ResolvedProgram
	semester: ResolvedSemester
	regulation: ResolvedRegulation
	batch: ResolvedBatch
	learner_profile: ResolvedLearnerProfile
	staff: ResolvedStaff
	department: ResolvedDepartment
	institution: ResolvedInstitution
}

// Lookup request
export interface MyJKKNLookupRequest {
	ids: string[]
	entity_type: MyJKKNEntityType
	force_refresh?: boolean // Force fetch from API even if cached
}

// Lookup response
export interface MyJKKNLookupResponse<T extends ResolvedEntity = ResolvedEntity> {
	data: Record<string, T>  // Keyed by MyJKKN ID
	cached_count: number
	fetched_count: number
	missing_ids: string[]
}

// API endpoint mapping for entity types
export const MYJKKN_ENTITY_ENDPOINTS: Record<MyJKKNEntityType, string> = {
	program: '/api/myjkkn/programs',
	semester: '/api/myjkkn/semesters',
	regulation: '/api/myjkkn/regulations',
	batch: '/api/myjkkn/batches',
	learner_profile: '/api/myjkkn/learner-profiles',
	staff: '/api/myjkkn/staff',
	department: '/api/myjkkn/departments',
	institution: '/api/myjkkn/institutions',
}

// Field mappings for extracting code/name from API response
export const MYJKKN_ENTITY_FIELDS: Record<MyJKKNEntityType, { code: string; name: string }> = {
	program: { code: 'program_code', name: 'program_name' },
	semester: { code: 'semester_code', name: 'semester_name' },
	regulation: { code: 'regulation_code', name: 'regulation_name' },
	batch: { code: 'batch_code', name: 'batch_name' },
	learner_profile: { code: 'register_number', name: 'first_name' },
	staff: { code: 'staff_code', name: 'first_name' },
	department: { code: 'department_code', name: 'department_name' },
	institution: { code: 'institution_code', name: 'name' },
}
