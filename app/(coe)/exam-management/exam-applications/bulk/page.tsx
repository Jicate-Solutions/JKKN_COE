'use client'

import { useState, useEffect, useCallback, useMemo, memo, type CSSProperties } from 'react'
import { FixedSizeList as VirtualList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import Link from 'next/link'
import { useSessionSync } from '@/hooks/use-session-sync'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useExamSessions } from '@/hooks/use-exam-sessions'
import { useDebounce } from '@/hooks/common/use-debounce'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitution, type Institution } from '@/context/institution-context'
import { cn } from '@/lib/utils'
import { ArrowLeft, BookOpen, Check, ChevronsUpDown, ClipboardCheck, ClipboardPaste, IndianRupee, Info, Loader2, RefreshCw, RotateCcw, Search, Send, Users } from 'lucide-react'
import type {
	BulkApplicationMode,
	BulkApplicationResult,
	BulkFeeContext,
	BulkLearnerCourses,
	BulkSubjectCandidate,
	BulkSubjectOffering,
	ExamApplicationCourse,
} from '@/types/exam-applications'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const ROW_HEIGHT = 56
const MAX_LEARNERS_PER_BATCH = 500

/** Which papers the operator is working on. Arrears are never a cross-product. */
type PaperType = 'current' | 'arrear' | 'both'

const ELIGIBILITY_STYLES: Record<string, string> = {
	'Eligible': 'bg-green-100 text-green-700 border-green-200',
	'Already Registered': 'bg-amber-100 text-amber-700 border-amber-200',
	'Already Passed': 'bg-slate-100 text-slate-600 border-slate-200',
	'Not Offered': 'bg-red-100 text-red-700 border-red-200',
	'Inactive Offering': 'bg-red-100 text-red-700 border-red-200',
	'Attempts Exhausted': 'bg-red-100 text-red-700 border-red-200',
	'Seats Full': 'bg-orange-100 text-orange-700 border-orange-200',
}

const CURRENT_BADGE = 'bg-emerald-100 text-emerald-700 border-emerald-200'
const ARREAR_BADGE = 'bg-rose-100 text-rose-700 border-rose-200'

const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const money = (value: number | null | undefined) =>
	value == null ? '—' : `₹${rupees.format(Math.round(value))}`

interface MyLearner {
	id: string
	register_number: string
	student_name: string
	program_code: string
	program_name: string
	current_semester: number
}

interface OfferingOption {
	id: string
	course_code: string
	course_title: string
	program_code: string
	semester: number
}

/** One (learner, course) row in learner-wise mode */
interface LearnerCourseRow {
	rowKey: string
	learnerKey: string
	student_id: string | null
	register_number: string
	student_name: string
	program_code: string | null
	semester: number | null
	course: ExamApplicationCourse
}

const romanSemester = (value: number | null | undefined) =>
	value == null || value === 0 ? '—' : (ROMAN[value] || String(value))

/**
 * Parse a fetch Response as JSON only when it actually is JSON. In dev (Turbopack),
 * hitting an API route mid-recompile returns an HTML page and res.json() then throws
 * an opaque "Unexpected token '<'".
 */
async function parseJsonResponse(res: Response): Promise<any> {
	const contentType = res.headers.get('content-type') || ''
	if (!contentType.includes('application/json')) {
		const text = await res.text().catch(() => '')
		throw new Error(
			`Expected JSON but received ${contentType || 'unknown'} (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`
		)
	}
	return res.json()
}

// ── Segmented control ──
function Segmented<T extends string>({
	value, onChange, options, disabled,
}: {
	value: T
	onChange: (v: T) => void
	options: { value: T; label: string }[]
	disabled?: boolean
}) {
	return (
		<div className={cn('inline-flex h-9 items-center rounded-md border bg-muted/40 p-0.5 w-full', disabled && 'opacity-60 pointer-events-none')}>
			{options.map(opt => (
				<button
					key={opt.value}
					type="button"
					onClick={() => onChange(opt.value)}
					className={cn(
						'flex-1 h-8 rounded-[5px] text-sm font-medium transition-colors px-2',
						value === opt.value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
					)}
				>
					{opt.label}
				</button>
			))}
		</div>
	)
}

// ── Searchable single-select ──
function SearchableSelect({
	value, onValueChange, placeholder, options, disabled, loading, searchPlaceholder,
}: {
	value: string
	onValueChange: (v: string) => void
	placeholder: string
	options: { value: string; label: string }[]
	disabled?: boolean
	loading?: boolean
	searchPlaceholder?: string
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')
	const filtered = useMemo(() => {
		if (!search.trim()) return options.slice(0, 300)
		const q = search.toLowerCase()
		return options.filter(o => o.label.toLowerCase().includes(q)).slice(0, 300)
	}, [options, search])
	const selected = options.find(o => o.value === value)

	return (
		<Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch('') }}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled || loading}
					className="h-9 w-full justify-between rounded-md font-normal text-sm px-3"
				>
					{loading ? (
						<span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading...</span>
					) : (
						<span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected?.label || placeholder}</span>
					)}
					<ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-1" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[280px]" align="start">
				<Command shouldFilter={false}>
					<CommandInput placeholder={searchPlaceholder || 'Search...'} value={search} onValueChange={setSearch} className="h-9 text-sm" />
					<CommandList className="max-h-64 overflow-y-auto">
						{filtered.length === 0
							? <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">No results found</CommandEmpty>
							: filtered.map(opt => (
								<CommandItem
									key={opt.value}
									value={opt.value}
									onSelect={() => { onValueChange(opt.value); setOpen(false); setSearch('') }}
									className="text-sm cursor-pointer"
								>
									<Check className={cn('mr-2 h-4 w-4 shrink-0', value === opt.value ? 'opacity-100' : 'opacity-0')} />
									<span className="truncate">{opt.label}</span>
								</CommandItem>
							))
						}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

// ── Subject-wise candidate row ──
const CandidateRow = memo(function CandidateRow({
	candidate, checked, onToggle, showFee, style,
}: {
	candidate: BulkSubjectCandidate
	checked: boolean
	onToggle: (key: string) => void
	showFee: boolean
	style?: CSSProperties
}) {
	const disabled = !candidate.is_eligible
	return (
		<label
			style={style}
			className={cn(
				'flex items-center gap-3 px-4 border-b overflow-hidden',
				disabled ? 'bg-slate-50/60 dark:bg-slate-900/20 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30',
				!disabled && checked && 'bg-blue-50/40 dark:bg-blue-950/20'
			)}
		>
			<Checkbox checked={checked} disabled={disabled} onCheckedChange={() => onToggle(candidate.key)} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-xs font-mono text-muted-foreground">{candidate.register_number || '—'}</span>
					<Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', candidate.is_backlog ? ARREAR_BADGE : CURRENT_BADGE)}>
						{candidate.is_backlog ? `Arrear · Attempt ${candidate.attempt_number}` : 'Current Paper'}
					</Badge>
				</div>
				<div className="text-sm truncate">{candidate.student_name}</div>
			</div>
			<div className="hidden lg:block text-xs text-muted-foreground w-20 shrink-0 truncate">{candidate.program_code || '—'}</div>
			<div className="hidden xl:block text-xs text-muted-foreground w-14 shrink-0">Sem {romanSemester(candidate.semester)}</div>
			{showFee && (
				<div className="w-20 shrink-0 text-right">
					<div className="text-sm font-medium tabular-nums">{candidate.is_eligible ? money(candidate.fee_total) : '—'}</div>
					{candidate.is_eligible && candidate.learner_charge > 0 && (
						<div className="text-[10px] text-muted-foreground leading-tight">incl. app.</div>
					)}
				</div>
			)}
			<Badge
				variant="outline"
				className={cn('text-[10px] px-1.5 py-0 h-5 shrink-0 w-[112px] justify-center', ELIGIBILITY_STYLES[candidate.eligibility_status] || '')}
				title={candidate.eligibility_reason || ''}
			>
				{candidate.eligibility_status}
			</Badge>
		</label>
	)
})

