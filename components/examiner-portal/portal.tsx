'use client'

// The Examiner Portal.
//
// A dashboard with three workflows behind a left sidebar, because they have
// nothing to do with one another and mixing them into tabs on a single
// assignment made the examiner hunt for the next thing to do:
//
//   Order Copy      the appointment letters — readable at any time
//   Question Paper  time-limited, preview-only, then the submit walk
//   Claim Form      pending → submitted → approved → payment completed
//
// SECURITY. Nothing here is the protection; every rule is enforced by the
// server (lib/qp-portal/guard.ts and the routes). What this file does is explain
// the state and avoid offering actions that would be refused anyway:
//
//   • The question paper has NO download, print or export. The route that used
//     to render it to a PDF is gone, not merely hidden.
//   • Question content is hidden from print output and is not selectable, so
//     the obvious copy paths do not work. A photograph of the screen is beyond
//     any browser's reach and is deliberately not pretended otherwise.
//   • After the submission is completed the content is never shown again.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/common/use-toast'
import {
	Loader2, LogOut, FileText, Clock, Lock, CheckCircle2, AlertTriangle, ArrowLeft,
	ShieldCheck, ScrollText, Receipt, History, Send, RefreshCw, Save, LayoutDashboard,
	Download, Eye, Menu, X, ListChecks, Wallet, BadgeCheck, UserCircle, KeyRound, Pencil, BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIst, windowHint } from '@/lib/qp-portal/ist'
import {
	QP_LOG_ACTION_LABELS,
	QP_CLAIM_STATUS_LABELS,
	QP_ASSIGNMENT_TYPE_LABELS,
	type QpWindowState,
	type QpSubmissionStage,
	type QpClaimStatus,
	type QpAssignmentType,
} from '@/types/qp-examiner-assignment'
import { componentsForType, computeClaim, formatRupees } from '@/lib/qp-portal/fees'
import { Checkbox } from '@/components/ui/checkbox'
import { PortalPaperEditor } from './portal-paper-editor'
import { SyncBadge, type SyncState } from './sync-badge'
import { SubmissionWizard } from './submission-wizard'
import { ClaimSection } from './claim-section'
import { ProfileSection } from './profile-section'
import { PaperPreviewDialog } from './paper-preview-dialog'
import type { IaPaperQuestion } from '@/types/ia-question-paper'

interface PortalExaminer {
	id: string
	full_name: string
	email: string
	kind: 'internal' | 'external'
	designation?: string | null
	department?: string | null
	institution_name?: string | null
	has_signature?: boolean
}

interface AssignmentSummary {
	id: string
	course_code: string
	subject_title: string
	program_code: string | null
	semester: number | null
	/**
	 * Never rendered. A subject can be set by several examiners in parallel
	 * (Set A / Set B); showing an examiner their set number would tell them the
	 * other sets exist. Kept on the type only because the API still sends it.
	 */
	set_label: string | null
	status: string
	valid_from: string
	valid_to: string
	window_state: QpWindowState
	window_hint: string
	order_ref_no: string | null
	order_issued_at: string | null
	assigned_at: string | null
	remuneration: number | null
	/** What the examiner was appointed to do, the fee of each part, and what they accepted. */
	assignment_type: QpAssignmentType
	qp_fee: number | null
	ak_fee: number | null
	qp_willing: boolean | null
	ak_willing: boolean | null
	willingness_confirmed_at: string | null
	claim_amount: number | null
	return_remarks: string | null
	submitted_at: string | null
	accepted_at: string | null
	session_name: string | null
	session_label: string | null
	question_total: number
	question_done: number

	submission_stage: QpSubmissionStage
	checklist_completed_at: string | null
	signed_at: string | null
	final_submitted_at: string | null

	claim_status: QpClaimStatus
	claim_submitted_at: string | null
	claim_approved_at: string | null
	claim_remarks: string | null
	payment_completed_at: string | null
	payment_reference: string | null
	payment_amount: number | null
}

interface Props {
	examiner: PortalExaminer
	onSignedOut: () => void
}

type Section = 'dashboard' | 'profile' | 'orders' | 'papers' | 'claims'

const WINDOW_TONE: Record<QpWindowState, string> = {
	pending: 'bg-slate-50 text-slate-700 border-slate-200',
	open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
	closed: 'bg-rose-50 text-rose-700 border-rose-200',
}

const NAV: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
	{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
	{ key: 'profile', label: 'Profile', icon: UserCircle },
	{ key: 'orders', label: 'Order Copy', icon: ScrollText },
	{ key: 'papers', label: 'Question Paper', icon: FileText },
	{ key: 'claims', label: 'Claim Form', icon: Receipt },
]

