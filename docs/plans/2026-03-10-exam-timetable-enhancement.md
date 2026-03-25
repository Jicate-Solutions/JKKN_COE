# Exam Timetable Enhancement - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the `/exam-management/exam-timetable` page with course-code grouping, program-wise/board-wise sorting, auto-save on field change, expandable practical slots, and optional filters.

**Architecture:** The existing page generates courses from course_offerings and displays them in an inline-editable table. We refactor to group rows by `course_code` (so same course across programs = one row), add sorting format options (program-wise/board-wise), replace "Save All" with auto-save per field change, and add expandable sub-rows for practical/project courses that support multiple date+session slots.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase, Shadcn UI, Tailwind CSS

---

## Summary of Changes

| Area | What Changes |
|------|-------------|
| **Types** (`types/exam_timetable.ts`) | Add `CourseGroup`, `PracticalSlot`, `Board`, `SortFormat` |
| **Course Offering API** (`app/api/course-management/course-offering/route.ts`) | Enrich with `board_code`, `board_name`, `board_order`, `course_type` from `courses` + `board` tables |
| **Service** (`services/exam-management/exam_timetable-service.ts`) | Add `fetchBoards()` function |
| **Page** (`app/(coe)/exam-management/exam-timetable/page.tsx`) | Major refactor: grouping, sorting, auto-save, expandable rows |

## Key Data Relationships

```
course_offerings -> courses (via course_code) -> board (via board_code)
courses.course_type = 'Theory' | 'Practical' | 'Project'
courses.board_code -> board.board_code (board.board_order for sorting)
programs.program_order (for program-wise sorting)
```

## Database Facts (No Schema Changes Needed)

- `courses` table already has: `board_id`, `board_code`, `course_type`, `program_code`
- `board` table has: `board_code`, `board_name`, `board_order`
- `programs` table has: `program_order`
- `exam_timetables` already supports multiple entries per course (via `course_offering_id`)

---

## Task 1: Update Types

**Files:**
- Modify: `types/exam_timetable.ts`

**Step 1: Add new interfaces after existing `GeneratedCourseData`**

```typescript
// A group of course_offerings sharing the same course_code
export interface CourseGroup {
	course_code: string
	course_title: string
	course_type: string // from courses table: Theory, Practical, Project, etc.
	board_code: string | null
	board_name: string | null
	board_order: number | null
	program_names: string[]
	program_codes: string[]
	program_order: number // min program_order across all offerings (for sorting)
	semester: number
	regular_count: number
	arrear_count: number
	course_offering_ids: string[]
	existing_timetable_ids: string[]
	is_multi_slot: boolean // true for Practical/Project courses
	// Theory fields (single slot)
	exam_date: string
	session: string
	exam_time: string
	duration_minutes: number
	is_published: boolean
	instructions: string
	// Practical/Project fields (multiple slots)
	slots: PracticalSlot[]
	// UI state
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
```

**Step 2: Commit**

```bash
git add types/exam_timetable.ts
git commit -m "feat: add CourseGroup, PracticalSlot, Board types for timetable enhancement"
```

---

## Task 2: Enrich Course Offering API with Board Data

**Files:**
- Modify: `app/api/course-management/course-offering/route.ts` (lines 72-95)

**Step 1: Expand the courses lookup (replace current Step 2, lines 72-88)**

