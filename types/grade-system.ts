/**
 * Grade System Type Definitions
 *
 * This module contains all TypeScript interfaces for the grade system module.
 * These types are used across the application for type safety and consistency.
 */

/**
 * GradeSystem - Main entity representing a grade system configuration
 */
export interface GradeSystem {
	id: string
	institutions_id: string
	institutions_code: string
	grade_system_code: 'UG' | 'PG'
	grade_id: string
	grade: string
	grade_point: number
	min_mark: number
	max_mark: number
	description: string
	regulation_code: string
	is_active: boolean
	created_at: string
	updated_at?: string
}

/**
 * Institution - Foreign key reference for institutions
 */
export interface Institution {
	id: string
	institution_code: string
	name?: string
}

/**
 * Regulation - Foreign key reference for regulations
 */
export interface Regulation {
	id: string
	regulation_code: string
	name?: string
}

/**
 * Grade - Foreign key reference for grades
 */
export interface Grade {
	id: string
	grade: string
	grade_point: number
	regulation_code?: string
}

/**
 * GradeSystemFormData - Form data structure for creating/updating grade systems
 */
export interface GradeSystemFormData {
	institutions_code: string
	grade_system_code: string
	grade_id: string
	regulation_code: string
	min_mark: string
	max_mark: string
	description: string
	is_active: boolean
}

/**
 * GradeSystemPayload - API payload structure for save operations
 */
export interface GradeSystemPayload {
	institutions_code: string
	grade_system_code: 'UG' | 'PG'
	grade_id: string
	regulation_code: string
	min_mark: number
	max_mark: number
	description: string
	is_active: boolean
}
