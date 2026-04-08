'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useExaminationSession } from '@/context/examination-session-context'

interface ExaminationSession {
	id: string
	session_name: string
	session_code: string
	institutions_id?: string
	[key: string]: unknown
}

interface UseExamSessionFilterOptions {
	/** Institution ID to filter sessions by. undefined = not ready, null = skip */
	institutionsId?: string | null
	/** Whether to auto-fetch session list (default: true) */
	fetchSessions?: boolean
}

interface UseExamSessionFilterReturn {
	/** Effective session ID — global overrides local when set */
	selectedSessionId: string
	/** Setter for the local session ID (only matters when no global session) */
	setSelectedSessionId: (id: string) => void
	/**
	 * Whether the page-level session dropdown should be VISIBLE.
	 * true  = "All Sessions" selected globally -> show dropdown, user must pick
	 * false = specific session selected globally -> hide dropdown, auto-use global
	 */
	mustSelectSession: boolean
	/** true when a session ID is available (either from global or local) */
	hasSession: boolean
	/** The globally selected session (null when "All Sessions") */
	globalSessionId: string | null
	/** List of available sessions (auto-fetched when institutionsId provided) */
	sessions: ExaminationSession[]
	/** Whether sessions are currently loading */
	sessionsLoading: boolean
	/** Refetch the session list */
	refetchSessions: () => void
}

/**
 * useExamSessionFilter — Combined hook for session sync + session list.
 *
 * Replaces the need to use both `useSessionSync` and `useExamSessions` separately.
 * Handles the global session selector pattern:
 *
 *   Global session selected (e.g. "APRIL-MAY-2026") -> dropdown hidden, auto-uses global
 *   Global session = "All Sessions" -> dropdown visible, user picks locally
 *
 * Usage:
 * ```tsx
 * const {
 *   selectedSessionId,
 *   setSelectedSessionId,
 *   mustSelectSession,
 *   sessions,
 *   sessionsLoading,
 * } = useExamSessionFilter({ institutionsId })
 *
 * // In JSX — conditionally render the session dropdown:
 * {mustSelectSession && (
 *   <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
 *     <SelectTrigger><SelectValue placeholder="Select Session" /></SelectTrigger>
 *     <SelectContent>
 *       {sessions.map(s => (
 *         <SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>
 *       ))}
 *     </SelectContent>
 *   </Select>
 * )}
 * ```
 */
export function useExamSessionFilter({
	institutionsId,
	fetchSessions: shouldFetch = true,
}: UseExamSessionFilterOptions = {}): UseExamSessionFilterReturn {
	const [localSessionId, setLocalSessionId] = useState('')
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [sessionsLoading, setSessionsLoading] = useState(false)

	// Read global session context
	let globalSession: ExaminationSession | null = null
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

	const globalSessionId = useMemo(() => globalSession?.id || null, [globalSession])

	// Setter that updates local state (only matters when no global session)
	const setSelectedSessionId = useCallback((id: string) => {
		setLocalSessionId(id)
	}, [])

	// Fetch session list
	const fetchSessionList = useCallback(async () => {
		if (!shouldFetch || !institutionsId) {
			setSessions([])
			return
		}

		setSessionsLoading(true)
		try {
			const res = await fetch(`/api/exam-management/examination-sessions?institutions_id=${institutionsId}`)
			if (!res.ok) throw new Error('Failed to fetch exam sessions')
			const data = await res.json()
			setSessions(Array.isArray(data) ? data : (data?.data ?? []))
		} catch (err) {
			console.error('useExamSessionFilter: fetch error', err)
			setSessions([])
		} finally {
			setSessionsLoading(false)
		}
	}, [institutionsId, shouldFetch])

	useEffect(() => {
		fetchSessionList()
	}, [fetchSessionList])

	return {
		selectedSessionId,
		setSelectedSessionId,
		mustSelectSession,
		hasSession: !!selectedSessionId,
		globalSessionId,
		sessions,
		sessionsLoading,
		refetchSessions: fetchSessionList,
	}
}
