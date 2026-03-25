// Validation result types for Exam Timetable Validation

export interface StudentConflict {
	stu_register_no: string
	student_name: string
	exam_date: string
	session: string
	courses: {
		course_code: string
		course_title: string
		qp_code: string
	}[]
}

export interface UnscheduledCourse {
	stu_register_no: string
	student_name: string
	course_code: string
	course_title: string
	qp_code: string
	course_offering_id: string
}

export interface QPCodeMismatch {
	qp_code: string
	courses: {
		course_code: string
		course_title: string
		exam_date: string
		session: string
	}[]
}

export interface IncompleteTimetable {
	course_code: string
	course_title: string
	course_offering_id: string
	missing_fields: string[]
}

export interface ValidationSummary {
	total_students: number
	total_courses: number
	total_timetable_entries: number
	errors_count: number
	warnings_count: number
}

export interface ValidationResult {
	summary: ValidationSummary
	errors: {
		student_conflicts: StudentConflict[]
		qp_code_mismatches: QPCodeMismatch[]
	}
	warnings: {
		unscheduled_courses: UnscheduledCourse[]
		incomplete_timetables: IncompleteTimetable[]
	}
}
