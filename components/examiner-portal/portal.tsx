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
// Every screen answers the same question first — "what do I do now?" — through
// one status vocabulary (./tones) and, on the paper page, a sticky step tracker
// whose single sentence is the instruction. Every button that cannot be pressed
// says why, next to it, instead of failing on the click.
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
	ArrowRight, Info, XCircle, RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIst, windowHint } from '@/lib/qp-portal/ist'
import {
	QP_LOG_ACTION_LABELS,
	QP_ASSIGNMENT_TYPE_LABELS,
	type QpWindowState,
	type QpSubmissionStage,
	type QpClaimStatus,
	type QpAssignmentType,
} from '@/types/qp-examiner-assignment'
import { componentsForType, computeClaim, formatRupees } from '@/lib/qp-portal/fees'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PortalPaperEditor } from './portal-paper-editor'
import { SyncBadge, type SyncState } from './sync-badge'
import { SubmissionWizard } from './submission-wizard'
import { ClaimSection } from './claim-section'
import { ProfileSection } from './profile-section'
import { PaperPreviewDialog } from './paper-preview-dialog'
import {
	PaperStepTracker, DisabledReason, ToneBadge, type TrackerStep, type TrackerInstruction, type StepState,
} from './paper-step-tracker'
import { TONE, TONE_LEGEND, TAB_TONE, type Tone } from './tones'
import type { IaPaperQuestion } from '@/types/ia-question-paper'
import type { PaperProblem } from '@/lib/ia/validate-paper'

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
type ListTab = 'active' | 'archived'

/**
 * A paper whose validity ended more than this many days ago is ARCHIVED: it
 * stays readable for reference (order copy, claim status, history) but is kept
 * out of the Active list so the examiner sees only what still matters.
 */
const ARCHIVE_AFTER_DAYS = 90

function isArchived(a: { valid_to: string }, now = Date.now()): boolean {
	const end = new Date(a.valid_to).getTime()
	if (Number.isNaN(end)) return false
	return now - end > ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000
}

/** Newest validity first, so the paper closing soonest is not buried under old ones. */
function byValidToDesc(x: { valid_to: string; id: string }, y: { valid_to: string; id: string }): number {
	return String(y.valid_to).localeCompare(String(x.valid_to)) || x.id.localeCompare(y.id)
}

/** The claim column on a card: label + tone, from the submission stage and claim status. */
function claimCell(a: AssignmentSummary): { label: string; tone: Tone; hint?: string } {
	if (a.status === 'cancelled') return { label: 'No claim', tone: 'locked' }
	if (a.submission_stage !== 'completed') {
		return { label: 'Not yet available', tone: 'locked', hint: 'Opens after the submission is complete' }
	}
	const claim = (a.claim_status || 'pending') as QpClaimStatus
	if (claim === 'paid') return { label: 'Payment completed', tone: 'success' }
	if (claim === 'approved') return { label: 'Claim approved', tone: 'success' }
	if (claim === 'submitted') return { label: 'Claim submitted', tone: 'info' }
	return { label: 'Claim to submit', tone: 'warning', hint: 'Your action needed' }
}

const WINDOW_TONE: Record<QpWindowState, Tone> = {
	pending: 'locked',
	open: 'success',
	closed: 'danger',
}

const NAV: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
	{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
	{ key: 'profile', label: 'Profile', icon: UserCircle },
	{ key: 'orders', label: 'Order Copy', icon: ScrollText },
	{ key: 'papers', label: 'Question Paper', icon: FileText },
	{ key: 'claims', label: 'Claim Form', icon: Receipt },
]

/**
 * fetch() that turns a refusal into an Error carrying the server's body, so a
 * caller can read `error.code` ('INCOMPLETE', 'CONFLICT' …) and `error.body`
 * (field-level problems, unanswered check list ids) instead of only a sentence.
 */
