/**
 * Question-wise CIA marks — shared shape, validation and roll-up.
 *
 * A CIA round configured with `mark_entry_type: 'question_wise'` is keyed in
 * question by question. The breakdown lives in `cia_marks.question_marks`,
 * keyed by component code:
 *
 *   {
 *     "test_1": {
 *       "paper_id": "uuid",
 *       "set_number": 1,
 *       "set_label": "A",
 *       "marks": { "<question id>": 3, "<question id>": 2.5 }
 *     }
 *   }
 *
 * The component column (`test_1_mark`, ...) still holds the SUM, so everything
 * downstream that reads component totals is unaffected.
 *
 * Both writers — COE's own entry route and /api/v1/cia-marks/sync — share this
 * module so the rules cannot drift apart between them.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Paper statuses a round may have marks entered against.
 *
 * `draft` is excluded on purpose: a draft can still be re-authored or rebuilt
 * from its template, which would leave already-entered marks pointing at
 * questions that no longer exist. Authoring has to be finished — at least to
 * the point of submission — before anyone marks against the paper.
 */
export const ENTRY_READY_PAPER_STATUSES = ['submitted', 'approved', 'locked'] as const

/** Component code → cia_marks column holding that component's total. */
export const COMPONENT_MARK_COLUMN: Record<string, string> = {
	assignment: 'assignment_marks',
	quiz: 'quiz_marks',
	mid_term: 'mid_term_marks',
	presentation: 'presentation_marks',
	attendance: 'attendance_marks',
	lab: 'lab_marks',
	project: 'project_marks',
	seminar: 'seminar_marks',
	viva: 'viva_marks',
	test_1: 'test_1_mark',
	test_2: 'test_2_mark',
	test_3: 'test_3_mark',
	other: 'other_marks',
}

/** cia_marks column → component code (inverse of COMPONENT_MARK_COLUMN). */
export const MARK_COLUMN_COMPONENT: Record<string, string> = Object.fromEntries(
	Object.entries(COMPONENT_MARK_COLUMN).map(([code, column]) => [column, code])
)

/** One component's question breakdown, as stored and as sent by callers. */
export interface QuestionMarksEntry {
	paper_id?: string
	set_number?: number
	set_label?: string | null
	marks?: Record<string, unknown>
}

/** The whole `question_marks` object, keyed by component code. */
export type QuestionMarksMap = Record<string, QuestionMarksEntry>

/** What one question contributes to validation, resolved from its paper. */
export interface QuestionMeta {
	/** Part label ("A", "B") — the scope an "answer any N" limit applies to. */
	part: string
	/** Choice group: part + question number, so 6a and 6b share one group. */
	group: string
	/** Display label ("6a") used in error messages. */
	label: string
	/** The question's own max marks; 0 means "not capped". */
	marks: number
	/** Answer-any-N limit for this question's part, or null when unlimited. */
	limit: number | null
}

/** paper id → question id → metadata. */
export type PaperIndex = Map<string, Map<string, QuestionMeta>>

