import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

/**
 * POST /api/v1/cia-marks/sync
 *
 * Receives CIA marks from MyJKKN and upserts them into COE's internal_marks table.
 *
 * Permission required: cia-marks:create
 * Auth: X-API-Key-Id + X-API-Secret headers (Developer Portal)
 *
 * Body: { records: CiaMarkRecord[] }  (max 500 per request)
 *
 * Upsert conflict key: (student_id, course_offering_id, examination_session_id)
 */

// Fields that MyJKKN can send — anything outside this set is stripped
const ALLOWED_FIELDS = new Set([
	'institutions_id',
	'examination_session_id',
	'exam_registration_id',
	'course_offering_id',
	'program_id',
	'course_id',
	'student_id',
	'faculty_id',
	// Component marks
	'assignment_marks',
	'quiz_marks',
	'mid_term_marks',
	'presentation_marks',
	'attendance_marks',
	'lab_marks',
	'project_marks',
	'seminar_marks',
	'viva_marks',
	'other_marks',
	// Test marks
	'test_1_mark',
	'test_2_mark',
	'test_3_mark',
	// Totals
	'total_internal_marks',
	'max_internal_marks',
	// Max per component
	'max_assignment_marks',
	'max_quiz_marks',
	'max_mid_term_marks',
	'max_presentation_marks',
	'max_attendance_marks',
	'max_lab_marks',
	'max_project_marks',
	'max_seminar_marks',
	'max_viva_marks',
	'max_other_marks',
	'max_test_1_mark',
	'max_test_2_mark',
	'max_test_3_mark',
	// Grade (status-based papers)
	'grade',
	// Submission
	'submission_date',
	'submitted_by',
	// Status
	'marks_status',
	'remarks',
])

const REQUIRED_FIELDS = [
	'institutions_id',
	'examination_session_id',
	'exam_registration_id',
	'course_offering_id',
	'program_id',
	'course_id',
	'student_id',
	'total_internal_marks',
	'max_internal_marks',
	'submission_date',
]

interface SyncRecord {
	[key: string]: unknown
}

interface SyncResult {
	index: number
	student_id: string
	course_offering_id: string
	status: 'created' | 'updated' | 'error'
	error?: string
}

