import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { PracticalExaminerAssignment, PracticalExaminerCourse } from '@/types/practical-email'
import { fetchMyJKKNStaffById } from '@/services/myjkkn-service'

// Internal working type for grouping (before email status is attached)
interface ExaminerGroup {
	examiner_key: string
	examiner_name: string
	examiner_email: string | null
	examiner_type: 'internal' | 'external' | 'skilled' | 'programmer'
	examiner_designation?: string
	examiner_department?: string
	examiner_institution?: string
	examiner_address?: string
	courses: PracticalExaminerCourse[]
}

// ---------------------------------------------------------------------------
// GET — Fetch all examiner assignments for practical exams, grouped by examiner
// Query params: institutions_id, examination_session_id
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')

		if (!institutionsId) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		if (!examinationSessionId) {
			return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// ------------------------------------------------------------------
		// Step 1: Fetch all published practical timetable entries
		// ------------------------------------------------------------------
		const { data: timetables, error: ttError } = await supabase
			.from('exam_timetables')
			.select('id, exam_date, session, course_id')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', examinationSessionId)
			.eq('exam_type', 'Practical')
			.eq('is_published', true)
			.range(0, 9999)

		if (ttError) {
			console.error('Error fetching practical timetables:', ttError)
			return NextResponse.json({ error: 'Failed to fetch timetables' }, { status: 500 })
		}

		if (!timetables || timetables.length === 0) {
			return NextResponse.json([])
		}

		const timetableIds = timetables.map((t) => t.id)
		const courseIds = [...new Set(timetables.map((t) => t.course_id).filter(Boolean))]

		// ------------------------------------------------------------------
		// Step 2: Parallel fetch — examiner assignments, course details,
		//         student counts
		// ------------------------------------------------------------------
		const [
			{ data: examinerAssignments, error: eaError },
			{ data: courses, error: coursesError },
			{ data: batchStudents, error: bsError },
		] = await Promise.all([
			supabase
				.from('exam_timetable_examiners')
				.select('id, exam_timetable_id, examiner_type, staff_id, staff_name, staff_email, examiner_id, institutions_id')
				.in('exam_timetable_id', timetableIds)
				.range(0, 9999),
			supabase
				.from('courses')
				.select('id, course_code, course_name, board_code')
				.in('id', courseIds),
			supabase
				.from('practical_batch_students')
				.select('exam_timetable_id')
				.in('exam_timetable_id', timetableIds)
				.range(0, 9999),
		])

		if (eaError) {
			console.error('Error fetching examiner assignments:', eaError)
			return NextResponse.json({ error: 'Failed to fetch examiner assignments' }, { status: 500 })
		}

		if (coursesError) {
			console.error('Error fetching courses:', coursesError)
			return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
		}

		if (bsError) {
			console.error('Error fetching batch students:', bsError)
			return NextResponse.json({ error: 'Failed to fetch student counts' }, { status: 500 })
		}

		// ------------------------------------------------------------------
		// Step 3: Build lookup maps
		// ------------------------------------------------------------------

		// Course map: id -> course details
		const courseMap = new Map<string, { course_code: string; course_name: string; board_code: string | null }>()
		for (const c of courses || []) {
			courseMap.set(c.id, {
				course_code: c.course_code || '',
				course_name: c.course_name || '',
				board_code: c.board_code || null,
			})
		}

		// Student count map: timetable_id -> count
		const studentCountMap = new Map<string, number>()
		for (const bs of batchStudents || []) {
			studentCountMap.set(
				bs.exam_timetable_id,
				(studentCountMap.get(bs.exam_timetable_id) || 0) + 1
			)
		}

		// Timetable map: id -> timetable row (with computed batch_no)
		// Sort timetables: exam_date ASC, FN before AN per course
		const sortedTimetables = [...timetables].sort((a, b) => {
			if (a.exam_date !== b.exam_date) return a.exam_date < b.exam_date ? -1 : 1
			const sessionOrder = (s: string) => (s === 'FN' ? 0 : 1)
			return sessionOrder(a.session) - sessionOrder(b.session)
		})

		// Compute batch_no per course (same logic as timetable-rows action)
		const batchCounters = new Map<string, number>()
		const timetableMap = new Map<string, { exam_date: string; session: string; course_id: string; batch_no: number }>()
		for (const row of sortedTimetables) {
			const courseKey = row.course_id
			const batchNo = (batchCounters.get(courseKey) || 0) + 1
			batchCounters.set(courseKey, batchNo)
			timetableMap.set(row.id, {
				exam_date: row.exam_date,
				session: row.session,
				course_id: row.course_id,
				batch_no: batchNo,
			})
		}

		// ------------------------------------------------------------------
		// Step 4: Fetch external examiner details from examiners table
		// ------------------------------------------------------------------
		const externalExaminerIds = [
			...new Set(
				(examinerAssignments || [])
					.filter((ea) => ea.examiner_type === 'external' && ea.examiner_id)
					.map((ea) => ea.examiner_id as string)
			),
		]

		const examinerDetailsMap = new Map<
			string,
			{
				full_name: string
				email: string
				designation: string | null
				department: string | null
				institution_name: string | null
				institution_address: string | null
			}
		>()

		if (externalExaminerIds.length > 0) {
			const { data: examiners, error: exError } = await supabase
				.from('examiners')
				.select('id, full_name, email, designation, department, institution_name, institution_address')
				.in('id', externalExaminerIds)

			if (exError) {
				console.error('Error fetching examiner details:', exError)
			}

			for (const e of examiners || []) {
				examinerDetailsMap.set(e.id, {
					full_name: e.full_name || '',
					email: e.email || '',
					designation: e.designation || null,
					department: e.department || null,
					institution_name: e.institution_name || null,
					institution_address: e.institution_address || null,
				})
			}
		}

		// ------------------------------------------------------------------
		// Step 4b: Fetch internal/skilled staff emails from MyJKKN API
		// ------------------------------------------------------------------
		const internalStaffIds = [
			...new Set(
				(examinerAssignments || [])
					.filter((ea) => (ea.examiner_type === 'internal' || ea.examiner_type === 'skilled') && ea.staff_id)
					.map((ea) => ea.staff_id as string)
			),
		]

		const staffEmailMap = new Map<string, string>()

		if (internalStaffIds.length > 0) {
			// Fetch staff details from MyJKKN in parallel (batch of 10)
			const batchSize = 10
			for (let i = 0; i < internalStaffIds.length; i += batchSize) {
				const batch = internalStaffIds.slice(i, i + batchSize)
				const results = await Promise.allSettled(
					batch.map((id) => fetchMyJKKNStaffById(id))
				)
				for (let j = 0; j < results.length; j++) {
					const result = results[j]
					if (result.status === 'fulfilled' && result.value?.email) {
						staffEmailMap.set(batch[j], result.value.email)
					}
				}
			}
		}

		// ------------------------------------------------------------------
		// Step 5: Fetch board names
		// ------------------------------------------------------------------
		const boardCodes = [...new Set(
			[...courseMap.values()]
				.map((c) => c.board_code)
				.filter((code): code is string => code !== null && code !== '')
		)]

		const boardNameMap = new Map<string, string>()

		if (boardCodes.length > 0) {
			const { data: boards } = await supabase
				.from('board')
				.select('board_code, board_name')
				.in('board_code', boardCodes)

			for (const b of boards || []) {
				boardNameMap.set(b.board_code, b.board_name || b.board_code)
			}
		}

		// ------------------------------------------------------------------
		// Step 6: Group assignments by examiner
		// Key: `${examiner_type}_${staff_id | examiner_id}`
		// ------------------------------------------------------------------

		// Map: examiner_key -> ExaminerGroup
		const examinerGroupMap = new Map<string, ExaminerGroup>()

		for (const ea of examinerAssignments || []) {
			const timetable = timetableMap.get(ea.exam_timetable_id)
			if (!timetable) continue

			const course = courseMap.get(timetable.course_id)
			if (!course) continue

			const examinerType = ea.examiner_type as 'internal' | 'external' | 'skilled' | 'programmer'
			let examinerKey: string
			let examinerName: string
			let examinerEmail: string | null
			let designation: string | undefined
			let department: string | undefined
			let institution: string | undefined
			let address: string | undefined

			if (examinerType === 'external') {
				if (!ea.examiner_id) continue
				examinerKey = `external_${ea.examiner_id}`
				const details = examinerDetailsMap.get(ea.examiner_id)
				examinerName = details?.full_name || ''
				examinerEmail = details?.email || null
				designation = details?.designation ?? undefined
				department = details?.department ?? undefined
				institution = details?.institution_name ?? undefined
				address = details?.institution_address ?? undefined
			} else {
				// internal or skilled — email from MyJKKN API
				if (!ea.staff_id) continue
				examinerKey = `${examinerType}_${ea.staff_id}`
				examinerName = ea.staff_name || ''
				examinerEmail = staffEmailMap.get(ea.staff_id) || ea.staff_email || null
			}

			// Build course entry for this timetable row
			const boardCode = course.board_code
			const programme = boardCode
				? (boardNameMap.get(boardCode) || boardCode)
				: ''

			const courseEntry: PracticalExaminerCourse = {
				timetable_id: ea.exam_timetable_id,
				exam_date: timetable.exam_date,
				session: timetable.session as 'FN' | 'AN',
				programme,
				course_code: course.course_code,
				course_name: course.course_name,
				student_count: studentCountMap.get(ea.exam_timetable_id) || 0,
				batch_no: timetable.batch_no,
			}

			if (examinerGroupMap.has(examinerKey)) {
				examinerGroupMap.get(examinerKey)!.courses.push(courseEntry)
			} else {
				const entry: ExaminerGroup = {
					examiner_key: examinerKey,
					examiner_name: examinerName,
					examiner_email: examinerEmail,
					examiner_type: examinerType,
					courses: [courseEntry],
				}
				if (designation !== undefined) entry.examiner_designation = designation
				if (department !== undefined) entry.examiner_department = department
				if (institution !== undefined) entry.examiner_institution = institution
				if (address !== undefined) entry.examiner_address = address
				examinerGroupMap.set(examinerKey, entry)
			}
		}

		if (examinerGroupMap.size === 0) {
			return NextResponse.json([])
		}

		// Sort courses within each examiner by exam_date ASC, then FN before AN, then batch_no ASC
		for (const entry of examinerGroupMap.values()) {
			entry.courses.sort((a, b) => {
				if (a.exam_date !== b.exam_date) return a.exam_date < b.exam_date ? -1 : 1
				const sessionOrder = (s: string) => (s === 'FN' ? 0 : 1)
				const sessionDiff = sessionOrder(a.session) - sessionOrder(b.session)
				if (sessionDiff !== 0) return sessionDiff
				return a.batch_no - b.batch_no
			})
		}

		// ------------------------------------------------------------------
		// Step 7: Fetch last email status for each examiner
		// For external: query by examiner_id
		// For internal/skilled: query by email_to + examiner_type
		// ------------------------------------------------------------------

		// Collect external examiner UUIDs and internal/skilled emails
		const externalIds = [...examinerGroupMap.values()]
			.filter((e) => e.examiner_type === 'external')
			.map((e) => e.examiner_key.replace('external_', ''))

		// For internal/skilled we look up by email_to + examiner_type since examiner_email_logs.examiner_id
		// is a FK to examiners table (not applicable for staff).
		// We use a separate lookup: email_to (staff_email) + examiner_type column (added in migration).
		const internalSkilledEntries = [...examinerGroupMap.values()].filter(
			(e) => e.examiner_type === 'internal' || e.examiner_type === 'skilled'
		)

		// Fetch email logs in parallel where possible
		const emailStatusMap = new Map<
			string,
			{ last_email_status: 'PENDING' | 'SENT' | 'FAILED' | null; last_email_sent_at: string | null }
		>()

		const logFetches: Promise<void>[] = []

		// External examiner logs — query by examiner_id
		if (externalIds.length > 0) {
			const fetchExternalLogs = supabase
				.from('examiner_email_logs')
				.select('examiner_id, status, sent_at')
				.in('examiner_id', externalIds)
				.order('created_at', { ascending: false })
				.range(0, 9999)
				.then(({ data: logs }) => {
					// Keep only the latest log per examiner_id
					const seenIds = new Set<string>()
					for (const log of logs || []) {
						const key = `external_${log.examiner_id}`
						if (!seenIds.has(log.examiner_id)) {
							seenIds.add(log.examiner_id)
							emailStatusMap.set(key, {
								last_email_status: log.status as 'PENDING' | 'SENT' | 'FAILED' | null,
								last_email_sent_at: log.sent_at || null,
							})
						}
					}
				})
			logFetches.push(fetchExternalLogs)
		}

		// Internal/skilled logs — query by email_to + examiner_type
		// Only fetch if there are internal/skilled examiners with emails
		const internalSkilledWithEmail = internalSkilledEntries.filter((e) => e.examiner_email)

		if (internalSkilledWithEmail.length > 0) {
			const staffEmails = internalSkilledWithEmail.map((e) => e.examiner_email as string)

			const fetchInternalLogs = supabase
				.from('examiner_email_logs')
				.select('email_to, examiner_type, status, sent_at')
				.in('email_to', staffEmails)
				.not('examiner_type', 'is', null)
				.order('created_at', { ascending: false })
				.range(0, 9999)
				.then(({ data: logs }) => {
					// Keep only the latest log per email_to + examiner_type combination
					const seenKeys = new Set<string>()
					for (const log of logs || []) {
						if (!log.examiner_type) continue
						const dedupeKey = `${log.examiner_type}_email_${log.email_to}`
						if (!seenKeys.has(dedupeKey)) {
							seenKeys.add(dedupeKey)
							// Match back to examiner_key by finding the entry
							const matchingEntry = internalSkilledWithEmail.find(
								(e) =>
									e.examiner_email === log.email_to &&
									e.examiner_type === log.examiner_type
							)
							if (matchingEntry) {
								emailStatusMap.set(matchingEntry.examiner_key, {
									last_email_status: log.status as 'PENDING' | 'SENT' | 'FAILED' | null,
									last_email_sent_at: log.sent_at || null,
								})
							}
						}
					}
				})
			logFetches.push(fetchInternalLogs)
		}

		await Promise.all(logFetches)

		// ------------------------------------------------------------------
		// Step 8: Build final response array
		// ------------------------------------------------------------------
		const result: PracticalExaminerAssignment[] = [...examinerGroupMap.values()].map((entry) => {
			const emailStatus = emailStatusMap.get(entry.examiner_key)
			return {
				examiner_key: entry.examiner_key,
				examiner_name: entry.examiner_name,
				examiner_email: entry.examiner_email,
				examiner_type: entry.examiner_type,
				examiner_designation: entry.examiner_designation,
				examiner_department: entry.examiner_department,
				examiner_institution: entry.examiner_institution,
				examiner_address: entry.examiner_address,
				courses: entry.courses,
				last_email_status: emailStatus?.last_email_status ?? null,
				last_email_sent_at: emailStatus?.last_email_sent_at ?? null,
			}
		})

		// Sort result: external first, then internal, then skilled; within type sort by name
		const typeOrder = (t: string) => (t === 'external' ? 0 : t === 'internal' ? 1 : 2)
		result.sort((a, b) => {
			const typeDiff = typeOrder(a.examiner_type) - typeOrder(b.examiner_type)
			if (typeDiff !== 0) return typeDiff
			return (a.examiner_name || '').localeCompare(b.examiner_name || '')
		})

		return NextResponse.json({ examiners: result, logs: [] })
	} catch (error) {
		console.error('Error in GET /api/pre-exam/practical-email/assignments:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}