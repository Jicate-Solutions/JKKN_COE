import { SeatingStudent, SeatAssignment } from '@/types/seating-allocation'

/**
 * Get the neighbor assignments for a seat at (row, col) in a grid.
 * Returns up to 4 neighbors: left, right, front (row-1), back (row+1).
 */
export function getNeighbors(
	grid: (SeatAssignment | null)[][],
	row: number,
	col: number,
	totalRows: number,
	totalCols: number
): SeatAssignment[] {
	const neighbors: SeatAssignment[] = []
	const positions = [
		[row, col - 1],   // left
		[row, col + 1],   // right
		[row - 1, col],   // front
		[row + 1, col],   // back
	]
	for (const [r, c] of positions) {
		if (r >= 0 && r < totalRows && c >= 0 && c < totalCols && grid[r][c]?.student) {
			neighbors.push(grid[r][c]!)
		}
	}
	return neighbors
}

/**
 * Score a candidate student for a seat based on neighbor diversity.
 * Higher score = better placement.
 */
export function scoreCandidate(
	candidate: SeatingStudent,
	neighbors: SeatAssignment[],
	mode: 'smart' | 'strict'
): number {
	if (neighbors.length === 0) return 40

	let score = 0
	for (const neighbor of neighbors) {
		if (!neighbor.student) continue
		// Program diversity
		if (neighbor.student.program_code !== candidate.program_code) {
			score += 10
		} else {
			score -= 15
		}
		// Subject diversity (strict mode adds this)
		if (mode === 'strict') {
			if (neighbor.student.course_code !== candidate.course_code) {
				score += 8
			} else if (neighbor.student.program_code === candidate.program_code) {
				score -= 20
			}
		}
		// Register number gap bonus
		const regGap = Math.abs(
			parseInt(candidate.stu_register_no.replace(/\D/g, '')) -
			parseInt(neighbor.student.stu_register_no.replace(/\D/g, ''))
		)
		if (regGap > 10) score += 5
		else if (regGap <= 2) score -= 8
	}
	return score
}

/**
 * Group students by program code.
 * Returns a Map of program_code -> students sorted by register number.
 */
export function groupByProgram(students: SeatingStudent[]): Map<string, SeatingStudent[]> {
	const groups = new Map<string, SeatingStudent[]>()
	for (const s of students) {
		const list = groups.get(s.program_code) || []
		list.push(s)
		groups.set(s.program_code, list)
	}
	for (const [, list] of groups) {
		list.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no))
	}
	return groups
}

/**
 * Create an empty grid for a room.
 */
export function createEmptyGrid(rows: number, cols: number): (SeatAssignment | null)[][] {
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => null)
	)
}

/**
 * Flatten a 2D grid into a sorted array of SeatAssignments.
 */
export function flattenGrid(grid: (SeatAssignment | null)[][]): SeatAssignment[] {
	const seats: SeatAssignment[] = []
	for (let r = 0; r < grid.length; r++) {
		for (let c = 0; c < grid[r].length; c++) {
			seats.push(grid[r][c] || { row_number: r + 1, column_number: c + 1, student: null })
		}
	}
	return seats
}

/**
 * Suggest rooms and seat counts for a given number of students.
 * Uses preferred_exam_capacity for normal allocation.
 * The last room can overflow up to max_exam_capacity if students exceed.
 * Falls back to exam_capacity when preferred/max are not set.
 */
export function suggestRooms(
	rooms: { id: string; room_code: string; room_name: string; building: string | null; floor: string | null; room_order: number; exam_capacity: number; preferred_exam_capacity?: number | null; max_exam_capacity?: number | null; rows: number; columns: number }[],
	totalStudents: number
): { room: typeof rooms[number]; suggested_seats: number; is_selected: boolean }[] {
	const sorted = [...rooms].sort((a, b) => a.room_order - b.room_order)
	const suggestions: { room: typeof rooms[number]; suggested_seats: number; is_selected: boolean }[] = []
	let remaining = totalStudents

	// First pass: fill rooms using preferred capacity
	for (const room of sorted) {
		if (remaining <= 0) {
			suggestions.push({ room, suggested_seats: 0, is_selected: false })
		} else {
			const preferred = room.preferred_exam_capacity || room.exam_capacity
			const seats = Math.min(remaining, preferred)
			suggestions.push({ room, suggested_seats: seats, is_selected: true })
			remaining -= seats
		}
	}

	// Second pass: if students remain, overflow the last selected room up to max_exam_capacity
	if (remaining > 0) {
		for (let i = suggestions.length - 1; i >= 0; i--) {
			if (suggestions[i].is_selected) {
				const room = suggestions[i].room
				const maxCap = room.max_exam_capacity || room.exam_capacity
				const extraAvailable = maxCap - suggestions[i].suggested_seats
				const extra = Math.min(remaining, extraAvailable)
				suggestions[i].suggested_seats += extra
				remaining -= extra
				break
			}
		}
	}

	// Third pass: if still remaining, assign to unselected rooms using preferred capacity
	if (remaining > 0) {
		for (const suggestion of suggestions) {
			if (remaining <= 0) break
			if (!suggestion.is_selected) {
				const preferred = suggestion.room.preferred_exam_capacity || suggestion.room.exam_capacity
				const seats = Math.min(remaining, preferred)
				suggestion.suggested_seats = seats
				suggestion.is_selected = true
				remaining -= seats
			}
		}
	}

	return suggestions
}
