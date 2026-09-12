// Merging an incoming question payload onto the stored questions of a paper.
//
// This exists because of a real data loss: a save whose payload omitted the
// Part B fields nulled every one of them, silently destroying eight authored
// sub-divisions on a submitted paper. Both save routes (pre-exam and v1) now go
// through here so the rule is stated once:
//
//   A field the payload does not MENTION is preserved.
//   Only an explicit value — including null / '' — changes it.
//
// Pure: no supabase, no next. Both routes and any test can call it.
import { readSubQuestions, canSplit, entryLabel, readQuestionImage } from './sub-questions'

/** Was the key actually present in the payload (vs. simply absent)? */
function has(o: any, key: string): boolean {
	return o != null && Object.prototype.hasOwnProperty.call(o, key)
}

/** Visible text of a question or sub-division, tags stripped. */
function plainText(value: any): string {
	return String(value ?? '')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.trim()
}

/**
 * Does this question carry authored content — its own text, or text on any of
 * its sub-divisions? Marks and CO/K alone don't count; a scaffolded-but-empty
 * slot has those from the template.
 */
export function hasAuthoredContent(q: any): boolean {
	if (plainText(q?.question_text) !== '') return true
	const subs = Array.isArray(q?.sub_questions) ? q.sub_questions : []
	return subs.some((s: any) => plainText(s?.question_text) !== '')
}

export interface ApplyQuestionEditsResult {
	/** Full question array in stored order, ready to write back. */
	questions: any[]
	/** Labels of questions that would go from authored to empty ("11 a", "12 b"). */
	cleared: string[]
}

/**
 * Apply `incoming` onto `current`, matching by question id. Ids not present in
 * `current` are ignored (a paper's slots come from its template, never from the
 * client), and every stored question is returned whether or not it was sent.
 */
export function applyQuestionEdits(current: any[], incoming: any[]): ApplyQuestionEditsResult {
	const byId = new Map<string, any>(current.map((q: any) => [q.id, q]))
	const cleared: string[] = []

	for (const q of incoming || []) {
		const base = byId.get(q?.id)
		if (!base) continue

		const next: any = { ...base }

		if (has(q, 'question_text')) next.question_text = q.question_text ?? null
		if (has(q, 'marks')) next.marks = q.marks ?? base.marks ?? null
		if (has(q, 'options')) next.options = q.options ?? null
		if (has(q, 'option_font')) next.option_font = q.option_font ?? null
		// Normalized on the way in — only a usable http(s) URL is ever stored.
		if (has(q, 'image')) next.image = readQuestionImage(q.image)
		if (has(q, 'correct_option')) next.correct_option = q.correct_option ?? null
		// The answer key travels with the question but is never printed with it.
		if (has(q, 'answer_key')) next.answer_key = q.answer_key ?? null
		if (has(q, 'answer_key_image')) next.answer_key_image = readQuestionImage(q.answer_key_image)

		// Sub-divisions are author-defined and normalized on the way in (labels
		// relabelled i/ii, junk dropped). Objective questions have nothing to split.
		// An omitted sub_questions key re-reads the STORED value, so a payload that
		// never mentions sub-divisions leaves them exactly as they were.
		const subs = canSplit(base) ? readSubQuestions(has(q, 'sub_questions') ? q : base) : []

		// A sub-division's answer key follows the same rule as the question's: it
		// changes only when the payload MENTIONS it. `sub_answer_keys` carries the
		// keys alone, for an appointment that may write keys but not questions.
		const baseSubs = new Map<string, any>(readSubQuestions(base).map(s => [s.id, s]))
		const sentSubs = new Map<string, any>(
			(has(q, 'sub_questions') && Array.isArray(q.sub_questions) ? q.sub_questions : []).map((s: any) => [String(s?.id), s])
		)
		const sentKeys = new Map<string, any>(
			(Array.isArray(q?.sub_answer_keys) ? q.sub_answer_keys : []).map((s: any) => [String(s?.id), s])
		)
		for (const s of subs) {
			const sent = sentKeys.get(s.id) ?? sentSubs.get(s.id)
			const prev = baseSubs.get(s.id)
			s.answer_key = sent && has(sent, 'answer_key') ? sent.answer_key ?? null : prev?.answer_key ?? null
			s.answer_key_image =
				sent && has(sent, 'answer_key_image') ? readQuestionImage(sent.answer_key_image) : prev?.answer_key_image ?? null
		}
		next.sub_questions = subs.length > 0 ? subs : null

		// A split question's CO / K-level live on its sub-divisions.
		if (subs.length > 0) {
			next.co_code = null
			next.k_level = null
		} else {
			if (has(q, 'co_code')) next.co_code = q.co_code ?? null
			if (has(q, 'k_level')) next.k_level = q.k_level ?? null
		}

		if (hasAuthoredContent(base) && !hasAuthoredContent(next)) {
			cleared.push(entryLabel(base))
		}
		byId.set(base.id, next)
	}

	return { questions: current.map((q: any) => byId.get(q.id)), cleared }
}

/**
 * A save that blanks several already-authored questions at once is not an edit —
 * it is a stale or partial payload. One or two is plausible hand-editing; beyond
 * that the caller must say it means it (`allow_clear: true`).
 */
export const MASS_CLEAR_THRESHOLD = 3

export function massClearError(cleared: string[]): { error: string; message: string } {
	return {
		error: 'WOULD_CLEAR',
		message:
			`This save would erase authored content in ${cleared.length} questions ` +
			`(${cleared.join(', ')}). Reload the paper and re-enter, or pass allow_clear:true ` +
			`to clear them deliberately.`,
	}
}
