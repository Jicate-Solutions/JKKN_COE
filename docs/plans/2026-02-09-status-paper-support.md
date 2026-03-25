# Status Paper Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Extend the existing mark-based result generation system to support status-based papers (Commended, Highly Commended, AAA)

**Architecture:** Unified pipeline with type branching - extend existing `/api/grading/final-marks` route to handle both mark-based and status-based papers by branching on `courses.result_type` field

**Tech Stack:** Next.js 15 API Routes, Supabase PostgreSQL, TypeScript

---

## Prerequisites

**Existing System Components:**
- ✅ `courses.result_type` field exists ('Mark' or 'Status')
- ✅ `courses.exam_type` field exists ('Internal', 'External', 'CIA', 'Regular')
- ✅ `internal_marks.grade` field exists (can store status values)
- ✅ `final_marks.grade` field exists (letter_grade column)
- ✅ `student_backlog` table exists

**What Needs to Be Added:**
- ❌ `external_marks.grade` column (NEW)
- ❌ Status paper logic in final marks generation
- ❌ Validation logic for status papers
- ❌ Semester result logic for mixed papers

---

## Task 1: Database Migration - Add external_marks.grade Column

**Files:**
- Create: `supabase/migrations/20260209120000_add_external_marks_grade.sql`

**Step 1: Create migration file**

```sql
-- Migration: Add grade column to external_marks (marks_entry) table
-- Purpose: Support status-based papers (Commended, Highly Commended, AAA)

-- Add grade column to marks_entry table (external marks)
ALTER TABLE marks_entry
ADD COLUMN IF NOT EXISTS grade VARCHAR(50);

-- Add comment
COMMENT ON COLUMN marks_entry.grade IS 'Grade for status-based papers (Commended, Highly Commended, AAA). NULL for mark-based papers.';

-- Add index for performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_marks_entry_grade
ON marks_entry(grade)
WHERE grade IS NOT NULL;

-- Add check constraint to ensure valid status values (optional but recommended)
ALTER TABLE marks_entry
ADD CONSTRAINT chk_marks_entry_grade_values
CHECK (
  grade IS NULL OR
  grade IN ('Commended', 'Highly Commended', 'AAA')
);
```

**Step 2: Apply migration**

Run:
```bash
# Assuming you have Supabase CLI configured
supabase db push

# OR apply manually via Supabase Dashboard SQL Editor
```

Expected: Migration succeeds, `marks_entry.grade` column added

**Step 3: Verify migration**

Run:
```sql
-- Check column exists
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'marks_entry' AND column_name = 'grade';

-- Check index exists
SELECT indexname FROM pg_indexes
WHERE tablename = 'marks_entry' AND indexname = 'idx_marks_entry_grade';
```

Expected: Column shows `grade | character varying | 50`, index shows

**Step 4: Commit**

```bash
git add supabase/migrations/20260209120000_add_external_marks_grade.sql
git commit -m "feat(db): add grade column to external_marks for status papers

- Add marks_entry.grade column (VARCHAR 50)
- Add index on grade column
- Add check constraint for valid status values
- Support status-based papers (Commended, Highly Commended, AAA)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `types/final-marks.ts:140-158`

**Step 1: Add grade field to ExternalMarkData interface**

In `types/final-marks.ts`, update the `ExternalMarkData` interface:

```typescript
/**
 * ExternalMarkData - External marks fetched from marks_entry table
 */
export interface ExternalMarkData {
	id: string
	exam_registration_id: string
	course_id?: string
	program_id?: string
	examination_session_id?: string
	total_marks_obtained: number
	marks_out_of: number
	percentage?: number
	is_absent?: boolean
	attendance_status?: string
	grade?: string | null  // NEW: Status grade for status-based papers
	// Joined data
	student_id?: string
	student_name?: string
	register_no?: string
	dummy_number?: string
}
```

**Step 2: Add result_type to CourseData interface**

In `types/final-marks.ts`, update the `CourseData` interface:

```typescript
/**
 * CourseData - Course information with marks configuration
 */
