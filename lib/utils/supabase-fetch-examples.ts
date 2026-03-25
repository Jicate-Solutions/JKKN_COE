/**
 * Examples of using the fetchAllRows utility for large datasets
 */

import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllRows, fetchAllRowsWithProgress, streamRows } from './supabase-fetch-all'

// ============================================================================
// EXAMPLE 1: Basic Usage - Fetch all rows from a table
// ============================================================================
export async function getAllStudents() {
	const supabase = getSupabaseServer()

	const students = await fetchAllRows(supabase, 'students', {
		orderBy: 'stu_register_no',
		ascending: true
	})

	console.log(`Fetched ${students.length} students`)
	return students
}

// ============================================================================
// EXAMPLE 2: Fetch with Filters - Only active students
// ============================================================================
export async function getAllActiveStudents() {
	const supabase = getSupabaseServer()

	const activeStudents = await fetchAllRows(supabase, 'students', {
		orderBy: 'stu_register_no',
		ascending: true,
		filters: {
			is_active: true
		}
	})

	console.log(`Fetched ${activeStudents.length} active students`)
	return activeStudents
}

// ============================================================================
// EXAMPLE 3: Select Specific Columns - Reduce data transfer
// ============================================================================
export async function getAllStudentNames() {
	const supabase = getSupabaseServer()

	const students = await fetchAllRows(supabase, 'students', {
		select: 'id, stu_register_no, student_name, email',
		orderBy: 'stu_register_no',
		ascending: true
	})

	console.log(`Fetched ${students.length} student records (name + email only)`)
	return students
}

// ============================================================================
// EXAMPLE 4: Fetch with Progress Tracking (for UI with progress bar)
// ============================================================================
export async function getAllStudentsWithProgress(
	onProgress: (loaded: number, total?: number) => void
) {
	const supabase = getSupabaseServer()

	const students = await fetchAllRowsWithProgress(
		supabase,
		'students',
		onProgress,
		{
			orderBy: 'stu_register_no',
			ascending: true,
			batchSize: 1000 // Fetch 1000 rows at a time
		}
	)

	return students
}

// ============================================================================
// EXAMPLE 5: Stream Processing - Process batches without loading all into memory
// ============================================================================
export async function processAllStudentsInBatches() {
	const supabase = getSupabaseServer()

	let processedCount = 0

	// Stream rows in batches of 1000
	for await (const batch of streamRows(supabase, 'students', {
		orderBy: 'stu_register_no',
		ascending: true,
		batchSize: 1000
	})) {
		// Process each batch
		console.log(`Processing batch of ${batch.length} students...`)

		// Example: Send emails to students in this batch
		// await sendBulkEmails(batch)

		processedCount += batch.length
		console.log(`Processed ${processedCount} students so far...`)
	}

	console.log(`Total students processed: ${processedCount}`)
	return processedCount
}

// ============================================================================
// EXAMPLE 6: Export All Data to CSV
// ============================================================================
export async function exportAllStudentsToCSV() {
	const supabase = getSupabaseServer()

	const students = await fetchAllRows(supabase, 'students', {
		select: 'stu_register_no, student_name, email, phone_number, program_code',
		orderBy: 'stu_register_no',
		ascending: true
	})

	// Convert to CSV
	const headers = ['Register Number', 'Name', 'Email', 'Phone', 'Program']
	const rows = students.map(s => [
		s.stu_register_no,
		s.student_name,
		s.email,
		s.phone_number,
		s.program_code
	])

	const csvContent = [
		headers.join(','),
		...rows.map(r => r.join(','))
	].join('\n')

	return csvContent
}

// ============================================================================
// EXAMPLE 7: Fetch All with Join (Related Data)
// ============================================================================
export async function getAllStudentsWithPrograms() {
	const supabase = getSupabaseServer()

	const students = await fetchAllRows(supabase, 'students', {
		select: `
			id,
			stu_register_no,
			student_name,
			email,
			programs (
				program_code,
				program_name
			)
		`,
		orderBy: 'stu_register_no',
		ascending: true
	})

	console.log(`Fetched ${students.length} students with program details`)
	return students
}

// ============================================================================
// EXAMPLE 8: API Route Example - Fetch all and return as JSON
// ============================================================================
// Use this in app/api/students/all/route.ts
export async function GET_AllStudents() {
	try {
		const supabase = getSupabaseServer()

		const students = await fetchAllRows(supabase, 'students', {
			select: 'id, stu_register_no, student_name, email, program_code',
			orderBy: 'stu_register_no',
			ascending: true,
			filters: {
				is_active: true
			}
		})

		return {
			success: true,
			count: students.length,
			data: students
		}
	} catch (error) {
		console.error('Error fetching all students:', error)
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}
	}
}

// ============================================================================
// EXAMPLE 9: Paginated Fetch for UI Table (Load More Pattern)
// ============================================================================
export async function getStudentsPaginated(page: number, pageSize: number = 50) {
	const supabase = getSupabaseServer()

	const from = page * pageSize
	const to = from + pageSize - 1

	const { data, error, count } = await supabase
		.from('students')
		.select('*', { count: 'exact' })
		.range(from, to)
		.order('stu_register_no', { ascending: true })

	if (error) throw error

	return {
		data,
		count,
		page,
		pageSize,
		totalPages: count ? Math.ceil(count / pageSize) : 0
	}
}

// ============================================================================
// EXAMPLE 10: Fetch Large Dataset for Analytics/Reporting
// ============================================================================
export async function generateAttendanceReport(sessionId: string) {
	const supabase = getSupabaseServer()

	console.log('Generating attendance report...')

	// Fetch all attendance records for the session
	const attendanceRecords = await fetchAllRows(supabase, 'exam_attendance', {
		select: `
			*,
			exam_registrations (
				stu_register_no,
				student_name
			),
			courses (
				course_code,
				course_title
			)
		`,
		orderBy: 'created_at',
		ascending: false,
		filters: {
			examination_session_id: sessionId
		}
	})

	console.log(`Fetched ${attendanceRecords.length} attendance records`)

	// Process the data for reporting
	const summary = {
		total: attendanceRecords.length,
		present: attendanceRecords.filter(r => !r.is_absent).length,
		absent: attendanceRecords.filter(r => r.is_absent).length,
		records: attendanceRecords
	}

	return summary
}
