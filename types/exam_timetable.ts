// Exam Timetable type definition
export interface ExamTimetable {
	id: string
	institutions_id: string
	examination_session_id: string
	course_offering_id: string
	exam_date: string
	session: string
	exam_time: string
	duration_minutes: number
	exam_mode: string
	is_published: boolean
	instructions?: string
	exam_type: 'Theory' | 'Practical' | 'Project' | 'Field Work' | 'Group Project'
	batch_capacity?: number | null
	created_by?: string
	created_at: string
}

// Generated Course Data for child table
export interface GeneratedCourseData {
	course_offering_id: string
	course_code: string
	course_title: string
	program_name: string
	program_code?: string
	program_order?: number | string
	semester?: number
	course_semester_code?: string
	course_semester_name?: string
	course_semester_number?: number
	course_program_code?: string
	course_institution_code?: string
	course_regulation_code?: string
	regular_count: number
	arrear_count: number
	exam_date: string
	session: string
	exam_time: string
	duration_minutes: number
	is_published: boolean
	instructions?: string
	existing_timetable_id?: string
}

// A group of course_offerings sharing the same course_code
export interface CourseGroup {
	course_code: string
	course_title: string
	course_type: string
	course_category: string
	board_code: string | null
	board_name: string | null
	board_order: number | null
	program_names: string[]
	program_codes: string[]
	program_order: number
	semester: number
	regular_count: number
	arrear_count: number
	course_offering_ids: string[]
	existing_timetable_ids: string[]
	is_multi_slot: boolean
	exam_date: string
	session: string
	exam_time: string
	duration_minutes: number
	is_published: boolean
	instructions: string
	slots: PracticalSlot[]
	saving: boolean
	saveStatus: 'idle' | 'saving' | 'saved' | 'error'
	saveError: string | null
	expanded: boolean
}

export interface PracticalSlot {
	id: string
	existing_timetable_id: string | null
	exam_date: string
	session: string
	exam_time: string
	duration_minutes: number
	batch_capacity: number | null
	is_published: boolean
	instructions: string
	saving: boolean
	saveStatus: 'idle' | 'saving' | 'saved' | 'error'
	saveError: string | null
}

export interface Board {
	id: string
	board_code: string
	board_name: string
	board_order: number | null
	institution_code: string
}

export type SortFormat = 'program-wise' | 'board-wise'

// Examination Session type
export interface ExaminationSession {
	id: string
	session_code: string
	session_name: string
}

// Program type
export interface Program {
	id: string
	institution_code: string
	program_code: string
	program_name: string
	program_type: string
}

// Semester type
export interface Semester {
	id: string
	semester_code: string
	semester_name: string
}

// Institution type
export interface Institution {
	id: string
	institution_code: string
	institution_name: string
}

// Form data for creating/updating exam timetable
export interface ExamTimetableFormData {
	institutions_id: string
	examination_session_id: string
	course_offering_id: string
	exam_date: string
	session: string
	exam_time: string
	duration_minutes: number
	exam_mode: string
	is_published: boolean
	instructions?: string
	exam_type: 'Theory' | 'Practical' | 'Project' | 'Field Work' | 'Group Project'
	batch_capacity?: number | null
}