export const POST = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const body = await request.json()
	const records: SyncRecord[] = body.records

	// ── Validate body ────────────────────────────────────
	if (!Array.isArray(records) || records.length === 0) {
		return NextResponse.json(
			{ error: 'Request body must contain a non-empty "records" array', request_id: ctx.requestId },
			{ status: 400 },
		)
	}

	if (records.length > 500) {
		return NextResponse.json(
			{ error: 'Maximum 500 records per sync request', request_id: ctx.requestId },
			{ status: 400 },
		)
	}

	// ── Validate each record ─────────────────────────────
	const validRecords: SyncRecord[] = []
	const results: SyncResult[] = []

	for (let i = 0; i < records.length; i++) {
		const raw = records[i]

		// Check required fields
		const missing = REQUIRED_FIELDS.filter(f => raw[f] === undefined || raw[f] === null || raw[f] === '')
		if (missing.length > 0) {
			results.push({
				index: i,
				student_id: String(raw.student_id || ''),
				course_offering_id: String(raw.course_offering_id || ''),
				status: 'error',
				error: `Missing required fields: ${missing.join(', ')}`,
			})
			continue
		}

		// Check institution access
		if (
			ctx.allowedInstitutionIds.length > 0 &&
			!ctx.allowedInstitutionIds.includes(String(raw.institutions_id))
		) {
			results.push({
				index: i,
				student_id: String(raw.student_id),
				course_offering_id: String(raw.course_offering_id),
				status: 'error',
				error: 'Not authorized for this institution',
			})
			continue
		}

		// Validate marks range
		const total = Number(raw.total_internal_marks)
		const max = Number(raw.max_internal_marks)
		if (max <= 0) {
			results.push({
				index: i,
				student_id: String(raw.student_id),
				course_offering_id: String(raw.course_offering_id),
				status: 'error',
				error: 'max_internal_marks must be > 0',
			})
			continue
		}
		if (total < 0 || total > max) {
			results.push({
				index: i,
				student_id: String(raw.student_id),
				course_offering_id: String(raw.course_offering_id),
				status: 'error',
				error: `total_internal_marks (${total}) must be between 0 and ${max}`,
			})
			continue
		}

		// Validate grade if provided
		if (raw.grade && !['Commended', 'Highly Commended', 'AAA'].includes(String(raw.grade))) {
			results.push({
				index: i,
				student_id: String(raw.student_id),
				course_offering_id: String(raw.course_offering_id),
				status: 'error',
				error: 'grade must be one of: Commended, Highly Commended, AAA',
			})
			continue
		}

		// Sanitize: only allow known fields
		const sanitized: SyncRecord = {}
		for (const key of ALLOWED_FIELDS) {
			if (raw[key] !== undefined) {
				sanitized[key] = raw[key]
			}
		}
		validRecords.push(sanitized)
		results.push({
			index: i,
			student_id: String(raw.student_id),
			course_offering_id: String(raw.course_offering_id),
			status: 'created',
		})
	}

	if (validRecords.length === 0) {
		return NextResponse.json(
			{
				error: 'No valid records to sync',
				results,
				synced: 0,
				failed: results.length,
				request_id: ctx.requestId,
			},
			{ status: 400 },
		)
	}

	// ── Upsert into internal_marks ───────────────────────
	const supabase = getSupabaseServer()

	const { data, error } = await supabase
		.from('internal_marks')
		.upsert(
			validRecords as Record<string, unknown>[],
			{
				onConflict: 'student_id,course_offering_id,examination_session_id',
				ignoreDuplicates: false,
			},
		)
		.select('id, student_id, course_offering_id')

	if (error) {
		console.error('[v1/cia-marks/sync] Upsert error:', error)

		// Batch failed — try individual inserts for per-record error reporting
		if (validRecords.length > 1) {
			return await syncIndividually(supabase, validRecords, results, ctx.requestId)
		}

		// Single record failed
		const idx = results.findIndex(r => r.status !== 'error')
		if (idx >= 0) {
			results[idx].status = 'error'
			results[idx].error = mapPgError(error.code, error.message)
		}

		return NextResponse.json(
			{ error: 'Sync failed', results, synced: 0, failed: results.length, request_id: ctx.requestId },
			{ status: 400 },
		)
	}

	// Mark upserted records
	const upsertedIds = new Set((data || []).map((d: { student_id: string }) => d.student_id))
	for (const r of results) {
		if (r.status !== 'error') {
			r.status = upsertedIds.has(r.student_id) ? 'updated' : 'created'
		}
	}

	const synced = results.filter(r => r.status !== 'error').length
	const failed = results.filter(r => r.status === 'error').length

	return NextResponse.json({
		success: true,
		synced,
		failed,
		total: records.length,
		results,
		request_id: ctx.requestId,
	})
})

// ── Helpers ──────────────────────────────────────────

async function syncIndividually(
	supabase: ReturnType<typeof getSupabaseServer>,
	records: SyncRecord[],
	results: SyncResult[],
	requestId: string,
) {
	let successIdx = 0
	for (let i = 0; i < records.length; i++) {
		while (successIdx < results.length && results[successIdx].status === 'error') {
			successIdx++
		}
		if (successIdx >= results.length) break

		const { error } = await supabase
			.from('internal_marks')
			.upsert(records[i] as Record<string, unknown>, {
				onConflict: 'student_id,course_offering_id,examination_session_id',
			})

		if (error) {
			results[successIdx].status = 'error'
			results[successIdx].error = mapPgError(error.code, error.message)
		} else {
			results[successIdx].status = 'updated'
		}
		successIdx++
	}

	const synced = results.filter(r => r.status !== 'error').length
	const failed = results.filter(r => r.status === 'error').length

	return NextResponse.json({
		success: synced > 0,
		synced,
		failed,
		total: results.length,
		results,
		request_id: requestId,
	}, { status: synced > 0 ? 200 : 400 })
}

function mapPgError(code: string, message: string): string {
	switch (code) {
		case '23505': return 'Duplicate record — marks already exist for this learner + course + session'
		case '23503': return `Invalid reference — ${message}`
		case '23514': return `Constraint violation — ${message}`
		case '23502': return `Missing required field — ${message}`
		default: return message
	}
}
