/**
 * Practical Exam Attendance Type Definitions
 *
 * This module contains all TypeScript interfaces for the practical-attendance module.
 * These types are used across the application for type safety and consistency.
 */

/**
 * PracticalInstitution - Institution reference for practical attendance
 */
export interface PracticalInstitution {
	id: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids?: string[]
}

/**
 * PracticalSession - Examination session for practical attendance
 */
export interface PracticalSession {
	id: string
	session_name: string
	session_code: string
	session_type: string
	start_date: string
	end_date: string
}

/**
 * PracticalCourse - Course with practical exam timetable
 */
export interface PracticalCourse {
	course_id: string
	course_code: string
	course_name: string
}

/**
 * PracticalBatch - A practical exam batch (timetable row) with student counts
 */
export interface PracticalBatch {
	timetable_id: string
	batch_no: number
	exam_date: string
	session: string
	exam_time: string | null
	batch_capacity: number
	student_count: number
	attendance_exists: boolean
}

/**
 * PracticalStudent - Student loaded for attendance entry
 */
export interface PracticalStudent {
	id: string
	student_id: string
	stu_register_no: string
	student_name: string
	attempt_number: number
	is_regular: boolean
}

/**
 * PracticalAttendanceRecord - Attendance record for a practical exam student
 */
export interface PracticalAttendanceRecord {
	exam_registration_id: string
	student_id: string
	stu_register_no: string
	student_name: string
	attempt_number: number
	is_regular: boolean
	is_present: boolean
	is_absent: boolean
	attendance_status: string
	remarks: string
}
