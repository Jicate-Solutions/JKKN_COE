/**
 * Smart Seating Allocation — Column Allocator
 *
 * Rules (in priority order):
 * 1. MINIMIZE ROOMS — pack rooms to full exam_capacity before opening new ones
 * 2. SAME PROGRAM SEPARATION — students from the same program must NOT be in the same row
 * 3. SHARED COURSE CODES — if 2+ programs share a course_code → C1 and C3 only (NEVER C2)
 * 4. ROOM CONTINUITY — same program stays in continuous rooms (R09→R10→R11)
 * 5. EQUAL DISTRIBUTION — avoid sparse last rooms; if the last occupied room has
 *    fewer students than 40% of the target per room, re-run using max_exam_capacity
 *    as the per-room target so earlier rooms absorb the overflow equally.
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
	SeatingRules,
} from '@/types/seating-allocation'
import { DEFAULT_SEATING_RULES } from '@/types/seating-allocation'

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
		group.students.sort(sortRegularFirst)
	}

	return [...groupMap.values()]
}

// Sort helper — regular students (exam_registrations.is_regular === true) first, then arrears
function sortRegularFirst(a: SeatingStudent, b: SeatingStudent): number {
	const aReg = a.is_regular === true ? 1 : 0
	const bReg = b.is_regular === true ? 1 : 0
	if (aReg !== bReg) return bReg - aReg
	return (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
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
		q.students.sort(sortRegularFirst)
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
 *
 * When Rule 3 is disabled, all programs are allowed in any column.
 */
function isColumnAllowed(q: ProgramQueue, colNum: number, rule3Enabled: boolean): boolean {
	if (rule3Enabled && q.has_shared_course && colNum === 2) return false
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
 * Auto-assign students to room columns following all 5 rules.
 *
 * Algorithm:
 * 1. Build program queues sorted by priority
 * 2. Pre-plan minimum rooms needed using max_exam_capacity
 * 3. For each room (in order), fill columns C1 → C3 → C2:
 *    - For each column, greedily pick the best program that:
 *      a) has remaining students
 *      b) is allowed in this column (Rule 3)
 *      c) doesn't conflict with other columns at this row (Rule 2)
 *    - Fill as many consecutive rows as possible for that program
 * 4. Programs naturally stay in continuous rooms (Rule 4) via greedy filling
 * 5. After first pass, apply Rule 5: if the last occupied room is sparse
 *    (< 40% of targetPerRoom), re-run using hardMax as the per-room target
 *    so earlier rooms absorb the overflow and the last room is eliminated.
 */
export function autoAssignColumns(
	students: SeatingStudent[],
	rooms: SeatingRoom[],
	rules: SeatingRules = DEFAULT_SEATING_RULES
): RoomColumnPlan[] {
	const sortedRooms = [...rooms].sort((a, b) => a.room_order - b.room_order)
	const totalStudents = students.length

	// ── Pre-planning: calculate minimum rooms needed and target per room ──
	const roomMaxCaps = sortedRooms.map(r => r.max_exam_capacity || r.exam_capacity)

	// Rule 1 (Minimize Rooms): when ON, pack rooms by computing min rooms needed
	// and using ceil(students / minRooms) as the per-room target — earlier rooms
	// fill before later rooms open. When OFF, spread students across all rooms
	// equally so no room is preferred.
	let minRoomsNeeded: number
	if (rules.rule_1_minimize_rooms) {
		let cumulativeCap = 0
		minRoomsNeeded = sortedRooms.length
		for (let i = 0; i < sortedRooms.length; i++) {
			cumulativeCap += roomMaxCaps[i]
			if (cumulativeCap >= totalStudents) {
				minRoomsNeeded = i + 1
				break
			}
		}
	} else {
		minRoomsNeeded = sortedRooms.length
	}

	const targetPerRoom = minRoomsNeeded > 0
		? Math.ceil(totalStudents / minRoomsNeeded)
		: totalStudents

	const queues = buildProgramQueues(students)
	let plans = runAllocationPass(sortedRooms, queues, totalStudents, targetPerRoom, rules)

	// ── Rule 5: Equal distribution — avoid sparse last room ──
	if (rules.rule_5_equal_distribution) {
		const usedPlans = plans.filter(p => p.total_seats > 0)
		if (usedPlans.length >= 2) {
			const lastUsed = usedPlans[usedPlans.length - 1]
			const sparseThreshold = Math.max(Math.ceil(targetPerRoom * 0.4), 5)
			if (lastUsed.total_seats <= sparseThreshold) {
				// Re-run using hardMax as per-room target so earlier rooms absorb more students
				const hardMaxTarget = Math.max(...roomMaxCaps)
				queues.forEach(q => { q.cursor = 0 })
				plans = runAllocationPass(sortedRooms, queues, totalStudents, hardMaxTarget, rules)
			}
		}
	}

	return plans
}

/**
 * Inner allocation pass. Fills rooms up to perRoomTarget (capped at hardMax per room).
 * Modifies queues in place (advances cursors).
 */
