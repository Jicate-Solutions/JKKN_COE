'use client'

// Question Paper Development — what the examiner actually writes in.
//
// The paper's slots come from the template the CoE chose, exactly as they do in
// the CoE's own editor: the examiner fills them in, they never add or remove
// questions. Text, options, CO and K-level, sub-divisions and figures all use
// the same data shape (IaPaperQuestion) and the same rich editor, so a paper
// written here prints identically to one written inside the app.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/common/use-toast'
import { Loader2, Save, Split, X, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QuestionRichEditor } from '@/components/ia/question-rich-editor'
import { QuestionImageField } from '@/components/ia/question-image-field'
import { K_LEVELS } from '@/types/ia-question-paper'
import type { IaPaperQuestion, IaPaperSubQuestion } from '@/types/ia-question-paper'
import {
	readSubQuestions, relabelSubs, subTotal, canSplit, newId, romanLabel, MAX_SUB_QUESTIONS,
} from '@/lib/ia/sub-questions'

interface TemplatePart {
	id: string
	part_label: string
	part_title?: string | null
	instruction?: string | null
	num_questions: number
	num_to_answer?: number | null
	marks_per_question: number
	capture_co: boolean
	capture_klevel: boolean
	display_order: number
}

interface CourseOutcome {
	id: string
	co_code: string
	co_description?: string | null
}

interface Props {
	assignmentId: string
	questions: IaPaperQuestion[]
	templateParts: TemplatePart[]
	courseOutcomes: CourseOutcome[]
	baseUpdatedAt: string | null
	readOnly: boolean
	onSaved: (info: { question_done: number; question_total: number; updated_at: string | null }) => void
}