```typescript
// Step 2: look up course details from courses table by course_code
const courseCodes = [...new Set((offerings || []).map((o: any) => o.course_code).filter(Boolean))] as string[]
const courseDetailsMap = new Map<string, {
	course_name: string
	course_type: string | null
	board_code: string | null
}>()

if (courseCodes.length > 0) {
	const batchSize = 500
	for (let i = 0; i < courseCodes.length; i += batchSize) {
		const batch = courseCodes.slice(i, i + batchSize)
		const { data: cData } = await supabase
			.from('courses')
			.select('course_code, course_name, course_type, board_code')
			.in('course_code', batch)
		;(cData || []).forEach((c: any) => {
			if (c.course_code) {
				courseDetailsMap.set(c.course_code, {
					course_name: c.course_name || '',
					course_type: c.course_type || null,
					board_code: c.board_code || null,
				})
			}
		})
	}
}

// Step 2b: look up board details for courses that have board_code
const boardCodes = [...new Set(
	Array.from(courseDetailsMap.values())
		.map(c => c.board_code)
		.filter(Boolean)
)] as string[]
const boardDetailsMap = new Map<string, { board_name: string; board_order: number | null }>()

if (boardCodes.length > 0) {
	const { data: boardData } = await supabase
		.from('board')
		.select('board_code, board_name, board_order')
		.in('board_code', boardCodes)
	;(boardData || []).forEach((b: any) => {
		if (b.board_code) {
			boardDetailsMap.set(b.board_code, {
				board_name: b.board_name || '',
				board_order: b.board_order ?? null,
			})
		}
	})
}
```

**Step 2: Update the transformation (replace Step 3, lines 90-95)**

```typescript
// Step 3: enrich each offering with course details + board data
const transformedData = (offerings || []).map((item: any) => {
	const courseDetail = courseDetailsMap.get(item.course_code)
	const boardDetail = courseDetail?.board_code
		? boardDetailsMap.get(courseDetail.board_code)
		: null

	return {
		...item,
		course_name: courseDetail?.course_name || null,
		course_title: courseDetail?.course_name || null,
		course_type: courseDetail?.course_type || null,
		board_code: courseDetail?.board_code || null,
		board_name: boardDetail?.board_name || null,
		board_order: boardDetail?.board_order ?? null,
	}
})
```

**Step 3: Commit**

```bash
git add app/api/course-management/course-offering/route.ts
git commit -m "feat: enrich course-offering API with board and course_type data"
```

---

## Task 3: Add fetchBoards to Service Layer

**Files:**
- Modify: `services/exam-management/exam_timetable-service.ts`

**Step 1: Add Board import and fetchBoards function**

```typescript
// Add to imports
import type { ..., Board } from '@/types/exam_timetable'

// Add after fetchSemesters
export async function fetchBoards(institutionCode?: string): Promise<Board[]> {
	const url = institutionCode
		? `/api/master/boards?institution_code=${institutionCode}`
		: '/api/master/boards'
	const response = await fetch(url)
	if (!response.ok) {
		console.error('Error fetching boards:', response.status)
		return []
	}
	return response.json()
}
```

**Step 2: Commit**

```bash
git add services/exam-management/exam_timetable-service.ts
git commit -m "feat: add fetchBoards service function"
```

---

## Task 4: Refactor Page - State & Imports

**Files:**
- Modify: `app/(coe)/exam-management/exam-timetable/page.tsx`

**Step 1: Update imports**

Replace `GeneratedCourseData` with new types:
```typescript
import type {
	ExamTimetable,
	CourseGroup,
	PracticalSlot,
	ExaminationSession,
	Program,
	Semester,
	Institution,
	Board,
	SortFormat,
} from '@/types/exam_timetable'

// Add to service imports
import {
	...,
	fetchBoards as fetchBoardsService,
} from '@/services/exam-management/exam_timetable-service'
```

**Step 2: Replace state declarations**

```typescript
// REMOVE:
// const [generatedCourses, setGeneratedCourses] = useState<GeneratedCourseData[]>([])

// ADD:
const [courseGroups, setCourseGroups] = useState<CourseGroup[]>([])
const [boards, setBoards] = useState<Board[]>([])
const [sortFormat, setSortFormat] = useState<SortFormat>('program-wise')
const [filterProgram, setFilterProgram] = useState<string>('')
const [filterBoard, setFilterBoard] = useState<string>('')
```

**Step 3: Add boards fetch**

