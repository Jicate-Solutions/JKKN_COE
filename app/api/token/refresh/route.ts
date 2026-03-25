import { NextRequest, NextResponse } from 'next/server'

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

		return NextResponse.json(await response.json())
	} catch {
		return NextResponse.json(
			{ error: 'server_error', error_description: 'Token refresh failed' },
			{ status: 500 }
		)
	}
}