/** Visible text of rich content — the completeness checks mirror the server's. */
function plainText(value: unknown): string {
	return String(value ?? '')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

export function PortalPaperEditor({
	assignmentId,
	questions: initialQuestions,
	templateParts,
	courseOutcomes,
	baseUpdatedAt,
	readOnly,
	onSaved,
}: Props) {
	const { toast } = useToast()

	const [questions, setQuestions] = useState<IaPaperQuestion[]>(initialQuestions)
	const [dirty, setDirty] = useState(false)
	const [saving, setSaving] = useState(false)
	const [savedAt, setSavedAt] = useState<string | null>(null)
	const baseRef = useRef<string | null>(baseUpdatedAt)

	useEffect(() => {
		setQuestions(initialQuestions)
		baseRef.current = baseUpdatedAt
		setDirty(false)
	}, [initialQuestions, baseUpdatedAt])

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

	const patchQuestion = useCallback((id: string, changes: Partial<IaPaperQuestion>) => {
		setQuestions(prev => prev.map(q => (q.id === id ? { ...q, ...changes } : q)))
		setDirty(true)
	}, [])

	const patchOption = useCallback((qid: string, key: string, html: string) => {
		setQuestions(prev =>
			prev.map(q =>
				q.id === qid
					? {
							...q,
							options: (q.options || []).map(o =>
								o.key === key ? { ...o, text_html: html, text: plainText(html) } : o
							),
						}
					: q
			)
		)
		setDirty(true)
	}, [])

	// ── Sub-divisions ─────────────────────────────────────────────────────
	const setSubs = (qid: string, subs: IaPaperSubQuestion[]) =>
		patchQuestion(qid, { sub_questions: relabelSubs(subs as any) as any })

	const splitQuestion = (q: IaPaperQuestion) => {
		const half = q.marks != null ? Number(q.marks) / 2 : null
		setSubs(q.id, [
			{ id: newId(), label: 'i', question_text: '', marks: half, co_code: null, k_level: null, display_order: 1 },
			{ id: newId(), label: 'ii', question_text: '', marks: half, co_code: null, k_level: null, display_order: 2 },
		] as any)
	}

	const addSub = (q: IaPaperQuestion) => {
		const subs = readSubQuestions(q)
		if (subs.length >= MAX_SUB_QUESTIONS) return
		setSubs(q.id, [
			...subs,
			{ id: newId(), label: romanLabel(subs.length), question_text: '', marks: null, co_code: null, k_level: null, display_order: subs.length + 1 },
		] as any)
	}

	const removeSub = (q: IaPaperQuestion, subId: string) => {
		const remaining = readSubQuestions(q).filter(s => s.id !== subId)
		setSubs(q.id, remaining as any)
	}

	const patchSub = (q: IaPaperQuestion, subId: string, changes: Partial<IaPaperSubQuestion>) => {
		setSubs(
			q.id,
			readSubQuestions(q).map(s => (s.id === subId ? { ...s, ...changes } : s)) as any
		)
	}

	// ── Save ──────────────────────────────────────────────────────────────
	const save = useCallback(
		async (opts: { silent?: boolean } = {}) => {
			if (readOnly || saving) return false
			setSaving(true)
			try {
				const res = await fetch(`/api/examiner-portal/assignments/${assignmentId}/paper`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ questions, base_updated_at: baseRef.current }),
				})
				const json = await res.json().catch(() => ({}))
				if (!res.ok) {
					throw new Error(json?.message || json?.error || `HTTP ${res.status}`)
				}
				baseRef.current = json.updated_at || baseRef.current
				setDirty(false)
				setSavedAt(new Date().toISOString())
				onSaved({
					question_done: json.question_done ?? 0,
					question_total: json.question_total ?? questions.length,
					updated_at: json.updated_at || null,
				})
				if (!opts.silent) toast({ title: 'Saved' })
				return true
			} catch (e: any) {
				toast({ title: 'Could not save', description: e.message, variant: 'destructive' })
				return false
			} finally {
				setSaving(false)
			}
		},
		[assignmentId, questions, readOnly, saving, toast, onSaved]
	)

	// Auto-save every 45 s while there are unsaved edits. An examiner writing a
	// long paper must not lose work to a closed tab or an expiring window.
	useEffect(() => {
		if (!dirty || readOnly) return
		const t = setTimeout(() => {
			save({ silent: true })
		}, 45_000)
		return () => clearTimeout(t)
	}, [dirty, readOnly, save])

	// Warn before leaving with unsaved edits.
	useEffect(() => {
		if (!dirty) return
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault()
			e.returnValue = ''
		}
		window.addEventListener('beforeunload', handler)
		return () => window.removeEventListener('beforeunload', handler)
	}, [dirty])

	// ── Completeness (mirrors lib/ia/validate-paper.ts) ───────────────────
	const problems = useMemo(() => {
		const out: string[] = []
		for (const q of questions) {
			const part = partByLabel.get(q.part_label || '')
			const captureCo = part?.capture_co ?? true
			const captureK = part?.capture_klevel ?? true
			const label = `Q${q.question_number}${q.sub_label ? ` ${q.sub_label}` : ''}`
			const subs = readSubQuestions(q)

			if (subs.length > 0) {
				for (const sb of subs) {
					const where = `${label} ${sb.label}`
					if (!plainText(sb.question_text)) out.push(`${where}: enter the question`)
					if (captureCo && !sb.co_code) out.push(`${where}: select CO`)
					if (captureK && !sb.k_level) out.push(`${where}: select K-level`)
				}
				const total = subTotal(subs)
				if (q.marks != null && Math.abs(total - Number(q.marks)) > 0.001) {
					out.push(`${label}: sub-division marks total ${total}, must be ${q.marks}`)
				}
			} else {
				if (!plainText(q.question_text)) out.push(`${label}: enter the question`)
				if (captureCo && !q.co_code) out.push(`${label}: select CO`)
				if (captureK && !q.k_level) out.push(`${label}: select K-level`)
			}

			for (const o of q.options || []) {
				if (!plainText(o.text_html) && !plainText(o.text)) out.push(`${label}: option ${o.key} is empty`)
			}
		}
		return out
	}, [questions, partByLabel])

	const doneCount = questions.filter(q => {
		const subs = readSubQuestions(q)
		return subs.length > 0
			? subs.every(s => plainText(s.question_text))
			: !!plainText(q.question_text)
	}).length

	const coOptions = courseOutcomes.length
		? courseOutcomes.map(c => c.co_code)
		: ['CO1', 'CO2', 'CO3', 'CO4', 'CO5']

	return (
		<div className="space-y-4">
			{/* Sticky save bar */}
			<div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-white/95 backdrop-blur border-b flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-sm">
					<Badge variant="outline" className={cn(doneCount === questions.length && 'bg-emerald-50 text-emerald-700 border-emerald-200')}>
						{doneCount} / {questions.length} entered
					</Badge>
					{problems.length === 0 ? (
						<span className="text-xs text-emerald-700 flex items-center gap-1">
							<CheckCircle2 className="h-3.5 w-3.5" />
							Ready to submit
						</span>
					) : (
						<span className="text-xs text-amber-700 flex items-center gap-1">
							<AlertTriangle className="h-3.5 w-3.5" />
							{problems.length} item{problems.length > 1 ? 's' : ''} incomplete
						</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					{savedAt && !dirty && (
						<span className="text-xs text-muted-foreground">
							Saved {new Date(savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
						</span>
					)}
					{dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
					<Button size="sm" onClick={() => save()} disabled={readOnly || saving || !dirty}>
						{saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
						Save
					</Button>
				</div>
			</div>

			{readOnly && (
				<Card className="border-slate-200 bg-slate-50">
					<CardContent className="p-3 text-sm text-slate-700">
						This paper is read-only — it has been submitted, or the entry period has ended.
					</CardContent>
				</Card>
			)}

			{/* Parts */}
			{[...grouped.entries()].map(([label, qs]) => {
				const part = partByLabel.get(label)
				const answerCount = Number(part?.num_to_answer) > 0 ? Number(part!.num_to_answer) : part?.num_questions || qs.length
				const each = part?.marks_per_question ?? qs[0]?.marks ?? 0
				return (
					<div key={label} className="space-y-3">
						<div className="rounded-md bg-muted/60 px-3 py-2">
							<p className="font-semibold text-sm">
								PART {label} — ({answerCount} × {each} = {Number(answerCount) * Number(each)} marks)
							</p>
							{part?.instruction && <p className="text-xs text-muted-foreground mt-0.5">{part.instruction}</p>}
						</div>

						{qs.map(q => {
							const subs = readSubQuestions(q)
							const captureCo = part?.capture_co ?? true
							const captureK = part?.capture_klevel ?? true
							return (
								<Card key={q.id} className={cn(q.is_choice_alternative && 'ml-4 border-dashed')}>
									<CardContent className="p-3 space-y-3">
										<div className="flex items-center justify-between gap-2">
											<div className="flex items-center gap-2">
												<span className="font-semibold text-sm">
													{q.question_number}
													{q.sub_label ? ` ${q.sub_label})` : '.'}
												</span>
												{q.is_choice_alternative && (
													<Badge variant="outline" className="text-[10px]">OR</Badge>
												)}
												{q.marks != null && (
													<span className="text-xs text-muted-foreground">{q.marks} marks</span>
												)}
											</div>
											{!readOnly && canSplit(q) && subs.length === 0 && (
												<Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => splitQuestion(q)}>
													<Split className="h-3.5 w-3.5 mr-1" />
													Split into (i)/(ii)
												</Button>
											)}
										</div>

										{/* Question text (a stem when split) */}
										<div>
											{subs.length > 0 && (
												<Label className="text-xs text-muted-foreground">Common stem (optional)</Label>
											)}
											<QuestionRichEditor
												value={q.question_text || ''}
												onChange={html => patchQuestion(q.id, { question_text: html })}
												disabled={readOnly}
												placeholder={subs.length > 0 ? 'Optional shared text…' : 'Enter the question…'}
											/>
										</div>

										{/* Figure */}
										{!readOnly && (
											<QuestionImageField
												paperId={assignmentId}
												uploadUrl={`/api/examiner-portal/assignments/${assignmentId}/image`}
												value={(q.image as any) || null}
												onChange={img => patchQuestion(q.id, { image: img as any })}
											/>
										)}

										{/* MCQ options */}
										{Array.isArray(q.options) && q.options.length > 0 && (
											<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
												{q.options.map(o => (
													<div key={o.key} className="flex items-start gap-2">
														<span className="pt-2 text-sm font-medium w-5">{o.key})</span>
														<div className="flex-1">
															<QuestionRichEditor
																value={o.text_html || o.text || ''}
																onChange={html => patchOption(q.id, o.key, html)}
																disabled={readOnly}
																variant="compact"
																placeholder={`Option ${o.key}`}
															/>
														</div>
													</div>
												))}
											</div>
										)}

										{/* Sub-divisions */}
										{subs.length > 0 && (
											<div className="space-y-2 border-l-2 pl-3">
												{subs.map(sb => (
													<div key={sb.id} className="space-y-2">
														<div className="flex items-center justify-between">
															<span className="text-xs font-medium">{sb.label}.</span>
															{!readOnly && (
																<Button
																	variant="ghost"
																	size="icon"
																	className="h-6 w-6 text-rose-600"
																	onClick={() => removeSub(q, sb.id)}
																	aria-label="Remove sub-division"
																>
																	<X className="h-3.5 w-3.5" />
																</Button>
															)}
														</div>
														<QuestionRichEditor
															value={sb.question_text || ''}
															onChange={html => patchSub(q, sb.id, { question_text: html })}
															disabled={readOnly}
															variant="compact"
															placeholder="Enter this sub-division…"
														/>
														<div className="flex flex-wrap gap-2">
															<div className="w-24">
																<Input
																	type="number"
																	min="0"
																	step="0.5"
																	value={sb.marks ?? ''}
																	onChange={e =>
																		patchSub(q, sb.id, {
																			marks: e.target.value === '' ? null : Number(e.target.value),
																		})
																	}
																	disabled={readOnly}
																	placeholder="Marks"
																	className="h-8 text-xs"
																/>
															</div>
															{captureCo && (
																<Select
																	value={sb.co_code || ''}
																	onValueChange={v => patchSub(q, sb.id, { co_code: v })}
																	disabled={readOnly}
																>
																	<SelectTrigger className="h-8 w-24 text-xs"><SelectValue placeholder="CO" /></SelectTrigger>
																	<SelectContent>
																		{coOptions.map(c => (
																			<SelectItem key={c} value={c}>{c}</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															)}
															{captureK && (
																<Select
																	value={sb.k_level || ''}
																	onValueChange={v => patchSub(q, sb.id, { k_level: v })}
																	disabled={readOnly}
																>
																	<SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="K-level" /></SelectTrigger>
																	<SelectContent>
																		{K_LEVELS.map(k => (
																			<SelectItem key={k.code} value={k.code}>{k.label}</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															)}
														</div>
													</div>
												))}
												<div className="flex items-center justify-between pt-1">
													<span
														className={cn(
															'text-xs',
															q.marks != null && Math.abs(subTotal(subs) - Number(q.marks)) > 0.001
																? 'text-rose-600'
																: 'text-muted-foreground'
														)}
													>
														Sub-division marks: {subTotal(subs)} / {q.marks ?? '—'}
													</span>
													{!readOnly && subs.length < MAX_SUB_QUESTIONS && (
														<Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => addSub(q)}>
															<Plus className="h-3.5 w-3.5 mr-1" />
															Add sub-division
														</Button>
													)}
												</div>
											</div>
										)}

										{/* CO / K on the question itself */}
										{subs.length === 0 && (captureCo || captureK) && (
											<div className="flex flex-wrap gap-2">
												{captureCo && (
													<div>
														<Label className="text-[11px] text-muted-foreground">Course Outcome</Label>
														<Select
															value={q.co_code || ''}
															onValueChange={v => patchQuestion(q.id, { co_code: v })}
															disabled={readOnly}
														>
															<SelectTrigger className="h-8 w-28 text-xs mt-0.5"><SelectValue placeholder="CO" /></SelectTrigger>
															<SelectContent>
																{coOptions.map(c => (
																	<SelectItem key={c} value={c}>{c}</SelectItem>
																))}
															</SelectContent>
														</Select>
													</div>
												)}
												{captureK && (
													<div>
														<Label className="text-[11px] text-muted-foreground">K-level</Label>
														<Select
															value={q.k_level || ''}
															onValueChange={v => patchQuestion(q.id, { k_level: v })}
															disabled={readOnly}
														>
															<SelectTrigger className="h-8 w-36 text-xs mt-0.5"><SelectValue placeholder="K-level" /></SelectTrigger>
															<SelectContent>
																{K_LEVELS.map(k => (
																	<SelectItem key={k.code} value={k.code}>{k.label}</SelectItem>
																))}
															</SelectContent>
														</Select>
													</div>
												)}
											</div>
										)}
									</CardContent>
								</Card>
							)
						})}
					</div>
				)
			})}

			{problems.length > 0 && (
				<Card className="border-amber-200 bg-amber-50/60">
					<CardContent className="p-3">
						<p className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
							<AlertTriangle className="h-4 w-4" />
							Still to complete before you can submit
						</p>
						<ul className="mt-2 text-xs text-amber-800 space-y-0.5 max-h-40 overflow-y-auto">
							{problems.slice(0, 40).map((p, i) => (
								<li key={i}>· {p}</li>
							))}
							{problems.length > 40 && <li>· … and {problems.length - 40} more</li>}
						</ul>
					</CardContent>
				</Card>
			)}
		</div>
	)
}

/** Exposed so the portal shell can gate its Submit button on the same rules. */
export function paperProblemCount(questions: IaPaperQuestion[], parts: TemplatePart[]): number {
	const byLabel = new Map(parts.map(p => [p.part_label, p]))
	let n = 0
	for (const q of questions) {
		const part = byLabel.get(q.part_label || '')
		const subs = readSubQuestions(q)
		if (subs.length > 0) {
			for (const sb of subs) {
				if (!plainText(sb.question_text)) n++
				if ((part?.capture_co ?? true) && !sb.co_code) n++
				if ((part?.capture_klevel ?? true) && !sb.k_level) n++
			}
		} else {
			if (!plainText(q.question_text)) n++
			if ((part?.capture_co ?? true) && !q.co_code) n++
			if ((part?.capture_klevel ?? true) && !q.k_level) n++
		}
		for (const o of q.options || []) {
			if (!plainText(o.text_html) && !plainText(o.text)) n++
		}
	}
	return n
}
