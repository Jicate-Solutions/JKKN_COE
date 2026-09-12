'use client'

// Examiner portal — preview before submit.
//
// Submitting hands the paper over and closes the editor, so the examiner gets
// one last look at the WHOLE paper, exactly as authored, with the Submit button
// on the same screen. The preview is read-only and carries the same copy /
// print protection as the editor. The facts that matter — that this is final,
// and what can never be done again — are in red so they are not skimmed past.

import { useMemo } from 'react'
import {
	Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle2, Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readSubQuestions, readQuestionImage } from '@/lib/ia/sub-questions'
import type { IaPaperQuestion } from '@/types/ia-question-paper'
import type { PaperProblem } from '@/lib/ia/validate-paper'
import { TONE } from './tones'
import { DisabledReason } from './paper-step-tracker'

interface TemplatePartLike {
	part_label: string
	num_questions?: number | null
	num_to_answer?: number | null
	marks_per_question?: number | null
	instruction?: string | null
}

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	subtitle?: string
	questions: IaPaperQuestion[]
	templateParts: TemplatePartLike[]
	/** From the editor: empty = complete and submittable. */
	problems: PaperProblem[]
	submitting: boolean
	onSubmit: () => void
	/** Close the preview and scroll the editor to this problem. */
	onJump?: (anchor: string) => void
}

