'use client'

// Examiner portal — preview before submit.
//
// Submitting hands the paper over and closes the editor, so the examiner gets
// one last look at the WHOLE paper, exactly as authored, with the Submit button
// on the same screen. The preview is read-only and carries the same copy /
// print protection as the editor.

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
	problems: string[]
	submitting: boolean
	onSubmit: () => void
}

function plainText(value: unknown): string {
	return String(value ?? '')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

/** Authored rich text, or a muted placeholder when the slot is still empty. */
function Rich({ html, empty }: { html?: string | null; empty: string }) {
	if (!plainText(html)) return <p className="text-sm italic text-rose-600">{empty}</p>
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
			<Badge variant="outline" className={cn('text-[10px]', !co && 'border-rose-300 text-rose-600')}>
				{co || 'CO ?'}
			</Badge>
			<Badge variant="outline" className={cn('text-[10px]', !k && 'border-rose-300 text-rose-600')}>
				{k || 'K ?'}
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

	const complete = problems.length === 0

	return (
		<Dialog open={open} onOpenChange={o => !submitting && onOpenChange(o)}>
			<DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0">
				<DialogHeader className="px-5 pt-5 pb-3 border-b">
					<DialogTitle>Preview and submit</DialogTitle>
					<DialogDescription>
						{title}
						{subtitle && <> · {subtitle}</>}. Read the whole paper once more. Submitting hands it
						to the Office of the Controller of Examinations and closes the editor.
					</DialogDescription>
				</DialogHeader>

				{/* qp-protected: no selection, no print. */}
				<div
					className="qp-protected flex-1 overflow-y-auto px-5 py-4 space-y-5"
					onCopy={e => e.preventDefault()}
					onCut={e => e.preventDefault()}
					onContextMenu={e => e.preventDefault()}
				>
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
									return (
										<div
											key={q.id}
											className={cn(
												'rounded-md border p-3 space-y-2',
												q.is_choice_alternative && 'ml-4 border-dashed'
											)}
										>
											<div className="flex items-start justify-between gap-3">
												<div className="flex items-center gap-2">
													<span className="font-semibold text-sm">
														{q.question_number}
														{q.sub_label ? ` ${q.sub_label})` : '.'}
													</span>
													{q.is_choice_alternative && (
														<Badge variant="outline" className="text-[10px]">OR</Badge>
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
																<p className="text-sm italic text-rose-600">Option {o.key} is empty</p>
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
							<span className="text-emerald-700 flex items-center gap-1">
								<CheckCircle2 className="h-3.5 w-3.5" />
								All {questions.length} questions complete. You will then be taken to the check list and
								your signature.
							</span>
						) : (
							<span className="text-amber-700 flex items-start gap-1">
								<AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
								<span>
									{problems.length} item{problems.length > 1 ? 's' : ''} still to complete —{' '}
									{problems.slice(0, 3).join(' · ')}
									{problems.length > 3 ? ' …' : ''}
								</span>
							</span>
						)}
					</div>
					<div className="flex gap-2 shrink-0">
						<Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							{complete ? 'Not yet' : 'Back to editing'}
						</Button>
						<Button onClick={onSubmit} disabled={submitting || !complete}>
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
