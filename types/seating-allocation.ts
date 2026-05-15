/**
 * Seating Allocation Type Definitions
 */

/** Seating strategy options */
export type SeatingStrategy = 'institution-standard' | 'smart-mixing' | 'strict' | 'manual'

/** Rule toggles for the seating allocator.
 *  Default: every rule enabled (original algorithm behaviour). */
export interface SeatingRules {
	rule_1_minimize_rooms: boolean
	rule_2_same_program_separation: boolean
	rule_3_shared_course_c2: boolean
	rule_4_room_continuity: boolean
	rule_5_equal_distribution: boolean
}

export const DEFAULT_SEATING_RULES: SeatingRules = {
	rule_1_minimize_rooms: true,
	rule_2_same_program_separation: true,
	rule_3_shared_course_c2: true,
	rule_4_room_continuity: true,
	rule_5_equal_distribution: true,
}

/** Program type classification */
export type ProgramType = 'UG' | 'PG'

/** Course category for column assignment */
export type CourseCategory = 'ug' | 'pg' | 'common'

/** A student to be seated */
export interface SeatingStudent {
	exam_registration_id: string
	stu_register_no: string
	student_name: string
	program_code: string
	program_display_name?: string
	course_code: string
	course_offering_id: string
	exam_timetable_id: string
	is_regular: boolean
	program_type?: ProgramType
}

/** A room available for seating */
export interface SeatingRoom {
	id: string
	room_code: string
	room_name: string
	building: string | null
	floor: string | null
	room_order: number
	exam_capacity: number
	preferred_exam_capacity: number | null
	max_exam_capacity: number | null
	rows: number
	columns: number
}

/** An individual seat assignment */
export interface SeatAssignment {
	row_number: number
	column_number: number
	student: SeatingStudent | null
}

/** A room with its seat assignments */
export interface RoomAllocationResult {
	room: SeatingRoom
	seats: SeatAssignment[]
	students_seated: number
	total_capacity: number
}

/** Complete seating allocation result */
export interface SeatingAllocationResult {
	strategy: SeatingStrategy
	rooms: RoomAllocationResult[]
	total_students: number
	total_seated: number
	unassigned_students: SeatingStudent[]
	conflicts: SeatingConflict[]
}

/** Conflict reported in strict mode */
export interface SeatingConflict {
	room_code: string
	row: number
	column: number
	student_reg_no: string
	conflict_type: 'same_program' | 'same_subject' | 'sequential_register'
	neighbor_reg_no: string
}

/** Manual mode: program-to-room mapping */
export interface ManualRoomAssignment {
	room_id: string
	program_codes: string[]
}

/** Room suggestion from auto-suggest */
export interface RoomSuggestion {
	room: SeatingRoom
	suggested_seats: number
	is_selected: boolean
}

/** A group of students sharing the same program + course */
export interface CourseGroup {
	program_code: string
	course_code: string
	program_type: ProgramType
	is_common: boolean
	count: number
	students: SeatingStudent[]
}

/** Column assignment for a specific room column */
export interface ColumnAssignment {
	room_id: string
	column_number: number
	program_code: string
	course_code: string
	count: number
	course_category: CourseCategory
}

/** Complete column plan for all rooms */
export interface RoomColumnPlan {
	room: SeatingRoom
	columns: ColumnAssignment[]
	total_seats: number
}

/** Data needed for PDF generation */
export interface SeatingPlanPdfData {
	institution_name: string
	institution_code: string
	session_name: string
	exam_date: string
	session_type: string
	strategy: SeatingStrategy
	rooms: RoomAllocationResult[]
	generated_at: string
	logo_image?: string | null
	right_logo_image?: string | null
}
