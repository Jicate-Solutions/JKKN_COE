// Shared scaffolding for IA question papers: builds the ordered array of empty
// question objects (incl. "(OR)" choice alternatives and MCQ option slots) from
// template parts. Stored as ia_question_papers.questions (JSONB).
import { randomUUID } from 'crypto'
import type { IaSubQuestion, IaQuestionImageRef } from './sub-questions'
import { readQuestionImage } from './sub-questions'

const LETTERS = 'abcdefghij'

export interface IaQuestionObject {
	id: string
	part_label: string
	question_number: number
	sub_label: string | null
	is_choice_alternative: boolean
	question_type_code: string
	question_text: string | null
	marks: number | null
	options: { key: string; text: string; text_html?: string | null }[] | null
	/** CSS font-family for MCQ options (Bamini / Suntommy / Noto Sans Tamil). */
	option_font?: string | null
	/** Optional figure, printed centred under the question. Never scaffolded. */
	image?: IaQuestionImageRef | null
	correct_option: string | null
	co_code: string | null
	k_level: string | null
	/**
	 * Author-defined sub-divisions ("12 a) i. / ii."). null / [] = not split.
	 * Never scaffolded from the template — the paper author adds them.
	 */
	sub_questions?: IaSubQuestion[] | null
	display_order: number
}

export function buildOptions(optionCount?: number | null) {
	if (!optionCount || optionCount < 2) return null
	return Array.from({ length: optionCount }, (_, i) => ({ key: LETTERS[i] || String(i + 1), text: '' }))
}

// Build the ordered question array for a paper from its template parts.
export function scaffoldQuestions(parts: any[]): IaQuestionObject[] {
	const rows: IaQuestionObject[] = []
	let counter = 0
	let order = 0
	const sorted = parts.slice().sort((a, b) => a.display_order - b.display_order)
	for (const part of sorted) {
		const n = part.num_questions || 0
		for (let qi = 0; qi < n; qi++) {
			counter++
			rows.push({
				id: randomUUID(),
				part_label: part.part_label,
				question_number: counter,
				sub_label: part.has_choice ? 'a' : null,
				is_choice_alternative: false,
				question_type_code: part.question_type_code,
				question_text: null,
				marks: part.marks_per_question,
				options: buildOptions(part.option_count),
				correct_option: null,
				co_code: null,
				k_level: null,
				sub_questions: null,
				display_order: ++order,
			})
			if (part.has_choice) {
				rows.push({
					id: randomUUID(),
					part_label: part.part_label,
					question_number: counter,
					sub_label: 'b',
					is_choice_alternative: true,
					question_type_code: part.question_type_code,
					question_text: null,
					marks: part.marks_per_question,
					options: buildOptions(part.option_count),
					correct_option: null,
					co_code: null,
					k_level: null,
					sub_questions: null,
					display_order: ++order,
				})
			}
		}
	}
	return rows
}

// Merge authored content from an existing question array into a freshly scaffolded
// one (used by Rebuild so an accidental rebuild can't erase entered questions).
// Match by part + question number + sub-label + choice branch.
export function mergeAuthored(scaffold: IaQuestionObject[], existing: any[]): IaQuestionObject[] {
	const keyOf = (q: any) =>
		`${q.part_label}|${q.question_number}|${q.sub_label || ''}|${q.is_choice_alternative ? 1 : 0}`
	const existMap = new Map((existing || []).map((q: any) => [keyOf(q), q]))
	return scaffold.map(s => {
		const e: any = existMap.get(keyOf(s))
		if (!e) return s
		let options = s.options
		if (Array.isArray(s.options) && Array.isArray(e.options)) {
			const byKey = new Map(e.options.map((o: any) => [o.key, o]))
			options = s.options.map(o => {
				const prev: any = byKey.get(o.key)
				return prev ? { ...o, text: prev.text ?? o.text, text_html: prev.text_html ?? null } : o
			})
		} else if (Array.isArray(e.options)) {
			options = e.options
		}
		return {
			...s,
			question_text: e.question_text ?? s.question_text,
			options,
			option_font: e.option_font ?? null,
			// An attached figure survives a Rebuild, like authored text does.
			image: readQuestionImage(e.image),
			correct_option: e.correct_option ?? null,
			co_code: e.co_code ?? null,
			k_level: e.k_level ?? null,
			// Author-defined splits survive a Rebuild, like authored text does.
			sub_questions: Array.isArray(e.sub_questions) && e.sub_questions.length > 0 ? e.sub_questions : null,
		}
	})
}
