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
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/common/use-toast'
import { cn } from '@/lib/utils'
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
	IndianRupee,
	Loader2,
	RotateCcw,
	Search,
	Users,
} from 'lucide-react'
import type {
	FinalApprovalCohortResponse,
	FinalApprovalLearner,
	FinalApprovalResult,
	FinalApprovalTotals,
} from '@/types/exam-registration-final-approval'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const PAGE_SIZE = 50

const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const money = (value: number | null | undefined) =>
	value == null ? '—' : `₹${rupees.format(value)}`
const romanSemester = (value: number | null | undefined) =>
	value == null || value === 0 ? '—' : (ROMAN[value] || String(value))

const EMPTY_TOTALS: FinalApprovalTotals = {
	learners: 0, subjects: 0, exam_fee: 0, application_fee: 0, mark_statement_fee: 0, late_fine: 0, final_amount: 0,
}

interface Filters {
	regulation: string
	/** Programme codes; empty = all programmes */
	programs: string[]
	semester: string
}
const NO_FILTERS: Filters = { regulation: 'all', programs: [], semester: 'all' }

/** Parse JSON only when the response is JSON - a dev recompile can return HTML */
async function parseJsonResponse(res: Response): Promise<any> {
	const contentType = res.headers.get('content-type') || ''
	if (!contentType.includes('application/json')) {
		const text = await res.text().catch(() => '')
		throw new Error(`Expected JSON but received ${contentType || 'unknown'} (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`)
	}
	return res.json()
}

