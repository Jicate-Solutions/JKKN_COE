# Practical Exam Attendance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a batch-wise practical exam attendance entry page under during-exam, and extend the existing attendance correction page to handle practical exams.

**Architecture:** New dedicated page at `/exam-management/practical-attendance` with its own API routes (`/api/exam-management/practical-attendance/`). Reuses the existing `exam_attendance` table (no schema changes). Students are loaded from `practical_batch_students` joined with `exam_registrations`. Simplified cascading filter flow: Institution → Session → Exam Date (today) → Course → Batch.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (PostgreSQL), Shadcn UI, Tailwind CSS

---

## Task 1: Create Type Definitions

**Files:**
- Create: `types/practical-attendance.ts`

**Step 1: Create the types file**

```typescript
// types/practical-attendance.ts

export interface PracticalInstitution {
	id: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids?: string[]
}

export interface PracticalSession {
	id: string
	session_name: string
	session_code: string
	session_type: string
	start_date: string
	end_date: string
}

export interface PracticalCourse {
	course_id: string
	course_code: string
	course_name: string
}

export interface PracticalBatch {
	timetable_id: string
	batch_no: number
	exam_date: string
	session: string        // 'FN' | 'AN'
	exam_time: string | null
	batch_capacity: number
	student_count: number
	attendance_exists: boolean
}

export interface PracticalStudent {
	id: string                    // exam_registration_id
	student_id: string
	stu_register_no: string
	student_name: string
	attempt_number: number
	is_regular: boolean
}

export interface PracticalAttendanceRecord {
	exam_registration_id: string
	student_id: string
	stu_register_no: string
	student_name: string
	attempt_number: number
	is_regular: boolean
	is_present: boolean
	is_absent: boolean
	attendance_status: string     // 'Present' | 'Absent'
	remarks: string
}
```

**Step 2: Commit**

```bash
git add types/practical-attendance.ts
git commit -m "feat: add type definitions for practical attendance"
```

---

## Task 2: Create Cascading Dropdowns API

**Files:**
- Create: `app/api/exam-management/practical-attendance/dropdowns/route.ts`

**Reference files (read before coding):**
- `app/api/exam-management/exam-attendance/dropdowns/route.ts` — existing theory attendance dropdowns (follow same patterns)
- `app/api/pre-exam/batch-allotment/route.ts` — batch listing pattern (action='batches', action='practical-courses')

**Step 1: Create the dropdowns API route**

This route handles 5 dropdown types via `?type=` parameter:

```typescript
// app/api/exam-management/practical-attendance/dropdowns/route.ts

import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const type = searchParams.get('type')
		const institutionId = searchParams.get('institution_id')
		const sessionId = searchParams.get('session_id')
		const examDate = searchParams.get('exam_date')
		const courseId = searchParams.get('course_id')

		// Institution filter params (from useInstitutionFilter hook)
		const filterInstitutionCode = searchParams.get('institution_code')
		const filterInstitutionsId = searchParams.get('institutions_id')

		// 1. Fetch Institutions
		if (type === 'institutions') {
			let query = supabase
				.from('institutions')
				.select('id, institution_code, name, myjkkn_institution_ids')
				.eq('is_active', true)

			if (filterInstitutionCode) {
				query = query.eq('institution_code', filterInstitutionCode)
			} else if (filterInstitutionsId) {
				query = query.eq('id', filterInstitutionsId)
			}

			const { data, error } = await query.order('name', { ascending: true })

			if (error) {
				console.error('Error fetching institutions:', error)
				return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 })
			}

			const mappedData = (data || []).map(inst => ({
				id: inst.id,
				institution_code: inst.institution_code,
				institution_name: inst.name,
				myjkkn_institution_ids: inst.myjkkn_institution_ids || []
			}))

			return NextResponse.json(mappedData)
		}

		// 2. Fetch Examination Sessions (filtered by institution)
		if (type === 'sessions' && institutionId) {
			const { data, error } = await supabase
				.from('examination_sessions')
				.select('id, session_name, session_code, semester_type, exam_start_date, exam_end_date')
				.eq('institutions_id', institutionId)
				.order('exam_start_date', { ascending: false })

			if (error) {
				console.error('Error fetching sessions:', error)
				return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
			}

			const mappedData = (data || []).map(session => ({
				id: session.id,
				session_name: session.session_name,
				session_code: session.session_code,
				session_type: session.semester_type,
				start_date: session.exam_start_date,
				end_date: session.exam_end_date
			}))

			return NextResponse.json(mappedData)
		}

		// 3. Fetch Practical Courses for today
		// Gets courses that have published Practical timetable entries for today's date
		if (type === 'courses' && institutionId && sessionId) {
			const today = new Date().toISOString().split('T')[0]

			// Get all practical timetable entries for today
			const { data: timetables, error: ttError } = await supabase
				.from('exam_timetables')
				.select('course_id')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('exam_type', 'Practical')
				.eq('is_published', true)
				.eq('exam_date', today)

			if (ttError) {
				console.error('Error fetching practical timetables:', ttError)
				return NextResponse.json({ error: 'Failed to fetch timetables' }, { status: 500 })
			}

			if (!timetables || timetables.length === 0) return NextResponse.json([])

			const courseIds = [...new Set(timetables.map((t: any) => t.course_id).filter(Boolean))]
			if (courseIds.length === 0) return NextResponse.json([])

			const { data: courses, error: courseError } = await supabase
				.from('courses')
				.select('id, course_code, course_name')
				.in('id', courseIds)
				.order('course_code', { ascending: true })

			if (courseError) {
				console.error('Error fetching courses:', courseError)
				return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
			}

			const mappedCourses = (courses || []).map(c => ({
				course_id: c.id,
				course_code: c.course_code,
				course_name: c.course_name
			}))

			return NextResponse.json(mappedCourses)
		}

		// 4. Fetch Batches for a course (practical timetable rows for today)
		// Each timetable row = one batch. Returns batch_no (1-indexed), capacity, student count, attendance status.
		if (type === 'batches' && institutionId && sessionId && courseId) {
			const today = new Date().toISOString().split('T')[0]

			// Get practical timetable rows for this course today
			const { data: rows, error } = await supabase
				.from('exam_timetables')
				.select('id, exam_date, session, exam_time, batch_capacity')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('course_id', courseId)
				.eq('exam_type', 'Practical')
				.eq('is_published', true)
				.eq('exam_date', today)

			if (error) {
				console.error('Error fetching practical batches:', error)
				return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 })
			}

			if (!rows || rows.length === 0) return NextResponse.json([])

			// Sort: FN before AN, then by exam_time
			const sorted = [...rows].sort((a: any, b: any) => {
				const sessionOrder = (s: string) => s === 'FN' ? 0 : 1
				const diff = sessionOrder(a.session) - sessionOrder(b.session)
				if (diff !== 0) return diff
				return (a.exam_time || '').localeCompare(b.exam_time || '')
			})

			// Get student counts from practical_batch_students
			const timetableIds = sorted.map((r: any) => r.id)

			const { data: batchStudents } = await supabase
				.from('practical_batch_students')
				.select('exam_timetable_id')
				.in('exam_timetable_id', timetableIds)

			const studentCountMap = new Map<string, number>()
			;(batchStudents || []).forEach((bs: any) => {
				studentCountMap.set(bs.exam_timetable_id, (studentCountMap.get(bs.exam_timetable_id) || 0) + 1)
			})

			// Check which batches already have attendance recorded
			const { data: existingAttendance } = await supabase
				.from('exam_attendance')
				.select('exam_timetable_id')
				.in('exam_timetable_id', timetableIds)

			const attendanceSet = new Set(
				(existingAttendance || []).map((a: any) => a.exam_timetable_id)
			)

			// Build batch list with 1-indexed batch_no
			const batches = sorted.map((row: any, idx: number) => ({
				timetable_id: row.id,
				batch_no: idx + 1,
				exam_date: row.exam_date,
				session: row.session,
				exam_time: row.exam_time,
				batch_capacity: row.batch_capacity || 0,
				student_count: studentCountMap.get(row.id) || 0,
				attendance_exists: attendanceSet.has(row.id)
			}))

			return NextResponse.json(batches)
		}

		return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 })
	} catch (e) {
		console.error('Practical attendance dropdown API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

**Step 2: Commit**

```bash
git add app/api/exam-management/practical-attendance/dropdowns/route.ts
git commit -m "feat: add cascading dropdown API for practical attendance"
```

---

## Task 3: Create Main Practical Attendance API

**Files:**
- Create: `app/api/exam-management/practical-attendance/route.ts`

**Reference files (read before coding):**
- `app/api/exam-management/exam-attendance/route.ts` — existing theory attendance API (follow same patterns)
- `app/api/pre-exam/batch-allotment/route.ts` — batch-assigned-students pattern

**Step 1: Create the main API route**

This route handles:
- `GET ?mode=check&timetable_id=X` — Check if attendance exists for a batch
- `GET ?mode=list&timetable_id=X` — Load students for a batch from `practical_batch_students`
- `POST` — Save attendance records for a batch

```typescript
// app/api/exam-management/practical-attendance/route.ts

