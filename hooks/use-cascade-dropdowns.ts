'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useMyJKKNInstitutionFilter, type ProgramOption, type SemesterOption } from '@/hooks/use-myjkkn-institution-filter'
import { useInstitution } from '@/context/institution-context'
import { useExaminationSession } from '@/context/examination-session-context'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CascadeInstitution {
	id: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids?: string[] | null
}

export interface CascadeSession {
	id: string
	session_name: string
	session_code?: string
	institutions_id?: string
}

export interface CascadeCourse {
	id: string
	course_code: string
	course_name: string
	[key: string]: unknown
}

export interface CascadeLevel<T> {
	data: T[]
	selected: string
	loading: boolean
	error: string | null
	setSelected: (value: string) => void
}

export interface CascadeConfig {
	/** Which levels to include in the cascade. Default: all 5 */
	levels?: ('institution' | 'session' | 'program' | 'semester' | 'course')[]

	/** Custom API endpoint for sessions (default: /api/exam-management/examination-sessions) */
	sessionsEndpoint?: string

	/** Custom API endpoint for courses */
	coursesEndpoint?: string

	/** Custom query params builder for courses */
	coursesParams?: (ctx: {
		institutionId: string
		institutionCode: string
		sessionId: string
		programCode: string
		semester: string
	}) => Record<string, string>

	/** Custom API endpoint for institutions (default: /api/master/institutions) */
	institutionsEndpoint?: string

	/** Whether session and program should fetch in parallel when institution changes (default: false) */
	parallelSessionProgram?: boolean

	/** Auto-fill institution from context for non-super_admin (default: true) */
	autoFillInstitution?: boolean

	/** Whether to enable the cascade (default: true) */
	enabled?: boolean

	/** Semester source: 'myjkkn' (external API) or 'coe' (local) with endpoint */
	semesterSource?: 'myjkkn' | { endpoint: string; params?: (ctx: { institutionId: string; sessionId: string; programCode: string }) => Record<string, string> }
}

interface CascadeState {
	// Institution
	institutions: CascadeInstitution[]
	selectedInstitutionId: string
	loadingInstitutions: boolean

	// Session
	sessions: CascadeSession[]
	selectedSessionId: string
	loadingSessions: boolean

	// Program (from MyJKKN)
	programs: ProgramOption[]
	selectedProgramCode: string
	loadingPrograms: boolean

	// Semester
	semesters: SemesterOption[]
	selectedSemester: string
	loadingSemesters: boolean

	// Course
	courses: CascadeCourse[]
	selectedCourseId: string
	loadingCourses: boolean
}

export interface UseCascadeDropdownsReturn {
	// Level data and controls
	institution: CascadeLevel<CascadeInstitution>
	session: CascadeLevel<CascadeSession>
	program: CascadeLevel<ProgramOption>
	semester: CascadeLevel<SemesterOption>
	course: CascadeLevel<CascadeCourse>

	// Context info
	isReady: boolean
	mustSelectInstitution: boolean
	mustSelectSession: boolean

	// Current institution's myjkkn IDs (for custom usage)
	myjkknInstitutionIds: string[]

	// Resolved institution code (from selected or context)
	effectiveInstitutionCode: string | null
	effectiveInstitutionId: string | null

	// Reset all selections
	resetAll: () => void

	// Reset from a specific level downward
	resetFrom: (level: 'session' | 'program' | 'semester' | 'course') => void
}

// ─── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<CascadeConfig> = {
	levels: ['institution', 'session', 'program', 'semester', 'course'],
	sessionsEndpoint: '/api/exam-management/examination-sessions',
	coursesEndpoint: '/api/course-management/course-offering',
	coursesParams: (ctx) => ({
		institutions_id: ctx.institutionId,
		examination_session_id: ctx.sessionId,
		program_code: ctx.programCode,
		semester: ctx.semester,
	}),
	institutionsEndpoint: '/api/master/institutions',
	parallelSessionProgram: false,
	autoFillInstitution: true,
	enabled: true,
	semesterSource: 'myjkkn',
}

// ─── Hook Implementation ────────────────────────────────────────────────────