export interface CourseData {
	id: string
	course_code: string
	course_title: string
	course_name?: string
	course_type: string
	credits: number
	result_type?: 'Mark' | 'Status'  // NEW: Determines if course uses marks or status
	internal_max_mark: number
	internal_pass_mark: number
	internal_converted_mark: number
	external_max_mark: number
	external_pass_mark: number
	external_converted_mark: number
	total_pass_mark: number
	total_max_mark: number
}
```

**Step 3: Verify types compile**

Run:
```bash
npm run build
```

Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add types/final-marks.ts
git commit -m "feat(types): add grade field to ExternalMarkData and result_type to CourseData

- Add grade?: string | null to ExternalMarkData for status papers
- Add result_type?: 'Mark' | 'Status' to CourseData
- Support status-based grading system

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Extend Final Marks Generation Logic

**Files:**
- Modify: `app/api/grading/final-marks/route.ts:1010-1040` (course details fetch)
- Modify: `app/api/grading/final-marks/route.ts:1199-1492` (result calculation loop)

**Step 1: Update course details query to include result_type**

In `app/api/grading/final-marks/route.ts`, around line 1010, modify the `courseDetails` query:

```typescript
const { data: courseDetails } = await supabase
	.from('courses')
	.select(`
		id,
		course_code,
		course_name,
		course_type,
		credit,
		evaluation_type,
		result_type,  // NEW: Add this field
		internal_max_mark,
		internal_pass_mark,
		internal_converted_mark,
		external_max_mark,
		external_pass_mark,
		external_converted_mark,
		total_max_mark,
		total_pass_mark
	`)
	.in('id', actualCourseIds)
```

**Step 2: Update external marks query to include grade**

Around line 1110, modify the `marks_entry` query:

```typescript
const { data: batchMarks, error: batchError } = await supabase
	.from('marks_entry')
	.select('*, grade')  // Add grade field
	.in('exam_registration_id', batchIds)
```

**Step 3: Add status paper validation and calculation logic**

Insert this code BEFORE the existing result calculation loop (around line 1199):

```typescript
// =========================================================
// STATUS PAPER VALIDATION: Define valid status values
// =========================================================
const VALID_STATUS_GRADES = ['Commended', 'Highly Commended', 'AAA'] as const
type StatusGrade = typeof VALID_STATUS_GRADES[number]

/**
 * Validate status grade value
 */
function isValidStatusGrade(grade: any): grade is StatusGrade {
	return typeof grade === 'string' && VALID_STATUS_GRADES.includes(grade as StatusGrade)
}

/**
 * Get final grade for status-based paper
 */
