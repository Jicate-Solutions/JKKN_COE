/**
 * Smart Seating Allocation — Column Allocator
 *
 * Rules (in priority order):
 * 1. MINIMIZE ROOMS — pack rooms to full exam_capacity before opening new ones
 * 2. SAME PROGRAM SEPARATION — students from the same program must NOT be in the same row
 * 3. SHARED COURSE CODES — if 2+ programs share a course_code → C1 and C3 only (NEVER C2)
 * 4. ROOM CONTINUITY — same program stays in continuous rooms (R09→R10→R11)
 *
 * Column priority: C1 → C3 → C2
 * UG programs prefer C1, C3
 * PG programs prefer C2
 */

import type {
	SeatingStudent,
	SeatingRoom,
	CourseGroup,
	ColumnAssignment,
	RoomColumnPlan,
	CourseCategory,
	ProgramType,
} from '@/types/seating-allocation'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProgramQueue {
	program_code: string
	program_type: ProgramType
	has_shared_course: boolean
	students: SeatingStudent[]
	cursor: number
}

export interface AllocationViolation {
	rule: string
	room_code: string
	details: string
}

// ─── Detection helpers ──────────────────────────────────────────────────────

/**
 * Detect shared course codes — same course_code across 2+ different programs.
 */
export function detectSharedCourses(students: SeatingStudent[]): Set<string> {
	const coursePrograms = new Map<string, Set<string>>()
	for (const s of students) {
		const programs = coursePrograms.get(s.course_code) || new Set()
		programs.add(s.program_code)
		coursePrograms.set(s.course_code, programs)
	}
	const shared = new Set<string>()
	for (const [code, programs] of coursePrograms) {
		if (programs.size >= 2) shared.add(code)
	}
	return shared
}

/**
 * Group students by program_code + course_code into CourseGroups.
 */
export function buildCourseGroups(students: SeatingStudent[]): CourseGroup[] {
	const sharedCourses = detectSharedCourses(students)
	const groupMap = new Map<string, CourseGroup>()

	for (const s of students) {
		const key = `${s.program_code}|${s.course_code}`
		let group = groupMap.get(key)
		if (!group) {
			group = {
				program_code: s.program_code,
				course_code: s.course_code,
				program_type: s.program_type || 'UG',
				is_common: sharedCourses.has(s.course_code),
				count: 0,
				students: [],
			}
			groupMap.set(key, group)
		}
		group.count++
		group.students.push(s)
	}

	for (const group of groupMap.values()) {
		group.students.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no))
	}

	return [...groupMap.values()]
}

// ─── Queue building ─────────────────────────────────────────────────────────

/**
 * Build program-level queues from students.
 * Each queue has all students for a program, sorted by register number.
 */
function buildProgramQueues(students: SeatingStudent[]): ProgramQueue[] {
	const sharedCourses = detectSharedCourses(students)
	const map = new Map<string, ProgramQueue>()

	for (const s of students) {
		let q = map.get(s.program_code)
		if (!q) {
			q = {
				program_code: s.program_code,
				program_type: s.program_type || 'UG',
				has_shared_course: false,
				students: [],
				cursor: 0,
			}
			map.set(s.program_code, q)
		}
		q.students.push(s)
		if (sharedCourses.has(s.course_code)) q.has_shared_course = true
	}

	for (const q of map.values()) {
		q.students.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no))
	}

	// Sort: programs with shared courses first (restricted to C1/C3),
	// then UG before PG, then largest first
	return [...map.values()].sort((a, b) => {
		if (a.has_shared_course !== b.has_shared_course) return a.has_shared_course ? -1 : 1
		if (a.program_type !== b.program_type) return a.program_type === 'UG' ? -1 : 1
		return remaining(b) - remaining(a)
	})
}

function remaining(q: ProgramQueue): number {
	return q.students.length - q.cursor
}

// ─── Column rules ───────────────────────────────────────────────────────────

/**
 * Check if a program is allowed in a given column number.
 * Rule 3: programs with shared courses → C1 or C3 only (NEVER C2)
 * PG without shared courses → prefer C2 but allowed anywhere
 */
function isColumnAllowed(q: ProgramQueue, colNum: number): boolean {
	if (q.has_shared_course && colNum === 2) return false
	return true
}

/**
 * Count how many consecutive rows are available for a program starting at startRow.
 * A row is "available" if the program is not already placed there by another column.
 */
