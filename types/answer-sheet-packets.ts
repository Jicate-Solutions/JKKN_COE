/**
 * Answer Sheet Packets Type Definitions
 *
 * This module contains all TypeScript interfaces for the answer sheet packets module.
 * These types are used across the application for type safety and consistency.
 */

/**
 * AnswerSheetPacket - Main packet entity
 */
export interface AnswerSheetPacket {
	id: string
	institutions_id: string
	examination_session_id: string
	course_id: string
	exam_timetable_id?: string | null
	packet_no: string
	total_sheets: number
	packet_status: PacketStatus
	created_at: string
	updated_at: string
	created_by?: string | null
	updated_by?: string | null
	is_active: boolean
	remarks?: string | null
	assigned_to?: string | null
	assigned_at?: string | null
	evaluation_started_at?: string | null
	evaluation_completed_at?: string | null
	sheets_evaluated: number
	evaluation_progress: number
	packet_location?: string | null
	barcode?: string | null
}

/**
 * Packet Status Types
 */
export type PacketStatus =
	| 'Created'
	| 'Assigned'
	| 'In Evaluation'
	| 'Completed'
	| 'Archived'
	| 'Returned'
	| 'Missing'

/**
 * AnswerSheetPacketFormData - Form data for creating/editing packets
 */
export interface AnswerSheetPacketFormData {
	institution_code: string
	exam_session: string
	course_code: string
	packet_no: string
	total_sheets: string
	packet_status: PacketStatus
	remarks: string
	is_active: boolean
}

/**
 * PacketGenerationRequest - Request payload for generating packets
 */
export interface PacketGenerationRequest {
	institution_code: string
	exam_session: string
	course_code?: string // Optional - if not provided, generate for all courses
}

/**
 * StudentDummyNumber - Student dummy number entity
 * Note: actual_register_number maps to students.register_number (not student_id)
 * course_id is accessed via exam_registrations relationship
 */
export interface StudentDummyNumber {
	id: string
	institutions_id: string
	examination_session_id: string
	exam_registration_id: string
	actual_register_number: string
	dummy_number: string
	packet_no?: string | null
	created_at: string
	updated_at: string
}

/**
 * ExamAttendance - Exam attendance record
 */
export interface ExamAttendance {
	id: string
	exam_timetable_id: string
	student_id: string
	is_present: boolean
	is_absent: boolean
	attendance_status: string
	created_at: string
}

/**
 * PacketGenerationResult - Result of packet generation
 */
export interface PacketGenerationResult {
	success: boolean
	message: string
	packets_created: number
	students_assigned: number
	course_code?: string
	packet_details?: Array<{
		packet_no: string
		total_sheets: number
		student_ids: string[]
	}>
}

/**
 * PacketDetailView - Detailed packet information with related entities
 */
export interface PacketDetailView {
	id: string
	packet_no: string
	barcode?: string | null
	total_sheets: number
	sheets_evaluated: number
	evaluation_progress: number
	packet_status: PacketStatus
	packet_location?: string | null
	remarks?: string | null

	// Assignment Details
	assigned_to?: string | null
	assigned_to_name?: string | null
	assigned_to_email?: string | null
	assigned_at?: string | null

	// Evaluation Timing
	evaluation_started_at?: string | null
	evaluation_completed_at?: string | null
	evaluation_duration_hours?: number | null

	// Institution Details
	institutions_id: string
	institution_code: string
	institution_name: string

	// Examination Session Details
	examination_session_id: string
	session_code: string
	session_name: string

	// Course Details
	course_id: string
	course_code: string
	course_title: string
	course_type: string

	// Exam Timetable Details
	exam_timetable_id?: string | null
	exam_date?: string | null
	exam_session?: string | null

	// Created/Updated By
	created_by_name?: string | null
	created_by_email?: string | null
	updated_by_name?: string | null
	updated_by_email?: string | null

	// Metadata
	is_active: boolean
	created_at: string
	updated_at: string
	created_by?: string | null
	updated_by?: string | null
}

/**
 * PacketStatistics - Aggregate statistics for packets
 */
export interface PacketStatistics {
	total_packets: number
	created_packets: number
	assigned_packets: number
	in_evaluation_packets: number
	completed_packets: number
	archived_packets: number
	returned_packets: number
	missing_packets: number
	total_sheets: number
	total_evaluated_sheets: number
	overall_progress: number
}

/**
 * EvaluatorWorkload - Evaluator's packet workload information
 */
export interface EvaluatorWorkload {
	evaluator_id: string
	evaluator_name: string
	total_assigned_packets: number
	total_sheets: number
	completed_packets: number
	in_progress_packets: number
	pending_packets: number
	total_evaluated_sheets: number
	overall_progress: number
}

/**
 * Course - Course entity (for dropdown)
 */
export interface Course {
	id: string
	course_code: string
	course_title: string
	course_type: string
	course_category?: string
}

/**
 * Institution - Institution entity (for dropdown)
 */
export interface Institution {
	id: string
	institution_code: string
	name: string
}

/**
 * ExaminationSession - Examination session entity (for dropdown)
 */
export interface ExaminationSession {
	id: string
	session_code: string
	session_name: string
	session_type: string
	start_date: string
	end_date: string
}
