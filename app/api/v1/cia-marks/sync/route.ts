import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

/**
 * POST /api/v1/cia-marks/sync
 *
 * Receives CIA marks from MyJKKN and upserts them into COE's cia_marks table.
 * Auto-resolves program_id and course_id from course_offering_id.
 *
 * Permission required: cia-marks:create
 * Auth: X-API-Key-Id + X-API-Secret headers (Developer Portal)
 *
 * Body: { records: CiaMarkRecord[] }  (max 500 per request)
 *
 * Upsert conflict key: (student_id, course_offering_id, examination_session_id, cia_round)
 *
 * MyJKKN sends: institutions_id, examination_session_id, course_offering_id,
 *               student_id, exam_registration_id, cia_round, marks, totals
 * COE resolves: program_id, course_id (from course_offerings table)
 */

// Fields that MyJKKN can send — anything outside this set is stripped
const ALLOWED_FIELDS = new Set([
	'institutions_id',
	'examination_session_id',
	'exam_registration_id',
	'course_offering_id',
	'student_id',
	'faculty_id',
	'cia_round',
	// Component marks
	'assignment_marks', 'quiz_marks', 'mid_term_marks', 'presentation_marks',
	'attendance_marks', 'lab_marks', 'project_marks', 'seminar_marks',
	'viva_marks', 'other_marks',
	// Test marks
	'test_1_mark', 'test_2_mark', 'test_3_mark',
	// Max per component
	'max_assignment_marks', 'max_quiz_marks', 'max_mid_term_marks', 'max_presentation_marks',
	'max_attendance_marks', 'max_lab_marks', 'max_project_marks', 'max_seminar_marks',
	'max_viva_marks', 'max_other_marks',
	'max_test_1_mark', 'max_test_2_mark', 'max_test_3_mark',
	// Totals
	'total_internal_marks', 'max_internal_marks',
	// End-user-defined components (Option C — JSONB keyed by component code,
	// e.g. {"ai_tools": 8, "interactive_mode": 5}). Mirrors extra_marks_max.
	'extra_marks', 'extra_marks_max',
	// Grade
	'grade',
	// Submission
	'submission_date',
	// Status
	'marks_status', 'remarks',
	// Audit (UUID FK → users.id; normalized in handler, never trust raw input)
	'created_by', 'submitted_by', 'updated_by',
])

// Required fields — program_id and course_id are NOT required (auto-resolved)
const REQUIRED_FIELDS = [
	'institutions_id',
	'examination_session_id',
	'course_offering_id',
	'student_id',
]

// Component mark field names — used to check if a record actually contains marks
const COMPONENT_MARK_FIELDS = [
	'assignment_marks', 'quiz_marks', 'mid_term_marks', 'presentation_marks',
	'attendance_marks', 'lab_marks', 'project_marks', 'seminar_marks',
	'viva_marks', 'other_marks',
	'test_1_mark', 'test_2_mark', 'test_3_mark',
] as const

/**
 * Checks if a record contains at least one actual mark > 0.
 * Used by Layer 4 validation to reject empty mark submissions.
 * A record is considered "empty" if:
 *   - All 13 component mark fields are null/undefined/0
 *   - AND total_internal_marks is also null/undefined/0
 * We accept total-only records (e.g., attendance aggregations) to stay flexible.
 */
function hasAnyMark(record: SyncRecord): boolean {
	for (const field of COMPONENT_MARK_FIELDS) {
		const val = record[field]
		if (val !== undefined && val !== null && Number(val) > 0) return true
	}
	// Allow total-only submissions (caller computed aggregate externally)
	const total = Number(record.total_internal_marks)
	if (!isNaN(total) && total > 0) return true
	// Accept extra_marks too — for end-user-defined components
	const extra = record.extra_marks
	if (extra && typeof extra === 'object') {
		for (const v of Object.values(extra as Record<string, unknown>)) {
			if (v !== undefined && v !== null && Number(v) > 0) return true
		}
	}
	return false
}

