'use client'

// Step two of the flow: pick a GENERATED question paper, pick the examiner type,
// pick the examiner, set the availability period, confirm.
//
// The list shows every end-semester paper generated for the selected session,
// marking the ones already handed out, so what is left to assign is visible at a
// glance rather than something the CoE has to remember. A subject with no paper
// yet does not appear here at all — it is generated in the Generate Papers tab,
// where its format is chosen.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
	Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/common/use-toast'
import {
	Loader2, Search, RefreshCw, UserPlus, AlertTriangle, CheckCircle2, Info, Mail, CalendarClock,
	FileSpreadsheet, Upload, XCircle, FileCheck2, Users, Layers, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isoToIstLocal, formatIst, istLocalToIso } from '@/lib/qp-portal/ist'
import { pickQpFeeRates, computeClaim, formatRupees, type QpFeeRates } from '@/lib/qp-portal/fees'
import {
	QP_ASSIGNMENT_TYPE_LABELS, type QpExaminerKind, type QpAssignmentType,
} from '@/types/qp-examiner-assignment'
import {
	downloadBulkAssignTemplate, parseBulkAssignFile, validateBulkAssignRows,
	bulkItemToAssignPayload, BULK_ACTION_LABELS,
	type BulkValidationResult, type BulkAssignItem,
} from '@/lib/utils/qp-examiner-assignment/bulk-assign'
import {
	apiFetch, SearchableSelect, StatusBadge, KindBadge,
	type PaperRow, type ExaminerOpt, type SessionOpt, type BlockedExaminer,
} from './shared'

interface Props {
	institutionsId: string
	institutionCode: string
	session: SessionOpt | null
	onAssigned: () => void
}

/** A sensible default window: opens now, closes a fortnight from now at 5 pm IST. */
function defaultWindow(): { from: string; to: string } {
	const now = new Date()
	const to = new Date(now.getTime() + 14 * 86_400_000)
	// 17:00 IST on the closing day.
	const toIst = new Date(to.getTime() + 330 * 60_000)
	toIst.setUTCHours(17, 0, 0, 0)
	return {
		from: isoToIstLocal(now.toISOString()),
		to: isoToIstLocal(new Date(toIst.getTime() - 330 * 60_000).toISOString()),
	}
}