function runAllocationPass(
	sortedRooms: SeatingRoom[],
	queues: ProgramQueue[],
	totalStudents: number,
	perRoomTarget: number,
	rules: SeatingRules
): RoomColumnPlan[] {
	let totalAssigned = 0
	const plans: RoomColumnPlan[] = []

	// Rule 4: Room continuity — programs placed in the immediately previous room
	// get a large score bonus so they continue into the next room before any new
	// program is introduced (e.g. BA-HIS fills R25 → R26 → ..., not R25 then jump to R32).
	let prevRoomPrograms = new Set<string>()

	for (const room of sortedRooms) {
		if (totalAssigned >= totalStudents) {
			plans.push({ room, columns: [], total_seats: 0 })
			continue
		}

		const { rows: maxRows, columns: maxCols } = room
		const hardMax = room.max_exam_capacity || room.exam_capacity
		const maxSeats = Math.min(perRoomTarget, hardMax)

		// Column fill order: C1 → C3 → C2
		const colOrder = maxCols >= 3 ? [1, 3, 2] : maxCols === 2 ? [1, 2] : [1]

		// Track which programs occupy each row (for Rule 2 cross-column check)
		const rowPrograms = new Map<number, Set<string>>()
		for (let r = 0; r < maxRows; r++) {
			rowPrograms.set(r, new Set())
		}

		const columnAssignments: ColumnAssignment[] = []
		const currentRoomPrograms = new Set<string>()
		let roomSeated = 0

		for (const colNum of colOrder) {
			if (roomSeated >= maxSeats || totalAssigned >= totalStudents) break

			let rowCursor = 0

			while (rowCursor < maxRows && roomSeated < maxSeats && totalAssigned < totalStudents) {
				let bestIdx = -1
				let bestScore = -1

				for (let qi = 0; qi < queues.length; qi++) {
					const q = queues[qi]
					if (remaining(q) <= 0) continue
					if (!isColumnAllowed(q, colNum, rules.rule_3_shared_course_c2)) continue
					// Rule 2: when ON, skip programs already in this row (cross-column conflict).
					if (rules.rule_2_same_program_separation && rowPrograms.get(rowCursor)!.has(q.program_code)) continue

					const available = rules.rule_2_same_program_separation
						? countAvailableRows(q.program_code, rowCursor, maxRows, rowPrograms)
						: (maxRows - rowCursor)
					const canFill = Math.min(remaining(q), available, maxSeats - roomSeated)
					if (canFill <= 0) continue

					// Base score: fill count × 100 + remaining (pack large programs first)
					let score = canFill * 100 + remaining(q)
					// Rule 4: huge bonus for programs that were in the previous room —
					// ensures the program finishes before a new program starts.
					if (rules.rule_4_room_continuity && prevRoomPrograms.has(q.program_code)) score += 1_000_000
					if (score > bestScore) {
						bestScore = score
						bestIdx = qi
					}
				}

				if (bestIdx === -1) {
					rowCursor++
					continue
				}

				const q = queues[bestIdx]
				let count = 0

				while (
					rowCursor < maxRows &&
					roomSeated < maxSeats &&
					q.cursor < q.students.length
				) {
					// Rule 2: when ON, stop the block if same program is already at this row.
					if (rules.rule_2_same_program_separation && rowPrograms.get(rowCursor)!.has(q.program_code)) break

					rowPrograms.get(rowCursor)!.add(q.program_code)
					q.cursor++
					rowCursor++
					roomSeated++
					totalAssigned++
					count++
				}

				if (count > 0) {
					currentRoomPrograms.add(q.program_code)
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

		// Carry forward only programs with students still remaining —
		// a finished program shouldn't keep "locking" priority in the next room.
		prevRoomPrograms = new Set<string>()
		for (const code of currentRoomPrograms) {
			const q = queues.find(x => x.program_code === code)
			if (q && remaining(q) > 0) prevRoomPrograms.add(code)
		}
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
	students: SeatingStudent[],
	rules: SeatingRules = DEFAULT_SEATING_RULES
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
		if (rules.rule_2_same_program_separation) {
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
		}

		// Rule 3: shared course codes must NOT be in C2
		if (rules.rule_3_shared_course_c2) {
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
	}

	// Rule 1: check if rooms could be reduced
	if (rules.rule_1_minimize_rooms) {
		const usedRooms = plans.filter(p => p.total_seats > 0).length
		const totalSeated = plans.reduce((sum, p) => sum + p.total_seats, 0)
		const minRoomsNeeded = Math.ceil(totalSeated / Math.max(...plans.map(p => p.room.exam_capacity), 1))
		if (usedRooms > minRoomsNeeded + 1) {
			violations.push({
				rule: 'Rule 1: Room Minimization',
				room_code: 'All',
				details: `Using ${usedRooms} rooms but ${minRoomsNeeded} may suffice. Consider packing tighter.`,
			})
		}
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
