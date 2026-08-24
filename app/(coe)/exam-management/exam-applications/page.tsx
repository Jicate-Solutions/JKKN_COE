'use client'

import { useState, useEffect, useCallback, useMemo, useRef, memo, type CSSProperties } from 'react'
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
	CohortFilterOption,
	CohortFilterTotals,
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
/**
 * The working lists size to the viewport rather than a fixed 520px, so the page
 * uses the whole screen on a large monitor and still fits a laptop. The subtracted
 * space is the header, breadcrumb, scorecards, the two step cards and the sticky
 * submit bar.
 */
const PANEL_HEIGHT = 'h-[calc(100vh-30rem)] min-h-[26rem]'
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
	'Already Applied': 'bg-slate-100 text-slate-600 border-slate-200',
	'Already Registered': 'bg-amber-100 text-amber-700 border-amber-200',
	'Already Passed': 'bg-slate-100 text-slate-600 border-slate-200',
	'Not Offered': 'bg-red-100 text-red-700 border-red-200',
	'Inactive Offering': 'bg-red-100 text-red-700 border-red-200',
	'Attempts Exhausted': 'bg-red-100 text-red-700 border-red-200',
	'Seats Full': 'bg-orange-100 text-orange-700 border-orange-200',
}

interface CohortFilters {
	programs: CohortFilterOption[]
	semesters: CohortFilterOption[]
	totals: { programs: CohortFilterTotals; semesters: CohortFilterTotals }
}

const EMPTY_FILTER_TOTALS: CohortFilters['totals'] = { programs: { learners: 0, rows: 0 }, semesters: { learners: 0, rows: 0 } }

const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const money = (value: number | null | undefined) =>
	value == null ? '—' : `₹${rupees.format(Math.round(value))}`

/**
 * Filter option label. The learner count leads because this cascade exists to
 * fetch the learners; the row count trails as scale.
 */
const countLabel = (counts: { learners: number; rows: number }, rowNoun: string) =>
	`${counts.learners} learner${counts.learners === 1 ? '' : 's'}, ${counts.rows} ${rowNoun}`

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

/**
 * Each stage of the flow owns a colour, carried by its step badge and the card's
 * left border, so the four stages are told apart at a glance rather than by
 * reading the headings.
 */
type StepTone = 'violet' | 'sky' | 'amber' | 'emerald'

const STEP_TONES: Record<StepTone, { active: string; done: string; card: string }> = {
	violet: {
		active: 'bg-violet-600 text-white border-transparent',
		done: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800',
		card: 'border-l-4 border-l-violet-500',
	},
	sky: {
		active: 'bg-sky-600 text-white border-transparent',
		done: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800',
		card: 'border-l-4 border-l-sky-500',
	},
	amber: {
		active: 'bg-amber-500 text-white border-transparent',
		done: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
		card: 'border-l-4 border-l-amber-500',
	},
	emerald: {
		active: 'bg-emerald-600 text-white border-transparent',
		done: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
		card: 'border-l-4 border-l-emerald-500',
	},
}

/**
 * Numbered step marker.
 *
 * The page is a fixed four-step flow (choose -> filter -> pick learners ->
 * review papers) and nothing on screen said so, so each stage carries its number
 * and dims until the step before it is satisfied.
 */
