import type {
	SeatingStudent,
	SeatingRoom,
	SeatAssignment,
	RoomAllocationResult,
	SeatingAllocationResult,
	SeatingConflict,
	SeatingStrategy,
	ManualRoomAssignment,
	RoomSuggestion,
	RoomColumnPlan,
} from '@/types/seating-allocation'
import {
	getNeighbors,
	scoreCandidate,
	groupByProgram,
	createEmptyGrid,
	flattenGrid,
} from './seating-utils'

/**
 * Fisher-Yates shuffle — mutates array in place and returns it.
 */
function shuffle<T>(arr: T[]): T[] {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[arr[i], arr[j]] = [arr[j], arr[i]]
	}
	return arr
}

/**
 * Interleave students from multiple programs in round-robin order.
 * Programs are sorted alphabetically; within each program students are
 * already sorted by register number (from groupByProgram).
 */
function interleaveByProgram(students: SeatingStudent[]): SeatingStudent[] {
	const groups = groupByProgram(students)
	const programKeys = [...groups.keys()].sort()
	const queues = programKeys.map(k => [...groups.get(k)!])

	const result: SeatingStudent[] = []
	let exhausted = 0
	while (exhausted < queues.length) {
		exhausted = 0
		for (const q of queues) {
			if (q.length > 0) {
				result.push(q.shift()!)
			} else {
				exhausted++
			}
		}
	}
	return result
}

/**
 * Fill a room grid row-by-row from a student queue.
 * Consumes up to `capacity` students from the front of `queue`.
 */
function fillRoomRowWise(
	room: SeatingRoom,
	queue: SeatingStudent[],
	capacity: number
): { grid: (SeatAssignment | null)[][]; seated: number } {
	const grid = createEmptyGrid(room.rows, room.columns)
	let seated = 0

	for (let r = 0; r < room.rows && seated < capacity; r++) {
		for (let c = 0; c < room.columns && seated < capacity; c++) {
			if (queue.length === 0) break
			const student = queue.shift()!
			grid[r][c] = { row_number: r + 1, column_number: c + 1, student }
			seated++
		}
	}
	return { grid, seated }
}

// ---------------------------------------------------------------------------
// Strategy 1 — Institution Standard (Row-wise ABAB)
// ---------------------------------------------------------------------------

function allocateInstitutionStandard(
	students: SeatingStudent[],
	suggestions: RoomSuggestion[]
): SeatingAllocationResult {
	const queue = interleaveByProgram(students)
	const rooms: RoomAllocationResult[] = []

	for (const suggestion of suggestions) {
		const { room } = suggestion
		const capacity = suggestion.suggested_seats
		const { grid, seated } = fillRoomRowWise(room, queue, capacity)

		rooms.push({
			room,
			seats: flattenGrid(grid),
			students_seated: seated,
			total_capacity: capacity,
		})
	}

	return {
		strategy: 'institution-standard',
		rooms,
		total_students: students.length,
		total_seated: students.length - queue.length,
		unassigned_students: queue,
		conflicts: [],
	}
}

// ---------------------------------------------------------------------------
// Strategy 2 & 3 — Smart Mixing / Strict Mode
// ---------------------------------------------------------------------------

