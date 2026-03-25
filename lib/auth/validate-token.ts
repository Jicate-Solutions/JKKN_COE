import { NextRequest } from 'next/server'
import { authConfig, AuthUser } from './config'

export async function validateToken(request: NextRequest): Promise<{ user: AuthUser | null; error?: string }> {
	const authHeader = request.headers.get('authorization')
	const token = authHeader?.replace('Bearer ', '')

	if (!token) {
		return { user: null, error: 'No token provided' }
	}

	try {
		const response = await fetch(`${authConfig.authServerUrl}/api/auth/validate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				access_token: token,
				child_app_id: authConfig.clientId,
			}),
		})

		if (!response.ok) {
			return { user: null, error: 'Invalid token' }
		}

		const data = await response.json()
		return { user: data.user }
	} catch {
		return { user: null, error: 'Token validation failed' }
	}
}

export function getTokenFromRequest(request: NextRequest): string | null {
	const authHeader = request.headers.get('authorization')
	return authHeader?.replace('Bearer ', '') || null
}