```typescript
const fetchBoardsData = async () => {
	try {
		const data = await fetchBoardsService(selectedInstitutionCode || undefined)
		if (isMountedRef.current) setBoards(data)
	} catch (error) {
		console.error('Failed to fetch boards:', error)
	}
}
```

Add `fetchBoardsData()` call in the initial data load `useEffect`.

**Step 4: Commit**

```bash
git add app/(coe)/exam-management/exam-timetable/page.tsx
git commit -m "feat: update page state and imports for course grouping"
```

---

## Task 5: Refactor handleGenerate - Grouping Logic

**Files:**
- Modify: `app/(coe)/exam-management/exam-timetable/page.tsx`

**Step 1: Replace the mapping section in handleGenerate (after fetching courseOfferings, registrations, existingTimetables)**

The core grouping: instead of creating one `GeneratedCourseData` per offering, group into `CourseGroup[]` by `course_code`.

```typescript
// Group offerings by course_code
const groupMap = new Map<string, CourseGroup>()

courseOfferings.forEach((offering: any) => {
	const code = offering.course_code || 'UNKNOWN'
	const programName = offering.programs?.program_name || offering.program_name || 'N/A'
	const programCode = offering.programs?.program_code || offering.program_code || ''
	const progOrder = offering.programs?.program_order ?? offering.programs?.display_order ?? 999
	const sem = offering.course_semester_number || offering.semester || 0

	const regularCount = registrations.filter((reg: any) =>
		reg.course_offering_id === offering.id && reg.exam_type === 'regular'
	).length
	const arrearCount = registrations.filter((reg: any) =>
		reg.course_offering_id === offering.id && reg.exam_type === 'arrear'
	).length

	const existingTimetable = timetableMap.get(offering.id)
	const courseType = offering.course_type || ''
	const isMultiSlot = /practical|project/i.test(courseType)

	if (groupMap.has(code)) {
		const group = groupMap.get(code)!
		if (!group.program_names.includes(programName)) {
			group.program_names.push(programName)
			group.program_codes.push(programCode)
		}
		group.course_offering_ids.push(offering.id)
		group.regular_count += regularCount
		group.arrear_count += arrearCount
		group.program_order = Math.min(group.program_order, progOrder)

		if (existingTimetable) {
			group.existing_timetable_ids.push(existingTimetable.id)
			if (!group.is_multi_slot && !group.exam_date && existingTimetable.exam_date) {
				group.exam_date = existingTimetable.exam_date
				group.session = existingTimetable.session || 'FN'
				group.exam_time = existingTimetable.exam_time || '10:00'
				group.duration_minutes = existingTimetable.duration_minutes || 180
				group.is_published = existingTimetable.is_published || false
				group.instructions = existingTimetable.instructions || ''
			}
			if (group.is_multi_slot) {
				group.slots.push({
					id: existingTimetable.id,
					existing_timetable_id: existingTimetable.id,
					exam_date: existingTimetable.exam_date || '',
					session: existingTimetable.session || 'FN',
					exam_time: existingTimetable.exam_time || '10:00',
					duration_minutes: existingTimetable.duration_minutes || 180,
					batch_capacity: existingTimetable.batch_capacity || null,
					is_published: existingTimetable.is_published || false,
					instructions: existingTimetable.instructions || '',
					saving: false, saveStatus: 'idle', saveError: null,
				})
			}
		}
	} else {
		const slots: PracticalSlot[] = []
		if (isMultiSlot && existingTimetable) {
			slots.push({
				id: existingTimetable.id,
				existing_timetable_id: existingTimetable.id,
				exam_date: existingTimetable.exam_date || '',
				session: existingTimetable.session || 'FN',
				exam_time: existingTimetable.exam_time || '10:00',
				duration_minutes: existingTimetable.duration_minutes || 180,
				batch_capacity: existingTimetable.batch_capacity || null,
				is_published: existingTimetable.is_published || false,
				instructions: existingTimetable.instructions || '',
				saving: false, saveStatus: 'idle', saveError: null,
			})
		}

		groupMap.set(code, {
			course_code: code,
			course_title: offering.course_title || offering.course_name || 'N/A',
			course_type: courseType,
			board_code: offering.board_code || null,
			board_name: offering.board_name || null,
			board_order: offering.board_order ?? null,
			program_names: [programName],
			program_codes: [programCode],
			program_order: progOrder,
			semester: sem,
			regular_count: regularCount,
			arrear_count: arrearCount,
			course_offering_ids: [offering.id],
			existing_timetable_ids: existingTimetable ? [existingTimetable.id] : [],
			is_multi_slot: isMultiSlot,
			exam_date: existingTimetable?.exam_date || '',
			session: existingTimetable?.session || 'FN',
			exam_time: existingTimetable?.exam_time || '10:00',
			duration_minutes: existingTimetable?.duration_minutes || 180,
			is_published: existingTimetable?.is_published || false,
			instructions: existingTimetable?.instructions || '',
			slots,
			saving: false, saveStatus: 'idle', saveError: null, expanded: false,
		})
	}
})

const groups = Array.from(groupMap.values())
if (isMountedRef.current) setCourseGroups(groups)
```

