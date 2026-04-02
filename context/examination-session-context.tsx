'use client'

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react'
import { useInstitution } from '@/context/institution-context'

export interface ExaminationSession {
	id: string
	session_code: string
	session_name: string
	exam_type?: string
	academic_year?: string
	semester?: string
	exam_start_date?: string
	exam_end_date?: string
	session_status?: string
	institutions_id?: string
}

interface ExaminationSessionContextType {
	currentSession: ExaminationSession | null
	availableSessions: ExaminationSession[]
	isLoading: boolean
	isInitialized: boolean
	error: string | null

	selectSession: (session: ExaminationSession | null) => void
	clearSessionSelection: () => void
	refreshSessions: () => Promise<void>

	sessionFilter: { examination_session_id?: string }
	shouldFilterBySession: boolean
	sessionId: string | null
}

const ExaminationSessionContext = createContext<ExaminationSessionContextType | undefined>(undefined)

const SESSION_STORAGE_KEY = 'selected_examination_session'

export function ExaminationSessionProvider({ children }: { children: ReactNode }) {
	const { currentInstitutionId, isInitialized: instInitialized } = useInstitution()

	const [availableSessions, setAvailableSessions] = useState<ExaminationSession[]>([])
	const [selectedSession, setSelectedSession] = useState<ExaminationSession | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [isInitialized, setIsInitialized] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const fetchInProgressRef = useRef(false)
	const mountedRef = useRef(true)
	const lastInstitutionIdRef = useRef<string | null>(null)

	// Restore persisted selection on mount
	useEffect(() => {
		try {
			const persisted = localStorage.getItem(SESSION_STORAGE_KEY)
			if (persisted) {
				setSelectedSession(JSON.parse(persisted))
			}
		} catch {
			localStorage.removeItem(SESSION_STORAGE_KEY)
		}
	}, [])

	// Fetch sessions when institution changes
	const fetchSessions = useCallback(async () => {
		if (!instInitialized || fetchInProgressRef.current) return

		// If institution changed, clear the selected session if it doesn't belong to new institution
		if (lastInstitutionIdRef.current !== currentInstitutionId) {
			lastInstitutionIdRef.current = currentInstitutionId
		}

		fetchInProgressRef.current = true
		setIsLoading(true)
		setError(null)

		try {
			const url = currentInstitutionId
				? `/api/exam-management/examination-sessions?institutions_id=${currentInstitutionId}`
				: '/api/exam-management/examination-sessions'

			const res = await fetch(url, { credentials: 'include' })
			if (!res.ok) throw new Error('Failed to fetch examination sessions')

			const data = await res.json()
			const sessions: ExaminationSession[] = Array.isArray(data) ? data : (data?.data ?? [])

			if (mountedRef.current) {
				setAvailableSessions(sessions)

				// Validate persisted selection still exists in new list
				if (selectedSession) {
					const stillExists = sessions.some(s => s.id === selectedSession.id)
					if (!stillExists && sessions.length > 0) {
						// Auto-select first session if previous selection is invalid
						setSelectedSession(null)
						localStorage.removeItem(SESSION_STORAGE_KEY)
					}
				}
			}
		} catch (err) {
			console.error('Failed to fetch examination sessions:', err)
			if (mountedRef.current) {
				setError(err instanceof Error ? err.message : 'Failed to load sessions')
			}
		} finally {
			if (mountedRef.current) {
				setIsLoading(false)
				setIsInitialized(true)
			}
			fetchInProgressRef.current = false
		}
	}, [instInitialized, currentInstitutionId, selectedSession])

	useEffect(() => {
		mountedRef.current = true
		if (instInitialized) {
			fetchSessions()
		}
		return () => { mountedRef.current = false }
	}, [instInitialized, currentInstitutionId, fetchSessions])

	const selectSession = useCallback((session: ExaminationSession | null) => {
		setSelectedSession(session)
		requestAnimationFrame(() => {
			try {
				if (session) {
					localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
				} else {
					localStorage.removeItem(SESSION_STORAGE_KEY)
				}
			} catch { /* ignore */ }
		})
	}, [])

	const clearSessionSelection = useCallback(() => {
		setSelectedSession(null)
		requestAnimationFrame(() => {
			try { localStorage.removeItem(SESSION_STORAGE_KEY) } catch { /* ignore */ }
		})
	}, [])

	const refreshSessions = useCallback(async () => {
		fetchInProgressRef.current = false
		await fetchSessions()
	}, [fetchSessions])

	const sessionFilter = useMemo(() => {
		if (!selectedSession) return {}
		return { examination_session_id: selectedSession.id }
	}, [selectedSession])

	const shouldFilterBySession = useMemo(() => !!selectedSession, [selectedSession])
	const sessionId = useMemo(() => selectedSession?.id || null, [selectedSession])

	const value = useMemo<ExaminationSessionContextType>(() => ({
		currentSession: selectedSession,
		availableSessions,
		isLoading,
		isInitialized,
		error,
		selectSession,
		clearSessionSelection,
		refreshSessions,
		sessionFilter,
		shouldFilterBySession,
		sessionId,
	}), [
		selectedSession, availableSessions, isLoading, isInitialized, error,
		selectSession, clearSessionSelection, refreshSessions,
		sessionFilter, shouldFilterBySession, sessionId,
	])

	return (
		<ExaminationSessionContext.Provider value={value}>
			{children}
		</ExaminationSessionContext.Provider>
	)
}

export function useExaminationSession() {
	const context = useContext(ExaminationSessionContext)
	if (context === undefined) {
		throw new Error('useExaminationSession must be used within an ExaminationSessionProvider')
	}
	return context
}

export function useSessionFilter() {
	const { sessionFilter, shouldFilterBySession, sessionId, isLoading, isInitialized } = useExaminationSession()

	return useMemo(() => ({
		filter: sessionFilter,
		shouldFilter: shouldFilterBySession,
		sessionId,
		isReady: !isLoading && isInitialized,
	}), [sessionFilter, shouldFilterBySession, sessionId, isLoading, isInitialized])
}