export function AssignTab({ institutionsId, institutionCode, session, onAssigned }: Props) {
	const { toast } = useToast()

	const [papers, setPapers] = useState<PaperRow[]>([])
	const [loading, setLoading] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)

	const [regulationFilter, setRegulationFilter] = useState('all')
	const [programFilter, setProgramFilter] = useState('all')
	const [semesterFilter, setSemesterFilter] = useState('all')
	const [departmentFilter, setDepartmentFilter] = useState('all')
	const [subjectFilter, setSubjectFilter] = useState('all')
	// "reassigned" = a subject that has been handed to more than one examiner,
	// counting cancelled appointments — the case where a download must show the
	// earlier examiner's work rather than hide it.
	const [assignedFilter, setAssignedFilter] = useState<'all' | 'unassigned' | 'assigned' | 'reassigned'>('all')
	const [search, setSearch] = useState('')

	// The subjects picked for this appointment. One examiner may take several
	// papers in one go — that is the common case for a department's setter.
	const [picked, setPicked] = useState<Set<string>>(new Set())

	// ── Assign sheet ──────────────────────────────────────────────────────
	const [sheetOpen, setSheetOpen] = useState(false)
	const [kind, setKind] = useState<QpExaminerKind>('external')
	const [examiners, setExaminers] = useState<ExaminerOpt[]>([])
	// Examiners who hold the Question Paper Setter role but are not ACTIVE yet.
	// Kept so a search that matches one can say WHY they are not selectable.
	const [blocked, setBlocked] = useState<BlockedExaminer[]>([])
	// True backlog size — `blocked` above may be a truncated sample of it.
	const [blockedTotal, setBlockedTotal] = useState(0)
	const [examinerLoading, setExaminerLoading] = useState(false)
	// A subject may be set by several examiners in parallel. Each gets their OWN
	// paper — the server allocates the next set — so they never share or see each
	// other's questions.
	const [examinerIds, setExaminerIds] = useState<string[]>([])
	const [validFrom, setValidFrom] = useState(defaultWindow().from)
	const [validTo, setValidTo] = useState(defaultWindow().to)
	const [notes, setNotes] = useState('')
	const [sendEmail, setSendEmail] = useState(true)
	const [saving, setSaving] = useState(false)
	// What the examiner is appointed to do. The fee of each component comes from
	// Fee Details by the W.E.F. date in force today — never typed here.
	const [assignmentType, setAssignmentType] = useState<QpAssignmentType>('question_paper')
	const [fees, setFees] = useState<QpFeeRates | null>(null)
	const [feesLoading, setFeesLoading] = useState(false)

	// ── Bulk assign (template download + Excel upload) ────────────────────
	const [templateBusy, setTemplateBusy] = useState(false)
	const [bulkOpen, setBulkOpen] = useState(false)
	const [bulkStep, setBulkStep] = useState<'parsing' | 'preview' | 'running' | 'done'>('parsing')
	const [bulkFileName, setBulkFileName] = useState('')
	const [bulkResult, setBulkResult] = useState<BulkValidationResult | null>(null)
	const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, label: '' })
	const [bulkOutcome, setBulkOutcome] = useState<{
		ok: number
		emailed: number
		failed: { row: number; course_code: string; examiner: string; error: string }[]
	}>({ ok: 0, emailed: 0, failed: [] })
	// Internal staff come from MyJKKN; when that is unreachable the template and
	// the upload still work with the external panel, and say so.
	const [bulkWarning, setBulkWarning] = useState<string | null>(null)

	// The paper is the unit of assignment, so it is also the row identity.
	const rowKey = (c: PaperRow) => c.paper_id

	// ── Fees from Fee Details (DEBIT / QP_HANDLING) ───────────────────────
	useEffect(() => {
		if (!institutionsId) {
			setFees(null)
			return
		}
		let cancelled = false
		setFeesLoading(true)
		fetch(`/api/fee-details?institutions_id=${institutionsId}&fee_type=DEBIT&category=QP_HANDLING&is_active=true`)
			.then(r => (r.ok ? r.json() : []))
			.then(rows => {
				if (!cancelled) setFees(pickQpFeeRates(Array.isArray(rows) ? rows : []))
			})
			.catch(() => {
				if (!cancelled) setFees(pickQpFeeRates([]))
			})
			.finally(() => {
				if (!cancelled) setFeesLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [institutionsId])

	/** The potential claim for a type: every component the type carries. */
	const potentialFor = (type: QpAssignmentType) =>
		computeClaim({ assignment_type: type, qp_fee: fees?.qp, ak_fee: fees?.ak, qp_willing: true, ak_willing: true })

	// ── Load the subject list ─────────────────────────────────────────────
	const loadPapers = useCallback(async () => {
		if (!institutionsId || !session?.id) {
			setPapers([])
			return
		}
		setLoading(true)
		setLoadError(null)
		try {
			const json = await apiFetch(
				`/api/pre-exam/qp-examiner-assignments/papers?institutions_id=${institutionsId}&examination_session_id=${session.id}`
			)
			setPapers(json.data || [])
			setPicked(new Set())
		} catch (e: any) {
			setPapers([])
			setLoadError(e.message)
		} finally {
			setLoading(false)
		}
	}, [institutionsId, session?.id])

	useEffect(() => {
		loadPapers()
	}, [loadPapers])

	// ── Load eligible examiners when the sheet opens or the tab changes ───
	useEffect(() => {
		if (!sheetOpen || !institutionsId) return
		let cancelled = false
		const load = async () => {
			setExaminerLoading(true)
			try {
				const json = await apiFetch(
					`/api/pre-exam/qp-examiner-assignments/examiners?kind=${kind}&institutions_id=${institutionsId}` +
						(session?.id ? `&examination_session_id=${session.id}` : '')
				)
				if (!cancelled) {
					setExaminers(json.data || [])
					setBlocked(json.blocked || [])
					setBlockedTotal(json.blocked_total ?? (json.blocked || []).length)
				}
			} catch (e: any) {
				if (!cancelled) {
					setExaminers([])
					setBlocked([])
					setBlockedTotal(0)
					toast({ title: 'Could not load examiners', description: e.message, variant: 'destructive' })
				}
			} finally {
				if (!cancelled) setExaminerLoading(false)
			}
		}
		load()
		return () => {
			cancelled = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sheetOpen, kind, institutionsId, session?.id])

	// ── Derived filter options ────────────────────────────────────────────
	const regulations = useMemo(
		() => [...new Set(papers.map(c => c.regulation_code).filter(Boolean) as string[])].sort(),
		[papers]
	)
	const programs = useMemo(
		() => [...new Set(papers.map(c => c.program_code).filter(Boolean))].sort(),
		[papers]
	)
	const semesters = useMemo(
		() =>
			[...new Set(papers.filter(c => programFilter === 'all' || c.program_code === programFilter).map(c => c.semester))]
				.filter(s => s != null)
				.sort((a, b) => a - b),
		[papers, programFilter]
	)
	const departments = useMemo(() => {
		const m = new Map<string, string>()
		for (const c of papers) if (c.department_code) m.set(c.department_code, c.department_name || c.department_code)
		return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => ({ code, name }))
	}, [papers])
	const subjects = useMemo(() => {
		const m = new Map<string, string>()
		for (const c of papers) if (!m.has(c.course_code)) m.set(c.course_code, c.subject_title)
		return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, title]) => ({ code, title }))
	}, [papers])

	/** Subjects handed to more than one examiner across their sets (cancelled counted). */
	const reassignedCodes = useMemo(() => {
		const count = new Map<string, number>()
		for (const c of papers) {
			count.set(c.course_code, (count.get(c.course_code) || 0) + (c.assignment_history?.length || 0))
		}
		return new Set([...count.entries()].filter(([, n]) => n > 1).map(([code]) => code))
	}, [papers])

	/** The scope filters, without the assignment-status one. */
	const matchesScope = useCallback(
		(c: PaperRow) =>
			(regulationFilter === 'all' || c.regulation_code === regulationFilter) &&
			(programFilter === 'all' || c.program_code === programFilter) &&
			(semesterFilter === 'all' || String(c.semester) === semesterFilter) &&
			(departmentFilter === 'all' || c.department_code === departmentFilter) &&
			(subjectFilter === 'all' || c.course_code === subjectFilter),
		[regulationFilter, programFilter, semesterFilter, departmentFilter, subjectFilter]
	)
	const matchesStatus = useCallback(
		(c: PaperRow) => {
			if (assignedFilter === 'unassigned') return !c.assignment
			if (assignedFilter === 'assigned') return !!c.assignment
			if (assignedFilter === 'reassigned') return reassignedCodes.has(c.course_code)
			return true
		},
		[assignedFilter, reassignedCodes]
	)

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase()
		return papers.filter(c => {
			if (!matchesScope(c) || !matchesStatus(c)) return false
			if (q && !`${c.course_code} ${c.subject_title}`.toLowerCase().includes(q)) return false
			return true
		})
	}, [papers, matchesScope, matchesStatus, search])

	const filterSummary = useMemo(() => {
		const parts = [
			`Regulation: ${regulationFilter === 'all' ? 'All' : regulationFilter}`,
			`Programme: ${programFilter === 'all' ? 'All' : programFilter}`,
			`Semester: ${semesterFilter === 'all' ? 'All' : semesterFilter}`,
			`Department: ${departmentFilter === 'all' ? 'All' : departments.find(d => d.code === departmentFilter)?.name || departmentFilter}`,
			`Subject: ${subjectFilter === 'all' ? 'All' : subjectFilter}`,
			`Assignment status: ${
				{ all: 'All', unassigned: 'Not Assigned', assigned: 'Assigned', reassigned: 'Reassigned' }[assignedFilter]
			}`,
		]
		return parts.join(' · ')
	}, [regulationFilter, programFilter, semesterFilter, departmentFilter, subjectFilter, assignedFilter, departments])

	const resetFilters = () => {
		setRegulationFilter('all')
		setProgramFilter('all')
		setSemesterFilter('all')
		setDepartmentFilter('all')
		setSubjectFilter('all')
		setAssignedFilter('all')
		setSearch('')
	}
	const filtersActive =
		regulationFilter !== 'all' || programFilter !== 'all' || semesterFilter !== 'all' ||
		departmentFilter !== 'all' || subjectFilter !== 'all' || assignedFilter !== 'all' || !!search.trim()

	const selectable = useMemo(() => visible.filter(c => !c.assignment), [visible])
	const pickedRows = useMemo(() => papers.filter(c => picked.has(rowKey(c))), [papers, picked])

	const togglePick = (c: PaperRow) => {
		if (c.assignment) return
		setPicked(prev => {
			const next = new Set(prev)
			const k = rowKey(c)
			next.has(k) ? next.delete(k) : next.add(k)
			return next
		})
	}

	const toggleAll = () => {
		setPicked(prev => {
			const allPicked = selectable.length > 0 && selectable.every(c => prev.has(rowKey(c)))
			if (allPicked) return new Set()
			return new Set(selectable.map(rowKey))
		})
	}

	const openSheet = () => {
		if (pickedRows.length === 0) {
			toast({ title: 'Select at least one subject to assign', variant: 'destructive' })
			return
		}
		const w = defaultWindow()
		setValidFrom(w.from)
		setValidTo(w.to)
		setExaminerIds([])
		setAssignmentType('question_paper')
		setNotes('')
		setSendEmail(true)
		setSheetOpen(true)
	}

	// Kept in the order they were picked, so the first gets the existing paper and
	// the rest get freshly scaffolded sets.
	const chosenExaminers = useMemo(
		() => examinerIds.map(id => examiners.find(e => e.id === id)).filter(Boolean) as ExaminerOpt[],
		[examinerIds, examiners]
	)

	const toggleExaminer = (id: string) =>
		setExaminerIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

	// ── Confirm ───────────────────────────────────────────────────────────
	const confirm = async () => {
		if (!session?.id) return
		if (chosenExaminers.length === 0) {
			toast({ title: 'Select at least one examiner', variant: 'destructive' })
			return
		}
		if (!validFrom || !validTo) {
			toast({ title: 'Set the Date From and Date To', variant: 'destructive' })
			return
		}

		setSaving(true)
		const results = { ok: 0, failed: [] as string[], emailed: 0 }

		// One request per (paper x examiner): every appointment is its own order.
		// The FIRST examiner takes the paper that already exists; each one after
		// that gets a freshly scaffolded set of the same subject, allocated by the
		// server. They never share a paper and never see each other's questions.
		for (const row of pickedRows) {
			for (const [index, chosenExaminer] of chosenExaminers.entries()) {
			try {
				const examinerId = chosenExaminer.id
				const payload = {
					institutions_id: institutionsId,
					institution_code: institutionCode,
					examination_session_id: session.id,
					// The paper already exists with its format chosen — assignment only
					// attaches an examiner to it.
					paper_id: row.paper_id,
					// Everyone after the first needs their own set of this subject.
					create_additional_set: index > 0,
					examiner_kind: kind,
					examiner_id: kind === 'external' ? examinerId : chosenExaminer.already_mirrored ? examinerId : undefined,
					staff:
						kind === 'internal'
							? {
									myjkkn_staff_id: chosenExaminer.myjkkn_staff_id || chosenExaminer.id,
									full_name: chosenExaminer.full_name,
									email: chosenExaminer.email,
									mobile: chosenExaminer.mobile || null,
									designation: chosenExaminer.designation || null,
									department: chosenExaminer.department || null,
								}
							: undefined,
					valid_from: validFrom,
					valid_to: validTo,
					// Fees are resolved server-side from Fee Details by type; the
					// override stays only for an explicit manual figure.
					assignment_type: assignmentType,
					notes: notes || null,
				}

				const created = await apiFetch('/api/pre-exam/qp-examiner-assignments', {
					method: 'POST',
					body: JSON.stringify(payload),
				})
				results.ok++

				if (sendEmail && created?.data?.id) {
					try {
						await apiFetch(`/api/pre-exam/qp-examiner-assignments/${created.data.id}/send-order`, {
							method: 'POST',
							body: JSON.stringify({}),
						})
						results.emailed++
					} catch (mailErr: any) {
						// The assignment stands even when the mail does not — say so
						// rather than making it look like the whole thing failed.
						results.failed.push(
							`${row.course_code} → ${chosenExaminer.full_name}: assigned, but the order e-mail failed (${mailErr.message})`
						)
					}
				}
			} catch (e: any) {
				results.failed.push(`${row.course_code} → ${chosenExaminer.full_name}: ${e.message}`)
			}
			}
		}

		setSaving(false)

		if (results.ok > 0) {
			toast({
				title:
					chosenExaminers.length === 1
						? `${results.ok} paper${results.ok > 1 ? 's' : ''} assigned to ${chosenExaminers[0].full_name}`
						: `${results.ok} appointment${results.ok > 1 ? 's' : ''} made across ${chosenExaminers.length} examiners`,
				description: sendEmail
					? `${results.emailed} examiner order${results.emailed === 1 ? '' : 's'} e-mailed.`
					: 'No e-mail sent — use Send Order from the Assignments tab when you are ready.',
			})
			setSheetOpen(false)
			setPicked(new Set())
			loadPapers()
			onAssigned()
		}
		if (results.failed.length) {
			toast({
				title: `${results.failed.length} could not be completed`,
				description: results.failed.slice(0, 3).join(' · '),
				variant: 'destructive',
			})
		}
	}

	// ── Bulk: shared examiner load ────────────────────────────────────────
	// Both kinds at once, since a file may mix them. A MyJKKN outage must not
	// block the external panel, so the internal failure is reported, not thrown.
	const loadAllExaminers = async (): Promise<{ external: ExaminerOpt[]; internal: ExaminerOpt[] }> => {
		const base = `/api/pre-exam/qp-examiner-assignments/examiners?institutions_id=${institutionsId}` +
			(session?.id ? `&examination_session_id=${session.id}` : '')
		const [ext, int] = await Promise.allSettled([
			apiFetch(`${base}&kind=external`),
			apiFetch(`${base}&kind=internal`),
		])
		if (ext.status === 'rejected') throw new Error(ext.reason?.message || 'Could not load the examiner panel')
		let warning: string | null = null
		if (int.status === 'rejected') {
			warning = `Internal staff could not be loaded (${int.reason?.message || 'MyJKKN unreachable'}). Only external examiners are available right now.`
		}
		setBulkWarning(warning)
		return {
			external: ext.value?.data || [],
			internal: int.status === 'fulfilled' ? int.value?.data || [] : [],
		}
	}

	/** Every paper of the session, fresh — what the template and the upload work from. */
	const loadLivePapers = async (): Promise<PaperRow[]> => {
		const json = await apiFetch(
			`/api/pre-exam/qp-examiner-assignments/papers?institutions_id=${institutionsId}&examination_session_id=${session?.id}`
		)
		return json.data || []
	}

	/** Papers the template will carry: the current filters, status included. */
	const templatePapers = useMemo(
		() => papers.filter(c => matchesScope(c) && matchesStatus(c)),
		[papers, matchesScope, matchesStatus]
	)

	const handleTemplate = async () => {
		if (!session) return
		setTemplateBusy(true)
		try {
			const [all, lists] = await Promise.all([loadLivePapers(), loadAllExaminers()])
			const selected = all.filter(c => matchesScope(c) && matchesStatus(c))
			await downloadBulkAssignTemplate({
				sessionCode: session.session_code,
				sessionName: session.session_name,
				institutionCode,
				filterSummary,
				papers: selected,
				allPapers: all,
				external: lists.external,
				internal: lists.internal,
				fees: { qp: fees?.qp ?? null, ak: fees?.ak ?? null },
				defaultFrom: defaultWindow().from,
				defaultTo: defaultWindow().to,
			})
			const withExisting = selected.filter(
				c => !c.assignment && all.some(o => o.course_code === c.course_code && o.paper_id !== c.paper_id && o.assignment)
			).length
			toast({
				title: 'Template downloaded',
				description:
					`${selected.length} paper${selected.length === 1 ? '' : 's'} listed, one row each` +
					(withExisting ? ` · ${withExisting} with an existing assignment on another set` : '') +
					` · ${lists.external.length + lists.internal.length} eligible examiners.`,
			})
		} catch (e: any) {
			toast({ title: 'Could not build the template', description: e.message, variant: 'destructive' })
		} finally {
			setTemplateBusy(false)
		}
	}

	const handleUpload = () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.xlsx,.xls'
		input.onchange = async e => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (!file) return
			setBulkFileName(file.name)
			setBulkResult(null)
			setBulkOutcome({ ok: 0, emailed: 0, failed: [] })
			setBulkStep('parsing')
			setBulkOpen(true)
			try {
				// Fresh papers, so the check reflects what is live NOW — not the list
				// loaded when the tab opened.
				const [rows, lists, live] = await Promise.all([
					parseBulkAssignFile(file),
					loadAllExaminers(),
					loadLivePapers(),
				])
				const result = validateBulkAssignRows({
					rows,
					papers: live,
					external: lists.external,
					internal: lists.internal,
				})
				setBulkResult(result)
				setBulkStep('preview')
			} catch (err: any) {
				setBulkOpen(false)
				toast({
					title: 'Could not read the file',
					description: err.message || 'Check that it is the downloaded template, saved as .xlsx.',
					variant: 'destructive',
				})
			}
		}
		input.click()
	}

	const runBulk = async () => {
		if (!session?.id || !bulkResult) return
		const ready = bulkResult.ready
		if (ready.length === 0) return

		setBulkStep('running')
		setBulkProgress({ current: 0, total: ready.length, label: '' })
		const outcome = { ok: 0, emailed: 0, failed: [] as typeof bulkOutcome.failed }

		// Sequential on purpose: a subject with two examiners must see the first
		// assignment land before the second asks for an additional set.
		for (let i = 0; i < ready.length; i++) {
			const item = ready[i]
			setBulkProgress({
				current: i + 1,
				total: ready.length,
				label: `${item.course_code} → ${item.examiner_name}`,
			})
			try {
				const created = await apiFetch('/api/pre-exam/qp-examiner-assignments', {
					method: 'POST',
					body: JSON.stringify(
						bulkItemToAssignPayload(item, { institutionsId, institutionCode, sessionId: session.id })
					),
				})
				outcome.ok++
				if (item.send_email && created?.data?.id) {
					try {
						await apiFetch(`/api/pre-exam/qp-examiner-assignments/${created.data.id}/send-order`, {
							method: 'POST',
							body: JSON.stringify({}),
						})
						outcome.emailed++
					} catch (mailErr: any) {
						outcome.failed.push({
							row: item.row,
							course_code: item.course_code,
							examiner: item.examiner_name,
							error: `Assigned, but the order e-mail failed: ${mailErr.message}`,
						})
					}
				}
			} catch (err: any) {
				outcome.failed.push({
					row: item.row,
					course_code: item.course_code,
					examiner: item.examiner_name,
					error: err.message || 'Failed',
				})
			}
		}

		setBulkOutcome(outcome)
		setBulkStep('done')
		if (outcome.ok > 0) {
			setPicked(new Set())
			loadPapers()
			onAssigned()
		}
	}

	const closeBulk = () => {
		if (bulkStep === 'running') return
		setBulkOpen(false)
	}

	// ── Guards ────────────────────────────────────────────────────────────
	if (!session) {
		return (
			<Card>
				<CardContent className="p-10 text-center text-sm text-muted-foreground">
					Select an examination session to begin.
				</CardContent>
			</Card>
		)
	}

	if (!session.is_end_semester) {
		return (
			<Card className="border-amber-200 bg-amber-50/50">
				<CardContent className="p-8 flex gap-3">
					<AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
					<div className="text-sm">
						<p className="font-medium text-amber-900">This is not an End Semester examination.</p>
						<p className="text-amber-800 mt-1">
							“{session.session_name}” is configured as{' '}
							<strong>{session.exam_type_name || 'no exam type'}</strong>. Question paper setters are
							appointed for End Semester Examinations only. Change the session&apos;s Exam Type in
							Examination Sessions, or pick a different session.
						</p>
					</div>
				</CardContent>
			</Card>
		)
	}

	return (
		<>
			<Card className="flex flex-col">
				<CardHeader className="px-4 py-3 border-b bg-gradient-to-r from-emerald-50/70 via-white to-sky-50/70">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="min-w-0">
							<p className="text-base font-semibold">End Semester Question Papers</p>
							<p className="text-xs text-muted-foreground">
								{session.session_name} · {session.exam_type_name}
							</p>
							<div className="flex flex-wrap gap-1.5 mt-2">
								<Badge variant="outline" className="bg-white text-slate-700 border-slate-200">
									<Layers className="h-3 w-3 mr-1" />
									{papers.length} paper{papers.length === 1 ? '' : 's'}
								</Badge>
								<Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
									{papers.filter(c => !c.assignment).length} not assigned
								</Badge>
								<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
									<Users className="h-3 w-3 mr-1" />
									{papers.filter(c => !!c.assignment).length} assigned
								</Badge>
								{picked.size > 0 && (
									<Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
										{picked.size} selected
									</Badge>
								)}
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<Button variant="outline" size="sm" onClick={loadPapers} disabled={loading} className="bg-white">
								<RefreshCw className={cn('h-4 w-4 mr-1.5', loading && 'animate-spin')} />
								Refresh
							</Button>

							{/* Bulk: template out, filled sheet back in. */}
							<div className="flex items-center rounded-md border border-sky-200 bg-white shadow-sm overflow-hidden">
								<Button
									variant="ghost"
									size="sm"
									onClick={handleTemplate}
									disabled={templateBusy || loading}
									title={`Excel template with one row per paper — the ${templatePapers.length} paper${templatePapers.length === 1 ? '' : 's'} in the current filter — plus the eligible examiners`}
									className="rounded-none text-sky-700 hover:bg-sky-50 hover:text-sky-800"
								>
									{templateBusy ? (
										<Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
									) : (
										<FileSpreadsheet className="h-4 w-4 mr-1.5" />
									)}
									Template
									{templatePapers.length > 0 && (
										<span className="ml-1.5 rounded-full bg-sky-100 px-1.5 text-[10px] font-semibold text-sky-800">
											{templatePapers.length}
										</span>
									)}
								</Button>
								<div className="h-6 w-px bg-sky-200" />
								<Button
									variant="ghost"
									size="sm"
									onClick={handleUpload}
									disabled={loading || papers.length === 0}
									title="Upload the filled template to assign in bulk"
									className="rounded-none text-sky-700 hover:bg-sky-50 hover:text-sky-800"
								>
									<Upload className="h-4 w-4 mr-1.5" />
									Bulk assign
								</Button>
							</div>

							<Button
								size="sm"
								onClick={openSheet}
								disabled={picked.size === 0}
								className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
							>
								<UserPlus className="h-4 w-4 mr-1.5" />
								Assign examiner{picked.size > 0 ? ` (${picked.size})` : ''}
							</Button>
						</div>
					</div>

					{/* The filters drive BOTH the list and the template download — a
					    template holds exactly the papers shown here, so nothing is
					    doubled up or left out by accident. */}
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 mt-3">
						<div className="space-y-1">
							<Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Regulation</Label>
							<SearchableSelect
								value={regulationFilter}
								onValueChange={setRegulationFilter}
								placeholder="All"
								className="bg-white"
								options={[{ value: 'all', label: 'All regulations' }, ...regulations.map(r => ({ value: r, label: r }))]}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Programme</Label>
							<SearchableSelect
								value={programFilter}
								onValueChange={v => {
									setProgramFilter(v)
									setSemesterFilter('all')
								}}
								placeholder="All"
								className="bg-white"
								options={[{ value: 'all', label: 'All programmes' }, ...programs.map(p => ({ value: p, label: p }))]}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Semester</Label>
							<SearchableSelect
								value={semesterFilter}
								onValueChange={setSemesterFilter}
								placeholder="All"
								className="bg-white"
								options={[
									{ value: 'all', label: 'All semesters' },
									...semesters.map(s => ({ value: String(s), label: `Semester ${s}` })),
								]}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Department</Label>
							<SearchableSelect
								value={departmentFilter}
								onValueChange={setDepartmentFilter}
								placeholder="All"
								className="bg-white"
								options={[
									{ value: 'all', label: 'All departments' },
									...departments.map(d => ({ value: d.code, label: d.name, hint: d.code !== d.name ? d.code : undefined })),
								]}
								searchPlaceholder="Search departments…"
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Subject</Label>
							<SearchableSelect
								value={subjectFilter}
								onValueChange={setSubjectFilter}
								placeholder="All"
								className="bg-white"
								options={[
									{ value: 'all', label: 'All subjects' },
									...subjects.map(s => ({ value: s.code, label: s.code, hint: s.title })),
								]}
								searchPlaceholder="Search code or title…"
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Search</Label>
							<div className="relative">
								<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<Input
									value={search}
									onChange={e => setSearch(e.target.value)}
									placeholder="Code or title…"
									className="h-9 pl-8 bg-white"
								/>
							</div>
						</div>
					</div>

					<div className="flex flex-wrap items-center justify-between gap-2 mt-2">
						<div className="flex items-center gap-2">
							<Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Assignment status</Label>
							<Tabs value={assignedFilter} onValueChange={v => setAssignedFilter(v as any)}>
								<TabsList className="bg-slate-100">
									<TabsTrigger
										value="all"
										className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white"
									>
										All
									</TabsTrigger>
									<TabsTrigger
										value="unassigned"
										className="text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-white"
									>
										Not Assigned
									</TabsTrigger>
									<TabsTrigger
										value="assigned"
										className="text-xs data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
									>
										Assigned
									</TabsTrigger>
									<TabsTrigger
										value="reassigned"
										className="text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white"
									>
										Reassigned
										{reassignedCodes.size > 0 && (
											<span className="ml-1 rounded-full bg-white/90 px-1.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-300">
												{reassignedCodes.size}
											</span>
										)}
									</TabsTrigger>
								</TabsList>
							</Tabs>
						</div>
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<span>
								{visible.length} of {papers.length} shown
							</span>
							{filtersActive && (
								<Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetFilters}>
									Clear filters
								</Button>
							)}
						</div>
					</div>
				</CardHeader>

				<CardContent className="p-0">
					{loadError && (
						<div className="m-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex gap-2">
							<Info className="h-4 w-4 shrink-0 mt-0.5" />
							<span>{loadError}</span>
						</div>
					)}

					{loading ? (
						<div className="p-10 flex justify-center">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : visible.length === 0 && !loadError ? (
						<div className="p-10 text-center text-sm text-muted-foreground space-y-1">
							{papers.length === 0 ? (
								<>
									<p className="font-medium text-foreground">No question papers generated yet</p>
									<p className="max-w-md mx-auto">
										An examiner is appointed to a paper, so the paper has to exist first. Open the{' '}
										<span className="font-medium">Generate Papers</span> tab, choose the format for each
										subject, and generate — then come back here.
									</p>
								</>
							) : (
								'Nothing matches these filters.'
							)}
						</div>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-10">
											<Checkbox
												checked={selectable.length > 0 && selectable.every(c => picked.has(rowKey(c)))}
												onCheckedChange={toggleAll}
												aria-label="Select all unassigned"
											/>
										</TableHead>
										<TableHead>Subject</TableHead>
										<TableHead className="w-24">Programme</TableHead>
										<TableHead className="w-20">Sem</TableHead>
										<TableHead className="w-16">Set</TableHead>
										<TableHead className="w-32">Format</TableHead>
										<TableHead>Assignment</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{visible.map(c => (
										<TableRow
											key={rowKey(c)}
											className={cn(c.assignment && 'bg-muted/30', !c.assignment && 'cursor-pointer')}
											onClick={() => togglePick(c)}
										>
											<TableCell onClick={e => e.stopPropagation()}>
												<Checkbox
													checked={picked.has(rowKey(c))}
													disabled={!!c.assignment}
													onCheckedChange={() => togglePick(c)}
													aria-label={`Select ${c.course_code}`}
												/>
											</TableCell>
											<TableCell>
												<div className="font-medium text-sm flex items-center gap-1.5">
													{c.course_code}
													{c.regulation_code && (
														<span className="rounded bg-slate-100 px-1 text-[10px] font-normal text-slate-600">
															R{c.regulation_code}
														</span>
													)}
													{reassignedCodes.has(c.course_code) && (
														<Badge variant="outline" className="text-[10px] px-1 py-0 bg-violet-50 text-violet-700 border-violet-200">
															Reassigned
														</Badge>
													)}
												</div>
												<div className="text-xs text-muted-foreground truncate max-w-[320px]">
													{c.subject_title}
												</div>
												{c.department_name && (
													<div className="text-[11px] text-muted-foreground/80 truncate max-w-[320px]">{c.department_name}</div>
												)}
											</TableCell>
											<TableCell className="text-sm">{c.program_code}</TableCell>
											<TableCell className="text-sm">{c.semester}</TableCell>
											<TableCell className="text-sm">{c.set_label || '—'}</TableCell>
											<TableCell>
												<div className="text-xs">{c.template_name}</div>
												<div className="text-xs text-muted-foreground">{c.template_total_marks} marks</div>
											</TableCell>
											<TableCell>
												{c.assignment ? (
													<div className="space-y-1">
														<div className="flex items-center gap-2">
															<StatusBadge status={c.assignment.status} />
															<KindBadge kind={c.assignment.examiner_kind} />
														</div>
														<div className="text-xs">{c.assignment.examiner_name}</div>
														<div className="text-xs text-muted-foreground">
															{formatIst(c.assignment.valid_from, false)} → {formatIst(c.assignment.valid_to)}
														</div>
													</div>
												) : (
													(() => {
														// An unassigned set of a subject someone else already holds:
														// say so here, the same way the template does.
														const other = papers.find(
															o => o.course_code === c.course_code && o.paper_id !== c.paper_id && o.assignment
														)
														return other ? (
															<div className="space-y-1">
																<Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
																	Existing assignment found
																</Badge>
																<div className="text-[11px] text-muted-foreground">
																	{other.set_label ? `Set ${other.set_label} · ` : ''}
																	{other.assignment!.examiner_name}
																</div>
															</div>
														) : (
															<Badge variant="outline" className="text-xs text-muted-foreground">
																Not assigned
															</Badge>
														)
													})()
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* ── Assign sheet ──────────────────────────────────────────────── */}
			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
					<SheetHeader>
						<SheetTitle>Assign question paper setter</SheetTitle>
					</SheetHeader>

					<div className="space-y-5 py-4">
						{/* Chosen papers */}
						<div>
							<Label className="text-xs uppercase tracking-wide text-muted-foreground">
								Question papers ({pickedRows.length})
							</Label>
							<div className="mt-2 rounded-md border divide-y max-h-40 overflow-y-auto">
								{pickedRows.map(c => (
									<div key={rowKey(c)} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
										<div className="min-w-0">
											<span className="font-medium">{c.course_code}</span>
											<span className="text-muted-foreground"> · {c.subject_title}</span>
										</div>
										<span className="text-xs text-muted-foreground shrink-0">
											Sem {c.semester}
											{c.set_label ? ` · Set ${c.set_label}` : ''}
										</span>
									</div>
								))}
							</div>
						</div>

						{/* Assignment type — what the examiner is appointed to do, with the
						    fee of each component from Fee Details. The examiner confirms
						    willingness per component in the portal; the claim follows that. */}
						<div>
							<div className="flex items-center justify-between">
								<Label className="text-xs uppercase tracking-wide text-muted-foreground">Assignment type</Label>
								{feesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
							</div>
							<div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
								{(
									[
										{ type: 'question_paper', title: 'Question Paper Setting', hint: 'Sets the paper', amount: fees?.qp ?? null },
										{ type: 'answer_key', title: 'Answer Key', hint: 'Writes the answer key only', amount: fees?.ak ?? null },
										{ type: 'both', title: 'Both', hint: 'Paper + answer key', amount: potentialFor('both').total },
									] as { type: QpAssignmentType; title: string; hint: string; amount: number | null }[]
								).map(o => {
									const on = assignmentType === o.type
									return (
										<button
											type="button"
											key={o.type}
											onClick={() => setAssignmentType(o.type)}
											className={cn(
												'rounded-md border p-3 text-left transition-colors',
												on ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' : 'hover:bg-muted/50'
											)}
										>
											<div className="flex items-start justify-between gap-2">
												<span className="text-sm font-medium">{o.title}</span>
												{on && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
											</div>
											<div className="text-xs text-muted-foreground">{o.hint}</div>
											<div className={cn('mt-1.5 text-base font-semibold', on ? 'text-emerald-700' : 'text-foreground')}>
												{formatRupees(o.amount)}
											</div>
										</button>
									)
								})}
							</div>
							<div className="mt-2 rounded-md border bg-muted/30 p-3 text-xs space-y-1">
								{assignmentType !== 'answer_key' && (
									<div className="flex justify-between">
										<span>Question Paper Setting</span>
										<span className="font-medium">{formatRupees(fees?.qp)}</span>
									</div>
								)}
								{assignmentType !== 'question_paper' && (
									<div className="flex justify-between">
										<span>Answer Key</span>
										<span className="font-medium">{formatRupees(fees?.ak)}</span>
									</div>
								)}
								<div className="flex justify-between border-t pt-1 text-sm">
									<span className="font-medium">Potential claim per paper</span>
									<span className="font-semibold text-emerald-700">{formatRupees(potentialFor(assignmentType).total)}</span>
								</div>
								<p className="text-muted-foreground">
									From Fee Details
									{fees?.qp_effective_from ? ` · QP w.e.f. ${fees.qp_effective_from}` : ''}
									{fees?.ak_effective_from ? ` · AK w.e.f. ${fees.ak_effective_from}` : ''}.
									{assignmentType === 'both' &&
										' The examiner may decline either part in the portal; the claim is only for what they accept.'}
								</p>
								{fees && assignmentType !== 'answer_key' && fees.qp == null && (
									<p className="text-amber-700 flex items-start gap-1">
										<AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
										No Question Paper Setting rate is configured in Fee Details (Debit → Question Paper Handling). The Order document&apos;s rate will be used.
									</p>
								)}
								{fees && assignmentType !== 'question_paper' && fees.ak == null && (
									<p className="text-amber-700 flex items-start gap-1">
										<AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
										No Answer Key rate is configured in Fee Details (Debit → Question Paper Handling → Answer Key). The answer key would be unpaid.
									</p>
								)}
							</div>
						</div>

						{/* Examiner type, then examiner — two dropdowns, in that order. */}
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<div>
								<Label className="text-xs uppercase tracking-wide text-muted-foreground">
									1. Examiner type <span className="text-destructive">*</span>
								</Label>
								<div className="mt-2">
									<SearchableSelect
										value={kind}
										onValueChange={v => {
											setKind(v as QpExaminerKind)
											setExaminerIds([])
										}}
										placeholder="Select examiner type"
										options={[
											{ value: 'external', label: 'External examiner', hint: 'Examiner Panel' },
											{ value: 'internal', label: 'Internal examiner', hint: 'College staff' },
										]}
									/>
								</div>
								<p className="text-xs text-muted-foreground mt-1.5">
									{kind === 'external'
										? 'Approved panel examiners whose willingness roles include Question Paper Setter.'
										: 'Teaching staff of this institution. Assigning creates their portal access automatically.'}
								</p>
							</div>

							<div>
								<div className="flex items-center justify-between">
									<Label className="text-xs uppercase tracking-wide text-muted-foreground">
										2. Examiner <span className="text-destructive">*</span>
									</Label>
									{examinerLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
								</div>
								<div className="mt-2">
									{/* Always shows the placeholder: choosing ADDS to the list below, so a
									    second pick gives the subject a second set. */}
									<SearchableSelect
										value=""
										onValueChange={id => {
											if (!examinerIds.includes(id)) setExaminerIds(prev => [...prev, id])
										}}
										placeholder={
											examinerLoading
												? 'Loading examiners…'
												: examiners.length === 0
													? 'No examiner available'
													: examinerIds.length === 0
														? 'Select examiner…'
														: 'Add another examiner (new set)…'
										}
										disabled={examinerLoading || examiners.length === 0}
										options={examiners.map(e => ({
											value: e.id,
											label: `${e.full_name}${e.active_assignments ? ` (${e.active_assignments} live)` : ''}`,
											hint: [e.email, e.department || e.institution_name].filter(Boolean).join(' · '),
											disabled: examinerIds.includes(e.id),
										}))}
										searchPlaceholder="Search name, e-mail, department…"
									/>
								</div>
								<p className="text-xs text-muted-foreground mt-1.5">
									{examiners.length} {kind} examiner{examiners.length === 1 ? '' : 's'} available. Type to search.
								</p>
							</div>
						</div>

						{/* Why the dropdown is empty — the panel is largely self-registered. */}
						{!examinerLoading && examiners.length === 0 && (
							<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2">
								<AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
								<span>
									{kind !== 'external'
										? 'No staff with a college e-mail found for this institution in MyJKKN.'
										: blockedTotal > 0
											? `No approved examiner is available yet. ${blockedTotal} examiner${blockedTotal === 1 ? '' : 's'} already have “Question Paper Setter” in their willingness roles but are awaiting approval — approve them on the Examiner Panel.`
											: 'No active examiner has “Question Paper Setter” among their willingness roles. Add it on the Examiner Panel.'}
								</span>
							</div>
						)}

						{/* The chosen examiners. Order matters: the first takes the existing
						    paper, each later one gets a freshly scaffolded set. */}
						{chosenExaminers.length > 0 && (
							<div className="rounded-md border divide-y">
								{chosenExaminers.map((e, i) => (
									<div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
										<div className="min-w-0">
											<div className="text-sm font-medium flex items-center gap-2">
												<CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
												<span className="truncate">{e.full_name}</span>
												{chosenExaminers.length > 1 && (
													<Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">
														Set {String.fromCharCode(65 + i)}
													</Badge>
												)}
											</div>
											<div className="text-xs text-muted-foreground truncate pl-6">
												{[e.email, e.designation, e.department, e.institution_name].filter(Boolean).join(' · ')}
											</div>
										</div>
										<div className="flex items-center gap-2 shrink-0">
											{!!e.active_assignments && (
												<Badge variant="outline" className="text-[10px]">
													{e.active_assignments} live
												</Badge>
											)}
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7 text-muted-foreground hover:text-rose-600"
												onClick={() => toggleExaminer(e.id)}
												aria-label={`Remove ${e.full_name}`}
											>
												<X className="h-4 w-4" />
											</Button>
										</div>
									</div>
								))}
							</div>
						)}

						{/* Selecting more than one is the multi-setter case, and it is worth
						    spelling out: each examiner is given their OWN paper. */}
						{examinerIds.length > 1 && (
							<div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
								<Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
								<span>
									{examinerIds.length} examiners selected. Each gets their own separate question paper for{' '}
									{pickedRows.length === 1 ? 'this subject' : `each of the ${pickedRows.length} subjects`} —
									recorded as Set A, Set B and so on. They work independently and never see one another's
									questions, or that the other sets exist.
								</span>
							</div>
						)}

						{/* Window */}
						<div>
							<Label className="text-xs uppercase tracking-wide text-muted-foreground">
								Question paper availability period (IST)
							</Label>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
								<div>
									<Label htmlFor="valid_from" className="text-xs">Date &amp; time from</Label>
									<Input
										id="valid_from"
										type="datetime-local"
										value={validFrom}
										onChange={e => setValidFrom(e.target.value)}
										className="h-9 mt-1"
									/>
								</div>
								<div>
									<Label htmlFor="valid_to" className="text-xs">Date &amp; time to</Label>
									<Input
										id="valid_to"
										type="datetime-local"
										value={validTo}
										onChange={e => setValidTo(e.target.value)}
										className="h-9 mt-1"
									/>
								</div>
							</div>
							<p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1.5">
								<CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
								The examiner can open the question paper only within this period. Access closes
								automatically at the end time. All times are Indian Standard Time.
							</p>
						</div>

						{/* Notes. The potential claim is always the fee schedule for the chosen
						    type (Fee Details → Question Paper Handling); there is no per-order override. */}
						<div>
							<Label htmlFor="notes" className="text-xs">Notes (internal)</Label>
							<Textarea
								id="notes"
								value={notes}
								onChange={e => setNotes(e.target.value)}
								rows={2}
								className="mt-1"
							/>
						</div>

						{/* Email */}
						<label className="flex items-start gap-2.5 rounded-md border p-3 cursor-pointer">
							<Checkbox checked={sendEmail} onCheckedChange={v => setSendEmail(v === true)} className="mt-0.5" />
							<span className="text-sm">
								<span className="font-medium flex items-center gap-1.5">
									<Mail className="h-3.5 w-3.5" />
									E-mail the examiner order now
								</span>
								<span className="text-xs text-muted-foreground block mt-0.5">
									Sends the Examiner Order Copy as a PDF attachment with the access period and a link
									to the portal. It can also be sent later from the Assignments tab.
								</span>
							</span>
						</label>
					</div>

					<div className="flex justify-end gap-2 border-t pt-4">
						<Button variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>
							Cancel
						</Button>
						<Button onClick={confirm} disabled={saving || examinerIds.length === 0}>
							{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
							Confirm assignment{pickedRows.length > 1 ? ` (${pickedRows.length})` : ''}
						</Button>
					</div>
				</SheetContent>
			</Sheet>

			{/* ── Bulk assign: preview → run → result ─────────────────────── */}
			<Dialog open={bulkOpen} onOpenChange={o => !o && closeBulk()}>
				<DialogContent className="max-w-5xl max-h-[88vh] overflow-hidden flex flex-col p-0">
					<DialogHeader className="px-6 pt-6 pb-3 border-b bg-gradient-to-r from-sky-50 to-white">
						<div className="flex items-start gap-3">
							<div className="h-10 w-10 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
								<Upload className="h-5 w-5 text-sky-700" />
							</div>
							<div className="min-w-0">
								<DialogTitle>Bulk examiner assignment</DialogTitle>
								<DialogDescription className="mt-0.5 truncate">
									{bulkFileName || 'Upload the filled template'} · {session.session_name}
								</DialogDescription>
							</div>
						</div>
					</DialogHeader>

					<div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
						{bulkStep === 'parsing' && (
							<div className="py-14 text-center space-y-2">
								<Loader2 className="h-7 w-7 animate-spin mx-auto text-sky-600" />
								<p className="text-sm font-medium">Reading the file and checking every row…</p>
								<p className="text-xs text-muted-foreground">
									Papers, examiners and dates are matched before anything is saved.
								</p>
							</div>
						)}

						{bulkStep === 'preview' && bulkResult && (
							<BulkPreview result={bulkResult} warning={bulkWarning} />
						)}

						{bulkStep === 'done' && (
							<BulkOutcomeView outcome={bulkOutcome} />
						)}
					</div>

					<DialogFooter className="px-6 py-3 border-t bg-muted/30">
						{bulkStep === 'preview' && bulkResult && (
							<>
								<Button variant="outline" onClick={closeBulk}>Cancel</Button>
								<Button variant="outline" onClick={handleUpload}>
									<Upload className="h-4 w-4 mr-1.5" />
									Choose another file
								</Button>
								<Button
									onClick={runBulk}
									disabled={bulkResult.ready.length === 0}
									className="bg-emerald-600 hover:bg-emerald-700 text-white"
								>
									<FileCheck2 className="h-4 w-4 mr-1.5" />
									Assign {bulkResult.ready.length} ready row{bulkResult.ready.length === 1 ? '' : 's'}{bulkResult.invalid.length > 0 ? ` · skip ${bulkResult.invalid.length}` : ''}
								</Button>
							</>
						)}
						{bulkStep === 'done' && (
							<Button onClick={closeBulk}>Close</Button>
						)}
						{bulkStep === 'parsing' && (
							<Button variant="outline" onClick={closeBulk}>Cancel</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Screen lock while the assignments are being written. */}
			{bulkStep === 'running' && bulkOpen && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
					<div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl max-w-md w-full mx-4">
						<div className="flex flex-col items-center gap-4">
							<Loader2 className="h-12 w-12 text-emerald-600 animate-spin" />
							<div className="text-center">
								<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
									Assigning question paper setters
								</h3>
								<p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
									Each row becomes its own examiner order. Please keep this window open.
								</p>
							</div>
							{bulkProgress.total > 0 && (
								<div className="w-full space-y-2">
									<div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
										<span className="truncate pr-3">{bulkProgress.label}</span>
										<span className="shrink-0">{bulkProgress.current} / {bulkProgress.total}</span>
									</div>
									<div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
										<div
											className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
											style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
										/>
									</div>
									<p className="text-xs text-center text-slate-500 dark:text-slate-400">
										{Math.round((bulkProgress.current / bulkProgress.total) * 100)}% complete
									</p>
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</>
	)
}

// ── Bulk preview ────────────────────────────────────────────────────────────

function StatTile({
	label, value, tone,
}: {
	label: string
	value: number
	tone: 'blue' | 'green' | 'red' | 'slate'
}) {
	const tones = {
		blue: 'bg-blue-50 border-blue-200 text-blue-700',
		green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
		red: 'bg-rose-50 border-rose-200 text-rose-700',
		slate: 'bg-slate-50 border-slate-200 text-slate-700',
	}
	return (
		<div className={cn('rounded-lg border p-3', tones[tone])}>
			<div className="text-xs font-medium opacity-80">{label}</div>
			<div className="text-2xl font-bold">{value}</div>
		</div>
	)
}

function BulkPreview({ result, warning }: { result: BulkValidationResult; warning: string | null }) {
	const fmt = (local: string) => (local ? formatIst(istLocalToIso(local), false) : '—')
	const newSets = result.ready.filter(i => i.action === 'assign_new_set').length

	const actionBadge = (item: BulkAssignItem) => {
		if (!item.action) return null
		const tone =
			item.action === 'assign'
				? 'bg-emerald-50 text-emerald-700 border-emerald-200'
				: 'bg-violet-50 text-violet-700 border-violet-200'
		return (
			<Badge variant="outline" className={cn('text-[11px]', tone)}>
				{BULK_ACTION_LABELS[item.action]}
			</Badge>
		)
	}

	return (
		<>
			<div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
				<StatTile label="Rows read" value={result.items.length + result.unchanged + result.skipped} tone="blue" />
				<StatTile label="Ready to assign" value={result.ready.length} tone="green" />
				<StatTile label="With errors" value={result.invalid.length} tone="red" />
				<StatTile label="Already assigned" value={result.unchanged} tone="slate" />
				<StatTile label="Blank (ignored)" value={result.skipped} tone="slate" />
			</div>

			{warning && (
				<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2">
					<AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
					<span>{warning}</span>
				</div>
			)}

			{newSets > 0 && (
				<div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex gap-2">
					<Info className="h-4 w-4 shrink-0 mt-0.5" />
					<span>
						{newSets} row{newSets === 1 ? '' : 's'} name a subject that already has an examiner. The earlier
						appointment is kept and the new examiner gets their own set (Set B, C…).
					</span>
				</div>
			)}

			{result.items.length === 0 && (
				<div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
					{result.unchanged > 0
						? `${result.unchanged} row${result.unchanged === 1 ? ' names' : 's name'} the examiner who already holds the paper. Nothing to apply.`
						: 'No rows with an Examiner Email were found. Fill the column and upload again.'}
				</div>
			)}

			{result.invalid.length > 0 && (
				<div className="rounded-md border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-800 flex gap-2">
					<XCircle className="h-4 w-4 shrink-0 mt-0.5" />
					<span>
						Rows with errors are skipped — nothing is written for them. Fix them in the file and upload again,
						or continue with the ready rows now.
					</span>
				</div>
			)}

			{result.items.length > 0 && (
				<div className="rounded-md border overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/40">
								<TableHead className="w-14">Row</TableHead>
								<TableHead>Paper</TableHead>
								<TableHead>Examiner</TableHead>
								<TableHead className="w-44">Action</TableHead>
								<TableHead className="w-[210px]">Window (IST)</TableHead>
								<TableHead className="w-20">Mail</TableHead>
								<TableHead className="w-[300px]">Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{[...result.invalid, ...result.ready].map(item => (
								<TableRow key={`${item.row}-${item.examiner_email}`} className={cn(item.errors.length > 0 && 'bg-rose-50/40')}>
									<TableCell className="text-xs font-mono text-muted-foreground">{item.row}</TableCell>
									<TableCell>
										<div className="text-sm font-medium">
											{item.course_code || '—'}
											{item.set_label ? (
												<span className="ml-1.5 text-xs text-muted-foreground">Set {item.set_label}</span>
											) : null}
											{item.regulation ? (
												<span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] font-normal text-slate-600">
													R{item.regulation}
												</span>
											) : null}
										</div>
										<div className="text-xs text-muted-foreground truncate max-w-[260px]">{item.subject_title}</div>
									</TableCell>
									<TableCell>
										<div className="text-sm">{item.examiner_name || '—'}</div>
										<div className="text-xs text-muted-foreground truncate max-w-[220px]">{item.examiner_email}</div>
										{item.kind && (
											<div className="mt-0.5">
												<KindBadge kind={item.kind} />
											</div>
										)}
									</TableCell>
									<TableCell>
										{actionBadge(item)}
										<div className="text-[11px] text-muted-foreground mt-1">
											{QP_ASSIGNMENT_TYPE_LABELS[item.assignment_type]}
											{item.qp_willing != null || item.ak_willing != null
												? `${item.qp_willing === false ? ' · QP declined' : ''}${item.ak_willing === false ? ' · AK declined' : ''}${item.qp_willing !== false && item.ak_willing !== false ? ' · willing' : ''}`
												: ' · confirms in portal'}
										</div>
										{item.action === 'assign_new_set' && item.existing_examiner && (
											<div className="text-[11px] text-muted-foreground mt-1">
												Existing: {item.existing_examiner}
											</div>
										)}
									</TableCell>
									<TableCell className="text-xs">
										{item.valid_from && item.valid_to ? (
											<>
												<div>{fmt(item.valid_from)}</div>
												<div className="text-muted-foreground">→ {fmt(item.valid_to)}</div>
											</>
										) : (
											'—'
										)}
									</TableCell>
									<TableCell className="text-xs">{item.send_email ? 'Yes' : 'No'}</TableCell>
									<TableCell>
										{item.errors.length === 0 ? (
											<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
												<CheckCircle2 className="h-3 w-3 mr-1" />
												Ready
											</Badge>
										) : (
											<ul className="space-y-0.5">
												{item.errors.map((err, i) => (
													<li key={i} className="flex items-start gap-1.5 text-xs text-rose-700">
														<XCircle className="h-3 w-3 mt-0.5 shrink-0" />
														<span>{err}</span>
													</li>
												))}
											</ul>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</>
	)
}

function BulkOutcomeView({
	outcome,
}: {
	outcome: { ok: number; emailed: number; failed: { row: number; course_code: string; examiner: string; error: string }[] }
}) {
	const hardFailures = outcome.failed.filter(f => !f.error.startsWith('Assigned, but'))
	const mailFailures = outcome.failed.filter(f => f.error.startsWith('Assigned, but'))
	return (
		<>
			<div className="grid grid-cols-3 gap-3">
				<StatTile label="Assigned" value={outcome.ok} tone="green" />
				<StatTile label="Orders e-mailed" value={outcome.emailed} tone="blue" />
				<StatTile label="Not completed" value={hardFailures.length} tone={hardFailures.length ? 'red' : 'slate'} />
			</div>

			{outcome.ok > 0 && hardFailures.length === 0 && (
				<div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 flex gap-2">
					<CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
					<span>
						All {outcome.ok} assignment{outcome.ok === 1 ? '' : 's'} made. Track them in the Assignments tab.
					</span>
				</div>
			)}

			{mailFailures.length > 0 && (
				<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
					<p className="font-medium mb-1">
						{mailFailures.length} assignment{mailFailures.length === 1 ? '' : 's'} saved, but the order e-mail
						did not go out. Use Send Order from the Assignments tab.
					</p>
					<ul className="space-y-0.5">
						{mailFailures.map(f => (
							<li key={f.row}>Row {f.row} · {f.course_code} → {f.examiner}</li>
						))}
					</ul>
				</div>
			)}

			{hardFailures.length > 0 && (
				<div className="space-y-2">
					{hardFailures.map(f => (
						<div key={f.row} className="border border-rose-200 rounded-lg p-3 bg-rose-50/50">
							<div className="flex items-center gap-2 mb-1">
								<Badge variant="outline" className="text-xs bg-rose-100 text-rose-800 border-rose-300">
									Row {f.row}
								</Badge>
								<span className="font-medium text-sm">{f.course_code} → {f.examiner}</span>
							</div>
							<div className="flex items-start gap-1.5 text-xs text-rose-700">
								<XCircle className="h-3 w-3 mt-0.5 shrink-0" />
								<span>{f.error}</span>
							</div>
						</div>
					))}
				</div>
			)}
		</>
	)
}