**Step 2: Commit**

```bash
git add app/(coe)/exam-management/exam-timetable/page.tsx
git commit -m "feat: implement course_code grouping in handleGenerate"
```

---

## Task 6: Sorting & Filter Memos

**Files:**
- Modify: `app/(coe)/exam-management/exam-timetable/page.tsx`

**Step 1: Add sorted/filtered groups memo**

```typescript
const sortedGroups = useMemo(() => {
	let filtered = [...courseGroups]

	if (sortFormat === 'program-wise' && filterProgram) {
		filtered = filtered.filter(g => g.program_codes.includes(filterProgram))
	}
	if (sortFormat === 'board-wise' && filterBoard) {
		filtered = filtered.filter(g => g.board_code === filterBoard)
	}

	if (sortFormat === 'program-wise') {
		return filtered.sort((a, b) => {
			const progDiff = (a.program_order || 999) - (b.program_order || 999)
			if (progDiff !== 0) return progDiff
			const semDiff = (a.semester || 0) - (b.semester || 0)
			if (semDiff !== 0) return semDiff
			return a.course_code.localeCompare(b.course_code)
		})
	} else {
		return filtered.sort((a, b) => {
			const boardDiff = (a.board_order ?? 999) - (b.board_order ?? 999)
			if (boardDiff !== 0) return boardDiff
			return a.course_code.localeCompare(b.course_code)
		})
	}
}, [courseGroups, sortFormat, filterProgram, filterBoard])

const availableBoards = useMemo(() => {
	const m = new Map<string, string>()
	courseGroups.forEach(g => { if (g.board_code && g.board_name) m.set(g.board_code, g.board_name) })
	return Array.from(m.entries()).map(([code, name]) => ({ code, name }))
}, [courseGroups])

const availableGroupPrograms = useMemo(() => {
	const m = new Map<string, string>()
	courseGroups.forEach(g => {
		g.program_codes.forEach((code, i) => { if (code) m.set(code, g.program_names[i] || code) })
	})
	return Array.from(m.entries()).map(([code, name]) => ({ code, name }))
}, [courseGroups])
```

**Step 2: Commit**

```bash
git add app/(coe)/exam-management/exam-timetable/page.tsx
git commit -m "feat: add program-wise/board-wise sorting with optional filters"
```

---

## Task 7: Auto-Save Functions

**Files:**
- Modify: `app/(coe)/exam-management/exam-timetable/page.tsx`

**Step 1: Add autoSaveGroup function (for theory courses)**

Saves the same date/session to ALL course_offerings in the group:

