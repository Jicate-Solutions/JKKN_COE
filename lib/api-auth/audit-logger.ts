/**
 * Audit logging for external API requests.
 *
 * Inserts a record into api_audit_logs for every request.
 * Masks sensitive fields and never throws — logging failures are silently caught.
 */

import { getSupabaseServer } from '@/lib/supabase-server'

export interface AuditLogEntry {
	app_id?: string | null
	access_key_id?: string | null
	method: string
	endpoint: string
	query_params?: Record<string, unknown> | null
	request_body?: Record<string, unknown> | null
	response_status?: number | null
	response_time_ms?: number | null
	ip_address?: string | null
	origin?: string | null
	user_agent?: string | null
	error_message?: string | null
}

/**
 * Fields whose values should be masked in audit logs.
 */
const SENSITIVE_FIELDS = new Set([
	'password',
	'secret',
	'secret_key',
	'secretKey',
	'token',
	'authorization',
	'x-api-secret',
	'credit_card',
	'ssn',
])

/**
 * Recursively masks sensitive fields in an object.
 * Returns a new object with sensitive values replaced by '***'.
 */
function maskSensitiveFields(
	obj: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
	if (!obj) return null

	const masked: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(obj)) {
		if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
			masked[key] = '***'
		} else if (value && typeof value === 'object' && !Array.isArray(value)) {
			masked[key] = maskSensitiveFields(value as Record<string, unknown>)
		} else {
			masked[key] = value
		}
	}
	return masked
}

/**
 * Logs an API request to the api_audit_logs table.
 * Never throws — any errors are caught and logged to console.
 */
export async function logApiRequest(entry: AuditLogEntry): Promise<void> {
	try {
		const supabase = getSupabaseServer()

		const record = {
			app_id: entry.app_id || null,
			access_key_id: entry.access_key_id || null,
			method: entry.method,
			endpoint: entry.endpoint,
			query_params: maskSensitiveFields(entry.query_params),
			request_body: maskSensitiveFields(entry.request_body),
			response_status: entry.response_status || null,
			response_time_ms: entry.response_time_ms || null,
			ip_address: entry.ip_address || null,
			origin: entry.origin || null,
			user_agent: entry.user_agent || null,
			error_message: entry.error_message || null,
		}

		const { error } = await supabase
			.from('api_audit_logs')
			.insert(record)

		if (error) {
			console.error('[audit-logger] Failed to insert audit log:', error.message)
		}
	} catch (err) {
		console.error('[audit-logger] Unexpected error:', err)
	}
}