function plainText(value: unknown): string {
	return String(value ?? '')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

/** Authored rich text, or a red placeholder when the slot is still empty. */
function Rich({ html, empty }: { html?: string | null; empty: string }) {
	if (!plainText(html)) return empty ? <p className="text-sm italic text-rose-600 font-medium">{empty}</p> : null
	return (
		<div
			className="text-sm leading-relaxed [&_p]:my-0.5 [&_sub]:text-[0.75em] [&_sup]:text-[0.75em]"
			dangerouslySetInnerHTML={{ __html: html || '' }}
		/>
	)
}

function Figure({ raw }: { raw: unknown }) {
	const img = readQuestionImage(raw)
	if (!img) return null
	return (
		<div className="flex justify-center my-2">
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={img.url}
				alt=""
				draggable={false}
				style={{ width: `${img.width_pct || 60}%` }}
				className="max-w-full rounded border"
			/>
		</div>
	)
}

function Tags({ marks, co, k }: { marks?: number | null; co?: string | null; k?: string | null }) {
	return (
		<div className="flex flex-wrap items-center gap-1.5 shrink-0">
			{marks != null && <Badge variant="outline" className="text-[10px]">{marks} marks</Badge>}
			<Badge variant="outline" className={cn('text-[10px]', co ? TONE.success.badge : TONE.danger.badge)}>
				{co || 'CO missing'}
			</Badge>
			<Badge variant="outline" className={cn('text-[10px]', k ? TONE.success.badge : TONE.danger.badge)}>
				{k || 'K-level missing'}
			</Badge>
		</div>
	)
}

export function PaperPreviewDialog({
	open,
	onOpenChange,
	title,
	subtitle,
	questions,
	templateParts,
	problems,
	submitting,
	onSubmit,
	onJump,
}: Props) {
	const partByLabel = useMemo(
		() => new Map(templateParts.map(p => [p.part_label, p])),
		[templateParts]
	)

	const grouped = useMemo(() => {
		const map = new Map<string, IaPaperQuestion[]>()
		for (const q of [...questions].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))) {
			const key = q.part_label || '—'
			if (!map.has(key)) map.set(key, [])
			map.get(key)!.push(q)
		}
		return map
	}, [questions])

	const problemsByQuestion = useMemo(() => {
		const m = new Map<string, PaperProblem[]>()
		for (const p of problems) {
			if (!p.questionId) continue
			m.set(p.questionId, [...(m.get(p.questionId) || []), p])
		}
		return m
	}, [problems])

	const complete = problems.length === 0
	const coeProblems = problems.filter(p => p.needsCoe)
	const submitReason = coeProblems.length > 0
		? 'Needs a correction from the CoE office first'
		: problems.length > 0
			? `${problems.length} item${problems.length === 1 ? '' : 's'} still to complete`
			: null

	return (
		<Dialog open={open} onOpenChange={o => !submitting && onOpenChange(o)}>
			<DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0">
				<DialogHeader className="px-5 pt-5 pb-3 border-b text-left">
					<DialogTitle>Check and submit your question paper</DialogTitle>
					<DialogDescription>
						{title}
						{subtitle && <> · {subtitle}</>}
					</DialogDescription>
					{/* The confirmation itself. Red for what cannot be undone. */}
					<div className={cn('mt-2 rounded-md border-2 p-3 text-sm', TONE.danger.frame, 'bg-rose-50/40')}>
						<p className="font-semibold text-slate-900 flex items-center gap-1.5">
							<AlertTriangle className="h-4 w-4 text-rose-600" />
							Read the whole paper once more before you submit
						</p>
						<p className="text-slate-700 mt-1">
							Submitting hands this paper to the Office of the Controller of Examinations.{' '}
							<span className="font-semibold text-rose-700">
								After that you cannot edit it, and once the check list and signature are done you cannot view it again.
							</span>{' '}
							It can never be downloaded or printed.
						</p>
					</div>
				</DialogHeader>

				{/* qp-protected: no selection, no print. */}
				<div
					className="qp-protected flex-1 overflow-y-auto px-5 py-4 space-y-5"
					onCopy={e => e.preventDefault()}
					onCut={e => e.preventDefault()}
					onContextMenu={e => e.preventDefault()}
				>
					{!complete && (
						<div className={cn('rounded-md border p-3 text-sm', TONE.warning.card)}>
							<p className={cn('font-semibold flex items-center gap-1.5', TONE.warning.heading)}>
								<AlertTriangle className="h-4 w-4" />
								{problems.length} item{problems.length === 1 ? '' : 's'} still to complete
							</p>
							<ul className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
								{problems.slice(0, 10).map((p, i) => (
									<li key={i}>
										<button
											type="button"
											className={cn('text-left text-xs rounded px-1.5 py-0.5 hover:bg-amber-100 w-full', TONE.warning.text)}
											onClick={() => {
												onOpenChange(false)
												onJump?.(p.anchor)
											}}
										>
											<span className="font-semibold mr-1.5">{p.where}</span>
											{p.message.replace(/^[^:]+:\s*/, '')}
										</button>
									</li>
								))}
								{problems.length > 10 && (
									<li className={cn('text-xs px-1.5', TONE.warning.text)}>… and {problems.length - 10} more</li>
								)}
							</ul>
						</div>
					)}

					{[...grouped.entries()].map(([label, qs]) => {
						const part = partByLabel.get(label)
						const answerCount =
							Number(part?.num_to_answer) > 0 ? Number(part!.num_to_answer) : part?.num_questions || qs.length
						const each = part?.marks_per_question ?? qs[0]?.marks ?? 0
						return (
							<section key={label} className="space-y-3">
								<div className="rounded-md bg-muted/60 px-3 py-2">
									<p className="font-semibold text-sm">
										PART {label} — ({answerCount} × {each} = {Number(answerCount) * Number(each)} marks)
									</p>
									{part?.instruction && (
										<p className="text-xs text-muted-foreground mt-0.5">{part.instruction}</p>
									)}
								</div>

								{qs.map(q => {
									const subs = readSubQuestions(q)
									const qProblems = problemsByQuestion.get(q.id) || []
									return (
										<div
											key={q.id}
											className={cn(
												'rounded-md border border-l-4 p-3 space-y-2',
												qProblems.length ? 'border-l-rose-400' : 'border-l-emerald-400',
												q.is_choice_alternative && 'ml-4 border-dashed'
											)}
										>
											<div className="flex items-start justify-between gap-3">
												<div className="flex items-center gap-2">
													<span className="font-semibold text-sm">
														Q{q.question_number}
														{q.sub_label ? ` ${q.sub_label})` : ''}
													</span>
													{q.is_choice_alternative && (
														<Badge variant="outline" className="text-[10px]">OR</Badge>
													)}
													{qProblems.length > 0 && (
														<Badge variant="outline" className={cn('text-[10px]', TONE.danger.badge)}>
															{qProblems.length} to fix
														</Badge>
													)}
												</div>
												{subs.length === 0 ? (
													<Tags marks={q.marks} co={q.co_code} k={q.k_level} />
												) : (
													q.marks != null && (
														<Badge variant="outline" className="text-[10px]">{q.marks} marks</Badge>
													)
												)}
											</div>

											{subs.length > 0 ? (
												<>
													{plainText(q.question_text) && <Rich html={q.question_text} empty="" />}
													<Figure raw={q.image} />
													<div className="space-y-2 pl-3 border-l-2">
														{subs.map(sb => (
															<div key={sb.id} className="space-y-1">
																<div className="flex items-start justify-between gap-3">
																	<div className="flex gap-2 min-w-0">
																		<span className="text-sm font-medium shrink-0">({sb.label})</span>
																		<Rich html={sb.question_text} empty="Question not entered" />
																	</div>
																	<Tags marks={sb.marks} co={sb.co_code} k={sb.k_level} />
																</div>
																<Figure raw={sb.image} />
																{(plainText(sb.answer_key) || sb.answer_key_image) && (
																	<div className="rounded-md border border-amber-200 bg-amber-50/50 p-2 space-y-1">
																		<p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
																			Answer key ({sb.label})
																		</p>
																		<Rich html={sb.answer_key} empty="" />
																		<Figure raw={sb.answer_key_image} />
																	</div>
																)}
															</div>
														))}
													</div>
												</>
											) : (
												<>
													<Rich html={q.question_text} empty="Question not entered" />
													<Figure raw={q.image} />
												</>
											)}

											{/* The answer key, when one is written. Shown here so the
											    examiner reads it back before handing the paper over. */}
											{(plainText(q.answer_key) || q.answer_key_image) && (
												<div className="rounded-md border border-amber-200 bg-amber-50/50 p-2.5 space-y-1">
													<p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
														Answer key
													</p>
													<Rich html={q.answer_key} empty="" />
													<Figure raw={q.answer_key_image} />
												</div>
											)}

											{Array.isArray(q.options) && q.options.length > 0 && (
												<ol className="space-y-1 pl-1">
													{q.options.map(o => (
														<li key={o.key} className="flex gap-2">
															<span className="text-sm font-medium w-5 shrink-0">{o.key})</span>
															{o.text_html != null ? (
																<Rich html={o.text_html} empty={`Option ${o.key} is empty`} />
															) : plainText(o.text) ? (
																<p className="text-sm">{o.text}</p>
															) : (
																<p className="text-sm italic text-rose-600 font-medium">Option {o.key} is empty</p>
															)}
														</li>
													))}
												</ol>
											)}
										</div>
									)
								})}
							</section>
						)
					})}

					{questions.length === 0 && (
						<p className="text-sm text-muted-foreground text-center py-8">This paper has no questions.</p>
					)}
				</div>

				<DialogFooter className="px-5 py-3 border-t flex-col sm:flex-row sm:items-center gap-2">
					<div className="flex-1 text-xs">
						{complete ? (
							<span className={cn('flex items-center gap-1', TONE.success.text)}>
								<CheckCircle2 className="h-3.5 w-3.5" />
								All {questions.length} questions are complete. After submitting you will be taken to the
								check list and your signature.
							</span>
						) : (
							<DisabledReason reason={submitReason} />
						)}
					</div>
					<div className="flex gap-2 shrink-0">
						<Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							{complete ? 'Not yet' : 'Back to editing'}
						</Button>
						<Button
							onClick={onSubmit}
							disabled={submitting || !complete}
							title={submitReason || undefined}
							className={cn(complete && 'bg-rose-600 hover:bg-rose-700')}
						>
							{submitting ? (
								<Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
							) : (
								<Send className="h-4 w-4 mr-1.5" />
							)}
							Submit question paper
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
