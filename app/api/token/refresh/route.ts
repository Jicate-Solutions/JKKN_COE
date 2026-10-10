import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import {
	COE_SESSION_TTL_SECONDS,
	bindSession,
	extractParentProfile,
	forgetSession,
	loadCoeUser,
	parentTokenOwnerEmail,
	validateTokenWithParent,
} from '@/lib/auth/server-session'

function tokenPayload(token: string | undefined): Record<string, unknown> | null {
	if (!token) return null
	try {
		const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
		return payload && typeof payload === 'object' ? payload : null
	} catch {
		return null
	}
}

/** `sub` claim of a parent-app access token (JWT), or null when it can't be read. */
function tokenSubject(token: string | undefined): string | null {
	const sub = tokenPayload(token)?.sub
	return typeof sub === 'string' ? sub : null
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

		// Sync rotated tokens to sessions table so the session check in proxy.ts
		// (and withAdminAuth) stays aligned with the new access_token cookie.
		// Without this, every API route returns 401 after a token refresh.
		if (tokenData.access_token) {
			const supabase = getSupabaseServer()
			const nowISO = new Date().toISOString()
			const newRefreshToken = tokenData.refresh_token || refresh_token
			const expiresAt = new Date(
				Date.now() + COE_SESSION_TTL_SECONDS * 1000
			).toISOString()

			// Session bookkeeping must never cost the user their rotated tokens: the
			// parent has already retired the old refresh token, so the cookies below
			// are set even when this fails.
			const previousAccessToken = request.cookies.get('access_token')?.value
			try {
				let { data: existing } = await supabase
					.from('sessions')
					.select('id, user_id, device_info')
					.eq('refresh_token', refresh_token)
					.eq('is_active', true)
					.maybeSingle()

				// sync-session re-syncs store no refresh_token (the browser can't read
				// the httpOnly cookie to send it), so most rows only match on the
				// access token being replaced. Only rebind the row when the new token
				// was issued to the same parent user as the old one.
				const previousSubject = tokenSubject(previousAccessToken)
				if (
					!existing &&
					previousAccessToken &&
					previousSubject &&
					previousSubject === tokenSubject(tokenData.access_token)
				) {
					const { data: byAccessToken } = await supabase
						.from('sessions')
						.select('id, user_id, device_info')
						.eq('session_token', previousAccessToken)
						.eq('is_active', true)
						.maybeSingle()
					existing = byAccessToken
				}

				// The new token came straight from the parent app in exchange for the
				// refresh token, so its owner is known for certain.
				const ownerEmail = parentTokenOwnerEmail(tokenData)
				const owner = ownerEmail ? await loadCoeUser({ email: ownerEmail }) : null

				// The parent's record of this user (institution, super admin) is what
				// institution scoping is checked against. A refresh response may not
				// carry it; ask the parent once when the session has none yet.
				const parentProfileFor = async (hasStoredProfile: boolean) => {
					const fromResponse = extractParentProfile(tokenData.user)
					if (fromResponse || hasStoredProfile) return fromResponse
					return (await validateTokenWithParent(tokenData.access_token))?.parentProfile ?? null
				}

				if (existing && (!owner || owner.userId === existing.user_id)) {
					await supabase
						.from('sessions')
						.update({
							session_token: tokenData.access_token,
							refresh_token: newRefreshToken,
							expires_at: expiresAt,
							updated_at: nowISO,
						})
						.eq('id', existing.id)
					forgetSession(previousAccessToken)
					forgetSession(tokenData.access_token)

					const stored = (existing.device_info as Record<string, unknown> | null)?.parent_profile
					const parentProfile = await parentProfileFor(Boolean(stored))
					if (parentProfile) {
						await bindSession({
							userId: existing.user_id,
							accessToken: tokenData.access_token,
							parentProfile,
						})
					}

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
				} else if (owner) {
					// No live row to rebind (it expired and was retired, or this browser
					// never synced one) — bind a fresh session for the token's owner.
					await bindSession({
						userId: owner.userId,
						accessToken: tokenData.access_token,
						refreshToken: newRefreshToken,
						parentProfile: await parentProfileFor(false),
						userAgent: request.headers.get('user-agent')?.substring(0, 500) || null,
					})
				}
			} catch (err) {
				console.error('[token/refresh] Session bookkeeping failed:', err)
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
