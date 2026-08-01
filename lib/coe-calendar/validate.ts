import type { PostgrestError } from '@supabase/supabase-js'
import { parseRoleTags, type CoeRoleTag } from './visibility'

export const PROGRAMME_TYPES = ['UG', 'PG', 'BOTH'] as const
export const STATUSES = ['ACTIVE', 'INACTIVE'] as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The set of columns a client may write — anything not named here is dropped.
 *
 * This acts as the allowlist: the update route used to spread the request body
 * straight into `.update()`, which let a caller overwrite `id`, `created_at` or
 * `is_bulk_uploaded`. Institution columns are absent by design — institution is
 * fixed at creation and the mirrored columns are trigger-maintained.
 */
export interface ValidatedEvent {
	event_title?: string
	event_description?: string | null
	exam_category?: string
	programme_type?: string
	academic_year?: string
	event_start_date?: string
	event_end_date?: string
	visible_to_roles?: CoeRoleTag[]
	program_codes?: string[] | null
	status?: string
}

/**
 * Normalises programme codes from a JSON array, a comma-separated string, or a
 * blank value. Returns `null` for "applies to every programme" — deliberately
 * never an empty array, which the database rejects as ambiguous.
 */
export function parseProgramCodes(input: unknown): string[] | null {
	const raw = Array.isArray(input)
		? input
		: typeof input === 'string'
			? input.split(',')
			: null

	if (!raw) return null

	const codes = raw.map(c => String(c).trim()).filter(Boolean)
	if (codes.length === 0) return null

	// Case-insensitive de-duplication, keeping the first spelling seen.
	const seen = new Set<string>()
	const unique: string[] = []
	for (const code of codes) {
		const key = code.toUpperCase()
		if (seen.has(key)) continue
		seen.add(key)
		unique.push(code)
	}
	return unique
}

export interface ValidationResult {
	values: ValidatedEvent
	errors: Record<string, string>
}

/**
 * Validates and narrows an event payload to writable columns.
 *
 * `partial` mode (PUT) validates only the keys actually present, so a partial
 * update does not have to resend every field.
 */
export function validateEventPayload(
	body: Record<string, unknown>,
	{ partial = false }: { partial?: boolean } = {},
): ValidationResult {
	const errors: Record<string, string> = {}
	const values: ValidatedEvent = {}
	const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)
	const required = (key: string) => !partial || has(key)

	if (required('event_title')) {
		const title = String(body.event_title ?? '').trim()
		if (!title) errors.event_title = 'Event title is required'
		else values.event_title = title
	}

	if (has('event_description')) {
		const desc = body.event_description == null ? '' : String(body.event_description).trim()
		values.event_description = desc || null
	}

	if (required('exam_category')) {
		const cat = String(body.exam_category ?? '').trim().toUpperCase()
		if (!cat) errors.exam_category = 'Category is required'
		// Membership is enforced by the composite FK
		// (institutions_id, exam_category) -> categories(institutions_id, code);
		// a bad code surfaces as a 23503 mapped by mapCalendarDbError.
		else values.exam_category = cat
	}

	if (required('programme_type')) {
		const prog = String(body.programme_type ?? '').trim().toUpperCase()
		if (!prog) errors.programme_type = 'Programme type is required'
		else if (!(PROGRAMME_TYPES as readonly string[]).includes(prog)) {
			errors.programme_type = `Programme type must be one of: ${PROGRAMME_TYPES.join(', ')}`
		} else values.programme_type = prog
	}

	if (required('academic_year')) {
		const year = String(body.academic_year ?? '').trim()
		if (!year) errors.academic_year = 'Academic year is required'
		else if (!/^\d{4}-\d{4}$/.test(year)) {
			errors.academic_year = 'Academic year must look like 2025-2026'
		} else values.academic_year = year
	}

	if (required('event_start_date')) {
		const start = String(body.event_start_date ?? '').trim()
		if (!start) errors.event_start_date = 'Start date is required'
		else if (!ISO_DATE.test(start)) errors.event_start_date = 'Start date must be YYYY-MM-DD'
		else values.event_start_date = start
	}

	if (required('event_end_date')) {
		const end = String(body.event_end_date ?? '').trim()
		if (!end) errors.event_end_date = 'End date is required'
		else if (!ISO_DATE.test(end)) errors.event_end_date = 'End date must be YYYY-MM-DD'
		else values.event_end_date = end
	}

	// Only comparable when both sides survived their own checks. On a partial
	// update that touches one date only, the other is unknown here and the
	// database CHECK is the backstop.
	if (values.event_start_date && values.event_end_date
		&& values.event_end_date < values.event_start_date) {
		errors.event_end_date = 'End date must be on or after start date'
	}

	if (has('visible_to_roles')) {
		const tags = parseRoleTags(body.visible_to_roles)
		if (!tags) {
			errors.visible_to_roles = 'Invalid audience tags'
		} else values.visible_to_roles = tags
	}

	if (has('program_codes')) {
		// Blank means "all programmes" rather than an error — most calendar
		// events are institution-wide.
		values.program_codes = parseProgramCodes(body.program_codes)
	}

	if (has('status')) {
		const status = String(body.status ?? '').trim().toUpperCase()
		if (!(STATUSES as readonly string[]).includes(status)) {
			errors.status = `Status must be one of: ${STATUSES.join(', ')}`
		} else values.status = status
	}

	return { values, errors }
}

