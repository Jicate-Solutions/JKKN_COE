'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseRoleSyncOptions {
	/** COE user ID (from users table) to watch for role changes */
	userId: string | null
	/** Called when role changes are detected — should re-fetch roles from sync-session */
	onRoleChange: () => void
}

/**
 * Subscribes to Supabase Realtime on the user_roles table.
 * When the current user's roles are inserted, updated, or deleted,
 * triggers onRoleChange callback to silently refresh permissions.
 */
export function useRoleSync({ userId, onRoleChange }: UseRoleSyncOptions) {
	const channelRef = useRef<RealtimeChannel | null>(null)
	const onRoleChangeRef = useRef(onRoleChange)
	onRoleChangeRef.current = onRoleChange

	useEffect(() => {
		if (!userId) return

		const supabase = getSupabaseBrowser()

		// Subscribe to changes on user_roles table filtered by this user
		const channel = supabase
			.channel(`role-sync:${userId}`)
			.on(
				'postgres_changes',
				{
					event: '*', // INSERT, UPDATE, DELETE
					schema: 'public',
					table: 'user_roles',
					filter: `user_id=eq.${userId}`,
				},
				() => {
					// Role changed — trigger refresh
					onRoleChangeRef.current()
				}
			)
			.subscribe()

		channelRef.current = channel

		return () => {
			supabase.removeChannel(channel)
			channelRef.current = null
		}
	}, [userId])
}