async function portalFetch(url: string, init: RequestInit = {}) {
	const res = await fetch(url, init)
	const text = await res.text()
	let json: any = null
	try {
		json = text ? JSON.parse(text) : null
	} catch {
		if (!res.ok) throw new Error(text.slice(0, 200) || `HTTP ${res.status}`)
	}
	if (!res.ok) {
		const err: any = new Error(json?.message || json?.error || `HTTP ${res.status}`)
		err.status = res.status
		err.code = json?.error
		err.body = json
		throw err
	}
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
 * the submit walk and the claim into one plain phrase — and its tone.
 */
function overallStatus(a: AssignmentSummary): { label: string; tone: Tone } {
	if (a.status === 'cancelled') return { label: 'Cancelled', tone: 'locked' }
	if (a.status === 'returned') return { label: 'Returned for revision', tone: 'returned' }
	if (a.submission_stage === 'checklist') return { label: 'Check list pending', tone: 'info' }
	if (a.submission_stage === 'signature') return { label: 'Signature pending', tone: 'info' }
	if (a.submission_stage === 'completed') {
		const claim = (a.claim_status || 'pending') as QpClaimStatus
		if (claim === 'paid') return { label: 'Payment completed', tone: 'success' }
		if (claim === 'approved') return { label: 'Claim approved', tone: 'success' }
		if (claim === 'submitted') return { label: 'Claim under review', tone: 'info' }
		if (a.status === 'accepted') return { label: 'Accepted · claim pending', tone: 'warning' }
		return { label: 'Submitted · claim pending', tone: 'warning' }
	}
	if (a.window_state === 'closed') return { label: 'Entry period ended', tone: 'danger' }
	if (a.window_state === 'pending') return { label: 'Not open yet', tone: 'locked' }
	if (a.status === 'in_progress') return { label: 'In progress', tone: 'info' }
	return { label: 'Ready to start', tone: 'info' }
}

/** One plain sentence: the next thing the examiner has to do on this row. */
function nextStepFor(a: AssignmentSummary): { text: string; tone: Tone } {
	if (a.status === 'cancelled') return { text: 'Cancelled by the CoE — nothing to do.', tone: 'locked' }
	const stage = a.submission_stage
	if (a.status === 'returned') return { text: 'Fix the points raised by the CoE and resubmit.', tone: 'returned' }
	if (stage === 'checklist') return { text: 'Answer the check list.', tone: 'info' }
	if (stage === 'signature') return { text: 'Accept the declaration and sign.', tone: 'info' }
	if (stage === 'completed') {
		const claim = (a.claim_status || 'pending') as QpClaimStatus
		if (claim === 'pending') return { text: 'Submit your claim form.', tone: 'warning' }
		if (claim === 'submitted') return { text: 'Claim under review by the CoE — nothing to do.', tone: 'info' }
		if (claim === 'approved') return { text: 'Claim approved — payment is being processed.', tone: 'success' }
		return { text: 'All done.', tone: 'success' }
	}
	if (a.window_state === 'pending') return { text: `Opens on ${formatIst(a.valid_from)}.`, tone: 'locked' }
	if (a.window_state === 'closed') return { text: 'Entry period ended — contact the CoE if you need it reopened.', tone: 'danger' }
	const c = componentsForType(a.assignment_type || 'question_paper')
	if (c.ak && a.ak_willing == null) return { text: 'Confirm whether you will prepare the answer key.', tone: 'warning' }
	if (a.question_total > 0 && a.question_done < a.question_total) {
		return { text: `Enter the questions (${a.question_done} of ${a.question_total} done).`, tone: 'info' }
	}
	return { text: 'Check every question and submit the paper.', tone: 'info' }
}

const STEP_ICON: Record<Tone, typeof Info> = {
	success: CheckCircle2,
	info: ArrowRight,
	warning: AlertTriangle,
	danger: XCircle,
	locked: Lock,
	returned: RotateCcw,
}

/** "Next: …" line on a card, coloured by tone. */
function NextStep({ a }: { a: AssignmentSummary }) {
	const n = nextStepFor(a)
	const Icon = STEP_ICON[n.tone]
	return (
		<p className={cn('text-xs mt-2 flex items-start gap-1.5 rounded-md border px-2 py-1.5', TONE[n.tone].card, TONE[n.tone].text)}>
			<Icon className={cn('h-3.5 w-3.5 shrink-0 mt-px', TONE[n.tone].icon)} />
			<span>
				<span className="font-semibold">Next:</span> {n.text}
			</span>
		</p>
	)
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
	const pending = !confirmed

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
		<Card className={cn('border-2', pending ? TONE.warning.frame : confirmed && !editing ? TONE.success.frame : TONE.info.frame)}>
			<CardContent className="p-4 space-y-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 className="font-semibold flex items-center gap-2 text-sm uppercase tracking-wide">
							<ShieldCheck className="h-4 w-4" />
							Examiner assignment
							{pending && <ToneBadge tone="warning">Needs your answer</ToneBadge>}
							{confirmed && !editing && <ToneBadge tone="success">Confirmed</ToneBadge>}
							{locked && <ToneBadge tone="locked">Locked</ToneBadge>}
						</h2>
						<p className="text-xs text-muted-foreground mt-0.5">
							{QP_ASSIGNMENT_TYPE_LABELS[type]}
							{confirmed && !editing
								? ` · confirmed ${formatIst(assignment.willingness_confirmed_at)}`
								: c.qp
									? ' · the question paper is part of your appointment. Tick below if you will also prepare the answer key, then press Confirm.'
									: ' · tick below if you will prepare the answer key, then press Confirm.'}
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
					<p className={cn('text-xs flex items-start gap-1.5', TONE.warning.text)}>
						<AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
						Answer key declined — there is no payable examiner claim, and nothing to enter for this paper.
					</p>
				)}
				{c.ak && !ak && !declinedAll && (
					<p className="text-xs text-muted-foreground">
						The answer-key boxes stay visible but locked, and no answer key is needed from you.
					</p>
				)}
				{error && (
					<p className={cn('text-sm rounded-md border p-2 flex items-start gap-1.5', TONE.danger.card, TONE.danger.text)}>
						<AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
						{error}
					</p>
				)}
				{locked && (
					<DisabledReason tone="muted" reason="The paper has been handed over, so this choice can no longer change." />
				)}

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
									setError(e?.message || 'Your choice could not be saved. Please try again.')
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
	const [listTab, setListTab] = useState<ListTab>('active')
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
	const willingnessRef = useRef<HTMLDivElement | null>(null)
	// What the editor says still stands between this paper and Submit.
	const [paperProblems, setPaperProblems] = useState<PaperProblem[]>([])
	const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
	// The editor's "scroll to this field" — used by the tracker's Show me.
	const jumpRef = useRef<((anchor: string) => void) | null>(null)
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
			toast({ title: 'Could not load your papers', description: e.message, variant: 'destructive' })
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
		setProgress({ done: 0, total: 0 })
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

	const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) =>
		requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

	// ── Actions ───────────────────────────────────────────────────────────
	const ownProblems = useMemo(() => paperProblems.filter(p => !p.needsCoe), [paperProblems])
	const coeProblems = useMemo(() => paperProblems.filter(p => p.needsCoe), [paperProblems])

	const submitPaper = async () => {
		if (!openId) return
		if (paperProblems.length > 0) {
			setSubmitOpen(false)
			toast({
				title: 'The paper is not complete yet',
				description: `${paperProblems.length} item${paperProblems.length === 1 ? '' : 's'} still to complete. The fields are outlined in red.`,
				variant: 'destructive',
			})
			if (ownProblems[0]) jumpRef.current?.(ownProblems[0].anchor)
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
			scrollTo(wizardRef)
		} catch (e: any) {
			toast({
				title: e?.code === 'INCOMPLETE' ? 'The paper is not complete yet' : 'Not submitted',
				description: e.message,
				variant: 'destructive',
			})
			// A refused submit may have touched the paper row (a rollback bumps its
			// updated_at). Reload and remount the editor on the server copy so the
			// next autosave does not run into a stale-base conflict. Safe: the draft
			// was flushed above, so there is nothing in the editor to lose.
			await reloadDetail()
			setEditorEpoch(n => n + 1)
			const first = e?.body?.problems?.find((p: PaperProblem) => !p.needsCoe) || e?.body?.problems?.[0]
			if (first?.anchor) setTimeout(() => jumpRef.current?.(first.anchor), 400)
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
			toast({ title: 'Your choice is saved', description: json.message })
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
		const todo = assignments.filter(a => ['info', 'warning', 'returned'].includes(nextStepFor(a).tone))
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
			todo,
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
						key === 'papers'
							? stats.todo.filter(a => a.submission_stage !== 'completed').length
							: key === 'claims'
								? stats.claimPending
								: 0
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

	// ── Active / Archived ─────────────────────────────────────────────────
	// Every list of papers is split the same way: Active is anything whose
	// validity ended less than ARCHIVE_AFTER_DAYS ago (or has not ended), newest
	// validity first; Archived is the rest, kept for reference.
	const { activeList, archivedList } = useMemo(() => {
		const now = Date.now()
		const active = assignments.filter(a => !isArchived(a, now)).sort(byValidToDesc)
		const archived = assignments.filter(a => isArchived(a, now)).sort(byValidToDesc)
		return { activeList: active, archivedList: archived }
	}, [assignments])

	const renderCards = (list: AssignmentSummary[], tab: ListTab) =>
		list.length === 0 ? (
			<Card>
				<CardContent className="p-10 text-center space-y-2">
					<FileText className="h-8 w-8 mx-auto text-muted-foreground" />
					{tab === 'archived' ? (
						<>
							<p className="font-medium">Nothing archived yet</p>
							<p className="text-sm text-muted-foreground max-w-md mx-auto">
								A paper moves here automatically {ARCHIVE_AFTER_DAYS} days after its validity ends. It stays
								available for reference.
							</p>
						</>
					) : assignments.length > 0 ? (
						<>
							<p className="font-medium">No active question papers</p>
							<p className="text-sm text-muted-foreground max-w-md mx-auto">
								Your earlier papers are under Archived.
							</p>
						</>
					) : (
						<>
							<p className="font-medium">No question papers are assigned to you yet</p>
							<p className="text-sm text-muted-foreground max-w-md mx-auto">
								When the Office of the Controller of Examinations appoints you as a question paper setter,
								the paper will appear here and you will receive the order by e-mail.
							</p>
						</>
					)}
				</CardContent>
			</Card>
		) : (
			<div className="space-y-3">
				{list.map(a => {
					const st = overallStatus(a)
					const stage = a.submission_stage
					const claim = claimCell(a)
					const archived = tab === 'archived'
					const cta =
						a.status === 'cancelled'
							? 'View details'
							: stage === 'checklist'
								? 'Complete check list'
								: stage === 'signature'
									? 'Add signature'
									: stage === 'completed'
										? 'View submission'
										: a.window_state === 'open'
											? a.status === 'returned'
												? 'Revise and resubmit'
												: 'Open question paper'
											: 'View details'
					const pct = a.question_total > 0 ? Math.round((a.question_done / a.question_total) * 100) : 0
					return (
						<Card key={a.id} className={cn('hover:shadow-md transition-shadow border-l-4', TONE[st.tone].bar)}>
							<CardContent className="p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<p className="font-semibold flex items-center gap-2">
											{a.course_code}
											{archived && <ToneBadge tone="locked">Archived</ToneBadge>}
										</p>
										<p className="text-sm">{a.subject_title}</p>
										<p className="text-xs text-muted-foreground mt-0.5">{contextLine(a)}</p>

										{/* The facts an examiner asks about, in one row each time. */}
										<dl className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
											<div>
												<dt className="text-muted-foreground">Assignment date</dt>
												<dd className="font-medium mt-0.5">{formatIst(a.assigned_at || a.valid_from, false)}</dd>
											</div>
											<div>
												<dt className="text-muted-foreground">Valid until</dt>
												<dd className={cn('font-medium mt-0.5', a.window_state === 'closed' ? 'text-rose-700' : a.window_state === 'open' ? 'text-emerald-700' : '')}>
													{formatIst(a.valid_to, false)}
												</dd>
											</div>
											<div>
												<dt className="text-muted-foreground">Claim status</dt>
												<dd className="mt-0.5">
													<ToneBadge tone={claim.tone}>{claim.label}</ToneBadge>
												</dd>
											</div>
											<div>
												<dt className="text-muted-foreground">Claim submitted</dt>
												<dd className={cn('font-medium mt-0.5', !a.claim_submitted_at && 'text-muted-foreground font-normal')}>
													{a.claim_submitted_at ? formatIst(a.claim_submitted_at, false) : claim.hint || '—'}
												</dd>
											</div>
										</dl>

										<p className="text-xs mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
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
											<p className={cn('text-xs mt-1.5 flex items-start gap-1 rounded-md border px-2 py-1.5', TONE.returned.card, TONE.returned.text)}>
												<AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
												<span>
													<span className="font-semibold">CoE remarks:</span> {a.return_remarks}
												</span>
											</p>
										)}
										<NextStep a={a} />
									</div>
									<div className="flex flex-col items-end gap-2 shrink-0">
										<ToneBadge tone={st.tone}>{st.label}</ToneBadge>
										<ToneBadge tone={WINDOW_TONE[a.window_state]}>
											{a.window_state === 'open' ? <Clock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
											{a.window_hint}
										</ToneBadge>
										{a.question_total > 0 && stage === 'authoring' && a.status !== 'cancelled' && (
											<div className="w-32 text-right">
												<p className="text-[11px] text-muted-foreground">
													{a.question_done} / {a.question_total} entered
												</p>
												<div className="h-1.5 rounded-full bg-slate-200 overflow-hidden mt-0.5">
													<div
														className={cn('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-blue-500')}
														style={{ width: `${pct}%` }}
													/>
												</div>
											</div>
										)}
									</div>
								</div>
								<div className="mt-3 flex flex-wrap items-center gap-2">
									<span className="text-xs text-muted-foreground mr-1">Actions:</span>
									{stage === 'completed' && (a.claim_status || 'pending') === 'pending' ? (
										<Button size="sm" onClick={() => setSection('claims')}>
											<Receipt className="h-4 w-4 mr-1.5" />
											Submit claim
										</Button>
									) : (
										<Button size="sm" variant={archived ? 'outline' : 'default'} onClick={() => openAssignment(a.id)}>
											{cta}
											<ArrowRight className="h-4 w-4 ml-1.5" />
										</Button>
									)}
									{stage === 'completed' && (a.claim_status || 'pending') !== 'pending' && (
										<Button variant="outline" size="sm" onClick={() => setSection('claims')}>
											<Receipt className="h-4 w-4 mr-1.5" />
											View claim
										</Button>
									)}
									{stage === 'completed' && (a.claim_status || 'pending') === 'pending' && (
										<Button variant="outline" size="sm" onClick={() => openAssignment(a.id)}>
											{cta}
										</Button>
									)}
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

	/** Active | Archived tabs over the same card list, shared by the dashboard and the paper page. */
	const assignmentTabs = (
		<div className="space-y-3">
			<Tabs value={listTab} onValueChange={v => setListTab(v as ListTab)}>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<TabsList className="h-auto p-1 bg-slate-100 border">
						<TabsTrigger value="active" className={cn('gap-1.5 px-4 py-1.5', TAB_TONE.info)}>
							<Clock className="h-3.5 w-3.5" />
							Active
							<span className="rounded-full px-1.5 text-[11px] leading-4 bg-black/10">{activeList.length}</span>
						</TabsTrigger>
						<TabsTrigger value="archived" className={cn('gap-1.5 px-4 py-1.5', TAB_TONE.locked)}>
							<History className="h-3.5 w-3.5" />
							Archived
							<span className="rounded-full px-1.5 text-[11px] leading-4 bg-black/10">{archivedList.length}</span>
						</TabsTrigger>
					</TabsList>
					<p className="text-xs text-muted-foreground">
						{listTab === 'active'
							? 'Newest validity first. Every paper claims on its own — one claim per paper.'
							: `Validity ended more than ${ARCHIVE_AFTER_DAYS} days ago. Kept for reference.`}
					</p>
				</div>
			</Tabs>
			{renderCards(listTab === 'active' ? activeList : archivedList, listTab)}
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
						{[...assignments].sort(byValidToDesc).map(a => {
							const st = overallStatus(a)
							return (
								<div key={a.id} className={cn('p-4 flex flex-wrap items-start justify-between gap-3 border-l-4', TONE[st.tone].bar)}>
									<div className="min-w-0">
										<p className="font-semibold text-sm flex flex-wrap items-center gap-2">
											<span className="font-mono text-xs rounded bg-slate-100 border px-1.5 py-0.5 text-slate-700">
												{a.order_ref_no || 'Order'}
											</span>
											{a.course_code}
											{isArchived(a) && <ToneBadge tone="locked">Archived</ToneBadge>}
										</p>
										<p className="text-sm mt-0.5">{a.subject_title}</p>
										<p className="text-xs text-muted-foreground mt-0.5">{contextLine(a)}</p>
										<dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
											<div>
												<dt className="text-muted-foreground">Order date</dt>
												<dd className="font-medium">{formatIst(a.order_issued_at || a.assigned_at || a.valid_from, false)}</dd>
											</div>
											<div>
												<dt className="text-muted-foreground">Valid until</dt>
												<dd className={cn('font-medium', a.window_state === 'closed' ? 'text-rose-700' : a.window_state === 'open' ? 'text-emerald-700' : '')}>
													{formatIst(a.valid_to, false)}
												</dd>
											</div>
											<div>
												<dt className="text-muted-foreground">Examiner</dt>
												<dd className="font-medium truncate">{examiner.full_name}</dd>
											</div>
										</dl>
									</div>
									<div className="flex flex-col items-end gap-2 shrink-0">
										<ToneBadge tone={st.tone}>{st.label}</ToneBadge>
										<Button variant="outline" size="sm" onClick={() => openDoc(a.id, 'order')}>
											<Download className="h-4 w-4 mr-1.5" />
											View order
										</Button>
									</div>
								</div>
							)
						})}
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
			{assignmentTabs}
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
	const cancelled = a?.status === 'cancelled'
	const handedOver = stage !== 'authoring' || a?.status === 'submitted' || a?.status === 'accepted'

	// Why Submit cannot be pressed right now — or null when it can.
	const submitReason: string | null = !a
		? null
		: coeProblems.length > 0
			? 'Needs a correction from the CoE office first'
			: ownProblems.length > 0
				? `${ownProblems.length} item${ownProblems.length === 1 ? '' : 's'} still to complete`
				: draftSync.state === 'saving'
					? 'Wait a moment — saving your latest changes'
					: draftSync.state === 'unsynced'
						? 'Your latest changes have not reached the server yet'
						: draftSync.state === 'conflict'
							? 'Reload the server copy first'
							: null
	const saveReason: string | null =
		draftSync.state === 'saving'
			? 'Saving…'
			: !draftSync.dirty && draftSync.state !== 'unsynced'
				? 'Nothing new to save — your work is already saved'
				: null

	const openPreview = () => {
		setPreviewQuestions(liveQuestionsRef.current?.() || detail?.questions || [])
		setSubmitOpen(true)
	}

	// ── The tracker: steps + the one sentence that matters ───────────────
	const tracker = useMemo((): { steps: TrackerStep[]; instruction: TrackerInstruction } | null => {
		if (!a) return null
		const steps: TrackerStep[] = []
		const blockedAll = cancelled
		if (aComponents.ak) {
			steps.push({
				key: 'willing',
				label: 'Confirm answer key',
				state: a.willingness_confirmed_at ? 'done' : blockedAll ? 'blocked' : 'current',
			})
		}
		const paperState: StepState = handedOver
			? 'done'
			: blockedAll || declinedAll || !released
				? 'blocked'
				: willingnessPending
					? 'todo'
					: paperProblems.length > 0 || progress.done < progress.total
						? 'current'
						: 'done'
		steps.push({ key: 'paper', label: 'Set the paper', state: paperState })
		steps.push({
			key: 'submit',
			label: 'Submit',
			state: handedOver ? 'done' : paperState === 'done' ? 'current' : paperState === 'blocked' ? 'blocked' : 'todo',
		})
		steps.push({
			key: 'checklist',
			label: 'Check list',
			state: stage === 'signature' || stage === 'completed' ? 'done' : stage === 'checklist' ? 'current' : 'todo',
		})
		steps.push({
			key: 'sign',
			label: 'Sign',
			state: stage === 'completed' ? 'done' : stage === 'signature' ? 'current' : 'todo',
		})
		steps.push({ key: 'done', label: 'Done', state: stage === 'completed' ? 'done' : 'todo' })

		let instruction: TrackerInstruction
		const claim = (a.claim_status || 'pending') as QpClaimStatus
		if (cancelled) {
			instruction = {
				tone: 'locked',
				title: 'This appointment was cancelled',
				detail: 'Nothing more is needed from you. Contact the Office of the Controller of Examinations if you think this is a mistake.',
			}
		} else if (stage === 'completed') {
			instruction =
				claim === 'pending'
					? {
							tone: 'success',
							title: 'Submission complete — your claim form is ready',
							detail: a.status === 'accepted'
								? `Accepted by the CoE on ${formatIst(a.accepted_at)}. Fill in the claim form to receive your remuneration.`
								: 'Fill in the claim form to receive your remuneration.',
							action: { label: 'Go to Claim Form', onClick: () => setSection('claims') },
						}
					: {
							tone: 'success',
							title: 'Submission complete',
							detail:
								claim === 'submitted'
									? 'Your claim is under review by the CoE. Nothing more to do for now.'
									: claim === 'approved'
										? 'Your claim is approved and payment is being processed.'
										: 'Payment has been completed. Thank you.',
						}
		} else if (stage === 'checklist') {
			instruction = {
				tone: 'info',
				title: 'Paper received. Now answer the check list.',
				detail: 'Answer YES or NO to every item, then continue to the signature. The paper stays visible below for reference.',
				action: { label: 'Go to check list', onClick: () => scrollTo(wizardRef) },
			}
		} else if (stage === 'signature') {
			instruction = {
				tone: 'info',
				title: a.signed_at ? 'Signed. Complete the submission to finish.' : 'Almost done — accept the declaration and sign.',
				detail: a.signed_at
					? 'Read the red notice, then press Complete submission.'
					: 'Tick the declaration, sign in the box, then press Save signature.',
				action: { label: a.signed_at ? 'Go to final step' : 'Go to signature', onClick: () => scrollTo(wizardRef) },
			}
		} else if (state === 'pending') {
			instruction = {
				tone: 'locked',
				title: 'This paper is not open yet',
				detail: `You can enter questions from ${formatIst(a.valid_from)}. Until then, read the instructions and your order copy.`,
			}
		} else if (state === 'closed') {
			instruction = {
				tone: 'danger',
				title: 'The entry period has ended',
				detail: `Access closed on ${formatIst(a.valid_to)}. Contact the Office of the Controller of Examinations if you need it reopened.`,
			}
		} else if (willingnessPending) {
			instruction = {
				tone: 'warning',
				title: 'First, tell us whether you will prepare the answer key',
				detail: 'Tick your choice in the Examiner Assignment box and press Confirm. The paper opens right after.',
				action: { label: 'Show me', onClick: () => scrollTo(willingnessRef) },
			}
		} else if (declinedAll) {
			instruction = {
				tone: 'locked',
				title: 'Nothing to enter for this paper',
				detail: 'You declined the answer key. If that was a mistake, press Change in the Examiner Assignment box.',
			}
		} else if (!canEdit) {
			instruction = {
				tone: 'locked',
				title: 'This paper is read-only',
				detail: 'It has been handed over. Nothing on it can be changed.',
			}
		} else if (coeProblems.length > 0) {
			instruction = {
				tone: 'danger',
				title: 'This paper needs a correction from the CoE office before it can be submitted',
				detail: coeProblems[0].message,
			}
		} else if (ownProblems.length > 0) {
			const n = ownProblems.length
			instruction = {
				tone: a.status === 'returned' ? 'returned' : 'warning',
				title:
					a.status === 'returned'
						? `Returned for revision — ${n} item${n === 1 ? '' : 's'} to complete before you resubmit`
						: `${n} item${n === 1 ? '' : 's'} to complete before you can submit`,
				detail: `${progress.done} of ${progress.total} questions entered. Fields that need a value are outlined in red. Your work saves automatically.`,
				action: { label: 'Show me', onClick: () => jumpRef.current?.(ownProblems[0].anchor) },
			}
		} else {
			instruction = {
				tone: a.status === 'returned' ? 'returned' : 'success',
				title:
					a.status === 'returned'
						? 'Every question is complete — review and resubmit'
						: 'Every question is complete — review and submit',
				detail: 'Submitting hands the paper to the CoE and closes the editor. You will then answer the check list and sign.',
				action: {
					label: a.status === 'returned' ? 'Review and resubmit' : 'Review and submit',
					onClick: openPreview,
					disabled: !!submitReason,
					reason: submitReason,
					busy: submitting,
				},
			}
		}
		return { steps, instruction }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		a, aComponents.ak, cancelled, handedOver, declinedAll, released, willingnessPending, paperProblems,
		ownProblems, coeProblems, progress, stage, state, canEdit, submitReason, submitting,
	])

	const editingStatus = a && canEdit && released && stage === 'authoring' && !willingnessPending && !declinedAll && (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<ToneBadge tone={progress.total > 0 && progress.done === progress.total ? 'success' : 'info'}>
					{progress.done} / {progress.total} entered
				</ToneBadge>
				{paperProblems.length === 0 ? (
					<ToneBadge tone="success">
						<CheckCircle2 className="h-3 w-3" />
						Ready to submit
					</ToneBadge>
				) : (
					<ToneBadge tone={coeProblems.length ? 'danger' : 'warning'}>
						<AlertTriangle className="h-3 w-3" />
						{paperProblems.length} to fix
					</ToneBadge>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<SyncBadge state={draftSync.state} dirty={draftSync.dirty} savedAt={draftSync.savedAt} />
				<Button
					size="sm"
					variant="outline"
					className="h-7"
					onClick={() => void saveDraftRef.current?.()}
					disabled={!!saveReason}
					title={saveReason || 'Save your progress now'}
				>
					{draftSync.state === 'saving' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
					Save Draft
				</Button>
			</div>
		</>
	)

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

			{tracker && <PaperStepTracker steps={tracker.steps} instruction={tracker.instruction} status={editingStatus} />}

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
						<div className="flex flex-col items-end gap-1.5 shrink-0">
							<ToneBadge tone={overallStatus({ ...a, window_state: state } as any).tone}>
								{overallStatus({ ...a, window_state: state } as any).label}
							</ToneBadge>
							<ToneBadge tone={WINDOW_TONE[state]}>
								{state === 'open' ? <Clock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
								{detail.window_hint || windowHint(a.valid_from, a.valid_to)}
							</ToneBadge>
						</div>
					</div>

					{a.return_remarks && (
						<div className={cn('mt-3 rounded-md border-2 p-3 text-sm', TONE.returned.card, TONE.returned.frame)}>
							<p className={cn('font-semibold flex items-center gap-1.5', TONE.returned.heading)}>
								<RotateCcw className="h-4 w-4" />
								{a.reopen_scope === 'answer_key'
									? 'Answer key added to your appointment by the CoE'
									: 'Returned for revision by the CoE'}
								{a.paper_version > 0 && (
									<span className={cn('font-normal', TONE.returned.text)}>· your submission V{a.paper_version} is on record</span>
								)}
							</p>
							<p className={cn('mt-1', TONE.returned.text)}>
								<span className="font-semibold">What they asked for:</span> {a.return_remarks}
							</p>
							{a.reopened_at && (
								<p className={cn('text-xs mt-1', TONE.returned.text)}>
									Reopened on {formatIst(a.reopened_at)}. Your resubmission will be saved as V{(a.paper_version || 0) + 1}; V{a.paper_version || 1} is kept unchanged.
								</p>
							)}
						</div>
					)}

					{handedOver && (
						<div className={cn('mt-3 rounded-md border p-3 text-sm flex items-start gap-2', TONE.locked.card, TONE.locked.text)}>
							<Lock className={cn('h-4 w-4 shrink-0 mt-0.5', TONE.locked.icon)} />
							<p>
								<span className="font-semibold">This paper has been handed over{a.paper_version > 0 && <> as version V{a.paper_version}</>}.</span>{' '}
								Any reopening and later change is permanently recorded in the audit log.
							</p>
						</div>
					)}

					{a.status === 'accepted' && (
						<div className={cn('mt-3 rounded-md border p-3 text-sm flex items-center gap-2', TONE.success.card, TONE.success.text)}>
							<CheckCircle2 className={cn('h-4 w-4', TONE.success.icon)} />
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
			{aComponents.ak && stage === 'authoring' && !cancelled && (
				<div ref={willingnessRef} className="scroll-mt-40">
					<WillingnessCard
						assignment={a}
						locked={!['assigned', 'in_progress', 'returned'].includes(a.status)}
						onConfirm={confirmWillingness}
					/>
				</div>
			)}

			{/* Instructions */}
			{content?.instructions?.body?.length > 0 && stage === 'authoring' && (
				<Card className={cn('border-2 overflow-hidden', TONE.info.frame)}>
					<div className={cn('px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2', TONE.info.solid)}>
						<h2 className="font-semibold flex items-center gap-2 text-base">
							<ScrollText className="h-5 w-5" />
							{content.instructions.title || 'Instructions to the Question Paper Setter'}
						</h2>
						<span className="text-xs rounded-full bg-white/20 px-2.5 py-1 font-medium">Please read before you start</span>
					</div>
					<CardContent className="p-4 sm:p-5">
						<ol className="space-y-2.5">
							{content.instructions.body.map((c: any, i: number) => {
								// The two rules whose breach has consequences beyond this paper
								// — confidentiality and originality — are marked so they are
								// never read as routine formatting advice.
								const critical = /confidential|original|must not be shared|do not reproduce/i.test(String(c.text))
								return (
									<li
										key={c.id}
										className={cn(
											'flex gap-3 text-sm rounded-md px-2 py-1.5 -mx-2',
											critical && 'bg-rose-50 border border-rose-200'
										)}
									>
										<span
											className={cn(
												'h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold',
												critical ? 'bg-rose-600 text-white' : 'bg-blue-100 text-blue-800'
											)}
										>
											{i + 1}
										</span>
										<span className={cn('leading-relaxed text-slate-800', critical && 'font-medium text-rose-900')}>
											{c.text}
											{critical && (
												<span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-600 text-white text-[10px] uppercase tracking-wide px-1.5 py-0.5 align-middle">
													<AlertTriangle className="h-3 w-3" />
													Important
												</span>
											)}
										</span>
									</li>
								)
							})}
						</ol>
						<div
							className={cn(
								'mt-4 rounded-md border px-3 py-2 text-sm flex flex-wrap items-center gap-x-2 gap-y-1',
								state === 'closed' ? TONE.danger.card : state === 'open' ? TONE.warning.card : TONE.locked.card,
								state === 'closed' ? TONE.danger.text : state === 'open' ? TONE.warning.text : TONE.locked.text
							)}
						>
							<Clock className="h-4 w-4 shrink-0" />
							<span className="font-semibold">Deadline:</span>
							<span>submit by {formatIst(a.valid_to)}</span>
							<span className="text-xs opacity-80">({detail.window_hint || windowHint(a.valid_from, a.valid_to)})</span>
						</div>
					</CardContent>
				</Card>
			)}

			{/* The submit walk */}
			{stage !== 'authoring' && (
				<div ref={wizardRef} className="scroll-mt-40">
					<SubmissionWizard
						assignmentId={a.id}
						stage={stage}
						assignment={a}
						content={content}
						savedSignatureUrl={profile?.signature_url || null}
						bank={profile?.bank || null}
						onEditProfile={() => setSection('profile')}
						onStep={runWizardStep}
						onAdvanced={reloadDetail}
					/>
				</div>
			)}

			{/* The paper itself */}
			{cancelled ? (
				<Card className={cn('border-2', TONE.locked.frame)}>
					<CardContent className="p-8 text-center space-y-2">
						<Lock className="h-8 w-8 mx-auto text-muted-foreground" />
						<p className="font-medium">This appointment was cancelled</p>
						<p className="text-sm text-muted-foreground max-w-md mx-auto">
							The paper is closed. Contact the Office of the Controller of Examinations if you think this is a mistake.
						</p>
					</CardContent>
				</Card>
			) : released && stage === 'authoring' && willingnessPending ? (
				<Card className={cn('border-2', TONE.warning.frame)}>
					<CardContent className="p-8 text-center space-y-2">
						<ShieldCheck className="h-8 w-8 mx-auto text-amber-600" />
						<p className="font-medium">Confirm your answer-key choice first</p>
						<p className="text-sm text-muted-foreground max-w-md mx-auto">
							Tick your choice in the Examiner Assignment box above and press Confirm. The paper opens as
							soon as you do.
						</p>
						<Button size="sm" variant="outline" onClick={() => scrollTo(willingnessRef)}>
							Show me
						</Button>
					</CardContent>
				</Card>
			) : released && stage === 'authoring' && declinedAll ? (
				<Card className={cn('border-2', TONE.locked.frame)}>
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
				<Card className={cn('border-2', stage === 'completed' || state === 'pending' ? TONE.locked.frame : TONE.danger.frame)}>
					<CardContent className="p-8 text-center space-y-2">
						<Lock className={cn('h-8 w-8 mx-auto', stage === 'completed' || state === 'pending' ? 'text-muted-foreground' : 'text-rose-500')} />
						<p className="font-medium">
							{stage === 'completed'
								? 'This question paper is closed'
								: state === 'pending'
									? 'This question paper is not open yet'
									: 'The entry period has ended'}
						</p>
						<p className="text-sm text-muted-foreground max-w-md mx-auto">
							{stage === 'completed'
								? 'Your submission is complete. For confidentiality the question content cannot be viewed again. Contact the Office of the Controller of Examinations if a change is needed.'
								: state === 'pending'
									? `The paper becomes available on ${formatIst(a.valid_from)}. Until then you can read the instructions and view your order.`
									: `Access closed on ${formatIst(a.valid_to)}. Contact the Office of the Controller of Examinations if you need the period reopened.`}
						</p>
					</CardContent>
				</Card>
			) : (
				<>
					{!canEdit && (
						<div className={cn('rounded-md border px-3.5 py-2.5 text-sm flex items-center gap-2', TONE.locked.card, TONE.locked.text)}>
							<Eye className={cn('h-4 w-4 shrink-0', TONE.locked.icon)} />
							<span>
								<span className="font-semibold">Preview only.</span> This paper has been submitted and can no longer
								be edited. It cannot be downloaded or printed.
							</span>
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
							onProgressChange={setProgress}
							jumpRef={jumpRef}
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
						<Card className={cn('border-2', submitReason ? TONE.warning.frame : TONE.success.frame)}>
							<CardContent className="space-y-3 p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="text-sm">
										<p className="font-semibold">Save your progress, or submit</p>
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
								<div className="flex flex-wrap items-start gap-x-4 gap-y-2">
									<div className="flex flex-col gap-1">
										<Button
											variant="outline"
											onClick={() => void saveDraftRef.current?.()}
											disabled={!!saveReason}
										>
											{draftSync.state === 'saving' ? (
												<Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
											) : (
												<Save className="h-4 w-4 mr-1.5" />
											)}
											Save Draft
										</Button>
										<DisabledReason tone="muted" reason={saveReason} />
									</div>
									<div className="flex flex-col gap-1">
										<Button onClick={openPreview} disabled={!!submitReason || submitting} title={submitReason || undefined}>
											{submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
											{a.status === 'returned' ? 'Resubmit question paper' : 'Submit question paper'}
										</Button>
										<DisabledReason reason={submitReason} />
									</div>
									{ownProblems.length > 0 && (
										<Button variant="ghost" size="sm" className="self-center" onClick={() => jumpRef.current?.(ownProblems[0].anchor)}>
											Show me the first item
											<ArrowRight className="h-4 w-4 ml-1.5" />
										</Button>
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
						{ label: 'Assigned', value: stats.assigned, icon: FileText, tone: 'locked' as Tone },
						{ label: 'Submitted', value: stats.submitted, icon: CheckCircle2, tone: 'success' as Tone },
						{ label: 'Claims Pending', value: stats.claimPending, icon: Clock, tone: 'warning' as Tone },
						{ label: 'Claims Submitted', value: stats.claimSubmitted, icon: Receipt, tone: 'info' as Tone },
						{ label: 'Claims Approved', value: stats.claimApproved, icon: BadgeCheck, tone: 'success' as Tone },
						{ label: 'Payments Completed', value: stats.paid, icon: Wallet, tone: 'success' as Tone },
					].map(({ label, value, icon: Icon, tone }) => (
						<Card key={label} className={cn('border-l-4', TONE[tone].bar)}>
							<CardContent className="p-3.5">
								<div className="flex items-center justify-between gap-2">
									<p className="text-xs text-muted-foreground truncate">{label}</p>
									<Icon className={cn('h-4 w-4 shrink-0', TONE[tone].icon)} />
								</div>
								<p className={cn('text-2xl font-semibold mt-1', TONE[tone].heading)}>{value}</p>
							</CardContent>
						</Card>
					))}
				</div>

				{stats.todo.length > 0 && (
					<Card className={cn('border-2', TONE.info.frame, 'bg-blue-50/40')}>
						<CardContent className="p-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="flex items-start gap-2.5">
									<ListChecks className={cn('h-5 w-5 shrink-0 mt-0.5', TONE.info.icon)} />
									<div>
										<p className={cn('font-semibold text-sm', TONE.info.heading)}>
											{stats.todo.length} paper{stats.todo.length === 1 ? ' needs' : 's need'} something from you
										</p>
										<p className={cn('text-xs mt-0.5', TONE.info.text)}>
											Open a paper below, or use the Question Paper page.
										</p>
									</div>
								</div>
								<Button size="sm" onClick={() => setSection('papers')}>
									Go to Question Paper
									<ArrowRight className="h-4 w-4 ml-1.5" />
								</Button>
							</div>
							<ul className="mt-3 space-y-1">
								{stats.todo.slice(0, 5).map(t => {
									const n = nextStepFor(t)
									const Icon = STEP_ICON[n.tone]
									return (
										<li key={t.id}>
											<button
												type="button"
												onClick={() => openAssignment(t.id)}
												className="w-full text-left text-xs rounded-md px-2 py-1.5 hover:bg-white/70 flex items-center gap-2"
											>
												<Icon className={cn('h-3.5 w-3.5 shrink-0', TONE[n.tone].icon)} />
												<span className="font-medium shrink-0">{t.course_code}</span>
												<span className="text-muted-foreground truncate">{n.text}</span>
											</button>
										</li>
									)
								})}
								{stats.todo.length > 5 && (
									<li className="text-xs text-muted-foreground px-2">… and {stats.todo.length - 5} more</li>
								)}
							</ul>
						</CardContent>
					</Card>
				)}

				{/* The colour legend — learn it once. */}
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
					<span className="font-medium text-slate-700">Colours:</span>
					{TONE_LEGEND.map(l => (
						<span key={l.tone} className="inline-flex items-center gap-1">
							<span className={cn('inline-block h-2.5 w-2.5 rounded-full', TONE[l.tone].solid)} />
							{l.label}
						</span>
					))}
				</div>

				<div>
					<h2 className="font-semibold text-sm mb-2">Assignments</h2>
					{assignmentTabs}
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
				onJump={anchor => setTimeout(() => jumpRef.current?.(anchor), 150)}
			/>
		</div>
	)
}
