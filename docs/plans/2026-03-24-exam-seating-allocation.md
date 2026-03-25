# Exam Seating Allocation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Seating Arrangement" tab to the existing Exam Attendance Sheet page (`/pre-exam/exam-attendance-sheet`) that generates room-wise seating plans using 4 strategies (Institution Standard, Smart Mixing, Strict Mode, Manual), with a visual room grid, PDF export, and database persistence.

**Architecture:** Hybrid client/server approach — algorithms run client-side for <500 students and server-side for 500+. Reuses existing `room_allocations` and `seat_allocations` tables/APIs. Tab shares the same filter bar (Session, Date, FN/AN) as the Attendance Sheet tab.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase, Shadcn UI Tabs, Tailwind CSS, jsPDF for PDF generation.

---

## File Overview

| Action | Path | Purpose |
|--------|------|---------|
| Create | `types/seating-allocation.ts` | TypeScript types for seating engine |
| Create | `lib/seating/seating-engine.ts` | Core seating algorithms (all 4 strategies) |
| Create | `lib/seating/seating-utils.ts` | Shared helpers (scoring, neighbor checks) |
| Create | `components/pre-exam/seating-arrangement-tab.tsx` | Seating Arrangement tab UI component |
| Create | `components/pre-exam/room-grid.tsx` | Visual room grid component |
| Create | `components/pre-exam/room-suggestion-panel.tsx` | Room auto-suggest + approval panel |
| Create | `app/api/pre-exam/seating/students/route.ts` | Fetch registered students for date+session |
| Create | `app/api/pre-exam/seating/rooms/route.ts` | Fetch available rooms for institution |
| Create | `app/api/pre-exam/seating/generate/route.ts` | Server-side seating generation (>500 students) |
| Create | `app/api/pre-exam/seating/save/route.ts` | Save allocation to DB |
| Create | `app/api/pre-exam/seating/load/route.ts` | Load saved allocation for date+session |
| Create | `app/api/pre-exam/seating/clear/route.ts` | Clear allocation for regeneration |
| Create | `lib/utils/generate-seating-plan-pdf.ts` | PDF generation for seating charts |
| Modify | `app/(coe)/pre-exam/exam-attendance-sheet/page.tsx` | Add Tabs wrapper, extract attendance content |

---

## Task 1: TypeScript Types

**Files:**
- Create: `types/seating-allocation.ts`

**Step 1: Create the types file**

```typescript
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
	student: SeatingStudent | null // null = empty seat
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
	session_type: string // FN or AN
	strategy: SeatingStrategy
	rooms: RoomAllocationResult[]
	generated_at: string
}
```

**Step 2: Commit**

```
git add types/seating-allocation.ts
git commit -m "feat(seating): add TypeScript types for seating allocation engine"
```

---

## Task 2: Seating Utility Functions

**Files:**
- Create: `lib/seating/seating-utils.ts`

**Step 1: Create utility functions**

```typescript
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
	if (neighbors.length === 0) return 40 // empty area = good

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
				score -= 20 // same program AND same subject = worst case
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
	// Sort each group by register number
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
 * Fills rooms in order until all students are accounted for.
 */
export function suggestRooms(
	rooms: { id: string; room_code: string; room_name: string; building: string | null; floor: string | null; room_order: number; exam_capacity: number; rows: number; columns: number }[],
	totalStudents: number
): { room: typeof rooms[number]; suggested_seats: number; is_selected: boolean }[] {
	const sorted = [...rooms].sort((a, b) => a.room_order - b.room_order)
	const suggestions: { room: typeof rooms[number]; suggested_seats: number; is_selected: boolean }[] = []
	let remaining = totalStudents

	for (const room of sorted) {
		if (remaining <= 0) {
			suggestions.push({ room, suggested_seats: 0, is_selected: false })
		} else {
			const seats = Math.min(remaining, room.exam_capacity)
			suggestions.push({ room, suggested_seats: seats, is_selected: true })
			remaining -= seats
		}
	}
	return suggestions
}
```

**Step 2: Commit**

```
git add lib/seating/seating-utils.ts
git commit -m "feat(seating): add utility functions for neighbor scoring and room suggestion"
```

---

## Task 3: Seating Engine (All 4 Algorithms)

**Files:**
- Create: `lib/seating/seating-engine.ts`

**Step 1: Create the seating engine**

This is the core algorithm file implementing all 4 strategies.