function Step({ n, title, hint, done, active, tone }: {
	n: number
	title: string
	hint?: string
	done?: boolean
	active?: boolean
	tone: StepTone
}) {
	const styles = STEP_TONES[tone]
	return (
		<div className={cn('flex items-start gap-2.5 min-w-0', !active && !done && 'opacity-55')}>
			<span className={cn(
				'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold border shadow-sm',
				done ? styles.done : active ? styles.active : 'bg-muted text-muted-foreground'
			)}>
				{done ? <Check className="h-4 w-4" /> : n}
			</span>
			<div className="min-w-0">
				<h3 className="text-sm font-semibold leading-7">{title}</h3>
				{hint && <p className="text-xs text-muted-foreground leading-snug">{hint}</p>}
			</div>
		</div>
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
/** One head of the fee breakdown - label above amount so two fit per row */
function FeeLine({ label, value, tone }: { label: string; value: string; tone?: string }) {
	return (
		<div className="min-w-0">
			<div className="text-[11px] text-muted-foreground truncate" title={label}>{label}</div>
			<div className={cn('text-sm tabular-nums', tone)}>{value}</div>
		</div>
	)
}

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
				<div className="text-sm truncate" title={paper.course_name || undefined}>{paper.course_name || '—'}</div>
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
	// Registered is not the same as applied - a registered-but-unapplied arrear is
	// still work, so the badge counts against applied_count.
	const pending = learner.arrear_count - learner.applied_count
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
					<Badge
						variant="outline"
						className={cn('text-[10px] px-1.5 py-0 h-4', pending > 0 ? ARREAR_BADGE : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800')}
					>
						{pending > 0 ? `${pending} to apply` : 'all applied'}
					</Badge>
					{/* The learner's own semester leads, since that is what the Semester
					    filter matches. It is unknown for anyone with no regular paper this
					    session (arrear-only candidates), and an empty "Sem —" badge was
					    pure noise - so it is simply omitted. */}
					{learner.semester != null && (
						<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Sem {romanSemester(learner.semester)}</Badge>
					)}
					{learner.semesters.length > 0 && (
						<span className="text-[10px] text-muted-foreground">
							arrears from Sem {learner.semesters.map(s => romanSemester(s)).join(', ')}
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
					{course.requires_update && (
						<Badge
							variant="outline"
							className="text-[10px] px-1.5 py-0 h-4 bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900"
							title="Already registered but not applied for - applying updates that row instead of creating a new one"
						>
							Apply existing
						</Badge>
					)}
					<span className="hidden lg:inline text-[10px] text-muted-foreground">Sem {romanSemester(course.original_semester ?? course.semester)}</span>
				</div>
				<div className="text-sm truncate">{course.course_name || '—'}</div>
			</div>
			{showFee && (
				// The rate book prices every paper, applied for or not. Hiding the amount
				// on an ineligible row (an arrear already registered this session) threw
				// away information the operator wants, so it is shown and muted instead
				// of blanked - muted meaning "priced, but not billed by this action".
				<div className={cn(
					'w-16 shrink-0 text-right text-sm tabular-nums',
					disabled ? 'text-muted-foreground font-normal' : 'font-medium'
				)}>
					{money(course.fee_amount)}
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
					<div className={cn(
						'text-sm tabular-nums',
						disabled ? 'text-muted-foreground font-normal' : 'font-medium'
					)}>
						{money(candidate.fee_total)}
					</div>
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
	// Shared across both tabs - see the Program filter note in the scope card.
	const [program, setProgram] = useState('all')
	const [cpSemester, setCpSemester] = useState('all')
	const [cpStatus, setCpStatus] = useState('pending')
	const [cpSearch, setCpSearch] = useState('')
	const [cpLearners, setCpLearners] = useState<CurrentPaperLearner[]>([])
	const [cpFilters, setCpFilters] = useState<CohortFilters>({ programs: [], semesters: [], totals: EMPTY_FILTER_TOTALS })
	const [chargeColumnsReady, setChargeColumnsReady] = useState(true)
	// The scope each tab already has on screen: `institution|session|program|semester`.
	// Switching tabs must not re-run a multi-second query for data already loaded, so
	// the effects fetch only when this no longer matches the current filters. The
	// Refresh buttons call the loaders directly and so always re-fetch.
	const [cpLoadedKey, setCpLoadedKey] = useState('')
	const [arLoadedKey, setArLoadedKey] = useState('')
	const [cpFee, setCpFee] = useState<BulkFeeContext | null>(null)
	const [cpSelected, setCpSelected] = useState<Set<string>>(new Set())
	const [loadingCp, setLoadingCp] = useState(false)

	// ── Arrear state ──
	const [arMode, setArMode] = useState<ArrearMode>('learner')
	const [arSemester, setArSemester] = useState('all')
	const [arSearch, setArSearch] = useState('')
	const [arLearners, setArLearners] = useState<ArrearLearner[]>([])
	const [arFilters, setArFilters] = useState<CohortFilters>({ programs: [], semesters: [], totals: EMPTY_FILTER_TOTALS })
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
		setCpFilters({ programs: [], semesters: [], totals: EMPTY_FILTER_TOTALS })
		setCpSelected(new Set())
		setProgram('all')
		setCpSemester('all')
		setArLearners([])
		setArFilters({ programs: [], semesters: [], totals: EMPTY_FILTER_TOTALS })
		setArPicked(new Set())
		setArCourses([])
		setArSelectedRows(new Set())
		setArSemester('all')
		setOfferings([])
		setOfferingId('')
		setSubjectOffering(null)
		setCandidates([])
		setSelectedCandidates(new Set())
		setFailures([])
		setCpLoadedKey('')
		setArLoadedKey('')
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
				return
		}

		setLoadingCp(true)
		try {
			const params = new URLSearchParams({
				institutions_id: institutionsId,
				examination_session_id: sessionId,
			})
			if (program !== 'all') params.set('program_code', program)
			if (cpSemester !== 'all') params.set('semester', cpSemester)

			const res = await fetch(`/api/exam-management/exam-applications/current-papers?${params}`)
			const raw: CurrentPaperCohortResponse & { error?: string } = await parseJsonResponse(res)
			if (!res.ok) throw new Error(raw?.error || 'Failed to load the current-paper cohort')

			setCpLearners(raw.data || [])
			setCpFilters(raw.filters || { programs: [], semesters: [], totals: EMPTY_FILTER_TOTALS })
			setCpFee(raw.fee || null)
			setChargeColumnsReady(raw.charge_columns_ready !== false)
			setCpLoadedKey(`${institutionsId}|${sessionId}|${program}|${cpSemester}`)
			setCpSelected(new Set())
		} catch (err) {
			console.error('[exam-applications] load current papers failed:', err)
			toast({
				title: '❌ Failed',
				description: err instanceof Error ? err.message : 'Failed to load the current-paper cohort',
				variant: 'destructive',
			})
			setCpLearners([])
			} finally {
			setLoadingCp(false)
		}
	}, [institutionsId, sessionId, program, cpSemester, toast])

	useEffect(() => {
		if (tab !== 'current') return
		if (!institutionsId || !sessionId) return
		// Already showing exactly this scope - a tab switch alone must not refetch.
		if (cpLoadedKey === `${institutionsId}|${sessionId}|${program}|${cpSemester}`) return
		loadCurrentPapers()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tab, institutionsId, sessionId, program, cpSemester, cpLoadedKey])

	// A semester that no longer exists under the newly chosen programme would
	// filter the list down to nothing, so drop it back to "all".
	useEffect(() => {
		if (cpSemester === 'all') return
		if (cpFilters.semesters.length === 0) return
		if (!cpFilters.semesters.some(s => s.value === cpSemester)) setCpSemester('all')
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
			if (program !== 'all') params.set('program_code', program)
			if (arSemester !== 'all') params.set('semester', arSemester)

			const res = await fetch(`/api/exam-management/exam-applications/arrear-learners?${params}`)
			const raw: ArrearLearnersResponse & { error?: string } = await parseJsonResponse(res)
			if (!res.ok) throw new Error(raw?.error || 'Failed to load learners with arrears')

			const rows = raw.data || []
			setArLearners(rows)
			setArLoadedKey(`${institutionsId}|${sessionId}|${program}|${arSemester}`)
			setArFilters(raw.filters || { programs: [], semesters: [], totals: EMPTY_FILTER_TOTALS })

			// Changing the programme / semester filter changes who is on the list. A
			// learner picked under the old filter is no longer visible, so keeping
			// them selected would silently submit somebody the operator can't see.
			const visible = new Set(rows.map(l => l.key))
			setArPicked(prev => {
				const next = new Set([...prev].filter(k => visible.has(k)))
				return next.size === prev.size ? prev : next
			})
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
	}, [institutionsId, sessionId, program, arSemester, toast])

	useEffect(() => {
		if (tab !== 'arrear' || arMode !== 'learner') return
		if (!institutionsId) return
		// Already showing exactly this scope - switching tabs or flipping between
		// Learner wise / Subject wise must not refetch.
		if (arLoadedKey === `${institutionsId}|${sessionId}|${program}|${arSemester}`) return
		loadArrearLearners()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tab, arMode, institutionsId, sessionId, program, arSemester, arLoadedKey])

	useEffect(() => {
		if (arSemester === 'all') return
		if (arFilters.semesters.length === 0) return
		if (!arFilters.semesters.some(s => s.value === arSemester)) setArSemester('all')
	}, [arFilters.semesters, arSemester])

	// ── Arrear - load the papers for the picked learners ──
	// Runs automatically as the selection changes (see the effect below), so responses
	// can land out of order - only the newest request is allowed to write.
	const arCoursesReq = useRef(0)
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

		const reqId = ++arCoursesReq.current
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
			if (reqId !== arCoursesReq.current) return   // a newer selection superseded this one
			if (!res.ok) throw new Error(raw?.error || 'Failed to load arrear papers')

			setArCourses(raw?.data || [])
			setArFee(raw?.fee || null)
		} catch (err) {
			if (reqId !== arCoursesReq.current) return
			console.error('[exam-applications] load arrear courses failed:', err)
			toast({
				title: '❌ Failed',
				description: err instanceof Error ? err.message : 'Failed to load arrear papers',
				variant: 'destructive',
			})
		} finally {
			if (reqId === arCoursesReq.current) setLoadingArCourses(false)
		}
	}, [institutionsId, sessionId, arPicked, arLearners, toast])

	// ── Arrear - papers follow the selection, no button press needed ──
	// Debounced because ticking learners one at a time would otherwise fire a
	// request per tick. Over the batch cap nothing is fetched: the footer button
	// stays as the explicit path and reports why.
	useEffect(() => {
		if (tab !== 'arrear' || arMode !== 'learner') return
		if (arPicked.size === 0) {
			arCoursesReq.current++          // discard anything still in flight
			setArCourses([])
			setArSelectedRows(new Set())
			setArFee(null)
			return
		}
		if (arPicked.size > MAX_LEARNERS_PER_BATCH) return
		const t = setTimeout(() => { loadArrearCourses() }, 400)
		return () => clearTimeout(t)
	}, [tab, arMode, arPicked, loadArrearCourses])

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
	// Every option states how much data sits behind it, so "Semester I (17 learners)"
	// beside "All semesters (17 learners)" makes it obvious when a filter genuinely
	// has nothing more to narrow rather than looking like it did nothing.
	const cpProgramOptions = useMemo(
		() => [
			{ value: 'all', label: `All programs — ${countLabel(cpFilters.totals.programs, 'papers')}` },
			...cpFilters.programs.map(p => ({ value: p.value, label: `${p.value} — ${countLabel(p, 'papers')}` })),
		],
		[cpFilters.programs, cpFilters.totals.programs]
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

	/**
	 * The distinct papers of the SELECTED learners.
	 *
	 * The flow is filter -> learners -> papers, so this panel follows the selection
	 * rather than showing the whole cohort up front: what the operator is about to
	 * apply for is exactly the papers of the learners they ticked. Derived from the
	 * learners already in hand - no extra request.
	 */
	const cpSelectedPapers = useMemo(() => {
		const byCode = new Map<string, CurrentPaperRow>()
		for (const learner of cpLearners) {
			if (!cpSelected.has(learner.key)) continue
			for (const subject of learner.subjects) {
				const key = subject.course_code.toUpperCase()
				const existing = byCode.get(key)
				if (existing) {
					existing.learner_count++
					if (subject.is_applied) existing.applied_count++
					continue
				}
				byCode.set(key, {
					course_code: subject.course_code,
					course_name: subject.course_name,
					semester: subject.semester,
					fee_amount: subject.quoted_fee ?? null,
					learner_count: 1,
					applied_count: subject.is_applied ? 1 : 0,
				})
			}
		}
		return [...byCode.values()].sort(
			(a, b) => (a.semester || 0) - (b.semester || 0) || a.course_code.localeCompare(b.course_code)
		)
	}, [cpLearners, cpSelected])

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
		() => [
			{ value: 'all', label: `All programs — ${countLabel(arFilters.totals.programs, 'arrears')}` },
			...arFilters.programs.map(p => ({ value: p.value, label: `${p.value} — ${countLabel(p, 'arrears')}` })),
		],
		[arFilters.programs, arFilters.totals.programs]
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
				program_code: program === 'all' ? '' : program,
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
	const showScopeFilters = !(tab === 'arrear' && arMode === 'subject')
	const semesterFilterOptions = tab === 'current' ? cpFilters.semesters : arFilters.semesters
	const rowNoun = tab === 'current' ? 'papers' : 'arrears'
	const semesterTotals = tab === 'current' ? cpFilters.totals.semesters : arFilters.totals.semesters

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

						{/* Tabs */}
						<Tabs value={tab} onValueChange={v => setTab(v as ApplyTab)} className="w-full">
							{/* Choosing the tab first is deliberate: the filter's option counts are
							    per tab (registered papers vs uncleared arrears), so the numbers only
							    mean something once you have said which job you are doing. */}
							<Card className={STEP_TONES.violet.card}>
								<CardContent className="p-4 space-y-3">
									<Step
										n={1}
										tone="violet"
										title="Choose what to apply for"
										hint="Current papers move existing registrations to Applied; arrears create new ones"
										active
									/>
									{/* Emerald = current paper, rose = arrear - the same pairing the row
									    badges use throughout, so the tab colour reads as the same thing. */}
									<TabsList className="grid w-full max-w-lg grid-cols-2 h-10">
										<TabsTrigger
											value="current"
											className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
										>
											<BookOpen className="h-3.5 w-3.5" />Current Papers
										</TabsTrigger>
										<TabsTrigger
											value="arrear"
											className="gap-1.5 data-[state=active]:bg-rose-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
										>
											<RotateCcw className="h-3.5 w-3.5" />Arrear Papers
										</TabsTrigger>
									</TabsList>
								</CardContent>
							</Card>

							{/* Scope */}
							<Card className={STEP_TONES.sky.card}>
								<CardHeader className="px-4 py-3 border-b">
									<div className="flex items-center justify-between gap-3 flex-wrap">
										<Step
											n={2}
											tone="sky"
											title="Filter"
											hint="Session, then programme and semester — this is what fetches the learners"
											active
											done={scopeReady}
										/>
										<Link href="/fee-details">
											<Button variant="outline" size="sm" className="h-8 text-sm px-3 gap-1.5">
												<IndianRupee className="h-3.5 w-3.5" />Fee Details
											</Button>
										</Link>
									</div>
								</CardHeader>
								<CardContent className="p-4 space-y-3">
									<div className="flex flex-wrap items-end gap-3 [&>div]:w-full [&>div]:sm:w-56">
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

										{/* Subject-wise arrears carry their own programme picker and take the
										    semester from the chosen offering, so these two would do nothing there. */}
										{showScopeFilters && (
											<>
												<div className="space-y-1.5">
													<Label className="text-xs font-medium">Program</Label>
													<SearchableSelect
														value={program}
														onValueChange={setProgram}
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
															<SelectItem value="all">
																{`All semesters — ${countLabel(semesterTotals, rowNoun)}`}
															</SelectItem>
															{semesterFilterOptions.map(o => (
																<SelectItem key={o.value} value={o.value}>
																	{`Semester ${romanSemester(Number(o.value))} — ${countLabel(o, rowNoun)}`}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
											</>
										)}
									</div>

									{/* Program is shared but Semester is not, which is worth stating outright. */}
									{showScopeFilters && (
										<p className="text-[11px] text-muted-foreground leading-relaxed">
											Program carries across both tabs, so you can apply Current Papers then Arrear Papers for the same cohort without
											re-filtering. Semester always means the learner&apos;s own semester.
										</p>
									)}

									{/* The charge columns arrive with a hand-applied migration. Until it runs,
									    applications still save but the two per-learner fees cannot be stored,
									    so say so rather than showing amounts that will not be written. */}
									{!chargeColumnsReady && (
										<div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
											<Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
											<p>
												<span className="font-medium">Application fee and mark statement fee cannot be stored yet.</span>{' '}
												Run <code className="font-mono">supabase/migrations/20260824_add_application_fees_to_exam_registrations.sql</code>{' '}
												in the Supabase SQL Editor. Applying still works — papers move to Applied and the per-paper fee is stamped —
												but the two per-learner charges are skipped until those columns exist.
											</p>
										</div>
									)}

									{/* Two sessions can share a session_code with only one carrying a fee
									    schedule. Without one there is no fine and no circular reference, and
									    nothing else in the flow would ever mention it. */}
									{feeContext?.configured && !feeContext.last_date_without_fine && !feeContext.circular_ref && (
										<div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
											<Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
											<p>
												Paper rates are configured, but this exam session has no fee schedule — no cut-off dates, no late fine and no
												circular reference will be recorded. Check you picked the right session if two share a code.{' '}
												<Link href="/fee-details" className="underline font-medium">Review fee schedule</Link>
											</p>
										</div>
									)}

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


								{/* ── Current Papers ── */}
							<TabsContent value="current" className="mt-3">
								<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-3 min-h-0">

									<Card className={cn('flex flex-col overflow-hidden', PANEL_HEIGHT, STEP_TONES.amber.card)}>
										<CardHeader className="px-4 py-3 border-b space-y-3">
											<div className="flex items-center justify-between gap-2 flex-wrap">
												<Step
													n={3}
													tone="amber"
													title="Select learners"
													hint="Each one applies for every paper they are already registered for"
													active={scopeReady}
													done={cpSelected.size > 0}
												/>
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
												<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground text-center">
													<Users className="h-8 w-8 mb-2 opacity-40" />
													{cpLearners.length === 0 ? (
														<p>No exam registrations in this session for the selected scope</p>
													) : selectableCpLearners.length === 0 && cpStatus === 'pending' ? (
														<>
															<p className="font-medium text-foreground">Nothing left to apply for</p>
															<p className="text-xs mt-1">
																All {cpLearners.length} learner{cpLearners.length === 1 ? '' : 's'} in this scope have already applied.
																Switch the filter to “All learners” to review them.
															</p>
														</>
													) : (
														<p>No learners match the current filters</p>
													)}
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
																Select all applicable ({selectableCpLearners.length})
																{filteredCpLearners.length !== cpLearners.length && ` · showing ${filteredCpLearners.length} of ${cpLearners.length}`}
															</span>
														</label>
														{showFee && <span className="w-24 text-right text-muted-foreground">Fee</span>}
														<span className="w-[92px] text-center text-muted-foreground">Status</span>
													</div>
													<div className="flex-1 min-h-0">
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
									<div className={cn('flex flex-col gap-3', PANEL_HEIGHT)}>
										<Card className={cn('flex flex-col flex-1 min-h-0 overflow-hidden', STEP_TONES.emerald.card)}>
											<CardHeader className="px-4 py-3 border-b">
												<Step
													n={4}
													tone="emerald"
													title="Papers being applied for"
													hint={cpSelection.learners === 0
														? 'Appear once learners are selected'
														: `${cpSelectedPapers.length} distinct paper${cpSelectedPapers.length === 1 ? '' : 's'} across ${cpSelection.learners} selected learner${cpSelection.learners === 1 ? '' : 's'}`}
													active={cpSelection.learners > 0}
												/>
											</CardHeader>
											<CardContent className="p-0 flex-1 flex flex-col min-h-0">
												{cpSelectedPapers.length === 0 ? (
													<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground">
														<BookOpen className="h-8 w-8 mb-2 opacity-40" />
														<p>Select learners on the left</p>
														<p className="text-xs mt-1 opacity-80">Their registered papers appear here</p>
													</div>
												) : (
													<div className="flex-1 min-h-0">
														<AutoSizer>
															{({ height, width }) => (
																<VirtualList height={height} width={width} itemCount={cpSelectedPapers.length} itemSize={ROW_HEIGHT}>
																	{({ index, style }) => (
																		<CohortPaperRow style={style} paper={cpSelectedPapers[index]} showFee={showFee} />
																	)}
																</VirtualList>
															)}
														</AutoSizer>
													</div>
												)}
											</CardContent>
										</Card>

										{showFee && (
											<Card className="shrink-0">
												<CardHeader className="px-4 py-2 border-b flex-row items-baseline justify-between gap-2 space-y-0">
													<h3 className="text-sm font-semibold">Fee for selection</h3>
													<p className="text-xs text-muted-foreground">
														{cpSelection.learners} learner{cpSelection.learners === 1 ? '' : 's'} · {cpSelection.papers} paper{cpSelection.papers === 1 ? '' : 's'}
													</p>
												</CardHeader>
												<CardContent className="px-4 py-3 space-y-2">
													<div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
														<FeeLine label="Exam papers" value={money(cpSelection.paperFee)} />
														<FeeLine label="Application fee" value={money(cpSelection.applicationFee)} />
														<FeeLine label="Mark statement fee" value={money(cpSelection.markStatementFee)} />
														{cpSelection.fine > 0 && (
															<FeeLine label="Late fine" value={money(cpSelection.fine)} tone="text-rose-600 dark:text-rose-400" />
														)}
													</div>
													<div className="flex justify-between items-baseline pt-2 border-t">
														<span className="text-sm font-semibold">Total</span>
														<span className="text-base font-semibold tabular-nums text-sky-600 dark:text-sky-400">{money(cpSelection.total)}</span>
													</div>
													<p className="text-[10px] text-muted-foreground leading-snug">
														Application and mark statement fees are charged once per learner per session — a learner already
														charged this session contributes paper fees only.
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
													? 'Pick learners on the left — their arrear papers load automatically. Tick the ones to register; each becomes a new arrear registration.'
													: 'Pick one subject code, then tick the learners holding an uncleared arrear in it.'}
											</p>
										</div>
									</CardContent>
								</Card>

								{arMode === 'learner' ? (
									<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)] gap-3">

										{/* Learners with arrears */}
										<Card className={cn('flex flex-col overflow-hidden', PANEL_HEIGHT, STEP_TONES.amber.card)}>
											<CardHeader className="px-4 py-3 border-b space-y-3">
												<div className="flex items-center justify-between gap-2">
													<Step
														n={3}
														tone="amber"
														title="Select learners"
														hint={loadingArLearners ? 'Loading...' : `${filteredArLearners.length} of ${arLearners.length} • ${arPicked.size} selected`}
														active={scopeReady}
														done={arPicked.size > 0}
													/>
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
														<div className="flex-1 min-h-0">
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
														<div className="px-3 py-2 border-t flex items-center justify-between gap-2 shrink-0">
															<span className="text-xs text-muted-foreground min-w-0 truncate">
																{arPicked.size === 0
																	? 'Tick learners — their papers load automatically'
																	: loadingArCourses
																		? 'Loading papers…'
																		: arPicked.size > MAX_LEARNERS_PER_BATCH
																			? `${arPicked.size} selected — over the ${MAX_LEARNERS_PER_BATCH} limit`
																			: `${arPicked.size} learner${arPicked.size === 1 ? '' : 's'} selected`}
															</span>
															<Button
																variant="outline"
																size="sm"
																className="h-8 text-xs gap-1.5 shrink-0"
																onClick={loadArrearCourses}
																disabled={arPicked.size === 0 || loadingArCourses || !sessionId}
															>
																{loadingArCourses
																	? <Loader2 className="h-3.5 w-3.5 animate-spin" />
																	: <BookOpen className="h-3.5 w-3.5" />}
																Reload
															</Button>
														</div>
													</>
												)}
											</CardContent>
										</Card>

										{/* Arrear papers */}
										<Card className={cn('flex flex-col overflow-hidden', PANEL_HEIGHT, STEP_TONES.emerald.card)}>
											<CardHeader className="px-4 py-3 border-b space-y-3">
												<div className="flex items-center justify-between gap-2 flex-wrap">
													<Step
														n={4}
														tone="emerald"
														title="Arrear papers to register"
														hint="Each learner gets only their own arrears"
														active={arCourseRows.length > 0}
														done={arSelectedRows.size > 0}
													/>
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
													<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground text-center">
														<ClipboardCheck className="h-8 w-8 mb-2 opacity-40" />
														{selectableArRows.length === 0 && arCourseStatus === 'eligible' ? (
															<>
																<p className="font-medium text-foreground">Nothing left to apply for</p>
																<p className="text-xs mt-1">
																	All {arCourseRows.length} arrear paper{arCourseRows.length === 1 ? '' : 's'} for these learners
																	{' '}have already been applied for. Switch Status to “All” to review them.
																</p>
															</>
														) : (
															<p>No arrear papers match the current filters</p>
														)}
													</div>
												) : (
													<>
														<div className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/40 text-xs font-medium">
															<label className="flex items-center gap-2 cursor-pointer flex-1">
																<Checkbox checked={allArRowsChecked} onCheckedChange={toggleAllArRows} disabled={selectableArRows.length === 0} />
																<span>
																	Select all eligible ({selectableArRows.length})
																	{filteredArRows.length !== arCourseRows.length && ` · showing ${filteredArRows.length} of ${arCourseRows.length}`}
																</span>
															</label>
															{showFee && <span className="w-16 text-right text-muted-foreground">Fee</span>}
															<span className="w-[112px] text-center text-muted-foreground">Status</span>
														</div>
														<div className="flex-1 min-h-0">
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
									<Card className={cn('flex flex-col overflow-hidden', PANEL_HEIGHT)}>
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
												<div className="flex flex-col items-center justify-center flex-1 p-8 text-sm text-muted-foreground text-center">
													<Users className="h-8 w-8 mb-2 opacity-40" />
													{candidates.length === 0 ? (
														<p>Nobody holds an uncleared arrear in this subject</p>
													) : selectableCandidates.length === 0 && candidateStatus === 'eligible' ? (
														<>
															<p className="font-medium text-foreground">Nothing left to apply for</p>
															<p className="text-xs mt-1">
																All {candidates.length} candidate{candidates.length === 1 ? '' : 's'} have already applied for this subject.
															</p>
														</>
													) : (
														<p>No learners match the current filters</p>
													)}
												</div>
											) : (
												<>
													<div className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/40 text-xs font-medium">
														<label className="flex items-center gap-2 cursor-pointer flex-1">
															<Checkbox checked={allCandidatesChecked} onCheckedChange={toggleAllCandidates} disabled={selectableCandidates.length === 0} />
															<span>
																Select all eligible ({selectableCandidates.length})
																{filteredCandidates.length !== candidates.length && ` · showing ${filteredCandidates.length} of ${candidates.length}`}
															</span>
														</label>
														{showFee && <span className="w-20 text-right text-muted-foreground">Fee</span>}
														<span className="w-[112px] text-center text-muted-foreground">Status</span>
													</div>
													<div className="flex-1 min-h-0">
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
