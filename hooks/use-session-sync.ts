'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useExaminationSession } from '@/context/examination-session-context'

/**
 * useSessionSync - Drop-in replacement for useState<string>('') for session IDs.
 *
 * Syncs with the global Examination Session Selector in the header:
 * - When a session is selected globally → auto-fills the local value, hides dropdown
 * - When "All Sessions" globally → local state works normally, dropdown visible
 *
 * Usage (minimal change to existing pages):
 * ```tsx
 * // Before:
 * const [selectedSessionId, setSelectedSessionId] = useState('')
 *
 * // After:
 * const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
 *
 * // Then wrap the session dropdown:
 * {mustSelectSession && (
 *   <Select value={selectedSessionId} ...>...</Select>
 * )}
 * ```
 */
export function useSessionSync(initialValue = '') {
	const [localSessionId, setLocalSessionId] = useState(initialValue)

	// Read global session context
	let globalSession: { id: string } | null = null
	try {
		const ctx = useExaminationSession()
		globalSession = ctx.currentSession
	} catch {
		// Outside provider — no global sync
	}

	// Effective value: global overrides local when set
	const selectedSessionId = globalSession?.id || localSessionId

	// Whether the page-level dropdown should be shown
	const mustSelectSession = !globalSession

	// Setter that updates local state (only matters when no global session)
	const setSelectedSessionId = useCallback((id: string) => {
		setLocalSessionId(id)
	}, [])

	return {
		selectedSessionId,
		setSelectedSessionId,
		mustSelectSession,
		/** true when session ID is available (either from global or local) */
		hasSession: !!selectedSessionId,
	}
}