function getFinalGradeForStatusPaper(
	course: any,
	internalMark: any,
	externalMark: any,
	attendanceRecord: any
): { grade: StatusGrade; isPass: boolean; failReason: 'EXTERNAL' | null } {
	const courseEvalType = course.evaluation_type?.toUpperCase() || ''
	const isCIAOnly = courseEvalType === 'CIA' || courseEvalType === 'CIA ONLY'
	const isExternalOnly = courseEvalType === 'ESE' || courseEvalType === 'ESE ONLY' || courseEvalType === 'EXTERNAL'

	let finalGrade: StatusGrade
	let isPass = true
	let failReason: 'EXTERNAL' | null = null

	// Determine source based on exam_type
	if (isCIAOnly) {
		// Internal-only status paper
		if (!internalMark || !internalMark.grade) {
			throw new Error('Missing internal grade for CIA status paper')
		}
		if (!isValidStatusGrade(internalMark.grade)) {
			throw new Error(`Invalid internal status grade: ${internalMark.grade}`)
		}
		finalGrade = internalMark.grade
	} else if (isExternalOnly) {
		// External-only status paper
		// Check attendance first
		const isAbsent = attendanceRecord?.attendance_status?.toLowerCase() === 'absent'

		if (isAbsent) {
			// Force AAA if absent in attendance
			finalGrade = 'AAA'
			isPass = false
			failReason = 'EXTERNAL'
		} else {
			if (!externalMark || !externalMark.grade) {
				throw new Error('Missing external grade for external status paper')
			}
			if (!isValidStatusGrade(externalMark.grade)) {
				throw new Error(`Invalid external status grade: ${externalMark.grade}`)
			}
			finalGrade = externalMark.grade
		}
	} else {
		throw new Error(`Invalid evaluation_type "${course.evaluation_type}" for status-based paper`)
	}

	// Determine pass/fail based on grade
	if (finalGrade === 'AAA') {
		isPass = false
		failReason = 'EXTERNAL'
	}

	return { grade: finalGrade, isPass, failReason }
}
```

**Step 4: Modify the result calculation loop**

In the main processing loop (around line 1199), add status paper branching BEFORE the existing mark-based logic:

```typescript
for (const examReg of examRegistrations) {
	const courseOffering = (examReg as any).course_offerings
	// ... existing course lookup code ...

	if (!course) {
		skippedNoCourse++
		continue
	}

	const internalKey = `${examReg.student_id}|${course.id}`
	const internalMark = internalMarksMap.get(internalKey)
	const externalMark = externalMarksMap.get(examReg.id)
	const attendanceKey = `${examReg.id}|${course.id}`
	const attendanceRecord = examAttendanceMap.get(attendanceKey)

	// =========================================================
	// TYPE BRANCHING: Handle Status Papers vs Mark Papers
	// =========================================================
	const courseResultType = course.result_type?.toUpperCase() || 'MARK'
	const isStatusPaper = courseResultType === 'STATUS'

	if (isStatusPaper) {
		// =========================================================
		// STATUS PAPER PROCESSING
		// =========================================================
		const courseEvalType = course.evaluation_type?.toUpperCase() || ''
		const isCIAOnly = courseEvalType === 'CIA' || courseEvalType === 'CIA ONLY'

		// Validation: Check required data exists
		if (isCIAOnly) {
			// Internal-only: internal_marks.grade required
			if (!internalMark || !internalMark.grade) {
				summary.skipped_missing_marks++
				skippedRecords.push({
					student_name: examReg.student_name || 'Unknown',
					register_no: examReg.stu_register_no || 'N/A',
					course_code: course.course_code || 'N/A',
					reason: 'Missing internal status grade'
				})
				continue
			}
		} else {
			// External-only: external_marks.grade required + attendance
			if (!attendanceRecord) {
				summary.skipped_no_attendance++
				continue
			}
			if (!externalMark || !externalMark.grade) {
				const isAbsent = attendanceRecord.attendance_status?.toLowerCase() === 'absent'
				if (!isAbsent) {
					// Only skip if present but missing grade (absent gets AAA automatically)
					summary.skipped_missing_marks++
					skippedRecords.push({
						student_name: examReg.student_name || 'Unknown',
						register_no: examReg.stu_register_no || 'N/A',
						course_code: course.course_code || 'N/A',
						reason: 'Missing external status grade'
					})
					continue
				}
			}
		}

		// Calculate final grade
		let finalGrade: StatusGrade
		let isPass: boolean
		let failReason: 'EXTERNAL' | null

		try {
			const result = getFinalGradeForStatusPaper(course, internalMark, externalMark, attendanceRecord)
			finalGrade = result.grade
			isPass = result.isPass
			failReason = result.failReason
		} catch (error) {
			errors.push({
				student_id: examReg.student_id,
				student_name: examReg.student_name || 'Unknown',
				register_no: examReg.stu_register_no || 'N/A',
				course_code: course.course_code || 'N/A',
				error: error instanceof Error ? error.message : 'Failed to calculate status grade'
			})
			continue
		}

		// Determine pass status
		let passStatus: 'Pass' | 'Fail' | 'Reappear' | 'Absent' | 'Withheld' | 'Expelled' = 'Fail'
		if (finalGrade === 'AAA') {
			passStatus = 'Absent'
			summary.absent++
		} else if (isPass) {
			passStatus = 'Pass'
			summary.passed++
		} else {
			passStatus = 'Reappear'
			summary.failed++
			summary.reappear++
		}

		// Create result row for status paper
		const resultRow: StudentResultRow = {
			student_id: examReg.student_id,
			student_name: examReg.student_name || 'Unknown',
			register_no: examReg.stu_register_no || 'N/A',
			exam_registration_id: examReg.id,
			course_offering_id: courseOffering.id,
			course_id: course.id,
			course_code: course.course_code,
			course_name: course.course_name || course.course_code,
			internal_marks: 0,  // NULL for status papers
			internal_max: 0,
			internal_pass_mark: 0,
			external_marks: 0,  // NULL for status papers
			external_max: 0,
			external_pass_mark: 0,
			total_marks: 0,  // NULL for status papers
			total_max: 0,
			total_pass_mark: 0,
			percentage: 0,  // NULL for status papers
			grade: finalGrade,  // Status grade (Commended, Highly Commended, AAA)
			grade_point: 0,  // Status papers don't have grade points
			grade_description: finalGrade,
			credits: course.credit || 0,
			credit_points: 0,  // Status papers don't contribute to GPA
			pass_status: passStatus,
			is_pass: isPass,
			is_absent: finalGrade === 'AAA',
			fail_reason: failReason,
			internal_marks_id: internalMark?.id || null,
			marks_entry_id: externalMark?.id || null
		}

		results.push(resultRow)
		continue  // Skip mark-based processing
	}

	// =========================================================
	// MARK-BASED PAPER PROCESSING (existing logic)
	// =========================================================
	// ... rest of existing code ...
}
```

**Step 5: Test the logic with manual debugging**

Add console logs:
```typescript
console.log(`[Final Marks] Course ${course.course_code}: result_type=${courseResultType}, isStatusPaper=${isStatusPaper}`)
```

Run the API endpoint with test data and verify console output

Expected: Logs show correct branching for status vs mark papers

**Step 6: Commit**

```bash
git add app/api/grading/final-marks/route.ts types/final-marks.ts
git commit -m "feat(api): add status paper support to final marks generation

