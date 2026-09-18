'use client'

// The post-submit walk: Claim Form → Check List → Signature → Final Submit.
// The claim form comes first because the check list asks the examiner to
// confirm it; an examiner whose claim is already in skips straight to the list.
//
// The examiner never has to find the next page. Submitting the paper opens this
// at the check list; finishing the check list moves straight to the signature;
// signing enables the final submit. Closing the browser mid-walk is safe — the
// stage lives in the database, so re-opening the assignment resumes here at the
// same step.
//
// The overall journey (paper → submit → claim form → check list → sign → done) is drawn by
// the sticky tracker at the top of the page, so this component shows only the
// step in hand, with every gated button explaining why it is disabled.
//
// The ordering is enforced on the SERVER (see the submission route). What this
// component does is make the next step obvious, not make it safe.

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Loader2, ListChecks, PenLine, CheckCircle2, ShieldCheck, ArrowRight, Lock, AlertTriangle, Send, Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIst } from '@/lib/qp-portal/ist'
import { readChecklistAnswers, type QpSubmissionStage } from '@/types/qp-examiner-assignment'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignaturePad } from './signature-pad'
import { TONE } from './tones'
import { DisabledReason } from './paper-step-tracker'
import { BANK_FIELDS } from './claim-section'
import { formatRupees } from '@/lib/qp-portal/fees'

interface Clause {
	id: string
	text: string
	note?: string | null
	/** When set, a YES answer needs a short detail, prompted with this label. */
	detail_label?: string | null
}

type Draft = { answer?: 'YES' | 'NO'; detail?: string }

interface Props {
	assignmentId: string
	stage: QpSubmissionStage
	assignment: any
	/** ia_qp_portal_content rows: checklist + declaration. */
	content: any
	savedSignatureUrl?: string | null
	/**
	 * The bank details on the examiner's profile. The claim form is pre-filled
	 * from these, so a check list item that asks "are the bank details on the
	 * claim form correct?" — asked BEFORE any claim exists — is answered against
	 * them: they are shown inline under that item.
	 */
	bank?: Record<string, string | null | undefined> | null
	/**
	 * Submits the claim form for this assignment. The claim comes BEFORE the
	 * check list, because the check list asks the examiner to confirm it.
	 */
	onSubmitClaim?: (bank: Record<string, string>) => Promise<void>
	/** POSTs one wizard step; resolves with the server's reply. */
	onStep: (body: Record<string, unknown>) => Promise<any>
	/** Re-read the assignment after a step lands. */
	onAdvanced: () => Promise<void> | void
}

/** Does this check list item ask about the bank details / claim form? */
function isBankClause(c: Clause): boolean {
	return /bank|account|ifsc|claim form/i.test(String(c.text || ''))
}

const BANK_LABELS: { key: string; label: string }[] = [
	{ key: 'account_holder', label: 'Account holder' },
	{ key: 'bank_name', label: 'Bank' },
	{ key: 'branch', label: 'Branch' },
	{ key: 'account_number', label: 'Account number' },
	{ key: 'ifsc', label: 'IFSC' },
]

/** Account number with only the last four digits readable — enough to recognise, not enough to copy. */
function maskAccount(v: string | null | undefined): string {
	const s = String(v || '').replace(/\s+/g, '')
	if (!s) return '—'
	return s.length <= 4 ? s : `${'•'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`
}