function allocateSmartOrStrict(
	students: SeatingStudent[],
	suggestions: RoomSuggestion[],
	mode: 'smart' | 'strict'
): SeatingAllocationResult {
	const pool = shuffle([...students])
	const rooms: RoomAllocationResult[] = []
	const conflicts: SeatingConflict[] = []

	for (const suggestion of suggestions) {
		const { room } = suggestion
		const capacity = suggestion.suggested_seats
		const grid = createEmptyGrid(room.rows, room.columns)
		let seated = 0

		for (let r = 0; r < room.rows && seated < capacity && pool.length > 0; r++) {
			for (let c = 0; c < room.columns && seated < capacity && pool.length > 0; c++) {
				const neighbors = getNeighbors(grid, r, c, room.rows, room.columns)

				// Score every remaining candidate and pick the best
				let bestIdx = 0
				let bestScore = -Infinity
				for (let i = 0; i < pool.length; i++) {
					const s = scoreCandidate(pool[i], neighbors, mode)
					if (s > bestScore) {
						bestScore = s
						bestIdx = i
					}
				}

				const chosen = pool.splice(bestIdx, 1)[0]
				grid[r][c] = { row_number: r + 1, column_number: c + 1, student: chosen }
				seated++

				// In strict mode, report conflicts with already-placed neighbors
				if (mode === 'strict') {
					for (const neighbor of neighbors) {
						if (!neighbor.student) continue
						if (
							neighbor.student.program_code === chosen.program_code &&
							neighbor.student.course_code === chosen.course_code
						) {
							conflicts.push({
								room_code: room.room_code,
								row: r + 1,
								column: c + 1,
								student_reg_no: chosen.stu_register_no,
								conflict_type: 'same_subject',
								neighbor_reg_no: neighbor.student.stu_register_no,
							})
						} else if (neighbor.student.program_code === chosen.program_code) {
							conflicts.push({
								room_code: room.room_code,
								row: r + 1,
								column: c + 1,
								student_reg_no: chosen.stu_register_no,
								conflict_type: 'same_program',
								neighbor_reg_no: neighbor.student.stu_register_no,
							})
						}
					}
				}
			}
		}

		rooms.push({
			room,
			seats: flattenGrid(grid),
			students_seated: seated,
			total_capacity: capacity,
		})
	}

	const strategy: SeatingStrategy = mode === 'smart' ? 'smart-mixing' : 'strict'

	return {
		strategy,
		rooms,
		total_students: students.length,
		total_seated: students.length - pool.length,
		unassigned_students: pool,
		conflicts,
	}
}

// ---------------------------------------------------------------------------
// Strategy 4 — Manual (Room-level assignment)
// ---------------------------------------------------------------------------

