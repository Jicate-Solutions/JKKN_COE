'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import Link from 'next/link'
import { useSessionSync } from '@/hooks/use-session-sync'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useExamSessions } from '@/hooks/use-exam-sessions'
import { useInstitution } from '@/context/institution-context'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/common/use-toast'
import { cn } from '@/lib/utils'
import { batchLabel, batchYearOf } from '@/lib/utils/batch-year'
import { generateExamRegistrationReportPdf } from '@/lib/utils/generate-exam-registration-report-pdf'
import { exportExamRegistrationReportExcel } from '@/lib/utils/exam-registration-report-excel'
import {
	AlertTriangle,
	BadgeCheck,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronsUpDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	ClipboardCheck,
	Clock,
	FileDown,
	FileSpreadsheet,
	FileText,
	IndianRupee,
	Loader2,
	RefreshCw,
	RotateCcw,
	Search,
	Undo2,
	Users,
} from 'lucide-react'
import { FINAL_APPROVAL_PAYMENT_MODES } from '@/types/exam-registration-final-approval'
import type {
	FinalApprovalApprovedRow,
	FinalApprovalCohortResponse,
	FinalApprovalFilterOption,
	FinalApprovalLearner,
	FinalApprovalPaymentMode,
	FinalApprovalResult,
	FinalApprovalTotals,
	FinalUnapprovalResult,
} from '@/types/exam-registration-final-approval'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const PAGE_SIZE = 50
const REPORT_TYPE = 'student-final-approval'

const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const money = (value: number | null | undefined) =>
	value == null ? '—' : `₹${rupees.format(value)}`
const romanSemester = (value: number | null | undefined) =>
	value == null || value === 0 ? '—' : (ROMAN[value] || String(value))
const approvedOn = (value: string | null) =>
	value
		? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
		: '—'

const EMPTY_TOTALS: FinalApprovalTotals = {
	learners: 0, subjects: 0, exam_fee: 0, application_fee: 0, mark_statement_fee: 0, late_fine: 0, concession: 0, final_amount: 0,
}

type TabKey = 'pending' | 'approved' | 'report'

interface Filters {
	regulation: string
	/** Programme codes; empty = all programmes */
	programs: string[]
	/** Admission years as strings ("2024", "0" = not mapped); empty = all batches */
	batches: string[]
	/** Learner's semester; 'all' = every semester */
	semester: string
}
const NO_FILTERS: Filters = { regulation: 'all', programs: [], batches: [], semester: 'all' }
const NO_APPROVED_ROWS: FinalApprovalApprovedRow[] = []

/** What the filters look at - the same four facts for a pending and an approved learner */
interface FilterFacts {
	regulation_code: string | null
	program_code: string | null
	program_name: string | null
	semester: number | null
	batch_year: number
}

/** Header + rows of the Final Registration Approval report for the session */
interface ApprovedReport {
	institution_name: string
	institution_code: string
	session_name: string
	session_code: string
	data: FinalApprovalApprovedRow[]
}

/** Upper bound on a hand-entered late fine - mirrors the API */
const MAX_LATE_FINE = 100000

/** Typed late fine -> amount; blank, negative or non-numeric counts as no fine */
function parseLateFine(raw: string | undefined): number {
	const n = Number(raw)
	if (!raw || !Number.isFinite(n) || n <= 0) return 0
	return Math.min(MAX_LATE_FINE, Math.round(n * 100) / 100)
}

/** Parse JSON only when the response is JSON - a dev recompile can return HTML */
async function parseJsonResponse(res: Response): Promise<any> {
	const contentType = res.headers.get('content-type') || ''
	if (!contentType.includes('application/json')) {
		const text = await res.text().catch(() => '')
		throw new Error(`Expected JSON but received ${contentType || 'unknown'} (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`)
	}
	return res.json()
}

function sumPending(learners: FinalApprovalLearner[]): FinalApprovalTotals {
	const t = { ...EMPTY_TOTALS }
	for (const l of learners) {
		t.learners++
		t.subjects += l.total_subjects
		t.exam_fee += l.exam_fee
		t.application_fee += l.application_fee
		t.mark_statement_fee += l.mark_statement_fee
		t.late_fine += l.late_fine
		t.concession += l.concession_amount
		t.final_amount += l.final_amount
	}
	return t
}

function sumApproved(rows: FinalApprovalApprovedRow[]): FinalApprovalTotals {
	const t = { ...EMPTY_TOTALS }
	for (const r of rows) {
		t.learners++
		t.subjects += r.total_subjects
		t.exam_fee += r.exam_fee
		t.application_fee += r.application_fee
		t.mark_statement_fee += r.mark_statement_fee
		t.late_fine += r.late_fine
		t.concession += r.concession_amount || 0
		t.final_amount += r.final_amount
	}
	return t
}

const factsOfPending = (l: FinalApprovalLearner): FilterFacts => ({
	regulation_code: l.regulation_code,
	program_code: l.program_code,
	program_name: l.program_name,
	semester: l.semester,
	batch_year: l.batch_year,
})

const factsOfApproved = (r: FinalApprovalApprovedRow): FilterFacts => ({
	regulation_code: r.regulation_code,
	program_code: r.program_code,
	program_name: r.program_name,
	semester: r.learner_semester || null,
	batch_year: batchYearOf(r.stu_register_no),
})

function matchesFilters(f: Filters, facts: FilterFacts): boolean {
	if (f.regulation !== 'all' && (facts.regulation_code || '') !== f.regulation) return false
	if (f.programs.length > 0 && !f.programs.includes(facts.program_code || '')) return false
	if (f.batches.length > 0 && !f.batches.includes(String(facts.batch_year))) return false
	if (f.semester !== 'all' && String(facts.semester ?? '') !== f.semester) return false
	return true
}

function optionsOf(
	facts: FilterFacts[],
	pick: (f: FilterFacts) => { value: string; label: string } | null,
	sort: (a: FinalApprovalFilterOption, b: FinalApprovalFilterOption) => number
): FinalApprovalFilterOption[] {
	const map = new Map<string, FinalApprovalFilterOption>()
	for (const f of facts) {
		const picked = pick(f)
		if (!picked || !picked.value) continue
		const existing = map.get(picked.value)
		if (existing) existing.count++
		else map.set(picked.value, { ...picked, count: 1 })
	}
	return [...map.values()].sort(sort)
}

async function fetchAsDataUrl(url: string): Promise<string | undefined> {
	const res = await fetch(url)
	if (!res.ok) return undefined
	const blob = await res.blob()
	return new Promise<string>(resolve => {
		const reader = new FileReader()
		reader.onloadend = () => resolve(reader.result as string)
		reader.readAsDataURL(blob)
	})
}

/** Same letterhead logos as Reports > Exam Registration Reports */
async function loadReportLogos(meta: { institution_code: string; institution_name: string }) {
	try {
		// Engineering college: single left logo (jkkncet), no right logo
		const isEngineering = (meta.institution_code || '').toUpperCase() === 'CET' || (meta.institution_name || '').toUpperCase().includes('ENGINEER')
		const [logoImage, rightLogoImage] = await Promise.all([
			fetchAsDataUrl(isEngineering ? '/jkkncet_logo.png' : '/jkkn_logo.png'),
			isEngineering ? Promise.resolve(undefined) : fetchAsDataUrl('/jkkncas_logo.png'),
		])
		return { logoImage, rightLogoImage }
	} catch (e) {
		console.warn('Logo not loaded:', e)
		return { logoImage: undefined, rightLogoImage: undefined }
	}
}

