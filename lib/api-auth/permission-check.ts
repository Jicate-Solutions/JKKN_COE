/**
 * Permission checking for external API requests.
 *
 * Maps HTTP methods to operations and extracts the module from the URL path,
 * then checks whether the application has the required permission.
 */

import { getSupabaseServer } from '@/lib/supabase-server'
import type { ApiModule, ApiOperation, ApiPermission } from '@/types/api-management'
import { API_MODULES } from '@/types/api-management'

export interface PermissionCheckResult {
	allowed: boolean
	permissions: ApiPermission[]
	allowedInstitutionIds: string[]
	error?: string
	code?: string
}

/**
 * Maps an HTTP method to the corresponding API operation.
 */
function methodToOperation(method: string): ApiOperation | null {
	const map: Record<string, ApiOperation> = {
		GET: 'read',
		POST: 'create',
		PUT: 'update',
		PATCH: 'update',
		DELETE: 'delete',
	}
	return map[method.toUpperCase()] || null
}

/**
 * Aggregate/composite endpoints whose URL segment is not itself an API module
 * but which are governed by an existing module's permission. The new
 * student-result-view endpoint is purpose-built around results and is gated by
 * `results:read`, so a key already granted results:read can call it.
 */
const ENDPOINT_MODULE_ALIASES: Record<string, ApiModule> = {
	'student-result-view': 'results',
	// Aggregate CIA/internal view — governed by the CIA report permission, so a
	// key already granted cia-report:read can call it.
	'student-cia-view': 'cia-report',
}

/**
 * Extracts the module name from the API endpoint URL.
 * Expected format: /api/v1/{module}/...
 *
 * Falls back to checking if any known module appears in the path.
 */
function extractModule(endpoint: string): ApiModule | null {
	// Try /api/v1/{module} pattern first
	const match = endpoint.match(/\/api\/v1\/([^/?]+)/)
	if (match) {
		const segment = match[1]
		// Composite endpoints map to a governing module (e.g. results:read).
		if (ENDPOINT_MODULE_ALIASES[segment]) {
			return ENDPOINT_MODULE_ALIASES[segment]
		}
		if ((API_MODULES as readonly string[]).includes(segment)) {
			return segment as ApiModule
		}
	}

	// Fallback: check if any known module is in the path
	for (const mod of API_MODULES) {
		if (endpoint.includes(`/${mod}`)) {
			return mod
		}
	}

	return null
}

/**
 * Checks whether the application has permission for the requested operation on the module.
 *
 * Returns the matching permissions and the list of institution IDs the app is allowed
 * to access for this module+operation. A null institution_id in a permission means
 * "all institutions".
 */
export async function checkPermission(
	appId: string,
	method: string,
	endpoint: string,
): Promise<PermissionCheckResult> {
	const operation = methodToOperation(method)
	if (!operation) {
		return {
			allowed: false,
			permissions: [],
			allowedInstitutionIds: [],
			error: `HTTP method "${method}" is not supported`,
			code: 'METHOD_NOT_SUPPORTED',
		}
	}

	const module = extractModule(endpoint)
	if (!module) {
		return {
			allowed: false,
			permissions: [],
			allowedInstitutionIds: [],
			error: `Could not determine module from endpoint "${endpoint}"`,
			code: 'UNKNOWN_MODULE',
		}
	}

	const supabase = getSupabaseServer()

	const { data: permissions, error } = await supabase
		.from('api_permissions')
		.select('*')
		.eq('app_id', appId)
		.eq('module', module)
		.eq('operation', operation)

	if (error) {
		console.error('Permission check error:', error)
		return {
			allowed: false,
			permissions: [],
			allowedInstitutionIds: [],
			error: 'Failed to check permissions',
			code: 'PERMISSION_CHECK_FAILED',
		}
	}

	if (!permissions || permissions.length === 0) {
		return {
			allowed: false,
			permissions: [],
			allowedInstitutionIds: [],
			error: `No permission for ${operation} on ${module}`,
			code: 'PERMISSION_DENIED',
		}
	}

	// Collect allowed institution IDs
	// A null institution_id means access to all institutions
	const hasGlobalAccess = permissions.some(p => !p.institution_id)
	const allowedInstitutionIds = hasGlobalAccess
		? [] // empty array signals "all institutions"
		: [...new Set(permissions.filter(p => p.institution_id).map(p => p.institution_id!))]

	return {
		allowed: true,
		permissions: permissions as ApiPermission[],
		allowedInstitutionIds,
	}
}