```typescript
import {
	SeatingStudent,
	SeatAssignment,
	RoomAllocationResult,
	SeatingAllocationResult,
	SeatingConflict,
	ManualRoomAssignment,
	RoomSuggestion,
} from '@/types/seating-allocation'
import {
	getNeighbors,
	scoreCandidate,
	groupByProgram,
	createEmptyGrid,
	flattenGrid,
} from './seating-utils'

/**
 * STRATEGY 1: Institution Standard - Row-wise ABAB program alternation
 *
 * Row 1: All Program A students
 * Row 2: All Program B students
 * Row 3: All Program A students
 * ...cycles through programs
 */
function allocateInstitutionStandard(
	students: SeatingStudent[],
	rooms: RoomSuggestion[]
): { roomResults: RoomAllocationResult[]; unassigned: SeatingStudent[] } {
	const programGroups = groupByProgram(students)
	const programCodes = [...programGroups.keys()].sort()
	const roomResults: RoomAllocationResult[] = []

	// Build a flat queue cycling through programs
	const queue: SeatingStudent[] = []
	const iterators = programCodes.map(code => ({
		code,
		students: [...(programGroups.get(code) || [])],
		index: 0,
	}))

	// Interleave: take one batch (row-width) from each program
	let programIdx = 0
	let totalQueued = 0
	const totalStudents = students.length

	while (totalQueued < totalStudents) {
		const iter = iterators[programIdx % programCodes.length]
		if (iter.index < iter.students.length) {
			queue.push(iter.students[iter.index])
			iter.index++
			totalQueued++
		}
		programIdx++
		// Safety: if we've cycled all programs without progress, break
		if (programIdx > totalStudents * programCodes.length + 100) break
	}

	// Now fill rooms row by row, each row gets one program
	let queueIdx = 0
	for (const suggestion of rooms.filter(r => r.is_selected)) {
		const room = suggestion.room
		const grid = createEmptyGrid(room.rows, room.columns)
		let seated = 0
		const capacity = suggestion.suggested_seats

		for (let r = 0; r < room.rows && seated < capacity && queueIdx < queue.length; r++) {
			for (let c = 0; c < room.columns && seated < capacity && queueIdx < queue.length; c++) {
				grid[r][c] = {
					row_number: r + 1,
					column_number: c + 1,
					student: queue[queueIdx],
				}
				queueIdx++
				seated++
			}
		}

		roomResults.push({
			room,
			seats: flattenGrid(grid),
			students_seated: seated,
			total_capacity: room.exam_capacity,
		})
	}

	const unassigned = queue.slice(queueIdx)
	return { roomResults, unassigned }
}

/**
 * STRATEGY 2: Smart Mixing - Maximize neighbor diversity by scoring
 *
 * For each seat, evaluate all remaining students and pick the one
 * with the highest diversity score relative to already-placed neighbors.
 */
function allocateSmartMixing(
	students: SeatingStudent[],
	rooms: RoomSuggestion[]
): { roomResults: RoomAllocationResult[]; unassigned: SeatingStudent[]; conflicts: SeatingConflict[] } {
	const shuffled = [...students].sort(() => Math.random() - 0.5)
	const remaining = [...shuffled]
	const roomResults: RoomAllocationResult[] = []

	for (const suggestion of rooms.filter(r => r.is_selected)) {
		const room = suggestion.room
		const grid = createEmptyGrid(room.rows, room.columns)
		let seated = 0
		const capacity = suggestion.suggested_seats

		for (let r = 0; r < room.rows && seated < capacity && remaining.length > 0; r++) {
			for (let c = 0; c < room.columns && seated < capacity && remaining.length > 0; c++) {
				const neighbors = getNeighbors(grid, r, c, room.rows, room.columns)

				// Score each candidate
				let bestIdx = 0
				let bestScore = -Infinity
				for (let i = 0; i < remaining.length; i++) {
					const score = scoreCandidate(remaining[i], neighbors, 'smart')
					if (score > bestScore) {
						bestScore = score
						bestIdx = i
					}
				}

				const student = remaining.splice(bestIdx, 1)[0]
				grid[r][c] = {
					row_number: r + 1,
					column_number: c + 1,
					student,
				}
				seated++
			}
		}

		roomResults.push({
			room,
			seats: flattenGrid(grid),
			students_seated: seated,
			total_capacity: room.exam_capacity,
		})
	}

	return { roomResults, unassigned: remaining, conflicts: [] }
}

/**
 * STRATEGY 3: Strict Mode - Different program AND different subject per neighbor
 *
 * Same as Smart Mixing but uses strict scoring and reports conflicts
 * when constraints cannot be satisfied (no fallback).
 */
function allocateStrictMode(
	students: SeatingStudent[],
	rooms: RoomSuggestion[]
): { roomResults: RoomAllocationResult[]; unassigned: SeatingStudent[]; conflicts: SeatingConflict[] } {
	const shuffled = [...students].sort(() => Math.random() - 0.5)
	const remaining = [...shuffled]
	const roomResults: RoomAllocationResult[] = []
	const conflicts: SeatingConflict[] = []

	for (const suggestion of rooms.filter(r => r.is_selected)) {
		const room = suggestion.room
		const grid = createEmptyGrid(room.rows, room.columns)
		let seated = 0
		const capacity = suggestion.suggested_seats

		for (let r = 0; r < room.rows && seated < capacity && remaining.length > 0; r++) {
			for (let c = 0; c < room.columns && seated < capacity && remaining.length > 0; c++) {
				const neighbors = getNeighbors(grid, r, c, room.rows, room.columns)

				let bestIdx = 0
				let bestScore = -Infinity
				for (let i = 0; i < remaining.length; i++) {
					const score = scoreCandidate(remaining[i], neighbors, 'strict')
					if (score > bestScore) {
						bestScore = score
						bestIdx = i
					}
				}

				const student = remaining.splice(bestIdx, 1)[0]
				grid[r][c] = {
					row_number: r + 1,
					column_number: c + 1,
					student,
				}
				seated++

				// Check for conflicts with neighbors
				for (const neighbor of neighbors) {
					if (!neighbor.student) continue
					if (neighbor.student.program_code === student.program_code &&
						neighbor.student.course_code === student.course_code) {
						conflicts.push({
							room_code: room.room_code,
							row: r + 1,
							column: c + 1,
							student_reg_no: student.stu_register_no,
							conflict_type: 'same_subject',
							neighbor_reg_no: neighbor.student.stu_register_no,
						})
					} else if (neighbor.student.program_code === student.program_code) {
						conflicts.push({
							room_code: room.room_code,
							row: r + 1,
							column: c + 1,
							student_reg_no: student.stu_register_no,
							conflict_type: 'same_program',
							neighbor_reg_no: neighbor.student.stu_register_no,
						})
					}
				}
			}
		}

		roomResults.push({
			room,
			seats: flattenGrid(grid),
			students_seated: seated,
			total_capacity: room.exam_capacity,
		})
	}

	return { roomResults, unassigned: remaining, conflicts }
}

/**
 * STRATEGY 4: Manual - Admin assigns programs to rooms, auto-fill within
 *
 * Each room gets a subset of programs. Within each room,
 * Institution Standard (ABAB) pattern is used.
 */
function allocateManual(
	students: SeatingStudent[],
	rooms: RoomSuggestion[],
	manualAssignments: ManualRoomAssignment[]
): { roomResults: RoomAllocationResult[]; unassigned: SeatingStudent[] } {
	const programGroups = groupByProgram(students)
	const roomResults: RoomAllocationResult[] = []
	const assignedStudents = new Set<string>()

	for (const assignment of manualAssignments) {
		const suggestion = rooms.find(r => r.room.id === assignment.room_id)
		if (!suggestion) continue

		const room = suggestion.room
		const grid = createEmptyGrid(room.rows, room.columns)
		let seated = 0

		// Get students for assigned programs
		const roomStudents: SeatingStudent[] = []
		for (const code of assignment.program_codes) {
			const programStudents = programGroups.get(code) || []
			for (const s of programStudents) {
				if (!assignedStudents.has(s.exam_registration_id)) {
					roomStudents.push(s)
				}
			}
		}

		// Fill using ABAB pattern within assigned programs
		const roomPrograms = [...new Set(roomStudents.map(s => s.program_code))].sort()
		const roomProgramGroups = new Map<string, SeatingStudent[]>()
		for (const s of roomStudents) {
			const list = roomProgramGroups.get(s.program_code) || []
			list.push(s)
			roomProgramGroups.set(s.program_code, list)
		}

		const iterators = roomPrograms.map(code => ({
			students: roomProgramGroups.get(code) || [],
			index: 0,
		}))

		for (let r = 0; r < room.rows && seated < room.exam_capacity; r++) {
			const iter = iterators[r % iterators.length]
			for (let c = 0; c < room.columns && seated < room.exam_capacity; c++) {
				if (iter.index < iter.students.length) {
					const student = iter.students[iter.index]
					grid[r][c] = {
						row_number: r + 1,
						column_number: c + 1,
						student,
					}
					assignedStudents.add(student.exam_registration_id)
					iter.index++
					seated++
				}
			}
		}

		roomResults.push({
			room,
			seats: flattenGrid(grid),
			students_seated: seated,
			total_capacity: room.exam_capacity,
		})
	}

	const unassigned = students.filter(s => !assignedStudents.has(s.exam_registration_id))
	return { roomResults, unassigned }
}

/**
 * Main entry point: generate seating allocation using the specified strategy.
 */
export function generateSeatingAllocation(
	students: SeatingStudent[],
	rooms: RoomSuggestion[],
	strategy: 'institution-standard' | 'smart-mixing' | 'strict' | 'manual',
	manualAssignments?: ManualRoomAssignment[]
): SeatingAllocationResult {
	let roomResults: RoomAllocationResult[] = []
	let unassigned: SeatingStudent[] = []
	let conflicts: SeatingConflict[] = []

	switch (strategy) {
		case 'institution-standard': {
			const result = allocateInstitutionStandard(students, rooms)
			roomResults = result.roomResults
			unassigned = result.unassigned
			break
		}
		case 'smart-mixing': {
			const result = allocateSmartMixing(students, rooms)
			roomResults = result.roomResults
			unassigned = result.unassigned
			conflicts = result.conflicts
			break
		}
		case 'strict': {
			const result = allocateStrictMode(students, rooms)
			roomResults = result.roomResults
			unassigned = result.unassigned
			conflicts = result.conflicts
			break
		}
		case 'manual': {
			if (!manualAssignments) {
				return {
					strategy,
					rooms: [],
					total_students: students.length,
					total_seated: 0,
					unassigned_students: students,
					conflicts: [],
				}
			}
			const result = allocateManual(students, rooms, manualAssignments)
			roomResults = result.roomResults
			unassigned = result.unassigned
			break
		}
	}

	return {
		strategy,
		rooms: roomResults,
		total_students: students.length,
		total_seated: students.length - unassigned.length,
		unassigned_students: unassigned,
		conflicts,
	}
}
```