/** True when the value is a usable question_marks object. */
export function isQuestionMarksMap(value: unknown): value is QuestionMarksMap {
	return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Sum of one component's question marks, or null when that component has no
 * breakdown. Null is meaningful: it means "fall back to the caller's total"
 * rather than "the total is zero".
 */
export function questionSum(questionMarks: unknown, componentCode: string): number | null {
	if (!isQuestionMarksMap(questionMarks)) return null
	const entry = questionMarks[componentCode]
	if (!entry || typeof entry !== 'object') return null
	if (!entry.marks || typeof entry.marks !== 'object') return null
	return Object.values(entry.marks).reduce<number>((sum, v) => sum + (Number(v) || 0), 0)
}

/** Every paper id referenced by a batch of rows carrying `question_marks`. */
export function collectPaperIds(rows: Array<{ question_marks?: unknown }>): string[] {
	const ids = new Set<string>()
	for (const row of rows) {
		if (!isQuestionMarksMap(row?.question_marks)) continue
		for (const entry of Object.values(row.question_marks)) {
			if (entry?.paper_id) ids.add(String(entry.paper_id))
		}
	}
	return [...ids]
}

/**
 * Loads the papers and their template parts, and indexes every question by id.
 *
 * An "answer any N" limit only binds when it is both set and smaller than the
 * part's question count — otherwise every question in the part is answerable
 * and the limit is noise.
 */
export async function buildPaperIndex(
	supabase: SupabaseClient,
	paperIds: string[]
): Promise<PaperIndex> {
	const index: PaperIndex = new Map()
	if (paperIds.length === 0) return index

	const { data: papers } = await supabase
		.from('ia_question_papers')
		.select('id, template_id, questions')
		.in('id', paperIds)

	const templateIds = [...new Set((papers || []).map((p: any) => p.template_id).filter(Boolean))]
	const answerLimits = new Map<string, number>()
	if (templateIds.length > 0) {
		const { data: parts } = await supabase
			.from('ia_template_parts')
			.select('template_id, part_label, num_questions, num_to_answer')
			.in('template_id', templateIds)
			.eq('is_active', true)
		for (const part of (parts || [])) {
			const limit = Number(part.num_to_answer)
			if (limit > 0 && limit < Number(part.num_questions || 0)) {
				answerLimits.set(`${part.template_id}|${part.part_label}`, limit)
			}
		}
	}

	for (const paper of (papers || [])) {
		const questions = new Map<string, QuestionMeta>()
		for (const q of (Array.isArray(paper.questions) ? paper.questions : [])) {
			const part = q?.part_label ?? ''
			questions.set(String(q?.id ?? ''), {
				part,
				group: `${part}|${q?.question_number ?? ''}`,
				label: `${q?.question_number ?? ''}${q?.sub_label || ''}`,
				marks: Number(q?.marks) || 0,
				limit: answerLimits.get(`${paper.template_id}|${part}`) ?? null,
			})
		}
		index.set(paper.id, questions)
	}
	return index
}

/**
 * The three question-wise rules, checked against the paper the marks claim to
 * come from:
 *
 *   1. A question's mark cannot exceed its own max.
 *   2. Only one branch of an OR pair may be answered.
 *   3. A part's "answer any N" limit is respected.
 *
 * `subject` prefixes each message — a register number where one is known.
 * A paper id that is not in the index is skipped rather than failed, so a batch
 * referencing a deleted paper degrades to "unvalidated" instead of "rejected".
 */
export function validateQuestionMarks(
	index: PaperIndex,
	questionMarks: unknown,
	subject: string
): string[] {
	const errors: string[] = []
	if (!isQuestionMarksMap(questionMarks)) return errors

	for (const entry of Object.values(questionMarks)) {
		const questions = entry?.paper_id ? index.get(String(entry.paper_id)) : undefined
		if (!questions) continue

		const answeredByGroup = new Map<string, string[]>()
		const groupsByPart = new Map<string, Set<string>>()

		for (const [questionId, value] of Object.entries(entry.marks || {})) {
			if (value == null || value === '') continue
			const meta = questions.get(questionId)
			if (!meta) continue
			if (meta.marks > 0 && Number(value) > meta.marks) {
				errors.push(`${subject}: Q${meta.label} mark (${value}) exceeds question max (${meta.marks})`)
			}
			answeredByGroup.set(meta.group, [...(answeredByGroup.get(meta.group) || []), meta.label])
			if (!groupsByPart.has(meta.part)) groupsByPart.set(meta.part, new Set())
			groupsByPart.get(meta.part)!.add(meta.group)
		}

		for (const labels of answeredByGroup.values()) {
			if (labels.length > 1) {
				errors.push(`${subject}: only one of Q${labels.join(' / Q')} may be answered (OR choice)`)
			}
		}

		for (const [part, groups] of groupsByPart) {
			const limit = [...questions.values()].find(m => m.part === part)?.limit
			if (limit != null && groups.size > limit) {
				errors.push(`${subject}: Part ${part} allows any ${limit} question(s), ${groups.size} answered`)
			}
		}
	}

	return errors
}

/**
 * Drops stale breakdowns before a component total is overwritten.
 *
 * The invariant this protects: if `question_marks[code]` exists, it sums to the
 * component column. A caller that writes a component total without sending a
 * matching breakdown would otherwise leave the old per-question marks sitting
 * under a total they no longer add up to — wrong, and silent.
 *
 * Returns the breakdown to store, or undefined when nothing needs rewriting
 * (so the caller can omit the column and leave the stored value untouched).
 */
export function pruneStaleQuestionMarks(
	stored: unknown,
	incoming: unknown,
	writtenComponentCodes: Iterable<string>
): QuestionMarksMap | undefined {
	const incomingMap = isQuestionMarksMap(incoming) ? incoming : {}
	const storedMap = isQuestionMarksMap(stored) ? stored : {}

	// Components the caller overwrote without supplying a breakdown of their own.
	const stale = [...writtenComponentCodes].filter(
		code => storedMap[code] !== undefined && incomingMap[code] === undefined
	)

	if (stale.length === 0) {
		return isQuestionMarksMap(incoming) && Object.keys(incomingMap).length > 0
			? incomingMap
			: undefined
	}

	// Stored breakdowns survive only where the caller left the component alone.
	const merged: QuestionMarksMap = {}
	for (const [code, entry] of Object.entries(storedMap)) {
		if (!stale.includes(code)) merged[code] = entry
	}
	for (const [code, entry] of Object.entries(incomingMap)) {
		merged[code] = entry
	}
	return merged
}
