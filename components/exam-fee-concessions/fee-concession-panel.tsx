'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/common/use-toast'
import { cn } from '@/lib/utils'
import {
	AlertTriangle,
	ChevronLeft,
	ChevronRight,
	FileText,
	HeartHandshake,
	IndianRupee,
	Loader2,
	Paperclip,
	Save,
	Search,
	Trash2,
	UserPlus,
	X,
	Users,
} from 'lucide-react'
import { EXAM_FEE_CONCESSION_TYPES } from '@/types/exam-fee-concessions'
import type {
	ExamFeeConcession,
	ExamFeeConcessionLearner,
	ExamFeeConcessionListResponse,
	ExamFeeConcessionSaveResult,
} from '@/types/exam-fee-concessions'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const PAGE_SIZE = 50
/** Learners listed at once in the Add Learners search */
const ADD_RESULT_LIMIT = 50
const LETTER_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp'
const LETTER_MAX_BYTES = 5 * 1024 * 1024

const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const money = (value: number | null | undefined) => value == null ? '—' : `₹${rupees.format(value)}`
const romanSemester = (value: number | null | undefined) =>
	value == null || value === 0 ? '—' : (ROMAN[value] || String(value))
const round2 = (value: number) => Math.round(value * 100) / 100
const shortDate = (value: string | null) =>
	value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

type Head = 'exam' | 'application' | 'markStatement'
/** Raw text typed in the three waiver boxes of one learner */
type WaiverInput = Partial<Record<Head, string>>

/** Parse JSON only when the response is JSON - a dev recompile can return HTML */
async function parseJsonResponse(res: Response): Promise<any> {
	const contentType = res.headers.get('content-type') || ''
	if (!contentType.includes('application/json')) {
		const text = await res.text().catch(() => '')
		throw new Error(`Expected JSON but received ${contentType || 'unknown'} (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`)
	}
	return res.json()
}

/** Typed waiver -> amount, never above the actual head; blank / invalid = 0 */
function parseWaiver(raw: string | undefined, actual: number): number {
	const n = Number(raw)
	if (!raw || !Number.isFinite(n) || n <= 0) return 0
	return Math.min(actual, round2(n))
}

const savedWaiverOf = (c: ExamFeeConcession | null, head: Head): number =>
	!c ? 0 : head === 'exam' ? c.exam_fee_waiver : head === 'application' ? c.application_fee_waiver : c.mark_statement_fee_waiver

const TABLE_HEADER_CLASS = 'bg-brand-green-50/70 dark:bg-brand-green-900/20 [&_th]:text-brand-green-800 dark:[&_th]:text-brand-green-200 [&_th]:font-semibold'
const OUTLINE_BUTTON_CLASS = 'border-brand-green-200 text-brand-green-700 hover:bg-brand-green-50 hover:text-brand-green-800 dark:border-brand-green-800 dark:text-brand-green-300 dark:hover:bg-brand-green-900/30'
const PRIMARY_BUTTON_CLASS = 'bg-brand-green hover:bg-brand-green-600 text-white dark:bg-brand-green-400 dark:hover:bg-brand-green-500 dark:text-gray-900'

/** One learner with the waiver currently typed (or saved) on each head */
interface LearnerRow {
	learner: ExamFeeConcessionLearner
	exam: number
	application: number
	markStatement: number
	total: number
	actual: number
	/** Differs from what is saved and carries an amount - will be written on Save */
	dirty: boolean
	locked: boolean
}

/** The facts the Final Approval page's filters look at */
export interface FeeConcessionFilterFacts {
	regulation_code: string | null
	program_code: string | null
	program_name: string | null
	semester: number | null
	batch_year: number
}

interface FeeConcessionPanelProps {
	institutionsId: string
	sessionId: string
	/** Regulation / Program / Batch / Semester filters of the host page */
	matchesFilters: (facts: FeeConcessionFilterFacts) => boolean
	/** Register number / name search of the host page */
	search: string
	/** Bumped by the host (Refresh, approve, unapprove) to reload the panel */
	refreshKey: number
	/** A concession was saved or removed - the pending list's amounts changed */
	onChanged: () => void
}

/**
 * Fee Concession tab of Final Exam Registration Approval: record the fee waived
 * for a learner from the concession approval letter. The approval then collects
 * the actual fee less this concession.
 */
