import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
	try {
		const { refresh_token } = await request.json()

		if (!refresh_token) {
			return NextResponse.json(
				{ error: 'invalid_request', error_description: 'Refresh token required' },
				{ status: 400 }
			)
		}

		const authServerUrl = process.env.NEXT_PUBLIC_AUTH_SERVER_URL
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
			const error = await response.json()
			return NextResponse.json(error, { status: response.status })
		}

		const tokenData = await response.json()

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

			const { data: existing } = await supabase
				.from('sessions')
				.select('id, user_id')
				.eq('refresh_token', refresh_token)
				.eq('is_active', true)
				.maybeSingle()

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
		}

		return NextResponse.json(tokenData)
	} catch {
		return NextResponse.json(
			{ error: 'server_error', error_description: 'Token refresh failed' },
			{ status: 500 }
		)
	}
}