interface SyncRecord { [key: string]: unknown }
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

	// ── Validate body ──
	if (!Array.isArray(records) || records.length === 0) {
		return NextResponse.json({ error: 'Request body must contain a non-empty "records" array', request_id: ctx.requestId }, { status: 400 })
	}
	if (records.length > 500) {
		return NextResponse.json({ error: 'Maximum 500 records per sync request', request_id: ctx.requestId }, { status: 400 })
	}

	const supabase = getSupabaseServer()

	// ── Audit identity ──
	// MyJKKN must pass the logged-in user's UUID (from their session) in the request
	// body for each record: created_by / submitted_by / updated_by.
	// COE preserves the value if it's a valid UUID, otherwise writes NULL.
	// We deliberately do NOT fall back to a system user — that would mis-attribute
	// every action to one person. NULL is honest; a wrong UUID is not.
	const resolveAuditUser = (callerValue: unknown): string | null => {
		return isUuid(callerValue) ? callerValue : null
	}

	// ── Resolve program_id + course_id from course_offerings (batch) ──
	const uniqueCOIds = [...new Set(records.map(r => String(r.course_offering_id)).filter(Boolean))]
	const { data: offerings } = await supabase
		.from('course_offerings')
		.select('id, course_id, program_id')
		.in('id', uniqueCOIds)

	const offeringMap = new Map<string, { course_id: string, program_id: string }>()
	for (const o of (offerings || [])) {
		offeringMap.set(o.id, { course_id: o.course_id, program_id: o.program_id })
	}

	// ── Validate each record ──
	const validRecords: SyncRecord[] = []
	const results: SyncResult[] = []

	for (let i = 0; i < records.length; i++) {
		const raw = records[i]

		// Check required fields
		const missing = REQUIRED_FIELDS.filter(f => raw[f] === undefined || raw[f] === null || raw[f] === '')
		if (missing.length > 0) {
			results.push({ index: i, student_id: String(raw.student_id || ''), course_offering_id: String(raw.course_offering_id || ''), status: 'error', error: `Missing required fields: ${missing.join(', ')}` })
			continue
		}

		// Check institution access
		if (ctx.allowedInstitutionIds.length > 0 && !ctx.allowedInstitutionIds.includes(String(raw.institutions_id))) {
			results.push({ index: i, student_id: String(raw.student_id), course_offering_id: String(raw.course_offering_id), status: 'error', error: 'Not authorized for this institution' })
			continue
		}

		// Resolve program_id + course_id from course_offering
		const coId = String(raw.course_offering_id)
		const resolved = offeringMap.get(coId)
		if (!resolved) {
			results.push({ index: i, student_id: String(raw.student_id), course_offering_id: coId, status: 'error', error: `course_offering_id "${coId}" not found` })
			continue
		}

		// Validate marks range (if totals provided)
		if (raw.total_internal_marks !== undefined && raw.max_internal_marks !== undefined) {
			const total = Number(raw.total_internal_marks)
			const max = Number(raw.max_internal_marks)
			if (max > 0 && (total < 0 || total > max)) {
				results.push({ index: i, student_id: String(raw.student_id), course_offering_id: coId, status: 'error', error: `total_internal_marks (${total}) must be between 0 and ${max}` })
				continue
			}
		}

		// Layer 4: Reject records with no actual marks — prevents empty submissions
		// leaking through when client-side guards (button disabled, dialog handler) fail.
		if (!hasAnyMark(raw)) {
			results.push({
				index: i,
				student_id: String(raw.student_id),
				course_offering_id: coId,
				status: 'error',
				error: 'No marks provided — record must contain at least one component mark > 0 or a non-zero total_internal_marks',
			})
			continue
		}

		// Sanitize: only allow known fields
		const sanitized: SyncRecord = {}
		for (const key of ALLOWED_FIELDS) {
			if (raw[key] !== undefined) sanitized[key] = raw[key]
		}

		// Auto-resolve program_id + course_id
		sanitized.program_id = resolved.program_id
		sanitized.course_id = resolved.course_id

		// Default cia_round to 1 if not provided
		if (!sanitized.cia_round) sanitized.cia_round = 1

		// Default submission_date to now if not provided
		if (!sanitized.submission_date) sanitized.submission_date = new Date().toISOString().split('T')[0]

		// Default marks_status
		if (!sanitized.marks_status) sanitized.marks_status = 'Submitted'

		// Audit columns: cia_marks.created_by and updated_by are NOT NULL.
		// MyJKKN MUST send the logged-in user's UUID in each record.
		const resolvedCreatedBy = resolveAuditUser(raw.created_by)
		const resolvedUpdatedBy = resolveAuditUser(raw.updated_by) ?? resolvedCreatedBy
		const resolvedSubmittedBy = resolveAuditUser(raw.submitted_by) ?? resolvedCreatedBy

		if (!resolvedCreatedBy || !resolvedUpdatedBy) {
			results.push({
				index: i,
				student_id: String(raw.student_id),
				course_offering_id: coId,
				status: 'error',
				error: 'Missing audit user UUID — record must include "created_by" (logged-in user UUID from MyJKKN session)',
			})
			continue
		}

		sanitized.created_by = resolvedCreatedBy
		sanitized.updated_by = resolvedUpdatedBy
		sanitized.submitted_by = resolvedSubmittedBy

		// Ensure is_active
		sanitized.is_active = true

		validRecords.push(sanitized)
		results.push({ index: i, student_id: String(raw.student_id), course_offering_id: coId, status: 'created' })
	}

	if (validRecords.length === 0) {
		return NextResponse.json({ error: 'No valid records to sync', results, synced: 0, failed: results.length, request_id: ctx.requestId }, { status: 400 })
	}

	// ── Upsert into cia_marks ──
	// Check which records already exist (for created vs updated status)
	const lookupKeys = validRecords.map(r => ({
		student_id: String(r.student_id),
		course_offering_id: String(r.course_offering_id),
		session_id: String(r.examination_session_id),
		cia_round: Number(r.cia_round),
	}))

	// Batch check existing records
	const studentIds = [...new Set(lookupKeys.map(k => k.student_id))]
	const sessionIds = [...new Set(lookupKeys.map(k => k.session_id))]
	const coIds = [...new Set(lookupKeys.map(k => k.course_offering_id))]

	// Look up existing rows WITHOUT the is_active filter — the unique constraint
	// (student_id, course_offering_id, examination_session_id, cia_round) covers
	// soft-deleted rows too, so an is_active=false row would still trigger 23505
	// on insert. Routing those to UPDATE lets the update reactivate the row.
	const { data: existingRows } = await supabase
		.from('cia_marks')
		.select('student_id, course_offering_id, examination_session_id, cia_round')
		.in('student_id', studentIds)
		.in('course_offering_id', coIds)
		.in('examination_session_id', sessionIds)

	const existingSet = new Set(
		(existingRows || []).map(r => `${r.student_id}|${r.course_offering_id}|${r.examination_session_id}|${r.cia_round}`)
	)

	// Split into inserts and updates
	const toInsert: SyncRecord[] = []
	const toUpdate: { record: SyncRecord, key: string }[] = []

	for (const record of validRecords) {
		const key = `${record.student_id}|${record.course_offering_id}|${record.examination_session_id}|${record.cia_round}`
		if (existingSet.has(key)) {
			toUpdate.push({ record, key })
		} else {
			toInsert.push(record)
		}
	}

	let insertCount = 0
	let updateCount = 0

	// Bulk insert new records
	if (toInsert.length > 0) {
		const { data: inserted, error: insertError } = await supabase
			.from('cia_marks')
			.insert(toInsert as Record<string, unknown>[])
			.select('student_id')

		if (insertError) {
			console.error('[v1/cia-marks/sync] Insert error:', insertError)
			// Try individually on batch failure
			for (const record of toInsert) {
				const { error } = await supabase.from('cia_marks').insert(record as Record<string, unknown>)
				const idx = results.findIndex(r => r.student_id === String(record.student_id) && r.status !== 'error')
				if (error) {
					if (idx >= 0) { results[idx].status = 'error'; results[idx].error = mapPgError(error.code, error.message) }
				} else {
					insertCount++
					if (idx >= 0) results[idx].status = 'created'
				}
			}
		} else {
			insertCount = inserted?.length || 0
		}
	}

	// Update existing records
	for (const { record } of toUpdate) {
		const { student_id, course_offering_id, examination_session_id, cia_round, institutions_id, exam_registration_id, is_active, created_by, ...updateFields } = record as any
		// Re-resolve updated_by from caller's UUID; created_by destructured out so original is preserved.
		updateFields.updated_by = resolveAuditUser(updateFields.updated_by)
		// Update is keyed by the unique constraint columns only — no is_active
		// filter, so a soft-deleted row gets reactivated (record.is_active was
		// forced to true in the validation pass above).
		const { error } = await supabase
			.from('cia_marks')
			.update(updateFields)
			.eq('student_id', student_id)
			.eq('course_offering_id', course_offering_id)
			.eq('examination_session_id', examination_session_id)
			.eq('cia_round', cia_round)

		const idx = results.findIndex(r => r.student_id === student_id && r.status !== 'error')
		if (error) {
			if (idx >= 0) { results[idx].status = 'error'; results[idx].error = mapPgError(error.code, error.message) }
		} else {
			updateCount++
			if (idx >= 0) results[idx].status = 'updated'
		}
	}

	const synced = insertCount + updateCount
	const failed = results.filter(r => r.status === 'error').length

	// First error message (if any) for top-level error field
	const firstError = results.find(r => r.status === 'error')?.error

	// Status code: 200 if everything synced, 207 if partial, 500 if all failed
	const httpStatus = synced === 0 ? 500 : failed > 0 ? 207 : 200

	return NextResponse.json({
		success: failed === 0 && synced > 0,
		synced,
		inserted: insertCount,
		updated: updateCount,
		failed,
		total: records.length,
		...(firstError ? { error: firstError } : {}),
		results,
		request_id: ctx.requestId,
	}, { status: httpStatus })
})

function isUuid(v: unknown): v is string {
	if (typeof v !== 'string') return false
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

function mapPgError(code: string, message: string): string {
	switch (code) {
		case '23505': return 'Duplicate record — marks already exist for this learner + course + session + round'
		case '23503': return `Invalid reference — ${message}`
		case '23514': return `Constraint violation — ${message}`
		case '23502': return `Missing required field — ${message}`
		default: return message
	}
}