```typescript
const autoSaveGroup = async (group: CourseGroup) => {
	if (!group.exam_date) return
	const selectedInstitution = institutions.find(i => i.institution_code === selectedInstitutionCode)
	if (!selectedInstitution || !selectedSessionId) return

	setCourseGroups(prev => prev.map(g =>
		g.course_code === group.course_code
			? { ...g, saving: true, saveStatus: 'saving' as const, saveError: null }
			: g
	))

	try {
		const results = await Promise.all(
			group.course_offering_ids.map(async (offeringId, idx) => {
				const existingId = group.existing_timetable_ids[idx] || null
				const payload: any = {
					institutions_id: selectedInstitution.id,
					examination_session_id: selectedSessionId,
					course_offering_id: offeringId,
					exam_date: group.exam_date,
					session: group.session,
					exam_time: group.exam_time,
					duration_minutes: group.duration_minutes,
					exam_mode: 'Offline',
					is_published: group.is_published,
					instructions: group.instructions || null,
				}
				if (existingId) payload.id = existingId

				const method = existingId ? 'PUT' : 'POST'
				const res = await fetch('/api/exam-management/exam-timetables', {
					method, headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})
				if (!res.ok) {
					const err = await res.json().catch(() => ({}))
					throw new Error(err.error || 'Save failed')
				}
				return res.json()
			})
		)

		setCourseGroups(prev => prev.map(g => {
			if (g.course_code !== group.course_code) return g
			return { ...g, existing_timetable_ids: results.map((r: any) => r.id), saving: false, saveStatus: 'saved' as const, saveError: null }
		}))
		setTimeout(() => {
			setCourseGroups(prev => prev.map(g =>
				g.course_code === group.course_code && g.saveStatus === 'saved'
					? { ...g, saveStatus: 'idle' as const } : g
			))
		}, 2000)
	} catch (error: any) {
		setCourseGroups(prev => prev.map(g =>
			g.course_code === group.course_code
				? { ...g, saving: false, saveStatus: 'error' as const, saveError: error.message } : g
		))
	}
}
```

**Step 2: Add handleGroupFieldChange (triggers auto-save)**

```typescript
const handleGroupFieldChange = (courseCode: string, field: keyof CourseGroup, value: any) => {
	const saveableFields: (keyof CourseGroup)[] = ['exam_date', 'session', 'exam_time', 'duration_minutes', 'is_published', 'instructions']
	const shouldSave = saveableFields.includes(field)

	setCourseGroups(prev => {
		const updated = prev.map(g =>
			g.course_code === courseCode ? { ...g, [field]: value } : g
		)
		if (shouldSave) {
			const group = updated.find(g => g.course_code === courseCode)
			if (group && group.exam_date) {
				setTimeout(() => autoSaveGroup(group), 0)
			}
		}
		return updated
	})
}
```

**Step 3: Add practical slot auto-save + handlers**