// ── Learner-wise (learner x course) row ──
const LearnerCourseListRow = memo(function LearnerCourseListRow({
	row, checked, onToggle, showFee, style,
}: {
	row: LearnerCourseRow
	checked: boolean
	onToggle: (key: string) => void
	showFee: boolean
	style?: CSSProperties
}) {
	const course = row.course
	const disabled = !course.is_eligible
	return (
		<label
			style={style}
			className={cn(
				'flex items-center gap-3 px-4 border-b overflow-hidden',
				disabled ? 'bg-slate-50/60 dark:bg-slate-900/20 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30',
				!disabled && checked && 'bg-blue-50/40 dark:bg-blue-950/20'
			)}
		>
			<Checkbox checked={checked} disabled={disabled} onCheckedChange={() => onToggle(row.rowKey)} />
			<div className="min-w-0 w-36 shrink-0">
				<div className="text-xs font-mono text-muted-foreground truncate">{row.register_number}</div>
				<div className="text-xs truncate">{row.student_name}</div>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-xs font-mono text-muted-foreground">{course.course_code}</span>
					<Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', course.is_backlog ? ARREAR_BADGE : CURRENT_BADGE)}>
						{course.is_backlog ? `Arrear · Attempt ${course.attempt_number}` : 'Current Paper'}
					</Badge>
					<span className="hidden lg:inline text-[10px] text-muted-foreground">Sem {romanSemester(course.semester)}</span>
				</div>
				<div className="text-sm truncate">{course.course_name || '—'}</div>
			</div>
			{showFee && (
				<div className="w-16 shrink-0 text-right text-sm font-medium tabular-nums">
					{course.is_eligible ? money(course.fee_amount) : '—'}
				</div>
			)}
			<Badge
				variant="outline"
				className={cn('text-[10px] px-1.5 py-0 h-5 shrink-0 w-[112px] justify-center', ELIGIBILITY_STYLES[course.eligibility_status] || '')}
				title={course.eligibility_reason || ''}
			>
				{course.eligibility_status}
			</Badge>
		</label>
	)
})

// ── Learner picker row (learner-wise mode) ──
const LearnerPickRow = memo(function LearnerPickRow({
	learner, checked, counts, onToggle, style,
}: {
	learner: MyLearner
	checked: boolean
	counts?: { current: number; arrear: number }
	onToggle: (id: string) => void
	style?: CSSProperties
}) {
	return (
		<label
			style={style}
			className={cn(
				'flex items-center gap-2 px-4 border-b cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30 overflow-hidden',
				checked && 'bg-blue-50/40 dark:bg-blue-950/20'
			)}
		>
			<Checkbox checked={checked} onCheckedChange={() => onToggle(learner.id)} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5 flex-wrap">
					<span className="text-xs font-mono text-muted-foreground">{learner.register_number || '—'}</span>
					<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{learner.program_code || '—'}</Badge>
					<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Sem {romanSemester(learner.current_semester)}</Badge>
					{counts && counts.arrear > 0 && (
						<Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', ARREAR_BADGE)}>{counts.arrear} arrear</Badge>
					)}
				</div>
				<div className="text-sm truncate">{learner.student_name}</div>
			</div>
		</label>
	)
})

