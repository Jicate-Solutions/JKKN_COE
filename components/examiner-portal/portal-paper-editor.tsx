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
import { SyncBadge, type SyncState } from './sync-badge'
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
	/**
	 * Filled with the editor's Save Draft action so the parent can offer the same
	 * button beside Submit. The alternative — duplicating the save call in the
	 * parent — would mean two code paths that could drift apart.
	 */
	saveRef?: React.MutableRefObject<(() => Promise<boolean>) | null>
	/** Lets the parent mirror the sync badge next to its Submit button. */
	onSyncChange?: (info: { state: SyncState; dirty: boolean; savedAt: string | null }) => void
	/**
	 * Every reason the paper cannot be submitted yet (empty = complete). Lets the
	 * parent disable Submit instead of letting the server refuse the click.
	 */
	onValidityChange?: (problems: string[]) => void
	/** Lets the parent read the questions as they are right now, unsaved edits included. */
	questionsRef?: React.MutableRefObject<(() => IaPaperQuestion[]) | null>
}

interface LocalDraft {
	questions: IaPaperQuestion[]
	savedAt: string
	base: string | null
}

/**
 * Autosave delay after the last keystroke. Short enough that an examiner never
 * has to think about saving, long enough that typing a sentence is one request
 * rather than thirty.
 */
