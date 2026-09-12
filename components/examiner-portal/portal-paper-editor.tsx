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
import {
	Split, X, Plus, AlertTriangle, CheckCircle2, KeyRound, Lock, Eye, Info, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { QuestionRichEditor } from '@/components/ia/question-rich-editor'
import { QuestionImageField } from '@/components/ia/question-image-field'
import { type SyncState } from './sync-badge'
import { K_LEVELS } from '@/types/ia-question-paper'
import type { IaPaperQuestion, IaPaperSubQuestion } from '@/types/ia-question-paper'
import {
	readSubQuestions, relabelSubs, subTotal, canSplit, newId, romanLabel, MAX_SUB_QUESTIONS,
} from '@/lib/ia/sub-questions'
import { validatePaperDetailed, problemAnchor, partAnchor, hasOwnAnswerKey, type PaperProblem } from '@/lib/ia/validate-paper'
import { TONE, FIELD_INVALID } from './tones'

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
	has_choice?: boolean | null
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
	/** Nothing at all may change — submitted, or the window has closed. */
	readOnly: boolean
	/**
	 * May the QUESTION fields be edited? False when the appointment does not
	 * include setting the paper (answer-key-only), or the examiner declined it.
	 * The answer-key fields are governed separately by `answerKeyMode`.
	 */
	questionsEditable?: boolean
	/**
	 * hidden    the appointment has no answer-key component
	 * disabled  it has one, but the examiner declined it — shown, locked, not required
	 * required  accepted — editable and mandatory on every question
	 */
	answerKeyMode?: 'hidden' | 'disabled' | 'required'
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
	 * Every reason the paper cannot be submitted yet (empty = complete), pinned
	 * to the field each is about. Lets the parent disable Submit — and jump to
	 * the first problem — instead of letting the server refuse the click.
	 */
	onValidityChange?: (problems: PaperProblem[]) => void
	/** How many question slots have text, for the progress line beside Submit. */
	onProgressChange?: (info: { done: number; total: number }) => void
	/**
	 * Filled with a "scroll to this anchor" function so the parent's tracker can
	 * take the examiner straight to the first thing to fix.
	 */
	jumpRef?: React.MutableRefObject<((anchor: string) => void) | null>
	/** Lets the parent read the questions as they are right now, unsaved edits included. */
	questionsRef?: React.MutableRefObject<(() => IaPaperQuestion[]) | null>
	/** Called when a conflict cannot be settled automatically; the parent reloads the server copy. */
	onConflict?: () => void
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

/**
 * The parts of a question array that a save can change, in a stable order, so
 * two copies can be compared without caring about key order or extra fields.
 */
function canonicalQuestions(qs: any[]): string {
	return JSON.stringify(
		[...(qs || [])]
			.sort((a, b) => (a?.display_order ?? 0) - (b?.display_order ?? 0))
			.map(q => [
				q?.id,
				plainText(q?.question_text),
				q?.co_code ?? null,
				q?.k_level ?? null,
				q?.marks ?? null,
				(q?.options || []).map((o: any) => [o?.key, plainText(o?.text_html ?? o?.text)]),
				(q?.sub_questions || []).map((s: any) => [s?.label, plainText(s?.question_text), s?.marks ?? null, s?.co_code ?? null, s?.k_level ?? null, plainText(s?.answer_key), s?.answer_key_image?.url ?? null]),
				q?.image?.url ?? null,
				plainText(q?.answer_key),
				q?.answer_key_image?.url ?? null,
			])
	)
}

/** The fields a save can change on one question, compared and merged one by one. */
const MERGE_FIELDS = [
	'question_text', 'co_code', 'k_level', 'marks', 'options', 'sub_questions', 'image', 'answer_key', 'answer_key_image',
] as const

function fieldKey(q: any, f: (typeof MERGE_FIELDS)[number]): string {
	switch (f) {
		case 'question_text':
		case 'answer_key':
			return plainText(q?.[f])
		case 'options':
			return JSON.stringify((q?.options || []).map((o: any) => [o?.key, plainText(o?.text_html ?? o?.text)]))
		case 'sub_questions':
			return JSON.stringify((q?.sub_questions || []).map((s: any) => [s?.label, plainText(s?.question_text), s?.marks ?? null, s?.co_code ?? null, s?.k_level ?? null, s?.image?.url ?? null, plainText(s?.answer_key), s?.answer_key_image?.url ?? null]))
		case 'image':
		case 'answer_key_image':
			return String(q?.[f]?.url ?? '')
		default:
			return JSON.stringify(q?.[f] ?? null)
	}
}

/**
 * Three-way merge of a question list: for each field, if THIS editor changed it
 * since its base, ours stays; otherwise the server's value is taken. So a tab
 * that changed nothing adopts the server copy wholesale, two live tabs each
 * keep only their own edits, and a forgotten tab can never roll a paper back.
 */
function mergeQuestions(base: any[], ours: any[], theirs: any[]): any[] {
	const baseById = new Map<string, any>((base || []).map(q => [String(q?.id), q]))
	const oursById = new Map<string, any>((ours || []).map(q => [String(q?.id), q]))
	return [...(theirs || [])]
		.sort((a, b) => (a?.display_order ?? 0) - (b?.display_order ?? 0))
		.map(t => {
			const id = String(t?.id)
			const o = oursById.get(id)
			if (!o) return t
			const b = baseById.get(id)
			const merged: any = { ...t }
			for (const f of MERGE_FIELDS) {
				const weChanged = b ? fieldKey(o, f) !== fieldKey(b, f) : fieldKey(o, f) !== fieldKey(t, f)
				if (weChanged) merged[f] = o[f]
			}
			return merged
		})
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
	questionsEditable = true,
	answerKeyMode = 'hidden',
	onSaved,
	saveRef,
	onSyncChange,
	onValidityChange,
	onProgressChange,
	jumpRef,
	questionsRef: liveQuestionsRef,
	onConflict,
}: Props) {
	const { toast } = useToast()

	// The question fields lock independently of the answer-key fields: an
	// examiner who declined the paper (or was appointed for the key only) still
	// saves, previews and submits — they just cannot touch the questions.
	const qLocked = readOnly || !questionsEditable
	const akEditable = !readOnly && answerKeyMode === 'required'

	const [questions, setQuestions] = useState<IaPaperQuestion[]>(initialQuestions)
	const [dirty, setDirty] = useState(false)
	const [saving, setSaving] = useState(false)
	const [savedAt, setSavedAt] = useState<string | null>(null)
	const [syncState, setSyncState] = useState<SyncState>('idle')
	const [syncError, setSyncError] = useState<string | null>(null)
	/**
	 * Whether the last failure is worth retrying on a timer. A dropped
	 * connection or a 5xx is; a 4xx is the server saying "not like this" and
	 * will fail identically until the input changes — so it waits for the next
	 * edit instead of hammering the route every 15 s.
	 */
	const [retryable, setRetryable] = useState(true)
	/** One automatic rebase per conflict; a second conflict is handed to the person. */
	const conflictRetriesRef = useRef(0)
	/** A newer draft found in this browser than the server has — offered, not forced. */
	const [recovery, setRecovery] = useState<LocalDraft | null>(null)
	const baseRef = useRef<string | null>(baseUpdatedAt)
	/** The questions as the server last confirmed them — what a merge measures our edits against. */
	const baseQuestionsRef = useRef<IaPaperQuestion[]>(initialQuestions)

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
		baseQuestionsRef.current = initialQuestions
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
				if (!res.ok) {
					const err: any = new Error(json?.message || json?.error || `HTTP ${res.status}`)
					err.status = res.status
					err.code = json?.error
					err.body = json
					throw err
				}

				conflictRetriesRef.current = 0
				setRetryable(true)
				baseRef.current = json.updated_at || baseRef.current
				baseQuestionsRef.current = payload
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
				const status: number = Number(e?.status) || 0

				// ── Stale base: rebase, do not loop ───────────────────────────
				// The server's copy moved on (typically this examiner's previous
				// editor instance landing an autosave late). Adopt the new base; if
				// the server already holds exactly what we were sending, we are in
				// sync; otherwise resend ONCE on the new base — same examiner, same
				// paper, so our newer edits win. A second conflict goes to the person.
				if (status === 409 && e?.code === 'CONFLICT' && e?.body?.current_updated_at) {
					const serverQs = Array.isArray(e.body.current_questions) ? e.body.current_questions : null
					if (serverQs) {
						// Rebase: keep only what THIS editor changed since its base, take
						// the rest from the server. A tab that changed nothing ends up
						// identical to the server and sends nothing more.
						const merged = mergeQuestions(baseQuestionsRef.current, questionsRef.current, serverQs) as IaPaperQuestion[]
						baseRef.current = e.body.current_updated_at
						baseQuestionsRef.current = serverQs as IaPaperQuestion[]
						setQuestions(merged)
						questionsRef.current = merged
						if (canonicalQuestions(merged) === canonicalQuestions(serverQs)) {
							conflictRetriesRef.current = 0
							setDirty(false)
							setSavedAt(new Date().toISOString())
							setSyncState('saved')
							setSyncError(null)
							clearLocalDraft()
							return true
						}
						if (conflictRetriesRef.current < 3) {
							conflictRetriesRef.current++
							rerunRef.current = true // `finally` re-runs the save on the merged copy
							return false
						}
					}
					conflictRetriesRef.current = 0
					writeLocalDraft(payload)
					setSyncState('conflict')
					setSyncError(e?.message || 'This paper was changed elsewhere')
					if (!opts.silent) {
						toast({
							title: 'Changed elsewhere',
							description: 'The server holds a newer copy of this paper. Reload it, then re-apply your edits — they are kept in this browser.',
							variant: 'destructive',
						})
					}
					return false
				}

				// ── Stale copy: the payload would blank questions written since ──
				// Resending can only erase work; the person has to reload and re-apply.
				if (status === 409 && e?.code === 'WOULD_CLEAR') {
					writeLocalDraft(payload)
					setSyncState('conflict')
					setSyncError('The server holds newer content for this paper')
					if (!opts.silent) {
						toast({
							title: 'Newer content on the server',
							description: e?.message || 'Reload the paper before saving.',
							variant: 'destructive',
						})
					}
					return false
				}

				// The local mirror is what makes a failure survivable, so it is
				// written before anything is said about the failure.
				writeLocalDraft(payload)
				setRetryable(status === 0 || status >= 500 || status === 408 || status === 429)
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

	// Hand the parent a FLUSH, not just a save: it first waits for any save
	// already in flight, so a parent that is about to remount this editor (after
	// a willingness change, a failed submit …) never captures a base that a late
	// autosave from this instance then invalidates — the exact race that turned
	// every later save into a 409.
	useEffect(() => {
		if (saveRef) {
			saveRef.current = async () => {
				let waited = 0
				while (savingRef.current && waited < 20_000) {
					await new Promise(r => setTimeout(r, 100))
					waited += 100
				}
				if (!dirtyRef.current && syncStateRef.current !== 'unsynced' && syncStateRef.current !== 'conflict') return true
				return doSave()
			}
		}
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

	// Retry while offline / after a 5xx, until it lands. A 4xx is not retried
	// on a timer: the same payload would be refused the same way. The next edit
	// (autosave) or Save Draft tries again with new input.
	useEffect(() => {
		if (syncState !== 'unsynced' || readOnly || !retryable) return
		const t = setInterval(() => void doSave({ silent: true }), UNSYNCED_RETRY_MS)
		return () => clearInterval(t)
	}, [syncState, readOnly, retryable, doSave])

	// Save on the way out: switching tab, minimising, or closing. visibilitychange
	// is the one event mobile browsers reliably fire before discarding a page.
	useEffect(() => {
		if (readOnly) return
		const onHide = () => {
			if (!dirtyRef.current) return
			writeLocalDraft(questionsRef.current)
			void doSave({ silent: true })
		}
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') onHide()
		}
		document.addEventListener('visibilitychange', onVisibility)
		window.addEventListener('pagehide', onHide)
		return () => {
			document.removeEventListener('visibilitychange', onVisibility)
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

	// ── Completeness — the SAME rules the server runs on Submit ───────────
	// lib/ia/validate-paper is pure, so the browser and the API cannot disagree
	// about what "complete" means. Each problem is pinned to a field anchor.
	const problems = useMemo(
		() =>
			validatePaperDetailed(questions, templateParts, {
				requireAnswerKey: answerKeyMode === 'required',
				skipQuestions: !questionsEditable,
				checkStructure: true,
			}),
		[questions, templateParts, questionsEditable, answerKeyMode]
	)

	useEffect(() => {
		onValidityChange?.(problems)
	}, [problems, onValidityChange])

	useEffect(() => {
		if (liveQuestionsRef) liveQuestionsRef.current = () => questionsRef.current
		return () => {
			if (liveQuestionsRef) liveQuestionsRef.current = null
		}
	}, [liveQuestionsRef])

	/** Problems grouped by the field they sit on, and by question. */
	const problemsByAnchor = useMemo(() => {
		const m = new Map<string, PaperProblem[]>()
		for (const p of problems) {
			const list = m.get(p.anchor) || []
			list.push(p)
			m.set(p.anchor, list)
		}
		return m
	}, [problems])
	const problemsByQuestion = useMemo(() => {
		const m = new Map<string, PaperProblem[]>()
		for (const p of problems) {
			if (!p.questionId) continue
			const list = m.get(p.questionId) || []
			list.push(p)
			m.set(p.questionId, list)
		}
		return m
	}, [problems])
	const problemsByPart = useMemo(() => {
		const m = new Map<string, PaperProblem[]>()
		for (const p of problems) {
			if (!p.partLabel) continue
			const list = m.get(p.partLabel) || []
			list.push(p)
			m.set(p.partLabel, list)
		}
		return m
	}, [problems])
	const coeProblems = useMemo(() => problems.filter(p => p.needsCoe), [problems])
	const ownProblems = useMemo(() => problems.filter(p => !p.needsCoe), [problems])

	// ── Jump to a field ───────────────────────────────────────────────────
	// Scrolls the anchor into view and flashes it for a moment, so a click in
	// the summary list lands the eye on the right box, not just the right area.
	const [flash, setFlash] = useState<string | null>(null)
	const jumpTo = useCallback((anchor: string) => {
		const el = document.getElementById(anchor)
		if (!el) return
		el.scrollIntoView({ behavior: 'smooth', block: 'center' })
		setFlash(anchor)
		window.setTimeout(() => setFlash(f => (f === anchor ? null : f)), 2000)
	}, [])
	useEffect(() => {
		if (jumpRef) jumpRef.current = jumpTo
		return () => {
			if (jumpRef) jumpRef.current = null
		}
	}, [jumpRef, jumpTo])

	const doneCount = useMemo(
		() =>
			questions.filter(q => {
				const subs = readSubQuestions(q)
				return subs.length > 0 ? subs.every(s => plainText(s.question_text)) : !!plainText(q.question_text)
			}).length,
		[questions]
	)
	useEffect(() => {
		onProgressChange?.({ done: doneCount, total: questions.length })
	}, [doneCount, questions.length, onProgressChange])

	// CO1–CO5 are always offered, in order. The course's own outcome rows are
	// merged in (they may add CO6 or carry descriptions) but never shrink the
	// list: an incomplete or oddly ordered outcome master must not stop an
	// examiner tagging a question to CO4 or CO5.
	const coOptions = useMemo(() => {
		const codes = new Set<string>(['CO1', 'CO2', 'CO3', 'CO4', 'CO5'])
		for (const c of courseOutcomes) if (c?.co_code) codes.add(String(c.co_code).trim().toUpperCase())
		const num = (v: string) => Number((v.match(/\d+/) || ['0'])[0])
		return [...codes].sort((a, b) => num(a) - num(b) || a.localeCompare(b))
	}, [courseOutcomes])

	// Errors are only drawn while the examiner can act on them. A submitted or
	// closed paper is shown clean: red outlines on fields nobody can edit would
	// read as "something is wrong with my submission".
	const showErrors = !readOnly
	const [showAll, setShowAll] = useState(false)

	/** The problems on one field, or none. */
	const at = (anchor: string): PaperProblem[] | undefined => (showErrors ? problemsByAnchor.get(anchor) : undefined)

	/**
	 * The answer-key box. One per question — or, for a split question, one per
	 * sub-division, because each sub-division is a separately valued answer.
	 * A plain function, not a component, so the rich editor inside keeps its
	 * state across renders.
	 */
	const renderAnswerKey = (opts: {
		anchor: string
		label: string
		value: string | null | undefined
		image: any
		onText: (html: string) => void
		onImage: (img: any) => void
	}) => {
		const invalid = !!at(opts.anchor)?.length
		return (
			<FieldFrame anchor={opts.anchor} errors={at(opts.anchor)} flashing={flash === opts.anchor}>
				<div
					className={cn(
						'rounded-md border p-2.5 space-y-2',
						answerKeyMode === 'required'
							? invalid
								? 'border-rose-300 bg-rose-50/40'
								: 'border-amber-200 bg-amber-50/40'
							: 'border-slate-200 bg-slate-50 opacity-75'
					)}
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<Label className="text-xs font-semibold flex items-center gap-1.5">
							<KeyRound className="h-3.5 w-3.5 text-amber-700" />
							{opts.label}
							{answerKeyMode === 'required' && <span className="text-rose-600">*</span>}
						</Label>
						{answerKeyMode === 'disabled' && (
							<span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
								<Lock className="h-3 w-3" />
								Not accepted — no answer key is needed from you
							</span>
						)}
					</div>
					<QuestionRichEditor
						value={opts.value || ''}
						onChange={opts.onText}
						disabled={!akEditable}
						placeholder="Type the answer key / marking scheme for this question…"
						className={cn(invalid && 'border-rose-400 ring-1 ring-rose-300')}
					/>
					{akEditable ? (
						<QuestionImageField
							paperId={assignmentId}
							uploadUrl={`/api/examiner-portal/assignments/${assignmentId}/image`}
							value={opts.image || null}
							onChange={img => opts.onImage(img)}
							label="Attach image to the answer key"
						/>
					) : opts.image?.url ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={opts.image.url} alt="" draggable={false} className="max-w-full max-h-64 rounded border" />
					) : null}
				</div>
			</FieldFrame>
		)
	}

	/** Status chip on a question card. */
	const questionChip = (qid: string, locked: boolean) => {
		if (locked) {
			return (
				<span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', TONE.locked.badge)}>
					<Lock className="h-3 w-3" />
					{readOnly ? 'Read-only' : 'Not yours to edit'}
				</span>
			)
		}
		const n = problemsByQuestion.get(qid)?.length || 0
		if (n === 0) {
			return (
				<span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', TONE.success.badge)}>
					<CheckCircle2 className="h-3 w-3" />
					Complete
				</span>
			)
		}
		return (
			<span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', TONE.danger.badge)}>
				<AlertTriangle className="h-3 w-3" />
				{n} to fix
			</span>
		)
	}

	const selectClass = (invalid: boolean, width: string) =>
		cn('h-8 text-xs', width, invalid && FIELD_INVALID)

	return (
		<div className="space-y-4">
			{/* Work this browser is holding that the server never received. Offered
			    rather than applied: the server copy may well be the newer one. */}
			{recovery && !readOnly && (
				<div className={cn('rounded-md border-2 p-3 text-sm', TONE.warning.card, TONE.warning.frame)}>
					<p className={cn('font-semibold flex items-center gap-1.5', TONE.warning.heading)}>
						<AlertTriangle className="h-4 w-4" />
						Unsaved work found in this browser
					</p>
					<p className={cn('mt-1 text-xs', TONE.warning.text)}>
						Edits from{' '}
						{new Date(recovery.savedAt).toLocaleString('en-IN', {
							day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
						})}{' '}
						never reached the server — most likely the connection dropped or the tab closed.{' '}
						<span className="font-semibold text-rose-700">Restoring replaces what is on screen with that version.</span>
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

			{/* Who may edit what. */}
			{readOnly ? (
				<div className={cn('rounded-md border p-3 text-sm flex items-start gap-2', TONE.locked.card, TONE.locked.text)}>
					<Eye className={cn('h-4 w-4 shrink-0 mt-0.5', TONE.locked.icon)} />
					<p>
						<span className="font-semibold">Read-only.</span> This paper has been submitted, or the entry period has
						ended. Nothing on it can be changed, downloaded or printed.
					</p>
				</div>
			) : !questionsEditable ? (
				<div className={cn('rounded-md border p-3 text-sm flex items-start gap-2', TONE.info.card, TONE.info.text)}>
					<Info className={cn('h-4 w-4 shrink-0 mt-0.5', TONE.info.icon)} />
					<p>
						<span className="font-semibold">The questions are locked for you.</span>{' '}
						{answerKeyMode === 'required'
							? 'Your appointment is for the answer key only — type the answer key in the yellow box under each question.'
							: 'You have not accepted setting this question paper.'}
					</p>
				</div>
			) : (
				<div className={cn('rounded-md border p-3 text-xs flex flex-wrap items-center gap-x-4 gap-y-1', TONE.locked.card, TONE.locked.text)}>
					<span className="font-semibold text-slate-800">How to read this page</span>
					<span className="inline-flex items-center gap-1"><span className="text-rose-600 font-bold">*</span> required</span>
					<span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-5 rounded border-2 border-rose-400 bg-rose-50" /> needs a value or has a problem</span>
					<span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> question complete</span>
					<span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5 text-slate-500" /> locked</span>
				</div>
			)}

			{/* Things only the CoE can put right — template or data problems. */}
			{showErrors && coeProblems.length > 0 && (
				<div className={cn('rounded-md border-2 p-3 text-sm', TONE.danger.card, TONE.danger.frame)}>
					<p className={cn('font-semibold flex items-center gap-1.5', TONE.danger.heading)}>
						<AlertTriangle className="h-4 w-4" />
						This paper cannot be submitted until the Office of the Controller of Examinations corrects it
					</p>
					<ul className={cn('mt-1.5 text-xs space-y-0.5 list-disc pl-5', TONE.danger.text)}>
						{coeProblems.map((p, i) => (
							<li key={i}>{p.message}</li>
						))}
					</ul>
					<p className={cn('text-xs mt-1.5', TONE.danger.text)}>
						You do not need to do anything on the paper for these. Please contact the CoE office.
					</p>
				</div>
			)}

			{/* What the examiner still has to do — clickable. */}
			{showErrors && ownProblems.length > 0 && (
				<div className={cn('rounded-md border-2 p-3', TONE.warning.card, TONE.warning.frame)}>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className={cn('text-sm font-semibold flex items-center gap-1.5', TONE.warning.heading)}>
							<AlertTriangle className="h-4 w-4" />
							{ownProblems.length} item{ownProblems.length === 1 ? '' : 's'} to complete before you can submit
						</p>
						{ownProblems.length > 8 && (
							<button
								type="button"
								className={cn('text-xs underline-offset-2 hover:underline inline-flex items-center gap-1', TONE.warning.text)}
								onClick={() => setShowAll(v => !v)}
							>
								{showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
								{showAll ? 'Show fewer' : `Show all ${ownProblems.length}`}
							</button>
						)}
					</div>
					<p className={cn('text-xs mt-0.5', TONE.warning.text)}>
						Click an item to go straight to it. Each field that needs a value is outlined in red.
					</p>
					<ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
						{(showAll ? ownProblems : ownProblems.slice(0, 8)).map((p, i) => (
							<li key={`${p.anchor}-${p.field}-${i}`}>
								<button
									type="button"
									onClick={() => jumpTo(p.anchor)}
									className="w-full text-left text-xs rounded px-2 py-1 hover:bg-amber-100 flex gap-2 items-baseline"
								>
									<span className={cn('font-semibold shrink-0 w-16 truncate', TONE.warning.heading)}>{p.where}</span>
									<span className={TONE.warning.text}>{p.message.replace(/^[^:]+:\s*/, '')}</span>
								</button>
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Parts */}
			{[...grouped.entries()].map(([label, qs]) => {
				const part = partByLabel.get(label)
				const answerCount = Number(part?.num_to_answer) > 0 ? Number(part!.num_to_answer) : part?.num_questions || qs.length
				const each = part?.marks_per_question ?? qs[0]?.marks ?? 0
				const partProblems = showErrors ? problemsByPart.get(label) || [] : []
				const partDone = qs.filter(q => (problemsByQuestion.get(q.id)?.length || 0) === 0).length
				const partOk = partProblems.length === 0
				const partAnchorId = partAnchor(label)
				const structural = at(partAnchorId)
				return (
					<div key={label} className="space-y-3">
						<div
							id={partAnchorId}
							className={cn(
								'rounded-md border-l-4 px-3 py-2 flex flex-wrap items-center justify-between gap-2 scroll-mt-40',
								partOk ? 'bg-emerald-50/70 border-emerald-400' : 'bg-muted/60 border-slate-300',
								structural?.length && 'bg-rose-50 border-rose-400',
								flash === partAnchorId && 'ring-2 ring-offset-2 ring-rose-400'
							)}
						>
							<div className="min-w-0">
								<p className="font-semibold text-sm">
									PART {label} — ({answerCount} × {each} = {Number(answerCount) * Number(each)} marks)
								</p>
								{part?.instruction && <p className="text-xs text-muted-foreground mt-0.5">{part.instruction}</p>}
								{structural?.map((p, i) => (
									<p key={i} className="text-xs text-rose-700 mt-0.5 flex items-center gap-1">
										<AlertTriangle className="h-3 w-3" />
										{p.message}
									</p>
								))}
							</div>
							{showErrors && (
								<span
									className={cn(
										'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0',
										partOk ? TONE.success.badge : TONE.warning.badge
									)}
								>
									{partOk ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
									{partDone} of {qs.length} complete
								</span>
							)}
						</div>

						{qs.map(q => {
							const subs = readSubQuestions(q)
							const qProblems = showErrors ? problemsByQuestion.get(q.id) || [] : []
							const qOk = qProblems.length === 0
							const cardTone = qLocked && !akEditable ? 'border-l-slate-300' : qOk ? 'border-l-emerald-400' : 'border-l-rose-400'
							const textAnchor = problemAnchor(q.id, 'question_text')
							const marksAnchor = problemAnchor(q.id, 'marks')
							// Both selectors always render: the rule requires them on every
							// question, so hiding either would make a paper unsubmittable
							// with no way for the examiner to fix it.
							return (
								/* data-qp-image-scope: Ctrl+V anywhere inside this card attaches
								   the screenshot to THIS question — see QuestionImageField. */
								<Card
									key={q.id}
									id={`qp-q-${q.id}`}
									data-qp-image-scope
									className={cn('border-l-4 scroll-mt-40', cardTone, q.is_choice_alternative && 'ml-3 sm:ml-5 border-dashed border-l-solid')}
								>
									<CardContent className="p-3 space-y-3">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<div className="flex flex-wrap items-center gap-2">
												<span className="font-semibold text-sm">
													Q{q.question_number}
													{q.sub_label ? ` ${q.sub_label})` : ''}
												</span>
												{q.is_choice_alternative && (
													<Badge variant="outline" className="text-[10px]">OR</Badge>
												)}
												{q.marks != null && (
													<span
														id={subs.length === 0 ? marksAnchor : undefined}
														className={cn(
															'text-xs rounded px-1.5 py-0.5',
															at(marksAnchor)?.length && subs.length === 0 ? 'bg-rose-50 text-rose-700 border border-rose-300' : 'text-muted-foreground bg-muted'
														)}
													>
														{q.marks} marks
													</span>
												)}
											</div>
											<div className="flex items-center gap-2">
												{questionChip(q.id, qLocked && !akEditable)}
												{!qLocked && canSplit(q) && subs.length === 0 && (
													<Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => splitQuestion(q)}>
														<Split className="h-3.5 w-3.5 mr-1" />
														Split into (i)/(ii)
													</Button>
												)}
											</div>
										</div>

										{/* Question text (a stem when split) */}
										<FieldFrame
											anchor={textAnchor}
											errors={at(textAnchor)}
											flashing={flash === textAnchor}
											label={subs.length > 0 ? 'Common stem' : 'Question'}
											required={subs.length === 0 && !qLocked}
											hint={subs.length > 0 ? 'optional' : undefined}
										>
											<QuestionRichEditor
												value={q.question_text || ''}
												onChange={html => patchQuestion(q.id, { question_text: html })}
												disabled={qLocked}
												placeholder={subs.length > 0 ? 'Optional shared text…' : 'Type the question here…'}
												className={cn(at(textAnchor)?.length && 'border-rose-400 ring-1 ring-rose-300')}
											/>
										</FieldFrame>

										{/* Figure */}
										{!qLocked && (
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
												{q.options.map(o => {
													const oAnchor = problemAnchor(q.id, 'option', { optionKey: o.key })
													return (
														<FieldFrame key={o.key} anchor={oAnchor} errors={at(oAnchor)} flashing={flash === oAnchor} className="flex items-start gap-2">
															<span className="pt-2 text-sm font-medium w-5">{o.key})</span>
															<div className="flex-1">
																<QuestionRichEditor
																	value={o.text_html || o.text || ''}
																	onChange={html => patchOption(q.id, o.key, html)}
																	disabled={qLocked}
																	variant="compact"
																	placeholder={`Option ${o.key} *`}
																	className={cn(at(oAnchor)?.length && 'border-rose-400 ring-1 ring-rose-300')}
																/>
															</div>
														</FieldFrame>
													)
												})}
											</div>
										)}

										{/* Sub-divisions */}
										{subs.length > 0 && (
											<div className="space-y-3 border-l-2 pl-3">
												{subs.map(sb => {
													const sText = problemAnchor(q.id, 'question_text', { subId: sb.id })
													const sMarks = problemAnchor(q.id, 'marks', { subId: sb.id })
													const sCo = problemAnchor(q.id, 'co_code', { subId: sb.id })
													const sK = problemAnchor(q.id, 'k_level', { subId: sb.id })
													return (
														<div key={sb.id} className="space-y-2">
															<div className="flex items-center justify-between">
																<span className="text-xs font-semibold">({sb.label})</span>
																{!qLocked && (
																	<Button
																		variant="ghost"
																		size="icon"
																		className="h-6 w-6 text-rose-600"
																		onClick={() => removeSub(q, sb.id)}
																		aria-label="Remove sub-division"
																		title="Remove this sub-division"
																	>
																		<X className="h-3.5 w-3.5" />
																	</Button>
																)}
															</div>
															<FieldFrame anchor={sText} errors={at(sText)} flashing={flash === sText} label="Sub-division text" required={!qLocked}>
																<QuestionRichEditor
																	value={sb.question_text || ''}
																	onChange={html => patchSub(q, sb.id, { question_text: html })}
																	disabled={qLocked}
																	variant="compact"
																	placeholder="Type this sub-division…"
																	className={cn(at(sText)?.length && 'border-rose-400 ring-1 ring-rose-300')}
																/>
															</FieldFrame>
															<div className="flex flex-wrap gap-2 items-start">
																<FieldFrame anchor={sMarks} errors={at(sMarks)} flashing={flash === sMarks} label="Marks" required={!qLocked} className="w-24">
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
																		disabled={qLocked}
																		placeholder="Marks"
																		aria-invalid={!!at(sMarks)?.length}
																		className={cn('h-8 text-xs', at(sMarks)?.length && FIELD_INVALID)}
																	/>
																</FieldFrame>
																<FieldFrame anchor={sCo} errors={at(sCo)} flashing={flash === sCo} label="Course Outcome" required={!qLocked} className="w-28">
																	<Select
																		value={sb.co_code || ''}
																		onValueChange={v => patchSub(q, sb.id, { co_code: v })}
																		disabled={qLocked}
																	>
																		<SelectTrigger className={selectClass(!!at(sCo)?.length, 'w-full')} aria-invalid={!!at(sCo)?.length}>
																			<SelectValue placeholder="Select CO" />
																		</SelectTrigger>
																		<SelectContent>
																			{coOptions.map(c => (
																				<SelectItem key={c} value={c}>{c}</SelectItem>
																			))}
																		</SelectContent>
																	</Select>
																</FieldFrame>
																<FieldFrame anchor={sK} errors={at(sK)} flashing={flash === sK} label="K-level" required={!qLocked} className="w-40">
																	<Select
																		value={sb.k_level || ''}
																		onValueChange={v => patchSub(q, sb.id, { k_level: v })}
																		disabled={qLocked}
																	>
																		<SelectTrigger className={selectClass(!!at(sK)?.length, 'w-full')} aria-invalid={!!at(sK)?.length}>
																			<SelectValue placeholder="Select K-level" />
																		</SelectTrigger>
																		<SelectContent>
																			{K_LEVELS.map(k => (
																				<SelectItem key={k.code} value={k.code}>{k.label}</SelectItem>
																			))}
																		</SelectContent>
																	</Select>
																</FieldFrame>
															</div>
															{/* Each sub-division is valued on its own, so each carries its own key. */}
															{answerKeyMode !== 'hidden' &&
																renderAnswerKey({
																	anchor: problemAnchor(q.id, 'answer_key', { subId: sb.id }),
																	label: `Answer Key (${sb.label})`,
																	value: sb.answer_key,
																	image: sb.answer_key_image,
																	onText: html => patchSub(q, sb.id, { answer_key: html }),
																	onImage: img => patchSub(q, sb.id, { answer_key_image: img }),
																})}
														</div>
													)
												})}
												<div className="flex flex-wrap items-center justify-between gap-2 pt-1">
													<FieldFrame anchor={marksAnchor} errors={at(marksAnchor)} flashing={flash === marksAnchor}>
														<span
															className={cn(
																'text-xs rounded px-1.5 py-0.5 inline-flex items-center gap-1',
																at(marksAnchor)?.length
																	? 'bg-rose-50 text-rose-700 border border-rose-300 font-medium'
																	: subs.every(s => s.marks != null)
																		? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
																		: 'text-muted-foreground'
															)}
														>
															{at(marksAnchor)?.length ? <AlertTriangle className="h-3 w-3" /> : subs.every(s => s.marks != null) ? <CheckCircle2 className="h-3 w-3" /> : null}
															Sub-division marks: {subTotal(subs)} / {q.marks ?? '—'}
														</span>
													</FieldFrame>
													{!qLocked && subs.length < MAX_SUB_QUESTIONS && (
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
											<div className="flex flex-wrap gap-2 items-start">
												<FieldFrame anchor={problemAnchor(q.id, 'co_code')} errors={at(problemAnchor(q.id, 'co_code'))} flashing={flash === problemAnchor(q.id, 'co_code')} label="Course Outcome" required={!qLocked} className="w-32">
													<Select
														value={q.co_code || ''}
														onValueChange={v => patchQuestion(q.id, { co_code: v })}
														disabled={qLocked}
													>
														<SelectTrigger
															className={selectClass(!!at(problemAnchor(q.id, 'co_code'))?.length, 'w-full')}
															aria-invalid={!!at(problemAnchor(q.id, 'co_code'))?.length}
														>
															<SelectValue placeholder="Select CO" />
														</SelectTrigger>
														<SelectContent>
															{coOptions.map(c => (
																<SelectItem key={c} value={c}>{c}</SelectItem>
															))}
														</SelectContent>
													</Select>
												</FieldFrame>
												<FieldFrame anchor={problemAnchor(q.id, 'k_level')} errors={at(problemAnchor(q.id, 'k_level'))} flashing={flash === problemAnchor(q.id, 'k_level')} label="K-level" required={!qLocked} className="w-44">
													<Select
														value={q.k_level || ''}
														onValueChange={v => patchQuestion(q.id, { k_level: v })}
														disabled={qLocked}
													>
														<SelectTrigger
															className={selectClass(!!at(problemAnchor(q.id, 'k_level'))?.length, 'w-full')}
															aria-invalid={!!at(problemAnchor(q.id, 'k_level'))?.length}
														>
															<SelectValue placeholder="Select K-level" />
														</SelectTrigger>
														<SelectContent>
															{K_LEVELS.map(k => (
																<SelectItem key={k.code} value={k.code}>{k.label}</SelectItem>
															))}
														</SelectContent>
													</Select>
												</FieldFrame>
											</div>
										)}

										{/* Answer key — belongs to THIS question, never printed on the paper.
										    A split question is keyed under each sub-division instead; the
										    whole-question box stays only where an older paper already has one. */}
										{answerKeyMode !== 'hidden' &&
											(subs.length === 0 || hasOwnAnswerKey(q)) &&
											renderAnswerKey({
												anchor: problemAnchor(q.id, 'answer_key'),
												label: subs.length > 0 ? 'Common answer key (whole question)' : 'Answer Key',
												value: q.answer_key,
												image: q.answer_key_image,
												onText: html => patchQuestion(q.id, { answer_key: html }),
												onImage: img => patchQuestion(q.id, { answer_key_image: img as any }),
											})}
									</CardContent>
								</Card>
							)
						})}
					</div>
				)
			})}

			{/* A second copy of the summary at the foot, so an examiner who scrolled
			    to the end is not sent hunting back up. */}
			{showErrors && ownProblems.length > 0 && (
				<div className={cn('rounded-md border p-3 text-sm flex flex-wrap items-center justify-between gap-2', TONE.warning.card)}>
					<span className={cn('font-medium flex items-center gap-1.5', TONE.warning.heading)}>
						<AlertTriangle className="h-4 w-4" />
						{ownProblems.length} item{ownProblems.length === 1 ? '' : 's'} still to complete
					</span>
					<Button size="sm" variant="outline" onClick={() => jumpTo(ownProblems[0].anchor)}>
						Take me to the first one
					</Button>
				</div>
			)}
			{showErrors && problems.length === 0 && questions.length > 0 && (
				<div className={cn('rounded-md border p-3 text-sm flex items-center gap-2', TONE.success.card, TONE.success.text)}>
					<CheckCircle2 className={cn('h-4 w-4', TONE.success.icon)} />
					<span className="font-medium">Every question is complete.</span> Use the Submit button above when you are ready.
				</div>
			)}
		</div>
	)
}

/**
 * Wraps one field: gives it its anchor id (so the summary list can scroll to
 * it), the red label and message when it has a problem, and a brief flash
 * after a jump. A module-level component, NOT one defined inside the editor's
 * render — that would remount every rich editor on every keystroke.
 */
function FieldFrame({
	anchor,
	errors,
	flashing,
	label,
	required,
	hint,
	className,
	children,
}: {
	anchor: string
	errors?: PaperProblem[]
	flashing?: boolean
	label?: React.ReactNode
	required?: boolean
	hint?: string
	className?: string
	children: React.ReactNode
}) {
	const invalid = !!errors?.length
	return (
		<div
			id={anchor}
			className={cn(
				'rounded-md transition-shadow scroll-mt-40',
				flashing && 'ring-2 ring-offset-2 ring-rose-400',
				className
			)}
		>
			{label && (
				<Label className={cn('text-[11px] flex items-center gap-1', invalid ? 'text-rose-700' : 'text-muted-foreground')}>
					{label}
					{required && <span className="text-rose-600 font-semibold">*</span>}
					{hint && <span className="font-normal opacity-70">— {hint}</span>}
				</Label>
			)}
			<div className={cn(label && 'mt-0.5')}>{children}</div>
			{invalid && (
				<p className="text-[11px] text-rose-700 mt-1 flex items-start gap-1" role="alert">
					<AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
					<span>{[...new Set(errors!.map(e => e.short))].join(' · ')}</span>
				</p>
			)}
		</div>
	)
}