export default function BulkExamApplicationPage() {
	const { toast } = useToast()

	const {
		institutionCode: contextInstitutionCode,
		institutionId: contextInstitutionId,
		isReady: institutionContextReady,
		mustSelectInstitution,
	} = useInstitutionFilter()

	const { availableInstitutions, selectedInstitution, selectInstitution, currentMyJKKNInstitutionIds } = useInstitution()

	const institutionsId = institutionContextReady && !mustSelectInstitution ? (contextInstitutionId ?? '') : (selectedInstitution?.id ?? '')
	const institutionCode = institutionContextReady && !mustSelectInstitution ? (contextInstitutionCode ?? '') : (selectedInstitution?.institution_code ?? '')

	const myjkknInstitutionIds: string[] = useMemo(() => {
		if (mustSelectInstitution) return selectedInstitution?.myjkkn_institution_ids || []
		return currentMyJKKNInstitutionIds || []
	}, [mustSelectInstitution, selectedInstitution, currentMyJKKNInstitutionIds])

	// ── Shared scope ──
	const { selectedSessionId: sessionId, setSelectedSessionId: setSessionId, mustSelectSession } = useSessionSync()
	const [sessionCode, setSessionCode] = useState('')
	const { sessions, loading: loadingSessions } = useExamSessions({ institutionsId: institutionsId || null })

	const [mode, setMode] = useState<BulkApplicationMode>('subject')
	const [paperType, setPaperType] = useState<PaperType>('both')
	const [submitting, setSubmitting] = useState(false)
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [failures, setFailures] = useState<BulkApplicationResult[]>([])
	const [feeContext, setFeeContext] = useState<BulkFeeContext | null>(null)

	// ── MyJKKN learner cache (one fetch per institution, shared by both modes) ──
	const [allLearners, setAllLearners] = useState<MyLearner[]>([])
	const [loadingAllLearners, setLoadingAllLearners] = useState(false)
	const [learnersLoaded, setLearnersLoaded] = useState(false)

	// ── Subject-wise state ──
	const [offerings, setOfferings] = useState<OfferingOption[]>([])
	const [loadingOfferings, setLoadingOfferings] = useState(false)
	const [offeringProgram, setOfferingProgram] = useState('all')
	const [offeringId, setOfferingId] = useState('')
	const [subjectOffering, setSubjectOffering] = useState<BulkSubjectOffering | null>(null)
	const [candidates, setCandidates] = useState<BulkSubjectCandidate[]>([])
	const [loadingCandidates, setLoadingCandidates] = useState(false)
	const [candidateSearch, setCandidateSearch] = useState('')
	const [candidateStatus, setCandidateStatus] = useState('eligible')
	const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())

	// ── Learner-wise state ──
	const [pickProgram, setPickProgram] = useState('all')
	const [pickSemester, setPickSemester] = useState('all')
	const [pickSearch, setPickSearch] = useState('')
	const [pickedLearners, setPickedLearners] = useState<Set<string>>(new Set())
	const [pasteOpen, setPasteOpen] = useState(false)
	const [pasteText, setPasteText] = useState('')
	const [learnerCourses, setLearnerCourses] = useState<BulkLearnerCourses[]>([])
	const [loadingLearnerCourses, setLoadingLearnerCourses] = useState(false)
	const [courseSearch, setCourseSearch] = useState('')
	const [courseStatus, setCourseStatus] = useState('eligible')
	const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

	const debouncedCandidateSearch = useDebounce(candidateSearch, 200)
	const debouncedPickSearch = useDebounce(pickSearch, 200)
	const debouncedCourseSearch = useDebounce(courseSearch, 200)

	const resetSubject = useCallback(() => {
		setOfferingId('')
		setSubjectOffering(null)
		setCandidates([])
		setSelectedCandidates(new Set())
		setCandidateSearch('')
	}, [])

	const resetLearnerWise = useCallback(() => {
		setPickedLearners(new Set())
		setLearnerCourses([])
		setSelectedRows(new Set())
		setCourseSearch('')
	}, [])

	// Reset everything when the institution changes
	useEffect(() => {
		setSessionId('')
		setSessionCode('')
		setOfferings([])
		setAllLearners([])
		setLearnersLoaded(false)
		setFeeContext(null)
		resetSubject()
		resetLearnerWise()
		setFailures([])
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [institutionsId])

	// Reset the working set when the session changes
	useEffect(() => {
		resetSubject()
		resetLearnerWise()
		setFailures([])
		setFeeContext(null)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId])

	// Keep session_code in sync with the globally selected session
	useEffect(() => {
		if (!sessionId) return
		const match = sessions.find(s => s.id === sessionId)
		if (match) setSessionCode(match.session_code || '')
	}, [sessionId, sessions])

	// Changing the paper type invalidates the current selection, since a selected
	// row may no longer be visible under the new filter.
	useEffect(() => {
		setSelectedCandidates(new Set())
		setSelectedRows(new Set())
	}, [paperType])

	// -------------------------------------------------------------
	// Course offerings for the session (subject-wise dropdown)
	// -------------------------------------------------------------
	useEffect(() => {
		if (!institutionCode || !sessionId) {
			setOfferings([])
			return
		}
		setLoadingOfferings(true)
		const params = new URLSearchParams({ institution_code: institutionCode, examination_session_id: sessionId })
		fetch(`/api/course-management/course-offering?${params}`)
			.then(parseJsonResponse)
			.then(data => {
				const arr: any[] = Array.isArray(data) ? data : (data?.data || [])
				const rows = arr.map(o => ({
					id: o.id,
					course_code: o.course_code || '',
					course_title: o.course_title || o.course_name || '',
					program_code: o.program_code || '',
					semester: o.semester || 0,
				}))
				rows.sort((a, b) =>
					a.program_code.localeCompare(b.program_code) ||
					(a.semester - b.semester) ||
					a.course_code.localeCompare(b.course_code)
				)
				setOfferings(rows)
			})
			.catch(err => {
				console.error('[bulk-application] load offerings failed:', err)
				setOfferings([])
			})
			.finally(() => setLoadingOfferings(false))
	}, [institutionCode, sessionId])

	// -------------------------------------------------------------
	// MyJKKN learners (one sweep per institution, filtered client-side)
	//
	// MyJKKN server-side program/semester filters are unreliable and return a
	// stripped record shape, so the whole institution is swept once and cached.
	// -------------------------------------------------------------
	const loadAllLearners = useCallback(async (): Promise<MyLearner[]> => {
		if (myjkknInstitutionIds.length === 0) {
			toast({ title: '⚠️ No MyJKKN Link', description: 'This institution is not linked to MyJKKN', variant: 'destructive' })
			return []
		}

		setLoadingAllLearners(true)
		try {
			const rows: MyLearner[] = []
			const seen = new Set<string>()
			const allowed = new Set(myjkknInstitutionIds)
			let fetched = 0
			let otherInstitution = 0

			for (const myjkknInstId of myjkknInstitutionIds) {
				const params = new URLSearchParams({ institution_id: myjkknInstId, fetchAll: 'true' })
				const res = await fetch(`/api/myjkkn/learner-profiles?${params}`)
				if (!res.ok) continue
				const raw = await parseJsonResponse(res)
				const list: any[] = raw?.data || raw || []

				// MyJKKN ignores the institution_id query filter and returns every learner
				// on the platform, so the response must be scoped here. Only trust the
				// field when the response actually carries it - some MyJKKN record shapes
				// strip institution_id, and filtering on a missing field would empty the
				// list entirely.
				const responseCarriesInstitution = list.some((s: any) => s?.institution_id)

				for (const s of list) {
					if (!s?.id || seen.has(s.id)) continue
					fetched++
					if (responseCarriesInstitution && allowed.size > 0 && !allowed.has(s.institution_id)) {
						otherInstitution++
						continue
					}
					seen.add(s.id)
					rows.push({
						id: s.id,
						register_number: s.register_number || s.roll_number || '',
						student_name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.name || '',
						program_code: s.program_code || s.program_id || '',
						program_name: s.program_name || '',
						current_semester: Number(s.current_semester) || 0,
					})
				}

				if (!responseCarriesInstitution) {
					console.warn('[bulk-application] MyJKKN response carries no institution_id - learners could not be scoped to this college')
				}
			}

			rows.sort((a, b) => a.register_number.localeCompare(b.register_number))
			console.log(`[bulk-application] learners: ${fetched} fetched, ${otherInstitution} from other institutions dropped, ${rows.length} kept`)
			setAllLearners(rows)
			setLearnersLoaded(true)
			return rows
		} catch (err) {
			console.error('[bulk-application] load learners failed:', err)
			toast({ title: '❌ Load Failed', description: 'Failed to load learners from MyJKKN', variant: 'destructive' })
			return []
		} finally {
			setLoadingAllLearners(false)
		}
	}, [myjkknInstitutionIds, toast])

	const ensureLearners = useCallback(async (): Promise<MyLearner[]> => {
		if (learnersLoaded) return allLearners
		return loadAllLearners()
	}, [learnersLoaded, allLearners, loadAllLearners])

	// Learner-wise mode needs the picker populated up front
	useEffect(() => {
		if (mode !== 'learner' || !sessionId || learnersLoaded || loadingAllLearners) return
		loadAllLearners()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode, sessionId, learnersLoaded])

	// -------------------------------------------------------------
	// Subject-wise: load candidates for the selected offering
	// -------------------------------------------------------------
	const loadCandidates = useCallback(async (selectedOfferingId: string) => {
		if (!institutionsId || !sessionId || !selectedOfferingId) return

		const offering = offerings.find(o => o.id === selectedOfferingId)
		setLoadingCandidates(true)
		setCandidates([])
		setSelectedCandidates(new Set())
		setSubjectOffering(null)

		try {
			// The current-paper pool is the programme + semester cohort of the offering.
			const learners = await ensureLearners()
			const cohort = offering
				? learners
					.filter(l => l.program_code === offering.program_code && l.current_semester === offering.semester)
					.map(l => ({
						student_id: l.id,
						register_number: l.register_number,
						student_name: l.student_name,
						program_code: l.program_code,
						semester: l.current_semester,
					}))
				: []

			const res = await fetch('/api/exam-management/exam-applications/bulk/subject-candidates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: institutionsId,
					examination_session_id: sessionId,
					course_offering_id: selectedOfferingId,
					cohort,
				}),
			})
			const raw = await parseJsonResponse(res)
			if (!res.ok) throw new Error(raw?.error || 'Failed to load candidates')

			setSubjectOffering(raw?.offering || null)
			setCandidates(raw?.data || [])
			setFeeContext(raw?.fee || null)
		} catch (err) {
			console.error('[bulk-application] load candidates failed:', err)
			toast({
				title: '❌ Failed',
				description: err instanceof Error ? err.message : 'Failed to load learners for this subject',
				variant: 'destructive',
			})
		} finally {
			setLoadingCandidates(false)
		}
	}, [institutionsId, sessionId, offerings, ensureLearners, toast])

	// -------------------------------------------------------------
	// Learner-wise: load the merged course list for the picked learners
	// -------------------------------------------------------------
	const loadLearnerCourses = useCallback(async () => {
		if (!institutionsId || !sessionId || pickedLearners.size === 0) return
		if (pickedLearners.size > MAX_LEARNERS_PER_BATCH) {
			toast({
				title: '⚠️ Too many learners',
				description: `Select at most ${MAX_LEARNERS_PER_BATCH} learners per batch (${pickedLearners.size} selected).`,
				variant: 'destructive',
			})
			return
		}

		setLoadingLearnerCourses(true)
		setLearnerCourses([])
		setSelectedRows(new Set())

		try {
			const learners = allLearners
				.filter(l => pickedLearners.has(l.id))
				.map(l => ({
					student_id: l.id,
					register_number: l.register_number,
					student_name: l.student_name,
					program_code: l.program_code,
					semester: l.current_semester,
				}))

			const res = await fetch('/api/exam-management/exam-applications/bulk/learner-courses', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: institutionsId,
					examination_session_id: sessionId,
					learners,
				}),
			})
			const raw = await parseJsonResponse(res)
			if (!res.ok) throw new Error(raw?.error || 'Failed to load courses')

			setLearnerCourses(raw?.data || [])
			setFeeContext(raw?.fee || null)
		} catch (err) {
			console.error('[bulk-application] load learner courses failed:', err)
			toast({
				title: '❌ Failed',
				description: err instanceof Error ? err.message : 'Failed to load courses for the selected learners',
				variant: 'destructive',
			})
		} finally {
			setLoadingLearnerCourses(false)
		}
	}, [institutionsId, sessionId, pickedLearners, allLearners, toast])

	const showFee = Boolean(feeContext?.configured)

	// -------------------------------------------------------------
	// Subject-wise derived state
	// -------------------------------------------------------------
	const offeringProgramOptions = useMemo(() => {
		const codes = [...new Set(offerings.map(o => o.program_code).filter(Boolean))].sort()
		return [{ value: 'all', label: 'All programs' }, ...codes.map(c => ({ value: c, label: c }))]
	}, [offerings])

	const offeringOptions = useMemo(
		() => offerings
			.filter(o => offeringProgram === 'all' || o.program_code === offeringProgram)
			.map(o => ({
				value: o.id,
				label: `${o.course_code} - ${o.course_title || 'Untitled'} (${o.program_code} · Sem ${romanSemester(o.semester)})`,
			})),
		[offerings, offeringProgram]
	)

	const filteredCandidates = useMemo(() => {
		const q = debouncedCandidateSearch.trim().toLowerCase()
		return candidates.filter(c => {
			if (q && !c.register_number.toLowerCase().includes(q) && !c.student_name.toLowerCase().includes(q)) return false
			if (paperType === 'current' && c.is_backlog) return false
			if (paperType === 'arrear' && !c.is_backlog) return false
			if (candidateStatus === 'eligible' && !c.is_eligible) return false
			if (candidateStatus === 'not_eligible' && c.is_eligible) return false
			return true
		})
	}, [candidates, debouncedCandidateSearch, paperType, candidateStatus])

	const selectableCandidates = useMemo(() => filteredCandidates.filter(c => c.is_eligible), [filteredCandidates])
	const allCandidatesChecked = selectableCandidates.length > 0 && selectableCandidates.every(c => selectedCandidates.has(c.key))

	const toggleCandidate = useCallback((key: string) => {
		setSelectedCandidates(prev => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}, [])

	const toggleAllCandidates = () => {
		setSelectedCandidates(prev => {
			const next = new Set(prev)
			if (allCandidatesChecked) selectableCandidates.forEach(c => next.delete(c.key))
			else selectableCandidates.forEach(c => next.add(c.key))
			return next
		})
	}

	// -------------------------------------------------------------
	// Learner-wise derived state
	// -------------------------------------------------------------
	const programOptions = useMemo(() => {
		const seen = new Map<string, string>()
		for (const l of allLearners) {
			if (l.program_code && !seen.has(l.program_code)) seen.set(l.program_code, l.program_name || l.program_code)
		}
		return [
			{ value: 'all', label: 'All programs' },
			...[...seen.entries()]
				.sort((a, b) => a[0].localeCompare(b[0]))
				.map(([code, name]) => ({ value: code, label: `${code} - ${name}` })),
		]
	}, [allLearners])

	const semesterOptions = useMemo(() => {
		const nums = [...new Set(allLearners.map(l => l.current_semester).filter(n => n > 0))].sort((a, b) => a - b)
		return [{ value: 'all', label: 'All semesters' }, ...nums.map(n => ({ value: String(n), label: `Semester ${romanSemester(n)}` }))]
	}, [allLearners])

	const filteredPickLearners = useMemo(() => {
		const q = debouncedPickSearch.trim().toLowerCase()
		return allLearners.filter(l => {
			if (pickProgram !== 'all' && l.program_code !== pickProgram) return false
			if (pickSemester !== 'all' && String(l.current_semester) !== pickSemester) return false
			if (q && !l.register_number.toLowerCase().includes(q) && !l.student_name.toLowerCase().includes(q)) return false
			return true
		})
	}, [allLearners, pickProgram, pickSemester, debouncedPickSearch])

	const allPickChecked = filteredPickLearners.length > 0 && filteredPickLearners.every(l => pickedLearners.has(l.id))

	const togglePick = useCallback((id: string) => {
		setPickedLearners(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}, [])

	const toggleAllPicks = () => {
		setPickedLearners(prev => {
			const next = new Set(prev)
			if (allPickChecked) filteredPickLearners.forEach(l => next.delete(l.id))
			else filteredPickLearners.forEach(l => next.add(l.id))
			return next
		})
	}

	const applyPastedRegisterNumbers = () => {
		const wanted = new Set(
			pasteText
				.split(/[\s,;]+/)
				.map(s => s.trim().toUpperCase())
				.filter(Boolean)
		)
		if (wanted.size === 0) {
			toast({ title: '⚠️ Nothing pasted', description: 'Paste one or more register numbers', variant: 'destructive' })
			return
		}

		const matched = allLearners.filter(l => wanted.has(l.register_number.toUpperCase()))
		const matchedNumbers = new Set(matched.map(l => l.register_number.toUpperCase()))
		const missing = [...wanted].filter(w => !matchedNumbers.has(w))

		setPickedLearners(prev => {
			const next = new Set(prev)
			matched.forEach(l => next.add(l.id))
			return next
		})
		setPasteOpen(false)
		setPasteText('')

		if (missing.length > 0) {
			toast({
				title: `⚠️ ${matched.length} matched, ${missing.length} not found`,
				description: `Not in this institution: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`,
				variant: 'destructive',
			})
		} else {
			toast({
				title: `✅ ${matched.length} learners selected`,
				description: 'All pasted register numbers matched',
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		}
	}

	const learnerCourseRows = useMemo(() => {
		const rows: LearnerCourseRow[] = []
		for (const learner of learnerCourses) {
			for (const course of learner.courses) {
				rows.push({
					rowKey: `${learner.key}|${course.key}`,
					learnerKey: learner.key,
					student_id: learner.student_id,
					register_number: learner.register_number,
					student_name: learner.student_name,
					program_code: learner.program_code,
					semester: learner.semester,
					course,
				})
			}
		}
		return rows
	}, [learnerCourses])

	/** Per-learner current/arrear tallies, shown as badges on the picker once loaded */
	const countsByRegister = useMemo(() => {
		const map = new Map<string, { current: number; arrear: number }>()
		for (const learner of learnerCourses) {
			const key = learner.register_number.toUpperCase()
			const entry = { current: 0, arrear: 0 }
			for (const course of learner.courses) {
				if (!course.is_eligible) continue
				if (course.is_backlog) entry.arrear++
				else entry.current++
			}
			map.set(key, entry)
		}
		return map
	}, [learnerCourses])

	const filteredRows = useMemo(() => {
		const q = debouncedCourseSearch.trim().toLowerCase()
		return learnerCourseRows.filter(r => {
			if (q &&
				!r.register_number.toLowerCase().includes(q) &&
				!r.student_name.toLowerCase().includes(q) &&
				!r.course.course_code.toLowerCase().includes(q) &&
				!r.course.course_name.toLowerCase().includes(q)) return false
			if (paperType === 'current' && r.course.is_backlog) return false
			if (paperType === 'arrear' && !r.course.is_backlog) return false
			if (courseStatus === 'eligible' && !r.course.is_eligible) return false
			if (courseStatus === 'not_eligible' && r.course.is_eligible) return false
			return true
		})
	}, [learnerCourseRows, debouncedCourseSearch, paperType, courseStatus])

	const selectableRows = useMemo(() => filteredRows.filter(r => r.course.is_eligible), [filteredRows])
	const allRowsChecked = selectableRows.length > 0 && selectableRows.every(r => selectedRows.has(r.rowKey))

	const toggleRow = useCallback((key: string) => {
		setSelectedRows(prev => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}, [])

	const toggleAllRows = () => {
		setSelectedRows(prev => {
			const next = new Set(prev)
			if (allRowsChecked) selectableRows.forEach(r => next.delete(r.rowKey))
			else selectableRows.forEach(r => next.add(r.rowKey))
			return next
		})
	}

	// -------------------------------------------------------------
	// Selection summary — the exact rows that will be created
	// -------------------------------------------------------------
	const selection = useMemo(() => {
		if (mode === 'subject') {
			const picked = candidates.filter(c => selectedCandidates.has(c.key))
			return {
				total: picked.length,
				current: picked.filter(c => !c.is_backlog).length,
				arrear: picked.filter(c => c.is_backlog).length,
				learners: picked.length,
				fee: picked.reduce((sum, c) => sum + (c.fee_total || 0), 0),
			}
		}

		const picked = learnerCourseRows.filter(r => selectedRows.has(r.rowKey))
		const learnerKeys = new Set(picked.map(r => r.learnerKey))

		// Papers are billed per row; the mark statement / application / fine are
		// billed once per learner, so they are added per distinct learner touched.
		let fee = picked.reduce((sum, r) => sum + (r.course.fee_amount || 0), 0)
		for (const key of learnerKeys) {
			const learner = learnerCourses.find(l => l.key === key)
			if (learner?.fee) fee += learner.fee.learner_total + learner.fee.fine
		}

		return {
			total: picked.length,
			current: picked.filter(r => !r.course.is_backlog).length,
			arrear: picked.filter(r => r.course.is_backlog).length,
			learners: learnerKeys.size,
			fee,
		}
	}, [mode, candidates, selectedCandidates, learnerCourseRows, selectedRows, learnerCourses])

	const pendingCount = selection.total

	// -------------------------------------------------------------
	// Submit
	// -------------------------------------------------------------
	const buildItems = () => {
		if (mode === 'subject') {
			if (!subjectOffering) return []
			return candidates
				.filter(c => selectedCandidates.has(c.key))
				.map(c => ({
					student_id: c.student_id,
					register_number: c.register_number,
					student_name: c.student_name,
					program_code: c.program_code || subjectOffering.program_code,
					semester: c.semester ?? subjectOffering.semester,
					course_code: subjectOffering.course_code,
					course_offering_id: subjectOffering.course_offering_id,
				}))
		}
		return learnerCourseRows
			.filter(r => selectedRows.has(r.rowKey))
			.map(r => ({
				student_id: r.student_id,
				register_number: r.register_number,
				student_name: r.student_name,
				program_code: r.program_code,
				semester: r.semester,
				course_code: r.course.course_code,
				course_offering_id: r.course.course_offering_id,
			}))
	}

	const handleSubmitClick = () => {
		if (!institutionsId || !sessionId) {
			toast({ title: '⚠️ Missing scope', description: 'Select an institution and exam session first.', variant: 'destructive' })
			return
		}
		if (pendingCount === 0) {
			toast({ title: '⚠️ Nothing selected', description: 'Select at least one eligible row.', variant: 'destructive' })
			return
		}
		setConfirmOpen(true)
	}

	const handleConfirmSubmit = async () => {
		setConfirmOpen(false)
		setSubmitting(true)
		setFailures([])

		try {
			const items = buildItems()
			const res = await fetch('/api/exam-management/exam-applications/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: institutionsId,
					institution_code: institutionCode,
					examination_session_id: sessionId,
					session_code: sessionCode,
					items,
				}),
			})
			const raw = await parseJsonResponse(res)

			if (!res.ok && !raw?.summary) {
				throw new Error(raw?.error || 'Failed to submit the bulk exam application')
			}

			const summary = raw?.summary || { created: 0, skipped: 0, failed: 0 }
			const rejected: BulkApplicationResult[] = (raw?.results || []).filter((r: BulkApplicationResult) => r.status === 'failed')
			setFailures(rejected)

			if (summary.failed === 0) {
				toast({
					title: '✅ Applications Submitted',
					description: raw?.message || 'No changes',
					className: 'bg-green-50 border-green-200 text-green-800',
				})
			} else {
				toast({
					title: '⚠️ Partially Submitted',
					description: raw?.message || 'Some rows were rejected',
					variant: 'destructive',
				})
			}

			// Refresh so the just-applied rows show as registered
			if (mode === 'subject') {
				setSelectedCandidates(new Set())
				if (offeringId) await loadCandidates(offeringId)
			} else {
				setSelectedRows(new Set())
				await loadLearnerCourses()
			}
		} catch (err) {
			console.error('[bulk-application] submit failed:', err)
			toast({
				title: '❌ Submit Failed',
				description: err instanceof Error ? err.message : 'Failed to submit the bulk exam application',
				variant: 'destructive',
			})
		} finally {
			setSubmitting(false)
		}
	}

	// -------------------------------------------------------------
	// Stats
	// -------------------------------------------------------------
	const stats = useMemo(() => {
		if (mode === 'subject') {
			return {
				total: candidates.length,
				current: candidates.filter(c => !c.is_backlog).length,
				arrear: candidates.filter(c => c.is_backlog).length,
				eligible: candidates.filter(c => c.is_eligible).length,
			}
		}
		return {
			total: learnerCourseRows.length,
			current: learnerCourseRows.filter(r => !r.course.is_backlog).length,
			arrear: learnerCourseRows.filter(r => r.course.is_backlog).length,
			eligible: learnerCourseRows.filter(r => r.course.is_eligible).length,
		}
	}, [mode, candidates, learnerCourseRows])

	const showInstitutionField = mustSelectInstitution
	const scopeReady = Boolean(institutionsId && sessionId)

	const paperTypeOptions: { value: PaperType; label: string }[] = [
		{ value: 'current', label: 'Current Papers' },
		{ value: 'arrear', label: 'Arrear Papers' },
		{ value: 'both', label: 'Both' },
	]

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0">

						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem><BreadcrumbLink asChild><Link href="/dashboard">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem><BreadcrumbLink asChild><Link href="/exam-management/exam-applications">Exam Applications</Link></BreadcrumbLink></BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem><BreadcrumbPage>Bulk Application</BreadcrumbPage></BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						{/* Stats */}
						<div className={cn('grid grid-cols-2 gap-3', showFee ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
							<Card className="border-l-4 border-l-violet-500">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.total}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">{mode === 'subject' ? 'Candidates' : 'Learner × Course'}</p>
									</div>
									<Users className="h-5 w-5 text-violet-500/40" />
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-emerald-500">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{stats.current}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Current Paper</p>
									</div>
									<BookOpen className="h-5 w-5 text-emerald-500/40" />
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-rose-500">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">{stats.arrear}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Arrear Paper</p>
									</div>
									<RotateCcw className="h-5 w-5 text-rose-500/40" />
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-amber-500">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{pendingCount} / {stats.eligible}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Selected / Eligible</p>
									</div>
									<ClipboardCheck className="h-5 w-5 text-amber-500/40" />
								</CardContent>
							</Card>
							{showFee && (
								<Card className="border-l-4 border-l-sky-500">
									<CardContent className="p-4 flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight text-sky-600 dark:text-sky-400">{money(selection.fee)}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Fee for selection</p>
										</div>
										<IndianRupee className="h-5 w-5 text-sky-500/40" />
									</CardContent>
								</Card>
							)}
						</div>

						{/* Scope + mode */}
						<Card>
							<CardHeader className="px-4 py-3 border-b">
								<div className="flex items-center justify-between gap-3 flex-wrap">
									<div>
										<h2 className="text-base font-semibold">Bulk Exam Application</h2>
										<p className="text-xs text-muted-foreground">
											Institution → Session → {mode === 'subject' ? 'Subject code → pick learners' : 'pick learners → pick papers'}
										</p>
									</div>
									<Link href="/exam-management/exam-applications">
										<Button variant="outline" size="sm" className="h-8 text-sm px-3 gap-1.5">
											<ArrowLeft className="h-3.5 w-3.5" />Exam Applications
										</Button>
									</Link>
								</div>
							</CardHeader>
							<CardContent className="p-4 space-y-3">
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
									{showInstitutionField && (
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">Institution <span className="text-red-500">*</span></Label>
											<Select
												value={selectedInstitution?.id || ''}
												onValueChange={val => {
													const inst = availableInstitutions.find((i: Institution) => i.id === val)
													selectInstitution(inst || null)
												}}
											>
												<SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select institution" /></SelectTrigger>
												<SelectContent>
													{availableInstitutions.filter((i: Institution) => i.id !== 'all').map((inst: Institution) => (
														<SelectItem key={inst.id} value={inst.id}>{inst.institution_name}</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}

									{mustSelectSession && (
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">Exam Session <span className="text-red-500">*</span></Label>
											<Select
												value={sessionId}
												onValueChange={val => {
													setSessionId(val)
													setSessionCode(sessions.find(s => s.id === val)?.session_code || '')
												}}
												disabled={!institutionsId || loadingSessions}
											>
												<SelectTrigger className="h-9 text-sm">
													{loadingSessions
														? <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading...</span>
														: <SelectValue placeholder="Select session" />}
												</SelectTrigger>
												<SelectContent>
													{sessions.map(s => <SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>)}
												</SelectContent>
											</Select>
										</div>
									)}

									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Register By</Label>
										<Segmented
											value={mode}
											onChange={(v: BulkApplicationMode) => setMode(v)}
											options={[
												{ value: 'subject' as BulkApplicationMode, label: 'Subject Code wise' },
												{ value: 'learner' as BulkApplicationMode, label: 'Learner wise' },
											]}
										/>
									</div>

									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Paper Type</Label>
										<Segmented value={paperType} onChange={setPaperType} options={paperTypeOptions} />
									</div>
								</div>

								{/* Fee banner — only for the two states that need action:
								    fees not configured, or a late fee now being charged.
								    Otherwise stay silent; the amounts are on every row. */}
								{feeContext && (!feeContext.configured || feeContext.fine_applicable) && (
									<div className={cn(
										'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
										!feeContext.configured
											? 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900'
											: 'border-rose-200 bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200 dark:border-rose-900'
									)}>
										<Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
										{!feeContext.configured ? (
											<p>
												No exam fee rates are configured for this institution — applications will still save, but no fee is shown.{' '}
												<Link href="/fee-details" className="underline font-medium">Configure fees</Link>
											</p>
										) : (
											<p className="font-medium">
												Late fee of {money(feeContext.fine_amount)} applies — the no-fine date
												{feeContext.last_date_without_fine ? ` (${feeContext.last_date_without_fine})` : ''} has passed
											</p>
										)}
									</div>
								)}

								{!scopeReady && (
									<p className="text-xs text-muted-foreground">Select an institution and exam session to begin.</p>
								)}
							</CardContent>
						</Card>

						{/* ── Subject-wise ── */}
						{mode === 'subject' && (
							<Card className="flex flex-col min-h-[520px]">
								<CardHeader className="px-4 py-3 border-b space-y-3">
									<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">Program</Label>
											<SearchableSelect
												value={offeringProgram}
												onValueChange={val => { setOfferingProgram(val); resetSubject() }}
												placeholder="All programs"
												searchPlaceholder="Search program..."
												options={offeringProgramOptions}
												disabled={!scopeReady}
												loading={loadingOfferings}
											/>
										</div>
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">Subject Code <span className="text-red-500">*</span></Label>
											<SearchableSelect
												value={offeringId}
												onValueChange={val => { setOfferingId(val); loadCandidates(val) }}
												placeholder="Select subject code"
												searchPlaceholder="Search by code, title or program..."
												options={offeringOptions}
												disabled={!scopeReady}
												loading={loadingOfferings}
											/>
										</div>
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">Status</Label>
											<Select value={candidateStatus} onValueChange={setCandidateStatus}>
												<SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
												<SelectContent>
													<SelectItem value="eligible">Eligible only</SelectItem>
													<SelectItem value="not_eligible">Not eligible only</SelectItem>
													<SelectItem value="all">All statuses</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">Search</Label>
											<div className="relative">
												<Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
												<Input
													value={candidateSearch}
													onChange={e => setCandidateSearch(e.target.value)}
													placeholder="Register no or name"
													className="pl-8 h-9 text-sm"
												/>
											</div>
										</div>
									</div>

									{subjectOffering && (
										<div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
											<Badge variant="outline" className="font-mono text-[10px]">{subjectOffering.course_code}</Badge>
											<span className="font-medium text-foreground">{subjectOffering.course_name || 'Untitled course'}</span>
											<span>·</span>
											<span>{subjectOffering.program_code}</span>
											<span>·</span>
											<span>Sem {romanSemester(subjectOffering.semester)}</span>
											{subjectOffering.max_enrollment != null && (
												<>
													<span>·</span>
													<span>Seats {subjectOffering.enrolled_count ?? 0}/{subjectOffering.max_enrollment}</span>
												</>
											)}
											{!subjectOffering.is_active && (
												<Badge variant="outline" className="text-[10px] border-red-200 bg-red-50 text-red-700">Inactive offering</Badge>
											)}
											<Button
												variant="ghost"
												size="sm"
												className="h-6 px-2 text-xs gap-1"
												onClick={() => loadCandidates(offeringId)}
												disabled={loadingCandidates}
											>
												<RefreshCw className={cn('h-3 w-3', loadingCandidates && 'animate-spin')} />Refresh
											</Button>
										</div>
									)}
								</CardHeader>

								<CardContent className="p-0 flex-1 flex flex-col min-h-0">
									{loadingCandidates || loadingAllLearners ? (
										<div className="flex items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
											<Loader2 className="h-4 w-4 animate-spin mr-2" />
											{loadingAllLearners ? 'Loading learners from MyJKKN...' : 'Building the candidate list...'}
										</div>
									) : !offeringId ? (
										<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
											<BookOpen className="h-8 w-8 mb-2 opacity-40" />
											<p>Select a subject code to list the learners who can apply</p>
											<p className="text-xs mt-1 opacity-80">Both the current-paper cohort and anyone holding an arrear in this subject</p>
										</div>
									) : filteredCandidates.length === 0 ? (
										<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
											<Users className="h-8 w-8 mb-2 opacity-40" />
											<p>{candidates.length === 0 ? 'No learners found for this subject' : 'No learners match the current filters'}</p>
										</div>
									) : (
										<>
											<div className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/40 text-xs font-medium">
												<label className="flex items-center gap-2 cursor-pointer flex-1">
													<Checkbox checked={allCandidatesChecked} onCheckedChange={toggleAllCandidates} disabled={selectableCandidates.length === 0} />
													<span>
														Select all eligible ({selectableCandidates.length}) · showing {filteredCandidates.length} of {candidates.length}
													</span>
												</label>
												{showFee && <span className="w-20 text-right text-muted-foreground">Fee</span>}
												<span className="w-[112px] text-center text-muted-foreground">Status</span>
											</div>
											<div className="flex-1 min-h-0" style={{ minHeight: 340 }}>
												<AutoSizer>
													{({ height, width }) => (
														<VirtualList height={height} width={width} itemCount={filteredCandidates.length} itemSize={ROW_HEIGHT}>
															{({ index, style }) => {
																const c = filteredCandidates[index]
																return (
																	<CandidateRow
																		style={style}
																		candidate={c}
																		checked={selectedCandidates.has(c.key)}
																		onToggle={toggleCandidate}
																		showFee={showFee}
																	/>
																)
															}}
														</VirtualList>
													)}
												</AutoSizer>
											</div>
										</>
									)}
								</CardContent>
							</Card>
						)}

						{/* ── Learner-wise ── */}
						{mode === 'learner' && (
							<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)] gap-3">

								{/* Learner picker */}
								<Card className="flex flex-col min-h-[520px]">
									<CardHeader className="px-4 py-3 border-b space-y-3">
										<div className="flex items-center justify-between gap-2">
											<div>
												<h3 className="text-sm font-semibold">Learners</h3>
												<p className="text-xs text-muted-foreground">
													{loadingAllLearners
														? 'Loading from MyJKKN...'
														: `${filteredPickLearners.length} of ${allLearners.length} • ${pickedLearners.size} selected`}
												</p>
											</div>
											<div className="flex items-center gap-1.5">
												<Popover open={pasteOpen} onOpenChange={setPasteOpen}>
													<PopoverTrigger asChild>
														<Button variant="outline" size="sm" className="h-8 text-xs px-2 gap-1.5" disabled={!learnersLoaded}>
															<ClipboardPaste className="h-3.5 w-3.5" />Paste
														</Button>
													</PopoverTrigger>
													<PopoverContent className="w-80 p-3 space-y-2" align="end">
														<Label className="text-xs font-medium">Paste register numbers</Label>
														<Textarea
															value={pasteText}
															onChange={e => setPasteText(e.target.value)}
															placeholder={'One per line, or separated by comma / space'}
															className="h-32 text-sm font-mono"
														/>
														<Button size="sm" className="w-full h-8 text-xs" onClick={applyPastedRegisterNumbers}>
															Select matching learners
														</Button>
													</PopoverContent>
												</Popover>
												<Button
													variant="outline"
													size="sm"
													className="h-8 text-xs px-2"
													onClick={loadAllLearners}
													disabled={loadingAllLearners || !scopeReady}
												>
													<RefreshCw className={cn('h-3.5 w-3.5', loadingAllLearners && 'animate-spin')} />
												</Button>
											</div>
										</div>

										<div className="grid grid-cols-2 gap-2">
											<SearchableSelect
												value={pickProgram}
												onValueChange={setPickProgram}
												placeholder="All programs"
												searchPlaceholder="Search program..."
												options={programOptions}
												disabled={!learnersLoaded}
											/>
											<Select value={pickSemester} onValueChange={setPickSemester} disabled={!learnersLoaded}>
												<SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All semesters" /></SelectTrigger>
												<SelectContent>
													{semesterOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
												</SelectContent>
											</Select>
										</div>

										<div className="relative">
											<Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
											<Input
												value={pickSearch}
												onChange={e => setPickSearch(e.target.value)}
												placeholder="Search register no or name..."
												className="pl-8 h-9 text-sm"
												disabled={!learnersLoaded}
											/>
										</div>
									</CardHeader>

									<CardContent className="p-0 flex-1 flex flex-col min-h-0">
										{loadingAllLearners ? (
											<div className="flex items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
												<Loader2 className="h-4 w-4 animate-spin mr-2" />Loading learners...
											</div>
										) : filteredPickLearners.length === 0 ? (
											<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
												<Users className="h-8 w-8 mb-2 opacity-40" />
												<p>{scopeReady ? 'No learners match the current filters' : 'Select a session first'}</p>
											</div>
										) : (
											<>
												<label className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/40 cursor-pointer text-xs font-medium">
													<Checkbox checked={allPickChecked} onCheckedChange={toggleAllPicks} />
													<span>Select all ({filteredPickLearners.length})</span>
												</label>
												<div className="flex-1 min-h-0" style={{ minHeight: 280 }}>
													<AutoSizer>
														{({ height, width }) => (
															<VirtualList height={height} width={width} itemCount={filteredPickLearners.length} itemSize={ROW_HEIGHT}>
																{({ index, style }) => {
																	const l = filteredPickLearners[index]
																	return (
																		<LearnerPickRow
																			style={style}
																			learner={l}
																			checked={pickedLearners.has(l.id)}
																			counts={countsByRegister.get(l.register_number.toUpperCase())}
																			onToggle={togglePick}
																		/>
																	)
																}}
															</VirtualList>
														)}
													</AutoSizer>
												</div>
												<div className="p-3 border-t">
													<Button
														size="sm"
														className="w-full h-9 text-sm gap-1.5"
														onClick={loadLearnerCourses}
														disabled={pickedLearners.size === 0 || loadingLearnerCourses}
													>
														{loadingLearnerCourses
															? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading papers...</>
															: <><BookOpen className="h-3.5 w-3.5" />Load papers for {pickedLearners.size} learner{pickedLearners.size === 1 ? '' : 's'}</>}
													</Button>
												</div>
											</>
										)}
									</CardContent>
								</Card>

								{/* Learner x course rows */}
								<Card className="flex flex-col min-h-[520px]">
									<CardHeader className="px-4 py-3 border-b space-y-3">
										<div className="flex items-center justify-between gap-2 flex-wrap">
											<div>
												<h3 className="text-sm font-semibold">Papers to apply for</h3>
												<p className="text-xs text-muted-foreground">
													Each learner gets only their own papers — arrears are never applied across learners
												</p>
											</div>
											<Button
												variant="ghost"
												size="sm"
												className="h-8 text-xs px-2"
												onClick={() => setSelectedRows(new Set())}
												disabled={selectedRows.size === 0}
											>
												Clear selection
											</Button>
										</div>

										<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
											<Select value={courseStatus} onValueChange={setCourseStatus}>
												<SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
												<SelectContent>
													<SelectItem value="eligible">Eligible only</SelectItem>
													<SelectItem value="not_eligible">Not eligible only</SelectItem>
													<SelectItem value="all">All statuses</SelectItem>
												</SelectContent>
											</Select>
											<div className="relative">
												<Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
												<Input
													value={courseSearch}
													onChange={e => setCourseSearch(e.target.value)}
													placeholder="Search learner or paper"
													className="pl-8 h-9 text-sm"
												/>
											</div>
										</div>
									</CardHeader>

									<CardContent className="p-0 flex-1 flex flex-col min-h-0">
										{loadingLearnerCourses ? (
											<div className="flex items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
												<Loader2 className="h-4 w-4 animate-spin mr-2" />Building the paper lists...
											</div>
										) : learnerCourseRows.length === 0 ? (
											<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
												<ClipboardCheck className="h-8 w-8 mb-2 opacity-40" />
												<p>Pick learners on the left, then load their papers</p>
											</div>
										) : filteredRows.length === 0 ? (
											<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
												<ClipboardCheck className="h-8 w-8 mb-2 opacity-40" />
												<p>No papers match the current filters</p>
											</div>
										) : (
											<>
												<div className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/40 text-xs font-medium">
													<label className="flex items-center gap-2 cursor-pointer flex-1">
														<Checkbox checked={allRowsChecked} onCheckedChange={toggleAllRows} disabled={selectableRows.length === 0} />
														<span>
															Select all eligible ({selectableRows.length}) · showing {filteredRows.length} of {learnerCourseRows.length} · {learnerCourses.length} learners
														</span>
													</label>
													{showFee && <span className="w-16 text-right text-muted-foreground">Fee</span>}
													<span className="w-[112px] text-center text-muted-foreground">Status</span>
												</div>
												<div className="flex-1 min-h-0" style={{ minHeight: 340 }}>
													<AutoSizer>
														{({ height, width }) => (
															<VirtualList height={height} width={width} itemCount={filteredRows.length} itemSize={ROW_HEIGHT}>
																{({ index, style }) => {
																	const r = filteredRows[index]
																	return (
																		<LearnerCourseListRow
																			style={style}
																			row={r}
																			checked={selectedRows.has(r.rowKey)}
																			onToggle={toggleRow}
																			showFee={showFee}
																		/>
																	)
																}}
															</VirtualList>
														)}
													</AutoSizer>
												</div>
											</>
										)}
									</CardContent>
								</Card>
							</div>
						)}

						{/* Rejected rows from the last submit */}
						{failures.length > 0 && (
							<Card className="border-l-4 border-l-red-500">
								<CardHeader className="px-4 py-3 border-b">
									<div className="flex items-center justify-between">
										<h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
											{failures.length} row{failures.length === 1 ? '' : 's'} rejected
										</h3>
										<Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFailures([])}>Dismiss</Button>
									</div>
								</CardHeader>
								<CardContent className="p-0 max-h-56 overflow-y-auto">
									{failures.map((f, i) => (
										<div key={`${f.register_number}-${f.course_code}-${i}`} className="flex items-center gap-3 px-4 py-2 border-b text-sm">
											<span className="font-mono text-xs text-muted-foreground w-32 shrink-0 truncate">{f.register_number}</span>
											<span className="font-mono text-xs w-24 shrink-0 truncate">{f.course_code}</span>
											<span className="text-xs text-red-600 dark:text-red-400 truncate">{f.reason}</span>
										</div>
									))}
								</CardContent>
							</Card>
						)}
					</div>
				</PageTransition>

				{/* Sticky submit bar — shows exactly what will be created */}
				<div className="sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
					<div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
						<div className="flex items-center gap-2 flex-wrap text-sm">
							{pendingCount === 0 ? (
								<span className="text-muted-foreground">Nothing selected yet</span>
							) : (
								<>
									<span className="font-medium">{pendingCount} application{pendingCount === 1 ? '' : 's'}</span>
									<span className="text-muted-foreground">·</span>
									<Badge variant="outline" className={cn('text-[10px]', CURRENT_BADGE)}>{selection.current} current</Badge>
									<Badge variant="outline" className={cn('text-[10px]', ARREAR_BADGE)}>{selection.arrear} arrear</Badge>
									<span className="text-muted-foreground">·</span>
									<span className="text-muted-foreground">{selection.learners} learner{selection.learners === 1 ? '' : 's'}</span>
									{showFee && (
										<>
											<span className="text-muted-foreground">·</span>
											<span className="font-semibold text-sky-600 dark:text-sky-400">{money(selection.fee)}</span>
										</>
									)}
								</>
							)}
						</div>
						<Button
							onClick={handleSubmitClick}
							disabled={submitting || pendingCount === 0}
							className="h-9 text-sm gap-1.5"
						>
							{submitting
								? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Submitting...</>
								: <><Send className="h-3.5 w-3.5" />Submit {pendingCount > 0 ? `(${pendingCount})` : ''}</>}
						</Button>
					</div>
				</div>

				<AppFooter />
			</SidebarInset>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Submit bulk exam application?</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-2">
								<p>
									{pendingCount} application{pendingCount === 1 ? '' : 's'} across {selection.learners} learner
									{selection.learners === 1 ? '' : 's'} — {selection.current} current paper
									{selection.current === 1 ? '' : 's'} and {selection.arrear} arrear paper
									{selection.arrear === 1 ? '' : 's'}.
								</p>
								{showFee && (
									<p>
										Fee for this selection: <span className="font-semibold">{money(selection.fee)}</span>
										{feeContext?.fine_applicable ? ` (includes ${money(feeContext.fine_amount)} late fee per learner)` : ''}
									</p>
								)}
								<p>Arrear papers are recorded as arrear attempts. Anything already registered is skipped.</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleConfirmSubmit}>Submit</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
