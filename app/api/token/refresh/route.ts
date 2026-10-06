import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/** `sub` claim of a parent-app access token (JWT), or null when it can't be read. */
function tokenSubject(token: string | undefined): string | null {
	if (!token) return null
	try {
		const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
		return typeof payload?.sub === 'string' ? payload.sub : null
	} catch {
		return null
	}
}

export async function POST(request: NextRequest) {
	try {
		// The refresh_token cookie is httpOnly (set by /auth/callback and
		// /api/auth/sync-session), so client JS normally cannot put it in the
		// body — fall back to the cookie the browser attaches to this request.
		const body = await request.json().catch(() => ({}))
		const refresh_token: string | undefined =
			body?.refresh_token || request.cookies.get('refresh_token')?.value

		if (!refresh_token) {
			return NextResponse.json(
				{ error: 'invalid_request', error_description: 'Refresh token required' },
				{ status: 400 }
			)
		}

		// Same parent app that /api/auth/token exchanges the code with.
		const authServerUrl = process.env.NEXT_PUBLIC_AUTH_SERVER_URL || process.env.NEXT_PUBLIC_PARENT_APP_URL
		const clientId = process.env.NEXT_PUBLIC_APP_ID
		const clientSecret = process.env.API_KEY

		if (!authServerUrl || !clientId || !clientSecret) {
			return NextResponse.json(
				{ error: 'server_error', error_description: 'OAuth configuration incomplete' },
				{ status: 500 }
			)
		}

		const response = await fetch(`${authServerUrl}/api/auth/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				grant_type: 'refresh_token',
				refresh_token,
				app_id: clientId,
				api_key: clientSecret,
			}),
		})

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: 'invalid_grant' }))
			return NextResponse.json(error, { status: response.status })
		}

		const tokenData = await response.json()
		const res = NextResponse.json(tokenData)

		// Sync rotated tokens to sessions table so withAdminAuth stays aligned
		// with the new access_token cookie. Without this, admin-guarded API routes
		// return 401 after every token refresh.
		if (tokenData.access_token) {
			const supabase = getSupabaseServer()
			const nowISO = new Date().toISOString()
			const newRefreshToken = tokenData.refresh_token || refresh_token
			const expiresAt = new Date(
				Date.now() + (tokenData.expires_in || 3600) * 1000
			).toISOString()

			let { data: existing } = await supabase
				.from('sessions')
				.select('id, user_id')
				.eq('refresh_token', refresh_token)
				.eq('is_active', true)
				.maybeSingle()

			// sync-session re-syncs store refresh_token = null (the browser can't
			// read the httpOnly cookie to send it), so most rows only match on the
			// access token being replaced. Only rebind the row when the new token
			// was issued to the same parent user as the old one.
			const previousAccessToken = request.cookies.get('access_token')?.value
			const previousSubject = tokenSubject(previousAccessToken)
			if (
				!existing &&
				previousAccessToken &&
				previousSubject &&
				previousSubject === tokenSubject(tokenData.access_token)
			) {
				const { data: byAccessToken } = await supabase
					.from('sessions')
					.select('id, user_id')
					.eq('session_token', previousAccessToken)
					.eq('is_active', true)
					.maybeSingle()
				existing = byAccessToken
			}

			if (existing) {
				await supabase
					.from('sessions')
					.update({
						session_token: tokenData.access_token,
						refresh_token: newRefreshToken,
						expires_at: expiresAt,
						updated_at: nowISO,
					})
					.eq('id', existing.id)

				if (tokenData.refresh_token && existing.user_id) {
					await supabase
						.from('user_sessions')
						.update({
							access_token: tokenData.access_token,
							refresh_token: newRefreshToken,
							expires_at: expiresAt,
						})
						.eq('user_id', existing.user_id)
				}
			}

			// Mirror the cookies sync-session sets, so the rotated tokens reach the
			// browser even though it cannot write the httpOnly refresh cookie itself.
			res.cookies.set('access_token', tokenData.access_token, {
				path: '/',
				maxAge: 7 * 24 * 60 * 60,
				httpOnly: false, // Needs to be readable by client JS
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
			})
			if (tokenData.refresh_token) {
				res.cookies.set('refresh_token', tokenData.refresh_token, {
					path: '/',
					maxAge: 30 * 24 * 60 * 60,
					httpOnly: true, // Refresh token never needs client-side access
					sameSite: 'lax',
					secure: process.env.NODE_ENV === 'production',
				})
			}
		}

		return res
	} catch {
		return NextResponse.json(
			{ error: 'server_error', error_description: 'Token refresh failed' },
			{ status: 500 }
		)
	}
}
