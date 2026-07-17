// Shared scaffolding for IA question papers: builds the empty question slots
// (including "(OR)" choice alternatives and MCQ option rows) from template parts.

const LETTERS = 'abcdefghij'

export function buildOptions(optionCount?: number | null) {
	if (!optionCount || optionCount < 2) return null
	return Array.from({ length: optionCount }, (_, i) => ({ key: LETTERS[i] || String(i + 1), text: '' }))
}

// Build question rows for a paper from its template parts.
export function scaffoldQuestions(paperId: string, parts: any[]) {
	const rows: any[] = []
	let counter = 0
	let order = 0
	const sorted = parts.slice().sort((a, b) => a.display_order - b.display_order)
	for (const part of sorted) {
		const n = part.num_questions || 0
		for (let qi = 0; qi < n; qi++) {
			counter++
			rows.push({
				paper_id: paperId,
				part_id: part.id,
				part_label: part.part_label,
				question_number: counter,
				sub_label: part.has_choice ? 'a' : null,
				is_choice_alternative: false,
				question_type_code: part.question_type_code,
				marks: part.marks_per_question,
				options: buildOptions(part.option_count),
				display_order: ++order,
			})
			if (part.has_choice) {
				rows.push({
					paper_id: paperId,
					part_id: part.id,
					part_label: part.part_label,
					question_number: counter,
					sub_label: 'b',
					is_choice_alternative: true,
					question_type_code: part.question_type_code,
					marks: part.marks_per_question,
					options: buildOptions(part.option_count),
					display_order: ++order,
				})
			}
		}
	}
	return rows
}