const AUTOSAVE_DEBOUNCE_MS = 1_500
/** How often to retry once a save has failed or the browser went offline. */
const UNSYNCED_RETRY_MS = 15_000
/** localStorage key prefix; one draft per assignment. */
const LOCAL_DRAFT_PREFIX = 'jkkn.qp.draft.'

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
	saveRef,
	onSyncChange,
	onValidityChange,
	questionsRef: liveQuestionsRef,
}: Props) {
	const { toast } = useToast()

	const [questions, setQuestions] = useState<IaPaperQuestion[]>(initialQuestions)
	const [dirty, setDirty] = useState(false)
	const [saving, setSaving] = useState(false)
	const [savedAt, setSavedAt] = useState<string | null>(null)
	const [syncState, setSyncState] = useState<SyncState>('idle')
	const [syncError, setSyncError] = useState<string | null>(null)
	/** A newer draft found in this browser than the server has — offered, not forced. */
	const [recovery, setRecovery] = useState<LocalDraft | null>(null)
	const baseRef = useRef<string | null>(baseUpdatedAt)

	// Read inside event listeners that are registered once.
	const dirtyRef = useRef(dirty)
	dirtyRef.current = dirty
	const syncStateRef = useRef(syncState)
	syncStateRef.current = syncState

	const draftKey = `${LOCAL_DRAFT_PREFIX}${assignmentId}`

	const writeLocalDraft = useCallback(
		(qs: IaPaperQuestion[]) => {
			try {
				window.localStorage.setItem(
					draftKey,
					JSON.stringify({ questions: qs, savedAt: new Date().toISOString(), base: baseRef.current })
				)
			} catch {
				// Quota exceeded or storage disabled (private window). The server draft
				// is the real one — never let a failed mirror break editing.
			}
		},
		[draftKey]
	)

	const clearLocalDraft = useCallback(() => {
		try {
			window.localStorage.removeItem(draftKey)
		} catch {
			/* nothing to do */
		}
	}, [draftKey])

	useEffect(() => {
		setQuestions(initialQuestions)
		baseRef.current = baseUpdatedAt
		setDirty(false)
		setSyncState('idle')
		setSyncError(null)

		// Anything left in this browser that the server never received? That is
		// work from a dropped connection or a closed tab, and it is offered back
		// rather than applied silently — the server copy may be the newer one.
		try {
			const raw = window.localStorage.getItem(draftKey)
			if (!raw) return
			const parsed = JSON.parse(raw) as LocalDraft
			if (!Array.isArray(parsed?.questions) || !parsed.savedAt) return
			const serverAt = baseUpdatedAt ? new Date(baseUpdatedAt).getTime() : 0
			if (new Date(parsed.savedAt).getTime() > serverAt) setRecovery(parsed)
			else window.localStorage.removeItem(draftKey)
		} catch {
			/* an unreadable mirror is simply ignored */
		}
	}, [initialQuestions, baseUpdatedAt, draftKey])

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
	//
	// Saving a draft NEVER validates. An examiner must be able to stop half-way —
	// empty questions, no CO, no K-level — and come back to it. Only Submit runs
	// the completeness rules (lib/ia/validate-paper.ts).
	//
	// Two layers, because one is not enough:
	//   • the server draft, which is the real one, and
	//   • a local mirror in this browser, which survives the cases the server
	//     never hears about — a dropped connection, a closed tab, a flat battery.

	/** Always holds the latest questions, so timers never save a stale array. */
	const questionsRef = useRef(questions)
	questionsRef.current = questions

	const savingRef = useRef(false)
	/** Set while a save was requested but one was already in flight. */
	const rerunRef = useRef(false)

	const doSave = useCallback(
		async (opts: { silent?: boolean } = {}): Promise<boolean> => {
			if (readOnly) return false
			if (savingRef.current) {
				// Coalesce: finish the one in flight, then save again with the newer
				// content rather than dropping this request on the floor.
				rerunRef.current = true
				return false
			}
			savingRef.current = true
			setSaving(true)
			setSyncState('saving')
			const payload = questionsRef.current
			try {
				const res = await fetch(`/api/examiner-portal/assignments/${assignmentId}/paper`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ questions: payload, base_updated_at: baseRef.current }),
				})
				const json = await res.json().catch(() => ({}))
				if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`)

				baseRef.current = json.updated_at || baseRef.current
				// Only clear the flag if nothing changed while the request was away.
				if (questionsRef.current === payload) setDirty(false)
				setSavedAt(new Date().toISOString())
				setSyncState('saved')
				setSyncError(null)
				clearLocalDraft()
				onSaved({
					question_done: json.question_done ?? 0,
					question_total: json.question_total ?? payload.length,
					updated_at: json.updated_at || null,
				})
				if (!opts.silent) toast({ title: 'Draft saved' })
				return true
			} catch (e: any) {
				// The local mirror is what makes a failure survivable, so it is
				// written before anything is said about the failure.
				writeLocalDraft(payload)
				setSyncState('unsynced')
				setSyncError(e?.message || 'Could not reach the server')
				if (!opts.silent) {
					toast({
						title: 'Not saved to the server',
						description: `${e?.message || 'Network problem'} — your work is kept in this browser and will sync when the connection returns.`,
						variant: 'destructive',
					})
				}
				return false
			} finally {
				savingRef.current = false
				setSaving(false)
				if (rerunRef.current) {
					rerunRef.current = false
					// Space the retry so a flaky connection is not hammered.
					setTimeout(() => void doSave({ silent: true }), 400)
				}
			}
		},
		// questionsRef keeps this stable — it must NOT depend on `questions`, or
		// every keystroke would rebuild the debounce timer and nothing would fire.
		[assignmentId, readOnly, toast, onSaved, writeLocalDraft, clearLocalDraft]
	)

	// Hand the parent the same save action its Save Draft button triggers, and
	// keep it told about the sync state so both badges agree.
	useEffect(() => {
		if (saveRef) saveRef.current = () => doSave()
		return () => {
			if (saveRef) saveRef.current = null
		}
	}, [saveRef, doSave])

	useEffect(() => {
		onSyncChange?.({ state: syncState, dirty, savedAt })
	}, [syncState, dirty, savedAt, onSyncChange])

	// ── Autosave: debounced on every edit ─────────────────────────────────
	// Short, because the point is that an examiner never has to think about it.
	useEffect(() => {
		if (!dirty || readOnly) return
		// The local mirror is written immediately — it costs nothing and it is the
		// layer that survives a connection dropping mid-keystroke.
		writeLocalDraft(questions)
		const t = setTimeout(() => void doSave({ silent: true }), AUTOSAVE_DEBOUNCE_MS)
		return () => clearTimeout(t)
	}, [questions, dirty, readOnly, doSave, writeLocalDraft])

	// Retry while offline / after a failure, until it lands.
	useEffect(() => {
		if (syncState !== 'unsynced' || readOnly) return
		const t = setInterval(() => void doSave({ silent: true }), UNSYNCED_RETRY_MS)
		return () => clearInterval(t)
	}, [syncState, readOnly, doSave])

	// Save on the way out: switching tab, minimising, or closing. visibilitychange
	// is the one event mobile browsers reliably fire before discarding a page.
	useEffect(() => {
		if (readOnly) return
		const onHide = () => {
			if (!dirtyRef.current) return
			writeLocalDraft(questionsRef.current)
			void doSave({ silent: true })
		}
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') onHide()
		})
		window.addEventListener('pagehide', onHide)
		return () => {
			window.removeEventListener('pagehide', onHide)
		}
	}, [readOnly, doSave, writeLocalDraft])

	// The connection came back — push whatever is outstanding.
	useEffect(() => {
		const onOnline = () => {
			if (dirtyRef.current || syncStateRef.current === 'unsynced') void doSave({ silent: true })
		}
		const onOffline = () => setSyncState(s => (s === 'saved' ? s : 'unsynced'))
		window.addEventListener('online', onOnline)
		window.addEventListener('offline', onOffline)
		return () => {
			window.removeEventListener('online', onOnline)
			window.removeEventListener('offline', onOffline)
		}
	}, [doSave])

	// Warn before leaving with edits that never reached the server.
	useEffect(() => {
		if (!dirty && syncState !== 'unsynced') return
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault()
			e.returnValue = ''
		}
		window.addEventListener('beforeunload', handler)
		return () => window.removeEventListener('beforeunload', handler)
	}, [dirty, syncState])

	// ── Completeness (mirrors lib/ia/validate-paper.ts) ───────────────────
	const problems = useMemo(() => {
		const out: string[] = []
		for (const q of questions) {
			// CO and K-level are required on every question — the template's
			// capture flags no longer gate them (see lib/ia/validate-paper).
			const label = `Q${q.question_number}${q.sub_label ? ` ${q.sub_label}` : ''}`
			const subs = readSubQuestions(q)

			if (subs.length > 0) {
				for (const sb of subs) {
					const where = `${label} ${sb.label}`
					if (!plainText(sb.question_text)) out.push(`${where}: enter the question`)
					if (!sb.co_code) out.push(`${where}: select a Course Outcome (CO)`)
					if (!sb.k_level) out.push(`${where}: select a K-level`)
				}
				const total = subTotal(subs)
				if (q.marks != null && Math.abs(total - Number(q.marks)) > 0.001) {
					out.push(`${label}: sub-division marks total ${total}, must be ${q.marks}`)
				}
			} else {
				if (!plainText(q.question_text)) out.push(`${label}: enter the question`)
				if (!q.co_code) out.push(`${label}: select a Course Outcome (CO)`)
				if (!q.k_level) out.push(`${label}: select a K-level`)
			}

			for (const o of q.options || []) {
				if (!plainText(o.text_html) && !plainText(o.text)) out.push(`${label}: option ${o.key} is empty`)
			}
		}
		return out
	}, [questions, partByLabel])

	useEffect(() => {
		onValidityChange?.(problems)
	}, [problems, onValidityChange])

	useEffect(() => {
		if (liveQuestionsRef) liveQuestionsRef.current = () => questionsRef.current
		return () => {
			if (liveQuestionsRef) liveQuestionsRef.current = null
		}
	}, [liveQuestionsRef])

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
					<SyncBadge state={syncState} dirty={dirty} savedAt={savedAt} error={syncError} />
					<Button
						size="sm"
						variant="outline"
						onClick={() => void doSave()}
						disabled={readOnly || saving || (!dirty && syncState !== 'unsynced')}
						title="Save your progress. Nothing is validated and the paper is not submitted."
					>
						{saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
						Save Draft
					</Button>
				</div>
			</div>

			{/* Work this browser is holding that the server never received. Offered
			    rather than applied: the server copy may well be the newer one. */}
			{recovery && !readOnly && (
				<div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
					<p className="font-medium flex items-center gap-1.5">
						<AlertTriangle className="h-4 w-4" />
						Unsaved work found in this browser
					</p>
					<p className="mt-1 text-xs">
						Edits from{' '}
						{new Date(recovery.savedAt).toLocaleString('en-IN', {
							day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
						})}{' '}
						never reached the server — most likely the connection dropped or the tab closed.
						Restoring replaces what is on screen with that version.
					</p>
					<div className="mt-2 flex gap-2">
						<Button
							size="sm"
							onClick={() => {
								setQuestions(recovery.questions)
								setDirty(true)
								setRecovery(null)
							}}
						>
							Restore them
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								clearLocalDraft()
								setRecovery(null)
							}}
						>
							Discard
						</Button>
					</div>
				</div>
			)}

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
							// Both selectors always render: the rule requires them on every
							// question, so hiding either would make a paper unsubmittable
							// with no way for the examiner to fix it.
							return (
								/* data-qp-image-scope: Ctrl+V anywhere inside this card attaches
								   the screenshot to THIS question — see QuestionImageField. */
								<Card
									key={q.id}
									data-qp-image-scope
									className={cn(q.is_choice_alternative && 'ml-4 border-dashed')}
								>
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
															{/* CO and K-level are mandatory on every sub-division; an
															    unset one is outlined so it is findable at a glance. */}
															<Select
																value={sb.co_code || ''}
																onValueChange={v => patchSub(q, sb.id, { co_code: v })}
																disabled={readOnly}
															>
																<SelectTrigger
																	className={cn(
																		'h-8 w-24 text-xs',
																		!sb.co_code && !readOnly && 'border-destructive'
																	)}
																>
																	<SelectValue placeholder="CO *" />
																</SelectTrigger>
																<SelectContent>
																	{coOptions.map(c => (
																		<SelectItem key={c} value={c}>{c}</SelectItem>
																	))}
																</SelectContent>
															</Select>
															<Select
																value={sb.k_level || ''}
																onValueChange={v => patchSub(q, sb.id, { k_level: v })}
																disabled={readOnly}
															>
																<SelectTrigger
																	className={cn(
																		'h-8 w-32 text-xs',
																		!sb.k_level && !readOnly && 'border-destructive'
																	)}
																>
																	<SelectValue placeholder="K-level *" />
																</SelectTrigger>
																<SelectContent>
																	{K_LEVELS.map(k => (
																		<SelectItem key={k.code} value={k.code}>{k.label}</SelectItem>
																	))}
																</SelectContent>
															</Select>
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

										{/* CO / K on the question itself — both mandatory. */}
										{subs.length === 0 && (
											<div className="flex flex-wrap gap-2">
												<div>
													<Label className="text-[11px] text-muted-foreground">
														Course Outcome <span className="text-destructive">*</span>
													</Label>
														<Select
															value={q.co_code || ''}
															onValueChange={v => patchQuestion(q.id, { co_code: v })}
															disabled={readOnly}
														>
														<SelectTrigger
															className={cn(
																'h-8 w-28 text-xs mt-0.5',
																!q.co_code && !readOnly && 'border-destructive'
															)}
														>
															<SelectValue placeholder="CO" />
														</SelectTrigger>
														<SelectContent>
															{coOptions.map(c => (
																<SelectItem key={c} value={c}>{c}</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
												<div>
													<Label className="text-[11px] text-muted-foreground">
														K-level <span className="text-destructive">*</span>
													</Label>
														<Select
															value={q.k_level || ''}
															onValueChange={v => patchQuestion(q.id, { k_level: v })}
															disabled={readOnly}
														>
														<SelectTrigger
															className={cn(
																'h-8 w-36 text-xs mt-0.5',
																!q.k_level && !readOnly && 'border-destructive'
															)}
														>
															<SelectValue placeholder="K-level" />
														</SelectTrigger>
														<SelectContent>
															{K_LEVELS.map(k => (
																<SelectItem key={k.code} value={k.code}>{k.label}</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
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
