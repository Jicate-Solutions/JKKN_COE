// Completeness rules for a question paper, checked when it LEAVES the author's
// hands — on Submit and on Approve. Save stays unvalidated: an author must be
// able to stop half-way and come back.
//
// Required for every question slot:
//   • question text (a split question: text on each sub-division; the parent stem
//     stays optional)
//   • CO and K-level — ALWAYS, on every question
//   • every MCQ option filled in
//
// CO and K-level used to be conditional on the template part's capture_co /
// capture_klevel flags. They are now unconditional: a question paper is mapped to
// course outcomes and Bloom levels for attainment reporting, and a single
// unmapped question leaves a hole in it. The template flags no longer gate this,
// and the editors show both selectors on every question so the rule is always
// satisfiable.
//
// Pure — no node/browser APIs — so the page blocks the click and the API blocks a
// stale tab with the same messages.

import { readSubQuestions, entryLabel } from './sub-questions'

export interface PaperPart {
	part_label?: string | null
	capture_co?: boolean | null
	capture_klevel?: boolean | null
}

/** Visible text of rich content — tags and entities stripped. */
function plainText(value: any): string {
	return String(value ?? '')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim()
}

/** An option counts as filled when either its rich or its plain form has text. */
function optionIsEmpty(o: any): boolean {
	return plainText(o?.text_html) === '' && plainText(o?.text) === ''
}

/**
 * Every reason this paper cannot be submitted yet, in question order.
 * Empty array = complete.
 */
export function validatePaperComplete(questions: any[], _parts?: PaperPart[]): string[] {
	// `_parts` is no longer consulted: CO and K-level are required on every
	// question regardless of what the template part says. The parameter is kept so
	// the existing call sites (page, portal and both API routes) stay valid.
	const errors: string[] = []

	const ordered = (Array.isArray(questions) ? questions : [])
		.slice()
		.sort((a: any, b: any) => (a?.display_order ?? 0) - (b?.display_order ?? 0))

	for (const q of ordered) {
		const subs = readSubQuestions(q)

		if (subs.length > 0) {
			// Split question: the stem is optional, each sub-division is not — and
			// each carries its own CO and K-level, because the sub-divisions of one
			// question routinely test different outcomes at different Bloom levels.
			for (const sb of subs) {
				const where = `Q${entryLabel(q, sb)}`
				if (plainText(sb.question_text) === '') errors.push(`${where}: enter the question`)
				if (!sb.co_code) errors.push(`${where}: select a Course Outcome (CO)`)
				if (!sb.k_level) errors.push(`${where}: select a K-level`)
			}
		} else {
			const where = `Q${entryLabel(q)}`
			if (plainText(q?.question_text) === '') errors.push(`${where}: enter the question`)
			if (!q?.co_code) errors.push(`${where}: select a Course Outcome (CO)`)
			if (!q?.k_level) errors.push(`${where}: select a K-level`)
		}

		const options = Array.isArray(q?.options) ? q.options : []
		for (const o of options) {
			if (optionIsEmpty(o)) errors.push(`Q${entryLabel(q)}: option ${o?.key} is empty`)
		}
	}

	return errors
}

/** Statuses whose transition requires a complete paper. */
export const COMPLETION_REQUIRED_STATUSES = ['submitted', 'approved']

export function requiresCompletion(status?: string | null): boolean {
	return !!status && COMPLETION_REQUIRED_STATUSES.includes(status)
}
