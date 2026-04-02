/**
 * External API authentication middleware.
 *
 * Orchestrates the full auth chain:
 *   1. Extract credentials from headers (X-API-Key-Id + X-API-Secret)
 *   2. Validate key (status, expiry, hash, app status)
 *   3. Check domain/origin
 *   4. Check permissions for the requested module + operation
 *   5. Return ExternalApiContext or error
 *
 * Also provides `withExternalAuth` — a higher-order function that wraps
 * Next.js API route handlers with authentication, audit logging, and
 * security headers.
 */

import { NextResponse } from 'next/server'
import type { ExternalApiContext, ExternalApiErrorResponse } from '@/types/api-management'
import { validateApiKey } from './key-validator'
import { validateDomain } from './domain-validator'
import { checkPermission } from './permission-check'
import { logApiRequest } from './audit-logger'
import { generateSecureRandom } from './crypto'

// =====================================================
// Header names
// =====================================================

const HEADER_ACCESS_KEY = 'x-api-key-id'
const HEADER_SECRET_KEY = 'x-api-secret'

// =====================================================
// authenticateExternalApi
// =====================================================

export type AuthResult =
	| { success: true; context: ExternalApiContext }
	| { success: false; error: ExternalApiErrorResponse; status: number }

/**
 * Authenticates an external API request.
 *
 * Extracts credentials from request headers, validates the key, checks domain
 * restrictions, and verifies permissions for the requested endpoint.
 */
export async function authenticateExternalApi(
	request: Request,
): Promise<AuthResult> {
	const requestId = generateSecureRandom(16)
	const url = new URL(request.url)

	// 1. Extract credentials from headers
	const accessKeyId = request.headers.get(HEADER_ACCESS_KEY)
	const secretKey = request.headers.get(HEADER_SECRET_KEY)

	if (!accessKeyId || !secretKey) {
		return {
			success: false,
			status: 401,
			error: {
				error: 'Missing API credentials. Provide X-API-Key-Id and X-API-Secret headers.',
				code: 'MISSING_CREDENTIALS',
				request_id: requestId,
			},
		}
	}

	// 2. Validate key
	const keyResult = await validateApiKey(accessKeyId, secretKey)
	if (!keyResult.success) {
		return {
			success: false,
			status: keyResult.error.status,
			error: {
				error: keyResult.error.error,
				code: keyResult.error.code,
				request_id: requestId,
			},
		}
	}

	const { data: validatedKey } = keyResult

	// 3. Check domain
	const origin = request.headers.get('origin')
	const domainResult = validateDomain(origin, validatedKey.allowedDomains)
	if (!domainResult.allowed) {
		return {
			success: false,
			status: 403,
			error: {
				error: domainResult.reason || 'Origin not allowed',
				code: 'DOMAIN_NOT_ALLOWED',
				request_id: requestId,
			},
		}
	}

	// 4. Check permissions
	const permissionResult = await checkPermission(
		validatedKey.appId,
		request.method,
		url.pathname,
	)
	if (!permissionResult.allowed) {
		return {
			success: false,
			status: 403,
			error: {
				error: permissionResult.error || 'Permission denied',
				code: permissionResult.code || 'PERMISSION_DENIED',
				request_id: requestId,
			},
		}
	}

	// 5. Build context
	const context: ExternalApiContext = {
		appId: validatedKey.appId,
		appName: validatedKey.appName,
		accessKeyId: validatedKey.accessKeyId,
		allowedDomains: validatedKey.allowedDomains,
		institutionsId: validatedKey.institutionsId,
		institutionCode: validatedKey.institutionCode,
		allowedModules: permissionResult.permissions,
		allowedInstitutionIds: permissionResult.allowedInstitutionIds,
		requestId,
	}

	return { success: true, context }
}

// =====================================================
// withExternalAuth — Higher-order function wrapper
// =====================================================

type ExternalApiHandler = (
	request: Request,
	context: ExternalApiContext,
) => Promise<NextResponse>

/**
 * Wraps a Next.js API route handler with external API authentication,
 * audit logging, and security headers.
 *
 * Usage:
 * ```ts
 * export const GET = withExternalAuth(async (request, context) => {
 *   // context.appId, context.allowedModules, etc.
 *   return NextResponse.json({ data: results })
 * })
 * ```
 */
export function withExternalAuth(handler: ExternalApiHandler) {
	return async (request: Request): Promise<NextResponse> => {
		const startTime = Date.now()
		const url = new URL(request.url)
		let appId: string | null = null
		let accessKeyId: string | null = null
		let requestId = generateSecureRandom(16)

		try {
			// Authenticate
			const authResult = await authenticateExternalApi(request)

			if (!authResult.success) {
				requestId = authResult.error.request_id || requestId

				// Log failed attempt
				logApiRequest({
					app_id: null,
					access_key_id: request.headers.get(HEADER_ACCESS_KEY),
					method: request.method,
					endpoint: url.pathname,
					query_params: Object.fromEntries(url.searchParams.entries()),
					response_status: authResult.status,
					response_time_ms: Date.now() - startTime,
					ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
					origin: request.headers.get('origin'),
					user_agent: request.headers.get('user-agent'),
					error_message: authResult.error.error,
				})

				return addSecurityHeaders(
					NextResponse.json(authResult.error, { status: authResult.status }),
					requestId,
				)
			}

			const { context } = authResult
			appId = context.appId
			accessKeyId = context.accessKeyId
			requestId = context.requestId

			// Call the actual handler
			const response = await handler(request, context)

			// Log successful request
			logApiRequest({
				app_id: appId,
				access_key_id: accessKeyId,
				method: request.method,
				endpoint: url.pathname,
				query_params: Object.fromEntries(url.searchParams.entries()),
				response_status: response.status,
				response_time_ms: Date.now() - startTime,
				ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
				origin: request.headers.get('origin'),
				user_agent: request.headers.get('user-agent'),
			})

			return addSecurityHeaders(response, requestId)
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Internal server error'
			console.error('[withExternalAuth] Unhandled error:', err)

			// Log error
			logApiRequest({
				app_id: appId,
				access_key_id: accessKeyId,
				method: request.method,
				endpoint: url.pathname,
				query_params: Object.fromEntries(url.searchParams.entries()),
				response_status: 500,
				response_time_ms: Date.now() - startTime,
				ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
				origin: request.headers.get('origin'),
				user_agent: request.headers.get('user-agent'),
				error_message: errorMessage,
			})

			const errorResponse: ExternalApiErrorResponse = {
				error: 'Internal server error',
				code: 'INTERNAL_ERROR',
				request_id: requestId,
			}

			return addSecurityHeaders(
				NextResponse.json(errorResponse, { status: 500 }),
				requestId,
			)
		}
	}
}

/**
 * Adds standard security headers to the response.
 */
function addSecurityHeaders(response: NextResponse, requestId: string): NextResponse {
	response.headers.set('X-Request-Id', requestId)
	response.headers.set('X-Content-Type-Options', 'nosniff')
	response.headers.set('X-Frame-Options', 'DENY')
	return response
}
