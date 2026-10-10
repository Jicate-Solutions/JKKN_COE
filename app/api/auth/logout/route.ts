import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { getSupabaseParent } from '@/lib/supabase-parent'
import { cookies } from 'next/headers'
import { forgetSession, validateTokenWithParent } from '@/lib/auth/server-session'

/** `sub` claim of a JWT, or null when it can't be read. */
function tokenSubject(token: string): string | null {
	try {
		const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
		return typeof payload?.sub === 'string' ? payload.sub : null
	} catch {
		return null
	}
}

/**
 * Logout endpoint - full session cleanup across all 3 layers:
 * 1. COE local database (sessions + user_sessions)
 * 2. Parent MyJKKN auth_sessions table (app_sessions JSONB)
 * 3. Parent Supabase Auth sessions (auth.sessions + auth.refresh_tokens)
 */
export async function POST(request: Request) {
	try {
		const body = await request.json().catch(() => ({}))

		// This route is public (it must work with an expired session), so the
		// caller is identified ONLY by a token they actually hold. `email` and
		// `user_id` in the body are ignored: honouring them let anyone sign any
		// other user out of COE and revoke their MyJKKN sign-in.
		const cookieStore = await cookies()
		const tokens = Array.from(
			new Set(
				[cookieStore.get('access_token')?.value, typeof body?.access_token === 'string' ? body.access_token : undefined]
					.filter((t): t is string => Boolean(t))
			)
		)

		if (tokens.length === 0) {
			return NextResponse.json({ success: true, message: 'No active session' })
		}

		const supabase = getSupabaseServer()
		const nowISO = new Date().toISOString()

		// Which COE user do these tokens belong to? Expired or already-revoked
		// rows still count — logging out of a stale session must work.
		const { data: ownedSessions } = await supabase
			.from('sessions')
			.select('user_id, session_token')
			.in('session_token', tokens)

		const owned = ownedSessions?.[0] ?? null
		const userId: string | null = owned?.user_id ?? null

		// Parent (MyJKKN) user id, needed for the parent-side cleanup. A token
		// bound to a session was verified when the row was written, so its
		// `sub` claim is authentic; otherwise ask the parent app directly.
		let effectiveParentUserId: string | null = owned ? tokenSubject(owned.session_token) : null
		if (!effectiveParentUserId) {
			for (const token of tokens) {
				const validated = await validateTokenWithParent(token)
				if (validated?.parentUserId) {
					effectiveParentUserId = validated.parentUserId
					break
				}
			}
		}

		// 1. Invalidate the presented COE sessions
		await supabase
			.from('sessions')
			.update({ is_active: false, updated_at: nowISO })
			.in('session_token', tokens)
		tokens.forEach(forgetSession)

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
