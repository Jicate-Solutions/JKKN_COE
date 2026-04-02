'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useExaminationSession } from '@/context/examination-session-context'

interface ExaminationSession {
	id: string
	session_name: string
	session_code: string
	institutions_id: string
	[key: string]: unknown
}

interface UseExamSessionsOptions {
	institutionsId?: string | null  // undefined = not ready, null = skip, string = fetch
}

interface UseExamSessionsReturn {
	sessions: ExaminationSession[]
	loading: boolean
	error: string | null
	refetch: () => void

	/** The globally selected session from the header selector (or null if "All Sessions") */
	globalSessionId: string | null

	/** true when no global session is selected — show the session dropdown on the page */
	mustSelectSession: boolean
}

export function useExamSessions({ institutionsId }: UseExamSessionsOptions): UseExamSessionsReturn {
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Consume global session context from header selector
	let globalSession: { id: string } | null = null
	try {
		const ctx = useExaminationSession()
		globalSession = ctx.currentSession
	} catch {
		// Context not available (e.g., outside provider) — ignore
	}

	const globalSessionId = useMemo(() => globalSession?.id || null, [globalSession])
	const mustSelectSession = useMemo(() => !globalSession, [globalSession])

	const fetchSessions = useCallback(async () => {
		if (!institutionsId) {
			setSessions([])
			return
		}

		setLoading(true)
		setError(null)

		try {
			const res = await fetch(`/api/exam-management/examination-sessions?institutions_id=${institutionsId}`)
			if (!res.ok) throw new Error('Failed to fetch exam sessions')
			const data = await res.json()
			setSessions(Array.isArray(data) ? data : (data?.data ?? []))
		} catch (err) {
			console.error('useExamSessions error:', err)
			setError('Failed to load exam sessions')
			setSessions([])
		} finally {
			setLoading(false)
		}
	}, [institutionsId])

	useEffect(() => {
		fetchSessions()
	}, [fetchSessions])

	return { sessions, loading, error, refetch: fetchSessions, globalSessionId, mustSelectSession }
}
