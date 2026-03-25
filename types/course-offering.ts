/**
 * Course Offering Type Definitions
 *
 * This module contains all TypeScript interfaces for the course offering module.
 * These types are used across the application for type safety and consistency.
 */

/**
 * CourseOffering - Main entity representing a course offering
 */
export interface CourseOffering {
	id: string
	institutions_id: string
	institution_code: string
	course_id: string
	course_code: string
	course_title?: string | null  // Joined from courses table via course_mapping_detailed_view
	examination_session_id: string
	session_code: string
	program_id: string
	program_code: string
	semester: number
	section: string | null
	faculty_id: string | null
	max_enrollment: number | null
	enrolled_count: number
	is_active: boolean
	created_at: string
}

/**
 * Institution - Foreign key reference for institutions
 */
export interface Institution {
	id: string
	institution_code: string
	institution_name: string
	is_active?: boolean
}

/**
 * Course - Foreign key reference for courses
 */
export interface Course {
	id: string
	course_code: string
	course_title: string
	institutions_id?: string
	is_active?: boolean
}

/**
 * ExaminationSession - Foreign key reference for examination sessions
 */
export interface ExaminationSession {
	id: string
	session_code: string
	session_name: string
	institutions_id?: string
	is_active?: boolean
}

/**
 * Program - Foreign key reference for programs
 */
export interface Program {
	id: string
	program_code: string
	program_name: string
	program_order?: number
	institutions_id?: string
	is_active?: boolean
}

/**
 * CourseOfferingFormData - Form data structure for creating/updating course offerings
 */
export interface CourseOfferingFormData {
	institutions_id: string
	course_id: string
	examination_session_id: string
	program_id: string
	semester_id: string // MyJKKN semester UUID
	semester_code: string // Semester code (e.g., "ECE-SEM-2")
	semester_number: string // Semester number for database
	semester_order: string // Display order
	section: string
	faculty_id: string
	max_enrollment: string
	enrolled_count: string
	is_active: boolean
}

/**
 * CourseOfferingPayload - API payload structure for save operations
 */
export interface CourseOfferingPayload {
	institutions_id: string
	course_id: string
	examination_session_id: string
	program_id: string
	semester: number
	section: string | null
	faculty_id: string | null
	max_enrollment: number | null
	enrolled_count: number
	is_active: boolean
}
