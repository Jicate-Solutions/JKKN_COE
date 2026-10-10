'use client'

import { useEffect, useRef } from 'react'

interface UseRoleSyncOptions {
	/** COE user ID (from users table) to watch for role changes */
	userId: string | null
	/** Called when roles should be re-read — should re-fetch roles from sync-session */
	onRoleChange: () => void
}

// Roles are re-read when the user comes back to the tab, at most this often.
const MIN_INTERVAL_MS = 2 * 60 * 1000
// …and on this timer while the tab stays in front.
const POLL_INTERVAL_MS = 5 * 60 * 1000

/**
 * Keeps the signed-in user's roles and permissions fresh in the browser.
 *
 * This used to subscribe to the `user_roles` table through Supabase Realtime,
 * which only works while the table is readable with the public (anon) key —
 * and that made every user's role assignments readable by anyone. The table
 * is now closed to that key, so the roles are re-read from the server
 * instead: when the tab regains focus, and every few minutes while it is open.
 *
 * This only affects what the sidebar shows. What a user may actually do is
 * decided on the server on every request (proxy.ts), from the database.
 */
export function useRoleSync({ userId, onRoleChange }: UseRoleSyncOptions) {
	const onRoleChangeRef = useRef(onRoleChange)
	onRoleChangeRef.current = onRoleChange

	useEffect(() => {
		if (!userId) return

		let lastRun = Date.now()
		const refresh = () => {
			if (document.visibilityState !== 'visible') return
			if (Date.now() - lastRun < MIN_INTERVAL_MS) return
			lastRun = Date.now()
			onRoleChangeRef.current()
		}

		document.addEventListener('visibilitychange', refresh)
		window.addEventListener('focus', refresh)
		const timer = setInterval(refresh, POLL_INTERVAL_MS)

		return () => {
			document.removeEventListener('visibilitychange', refresh)
			window.removeEventListener('focus', refresh)
			clearInterval(timer)
		}
	}, [userId])
}