import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Check attendance or load student list for a practical batch
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const mode = searchParams.get('mode')       // 'check' or 'list'
		const timetableId = searchParams.get('timetable_id')

		if (!timetableId) {
			return NextResponse.json({ error: 'timetable_id is required' }, { status: 400 })
		}

		// MODE: Check if attendance already exists for this batch
		if (mode === 'check') {
			const { data: attendanceRecords, error } = await supabase
				.from('exam_attendance')
				.select(`
					*,
					exam_registrations!inner(
						stu_register_no,
						student_name,
						attempt_number,
						is_regular
					)
				`)
				.eq('exam_timetable_id', timetableId)
				.order('exam_registrations(stu_register_no)', { ascending: true })

			if (error) {
				console.error('Error checking practical attendance:', error)
				return NextResponse.json({ error: 'Failed to check attendance' }, { status: 500 })
			}

			const mappedRecords = (attendanceRecords || []).map((att: any) => ({
				...att,
				stu_register_no: att.exam_registrations.stu_register_no,
				student_name: att.exam_registrations.student_name,
				attempt_number: att.exam_registrations.attempt_number,
				is_regular: att.exam_registrations.is_regular
			}))

			return NextResponse.json({
				exists: (attendanceRecords && attendanceRecords.length > 0),
				data: mappedRecords
			})
		}

		// MODE: Load students for new attendance entry
		if (mode === 'list') {
			// Step 1: Get students assigned to this batch via practical_batch_students
			const { data: batchStudents, error: batchError } = await supabase
				.from('practical_batch_students')
				.select('exam_registration_id')
				.eq('exam_timetable_id', timetableId)

			if (batchError) {
				console.error('Error fetching batch students:', batchError)
				return NextResponse.json({ error: 'Failed to fetch batch students' }, { status: 500 })
			}

			if (!batchStudents || batchStudents.length === 0) {
				return NextResponse.json({
					error: 'No students assigned to this batch. Please assign students via Batch Allotment first.',
					step: 'practical_batch_students'
				}, { status: 404 })
			}

			const registrationIds = batchStudents.map((bs: any) => bs.exam_registration_id)

			// Step 2: Check if attendance already exists
			const { data: existingAttendance } = await supabase
				.from('exam_attendance')
				.select(`
					*,
					exam_registrations!inner(
						stu_register_no,
						student_name,
						attempt_number,
						is_regular
					)
				`)
				.eq('exam_timetable_id', timetableId)
				.in('exam_registration_id', registrationIds)
				.order('exam_registrations(stu_register_no)', { ascending: true })

			// If attendance exists, return existing records (view mode)
			if (existingAttendance && existingAttendance.length > 0) {
				const mappedRecords = existingAttendance.map((att: any) => ({
					id: att.exam_registration_id,
					student_id: att.student_id,
					stu_register_no: att.exam_registrations.stu_register_no,
					student_name: att.exam_registrations.student_name,
					attempt_number: att.exam_registrations.attempt_number || 1,
					is_regular: att.exam_registrations.is_regular ?? true,
					is_absent: att.is_absent,
					attendance_status: att.attendance_status,
					remarks: att.remarks
				}))
				return NextResponse.json(mappedRecords)
			}

			// Step 3: Get student details from exam_registrations
			const { data: registrations, error: regError } = await supabase
				.from('exam_registrations')
				.select('id, student_id, stu_register_no, student_name, is_regular, attempt_number')
				.in('id', registrationIds)

			if (regError) {
				console.error('Error fetching exam registrations:', regError)
				return NextResponse.json({ error: 'Failed to fetch student details' }, { status: 500 })
			}

			if (!registrations || registrations.length === 0) {
				return NextResponse.json({ error: 'No registration data found for batch students' }, { status: 404 })
			}

			// Sort: is_regular DESC, stu_register_no ASC, attempt_number ASC
			const sorted = [...registrations].sort((a: any, b: any) => {
				const regDiff = (b.is_regular ? 1 : 0) - (a.is_regular ? 1 : 0)
				if (regDiff !== 0) return regDiff
				const rnoDiff = (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
				if (rnoDiff !== 0) return rnoDiff
				return (a.attempt_number || 1) - (b.attempt_number || 1)
			})

			const cleanedData = sorted.map((reg: any) => ({
				id: reg.id,
				student_id: reg.student_id,
				stu_register_no: reg.stu_register_no || '',
				student_name: reg.student_name || '',
				attempt_number: reg.attempt_number || 1,
				is_regular: reg.is_regular ?? true
			}))

			return NextResponse.json(cleanedData)
		}

		return NextResponse.json({ error: 'Invalid mode. Use mode=check or mode=list' }, { status: 400 })
	} catch (e) {
		console.error('Practical attendance GET error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST: Save practical attendance records for a batch
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Validate required fields
		if (!body.institutions_id || !body.examination_session_id || !body.exam_timetable_id || !body.course_id) {
			return NextResponse.json({
				error: 'Required fields: institutions_id, examination_session_id, exam_timetable_id, course_id'
			}, { status: 400 })
		}

		if (!body.attendance_records || !Array.isArray(body.attendance_records) || body.attendance_records.length === 0) {
			return NextResponse.json({ error: 'attendance_records array is required' }, { status: 400 })
		}

		// Verify the timetable is a practical exam
		const { data: timetable, error: ttError } = await supabase
			.from('exam_timetables')
			.select('id, exam_type, exam_date, session')
			.eq('id', body.exam_timetable_id)
			.eq('exam_type', 'Practical')
			.eq('is_published', true)
			.single()

		if (ttError || !timetable) {
			return NextResponse.json({ error: 'Practical exam timetable not found or not published' }, { status: 404 })
		}

		// Check if attendance already exists for this batch
		const { data: existing } = await supabase
			.from('exam_attendance')
			.select('id')
			.eq('exam_timetable_id', body.exam_timetable_id)
			.limit(1)

		if (existing && existing.length > 0) {
			return NextResponse.json({ error: 'Attendance already recorded for this batch. Cannot modify.' }, { status: 400 })
		}

		// Prepare records for insertion
		const attendancePayloads = body.attendance_records.map((record: any) => ({
			institutions_id: body.institutions_id,
			examination_session_id: body.examination_session_id,
			program_code: record.program_code || body.program_code || null,
			course_id: body.course_id,
			exam_timetable_id: body.exam_timetable_id,
			exam_registration_id: record.exam_registration_id,
			student_id: record.student_id,
			attempt_number: record.attempt_number || 1,
			is_regular: record.is_regular ?? true,
			attendance_status: record.is_absent ? 'Absent' : 'Present',
			is_absent: record.is_absent ?? false,
			remarks: record.remarks || null,
			verified_by: body.submitted_by || null,
			created_by: body.submitted_by || null,
		}))

		// Insert all records
		const { data: insertedData, error: insertError } = await supabase
			.from('exam_attendance')
			.insert(attendancePayloads)
			.select()

		if (insertError) {
			console.error('Error inserting practical attendance:', insertError)
			if (insertError.code === '23505') {
				return NextResponse.json({ error: 'Attendance already exists for one or more students.' }, { status: 400 })
			}
			if (insertError.code === '23503') {
				return NextResponse.json({ error: 'Invalid reference: ' + insertError.message }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to save attendance: ' + insertError.message }, { status: 500 })
		}

		const presentCount = body.attendance_records.filter((r: any) => !r.is_absent).length
		const absentCount = body.attendance_records.filter((r: any) => r.is_absent).length

		return NextResponse.json({
			success: true,
			message: `Attendance saved. ${presentCount} present, ${absentCount} absent out of ${body.attendance_records.length} students.`,
			records_saved: insertedData.length
		}, { status: 201 })
	} catch (e) {
		console.error('Practical attendance POST error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

**Step 2: Commit**

```bash
git add app/api/exam-management/practical-attendance/route.ts
git commit -m "feat: add main API route for practical attendance (check/load/save)"
```

---

## Task 4: Create Service Layer

**Files:**
- Create: `services/exam-management/practical-attendance-service.ts`

**Reference files (read before coding):**
- `services/exam-management/exam-attendance-service.ts` — existing service layer (follow same patterns)

**Step 1: Create the service file**

```typescript
// services/exam-management/practical-attendance-service.ts

import type {
	PracticalInstitution,
	PracticalSession,
	PracticalCourse,
	PracticalBatch,
	PracticalStudent,
	PracticalAttendanceRecord,
} from '@/types/practical-attendance'

const BASE = '/api/exam-management/practical-attendance'

export async function fetchPracticalInstitutions(appendToUrl: (url: string) => string): Promise<PracticalInstitution[]> {
	try {
		const url = appendToUrl(`${BASE}/dropdowns?type=institutions`)
		const res = await fetch(url)
		if (res.ok) return await res.json()
		return []
	} catch (error) {
		console.error('Error fetching institutions:', error)
		return []
	}
}

export async function fetchPracticalSessions(institutionId: string): Promise<PracticalSession[]> {
	try {
		const res = await fetch(`${BASE}/dropdowns?type=sessions&institution_id=${institutionId}`)
		if (res.ok) return await res.json()
		return []
	} catch (error) {
		console.error('Error fetching sessions:', error)
		return []
	}
}

export async function fetchPracticalCourses(institutionId: string, sessionId: string): Promise<PracticalCourse[]> {
	try {
		const res = await fetch(`${BASE}/dropdowns?type=courses&institution_id=${institutionId}&session_id=${sessionId}`)
		if (res.ok) return await res.json()
		return []
	} catch (error) {
		console.error('Error fetching practical courses:', error)
		return []
	}
}

export async function fetchPracticalBatches(institutionId: string, sessionId: string, courseId: string): Promise<PracticalBatch[]> {
	try {
		const res = await fetch(`${BASE}/dropdowns?type=batches&institution_id=${institutionId}&session_id=${sessionId}&course_id=${courseId}`)
		if (res.ok) return await res.json()
		return []
	} catch (error) {
		console.error('Error fetching batches:', error)
		return []
	}
}

export async function checkPracticalAttendance(timetableId: string): Promise<{ exists: boolean; data: any[] }> {
	const res = await fetch(`${BASE}?mode=check&timetable_id=${timetableId}`)
	if (!res.ok) throw new Error('Failed to check attendance')
	return await res.json()
}

export async function loadBatchStudents(timetableId: string): Promise<PracticalStudent[]> {
	const res = await fetch(`${BASE}?mode=list&timetable_id=${timetableId}`)
	if (!res.ok) {
		const errorData = await res.json().catch(() => ({ error: 'Failed to load students' }))
		throw new Error(errorData.error || 'Failed to load student list')
	}
	return await res.json()
}

export async function savePracticalAttendance(payload: {
	institutions_id: string
	examination_session_id: string
	exam_timetable_id: string
	course_id: string
	program_code?: string
	submitted_by?: string
	attendance_records: PracticalAttendanceRecord[]
}): Promise<void> {
	const res = await fetch(BASE, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	})

	if (!res.ok) {
		const responseText = await res.text()
		let errorData: any = {}
		try { errorData = JSON.parse(responseText) } catch { errorData = { error: responseText } }
		throw new Error(errorData.error || 'Failed to save attendance')
	}
}
```

**Step 2: Commit**

```bash
git add services/exam-management/practical-attendance-service.ts
git commit -m "feat: add service layer for practical attendance API calls"
```

---

## Task 5: Create Practical Attendance Page

**Files:**
- Create: `app/(coe)/exam-management/practical-attendance/page.tsx`

**Reference files (read before coding):**
- `app/(coe)/exam-management/exam-attendance/page.tsx` — existing theory attendance page (follow same layout, patterns, UI components)
- `types/practical-attendance.ts` — types created in Task 1
- `services/exam-management/practical-attendance-service.ts` — service created in Task 4

**Step 1: Create the page component**

This page follows the same structure as the theory attendance page but with:
- Simplified cascading dropdowns: Institution → Session → Course → Batch (no Program, no FN/AN, no Exam Date — batch encodes these)
- Exam date auto-set to today, shown as read-only info
- Batch dropdown shows: "Batch 1 (FN, 30 students)" format
- Student table loaded from `practical_batch_students`
- View-only mode when attendance already recorded

**Key UI elements:**
- Breadcrumb: Home > During-Exam > Practical Attendance
- 4-column grid for dropdowns (Institution, Session, Course, Batch)
- Header info card: Course name, Batch number, Date, Session, Student count
- Student table: S.No | Register Number | Learner Name | Present (checkbox) | Status (badge) | Remarks (input)
- "Mark All Present" toggle
- Present/Absent counter
- Confirmation dialog before saving
- View-only mode: all inputs disabled, save hidden, toast "Attendance Already Recorded"

```typescript
// app/(coe)/exam-management/practical-attendance/page.tsx

'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/hooks/common/use-toast'
import { Loader2, ClipboardCheck, Users, CheckCircle, XCircle, Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth/auth-context'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'

import type {
	PracticalInstitution,
	PracticalSession,
	PracticalCourse,
	PracticalBatch,
	PracticalStudent,
	PracticalAttendanceRecord,
} from '@/types/practical-attendance'

import {
	fetchPracticalInstitutions,
	fetchPracticalSessions,
	fetchPracticalCourses,
	fetchPracticalBatches,
	loadBatchStudents,
	savePracticalAttendance,
} from '@/services/exam-management/practical-attendance-service'

export default function PracticalAttendancePage() {
	const { toast } = useToast()
	const { user } = useAuth()

	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		contextInstitutionId,
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<PracticalInstitution[]>([])
	const [sessions, setSessions] = useState<PracticalSession[]>([])
	const [courses, setCourses] = useState<PracticalCourse[]>([])
	const [batches, setBatches] = useState<PracticalBatch[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const [selectedSessionId, setSelectedSessionId] = useState('')
	const [selectedCourseId, setSelectedCourseId] = useState('')
	const [selectedBatchId, setSelectedBatchId] = useState('')   // timetable_id

	// Student list and attendance
	const [students, setStudents] = useState<PracticalStudent[]>([])
	const [attendanceRecords, setAttendanceRecords] = useState<PracticalAttendanceRecord[]>([])

	// UI state
	const [loading, setLoading] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [saving, setSaving] = useState(false)
	const [isViewMode, setIsViewMode] = useState(false)
	const [showStudentList, setShowStudentList] = useState(false)
	const [showConfirmDialog, setShowConfirmDialog] = useState(false)

	// Combobox state
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)

	// Search state
	const [institutionSearch, setInstitutionSearch] = useState('')
	const [sessionSearch, setSessionSearch] = useState('')
	const [courseSearch, setCourseSearch] = useState('')

	// Today's date in IST
	const today = new Date().toLocaleDateString('en-IN', {
		timeZone: 'Asia/Kolkata',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	})

	// ─── Load institutions ───
	const loadInstitutions = useCallback(async () => {
		const data = await fetchPracticalInstitutions(appendToUrl)
		setInstitutions(data)
	}, [appendToUrl])

	useEffect(() => {
		if (isReady) loadInstitutions()
	}, [isReady, loadInstitutions])

	// Auto-select institution for normal users
	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId && institutions.length > 0) {
			const exists = institutions.some(inst => inst.id === contextInstitutionId)
			if (exists) setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId, institutions])

	// ─── Cascade 1: Institution → Sessions ───
	useEffect(() => {
		if (selectedInstitutionId) {
			setSelectedSessionId('')
			setSelectedCourseId('')
			setSelectedBatchId('')
			setSessions([])
			setCourses([])
			setBatches([])
			resetStudentState()
			loadSessions(selectedInstitutionId)
		} else {
			clearAll()
		}
	}, [selectedInstitutionId])

	const loadSessions = async (instId: string) => {
		setLoading(true)
		try {
			const data = await fetchPracticalSessions(instId)
			setSessions(data)
		} finally {
			setLoading(false)
		}
	}

	// ─── Cascade 2: Session → Courses (practical, today only) ───
	useEffect(() => {
		if (selectedSessionId && selectedInstitutionId) {
			setSelectedCourseId('')
			setSelectedBatchId('')
			setCourses([])
			setBatches([])
			resetStudentState()
			loadCourses(selectedInstitutionId, selectedSessionId)
		} else if (!selectedSessionId) {
			setSelectedCourseId('')
			setSelectedBatchId('')
			setCourses([])
			setBatches([])
			resetStudentState()
		}
	}, [selectedSessionId])

	const loadCourses = async (instId: string, sessId: string) => {
		setLoading(true)
		try {
			const data = await fetchPracticalCourses(instId, sessId)
			setCourses(data)
		} finally {
			setLoading(false)
		}
	}

	// ─── Cascade 3: Course → Batches ───
	useEffect(() => {
		if (selectedCourseId && selectedSessionId && selectedInstitutionId) {
			setSelectedBatchId('')
			setBatches([])
			resetStudentState()
			loadBatches(selectedInstitutionId, selectedSessionId, selectedCourseId)
		} else if (!selectedCourseId) {
			setSelectedBatchId('')
			setBatches([])
			resetStudentState()
		}
	}, [selectedCourseId])

	const loadBatches = async (instId: string, sessId: string, courseId: string) => {
		setLoading(true)
		try {
			const data = await fetchPracticalBatches(instId, sessId, courseId)
			setBatches(data)
		} finally {
			setLoading(false)
		}
	}

	// ─── Cascade 4: Batch → Students ───
	useEffect(() => {
		if (selectedBatchId) {
			loadStudentsForBatch(selectedBatchId)
		} else {
			resetStudentState()
		}
	}, [selectedBatchId])

	const loadStudentsForBatch = async (timetableId: string) => {
		setLoadingStudents(true)
		setShowStudentList(false)
		setIsViewMode(false)

		try {
			const data = await loadBatchStudents(timetableId)

			// Check if these are existing attendance records (have attendance_status)
			if (data.length > 0 && data[0].attendance_status !== undefined) {
				// View mode — attendance already recorded
				setIsViewMode(true)
				setAttendanceRecords(data.map((s: any) => ({
					exam_registration_id: s.id,
					student_id: s.student_id,
					stu_register_no: s.stu_register_no,
					student_name: s.student_name,
					attempt_number: s.attempt_number || 1,
					is_regular: s.is_regular ?? true,
					is_present: s.attendance_status === 'Present',
					is_absent: s.is_absent ?? s.attendance_status === 'Absent',
					attendance_status: s.attendance_status,
					remarks: s.remarks || '',
				})))
				toast({
					title: 'Attendance Already Recorded',
					description: 'This batch attendance has been saved. Use Attendance Correction to modify.',
					className: 'bg-blue-50 border-blue-200 text-blue-800',
				})
			} else {
				// New attendance — all start as absent
				setStudents(data)
				setAttendanceRecords(data.map((s: any) => ({
					exam_registration_id: s.id,
					student_id: s.student_id,
					stu_register_no: s.stu_register_no,
					student_name: s.student_name,
					attempt_number: s.attempt_number || 1,
					is_regular: s.is_regular ?? true,
					is_present: false,
					is_absent: true,
					attendance_status: 'Absent',
					remarks: '',
				})))
			}
			setShowStudentList(true)
		} catch (error: any) {
			toast({
				title: '❌ Error',
				description: error.message || 'Failed to load students',
				variant: 'destructive',
			})
		} finally {
			setLoadingStudents(false)
		}
	}

	// ─── Attendance toggle handlers ───
	const toggleAttendance = (index: number) => {
		if (isViewMode) return
		setAttendanceRecords(prev => {
			const updated = [...prev]
			updated[index] = {
				...updated[index],
				is_present: !updated[index].is_present,
				is_absent: updated[index].is_present,
				attendance_status: updated[index].is_present ? 'Absent' : 'Present',
			}
			return updated
		})
	}

	const toggleAllPresent = (checked: boolean) => {
		if (isViewMode) return
		setAttendanceRecords(prev => prev.map(r => ({
			...r,
			is_present: checked,
			is_absent: !checked,
			attendance_status: checked ? 'Present' : 'Absent',
		})))
	}

	const updateRemarks = (index: number, remarks: string) => {
		if (isViewMode) return
		setAttendanceRecords(prev => {
			const updated = [...prev]
			updated[index] = { ...updated[index], remarks }
			return updated
		})
	}

	// ─── Save attendance ───
	const handleSave = async () => {
		setShowConfirmDialog(false)
		setSaving(true)

		try {
			const selectedCourse = courses.find(c => c.course_id === selectedCourseId)
			await savePracticalAttendance({
				institutions_id: selectedInstitutionId,
				examination_session_id: selectedSessionId,
				exam_timetable_id: selectedBatchId,
				course_id: selectedCourseId,
				submitted_by: user?.email || undefined,
				attendance_records: attendanceRecords,
			})

			const presentCount = attendanceRecords.filter(r => r.is_present).length
			const absentCount = attendanceRecords.filter(r => r.is_absent).length

			toast({
				title: '✅ Attendance Saved',
				description: `${presentCount} present, ${absentCount} absent out of ${attendanceRecords.length} students`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			// Switch to view mode
			setIsViewMode(true)

			// Update batch list to reflect attendance_exists
			setBatches(prev => prev.map(b =>
				b.timetable_id === selectedBatchId ? { ...b, attendance_exists: true } : b
			))
		} catch (error: any) {
			toast({
				title: '❌ Save Failed',
				description: error.message || 'Failed to save attendance',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}

	// ─── Helper functions ───
	const resetStudentState = () => {
		setStudents([])
		setAttendanceRecords([])
		setShowStudentList(false)
		setIsViewMode(false)
	}

	const clearAll = () => {
		setSelectedSessionId('')
		setSelectedCourseId('')
		setSelectedBatchId('')
		setSessions([])
		setCourses([])
		setBatches([])
		resetStudentState()
	}

	const presentCount = attendanceRecords.filter(r => r.is_present).length
	const absentCount = attendanceRecords.filter(r => r.is_absent).length
	const allPresent = attendanceRecords.length > 0 && attendanceRecords.every(r => r.is_present)
	const selectedBatch = batches.find(b => b.timetable_id === selectedBatchId)
	const selectedCourse = courses.find(c => c.course_id === selectedCourseId)

	// ─── RENDER ───
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader>
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbLink href="#">During-Exam</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>Practical Attendance</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex flex-1 flex-col gap-4 p-4">
					{/* Page Title */}
					<div className="flex items-center gap-2">
						<ClipboardCheck className="h-6 w-6 text-primary" />
						<h1 className="text-2xl font-bold">Practical Exam Attendance</h1>
						<Badge variant="outline" className="ml-2">{today}</Badge>
					</div>

					{/* Filter Dropdowns */}
					<Card>
						<CardContent className="pt-6">
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
								{/* 1. Institution */}
								<div className="space-y-2">
									<Label>Institution</Label>
									<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between" disabled={!mustSelectInstitution && !!contextInstitutionId}>
												{selectedInstitutionId
													? institutions.find(i => i.id === selectedInstitutionId)?.institution_name || 'Select...'
													: 'Select institution...'}
												<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-full p-0" align="start">
											<Command>
												<CommandInput placeholder="Search institution..." value={institutionSearch} onValueChange={setInstitutionSearch} />
												<CommandList>
													<CommandEmpty>No institution found.</CommandEmpty>
													<CommandGroup>
														{institutions.map(inst => (
															<CommandItem key={inst.id} value={inst.institution_name} onSelect={() => {
																setSelectedInstitutionId(inst.id)
																setInstitutionOpen(false)
															}}>
																<Check className={cn('mr-2 h-4 w-4', selectedInstitutionId === inst.id ? 'opacity-100' : 'opacity-0')} />
																{inst.institution_name}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* 2. Session */}
								<div className="space-y-2">
									<Label>Examination Session</Label>
									<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between" disabled={!selectedInstitutionId || sessions.length === 0}>
												{selectedSessionId
													? sessions.find(s => s.id === selectedSessionId)?.session_name || 'Select...'
													: 'Select session...'}
												<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-full p-0" align="start">
											<Command>
												<CommandInput placeholder="Search session..." value={sessionSearch} onValueChange={setSessionSearch} />
												<CommandList>
													<CommandEmpty>No session found.</CommandEmpty>
													<CommandGroup>
														{sessions.map(s => (
															<CommandItem key={s.id} value={s.session_name} onSelect={() => {
																setSelectedSessionId(s.id)
																setSessionOpen(false)
															}}>
																<Check className={cn('mr-2 h-4 w-4', selectedSessionId === s.id ? 'opacity-100' : 'opacity-0')} />
																{s.session_name}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* 3. Course */}
								<div className="space-y-2">
									<Label>Course</Label>
									<Popover open={courseOpen} onOpenChange={setCourseOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between" disabled={!selectedSessionId || courses.length === 0}>
												{selectedCourseId
													? (() => {
														const c = courses.find(c => c.course_id === selectedCourseId)
														return c ? `${c.course_code} - ${c.course_name}` : 'Select...'
													})()
													: 'Select course...'}
												<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-full p-0" align="start">
											<Command>
												<CommandInput placeholder="Search course..." value={courseSearch} onValueChange={setCourseSearch} />
												<CommandList>
													<CommandEmpty>No practical courses for today.</CommandEmpty>
													<CommandGroup>
														{courses.map(c => (
															<CommandItem key={c.course_id} value={`${c.course_code} ${c.course_name}`} onSelect={() => {
																setSelectedCourseId(c.course_id)
																setCourseOpen(false)
															}}>
																<Check className={cn('mr-2 h-4 w-4', selectedCourseId === c.course_id ? 'opacity-100' : 'opacity-0')} />
																{c.course_code} - {c.course_name}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* 4. Batch */}
								<div className="space-y-2">
									<Label>Batch</Label>
									<Select value={selectedBatchId} onValueChange={setSelectedBatchId} disabled={!selectedCourseId || batches.length === 0}>
										<SelectTrigger>
											<SelectValue placeholder="Select batch..." />
										</SelectTrigger>
										<SelectContent>
											{batches.map(b => (
												<SelectItem key={b.timetable_id} value={b.timetable_id}>
													Batch {b.batch_no} ({b.session}, {b.student_count} students)
													{b.attendance_exists ? ' ✓' : ''}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Loading indicator */}
					{(loading || loadingStudents) && (
						<div className="flex items-center justify-center py-8">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							<span className="ml-2 text-muted-foreground">Loading...</span>
						</div>
					)}

					{/* Batch Info + Student Table */}
					{showStudentList && selectedBatch && (
						<>
							{/* Batch Info Card */}
							<Card>
								<CardContent className="pt-6">
									<div className="flex flex-wrap items-center gap-4">
										<div className="flex items-center gap-2">
											<span className="text-sm text-muted-foreground">Course:</span>
											<span className="font-medium">{selectedCourse?.course_code} - {selectedCourse?.course_name}</span>
										</div>
										<Badge variant="outline">Batch {selectedBatch.batch_no}</Badge>
										<Badge variant="outline">{selectedBatch.session}</Badge>
										<Badge variant="outline">{selectedBatch.exam_date}</Badge>
										<div className="flex items-center gap-1">
											<Users className="h-4 w-4 text-muted-foreground" />
											<span className="text-sm">{attendanceRecords.length} students</span>
										</div>
										{isViewMode && (
											<Badge className="bg-blue-100 text-blue-800 border-blue-200">View Only</Badge>
										)}
									</div>
								</CardContent>
							</Card>

							{/* Attendance Controls */}
							{!isViewMode && (
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-4">
										<div className="flex items-center gap-2">
											<Checkbox
												checked={allPresent}
												onCheckedChange={(checked) => toggleAllPresent(!!checked)}
											/>
											<Label className="cursor-pointer">Mark All Present</Label>
										</div>
									</div>
									<div className="flex items-center gap-4">
										<div className="flex items-center gap-1">
											<CheckCircle className="h-4 w-4 text-green-600" />
											<span className="text-sm font-medium text-green-600">{presentCount} Present</span>
										</div>
										<div className="flex items-center gap-1">
											<XCircle className="h-4 w-4 text-red-600" />
											<span className="text-sm font-medium text-red-600">{absentCount} Absent</span>
										</div>
									</div>
								</div>
							)}

							{isViewMode && (
								<div className="flex items-center justify-end gap-4">
									<div className="flex items-center gap-1">
										<CheckCircle className="h-4 w-4 text-green-600" />
										<span className="text-sm font-medium text-green-600">{presentCount} Present</span>
									</div>
									<div className="flex items-center gap-1">
										<XCircle className="h-4 w-4 text-red-600" />
										<span className="text-sm font-medium text-red-600">{absentCount} Absent</span>
									</div>
								</div>
							)}

							{/* Student Table */}
							<Card>
								<CardContent className="p-0">
									<div className="max-h-[60vh] overflow-auto">
										<Table>
											<TableHeader className="sticky top-0 bg-background z-10">
												<TableRow>
													<TableHead className="w-16">S.No</TableHead>
													<TableHead>Register Number</TableHead>
													<TableHead>Learner Name</TableHead>
													<TableHead className="w-20 text-center">Present</TableHead>
													<TableHead className="w-28 text-center">Status</TableHead>
													<TableHead>Remarks</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{attendanceRecords.map((record, index) => (
													<TableRow key={record.exam_registration_id}>
														<TableCell className="text-muted-foreground">{index + 1}</TableCell>
														<TableCell className="font-medium">
															{record.stu_register_no}
															{!record.is_regular && (
																<Badge variant="outline" className="ml-2 text-xs">Supplementary</Badge>
															)}
														</TableCell>
														<TableCell>{record.student_name}</TableCell>
														<TableCell className="text-center">
															<Checkbox
																checked={record.is_present}
																onCheckedChange={() => toggleAttendance(index)}
																disabled={isViewMode}
															/>
														</TableCell>
														<TableCell className="text-center">
															{record.is_present ? (
																<Badge className="bg-green-100 text-green-800 border-green-200">Present</Badge>
															) : (
																<Badge className="bg-red-100 text-red-800 border-red-200">Absent</Badge>
															)}
														</TableCell>
														<TableCell>
															<Input
																value={record.remarks}
																onChange={(e) => updateRemarks(index, e.target.value)}
																placeholder="Optional remarks..."
																disabled={isViewMode}
																className="h-8"
															/>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								</CardContent>
							</Card>

							{/* Save Button */}
							{!isViewMode && (
								<div className="flex justify-end">
									<Button
										onClick={() => setShowConfirmDialog(true)}
										disabled={saving || attendanceRecords.length === 0}
										className="min-w-[200px]"
									>
										{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
										Save Attendance
									</Button>
								</div>
							)}

							{/* Confirmation Dialog */}
							<AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Confirm Attendance</AlertDialogTitle>
										<AlertDialogDescription asChild>
											<div className="space-y-2">
												<p>Are you sure you want to save attendance for this batch?</p>
												<div className="rounded-md bg-muted p-3 space-y-1">
													<p><strong>Course:</strong> {selectedCourse?.course_code} - {selectedCourse?.course_name}</p>
													<p><strong>Batch:</strong> {selectedBatch?.batch_no} ({selectedBatch?.session})</p>
													<p><strong>Date:</strong> {selectedBatch?.exam_date}</p>
													<p className="text-green-700"><strong>Present:</strong> {presentCount}</p>
													<p className="text-red-700"><strong>Absent:</strong> {absentCount}</p>
													<p><strong>Total:</strong> {attendanceRecords.length}</p>
												</div>
												<p className="text-sm text-amber-600 font-medium">Once saved, attendance cannot be modified from this page. Use Attendance Correction for changes.</p>
											</div>
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction onClick={handleSave}>Confirm & Save</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</>
					)}

					{/* Empty state */}
					{!loading && !loadingStudents && !showStudentList && selectedCourseId && batches.length === 0 && (
						<Card>
							<CardContent className="py-8 text-center text-muted-foreground">
								No practical batches found for today. Check if timetable is published and batches are assigned.
							</CardContent>
						</Card>
					)}
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
```

**Step 2: Commit**

```bash
git add "app/(coe)/exam-management/practical-attendance/page.tsx"
git commit -m "feat: add practical attendance page with batch-wise entry UI"
```

---

## Task 6: Add Sidebar Navigation

**Files:**
- Modify: `components/layout/app-sidebar.tsx:236-238`

**Step 1: Add the navigation item**

In the During-Exam section items array, add a new entry for "Practical Attendance" between "Exam Attendance" and "Attendance Correction":

```typescript
// Find this block (lines ~234-239):
items: [
	{ title: "Exam Attendance",        url: "/exam-management/exam-attendance",       icon: ClipboardCheck, roles: [] },
	{ title: "Attendance Correction",  url: "/exam-management/attendance-correction", icon: Edit,           roles: [] },
	{ title: "Exam Rooms",             url: "/exam-management/exam-rooms",            icon: Shapes,         roles: [] },
],

// Change to:
items: [
	{ title: "Exam Attendance",        url: "/exam-management/exam-attendance",          icon: ClipboardCheck, roles: [] },
	{ title: "Practical Attendance",   url: "/exam-management/practical-attendance",     icon: ClipboardCheck, roles: [] },
	{ title: "Attendance Correction",  url: "/exam-management/attendance-correction",    icon: Edit,           roles: [] },
	{ title: "Exam Rooms",             url: "/exam-management/exam-rooms",               icon: Shapes,         roles: [] },
],
```

**Step 2: Commit**

```bash
git add components/layout/app-sidebar.tsx
git commit -m "feat: add Practical Attendance to sidebar navigation"
```

---

## Task 7: Extend Attendance Correction for Practical

**Files:**
- Modify: `app/api/exam-management/attendance-correction/route.ts:83-101`

**Reference files (read before coding):**
- `app/api/exam-management/attendance-correction/route.ts` — current GET handler

**Step 1: Add exam_type and batch info to the GET response**

In the GET handler, after fetching timetable details (line ~83), also fetch `exam_type` and compute batch number if practical:

```typescript
// Current code (line 83-87):
const { data: timetableData } = await supabase
	.from('exam_timetables')
	.select('exam_date, session')
	.eq('id', attendanceData.exam_timetable_id)
	.single()

// Change to:
const { data: timetableData } = await supabase
	.from('exam_timetables')
	.select('exam_date, session, exam_type, course_id')
	.eq('id', attendanceData.exam_timetable_id)
	.single()

// Add batch number lookup for practical exams
let batchInfo: { batch_no: number } | null = null
if (timetableData?.exam_type === 'Practical') {
	// Get all practical timetable rows for this course to compute batch number
	const { data: allBatches } = await supabase
		.from('exam_timetables')
		.select('id, exam_date, session, exam_time')
		.eq('course_id', timetableData.course_id)
		.eq('exam_type', 'Practical')
		.eq('is_published', true)
		.eq('institutions_id', attendanceData.institutions_id || '')

	if (allBatches && allBatches.length > 0) {
		const sorted = [...allBatches].sort((a: any, b: any) => {
			const dateDiff = (a.exam_date || '').localeCompare(b.exam_date || '')
			if (dateDiff !== 0) return dateDiff
			const sessionOrder = (s: string) => s === 'FN' ? 0 : 1
			return sessionOrder(a.session) - sessionOrder(b.session)
		})
		const batchIndex = sorted.findIndex((b: any) => b.id === attendanceData.exam_timetable_id)
		batchInfo = { batch_no: batchIndex + 1 }
	}
}
```

Then update the record object (line ~89-101) to include the new fields:

```typescript
// Current record object:
const record = {
	id: attendanceData.id,
	stu_register_no: registrationData.stu_register_no,
	// ... existing fields ...
	updated_by: attendanceData.updated_by || null
}

// Add these fields to the record:
const record = {
	// ... all existing fields ...
	exam_type: timetableData?.exam_type || 'Theory',
	batch_no: batchInfo?.batch_no || null,
}
```

**Step 2: Commit**

```bash
git add app/api/exam-management/attendance-correction/route.ts
git commit -m "feat: include exam_type and batch info in attendance correction API response"
```

---

## Task 8: Update Attendance Correction Page UI

**Files:**
- Modify: `app/(coe)/exam-management/attendance-correction/page.tsx`

**Step 1: Add batch badge display**

In the learner information card section of the page, add a conditional badge showing "Practical - Batch X" when the record's `exam_type` is 'Practical'. Search for where `exam_date` or `session` is displayed in the learner info card and add:

```tsx
{record.exam_type === 'Practical' && record.batch_no && (
	<Badge className="bg-purple-100 text-purple-800 border-purple-200">
		Practical - Batch {record.batch_no}
	</Badge>
)}
```

This is a minor UI enhancement — the exact insertion point depends on the page layout. Find the learner info display section and add the badge there.

**Step 2: Commit**

```bash
git add "app/(coe)/exam-management/attendance-correction/page.tsx"
git commit -m "feat: show Practical batch badge in attendance correction page"
```

---

## Task 9: Manual Testing Checklist

**No code changes — verify the feature end-to-end.**

Run: `npm run dev`

**Test scenarios:**

1. **Normal user flow:**
   - Navigate to During-Exam → Practical Attendance
   - Verify institution auto-fills
   - Select session → verify only practical courses for today appear
   - Select course → verify batches load with student counts
   - Select batch → verify students load from practical_batch_students
   - Mark some present, some absent, add remarks
   - Click Save → confirm dialog → verify success toast
   - Re-select same batch → verify view-only mode with blue toast

2. **Super admin flow:**
   - Verify institution dropdown is selectable
   - Select different institutions, verify cascading resets

3. **Edge cases:**
   - No practical exams today → verify "No practical batches" message
   - Batch with no students assigned → verify error message
   - Already recorded batch → verify view-only mode and checkmark in batch dropdown

4. **Attendance correction:**
   - Search a student from a practical exam → verify "Practical - Batch X" badge shows
   - Correct attendance → verify it works the same as theory

**Step 1: Start dev server and test**

```bash
npm run dev
```

Open http://localhost:3000 and run through the test scenarios above.

**Step 2: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address feedback from manual testing"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Type definitions | `types/practical-attendance.ts` |
| 2 | Cascading dropdowns API | `app/api/exam-management/practical-attendance/dropdowns/route.ts` |
| 3 | Main attendance API (check/load/save) | `app/api/exam-management/practical-attendance/route.ts` |
| 4 | Service layer | `services/exam-management/practical-attendance-service.ts` |
| 5 | Page component (full UI) | `app/(coe)/exam-management/practical-attendance/page.tsx` |
| 6 | Sidebar navigation | `components/layout/app-sidebar.tsx` |
| 7 | Correction API extension | `app/api/exam-management/attendance-correction/route.ts` |
| 8 | Correction page badge | `app/(coe)/exam-management/attendance-correction/page.tsx` |
| 9 | Manual testing | No files — verify in browser |