async function portalFetch(url: string, init: RequestInit = {}) {
	const res = await fetch(url, init)
	const text = await res.text()
	let json: any = null
	try {
		json = text ? JSON.parse(text) : null
	} catch {
		if (!res.ok) throw new Error(text.slice(0, 200) || `HTTP ${res.status}`)
	}
	if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`)
	return json
}

/** "ECE · Semester 7 · NOV-2026" */
function contextLine(a: {
	program_code: string | null
	semester: number | null
	session_label: string | null
	session_name: string | null
}) {
	return [a.program_code, a.semester ? `Semester ${a.semester}` : null, a.session_label || a.session_name]
		.filter(Boolean)
		.join(' · ')
}

/**
 * The single status an examiner should read off a row, blending the assignment,
 * the submit walk and the claim into one plain phrase.
 */
function overallStatus(a: AssignmentSummary): { label: string; tone: string } {
	if (a.status === 'returned') return { label: 'Returned for Revision', tone: 'bg-orange-50 text-orange-700 border-orange-200' }
	if (a.submission_stage === 'checklist') return { label: 'Check List Pending', tone: 'bg-blue-50 text-blue-700 border-blue-200' }
	if (a.submission_stage === 'signature') return { label: 'Signature Pending', tone: 'bg-blue-50 text-blue-700 border-blue-200' }
	if (a.submission_stage === 'completed') {
		const claim = (a.claim_status || 'pending') as QpClaimStatus
		if (claim === 'paid') return { label: 'Payment Completed', tone: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
		if (claim === 'approved') return { label: 'Claim Approved', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
		if (claim === 'submitted') return { label: 'Claim Submitted', tone: 'bg-blue-50 text-blue-700 border-blue-200' }
		return { label: 'Claim Pending', tone: 'bg-amber-50 text-amber-700 border-amber-200' }
	}
	if (a.window_state === 'closed') return { label: 'Window Closed', tone: 'bg-rose-50 text-rose-700 border-rose-200' }
	if (a.window_state === 'pending') return { label: 'Assigned', tone: 'bg-slate-50 text-slate-700 border-slate-200' }
	return { label: 'Question Paper Pending', tone: 'bg-amber-50 text-amber-700 border-amber-200' }
}

/**
 * EXAMINER ASSIGNMENT — confirm the optional part of the appointment.
 *
 * Setting the question paper is the appointment itself and is never optional,
 * so it is not offered as a choice. Only the Answer Key is: a setter appointed
 * for "Both" may decline it, which locks the answer-key fields and drops its
 * fee from the claim. The card is shown only when the appointment carries an
 * answer key; a paper-only appointment has nothing to confirm.
 */
function WillingnessCard({
	assignment,
	locked,
	onConfirm,
}: {
	assignment: any
	/** True once the paper is handed over — the choice is then settled. */
	locked: boolean
	onConfirm: (qp: boolean, ak: boolean) => Promise<void>
}) {
	const type: QpAssignmentType = assignment?.assignment_type || 'question_paper'
	const c = componentsForType(type)
	const confirmed = !!assignment?.willingness_confirmed_at
	const [editing, setEditing] = useState(!confirmed)
	const [ak, setAk] = useState<boolean>(assignment?.ak_willing ?? true)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		setAk(assignment?.ak_willing ?? true)
		setEditing(!assignment?.willingness_confirmed_at)
	}, [assignment?.ak_willing, assignment?.willingness_confirmed_at])

	// The paper is always set when the appointment carries it.
	const qpAlways = c.qp
	const claim = computeClaim({
		assignment_type: type,
		qp_fee: assignment?.qp_fee,
		ak_fee: assignment?.ak_fee,
		qp_willing: qpAlways,
		ak_willing: c.ak ? ak : false,
	})
	const declinedAll = !qpAlways && (!c.ak || !ak)

	const line = (
		label: string,
		fee: number | null | undefined,
		on: boolean,
		set: (v: boolean) => void,
		willingText: string
	) => (
		<label
			className={cn(
				'flex items-start gap-3 rounded-md border p-3 transition-colors',
				editing && !locked ? 'cursor-pointer hover:bg-muted/40' : '',
				on ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60'
			)}
		>
			<Checkbox
				checked={on}
				onCheckedChange={v => set(v === true)}
				disabled={!editing || locked || busy}
				className="mt-0.5"
			/>
			<span className="flex-1 min-w-0">
				<span className="flex items-center justify-between gap-3">
					<span className={cn('text-sm font-medium', !on && 'text-muted-foreground')}>{label}</span>
					<span className={cn('text-sm font-semibold', on ? 'text-emerald-700' : 'text-muted-foreground line-through')}>
						{formatRupees(on ? fee ?? 0 : 0)}
					</span>
				</span>
				<span className="block text-xs text-muted-foreground mt-0.5">
					{on ? willingText : `I am not willing to prepare the ${label.toLowerCase()}`}
				</span>
			</span>
		</label>
	)

	return (
		<Card className={cn('border-2', confirmed && !editing ? 'border-emerald-200' : 'border-amber-300')}>
			<CardContent className="p-4 space-y-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 className="font-semibold flex items-center gap-2 text-sm uppercase tracking-wide">
							<ShieldCheck className="h-4 w-4" />
							Examiner assignment
						</h2>
						<p className="text-xs text-muted-foreground mt-0.5">
							{QP_ASSIGNMENT_TYPE_LABELS[type]}
							{confirmed && !editing
								? ` · confirmed ${formatIst(assignment.willingness_confirmed_at)}`
								: c.qp
									? ' · the question paper is part of your appointment. Confirm whether you will also prepare the answer key.'
									: ' · confirm whether you will prepare the answer key.'}
						</p>
					</div>
					{confirmed && !editing && !locked && (
						<Button variant="outline" size="sm" onClick={() => setEditing(true)}>
							<Pencil className="h-3.5 w-3.5 mr-1.5" />
							Change
						</Button>
					)}
				</div>

				<div className="space-y-2">
					{c.ak && line('Answer Key', assignment?.ak_fee, ak, setAk, 'I am willing to prepare the Answer Key')}
				</div>

				<div className="flex items-center justify-between border-t pt-2.5">
					<span className="text-sm font-medium">{confirmed && !editing ? 'Claim' : 'Potential claim'}</span>
					<span className={cn('text-lg font-semibold', declinedAll ? 'text-muted-foreground' : 'text-emerald-700')}>
						{formatRupees(claim.total)}
					</span>
				</div>
				{declinedAll && (
					<p className="text-xs text-amber-700 flex items-start gap-1.5">
						<AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
						Answer key declined — there is no payable examiner claim, and nothing to enter for this paper.
					</p>
				)}
				{c.ak && !ak && !declinedAll && (
					<p className="text-xs text-muted-foreground">
						The answer-key fields stay visible but locked, and no answer key is required from you.
					</p>
				)}
				{error && <p className="text-sm text-rose-600">{error}</p>}

				{editing && !locked && (
					<div className="flex justify-end gap-2">
						{confirmed && (
							<Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
								Cancel
							</Button>
						)}
						<Button
							size="sm"
							disabled={busy}
							onClick={async () => {
								setBusy(true)
								setError(null)
								try {
									await onConfirm(qpAlways, c.ak ? ak : false)
									setEditing(false)
								} catch (e: any) {
									setError(e?.message || 'Your choice could not be saved.')
								} finally {
									setBusy(false)
								}
							}}
						>
							{busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
							{confirmed ? 'Save' : 'Confirm and continue'}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

export function ExaminerPortal({ examiner, onSignedOut }: Props) {
	const { toast } = useToast()

	const [section, setSection] = useState<Section>('dashboard')
	const [navOpen, setNavOpen] = useState(false)
	const [assignments, setAssignments] = useState<AssignmentSummary[]>([])
	const [loading, setLoading] = useState(true)
	const [openId, setOpenId] = useState<string | null>(null)
	const [detail, setDetail] = useState<any>(null)
	const [detailLoading, setDetailLoading] = useState(false)
	const [submitOpen, setSubmitOpen] = useState(false)
	const [submitting, setSubmitting] = useState(false)
	const [profile, setProfile] = useState<any>(null)
	const [history, setHistory] = useState<any[]>([])
	const [showHistory, setShowHistory] = useState(false)

	// The editor owns saving; these let the Submit card drive and report it.
	const saveDraftRef = useRef<(() => Promise<boolean>) | null>(null)
	const [draftSync, setDraftSync] = useState<{ state: SyncState; dirty: boolean; savedAt: string | null }>({
		state: 'idle',
		dirty: false,
		savedAt: null,
	})
	const wizardRef = useRef<HTMLDivElement | null>(null)
	// What the editor says still stands between this paper and Submit.
	const [paperProblems, setPaperProblems] = useState<string[]>([])
	// Bumped to remount the editor on the server copy after a failed submit.
	const [editorEpoch, setEditorEpoch] = useState(0)
	// The editor's live questions, read when the preview opens.
	const liveQuestionsRef = useRef<(() => IaPaperQuestion[]) | null>(null)
	const [previewQuestions, setPreviewQuestions] = useState<IaPaperQuestion[]>([])

	// ── Load ──────────────────────────────────────────────────────────────
	const loadAssignments = useCallback(async () => {
		setLoading(true)
		try {
			const json = await portalFetch('/api/examiner-portal/assignments')
			setAssignments(json.data || [])
		} catch (e: any) {
			toast({ title: 'Could not load your assignments', description: e.message, variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}, [toast])

	const loadProfile = useCallback(async () => {
		try {
			setProfile(await portalFetch('/api/examiner-portal/profile'))
		} catch {
			/* the claim screen shows its own empty state */
		}
	}, [])

	useEffect(() => {
		loadAssignments()
		loadProfile()
	}, [loadAssignments, loadProfile])

	const openAssignment = async (id: string) => {
		setOpenId(id)
		setSection('papers')
		setDetail(null)
		setPaperProblems([])
		setDetailLoading(true)
		try {
			setDetail(await portalFetch(`/api/examiner-portal/assignments/${id}`))
		} catch (e: any) {
			toast({ title: 'Could not open this paper', description: e.message, variant: 'destructive' })
			setOpenId(null)
		} finally {
			setDetailLoading(false)
		}
	}

	const reloadDetail = useCallback(async () => {
		if (!openId) return
		try {
			setDetail(await portalFetch(`/api/examiner-portal/assignments/${openId}`))
		} catch {
			/* keep what is on screen */
		}
		await loadAssignments()
	}, [openId, loadAssignments])

	const loadHistory = useCallback(async (assignmentId: string) => {
		try {
			const json = await portalFetch(`/api/examiner-portal/history?assignment_id=${assignmentId}`)
			setHistory(json.data || [])
		} catch {
			setHistory([])
		}
	}, [])

	// ── Actions ───────────────────────────────────────────────────────────
	const submitPaper = async () => {
		if (!openId) return
		if (paperProblems.length > 0) {
			setSubmitOpen(false)
			toast({
				title: 'The paper is not complete yet',
				description: `${paperProblems.length} item${paperProblems.length > 1 ? 's' : ''} still to do — ${paperProblems.slice(0, 3).join(' · ')}${paperProblems.length > 3 ? ' …' : ''}`,
				variant: 'destructive',
			})
			return
		}
		setSubmitting(true)
		try {
			// The server validates and submits ITS copy, so anything still only in
			// this browser must land first.
			if (draftSync.dirty || draftSync.state === 'unsynced') {
				const saved = await saveDraftRef.current?.()
				if (!saved) throw new Error('Your latest changes could not be saved. Check the connection and try again.')
			}
			const json = await portalFetch(`/api/examiner-portal/assignments/${openId}/paper`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ submit: true }),
			})
			setSubmitOpen(false)
			toast({ title: 'Question paper submitted', description: json.message })
			await reloadDetail()
			// The check list is now the next step — put it in front of the examiner
			// rather than leaving them on a page whose editor has just gone read-only.
			requestAnimationFrame(() => wizardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
		} catch (e: any) {
			toast({ title: 'Not submitted', description: e.message, variant: 'destructive' })
			// A refused submit may have touched the paper row (a rollback bumps its
			// updated_at). Reload and remount the editor on the server copy so the
			// next autosave does not run into a stale-base conflict. Safe: the draft
			// was flushed above, so there is nothing in the editor to lose.
			await reloadDetail()
			setEditorEpoch(n => n + 1)
		} finally {
			setSubmitting(false)
		}
	}

	const runWizardStep = useCallback(
		async (body: Record<string, unknown>) => {
			if (!openId) return
			const json = await portalFetch(`/api/examiner-portal/assignments/${openId}/submission`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (json?.message) toast({ title: json.message })
			return json
		},
		[openId, toast]
	)

	const confirmWillingness = useCallback(
		async (qp: boolean, ak: boolean) => {
			if (!openId) return
			// The editor is remounted below on a fresh server copy. Let any save
			// still in flight land FIRST, or its late write bumps the paper's
			// timestamp after the new instance has captured its base, and every
			// autosave from then on is a 409.
			await saveDraftRef.current?.()
			const json = await portalFetch(`/api/examiner-portal/assignments/${openId}/willingness`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ qp_willing: qp, ak_willing: ak }),
			})
			toast({ title: 'Willingness recorded', description: json.message })
			await reloadDetail()
			// The editor's field locks follow the choice — remount it on the fresh copy.
			setEditorEpoch(n => n + 1)
		},
		[openId, toast, reloadDetail]
	)

	const submitClaim = useCallback(
		async (assignmentId: string, bank: Record<string, string>) => {
			const json = await portalFetch(`/api/examiner-portal/assignments/${assignmentId}/claim`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(bank),
			})
			toast({ title: 'Claim submitted', description: json.message })
			await loadAssignments()
			await loadProfile()
		},
		[toast, loadAssignments, loadProfile]
	)

	const signOut = async () => {
		try {
			await fetch('/api/examiner-portal/session', { method: 'DELETE' })
		} finally {
			onSignedOut()
		}
	}

	/** Only the order copy and the claim form are documents. The paper is not. */
	const openDoc = (id: string, doc: 'order' | 'claim') => {
		window.open(`/api/examiner-portal/assignments/${id}/documents?doc=${doc}`, '_blank', 'noopener')
	}

	/** The prescribed syllabus for the course — readable at any time. */
	const openSyllabus = (id: string) => {
		window.open(`/api/examiner-portal/assignments/${id}/syllabus`, '_blank', 'noopener')
	}

	// ── Summary ───────────────────────────────────────────────────────────
	const stats = useMemo(() => {
		const done = assignments.filter(a => a.submission_stage === 'completed')
		return {
			assigned: assignments.length,
			submitted: assignments.filter(a => a.submission_stage !== 'authoring').length,
			claimPending: done.filter(a => (a.claim_status || 'pending') === 'pending').length,
			claimSubmitted: done.filter(a => a.claim_status === 'submitted').length,
			claimApproved: done.filter(a => a.claim_status === 'approved').length,
			paid: done.filter(a => a.claim_status === 'paid').length,
			actionNeeded: assignments.filter(
				a => a.submission_stage === 'checklist' || a.submission_stage === 'signature'
			).length,
		}
	}, [assignments])

	// ── Chrome ────────────────────────────────────────────────────────────
	const header = (
		<div className="bg-white border-b sticky top-0 z-30">
			<div className="h-1 bg-gradient-to-r from-green-600 via-emerald-500 to-green-600" />
			<div className="px-3 sm:px-4 py-2.5 flex items-center gap-3">
				<Button
					variant="ghost"
					size="icon"
					className="lg:hidden shrink-0"
					onClick={() => setNavOpen(v => !v)}
					aria-label="Menu"
				>
					{navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
				</Button>
				<Image src="/jkkncet_logo.png" alt="" width={40} height={40} className="object-contain shrink-0" />
				<div className="min-w-0 flex-1">
					<p className="font-semibold text-sm leading-tight truncate">Examiner Portal</p>
					<p className="text-xs text-muted-foreground truncate">
						{examiner.full_name} · {examiner.email}
					</p>
				</div>
				<Badge variant="outline" className="hidden sm:inline-flex shrink-0">
					<ShieldCheck className="h-3.5 w-3.5 mr-1" />
					{examiner.kind === 'internal' ? 'Internal' : 'External'}
				</Badge>
				<Button variant="outline" size="sm" onClick={signOut} className="shrink-0">
					<LogOut className="h-4 w-4 sm:mr-1.5" />
					<span className="hidden sm:inline">Sign out</span>
				</Button>
			</div>
		</div>
	)

	const sidebar = (
		<nav
			className={cn(
				'bg-white border-r shrink-0 w-60',
				'lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:block',
				navOpen ? 'fixed inset-y-[57px] left-0 z-20 block shadow-xl' : 'hidden'
			)}
		>
			<div className="p-3 space-y-1">
				{NAV.map(({ key, label, icon: Icon }) => {
					const active = section === key
					const badge =
						key === 'papers' ? stats.actionNeeded : key === 'claims' ? stats.claimPending : 0
					return (
						<button
							key={key}
							type="button"
							onClick={() => {
								setSection(key)
								setNavOpen(false)
								if (key !== 'papers') setOpenId(null)
							}}
							className={cn(
								'w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left transition-colors',
								active ? 'bg-emerald-50 text-emerald-800 font-medium' : 'hover:bg-slate-50 text-slate-700'
							)}
						>
							<Icon className={cn('h-4 w-4 shrink-0', active && 'text-emerald-600')} />
							<span className="flex-1 truncate">{label}</span>
							{badge > 0 && (
								<span className="rounded-full bg-amber-500 text-white text-[11px] leading-4 px-1.5 shrink-0">
									{badge}
								</span>
							)}
						</button>
					)
				})}
			</div>
		</nav>
	)

	const cards =
		assignments.length === 0 ? (
			<Card>
				<CardContent className="p-10 text-center space-y-2">
					<FileText className="h-8 w-8 mx-auto text-muted-foreground" />
					<p className="font-medium">No question papers are assigned to you yet</p>
					<p className="text-sm text-muted-foreground max-w-md mx-auto">
						When the Office of the Controller of Examinations appoints you as a question paper setter,
						the paper will appear here and you will receive the order by e-mail.
					</p>
				</CardContent>
			</Card>
		) : (
			<div className="space-y-3">
				{assignments.map(a => {
					const st = overallStatus(a)
					const stage = a.submission_stage
					const cta =
						stage === 'checklist'
							? 'Complete Check List'
							: stage === 'signature'
								? 'Add Signature'
								: stage === 'completed'
									? 'View Submission'
									: a.window_state === 'open'
										? 'Open Question Paper'
										: 'View Details'
					return (
						<Card key={a.id} className="hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="font-semibold">{a.course_code}</p>
										<p className="text-sm">{a.subject_title}</p>
										<p className="text-xs text-muted-foreground mt-0.5">{contextLine(a)}</p>
										<p className="text-xs text-muted-foreground mt-1.5">
											Assigned: {formatIst(a.assigned_at || a.valid_from, false)} · Valid until:{' '}
											{formatIst(a.valid_to, false)}
										</p>
										<p className="text-xs mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
											<span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
												{(a.assignment_type || 'question_paper') !== 'question_paper' && <KeyRound className="h-3 w-3" />}
												{QP_ASSIGNMENT_TYPE_LABELS[(a.assignment_type as QpAssignmentType) || 'question_paper']}
											</span>
											{a.willingness_confirmed_at || (a.assignment_type || 'question_paper') === 'question_paper' ? (
												<span className="text-emerald-700 font-medium">
													Claim {formatRupees(a.claim_amount ?? a.remuneration)}
												</span>
											) : (
												<span className="text-amber-700">Potential {formatRupees(a.remuneration)} · confirm answer key</span>
											)}
										</p>
										{a.return_remarks && (
											<p className="text-xs text-orange-700 mt-1 flex items-start gap-1">
												<AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
												{a.return_remarks}
											</p>
										)}
									</div>
									<div className="flex flex-col items-end gap-2 shrink-0">
										<Badge variant="outline" className={st.tone}>
											{st.label}
										</Badge>
										<Badge variant="outline" className={cn('text-xs', WINDOW_TONE[a.window_state])}>
											{a.window_state === 'open' ? (
												<Clock className="h-3 w-3 mr-1" />
											) : (
												<Lock className="h-3 w-3 mr-1" />
											)}
											{a.window_hint}
										</Badge>
										{a.question_total > 0 && stage === 'authoring' && (
											<p className="text-xs text-muted-foreground">
												{a.question_done} / {a.question_total} entered
											</p>
										)}
									</div>
								</div>
								<div className="mt-3 flex flex-wrap gap-2">
									<Button size="sm" onClick={() => openAssignment(a.id)}>
										{cta}
									</Button>
									<Button variant="outline" size="sm" onClick={() => openDoc(a.id, 'order')}>
										<ScrollText className="h-4 w-4 mr-1.5" />
										Order copy
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => openSyllabus(a.id)}
										title="The prescribed syllabus for this course — set the paper within it"
									>
										<BookOpen className="h-4 w-4 mr-1.5" />
										Syllabus
									</Button>
								</div>
							</CardContent>
						</Card>
					)
				})}
			</div>
		)

	// ── Section: Order Copy ─────────────────────────────────────────────
	const orders = (
		<div className="space-y-4">
			<div>
				<h1 className="text-xl font-semibold">Order Copy</h1>
				<p className="text-sm text-muted-foreground mt-0.5">
					Your official appointment orders. These stay available at all times.
				</p>
			</div>
			{assignments.length === 0 ? (
				<Card>
					<CardContent className="p-10 text-center text-sm text-muted-foreground">
						No orders have been issued to you yet.
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardContent className="p-0 divide-y">
						{assignments.map(a => (
							<div key={a.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="font-medium text-sm">
										{a.order_ref_no || 'Order'} · {a.course_code}
									</p>
									<p className="text-sm text-muted-foreground">{a.subject_title}</p>
									<p className="text-xs text-muted-foreground mt-0.5">{contextLine(a)}</p>
									<p className="text-xs text-muted-foreground mt-1">
										Order date: {formatIst(a.order_issued_at || a.assigned_at || a.valid_from, false)} ·
										Examiner: {examiner.full_name}
									</p>
								</div>
								<div className="flex items-center gap-2 shrink-0">
									<Badge variant="outline" className={overallStatus(a).tone}>
										{overallStatus(a).label}
									</Badge>
									<Button variant="outline" size="sm" onClick={() => openDoc(a.id, 'order')}>
										<Download className="h-4 w-4 mr-1.5" />
										View
									</Button>
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			)}
		</div>
	)

	// ── Section: Question Paper (list) ──────────────────────────────────
	const papersList = (
		<div className="space-y-4">
			<div>
				<h1 className="text-xl font-semibold">Question Paper</h1>
				<p className="text-sm text-muted-foreground mt-0.5">
					Papers assigned to you. Content is available only inside the validity period and is never
					downloadable.
				</p>
			</div>
			{cards}
		</div>
	)

	// ── Section: Question Paper (one assignment) ────────────────────────
	const a = detail?.assignment
	const content = detail?.content
	const state: QpWindowState = detail?.window_state || 'closed'
	const canEdit = !!detail?.can_edit
	const released = !!detail?.questions_released
	const stage: QpSubmissionStage = a?.submission_stage || 'authoring'

	// Only the answer key is a choice. The question paper is the appointment
	// itself: its fields open as soon as the window does. An appointment that
	// carries an answer key waits for that one answer before anything is entered.
	const aType: QpAssignmentType = a?.assignment_type || 'question_paper'
	const aComponents = componentsForType(aType)
	const willingnessPending = !!a && aComponents.ak && a.ak_willing == null
	const qpWilling = aComponents.qp
	const akWilling = aComponents.ak && a?.ak_willing === true
	const declinedAll = !!a && !willingnessPending && !qpWilling && !akWilling
	const answerKeyMode: 'hidden' | 'disabled' | 'required' = !aComponents.ak
		? 'hidden'
		: akWilling
			? 'required'
			: 'disabled'

	const paperDetail = !a ? null : (
		<div className="space-y-4">
			<Button
				variant="ghost"
				size="sm"
				onClick={() => {
					setOpenId(null)
					setDetail(null)
					setShowHistory(false)
					loadAssignments()
				}}
			>
				<ArrowLeft className="h-4 w-4 mr-1.5" />
				All question papers
			</Button>

			<Card>
				<CardContent className="p-4">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="min-w-0">
							<h1 className="text-lg font-semibold">
								{a.course_code} — {a.subject_title}
							</h1>
							<p className="text-sm text-muted-foreground mt-0.5">{contextLine(a)}</p>
							<p className="text-xs text-muted-foreground mt-1">
								{a.order_ref_no && <>Order: {a.order_ref_no} · </>}
								Assigned: {formatIst(a.assigned_at || a.valid_from, false)} · Valid until:{' '}
								{formatIst(a.valid_to)}
							</p>
						</div>
						<div className="text-right space-y-1.5 shrink-0">
							<Badge variant="outline" className={WINDOW_TONE[state]}>
								{state === 'open' ? <Clock className="h-3.5 w-3.5 mr-1" /> : <Lock className="h-3.5 w-3.5 mr-1" />}
								{detail.window_hint || windowHint(a.valid_from, a.valid_to)}
							</Badge>
							<div>
								<Badge variant="outline" className={overallStatus({ ...a, window_state: state } as any).tone}>
									{overallStatus({ ...a, window_state: state } as any).label}
								</Badge>
							</div>
						</div>
					</div>

					{a.return_remarks && (
						<div className="mt-3 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm">
							<p className="font-medium text-orange-900 flex items-center gap-1.5">
								<AlertTriangle className="h-4 w-4" />
								{a.reopen_scope === 'answer_key'
									? 'Answer key added to your appointment by the Office of the Controller of Examinations'
									: 'Reopened for revision by the Office of the Controller of Examinations'}
								{a.paper_version > 0 && (
									<span className="font-normal text-orange-800">· your submission V{a.paper_version} is on record</span>
								)}
							</p>
							<p className="text-orange-800 mt-1">{a.return_remarks}</p>
							{a.reopened_at && (
								<p className="text-xs text-orange-700 mt-1">Reopened on {formatIst(a.reopened_at)}. Your resubmission will be saved as V{(a.paper_version || 0) + 1}; V{a.paper_version || 1} is kept unchanged.</p>
							)}
						</div>
					)}

					{(stage === 'completed' || a.status === 'accepted' || a.status === 'submitted') && (
						<div className="mt-3 rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800 flex items-start gap-2">
							<Lock className="h-4 w-4 shrink-0 mt-0.5" />
							<p>
								<span className="font-medium">This submission has already been finalized. Any reopening and subsequent modification will be permanently recorded in the audit log.</span>
								{a.paper_version > 0 && <> Submitted as version V{a.paper_version}.</>}
							</p>
						</div>
					)}

					{a.status === 'accepted' && (
						<div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-center gap-2">
							<CheckCircle2 className="h-4 w-4" />
							Accepted by the Office of the Controller of Examinations on {formatIst(a.accepted_at)}.
						</div>
					)}

					<div className="mt-3 flex flex-wrap gap-2">
						<Button variant="outline" size="sm" onClick={() => openDoc(a.id, 'order')}>
							<ScrollText className="h-4 w-4 mr-1.5" />
							Order copy
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => openSyllabus(a.id)}
							title="The prescribed syllabus for this course — set the paper within it"
						>
							<BookOpen className="h-4 w-4 mr-1.5" />
							Syllabus
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setShowHistory(v => !v)
								if (!showHistory) loadHistory(a.id)
							}}
						>
							<History className="h-4 w-4 mr-1.5" />
							Activity
						</Button>
						<Button variant="ghost" size="sm" onClick={reloadDetail}>
							<RefreshCw className="h-4 w-4 mr-1.5" />
							Refresh
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Step one, only when the appointment carries an answer key: will the
			    examiner prepare it? The fields — and the claim — follow the answer. */}
			{aComponents.ak && stage === 'authoring' && a.status !== 'cancelled' && (
				<WillingnessCard
					assignment={a}
					locked={!['assigned', 'in_progress', 'returned'].includes(a.status)}
					onConfirm={confirmWillingness}
				/>
			)}

			{/* Instructions */}
			{content?.instructions?.body?.length > 0 && stage === 'authoring' && (
				<Card>
					<CardContent className="p-5">
						<h2 className="font-semibold flex items-center gap-2 text-sm">
							<ScrollText className="h-4 w-4" />
							{content.instructions.title || 'Instructions'}
						</h2>
						<ol className="mt-2.5 space-y-1.5 text-sm list-decimal pl-5 text-muted-foreground">
							{content.instructions.body.map((c: any) => (
								<li key={c.id}>{c.text}</li>
							))}
						</ol>
					</CardContent>
				</Card>
			)}

			{/* The submit walk */}
			{stage !== 'authoring' && (
				<div ref={wizardRef}>
					<SubmissionWizard
						assignmentId={a.id}
						stage={stage}
						assignment={a}
						content={content}
						savedSignatureUrl={profile?.signature_url || null}
						onStep={runWizardStep}
						onAdvanced={reloadDetail}
					/>
				</div>
			)}

			{/* The paper itself */}
			{released && stage === 'authoring' && willingnessPending ? (
				<Card className="border-2 border-amber-200">
					<CardContent className="p-8 text-center space-y-2">
						<ShieldCheck className="h-8 w-8 mx-auto text-amber-600" />
						<p className="font-medium">Confirm your willingness first</p>
						<p className="text-sm text-muted-foreground max-w-md mx-auto">
							Tick the parts of this appointment you are willing to do, above. The paper opens as soon
							as you confirm.
						</p>
					</CardContent>
				</Card>
			) : released && stage === 'authoring' && declinedAll ? (
				<Card className="border-2 border-slate-200">
					<CardContent className="p-8 text-center space-y-2">
						<Lock className="h-8 w-8 mx-auto text-muted-foreground" />
						<p className="font-medium">Nothing to enter for this paper</p>
						<p className="text-sm text-muted-foreground max-w-md mx-auto">
							You have declined both parts of this appointment. If that was a mistake, use Change above.
							The Office of the Controller of Examinations has been informed through the audit log.
						</p>
					</CardContent>
				</Card>
			) : !released ? (
				<Card className={cn('border-2', stage === 'completed' ? 'border-slate-200' : state === 'pending' ? 'border-slate-200' : 'border-rose-200')}>
					<CardContent className="p-8 text-center space-y-2">
						<Lock className="h-8 w-8 mx-auto text-muted-foreground" />
						<p className="font-medium">
							{stage === 'completed'
								? 'This question paper is closed'
								: state === 'pending'
									? 'This question paper is not open yet'
									: 'The access period has ended'}
						</p>
						<p className="text-sm text-muted-foreground max-w-md mx-auto">
							{stage === 'completed'
								? 'Your submission is complete. For confidentiality the question content cannot be viewed again — contact the Office of the Controller of Examinations if a change is needed.'
								: state === 'pending'
									? `The paper becomes available on ${formatIst(a.valid_from)}. Until then you can read the instructions and view your order.`
									: `Access closed on ${formatIst(a.valid_to)}. Contact the Office of the Controller of Examinations if you need the period reopened.`}
						</p>
					</CardContent>
				</Card>
			) : (
				<>
					{!canEdit && (
						<div className="rounded-md border bg-slate-50 px-3.5 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
							<Eye className="h-4 w-4 shrink-0" />
							Preview only — this paper has been submitted and can no longer be edited. It cannot be
							downloaded or printed.
						</div>
					)}
					{/* qp-protected: no print, no selection. See the print rules below. */}
					<div
						className="qp-protected"
						onCopy={e => e.preventDefault()}
						onCut={e => e.preventDefault()}
						onContextMenu={e => e.preventDefault()}
					>
						<PortalPaperEditor
							key={`${a.id}:${editorEpoch}`}
							saveRef={saveDraftRef}
							onSyncChange={setDraftSync}
							onValidityChange={setPaperProblems}
							questionsRef={liveQuestionsRef}
							onConflict={() => {
								void reloadDetail().then(() => setEditorEpoch(n => n + 1))
							}}
							assignmentId={a.id}
							questions={detail.questions || []}
							templateParts={detail.template_parts || []}
							courseOutcomes={detail.course_outcomes || []}
							baseUpdatedAt={detail.paper?.updated_at || null}
							readOnly={!canEdit}
							questionsEditable={qpWilling && a.reopen_scope !== 'answer_key'}
							answerKeyMode={answerKeyMode}
							onSaved={info => {
								setAssignments(prev =>
									prev.map(x =>
										x.id === a.id
											? { ...x, question_done: info.question_done, question_total: info.question_total }
											: x
									)
								)
							}}
						/>
					</div>

					{canEdit && (
						<Card>
							<CardContent className="space-y-3 p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="text-sm">
										<p className="font-medium">Save your progress, or submit</p>
										<p className="text-muted-foreground text-xs mt-0.5">
											<span className="font-medium">Save Draft</span> keeps a partly finished paper
											exactly as it is. Your work is also saved automatically as you type.
										</p>
										<p className="text-muted-foreground text-xs mt-1">
											<span className="font-medium">Submit</span> needs every question complete. You
											will then be taken straight through the check list and your signature.
										</p>
									</div>
									<SyncBadge
										state={draftSync.state}
										dirty={draftSync.dirty}
										savedAt={draftSync.savedAt}
										className="shrink-0"
									/>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button
										variant="outline"
										onClick={() => void saveDraftRef.current?.()}
										disabled={draftSync.state === 'saving'}
									>
										{draftSync.state === 'saving' ? (
											<Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
										) : (
											<Save className="h-4 w-4 mr-1.5" />
										)}
										Save Draft
									</Button>
									<Button
										onClick={() => {
											setPreviewQuestions(liveQuestionsRef.current?.() || detail.questions || [])
											setSubmitOpen(true)
										}}
										disabled={paperProblems.length > 0 || draftSync.state === 'saving'}
										title={
											paperProblems.length > 0
												? `${paperProblems.length} item${paperProblems.length > 1 ? 's' : ''} still to complete`
												: undefined
										}
									>
										<Send className="h-4 w-4 mr-1.5" />
										Submit question paper
									</Button>
									{paperProblems.length > 0 && (
										<span className="text-xs text-amber-700 flex items-center gap-1">
											<AlertTriangle className="h-3.5 w-3.5" />
											{paperProblems.length} item{paperProblems.length > 1 ? 's' : ''} still to complete —
											see the list below the paper
										</span>
									)}
								</div>
							</CardContent>
						</Card>
					)}
				</>
			)}

			{showHistory && (
				<Card>
					<CardContent className="p-0">
						<div className="divide-y max-h-[420px] overflow-y-auto">
							{history.length === 0 && (
								<div className="p-8 text-center text-sm text-muted-foreground">
									No activity recorded for this paper yet.
								</div>
							)}
							{history.map(h => (
								<div key={h.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
									<span className={cn(h.denied && 'text-rose-600')}>
										{QP_LOG_ACTION_LABELS[h.action] || h.action}
										{h.reason && <span className="text-xs block text-rose-600">{h.reason}</span>}
									</span>
									<span className="text-xs text-muted-foreground shrink-0">{formatIst(h.created_at)}</span>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	)

	const body =
		section === 'dashboard' ? (
			<div className="space-y-4">
				<div>
					<h1 className="text-xl font-semibold">Dashboard</h1>
					<p className="text-sm text-muted-foreground mt-0.5">
						Welcome, {examiner.full_name}. Everything assigned to you is below.
					</p>
				</div>

				<div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
					{[
						{ label: 'Assigned', value: stats.assigned, icon: FileText, tone: 'text-slate-700' },
						{ label: 'Submitted', value: stats.submitted, icon: CheckCircle2, tone: 'text-emerald-700' },
						{ label: 'Claims Pending', value: stats.claimPending, icon: Clock, tone: 'text-amber-700' },
						{ label: 'Claims Submitted', value: stats.claimSubmitted, icon: Receipt, tone: 'text-blue-700' },
						{ label: 'Claims Approved', value: stats.claimApproved, icon: BadgeCheck, tone: 'text-emerald-700' },
						{ label: 'Payments Completed', value: stats.paid, icon: Wallet, tone: 'text-emerald-800' },
					].map(({ label, value, icon: Icon, tone }) => (
						<Card key={label}>
							<CardContent className="p-3.5">
								<div className="flex items-center justify-between gap-2">
									<p className="text-xs text-muted-foreground truncate">{label}</p>
									<Icon className={cn('h-4 w-4 shrink-0', tone)} />
								</div>
								<p className={cn('text-2xl font-semibold mt-1', tone)}>{value}</p>
							</CardContent>
						</Card>
					))}
				</div>

				{stats.actionNeeded > 0 && (
					<Card className="border-blue-200 bg-blue-50/50">
						<CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-start gap-2.5">
								<ListChecks className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
								<div>
									<p className="font-medium text-sm text-blue-900">
										{stats.actionNeeded} submission{stats.actionNeeded > 1 ? 's need' : ' needs'} finishing
									</p>
									<p className="text-xs text-blue-800 mt-0.5">
										The question paper is in — the check list and signature are still to do.
									</p>
								</div>
							</div>
							<Button size="sm" onClick={() => setSection('papers')}>
								Continue
							</Button>
						</CardContent>
					</Card>
				)}

				<div>
					<h2 className="font-semibold text-sm mb-2">Assignments</h2>
					{cards}
				</div>
			</div>
		) : section === 'profile' ? (
			<ProfileSection />
		) : section === 'orders' ? (
			orders
		) : section === 'claims' ? (
			<ClaimSection
				assignments={assignments as any}
				bank={profile?.bank || {}}
				onSubmitClaim={submitClaim}
				onDownload={id => openDoc(id, 'claim')}
				loading={loading}
			/>
		) : openId ? (
			detailLoading || !detail ? (
				<div className="py-20 flex justify-center">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			) : (
				paperDetail
			)
		) : (
			papersList
		)

	return (
		<div className="min-h-screen bg-gray-50">
			{/*
			  Application-level protection for the question content.

			  Printing is refused rather than styled: the content is replaced with a
			  notice, so Ctrl+P and "Save as PDF" (which is just printing) produce a
			  page with no questions on it. Selection is disabled so the text cannot
			  be dragged out, and copy/cut/context-menu are cancelled in the handler
			  above. A photograph of the screen defeats all of this and is out of
			  reach of any web application — the spec says so too.
			*/}
			<style>{`
				.qp-protected, .qp-protected * {
					-webkit-user-select: none;
					-moz-user-select: none;
					user-select: none;
				}
				/* Inputs the examiner types into must stay usable. */
				.qp-protected input, .qp-protected textarea,
				.qp-protected [contenteditable="true"],
				.qp-protected [contenteditable="true"] * {
					-webkit-user-select: text;
					-moz-user-select: text;
					user-select: text;
				}
				@media print {
					body { visibility: hidden !important; }
					.qp-protected { display: none !important; }
					body::after {
						visibility: visible;
						content: 'This question paper cannot be printed. — Office of the Controller of Examinations';
						position: fixed; inset: 0; display: flex;
						align-items: center; justify-content: center;
						font: 14px/1.5 Georgia, serif; text-align: center; padding: 40px;
					}
				}
			`}</style>

			{header}
			<div className="flex">
				{sidebar}
				{navOpen && (
					<button
						type="button"
						aria-label="Close menu"
						className="fixed inset-0 top-[57px] z-10 bg-black/20 lg:hidden"
						onClick={() => setNavOpen(false)}
					/>
				)}
				<main className="flex-1 min-w-0 px-3 sm:px-5 py-5 pb-16">
					<div className="max-w-5xl mx-auto">
						{loading && section !== 'claims' ? (
							<div className="py-20 flex justify-center">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						) : (
							body
						)}
					</div>
				</main>
			</div>

			<PaperPreviewDialog
				open={submitOpen}
				onOpenChange={setSubmitOpen}
				title={a ? `${a.course_code} — ${a.subject_title}` : 'Question paper'}
				subtitle={a ? contextLine(a) : undefined}
				questions={previewQuestions}
				templateParts={detail?.template_parts || []}
				problems={paperProblems}
				submitting={submitting}
				onSubmit={submitPaper}
			/>
		</div>
	)
}