/**
 * Turns a Postgres constraint violation into a message a user can act on.
 * Without this the routes returned a flat "Failed to save" 500 for every
 * constraint, giving no clue which field was wrong.
 */
export function mapCalendarDbError(error: PostgrestError): { message: string; status: number } {
	switch (error.code) {
		case '23503': // foreign_key_violation
			if (error.message.includes('exam_category')) {
				return { message: 'Unknown category. Add it under calendar categories first.', status: 400 }
			}
			return { message: 'Referenced record does not exist', status: 400 }
		case '23505': // unique_violation
			return {
				message: 'An event with the same title, category, date and academic year already exists',
				status: 409,
			}
		case '23514': // check_violation
			// The programme validation trigger raises 23514 with a message that
			// already names the offending codes — pass it through verbatim.
			if (error.message.toLowerCase().includes('programme code')) {
				return { message: error.message, status: 400 }
			}
			if (error.message.includes('program_codes')) {
				return { message: 'Select at least one programme, or leave it blank for all', status: 400 }
			}
			if (error.message.includes('visible_to_roles')) {
				return { message: 'Invalid audience tags', status: 400 }
			}
			if (error.message.includes('end_after_start')) {
				return { message: 'End date must be on or after start date', status: 400 }
			}
			if (error.message.includes('programme_type')) {
				return { message: 'Programme type must be UG, PG or BOTH', status: 400 }
			}
			if (error.message.includes('status')) {
				return { message: 'Status must be ACTIVE or INACTIVE', status: 400 }
			}
			return { message: 'A field failed validation', status: 400 }
		default:
			return { message: 'Database error', status: 500 }
	}
}

/** Splits a comma-separated query param into a trimmed, non-empty list. */
export function csv(param: string | null): string[] {
	if (!param) return []
	return param.split(',').map(v => v.trim()).filter(Boolean)
}

/**
 * Strips characters that would break PostgREST's `or()` filter grammar.
 * A comma or bracket in the search term would otherwise be parsed as filter
 * syntax and produce a 400 rather than zero results.
 */
export function sanitizeSearch(term: string): string {
	return term.replace(/[,()"\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Matches the term against title or description, mirroring the table's filter. */
export function searchFilter(term: string): string {
	const safe = sanitizeSearch(term)
	return `event_title.ilike.%${safe}%,event_description.ilike.%${safe}%`
}