- Add result_type field to course query
- Add grade field to external marks query
- Implement status paper validation logic
- Add getFinalGradeForStatusPaper() helper function
- Branch on result_type in main processing loop
- Handle Commended, Highly Commended, AAA grades
- Validate internal/external status based on exam_type
- Auto-force AAA if absent in attendance

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Update Database Insert Logic for Status Papers

**Files:**
- Modify: `app/api/grading/final-marks/route.ts:1506-1584` (save to database section)

**Step 1: Modify final_marks insert to handle NULL marks for status papers**

In the save-to-database loop (around line 1516), modify the insertData:

```typescript
if (save_to_db && results.length > 0) {
	for (const result of results) {
		try {
			// For status papers, marks should be NULL
			const isStatusResult = result.total_marks === 0 && result.percentage === 0 &&
				['Commended', 'Highly Commended', 'AAA'].includes(result.grade)

			const insertData = {
				institutions_id,
				examination_session_id,
				exam_registration_id: result.exam_registration_id,
				course_offering_id: result.course_offering_id,
				program_id,
				program_code: programCode,
				course_id: result.course_id,
				student_id: result.student_id,
				internal_marks_id: result.internal_marks_id,
				marks_entry_id: result.marks_entry_id,
				// For status papers, set marks to NULL instead of 0
				internal_marks_obtained: isStatusResult ? null : result.internal_marks,
				internal_marks_maximum: isStatusResult ? null : result.internal_max,
				external_marks_obtained: isStatusResult ? null : result.external_marks,
				external_marks_maximum: isStatusResult ? null : result.external_max,
				total_marks_obtained: isStatusResult ? null : result.total_marks,
				total_marks_maximum: isStatusResult ? null : result.total_max,
				percentage: isStatusResult ? null : result.percentage,
				grace_marks: 0,
				letter_grade: result.grade,  // Will be status grade for status papers
				grade_points: isStatusResult ? null : result.grade_point,
				grade_description: result.grade_description,
				is_pass: result.is_pass,
				pass_status: result.pass_status,
				result_status: 'Pending',
				calculated_by: calculated_by || null,
				calculated_at: new Date().toISOString(),
				is_active: true,
				credit: result.credits,
				total_grade_points: isStatusResult ? null : (result.credits * result.grade_point),
				register_number: result.register_no || null
			}

			const { error: insertError } = await supabase
				.from('final_marks')
				.upsert(insertData, {
					onConflict: 'institutions_id,exam_registration_id,course_offering_id'
				})

			if (insertError) {
				console.error('Error saving final mark:', insertError)
				errors.push({
					student_id: result.student_id,
					student_name: result.student_name,
					register_no: result.register_no,
					course_code: result.course_code,
					error: insertError.message
				})
			} else {
				savedCount++
			}
		} catch (err) {
			// ... existing error handling ...
		}
	}
}
```

