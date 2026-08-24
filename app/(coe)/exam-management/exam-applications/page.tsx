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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitution, type Institution } from '@/context/institution-context'
import { cn } from '@/lib/utils'
import {
	BookOpen, Check, ChevronsUpDown, ClipboardCheck, IndianRupee, Info, Loader2,
	RefreshCw, RotateCcw, Search, Send, Users,
} from 'lucide-react'
import type {
	ArrearLearner,
	ArrearLearnersResponse,
	BulkFeeContext,
	BulkLearnerCourses,
	BulkSubjectCandidate,
	BulkSubjectOffering,
	CurrentPaperCohortResponse,
	CurrentPaperLearner,
	CurrentPaperRow,
	ExamApplicationCourse,
} from '@/types/exam-applications'

/**
 * Exam Applications
 * =====================================================
 * Two tabs, because the two populations are written completely differently:
 *
 *   Current Papers  the learners are ALREADY registered for this semester's
 *                   papers. Applying UPDATES those rows to 'Applied' and stamps
 *                   the fees - it never creates anything. Selection is therefore
 *                   at learner level: tick 9 of 10 learners and all 9 x 7 of
 *                   their registered papers move together.
 *
 *   Arrear Papers   nothing exists yet, so applying INSERTS a row per
 *                   (learner, arrear paper) with is_regular = false. Driven
 *                   learner-wise (pick learners, then their papers) or
 *                   subject-wise (pick a paper, then its learners).
 *
 * Every filter option list is served by the API from the rows the tab is about
 * to show, so choosing a programme narrows the semester list rather than leaving
 * a semester selected that matches nothing.
 */

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const ROW_HEIGHT = 56
const MAX_LEARNERS_PER_BATCH = 500

const CURRENT_BADGE = 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
const ARREAR_BADGE = 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'

const STATUS_STYLES: Record<string, string> = {
	'Applied': 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900',
	'Partial': 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
	'Not Applied': 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800',
}

const ELIGIBILITY_STYLES: Record<string, string> = {
	'Eligible': 'bg-green-100 text-green-700 border-green-200',
	'Already Registered': 'bg-amber-100 text-amber-700 border-amber-200',
	'Already Passed': 'bg-slate-100 text-slate-600 border-slate-200',
	'Not Offered': 'bg-red-100 text-red-700 border-red-200',
	'Inactive Offering': 'bg-red-100 text-red-700 border-red-200',
	'Attempts Exhausted': 'bg-red-100 text-red-700 border-red-200',
	'Seats Full': 'bg-orange-100 text-orange-700 border-orange-200',
}

const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const money = (value: number | null | undefined) =>
	value == null ? '—' : `₹${rupees.format(Math.round(value))}`

const romanSemester = (value: number | null | undefined) =>
	value == null || value === 0 ? '—' : (ROMAN[value] || String(value))

/**
 * Parse a fetch Response as JSON only when it actually is JSON. In dev
 * (Turbopack), hitting an API route mid-recompile returns an HTML page and
 * res.json() then throws an opaque "Unexpected token '<'".
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

// ── Scorecard ──
function StatCard({
	value, label, accent, icon: Icon, tone,
}: {
	value: string | number
	label: string
	accent: string
	icon: typeof Users
	tone?: string
}) {
	return (
		<Card className={cn('border-l-4', accent)}>
			<CardContent className="p-4 flex items-center justify-between">
				<div className="min-w-0">
					<p className={cn('text-2xl font-bold tracking-tight truncate', tone)}>{value}</p>
					<p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
				</div>
				<Icon className="h-5 w-5 opacity-40 shrink-0" />
			</CardContent>
		</Card>
	)
}

// ── Current Papers: one learner ──
const CurrentLearnerRow = memo(function CurrentLearnerRow({
	learner, checked, onToggle, showFee, style,
}: {
	learner: CurrentPaperLearner
	checked: boolean
	onToggle: (key: string) => void
	showFee: boolean
	style?: CSSProperties
}) {
	// A learner with nothing left to apply for is shown but cannot be selected -
	// re-applying them would be a no-op the server would only skip again.
	const disabled = learner.pending_subjects === 0

	return (
		<label
			style={style}
			className={cn(
				'flex items-center gap-3 px-4 border-b overflow-hidden',
				disabled ? 'bg-slate-50/60 dark:bg-slate-900/20 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30',
				!disabled && checked && 'bg-blue-50/40 dark:bg-blue-950/20'
			)}
		>
			<Checkbox checked={checked} disabled={disabled} onCheckedChange={() => onToggle(learner.key)} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5 flex-wrap">
					<span className="text-xs font-mono text-muted-foreground">{learner.register_number || '—'}</span>
					<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{learner.program_code || '—'}</Badge>
					<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Sem {romanSemester(learner.semester)}</Badge>
					<Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', CURRENT_BADGE)}>
						{learner.pending_subjects}/{learner.total_subjects} papers
					</Badge>
				</div>
				<div className="text-sm truncate">{learner.student_name || '—'}</div>
			</div>
			{showFee && (
				<div className="w-24 shrink-0 text-right">
					<div className="text-sm font-medium tabular-nums">{disabled ? '—' : money(learner.fee_total)}</div>
					{!disabled && !learner.already_charged && (learner.application_fee > 0 || learner.mark_statement_fee > 0) && (
						<div className="text-[10px] text-muted-foreground leading-tight">incl. app + MS</div>
					)}
				</div>
			)}
			<Badge
				variant="outline"
				className={cn('text-[10px] px-1.5 py-0 h-5 shrink-0 w-[92px] justify-center', STATUS_STYLES[learner.status] || '')}
			>
				{learner.status}
			</Badge>
		</label>
	)
})

// ── Current Papers: one distinct paper in the cohort ──
const CohortPaperRow = memo(function CohortPaperRow({
	paper, showFee, style,
}: {
	paper: CurrentPaperRow
	showFee: boolean
	style?: CSSProperties
}) {
	return (
		<div style={style} className="flex items-center gap-3 px-4 border-b overflow-hidden">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-xs font-mono text-muted-foreground">{paper.course_code}</span>
					<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Sem {romanSemester(paper.semester)}</Badge>
				</div>
				<div className="text-sm truncate">{paper.course_name || '—'}</div>
			</div>
			<div className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
				{paper.applied_count}/{paper.learner_count} applied
			</div>
			{showFee && (
				<div className="w-16 shrink-0 text-right text-sm font-medium tabular-nums">{money(paper.fee_amount)}</div>
			)}
		</div>
	)
})

// ── Arrear: learner picker ──
const ArrearLearnerRow = memo(function ArrearLearnerRow({
	learner, checked, onToggle, style,
}: {
	learner: ArrearLearner
	checked: boolean
	onToggle: (key: string) => void
	style?: CSSProperties
}) {
	const pending = learner.arrear_count - learner.registered_count
	return (
		<label
			style={style}
			className={cn(
				'flex items-center gap-2 px-4 border-b cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30 overflow-hidden',
				checked && 'bg-blue-50/40 dark:bg-blue-950/20'
			)}
		>
			<Checkbox checked={checked} onCheckedChange={() => onToggle(learner.key)} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5 flex-wrap">
					<span className="text-xs font-mono text-muted-foreground">{learner.register_number || '—'}</span>
					<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{learner.program_code || '—'}</Badge>
					<Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', ARREAR_BADGE)}>
						{pending > 0 ? `${pending} arrear` : 'all registered'}
					</Badge>
					{learner.semesters.length > 0 && (
						<span className="text-[10px] text-muted-foreground">
							Sem {learner.semesters.map(s => romanSemester(s)).join(', ')}
						</span>
					)}
				</div>
				<div className="text-sm truncate">{learner.student_name || '—'}</div>
			</div>
		</label>
	)
})

/** One (learner, arrear paper) row */
interface ArrearCourseRow {
	rowKey: string
	learnerKey: string
	student_id: string | null
	register_number: string
	student_name: string
	program_code: string | null
	semester: number | null
	course: ExamApplicationCourse
}

