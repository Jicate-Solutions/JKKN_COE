/**
 * Seating Allocation Type Definitions
 */

/** Seating strategy options */
export type SeatingStrategy = 'institution-standard' | 'smart-mixing' | 'strict' | 'manual'

/** A student to be seated */
export interface SeatingStudent {
	exam_registration_id: string
	stu_register_no: string
	student_name: string
	program_code: string
	course_code: string
	course_offering_id: string
	exam_timetable_id: string
	is_regular: boolean
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
}