function StepHeading({
	n,
	icon: Icon,
	title,
	subtitle,
}: {
	n: number
	icon: typeof ListChecks
	title: string
	subtitle?: string
}) {
	return (
		<div className="flex items-start gap-3">
			<span className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold', TONE.info.solid)}>
				{n}
			</span>
			<div className="min-w-0">
				<h2 className="font-semibold flex items-center gap-2">
					<Icon className="h-4 w-4" />
					{title}
				</h2>
				{subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
			</div>
		</div>
	)
}

export function SubmissionWizard({
	assignmentId,
	stage,
	assignment,
	content,
	savedSignatureUrl,
	bank,
	onSubmitClaim,
	onStep,
	onAdvanced,
}: Props) {
	// ── The claim form (the step before the check list) ───────────────────
	const claimPending = (assignment?.claim_status || 'pending') === 'pending'
	/** The account the claim was submitted with — what the check list item is about. */
	const claimBank: Record<string, string | null | undefined> = {
		account_holder: assignment?.claim_account_holder,
		bank_name: assignment?.claim_bank_name,
		branch: assignment?.claim_branch,
		account_number: assignment?.claim_account_number,
		ifsc: assignment?.claim_ifsc,
	}
	const [claimForm, setClaimForm] = useState<Record<string, string>>(() =>
		Object.fromEntries(BANK_FIELDS.map(f => [f.key, String(bank?.[f.key] || '')]))
	)
	const [claimTouched, setClaimTouched] = useState<Record<string, boolean>>({})
	// The profile loads a moment after the page: fill the blanks when it lands,
	// never over something the examiner has already typed.
	useEffect(() => {
		if (!bank) return
		setClaimForm(prev => Object.fromEntries(BANK_FIELDS.map(f => [f.key, prev[f.key] || String(bank[f.key] || '')])))
	}, [bank])
	const claimErrors = useMemo(
		() => Object.fromEntries(BANK_FIELDS.map(f => [f.key, f.validate(String(claimForm[f.key] || ''))])),
		[claimForm]
	)
	const claimComplete = BANK_FIELDS.every(f => !claimErrors[f.key])
	const clauses: Clause[] = useMemo(() => content?.checklist?.body || [], [content])
	const declarationClauses: Clause[] = useMemo(() => content?.declaration?.body || [], [content])

	// Answers start from whatever is already stored, so a resumed check list is
	// not blank.
	const fromStored = (raw: unknown): Record<string, Draft> =>
		Object.fromEntries(
			Object.entries(readChecklistAnswers(raw)).map(([id, a]) => [id, { answer: a.answer, detail: a.detail || '' }])
		)
	const [answers, setAnswers] = useState<Record<string, Draft>>(() => fromStored(assignment?.checklist))
	const [declarationAccepted, setDeclarationAccepted] = useState(false)
	const [signature, setSignature] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	/** Clause ids the server said were missing — outlined in red until answered. */
	const [flagged, setFlagged] = useState<string[]>([])

	useEffect(() => {
		setAnswers(fromStored(assignment?.checklist))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [assignment?.checklist])

	const itemDone = (c: Clause) => {
		const a = answers[c.id]
		if (!a?.answer) return false
		if (c.detail_label && a.answer === 'YES' && !String(a.detail || '').trim()) return false
		return true
	}
	const answeredCount = clauses.filter(itemDone).length
	const allAnswered = clauses.length > 0 && answeredCount === clauses.length
	const setAnswer = (id: string, answer: 'YES' | 'NO') => {
		setAnswers(prev => ({ ...prev, [id]: { ...prev[id], answer } }))
		setFlagged(f => f.filter(x => x !== id))
	}
	const setDetail = (id: string, detail: string) =>
		setAnswers(prev => ({ ...prev, [id]: { ...prev[id], detail } }))
	const alreadySigned = !!assignment?.signed_at

	const run = async (body: Record<string, unknown>) => {
		setBusy(true)
		setError(null)
		try {
			await onStep(body)
			// The parent has already moved the page on from the server's reply;
			// the re-read only reconciles, so it is not waited for.
			void onAdvanced()
		} catch (e: any) {
			setError(e?.message || 'That step could not be completed. Please try again.')
			const ids = e?.body?.unanswered
			if (Array.isArray(ids)) setFlagged(ids.map(String))
		} finally {
			setBusy(false)
		}
	}

	// Signing and completing are two records on the server (the signature, then
	// the hand-over), but ONE decision for the examiner — so one button does
	// both. If the second call fails the signature is already saved: the page
	// reloads into the "Signed" state, where Complete submission finishes it.
	const signAndComplete = async () => {
		setBusy(true)
		setError(null)
		try {
			// One request: the server saves the signature and completes the
			// submission together (`complete: true`).
			await onStep({ step: 'signature', signature, declaration_accepted: declarationAccepted, complete: true })
		} catch (e: any) {
			setError(e?.message || 'That step could not be completed. Please try again.')
		} finally {
			void onAdvanced()
			setBusy(false)
		}
	}

	const errorBanner = error && (
		<div className={cn('rounded-md border p-3 text-sm flex items-start gap-2', TONE.danger.card, TONE.danger.text)} role="alert">
			<AlertTriangle className={cn('h-4 w-4 shrink-0 mt-0.5', TONE.danger.icon)} />
			<p>
				<span className="font-semibold">Not saved.</span> {error}
			</p>
		</div>
	)

	// ── Completed ─────────────────────────────────────────────────────────
	if (stage === 'completed') {
		return (
			<Card className={cn('border-2', TONE.success.frame)}>
				<CardContent className="p-5 space-y-4">
					<div className="flex items-start gap-3">
						<span className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0', TONE.success.solid)}>
							<CheckCircle2 className="h-5 w-5" />
						</span>
						<div className="min-w-0">
							<h2 className="font-semibold">Question paper submission completed</h2>
							<p className="text-sm text-muted-foreground mt-0.5">
								{assignment?.course_code} — {assignment?.subject_title}
							</p>
						</div>
					</div>

					<div className="rounded-md border divide-y text-sm">
						{[
							['Question paper', 'Submitted', assignment?.submitted_at],
							['Check list', 'Completed', assignment?.checklist_completed_at],
							['Signature', 'Completed', assignment?.signed_at],
							['Final submission', 'Completed', assignment?.final_submitted_at],
						].map(([label, value, at]) => (
							<div key={label as string} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
								<span className="text-muted-foreground">{label as string}</span>
								<span className="flex items-center gap-2 text-right">
									<span className={cn('font-medium inline-flex items-center gap-1', TONE.success.text)}>
										<CheckCircle2 className="h-3.5 w-3.5" />
										{value as string}
									</span>
									{at && (
										<span className="text-xs text-muted-foreground hidden sm:inline">
											{formatIst(at as string)}
										</span>
									)}
								</span>
							</div>
						))}
					</div>

					<div className={cn('rounded-md border p-3 text-sm flex items-start gap-2', TONE.locked.card, TONE.locked.text)}>
						<Lock className={cn('h-4 w-4 shrink-0 mt-0.5', TONE.locked.icon)} />
						<p>
							The question paper is now closed. For confidentiality it cannot be viewed, downloaded or
							printed again. Contact the Office of the Controller of Examinations if a change is needed.
						</p>
					</div>
				</CardContent>
			</Card>
		)
	}

	// ── Step 1: the claim form ────────────────────────────────────────────
	// Shown until the claim is in. An examiner whose claim was already submitted
	// (an earlier submission, a resubmission after a return) never sees it and
	// goes straight to the check list.
	if (stage === 'checklist' && claimPending && onSubmitClaim) {
		const missing = BANK_FIELDS.filter(f => claimErrors[f.key]).length
		const amount = assignment?.claim_amount ?? assignment?.remuneration
		return (
			<Card className={cn('border-2', TONE.info.frame)}>
				<CardContent className="p-5 space-y-4">
					<StepHeading
						n={1}
						icon={Receipt}
						title="Claim Form"
						subtitle="Your question paper has been received. Enter the bank account your remuneration should be paid to, then continue to the check list."
					/>

					<div className="rounded-md border bg-slate-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
						<span className="text-muted-foreground">
							{assignment?.course_code} — {assignment?.subject_title}
						</span>
						{amount != null && (
							<span>
								<span className="text-muted-foreground mr-1.5">Claim</span>
								<span className="font-semibold text-emerald-700">{formatRupees(Number(amount))}</span>
							</span>
						)}
					</div>

					<div>
						<p className="text-xs text-muted-foreground mb-2">
							All fields are mandatory. <span className="text-rose-600">*</span>
						</p>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							{BANK_FIELDS.map(f => {
								const message = claimTouched[f.key] ? claimErrors[f.key] : null
								return (
									<div key={f.key} className={f.key === 'account_holder' ? 'sm:col-span-2' : ''}>
										<Label htmlFor={`wiz-claim-${f.key}`} className={cn('text-xs', message && 'text-rose-700')}>
											{f.label} <span className="text-rose-600">*</span>
										</Label>
										<Input
											id={`wiz-claim-${f.key}`}
											value={claimForm[f.key] || ''}
											placeholder={f.placeholder}
											required
											aria-required
											aria-invalid={!!message}
											inputMode={f.key === 'account_number' ? 'numeric' : undefined}
											autoCapitalize={f.key === 'ifsc' ? 'characters' : undefined}
											maxLength={f.key === 'ifsc' ? 11 : f.key === 'account_number' ? 20 : 200}
											disabled={busy}
											onChange={e =>
												setClaimForm(p => ({
													...p,
													[f.key]: f.key === 'ifsc' ? e.target.value.toUpperCase() : e.target.value,
												}))
											}
											onBlur={() => setClaimTouched(p => ({ ...p, [f.key]: true }))}
											className={cn('mt-1', message && 'border-rose-400 bg-rose-50/40 focus-visible:ring-rose-400')}
										/>
										{message ? (
											<p className="text-[11px] text-rose-700 mt-1 flex items-start gap-1" role="alert">
												<AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
												{message}
											</p>
										) : (
											f.hint && <p className="text-[11px] text-muted-foreground mt-1">{f.hint}</p>
										)}
									</div>
								)
							})}
						</div>
					</div>

					<p className="text-xs rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-800">
						<span className="font-semibold text-rose-700">Check every digit — the claim is paid to this account.</span>{' '}
						Once submitted, only the Office of the Controller of Examinations can reopen it.
					</p>

					{errorBanner}

					<div className="flex flex-col items-end gap-1">
						<Button
							disabled={busy}
							onClick={async () => {
								setClaimTouched(Object.fromEntries(BANK_FIELDS.map(f => [f.key, true])))
								if (!claimComplete) return
								setBusy(true)
								setError(null)
								try {
									await onSubmitClaim({
										...claimForm,
										account_number: String(claimForm.account_number || '').replace(/\s+/g, ''),
										ifsc: String(claimForm.ifsc || '').trim().toUpperCase(),
									})
									void onAdvanced()
								} catch (e: any) {
									setError(e?.message || 'The claim could not be submitted. Please try again.')
								} finally {
									setBusy(false)
								}
							}}
						>
							{busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
							Submit claim and continue
							<ArrowRight className="h-4 w-4 ml-1.5" />
						</Button>
						{!claimComplete && Object.keys(claimTouched).length > 0 && (
							<DisabledReason reason={`${missing} field${missing === 1 ? '' : 's'} still to correct`} />
						)}
					</div>
				</CardContent>
			</Card>
		)
	}

	// ── Step 2: check list ────────────────────────────────────────────────
	if (stage === 'checklist') {
		const remaining = clauses.length - answeredCount
		return (
			<Card className={cn('border-2', TONE.info.frame)}>
				<CardContent className="p-5 space-y-4">
					<StepHeading
						n={2}
						icon={ListChecks}
						title={content?.checklist?.title || 'Question Paper Check List'}
						subtitle="Your question paper has been received. Answer YES or NO to every item to continue."
					/>

					{clauses.length === 0 ? (
						<div className={cn('rounded-md border p-3 text-sm', TONE.warning.card, TONE.warning.text)}>
							No check list has been published for this examination. Contact the Office of the Controller
							of Examinations.
						</div>
					) : (
						<div className="rounded-md border divide-y overflow-hidden">
							{clauses.map((c, i) => {
								const a = answers[c.id] || {}
								const needsDetail = !!c.detail_label && a.answer === 'YES'
								const detailMissing = needsDetail && !String(a.detail || '').trim()
								const done = itemDone(c)
								const isFlagged = flagged.includes(c.id) && !done
								return (
									<div
										key={c.id}
										className={cn(
											'px-3.5 py-3 space-y-2 border-l-4',
											done ? 'border-l-emerald-400 bg-emerald-50/30' : isFlagged ? 'border-l-rose-500 bg-rose-50/50' : 'border-l-amber-300'
										)}
									>
										<div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
											<span className="text-sm flex-1 min-w-[200px]">
												<span className="text-muted-foreground mr-1.5">{i + 1}.</span>
												{c.text}
												{c.note && <span className="text-muted-foreground italic"> ({c.note})</span>}
												{!done && (
													<span className={cn('ml-2 text-[11px] font-medium', isFlagged ? 'text-rose-700' : 'text-amber-700')}>
														{detailMissing ? 'Detail needed' : 'Not answered'}
													</span>
												)}
											</span>
											<div
												role="radiogroup"
												aria-label={c.text}
												className="inline-flex rounded-md border overflow-hidden shrink-0"
											>
												{(['YES', 'NO'] as const).map(opt => {
													const on = a.answer === opt
													return (
														<button
															key={opt}
															type="button"
															role="radio"
															aria-checked={on}
															disabled={busy}
															onClick={() => setAnswer(c.id, opt)}
															className={cn(
																'px-3.5 py-1 text-xs font-medium transition-colors',
																opt === 'NO' && 'border-l',
																on
																	? opt === 'YES'
																		? 'bg-emerald-600 text-white'
																		: 'bg-slate-700 text-white'
																	: 'bg-white text-slate-700 hover:bg-slate-50'
															)}
														>
															{opt}
														</button>
													)
												})}
											</div>
										</div>
										{/* The claim form was submitted in the step before, so this item
										    is answered against the claim itself — shown for reference. */}
										{isBankClause(c) && String(claimBank.account_number || '').trim() !== '' && (
											<div className={cn('ml-5 rounded-md border p-2.5 text-xs space-y-1.5', TONE.info.card)}>
												<p className={cn('font-semibold', TONE.info.heading)}>The bank details on your claim form</p>
												<dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
													{BANK_LABELS.map(f => {
														const v = String(claimBank[f.key] || '').trim()
														return (
															<div key={f.key}>
																<dt className="text-muted-foreground">{f.label}</dt>
																<dd className="font-medium">{f.key === 'account_number' ? maskAccount(v) : v || '—'}</dd>
															</div>
														)
													})}
												</dl>
											</div>
										)}
										{needsDetail && (
											<div className="pl-5">
												<Input
													value={a.detail || ''}
													onChange={e => setDetail(c.id, e.target.value)}
													placeholder={c.detail_label || 'Specify'}
													maxLength={200}
													disabled={busy}
													aria-invalid={detailMissing}
													className={cn('h-8 text-sm', detailMissing && 'border-rose-400 bg-rose-50/40')}
												/>
												<p className={cn('text-[11px] mt-1', detailMissing ? 'text-rose-700' : 'text-muted-foreground')}>
													{c.detail_label} <span className="text-rose-600">*</span>
												</p>
											</div>
										)}
									</div>
								)
							})}
						</div>
					)}

					{errorBanner}

					<div className="flex flex-wrap items-center justify-between gap-3">
						<span
							className={cn(
								'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
								allAnswered ? TONE.success.badge : TONE.warning.badge
							)}
						>
							{allAnswered ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
							{answeredCount} of {clauses.length} answered
						</span>
						<div className="flex flex-col items-end gap-1">
							<Button
								onClick={() => run({ step: 'checklist', checklist: answers })}
								disabled={busy || !allAnswered}
							>
								{busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
								Continue to signature
								<ArrowRight className="h-4 w-4 ml-1.5" />
							</Button>
							{!allAnswered && clauses.length > 0 && (
								<DisabledReason reason={`Answer ${remaining} more item${remaining === 1 ? '' : 's'} to continue`} />
							)}
						</div>
					</div>
				</CardContent>
			</Card>
		)
	}

	// ── Step 2: declaration + signature ───────────────────────────────────
	// The last confirmation — the facts that matter are in red so they cannot
	// be missed. Shown before the one button that signs and completes.
	const finalNotice = (
		<div className={cn('rounded-md border-2 p-4 text-sm space-y-2', TONE.danger.frame, 'bg-rose-50/40')}>
			<p className="font-semibold flex items-center gap-1.5 text-slate-900">
				<AlertTriangle className="h-4 w-4 text-rose-600" />
				Please read before you complete the submission
			</p>
			<ul className="list-disc pl-5 space-y-1 text-slate-700">
				<li>
					<span className="font-semibold text-rose-700">This is final.</span> Once completed, the question
					paper <span className="font-semibold text-rose-700">cannot be viewed, changed, downloaded or printed</span> by you.
				</li>
				<li>
					The paper, your claim form, your check list and your signature go to the Office of the Controller of
					Examinations as one record.
				</li>
				<li>Your signed claim form can be downloaded right after.</li>
			</ul>
		</div>
	)

	const signReason = !signature
		? 'Sign in the box (or use your saved signature)'
		: !declarationAccepted
			? 'Tick the box under your signature to accept the declaration'
			: null

	return (
		<Card className={cn('border-2', TONE.info.frame)}>
			<CardContent className="p-5 space-y-4">
				<StepHeading
					n={3}
					icon={PenLine}
					title="Declaration & Signature"
					subtitle={`${assignment?.course_code} — ${assignment?.subject_title}`}
				/>

				<div className="rounded-md border bg-slate-50 p-3.5 text-sm space-y-2">
					<p className="font-medium flex items-center gap-1.5">
						<ShieldCheck className="h-4 w-4" />
						{content?.declaration?.title || 'Declaration'}
					</p>
					<ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
						{declarationClauses.map(c => (
							<li key={c.id}>{c.text}</li>
						))}
					</ol>
					<div className="flex items-center justify-between gap-3 pt-1 text-xs text-muted-foreground">
						<span>Check list</span>
						<span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium', TONE.success.badge)}>
							<CheckCircle2 className="h-3 w-3" />
							Completed {assignment?.checklist_completed_at ? formatIst(assignment.checklist_completed_at) : ''}
						</span>
					</div>
				</div>

				{alreadySigned ? (
					<>
						<div className={cn('rounded-md border p-3.5 text-sm flex items-center gap-2', TONE.success.card, TONE.success.text)}>
							<CheckCircle2 className={cn('h-4 w-4 shrink-0', TONE.success.icon)} />
							Signed on {formatIst(assignment.signed_at)}.
						</div>

					</>
				) : (
					<>
						<div id="qp-wizard-focus" className="scroll-mt-44">
							<p className="text-xs text-muted-foreground mb-1">
								Signature <span className="text-rose-600 font-semibold">*</span>
							</p>
							<SignaturePad
								onChange={setSignature}
								savedSignatureUrl={savedSignatureUrl}
								disabled={busy}
							/>
						</div>

						<label className="flex items-start gap-2.5 cursor-pointer">
							<Checkbox
								checked={declarationAccepted}
								onCheckedChange={v => setDeclarationAccepted(v === true)}
								disabled={busy}
								className="mt-0.5"
							/>
							<span className="text-sm">
								I accept the declaration above. My signature above confirms it.{' '}
								<span className="text-rose-600 font-semibold">*</span>
							</span>
						</label>
					</>
				)}

				{finalNotice}

				{errorBanner}

				<div className="flex flex-wrap justify-end gap-2">
					{!alreadySigned ? (
						<div className="flex flex-col items-end gap-1">
							<Button onClick={signAndComplete} disabled={busy || !!signReason} className="bg-rose-600 hover:bg-rose-700">
								{busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
								Sign and complete submission
							</Button>
							<DisabledReason reason={signReason} />
						</div>
					) : (
						<Button onClick={() => run({ step: 'final' })} disabled={busy} className="bg-rose-600 hover:bg-rose-700">
							{busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
							Complete submission
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	)
}
