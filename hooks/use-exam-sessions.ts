'use client'

import { useState, useEffect, useCallback } from 'react'

interface ExaminationSession {
	id: string
	session_name: string
	session_code: string
	institutions_id: string
}

interface UseExamSessionsOptions {
	institutionsId?: string | null  // undefined = not ready, null = skip, string = fetch
}

interface UseExamSessionsReturn {
	sessions: ExaminationSession[]
	loading: boolean
	error: string | null
	refetch: () => void
}

export function useExamSessions({ institutionsId }: UseExamSessionsOptions): UseExamSessionsReturn {
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

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

	return { sessions, loading, error, refetch: fetchSessions }
}
