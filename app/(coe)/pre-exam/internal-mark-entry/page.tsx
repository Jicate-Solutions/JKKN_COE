"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { useSessionSync } from "@/hooks/use-session-sync"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { Save, Loader2, Search, RefreshCw, AlertTriangle, Check, ChevronsUpDown, Download } from "lucide-react"
import { numberToWords } from "@/services/post-exam/external-mark-entry-service"

// Types
interface Institution {
	id: string
	name: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids: string[]
}

interface Session {
	id: string
	session_name: string
	session_code: string
	institutions_id?: string
}

interface Program {
	id: string
	program_code: string
	program_name: string
	program_type: string | null
	program_order: number | null
}

interface CourseOffering {
	course_offering_id: string
	course_mapping_id: string
	course_id: string
	course_code: string
	course_name: string
	internal_max_mark: number
	course_order: number
	program_id: string
	program_code: string
	semester: number
}

interface Learner {
	id: string // exam_registration_id
	student_id: string
	stu_register_no: string
	student_name: string
	course_offering_id: string
	institutions_id: string
}

interface PatternComponent {
	component_code: string
	component_name: string
	weightage_percentage?: number
	display_order: number
	is_mandatory?: boolean
}

// Column colours per paper part, so Part A / B / C read at a glance across a wide
// grid. The entry field carries the same colour as its header.
const PART_PALETTE = [
	{ head: 'bg-emerald-700', edge: 'border-l-emerald-400', cell: 'bg-emerald-50/40 dark:bg-emerald-950/20', field: 'border-emerald-300 bg-emerald-50/70 focus:border-emerald-600' },
	{ head: 'bg-sky-700', edge: 'border-l-sky-400', cell: 'bg-sky-50/40 dark:bg-sky-950/20', field: 'border-sky-300 bg-sky-50/70 focus:border-sky-600' },
	{ head: 'bg-violet-700', edge: 'border-l-violet-400', cell: 'bg-violet-50/40 dark:bg-violet-950/20', field: 'border-violet-300 bg-violet-50/70 focus:border-violet-600' },
	{ head: 'bg-amber-700', edge: 'border-l-amber-400', cell: 'bg-amber-50/40 dark:bg-amber-950/20', field: 'border-amber-300 bg-amber-50/70 focus:border-amber-600' },
	{ head: 'bg-rose-700', edge: 'border-l-rose-400', cell: 'bg-rose-50/40 dark:bg-rose-950/20', field: 'border-rose-300 bg-rose-50/70 focus:border-rose-600' },
]

// Frozen left columns. The `left` offset of each one is the sum of the widths
// before it, so the widths MUST be pinned exactly — a column that sizes to its
// content drifts away from its offset and the frozen columns overlap.
const FROZEN_W = { sno: 48, register: 130, name: 190 }
const FROZEN = { sno: 0, register: FROZEN_W.sno, name: FROZEN_W.sno + FROZEN_W.register }
const frozenSize = (w: number) => ({ width: w, minWidth: w, maxWidth: w })

// ─── Question-wise entry (mark_entry_type = 'question_wise' on the CIA round) ───
// Columns come from the round's question paper, not from the CIA setting.
interface PaperQuestion {
	id: string
	label: string
	part_label: string | null
	/** Questions sharing this key are OR alternatives — only one may be answered */
	choice_group: string
	/**
	 * The OR branch this column belongs to (the paper question's id). A question
	 * split into sub-divisions ("12 a) i. / ii.") yields several columns sharing
	 * one branch — all answerable together, while the other branch stays locked.
	 */
	branch_id: string
	marks: number
	is_choice_alternative: boolean
	/** Course outcome tagged on the paper (e.g. "CO2") */
	co_code: string | null
	/** Bloom's / knowledge level tagged on the paper (e.g. "K3") */
	k_level: string | null
	question_text: string | null
}

interface PaperPart {
	part_label: string
	group_count: number
	/** "Answer any N" — null when every question in the part must be answered */
	num_to_answer: number | null
}

interface QuestionPaper {
	id: string
	set_number: number
	set_label: string | null
	subject_title: string | null
	max_marks: number | null
	status: 'draft' | 'submitted' | 'approved' | 'locked'
	questions: PaperQuestion[]
	parts: PaperPart[]
	questions_total: number
}

// ─── Number to words (for marks in words column) ───
// Digit-by-digit words ("28" → "TWO EIGHT") — shared with all mark PDFs.