**Step 2: Commit**

```bash
git add app/api/grading/final-marks/route.ts
git commit -m "feat(api): handle NULL marks for status papers in database insert

- Detect status results by grade value
- Set marks fields to NULL for status papers
- Set grade_points to NULL for status papers
- Preserve status grade in letter_grade field

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Add Student Backlog Auto-Insert Logic

**Files:**
- Create: `app/api/results/generate-semester-results/route.ts` (if doesn't exist)
- OR Modify: Existing semester result generation route

**Step 1: Create/find semester result generation route**

Search for existing route:
```bash
# Search for semester result route
find app/api -name "*semester*" -o -name "*backlog*"
```

If doesn't exist, create: `app/api/results/generate-semester-results/route.ts`

**Step 2: Implement backlog auto-insert logic**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * POST /api/results/generate-semester-results
 * Generate semester results and auto-insert backlogs for failed/absent courses
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			institutions_id,
			examination_session_id,
			program_id,
			student_ids  // Optional: specific students, or all if not provided
		} = body

		if (!institutions_id || !examination_session_id) {
			return NextResponse.json({
				error: 'Missing required fields: institutions_id, examination_session_id'
			}, { status: 400 })
		}

		// 1. Get all final_marks for this session (mark AND status papers)
		let finalMarksQuery = supabase
			.from('final_marks')
			.select(`
				id,
				student_id,
				course_id,
				course_offering_id,
				examination_session_id,
				pass_status,
				is_pass,
				letter_grade,
				courses:course_id (
					id,
					course_code,
					course_name,
					result_type
				)
			`)
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.eq('is_active', true)

		if (program_id) {
			finalMarksQuery = finalMarksQuery.eq('program_id', program_id)
		}

		if (student_ids && student_ids.length > 0) {
			finalMarksQuery = finalMarksQuery.in('student_id', student_ids)
		}

		const { data: finalMarks, error: finalMarksError } = await finalMarksQuery

		if (finalMarksError) {
			console.error('Error fetching final marks:', finalMarksError)
			return NextResponse.json({ error: 'Failed to fetch final marks' }, { status: 500 })
		}

		// 2. Insert backlogs for failed/absent courses (both mark and status papers)
		const backlogsToInsert: any[] = []
		const failedCourses = (finalMarks || []).filter((fm: any) =>
			!fm.is_pass ||
			fm.pass_status === 'Absent' ||
			fm.pass_status === 'Reappear' ||
			fm.letter_grade === 'AAA'  // Status paper absent
		)

		for (const failedCourse of failedCourses) {
			// Determine backlog type
			let backlogType: 'Fail' | 'Absent' = 'Fail'
			if (failedCourse.pass_status === 'Absent' || failedCourse.letter_grade === 'AAA') {
				backlogType = 'Absent'
			}

			backlogsToInsert.push({
				student_id: failedCourse.student_id,
				course_id: failedCourse.course_id,
				course_offering_id: failedCourse.course_offering_id,
				examination_session_id: failedCourse.examination_session_id,
				institutions_id,
				backlog_type: backlogType,
				status: 'Active',
				is_active: true
			})
		}

		// 3. Upsert backlogs (prevent duplicates)
		let backlogInsertCount = 0
		if (backlogsToInsert.length > 0) {
			const { data: insertedBacklogs, error: backlogError } = await supabase
				.from('student_backlog')
				.upsert(backlogsToInsert, {
					onConflict: 'student_id,course_id,examination_session_id',
					ignoreDuplicates: false
				})
				.select()

			if (backlogError) {
				console.error('Error inserting backlogs:', backlogError)
			} else {
				backlogInsertCount = insertedBacklogs?.length || 0
			}
		}

		// 4. Generate semester results per student
		const studentsMap = new Map<string, any>()
		for (const fm of (finalMarks || [])) {
			if (!studentsMap.has(fm.student_id)) {
				studentsMap.set(fm.student_id, {
					student_id: fm.student_id,
					total_courses: 0,
					courses_passed: 0,
					courses_failed: 0,
					backlogs: 0
				})
			}
			const studentData = studentsMap.get(fm.student_id)
			studentData.total_courses++
			if (fm.is_pass) {
				studentData.courses_passed++
			} else {
				studentData.courses_failed++
				studentData.backlogs++
			}
		}

		const semesterResults: any[] = []
		for (const [studentId, studentData] of studentsMap.entries()) {
			const result = studentData.backlogs > 0 ? 'Fail' : 'Pass'

			semesterResults.push({
				student_id: studentId,
				examination_session_id,
				institutions_id,
				program_id,
				total_courses: studentData.total_courses,
				courses_passed: studentData.courses_passed,
				courses_failed: studentData.courses_failed,
				result,
				is_active: true
			})
		}

		// 5. Save semester results
		let semesterSaveCount = 0
		if (semesterResults.length > 0) {
			const { data: savedResults, error: semesterError } = await supabase
				.from('semester_results')
				.upsert(semesterResults, {
					onConflict: 'student_id,examination_session_id'
				})
				.select()

			if (semesterError) {
				console.error('Error saving semester results:', semesterError)
			} else {
				semesterSaveCount = savedResults?.length || 0
			}
		}

		return NextResponse.json({
			success: true,
			students_processed: studentsMap.size,
			passed: semesterResults.filter(sr => sr.result === 'Pass').length,
			failed: semesterResults.filter(sr => sr.result === 'Fail').length,
			backlogs_created: backlogInsertCount,
			semester_results_saved: semesterSaveCount,
			summary: {
				total_backlogs: backlogsToInsert.length,
				mark_backlogs: backlogsToInsert.filter((b: any) => {
					const fm = finalMarks?.find((f: any) => f.student_id === b.student_id && f.course_id === b.course_id)
					return fm?.courses?.result_type !== 'Status'
				}).length,
				status_backlogs: backlogsToInsert.filter((b: any) => {
					const fm = finalMarks?.find((f: any) => f.student_id === b.student_id && f.course_id === b.course_id)
					return fm?.courses?.result_type === 'Status'
				}).length
			}
		})
	} catch (error) {
		console.error('Semester results API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

**Step 3: Commit**

```bash
git add app/api/results/generate-semester-results/route.ts
git commit -m "feat(api): add semester result generation with backlog auto-insert

