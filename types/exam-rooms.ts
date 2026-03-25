/**
 * Exam Rooms Type Definitions
 *
 * This module contains all TypeScript interfaces for the exam-rooms module.
 * These types are used across the application for type safety and consistency.
 */

/**
 * ExamRoom - Exam room entity with all fields
 */
export interface ExamRoom {
	id: string
	institutions_id: string
	room_code: string
	room_name: string
	building: string | null
	floor: string | null
	room_order: number
	seating_capacity: number
	exam_capacity: number
	room_type: string | null
	facilities: any
	is_accessible: boolean
	is_active: boolean
	created_at: string
	updated_at: string
	rows: number
	columns: number
}

/**
 * Institution - Institution reference entity
 */
export interface Institution {
	id: string
	institution_code: string
	name: string
	is_active: boolean
}

/**
 * ExamRoomFormData - Form data type for exam room creation/editing
 */
export interface ExamRoomFormData {
	id: string
	institution_code: string
	room_code: string
	room_name: string
	building: string
	floor: string
	room_order: string
	seating_capacity: string
	exam_capacity: string
	room_type: string
	facilities: string
	is_accessible: boolean
	is_active: boolean
	rows: string
	columns: string
}

/**
 * ExamRoomImportError - Error structure for import operations
 */
export interface ExamRoomImportError {
	row: number
	room_code: string
	room_name: string
	errors: string[]
}

/**
 * UploadSummary - Summary of upload operation
 */
export interface UploadSummary {
	total: number
	success: number
	failed: number
}
