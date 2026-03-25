import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { getSupabaseParent } from '@/lib/supabase-parent'

/**
 * Logout endpoint - full session cleanup across all 3 layers:
 * 1. COE local database (sessions + user_sessions)
 * 2. Parent MyJKKN auth_sessions table (app_sessions JSONB)
 * 3. Parent Supabase Auth sessions (auth.sessions + auth.refresh_tokens)
 */
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { email, access_token, user_id: parentUserId } = body

		if (!email && !access_token) {
			return NextResponse.json({ error: 'Email or access_token is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()
		const nowISO = new Date().toISOString()

		// Find user by email in COE database
		let userId: string | null = null

		if (email) {
			const { data: userData } = await supabase
				.from('users')
				.select('id')
				.eq('email', email)
				.single()

			userId = userData?.id || null
		}

		// 1. Invalidate COE sessions by access_token
		if (access_token) {
			await supabase
				.from('sessions')
				.update({ is_active: false, updated_at: nowISO })
				.eq('session_token', access_token)
		}

		// 2. Invalidate all active COE sessions for this user
		if (userId) {
			await supabase
				.from('sessions')
				.update({ is_active: false, updated_at: nowISO })
				.eq('user_id', userId)
				.eq('is_active', true)

			await supabase
				.from('user_sessions')
				.delete()
				.eq('user_id', userId)
		}

		const appId = process.env.NEXT_PUBLIC_APP_ID
		const effectiveParentUserId = parentUserId || userId

		if (effectiveParentUserId) {
			try {
				const parentSupabase = getSupabaseParent()

				// 3. Remove COE app entry from parent auth_sessions JSONB
				if (appId) {
					const { data: authSession } = await parentSupabase
						.from('auth_sessions')
						.select('app_sessions, total_apps_connected')
						.eq('user_id', effectiveParentUserId)
						.single()

					if (authSession?.app_sessions && authSession.app_sessions[appId]) {
						const updatedSessions = { ...authSession.app_sessions }
						delete updatedSessions[appId]

						await parentSupabase
							.from('auth_sessions')
							.update({
								app_sessions: updatedSessions,
								total_apps_connected: Math.max((authSession.total_apps_connected || 1) - 1, 0),
								updated_at: nowISO,
							})
							.eq('user_id', effectiveParentUserId)
					}
				}

				// 4. Revoke parent Supabase Auth sessions (kills SSO)
				await parentSupabase.rpc('revoke_user_auth_sessions', {
					target_user_id: effectiveParentUserId,
				})
			} catch (parentErr) {
				console.warn('Failed to cleanup parent sessions:', parentErr)
			}
		}

		return NextResponse.json({
			success: true,
			message: 'Sessions invalidated successfully'
		})
	} catch (error) {
		console.error('Logout error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