export default function InternalMarkEntryPage() {
	const { toast } = useToast()
	const { user } = useAuth()

	const {
		filter,
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId
	} = useInstitutionFilter()

	const { selectedSessionId: selectedSession, setSelectedSessionId: setSelectedSession, mustSelectSession } = useSessionSync()
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()

	// Data state
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [assessmentOptions, setAssessmentOptions] = useState<{ id: string, label: string, status: 'open' | 'expired' | 'upcoming' | 'no-dates', setting: any, round: any }[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [availableSemesters, setAvailableSemesters] = useState<number[]>([])
	const [courseOfferings, setCourseOfferings] = useState<CourseOffering[]>([])
	const [learners, setLearners] = useState<Learner[]>([])
	const [components, setComponents] = useState<PatternComponent[]>([])

	// Local institution selection (for super_admin with "All Institutions" global filter)
	const [localInstitutionId, setLocalInstitutionId] = useState("")

	// Effective institution ID: global filter takes priority, fallback to local selection
	const effectiveInstitutionId = institutionId || localInstitutionId || ""

	// Filter state
	const [selectedAssessment, setSelectedAssessment] = useState("")
	const [selectedProgram, setSelectedProgram] = useState("")
	const [selectedSemester, setSelectedSemester] = useState("")
	const [selectedCourseOffering, setSelectedCourseOffering] = useState("")

	// Derived from selected assessment
	const activeAssessment = useMemo(() =>
		assessmentOptions.find(a => a.id === selectedAssessment) || null,
		[assessmentOptions, selectedAssessment]
	)
	const ciaConfig = activeAssessment ? {
		setting_id: activeAssessment.setting.id,
		total_rounds: activeAssessment.setting.total_rounds,
		use_course_max: activeAssessment.setting.use_course_max,
		cia_rounds: activeAssessment.setting.cia_rounds,
	} : null
	const selectedCiaRound = activeAssessment ? String(activeAssessment.round.round) : ""

	// Mark entry state
	const [maxMarks, setMaxMarks] = useState<Record<string, number>>({})
	const [learnerMarks, setLearnerMarks] = useState<Record<string, Record<string, number>>>({})
	const [errors, setErrors] = useState<Record<string, Record<string, string>>>({})

	// ─── Crash-safe local draft ───
	// Marks live in React state until Save, so a refresh, a dead connection or a
	// closed tab used to lose everything keyed in so far. Every keystroke is
	// mirrored to localStorage (no network involved, so it survives an outage) and
	// offered back on return. Cleared once a save succeeds.
	const [isDirty, setIsDirty] = useState(false)
	const [pendingDraft, setPendingDraft] = useState<{
		saved_at: string
		learner_marks: Record<string, Record<string, number>>
		question_marks: Record<string, Record<string, number>>
		question_component: string
		count: number
	} | null>(null)
	const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const buildDraftKey = (sessionId?: string | null, settingId?: string | null, round?: string | number, courseOfferingId?: string | null) =>
		sessionId && courseOfferingId ? `coe:ime-draft:${sessionId}:${settingId || 'none'}:${round || 1}:${courseOfferingId}` : ''

	const draftKey = useMemo(
		() => buildDraftKey(selectedSession, activeAssessment?.setting?.id, selectedCiaRound, selectedCourseOffering),
		[selectedSession, activeAssessment, selectedCiaRound, selectedCourseOffering]
	)

	const clearDraft = (key?: string) => {
		const k = key || draftKey
		if (!k) return
		try { window.localStorage.removeItem(k) } catch { /* storage unavailable */ }
	}

	// ─── Question-wise state ───
	// The round says HOW marks are keyed in; the question paper says WHAT the columns are.
	const isQuestionWise = (activeAssessment?.round?.mark_entry_type || 'direct') === 'question_wise'
	const [papers, setPapers] = useState<QuestionPaper[]>([])
	const [papersLoading, setPapersLoading] = useState(false)
	const [selectedPaperId, setSelectedPaperId] = useState("")
	// Which component the paper's questions add up to (Test 1, Mid Term, ...)
	const [questionComponent, setQuestionComponent] = useState("")
	// examRegId → questionId → mark
	const [questionMarks, setQuestionMarks] = useState<Record<string, Record<string, number>>>({})

	const activePaper = useMemo(
		() => papers.find(p => p.id === selectedPaperId) || null,
		[papers, selectedPaperId]
	)
	// Question columns only render once a paper is resolved; without one the round
	// falls back to plain component entry so the page is never a dead end.
	const questionColumns = useMemo(
		() => (isQuestionWise && activePaper ? activePaper.questions : []),
		[isQuestionWise, activePaper]
	)

	// Mirror unsaved marks to localStorage, debounced. Only runs once the user has
	// actually typed, so freshly loaded DB values never masquerade as a draft.
	useEffect(() => {
		if (!isDirty || !draftKey) return
		if (draftTimer.current) clearTimeout(draftTimer.current)
		draftTimer.current = setTimeout(() => {
			try {
				const entered = Object.values(learnerMarks).filter(m => m && Object.keys(m).length > 0).length
				window.localStorage.setItem(draftKey, JSON.stringify({
					saved_at: new Date().toISOString(),
					learner_marks: learnerMarks,
					question_marks: questionMarks,
					question_component: questionComponent,
					count: entered,
				}))
			} catch {
				// Quota exceeded or storage blocked — entry must not break because of it
			}
		}, 600)
		return () => { if (draftTimer.current) clearTimeout(draftTimer.current) }
	}, [learnerMarks, questionMarks, questionComponent, isDirty, draftKey])

	// Warn before losing unsaved marks to a tab close or reload
	useEffect(() => {
		if (!isDirty) return
		const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
		window.addEventListener('beforeunload', handler)
		return () => window.removeEventListener('beforeunload', handler)
	}, [isDirty])

	// Grouped programs (UG first, then PG, sorted by program_order)
	const ugPrograms = useMemo(() =>
		programs.filter(p => (p.program_type || '').toUpperCase() !== 'PG')
			.sort((a, b) => (a.program_order ?? 999) - (b.program_order ?? 999)),
		[programs]
	)
	const pgPrograms = useMemo(() =>
		programs.filter(p => (p.program_type || '').toUpperCase() === 'PG')
			.sort((a, b) => (a.program_order ?? 999) - (b.program_order ?? 999)),
		[programs]
	)

	// Course offerings are already filtered by semester from API — no client-side filter needed

	// UI state
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [hasSaved, setHasSaved] = useState(false)
	// Mode: 'entry' (strict, all-mandatory), 'view' (read-only), 'edit' (partial updates)
	const [viewMode, setViewMode] = useState<'entry' | 'view' | 'edit'>('entry')
	const [searchTerm, setSearchTerm] = useState("")
	const [learnersLoading, setLearnersLoading] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)

	// Derived: selected course info
	const selectedCourse = useMemo(() => {
		return courseOfferings.find(co => co.course_offering_id === selectedCourseOffering)
	}, [courseOfferings, selectedCourseOffering])

	// Total max marks from components
	const totalMaxMarks = useMemo(() => {
		return Object.values(maxMarks).reduce((sum, val) => sum + (val || 0), 0)
	}, [maxMarks])

	// Choice groups + "answer any N" limits for the active paper, indexed once.
	const paperRules = useMemo(() => {
		const groups = new Map<string, PaperQuestion[]>()       // choice group → its questions
		const partGroups = new Map<string, string[]>()          // part label → ordered group keys
		const partLimit = new Map<string, number>()             // part label → answer-any-N
		for (const q of questionColumns) {
			if (!groups.has(q.choice_group)) groups.set(q.choice_group, [])
			groups.get(q.choice_group)!.push(q)
			const part = q.part_label || ''
			const keys = partGroups.get(part) || []
			if (!keys.includes(q.choice_group)) keys.push(q.choice_group)
			partGroups.set(part, keys)
		}
		for (const p of activePaper?.parts || []) {
			if (p.num_to_answer != null) partLimit.set(p.part_label || '', p.num_to_answer)
		}
		return { groups, partGroups, partLimit }
	}, [questionColumns, activePaper])

	// Stable colour slot per part, following the paper's own part order
	const partIndexOf = useMemo(() => {
		const order = new Map<string, number>()
		for (const p of activePaper?.parts || []) order.set(p.part_label || '', order.size)
		for (const q of questionColumns) {
			const part = q.part_label || ''
			if (!order.has(part)) order.set(part, order.size)
		}
		return order
	}, [activePaper, questionColumns])

	const partStyle = (part: string | null) => PART_PALETTE[(partIndexOf.get(part || '') ?? 0) % PART_PALETTE.length]

	// Plain-language summary of what the paper restricts, shown above the grid
	const answerRuleHints = useMemo(() => {
		const hints: string[] = []
		for (const p of activePaper?.parts || []) {
			if (p.num_to_answer != null && p.num_to_answer < p.group_count) {
				hints.push(`Part ${p.part_label}: answer any ${p.num_to_answer} of ${p.group_count}`)
			}
		}
		const hasChoicePairs = [...paperRules.groups.values()].some(
			g => new Set(g.map(q => q.branch_id)).size > 1
		)
		if (hasChoicePairs) hints.push('OR pairs: only one answer each')
		return hints
	}, [activePaper, paperRules])

	// Why this question is closed for this learner — null when it can be answered.
	// A question that already holds a mark always stays editable so it can be cleared.
	const questionLockReason = (examRegId: string, q: PaperQuestion): string | null => {
		const marks = questionMarks[examRegId] || {}
		if (marks[q.id] !== undefined) return null

		// Only the OTHER branch of the pair locks this one — sibling sub-divisions of
		// the same branch (12a i. / ii.) are answered together.
		const siblings = paperRules.groups.get(q.choice_group) || []
		const answeredSibling = siblings.find(s => s.branch_id !== q.branch_id && marks[s.id] !== undefined)
		if (answeredSibling) return `Q${answeredSibling.label} is answered — only one of the OR pair`

		const part = q.part_label || ''
		const limit = paperRules.partLimit.get(part)
		if (limit != null) {
			const answered = (paperRules.partGroups.get(part) || []).filter(key =>
				(paperRules.groups.get(key) || []).some(gq => marks[gq.id] !== undefined)
			).length
			if (answered >= limit) return `Part ${part}: answer any ${limit} only`
		}
		return null
	}

	// Entry grid columns, flattened so the header, the body and Enter-key navigation
	// all walk the same list. A question-wise component expands into one column per
	// question followed by its (read-only) component total.
	type EntryColumn =
		| { kind: 'component'; code: string; name: string; max: number }
		| { kind: 'question'; code: string; question: PaperQuestion }
		| { kind: 'component_total'; code: string; name: string; max: number }

	const entryColumns = useMemo<EntryColumn[]>(() => {
		const active = components.filter(c => (maxMarks[c.component_code] || 0) > 0)
		const cols: EntryColumn[] = []
		for (const c of active) {
			const max = maxMarks[c.component_code] || 0
			if (questionColumns.length > 0 && c.component_code === questionComponent) {
				for (const q of questionColumns) cols.push({ kind: 'question', code: c.component_code, question: q })
				cols.push({ kind: 'component_total', code: c.component_code, name: c.component_name, max })
			} else {
				cols.push({ kind: 'component', code: c.component_code, name: c.component_name, max })
			}
		}
		return cols
	}, [components, maxMarks, questionColumns, questionComponent])

	// Filtered learners by search
	const filteredLearners = useMemo(() => {
		if (!searchTerm) return learners
		const term = searchTerm.toLowerCase()
		return learners.filter(l =>
			l.stu_register_no?.toLowerCase().includes(term) ||
			l.student_name?.toLowerCase().includes(term)
		)
	}, [learners, searchTerm])

	// ===== Data Fetching — Cascading: Institution → Session → Assessment → Program → Semester → Course =====

	const cascadeBaseUrl = (instId: string, sessionId: string) =>
		`/api/pre-exam/internal-mark-entry?action=filter-cascade&institutions_id=${instId}&examination_session_id=${sessionId}`

	// 1. Load institutions + sessions on mount
	useEffect(() => {
		if (isReady) { fetchInstitutions(); fetchSessions() }
	}, [isReady])

	// 1b. Pre-fetch MyJKKN programs when institution is known (warms cache for instant load later)
	useEffect(() => {
		if (isReady && effectiveInstitutionId && institutions.length > 0) {
			getMyJKKNPrograms().catch(() => {})
		}
	}, [isReady, effectiveInstitutionId, institutions.length])

	// 2. When institution + session set → fetch assessments (CIA settings with active entry dates)
	useEffect(() => {
		// Reset downstream first
		setSelectedAssessment("")
		setPrograms([]); setSelectedProgram("")
		setAvailableSemesters([]); setSelectedSemester("")
		setCourseOfferings([]); setSelectedCourseOffering("")
		setLearners([]); setComponents([]); setMaxMarks({}); setLearnerMarks({}); setErrors({})
		// Then fetch
		if (isReady && effectiveInstitutionId && selectedSession) {
			fetchAssessments()
		} else {
			setAssessmentOptions([])
		}
	}, [isReady, institutionId, localInstitutionId, selectedSession])

	// 3. When assessment selected → fetch programs (filtered to setting's program_codes)
	useEffect(() => {
		setSelectedProgram(""); setAvailableSemesters([]); setSelectedSemester("")
		setCourseOfferings([]); setSelectedCourseOffering("")
		setLearners([]); setComponents([]); setMaxMarks({}); setLearnerMarks({}); setErrors({})
		if (isReady && effectiveInstitutionId && selectedSession && selectedAssessment && institutions.length > 0) {
			fetchPrograms()
		} else {
			setPrograms([])
		}
	}, [selectedAssessment])

	// 4. When program selected → fetch semesters
	useEffect(() => {
		setAvailableSemesters([]); setSelectedSemester("")
		setCourseOfferings([]); setSelectedCourseOffering("")
		setLearners([]); setComponents([]); setMaxMarks({}); setLearnerMarks({}); setErrors({})
		if (isReady && effectiveInstitutionId && selectedSession && selectedProgram) {
			const prog = programs.find(p => p.id === selectedProgram)
			if (prog?.program_code) fetchSemesters(prog.program_code)
		}
	}, [selectedProgram])

	// 5. When semester selected → fetch courses (filtered by setting's course_categories)
	useEffect(() => {
		setCourseOfferings([]); setSelectedCourseOffering("")
		setLearners([]); setComponents([]); setMaxMarks({}); setLearnerMarks({}); setErrors({})
		if (isReady && effectiveInstitutionId && selectedSession && selectedProgram && selectedSemester) {
			const prog = programs.find(p => p.id === selectedProgram)
			if (prog?.program_code) {
					const currentAssessment = assessmentOptions.find(a => a.id === selectedAssessment)
					const cats: string[] = Array.isArray(currentAssessment?.setting?.course_type) ? currentAssessment.setting.course_type : []
					fetchCourses(prog.program_code, selectedSemester, cats)
				}
		}
	}, [selectedSemester])

	// Reset "hasSaved" + viewMode whenever the user changes any context.
	// Prevents stale state (Download PDF button + tab selection) across course switches.
	useEffect(() => {
		setHasSaved(false)
		setViewMode('entry')
	}, [selectedSession, selectedAssessment, selectedProgram, selectedSemester, selectedCourseOffering, effectiveInstitutionId])

	// 6. When course selected → load components from assessment round + fetch learners
	useEffect(() => {
		if (selectedCourseOffering && selectedSession && activeAssessment) {
			const round = activeAssessment.round
			if (round) {
				const comps = round.components.map((c: any) => ({
					component_code: c.code,
					component_name: c.name,
					display_order: 0,
				}))
				setComponents(comps)

				const co = courseOfferings.find(c => c.course_offering_id === selectedCourseOffering)
				const courseMax = co?.internal_max_mark || 0
				const initialMax: Record<string, number> = {}
				round.components.forEach((c: any) => {
					initialMax[c.code] = activeAssessment.setting.use_course_max && round.components.length === 1
						? courseMax : (c.max_marks || 0)
				})
				setMaxMarks(initialMax)

				// Question-wise rounds pull their columns from the round's question paper
				if ((round.mark_entry_type || 'direct') === 'question_wise' && ciaConfig?.setting_id) {
					fetchQuestionPapers(ciaConfig.setting_id, round.round, selectedCourseOffering, round.components)
				} else {
					setPapers([]); setSelectedPaperId(""); setQuestionComponent(""); setQuestionMarks({})
				}
			}
			fetchLearners(selectedCourseOffering, selectedSession, Number(selectedCiaRound) || undefined)
		} else {
			setLearners([]); setComponents([]); setMaxMarks({}); setLearnerMarks({}); setErrors({})
			setPapers([]); setSelectedPaperId(""); setQuestionComponent(""); setQuestionMarks({})
			setPendingDraft(null); setIsDirty(false)
		}
	}, [selectedCourseOffering])

	// ===== Fetch Functions =====

	const fetchInstitutions = async () => {
		try {
			const url = appendToUrl('/api/pre-exam/internal-marks?action=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data.map((i: any) => ({
					id: i.id,
					name: i.name || i.institution_name,
					institution_code: i.institution_code,
					institution_name: i.institution_name || i.name,
					myjkkn_institution_ids: i.myjkkn_institution_ids || [],
				})))
			}
		} catch (error) {
			console.error('Failed to fetch institutions:', error)
		}
	}

	const fetchSessions = async () => {
		try {
			const res = await fetch('/api/pre-exam/internal-marks?action=sessions')
			if (res.ok) setSessions(await res.json())
		} catch (error) {
			console.error('Failed to fetch sessions:', error)
		}
	}

	const fetchAssessments = async () => {
		try {
			const res = await fetch(`/api/pre-exam/cia-entry-settings?institutions_id=${effectiveInstitutionId}&examination_session_id=${selectedSession}`)
			if (!res.ok) { setAssessmentOptions([]); return }
			const settings = await res.json()

			// Compute "today" in Indian Standard Time (UTC+5:30) so the cutoff
			// matches the institution's calendar regardless of the user's machine
			// timezone or whether the browser was opened from outside India.
			const today = new Intl.DateTimeFormat('en-CA', {
				timeZone: 'Asia/Kolkata',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
			}).format(new Date()) // → "YYYY-MM-DD"
			const options: typeof assessmentOptions = []

			for (const setting of settings) {
				for (const round of (setting.cia_rounds || [])) {
					const from = round.entry_from || ''
					const to = round.entry_to || '9999-12-31'

					// Strict cutoff: entry closes once `today` reaches `entry_to`.
					// "entry to 2026-05-01" means submissions are blocked starting
					// 2026-05-01 — the deadline date itself is closed, not open.
					let status: 'open' | 'expired' | 'upcoming' | 'no-dates' = 'no-dates'
					if (from) {
						if (today < from) status = 'upcoming'
						else if (today >= to) status = 'expired'
						else status = 'open'
					}

					options.push({
						id: `${setting.id}__${round.round}`,
						label: `${setting.setting_name} - ${round.round_name}`,
						status,
						setting,
						round,
					})
				}
			}
			setAssessmentOptions(options)
		} catch (error) {
			console.error('Failed to fetch assessments:', error)
			setAssessmentOptions([])
		}
	}

	// Cache MyJKKN programs — single shared promise to prevent duplicate calls
	const myjkknCacheRef = React.useRef<{ promise: Promise<any[]> | null, data: any[] }>({ promise: null, data: [] })

	const getMyJKKNPrograms = async (): Promise<any[]> => {
		if (myjkknCacheRef.current.data.length > 0) return myjkknCacheRef.current.data
		if (myjkknCacheRef.current.promise) return myjkknCacheRef.current.promise

		const inst = institutions.find(i => i.id === effectiveInstitutionId)
		const myjkknIds = inst?.myjkkn_institution_ids || []
		if (myjkknIds.length === 0) return []

		myjkknCacheRef.current.promise = fetchMyJKKNPrograms(myjkknIds)
		const result = await myjkknCacheRef.current.promise
		myjkknCacheRef.current.data = result
		myjkknCacheRef.current.promise = null
		return result
	}

	const fetchPrograms = async () => {
		try {
			if (!activeAssessment) { setPrograms([]); return }

			const settingProgramCodes: string[] = activeAssessment.setting.program_codes || []

			// Parallel: registered codes + MyJKKN programs (from cache or single fetch)
			const [registeredCodes, myjkknProgs] = await Promise.all([
				fetch(`${cascadeBaseUrl(effectiveInstitutionId, selectedSession!)}&step=programs`).then(r => r.ok ? r.json() : []),
				getMyJKKNPrograms(),
			])

			const validCodes = settingProgramCodes.length > 0
				? registeredCodes.filter((c: string) => settingProgramCodes.includes(c))
				: registeredCodes

			if (validCodes.length === 0) { setPrograms([]); return }

			if (myjkknProgs.length > 0) {
				const matched = myjkknProgs
					.filter((p: any) => validCodes.includes(p.program_code || p.program_id))
					.map((p: any) => ({
						id: p.id,
						program_code: p.program_code || p.program_id,
						program_name: p.program_name || p.name,
						program_type: p.program_type || null,
						program_order: p.program_order ?? null,
					}))
				// Add any valid codes not found in MyJKKN as plain entries
				const matchedCodes = new Set(matched.map((p: any) => p.program_code))
				const unmatched = validCodes
					.filter((code: string) => !matchedCodes.has(code))
					.map((code: string) => ({ id: code, program_code: code, program_name: code, program_type: null, program_order: null }))
				setPrograms([...matched, ...unmatched])
			} else {
				setPrograms(validCodes.map((code: string) => ({ id: code, program_code: code, program_name: code, program_type: null, program_order: null })))
			}
		} catch (error) {
			console.error('Failed to fetch programs:', error)
			setPrograms([])
		}
	}

	const fetchSemesters = async (programCode: string) => {
		try {
			const res = await fetch(`${cascadeBaseUrl(effectiveInstitutionId, selectedSession!)}&step=semesters&program_code=${programCode}`)
			if (res.ok) setAvailableSemesters(await res.json())
			else setAvailableSemesters([])
		} catch (error) {
			console.error('Failed to fetch semesters:', error)
			setAvailableSemesters([])
		}
	}

	const fetchCourses = async (programCode: string, semester: string, courseCategories: string[] = []) => {
		try {
			setLoading(true)
			const res = await fetch(`${cascadeBaseUrl(effectiveInstitutionId, selectedSession!)}&step=courses&program_code=${programCode}&semester=${semester}`)
			if (res.ok) {
				let data = await res.json()
				// Filter by course categories from CIA setting (case-insensitive)
				if (courseCategories.length > 0) {
					const lowerCats = courseCategories.map(c => c.toLowerCase())
					data = data.filter((co: any) => {
						const cat = (co.course_category || '').toLowerCase()
						return cat && lowerCats.includes(cat)
					})
				}
				setCourseOfferings(data)
			} else {
				setCourseOfferings([])
			}
		} catch (error) {
			console.error('Failed to fetch courses:', error)
			setCourseOfferings([])
		} finally {
			setLoading(false)
		}
	}

	const fetchLearners = async (courseOfferingId: string, sessionId: string, ciaRound?: number) => {
		try {
			setLearnersLoading(true)
			let url = `/api/pre-exam/internal-mark-entry?action=learners&course_offering_id=${courseOfferingId}&examination_session_id=${sessionId}`
			if (ciaRound) url += `&cia_round=${ciaRound}`
			// Pass program_code to filter learners by selected program
			const prog = programs.find(p => p.id === selectedProgram)
			if (prog?.program_code) url += `&program_code=${prog.program_code}`
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setLearners(data)

				// Initialize marks — pre-fill from saved_marks if available
				const markFieldMap: Record<string, string> = {
					'assignment': 'assignment_marks', 'quiz': 'quiz_marks', 'mid_term': 'mid_term_marks',
					'presentation': 'presentation_marks', 'attendance': 'attendance_marks', 'lab': 'lab_marks',
					'project': 'project_marks', 'seminar': 'seminar_marks', 'viva': 'viva_marks',
					'test_1': 'test_1_mark', 'test_2': 'test_2_mark', 'test_3': 'test_3_mark', 'other': 'other_marks',
				}
				const marks: Record<string, Record<string, number>> = {}
				// Per-question breakdown for question-wise rounds, keyed by question id.
				// Question ids are unique per paper, so flattening across components is safe.
				const qMarks: Record<string, Record<string, number>> = {}
				data.forEach((l: any) => {
					marks[l.id] = {}
					const savedQuestions = l.saved_marks?.question_marks
					if (savedQuestions && typeof savedQuestions === 'object') {
						const flat: Record<string, number> = {}
						for (const entry of Object.values(savedQuestions) as any[]) {
							if (!entry || typeof entry !== 'object' || !entry.marks) continue
							for (const [qId, val] of Object.entries(entry.marks)) {
								const num = Number(val)
								if (val != null && !isNaN(num)) flat[qId] = num
							}
						}
						if (Object.keys(flat).length > 0) qMarks[l.id] = flat
					}
					if (l.saved_marks) {
						// Pre-fill from saved cia_marks row — standard fixed columns.
						// Include 0 (a valid saved mark) — only skip null/undefined.
						for (const [compCode, dbField] of Object.entries(markFieldMap)) {
							const val = l.saved_marks[dbField]
							if (val != null) marks[l.id][compCode] = Number(val) || 0
						}
						// Custom components (added via CIA settings) live in extra_marks JSONB.
						// Same rule: explicit 0 round-trips, missing keys stay missing.
						const extra = l.saved_marks.extra_marks
						if (extra && typeof extra === 'object') {
							for (const [compCode, val] of Object.entries(extra)) {
								if (val == null) continue
								const num = Number(val)
								if (!isNaN(num)) marks[l.id][compCode] = num
							}
						}
					}
				})
				setLearnerMarks(marks)
				setQuestionMarks(qMarks)
				setErrors({})
				setIsDirty(false)

				// Offer back anything left unsaved from a previous attempt rather than
				// silently overwriting it — the user decides whether to restore.
				const key = buildDraftKey(sessionId, activeAssessment?.setting?.id, ciaRound ?? 1, courseOfferingId)
				try {
					const raw = key ? window.localStorage.getItem(key) : null
					const draft = raw ? JSON.parse(raw) : null
					// Drop anything stale so abandoned drafts don't haunt a later session
					const ageDays = draft?.saved_at
						? (Date.now() - new Date(draft.saved_at).getTime()) / 86400000
						: Infinity
					if (draft?.learner_marks && ageDays <= 7) {
						setPendingDraft(draft)
					} else {
						if (draft) clearDraft(key)
						setPendingDraft(null)
					}
				} catch {
					setPendingDraft(null)
				}
			} else {
				setLearners([])
			}
		} catch (error) {
			console.error('Failed to fetch learners:', error)
			setLearners([])
		} finally {
			setLearnersLoading(false)
		}
	}

	// Load the question paper(s) for a question-wise round and pick sensible defaults:
	// the lowest set number, and the component whose max marks the paper matches.
	const fetchQuestionPapers = async (
		settingId: string,
		round: number,
		courseOfferingId: string,
		roundComponents: any[]
	) => {
		try {
			setPapersLoading(true)
			setQuestionMarks({})
			let url = `/api/pre-exam/internal-mark-entry?action=question-paper&cia_setting_id=${settingId}&cia_round=${round}&course_offering_id=${courseOfferingId}`
			if (selectedSession) url += `&examination_session_id=${selectedSession}`
			const res = await fetch(url)
			if (!res.ok) { setPapers([]); setSelectedPaperId(""); return }
			const data: QuestionPaper[] = await res.json()
			setPapers(data)
			const first = data[0] || null
			setSelectedPaperId(first?.id || "")

			// Attendance is computed from periods, so it can never be the paper's component.
			const candidates = (roundComponents || []).filter((c: any) => c.code !== 'attendance')
			const paperTotal = first?.max_marks ?? first?.questions_total ?? 0
			const matched = candidates.find((c: any) => Number(c.max_marks) === Number(paperTotal))
			setQuestionComponent(matched?.code || candidates[0]?.code || "")
		} catch (error) {
			console.error('Failed to fetch question papers:', error)
			setPapers([]); setSelectedPaperId("")
		} finally {
			setPapersLoading(false)
		}
	}

	const fetchPatternComponents = async (courseId: string, programId: string, courseOfferingId: string) => {
		try {
			const instId = effectiveInstitutionId
			if (!instId) return

			const res = await fetch(`/api/pre-exam/internal-mark-entry?action=pattern-components&course_id=${courseId}&program_id=${programId}&institutions_id=${instId}`)
			if (res.ok) {
				const data = await res.json()
				const comps = data.components || []
				setComponents(comps)
				// Initialize max marks to 0 for each component
				const initialMax: Record<string, number> = {}
				comps.forEach((c: PatternComponent) => {
					initialMax[c.component_code] = 0
				})
				setMaxMarks(initialMax)
			}
		} catch (error) {
			console.error('Failed to fetch pattern components:', error)
		}
	}

	// ===== Mark Entry Handlers =====

	const handleMaxMarkChange = (componentCode: string, value: string) => {
		const numValue = value === '' ? 0 : parseInt(value, 10)
		if (isNaN(numValue) || numValue < 0) return
		setMaxMarks(prev => ({ ...prev, [componentCode]: numValue }))
	}

	// Auto-advance: move to next input on Enter key.
	// Skips cells closed by an OR choice or an "answer any N" limit, and columns
	// that render no input at all (a question-wise component's total).
	const focusableMarkCell = (row: number, col: number): HTMLInputElement | null => {
		const el = document.querySelector<HTMLInputElement>(`[data-mark-row="${row}"][data-mark-col="${col}"]`)
		return el && !el.disabled ? el : null
	}

	const handleMarkKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
		if (e.key !== 'Enter') return
		e.preventDefault()
		const rowCount = filteredLearners.length
		const colCount = entryColumns.length || 1
		// Next open cell down this column...
		for (let r = rowIdx + 1; r < rowCount; r++) {
			const el = focusableMarkCell(r, colIdx)
			if (el) { el.focus(); el.select(); return }
		}
		// ...otherwise the first open cell of a later column
		for (let c = colIdx + 1; c < colCount; c++) {
			for (let r = 0; r < rowCount; r++) {
				const el = focusableMarkCell(r, c)
				if (el) { el.focus(); el.select(); return }
			}
		}
	}

	const handleMarkChange = (examRegId: string, componentCode: string, value: string) => {
		const numValue = value === '' ? 0 : parseInt(value, 10)
		if (isNaN(numValue) || numValue < 0) return
		setIsDirty(true)

		setLearnerMarks(prev => ({
			...prev,
			[examRegId]: {
				...prev[examRegId],
				[componentCode]: numValue
			}
		}))

		// Validate against max mark
		const max = maxMarks[componentCode] || 0
		if (max > 0 && numValue > max) {
			setErrors(prev => ({
				...prev,
				[examRegId]: {
					...prev[examRegId],
					[componentCode]: `Exceeds max (${max})`
				}
			}))
		} else {
			setErrors(prev => {
				const updated = { ...prev }
				if (updated[examRegId]) {
					delete updated[examRegId][componentCode]
					if (Object.keys(updated[examRegId]).length === 0) {
						delete updated[examRegId]
					}
				}
				return updated
			})
		}
	}

	// Question-wise: the component mark is always the sum of its question marks, so
	// keeping learnerMarks in lockstep means totals, validation, save and the PDF
	// all keep working on the component level with no special-casing.
	const handleQuestionMarkChange = (examRegId: string, question: PaperQuestion, value: string) => {
		if (!questionComponent) return
		// Whole marks only — cia_marks component/total columns are INTEGER, so a 0.5
		// would round in the stored total and no longer match the breakdown.
		const raw = value === '' ? null : parseInt(value, 10)
		if (raw !== null && (isNaN(raw) || raw < 0)) return
		// Belt and braces: the input is disabled, but never accept a mark for a
		// question this learner is not allowed to answer.
		if (raw !== null && questionLockReason(examRegId, question)) return
		setIsDirty(true)

		const nextForLearner = { ...(questionMarks[examRegId] || {}) }
		if (raw === null) delete nextForLearner[question.id]
		else nextForLearner[question.id] = raw
		setQuestionMarks(prev => ({ ...prev, [examRegId]: nextForLearner }))

		const sum = Object.values(nextForLearner).reduce((s, v) => s + (Number(v) || 0), 0)
		const touched = Object.keys(nextForLearner).length > 0
		setLearnerMarks(prev => {
			const row = { ...(prev[examRegId] || {}) }
			if (touched) row[questionComponent] = sum
			else delete row[questionComponent]
			return { ...prev, [examRegId]: row }
		})

		// Two error kinds: this question over its own marks, and the running total
		// over the component max (which choice questions make possible).
		const componentMax = maxMarks[questionComponent] || 0
		setErrors(prev => {
			const updated = { ...prev }
			const row = { ...(updated[examRegId] || {}) }
			const qKey = `q:${question.id}`
			if (raw !== null && question.marks > 0 && raw > question.marks) row[qKey] = `Max ${question.marks}`
			else delete row[qKey]
			if (componentMax > 0 && sum > componentMax) row[questionComponent] = `Total ${sum} > ${componentMax}`
			else delete row[questionComponent]
			if (Object.keys(row).length === 0) delete updated[examRegId]
			else updated[examRegId] = row
			return updated
		})
	}

	// Re-pointing the paper at a different component moves every learner's question
	// sum with it — otherwise the old component would keep a stale total and save it.
	const handleQuestionComponentChange = (nextCode: string) => {
		const prevCode = questionComponent
		setQuestionComponent(nextCode)
		if (!prevCode || prevCode === nextCode) return
		setLearnerMarks(prev => {
			const updated: Record<string, Record<string, number>> = {}
			for (const [regId, row] of Object.entries(prev)) {
				const next = { ...row }
				delete next[prevCode]
				const qs = questionMarks[regId] || {}
				if (Object.keys(qs).length > 0) {
					next[nextCode] = Object.values(qs).reduce((s, v) => s + (Number(v) || 0), 0)
				}
				updated[regId] = next
			}
			return updated
		})
		setErrors({})
	}

	// Save payload for one learner's question breakdown (undefined when nothing keyed in)
	const buildQuestionMarksPayload = (examRegId: string) => {
		if (!isQuestionWise || !activePaper || !questionComponent) return undefined
		const marks = questionMarks[examRegId]
		if (!marks || Object.keys(marks).length === 0) return undefined
		return {
			[questionComponent]: {
				paper_id: activePaper.id,
				set_number: activePaper.set_number,
				set_label: activePaper.set_label,
				marks,
			},
		}
	}

	const getLearnerTotal = (examRegId: string): number => {
		const marks = learnerMarks[examRegId] || {}
		return Object.values(marks).reduce((sum, val) => sum + (val || 0), 0)
	}

	// True when at least one component key exists for this learner — distinguishes
	// "nothing entered yet" (show blank in Entry/Edit/View) from "entered as 0".
	const learnerHasEntries = (examRegId: string): boolean => {
		const marks = learnerMarks[examRegId]
		return !!marks && Object.keys(marks).length > 0
	}

	// ===== Save =====
	const [confirmOpen, setConfirmOpen] = useState(false)

	const hasValidationErrors = useMemo(() => {
		return Object.keys(errors).length > 0
	}, [errors])

	// A learner counts as "entered" the moment any component has a value (including 0).
	// 0 is a valid mark — students who scored 0 must still be saved and shown.
	const learnerHasAnyComponent = (marks: Record<string, number> | undefined): boolean => {
		if (!marks) return false
		return Object.values(marks).some(v => v !== undefined && v !== null && !isNaN(Number(v)))
	}

	const hasAnyMarks = useMemo(() => {
		return Object.values(learnerMarks).some(learnerHasAnyComponent)
	}, [learnerMarks])

	const marksToSaveCount = useMemo(() => {
		return Object.values(learnerMarks).filter(learnerHasAnyComponent).length
	}, [learnerMarks])

	// Strict check: every learner must have a mark for every active component.
	// Used to gate the Save button AND the Confirm dialog — empty marks are blocked.
	const allLearnersHaveMarks = useMemo(() => {
		if (learners.length === 0) return false
		const activeComponents = components.filter(c => (maxMarks[c.component_code] || 0) > 0)
		if (activeComponents.length === 0) return false
		for (const learner of learners) {
			const marks = learnerMarks[learner.id] || {}
			for (const comp of activeComponents) {
				const v = marks[comp.component_code]
				if (v === undefined || v === null || isNaN(Number(v))) return false
			}
		}
		return true
	}, [learners, learnerMarks, components, maxMarks])

	const missingMarkCount = useMemo(() => learners.length - marksToSaveCount, [learners.length, marksToSaveCount])

	const handleSaveClick = () => {
		// Pre-validate before showing confirmation
		const activeComponents = components.filter(c => (maxMarks[c.component_code] || 0) > 0)
		if (activeComponents.length === 0) {
			toast({ title: '❌ No Max Marks Set', description: 'Please set max marks for at least one component.', variant: 'destructive' }); return
		}
		if (hasValidationErrors) {
			toast({ title: '❌ Validation Errors', description: 'Please fix all mark errors before saving.', variant: 'destructive' }); return
		}
		if (!hasAnyMarks) {
			toast({ title: '❌ No Marks Entered', description: 'Please enter marks for at least one learner.', variant: 'destructive' }); return
		}
		// Partial saves are allowed on purpose: with 50-60 learners, faculty key in a
		// batch, save, and come back for the rest. Saved learners simply update on the
		// next save, so nothing is lost or duplicated.
		setConfirmOpen(true)
	}

	const handleSave = async () => {
		setConfirmOpen(false)
		// Validate max marks are set
		const activeComponents = components.filter(c => (maxMarks[c.component_code] || 0) > 0)
		if (activeComponents.length === 0) {
			toast({
				title: '❌ No Max Marks Set',
				description: 'Please set max marks for at least one component before saving.',
				variant: 'destructive'
			})
			return
		}

		if (hasValidationErrors) {
			toast({
				title: '❌ Validation Errors',
				description: 'Please fix all mark errors before saving.',
				variant: 'destructive'
			})
			return
		}

		if (!hasAnyMarks) {
			toast({
				title: '❌ No Marks Entered',
				description: 'Please enter marks for at least one learner.',
				variant: 'destructive'
			})
			return
		}

		const co = courseOfferings.find(c => c.course_offering_id === selectedCourseOffering)
		if (!co) return

		const instId = effectiveInstitutionId
		if (!instId) return

		// Build only the active max marks (where max > 0)
		const activeMaxMarks: Record<string, number> = {}
		for (const [code, val] of Object.entries(maxMarks)) {
			if (val > 0) activeMaxMarks[code] = val
		}

		// Build learner marks array — include any learner with at least one
		// component touched, even if the value is 0. Zero is a valid mark and
		// must round-trip through save → fetch → display.
		const marksToSave = learners
			.filter(l => learnerHasAnyComponent(learnerMarks[l.id]))
			.map(l => ({
				exam_registration_id: l.id,
				student_id: l.student_id,
				register_no: l.stu_register_no,
				marks: learnerMarks[l.id] || {},
				// Question-wise rounds also send the breakdown; the API re-derives the
				// component mark from it, so the two can never drift apart.
				question_marks: buildQuestionMarksPayload(l.id),
			}))

		if (marksToSave.length === 0) {
			toast({
				title: '❌ No Marks to Save',
				description: 'Enter marks for at least one learner.',
				variant: 'destructive'
			})
			return
		}

		try {
			setSaving(true)
			const res = await fetch('/api/pre-exam/internal-mark-entry', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: instId,
					examination_session_id: selectedSession,
					course_offering_id: co.course_offering_id,
					course_id: co.course_id,
					program_id: co.program_id,
					cia_round: Number(selectedCiaRound) || 1,
					max_marks: activeMaxMarks,
					learner_marks: marksToSave
				})
			})

			const result = await res.json()

			if (res.ok) {
				const savedAll = marksToSave.length >= learners.length
				toast({
					title: viewMode === 'edit' ? '✅ Marks Updated' : '✅ Marks Saved',
					description: savedAll
						? (result.message || `Saved marks for ${marksToSave.length} learners.`)
						: `Saved ${marksToSave.length} of ${learners.length} learners. Come back any time to enter the rest.`,
					className: 'bg-green-50 border-green-200 text-green-800'
				})
				setHasSaved(true)
				// The keyed-in marks are now persisted — the local draft has done its job
				setIsDirty(false)
				setPendingDraft(null)
				clearDraft()
				// Only jump to View when the whole class is done; a partial save should
				// leave the user in Entry mode to carry on with the remaining learners.
				if (savedAll) setViewMode('view')
				// Refresh learners list to show the latest persisted state
				fetchLearners(co.course_offering_id, selectedSession!, Number(selectedCiaRound) || undefined)
			} else {
				// Draft is deliberately kept so nothing is lost on a failed/partial save
				toast({
					title: '❌ Save Failed',
					description: result.error || 'Failed to save marks.',
					variant: 'destructive'
				})
			}
		} catch (error) {
			console.error('Save error:', error)
			toast({
				title: '❌ Network Error',
				description: 'Unable to connect to server.',
				variant: 'destructive'
			})
		} finally {
			setSaving(false)
		}
	}

	// ===== Download PDF =====

	// Question-wise sheet — landscape, one column per question, with CO / Bloom's tags
	const handleDownloadQuestionWisePDF = async () => {
		if (!selectedCourse || !activePaper || questionColumns.length === 0 || learners.length === 0) return

		const { generateQuestionWiseMarksPDF } = await import('@/lib/utils/generate-question-wise-marks-pdf')
		const institution = institutions.find(i => i.id === effectiveInstitutionId)
		const prog = programs.find(p => p.id === selectedProgram)
		const componentName = components.find(c => c.component_code === questionComponent)?.component_name || 'Component'

		const { getInstitutionHeader } = await import('@/lib/utils/institution-header')
		const header = getInstitutionHeader(institution?.institution_code)
		const leftLogo = await loadPdfImage(header.logo_path)

		generateQuestionWiseMarksPDF({
			institution_name: header.name,
			institution_subtitle: header.subtitle,
			institution_trust_line: header.trust_line,
			institution_accreditation: header.accreditation,
			institution_address: header.address,
			program_code: prog?.program_code || '',
			program_name: prog?.program_name || '',
			semester: selectedSemester,
			course_code: selectedCourse.course_code,
			course_name: selectedCourse.course_name,
			exam_session: sessions.find(s => s.id === selectedSession)?.session_name || '',
			assessment_name: activeAssessment?.setting?.setting_name || '',
			cia_round_name: activeAssessment?.round?.round_name || 'CIA',
			paper_set_label: activePaper.set_label,
			component_name: componentName,
			component_max: maxMarks[questionComponent] || 0,
			questions: questionColumns.map(q => ({
				id: q.id,
				label: q.label,
				part_label: q.part_label,
				marks: q.marks,
				co_code: q.co_code,
				k_level: q.k_level,
				is_choice_alternative: q.is_choice_alternative,
			})),
			learners: filteredLearners.map((l, idx) => ({
				serial_number: idx + 1,
				register_number: l.stu_register_no,
				student_name: l.student_name,
				question_marks: questionMarks[l.id] || {},
				component_total: learnerMarks[l.id]?.[questionComponent] ?? 0,
				total: getLearnerTotal(l.id),
			})),
			rightLogoImage: leftLogo,
		})
	}

	// Fetch an image as a data URI for embedding in a PDF (empty string on failure)
	const loadPdfImage = async (url: string): Promise<string> => {
		try {
			const res = await fetch(url)
			const blob = await res.blob()
			return await new Promise((resolve, reject) => {
				const reader = new FileReader()
				reader.onloadend = () => resolve(reader.result as string)
				reader.onerror = reject
				reader.readAsDataURL(blob)
			})
		} catch { return '' }
	}

	const handleDownloadPDF = async () => {
		if (!selectedCourse || components.length === 0 || learners.length === 0) return

		const { generateInternalMarksPDF } = await import('@/lib/utils/generate-internal-marks-pdf')

		const institution = institutions.find(i => i.id === effectiveInstitutionId)
		const prog = programs.find(p => p.id === selectedProgram)

		const pdfLearners = filteredLearners.map((l, idx) => ({
			serial_number: idx + 1,
			register_number: l.stu_register_no,
			student_name: l.student_name,
			component_marks: learnerMarks[l.id] || {},
			total: getLearnerTotal(l.id),
		}))

		const pdfComponents = components
			.filter(c => (maxMarks[c.component_code] || 0) > 0)
			.map(c => ({
				code: c.component_code,
				name: c.component_name,
				max_marks: maxMarks[c.component_code] || 0,
			}))

		// Load logos
		const loadImage = async (url: string): Promise<string> => {
			try {
				const res = await fetch(url)
				const blob = await res.blob()
				return new Promise((resolve, reject) => {
					const reader = new FileReader()
					reader.onloadend = () => resolve(reader.result as string)
					reader.onerror = reject
					reader.readAsDataURL(blob)
				})
			} catch { return '' }
		}
		// Resolve all per-institution PDF header bits (logo + name + subtitle +
		// trust line + accreditation + address) from the central config map.
		// Onboarding a new college only requires editing lib/utils/institution-header.ts.
		const { getInstitutionHeader } = await import('@/lib/utils/institution-header')
		const header = getInstitutionHeader(institution?.institution_code)
		// Single institution logo on the LEFT; right side is blank (per request).
		// Note: in the PDF generator, `rightLogoImage` is drawn at the LEFT margin.
		const leftLogo = await loadImage(header.logo_path)

		generateInternalMarksPDF({
			institution_name: header.name,
			institution_subtitle: header.subtitle,
			institution_trust_line: header.trust_line,
			institution_accreditation: header.accreditation,
			institution_address: header.address,
			program_code: prog?.program_code || '',
			program_name: prog?.program_name || '',
			semester: selectedSemester,
			course_code: selectedCourse.course_code,
			course_name: selectedCourse.course_name,
			internal_max_mark: selectedCourse.internal_max_mark,
			exam_session: sessions.find(s => s.id === selectedSession)?.session_name || '',
			assessment_name: activeAssessment?.setting?.setting_name || '',
			cia_round_name: activeAssessment?.round?.round_name || 'CIA',
			components: pdfComponents,
			learners: pdfLearners,
			rightLogoImage: leftLogo,
		})
	}

	// ===== Reset =====

	const handleReset = () => {
		setLocalInstitutionId("")
		setAssessmentOptions([])
		setSelectedAssessment("")
		setSelectedProgram("")
		setAvailableSemesters([])
		setSelectedSemester("")
		setCourseOfferings([])
		setSelectedCourseOffering("")
		setLearners([])
		setComponents([])
		setMaxMarks({})
		setLearnerMarks({})
		setErrors({})
		setSearchTerm("")
		setPapers([])
		setSelectedPaperId("")
		setQuestionComponent("")
		setQuestionMarks({})
		setPendingDraft(null)
		setIsDirty(false)
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			{/* min-w-0: a flex item defaults to min-width:auto, so the wide marks table
			    would stretch the whole page and drag the frozen columns out over the
			    sidebar. Constraining it keeps the scrolling inside the table. */}
			<SidebarInset className="min-w-0 overflow-x-hidden">
				<AppHeader>
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem><BreadcrumbLink asChild><Link href="/">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbLink>Pre-Exam</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>Internal Mark Entry</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex flex-1 flex-col gap-4 p-4 overflow-y-auto min-w-0">
					{/* Filters Card */}
					<Card>
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between">
								<CardTitle className="text-lg">Internal Mark Entry</CardTitle>
								<Button variant="outline" size="sm" onClick={handleReset}>
									<RefreshCw className="h-4 w-4 mr-2" />
									Reset
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<div className="flex flex-wrap gap-3">
								{/* Institution */}
								{mustSelectInstitution && (
									<div className="space-y-1 min-w-[150px] flex-1">
										<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Institution <span className="text-red-500">*</span></label>
										<Select value={localInstitutionId} onValueChange={setLocalInstitutionId}>
											<SelectTrigger className="h-10"><SelectValue placeholder="Select Institution" /></SelectTrigger>
											<SelectContent>
												{institutions.map(inst => (
													<SelectItem key={inst.id} value={inst.id}>{inst.institution_code} - {inst.name}</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}

								{/* Exam Session — hidden when global session is selected */}
								{mustSelectSession && (
									<div className="space-y-1 min-w-[150px] flex-1">
										<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exam Session <span className="text-red-500">*</span></label>
										<Select value={selectedSession || ""} onValueChange={setSelectedSession}>
											<SelectTrigger className="h-10"><SelectValue placeholder="Select Session" /></SelectTrigger>
											<SelectContent>
												{sessions
													.filter(s => !shouldFilter || !institutionId || s.institutions_id === institutionId)
													.map(s => (
														<SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>
													))}
											</SelectContent>
										</Select>
									</div>
								)}

								{/* Assessment */}
								<div className="space-y-1 min-w-[150px] flex-1">
									<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assessment <span className="text-red-500">*</span></label>
									{assessmentOptions.length === 0 && selectedSession ? (
										<div className="h-10 flex items-center px-3 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-xs">
											No assessments configured for this session
										</div>
									) : assessmentOptions.length > 0 && !assessmentOptions.some(a => a.status === 'open' || a.status === 'no-dates') ? (
										<div className="h-10 flex items-center px-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-xs">
											No active assessments
										</div>
									) : (
										<Select
											value={selectedAssessment}
											onValueChange={(val) => {
												const opt = assessmentOptions.find(a => a.id === val)
												if (opt && (opt.status === 'open' || opt.status === 'no-dates')) setSelectedAssessment(val)
											}}
											disabled={assessmentOptions.length === 0}
										>
											<SelectTrigger className="h-10">
												<SelectValue placeholder={!selectedSession ? 'Select Session first' : 'Select Assessment'} />
											</SelectTrigger>
											<SelectContent className="max-w-[450px]">
												{assessmentOptions.map(opt => {
													const isOpen = opt.status === 'open' || opt.status === 'no-dates'
													return (
														<SelectItem key={opt.id} value={opt.id} disabled={!isOpen} className={cn(!isOpen && "opacity-50")}>
															<div className="flex items-center gap-2">
																<span className={cn("w-2 h-2 rounded-full shrink-0", {
																	'bg-emerald-500': opt.status === 'open',
																	'bg-red-500': opt.status === 'expired',
																	'bg-amber-500': opt.status === 'upcoming',
																	'bg-blue-400': opt.status === 'no-dates',
																})} />
																<span className={cn(!isOpen && "line-through")}>{opt.label}</span>
																{opt.status === 'expired' && <span className="text-[10px] text-red-500">Closed</span>}
																{opt.status === 'upcoming' && <span className="text-[10px] text-amber-600">Opens {opt.round.entry_from}</span>}
																{opt.status === 'open' && <span className="text-[10px] text-emerald-600">Open</span>}
															</div>
														</SelectItem>
													)
												})}
											</SelectContent>
										</Select>
									)}
								</div>

								{/* Program */}
								<div className="space-y-1 min-w-[150px] flex-1">
									<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Program <span className="text-red-500">*</span></label>
									<Popover open={programOpen} onOpenChange={setProgramOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={programOpen}
												className="w-full justify-between h-10 text-sm font-normal"
												disabled={programs.length === 0}
											>
												<span className="truncate">
													{selectedProgram && selectedProgram !== 'all'
														? (() => {
															const p = programs.find(p => p.id === selectedProgram)
															return p ? `${p.program_code} - ${p.program_name}` : 'Select Program'
														})()
														: programs.length === 0 ? 'Select Assessment first' : 'Select Program'}
												</span>
												<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[350px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search program..." className="h-8 text-xs" />
												<CommandList>
													<CommandEmpty className="text-xs py-4">No program found.</CommandEmpty>
													{ugPrograms.length > 0 && (
														<CommandGroup heading="UG Programs">
															{ugPrograms.map(p => (
																<CommandItem
																	key={p.id}
																	value={`${p.program_code} ${p.program_name}`}
																	onSelect={() => {
																		setSelectedProgram(p.id)
																		setProgramOpen(false)
																	}}
																	className="py-2 text-xs"
																>
																	<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedProgram === p.id ? "opacity-100" : "opacity-0")} />
																	<span className="flex-1 whitespace-normal">{p.program_code} - {p.program_name}</span>
																</CommandItem>
															))}
														</CommandGroup>
													)}
													{pgPrograms.length > 0 && (
														<CommandGroup heading="PG Programs">
															{pgPrograms.map(p => (
																<CommandItem
																	key={p.id}
																	value={`${p.program_code} ${p.program_name}`}
																	onSelect={() => {
																		setSelectedProgram(p.id)
																		setProgramOpen(false)
																	}}
																	className="py-2 text-xs"
																>
																	<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedProgram === p.id ? "opacity-100" : "opacity-0")} />
																	<span className="flex-1 whitespace-normal">{p.program_code} - {p.program_name}</span>
																</CommandItem>
															))}
														</CommandGroup>
													)}
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Semester */}
								<div className="space-y-1 min-w-[150px] flex-1">
									<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Semester <span className="text-red-500">*</span></label>
									<Select
										value={selectedSemester}
										onValueChange={setSelectedSemester}
										disabled={availableSemesters.length === 0}
									>
										<SelectTrigger className="h-10">
											<SelectValue placeholder={availableSemesters.length === 0 ? 'Select Program first' : 'Select Semester'} />
										</SelectTrigger>
										<SelectContent>
											{availableSemesters.map(sem => (
												<SelectItem key={sem} value={String(sem)}>
													Semester {sem}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Course */}
								<div className="space-y-1 min-w-[150px] flex-1">
									<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Course <span className="text-red-500">*</span></label>
									<Popover open={courseOpen} onOpenChange={setCourseOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={courseOpen}
												className="w-full justify-between h-10 text-sm font-normal"
												disabled={!selectedSemester || loading || courseOfferings.length === 0}
											>
												<span className="truncate">
													{selectedCourseOffering
														? (() => {
															const co = courseOfferings.find(c => c.course_offering_id === selectedCourseOffering)
															return co ? `${co.course_code} - ${co.course_name}` : 'Select Course'
														})()
														: loading ? 'Loading courses...' : !selectedSemester ? 'Select Semester first' : courseOfferings.length === 0 ? 'No courses available' : 'Select Course'}
												</span>
												<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[450px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search course code or name..." className="h-8 text-xs" />
												<CommandEmpty className="text-xs py-4">No course found.</CommandEmpty>
												<CommandGroup className="max-h-72 overflow-auto">
													{courseOfferings.map((co, coIdx) => (
														<CommandItem
															key={co.course_offering_id}
															value={`${String(coIdx).padStart(3, '0')} ${co.course_code} ${co.course_name}`}
															onSelect={() => {
																setSelectedCourseOffering(co.course_offering_id)
																setCourseOpen(false)
															}}
															className="py-2 text-xs"
														>
															<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedCourseOffering === co.course_offering_id ? "opacity-100" : "opacity-0")} />
															<span className="flex-1 whitespace-normal">{co.course_code} - {co.course_name}</span>
														</CommandItem>
													))}
												</CommandGroup>
											</Command>
										</PopoverContent>
									</Popover>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Course Info + Max Marks — compact single row */}
					{selectedCourse && components.length > 0 && (
						<Card className="border-l-4 border-l-blue-500">
							<CardContent className="py-3 px-4">
								<div className="flex items-center gap-4 flex-wrap">
									<div className="flex items-center gap-2 min-w-0">
										<span className="text-sm font-semibold truncate">{selectedCourse.course_code} - {selectedCourse.course_name}</span>
										{totalMaxMarks > 0 && (
											<Badge className="text-[10px] shrink-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
												Total: {totalMaxMarks}
											</Badge>
										)}
									</div>
									<div className="flex items-center gap-2 flex-wrap flex-1 justify-end">
										{components.map(comp => (
											<div key={comp.component_code} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1">
												<label className="text-xs font-medium text-blue-700 whitespace-nowrap">{comp.component_name}</label>
												<Input
													type="number"
													min={0}
													value={maxMarks[comp.component_code] || ''}
													onChange={(e) => handleMaxMarkChange(comp.component_code, e.target.value)}
													placeholder="0"
													className={cn("h-7 w-14 text-xs text-center font-bold border-blue-300 bg-white", ciaConfig?.use_course_max && "bg-blue-100 cursor-not-allowed")}
													disabled={!!ciaConfig?.use_course_max}
												/>
											</div>
										))}
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Question-wise round — paper the questions come from */}
					{selectedCourseOffering && isQuestionWise && (
						<Card className="border-l-4 border-l-indigo-500">
							<CardContent className="py-3 px-4">
								{papersLoading ? (
									<div className="flex items-center gap-2 text-sm text-muted-foreground">
										<Loader2 className="h-4 w-4 animate-spin" /> Loading question paper...
									</div>
								) : papers.length === 0 ? (
									<div className="flex items-start gap-3 text-sm text-amber-800 dark:text-amber-200">
										<AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
										<div>
											<div className="font-semibold">No question paper for this round yet</div>
											<div className="text-xs mt-0.5 opacity-90">
												This round is set to question-wise entry, but no paper exists for this course.
												Generate it in <Link href="/pre-exam/question-papers" className="underline underline-offset-2 font-medium">Question Papers</Link>.
												Until then, marks are keyed in per component below.
											</div>
										</div>
									</div>
								) : (
									<div className="flex items-center gap-4 flex-wrap">
										{answerRuleHints.length > 0 && (
											<div className="w-full text-[11px] text-muted-foreground -mb-1">
												{answerRuleHints.join(' · ')}
											</div>
										)}
										<div className="flex items-center gap-2 min-w-0">
											<Badge className="text-[10px] shrink-0 bg-indigo-100 text-indigo-700 hover:bg-indigo-100">Question-wise</Badge>
											<span className="text-sm font-medium truncate">
												{questionColumns.length} questions
												{activePaper?.max_marks != null ? ` · paper max ${activePaper.max_marks}` : ''}
												{activePaper ? ` · total ${activePaper.questions_total}` : ''}
											</span>
											{activePaper && activePaper.status !== 'approved' && activePaper.status !== 'locked' && (
												<Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
													Paper is {activePaper.status}
												</Badge>
											)}
										</div>
										<div className="flex items-center gap-3 flex-wrap flex-1 justify-end">
											{papers.length > 1 && (
												<div className="flex items-center gap-1.5">
													<label className="text-xs font-medium text-muted-foreground">Set</label>
													<Select value={selectedPaperId} onValueChange={setSelectedPaperId}>
														<SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
														<SelectContent>
															{papers.map(p => (
																<SelectItem key={p.id} value={p.id} className="text-xs">
																	{p.set_label || `Set ${p.set_number}`}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
											)}
											<div className="flex items-center gap-1.5">
												<label className="text-xs font-medium text-muted-foreground">Marks go to</label>
												<Select value={questionComponent} onValueChange={handleQuestionComponentChange}>
													<SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Select component" /></SelectTrigger>
													<SelectContent>
														{components.filter(c => c.component_code !== 'attendance').map(c => (
															<SelectItem key={c.component_code} value={c.component_code} className="text-xs">
																{c.component_name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					)}

					{/* Unsaved draft recovered from a previous attempt */}
					{selectedCourseOffering && pendingDraft && (
						<Card className="border-l-4 border-l-amber-500">
							<CardContent className="py-3 px-4">
								<div className="flex items-center justify-between gap-3 flex-wrap">
									<div className="flex items-start gap-3">
										<AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
										<div className="text-sm">
											<div className="font-semibold">Unsaved marks found for this course</div>
											<div className="text-xs mt-0.5 text-muted-foreground">
												{pendingDraft.count} learner(s) were keyed in but never saved, from{' '}
												{new Date(pendingDraft.saved_at).toLocaleString('en-IN')}. Restore them, or discard to keep what is in the database.
											</div>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Button
											size="sm"
											className="bg-amber-600 hover:bg-amber-700"
											onClick={() => {
												setLearnerMarks(pendingDraft.learner_marks || {})
												setQuestionMarks(pendingDraft.question_marks || {})
												if (pendingDraft.question_component) setQuestionComponent(pendingDraft.question_component)
												setErrors({})
												setIsDirty(true)
												setPendingDraft(null)
												toast({ title: '✅ Draft restored', description: 'Review the marks, then save.', className: 'bg-green-50 border-green-200 text-green-800' })
											}}
										>
											Restore
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => { clearDraft(); setPendingDraft(null) }}
										>
											Discard
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Mode Tabs — Entry / View / Edit */}
					{selectedCourseOffering && (
						<div className="flex items-center gap-1 border-b">
							{(['entry', 'view', 'edit'] as const).map(mode => (
								<button
									key={mode}
									type="button"
									onClick={() => {
										setViewMode(mode)
										// When switching to Edit mode, refresh marks from DB
										if (mode === 'edit' && selectedCourseOffering && selectedSession) {
											const co = courseOfferings.find(c => c.course_offering_id === selectedCourseOffering)
											if (co) fetchLearners(co.course_offering_id, selectedSession, Number(selectedCiaRound) || undefined)
										}
									}}
									className={cn(
										"px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
										viewMode === mode
											? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
											: "border-transparent text-muted-foreground hover:text-foreground hover:border-slate-300"
									)}
								>
									{mode === 'entry' && '📝 Entry'}
									{mode === 'view' && '👁️ View'}
									{mode === 'edit' && '✏️ Edit'}
								</button>
							))}
						</div>
					)}

					{/* Learners Mark Entry Table */}
					{selectedCourseOffering && (
						<Card className={cn(
							"border-l-4",
							viewMode === 'entry' && "border-l-emerald-500",
							viewMode === 'view' && "border-l-blue-500",
							viewMode === 'edit' && "border-l-amber-500"
						)}>
							<CardHeader className={cn(
								"pb-3 bg-gradient-to-r to-transparent",
								viewMode === 'entry' && "from-emerald-50/50 dark:from-emerald-950/20",
								viewMode === 'view' && "from-blue-50/50 dark:from-blue-950/20",
								viewMode === 'edit' && "from-amber-50/50 dark:from-amber-950/20"
							)}>
								<div className="flex items-center justify-between">
									<div>
										<CardTitle className="text-base flex items-center gap-2">
											{viewMode === 'entry' && 'Learner Marks Entry'}
											{viewMode === 'view' && 'Learner Marks (Read Only)'}
											{viewMode === 'edit' && 'Edit Learner Marks'}
											{activeAssessment && (
												<Badge className={cn(
													"text-xs",
													viewMode === 'entry' && "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
													viewMode === 'view' && "bg-blue-100 text-blue-700 hover:bg-blue-100",
													viewMode === 'edit' && "bg-amber-100 text-amber-700 hover:bg-amber-100"
												)}>
													{activeAssessment?.round?.round_name || 'CIA'}
												</Badge>
											)}
											{learners.length > 0 && (
												<Badge variant="secondary" className="text-xs">{learners.length} learners</Badge>
											)}
										</CardTitle>
									</div>
									<div className="flex items-center gap-2">
										<div className="relative">
											<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
											<Input
												placeholder="Search by register no or name..."
												value={searchTerm}
												onChange={(e) => setSearchTerm(e.target.value)}
												className="pl-8 h-8 w-64"
											/>
										</div>
									</div>
								</div>
							</CardHeader>
							<CardContent className="pt-4">
								{learnersLoading ? (
									<div className="flex items-center justify-center py-12">
										<Loader2 className="h-6 w-6 animate-spin mr-2" />
										<span className="text-muted-foreground">Loading learners...</span>
									</div>
								) : filteredLearners.length === 0 ? (
									<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
										<AlertTriangle className="h-8 w-8 mb-2" />
										<p>{learners.length === 0 ? 'No regular learners found for this course, or all marks have already been entered.' : 'No matching learners found.'}</p>
									</div>
								) : (
									<div className="relative isolate overflow-auto rounded-lg border max-h-[65vh]">
										{/* isolate: keeps the sticky header/column z-indexes inside this
										    box so they can never paint over the app header or sidebar */}
										<table className="w-full caption-bottom text-sm">
											<TableHeader>
												<TableRow className="hover:bg-transparent">
													<TableHead
														className="sticky top-0 z-40 px-1 text-center text-xs font-semibold bg-slate-800 text-white"
														style={{ left: FROZEN.sno, ...frozenSize(FROZEN_W.sno) }}
													>
														S.No
													</TableHead>
													<TableHead
														className="sticky top-0 z-40 px-2 text-xs font-semibold bg-slate-800 text-white"
														style={{ left: FROZEN.register, ...frozenSize(FROZEN_W.register) }}
													>
														Register Number
													</TableHead>
													<TableHead
														className="sticky top-0 z-40 px-2 text-xs font-semibold bg-slate-800 text-white border-r-2 border-r-slate-500 shadow-[3px_0_5px_-2px_rgba(0,0,0,0.45)]"
														style={{ left: FROZEN.name, ...frozenSize(FROZEN_W.name) }}
													>
														Name of the Learner
													</TableHead>
													{entryColumns.map((col, colIdx) => {
														if (col.kind === 'question') {
															const style = partStyle(col.question.part_label)
															const prev = entryColumns[colIdx - 1]
															const partStart = !prev || prev.kind !== 'question' || (prev.question.part_label || '') !== (col.question.part_label || '')
															return (
																<TableHead
																	key={`q-${col.question.id}`}
																	className={cn(
																		"sticky top-0 z-30 text-center min-w-[62px] px-1 py-1.5 h-auto align-bottom text-white",
																		style.head,
																		partStart && "border-l-4",
																		partStart && style.edge
																	)}
																>
																	{col.question.is_choice_alternative
																		? <div className="text-[9px] font-bold leading-none text-amber-200">OR</div>
																		: <div className="text-[9px] leading-none opacity-70">{col.question.part_label ? `PART ${col.question.part_label}` : ''}</div>}
																	<div className="text-xs font-bold leading-tight mt-0.5">Q{col.question.label}</div>
																	<div className="text-[10px] font-normal opacity-80">{col.question.marks} mark{col.question.marks === 1 ? '' : 's'}</div>
																	{(col.question.co_code || col.question.k_level) && (
																		<div className="text-[9px] font-medium leading-none mt-0.5 opacity-90" title={col.question.question_text || undefined}>
																			{[col.question.co_code, col.question.k_level].filter(Boolean).join(' · ')}
																		</div>
																	)}
																</TableHead>
															)
														}
														if (col.kind === 'component_total') {
															return (
																<TableHead
																	key={`total-${col.code}`}
																	className="sticky top-0 z-30 text-center min-w-[84px] py-1.5 h-auto align-bottom bg-indigo-800 text-white border-l-4 border-l-indigo-400"
																>
																	<div className="text-xs font-bold leading-tight">{col.name}</div>
																	<div className="text-[10px] font-normal opacity-80">Max: {col.max}</div>
																</TableHead>
															)
														}
														return (
															<TableHead
																key={`c-${col.code}-${colIdx}`}
																className="sticky top-0 z-30 text-center min-w-[90px] py-1.5 h-auto align-bottom bg-slate-800 text-white"
															>
																<div className="text-xs font-bold leading-tight">{col.name}</div>
																<div className="text-[10px] font-normal opacity-80">Max: {col.max}</div>
															</TableHead>
														)
													})}
													<TableHead className="sticky top-0 z-30 text-center w-20 text-xs font-semibold bg-slate-900 text-white border-l-4 border-l-slate-500">Total</TableHead>
													<TableHead className="sticky top-0 z-30 min-w-[120px] text-xs font-semibold bg-slate-800 text-white">Marks in Words</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{filteredLearners.map((learner, idx) => {
													const total = getLearnerTotal(learner.id)
													// Frozen cells need their own opaque background — the row's own
													// background does not paint under a sticky cell.
													const rowBg = idx % 2 === 0 ? 'bg-white dark:bg-slate-950' : 'bg-slate-50 dark:bg-slate-900'
													return (
														<TableRow key={learner.id} className={cn(idx % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/50 dark:bg-slate-900/20', 'hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10')}>
															<TableCell className={cn("sticky z-20 px-1 text-center text-sm text-muted-foreground", rowBg)} style={{ left: FROZEN.sno, ...frozenSize(FROZEN_W.sno) }}>{idx + 1}</TableCell>
															<TableCell className={cn("sticky z-20 px-2 text-sm font-mono font-medium", rowBg)} style={{ left: FROZEN.register, ...frozenSize(FROZEN_W.register) }}>{learner.stu_register_no}</TableCell>
															<TableCell
																className={cn("sticky z-20 px-2 text-sm break-words border-r-2 border-r-slate-200 dark:border-r-slate-700 shadow-[3px_0_5px_-2px_rgba(0,0,0,0.18)]", rowBg)}
																style={{ left: FROZEN.name, ...frozenSize(FROZEN_W.name) }}
																title={learner.student_name}
															>
																{learner.student_name}
															</TableCell>
															{entryColumns.map((col, colIdx) => {
																// Read-only sum of the question columns to its left
																if (col.kind === 'component_total') {
																	const compTotal = learnerMarks[learner.id]?.[col.code]
																	const error = errors[learner.id]?.[col.code]
																	return (
																		<TableCell key={`total-${col.code}`} className="text-center p-1.5 bg-indigo-50/70 dark:bg-indigo-950/20 border-l-4 border-l-indigo-200 dark:border-l-indigo-900">
																			<div className={cn(
																				"h-9 mx-auto flex items-center justify-center text-sm font-bold rounded-md",
																				error ? "text-red-700" : "text-indigo-700 dark:text-indigo-300"
																			)}>
																				{viewMode === 'view' ? (compTotal ?? 0) : (compTotal ?? '')}
																			</div>
																			{error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
																		</TableCell>
																	)
																}

																const isQuestion = col.kind === 'question'
																const errorKey = isQuestion ? `q:${col.question.id}` : col.code
																const error = errors[learner.id]?.[errorKey]
																const value = isQuestion
																	? questionMarks[learner.id]?.[col.question.id]
																	: learnerMarks[learner.id]?.[col.code]
																// OR pairs and "answer any N" close the cells a learner can't use
																const lockReason = isQuestion ? questionLockReason(learner.id, col.question) : null
																const style = isQuestion ? partStyle(col.question.part_label) : null
																const prev = entryColumns[colIdx - 1]
																const partStart = isQuestion && (!prev || prev.kind !== 'question' || (prev.question.part_label || '') !== (col.question.part_label || ''))
																return (
																	<TableCell
																		key={isQuestion ? `q-${col.question.id}` : `c-${col.code}-${colIdx}`}
																		className={cn(
																			"text-center p-1.5",
																			style?.cell,
																			partStart && "border-l-4",
																			partStart && style?.edge
																		)}
																	>
																		{viewMode === 'view' ? (
																			// Read-only display — Option B: missing value → 0, except a
																			// question the learner was never allowed to answer, which
																			// reads as "—" rather than a misleading zero.
																			<div className={cn(
																				"h-9 w-18 mx-auto flex items-center justify-center text-sm font-bold",
																				lockReason ? "text-muted-foreground" : "text-blue-700"
																			)}>
																				{lockReason ? '—' : (value ?? 0)}
																			</div>
																		) : (
																			<Input
																				type="number"
																				min={0}
																				step={1}
																				max={isQuestion ? (col.question.marks || 999) : (col.max || 999)}
																				value={value ?? ''}
																				disabled={!!lockReason}
																				title={lockReason || undefined}
																				onChange={(e) => isQuestion
																					? handleQuestionMarkChange(learner.id, col.question, e.target.value)
																					: handleMarkChange(learner.id, col.code, e.target.value)}
																				onKeyDown={(e) => handleMarkKeyDown(e, idx, colIdx)}
																				data-mark-row={idx}
																				data-mark-col={colIdx}
																				className={cn(
																					"h-9 text-center text-sm mx-auto rounded-lg border-2 font-semibold shadow-sm focus:bg-white transition-colors",
																					// Narrower than the column so a field can never
																					// bleed over the frozen name column while scrolling
																					isQuestion ? "w-12 px-0.5" : "w-18",
																					// Question fields take their part's colour; plain
																					// components keep the mode colour.
																					isQuestion
																						? style?.field
																						: viewMode === 'edit'
																							? "border-amber-200 bg-amber-50/40 focus:border-amber-500"
																							: "border-emerald-200 bg-emerald-50/40 focus:border-emerald-500",
																					isQuestion && col.question.is_choice_alternative && "border-dashed",
																					lockReason && "!border-slate-200 !bg-slate-100 dark:!bg-slate-800 !text-slate-400 cursor-not-allowed shadow-none",
																					error && "!border-red-400 !bg-red-50 text-red-700"
																				)}
																				placeholder={lockReason ? '—' : ''}
																			/>
																		)}
																		{error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
																	</TableCell>
																)
															})}
															<TableCell className="text-center border-l-4 border-l-slate-200 dark:border-l-slate-700">
																{(() => {
																	// View mode: always show total (matches Option B for component cells).
																	// Entry/Edit mode: only show once the user has touched something.
																	const showTotal = viewMode === 'view' || learnerHasEntries(learner.id)
																	return (
																		<span className={cn(
																			"inline-flex items-center justify-center h-9 w-16 rounded-md text-sm font-bold",
																			showTotal ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "text-muted-foreground"
																		)}>
																			{showTotal ? total : ''}
																		</span>
																	)
																})()}
															</TableCell>
															<TableCell className="text-sm font-medium text-purple-700 whitespace-nowrap">
																{(viewMode === 'view' || learnerHasEntries(learner.id)) ? numberToWords(total) : ''}
															</TableCell>
														</TableRow>
													)
												})}
											</TableBody>
										</table>
									</div>
								)}
								{/* Save section — warning + buttons (mode-aware) */}
								{filteredLearners.length > 0 && (
									<div className="pt-4 border-t mt-4 space-y-3">
										{/* View mode: read-only banner, no save buttons */}
										{viewMode === 'view' && (
											<div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
												<div className="flex items-start gap-3">
													<AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
													<div>
														<div className="font-semibold">Read-only view</div>
														<div className="text-xs mt-0.5 opacity-90">
															Marks are saved. Switch to the Edit tab to make changes.
														</div>
													</div>
												</div>
												{hasSaved && (
													<div className="flex items-center gap-2 shrink-0">
														<Button onClick={handleDownloadPDF} size="sm" variant="outline">
															<Download className="h-4 w-4 mr-2" />
															Download PDF
														</Button>
														{isQuestionWise && activePaper && questionColumns.length > 0 && (
															<Button onClick={handleDownloadQuestionWisePDF} size="sm" variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
																<Download className="h-4 w-4 mr-2" />
																Question-wise PDF
															</Button>
														)}
													</div>
												)}
											</div>
										)}

										{/* Entry mode: partial saves allowed, progress made obvious */}
										{viewMode === 'entry' && (
											<>
												{!allLearnersHaveMarks && learners.length > 0 && (
													<div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
														<AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
														<div>
															<div className="font-semibold">
																{marksToSaveCount} of {learners.length} learners entered — {missingMarkCount} still to go
															</div>
															<div className="text-xs mt-0.5 opacity-90">
																Save now and enter the rest later — saving again only updates what changed. Enter 0 for a learner who scored zero.
															</div>
														</div>
													</div>
												)}
												<div className="flex items-center justify-between gap-3">
													<span className="text-xs text-muted-foreground">
														{isDirty ? 'Unsaved marks are kept in this browser until you save.' : ''}
													</span>
													<Button
														onClick={handleSaveClick}
														disabled={saving || !hasAnyMarks || hasValidationErrors}
														size="sm"
														className="bg-emerald-600 hover:bg-emerald-700"
													>
														{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
														{saving ? 'Saving...' : allLearnersHaveMarks ? 'Save Marks' : `Save ${marksToSaveCount} of ${learners.length}`}
													</Button>
												</div>
											</>
										)}

										{/* Edit mode: relaxed validation + update button */}
										{viewMode === 'edit' && (
											<>
												<div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
													<AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
													<div>
														<div className="font-semibold">Edit mode</div>
														<div className="text-xs mt-0.5 opacity-90">
															You can update marks for individual students. Partial updates are allowed — students you don't change will keep their existing marks.
														</div>
													</div>
												</div>
												<div className="flex justify-end gap-3">
													<Button
														onClick={handleSaveClick}
														disabled={saving || hasValidationErrors}
														size="sm"
														className="bg-amber-600 hover:bg-amber-700"
													>
														{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
														{saving ? 'Updating...' : 'Update Marks'}
													</Button>
												</div>
											</>
										)}
									</div>
								)}
							</CardContent>
						</Card>
					)}
				</div>

				{/* Save Confirmation Dialog */}
				<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle>{viewMode === 'edit' ? 'Confirm Update Marks' : 'Confirm Save Marks'}</DialogTitle>
						</DialogHeader>
						<div className="py-4">
							<div className="grid grid-cols-[110px_1fr] gap-y-3 text-sm">
								{/* Program */}
								<div className="text-muted-foreground">Program</div>
								<div className="font-medium whitespace-normal">
									{(() => {
										const p = programs.find(p => p.id === selectedProgram)
										return p ? `${p.program_code} - ${p.program_name}` : '-'
									})()}
								</div>

								{/* Course */}
								<div className="text-muted-foreground">Course</div>
								<div className="font-medium whitespace-normal">
									{selectedCourse ? `${selectedCourse.course_code} - ${selectedCourse.course_name}` : '-'}
								</div>

								{/* Assessment */}
								{activeAssessment && (
									<>
										<div className="text-muted-foreground">Assessment</div>
										<div className="font-medium whitespace-normal">{activeAssessment.label}</div>
									</>
								)}

								{/* Exam Session — conditional */}
								{selectedSession && (
									<>
										<div className="text-muted-foreground">Exam Session</div>
										<div className="font-medium whitespace-normal">
											{sessions.find(s => s.id === selectedSession)?.session_name || '-'}
										</div>
									</>
								)}

								{/* Learners with marks — two-line label, green count */}
								<div className="text-muted-foreground">
									Learners<br />with marks
								</div>
								<div className={cn("font-semibold self-center", allLearnersHaveMarks ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
									{marksToSaveCount} of {learners.length}
									{!allLearnersHaveMarks && (
										<span className="ml-2 text-xs font-normal">({missingMarkCount} can be entered later)</span>
									)}
								</div>
							</div>
						</div>
						<DialogFooter className="gap-2">
							<Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
							<Button
								onClick={handleSave}
								className={cn(
									viewMode === 'edit'
										? "bg-amber-600 hover:bg-amber-700"
										: "bg-emerald-600 hover:bg-emerald-700"
								)}
							>
								<Save className="h-4 w-4 mr-2" />
								{viewMode === 'edit'
									? 'Confirm Update'
									: allLearnersHaveMarks ? 'Confirm Save' : `Save ${marksToSaveCount} now`}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
