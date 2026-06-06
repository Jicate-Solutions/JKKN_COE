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
import { verifyRequestSignature } from './hmac-verify'
import { checkApiKeyRateLimit, getApiKeyRateLimitInfo } from './api-rate-limit'

// =====================================================
// Header names
// =====================================================

const HEADER_ACCESS_KEY = 'x-api-key-id'
const HEADER_SECRET_KEY = 'x-api-secret'

// =====================================================
// CORS configuration
// =====================================================

// External v1 API accepts requests from any origin — API key auth is the
// security boundary, not browser origin. Browser-based child apps trigger
// OPTIONS preflight; we answer it here so the real request can go through.
const CORS_ALLOWED_HEADERS = [
	'Content-Type',
	'X-API-Key-Id',
	'X-API-Secret',
	'X-Signature',
	'X-Timestamp',
].join(', ')

const CORS_ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'

const CORS_EXPOSED_HEADERS = [
	'X-Request-Id',
	'X-RateLimit-Limit',
	'X-RateLimit-Remaining',
].join(', ')

function addCorsHeaders(response: NextResponse, request: Request): NextResponse {
	const origin = request.headers.get('origin') || '*'
	response.headers.set('Access-Control-Allow-Origin', origin === '*' ? '*' : origin)
	response.headers.set('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS)
	response.headers.set('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS)
	response.headers.set('Access-Control-Expose-Headers', CORS_EXPOSED_HEADERS)
	response.headers.set('Access-Control-Max-Age', '86400')
	response.headers.set('Vary', 'Origin')
	return response
}

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

	// 2b. Verify HMAC request signature (if provided)
	const hmacResult = await verifyRequestSignature(request, secretKey)
	if (!hmacResult.valid) {
		return {
			success: false,
			status: 401,
			error: {
				error: hmacResult.error || 'Invalid request signature',
				code: hmacResult.code || 'INVALID_SIGNATURE',
				request_id: requestId,
			},
		}
	}

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
		rateLimitPerMin: validatedKey.rateLimitPerMin,
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

		// Short-circuit CORS preflight — browsers send OPTIONS before any
		// cross-origin request with custom headers (X-API-Key-Id etc.).
		// Without this, the real GET/POST is blocked by the browser and
		// the server-side log shows nothing useful.
		if (request.method === 'OPTIONS') {
			const preflight = new NextResponse(null, { status: 204 })
			addCorsHeaders(preflight, request)
			return addSecurityHeaders(preflight, requestId)
		}

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
					request,
				)
			}

			const { context } = authResult
			appId = context.appId
			accessKeyId = context.accessKeyId
			requestId = context.requestId

			// Per-API-key rate limiting (uses the key's configured ceiling if set)
			const rateLimitResponse = checkApiKeyRateLimit(context.accessKeyId, requestId, context.rateLimitPerMin)
			if (rateLimitResponse) {
				logApiRequest({
					app_id: appId,
					access_key_id: accessKeyId,
					method: request.method,
					endpoint: url.pathname,
					query_params: Object.fromEntries(url.searchParams.entries()),
					response_status: 429,
					response_time_ms: Date.now() - startTime,
					ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
					origin: request.headers.get('origin'),
					user_agent: request.headers.get('user-agent'),
					error_message: 'Rate limit exceeded',
				})
				return addSecurityHeaders(rateLimitResponse, requestId, request)
			}

			// Call the actual handler
			const response = await handler(request, context)

			// Add rate limit info to response headers
			const rlInfo = getApiKeyRateLimitInfo(context.accessKeyId, context.rateLimitPerMin)
			response.headers.set('X-RateLimit-Limit', String(rlInfo.limit))
			response.headers.set('X-RateLimit-Remaining', String(rlInfo.remaining))

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

			return addSecurityHeaders(response, requestId, request)
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
				request,
			)
		}
	}
}

/**
 * Adds standard security headers + CORS headers to the response.
 * CORS is mandatory here because v1 is an external API consumed by
 * browser-based child apps.
 */
function addSecurityHeaders(response: NextResponse, requestId: string, request?: Request): NextResponse {
	response.headers.set('X-Request-Id', requestId)
	response.headers.set('X-Content-Type-Options', 'nosniff')
	response.headers.set('X-Frame-Options', 'DENY')
	if (request) addCorsHeaders(response, request)
	return response
}

// =====================================================
// Reusable OPTIONS handler for v1 routes
// =====================================================

/**
 * Shared OPTIONS handler for CORS preflight. Re-export from any v1 route:
 *
 *   import { corsOptionsHandler } from '@/lib/api-auth/middleware'
 *   export const OPTIONS = corsOptionsHandler
 *
 * The withExternalAuth wrapper short-circuits OPTIONS internally, so the
 * inner noop is never executed — it exists only so Next.js registers an
 * OPTIONS handler on the route.
 */
export const corsOptionsHandler = withExternalAuth(
	async () => new NextResponse(null, { status: 204 }),
)