export function FeeConcessionPanel({ institutionsId, sessionId, matchesFilters, search, refreshKey, onChanged }: FeeConcessionPanelProps) {
	const { toast } = useToast()

	// ── Data ──
	const [data, setData] = useState<ExamFeeConcessionListResponse | null>(null)
	const [loading, setLoading] = useState(false)
	const [tab, setTab] = useState<'learners' | 'concessions'>('learners')
	// Learners picked through "Add Learners" - the working list for this letter
	const [added, setAdded] = useState<Set<string>>(new Set())
	const [addOpen, setAddOpen] = useState(false)
	const [addSearch, setAddSearch] = useState('')
	const [addPicked, setAddPicked] = useState<Set<string>>(new Set())
	const [page, setPage] = useState(1)
	const [inputs, setInputs] = useState<Record<string, WaiverInput>>({})

	// ── Save dialog ──
	const [saveOpen, setSaveOpen] = useState(false)
	const [concessionType, setConcessionType] = useState<string>(EXAM_FEE_CONCESSION_TYPES[0])
	const [letterRefNo, setLetterRefNo] = useState('')
	const [letterDate, setLetterDate] = useState('')
	const [remarks, setRemarks] = useState('')
	const [letterFile, setLetterFile] = useState<File | null>(null)
	const [saving, setSaving] = useState(false)

	const [deleteTarget, setDeleteTarget] = useState<ExamFeeConcession | null>(null)
	const [deleting, setDeleting] = useState(false)
	const [openingLetter, setOpeningLetter] = useState<string | null>(null)

	const fetchData = useCallback(async () => {
		if (!institutionsId || !sessionId) {
			setData(null)
			return
		}
		try {
			setLoading(true)
			const params = new URLSearchParams({ institutions_id: institutionsId, examination_session_id: sessionId })
			const res = await fetch(`/api/exam-management/exam-fee-concessions?${params.toString()}`)
			const json = await parseJsonResponse(res)
			if (!res.ok) throw new Error(json?.error || 'Failed to load fee concessions')
			setData(json as ExamFeeConcessionListResponse)
			setInputs({})
			setAdded(new Set())
		} catch (error) {
			console.error('Exam fee concessions error:', error)
			setData(null)
			toast({
				title: 'Could not load fee concessions',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}, [institutionsId, sessionId, toast])

	useEffect(() => {
		fetchData()
	}, [fetchData, refreshKey])

	useEffect(() => { setPage(1) }, [search, tab])

	// ── Rows: the typed value wins, otherwise the saved concession ──
	const rows = useMemo<LearnerRow[]>(() => (data?.learners ?? []).map(learner => {
		const typed = inputs[learner.key] || {}
		const valueOf = (head: Head, actual: number) =>
			typed[head] !== undefined ? parseWaiver(typed[head], actual) : Math.min(actual, savedWaiverOf(learner.concession, head))

		const exam = valueOf('exam', learner.exam_fee)
		const application = valueOf('application', learner.application_fee)
		const markStatement = valueOf('markStatement', learner.mark_statement_fee)
		const total = round2(exam + application + markStatement)
		const changed =
			exam !== savedWaiverOf(learner.concession, 'exam')
			|| application !== savedWaiverOf(learner.concession, 'application')
			|| markStatement !== savedWaiverOf(learner.concession, 'markStatement')

		return {
			learner,
			exam,
			application,
			markStatement,
			total,
			actual: round2(learner.exam_fee + learner.application_fee + learner.mark_statement_fee),
			dirty: changed && total > 0,
			locked: learner.concession?.status === 'Applied',
		}
	}), [data, inputs])

	const searchQuery = search.trim().toUpperCase()
	// The working list: learners added for this letter, plus those whose recorded
	// concession is still open to change. Newly added learners stay on top.
	const visible = useMemo(() => rows
		.filter(r => added.has(r.learner.key) || !!r.learner.concession)
		.filter(r => !searchQuery || r.learner.register_number.toUpperCase().includes(searchQuery) || r.learner.student_name.toUpperCase().includes(searchQuery))
		.sort((a, b) => Number(!!a.learner.concession) - Number(!!b.learner.concession) || a.learner.register_number.localeCompare(b.learner.register_number)),
	[rows, added, searchQuery])

	// ── Add Learners search: applied learners not on the list yet ──
	const addQuery = addSearch.trim().toUpperCase()
	const addCandidates = useMemo(() => rows.filter(r =>
		!added.has(r.learner.key)
		&& !r.learner.concession
		&& matchesFilters(r.learner)
		&& (!addQuery || r.learner.register_number.toUpperCase().includes(addQuery) || r.learner.student_name.toUpperCase().includes(addQuery))
	), [rows, added, matchesFilters, addQuery])
	const addShown = useMemo(() => addCandidates.slice(0, ADD_RESULT_LIMIT), [addCandidates])

	const openAdd = useCallback(() => {
		setAddSearch('')
		setAddPicked(new Set())
		setAddOpen(true)
	}, [])

	const togglePicked = useCallback((key: string, checked: boolean) => {
		setAddPicked(prev => {
			const next = new Set(prev)
			if (checked) next.add(key)
			else next.delete(key)
			return next
		})
	}, [])

	const confirmAdd = useCallback(() => {
		setAdded(prev => new Set([...prev, ...addPicked]))
		setAddOpen(false)
	}, [addPicked])

	const removeAdded = useCallback((key: string) => {
		setAdded(prev => {
			const next = new Set(prev)
			next.delete(key)
			return next
		})
		setInputs(prev => {
			const next = { ...prev }
			delete next[key]
			return next
		})
	}, [])

	const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
	const currentPage = Math.min(page, totalPages)
	const pageRows = useMemo(() => visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [visible, currentPage])

	// Every learner with an unsaved amount is saved together, against one letter
	const dirtyRows = useMemo(
		() => rows.filter(r => r.dirty && !r.locked && (added.has(r.learner.key) || !!r.learner.concession)),
		[rows, added]
	)
	// Added but no amount typed yet
	const pendingAmountCount = useMemo(() => rows.filter(r => added.has(r.learner.key) && r.total <= 0).length, [rows, added])
	const dirtyTotal = useMemo(() => round2(dirtyRows.reduce((sum, r) => sum + r.total, 0)), [dirtyRows])
	const letterRequired = useMemo(() => dirtyRows.some(r => !r.learner.concession?.letter_file_path), [dirtyRows])

	const concessions = data?.concessions ?? []
	const visibleConcessions = useMemo(() => concessions.filter(c =>
		(!searchQuery || c.stu_register_no.toUpperCase().includes(searchQuery) || String(c.student_name || '').toUpperCase().includes(searchQuery))
	), [concessions, searchQuery])
	const concessionTotal = useMemo(
		() => round2(concessions.reduce((sum, c) => sum + c.exam_fee_waiver + c.application_fee_waiver + c.mark_statement_fee_waiver, 0)),
		[concessions]
	)
	const appliedCount = useMemo(() => concessions.filter(c => c.status === 'Applied').length, [concessions])

	const setWaiver = useCallback((key: string, head: Head, value: string) => {
		setInputs(prev => ({ ...prev, [key]: { ...prev[key], [head]: value } }))
	}, [])

	const waiveFull = useCallback((l: ExamFeeConcessionLearner) => {
		setInputs(prev => ({
			...prev,
			[l.key]: { exam: String(l.exam_fee), application: String(l.application_fee), markStatement: String(l.mark_statement_fee) },
		}))
	}, [])

	const openSave = useCallback(() => {
		// A single concession being changed starts from its own letter details
		const only = dirtyRows.length === 1 ? dirtyRows[0].learner.concession : null
		setConcessionType(only?.concession_type || EXAM_FEE_CONCESSION_TYPES[0])
		setLetterRefNo(only?.letter_ref_no || '')
		setLetterDate(only?.letter_date || '')
		setRemarks(only?.remarks || '')
		setLetterFile(null)
		setSaveOpen(true)
	}, [dirtyRows])

	const handleFile = useCallback((file: File | null) => {
		if (file && file.size > LETTER_MAX_BYTES) {
			toast({ title: 'File too large', description: 'The approval letter must be 5 MB or smaller.', variant: 'destructive' })
			return
		}
		setLetterFile(file)
	}, [toast])

	const canSave = dirtyRows.length > 0 && !!letterRefNo.trim() && (!letterRequired || !!letterFile) && !saving

	const handleSave = useCallback(async () => {
		if (dirtyRows.length === 0) return
		try {
			setSaving(true)
			const form = new FormData()
			form.set('institutions_id', institutionsId)
			form.set('examination_session_id', sessionId)
			form.set('concession_type', concessionType)
			form.set('letter_ref_no', letterRefNo.trim())
			form.set('letter_date', letterDate)
			form.set('remarks', remarks.trim())
			form.set('entries', JSON.stringify(dirtyRows.map(r => ({
				student_id: r.learner.student_id,
				register_number: r.learner.register_number,
				exam_fee_waiver: r.exam,
				application_fee_waiver: r.application,
				mark_statement_fee_waiver: r.markStatement,
			}))))
			if (letterFile) form.set('letter', letterFile)

			const res = await fetch('/api/exam-management/exam-fee-concessions', { method: 'POST', body: form })
			const json = await parseJsonResponse(res)
			if (!res.ok) throw new Error(json?.error || 'Could not save the fee concession')

			const result = json as ExamFeeConcessionSaveResult
			setSaveOpen(false)
			toast({
				title: 'Fee concession saved',
				description: `${result.message}${result.skipped.length > 0 ? ` ${result.skipped.length} skipped: ${result.skipped.slice(0, 3).map(s => `${s.register_number} (${s.reason})`).join('; ')}` : ''} It is taken off the fee at Final Registration Approval.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			await fetchData()
			onChanged()
		} catch (error) {
			console.error('Exam fee concession save error:', error)
			toast({
				title: 'Could not save the fee concession',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}, [dirtyRows, institutionsId, sessionId, concessionType, letterRefNo, letterDate, remarks, letterFile, fetchData, onChanged, toast])

	const handleDelete = useCallback(async () => {
		if (!deleteTarget) return
		try {
			setDeleting(true)
			const res = await fetch(`/api/exam-management/exam-fee-concessions?id=${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' })
			const json = await parseJsonResponse(res)
			if (!res.ok) throw new Error(json?.error || 'Could not remove the concession')
			toast({
				title: 'Concession removed',
				description: `${deleteTarget.stu_register_no} will be charged the actual fee.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			setDeleteTarget(null)
			await fetchData()
			onChanged()
		} catch (error) {
			toast({
				title: 'Could not remove the concession',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setDeleting(false)
		}
	}, [deleteTarget, fetchData, onChanged, toast])

	const openLetter = useCallback(async (concession: ExamFeeConcession) => {
		try {
			setOpeningLetter(concession.id)
			const res = await fetch(`/api/exam-management/exam-fee-concessions/letter?id=${encodeURIComponent(concession.id)}`)
			const json = await parseJsonResponse(res)
			if (!res.ok) throw new Error(json?.error || 'Could not open the approval letter')
			window.open(json.url, '_blank', 'noopener,noreferrer')
		} catch (error) {
			toast({
				title: 'Could not open the approval letter',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setOpeningLetter(null)
		}
	}, [toast])

	const ready = !!institutionsId && !!sessionId
	const LEARNER_COLUMNS = 13
	const CONCESSION_COLUMNS = 12

	const waiverCell = (r: LearnerRow, head: Head, actual: number, value: number) => (
		<TableCell className="text-right align-top">
			<div className="text-xs tabular-nums">{money(actual)}</div>
			<Input
				type="number"
				inputMode="decimal"
				min={0}
				max={actual}
				step="1"
				value={inputs[r.learner.key]?.[head] ?? (value > 0 ? String(value) : '')}
				onChange={e => setWaiver(r.learner.key, head, e.target.value)}
				placeholder="0"
				disabled={r.locked || actual <= 0 || saving}
				aria-label={`Concession on ${head} fee for ${r.learner.register_number}`}
				className={cn(
					'mt-1 h-7 w-20 ml-auto px-2 text-right text-xs tabular-nums',
					value > 0 && 'border-brand-green-400 bg-brand-green-50 font-semibold dark:bg-brand-green-900/20'
				)}
			/>
		</TableCell>
	)

	return (
		<>
			<div className="flex flex-col gap-3">
						{/* Stats */}
						<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
							<Card className="border-brand-green-100 bg-white dark:border-brand-green-900/60 dark:bg-gray-900">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight font-heading text-brand-green-800 dark:text-brand-green-200">{data?.learners.length ?? 0}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Applied Learners</p>
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green-50 text-brand-green dark:bg-brand-green-900/40 dark:text-brand-green-300"><Users className="h-5 w-5" /></div>
								</CardContent>
							</Card>
							<Card className="border-brand-green-100 bg-white dark:border-brand-green-900/60 dark:bg-gray-900">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight font-heading text-brand-green-800 dark:text-brand-green-200">{concessions.length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Concessions ({appliedCount} applied)</p>
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green-50 text-brand-green dark:bg-brand-green-900/40 dark:text-brand-green-300"><HeartHandshake className="h-5 w-5" /></div>
								</CardContent>
							</Card>
							<Card className="border-0 bg-gradient-to-br from-brand-green-600 to-brand-green-800 text-white shadow-md">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight font-heading">{money(concessionTotal)}</p>
										<p className="text-xs font-medium text-brand-green-100 mt-0.5">Total Fee Waived</p>
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"><IndianRupee className="h-5 w-5" /></div>
								</CardContent>
							</Card>
							<Card className="border-brand-yellow-400 bg-brand-yellow-50 dark:border-brand-yellow-800 dark:bg-brand-yellow-900/20">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight font-heading text-brand-yellow-900 dark:text-brand-yellow-300">{dirtyRows.length}</p>
										<p className="text-xs font-medium text-brand-yellow-900/70 dark:text-brand-yellow-300/80 mt-0.5">Unsaved ({money(dirtyTotal)})</p>
									</div>
									<div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-yellow-500 text-brand-yellow-900"><Save className="h-5 w-5" /></div>
								</CardContent>
							</Card>
						</div>

						{data && !data.migration_ready && (
							<Alert variant="destructive">
								<AlertTriangle className="h-4 w-4" />
								<AlertTitle>Fee concessions are not set up yet</AlertTitle>
								<AlertDescription>
									Run <code className="text-xs">supabase/migrations/20260921_exam_fee_concessions.sql</code> in the Supabase SQL Editor. It creates the concession table and lets final approval take the concession off the fee.
								</AlertDescription>
							</Alert>
						)}

						<Tabs value={tab} onValueChange={v => setTab(v as 'learners' | 'concessions')} className="space-y-3">
							<TabsList className="h-9">
								<TabsTrigger value="learners" className="text-xs gap-1.5"><Users className="h-3.5 w-3.5" /> Enter Concession</TabsTrigger>
								<TabsTrigger value="concessions" className="text-xs gap-1.5">
									<FileText className="h-3.5 w-3.5" /> Recorded
									<Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] tabular-nums">{concessions.length}</Badge>
								</TabsTrigger>
							</TabsList>

							{/* ── Enter concession ── */}
							<TabsContent value="learners" className="mt-0">
								<Card className="border-brand-green-100 dark:border-brand-green-900/60 overflow-hidden">
									<CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-3 space-y-0 border-b border-brand-green-100 bg-brand-cream-100 dark:border-brand-green-900/60 dark:bg-gray-900 flex-wrap">
										<div>
											<CardTitle className="text-sm font-heading text-brand-green-800 dark:text-brand-green-200">Fee Concession Entry</CardTitle>
											<p className="text-[11px] text-muted-foreground mt-0.5">1. Add the learners named in the approval letter · 2. Type the amount waived under each fee · 3. Save and upload the letter.</p>
										</div>
										<div className="flex items-center gap-2">
											<Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1.5', OUTLINE_BUTTON_CLASS)} onClick={openAdd} disabled={loading || saving || !(data?.migration_ready ?? false)}>
												<UserPlus className="h-3.5 w-3.5" /> Add Learners
											</Button>
											{(dirtyRows.length > 0 || added.size > 0) && (
												<Button variant="outline" size="sm" className={cn('h-8 text-xs', OUTLINE_BUTTON_CLASS)} onClick={() => { setInputs({}); setAdded(new Set()) }} disabled={saving}>Discard</Button>
											)}
											<Button size="sm" className={cn('h-8 text-xs gap-1.5', PRIMARY_BUTTON_CLASS)} onClick={openSave} disabled={dirtyRows.length === 0 || saving || !(data?.migration_ready ?? false)}>
												<Save className="h-3.5 w-3.5" /> Save &amp; Upload Letter{dirtyRows.length > 0 ? ` (${dirtyRows.length})` : ''}
											</Button>
										</div>
									</CardHeader>
									<CardContent className="p-0">
										<div className="overflow-x-auto">
											<Table>
												<TableHeader className={TABLE_HEADER_CLASS}>
													<TableRow className="hover:bg-transparent">
														<TableHead className="w-12 text-center">S.No</TableHead>
														<TableHead>Register Number</TableHead>
														<TableHead>Learner Name</TableHead>
														<TableHead>Program</TableHead>
														<TableHead className="text-center">Sem</TableHead>
														<TableHead className="text-center">Total Subjects</TableHead>
														<TableHead className="text-right">Exam Fee<div className="text-[10px] font-normal text-muted-foreground">actual / waive</div></TableHead>
														<TableHead className="text-right">Application Fee<div className="text-[10px] font-normal text-muted-foreground">actual / waive</div></TableHead>
														<TableHead className="text-right">Mark Statement Fee<div className="text-[10px] font-normal text-muted-foreground">actual / waive</div></TableHead>
														<TableHead className="text-right">Concession</TableHead>
														<TableHead className="text-right">Final Amount</TableHead>
														<TableHead className="text-center">Status</TableHead>
														<TableHead className="w-10" />
													</TableRow>
												</TableHeader>
												<TableBody>
													{!ready ? (
														<TableRow><TableCell colSpan={LEARNER_COLUMNS} className="text-center py-10 text-sm text-muted-foreground">Select an institution and an exam session.</TableCell></TableRow>
													) : loading ? (
														<TableRow><TableCell colSpan={LEARNER_COLUMNS} className="text-center py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading learners…</TableCell></TableRow>
													) : pageRows.length === 0 ? (
														<TableRow>
														<TableCell colSpan={LEARNER_COLUMNS} className="text-center py-10 text-sm text-muted-foreground">
															<p>No learner on the list yet.</p>
															<Button variant="outline" size="sm" className={cn('mt-3 h-8 text-xs gap-1.5', OUTLINE_BUTTON_CLASS)} onClick={openAdd} disabled={!(data?.migration_ready ?? false)}>
																<UserPlus className="h-3.5 w-3.5" /> Add Learners
															</Button>
															{(data?.learners.length ?? 0) === 0 && (
																<p className="mt-3 text-xs">No learner of this institution has applied for the session yet - a concession is entered against the applied fee.</p>
															)}
														</TableCell>
													</TableRow>
													) : pageRows.map((r, idx) => (
														<TableRow key={r.learner.key} className={cn(
															'transition-colors',
															r.dirty
																? 'bg-brand-yellow-50 hover:bg-brand-yellow-100/70 shadow-[inset_3px_0_0_0_#eab308] dark:bg-brand-yellow-900/15'
																: r.total > 0
																	? 'bg-brand-green-50/50 hover:bg-brand-green-50 dark:bg-brand-green-900/10'
																	: 'hover:bg-brand-cream-200/70 dark:hover:bg-gray-800/60'
														)}>
															<TableCell className="text-center text-xs align-top">{(currentPage - 1) * PAGE_SIZE + idx + 1}</TableCell>
															<TableCell className="text-xs font-semibold whitespace-nowrap text-brand-green-800 dark:text-brand-green-200 align-top">{r.learner.register_number}</TableCell>
															<TableCell className="text-xs align-top">{r.learner.student_name || '—'}</TableCell>
															<TableCell className="text-xs align-top">
																<div>{r.learner.program_code || '—'}</div>
																{r.learner.regulation_code && <div className="text-[10px] text-muted-foreground">Reg. {r.learner.regulation_code}</div>}
															</TableCell>
															<TableCell className="text-center text-xs align-top">{romanSemester(r.learner.semester)}</TableCell>
															<TableCell className="text-center text-xs tabular-nums align-top">{r.learner.total_subjects}</TableCell>
															{waiverCell(r, 'exam', r.learner.exam_fee, r.exam)}
															{waiverCell(r, 'application', r.learner.application_fee, r.application)}
															{waiverCell(r, 'markStatement', r.learner.mark_statement_fee, r.markStatement)}
															<TableCell className="text-right align-top">
																<div className={cn('text-xs tabular-nums', r.total > 0 && 'font-semibold text-brand-green-700 dark:text-brand-green-300')}>{r.total > 0 ? `− ${money(r.total)}` : '—'}</div>
																{!r.locked && (
																	<button type="button" onClick={() => waiveFull(r.learner)} className="mt-1 text-[10px] text-brand-green-700 underline-offset-2 hover:underline dark:text-brand-green-300">Waive full fee</button>
																)}
															</TableCell>
															<TableCell className="text-right text-xs font-bold tabular-nums text-brand-green-800 dark:text-brand-green-200 align-top">
																{money(round2(r.actual - r.total))}
																{r.total > 0 && <div className="text-[10px] font-normal text-muted-foreground line-through">{money(r.actual)}</div>}
															</TableCell>
															<TableCell className="text-center align-top">
																{r.dirty ? (
																	<Badge variant="outline" className="text-[10px] whitespace-nowrap border-brand-yellow-400 bg-brand-yellow-100 text-brand-yellow-900 dark:border-brand-yellow-700 dark:bg-brand-yellow-900/30 dark:text-brand-yellow-200">Unsaved</Badge>
																) : r.learner.concession ? (
																	<Badge variant="outline" className="text-[10px] whitespace-nowrap border-brand-green-200 bg-brand-green-50 text-brand-green-700 dark:border-brand-green-800 dark:bg-brand-green-900/30 dark:text-brand-green-300">{r.learner.concession.concession_type}</Badge>
																) : <span className="text-[10px] text-muted-foreground">Enter amount</span>}
															</TableCell>
															<TableCell className="text-center align-top">
																{added.has(r.learner.key) && !r.learner.concession && (
																	<Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => removeAdded(r.learner.key)} disabled={saving} aria-label={`Take ${r.learner.register_number} off the list`}>
																		<X className="h-3.5 w-3.5" />
																	</Button>
																)}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</div>
										{visible.length > PAGE_SIZE && (
											<div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
												<span>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visible.length)} of {visible.length}</span>
												<div className="flex items-center gap-1">
													<Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}><ChevronLeft className="h-3.5 w-3.5" /></Button>
													<span className="px-2">Page {currentPage} of {totalPages}</span>
													<Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}><ChevronRight className="h-3.5 w-3.5" /></Button>
												</div>
											</div>
										)}
									</CardContent>
								</Card>
							</TabsContent>

							{/* ── Recorded concessions ── */}
							<TabsContent value="concessions" className="mt-0">
								<Card className="border-brand-green-100 dark:border-brand-green-900/60 overflow-hidden">
									<CardHeader className="py-3 px-4 border-b border-brand-green-100 bg-brand-cream-100 dark:border-brand-green-900/60 dark:bg-gray-900">
										<CardTitle className="text-sm font-heading text-brand-green-800 dark:text-brand-green-200">Recorded Concessions</CardTitle>
									</CardHeader>
									<CardContent className="p-0">
										<div className="overflow-x-auto">
											<Table>
												<TableHeader className={TABLE_HEADER_CLASS}>
													<TableRow className="hover:bg-transparent">
														<TableHead className="w-12 text-center">S.No</TableHead>
														<TableHead>Register Number</TableHead>
														<TableHead>Learner Name</TableHead>
														<TableHead>Program</TableHead>
														<TableHead>Type</TableHead>
														<TableHead className="text-right">Exam Fee</TableHead>
														<TableHead className="text-right">Application Fee</TableHead>
														<TableHead className="text-right">Mark Statement Fee</TableHead>
														<TableHead className="text-right">Total Waived</TableHead>
														<TableHead>Approval Letter</TableHead>
														<TableHead className="text-center">Status</TableHead>
														<TableHead className="w-12" />
													</TableRow>
												</TableHeader>
												<TableBody>
													{loading ? (
														<TableRow><TableCell colSpan={CONCESSION_COLUMNS} className="text-center py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading concessions…</TableCell></TableRow>
													) : visibleConcessions.length === 0 ? (
														<TableRow><TableCell colSpan={CONCESSION_COLUMNS} className="text-center py-10 text-sm text-muted-foreground">No fee concession has been recorded for this session.</TableCell></TableRow>
													) : visibleConcessions.map((c, idx) => (
														<TableRow key={c.id} className="hover:bg-brand-cream-200/70 dark:hover:bg-gray-800/60">
															<TableCell className="text-center text-xs">{idx + 1}</TableCell>
															<TableCell className="text-xs font-semibold whitespace-nowrap text-brand-green-800 dark:text-brand-green-200">{c.stu_register_no}</TableCell>
															<TableCell className="text-xs">{c.student_name || '—'}</TableCell>
															<TableCell className="text-xs">{c.program_code || '—'}</TableCell>
															<TableCell className="text-xs">{c.concession_type}</TableCell>
															<TableCell className="text-right text-xs tabular-nums">{money(c.exam_fee_waiver)}</TableCell>
															<TableCell className="text-right text-xs tabular-nums">{money(c.application_fee_waiver)}</TableCell>
															<TableCell className="text-right text-xs tabular-nums">{money(c.mark_statement_fee_waiver)}</TableCell>
															<TableCell className="text-right text-xs font-bold tabular-nums text-brand-green-800 dark:text-brand-green-200">{money(round2(c.exam_fee_waiver + c.application_fee_waiver + c.mark_statement_fee_waiver))}</TableCell>
															<TableCell className="text-xs">
																<div className="whitespace-nowrap">{c.letter_ref_no || '—'}</div>
																<div className="text-[10px] text-muted-foreground">{shortDate(c.letter_date)}</div>
																{c.letter_file_path && (
																	<button type="button" onClick={() => openLetter(c)} disabled={openingLetter === c.id} className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-brand-green-700 hover:underline dark:text-brand-green-300">
																		{openingLetter === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />} View letter
																	</button>
																)}
															</TableCell>
															<TableCell className="text-center">
																<Badge variant="outline" className={cn('text-[10px] whitespace-nowrap', c.status === 'Applied'
																	? 'border-brand-green-200 bg-brand-green-50 text-brand-green-700 dark:border-brand-green-800 dark:bg-brand-green-900/30 dark:text-brand-green-300'
																	: 'border-brand-yellow-400 bg-brand-yellow-100 text-brand-yellow-900 dark:border-brand-yellow-700 dark:bg-brand-yellow-900/30 dark:text-brand-yellow-200')}>
																	{c.status === 'Applied' ? 'Applied' : 'Awaiting approval'}
																</Badge>
															</TableCell>
															<TableCell className="text-center">
																{c.status === 'Active' && (
																	<Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30" onClick={() => setDeleteTarget(c)} aria-label={`Remove concession of ${c.stu_register_no}`}>
																		<Trash2 className="h-3.5 w-3.5" />
																	</Button>
																)}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</div>
									</CardContent>
								</Card>
							</TabsContent>
						</Tabs>
			</div>

			{/* Add Learners - search the applied learners and put them on the list */}
			<Dialog open={addOpen} onOpenChange={setAddOpen}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Add Learners</DialogTitle>
						<DialogDescription>
							Search the learners who have applied for this session and tick the ones named in the approval letter. The Regulation / Program / Batch / Semester filters of the page apply here too.
						</DialogDescription>
					</DialogHeader>

					<div className="relative">
						<Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
						<Input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Register number or learner name" className="h-9 pl-8 text-sm" autoFocus />
					</div>

					<div className="max-h-80 overflow-y-auto rounded-md border">
						<Table>
							<TableHeader className={TABLE_HEADER_CLASS}>
								<TableRow className="hover:bg-transparent">
									<TableHead className="w-10" />
									<TableHead>Register Number</TableHead>
									<TableHead>Learner Name</TableHead>
									<TableHead>Program</TableHead>
									<TableHead className="text-center">Sem</TableHead>
									<TableHead className="text-right">Actual Fee</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{addShown.length === 0 ? (
									<TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
										{(data?.learners.length ?? 0) === 0 ? 'No learner has applied for this session yet.' : 'No matching learner.'}
									</TableCell></TableRow>
								) : addShown.map(r => {
									const picked = addPicked.has(r.learner.key)
									return (
										<TableRow key={r.learner.key} className={cn('cursor-pointer', picked && 'bg-brand-green-50 dark:bg-brand-green-900/20')} onClick={() => togglePicked(r.learner.key, !picked)}>
											<TableCell className="text-center" onClick={e => e.stopPropagation()}>
												<Checkbox checked={picked} onCheckedChange={v => togglePicked(r.learner.key, v === true)} aria-label={`Add ${r.learner.register_number}`} />
											</TableCell>
											<TableCell className="text-xs font-semibold whitespace-nowrap text-brand-green-800 dark:text-brand-green-200">{r.learner.register_number}</TableCell>
											<TableCell className="text-xs">{r.learner.student_name || '—'}</TableCell>
											<TableCell className="text-xs">{r.learner.program_code || '—'}</TableCell>
											<TableCell className="text-center text-xs">{romanSemester(r.learner.semester)}</TableCell>
											<TableCell className="text-right text-xs tabular-nums">{money(r.actual)}</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					</div>
					{addCandidates.length > ADD_RESULT_LIMIT && (
						<p className="text-[11px] text-muted-foreground">Showing the first {ADD_RESULT_LIMIT} of {addCandidates.length} learners - type a register number or name to narrow the list.</p>
					)}

					<DialogFooter>
						<Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
						<Button className={PRIMARY_BUTTON_CLASS} onClick={confirmAdd} disabled={addPicked.size === 0}>
							Add{addPicked.size > 0 ? ` ${addPicked.size} learner${addPicked.size === 1 ? '' : 's'}` : ''}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Save - the approval letter the amounts were taken from */}
			<Dialog open={saveOpen} onOpenChange={open => { if (!saving) setSaveOpen(open) }}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Save Fee Concession &amp; Upload Approval Letter</DialogTitle>
						<DialogDescription>
							{dirtyRows.length} learner{dirtyRows.length === 1 ? '' : 's'} · {money(dirtyTotal)} waived. All of them are recorded against the approval letter below.
							{pendingAmountCount > 0 && ` ${pendingAmountCount} added learner${pendingAmountCount === 1 ? ' has' : 's have'} no amount yet and will not be saved.`}
						</DialogDescription>
					</DialogHeader>

					<div className="max-h-32 overflow-y-auto rounded-md border px-3 py-2 text-xs space-y-0.5">
						{dirtyRows.map(r => (
							<div key={r.learner.key} className="flex justify-between gap-2">
								<span className="truncate"><span className="font-medium">{r.learner.register_number}</span> — {r.learner.student_name || '—'}</span>
								<span className="shrink-0 tabular-nums text-muted-foreground">{money(r.actual)} − <span className="font-semibold text-brand-green-700 dark:text-brand-green-300">{money(r.total)}</span> = {money(round2(r.actual - r.total))}</span>
							</div>
						))}
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label className="text-xs">Concession Type *</Label>
							<Select value={concessionType} onValueChange={setConcessionType}>
								<SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
								<SelectContent>
									{EXAM_FEE_CONCESSION_TYPES.map(t => <SelectItem key={t} value={t} className="text-sm">{t}</SelectItem>)}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="letter-date" className="text-xs">Letter Date</Label>
							<Input id="letter-date" type="date" value={letterDate} onChange={e => setLetterDate(e.target.value)} className="h-9 text-sm" />
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="letter-ref" className="text-xs">Approval Letter Reference No. *</Label>
							<Input id="letter-ref" value={letterRefNo} onChange={e => setLetterRefNo(e.target.value)} placeholder="e.g. JKKN/COE/FC/2026/014" maxLength={100} className="h-9 text-sm" />
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="letter-file" className="text-xs">Approval Letter {letterRequired ? '*' : '(leave empty to keep the letter on file)'}</Label>
							<Input id="letter-file" type="file" accept={LETTER_ACCEPT} onChange={e => handleFile(e.target.files?.[0] ?? null)} className="h-9 text-xs file:text-xs" />
							<p className="text-[11px] text-muted-foreground">PDF or image, 5 MB at most.</p>
						</div>
						<div className="space-y-1.5 sm:col-span-2">
							<Label htmlFor="concession-remarks" className="text-xs">Remarks</Label>
							<Textarea id="concession-remarks" value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} maxLength={500} className="text-sm" />
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setSaveOpen(false)} disabled={saving}>Cancel</Button>
						<Button className={PRIMARY_BUTTON_CLASS} onClick={handleSave} disabled={!canSave}>
							{saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</> : 'Save Concession'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open && !deleting) setDeleteTarget(null) }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove this fee concession?</AlertDialogTitle>
						<AlertDialogDescription>
							{deleteTarget?.stu_register_no} — {deleteTarget?.student_name || ''} will be charged the actual fee at final approval. The attached approval letter is removed too, unless another learner shares it.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={e => { e.preventDefault(); handleDelete() }} disabled={deleting}>
							{deleting ? 'Removing…' : 'Remove'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