**Step 2: Commit**

```
git add lib/seating/seating-engine.ts
git commit -m "feat(seating): implement all 4 seating allocation algorithms"
```

---

## Task 4: API Routes

**Files:**
- Create: `app/api/pre-exam/seating/students/route.ts`
- Create: `app/api/pre-exam/seating/rooms/route.ts`
- Create: `app/api/pre-exam/seating/generate/route.ts`
- Create: `app/api/pre-exam/seating/save/route.ts`
- Create: `app/api/pre-exam/seating/load/route.ts`
- Create: `app/api/pre-exam/seating/clear/route.ts`

### Step 1: Students endpoint

`app/api/pre-exam/seating/students/route.ts`

Fetches all registered students for a given date + session by:
1. Finding `exam_timetables` matching date + session + institution
2. Getting `exam_registrations` for those timetables' course offerings
3. Joining course info for the `course_code` field

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')
		const examDate = searchParams.get('exam_date')
		const session = searchParams.get('session')

		if (!institutionId || !examinationSessionId || !examDate || !session) {
			return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
		}

		// 1. Get timetables for this date + session
		const { data: timetables, error: ttError } = await supabase
			.from('exam_timetables')
			.select('id, course_offering_id, course_id')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', examinationSessionId)
			.eq('exam_date', examDate)
			.eq('session', session)
			.eq('is_published', true)

		if (ttError) {
			console.error('Timetable fetch error:', ttError)
			return NextResponse.json({ error: 'Failed to fetch timetables' }, { status: 500 })
		}

		if (!timetables || timetables.length === 0) {
			return NextResponse.json({ students: [], timetables: [] })
		}

		const courseOfferingIds = timetables.map(tt => tt.course_offering_id)
		const courseIds = [...new Set(timetables.map(tt => tt.course_id).filter(Boolean))]

		// 2. Get course codes from courses table
		let courseLookup = new Map<string, string>()
		if (courseIds.length > 0) {
			const { data: courses } = await supabase
				.from('courses')
				.select('id, course_code')
				.in('id', courseIds)
			if (courses) {
				courseLookup = new Map(courses.map(c => [c.id, c.course_code]))
			}
		}

		// 3. Get registrations
		const { data: registrations, error: regError } = await supabase
			.from('exam_registrations')
			.select('id, student_id, stu_register_no, student_name, course_offering_id, program_code, is_regular, attempt_number')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', examinationSessionId)
			.in('course_offering_id', courseOfferingIds)
			.eq('registration_status', 'Approved')
			.order('stu_register_no', { ascending: true })
			.range(0, 9999)

		if (regError) {
			console.error('Registration fetch error:', regError)
			return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
		}

		// 4. Build timetable lookup: course_offering_id -> timetable
		const ttLookup = new Map<string, typeof timetables[number]>()
		for (const tt of timetables) {
			ttLookup.set(tt.course_offering_id, tt)
		}

		// 5. Map registrations to SeatingStudent format
		const students = (registrations || []).map(reg => {
			const tt = ttLookup.get(reg.course_offering_id)
			const courseCode = tt?.course_id ? (courseLookup.get(tt.course_id) || '') : ''
			return {
				exam_registration_id: reg.id,
				stu_register_no: reg.stu_register_no || '',
				student_name: reg.student_name || '',
				program_code: reg.program_code || '',
				course_code: courseCode,
				course_offering_id: reg.course_offering_id,
				exam_timetable_id: tt?.id || '',
				is_regular: reg.is_regular,
			}
		})

		return NextResponse.json({
			students,
			timetables: timetables.map(tt => ({
				id: tt.id,
				course_offering_id: tt.course_offering_id,
				course_id: tt.course_id,
			})),
			total: students.length,
		})
	} catch (e) {
		console.error('Seating students API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

### Step 2: Rooms endpoint

`app/api/pre-exam/seating/rooms/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutions_id')

		if (!institutionId) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('exam_rooms')
			.select('id, room_code, room_name, building, floor, room_order, exam_capacity, rows, columns')
			.eq('institutions_id', institutionId)
			.eq('is_active', true)
			.order('room_order', { ascending: true })

		if (error) {
			console.error('Rooms fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (e) {
		console.error('Seating rooms API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

### Step 3: Server-side generate endpoint

`app/api/pre-exam/seating/generate/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { generateSeatingAllocation } from '@/lib/seating/seating-engine'
import type { SeatingStudent, RoomSuggestion, ManualRoomAssignment } from '@/types/seating-allocation'

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { students, rooms, strategy, manualAssignments } = body as {
			students: SeatingStudent[]
			rooms: RoomSuggestion[]
			strategy: 'institution-standard' | 'smart-mixing' | 'strict' | 'manual'
			manualAssignments?: ManualRoomAssignment[]
		}

		if (!students || !rooms || !strategy) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}

		const result = generateSeatingAllocation(students, rooms, strategy, manualAssignments)
		return NextResponse.json(result)
	} catch (e) {
		console.error('Seating generate API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

### Step 4: Save endpoint

`app/api/pre-exam/seating/save/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { RoomAllocationResult } from '@/types/seating-allocation'

export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()
		const { institutions_id, exam_date, exam_session, rooms } = body as {
			institutions_id: string
			exam_date: string
			exam_session: string
			rooms: RoomAllocationResult[]
		}

		if (!institutions_id || !exam_date || !exam_session || !rooms?.length) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}

		let totalSaved = 0

		for (const roomResult of rooms) {
			// Get timetable IDs from the students in this room
			const timetableIds = [...new Set(
				roomResult.seats
					.filter(s => s.student)
					.map(s => s.student!.exam_timetable_id)
			)]

			// Create room_allocation for each timetable in this room
			for (const ttId of timetableIds) {
				const studentsForTT = roomResult.seats.filter(
					s => s.student?.exam_timetable_id === ttId
				)

				// Create room allocation
				const { data: roomAlloc, error: raError } = await supabase
					.from('room_allocations')
					.insert({
						institutions_id,
						exam_timetable_id: ttId,
						exam_room_id: roomResult.room.id,
						seats_allocated: studentsForTT.length,
						allocation_status: 'Planned',
					})
					.select('id')
					.single()

				if (raError) {
					console.error('Room allocation error:', raError)
					continue
				}

				// Create seat allocations for this room+timetable combo
				const seatRows = studentsForTT
					.filter(s => s.student)
					.map(s => ({
						room_allocation_id: roomAlloc.id,
						institutions_id,
						exam_timetable_id: ttId,
						exam_room_id: roomResult.room.id,
						student_reg_no: s.student!.stu_register_no,
						course_code: s.student!.course_code,
						exam_date,
						exam_session,
						row_number: s.row_number,
						column_number: s.column_number,
					}))

				if (seatRows.length > 0) {
					const { error: saError } = await supabase
						.from('seat_allocations')
						.insert(seatRows)

					if (saError) {
						console.error('Seat allocation error:', saError)
					} else {
						totalSaved += seatRows.length
					}
				}
			}
		}

		return NextResponse.json({ success: true, total_saved: totalSaved }, { status: 201 })
	} catch (e) {
		console.error('Seating save API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

### Step 5: Load endpoint

`app/api/pre-exam/seating/load/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutions_id')
		const examDate = searchParams.get('exam_date')
		const examSession = searchParams.get('exam_session')

		if (!institutionId || !examDate || !examSession) {
			return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
		}

		// Get seat allocations for this date + session
		const { data: seats, error } = await supabase
			.from('seat_allocations')
			.select(`
				*,
				exam_rooms:exam_room_id(
					id, room_code, room_name, building, floor, room_order, exam_capacity, rows, columns
				)
			`)
			.eq('institutions_id', institutionId)
			.eq('exam_date', examDate)
			.eq('exam_session', examSession)
			.order('row_number', { ascending: true })
			.order('column_number', { ascending: true })
			.range(0, 9999)

		if (error) {
			console.error('Load seating error:', error)
			return NextResponse.json({ error: 'Failed to load seating' }, { status: 500 })
		}

		return NextResponse.json({
			seats: seats || [],
			has_allocation: (seats || []).length > 0,
		})
	} catch (e) {
		console.error('Seating load API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

### Step 6: Clear endpoint

`app/api/pre-exam/seating/clear/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function DELETE(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutions_id')
		const examDate = searchParams.get('exam_date')
		const examSession = searchParams.get('exam_session')

		if (!institutionId || !examDate || !examSession) {
			return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
		}

		// Delete seat allocations first (child records)
		const { error: seatError } = await supabase
			.from('seat_allocations')
			.delete()
			.eq('institutions_id', institutionId)
			.eq('exam_date', examDate)
			.eq('exam_session', examSession)

		if (seatError) {
			console.error('Clear seats error:', seatError)
			return NextResponse.json({ error: 'Failed to clear seat allocations' }, { status: 500 })
		}

		// Delete room allocations for timetables on this date+session
		const { data: timetables } = await supabase
			.from('exam_timetables')
			.select('id')
			.eq('institutions_id', institutionId)
			.eq('exam_date', examDate)
			.eq('session', examSession)

		if (timetables && timetables.length > 0) {
			const ttIds = timetables.map(tt => tt.id)
			const { error: roomError } = await supabase
				.from('room_allocations')
				.delete()
				.eq('institutions_id', institutionId)
				.in('exam_timetable_id', ttIds)

			if (roomError) {
				console.error('Clear room allocations error:', roomError)
			}
		}

		return NextResponse.json({ success: true })
	} catch (e) {
		console.error('Seating clear API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

### Step 7: Commit all API routes

```
git add app/api/pre-exam/seating/
git commit -m "feat(seating): add API routes for students, rooms, generate, save, load, clear"
```

---

## Task 5: Room Grid Visual Component

**Files:**
- Create: `components/pre-exam/room-grid.tsx`

**Step 1: Create the visual room grid component**

This renders a room as a grid of seats, color-coded by program. Each cell shows Register No + Student Name.

```typescript
'use client'

import { RoomAllocationResult, SeatAssignment } from '@/types/seating-allocation'
import { cn } from '@/lib/utils'

// Color palette for programs (up to 8 programs)
const PROGRAM_COLORS = [
	{ bg: 'bg-blue-100 border-blue-300', text: 'text-blue-800', dot: 'bg-blue-500' },
	{ bg: 'bg-emerald-100 border-emerald-300', text: 'text-emerald-800', dot: 'bg-emerald-500' },
	{ bg: 'bg-amber-100 border-amber-300', text: 'text-amber-800', dot: 'bg-amber-500' },
	{ bg: 'bg-purple-100 border-purple-300', text: 'text-purple-800', dot: 'bg-purple-500' },
	{ bg: 'bg-rose-100 border-rose-300', text: 'text-rose-800', dot: 'bg-rose-500' },
	{ bg: 'bg-cyan-100 border-cyan-300', text: 'text-cyan-800', dot: 'bg-cyan-500' },
	{ bg: 'bg-orange-100 border-orange-300', text: 'text-orange-800', dot: 'bg-orange-500' },
	{ bg: 'bg-indigo-100 border-indigo-300', text: 'text-indigo-800', dot: 'bg-indigo-500' },
]

interface RoomGridProps {
	roomResult: RoomAllocationResult
	programColorMap: Map<string, number>
}

export function RoomGrid({ roomResult, programColorMap }: RoomGridProps) {
	const { room, seats, students_seated } = roomResult

	// Build a 2D grid from the flat seats array
	const grid: (SeatAssignment | null)[][] = Array.from(
		{ length: room.rows },
		() => Array.from({ length: room.columns }, () => null)
	)
	for (const seat of seats) {
		const r = seat.row_number - 1
		const c = seat.column_number - 1
		if (r >= 0 && r < room.rows && c >= 0 && c < room.columns) {
			grid[r][c] = seat
		}
	}

	return (
		<div className="rounded-lg border bg-card p-4">
			{/* Room header */}
			<div className="mb-3 flex items-center justify-between">
				<div>
					<h3 className="font-semibold text-lg">
						Room {room.room_code} - {room.room_name}
					</h3>
					<p className="text-sm text-muted-foreground">
						{room.building}{room.floor ? `, ${room.floor}` : ''} | {students_seated}/{room.exam_capacity} seated
					</p>
				</div>
				<div className="text-sm font-medium text-muted-foreground">
					{room.rows} x {room.columns} grid
				</div>
			</div>

			{/* Grid */}
			<div className="overflow-x-auto">
				<table className="w-full border-collapse">
					<thead>
						<tr>
							<th className="p-1 text-xs text-muted-foreground w-8"></th>
							{Array.from({ length: room.columns }, (_, c) => (
								<th key={c} className="p-1 text-xs text-muted-foreground text-center">
									C{c + 1}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{grid.map((row, r) => (
							<tr key={r}>
								<td className="p-1 text-xs text-muted-foreground text-center font-medium">
									R{r + 1}
								</td>
								{row.map((seat, c) => {
									const student = seat?.student
									const colorIdx = student
										? (programColorMap.get(student.program_code) ?? 0) % PROGRAM_COLORS.length
										: -1
									const color = colorIdx >= 0 ? PROGRAM_COLORS[colorIdx] : null

									return (
										<td key={c} className="p-0.5">
											<div
												className={cn(
													'rounded border p-1.5 text-center min-h-[3rem] flex flex-col items-center justify-center',
													student && color
														? `${color.bg} ${color.text}`
														: 'bg-muted/30 border-dashed border-muted-foreground/20'
												)}
											>
												{student ? (
													<>
														<span className="text-[10px] font-bold leading-tight block truncate max-w-[80px]">
															{student.stu_register_no}
														</span>
														<span className="text-[9px] leading-tight block truncate max-w-[80px]">
															{student.student_name}
														</span>
													</>
												) : (
													<span className="text-[9px] text-muted-foreground">Empty</span>
												)}
											</div>
										</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}

/** Legend component showing program-to-color mapping */
export function ProgramLegend({ programColorMap }: { programColorMap: Map<string, number> }) {
	return (
		<div className="flex flex-wrap gap-3 items-center">
			<span className="text-sm font-medium text-muted-foreground">Programs:</span>
			{[...programColorMap.entries()].map(([code, idx]) => {
				const color = PROGRAM_COLORS[idx % PROGRAM_COLORS.length]
				return (
					<div key={code} className="flex items-center gap-1.5">
						<div className={cn('h-3 w-3 rounded-full', color.dot)} />
						<span className="text-sm font-medium">{code}</span>
					</div>
				)
			})}
		</div>
	)
}
```

**Step 2: Commit**

```
git add components/pre-exam/room-grid.tsx
git commit -m "feat(seating): add visual room grid component with program color coding"
```

---

## Task 6: Room Suggestion Panel

**Files:**
- Create: `components/pre-exam/room-suggestion-panel.tsx`

**Step 1: Create the room suggestion/approval panel**

```typescript
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { RoomSuggestion } from '@/types/seating-allocation'

interface RoomSuggestionPanelProps {
	suggestions: RoomSuggestion[]
	totalStudents: number
	onConfirm: (confirmed: RoomSuggestion[]) => void
	onCancel: () => void
}

export function RoomSuggestionPanel({
	suggestions,
	totalStudents,
	onConfirm,
	onCancel,
}: RoomSuggestionPanelProps) {
	const [rooms, setRooms] = useState<RoomSuggestion[]>(suggestions)

	const toggleRoom = (index: number) => {
		setRooms(prev => prev.map((r, i) =>
			i === index ? { ...r, is_selected: !r.is_selected } : r
		))
	}

	const updateSeats = (index: number, seats: number) => {
		setRooms(prev => prev.map((r, i) =>
			i === index ? { ...r, suggested_seats: Math.min(seats, r.room.exam_capacity) } : r
		))
	}

	const totalCapacity = rooms
		.filter(r => r.is_selected)
		.reduce((sum, r) => sum + r.suggested_seats, 0)

	const isValid = totalCapacity >= totalStudents

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<CardTitle className="text-base">Room Allocation</CardTitle>
					<Badge variant={isValid ? 'default' : 'destructive'}>
						{totalCapacity} / {totalStudents} seats
					</Badge>
				</div>
				<p className="text-sm text-muted-foreground">
					System suggests rooms based on capacity. Adjust as needed.
				</p>
			</CardHeader>
			<CardContent>
				<div className="space-y-2">
					{rooms.map((suggestion, idx) => (
						<div
							key={suggestion.room.id}
							className="flex items-center gap-3 rounded-lg border p-3"
						>
							<Checkbox
								checked={suggestion.is_selected}
								onCheckedChange={() => toggleRoom(idx)}
							/>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="font-medium">Room {suggestion.room.room_code}</span>
									<span className="text-sm text-muted-foreground">
										{suggestion.room.building}{suggestion.room.floor ? `, ${suggestion.room.floor}` : ''}
									</span>
								</div>
								<div className="text-xs text-muted-foreground">
									{suggestion.room.rows}x{suggestion.room.columns} grid | Capacity: {suggestion.room.exam_capacity}
								</div>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-sm text-muted-foreground">Seats:</span>
								<Input
									type="number"
									min={0}
									max={suggestion.room.exam_capacity}
									value={suggestion.suggested_seats}
									onChange={e => updateSeats(idx, parseInt(e.target.value) || 0)}
									className="w-20 h-8"
									disabled={!suggestion.is_selected}
								/>
							</div>
						</div>
					))}
				</div>

				{!isValid && (
					<p className="mt-3 text-sm text-destructive">
						Not enough seats selected. Need {totalStudents - totalCapacity} more.
					</p>
				)}

				<div className="mt-4 flex justify-end gap-2">
					<Button variant="outline" onClick={onCancel}>Cancel</Button>
					<Button onClick={() => onConfirm(rooms)} disabled={!isValid}>
						Confirm Rooms
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
```

**Step 2: Commit**

```
git add components/pre-exam/room-suggestion-panel.tsx
git commit -m "feat(seating): add room suggestion panel with capacity validation"
```

---

## Task 7: Seating Arrangement Tab Component

**Files:**
- Create: `components/pre-exam/seating-arrangement-tab.tsx`

**Step 1: Create the main tab component**

This is the largest component - it orchestrates the full workflow: fetch students, show summary, choose strategy, suggest rooms, generate, display grid, save, PDF.

See the full component code in the implementation phase. Key structure:

- Props: `institutionId`, `examinationSessionId`, `examDate`, `sessionType`, `isFormComplete`
- States: `students`, `rooms`, `step` (idle/summary/rooms/generated/saved), `strategy`, `allocation`
- Workflow steps: fetch data -> summary -> strategy selection -> room suggestion -> generate -> visual grid -> save -> PDF
- Hybrid: uses client-side `generateSeatingAllocation()` for <500 students, POST to `/api/pre-exam/seating/generate` for 500+

**Step 2: Commit**

```
git add components/pre-exam/seating-arrangement-tab.tsx
git commit -m "feat(seating): add main seating arrangement tab component with full workflow"
```

---

## Task 8: Integrate Tab into Attendance Sheet Page

**Files:**
- Modify: `app/(coe)/pre-exam/exam-attendance-sheet/page.tsx`

**Step 1: Add imports**

After existing imports (~line 28), add:
```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SeatingArrangementTab } from '@/components/pre-exam/seating-arrangement-tab'
```

**Step 2: Add computed variable**

After existing state declarations (~line 80), add:
```typescript
const isFormComplete = !!(institutionId && selectedSessionId && selectedExamDate && selectedSessionType)
```

**Step 3: Restructure page content**

The key change is wrapping the content area inside `<Tabs>`:
- Filter card (Session/Date/SessionType) stays SHARED above tabs
- "Generate Attendance Sheet" button + progress bar goes inside `<TabsContent value="attendance-sheet">`
- Seating arrangement component goes inside `<TabsContent value="seating-arrangement">`
- Practical batches selector stays in attendance sheet tab only

**Step 4: Commit**

```
git add app/(coe)/pre-exam/exam-attendance-sheet/page.tsx
git commit -m "feat(seating): integrate seating arrangement tab into attendance sheet page"
```

---

## Task 9: PDF Generation for Seating Plans

**Files:**
- Create: `lib/utils/generate-seating-plan-pdf.ts`

**Step 1: Create PDF generator**

Uses jsPDF to create room-wise seating charts. Each page shows:
- Institution name + exam date + session (header)
- Room name + building + floor
- Visual grid with Register No + Student Name in cells
- Program color legend at bottom

**Step 2: Wire up PDF download in seating-arrangement-tab.tsx**

Import and call `generateSeatingPlanPDF()` from the handleDownloadPDF function.

**Step 3: Commit**

```
git add lib/utils/generate-seating-plan-pdf.ts components/pre-exam/seating-arrangement-tab.tsx
git commit -m "feat(seating): add PDF generation for seating plans with color-coded grids"
```

---

## Task 10: Final Integration and Testing

**Step 1: Verify the build**

```
npm run build
```

Expected: No TypeScript errors, clean build.

**Step 2: Manual testing checklist**

1. Navigate to `/pre-exam/exam-attendance-sheet`
2. Verify two tabs appear: "Attendance Sheet" and "Seating Arrangement"
3. Select Institution, Session, Date, FN/AN
4. **Attendance Sheet tab:** Verify existing PDF generation still works
5. **Seating Arrangement tab:**
   - Click "Load Students and Rooms" -> verify summary shows
   - Select each strategy -> verify description updates
   - Click "Select Rooms" -> verify room suggestion panel
   - Adjust rooms -> click "Confirm" -> verify grid renders
   - Verify color coding by program
   - Click "Save Allocation" -> verify success toast
   - Click "Download PDF" -> verify PDF saves
   - Click clear (trash icon) -> verify reset
6. Test with multiple programs (common paper scenario)
7. Test strict mode -> check for conflict warnings

**Step 3: Commit all remaining changes**

```
git add .
git commit -m "feat(seating): complete exam seating allocation feature with 4 strategies"
```

---

## Dependencies Between Tasks

```
Task 1 (Types) -----------------------+
                                       +---> Task 3 (Engine)
Task 2 (Utils) -----------------------+          |
                                                  +---> Task 7 (Tab Component)
Task 4 (API Routes) -----------------------------|          |
                                                            +---> Task 8 (Page Integration)
Task 5 (Room Grid) ----------+                              |
                              +---> Task 7 (Tab Component) -+
Task 6 (Room Suggestion) ----+

Task 9 (PDF) <-- depends on Task 7

Task 10 (Testing) <-- depends on all
```

**Parallelizable:**
- Tasks 1 + 2 can run in parallel
- Tasks 4 + 5 + 6 can run in parallel (after 1 + 2)
- Task 9 can run in parallel with Task 8
