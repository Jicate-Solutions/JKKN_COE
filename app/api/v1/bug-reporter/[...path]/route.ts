import { NextRequest, NextResponse } from 'next/server'

/**
 * Same-origin proxy for the JKKN Bug Reporter SDK.
 *
 * The SDK talks to a third-party origin, and that cross-origin hop was failing
 * in the browser with an opaque `TypeError: Failed to fetch` for two separate
 * reasons: our global CSRF interceptor attached `x-csrf-token` (not in the
 * upstream's `Access-Control-Allow-Headers`, so the preflight failed), and
 * oversized screenshot payloads were rejected by Vercel's edge with a 413 that
 * carries no CORS headers. Browser-side workarounds for both depended on
 * `window.fetch` wrapper ordering, which does not survive dev remounts.
 *
 * Pointing the SDK's `apiUrl` at this route makes every SDK call same-origin, so
 * CORS stops applying at all. The server-to-upstream hop is a plain server
 * request with no preflight and no browser body limit.
 *
 * Mounted under `/api/v1` deliberately: that prefix is already CSRF-exempt and
 * listed in `publicApiRoutes` (see proxy.ts), so reports submit without an auth
 * or CSRF round-trip. The path is also specific enough that the SDK's automatic
 * "exclude my own apiUrl from network capture" regex matches only these calls,
 * rather than swallowing every same-origin request in the network trace.
 */

const UPSTREAM =
	process.env.BUG_REPORTER_API_URL ??
	process.env.NEXT_PUBLIC_BUG_REPORTER_API_URL ??
	''

// Server-only credential. The NEXT_PUBLIC_ name is still accepted as a fallback
// so an environment that has not been migrated yet (Vercel, CI) keeps working —
// but the browser never sends a usable key, so one of these must be set.
const SERVER_API_KEY =
	process.env.BUG_REPORTER_API_KEY ?? process.env.NEXT_PUBLIC_BUG_REPORTER_API_KEY

async function forward(request: NextRequest, path: string[]) {
	if (!UPSTREAM) {
		return NextResponse.json(
			{ success: false, error: { message: 'Bug reporter upstream URL is not configured' } },
			{ status: 500 }
		)
	}

	const target = new URL(`${UPSTREAM.replace(/\/$/, '')}/${path.join('/')}`)
	target.search = request.nextUrl.search

	const headers = new Headers()
	const contentType = request.headers.get('content-type')
	if (contentType) {
		headers.set('content-type', contentType)
	}

	// Deliberately ignores any x-api-key the browser sent: the client only holds a
	// placeholder, so forwarding it would produce a confusing upstream 401.
	if (!SERVER_API_KEY) {
		console.error(
			'[BugReporter proxy] No API key configured — set BUG_REPORTER_API_KEY'
		)
		return NextResponse.json(
			{ success: false, error: { message: 'Bug reporter API key is not configured' } },
			{ status: 500 }
		)
	}
	headers.set('x-api-key', SERVER_API_KEY)

	// Deliberately not forwarded: cookies, authorization, and x-csrf-token. They
	// are meaningless to the upstream and forwarding them would leak our session
	// and CSRF secrets to a third party.

	const body =
		request.method === 'GET' || request.method === 'HEAD'
			? undefined
			: await request.text()

	try {
		const response = await fetch(target, {
			method: request.method,
			headers,
			body,
			// The upstream can be slow on large screenshot uploads.
			signal: AbortSignal.timeout(60_000)
		})

		const text = await response.text()

		return new NextResponse(text, {
			status: response.status,
			headers: {
				'content-type': response.headers.get('content-type') ?? 'application/json'
			}
		})
	} catch (error) {
		const isTimeout = error instanceof Error && error.name === 'TimeoutError'

		console.error('[BugReporter proxy] Upstream request failed:', error)

		return NextResponse.json(
			{
				success: false,
				error: {
					message: isTimeout
						? 'Bug reporter timed out. Please try again.'
						: 'Could not reach the bug reporter service.'
				}
			},
			{ status: isTimeout ? 504 : 502 }
		)
	}
}

type RouteContext = { params: Promise<{ path: string[] }> }

export async function GET(request: NextRequest, context: RouteContext) {
	return forward(request, (await context.params).path)
}

export async function POST(request: NextRequest, context: RouteContext) {
	return forward(request, (await context.params).path)
}

export async function PATCH(request: NextRequest, context: RouteContext) {
	return forward(request, (await context.params).path)
}

export async function PUT(request: NextRequest, context: RouteContext) {
	return forward(request, (await context.params).path)
}

export async function DELETE(request: NextRequest, context: RouteContext) {
	return forward(request, (await context.params).path)
}
