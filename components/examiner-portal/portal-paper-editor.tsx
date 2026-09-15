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
	Split, X, Plus, AlertTriangle, CheckCircle2, KeyRound, Lock, Eye, Loader2, Save, ArrowRight, ArrowLeft,
	Pencil, Send, Circle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { QuestionRichEditor } from '@/components/ia/question-rich-editor'
import { QuestionImageField } from '@/components/ia/question-image-field'
import { SyncBadge, type SyncState } from './sync-badge'
import { K_LEVELS } from '@/types/ia-question-paper'
import type { IaPaperQuestion, IaPaperSubQuestion } from '@/types/ia-question-paper'
import {
	readSubQuestions, relabelSubs, subTotal, canSplit, newId, romanLabel, MAX_SUB_QUESTIONS, readQuestionImage,
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
	/** Template switch: may questions in this part be split into (i)/(ii)? */
	allow_split?: boolean | null
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
	/**
	 * The final hand-over, pressed from the Review & Submit stage. The parent
	 * opens its confirmation (the preview dialog) and does the server call.
	 */
	onSubmit?: () => void
	/** Why the final Submit cannot be pressed right now (sync state etc.), or null. */
	submitReason?: string | null
	submitting?: boolean
	/** Reports the stage the examiner is on, for the parent's compact header. */
	onStageChange?: (info: { stage: FlowStage; label: string; index: number; total: number }) => void
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
	onSubmit,
	submitReason = null,
	submitting = false,
	onStageChange,
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
			// A mirror is only "unsaved work" if it is newer than the server copy
			// AND actually differs from it. A save that landed after this browser
			// stopped listening (a tab closed mid-request, an editor unmounted
			// mid-save) leaves a newer-dated mirror with nothing new in it — that
			// must not be offered back as a conflict.
			const newer = new Date(parsed.savedAt).getTime() > serverAt
			const differs = canonicalQuestions(parsed.questions) !== canonicalQuestions(initialQuestions)
			if (newer && differs) setRecovery(parsed)
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

	// These read the CURRENT question inside the state update, never the `q`
	// they were rendered with: a rich-text box keeps the handler it was last
	// rendered with (QuestionRichEditor is memoised), so a handler captured on
	// an older render must still apply its change to the latest sub-divisions.
	const updateSubs = useCallback((qid: string, fn: (subs: any[]) => any[]) => {
		setQuestions(prev =>
			prev.map(q => (q.id === qid ? { ...q, sub_questions: relabelSubs(fn(readSubQuestions(q))) as any } : q))
		)
		setDirty(true)
	}, [])

	const addSub = (q: IaPaperQuestion) =>
		updateSubs(q.id, subs =>
			subs.length >= MAX_SUB_QUESTIONS
				? subs
				: [
						...subs,
						{ id: newId(), label: romanLabel(subs.length), question_text: '', marks: null, co_code: null, k_level: null, display_order: subs.length + 1 },
					]
		)

	const removeSub = (q: IaPaperQuestion, subId: string) =>
		updateSubs(q.id, subs => subs.filter(s => s.id !== subId))

	const patchSub = (q: IaPaperQuestion, subId: string, changes: Partial<IaPaperSubQuestion>) =>
		updateSubs(q.id, subs => subs.map(s => (s.id === subId ? { ...s, ...changes } : s)))

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

	const onSavedRef = useRef(onSaved)
	onSavedRef.current = onSaved

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
				onSavedRef.current({
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
		[assignmentId, readOnly, toast, writeLocalDraft, clearLocalDraft]
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

	// Flush on unmount. The debounce above is cancelled when this editor leaves
	// the page (Exit, back to the list, a remount), and without this the last
	// second and a half of typing reached only the local mirror — which then
	// greeted the examiner with "unsaved work found" on their next visit. The
	// request outlives the component; on success it clears the mirror itself.
	const doSaveRef = useRef(doSave)
	doSaveRef.current = doSave
	useEffect(() => {
		if (readOnly) return
		return () => {
			if (dirtyRef.current || syncStateRef.current === 'unsynced') void doSaveRef.current({ silent: true })
		}
	}, [readOnly])

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

	// The parent redraws its whole page on every report, so one goes out only
	// when the set of problems has actually changed — not on every keystroke.
	const problemsSigRef = useRef<string | null>(null)
	useEffect(() => {
		const sig = problems.map(p => `${p.anchor}|${p.field}|${p.short}|${p.needsCoe ? 1 : 0}`).join('\n')
		if (sig === problemsSigRef.current) return
		problemsSigRef.current = sig
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
	const coeProblems = useMemo(() => problems.filter(p => p.needsCoe), [problems])

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

	// ── The guided flow: Questions → Answers → Review & Submit ─────────────
	//
	// The examiner does one thing at a time. Which stages exist follows the
	// appointment: a paper-only setter never sees Answers, an answer-key-only
	// examiner never sees Questions. Inside a stage the parts open one after
	// another — Part B unlocks when Part A is handed in — so a 60-question paper
	// is never one endless scroll. Where the examiner is in the walk is kept in
	// this browser (localStorage), because it is a reading aid, not a fact about
	// the paper: the server only ever sees the one real Submit at the end.
	const stages = useMemo<FlowStage[]>(() => {
		const s: FlowStage[] = []
		if (questionsEditable) s.push('questions')
		if (answerKeyMode === 'required') s.push('answers')
		s.push('review')
		return s
	}, [questionsEditable, answerKeyMode])

	const [flow, setFlow] = useState<Flow>(() => readFlow(assignmentId))
	useEffect(() => {
		writeFlow(assignmentId, flow)
	}, [assignmentId, flow])

	/** Problems that belong to each entry stage. Review carries everything. */
	const stageProblems = useMemo(
		() => ({
			questions: problems.filter(p => p.field !== 'answer_key'),
			answers: problems.filter(p => p.field === 'answer_key'),
			review: problems,
		}),
		[problems]
	)

	/** Part labels in paper order — whatever the template scaffolded, A…Z. */
	const partLabels = useMemo(() => [...grouped.keys()], [grouped])

	const partComplete = (s: EntryStage, label: string) => !stageProblems[s].some(p => p.partLabel === label)
	const partDone = (s: EntryStage, label: string) => partComplete(s, label) && flow.partsDone[s].includes(label)
	/** A part opens once every part before it has been handed in. */
	const partUnlocked = (s: EntryStage, i: number) =>
		i === 0 || partLabels.slice(0, i).every(l => flow.partsDone[s].includes(l))

	// A stage counts as done only while it is BOTH handed in and still complete:
	// an edit that empties a field re-opens the stage by itself.
	const stageDone: Record<FlowStage, boolean> = {
		questions: !stages.includes('questions') || (flow.questionsSubmitted && stageProblems.questions.length === 0),
		answers: !stages.includes('answers') || (flow.answersSubmitted && stageProblems.answers.length === 0),
		review: false,
	}
	const stageUnlocked = (s: FlowStage) => stages.slice(0, stages.indexOf(s)).every(x => stageDone[x])

	const [stage, setStage] = useState<FlowStage>(() => stages.find(s => !stageDone[s]) || 'review')
	// If the stages themselves change (willingness confirmed → Answers appears)
	// land on the first open one rather than on a stage that no longer exists.
	useEffect(() => {
		if (!stages.includes(stage)) setStage(stages.find(s => !stageDone[s]) || 'review')
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [stages])
	useEffect(() => {
		onStageChange?.({ stage, label: STAGE_LABELS[stage], index: stages.indexOf(stage) + 1, total: stages.length })
	}, [stage, stages, onStageChange])

	const [activePart, setActivePart] = useState<Record<EntryStage, string | null>>({ questions: null, answers: null })
	const defaultPart = (s: EntryStage) => {
		const open = partLabels.find((l, i) => partUnlocked(s, i) && !partDone(s, l))
		if (open) return open
		const unlocked = partLabels.filter((_, i) => partUnlocked(s, i))
		return unlocked[unlocked.length - 1] || partLabels[0] || null
	}
	const currentPart = (s: EntryStage) =>
		activePart[s] && partLabels.includes(activePart[s]!) ? activePart[s]! : defaultPart(s)

	const markPartDone = (s: EntryStage, label: string) =>
		setFlow(f => ({ ...f, partsDone: { ...f.partsDone, [s]: [...new Set([...f.partsDone[s], label])] } }))
	const handInStage = (s: EntryStage) => {
		setFlow(f => ({
			...f,
			partsDone: { ...f.partsDone, [s]: [...partLabels] },
			questionsSubmitted: s === 'questions' ? true : f.questionsSubmitted,
			answersSubmitted: s === 'answers' ? true : f.answersSubmitted,
		}))
		const next = stages[stages.indexOf(s) + 1]
		if (next) setStage(next)
		window.scrollTo({ top: 0, behavior: 'smooth' })
	}
	const reopenStage = (s: EntryStage) => {
		setFlow(f => ({
			...f,
			questionsSubmitted: s === 'questions' ? false : f.questionsSubmitted,
			answersSubmitted: s === 'answers' ? false : f.answersSubmitted,
		}))
		setStage(s)
	}

	// ── Jump to a field ───────────────────────────────────────────────────
	// A problem may sit on another stage or a part that is not on screen, so a
	// jump first switches to it, then scrolls and flashes the field.
	const [flash, setFlash] = useState<string | null>(null)
	const scrollToAnchor = useCallback((anchor: string) => {
		const el = document.getElementById(anchor)
		if (!el) return
		el.scrollIntoView({ behavior: 'smooth', block: 'center' })
		setFlash(anchor)
		window.setTimeout(() => setFlash(f => (f === anchor ? null : f)), 2000)
	}, [])
	const jumpTo = useCallback(
		(anchor: string) => {
			const p = problemsByAnchor.get(anchor)?.[0]
			if (p && !readOnly) {
				const s: EntryStage = p.field === 'answer_key' ? 'answers' : 'questions'
				if (stages.includes(s)) {
					setStage(s)
					if (p.partLabel) setActivePart(a => ({ ...a, [s]: p.partLabel }))
				}
			}
			window.setTimeout(() => scrollToAnchor(anchor), 80)
		},
		[problemsByAnchor, readOnly, stages, scrollToAnchor]
	)
	useEffect(() => {
		if (jumpRef) jumpRef.current = jumpTo
		return () => {
			if (jumpRef) jumpRef.current = null
		}
	}, [jumpRef, jumpTo])

	// Errors are only drawn while the examiner can act on them. A submitted or
	// closed paper is shown clean: red outlines on fields nobody can edit would
	// read as "something is wrong with my submission".
	const showErrors = !readOnly
	/** The problems on one field, or none. */
	const at = (anchor: string): PaperProblem[] | undefined => (showErrors ? problemsByAnchor.get(anchor) : undefined)
	const invalidClass = (anchor: string) => (at(anchor)?.length ? 'border-rose-400 ring-1 ring-rose-300' : '')

	// What may be typed into right now, by stage. A stage that has been handed
	// in is read-only until the examiner presses Edit.
	const qDisabled = qLocked || stageDone.questions
	const akDisabled = !akEditable || stageDone.answers

	// ── Pieces ─────────────────────────────────────────────────────────────

	/** CO + K-level selectors, compact, for the right-hand side of a question row. */
	const coK = (
		coAnchor: string,
		kAnchor: string,
		co: string | null | undefined,
		k: string | null | undefined,
		onCo: (v: string) => void,
		onK: (v: string) => void,
		disabled: boolean
	) => (
		<div className="flex items-start gap-1.5 shrink-0">
			<FieldFrame anchor={coAnchor} errors={at(coAnchor)} flashing={flash === coAnchor} className="w-[88px]">
				<Select value={co || ''} onValueChange={onCo} disabled={disabled}>
					<SelectTrigger className={cn('h-7 text-xs px-2', at(coAnchor)?.length && FIELD_INVALID)} aria-invalid={!!at(coAnchor)?.length} aria-label="Course Outcome">
						<SelectValue placeholder="CO *" />
					</SelectTrigger>
					<SelectContent>
						{coOptions.map(c => (
							<SelectItem key={c} value={c}>{c}</SelectItem>
						))}
					</SelectContent>
				</Select>
			</FieldFrame>
			<FieldFrame anchor={kAnchor} errors={at(kAnchor)} flashing={flash === kAnchor} className="w-[132px]">
				<Select value={k || ''} onValueChange={onK} disabled={disabled}>
					<SelectTrigger className={cn('h-7 text-xs px-2', at(kAnchor)?.length && FIELD_INVALID)} aria-invalid={!!at(kAnchor)?.length} aria-label="K-level">
						<SelectValue placeholder="K-level *" />
					</SelectTrigger>
					<SelectContent>
						{K_LEVELS.map(kl => (
							<SelectItem key={kl.code} value={kl.code}>{kl.label}</SelectItem>
						))}
					</SelectContent>
				</Select>
			</FieldFrame>
		</div>
	)

	/** Read-only CO / K tags for the answers stage and the preview. */
	const coKTags = (co: string | null | undefined, k: string | null | undefined) => (
		<span className="flex items-center gap-1 shrink-0 text-[11px] font-medium">
			<span className={cn('rounded border px-1.5 py-0.5', co ? 'bg-slate-50 text-slate-700' : 'bg-rose-50 text-rose-700 border-rose-200')}>{co || 'CO ?'}</span>
			<span className={cn('rounded border px-1.5 py-0.5', k ? 'bg-slate-50 text-slate-700' : 'bg-rose-50 text-rose-700 border-rose-200')}>{k || 'K ?'}</span>
		</span>
	)

	/** The answer-key box — one per question, or one per sub-division of a split question. */
	const answerBox = (opts: {
		anchor: string
		value: string | null | undefined
		image: any
		onText: (html: string) => void
		onImage: (img: any) => void
		label?: string
	}) => (
		<FieldFrame anchor={opts.anchor} errors={at(opts.anchor)} flashing={flash === opts.anchor}>
			{/* Its own paste scope: Ctrl+V here attaches the screenshot to the KEY. */}
			<div data-qp-image-scope className="space-y-1.5">
				<Label className="text-[11px] text-muted-foreground flex items-center gap-1">
					<KeyRound className="h-3 w-3" />
					{opts.label || 'Answer'}
					{answerKeyMode === 'required' && <span className="text-rose-600 font-semibold">*</span>}
					{answerKeyMode === 'disabled' && <span className="opacity-70">— not accepted, nothing needed</span>}
				</Label>
				<QuestionRichEditor
					value={opts.value || ''}
					onChange={opts.onText}
					disabled={akDisabled}
					placeholder="Type the answer / marking scheme…"
					className={cn(invalidClass(opts.anchor))}
				/>
				{!akDisabled ? (
					<QuestionImageField
						assignmentId={assignmentId}
						value={opts.image || null}
						onChange={img => opts.onImage(img)}
						label="Add image to the answer"
					/>
				) : opts.image?.url ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={opts.image.url} alt="" draggable={false} className="max-w-full max-h-64 rounded border" />
				) : null}
			</div>
		</FieldFrame>
	)

	/**
	 * One question, in one of three shapes:
	 *   questions  the entry card — editor, CO/K on the right, marks in the foot
	 *   answers    the question shown read-only with an answer box under it
	 *   preview    everything read-only (a submitted paper during the check list)
	 */
	const renderQuestion = (q: IaPaperQuestion, mode: CardMode) => {
		const subs = readSubQuestions(q)
		const stageForCard: EntryStage = mode === 'answers' ? 'answers' : 'questions'
		const qProblems = showErrors
			? (mode === 'preview' ? problems : stageProblems[stageForCard]).filter(p => p.questionId === q.id)
			: []
		const textAnchor = problemAnchor(q.id, 'question_text')
		const marksAnchor = problemAnchor(q.id, 'marks')
		const coAnchor = problemAnchor(q.id, 'co_code')
		const kAnchor = problemAnchor(q.id, 'k_level')
		const editingQ = mode === 'questions' && !qDisabled
		const number = (
			<span className="flex items-center gap-2">
				<span className="inline-flex items-center rounded-md bg-brand-green-50 text-brand-green-800 border border-brand-green-100 px-2 py-0.5 font-semibold text-sm tabular-nums">
					Q{q.question_number}
					{q.sub_label ? ` ${q.sub_label})` : ''}
				</span>
				{q.is_choice_alternative && <span className="text-[10px] font-medium text-muted-foreground border rounded px-1 py-px">OR</span>}
				{q.marks != null && <span className="text-xs text-muted-foreground">{q.marks} marks</span>}
				{qProblems.length === 0 && (mode === 'questions' || mode === 'answers') && showErrors && (
					<CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Complete" />
				)}
			</span>
		)

		return (
			<div
				key={q.id}
				id={`qp-q-${q.id}`}
				data-qp-image-scope
				className={cn(
					'rounded-xl border bg-white scroll-mt-32 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_3px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-md',
					qProblems.length ? 'border-rose-300' : 'border-slate-200/80',
					q.is_choice_alternative && 'ml-3 sm:ml-6 border-dashed'
				)}
			>
				<div className="p-3 sm:p-4 space-y-2.5">
					{/* Row 1: number on the left, CO + K on the right. */}
					<div className="flex flex-wrap items-start justify-between gap-2">
						{number}
						{subs.length === 0 ? (
							mode === 'questions' ? (
								coK(coAnchor, kAnchor, q.co_code, q.k_level, v => patchQuestion(q.id, { co_code: v }), v => patchQuestion(q.id, { k_level: v }), qDisabled)
							) : (
								coKTags(q.co_code, q.k_level)
							)
						) : (
							<span className="text-[11px] text-muted-foreground">CO and K-level per sub-division</span>
						)}
					</div>

					{/* The question itself. */}
					{mode === 'questions' ? (
						<FieldFrame anchor={textAnchor} errors={at(textAnchor)} flashing={flash === textAnchor}>
							<QuestionRichEditor
								value={q.question_text || ''}
								onChange={html => patchQuestion(q.id, { question_text: html })}
								disabled={qDisabled}
								placeholder={subs.length > 0 ? 'Common stem (optional)…' : 'Type the question…'}
								className={cn(invalidClass(textAnchor))}
							/>
						</FieldFrame>
					) : (
						plainText(q.question_text) ? <RichView html={q.question_text} /> : subs.length === 0 ? <p className="text-sm italic text-rose-600">Question not entered</p> : null
					)}
					{editingQ ? (
						<QuestionImageField
							assignmentId={assignmentId}
							value={(q.image as any) || null}
							onChange={img => patchQuestion(q.id, { image: img as any })}
						/>
					) : (
						<Figure raw={q.image} />
					)}

					{/* MCQ options */}
					{Array.isArray(q.options) && q.options.length > 0 && (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
							{q.options.map(o => {
								const oAnchor = problemAnchor(q.id, 'option', { optionKey: o.key })
								return mode === 'questions' ? (
									<FieldFrame key={o.key} anchor={oAnchor} errors={at(oAnchor)} flashing={flash === oAnchor} className="flex items-start gap-2">
										<span className="pt-1.5 text-sm font-medium w-5">{o.key})</span>
										<div className="flex-1">
											<QuestionRichEditor
												value={o.text_html || o.text || ''}
												onChange={html => patchOption(q.id, o.key, html)}
												disabled={qDisabled}
												variant="compact"
												placeholder={`Option ${o.key} *`}
												className={cn(invalidClass(oAnchor))}
											/>
										</div>
									</FieldFrame>
								) : (
									<div key={o.key} className="flex gap-2 text-sm">
										<span className="font-medium w-5 shrink-0">{o.key})</span>
										{plainText(o.text_html || o.text) ? <RichView html={o.text_html || o.text} /> : <span className="italic text-rose-600">empty</span>}
									</div>
								)
							})}
						</div>
					)}

					{/* Sub-divisions (i), (ii) … */}
					{subs.length > 0 && (
						<div className="space-y-3 border-l-2 border-slate-200 pl-3">
							{subs.map(sb => {
								const sText = problemAnchor(q.id, 'question_text', { subId: sb.id })
								const sMarks = problemAnchor(q.id, 'marks', { subId: sb.id })
								const sCo = problemAnchor(q.id, 'co_code', { subId: sb.id })
								const sK = problemAnchor(q.id, 'k_level', { subId: sb.id })
								const sAk = problemAnchor(q.id, 'answer_key', { subId: sb.id })
								return (
									<div key={sb.id} className="space-y-1.5">
										<div className="flex flex-wrap items-start justify-between gap-2">
											<span className="text-xs font-semibold text-slate-800 pt-1">({sb.label})</span>
											{mode === 'questions' ? (
												<div className="flex items-start gap-1.5">
													<FieldFrame anchor={sMarks} errors={at(sMarks)} flashing={flash === sMarks} className="w-[72px]">
														<Input
															type="number"
															min="0"
															step="0.5"
															value={sb.marks ?? ''}
															onChange={e => patchSub(q, sb.id, { marks: e.target.value === '' ? null : Number(e.target.value) })}
															disabled={qDisabled}
															placeholder="Marks *"
															aria-label="Marks"
															aria-invalid={!!at(sMarks)?.length}
															className={cn('h-7 text-xs px-2', at(sMarks)?.length && FIELD_INVALID)}
														/>
													</FieldFrame>
													{coK(sCo, sK, sb.co_code, sb.k_level, v => patchSub(q, sb.id, { co_code: v }), v => patchSub(q, sb.id, { k_level: v }), qDisabled)}
													{!qDisabled && (
														<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-rose-600" onClick={() => removeSub(q, sb.id)} aria-label="Remove sub-division" title="Remove this sub-division">
															<X className="h-3.5 w-3.5" />
														</Button>
													)}
												</div>
											) : (
												<span className="flex items-center gap-2">
													{sb.marks != null && <span className="text-[11px] text-muted-foreground">{sb.marks} marks</span>}
													{coKTags(sb.co_code, sb.k_level)}
												</span>
											)}
										</div>
										{mode === 'questions' ? (
											<FieldFrame anchor={sText} errors={at(sText)} flashing={flash === sText}>
												<QuestionRichEditor
													value={sb.question_text || ''}
													onChange={html => patchSub(q, sb.id, { question_text: html })}
													disabled={qDisabled}
													variant="compact"
													placeholder="Type this sub-division…"
													className={cn(invalidClass(sText))}
												/>
											</FieldFrame>
										) : plainText(sb.question_text) ? (
											<RichView html={sb.question_text} />
										) : (
											<p className="text-sm italic text-rose-600">Not entered</p>
										)}
										{mode === 'answers' &&
											answerBox({
												anchor: sAk,
												value: sb.answer_key,
												image: sb.answer_key_image,
												onText: html => patchSub(q, sb.id, { answer_key: html }),
												onImage: img => patchSub(q, sb.id, { answer_key_image: img }),
												label: `Answer (${sb.label})`,
											})}
										{mode === 'preview' && (plainText(sb.answer_key) || sb.answer_key_image?.url) && (
											<div className="rounded border border-amber-200 bg-amber-50/40 p-2 text-sm">
												<p className="text-[10px] uppercase tracking-wide text-amber-800 font-semibold">Answer ({sb.label})</p>
												<RichView html={sb.answer_key} />
												<Figure raw={sb.answer_key_image} />
											</div>
										)}
									</div>
								)
							})}
							{mode === 'questions' && !qDisabled && subs.length < MAX_SUB_QUESTIONS && (
								<Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => addSub(q)}>
									<Plus className="h-3.5 w-3.5 mr-1" />
									Add sub-division
								</Button>
							)}
						</div>
					)}

					{/* Answer for an unsplit question (or the whole-question key an older paper carries). */}
					{mode === 'answers' &&
						(subs.length === 0 || hasOwnAnswerKey(q)) &&
						answerBox({
							anchor: problemAnchor(q.id, 'answer_key'),
							value: q.answer_key,
							image: q.answer_key_image,
							onText: html => patchQuestion(q.id, { answer_key: html }),
							onImage: img => patchQuestion(q.id, { answer_key_image: img as any }),
							label: subs.length > 0 ? 'Common answer (whole question)' : 'Answer',
						})}
					{mode === 'preview' && hasOwnAnswerKey(q) && (
						<div className="rounded border border-amber-200 bg-amber-50/40 p-2 text-sm">
							<p className="text-[10px] uppercase tracking-wide text-amber-800 font-semibold">Answer</p>
							<RichView html={q.answer_key} />
							<Figure raw={q.answer_key_image} />
						</div>
					)}
				</div>

				{/* Foot: marks, and the split controls. Quiet by design. */}
				<div className="border-t border-slate-100 bg-slate-50/60 rounded-b-xl px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
					<FieldFrame anchor={marksAnchor} errors={at(marksAnchor)} flashing={flash === marksAnchor}>
						<span className={cn(at(marksAnchor)?.length && 'text-rose-700 font-medium')}>
							Marks: {q.marks ?? '—'}
							{subs.length > 0 && <> · sub-divisions {subTotal(subs)} / {q.marks ?? '—'}</>}
						</span>
					</FieldFrame>
					{editingQ && canSplit(q) && partByLabel.get(q.part_label || '')?.allow_split !== false && subs.length === 0 && (
						<Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => splitQuestion(q)}>
							<Split className="h-3 w-3 mr-1" />
							Split into (i)/(ii)
						</Button>
					)}
				</div>
			</div>
		)
	}

	/** The heading line of a part: label, marks scheme, its instruction. */
	const partHeading = (label: string, qs: IaPaperQuestion[]) => {
		const part = partByLabel.get(label)
		const answerCount = Number(part?.num_to_answer) > 0 ? Number(part!.num_to_answer) : part?.num_questions || qs.length
		const each = part?.marks_per_question ?? qs[0]?.marks ?? 0
		const structural = at(partAnchor(label))
		return (
			<div id={partAnchor(label)} className={cn('scroll-mt-32', flash === partAnchor(label) && 'ring-2 ring-offset-2 ring-rose-400 rounded-md')}>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h3 className="font-semibold text-lg tracking-tight text-slate-900 flex items-center gap-2 before:content-[''] before:inline-block before:h-5 before:w-1 before:rounded-full before:bg-brand-green-500">
						Part {label}
						{part?.part_title && part.part_title.replace(/\s+/g, '').toLowerCase() !== `part${label}`.toLowerCase() && (
							<span className="text-sm font-normal text-muted-foreground">· {part.part_title}</span>
						)}
					</h3>
					<span className="text-xs rounded-full border bg-slate-50 px-2.5 py-0.5 text-slate-700">
						{answerCount} × {each} = <span className="font-semibold">{Number(answerCount) * Number(each)} marks</span>
					</span>
				</div>
				{part?.instruction && <p className="text-xs text-muted-foreground mt-1">{part.instruction}</p>}
				{structural?.map((p, i) => (
					<p key={i} className="text-xs text-rose-700 mt-1 flex items-center gap-1">
						<AlertTriangle className="h-3 w-3" />
						{p.message}
					</p>
				))}
			</div>
		)
	}

	/** Recovery + CoE-only problems: shown at the top of every stage. */
	const notices = (
		<>
			{recovery && !readOnly && (
				<div className={cn('rounded-md border px-3 py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-2', TONE.warning.card)}>
					<AlertTriangle className={cn('h-4 w-4 shrink-0', TONE.warning.icon)} />
					<p className={cn('flex-1 min-w-[220px] text-xs', TONE.warning.text)}>
						<span className={cn('font-semibold text-sm', TONE.warning.heading)}>Unsaved work found in this browser.</span>{' '}
						Edits from{' '}
						{new Date(recovery.savedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{' '}
						never reached the server. <span className="font-semibold text-rose-700">Restoring replaces what is on screen.</span>
					</p>
					<div className="flex gap-1.5 shrink-0">
						<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { clearLocalDraft(); setRecovery(null) }}>
							Discard
						</Button>
						<Button size="sm" className="h-7 text-xs" onClick={() => { setQuestions(recovery.questions); setDirty(true); setRecovery(null) }}>
							Restore them
						</Button>
					</div>
				</div>
			)}
			{showErrors && coeProblems.length > 0 && (
				<div className={cn('rounded-md border p-3 text-sm', TONE.danger.card)}>
					<p className={cn('font-semibold flex items-center gap-1.5', TONE.danger.heading)}>
						<AlertTriangle className="h-4 w-4" />
						Needs a correction from the CoE office before it can be submitted
					</p>
					<ul className={cn('mt-1 text-xs list-disc pl-5 space-y-0.5', TONE.danger.text)}>
						{coeProblems.map((p, i) => <li key={i}>{p.message}</li>)}
					</ul>
				</div>
			)}
		</>
	)

	// ── Read-only preview (a paper already handed over) ────────────────────
	if (readOnly) {
		return (
			<div className="space-y-5">
				<div className={cn('rounded-md border p-3 text-sm flex items-start gap-2', TONE.locked.card, TONE.locked.text)}>
					<Eye className={cn('h-4 w-4 shrink-0 mt-0.5', TONE.locked.icon)} />
					<p>
						<span className="font-semibold">Read-only.</span> This paper has been handed over, or the entry period has ended.
					</p>
				</div>
				{partLabels.map(label => (
					<section key={label} className="space-y-3">
						{partHeading(label, grouped.get(label) || [])}
						{(grouped.get(label) || []).map(q => renderQuestion(q, 'preview'))}
					</section>
				))}
			</div>
		)
	}

	// ── Stage header: where am I, which part ───────────────────────────────
	/**
	 * The stepper: numbered circles joined by a line. The circle carries the
	 * state (green tick = done, blue = here, grey lock = not yet), the label
	 * stays plain text, so the eye reads the row as ONE path, not three buttons.
	 */
	const stageTab = (s: FlowStage, i: number) => {
		const done = stageDone[s]
		const current = s === stage
		const unlocked = stageUnlocked(s)
		const locked = !unlocked && !current
		return (
			<button
				key={s}
				type="button"
				disabled={locked}
				onClick={() => setStage(s)}
				aria-current={current ? 'step' : undefined}
				className={cn(
					'group inline-flex items-center gap-2 rounded-full pr-3.5 pl-1 py-1 text-sm transition-all',
					current
						? 'bg-brand-green-500 text-white font-semibold shadow-md shadow-brand-green-500/25'
						: done
							? 'text-brand-green-700 hover:bg-brand-green-50'
							: unlocked
								? 'text-slate-600 hover:bg-slate-100'
								: 'text-slate-400 cursor-not-allowed'
				)}
				title={locked ? 'Finish the previous step first' : undefined}
			>
				<span
					className={cn(
						'h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0',
						current ? 'bg-white/20 text-white' : done ? 'bg-brand-green-100 text-brand-green-700' : locked ? 'bg-slate-100 text-slate-400' : 'bg-white border border-slate-300 text-slate-600'
					)}
				>
					{done && !current ? <CheckCircle2 className="h-3.5 w-3.5" /> : locked ? <Lock className="h-3 w-3" /> : i + 1}
				</span>
				{STAGE_LABELS[s]}
			</button>
		)
	}

	/** Part A | Part B | … as a segmented control, with the progress of the part in hand. */
	const partNav = (s: EntryStage) => {
		const here = currentPart(s)
		const qs = here ? grouped.get(here) || [] : []
		const bad = new Set(stageProblems[s].filter(p => p.partLabel === here).map(p => p.questionId))
		const ok = qs.filter(q => !bad.has(q.id)).length
		return (
			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
				{partLabels.length > 1 ? (
					<div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-slate-100 border p-0.5 text-xs">
						{partLabels.map((label, i) => {
							const done = partDone(s, label)
							const unlocked = partUnlocked(s, i)
							const current = here === label
							return (
								<button
									key={label}
									type="button"
									disabled={!unlocked}
									onClick={() => setActivePart(a => ({ ...a, [s]: label }))}
									title={!unlocked ? `Complete Part ${partLabels[i - 1]} first` : undefined}
									className={cn(
										'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors',
										current
											? 'bg-white text-brand-green-700 font-semibold shadow-sm ring-1 ring-slate-200'
											: done
												? 'text-emerald-700 hover:bg-white/70'
												: unlocked
													? 'text-slate-600 hover:bg-white/70'
													: 'text-slate-400 cursor-not-allowed'
									)}
								>
									{done ? <CheckCircle2 className="h-3.5 w-3.5 text-brand-green-500" /> : !unlocked ? <Lock className="h-3 w-3" /> : <Circle className={cn('h-3 w-3', current && 'fill-brand-green-500 text-brand-green-500')} />}
									Part {label}
								</button>
							)
						})}
					</div>
				) : (
					<span />
				)}
				{here && qs.length > 0 && (
					<span className="flex items-center gap-2 text-xs text-muted-foreground">
						<span className="h-1.5 w-24 rounded-full bg-slate-200 overflow-hidden">
							<span className={cn('block h-full rounded-full', ok === qs.length ? 'bg-emerald-500' : 'bg-blue-500')} style={{ width: `${Math.round((ok / qs.length) * 100)}%` }} />
						</span>
						<span className={cn(ok === qs.length && 'text-emerald-700 font-medium')}>
							{ok} / {qs.length} {s === 'answers' ? 'answers' : 'questions'} complete
						</span>
					</span>
				)}
			</div>
		)
	}

	// ── The one primary action for the stage in hand ───────────────────────
	const entryAction = (s: EntryStage) => {
		const nextStage = stages[stages.indexOf(s) + 1]
		const nextLabel = nextStage ? STAGE_LABELS[nextStage] : ''
		if (stageDone[s]) {
			return {
				primary: { label: `Continue to ${nextLabel}`, onClick: () => setStage(nextStage), disabled: false, reason: null as string | null, icon: ArrowRight },
				secondary: { label: s === 'questions' ? 'Edit questions' : 'Edit answers', onClick: () => reopenStage(s), icon: Pencil },
				note: `${STAGE_LABELS[s]} handed in — read-only until you press Edit.`,
			}
		}
		const label = currentPart(s)
		const others = partLabels.filter(l => l !== label && !partDone(s, l))
		const hereProblems = stageProblems[s].filter(p => p.partLabel === label && !p.needsCoe)
		const blockedByCoe = s === 'questions' && coeProblems.length > 0
		if (others.length === 0) {
			// Last open part: handing it in hands in the whole stage.
			const all = stageProblems[s].filter(p => !p.needsCoe)
			return {
				primary: {
					label: s === 'questions' ? 'Submit questions' : 'Submit answers',
					onClick: () => handInStage(s),
					disabled: all.length > 0 || blockedByCoe,
					reason: blockedByCoe
						? 'Needs a correction from the CoE office'
						: all.length > 0
							? `${all.length} item${all.length === 1 ? '' : 's'} to complete${label ? ` in Part ${label}` : ''}`
							: null,
					icon: Send,
				},
				secondary: null,
				note: nextStage ? `Then you go straight to ${nextLabel}.` : '',
			}
		}
		return {
			primary: {
				label: `Submit Part ${label}`,
				onClick: () => {
					if (!label) return
					markPartDone(s, label)
					const i = partLabels.indexOf(label)
					const next = partLabels.slice(i + 1).find(l => !partDone(s, l)) || partLabels.find(l => !partDone(s, l) && l !== label) || null
					setActivePart(a => ({ ...a, [s]: next }))
					window.scrollTo({ top: 0, behavior: 'smooth' })
				},
				disabled: hereProblems.length > 0 || blockedByCoe,
				reason: blockedByCoe
					? 'Needs a correction from the CoE office'
					: hereProblems.length > 0
						? `${hereProblems.length} item${hereProblems.length === 1 ? '' : 's'} to complete in Part ${label}`
						: null,
				icon: ArrowRight,
			},
			secondary: null,
			note: `Part ${partLabels[partLabels.indexOf(label!) + 1] || ''} opens once Part ${label} is submitted.`.replace('Part  opens', 'The next part opens'),
		}
	}

	const saveDisabled = saving || (!dirty && syncState !== 'unsynced')

	// ── Stage bodies ───────────────────────────────────────────────────────
	const entryStage = (s: EntryStage) => {
		const label = currentPart(s)
		const qs = label ? grouped.get(label) || [] : []
		const action = entryAction(s)
		const hereProblems = stageProblems[s].filter(p => p.partLabel === label && !p.needsCoe)
		const Icon = action.primary.icon
		return (
			<>
				{stageDone[s] && (
					<div className={cn('rounded-md border p-3 text-sm flex flex-wrap items-center justify-between gap-2', TONE.success.card, TONE.success.text)}>
						<span className="flex items-center gap-2">
							<CheckCircle2 className={cn('h-4 w-4', TONE.success.icon)} />
							<span className="font-medium">{action.note}</span>
						</span>
						{action.secondary && (
							<Button size="sm" variant="outline" onClick={action.secondary.onClick}>
								<Pencil className="h-3.5 w-3.5 mr-1.5" />
								{action.secondary.label}
							</Button>
						)}
					</div>
				)}
				{label && (
					<section className="space-y-3">
						{partHeading(label, qs)}
						{qs.map(q => renderQuestion(q, s))}
					</section>
				)}
				{!label && <p className="text-sm text-muted-foreground text-center py-10">This paper has no questions.</p>}

				{/* Bottom bar — Save on the left, the one next step on the right. */}
				<div className="sticky bottom-3 z-10 rounded-xl border border-slate-200/80 bg-white/95 backdrop-blur px-3 sm:px-4 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.10)] flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
					<div className="flex items-center gap-2 text-xs">
						<Button size="sm" variant="outline" onClick={() => void doSave()} disabled={saveDisabled} title={saveDisabled && !saving ? 'Nothing new to save' : undefined}>
							{saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
							Save
						</Button>
						<SyncBadge state={syncState} dirty={dirty} savedAt={savedAt} error={syncError} />
						{syncState === 'conflict' && onConflict && (
							<Button size="sm" variant="outline" className="border-rose-300 text-rose-700" onClick={onConflict}>
								Reload server copy
							</Button>
						)}
					</div>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-end">
						{action.primary.reason && !stageDone[s] && (
							<button
								type="button"
								className="text-xs text-rose-700 inline-flex items-center gap-1 hover:underline underline-offset-2"
								onClick={() => hereProblems[0] && jumpTo(hereProblems[0].anchor)}
								title={hereProblems[0] ? 'Go to the first item' : undefined}
							>
								<AlertTriangle className="h-3 w-3" />
								{action.primary.reason}
							</button>
						)}
						{action.secondary && stageDone[s] && (
							<Button size="sm" variant="ghost" onClick={action.secondary.onClick}>
								{action.secondary.label}
							</Button>
						)}
						<Button size="sm" className="bg-brand-green-500 hover:bg-brand-green-600 shadow-sm" onClick={action.primary.onClick} disabled={action.primary.disabled}>
							{action.primary.label}
							<Icon className="h-4 w-4 ml-1.5" />
						</Button>
					</div>
				</div>
			</>
		)
	}

	const reviewStage = () => {
		const own = problems.filter(p => !p.needsCoe)
		const allDone = stages.filter(s => s !== 'review').every(s => stageDone[s]) && problems.length === 0
		const prev = stages[stages.indexOf('review') - 1] as EntryStage | undefined
		const reason = !allDone
			? coeProblems.length > 0
				? 'Needs a correction from the CoE office'
				: own.length > 0
					? `${own.length} item${own.length === 1 ? '' : 's'} still to complete`
					: 'Hand in every step first'
			: submitReason
		const count = (s: EntryStage, label: string) => {
			const qs = grouped.get(label) || []
			const bad = new Set(stageProblems[s].filter(p => p.partLabel === label).map(p => p.questionId))
			return { ok: qs.filter(q => !bad.has(q.id)).length, total: qs.length }
		}
		return (
			<>
				<div className="rounded-md border bg-white divide-y">
					{partLabels.map(label => (
						<div key={label} className="px-4 py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[120px_1fr_1fr] gap-x-6 gap-y-1 items-center text-sm">
							<span className="font-semibold">Part {label}</span>
							{(['questions', 'answers'] as EntryStage[])
								.filter(s => stages.includes(s))
								.map(s => {
									const c = count(s, label)
									const ok = c.ok === c.total
									return (
										<span key={s} className={cn('flex items-center justify-between sm:justify-start gap-2 col-span-2 sm:col-span-1', ok ? 'text-emerald-700' : 'text-rose-700')}>
											<span className="text-muted-foreground">{STAGE_LABELS[s]}</span>
											<span className="font-medium inline-flex items-center gap-1">
												{c.ok} / {c.total}
												{ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
											</span>
										</span>
									)
								})}
						</div>
					))}
				</div>

				{allDone ? (
					<div className={cn('rounded-md border p-3 text-sm flex items-center gap-2', TONE.success.card, TONE.success.text)}>
						<CheckCircle2 className={cn('h-4 w-4', TONE.success.icon)} />
						<span className="font-medium">All mandatory fields completed.</span> Press Submit final to hand the paper over — you will see the whole paper once more before it goes.
					</div>
				) : (
					<div className={cn('rounded-md border p-3 text-sm', TONE.warning.card)}>
						<p className={cn('font-semibold flex items-center gap-1.5', TONE.warning.heading)}>
							<AlertTriangle className="h-4 w-4" />
							{reason}
						</p>
						{own.length > 0 && (
							<ul className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
								{own.slice(0, 12).map((p, i) => (
									<li key={i}>
										<button type="button" onClick={() => jumpTo(p.anchor)} className={cn('w-full text-left text-xs rounded px-1.5 py-0.5 hover:bg-amber-100 flex gap-2', TONE.warning.text)}>
											<span className="font-semibold shrink-0">{p.where}</span>
											{p.message.replace(/^[^:]+:\s*/, '')}
										</button>
									</li>
								))}
								{own.length > 12 && <li className={cn('text-xs px-1.5', TONE.warning.text)}>… and {own.length - 12} more</li>}
							</ul>
						)}
					</div>
				)}

				<div className="sticky bottom-3 z-10 rounded-xl border border-slate-200/80 bg-white/95 backdrop-blur px-3 sm:px-4 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.10)] flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
					<div className="flex items-center gap-2">
						{prev && (
							<Button size="sm" variant="outline" onClick={() => setStage(prev)}>
								<ArrowLeft className="h-4 w-4 mr-1.5" />
								Back
							</Button>
						)}
						<SyncBadge state={syncState} dirty={dirty} savedAt={savedAt} error={syncError} />
					</div>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-end">
						{reason && (
							<span className="text-xs text-rose-700 inline-flex items-center gap-1">
								<Lock className="h-3 w-3" />
								{reason}
							</span>
						)}
						<Button size="sm" className="bg-rose-600 hover:bg-rose-700" onClick={onSubmit} disabled={!!reason || submitting || !onSubmit}>
							{submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
							Submit final
						</Button>
					</div>
				</div>
			</>
		)
	}

	return (
		<div className="space-y-4">
			{/* Sticky: stage tabs and, inside an entry stage, the part navigation. */}
			<div className="sticky top-[57px] z-20 -mx-3 sm:-mx-5 px-3 sm:px-5 pt-2.5 pb-2 bg-white/95 backdrop-blur border-b shadow-sm space-y-2">
				<div className="flex flex-wrap items-center gap-x-1 gap-y-1">
					{stages.map((s, i) => (
						<span key={s} className="flex items-center">
							{stageTab(s, i)}
							{i < stages.length - 1 && (
								<span className={cn('mx-1 h-0.5 w-6 sm:w-10 rounded-full', stageDone[s] ? 'bg-emerald-400' : 'bg-slate-200')} />
							)}
						</span>
					))}
				</div>
				{stage !== 'review' && partNav(stage)}
			</div>

			{notices}

			{!questionsEditable && stage === 'answers' && (
				<p className="text-xs text-muted-foreground">
					Your appointment is for the answers only — the questions are shown for reference and cannot be changed.
				</p>
			)}

			{stage === 'review' ? reviewStage() : entryStage(stage)}
		</div>
	)
}

// ── Module-level pieces ───────────────────────────────────────────────────

export type FlowStage = 'questions' | 'answers' | 'review'
type EntryStage = 'questions' | 'answers'
type CardMode = 'questions' | 'answers' | 'preview'

const STAGE_LABELS: Record<FlowStage, string> = {
	questions: 'Questions',
	answers: 'Answers',
	review: 'Review & Submit',
}

/** Where the examiner is in the walk. A reading aid kept in this browser only. */
interface Flow {
	questionsSubmitted: boolean
	answersSubmitted: boolean
	partsDone: { questions: string[]; answers: string[] }
}
const FLOW_PREFIX = 'jkkn.qp.flow.'
const EMPTY_FLOW: Flow = { questionsSubmitted: false, answersSubmitted: false, partsDone: { questions: [], answers: [] } }

function readFlow(assignmentId: string): Flow {
	try {
		const raw = window.localStorage.getItem(`${FLOW_PREFIX}${assignmentId}`)
		if (!raw) return EMPTY_FLOW
		const p = JSON.parse(raw)
		return {
			questionsSubmitted: !!p?.questionsSubmitted,
			answersSubmitted: !!p?.answersSubmitted,
			partsDone: {
				questions: Array.isArray(p?.partsDone?.questions) ? p.partsDone.questions.map(String) : [],
				answers: Array.isArray(p?.partsDone?.answers) ? p.partsDone.answers.map(String) : [],
			},
		}
	} catch {
		return EMPTY_FLOW
	}
}

function writeFlow(assignmentId: string, flow: Flow) {
	try {
		window.localStorage.setItem(`${FLOW_PREFIX}${assignmentId}`, JSON.stringify(flow))
	} catch {
		/* private window or full storage — the walk simply restarts next time */
	}
}

/** Authored rich text, read-only. */
function RichView({ html }: { html?: string | null }) {
	if (!html) return null
	return (
		<div
			className="text-sm leading-relaxed text-slate-900 [&_p]:my-0.5 [&_sub]:text-[0.75em] [&_sup]:text-[0.75em]"
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	)
}

function Figure({ raw }: { raw: unknown }) {
	const img = readQuestionImage(raw)
	if (!img) return null
	return (
		<div className="flex justify-center my-1.5">
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={img.url} alt="" draggable={false} style={{ width: `${img.width_pct || 60}%` }} className="max-w-full rounded border" />
		</div>
	)
}

/**
 * Wraps one field: gives it its anchor id (so a jump can scroll to it), the
 * red message when it has a problem, and a brief flash after a jump. A
 * module-level component, NOT one defined inside the editor's render — that
 * would remount every rich editor on every keystroke.
 */
function FieldFrame({
	anchor,
	errors,
	flashing,
	className,
	children,
}: {
	anchor: string
	errors?: PaperProblem[]
	flashing?: boolean
	className?: string
	children: React.ReactNode
}) {
	const invalid = !!errors?.length
	return (
		<div id={anchor} className={cn('rounded-md transition-shadow scroll-mt-32', flashing && 'ring-2 ring-offset-2 ring-rose-400', className)}>
			{children}
			{invalid && (
				<p className="text-[11px] text-rose-700 mt-1 flex items-start gap-1" role="alert">
					<AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
					<span>{[...new Set(errors!.map(e => e.short))].join(' · ')}</span>
				</p>
			)}
		</div>
	)
}
