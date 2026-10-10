/**
 * Fetch options for a route handler that calls another COE API route on
 * behalf of the same caller.
 *
 * A server-side `fetch` to our own origin starts with no cookies, and every
 * protected route is session-checked in proxy.ts — without the caller's
 * cookies the inner call is answered 401. Forwarding them keeps the inner
 * request authenticated as the same user.
 *
 *   const res = await fetch(`${origin}/api/myjkkn/programs?...`, forwardSession(request))
 */
export function forwardSession(request: Request): RequestInit {
	return { headers: { cookie: request.headers.get('cookie') ?? '' } }
}