- Create POST /api/results/generate-semester-results endpoint
- Auto-insert backlogs for AAA status (status papers)
- Auto-insert backlogs for U/Fail (mark papers)
- Calculate semester result (any backlog = Fail)
- Provide breakdown of mark vs status backlogs

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Add Optional Validation Report Endpoint

**Files:**
- Create: `app/api/results/validation-report/route.ts`

**Step 1: Create validation report endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/results/validation-report
 * Pre-generation validation report for admin
 * Checks if all required data exists before generating final marks
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const supabase = getSupabaseServer()

		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const program_code = searchParams.get('program_code')

		if (!institutions_id || !examination_session_id || !program_code) {
			return NextResponse.json({
				error: 'Missing required parameters: institutions_id, examination_session_id, program_code'
			}, { status: 400 })
		}

		// 1. Get all exam registrations for this session/program
		const { data: examRegs, error: examRegsError } = await supabase
			.from('exam_registrations')
			.select(`
				id,
				student_id,
				student_name,
				stu_register_no,
				course_offering_id,
				course_offerings!inner (
					id,
					course_id,
					courses!inner (
						id,
						course_code,
						course_name,
						result_type,
						evaluation_type
					)
				)
			`)
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.eq('program_code', program_code)
			.range(0, 9999)

		if (examRegsError) {
			console.error('Error fetching exam registrations:', examRegsError)
			return NextResponse.json({ error: 'Failed to fetch exam registrations' }, { status: 500 })
		}

		const missingDataDetails: any[] = []
		let readyCount = 0

		// 2. Validate each registration
		for (const reg of (examRegs || [])) {
			const course = (reg as any).course_offerings?.courses
			if (!course) continue

			const resultType = course.result_type?.toUpperCase() || 'MARK'
			const evalType = course.evaluation_type?.toUpperCase() || ''
			const isStatusPaper = resultType === 'STATUS'
			const isCIAOnly = evalType === 'CIA' || evalType === 'CIA ONLY'
			const isExternalOnly = evalType === 'ESE' || evalType === 'ESE ONLY' || evalType === 'EXTERNAL'

			if (isStatusPaper) {
				// Status paper validation
				if (isCIAOnly) {
					// Check internal_marks.grade
					const { data: internalMark } = await supabase
						.from('internal_marks')
						.select('id, grade')
						.eq('student_id', reg.student_id)
						.eq('course_id', course.id)
						.eq('is_active', true)
						.maybeSingle()

					if (!internalMark || !internalMark.grade) {
						missingDataDetails.push({
							student_name: reg.student_name,
							register_no: reg.stu_register_no,
							course_code: course.course_code,
							course_title: course.course_name,
							result_type: 'Status',
							exam_type: 'Internal',
							issue: 'Missing internal_marks.grade'
						})
					} else {
						readyCount++
					}
				} else if (isExternalOnly) {
					// Check exam_attendance and external_marks.grade
					const { data: attendance } = await supabase
						.from('exam_attendance')
						.select('id, attendance_status')
						.eq('exam_registration_id', reg.id)
						.eq('course_id', course.id)
						.maybeSingle()

					const { data: externalMark } = await supabase
						.from('marks_entry')
						.select('id, grade')
						.eq('exam_registration_id', reg.id)
						.maybeSingle()

					if (!attendance) {
						missingDataDetails.push({
							student_name: reg.student_name,
							register_no: reg.stu_register_no,
							course_code: course.course_code,
							course_title: course.course_name,
							result_type: 'Status',
							exam_type: 'External',
							issue: 'Missing exam_attendance record'
						})
					} else if (!externalMark || !externalMark.grade) {
						const isAbsent = attendance.attendance_status?.toLowerCase() === 'absent'
						if (!isAbsent) {
							// Only flag as missing if present but no grade
							missingDataDetails.push({
								student_name: reg.student_name,
								register_no: reg.stu_register_no,
								course_code: course.course_code,
								course_title: course.course_name,
								result_type: 'Status',
								exam_type: 'External',
								issue: 'Missing external_marks.grade (present in attendance)'
							})
						} else {
							// Absent - will auto-assign AAA
							readyCount++
						}
					} else {
						readyCount++
					}
				}
			} else {
				// Mark-based paper validation (existing logic - simplified here)
				readyCount++  // Placeholder - implement full validation if needed
			}
		}

		return NextResponse.json({
			ready_to_generate: missingDataDetails.length === 0,
			summary: {
				total_students: [...new Set((examRegs || []).map((r: any) => r.student_id))].length,
				total_registrations: examRegs?.length || 0,
				ready: readyCount,
				missing_data: missingDataDetails.length
			},
			missing_data_details: missingDataDetails
		})
	} catch (error) {
		console.error('Validation report API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

**Step 2: Commit**

```bash
git add app/api/results/validation-report/route.ts
git commit -m "feat(api): add pre-generation validation report endpoint

- Create GET /api/results/validation-report
- Validate status paper data completeness
- Check internal_marks.grade for CIA papers
- Check external_marks.grade + attendance for external papers
- Return detailed missing data report

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Manual Testing & Verification

**Files:** None (manual testing)

**Step 1: Prepare test data**

1. Create a test course with `result_type = 'Status'` and `evaluation_type = 'CIA'`
2. Create test exam registrations for this course
3. Insert internal marks with grade values:
   ```sql
   UPDATE internal_marks
   SET grade = 'Commended'
   WHERE student_id = '<test-student-id>' AND course_id = '<test-course-id>';
   ```

**Step 2: Test status paper generation**

```bash
# Call the API
curl -X POST http://localhost:3000/api/grading/final-marks \
  -H "Content-Type: application/json" \
  -d '{
    "institutions_id": "...",
    "program_id": "...",
    "program_code": "BCA",
    "examination_session_id": "...",
    "course_ids": ["<status-course-id>"],
    "regulation_id": "...",
    "grade_system_code": "UG",
    "save_to_db": true
  }'
```

Expected response:
```json
{
  "success": true,
  "results": [
    {
      "grade": "Commended",
      "total_marks": 0,
      "percentage": 0,
      "pass_status": "Pass",
      "is_pass": true
    }
  ]
}
```

**Step 3: Test AAA absent case**

Update marks:
```sql
UPDATE internal_marks
SET grade = 'AAA'
WHERE student_id = '<test-student-id>' AND course_id = '<test-course-id>';
```

Re-run generation, verify:
```json
{
  "results": [
    {
      "grade": "AAA",
      "pass_status": "Absent",
      "is_pass": false
    }
  ]
}
```

**Step 4: Test backlog auto-insert**

```bash
# Generate semester results
curl -X POST http://localhost:3000/api/results/generate-semester-results \
  -H "Content-Type: application/json" \
  -d '{
    "institutions_id": "...",
    "examination_session_id": "..."
  }'