function countAvailableRows(
	programCode: string,
	startRow: number,
	maxRows: number,
	rowPrograms: Map<number, Set<string>>
): number {
	let count = 0
	for (let r = startRow; r < maxRows; r++) {
		if (rowPrograms.get(r)?.has(programCode)) break
		count++
	}
	return count
}

// ─── Core algorithm ─────────────────────────────────────────────────────────

/**
 * Auto-assign students to room columns following all 4 rules.
 *
 * Algorithm:
 * 1. Build program queues sorted by priority
 * 2. For each room (in order), fill columns C1 → C3 → C2:
 *    - For each column, greedily pick the best program that:
 *      a) has remaining students
 *      b) is allowed in this column (Rule 3)
 *      c) doesn't conflict with other columns at this row (Rule 2)
 *    - Fill as many consecutive rows as possible for that program
 *    - When done, pick the next program for remaining rows
 * 3. Pack rooms to exam_capacity to minimize total rooms used (Rule 1)
 * 4. Programs naturally stay in continuous rooms (Rule 4) via greedy filling
 */
export function autoAssignColumns(
	students: SeatingStudent[],
	rooms: SeatingRoom[]
): RoomColumnPlan[] {
	const sortedRooms = [...rooms].sort((a, b) => a.room_order - b.room_order)
	const queues = buildProgramQueues(students)
	const totalStudents = students.length
	let totalAssigned = 0

	const plans: RoomColumnPlan[] = []

	for (const room of sortedRooms) {
		if (totalAssigned >= totalStudents) {
			plans.push({ room, columns: [], total_seats: 0 })
			continue
		}

		const { rows: maxRows, columns: maxCols } = room
		// Rule 1: use full exam_capacity to minimize rooms
		const maxSeats = room.exam_capacity

		// Column fill order: C1 → C3 → C2
		const colOrder = maxCols >= 3 ? [1, 3, 2] : maxCols === 2 ? [1, 2] : [1]

		// Track which programs occupy each row (for Rule 2 cross-column check)
		const rowPrograms = new Map<number, Set<string>>()
		for (let r = 0; r < maxRows; r++) {
			rowPrograms.set(r, new Set())
		}

		const columnAssignments: ColumnAssignment[] = []
		let roomSeated = 0

		for (const colNum of colOrder) {
			if (roomSeated >= maxSeats || totalAssigned >= totalStudents) break

			let rowCursor = 0

			while (rowCursor < maxRows && roomSeated < maxSeats && totalAssigned < totalStudents) {
				// Find the best program for this position
				let bestIdx = -1
				let bestScore = -1

				for (let qi = 0; qi < queues.length; qi++) {
					const q = queues[qi]
					if (remaining(q) <= 0) continue

					// Rule 3: column restriction
					if (!isColumnAllowed(q, colNum)) continue

					// Rule 2: this program must not already be at rowCursor from another column
					if (rowPrograms.get(rowCursor)!.has(q.program_code)) continue

					// Score: how many consecutive rows can this program fill here?
					// Prefer programs that fill MORE rows (fewer context switches)
					const available = countAvailableRows(q.program_code, rowCursor, maxRows, rowPrograms)
					const canFill = Math.min(remaining(q), available, maxSeats - roomSeated)
					if (canFill <= 0) continue

					// Score = fill count × 100 + remaining count (pack large programs first)
					const score = canFill * 100 + remaining(q)
					if (score > bestScore) {
						bestScore = score
						bestIdx = qi
					}
				}

				if (bestIdx === -1) {
					// No program can fit at this row in this column — skip row
					rowCursor++
					continue
				}

				// Assign this program to consecutive rows in this column
				const q = queues[bestIdx]
				const startRow = rowCursor
				let count = 0

				while (
					rowCursor < maxRows &&
					roomSeated < maxSeats &&
					q.cursor < q.students.length
				) {
					// Rule 2: stop if program already at this row from another column
					if (rowPrograms.get(rowCursor)!.has(q.program_code)) break

					rowPrograms.get(rowCursor)!.add(q.program_code)
					q.cursor++
					rowCursor++
					roomSeated++
					totalAssigned++
					count++
				}

				if (count > 0) {
					// Create ColumnAssignment(s) — split by course_code within this block
					const blockStudents = q.students.slice(q.cursor - count, q.cursor)
					const courseCounts = new Map<string, number>()
					for (const s of blockStudents) {
						courseCounts.set(s.course_code, (courseCounts.get(s.course_code) || 0) + 1)
					}

					for (const [courseCode, courseCount] of courseCounts) {
						columnAssignments.push({
							room_id: room.id,
							column_number: colNum,
							program_code: q.program_code,
							course_code: courseCode,
							count: courseCount,
							course_category: q.has_shared_course ? 'common' : (q.program_type === 'PG' ? 'pg' : 'ug'),
						})
					}
				}
			}
		}

		plans.push({
			room,
			columns: columnAssignments,
			total_seats: roomSeated,
		})
	}

	return plans
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate a set of column plans against all 4 rules.
 * Returns a list of violations (empty = all valid).
 * Use this after user edits to detect conflicts.
 */
export function validateAllocation(
	plans: RoomColumnPlan[],
	students: SeatingStudent[]
): AllocationViolation[] {
	const violations: AllocationViolation[] = []
	const sharedCourses = detectSharedCourses(students)

	for (const plan of plans) {
		const { room, columns } = plan
		if (columns.length === 0) continue

		// Reconstruct row-level assignments per column
		// Columns fill top-down, so we track row ranges per column
		const colRows = new Map<number, { program_code: string; start: number; end: number }[]>()

		for (let c = 1; c <= room.columns; c++) {
			const blocks: { program_code: string; start: number; end: number }[] = []
			let cursor = 0
			const colAssignments = columns.filter(a => a.column_number === c)
			for (const a of colAssignments) {
				blocks.push({
					program_code: a.program_code,
					start: cursor,
					end: cursor + a.count - 1,
				})
				cursor += a.count
			}
			colRows.set(c, blocks)
		}

		// Rule 2: same program must NOT be in the same row across columns
		for (let r = 0; r < room.rows; r++) {
			const programsInRow = new Set<string>()
			for (let c = 1; c <= room.columns; c++) {
				const blocks = colRows.get(c) || []
				for (const block of blocks) {
					if (r >= block.start && r <= block.end) {
						if (programsInRow.has(block.program_code)) {
							violations.push({
								rule: 'Rule 2: Same Program in Same Row',
								room_code: room.room_code,
								details: `${block.program_code} in multiple columns at Row ${r + 1}`,
							})
						}
						programsInRow.add(block.program_code)
					}
				}
			}
		}

		// Rule 3: shared course codes must NOT be in C2
		for (const col of columns) {
			if (col.column_number === 2 && sharedCourses.has(col.course_code)) {
				violations.push({
					rule: 'Rule 3: Shared Course in C2',
					room_code: room.room_code,
					details: `Shared course ${col.course_code} (${col.program_code}) placed in C2`,
				})
			}
		}
	}

	// Rule 1: check if rooms could be reduced
	const usedRooms = plans.filter(p => p.total_seats > 0).length
	const totalCapacity = plans
		.filter(p => p.total_seats > 0)
		.reduce((sum, p) => sum + p.room.exam_capacity, 0)
	const totalSeated = plans.reduce((sum, p) => sum + p.total_seats, 0)
	const minRoomsNeeded = Math.ceil(totalSeated / Math.max(...plans.map(p => p.room.exam_capacity), 1))
	if (usedRooms > minRoomsNeeded + 1) {
		violations.push({
			rule: 'Rule 1: Room Minimization',
			room_code: 'All',
			details: `Using ${usedRooms} rooms but ${minRoomsNeeded} may suffice. Consider packing tighter.`,
		})
	}

	return violations
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Get available course groups for dropdown options.
 */
export function getAvailableCourseOptions(
	students: SeatingStudent[]
): { value: string; label: string; program_code: string; course_code: string; count: number }[] {
	const groups = buildCourseGroups(students)
	return groups.map(g => ({
		value: `${g.program_code}|${g.course_code}`,
		label: `${g.program_code}-${g.course_code}`,
		program_code: g.program_code,
		course_code: g.course_code,
		count: g.count,
	}))
}

/**
 * Recalculate total seats per room after user edits column assignments.
 */
export function recalculatePlanTotals(plans: RoomColumnPlan[]): RoomColumnPlan[] {
	return plans.map(plan => ({
		...plan,
		total_seats: plan.columns.reduce((sum, col) => sum + col.count, 0),
	}))
}