/** The fee heads block - side panel and both confirmation steps print the same figures */
function FeeBreakdown({ totals, learnersLabel = 'Selected Learners', headsAreNet = false }: {
	totals: FinalApprovalTotals
	learnersLabel?: string
	/** Approved figures: the fee heads are already net of the concession */
	headsAreNet?: boolean
}) {
	return (
		<div className="space-y-3">
			<div className="grid grid-cols-2 gap-2">
				<div className="rounded-md bg-brand-green-50 px-3 py-2 dark:bg-brand-green-900/30">
					<p className="text-[11px] text-brand-green-700 dark:text-brand-green-300">{learnersLabel}</p>
					<p className="text-lg font-bold font-heading tabular-nums text-brand-green-800 dark:text-brand-green-100">{totals.learners}</p>
				</div>
				<div className="rounded-md bg-brand-yellow-50 px-3 py-2 dark:bg-brand-yellow-900/20">
					<p className="text-[11px] text-brand-yellow-900/80 dark:text-brand-yellow-300">Subject Registrations</p>
					<p className="text-lg font-bold font-heading tabular-nums text-brand-yellow-900 dark:text-brand-yellow-200">{totals.subjects}</p>
				</div>
			</div>
			<dl className="space-y-1.5 text-xs text-foreground">
				<div className="flex justify-between"><dt className="text-muted-foreground">Exam Fee</dt><dd className="tabular-nums">{money(totals.exam_fee)}</dd></div>
				<div className="flex justify-between"><dt className="text-muted-foreground">Application Fee</dt><dd className="tabular-nums">{money(totals.application_fee)}</dd></div>
				<div className="flex justify-between"><dt className="text-muted-foreground">Mark Statement Fee</dt><dd className="tabular-nums">{money(totals.mark_statement_fee)}</dd></div>
				<div className="flex justify-between"><dt className="text-muted-foreground">Late Fine</dt><dd className="tabular-nums">{money(totals.late_fine)}</dd></div>
				{totals.concession > 0 && (
					<div className="flex justify-between text-brand-green-700 dark:text-brand-green-300">
						<dt>{headsAreNet ? 'Fee Concession (already deducted)' : 'Fee Concession'}</dt>
						<dd className="tabular-nums">{headsAreNet ? money(totals.concession) : `− ${money(totals.concession)}`}</dd>
					</div>
				)}
			</dl>
			<div className="flex items-center justify-between rounded-md border border-brand-green-200 bg-brand-green-50 px-3 py-2 dark:border-brand-green-800 dark:bg-brand-green-900/30">
				<span className="text-sm font-medium text-brand-green-800 dark:text-brand-green-200">Final Amount</span>
				<span className="text-base font-bold font-heading tabular-nums text-brand-green dark:text-brand-green-300">{money(totals.final_amount)}</span>
			</div>
		</div>
	)
}

function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
	if (total <= PAGE_SIZE) return null
	return (
		<div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
			<span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
			<div className="flex items-center gap-1">
				<Button variant="outline" size="sm" className="h-7 px-2" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>
					<ChevronLeft className="h-3.5 w-3.5" />
				</Button>
				<span className="px-2">Page {page} of {totalPages}</span>
				<Button variant="outline" size="sm" className="h-7 px-2" onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
					<ChevronRight className="h-3.5 w-3.5" />
				</Button>
			</div>
		</div>
	)
}

const TABLE_HEADER_CLASS = 'bg-brand-green-50/70 dark:bg-brand-green-900/20 [&_th]:text-brand-green-800 dark:[&_th]:text-brand-green-200 [&_th]:font-semibold'
const OUTLINE_BUTTON_CLASS = 'border-brand-green-200 text-brand-green-700 hover:bg-brand-green-50 hover:text-brand-green-800 dark:border-brand-green-800 dark:text-brand-green-300 dark:hover:bg-brand-green-900/30'
const PRIMARY_BUTTON_CLASS = 'bg-brand-green hover:bg-brand-green-600 text-white dark:bg-brand-green-400 dark:hover:bg-brand-green-500 dark:text-gray-900'