```

Expected:
```json
{
  "success": true,
  "backlogs_created": 1,
  "summary": {
    "status_backlogs": 1
  }
}
```

Verify in database:
```sql
SELECT * FROM student_backlog
WHERE student_id = '<test-student-id>'
AND course_id = '<test-course-id>';
```

Expected: 1 row with `backlog_type = 'Absent'`

**Step 5: Test validation report**

```bash
curl "http://localhost:3000/api/results/validation-report?institutions_id=...&examination_session_id=...&program_code=BCA"
```

Expected:
```json
{
  "ready_to_generate": false,
  "missing_data_details": [
    {
      "student_name": "...",
      "issue": "Missing internal_marks.grade"
    }
  ]
}
```

**Step 6: Verify mixed papers (mark + status)**

1. Create course offerings with both mark and status papers
2. Generate final marks for both
3. Verify semester result calculation handles mixed types

Expected: Any backlog (mark OR status) = semester Fail

**Step 7: Document test results**

Create test report:
```bash
git add docs/testing/status-paper-test-results.md
git commit -m "docs: add status paper manual testing results

- CIA status paper: Commended → Pass ✓
- CIA status paper: AAA → Absent + Backlog ✓
- External status paper: Attendance validation ✓
- Semester result: Mixed papers ✓
- Backlog auto-insert ✓
- Validation report ✓

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Summary of Changes

**Database:**
- ✅ Add `marks_entry.grade` column (VARCHAR 50)
- ✅ Add index + check constraint

**Types:**
- ✅ Add `grade?` to ExternalMarkData
- ✅ Add `result_type?` to CourseData

**API Routes:**
- ✅ Extend `/api/grading/final-marks` POST:
  - Query `result_type` from courses
  - Query `grade` from marks_entry
  - Add status paper validation
  - Branch on `result_type` in processing loop
  - Handle NULL marks for status papers in DB insert
- ✅ Create `/api/results/generate-semester-results` POST:
  - Auto-insert backlogs for AAA
  - Calculate semester result (any backlog = Fail)
- ✅ Create `/api/results/validation-report` GET:
  - Pre-generation validation for status papers

**Testing:**
- ✅ Manual testing with CIA status papers
- ✅ Manual testing with external status papers
- ✅ Manual testing with AAA absent case
- ✅ Manual testing with backlog auto-insert
- ✅ Manual testing with validation report
- ✅ Manual testing with mixed mark + status papers

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-02-09-status-paper-support.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
