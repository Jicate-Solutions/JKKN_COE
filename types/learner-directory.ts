/**
 * Shape returned by GET /api/myjkkn/learner-profiles/directory.
 *
 * A slim projection of a MyJKKN learner profile: the whole directory is sent to
 * the browser in one sweep so every filter dropdown (lifecycle status, program,
 * semester) can be built from the complete set rather than from one page, so
 * only the fields the directory renders or exports are carried.
 */
export interface LearnerDirectoryRow {
	id: string
	register_number: string
	roll_number: string
	learner_name: string
	first_name: string
	middle_name: string
	last_name: string
	email: string
	phone: string
	date_of_birth: string
	gender: string
	institution_id: string
	institution_code: string
	institution_name: string
	program_id: string
	program_code: string
	program_name: string
	department_code: string
	department_name: string
	batch_id: string
	batch_name: string
	semester_id: string
	semester_code: string
	current_semester: number | null
	admission_year: number | null
	/** Raw MyJKKN lifecycle state, lower-cased (e.g. 'active', 'alumni'). */
	lifecycle_status: string
	is_active: boolean
	student_photo_url: string
	father_name: string
	mother_name: string
	guardian_name: string
	address: string
	city: string
	state: string
	country: string
	pincode: string
	aadhar_number: string
	abc_id: string
}

export interface LearnerDirectoryResponse {
	data: LearnerDirectoryRow[]
	metadata: {
		/** Rows returned after the institution filter. */
		total: number
		/** Rows in the full MyJKKN sweep, before the institution filter. */
		totalAll: number
		/** Epoch ms the sweep behind this response was taken. */
		fetchedAt: number
		/** false when a page of the sweep failed — the list may be short. */
		complete: boolean
		/** true when served from the in-process sweep cache. */
		cached: boolean
	}
}