```typescript
const autoSaveSlot = async (courseCode: string, slotIndex: number) => {
	const group = courseGroups.find(g => g.course_code === courseCode)
	if (!group?.slots[slotIndex]?.exam_date) return
	const slot = group.slots[slotIndex]
	const selectedInstitution = institutions.find(i => i.institution_code === selectedInstitutionCode)
	if (!selectedInstitution || !selectedSessionId) return

	// Mark slot saving
	setCourseGroups(prev => prev.map(g => {
		if (g.course_code !== courseCode) return g
		const s = [...g.slots]; s[slotIndex] = { ...s[slotIndex], saving: true, saveStatus: 'saving' as const }
		return { ...g, slots: s }
	}))

	try {
		// For practical slots, save to first offering (others share same course_code date)
		const offeringId = group.course_offering_ids[0]
		const payload: any = {
			institutions_id: selectedInstitution.id,
			examination_session_id: selectedSessionId,
			course_offering_id: offeringId,
			exam_date: slot.exam_date, session: slot.session,
			exam_time: slot.exam_time, duration_minutes: slot.duration_minutes,
			exam_mode: 'Offline', is_published: slot.is_published,
			instructions: slot.instructions || null,
			exam_type: 'Practical', batch_capacity: slot.batch_capacity,
		}
		if (slot.existing_timetable_id) payload.id = slot.existing_timetable_id

		const method = slot.existing_timetable_id ? 'PUT' : 'POST'
		const res = await fetch('/api/exam-management/exam-timetables', {
			method, headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		})
		if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Save failed') }
		const result = await res.json()

		setCourseGroups(prev => prev.map(g => {
			if (g.course_code !== courseCode) return g
			const s = [...g.slots]
			s[slotIndex] = { ...s[slotIndex], existing_timetable_id: result.id, saving: false, saveStatus: 'saved' as const, saveError: null }
			return { ...g, slots: s }
		}))
		setTimeout(() => {
			setCourseGroups(prev => prev.map(g => {
				if (g.course_code !== courseCode) return g
				const s = [...g.slots]
				if (s[slotIndex]?.saveStatus === 'saved') s[slotIndex] = { ...s[slotIndex], saveStatus: 'idle' as const }
				return { ...g, slots: s }
			}))
		}, 2000)
	} catch (error: any) {
		setCourseGroups(prev => prev.map(g => {
			if (g.course_code !== courseCode) return g
			const s = [...g.slots]
			s[slotIndex] = { ...s[slotIndex], saving: false, saveStatus: 'error' as const, saveError: error.message }
			return { ...g, slots: s }
		}))
	}
}

const handleSlotFieldChange = (courseCode: string, slotIndex: number, field: keyof PracticalSlot, value: any) => {
	const saveableFields: (keyof PracticalSlot)[] = ['exam_date', 'session', 'exam_time', 'duration_minutes', 'batch_capacity', 'is_published']
	setCourseGroups(prev => prev.map(g => {
		if (g.course_code !== courseCode) return g
		const s = [...g.slots]; s[slotIndex] = { ...s[slotIndex], [field]: value }
		return { ...g, slots: s }
	}))
	if (saveableFields.includes(field)) setTimeout(() => autoSaveSlot(courseCode, slotIndex), 0)
}

const addPracticalSlot = (courseCode: string) => {
	setCourseGroups(prev => prev.map(g => {
		if (g.course_code !== courseCode) return g
		return { ...g, expanded: true, slots: [...g.slots, {
			id: `new-${Date.now()}`, existing_timetable_id: null,
			exam_date: '', session: 'FN', exam_time: '10:00', duration_minutes: 180,
			batch_capacity: null, is_published: false, instructions: '',
			saving: false, saveStatus: 'idle' as const, saveError: null,
		}]}
	}))
}

const removePracticalSlot = async (courseCode: string, slotIndex: number) => {
	const group = courseGroups.find(g => g.course_code === courseCode)
	if (!group) return
	const slot = group.slots[slotIndex]
	if (slot.existing_timetable_id) {
		try { await fetch(`/api/exam-management/exam-timetables?id=${slot.existing_timetable_id}`, { method: 'DELETE' }) }
		catch (e) { console.error('Failed to delete slot:', e) }
	}
	setCourseGroups(prev => prev.map(g => {
		if (g.course_code !== courseCode) return g
		return { ...g, slots: g.slots.filter((_, i) => i !== slotIndex) }
	}))
}

const toggleExpand = (courseCode: string) => {
	setCourseGroups(prev => prev.map(g =>
		g.course_code === courseCode ? { ...g, expanded: !g.expanded } : g
	))
}
```

**Step 4: Commit**

```bash
git add app/(coe)/exam-management/exam-timetable/page.tsx
git commit -m "feat: add auto-save functions for theory groups and practical slots"
```

---

## Task 8: Update JSX - Sort Controls, Grouped Table, Expandable Rows

**Files:**
- Modify: `app/(coe)/exam-management/exam-timetable/page.tsx`

**Step 1: Add sort format + filter dropdowns after the filter section**

Insert after the Generate button grid (after the closing `</div>` of the filter controls `space-y-3 border` div):