export default function FinalExamRegistrationApprovalPage() {
	const { toast } = useToast()

	// ── Institution ──
	const {
		institutionId: contextInstitutionId,
		isReady: institutionContextReady,
		mustSelectInstitution,
	} = useInstitutionFilter()
	const { availableInstitutions, selectedInstitution, selectInstitution } = useInstitution()

	const institutionsId = institutionContextReady && !mustSelectInstitution
		? (contextInstitutionId ?? '')
		: (selectedInstitution?.id ?? '')

	// ── Session ──
	const { selectedSessionId: sessionId, setSelectedSessionId: setSessionId, mustSelectSession } = useSessionSync()
	const { sessions, loading: loadingSessions } = useExamSessions({ institutionsId: institutionsId || null })

	// ── Data ──
	const [tab, setTab] = useState<TabKey>('pending')
	const [cohort, setCohort] = useState<FinalApprovalCohortResponse | null>(null)
	const [loading, setLoading] = useState(false)
	const [approvedReport, setApprovedReport] = useState<ApprovedReport | null>(null)
	const [loadingApproved, setLoadingApproved] = useState(false)

	// ── Filters (applied as they change - there is no Search step) ──
	const [filters, setFilters] = useState<Filters>(NO_FILTERS)
	const [programOpen, setProgramOpen] = useState(false)
	const [batchOpen, setBatchOpen] = useState(false)
	const [search, setSearch] = useState('')

	// ── Pending list ──
	// Late-payment fine typed per learner (key -> raw input); absent = 0
	const [lateFines, setLateFines] = useState<Record<string, string>>({})
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const [page, setPage] = useState(1)
	const [approvedPage, setApprovedPage] = useState(1)

	// ── Approval: review (mode of payment) -> confirm again -> approve ──
	const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0)
	const [paymentMode, setPaymentMode] = useState<FinalApprovalPaymentMode | ''>('')
	const [transactionId, setTransactionId] = useState('')
	const [approving, setApproving] = useState(false)
	const [lastResult, setLastResult] = useState<FinalApprovalResult | null>(null)
	const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null)

	// ── Unapprove (Approved tab): learners approved by mistake go back to pending ──
	const [selectedApproved, setSelectedApproved] = useState<Set<string>>(new Set())
	const [unapproveOpen, setUnapproveOpen] = useState(false)
	const [unapproveReason, setUnapproveReason] = useState('')
	const [unapproving, setUnapproving] = useState(false)

	const fetchCohort = useCallback(async () => {
		if (!institutionsId || !sessionId) {
			setCohort(null)
			return
		}
		try {
			setLoading(true)
			const params = new URLSearchParams({ institutions_id: institutionsId, examination_session_id: sessionId })
			const res = await fetch(`/api/exam-management/exam-registration-final-approval?${params.toString()}`)
			const json = await parseJsonResponse(res)
			if (!res.ok) throw new Error(json?.error || 'Failed to load pending approvals')

			setCohort(json as FinalApprovalCohortResponse)
			setSelected(new Set())
			setExpanded(new Set())
		} catch (error) {
			console.error('Final approval cohort error:', error)
			setCohort(null)
			toast({
				title: 'Could not load pending approvals',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}, [institutionsId, sessionId, toast])

	/** Approved learners of the session - the Final Registration Approval report */
	const fetchApproved = useCallback(async (): Promise<ApprovedReport | null> => {
		if (!institutionsId || !sessionId) {
			setApprovedReport(null)
			return null
		}
		try {
			setLoadingApproved(true)
			const params = new URLSearchParams({
				institutions_id: institutionsId,
				examination_session_id: sessionId,
				report_type: REPORT_TYPE,
			})
			const res = await fetch(`/api/reports/exam-registration-reports?${params.toString()}`)
			const json = await parseJsonResponse(res)
			if (!res.ok) throw new Error(json?.error || 'Failed to load approved registrations')

			const report: ApprovedReport = {
				institution_name: json.institution_name || '',
				institution_code: json.institution_code || '',
				session_name: json.session_name || '',
				session_code: json.session_code || '',
				data: (json.data || []) as FinalApprovalApprovedRow[],
			}
			setApprovedReport(report)
			setSelectedApproved(new Set())
			return report
		} catch (error) {
			console.error('Final approval report error:', error)
			setApprovedReport(null)
			toast({
				title: 'Could not load approved registrations',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
			return null
		} finally {
			setLoadingApproved(false)
		}
	}, [institutionsId, sessionId, toast])

	// A new institution / session loads both lists straight away
	useEffect(() => {
		setFilters(NO_FILTERS)
		setSearch('')
		setLateFines({})
		setLastResult(null)
		fetchCohort()
		fetchApproved()
	}, [fetchCohort, fetchApproved])

	const handleRefresh = useCallback(() => {
		fetchCohort()
		fetchApproved()
	}, [fetchCohort, fetchApproved])

	const handleReset = useCallback(() => {
		setFilters(NO_FILTERS)
		setSearch('')
	}, [])

	// Any filter / search change lands on page 1 and drops rows that went out of view
	useEffect(() => {
		setPage(1)
		setApprovedPage(1)
	}, [filters, search, tab])

	// ── Pending learners ──
	// The cohort arrives with late_fine = 0; the fine typed on this screen is
	// folded in here so every total below already includes it.
	const learners = useMemo(() => (cohort?.data ?? []).map(l => {
		const late_fine = parseLateFine(lateFines[l.key])
		if (late_fine === 0) return l
		return { ...l, late_fine, final_amount: Math.round((l.final_amount + late_fine) * 100) / 100 }
	}), [cohort, lateFines])

	const approvedRows = approvedReport?.data ?? NO_APPROVED_ROWS

	// ── Filter options come from the list the active tab shows ──
	const activeFacts = useMemo(
		() => tab === 'pending' ? learners.map(factsOfPending) : approvedRows.map(factsOfApproved),
		[tab, learners, approvedRows]
	)
	const regulationOptions = useMemo(() => optionsOf(
		activeFacts,
		f => f.regulation_code ? { value: f.regulation_code, label: f.regulation_code } : null,
		(a, b) => a.value.localeCompare(b.value)
	), [activeFacts])
	const programOptions = useMemo(() => optionsOf(
		activeFacts,
		f => f.program_code ? { value: f.program_code, label: f.program_name ? `${f.program_code} - ${f.program_name}` : f.program_code } : null,
		(a, b) => a.value.localeCompare(b.value)
	), [activeFacts])
	const batchOptions = useMemo(() => optionsOf(
		activeFacts,
		f => ({ value: String(f.batch_year), label: batchLabel(f.batch_year) }),
		// Newest batch first; "Not Mapped" (0) sinks to the end
		(a, b) => Number(b.value) - Number(a.value)
	), [activeFacts])
	const semesterOptions = useMemo(() => optionsOf(
		activeFacts,
		f => f.semester ? { value: String(f.semester), label: `Semester ${ROMAN[f.semester] || f.semester}` } : null,
		(a, b) => Number(a.value) - Number(b.value)
	), [activeFacts])

	const toggleProgram = useCallback((code: string) => {
		setFilters(f => ({
			...f,
			programs: f.programs.includes(code) ? f.programs.filter(c => c !== code) : [...f.programs, code],
		}))
	}, [])
	const programTriggerLabel = useMemo(() => {
		if (filters.programs.length === 0) return 'All Programs'
		if (filters.programs.length === 1) {
			const opt = programOptions.find(o => o.value === filters.programs[0])
			return opt?.label ?? filters.programs[0]
		}
		return `${filters.programs.length} programs selected`
	}, [filters.programs, programOptions])

	const toggleBatch = useCallback((value: string) => {
		setFilters(f => ({
			...f,
			batches: f.batches.includes(value) ? f.batches.filter(b => b !== value) : [...f.batches, value],
		}))
	}, [])
	const batchTriggerLabel = useMemo(() => {
		if (filters.batches.length === 0) return 'All Batches'
		return filters.batches
			.slice()
			.sort((a, b) => Number(b) - Number(a))
			.map(b => batchLabel(Number(b)))
			.join(', ')
	}, [filters.batches])

	const searchQuery = search.trim().toUpperCase()

	// ── Pending: visible rows, paging, selection ──
	const visible = useMemo(() => learners.filter(l =>
		matchesFilters(filters, factsOfPending(l))
		&& (!searchQuery || l.register_number.toUpperCase().includes(searchQuery) || l.student_name.toUpperCase().includes(searchQuery))
	), [learners, filters, searchQuery])

	const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
	const currentPage = Math.min(page, totalPages)
	const pageRows = useMemo(
		() => visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
		[visible, currentPage]
	)

	// Only learners on screen can be approved - a row hidden by a filter never
	// rides along on a selection made before the filter changed.
	const selectedLearners = useMemo(() => visible.filter(l => selected.has(l.key)), [visible, selected])
	const selection = useMemo(() => sumPending(selectedLearners), [selectedLearners])
	const pendingSummary = useMemo(() => sumPending(visible), [visible])

	const headerChecked: boolean | 'indeterminate' =
		visible.length > 0 && selectedLearners.length === visible.length ? true
			: selectedLearners.length > 0 ? 'indeterminate'
				: false

	const toggleOne = useCallback((key: string, checked: boolean) => {
		setSelected(prev => {
			const next = new Set(prev)
			if (checked) next.add(key)
			else next.delete(key)
			return next
		})
	}, [])

	const toggleAllVisible = useCallback((checked: boolean) => {
		setSelected(prev => {
			const next = new Set(prev)
			for (const l of visible) {
				if (checked) next.add(l.key)
				else next.delete(l.key)
			}
			return next
		})
	}, [visible])

	const toggleExpanded = useCallback((key: string) => {
		setExpanded(prev => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}, [])

	// ── Approved: visible rows, paging, totals ──
	const visibleApproved = useMemo(() => approvedRows.filter(r =>
		matchesFilters(filters, factsOfApproved(r))
		&& (!searchQuery || String(r.stu_register_no || '').toUpperCase().includes(searchQuery) || String(r.student_name || '').toUpperCase().includes(searchQuery))
	), [approvedRows, filters, searchQuery])

	const approvedTotalPages = Math.max(1, Math.ceil(visibleApproved.length / PAGE_SIZE))
	const approvedCurrentPage = Math.min(approvedPage, approvedTotalPages)
	const approvedPageRows = useMemo(
		() => visibleApproved.slice((approvedCurrentPage - 1) * PAGE_SIZE, approvedCurrentPage * PAGE_SIZE),
		[visibleApproved, approvedCurrentPage]
	)
	const approvedSummary = useMemo(() => sumApproved(visibleApproved), [visibleApproved])

	// As on Pending: only rows on screen can be acted on
	const selectedApprovedRows = useMemo(() => visibleApproved.filter(r => selectedApproved.has(r.id)), [visibleApproved, selectedApproved])
	const unapproveSelection = useMemo(() => sumApproved(selectedApprovedRows), [selectedApprovedRows])
	const approvedHeaderChecked: boolean | 'indeterminate' =
		visibleApproved.length > 0 && selectedApprovedRows.length === visibleApproved.length ? true
			: selectedApprovedRows.length > 0 ? 'indeterminate'
				: false

	const toggleApprovedOne = useCallback((id: string, checked: boolean) => {
		setSelectedApproved(prev => {
			const next = new Set(prev)
			if (checked) next.add(id)
			else next.delete(id)
			return next
		})
	}, [])

	const toggleApprovedAllVisible = useCallback((checked: boolean) => {
		setSelectedApproved(prev => {
			const next = new Set(prev)
			for (const r of visibleApproved) {
				if (checked) next.add(r.id)
				else next.delete(r.id)
			}
			return next
		})
	}, [visibleApproved])

	const paymentModeSplit = useMemo(() => {
		const split = new Map<string, { learners: number; amount: number }>()
		for (const r of visibleApproved) {
			const mode = r.payment_mode || 'Not recorded'
			const entry = split.get(mode) || { learners: 0, amount: 0 }
			entry.learners++
			entry.amount += r.final_amount
			split.set(mode, entry)
		}
		return ['Cash', 'Online', 'Not recorded']
			.filter(mode => split.has(mode))
			.map(mode => ({ mode, ...split.get(mode)! }))
	}, [visibleApproved])

	// ── Report download ──
	const downloadPdf = useCallback(async (report: ApprovedReport, rows: FinalApprovalApprovedRow[]) => {
		const logos = await loadReportLogos(report)
		return generateExamRegistrationReportPdf({
			report_type: REPORT_TYPE,
			institution_name: report.institution_name,
			institution_code: report.institution_code,
			session_name: report.session_name,
			session_code: report.session_code,
			data: rows,
			...logos,
		})
	}, [])

	const handleDownloadPdf = useCallback(async () => {
		if (!approvedReport || visibleApproved.length === 0) return
		try {
			setExporting('pdf')
			const file = await downloadPdf(approvedReport, visibleApproved)
			if (file) toast({ title: 'Report downloaded', description: file, className: 'bg-green-50 border-green-200 text-green-800' })
		} catch (error) {
			console.error('Final approval PDF error:', error)
			toast({ title: 'PDF download failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
		} finally {
			setExporting(null)
		}
	}, [approvedReport, visibleApproved, downloadPdf, toast])

	const handleDownloadExcel = useCallback(async () => {
		if (!approvedReport || visibleApproved.length === 0) return
		try {
			setExporting('excel')
			await exportExamRegistrationReportExcel({
				report_type: REPORT_TYPE,
				institution_name: approvedReport.institution_name,
				institution_code: approvedReport.institution_code,
				session_name: approvedReport.session_name,
				session_code: approvedReport.session_code,
				data: visibleApproved,
			})
		} catch (error) {
			console.error('Final approval Excel error:', error)
			toast({ title: 'Excel download failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
		} finally {
			setExporting(null)
		}
	}, [approvedReport, visibleApproved, toast])

	// ── Approve ──
	const transactionIdMissing = paymentMode === 'Online' && !transactionId.trim()
	const canContinue = paymentMode !== '' && !transactionIdMissing

	const openConfirm = useCallback(() => {
		setPaymentMode('')
		setTransactionId('')
		setConfirmStep(1)
	}, [])

	const handleConfirmApprove = useCallback(async () => {
		setConfirmStep(0)
		if (selectedLearners.length === 0 || paymentMode === '') return
		try {
			setApproving(true)
			const res = await fetch('/api/exam-management/exam-registration-final-approval', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: institutionsId,
					examination_session_id: sessionId,
					payment_mode: paymentMode,
					payment_transaction_id: paymentMode === 'Online' ? transactionId.trim() : null,
					learners: selectedLearners.map(l => ({ student_id: l.student_id, register_number: l.register_number, late_fine: l.late_fine })),
				}),
			})
			const json = await parseJsonResponse(res)
			if (!res.ok) throw new Error(json?.error || 'Final approval failed')

			const result = json as FinalApprovalResult
			setLastResult(result)
			toast({
				title: 'Final registration approval completed',
				description: `${result.students_approved} learner${result.students_approved === 1 ? '' : 's'} approved, ${result.subjects_updated} subject${result.subjects_updated === 1 ? '' : 's'} updated, ${money(result.totals.final_amount)} by ${result.payment_mode}.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			// Approved learners leave the pending list - and take their fine with them,
			// so it cannot resurface if they come back with another paper.
			setLateFines(prev => {
				const next = { ...prev }
				for (const l of selectedLearners) delete next[l.key]
				return next
			})
			const [, report] = await Promise.all([fetchCohort(), fetchApproved()])

			// The approval report for exactly the learners just approved downloads
			// straight away; the whole session stays available under Report.
			if (report && result.approved?.length > 0) {
				try {
					await downloadPdf(report, result.approved)
				} catch (pdfError) {
					console.error('Final approval PDF error:', pdfError)
					toast({
						title: 'Approved, but the PDF did not download',
						description: 'Open the Report tab to download it.',
						variant: 'destructive',
					})
				}
			}
		} catch (error) {
			console.error('Final approval error:', error)
			toast({
				title: 'Final approval failed',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setApproving(false)
		}
	}, [selectedLearners, paymentMode, transactionId, institutionsId, sessionId, fetchCohort, fetchApproved, downloadPdf, toast])

	const handleConfirmUnapprove = useCallback(async () => {
		const reason = unapproveReason.trim()
		if (selectedApprovedRows.length === 0 || !reason) return
		try {
			setUnapproving(true)
			const res = await fetch('/api/exam-management/exam-registration-final-approval/unapprove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: institutionsId,
					examination_session_id: sessionId,
					register_numbers: selectedApprovedRows.map(r => r.stu_register_no),
					reason,
				}),
			})
			const json = await parseJsonResponse(res)
			if (!res.ok) throw new Error(json?.error || 'Unapprove failed')

			const result = json as FinalUnapprovalResult
			setUnapproveOpen(false)
			setUnapproveReason('')
			setLastResult(null)
			toast({
				title: 'Approval undone',
				description: `${result.students_unapproved} learner${result.students_unapproved === 1 ? '' : 's'} moved back to Pending, ${result.subjects_updated} subject${result.subjects_updated === 1 ? '' : 's'} updated.${result.not_found > 0 ? ` ${result.not_found} were no longer approved and were left as they are.` : ''}`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			await Promise.all([fetchCohort(), fetchApproved()])
		} catch (error) {
			console.error('Final approval unapprove error:', error)
			toast({
				title: 'Unapprove failed',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setUnapproving(false)
		}
	}, [unapproveReason, selectedApprovedRows, institutionsId, sessionId, fetchCohort, fetchApproved, toast])

	const canApprove = selectedLearners.length > 0 && !approving && !loading && (cohort?.migration_ready ?? false)
	const ready = !!institutionsId && !!sessionId
	const showingPending = tab === 'pending'
	const listLoading = showingPending ? loading : loadingApproved
	const PENDING_COLUMNS = 14
	const APPROVED_COLUMNS = 17

	const filtersActive = filters.regulation !== 'all' || filters.programs.length > 0 || filters.batches.length > 0 || filters.semester !== 'all' || !!search

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
								<BreadcrumbItem><BreadcrumbLink asChild><Link href="/exam-management/exam-registrations">Exam Registration</Link></BreadcrumbLink></BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem><BreadcrumbPage>Final Approval</BreadcrumbPage></BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						<div className="flex items-start justify-between gap-3 flex-wrap">
						<div className="flex items-start gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-green-50 text-brand-green ring-1 ring-brand-green-200 dark:bg-brand-green-900/30 dark:text-brand-green-300 dark:ring-brand-green-800">
								<BadgeCheck className="h-5 w-5" />
							</div>
							<div>
								<h1 className="text-lg font-semibold tracking-tight font-heading text-brand-green-800 dark:text-brand-green-200">
									Final Exam Registration Approval
								</h1>
								<p className="text-xs text-muted-foreground mt-0.5">
									Collect the exam fee and give the registration its final approval. Approving a learner approves every subject they applied for.
								</p>
							</div>
						</div>
							<Button asChild variant="outline" size="sm" className={cn('h-8 text-xs', OUTLINE_BUTTON_CLASS)}>
								<Link href="/exam-management/exam-fee-concessions">Fee Concessions</Link>
							</Button>
						</div>

						{/* Stats */}
						<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
							<Card className="border-brand-yellow-400 bg-brand-yellow-50 dark:border-brand-yellow-800 dark:bg-brand-yellow-900/20">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight font-heading text-brand-yellow-900 dark:text-brand-yellow-300">{pendingSummary.learners}</p>
										<p className="text-xs font-medium text-brand-yellow-900/70 dark:text-brand-yellow-300/80 mt-0.5">Pending Learners</p>
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-yellow-500 text-brand-yellow-900">
										<Clock className="h-5 w-5" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-brand-green-100 bg-white dark:border-brand-green-900/60 dark:bg-gray-900">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight font-heading text-brand-green-800 dark:text-brand-green-200">{money(pendingSummary.final_amount)}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Pending Amount</p>
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green-50 text-brand-green dark:bg-brand-green-900/40 dark:text-brand-green-300">
										<IndianRupee className="h-5 w-5" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-brand-green-100 bg-white dark:border-brand-green-900/60 dark:bg-gray-900">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight font-heading text-brand-green-800 dark:text-brand-green-200">{approvedSummary.learners}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Approved Learners</p>
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green-50 text-brand-green dark:bg-brand-green-900/40 dark:text-brand-green-300">
										<Users className="h-5 w-5" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-0 bg-gradient-to-br from-brand-green-600 to-brand-green-800 text-white shadow-md">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight font-heading">{money(approvedSummary.final_amount)}</p>
										<p className="text-xs font-medium text-brand-green-100 mt-0.5">Collected Amount</p>
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white">
										<BadgeCheck className="h-5 w-5" />
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Setup notices */}
						{cohort && !cohort.migration_ready && (
							<Alert variant="destructive">
								<AlertTriangle className="h-4 w-4" />
								<AlertTitle>Final approval is not set up yet</AlertTitle>
								<AlertDescription>
									Run <code className="text-xs">supabase/migrations/20260912_exam_registration_final_approval.sql</code> and then <code className="text-xs">supabase/migrations/20260919_final_approval_manual_late_fine.sql</code> in the Supabase SQL Editor.
								</AlertDescription>
							</Alert>
						)}
						{cohort && cohort.migration_ready && !cohort.charge_columns_ready && (
							<Alert>
								<AlertTriangle className="h-4 w-4" />
								<AlertTitle>Application and mark statement fees are not stored yet</AlertTitle>
								<AlertDescription>
									Run <code className="text-xs">supabase/migrations/20260824_add_application_fees_to_exam_registrations.sql</code>. Until then those columns show ₹0 and only the per-paper exam fee is approved.
								</AlertDescription>
							</Alert>
						)}

						{/* Success */}
						{lastResult && (
							<Alert className="border-brand-green-200 bg-brand-green-50 text-brand-green-900 dark:border-brand-green-800 dark:bg-brand-green-900/30 dark:text-brand-green-100">
								<CheckCircle2 className="h-4 w-4 text-brand-green" />
								<AlertTitle>Final registration approval completed successfully.</AlertTitle>
								<AlertDescription>
									<div className="grid grid-cols-1 sm:grid-cols-4 gap-x-6 gap-y-1 mt-1 text-sm">
										<span>Learners Approved : <strong>{lastResult.students_approved}</strong></span>
										<span>Subjects Updated : <strong>{lastResult.subjects_updated}</strong></span>
										<span>Total Amount : <strong>{money(lastResult.totals.final_amount)}</strong></span>
										<span>Mode of Payment : <strong>{lastResult.payment_mode}</strong></span>
									</div>
									{lastResult.skipped.length > 0 && (
										<p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
											{lastResult.skipped.length} selected learner{lastResult.skipped.length === 1 ? ' was' : 's were'} skipped: {lastResult.skipped.slice(0, 5).map(s => s.register_number).join(', ')}{lastResult.skipped.length > 5 ? '…' : ''} — {lastResult.skipped[0].reason}
										</p>
									)}
								</AlertDescription>
							</Alert>
						)}

						{/* Filters - applied as they change */}
						<Card className="border-brand-green-100 dark:border-brand-green-900/60">
							<CardContent className="p-4">
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
									{mustSelectInstitution && (
										<div className="space-y-1.5">
											<Label className="text-xs">Institution *</Label>
											<Select
												value={selectedInstitution?.id ?? ''}
												onValueChange={(id) => selectInstitution(availableInstitutions.find(i => i.id === id) ?? null)}
											>
												<SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select institution" /></SelectTrigger>
												<SelectContent>
													{availableInstitutions.map(i => (
														<SelectItem key={i.id} value={i.id} className="text-xs">{i.institution_code} - {i.institution_name}</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}

									{mustSelectSession && (
										<div className="space-y-1.5">
											<Label className="text-xs">Exam Session *</Label>
											<Select value={sessionId} onValueChange={setSessionId} disabled={!institutionsId || loadingSessions}>
												<SelectTrigger className="h-9 text-xs">
													<SelectValue placeholder={loadingSessions ? 'Loading…' : 'Select session'} />
												</SelectTrigger>
												<SelectContent>
													{sessions.map(s => (
														<SelectItem key={s.id} value={s.id} className="text-xs">{s.session_code}{s.session_name ? ` - ${s.session_name}` : ''}</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}

									<div className="space-y-1.5">
										<Label className="text-xs">Regulation</Label>
										<Select value={filters.regulation} onValueChange={v => setFilters(f => ({ ...f, regulation: v }))} disabled={!ready}>
											<SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All regulations" /></SelectTrigger>
											<SelectContent>
												<SelectItem value="all" className="text-xs">All Regulations</SelectItem>
												{regulationOptions.map(o => (
													<SelectItem key={o.value} value={o.value} className="text-xs">{o.label} ({o.count})</SelectItem>
												))}
												{filters.regulation !== 'all' && !regulationOptions.some(o => o.value === filters.regulation) && (
													<SelectItem value={filters.regulation} className="text-xs">{filters.regulation} (0)</SelectItem>
												)}
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-1.5">
										<Label className="text-xs">Program</Label>
										<Popover open={programOpen} onOpenChange={setProgramOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={programOpen}
													disabled={!ready}
													className="h-9 w-full justify-between text-xs font-normal"
												>
													<span className="truncate">{programTriggerLabel}</span>
													<ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[360px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search program code or name…" className="text-xs" />
													<CommandList className="max-h-72">
														<CommandEmpty className="py-4 text-center text-xs">No program found.</CommandEmpty>
														<CommandGroup>
															<CommandItem
																value="__all__"
																onSelect={() => setFilters(f => ({ ...f, programs: [] }))}
																className="text-xs"
															>
																<Check className={cn('mr-2 h-3 w-3', filters.programs.length === 0 ? 'opacity-100' : 'opacity-0')} />
																All Programs
															</CommandItem>
															{programOptions.map(o => {
																const active = filters.programs.includes(o.value)
																return (
																	<CommandItem
																		key={o.value}
																		// Value carries code AND name so the search box matches either
																		value={`${o.value} ${o.label}`}
																		onSelect={() => toggleProgram(o.value)}
																		className="text-xs"
																	>
																		<Check className={cn('mr-2 h-3 w-3', active ? 'opacity-100' : 'opacity-0')} />
																		<span className="truncate">{o.label}</span>
																		<span className="ml-auto pl-2 text-muted-foreground tabular-nums">{o.count}</span>
																	</CommandItem>
																)
															})}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									<div className="space-y-1.5">
										<Label className="text-xs">Batch</Label>
										<Popover open={batchOpen} onOpenChange={setBatchOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={batchOpen}
													disabled={!ready}
													className="h-9 w-full justify-between text-xs font-normal"
												>
													<span className="truncate">{batchTriggerLabel}</span>
													<ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[240px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search batch…" className="text-xs" />
													<CommandList className="max-h-72">
														<CommandEmpty className="py-4 text-center text-xs">No batch found.</CommandEmpty>
														<CommandGroup>
															<CommandItem
																value="__all__"
																onSelect={() => setFilters(f => ({ ...f, batches: [] }))}
																className="text-xs"
															>
																<Check className={cn('mr-2 h-3 w-3', filters.batches.length === 0 ? 'opacity-100' : 'opacity-0')} />
																All Batches
															</CommandItem>
															{batchOptions.map(o => (
																<CommandItem
																	key={o.value}
																	value={o.label}
																	onSelect={() => toggleBatch(o.value)}
																	className="text-xs"
																>
																	<Check className={cn('mr-2 h-3 w-3', filters.batches.includes(o.value) ? 'opacity-100' : 'opacity-0')} />
																	<span className="truncate">{o.label}</span>
																	<span className="ml-auto pl-2 text-muted-foreground tabular-nums">{o.count}</span>
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									<div className="space-y-1.5">
										<Label className="text-xs">Semester <span className="text-muted-foreground font-normal">(Optional)</span></Label>
										<Select value={filters.semester} onValueChange={v => setFilters(f => ({ ...f, semester: v }))} disabled={!ready}>
											<SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All semesters" /></SelectTrigger>
											<SelectContent>
												<SelectItem value="all" className="text-xs">All Semesters</SelectItem>
												{semesterOptions.map(o => (
													<SelectItem key={o.value} value={o.value} className="text-xs">{o.label} ({o.count})</SelectItem>
												))}
												{filters.semester !== 'all' && !semesterOptions.some(o => o.value === filters.semester) && (
													<SelectItem value={filters.semester} className="text-xs">Semester {ROMAN[Number(filters.semester)] || filters.semester} (0)</SelectItem>
												)}
											</SelectContent>
										</Select>
									</div>
								</div>

								<div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
									<div className="relative w-full sm:w-72">
										<Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
										<Input
											value={search}
											onChange={e => setSearch(e.target.value)}
											placeholder="Search register number or name"
											className="h-9 pl-8 text-xs"
											disabled={!ready}
										/>
									</div>
									<div className="flex items-center gap-2">
										<Button variant="outline" size="sm" className={cn('h-9 text-xs gap-1.5', OUTLINE_BUTTON_CLASS)} onClick={handleReset} disabled={!filtersActive}>
											<RotateCcw className="h-3.5 w-3.5" /> Reset
										</Button>
										<Button variant="outline" size="sm" className={cn('h-9 text-xs gap-1.5', OUTLINE_BUTTON_CLASS)} onClick={handleRefresh} disabled={!ready || loading || loadingApproved}>
											<RefreshCw className={cn('h-3.5 w-3.5', (loading || loadingApproved) && 'animate-spin')} /> Refresh
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>

						<Tabs value={tab} onValueChange={v => setTab(v as TabKey)} className="space-y-3">
							<TabsList className="h-9">
								<TabsTrigger value="pending" className="text-xs gap-1.5">
									<Clock className="h-3.5 w-3.5" /> Pending
									<Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] tabular-nums">{pendingSummary.learners}</Badge>
								</TabsTrigger>
								<TabsTrigger value="approved" className="text-xs gap-1.5">
									<BadgeCheck className="h-3.5 w-3.5" /> Approved
									<Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] tabular-nums">{approvedSummary.learners}</Badge>
								</TabsTrigger>
								<TabsTrigger value="report" className="text-xs gap-1.5">
									<FileText className="h-3.5 w-3.5" /> Report
								</TabsTrigger>
							</TabsList>

							{/* ── Pending ── */}
							<TabsContent value="pending" className="mt-0">
								<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-3 items-start">
									<Card className="border-brand-green-100 dark:border-brand-green-900/60 overflow-hidden">
										<CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0 border-b border-brand-green-100 bg-brand-cream-100 dark:border-brand-green-900/60 dark:bg-gray-900">
											<CardTitle className="text-sm font-heading text-brand-green-800 dark:text-brand-green-200">Pending Final Approval</CardTitle>
											<Badge variant="outline" className="text-[11px] font-medium border-brand-green-200 bg-white text-brand-green-700 dark:border-brand-green-800 dark:bg-transparent dark:text-brand-green-300">
												{visible.length} learner{visible.length === 1 ? '' : 's'}{search ? ` matching "${search}"` : ''}
											</Badge>
										</CardHeader>
										<CardContent className="p-0">
											<div className="overflow-x-auto">
												<Table>
													<TableHeader className={TABLE_HEADER_CLASS}>
														<TableRow className="hover:bg-transparent">
															<TableHead className="w-10 text-center">
																<Checkbox
																	checked={headerChecked}
																	onCheckedChange={(v) => toggleAllVisible(v === true)}
																	disabled={visible.length === 0}
																	aria-label="Select all learners"
																/>
															</TableHead>
															<TableHead className="w-12 text-center">S.No</TableHead>
															<TableHead>Register Number</TableHead>
															<TableHead>Learner Name</TableHead>
															<TableHead>Program</TableHead>
															<TableHead className="text-center">Sem</TableHead>
															<TableHead className="text-center">Total Subjects</TableHead>
															<TableHead className="text-right">Exam Fee</TableHead>
															<TableHead className="text-right">Application Fee</TableHead>
															<TableHead className="text-right">Mark Statement Fee</TableHead>
															<TableHead className="text-right">Late Fine</TableHead>
															<TableHead className="text-right">Concession</TableHead>
															<TableHead className="text-right">Final Amount</TableHead>
															<TableHead className="text-center">Status</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{!ready ? (
															<TableRow>
																<TableCell colSpan={PENDING_COLUMNS} className="text-center py-10 text-sm text-muted-foreground">
																	Select an institution and an exam session to list learners awaiting final approval.
																</TableCell>
															</TableRow>
														) : listLoading ? (
															<TableRow>
																<TableCell colSpan={PENDING_COLUMNS} className="text-center py-10 text-sm text-muted-foreground">
																	<Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading pending approvals…
																</TableCell>
															</TableRow>
														) : pageRows.length === 0 ? (
															<TableRow>
																<TableCell colSpan={PENDING_COLUMNS} className="text-center py-10 text-sm text-muted-foreground">
																	No learner is awaiting final approval for the selected filters.
																</TableCell>
															</TableRow>
														) : (
															pageRows.map((l, idx) => {
																const isSelected = selected.has(l.key)
																const isExpanded = expanded.has(l.key)
																return (
																	<Fragment key={l.key}>
																		<TableRow className={cn(
																			'transition-colors',
																			isSelected
																				? 'bg-brand-yellow-50 hover:bg-brand-yellow-100/70 shadow-[inset_3px_0_0_0_#0b6d41] dark:bg-brand-yellow-900/15 dark:hover:bg-brand-yellow-900/25'
																				: 'hover:bg-brand-cream-200/70 dark:hover:bg-gray-800/60'
																		)}>
																			<TableCell className="text-center">
																				<Checkbox
																					checked={isSelected}
																					onCheckedChange={(v) => toggleOne(l.key, v === true)}
																					aria-label={`Select ${l.register_number}`}
																				/>
																			</TableCell>
																			<TableCell className="text-center text-xs">{(currentPage - 1) * PAGE_SIZE + idx + 1}</TableCell>
																			<TableCell className="text-xs font-semibold whitespace-nowrap text-brand-green-800 dark:text-brand-green-200">{l.register_number}</TableCell>
																			<TableCell className="text-xs">{l.student_name || '—'}</TableCell>
																			<TableCell className="text-xs">
																				<div>{l.program_code || '—'}</div>
																				{l.regulation_code && <div className="text-[10px] text-muted-foreground">Reg. {l.regulation_code}</div>}
																			</TableCell>
																			<TableCell className="text-center text-xs">{romanSemester(l.semester)}</TableCell>
																			<TableCell className="text-center text-xs">
																				<button
																					type="button"
																					onClick={() => toggleExpanded(l.key)}
																					className={cn(
																						'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold transition-colors',
																						isExpanded
																							? 'border-brand-green bg-brand-green text-white'
																							: 'border-brand-green-200 bg-brand-green-50 text-brand-green-800 hover:bg-brand-green-100 dark:border-brand-green-800 dark:bg-brand-green-900/30 dark:text-brand-green-200'
																					)}
																					title="Show subjects"
																				>
																					{l.total_subjects}
																					{isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
																				</button>
																			</TableCell>
																			<TableCell className="text-right text-xs tabular-nums">{money(l.exam_fee)}</TableCell>
																			<TableCell className="text-right text-xs tabular-nums">{money(l.application_fee)}</TableCell>
																			<TableCell className="text-right text-xs tabular-nums">{money(l.mark_statement_fee)}</TableCell>
																			<TableCell className="text-right">
																				<Input
																					type="number"
																					inputMode="decimal"
																					min={0}
																					max={MAX_LATE_FINE}
																					step="1"
																					value={lateFines[l.key] ?? ''}
																					onChange={e => setLateFines(prev => ({ ...prev, [l.key]: e.target.value }))}
																					placeholder="0"
																					disabled={approving}
																					aria-label={`Late fine for ${l.register_number}`}
																					className={cn(
																						'h-7 w-20 ml-auto px-2 text-right text-xs tabular-nums',
																						l.late_fine > 0 && 'border-brand-yellow-500 bg-brand-yellow-50 font-semibold dark:bg-brand-yellow-900/20'
																					)}
																				/>
																			</TableCell>
																			<TableCell className="text-right text-xs tabular-nums whitespace-nowrap">
																				{l.concession_amount > 0 ? (
																					<span className="font-semibold text-brand-green-700 dark:text-brand-green-300" title={`${l.concession_type || 'Fee'} concession - Exam ${money(l.concession_exam_fee)}, Application ${money(l.concession_application_fee)}, Mark Statement ${money(l.concession_mark_statement_fee)}`}>
																						− {money(l.concession_amount)}
																					</span>
																				) : '—'}
																			</TableCell>
																			<TableCell className="text-right text-xs font-bold tabular-nums text-brand-green-800 dark:text-brand-green-200">{money(l.final_amount)}</TableCell>
																			<TableCell className="text-center">
																				<Badge variant="outline" className="text-[10px] whitespace-nowrap border-brand-yellow-400 bg-brand-yellow-100 text-brand-yellow-900 dark:border-brand-yellow-700 dark:bg-brand-yellow-900/30 dark:text-brand-yellow-200">{l.status}</Badge>
																			</TableCell>
																		</TableRow>
																		{isExpanded && (
																			<TableRow className="bg-brand-cream-100 hover:bg-brand-cream-100 dark:bg-gray-900/60 dark:hover:bg-gray-900/60">
																				<TableCell colSpan={PENDING_COLUMNS} className="py-2 px-6 border-l-[3px] border-l-brand-green-300 dark:border-l-brand-green-700">
																					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
																						{l.subjects.map(s => (
																							<div key={s.registration_id} className="flex items-center justify-between gap-2 text-xs">
																								<span className="truncate">
																									<span className="font-medium">{s.course_code}</span>
																									{s.course_name && <span className="text-muted-foreground"> — {s.course_name}</span>}
																								</span>
																								<span className="flex items-center gap-1.5 shrink-0">
																									<Badge variant="outline" className={cn('text-[10px]', s.is_regular ? 'border-brand-green-200 bg-brand-green-50 text-brand-green-700 dark:border-brand-green-800 dark:bg-brand-green-900/30 dark:text-brand-green-300' : 'border-brand-yellow-400 bg-brand-yellow-100 text-brand-yellow-900 dark:border-brand-yellow-700 dark:bg-brand-yellow-900/30 dark:text-brand-yellow-200')}>
																										{s.is_regular ? 'Regular' : `Arrear #${s.attempt_number}`}
																									</Badge>
																									<span className="tabular-nums">{money(s.exam_fee)}</span>
																								</span>
																							</div>
																						))}
																					</div>
																				</TableCell>
																			</TableRow>
																		)}
																	</Fragment>
																)
															})
														)}
													</TableBody>
												</Table>
											</div>
											<Pager page={currentPage} totalPages={totalPages} total={visible.length} onPage={setPage} />
										</CardContent>
									</Card>

									{/* Selection summary */}
									<Card className="xl:sticky xl:top-4 overflow-hidden border-brand-green-100 dark:border-brand-green-900/60">
										<CardHeader className="py-3 px-4 bg-gradient-to-r from-brand-green-600 to-brand-green-800 text-white">
											<CardTitle className="text-sm font-heading flex items-center gap-2">
												<ClipboardCheck className="h-4 w-4" />
												Selection Summary
											</CardTitle>
										</CardHeader>
										<CardContent className="px-4 pb-4 pt-4 space-y-3">
											<FeeBreakdown totals={selection} />
											<Button className={cn('w-full h-10 text-sm gap-1.5 shadow-sm', PRIMARY_BUTTON_CLASS)} onClick={openConfirm} disabled={!canApprove}>
												{approving
													? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Approving…</>
													: <><BadgeCheck className="h-3.5 w-3.5" />Approve Final Registration{selection.learners > 0 ? ` (${selection.learners})` : ''}</>}
											</Button>
											{selection.learners === 0 && (
												<p className="text-[11px] text-muted-foreground text-center">Select one, several, or all learners to approve.</p>
											)}
										</CardContent>
									</Card>
								</div>
							</TabsContent>

							{/* ── Approved ── */}
							<TabsContent value="approved" className="mt-0">
								<Card className="border-brand-green-100 dark:border-brand-green-900/60 overflow-hidden">
									<CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0 border-b border-brand-green-100 bg-brand-cream-100 dark:border-brand-green-900/60 dark:bg-gray-900">
										<CardTitle className="text-sm font-heading text-brand-green-800 dark:text-brand-green-200">Approved Registrations</CardTitle>
										<div className="flex items-center gap-2">
											<Badge variant="outline" className="text-[11px] font-medium border-brand-green-200 bg-white text-brand-green-700 dark:border-brand-green-800 dark:bg-transparent dark:text-brand-green-300">
												{visibleApproved.length} learner{visibleApproved.length === 1 ? '' : 's'} · {money(approvedSummary.final_amount)}
											</Badge>
											<Button
												variant="outline"
												size="sm"
												className="h-8 text-xs gap-1.5 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-900/30"
												onClick={() => { setUnapproveReason(''); setUnapproveOpen(true) }}
												disabled={selectedApprovedRows.length === 0 || unapproving}
											>
												{unapproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
												Unapprove{selectedApprovedRows.length > 0 ? ` (${selectedApprovedRows.length})` : ''}
											</Button>
											<Button size="sm" className={cn('h-8 text-xs gap-1.5', PRIMARY_BUTTON_CLASS)} onClick={handleDownloadPdf} disabled={visibleApproved.length === 0 || exporting !== null}>
												{exporting === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} PDF
											</Button>
										</div>
									</CardHeader>
									<CardContent className="p-0">
										<div className="overflow-x-auto">
											<Table>
												<TableHeader className={TABLE_HEADER_CLASS}>
													<TableRow className="hover:bg-transparent">
														<TableHead className="w-10 text-center">
															<Checkbox
																checked={approvedHeaderChecked}
																onCheckedChange={(v) => toggleApprovedAllVisible(v === true)}
																disabled={visibleApproved.length === 0}
																aria-label="Select all approved learners"
															/>
														</TableHead>
														<TableHead className="w-12 text-center">S.No</TableHead>
														<TableHead>Register Number</TableHead>
														<TableHead>Learner Name</TableHead>
														<TableHead>Program</TableHead>
														<TableHead className="text-center">Sem</TableHead>
														<TableHead className="text-center">Subjects</TableHead>
														<TableHead className="text-right">Exam Fee</TableHead>
														<TableHead className="text-right">Application Fee</TableHead>
														<TableHead className="text-right">Mark Statement Fee</TableHead>
														<TableHead className="text-right">Late Fine</TableHead>
														<TableHead className="text-right">Concession Given</TableHead>
														<TableHead className="text-right">Final Amount</TableHead>
														<TableHead className="text-center">Mode</TableHead>
														<TableHead>Transaction ID</TableHead>
														<TableHead>Approved On</TableHead>
														<TableHead className="text-center">Status</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{!ready ? (
														<TableRow>
															<TableCell colSpan={APPROVED_COLUMNS} className="text-center py-10 text-sm text-muted-foreground">
																Select an institution and an exam session to list approved registrations.
															</TableCell>
														</TableRow>
													) : listLoading ? (
														<TableRow>
															<TableCell colSpan={APPROVED_COLUMNS} className="text-center py-10 text-sm text-muted-foreground">
																<Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading approved registrations…
															</TableCell>
														</TableRow>
													) : approvedPageRows.length === 0 ? (
														<TableRow>
															<TableCell colSpan={APPROVED_COLUMNS} className="text-center py-10 text-sm text-muted-foreground">
																No registration has been given final approval for the selected filters.
															</TableCell>
														</TableRow>
													) : (
														approvedPageRows.map((r, idx) => (
															<TableRow key={r.id} className={cn(
																'transition-colors',
																selectedApproved.has(r.id)
																	? 'bg-red-50/70 hover:bg-red-50 shadow-[inset_3px_0_0_0_#dc2626] dark:bg-red-900/15 dark:hover:bg-red-900/25'
																	: 'hover:bg-brand-cream-200/70 dark:hover:bg-gray-800/60'
															)}>
																<TableCell className="text-center">
																	<Checkbox
																		checked={selectedApproved.has(r.id)}
																		onCheckedChange={(v) => toggleApprovedOne(r.id, v === true)}
																		aria-label={`Select ${r.stu_register_no}`}
																	/>
																</TableCell>
																<TableCell className="text-center text-xs">{(approvedCurrentPage - 1) * PAGE_SIZE + idx + 1}</TableCell>
																<TableCell className="text-xs font-semibold whitespace-nowrap text-brand-green-800 dark:text-brand-green-200">{r.stu_register_no}</TableCell>
																<TableCell className="text-xs">{r.student_name || '—'}</TableCell>
																<TableCell className="text-xs">
																	<div>{r.program_code || '—'}</div>
																	{r.regulation_code && <div className="text-[10px] text-muted-foreground">Reg. {r.regulation_code}</div>}
																</TableCell>
																<TableCell className="text-center text-xs">{romanSemester(r.learner_semester)}</TableCell>
																<TableCell className="text-center text-xs tabular-nums">{r.total_subjects}</TableCell>
																<TableCell className="text-right text-xs tabular-nums">{money(r.exam_fee)}</TableCell>
																<TableCell className="text-right text-xs tabular-nums">{money(r.application_fee)}</TableCell>
																<TableCell className="text-right text-xs tabular-nums">{money(r.mark_statement_fee)}</TableCell>
																<TableCell className="text-right text-xs tabular-nums">{money(r.late_fine)}</TableCell>
																<TableCell className="text-right text-xs tabular-nums">{r.concession_amount > 0 ? money(r.concession_amount) : '—'}</TableCell>
																<TableCell className="text-right text-xs font-bold tabular-nums text-brand-green-800 dark:text-brand-green-200">{money(r.final_amount)}</TableCell>
																<TableCell className="text-center text-xs">{r.payment_mode || '—'}</TableCell>
																<TableCell className="text-xs whitespace-nowrap">{r.payment_transaction_id || '—'}</TableCell>
																<TableCell className="text-xs whitespace-nowrap">{approvedOn(r.approved_at)}</TableCell>
																<TableCell className="text-center">
																	<Badge variant="outline" className="text-[10px] whitespace-nowrap border-brand-green-200 bg-brand-green-50 text-brand-green-700 dark:border-brand-green-800 dark:bg-brand-green-900/30 dark:text-brand-green-300">Paid</Badge>
																</TableCell>
															</TableRow>
														))
													)}
												</TableBody>
											</Table>
										</div>
										<Pager page={approvedCurrentPage} totalPages={approvedTotalPages} total={visibleApproved.length} onPage={setApprovedPage} />
									</CardContent>
								</Card>
							</TabsContent>

							{/* ── Report ── */}
							<TabsContent value="report" className="mt-0">
								<Card className="border-brand-green-100 dark:border-brand-green-900/60 overflow-hidden">
									<CardHeader className="py-3 px-4 border-b border-brand-green-100 bg-brand-cream-100 dark:border-brand-green-900/60 dark:bg-gray-900">
										<CardTitle className="text-sm font-heading text-brand-green-800 dark:text-brand-green-200">Final Registration Approval Report</CardTitle>
										<p className="text-xs text-muted-foreground">
											Student-wise approved registrations with subject count, fee heads and totals - the same report as Reports › Exam Registration Reports. It covers the learners left by the filters above.
										</p>
									</CardHeader>
									<CardContent className="p-4">
										{listLoading ? (
											<p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading approved registrations…</p>
										) : visibleApproved.length === 0 ? (
											<p className="py-8 text-center text-sm text-muted-foreground">
												{ready ? 'No registration has been given final approval for the selected filters.' : 'Select an institution and an exam session.'}
											</p>
										) : (
											<div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
												<FeeBreakdown totals={approvedSummary} learnersLabel="Approved Learners" headsAreNet />
												<div className="space-y-4">
													<div className="rounded-md border border-brand-green-100 dark:border-brand-green-900/60 overflow-hidden">
														<Table>
															<TableHeader className={TABLE_HEADER_CLASS}>
																<TableRow className="hover:bg-transparent">
																	<TableHead>Mode of Payment</TableHead>
																	<TableHead className="text-right">Learners</TableHead>
																	<TableHead className="text-right">Amount</TableHead>
																</TableRow>
															</TableHeader>
															<TableBody>
																{paymentModeSplit.map(row => (
																	<TableRow key={row.mode}>
																		<TableCell className="text-xs">{row.mode}</TableCell>
																		<TableCell className="text-right text-xs tabular-nums">{row.learners}</TableCell>
																		<TableCell className="text-right text-xs tabular-nums">{money(row.amount)}</TableCell>
																	</TableRow>
																))}
																<TableRow className="font-semibold hover:bg-transparent">
																	<TableCell className="text-xs">Total</TableCell>
																	<TableCell className="text-right text-xs tabular-nums">{approvedSummary.learners}</TableCell>
																	<TableCell className="text-right text-xs tabular-nums">{money(approvedSummary.final_amount)}</TableCell>
																</TableRow>
															</TableBody>
														</Table>
													</div>
													<div className="flex items-center gap-2 flex-wrap">
														<Button className={cn('h-9 text-xs gap-1.5', PRIMARY_BUTTON_CLASS)} onClick={handleDownloadPdf} disabled={exporting !== null}>
															{exporting === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} Download PDF
														</Button>
														<Button variant="outline" className={cn('h-9 text-xs gap-1.5', OUTLINE_BUTTON_CLASS)} onClick={handleDownloadExcel} disabled={exporting !== null}>
															{exporting === 'excel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />} Download Excel
														</Button>
													</div>
												</div>
											</div>
										)}
									</CardContent>
								</Card>
							</TabsContent>
						</Tabs>
					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>

			{/* Unapprove - learners approved by mistake go back to Pending */}
			<Dialog open={unapproveOpen} onOpenChange={open => { if (!unapproving) setUnapproveOpen(open) }}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Unapprove Final Registration</DialogTitle>
						<DialogDescription>
							The selected learners go back to the Pending tab as unpaid. Every subject they were approved for returns to Applied, and the payment details recorded at approval are cleared.
						</DialogDescription>
					</DialogHeader>

					<FeeBreakdown totals={unapproveSelection} headsAreNet />

					<div className="max-h-28 overflow-y-auto rounded-md border px-3 py-2 text-xs space-y-0.5">
						{selectedApprovedRows.map(r => (
							<div key={r.id} className="flex justify-between gap-2">
								<span className="truncate"><span className="font-medium">{r.stu_register_no}</span> — {r.student_name || '—'}</span>
								<span className="shrink-0 tabular-nums text-muted-foreground">{money(r.final_amount)}{r.payment_mode ? ` · ${r.payment_mode}` : ''}</span>
							</div>
						))}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="unapprove-reason" className="text-xs">Reason *</Label>
						<Textarea
							id="unapprove-reason"
							value={unapproveReason}
							onChange={e => setUnapproveReason(e.target.value)}
							placeholder="Why is this approval being undone? (kept in the log)"
							maxLength={1000}
							rows={3}
							className="text-sm"
						/>
						<p className="text-[11px] text-muted-foreground">The undone approval, its amount and this reason are kept in the approval log. Any money already collected must be settled outside the system.</p>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setUnapproveOpen(false)} disabled={unapproving}>Cancel</Button>
						<Button variant="destructive" onClick={handleConfirmUnapprove} disabled={unapproving || !unapproveReason.trim() || selectedApprovedRows.length === 0}>
							{unapproving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Unapproving…</> : `Unapprove ${selectedApprovedRows.length} learner${selectedApprovedRows.length === 1 ? '' : 's'}`}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Step 1 - the summary again, plus how the fee was paid */}
			<Dialog open={confirmStep === 1} onOpenChange={open => { if (!open) setConfirmStep(0) }}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Confirm Final Registration Approval</DialogTitle>
						<DialogDescription>Check the amount to collect and record how it is paid.</DialogDescription>
					</DialogHeader>

					<FeeBreakdown totals={selection} />

					<div className="space-y-2">
						<Label className="text-xs">Mode of Payment *</Label>
						<RadioGroup
							value={paymentMode}
							onValueChange={v => setPaymentMode(v as FinalApprovalPaymentMode)}
							className="grid grid-cols-2 gap-2"
						>
							{FINAL_APPROVAL_PAYMENT_MODES.map(mode => (
								<Label
									key={mode}
									htmlFor={`payment-mode-${mode}`}
									className={cn(
										'flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors',
										paymentMode === mode
											? 'border-brand-green bg-brand-green-50 text-brand-green-800 dark:bg-brand-green-900/30 dark:text-brand-green-200'
											: 'hover:bg-muted/60'
									)}
								>
									<RadioGroupItem id={`payment-mode-${mode}`} value={mode} />
									{mode}
								</Label>
							))}
						</RadioGroup>
					</div>

					{paymentMode === 'Online' && (
						<div className="space-y-1.5">
							<Label htmlFor="payment-transaction-id" className="text-xs">Payment Transaction ID *</Label>
							<Input
								id="payment-transaction-id"
								value={transactionId}
								onChange={e => setTransactionId(e.target.value)}
								placeholder="UPI / bank reference number"
								maxLength={255}
								className="h-9 text-sm"
								autoFocus
							/>
							{selection.learners > 1 && (
								<p className="text-[11px] text-muted-foreground">
									This transaction id is recorded against all {selection.learners} selected learners. Approve learners who paid separately one at a time.
								</p>
							)}
						</div>
					)}

					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmStep(0)}>Cancel</Button>
						<Button className={PRIMARY_BUTTON_CLASS} onClick={() => setConfirmStep(2)} disabled={!canContinue}>Continue</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Step 2 - confirm again */}
			<AlertDialog open={confirmStep === 2} onOpenChange={open => { if (!open) setConfirmStep(step => (step === 2 ? 0 : step)) }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you sure?</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-2">
								<p>
									You are about to approve <strong>{selection.learners} learner{selection.learners === 1 ? '' : 's'}</strong> with{' '}
									<strong>{selection.subjects} subject registration{selection.subjects === 1 ? '' : 's'}</strong> and record{' '}
									<strong>{money(selection.final_amount)}</strong> as paid by <strong>{paymentMode}</strong>
									{paymentMode === 'Online' && <> (transaction id <strong>{transactionId.trim()}</strong>)</>}.
								</p>
								{selection.concession > 0 && (
									<p>
										A fee concession of <strong>{money(selection.concession)}</strong> is taken off for{' '}
										<strong>{selectedLearners.filter(l => l.concession_amount > 0).length}</strong> learner(s); their subject registrations are updated to the reduced fee.
									</p>
								)}
								{selection.late_fine > 0 && (
									<p>
										This includes a late fine of <strong>{money(selection.late_fine)}</strong> entered for{' '}
										<strong>{selectedLearners.filter(l => l.late_fine > 0).length}</strong> learner(s).
									</p>
								)}
								<p>All related subject registrations will be marked as paid and approved. This cannot be undone from this screen. The approval report downloads as soon as it completes.</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => setConfirmStep(1)}>Back</AlertDialogCancel>
						<AlertDialogAction className={PRIMARY_BUTTON_CLASS} onClick={handleConfirmApprove}>Confirm Approval</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
