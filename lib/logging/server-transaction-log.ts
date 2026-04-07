/**
 * Server-side Transaction Log Helper
 * Use in API routes to log CRUD operations with user_id, session_id,
 * old_values, new_values, error_message, action, and resource_type.
 */
import { getSupabaseServer } from '@/lib/supabase-server'
import { headers, cookies } from 'next/headers'

interface LogParams {
	action: 'create' | 'read' | 'update' | 'delete'
	resource_type: string
	resource_id?: string
	old_values?: Record<string, unknown> | null
	new_values?: Record<string, unknown> | null
	status?: 'success' | 'error'
	error_message?: string | null
	metadata?: Record<string, unknown>
}

/**
 * Resolve user_id and session_id from the access_token cookie.
 * Looks up the sessions table where session_token = access_token.
 */
async function resolveSession(supabase: ReturnType<typeof getSupabaseServer>) {
	try {
		const cookieStore = await cookies()
		const accessToken = cookieStore.get('access_token')?.value

		console.log('[transaction-log] Cookie access_token present:', !!accessToken, accessToken ? `(start: ${accessToken.substring(0, 20)}... end: ...${accessToken.slice(-20)})` : '')

		if (!accessToken) return { userId: null, sessionId: null }

		const { data: sessions, error } = await supabase
			.from('sessions')
			.select('id, user_id')
			.eq('session_token', accessToken)
			.eq('is_active', true)
			.order('created_at', { ascending: false })
			.limit(1)

		console.log('[transaction-log] Session lookup result:', { found: sessions && sessions.length > 0, error: error?.message || null })

		if (sessions && sessions.length > 0) {
			return { userId: sessions[0].user_id, sessionId: sessions[0].id }
		}
	} catch (err) {
		console.error('[transaction-log] resolveSession error:', err)
	}
	return { userId: null, sessionId: null }
}

/**
 * Extract IP address and user agent from request headers.
 */
async function getRequestMeta() {
	const headersList = await headers()
	const userAgent = headersList.get('user-agent') || null
	const ipAddress =
		headersList.get('cf-connecting-ip') ||
		headersList.get('true-client-ip') ||
		headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		headersList.get('x-real-ip') ||
		null

	return { userAgent, ipAddress }
}

/**
 * Log a transaction from an API route.
 *
 * Usage:
 * ```ts
 * import { logTransaction } from '@/lib/logging/server-transaction-log'
 *
 * // resource_id = page path (human-readable), record UUID goes in metadata
 *
 * // After a successful create
 * await logTransaction({
 *   action: 'create',
 *   resource_type: 'user_role',
 *   resource_id: '/admin/role-management',
 *   new_values: data,
 *   metadata: { record_id: data.id },
 * })
 *
 * // After a successful update (fetch old values BEFORE updating)
 * await logTransaction({
 *   action: 'update',
 *   resource_type: 'course',
 *   resource_id: '/master/courses',
 *   old_values: oldRecord,
 *   new_values: updatedRecord,
 *   metadata: { record_id: id },
 * })
 *
 * // On error
 * await logTransaction({
 *   action: 'update',
 *   resource_type: 'course',
 *   resource_id: '/master/courses',
 *   status: 'error',
 *   error_message: error.message,
 *   metadata: { record_id: id },
 * })
 * ```
 */
export async function logTransaction(params: LogParams): Promise<void> {
	try {
		const supabase = getSupabaseServer()

		const [{ userId, sessionId }, { userAgent, ipAddress }] = await Promise.all([
			resolveSession(supabase),
			getRequestMeta(),
		])

		await supabase.from('transaction_logs').insert({
			user_id: userId,
			session_id: sessionId,
			action: params.action,
			resource_type: params.resource_type,
			resource_id: params.resource_id || null,
			old_values: params.old_values || null,
			new_values: params.new_values || null,
			ip_address: ipAddress,
			user_agent: userAgent,
			status: params.status || 'success',
			error_message: params.error_message || null,
			metadata: params.metadata || {},
		})
	} catch (err) {
		// Never let logging failures break the API response
		console.error('[transaction-log] Failed to log:', err)
	}
}

/**
 * Fetch the current record before update/delete so old_values can be logged.
 *
 * Usage:
 * ```ts
 * const oldRecord = await fetchOldValues('user_roles', roleId)
 * // ... perform update ...
 * await logTransaction({ action: 'update', old_values: oldRecord, new_values: updated })
 * ```
 */
export async function fetchOldValues(
	table: string,
	id: string,
	idColumn = 'id'
): Promise<Record<string, unknown> | null> {
	try {
		const supabase = getSupabaseServer()
		const { data } = await supabase
			.from(table)
			.select('*')
			.eq(idColumn, id)
			.single()
		return data as Record<string, unknown> | null
	} catch {
		return null
	}
}