function allocateManual(
	students: SeatingStudent[],
	suggestions: RoomSuggestion[],
	manualAssignments: ManualRoomAssignment[]
): SeatingAllocationResult {
	const assignmentMap = new Map(manualAssignments.map(a => [a.room_id, a.program_codes]))
	const assignedIds = new Set<string>()
	const rooms: RoomAllocationResult[] = []

	for (const suggestion of suggestions) {
		const { room } = suggestion
		const capacity = suggestion.suggested_seats
		const programCodes = assignmentMap.get(room.id)

		if (!programCodes || programCodes.length === 0) {
			// No programs assigned — room stays empty
			const grid = createEmptyGrid(room.rows, room.columns)
			rooms.push({
				room,
				seats: flattenGrid(grid),
				students_seated: 0,
				total_capacity: capacity,
			})
			continue
		}

		// Gather un-assigned students belonging to the specified programs
		const eligible = students.filter(
			s => programCodes.includes(s.program_code) && !assignedIds.has(s.exam_registration_id)
		)

		// Interleave (ABAB) within this room's assigned programs
		const queue = interleaveByProgram(eligible)

		// Limit to capacity
		const toSeat = queue.slice(0, capacity)

		const { grid, seated } = fillRoomRowWise(room, [...toSeat], capacity)

		// Mark seated students as assigned
		for (const seat of flattenGrid(grid)) {
			if (seat.student) {
				assignedIds.add(seat.student.exam_registration_id)
			}
		}

		rooms.push({
			room,
			seats: flattenGrid(grid),
			students_seated: seated,
			total_capacity: capacity,
		})
	}

	const unassigned = students.filter(s => !assignedIds.has(s.exam_registration_id))

	return {
		strategy: 'manual',
		rooms,
		total_students: students.length,
		total_seated: assignedIds.size,
		unassigned_students: unassigned,
		conflicts: [],
	}
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generate a complete seating allocation for the given students and rooms
 * using the specified strategy.
 */
export function generateSeatingAllocation(
	students: SeatingStudent[],
	rooms: RoomSuggestion[],
	strategy: SeatingStrategy,
	manualAssignments?: ManualRoomAssignment[]
): SeatingAllocationResult {
	// Only process selected rooms
	const selectedRooms = rooms.filter(r => r.is_selected)

	if (students.length === 0 || selectedRooms.length === 0) {
		return {
			strategy,
			rooms: [],
			total_students: students.length,
			total_seated: 0,
			unassigned_students: [...students],
			conflicts: [],
		}
	}

	switch (strategy) {
		case 'institution-standard':
			return allocateInstitutionStandard(students, selectedRooms)
		case 'smart-mixing':
			return allocateSmartOrStrict(students, selectedRooms, 'smart')
		case 'strict':
			return allocateSmartOrStrict(students, selectedRooms, 'strict')
		case 'manual':
			// If no explicit program-to-room assignments provided,
			// fall back to institution-standard (ABAB) — the "manual" part
			// is the room/seat selection in the RoomSuggestionPanel
			if (!manualAssignments || manualAssignments.length === 0) {
				return allocateInstitutionStandard(students, selectedRooms)
			}
			return allocateManual(students, selectedRooms, manualAssignments)
		default:
			return allocateInstitutionStandard(students, selectedRooms)
	}
}

// ---------------------------------------------------------------------------
// Column-wise allocation (used with RoomColumnPlan from column-allocator)
// ---------------------------------------------------------------------------

/**
 * Generate seating allocation from column plans.
 * Fills each room column-by-column (C1 rows, then C3 rows, then C2 rows).
 *
 * Enforces Rule 2: same program must NOT appear in the same row across columns.
 * If a conflict would occur, the student is skipped (reported as conflict).
 */
export function generateFromColumnPlans(
	students: SeatingStudent[],
	columnPlans: RoomColumnPlan[]
): SeatingAllocationResult {
	// Group all students by program_code + course_code for easy lookup
	const studentPool = new Map<string, SeatingStudent[]>()
	for (const s of students) {
		const key = `${s.program_code}|${s.course_code}`
		const list = studentPool.get(key) || []
		list.push(s)
		studentPool.set(key, list)
	}
	for (const [, list] of studentPool) {
		list.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no))
	}

	const assignedIds = new Set<string>()
	const rooms: RoomAllocationResult[] = []
	const conflicts: SeatingConflict[] = []

	for (const plan of columnPlans) {
		const { room, columns } = plan
		const grid = createEmptyGrid(room.rows, room.columns)
		let seated = 0

		// Track which programs occupy each row (Rule 2 enforcement)
		const rowPrograms = new Map<number, Set<string>>()
		for (let r = 0; r < room.rows; r++) {
			rowPrograms.set(r, new Set())
		}

		// Sort columns by fill priority: C1 → C3 → C2
		const sortedColumns = [...columns].sort((a, b) => {
			const order = [1, 3, 2]
			return order.indexOf(a.column_number) - order.indexOf(b.column_number)
		})

		for (const colAssignment of sortedColumns) {
			const colIdx = colAssignment.column_number - 1
			if (colIdx >= room.columns) continue

			const poolKey = `${colAssignment.program_code}|${colAssignment.course_code}`
			const pool = studentPool.get(poolKey) || []

			let placed = 0
			for (let r = 0; r < room.rows && placed < colAssignment.count; r++) {
				if (grid[r][colIdx] !== null) continue

				// Rule 2: check if this program already exists in this row
				const rowProgs = rowPrograms.get(r)!
				if (rowProgs.has(colAssignment.program_code)) {
					// Report conflict but skip placement
					conflicts.push({
						room_code: room.room_code,
						row: r + 1,
						column: colAssignment.column_number,
						student_reg_no: colAssignment.program_code,
						conflict_type: 'same_program',
						neighbor_reg_no: '',
					})
					continue
				}

				const student = pool.find(s => !assignedIds.has(s.exam_registration_id))
				if (!student) break

				grid[r][colIdx] = {
					row_number: r + 1,
					column_number: colAssignment.column_number,
					student,
				}
				assignedIds.add(student.exam_registration_id)
				rowProgs.add(colAssignment.program_code)
				seated++
				placed++
			}
		}

		rooms.push({
			room,
			seats: flattenGrid(grid),
			students_seated: seated,
			total_capacity: plan.total_seats,
		})
	}

	const unassigned = students.filter(s => !assignedIds.has(s.exam_registration_id))

	return {
		strategy: 'institution-standard',
		rooms,
		total_students: students.length,
		total_seated: assignedIds.size,
		unassigned_students: unassigned,
		conflicts,
	}
}