export function useCascadeDropdowns(config?: CascadeConfig): UseCascadeDropdownsReturn {
	const cfg = { ...DEFAULT_CONFIG, ...config }
	const levels = new Set(cfg.levels)

	// Institution filter context
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId,
		institutionCode: contextInstitutionCode,
		myjkknInstitutionIds: contextMyjkknIds,
	} = useInstitutionFilter()

	const { availableInstitutions } = useInstitution()

	// Global session context - sync session selection from header
	const { currentSession: globalSession } = useExaminationSession()
	const mustSelectSession = !globalSession

	// MyJKKN API hook
	const { fetchPrograms: fetchMyJKKNPrograms, fetchSemesters: fetchMyJKKNSemesters } = useMyJKKNInstitutionFilter()

	// ─── State ────────────────────────────────────────────────────────────

	const [institutions, setInstitutions] = useState<CascadeInstitution[]>([])
	const [sessions, setSessions] = useState<CascadeSession[]>([])
	const [programs, setPrograms] = useState<ProgramOption[]>([])
	const [semesters, setSemesters] = useState<SemesterOption[]>([])
	const [courses, setCourses] = useState<CascadeCourse[]>([])

	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const [selectedSessionId, setSelectedSessionId] = useState('')
	const [selectedProgramCode, setSelectedProgramCode] = useState('')
	const [selectedSemester, setSelectedSemester] = useState('')
	const [selectedCourseId, setSelectedCourseId] = useState('')

	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingSemesters, setLoadingSemesters] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)

	const [errorInstitutions, setErrorInstitutions] = useState<string | null>(null)
	const [errorSessions, setErrorSessions] = useState<string | null>(null)
	const [errorPrograms, setErrorPrograms] = useState<string | null>(null)
	const [errorSemesters, setErrorSemesters] = useState<string | null>(null)
	const [errorCourses, setErrorCourses] = useState<string | null>(null)

	// Mounted ref to prevent state updates after unmount
	const mountedRef = useRef(true)
	useEffect(() => {
		mountedRef.current = true
		return () => { mountedRef.current = false }
	}, [])

	// ─── Derived values ───────────────────────────────────────────────────

	const selectedInstitution = useMemo(() =>
		institutions.find(i => i.id === selectedInstitutionId) || null,
		[institutions, selectedInstitutionId]
	)

	const effectiveInstitutionId = useMemo(() =>
		selectedInstitutionId || contextInstitutionId || null,
		[selectedInstitutionId, contextInstitutionId]
	)

	const effectiveInstitutionCode = useMemo(() => {
		if (selectedInstitution) return selectedInstitution.institution_code
		return contextInstitutionCode || null
	}, [selectedInstitution, contextInstitutionCode])

	const myjkknInstitutionIds = useMemo(() => {
		if (selectedInstitution?.myjkkn_institution_ids) {
			return selectedInstitution.myjkkn_institution_ids
		}
		return contextMyjkknIds || []
	}, [selectedInstitution, contextMyjkknIds])

	// ─── Reset helpers ────────────────────────────────────────────────────

	const resetSessions = useCallback(() => {
		setSessions([])
		setSelectedSessionId('')
		setErrorSessions(null)
	}, [])

	const resetPrograms = useCallback(() => {
		setPrograms([])
		setSelectedProgramCode('')
		setErrorPrograms(null)
	}, [])

	const resetSemesters = useCallback(() => {
		setSemesters([])
		setSelectedSemester('')
		setErrorSemesters(null)
	}, [])

	const resetCourses = useCallback(() => {
		setCourses([])
		setSelectedCourseId('')
		setErrorCourses(null)
	}, [])

	const resetFrom = useCallback((level: 'session' | 'program' | 'semester' | 'course') => {
		const levelOrder = ['session', 'program', 'semester', 'course'] as const
		const startIdx = levelOrder.indexOf(level)
		for (let i = startIdx; i < levelOrder.length; i++) {
			switch (levelOrder[i]) {
				case 'session': resetSessions(); break
				case 'program': resetPrograms(); break
				case 'semester': resetSemesters(); break
				case 'course': resetCourses(); break
			}
		}
	}, [resetSessions, resetPrograms, resetSemesters, resetCourses])

	const resetAll = useCallback(() => {
		setSelectedInstitutionId('')
		resetFrom('session')
	}, [resetFrom])

	// ─── Fetch: Institutions ──────────────────────────────────────────────

	const fetchInstitutions = useCallback(async () => {
		if (!levels.has('institution')) return
		setLoadingInstitutions(true)
		setErrorInstitutions(null)
		try {
			const url = appendToUrl(cfg.institutionsEndpoint)
			const res = await fetch(url)
			if (!res.ok) throw new Error('Failed to fetch institutions')
			const data = await res.json()
			if (!mountedRef.current) return
			const mapped: CascadeInstitution[] = (Array.isArray(data) ? data : []).map((i: any) => ({
				id: i.id,
				institution_code: i.institution_code,
				institution_name: i.institution_name || i.short_name || i.institution_code,
				myjkkn_institution_ids: i.myjkkn_institution_ids || null,
			}))
			setInstitutions(mapped)
		} catch (err) {
			if (mountedRef.current) setErrorInstitutions('Failed to load institutions')
		} finally {
			if (mountedRef.current) setLoadingInstitutions(false)
		}
	}, [appendToUrl, cfg.institutionsEndpoint])

	// ─── Fetch: Sessions ──────────────────────────────────────────────────

	const fetchSessions = useCallback(async (institutionId: string) => {
		if (!levels.has('session') || !institutionId) return
		setLoadingSessions(true)
		setErrorSessions(null)
		try {
			const res = await fetch(`${cfg.sessionsEndpoint}?institutions_id=${institutionId}`)
			if (!res.ok) throw new Error('Failed to fetch sessions')
			const data = await res.json()
			if (!mountedRef.current) return
			const list = Array.isArray(data) ? data : (data?.data ?? [])
			setSessions(list)
		} catch (err) {
			if (mountedRef.current) setErrorSessions('Failed to load sessions')
		} finally {
			if (mountedRef.current) setLoadingSessions(false)
		}
	}, [cfg.sessionsEndpoint])

	// ─── Fetch: Programs (MyJKKN) ─────────────────────────────────────────

	const fetchPrograms = useCallback(async (myjkknIds: string[]) => {
		if (!levels.has('program') || !myjkknIds.length) return
		setLoadingPrograms(true)
		setErrorPrograms(null)
		try {
			const progs = await fetchMyJKKNPrograms(myjkknIds)
			if (!mountedRef.current) return
			setPrograms(progs)
		} catch (err) {
			if (mountedRef.current) setErrorPrograms('Failed to load programs')
		} finally {
			if (mountedRef.current) setLoadingPrograms(false)
		}
	}, [fetchMyJKKNPrograms])

	// ─── Fetch: Semesters ─────────────────────────────────────────────────

	const fetchSemesters = useCallback(async (myjkknIds: string[], programCode: string) => {
		if (!levels.has('semester') || !programCode) return
		setLoadingSemesters(true)
		setErrorSemesters(null)
		try {
			if (cfg.semesterSource === 'myjkkn') {
				const sems = await fetchMyJKKNSemesters(myjkknIds, { program_code: programCode })
				if (!mountedRef.current) return
				setSemesters(sems)
			} else {
				// Custom COE endpoint
				const params = new URLSearchParams(
					cfg.semesterSource.params?.({
						institutionId: effectiveInstitutionId || '',
						sessionId: selectedSessionId,
						programCode,
					}) || {}
				)
				const res = await fetch(`${cfg.semesterSource.endpoint}?${params.toString()}`)
				if (!res.ok) throw new Error('Failed to fetch semesters')
				const data = await res.json()
				if (!mountedRef.current) return
				setSemesters(Array.isArray(data) ? data : (data?.data ?? []))
			}
		} catch (err) {
			if (mountedRef.current) setErrorSemesters('Failed to load semesters')
		} finally {
			if (mountedRef.current) setLoadingSemesters(false)
		}
	}, [fetchMyJKKNSemesters, cfg.semesterSource, effectiveInstitutionId, selectedSessionId])

	// ─── Fetch: Courses ───────────────────────────────────────────────────

	const fetchCourses = useCallback(async () => {
		if (!levels.has('course') || !effectiveInstitutionId || !selectedSessionId) return

		const params = cfg.coursesParams({
			institutionId: effectiveInstitutionId,
			institutionCode: effectiveInstitutionCode || '',
			sessionId: selectedSessionId,
			programCode: selectedProgramCode,
			semester: selectedSemester,
		})

		// Skip if required params are missing
		if (levels.has('program') && !selectedProgramCode) return
		if (levels.has('semester') && !selectedSemester) return

		setLoadingCourses(true)
		setErrorCourses(null)
		try {
			const searchParams = new URLSearchParams(params)
			const res = await fetch(`${cfg.coursesEndpoint}?${searchParams.toString()}`)
			if (!res.ok) throw new Error('Failed to fetch courses')
			const data = await res.json()
			if (!mountedRef.current) return
			setCourses(Array.isArray(data) ? data : (data?.data ?? []))
		} catch (err) {
			if (mountedRef.current) setErrorCourses('Failed to load courses')
		} finally {
			if (mountedRef.current) setLoadingCourses(false)
		}
	}, [
		effectiveInstitutionId, effectiveInstitutionCode, selectedSessionId,
		selectedProgramCode, selectedSemester, cfg.coursesEndpoint, cfg.coursesParams,
	])

	// ─── Cascade Effects ──────────────────────────────────────────────────

	// Level 0: Load institutions when context is ready
	useEffect(() => {
		if (!isReady || !cfg.enabled) return
		if (levels.has('institution')) {
			fetchInstitutions()
		}
	}, [isReady, cfg.enabled])

	// Level 0.5: Auto-fill institution from context
	useEffect(() => {
		if (!isReady || !cfg.autoFillInstitution) return
		if (!mustSelectInstitution && contextInstitutionId && !selectedInstitutionId) {
			// Non-super_admin: find institution in list or use context directly
			if (institutions.length > 0) {
				const exists = institutions.some(i => i.id === contextInstitutionId)
				if (exists) setSelectedInstitutionId(contextInstitutionId)
			} else if (contextInstitutionId) {
				// Institutions may not have loaded yet - set directly
				setSelectedInstitutionId(contextInstitutionId)
			}
		}
	}, [isReady, cfg.autoFillInstitution, mustSelectInstitution, contextInstitutionId, institutions, selectedInstitutionId])

	// Level 1.5: Auto-fill session from global context (header selector)
	useEffect(() => {
		if (!isReady || !globalSession) return
		if (levels.has('session') && sessions.length > 0) {
			const exists = sessions.some(s => s.id === globalSession.id)
			if (exists && selectedSessionId !== globalSession.id) {
				setSelectedSessionId(globalSession.id)
			}
		} else if (globalSession.id && selectedSessionId !== globalSession.id) {
			// Sessions list may not have loaded yet - set directly
			setSelectedSessionId(globalSession.id)
		}
	}, [isReady, globalSession, sessions, selectedSessionId])

	// Level 1 → 2: When institution changes, fetch sessions and programs
	useEffect(() => {
		if (!effectiveInstitutionId || !isReady) return

		// Reset downstream
		resetFrom('session')

		if (cfg.parallelSessionProgram && myjkknInstitutionIds.length > 0) {
			// Fetch sessions and programs in parallel
			Promise.all([
				levels.has('session') ? fetchSessions(effectiveInstitutionId) : Promise.resolve(),
				levels.has('program') ? fetchPrograms(myjkknInstitutionIds) : Promise.resolve(),
			])
		} else {
			// Sequential: fetch sessions first
			if (levels.has('session')) fetchSessions(effectiveInstitutionId)
		}
	}, [effectiveInstitutionId, isReady])

	// Level 2 → 3: When session changes, fetch programs (if not parallel)
	useEffect(() => {
		if (!selectedSessionId || cfg.parallelSessionProgram) return

		// Reset downstream from program
		resetPrograms()
		resetSemesters()
		resetCourses()

		if (levels.has('program') && myjkknInstitutionIds.length > 0) {
			fetchPrograms(myjkknInstitutionIds)
		}
	}, [selectedSessionId])

	// Level 3 → 4: When program changes, fetch semesters
	useEffect(() => {
		if (!selectedProgramCode) return

		// Reset downstream
		resetSemesters()
		resetCourses()

		if (levels.has('semester') && myjkknInstitutionIds.length > 0) {
			fetchSemesters(myjkknInstitutionIds, selectedProgramCode)
		}
	}, [selectedProgramCode])

	// Level 4 → 5: When semester changes, fetch courses
	useEffect(() => {
		if (!selectedSemester) return

		// Reset courses
		resetCourses()

		if (levels.has('course')) {
			fetchCourses()
		}
	}, [selectedSemester])

	// Special: If course level exists but semester doesn't, fetch courses when program changes
	useEffect(() => {
		if (!levels.has('semester') && levels.has('course') && selectedProgramCode && selectedSessionId) {
			resetCourses()
			fetchCourses()
		}
	}, [selectedProgramCode, selectedSessionId])

	// ─── Selection handlers with downstream reset ─────────────────────────

	const handleSetInstitution = useCallback((id: string) => {
		setSelectedInstitutionId(id)
		// Reset is handled by the useEffect above
	}, [])

	const handleSetSession = useCallback((id: string) => {
		setSelectedSessionId(id)
	}, [])

	const handleSetProgram = useCallback((code: string) => {
		setSelectedProgramCode(code)
	}, [])

	const handleSetSemester = useCallback((value: string) => {
		setSelectedSemester(value)
	}, [])

	const handleSetCourse = useCallback((id: string) => {
		setSelectedCourseId(id)
	}, [])

	// ─── Return ───────────────────────────────────────────────────────────

	return {
		institution: {
			data: institutions,
			selected: selectedInstitutionId,
			loading: loadingInstitutions,
			error: errorInstitutions,
			setSelected: handleSetInstitution,
		},
		session: {
			data: sessions,
			selected: selectedSessionId,
			loading: loadingSessions,
			error: errorSessions,
			setSelected: handleSetSession,
		},
		program: {
			data: programs,
			selected: selectedProgramCode,
			loading: loadingPrograms,
			error: errorPrograms,
			setSelected: handleSetProgram,
		},
		semester: {
			data: semesters,
			selected: selectedSemester,
			loading: loadingSemesters,
			error: errorSemesters,
			setSelected: handleSetSemester,
		},
		course: {
			data: courses,
			selected: selectedCourseId,
			loading: loadingCourses,
			error: errorCourses,
			setSelected: handleSetCourse,
		},
		isReady,
		mustSelectInstitution,
		mustSelectSession,
		myjkknInstitutionIds,
		effectiveInstitutionCode,
		effectiveInstitutionId,
		resetAll,
		resetFrom,
	}
}