const ArrearPaperRow = memo(function ArrearPaperRow({
	row, checked, onToggle, showFee, style,
}: {
	row: ArrearCourseRow
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
					<Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', ARREAR_BADGE)}>
						Attempt {course.attempt_number}
					</Badge>
					<span className="hidden lg:inline text-[10px] text-muted-foreground">Sem {romanSemester(course.original_semester ?? course.semester)}</span>
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

// ── Arrear: subject-wise candidate ──
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
				<div className="flex items-center gap-2 flex-wrap">
					<span className="text-xs font-mono text-muted-foreground">{candidate.register_number || '—'}</span>
					<Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', candidate.is_backlog ? ARREAR_BADGE : CURRENT_BADGE)}>
						{candidate.is_backlog ? `Arrear · Attempt ${candidate.attempt_number}` : 'Current Paper'}
					</Badge>
					<span className="hidden lg:inline text-[10px] text-muted-foreground">{candidate.program_code || '—'}</span>
				</div>
				<div className="text-sm truncate">{candidate.student_name}</div>
			</div>
			{showFee && (
				<div className="w-20 shrink-0 text-right">
					<div className="text-sm font-medium tabular-nums">{candidate.is_eligible ? money(candidate.fee_total) : '—'}</div>
					{candidate.is_eligible && candidate.learner_charge > 0 && (
						<div className="text-[10px] text-muted-foreground leading-tight">incl. app + MS</div>
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

interface OfferingOption {
	id: string
	course_code: string
	course_title: string
	program_code: string
	semester: number
}

type ApplyTab = 'current' | 'arrear'
type ArrearMode = 'learner' | 'subject'

export default function ExamApplicationsPage() {
	const { toast } = useToast()

	const {
		institutionCode: contextInstitutionCode,
		institutionId: contextInstitutionId,
		isReady: institutionContextReady,
		mustSelectInstitution,
	} = useInstitutionFilter()

	const { availableInstitutions, selectedInstitution, selectInstitution } = useInstitution()

	const institutionsId = institutionContextReady && !mustSelectInstitution ? (contextInstitutionId ?? '') : (selectedInstitution?.id ?? '')
	const institutionCode = institutionContextReady && !mustSelectInstitution ? (contextInstitutionCode ?? '') : (selectedInstitution?.institution_code ?? '')

	// ── Shared scope ──
	const { selectedSessionId: sessionId, setSelectedSessionId: setSessionId, mustSelectSession } = useSessionSync()
	const [sessionCode, setSessionCode] = useState('')
	const { sessions, loading: loadingSessions } = useExamSessions({ institutionsId: institutionsId || null })

	const [tab, setTab] = useState<ApplyTab>('current')
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [submitting, setSubmitting] = useState(false)
	const [failures, setFailures] = useState<{ register_number: string; course_code: string; reason?: string }[]>([])

	// ── Current Papers state ──
	const [cpProgram, setCpProgram] = useState('all')
	const [cpSemester, setCpSemester] = useState('all')
	const [cpStatus, setCpStatus] = useState('pending')
	const [cpSearch, setCpSearch] = useState('')
	const [cpLearners, setCpLearners] = useState<CurrentPaperLearner[]>([])
	const [cpPapers, setCpPapers] = useState<CurrentPaperRow[]>([])
	const [cpFilters, setCpFilters] = useState<{ programs: string[]; semesters: number[] }>({ programs: [], semesters: [] })
	const [cpFee, setCpFee] = useState<BulkFeeContext | null>(null)
	const [cpSelected, setCpSelected] = useState<Set<string>>(new Set())
	const [loadingCp, setLoadingCp] = useState(false)

	// ── Arrear state ──
	const [arMode, setArMode] = useState<ArrearMode>('learner')
	const [arProgram, setArProgram] = useState('all')
	const [arSemester, setArSemester] = useState('all')
	const [arSearch, setArSearch] = useState('')
	const [arLearners, setArLearners] = useState<ArrearLearner[]>([])
	const [arFilters, setArFilters] = useState<{ programs: string[]; semesters: number[] }>({ programs: [], semesters: [] })
	const [loadingArLearners, setLoadingArLearners] = useState(false)
	const [arPicked, setArPicked] = useState<Set<string>>(new Set())
	const [arCourses, setArCourses] = useState<BulkLearnerCourses[]>([])
	const [loadingArCourses, setLoadingArCourses] = useState(false)
	const [arCourseSearch, setArCourseSearch] = useState('')
	const [arCourseStatus, setArCourseStatus] = useState('eligible')
	const [arSelectedRows, setArSelectedRows] = useState<Set<string>>(new Set())
	const [arFee, setArFee] = useState<BulkFeeContext | null>(null)

	// ── Arrear / subject-wise state ──
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

	const debouncedCpSearch = useDebounce(cpSearch, 200)
	const debouncedArSearch = useDebounce(arSearch, 200)
	const debouncedArCourseSearch = useDebounce(arCourseSearch, 200)
	const debouncedCandidateSearch = useDebounce(candidateSearch, 200)

	const scopeReady = Boolean(institutionsId && sessionId)

	// Keep session_code in sync with the globally selected session
	useEffect(() => {
		if (!sessionId) return
		const match = sessions.find(s => s.id === sessionId)
		if (match) setSessionCode(match.session_code || '')
	}, [sessionId, sessions])

	const resetAll = useCallback(() => {
		setCpLearners([])
		setCpPapers([])
		setCpFilters({ programs: [], semesters: [] })
		setCpSelected(new Set())
		setCpProgram('all')
		setCpSemester('all')
		setArLearners([])
		setArFilters({ programs: [], semesters: [] })
		setArPicked(new Set())
		setArCourses([])
		setArSelectedRows(new Set())
		setArProgram('all')
		setArSemester('all')
		setOfferings([])
		setOfferingId('')
		setSubjectOffering(null)
		setCandidates([])
		setSelectedCandidates(new Set())
		setFailures([])
	}, [])

	useEffect(() => {
		setSessionId('')
		setSessionCode('')
		resetAll()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [institutionsId])

	useEffect(() => {
		resetAll()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId])

	// =====================================================
	// Current Papers - load the cohort
	// =====================================================
	const loadCurrentPapers = useCallback(async () => {
		if (!institutionsId || !sessionId) {
			setCpLearners([])
			setCpPapers([])
			return
		}

		setLoadingCp(true)
		try {
			const params = new URLSearchParams({
				institutions_id: institutionsId,
				examination_session_id: sessionId,
			})
			if (cpProgram !== 'all') params.set('program_code', cpProgram)
			if (cpSemester !== 'all') params.set('semester', cpSemester)

			const res = await fetch(`/api/exam-management/exam-applications/current-papers?${params}`)
			const raw: CurrentPaperCohortResponse & { error?: string } = await parseJsonResponse(res)
			if (!res.ok) throw new Error(raw?.error || 'Failed to load the current-paper cohort')

			setCpLearners(raw.data || [])
			setCpPapers(raw.papers || [])
			setCpFilters(raw.filters || { programs: [], semesters: [] })
			setCpFee(raw.fee || null)
			setCpSelected(new Set())
		} catch (err) {
			console.error('[exam-applications] load current papers failed:', err)
			toast({
				title: '❌ Failed',
				description: err instanceof Error ? err.message : 'Failed to load the current-paper cohort',
				variant: 'destructive',
			})
			setCpLearners([])
			setCpPapers([])
		} finally {
			setLoadingCp(false)
		}
	}, [institutionsId, sessionId, cpProgram, cpSemester, toast])

	useEffect(() => {
		if (tab !== 'current') return
		loadCurrentPapers()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tab, institutionsId, sessionId, cpProgram, cpSemester])

	// A semester that no longer exists under the newly chosen programme would
	// filter the list down to nothing, so drop it back to "all".
	useEffect(() => {
		if (cpSemester === 'all') return
		if (cpFilters.semesters.length === 0) return
		if (!cpFilters.semesters.includes(Number(cpSemester))) setCpSemester('all')
	}, [cpFilters.semesters, cpSemester])

	// =====================================================
	// Arrear - load the learners holding backlogs
	// =====================================================
	const loadArrearLearners = useCallback(async () => {
		if (!institutionsId) {
			setArLearners([])
			return
		}

		setLoadingArLearners(true)
		try {
			const params = new URLSearchParams({ institutions_id: institutionsId })
			if (sessionId) params.set('examination_session_id', sessionId)
			if (arProgram !== 'all') params.set('program_code', arProgram)
			if (arSemester !== 'all') params.set('semester', arSemester)

			const res = await fetch(`/api/exam-management/exam-applications/arrear-learners?${params}`)
			const raw: ArrearLearnersResponse & { error?: string } = await parseJsonResponse(res)
			if (!res.ok) throw new Error(raw?.error || 'Failed to load learners with arrears')

			setArLearners(raw.data || [])
			setArFilters(raw.filters || { programs: [], semesters: [] })
		} catch (err) {
			console.error('[exam-applications] load arrear learners failed:', err)
			toast({
				title: '❌ Failed',
				description: err instanceof Error ? err.message : 'Failed to load learners with arrears',
				variant: 'destructive',
			})
			setArLearners([])
		} finally {
			setLoadingArLearners(false)
		}
	}, [institutionsId, sessionId, arProgram, arSemester, toast])

	useEffect(() => {
		if (tab !== 'arrear' || arMode !== 'learner') return
		loadArrearLearners()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tab, arMode, institutionsId, sessionId, arProgram, arSemester])

	useEffect(() => {
		if (arSemester === 'all') return
		if (arFilters.semesters.length === 0) return
		if (!arFilters.semesters.includes(Number(arSemester))) setArSemester('all')
	}, [arFilters.semesters, arSemester])

	// ── Arrear - load the papers for the picked learners ──
	const loadArrearCourses = useCallback(async () => {
		if (!institutionsId || !sessionId || arPicked.size === 0) return
		if (arPicked.size > MAX_LEARNERS_PER_BATCH) {
			toast({
				title: '⚠️ Too many learners',
				description: `Select at most ${MAX_LEARNERS_PER_BATCH} learners per batch (${arPicked.size} selected).`,
				variant: 'destructive',
			})
			return
		}

		setLoadingArCourses(true)
		setArCourses([])
		setArSelectedRows(new Set())

		try {
			const learners = arLearners
				.filter(l => arPicked.has(l.key))
				.map(l => ({
					student_id: l.student_id,
					register_number: l.register_number,
					student_name: l.student_name,
					program_code: l.program_code,
					semester: l.semester,
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
			if (!res.ok) throw new Error(raw?.error || 'Failed to load arrear papers')

			setArCourses(raw?.data || [])
			setArFee(raw?.fee || null)
		} catch (err) {
			console.error('[exam-applications] load arrear courses failed:', err)
			toast({
				title: '❌ Failed',
				description: err instanceof Error ? err.message : 'Failed to load arrear papers',
				variant: 'destructive',
			})
		} finally {
			setLoadingArCourses(false)
		}
	}, [institutionsId, sessionId, arPicked, arLearners, toast])

	// =====================================================
	// Arrear / subject-wise
	// =====================================================
	useEffect(() => {
		if (tab !== 'arrear' || arMode !== 'subject') return
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
				console.error('[exam-applications] load offerings failed:', err)
				setOfferings([])
			})
			.finally(() => setLoadingOfferings(false))
	}, [tab, arMode, institutionCode, sessionId])

	const loadCandidates = useCallback(async (selectedOfferingId: string) => {
		if (!institutionsId || !sessionId || !selectedOfferingId) return

		setLoadingCandidates(true)
		setCandidates([])
		setSelectedCandidates(new Set())
		setSubjectOffering(null)

		try {
			// An empty cohort keeps this arrear-only: the builder then returns just the
			// learners holding an uncleared backlog in this subject (plus anyone
			// already registered, marked ineligible), with no current-paper cohort
			// mixed in and no MyJKKN sweep needed.
			const res = await fetch('/api/exam-management/exam-applications/bulk/subject-candidates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: institutionsId,
					examination_session_id: sessionId,
					course_offering_id: selectedOfferingId,
					cohort: [],
				}),
			})
			const raw = await parseJsonResponse(res)
			if (!res.ok) throw new Error(raw?.error || 'Failed to load candidates')

			setSubjectOffering(raw?.offering || null)
			setCandidates(raw?.data || [])
			setArFee(raw?.fee || null)
		} catch (err) {
			console.error('[exam-applications] load candidates failed:', err)
			toast({
				title: '❌ Failed',
				description: err instanceof Error ? err.message : 'Failed to load learners for this subject',
				variant: 'destructive',
			})
		} finally {
			setLoadingCandidates(false)
		}
	}, [institutionsId, sessionId, toast])

	// =====================================================
	// Derived - Current Papers
	// =====================================================
	const cpProgramOptions = useMemo(
		() => [{ value: 'all', label: 'All programs' }, ...cpFilters.programs.map(p => ({ value: p, label: p }))],
		[cpFilters.programs]
	)

	const filteredCpLearners = useMemo(() => {
		const q = debouncedCpSearch.trim().toLowerCase()
		return cpLearners.filter(l => {
			if (q && !l.register_number.toLowerCase().includes(q) && !l.student_name.toLowerCase().includes(q)) return false
			if (cpStatus === 'pending' && l.pending_subjects === 0) return false
			if (cpStatus === 'applied' && l.status !== 'Applied') return false
			if (cpStatus === 'partial' && l.status !== 'Partial') return false
			if (cpStatus === 'not_applied' && l.status !== 'Not Applied') return false
			return true
		})
	}, [cpLearners, debouncedCpSearch, cpStatus])

	const selectableCpLearners = useMemo(
		() => filteredCpLearners.filter(l => l.pending_subjects > 0),
		[filteredCpLearners]
	)
	const allCpChecked = selectableCpLearners.length > 0 && selectableCpLearners.every(l => cpSelected.has(l.key))

	const toggleCpLearner = useCallback((key: string) => {
		setCpSelected(prev => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}, [])

	const toggleAllCp = () => {
		setCpSelected(prev => {
			const next = new Set(prev)
			if (allCpChecked) selectableCpLearners.forEach(l => next.delete(l.key))
			else selectableCpLearners.forEach(l => next.add(l.key))
			return next
		})
	}

	const cpSelection = useMemo(() => {
		const picked = cpLearners.filter(l => cpSelected.has(l.key))
		return {
			learners: picked.length,
			papers: picked.reduce((sum, l) => sum + l.pending_subjects, 0),
			paperFee: picked.reduce((sum, l) => sum + l.paper_fee_total, 0),
			applicationFee: picked.reduce((sum, l) => sum + l.application_fee, 0),
			markStatementFee: picked.reduce((sum, l) => sum + l.mark_statement_fee, 0),
			fine: picked.reduce((sum, l) => sum + l.late_fine, 0),
			total: picked.reduce((sum, l) => sum + l.fee_total, 0),
		}
	}, [cpLearners, cpSelected])

	// =====================================================
	// Derived - Arrear
	// =====================================================
	const arProgramOptions = useMemo(
		() => [{ value: 'all', label: 'All programs' }, ...arFilters.programs.map(p => ({ value: p, label: p }))],
		[arFilters.programs]
	)

	const filteredArLearners = useMemo(() => {
		const q = debouncedArSearch.trim().toLowerCase()
		if (!q) return arLearners
		return arLearners.filter(l =>
			l.register_number.toLowerCase().includes(q) || l.student_name.toLowerCase().includes(q)
		)
	}, [arLearners, debouncedArSearch])

	const allArChecked = filteredArLearners.length > 0 && filteredArLearners.every(l => arPicked.has(l.key))

	const toggleArLearner = useCallback((key: string) => {
		setArPicked(prev => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}, [])

	const toggleAllAr = () => {
		setArPicked(prev => {
			const next = new Set(prev)
			if (allArChecked) filteredArLearners.forEach(l => next.delete(l.key))
			else filteredArLearners.forEach(l => next.add(l.key))
			return next
		})
	}

	// Only backlog papers reach this tab - a learner's current papers are handled
	// by the Current Papers tab, which updates rows rather than creating them.
	const arCourseRows = useMemo(() => {
		const rows: ArrearCourseRow[] = []
		for (const learner of arCourses) {
			for (const course of learner.courses) {
				if (!course.is_backlog) continue
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
	}, [arCourses])

	const filteredArRows = useMemo(() => {
		const q = debouncedArCourseSearch.trim().toLowerCase()
		return arCourseRows.filter(r => {
			if (q &&
				!r.register_number.toLowerCase().includes(q) &&
				!r.student_name.toLowerCase().includes(q) &&
				!r.course.course_code.toLowerCase().includes(q) &&
				!r.course.course_name.toLowerCase().includes(q)) return false
			if (arCourseStatus === 'eligible' && !r.course.is_eligible) return false
			if (arCourseStatus === 'not_eligible' && r.course.is_eligible) return false
			return true
		})
	}, [arCourseRows, debouncedArCourseSearch, arCourseStatus])

	const selectableArRows = useMemo(() => filteredArRows.filter(r => r.course.is_eligible), [filteredArRows])
	const allArRowsChecked = selectableArRows.length > 0 && selectableArRows.every(r => arSelectedRows.has(r.rowKey))

	const toggleArRow = useCallback((key: string) => {
		setArSelectedRows(prev => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}, [])

	const toggleAllArRows = () => {
		setArSelectedRows(prev => {
			const next = new Set(prev)
			if (allArRowsChecked) selectableArRows.forEach(r => next.delete(r.rowKey))
			else selectableArRows.forEach(r => next.add(r.rowKey))
			return next
		})
	}

	// ── Subject-wise derived ──
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
			if (candidateStatus === 'eligible' && !c.is_eligible) return false
			if (candidateStatus === 'not_eligible' && c.is_eligible) return false
			return true
		})
	}, [candidates, debouncedCandidateSearch, candidateStatus])

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

	const arSelection = useMemo(() => {
		if (arMode === 'subject') {
			const picked = candidates.filter(c => selectedCandidates.has(c.key))
			return {
				rows: picked.length,
				learners: picked.length,
				fee: picked.reduce((sum, c) => sum + (c.fee_total || 0), 0),
			}
		}

		const picked = arCourseRows.filter(r => arSelectedRows.has(r.rowKey))
		const learnerKeys = new Set(picked.map(r => r.learnerKey))

		// Papers are billed per row; the application / mark statement / fine are
		// billed once per learner, so they are added per distinct learner touched.
		let fee = picked.reduce((sum, r) => sum + (r.course.fee_amount || 0), 0)
		for (const key of learnerKeys) {
			const learner = arCourses.find(l => l.key === key)
			if (learner?.fee) fee += learner.fee.learner_total + learner.fee.fine
		}

		return { rows: picked.length, learners: learnerKeys.size, fee }
	}, [arMode, candidates, selectedCandidates, arCourseRows, arSelectedRows, arCourses])

	// =====================================================
	// Submit
	// =====================================================
	const pendingCount = tab === 'current' ? cpSelection.papers : arSelection.rows
	const feeContext = tab === 'current' ? cpFee : arFee
	const showFee = Boolean(feeContext?.configured)

	const handleSubmitClick = () => {
		if (!scopeReady) {
			toast({ title: '⚠️ Missing scope', description: 'Select an institution and exam session first.', variant: 'destructive' })
			return
		}
		if (pendingCount === 0) {
			toast({ title: '⚠️ Nothing selected', description: 'Select at least one row to apply.', variant: 'destructive' })
			return
		}
		setConfirmOpen(true)
	}

	const submitCurrentPapers = async () => {
		const learners = cpLearners
			.filter(l => cpSelected.has(l.key))
			.map(l => ({ student_id: l.student_id, register_number: l.register_number }))

		const res = await fetch('/api/exam-management/exam-applications/current-papers', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				institutions_id: institutionsId,
				examination_session_id: sessionId,
				program_code: cpProgram === 'all' ? '' : cpProgram,
				semester: cpSemester === 'all' ? null : Number(cpSemester),
				learners,
			}),
		})
		const raw = await parseJsonResponse(res)
		if (!res.ok && !raw?.summary) throw new Error(raw?.error || 'Failed to apply the selected learners')

		setFailures((raw?.results || []).filter((r: any) => r.status === 'failed'))
		return { failed: raw?.summary?.failed || 0, message: raw?.message || 'No changes' }
	}

	const submitArrear = async () => {
		const items = arMode === 'subject'
			? (subjectOffering
				? candidates
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
				: [])
			: arCourseRows
				.filter(r => arSelectedRows.has(r.rowKey))
				.map(r => ({
					student_id: r.student_id,
					register_number: r.register_number,
					student_name: r.student_name,
					program_code: r.program_code,
					semester: r.semester,
					course_code: r.course.course_code,
					course_offering_id: r.course.course_offering_id,
				}))

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
		if (!res.ok && !raw?.summary) throw new Error(raw?.error || 'Failed to submit the arrear applications')

		setFailures((raw?.results || []).filter((r: any) => r.status === 'failed'))
		return { failed: raw?.summary?.failed || 0, message: raw?.message || 'No changes' }
	}

	const handleConfirmSubmit = async () => {
		setConfirmOpen(false)
		setSubmitting(true)
		setFailures([])

		try {
			const outcome = tab === 'current' ? await submitCurrentPapers() : await submitArrear()

			if (outcome.failed === 0) {
				toast({
					title: '✅ Applications Submitted',
					description: outcome.message,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
			} else {
				toast({ title: '⚠️ Partially Submitted', description: outcome.message, variant: 'destructive' })
			}

			// Reload so the just-applied rows show their new status
			if (tab === 'current') {
				await loadCurrentPapers()
			} else if (arMode === 'subject') {
				setSelectedCandidates(new Set())
				if (offeringId) await loadCandidates(offeringId)
			} else {
				setArSelectedRows(new Set())
				await loadArrearCourses()
				await loadArrearLearners()
			}
		} catch (err) {
			console.error('[exam-applications] submit failed:', err)
			toast({
				title: '❌ Submit Failed',
				description: err instanceof Error ? err.message : 'Failed to submit',
				variant: 'destructive',
			})
		} finally {
			setSubmitting(false)
		}
	}

	// =====================================================
	// Stats
	// =====================================================
	const stats = useMemo(() => {
		if (tab === 'current') {
			return [
				{ value: cpLearners.length, label: 'Learners', accent: 'border-l-violet-500', icon: Users, tone: '' },
				{ value: cpLearners.reduce((s, l) => s + l.total_subjects, 0), label: 'Registered Papers', accent: 'border-l-emerald-500', icon: BookOpen, tone: 'text-emerald-600 dark:text-emerald-400' },
				{ value: cpLearners.filter(l => l.status === 'Applied').length, label: 'Fully Applied', accent: 'border-l-green-500', icon: ClipboardCheck, tone: 'text-green-600 dark:text-green-400' },
				{ value: `${cpSelection.learners} / ${selectableCpLearners.length}`, label: 'Selected / Applicable', accent: 'border-l-amber-500', icon: ClipboardCheck, tone: 'text-amber-600 dark:text-amber-400' },
			]
		}
		return [
			{ value: arMode === 'subject' ? candidates.length : arLearners.length, label: arMode === 'subject' ? 'Candidates' : 'Learners with Arrears', accent: 'border-l-violet-500', icon: Users, tone: '' },
			{ value: arMode === 'subject' ? candidates.filter(c => c.is_backlog).length : arLearners.reduce((s, l) => s + l.arrear_count, 0), label: 'Arrear Papers', accent: 'border-l-rose-500', icon: RotateCcw, tone: 'text-rose-600 dark:text-rose-400' },
			{ value: arMode === 'subject' ? candidates.filter(c => c.is_eligible).length : selectableArRows.length, label: 'Eligible', accent: 'border-l-emerald-500', icon: BookOpen, tone: 'text-emerald-600 dark:text-emerald-400' },
			{ value: arSelection.rows, label: 'Selected', accent: 'border-l-amber-500', icon: ClipboardCheck, tone: 'text-amber-600 dark:text-amber-400' },
		]
	}, [tab, cpLearners, cpSelection.learners, selectableCpLearners.length, arMode, candidates, arLearners, selectableArRows.length, arSelection.rows])

	const showInstitutionField = mustSelectInstitution

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
								<BreadcrumbItem><BreadcrumbLink asChild><Link href="/exam-management/exam-registrations">Exam Registrations</Link></BreadcrumbLink></BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem><BreadcrumbPage>Exam Applications</BreadcrumbPage></BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						{/* Stats */}
						<div className={cn('grid grid-cols-2 gap-3', showFee ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
							{stats.map(s => (
								<StatCard key={s.label} value={s.value} label={s.label} accent={s.accent} icon={s.icon} tone={s.tone} />
							))}
							{showFee && (
								<StatCard
									value={money(tab === 'current' ? cpSelection.total : arSelection.fee)}
									label="Fee for selection"
									accent="border-l-sky-500"
									icon={IndianRupee}
									tone="text-sky-600 dark:text-sky-400"
								/>
							)}
						</div>

						{/* Scope */}
						<Card>
							<CardHeader className="px-4 py-3 border-b">
								<div className="flex items-center justify-between gap-3 flex-wrap">
									<div>
										<h2 className="text-base font-semibold">Exam Applications</h2>
										<p className="text-xs text-muted-foreground">
											{tab === 'current'
												? 'Confirm the learners whose already-registered papers are being applied for'
												: 'Register arrear papers for learners carrying uncleared backlogs'}
										</p>
									</div>
									<Link href="/fee-details">
										<Button variant="outline" size="sm" className="h-8 text-sm px-3 gap-1.5">
											<IndianRupee className="h-3.5 w-3.5" />Fee Details
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
										<Label className="text-xs font-medium">Program</Label>
										<SearchableSelect
											value={tab === 'current' ? cpProgram : arProgram}
											onValueChange={val => (tab === 'current' ? setCpProgram(val) : setArProgram(val))}
											placeholder="All programs"
											searchPlaceholder="Search program..."
											options={tab === 'current' ? cpProgramOptions : arProgramOptions}
											disabled={!scopeReady}
											loading={tab === 'current' ? loadingCp : loadingArLearners}
										/>
									</div>

									<div className="space-y-1.5">
										<Label className="text-xs font-medium">
											Semester {tab === 'arrear' && <span className="text-muted-foreground font-normal">(optional)</span>}
										</Label>
										<Select
											value={tab === 'current' ? cpSemester : arSemester}
											onValueChange={val => (tab === 'current' ? setCpSemester(val) : setArSemester(val))}
											disabled={!scopeReady}
										>
											<SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All semesters" /></SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All semesters</SelectItem>
												{(tab === 'current' ? cpFilters.semesters : arFilters.semesters).map(s => (
													<SelectItem key={s} value={String(s)}>Semester {romanSemester(s)}</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>

								{/* Fee banner - only for the two states that need action */}
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
												No exam fee rates are configured for this institution — applications will still save, but no fee is stamped.{' '}
												<Link href="/fee-details" className="underline font-medium">Configure fees</Link>
											</p>
										) : (
											<p className="font-medium">
												Late fine of {money(feeContext.fine_amount)} applies — the no-fine date
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

						{/* Tabs */}
						<Tabs value={tab} onValueChange={v => setTab(v as ApplyTab)} className="w-full">
							<TabsList className="grid w-full max-w-md grid-cols-2">
								<TabsTrigger value="current">Current Papers</TabsTrigger>
								<TabsTrigger value="arrear">Arrear Papers</TabsTrigger>
							</TabsList>

							{/* ── Current Papers ── */}
							<TabsContent value="current" className="mt-3">
								<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-3">

									<Card className="flex flex-col min-h-[520px]">
										<CardHeader className="px-4 py-3 border-b space-y-3">
											<div className="flex items-center justify-between gap-2 flex-wrap">
												<div>
													<h3 className="text-sm font-semibold">Learners</h3>
													<p className="text-xs text-muted-foreground">
														Selecting a learner applies for every paper they are already registered for
													</p>
												</div>
												<Button
													variant="outline"
													size="sm"
													className="h-8 text-xs px-2"
													onClick={loadCurrentPapers}
													disabled={loadingCp || !scopeReady}
												>
													<RefreshCw className={cn('h-3.5 w-3.5', loadingCp && 'animate-spin')} />
												</Button>
											</div>

											<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
												<Select value={cpStatus} onValueChange={setCpStatus}>
													<SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
													<SelectContent>
														<SelectItem value="pending">Yet to apply</SelectItem>
														<SelectItem value="not_applied">Not applied</SelectItem>
														<SelectItem value="partial">Partially applied</SelectItem>
														<SelectItem value="applied">Fully applied</SelectItem>
														<SelectItem value="all">All learners</SelectItem>
													</SelectContent>
												</Select>
												<div className="relative">
													<Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
													<Input
														value={cpSearch}
														onChange={e => setCpSearch(e.target.value)}
														placeholder="Register no or name"
														className="pl-8 h-9 text-sm"
													/>
												</div>
											</div>
										</CardHeader>

										<CardContent className="p-0 flex-1 flex flex-col min-h-0">
											{loadingCp ? (
												<div className="flex items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
													<Loader2 className="h-4 w-4 animate-spin mr-2" />Loading the registered cohort...
												</div>
											) : !scopeReady ? (
												<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
													<Users className="h-8 w-8 mb-2 opacity-40" />
													<p>Select an exam session to list the registered learners</p>
												</div>
											) : filteredCpLearners.length === 0 ? (
												<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
													<Users className="h-8 w-8 mb-2 opacity-40" />
													<p>{cpLearners.length === 0 ? 'No exam registrations in this session for the selected scope' : 'No learners match the current filters'}</p>
													{cpLearners.length === 0 && (
														<Link href="/exam-management/exam-registrations/bulk-create" className="text-xs mt-2 underline">
															Register learners for this session first
														</Link>
													)}
												</div>
											) : (
												<>
													<div className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/40 text-xs font-medium">
														<label className="flex items-center gap-2 cursor-pointer flex-1">
															<Checkbox checked={allCpChecked} onCheckedChange={toggleAllCp} disabled={selectableCpLearners.length === 0} />
															<span>
																Select all applicable ({selectableCpLearners.length}) · showing {filteredCpLearners.length} of {cpLearners.length}
															</span>
														</label>
														{showFee && <span className="w-24 text-right text-muted-foreground">Fee</span>}
														<span className="w-[92px] text-center text-muted-foreground">Status</span>
													</div>
													<div className="flex-1 min-h-0" style={{ minHeight: 340 }}>
														<AutoSizer>
															{({ height, width }) => (
																<VirtualList height={height} width={width} itemCount={filteredCpLearners.length} itemSize={ROW_HEIGHT}>
																	{({ index, style }) => {
																		const l = filteredCpLearners[index]
																		return (
																			<CurrentLearnerRow
																				style={style}
																				learner={l}
																				checked={cpSelected.has(l.key)}
																				onToggle={toggleCpLearner}
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

									{/* Papers in the cohort + fee breakdown */}
									<div className="flex flex-col gap-3">
										<Card className="flex flex-col min-h-[300px]">
											<CardHeader className="px-4 py-3 border-b">
												<h3 className="text-sm font-semibold">Papers in this cohort</h3>
												<p className="text-xs text-muted-foreground">
													{cpPapers.length} distinct paper{cpPapers.length === 1 ? '' : 's'} across the filtered learners
												</p>
											</CardHeader>
											<CardContent className="p-0 flex-1 flex flex-col min-h-0">
												{cpPapers.length === 0 ? (
													<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
														<BookOpen className="h-8 w-8 mb-2 opacity-40" />
														<p>No papers to show yet</p>
													</div>
												) : (
													<div className="flex-1 min-h-0" style={{ minHeight: 240 }}>
														<AutoSizer>
															{({ height, width }) => (
																<VirtualList height={height} width={width} itemCount={cpPapers.length} itemSize={ROW_HEIGHT}>
																	{({ index, style }) => (
																		<CohortPaperRow style={style} paper={cpPapers[index]} showFee={showFee} />
																	)}
																</VirtualList>
															)}
														</AutoSizer>
													</div>
												)}
											</CardContent>
										</Card>

										{showFee && (
											<Card>
												<CardHeader className="px-4 py-3 border-b">
													<h3 className="text-sm font-semibold">Fee for selection</h3>
													<p className="text-xs text-muted-foreground">
														{cpSelection.learners} learner{cpSelection.learners === 1 ? '' : 's'} · {cpSelection.papers} paper{cpSelection.papers === 1 ? '' : 's'}
													</p>
												</CardHeader>
												<CardContent className="p-4 space-y-1.5 text-sm">
													<div className="flex justify-between"><span className="text-muted-foreground">Exam papers</span><span className="tabular-nums">{money(cpSelection.paperFee)}</span></div>
													<div className="flex justify-between"><span className="text-muted-foreground">Application fee</span><span className="tabular-nums">{money(cpSelection.applicationFee)}</span></div>
													<div className="flex justify-between"><span className="text-muted-foreground">Mark statement fee</span><span className="tabular-nums">{money(cpSelection.markStatementFee)}</span></div>
													{cpSelection.fine > 0 && (
														<div className="flex justify-between text-rose-600 dark:text-rose-400"><span>Late fine</span><span className="tabular-nums">{money(cpSelection.fine)}</span></div>
													)}
													<div className="flex justify-between pt-2 mt-1 border-t font-semibold">
														<span>Total</span><span className="tabular-nums text-sky-600 dark:text-sky-400">{money(cpSelection.total)}</span>
													</div>
													<p className="text-[10px] text-muted-foreground pt-1 leading-relaxed">
														Application and mark statement fees are charged once per learner per session — learners already
														charged in this session contribute paper fees only.
													</p>
												</CardContent>
											</Card>
										)}
									</div>
								</div>
							</TabsContent>

							{/* ── Arrear Papers ── */}
							<TabsContent value="arrear" className="mt-3 space-y-3">
								<Card>
									<CardContent className="p-3">
										<div className="grid grid-cols-1 md:grid-cols-[minmax(0,320px)_1fr] gap-3 items-end">
											<div className="space-y-1.5">
												<Label className="text-xs font-medium">Register By</Label>
												<Segmented
													value={arMode}
													onChange={(v: ArrearMode) => setArMode(v)}
													options={[
														{ value: 'learner' as ArrearMode, label: 'Learner wise' },
														{ value: 'subject' as ArrearMode, label: 'Subject wise' },
													]}
												/>
											</div>
											<p className="text-xs text-muted-foreground pb-2">
												{arMode === 'learner'
													? 'Pick learners on the left, then tick the arrear papers they should be registered for. Each row becomes a new arrear registration.'
													: 'Pick one subject code, then tick the learners holding an uncleared arrear in it.'}
											</p>
										</div>
									</CardContent>
								</Card>

								{arMode === 'learner' ? (
									<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)] gap-3">

										{/* Learners with arrears */}
										<Card className="flex flex-col min-h-[520px]">
											<CardHeader className="px-4 py-3 border-b space-y-3">
												<div className="flex items-center justify-between gap-2">
													<div>
														<h3 className="text-sm font-semibold">Learners with arrears</h3>
														<p className="text-xs text-muted-foreground">
															{loadingArLearners ? 'Loading...' : `${filteredArLearners.length} of ${arLearners.length} • ${arPicked.size} selected`}
														</p>
													</div>
													<Button
														variant="outline"
														size="sm"
														className="h-8 text-xs px-2"
														onClick={loadArrearLearners}
														disabled={loadingArLearners || !institutionsId}
													>
														<RefreshCw className={cn('h-3.5 w-3.5', loadingArLearners && 'animate-spin')} />
													</Button>
												</div>

												<div className="relative">
													<Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
													<Input
														value={arSearch}
														onChange={e => setArSearch(e.target.value)}
														placeholder="Search register no or name..."
														className="pl-8 h-9 text-sm"
													/>
												</div>
											</CardHeader>

											<CardContent className="p-0 flex-1 flex flex-col min-h-0">
												{loadingArLearners ? (
													<div className="flex items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
														<Loader2 className="h-4 w-4 animate-spin mr-2" />Loading learners...
													</div>
												) : filteredArLearners.length === 0 ? (
													<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
														<RotateCcw className="h-8 w-8 mb-2 opacity-40" />
														<p>{arLearners.length === 0 ? 'No uncleared arrears for the selected scope' : 'No learners match the search'}</p>
													</div>
												) : (
													<>
														<label className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/40 cursor-pointer text-xs font-medium">
															<Checkbox checked={allArChecked} onCheckedChange={toggleAllAr} />
															<span>Select all ({filteredArLearners.length})</span>
														</label>
														<div className="flex-1 min-h-0" style={{ minHeight: 280 }}>
															<AutoSizer>
																{({ height, width }) => (
																	<VirtualList height={height} width={width} itemCount={filteredArLearners.length} itemSize={ROW_HEIGHT}>
																		{({ index, style }) => {
																			const l = filteredArLearners[index]
																			return (
																				<ArrearLearnerRow
																					style={style}
																					learner={l}
																					checked={arPicked.has(l.key)}
																					onToggle={toggleArLearner}
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
																onClick={loadArrearCourses}
																disabled={arPicked.size === 0 || loadingArCourses || !sessionId}
															>
																{loadingArCourses
																	? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading papers...</>
																	: <><BookOpen className="h-3.5 w-3.5" />Load arrear papers for {arPicked.size} learner{arPicked.size === 1 ? '' : 's'}</>}
															</Button>
														</div>
													</>
												)}
											</CardContent>
										</Card>

										{/* Arrear papers */}
										<Card className="flex flex-col min-h-[520px]">
											<CardHeader className="px-4 py-3 border-b space-y-3">
												<div className="flex items-center justify-between gap-2 flex-wrap">
													<div>
														<h3 className="text-sm font-semibold">Arrear papers to register</h3>
														<p className="text-xs text-muted-foreground">
															Each learner gets only their own arrears — nothing is applied across learners
														</p>
													</div>
													<Button
														variant="ghost"
														size="sm"
														className="h-8 text-xs px-2"
														onClick={() => setArSelectedRows(new Set())}
														disabled={arSelectedRows.size === 0}
													>
														Clear selection
													</Button>
												</div>

												<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
													<Select value={arCourseStatus} onValueChange={setArCourseStatus}>
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
															value={arCourseSearch}
															onChange={e => setArCourseSearch(e.target.value)}
															placeholder="Search learner or paper"
															className="pl-8 h-9 text-sm"
														/>
													</div>
												</div>
											</CardHeader>

											<CardContent className="p-0 flex-1 flex flex-col min-h-0">
												{loadingArCourses ? (
													<div className="flex items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
														<Loader2 className="h-4 w-4 animate-spin mr-2" />Building the arrear lists...
													</div>
												) : arCourseRows.length === 0 ? (
													<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
														<ClipboardCheck className="h-8 w-8 mb-2 opacity-40" />
														<p>Pick learners on the left, then load their arrear papers</p>
													</div>
												) : filteredArRows.length === 0 ? (
													<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
														<ClipboardCheck className="h-8 w-8 mb-2 opacity-40" />
														<p>No arrear papers match the current filters</p>
													</div>
												) : (
													<>
														<div className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/40 text-xs font-medium">
															<label className="flex items-center gap-2 cursor-pointer flex-1">
																<Checkbox checked={allArRowsChecked} onCheckedChange={toggleAllArRows} disabled={selectableArRows.length === 0} />
																<span>
																	Select all eligible ({selectableArRows.length}) · showing {filteredArRows.length} of {arCourseRows.length}
																</span>
															</label>
															{showFee && <span className="w-16 text-right text-muted-foreground">Fee</span>}
															<span className="w-[112px] text-center text-muted-foreground">Status</span>
														</div>
														<div className="flex-1 min-h-0" style={{ minHeight: 340 }}>
															<AutoSizer>
																{({ height, width }) => (
																	<VirtualList height={height} width={width} itemCount={filteredArRows.length} itemSize={ROW_HEIGHT}>
																		{({ index, style }) => {
																			const r = filteredArRows[index]
																			return (
																				<ArrearPaperRow
																					style={style}
																					row={r}
																					checked={arSelectedRows.has(r.rowKey)}
																					onToggle={toggleArRow}
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
								) : (
									/* Subject-wise */
									<Card className="flex flex-col min-h-[520px]">
										<CardHeader className="px-4 py-3 border-b space-y-3">
											<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
												<div className="space-y-1.5">
													<Label className="text-xs font-medium">Program</Label>
													<SearchableSelect
														value={offeringProgram}
														onValueChange={val => {
															setOfferingProgram(val)
															setOfferingId('')
															setSubjectOffering(null)
															setCandidates([])
															setSelectedCandidates(new Set())
														}}
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
											{loadingCandidates ? (
												<div className="flex items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
													<Loader2 className="h-4 w-4 animate-spin mr-2" />Building the candidate list...
												</div>
											) : !offeringId ? (
												<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
													<BookOpen className="h-8 w-8 mb-2 opacity-40" />
													<p>Select a subject code to list the learners holding an arrear in it</p>
												</div>
											) : filteredCandidates.length === 0 ? (
												<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
													<Users className="h-8 w-8 mb-2 opacity-40" />
													<p>{candidates.length === 0 ? 'Nobody holds an uncleared arrear in this subject' : 'No learners match the current filters'}</p>
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
							</TabsContent>
						</Tabs>

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

				{/* Sticky submit bar */}
				<div className="sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
					<div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
						<div className="flex items-center gap-2 flex-wrap text-sm">
							{pendingCount === 0 ? (
								<span className="text-muted-foreground">Nothing selected yet</span>
							) : tab === 'current' ? (
								<>
									<span className="font-medium">{cpSelection.learners} learner{cpSelection.learners === 1 ? '' : 's'}</span>
									<span className="text-muted-foreground">×</span>
									<Badge variant="outline" className={cn('text-[10px]', CURRENT_BADGE)}>{cpSelection.papers} registered papers</Badge>
									{showFee && (
										<>
											<span className="text-muted-foreground">·</span>
											<span className="font-semibold text-sky-600 dark:text-sky-400">{money(cpSelection.total)}</span>
										</>
									)}
								</>
							) : (
								<>
									<span className="font-medium">{arSelection.rows} arrear registration{arSelection.rows === 1 ? '' : 's'}</span>
									<span className="text-muted-foreground">·</span>
									<span className="text-muted-foreground">{arSelection.learners} learner{arSelection.learners === 1 ? '' : 's'}</span>
									{showFee && (
										<>
											<span className="text-muted-foreground">·</span>
											<span className="font-semibold text-sky-600 dark:text-sky-400">{money(arSelection.fee)}</span>
										</>
									)}
								</>
							)}
						</div>
						<Button onClick={handleSubmitClick} disabled={submitting || pendingCount === 0} className="h-9 text-sm gap-1.5">
							{submitting
								? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Submitting...</>
								: <><Send className="h-3.5 w-3.5" />{tab === 'current' ? 'Confirm Applications' : 'Register Arrears'} {pendingCount > 0 ? `(${pendingCount})` : ''}</>}
						</Button>
					</div>
				</div>

				<AppFooter />
			</SidebarInset>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{tab === 'current' ? 'Confirm exam applications?' : 'Register arrear papers?'}
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-2">
								{tab === 'current' ? (
									<>
										<p>
											{cpSelection.papers} already-registered paper{cpSelection.papers === 1 ? '' : 's'} across {cpSelection.learners} learner
											{cpSelection.learners === 1 ? '' : 's'} will move to <span className="font-semibold">Applied</span>.
										</p>
										<p>No new registrations are created — only the rows these learners already hold are updated.</p>
									</>
								) : (
									<p>
										{arSelection.rows} new arrear registration{arSelection.rows === 1 ? '' : 's'} across {arSelection.learners} learner
										{arSelection.learners === 1 ? '' : 's'} will be created as <span className="font-semibold">Applied</span> arrear attempts.
									</p>
								)}
								{showFee && (
									<p>
										Fee for this selection: <span className="font-semibold">{money(tab === 'current' ? cpSelection.total : arSelection.fee)}</span>
										{feeContext?.fine_applicable ? ` (includes ${money(feeContext.fine_amount)} late fine per learner)` : ''}
									</p>
								)}
								<p>Anything already applied for is skipped.</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleConfirmSubmit}>
							{tab === 'current' ? 'Confirm' : 'Register'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
