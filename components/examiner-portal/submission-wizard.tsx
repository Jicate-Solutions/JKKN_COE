'use client'

// The post-submit walk: Check List → Signature → Final Submit → Confirmation.
//
// The examiner never has to find the next page. Submitting the paper opens this
// at the check list; finishing the check list moves straight to the signature;
// signing enables the final submit. Closing the browser mid-walk is safe — the
// stage lives in the database, so re-opening the assignment resumes here at the
// same step.
//
// The ordering is enforced on the SERVER (see the submission route). What this
// component does is make the next step obvious, not make it safe.

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
	Loader2, ListChecks, PenLine, CheckCircle2, ShieldCheck, ArrowRight, Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIst } from '@/lib/qp-portal/ist'
import {
	QP_SUBMISSION_STAGE_LABELS,
	readChecklistAnswers,
	type QpSubmissionStage,
} from '@/types/qp-examiner-assignment'
import { Input } from '@/components/ui/input'
import { SignaturePad } from './signature-pad'

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

const STEPS: { stage: QpSubmissionStage; label: string; icon: typeof ListChecks }[] = [
	{ stage: 'checklist', label: 'Check List', icon: ListChecks },
	{ stage: 'signature', label: 'Signature', icon: PenLine },
	{ stage: 'completed', label: 'Completed', icon: CheckCircle2 },
]

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
	const allAnswered = clauses.length > 0 && clauses.every(itemDone)
	const setAnswer = (id: string, answer: 'YES' | 'NO') =>
		setAnswers(prev => ({ ...prev, [id]: { ...prev[id], answer } }))
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
			setError(e?.message || 'That step could not be completed.')
		} finally {
			setBusy(false)
		}
	}

	// ── Stepper ───────────────────────────────────────────────────────────
	const activeIdx = STEPS.findIndex(s => s.stage === stage)
	const stepper = (
		<div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
			{STEPS.map((s, i) => {
				const done = i < activeIdx || stage === 'completed'
				const active = s.stage === stage
				const Icon = done ? CheckCircle2 : s.icon
				return (
					<div key={s.stage} className="flex items-center gap-1.5 sm:gap-3">
						<span
							className={cn(
								'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
								done && 'bg-emerald-50 text-emerald-700 border-emerald-200',
								active && !done && 'bg-blue-50 text-blue-700 border-blue-200',
								!done && !active && 'bg-slate-50 text-slate-500 border-slate-200'
							)}
						>
							<Icon className="h-3.5 w-3.5" />
							{s.label}
						</span>
						{i < STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-slate-300" />}
					</div>
				)
			})}
		</div>
	)

	// ── Completed ─────────────────────────────────────────────────────────
	if (stage === 'completed') {
		return (
			<Card className="border-emerald-200">
				<CardContent className="p-5 space-y-4">
					{stepper}
					<div className="flex items-start gap-3">
						<CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
						<div className="min-w-0">
							<h2 className="font-semibold">Question Paper Submission Completed</h2>
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
									<span className="font-medium text-emerald-700">{value as string} ✓</span>
									{at && (
										<span className="text-xs text-muted-foreground hidden sm:inline">
											{formatIst(at as string)}
										</span>
									)}
								</span>
							</div>
						))}
					</div>

					<div className="rounded-md border bg-slate-50 p-3 text-sm text-muted-foreground flex items-start gap-2">
						<Lock className="h-4 w-4 shrink-0 mt-0.5" />
						<p>
							The question paper is now closed. For confidentiality it cannot be viewed, downloaded or
							printed again — contact the Office of the Controller of Examinations if a change is needed.
						</p>
					</div>
				</CardContent>
			</Card>
		)
	}

	// ── Step 1: check list ────────────────────────────────────────────────
	if (stage === 'checklist') {
		return (
			<Card className="border-blue-200">
				<CardContent className="p-5 space-y-4">
					{stepper}
					<div>
						<h2 className="font-semibold flex items-center gap-2">
							<ListChecks className="h-4 w-4" />
							{content?.checklist?.title || 'Question Paper Check List'}
						</h2>
						<p className="text-sm text-muted-foreground mt-0.5">
							Your question paper has been submitted. Answer YES or NO to each item below to continue.
						</p>
					</div>

					{clauses.length === 0 ? (
						<p className="text-sm text-amber-700">
							No check list has been published for this examination. Contact the Office of the Controller
							of Examinations.
						</p>
					) : (
						<div className="rounded-md border divide-y">
							{clauses.map((c, i) => {
								const a = answers[c.id] || {}
								const needsDetail = !!c.detail_label && a.answer === 'YES'
								const detailMissing = needsDetail && !String(a.detail || '').trim()
								return (
									<div key={c.id} className="px-3.5 py-3 space-y-2">
										<div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
											<span className="text-sm flex-1 min-w-[200px]">
												<span className="text-muted-foreground mr-1.5">{i + 1}.</span>
												{c.text}
												{c.note && <span className="text-muted-foreground italic"> ({c.note})</span>}
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
													className={cn('h-8 text-sm', detailMissing && 'border-amber-400')}
												/>
												<p className="text-[11px] text-muted-foreground mt-1">{c.detail_label}</p>
											</div>
										)}
									</div>
								)
							})}
						</div>
					)}

					{error && <p className="text-sm text-rose-600">{error}</p>}

					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-xs text-muted-foreground">
							{clauses.filter(itemDone).length} of {clauses.length} answered
						</p>
						<Button
							onClick={() => run({ step: 'checklist', checklist: answers })}
							disabled={busy || !allAnswered}
						>
							{busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
							Continue to signature
							<ArrowRight className="h-4 w-4 ml-1.5" />
						</Button>
					</div>
				</CardContent>
			</Card>
		)
	}

	// ── Step 2: declaration + signature ───────────────────────────────────
	return (
		<Card className="border-blue-200">
			<CardContent className="p-5 space-y-4">
				{stepper}
				<div>
					<h2 className="font-semibold flex items-center gap-2">
						<PenLine className="h-4 w-4" />
						Declaration &amp; Signature
					</h2>
					<p className="text-sm text-muted-foreground mt-0.5">
						{assignment?.course_code} — {assignment?.subject_title}
					</p>
					<p className="text-xs text-muted-foreground">
						{[
							assignment?.program_code,
							assignment?.semester ? `Semester ${assignment.semester}` : null,
							assignment?.session_label || assignment?.session_name,
						]
							.filter(Boolean)
							.join(' · ')}
					</p>
				</div>

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
						<span>Check list completed</span>
						<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
							{assignment?.checklist_completed_at ? formatIst(assignment.checklist_completed_at) : 'Done'} ✓
						</Badge>
					</div>
				</div>

				{alreadySigned ? (
					<div className="rounded-md border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900 flex items-center gap-2">
						<CheckCircle2 className="h-4 w-4 shrink-0" />
						Signed on {formatIst(assignment.signed_at)}. Submit below to complete.
					</div>
				) : (
					<>
						<label className="flex items-start gap-2.5 cursor-pointer">
							<Checkbox
								checked={declarationAccepted}
								onCheckedChange={v => setDeclarationAccepted(v === true)}
								disabled={busy}
								className="mt-0.5"
							/>
							<span className="text-sm">I accept the declaration above. My signature below confirms it.</span>
						</label>

						<SignaturePad
							onChange={setSignature}
							savedSignatureUrl={savedSignatureUrl}
							disabled={busy}
						/>
					</>
				)}

				{error && <p className="text-sm text-rose-600">{error}</p>}

				<div className="flex flex-wrap justify-end gap-2">
					{!alreadySigned ? (
						<Button
							onClick={() =>
								run({ step: 'signature', signature, declaration_accepted: declarationAccepted })
							}
							disabled={busy || !signature || !declarationAccepted}
						>
							{busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
							Save signature
						</Button>
					) : (
						<Button onClick={() => run({ step: 'final' })} disabled={busy}>
							{busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
							Submit
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	)
}
