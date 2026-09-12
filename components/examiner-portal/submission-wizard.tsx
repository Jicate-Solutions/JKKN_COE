'use client'

// The post-submit walk: Check List → Signature → Final Submit → Confirmation.
//
// The examiner never has to find the next page. Submitting the paper opens this
// at the check list; finishing the check list moves straight to the signature;
// signing enables the final submit. Closing the browser mid-walk is safe — the
// stage lives in the database, so re-opening the assignment resumes here at the
// same step.
//
// The overall journey (paper → submit → check list → sign → done) is drawn by
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
	Loader2, ListChecks, PenLine, CheckCircle2, ShieldCheck, ArrowRight, Lock, AlertTriangle, Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIst } from '@/lib/qp-portal/ist'
import { readChecklistAnswers, type QpSubmissionStage } from '@/types/qp-examiner-assignment'
import { Input } from '@/components/ui/input'
import { SignaturePad } from './signature-pad'
import { TONE } from './tones'
import { DisabledReason } from './paper-step-tracker'

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
	/** POSTs one wizard step; resolves with the server's reply. */
	onStep: (body: Record<string, unknown>) => Promise<any>
	/** Re-read the assignment after a step lands. */
	onAdvanced: () => Promise<void> | void
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
	onStep,
	onAdvanced,
}: Props) {
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
			await onAdvanced()
		} catch (e: any) {
			setError(e?.message || 'That step could not be completed. Please try again.')
			const ids = e?.body?.unanswered
			if (Array.isArray(ids)) setFlagged(ids.map(String))
		} finally {
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

	// ── Step 1: check list ────────────────────────────────────────────────
	if (stage === 'checklist') {
		const remaining = clauses.length - answeredCount
		return (
			<Card className={cn('border-2', TONE.info.frame)}>
				<CardContent className="p-5 space-y-4">
					<StepHeading
						n={1}
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
	const signReason = !declarationAccepted
		? 'Tick the declaration first'
		: !signature
			? 'Sign in the box (or use your saved signature)'
			: null

	return (
		<Card className={cn('border-2', TONE.info.frame)}>
			<CardContent className="p-5 space-y-4">
				<StepHeading
					n={2}
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

						{/* The last confirmation — the facts that matter are in red so they
						    cannot be missed. */}
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
									The paper, your check list and your signature go to the Office of the Controller of
									Examinations as one record.
								</li>
								<li>Your claim form becomes available right after.</li>
							</ul>
						</div>
					</>
				) : (
					<>
						<label className="flex items-start gap-2.5 cursor-pointer">
							<Checkbox
								checked={declarationAccepted}
								onCheckedChange={v => setDeclarationAccepted(v === true)}
								disabled={busy}
								className="mt-0.5"
							/>
							<span className="text-sm">
								I accept the declaration above. My signature below confirms it.{' '}
								<span className="text-rose-600 font-semibold">*</span>
							</span>
						</label>

						<div>
							<p className="text-xs text-muted-foreground mb-1">
								Signature <span className="text-rose-600 font-semibold">*</span>
							</p>
							<SignaturePad
								onChange={setSignature}
								savedSignatureUrl={savedSignatureUrl}
								disabled={busy}
							/>
						</div>
					</>
				)}

				{errorBanner}

				<div className="flex flex-wrap justify-end gap-2">
					{!alreadySigned ? (
						<div className="flex flex-col items-end gap-1">
							<Button
								onClick={() =>
									run({ step: 'signature', signature, declaration_accepted: declarationAccepted })
								}
								disabled={busy || !!signReason}
							>
								{busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
								Save signature
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