function sumSelected(learners: FinalApprovalLearner[]): FinalApprovalTotals {
	const t = { ...EMPTY_TOTALS }
	for (const l of learners) {
		t.learners++
		t.subjects += l.total_subjects
		t.exam_fee += l.exam_fee
		t.application_fee += l.application_fee
		t.mark_statement_fee += l.mark_statement_fee
		t.late_fine += l.late_fine
		t.final_amount += l.final_amount
	}
	return t
}

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

	// ── Cohort ──
	const [cohort, setCohort] = useState<FinalApprovalCohortResponse | null>(null)
	const [loading, setLoading] = useState(false)
	const [filters, setFilters] = useState<Filters>(NO_FILTERS)
	const [programOpen, setProgramOpen] = useState(false)
	const [search, setSearch] = useState('')
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const [page, setPage] = useState(1)

	// ── Approval ──
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [approving, setApproving] = useState(false)
	const [lastResult, setLastResult] = useState<FinalApprovalResult | null>(null)

	const fetchCohort = useCallback(async (applied: Filters) => {
		if (!institutionsId || !sessionId) {
			setCohort(null)
			return
		}
		try {
			setLoading(true)
			const params = new URLSearchParams({
				institutions_id: institutionsId,
				examination_session_id: sessionId,
			})
			if (applied.programs.length > 0) params.set('program_codes', applied.programs.join(','))
			if (applied.regulation !== 'all') params.set('regulation_code', applied.regulation)
			if (applied.semester !== 'all') params.set('semester', applied.semester)

			const res = await fetch(`/api/exam-management/exam-registration-final-approval?${params.toString()}`)
			const json = await parseJsonResponse(res)
			if (!res.ok) throw new Error(json?.error || 'Failed to load pending approvals')

			setCohort(json as FinalApprovalCohortResponse)
			setSelected(new Set())
			setExpanded(new Set())
			setPage(1)
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

	// A new institution / session starts from a clean, unfiltered list so the
	// Regulation / Program / Semester options are known before the user filters.
	useEffect(() => {
		setFilters(NO_FILTERS)
		setSearch('')
		setLastResult(null)
		fetchCohort(NO_FILTERS)
	}, [fetchCohort])

	const programOptions = cohort?.filters.programs ?? []
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

	const handleSearch = useCallback(() => {
		setLastResult(null)
		fetchCohort(filters)
	}, [fetchCohort, filters])

	const handleReset = useCallback(() => {
		setFilters(NO_FILTERS)
		setSearch('')
		setLastResult(null)
		fetchCohort(NO_FILTERS)
	}, [fetchCohort])

	// ── Derived lists ──
	const learners = cohort?.data ?? []

	const visible = useMemo(() => {
		const q = search.trim().toUpperCase()
		if (!q) return learners
		return learners.filter(l =>
			l.register_number.toUpperCase().includes(q)
			|| l.student_name.toUpperCase().includes(q)
		)
	}, [learners, search])

	const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
	const currentPage = Math.min(page, totalPages)
	const pageRows = useMemo(
		() => visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
		[visible, currentPage]
	)

	const showLateFine = useMemo(() => learners.some(l => l.late_fine > 0), [learners])

	const selectedLearners = useMemo(() => learners.filter(l => selected.has(l.key)), [learners, selected])
	const selection = useMemo(() => sumSelected(selectedLearners), [selectedLearners])

	const visibleSelectedCount = useMemo(() => visible.filter(l => selected.has(l.key)).length, [visible, selected])
	const headerChecked: boolean | 'indeterminate' =
		visible.length > 0 && visibleSelectedCount === visible.length ? true
			: visibleSelectedCount > 0 ? 'indeterminate'
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

	// ── Approve ──
	const handleConfirmApprove = useCallback(async () => {
		setConfirmOpen(false)
		if (selectedLearners.length === 0) return
		try {
			setApproving(true)
			const res = await fetch('/api/exam-management/exam-registration-final-approval', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: institutionsId,
					examination_session_id: sessionId,
					learners: selectedLearners.map(l => ({ student_id: l.student_id, register_number: l.register_number })),
				}),
			})
			const json = await parseJsonResponse(res)
			if (!res.ok) throw new Error(json?.error || 'Final approval failed')

			const result = json as FinalApprovalResult
			setLastResult(result)
			toast({
				title: 'Final registration approval completed',
				description: `${result.students_approved} learner${result.students_approved === 1 ? '' : 's'} approved, ${result.subjects_updated} subject${result.subjects_updated === 1 ? '' : 's'} updated, ${money(result.totals.final_amount)}.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			// Approved learners leave the pending list
			await fetchCohort(filters)
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
	}, [selectedLearners, institutionsId, sessionId, fetchCohort, filters, toast])

	const summary = cohort?.summary ?? EMPTY_TOTALS
	const canApprove = selectedLearners.length > 0 && !approving && !loading && (cohort?.migration_ready ?? false)
	const lateFineColumns = showLateFine ? 1 : 0
	const columnCount = 12 + lateFineColumns

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
										Payment-approved exam applications awaiting final registration approval. Approving a learner approves every subject they applied for.
									</p>
								</div>
							</div>
							<Button asChild variant="outline" size="sm" className="h-8 text-xs border-brand-green-200 text-brand-green-700 hover:bg-brand-green-50 hover:text-brand-green-800 dark:border-brand-green-800 dark:text-brand-green-300 dark:hover:bg-brand-green-900/30">
								<Link href="/reports/exam-registration-reports">Registration Report</Link>
							</Button>
						</div>

						{/* Stats */}
						<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
							<Card className="border-brand-green-100 bg-white dark:border-brand-green-900/60 dark:bg-gray-900">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight font-heading text-brand-green-800 dark:text-brand-green-200">{summary.learners}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Pending Learners</p>
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green-50 text-brand-green dark:bg-brand-green-900/40 dark:text-brand-green-300">
										<Users className="h-5 w-5" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-brand-green-100 bg-white dark:border-brand-green-900/60 dark:bg-gray-900">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight font-heading text-brand-green-800 dark:text-brand-green-200">{summary.subjects}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Subject Registrations</p>
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green-50 text-brand-green dark:bg-brand-green-900/40 dark:text-brand-green-300">
										<ClipboardCheck className="h-5 w-5" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-0 bg-gradient-to-br from-brand-green-600 to-brand-green-800 text-white shadow-md">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight font-heading">{money(summary.final_amount)}</p>
										<p className="text-xs font-medium text-brand-green-100 mt-0.5">Pending Amount</p>
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white">
										<IndianRupee className="h-5 w-5" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-brand-yellow-400 bg-brand-yellow-50 dark:border-brand-yellow-800 dark:bg-brand-yellow-900/20">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight font-heading text-brand-yellow-900 dark:text-brand-yellow-300">{selection.learners} <span className="text-base font-medium text-brand-yellow-800/70 dark:text-brand-yellow-400/70">/ {learners.length}</span></p>
										<p className="text-xs font-medium text-brand-yellow-900/70 dark:text-brand-yellow-300/80 mt-0.5">Selected / Listed</p>
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-yellow-500 text-brand-yellow-900">
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
									Run <code className="text-xs">supabase/migrations/20260912_exam_registration_final_approval.sql</code> in the Supabase SQL Editor. It creates the learner-level fee table and the transactional approval function this page writes through.
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
									<div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 mt-1 text-sm">
										<span>Learners Approved : <strong>{lastResult.students_approved}</strong></span>
										<span>Subjects Updated : <strong>{lastResult.subjects_updated}</strong></span>
										<span>Total Amount : <strong>{money(lastResult.totals.final_amount)}</strong></span>
									</div>
									{lastResult.skipped.length > 0 && (
										<p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
											{lastResult.skipped.length} selected learner{lastResult.skipped.length === 1 ? ' was' : 's were'} skipped: {lastResult.skipped.slice(0, 5).map(s => s.register_number).join(', ')}{lastResult.skipped.length > 5 ? '…' : ''} — {lastResult.skipped[0].reason}
										</p>
									)}
								</AlertDescription>
							</Alert>
						)}

						{/* Filters */}
						<Card className="border-brand-green-100 dark:border-brand-green-900/60">
							<CardContent className="p-4">
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
										<Select value={filters.regulation} onValueChange={v => setFilters(f => ({ ...f, regulation: v }))} disabled={!cohort}>
											<SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All regulations" /></SelectTrigger>
											<SelectContent>
												<SelectItem value="all" className="text-xs">All Regulations</SelectItem>
												{(cohort?.filters.regulations ?? []).map(o => (
													<SelectItem key={o.value} value={o.value} className="text-xs">{o.label} ({o.count})</SelectItem>
												))}
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
													disabled={!cohort}
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
										<Label className="text-xs">Semester</Label>
										<Select value={filters.semester} onValueChange={v => setFilters(f => ({ ...f, semester: v }))} disabled={!cohort}>
											<SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All semesters" /></SelectTrigger>
											<SelectContent>
												<SelectItem value="all" className="text-xs">All Semesters</SelectItem>
												{(cohort?.filters.semesters ?? []).map(o => (
													<SelectItem key={o.value} value={o.value} className="text-xs">{o.label} ({o.count})</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>

								<div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
									<div className="relative w-full sm:w-72">
										<Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
										<Input
											value={search}
											onChange={e => { setSearch(e.target.value); setPage(1) }}
											placeholder="Search register number or name"
											className="h-9 pl-8 text-xs"
											disabled={!cohort}
										/>
									</div>
									<div className="flex items-center gap-2">
										<Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 border-brand-green-200 text-brand-green-700 hover:bg-brand-green-50 hover:text-brand-green-800 dark:border-brand-green-800 dark:text-brand-green-300 dark:hover:bg-brand-green-900/30" onClick={handleReset} disabled={loading || !institutionsId || !sessionId}>
											<RotateCcw className="h-3.5 w-3.5" /> Reset
										</Button>
										<Button size="sm" className="h-9 text-xs gap-1.5 bg-brand-green hover:bg-brand-green-600 text-white dark:bg-brand-green-400 dark:hover:bg-brand-green-500" onClick={handleSearch} disabled={loading || !institutionsId || !sessionId}>
											{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Search
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* List + summary */}
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
											<TableHeader className="bg-brand-green-50/70 dark:bg-brand-green-900/20 [&_th]:text-brand-green-800 dark:[&_th]:text-brand-green-200 [&_th]:font-semibold">
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
													{showLateFine && <TableHead className="text-right">Late Fine</TableHead>}
													<TableHead className="text-right">Final Amount</TableHead>
													<TableHead className="text-center">Status</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{!institutionsId || !sessionId ? (
													<TableRow>
														<TableCell colSpan={columnCount} className="text-center py-10 text-sm text-muted-foreground">
															Select an institution and an exam session to list learners awaiting final approval.
														</TableCell>
													</TableRow>
												) : loading ? (
													<TableRow>
														<TableCell colSpan={columnCount} className="text-center py-10 text-sm text-muted-foreground">
															<Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading pending approvals…
														</TableCell>
													</TableRow>
												) : pageRows.length === 0 ? (
													<TableRow>
														<TableCell colSpan={columnCount} className="text-center py-10 text-sm text-muted-foreground">
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
																	{showLateFine && <TableCell className="text-right text-xs tabular-nums">{money(l.late_fine)}</TableCell>}
																	<TableCell className="text-right text-xs font-bold tabular-nums text-brand-green-800 dark:text-brand-green-200">{money(l.final_amount)}</TableCell>
																	<TableCell className="text-center">
																		<Badge variant="outline" className="text-[10px] whitespace-nowrap border-brand-yellow-400 bg-brand-yellow-100 text-brand-yellow-900 dark:border-brand-yellow-700 dark:bg-brand-yellow-900/30 dark:text-brand-yellow-200">{l.status}</Badge>
																	</TableCell>
																</TableRow>
																{isExpanded && (
																	<TableRow className="bg-brand-cream-100 hover:bg-brand-cream-100 dark:bg-gray-900/60 dark:hover:bg-gray-900/60">
																		<TableCell colSpan={columnCount} className="py-2 px-6 border-l-[3px] border-l-brand-green-300 dark:border-l-brand-green-700">
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

									{visible.length > PAGE_SIZE && (
										<div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
											<span>
												Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visible.length)} of {visible.length}
											</span>
											<div className="flex items-center gap-1">
												<Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>
													<ChevronLeft className="h-3.5 w-3.5" />
												</Button>
												<span className="px-2">Page {currentPage} of {totalPages}</span>
												<Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
													<ChevronRight className="h-3.5 w-3.5" />
												</Button>
											</div>
										</div>
									)}
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
									<div className="grid grid-cols-2 gap-2">
										<div className="rounded-md bg-brand-green-50 px-3 py-2 dark:bg-brand-green-900/30">
											<p className="text-[11px] text-brand-green-700 dark:text-brand-green-300">Selected Learners</p>
											<p className="text-lg font-bold font-heading tabular-nums text-brand-green-800 dark:text-brand-green-100">{selection.learners}</p>
										</div>
										<div className="rounded-md bg-brand-yellow-50 px-3 py-2 dark:bg-brand-yellow-900/20">
											<p className="text-[11px] text-brand-yellow-900/80 dark:text-brand-yellow-300">Subject Registrations</p>
											<p className="text-lg font-bold font-heading tabular-nums text-brand-yellow-900 dark:text-brand-yellow-200">{selection.subjects}</p>
										</div>
									</div>
									<dl className="space-y-1.5 text-xs">
										<div className="flex justify-between"><dt className="text-muted-foreground">Exam Fee</dt><dd className="tabular-nums">{money(selection.exam_fee)}</dd></div>
										<div className="flex justify-between"><dt className="text-muted-foreground">Application Fee</dt><dd className="tabular-nums">{money(selection.application_fee)}</dd></div>
										<div className="flex justify-between"><dt className="text-muted-foreground">Mark Statement Fee</dt><dd className="tabular-nums">{money(selection.mark_statement_fee)}</dd></div>
										{selection.late_fine > 0 && (
											<div className="flex justify-between"><dt className="text-muted-foreground">Late Fine</dt><dd className="tabular-nums">{money(selection.late_fine)}</dd></div>
										)}
									</dl>
									<div className="flex items-center justify-between rounded-md border border-brand-green-200 bg-brand-green-50 px-3 py-2 dark:border-brand-green-800 dark:bg-brand-green-900/30">
										<span className="text-sm font-medium text-brand-green-800 dark:text-brand-green-200">Final Amount</span>
										<span className="text-base font-bold font-heading tabular-nums text-brand-green dark:text-brand-green-300">{money(selection.final_amount)}</span>
									</div>

									<Button className="w-full h-10 text-sm gap-1.5 bg-brand-green hover:bg-brand-green-600 text-white shadow-sm dark:bg-brand-green-400 dark:hover:bg-brand-green-500 dark:text-gray-900" onClick={() => setConfirmOpen(true)} disabled={!canApprove}>
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
					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Confirm Final Registration Approval</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-2">
								<p>
									You are about to approve <strong>{selection.learners} learner{selection.learners === 1 ? '' : 's'}</strong> with{' '}
									<strong>{selection.subjects} subject registration{selection.subjects === 1 ? '' : 's'}</strong> for a final amount of{' '}
									<strong>{money(selection.final_amount)}</strong>.
								</p>
								<p>Once approved, all related subject/paper registrations will be marked as paid and approved.</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction className="bg-brand-green hover:bg-brand-green-600 text-white dark:bg-brand-green-400 dark:hover:bg-brand-green-500 dark:text-gray-900" onClick={handleConfirmApprove}>Confirm Approval</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
