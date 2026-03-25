/**
 * Exam Attendance Type Definitions
 *
 * This module contains all TypeScript interfaces for the exam-attendance module.
 * These types are used across the application for type safety and consistency.
 */

/**
 * Institution - Foreign key reference for institutions
 */
export interface Institution {
	id: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids?: string[] // MyJKKN institution UUIDs for API integration
}

/**
 * ExaminationSession - Examination session entity
 */
export interface ExaminationSession {
	id: string
	session_name: string
	session_code: string
	session_type: string
	start_date: string
	end_date: string
}

/**
 * Program - Program entity
 */
export interface Program {
	id: string
	program_code: string
	program_name: string
	program_order?: number // Sort order for display
}

/**
 * CourseOffering - Course offering entity
 */
export interface CourseOffering {
	course_code: string
	course_title: string
}

/**
 * ExamDate - Exam date and session information
 */
export interface ExamDate {
	id: string
	exam_date: string
	exam_time: string
	session: string
	duration_minutes: number
}

/**
 * StudentRegistration - Student registration for exam
 */
export interface StudentRegistration {
	id: string
	stu_register_no: string
	student_name: string
	student_id: string
	attempt_number?: number
	is_regular?: boolean
}

/**
 * AttendanceRecord - Attendance record for a student
 */
export interface AttendanceRecord {
	exam_registration_id: string
	student_id: string
	stu_register_no: string
	student_name: string
	attempt_number?: number
	is_regular?: boolean
	is_present: boolean
	is_absent: boolean
	attendance_status: string
	remarks: string
}