```tsx
{courseGroups.length > 0 && (
	<div className="flex items-center gap-3 mt-3 pt-3 border-t">
		<div className="flex items-center gap-2">
			<Label className="text-xs font-medium whitespace-nowrap">Sort by:</Label>
			<Select value={sortFormat} onValueChange={(v) => {
				setSortFormat(v as SortFormat)
				setFilterProgram('')
				setFilterBoard('')
			}}>
				<SelectTrigger className="h-8 text-xs w-[150px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="program-wise" className="text-xs">Program-wise</SelectItem>
					<SelectItem value="board-wise" className="text-xs">Board-wise</SelectItem>
				</SelectContent>
			</Select>
		</div>
		{sortFormat === 'program-wise' && availableGroupPrograms.length > 1 && (
			<div className="flex items-center gap-2">
				<Label className="text-xs font-medium whitespace-nowrap">Filter:</Label>
				<Select value={filterProgram || 'ALL'} onValueChange={(v) => setFilterProgram(v === 'ALL' ? '' : v)}>
					<SelectTrigger className="h-8 text-xs w-[180px]">
						<SelectValue placeholder="All Programs" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="ALL" className="text-xs">All Programs</SelectItem>
						{availableGroupPrograms.map(p => (
							<SelectItem key={p.code} value={p.code} className="text-xs">{p.name}</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		)}
		{sortFormat === 'board-wise' && availableBoards.length > 1 && (
			<div className="flex items-center gap-2">
				<Label className="text-xs font-medium whitespace-nowrap">Filter:</Label>
				<Select value={filterBoard || 'ALL'} onValueChange={(v) => setFilterBoard(v === 'ALL' ? '' : v)}>
					<SelectTrigger className="h-8 text-xs w-[180px]">
						<SelectValue placeholder="All Boards" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="ALL" className="text-xs">All Boards</SelectItem>
						{availableBoards.map(b => (
							<SelectItem key={b.code} value={b.code} className="text-xs">{b.name}</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		)}
	</div>
)}
```

**Step 2: Replace the entire generated courses table section**

Replace the table (from `<div className="rounded-md border overflow-hidden"` through end of `</Table>`) with the new grouped table.

Table header columns:
```
[Expand] [Publish] [Course Code] [Course Name] [Program(s) or Board] [Learners] [Exam Date] [Session] [Time] [Duration] [Status]
```

- For **theory rows**: inline date/session/time/duration inputs + auto-save status icon
- For **practical rows**: show `"X slots [+ Add Slot]"` in the date columns area, with expand icon
- **Expanded practical sub-rows**: show slot details with date/session/time/duration/batch_capacity + delete button + save status

Key JSX patterns:
- Main row keyed by `group.course_code`
- Expand icon: `<ChevronRight>` that rotates 90deg when expanded
- Practical badge: `<Badge variant="outline">Practical</Badge>` next to course code
- Save status: spinning `<RefreshCw>` for saving, green `<CheckCircle>` for saved, red `<AlertTriangle>` for error
- Sub-rows keyed by `${group.course_code}-slot-${slot.id}` with `bg-muted/30` background

**Step 3: Remove "Save All" button from the toolbar**

Remove the Save All button. Keep Template, JSON, Excel, PDF, Upload export buttons.

**Step 4: Update count display and empty state**

Replace `generatedCourses.length` references with `sortedGroups.length` / `courseGroups.length`.

**Step 5: Commit**

```bash
git add app/(coe)/exam-management/exam-timetable/page.tsx
git commit -m "feat: implement grouped table with sort controls, expandable practical rows"
```

---

## Task 9: Update Exports & Imports

**Files:**
- Modify: `app/(coe)/exam-management/exam-timetable/page.tsx`

**Step 1: Add getExportData helper**

Converts `CourseGroup[]` to flat export format:

```typescript
const getExportData = () => {
	return sortedGroups.flatMap(group => {
		if (group.is_multi_slot) {
			return group.slots.map((slot, i) => ({
				course_code: group.course_code,
				course_title: group.course_title,
				program_name: group.program_names.join(', '),
				regular_count: i === 0 ? group.regular_count : 0,
				arrear_count: i === 0 ? group.arrear_count : 0,
				exam_date: slot.exam_date, session: slot.session,
				exam_time: slot.exam_time, duration_minutes: slot.duration_minutes,
				is_published: slot.is_published, instructions: slot.instructions,
				batch_capacity: slot.batch_capacity,
			}))
		}
		return [{
			course_code: group.course_code, course_title: group.course_title,
			program_name: group.program_names.join(', '),
			regular_count: group.regular_count, arrear_count: group.arrear_count,
			exam_date: group.exam_date, session: group.session,
			exam_time: group.exam_time, duration_minutes: group.duration_minutes,
			is_published: group.is_published, instructions: group.instructions,
		}]
	})
}
```

**Step 2: Update export handlers to use `getExportData()`**

**Step 3: Update import handler to match by course_code against courseGroups and trigger auto-save**

**Step 4: Remove old handleCourseFieldChange, handleCheckAll, handleSaveAll functions**

**Step 5: Commit**

```bash
git add app/(coe)/exam-management/exam-timetable/page.tsx
git commit -m "refactor: update exports/imports for course groups, cleanup old functions"
```

---

## Task 10: Verify & Test

**Step 1:** `npm run lint` - fix errors
**Step 2:** `npm run build` - fix type errors
**Step 3: Manual test checklist**

- [ ] Generate courses for an institution + session
- [ ] Verify courses are grouped by course_code (same code = one row)
- [ ] Verify program-wise sort: program_order ASC, semester ASC, course_code ASC
- [ ] Switch to board-wise sort: board_order ASC, course_code ASC
- [ ] Set a date on a theory course - verify auto-save (green check appears)
- [ ] Change session - verify auto-save
- [ ] Practical courses show expand icon and "X slots" indicator
- [ ] Expand practical - verify sub-rows appear
- [ ] Add Slot - verify new empty slot row appears
- [ ] Set date on a practical slot - verify auto-save
- [ ] Set batch_capacity on a practical slot - verify auto-save
- [ ] Remove a slot - verify delete works
- [ ] Optional program filter (program-wise mode)
- [ ] Optional board filter (board-wise mode)
- [ ] Export to Excel - verify grouped data exports correctly
- [ ] Import from Excel - verify fields update and auto-save triggers

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete exam timetable enhancement with grouping, sorting, auto-save, practical slots"
```

---

## Architecture Diagram

```
+-----------------------------------------------------+
| /exam-management/exam-timetable (Enhanced Page)      |
|                                                      |
| +- Filters -----------------------------------------+|
| | Institution > Session > Type > Program > Semester  ||
| | [Generate]                                         ||
| +----------------------------------------------------+|
|                                                      |
| +- Sort & Filter -----------------------------------+|
| | Sort: [Program-wise v]  Filter: [All Programs v]  ||
| +----------------------------------------------------+|
|                                                      |
| +- Grouped Course Table -----------------------------+|
| | [x]| Code    | Name   | Program(s) | Date | Ses  St|
| | [v]| MAT101  | Math I | BCA, MCA   | 3/15 | FN  OK|
| | [v]| ENG101  | Eng I  | BCA        | 3/16 | AN  OK|
| | > | PHY-LAB | Lab    | BCA     [3 slots] [+Add]  |
| |   | Slot 1  | Cap:30 |       | 3/17 | FN      OK |
| |   | Slot 2  | Cap:30 |       | 3/18 | FN      OK |
| |   | Slot 3  | Cap:30 |       | 3/19 | AN      .. |
| +----------------------------------------------------+|
|                                                      |
| Auto-save: Each field change > POST/PUT > OK / ERR   |
+------------------------------------------------------+
```
