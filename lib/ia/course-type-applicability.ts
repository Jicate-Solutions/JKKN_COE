// Course-type applicability for IA paper templates.
//
// `ia_paper_templates.course_type_applicability` stores one or more course-category
// tokens joined by commas (e.g. 'theory,practical'), or the catch-all 'all'.
//
// Tokens are normalized `courses.course_category` values — the same list the
// /master/courses "Course Category" picker offers (COURSE_CATEGORIES):
//   'Theory'             -> 'theory'
//   'Theory + Practical' -> 'theory_practical'
//   'Field Work'         -> 'field_work'
//
// A template applies to a course when its token set contains 'all' or the
// course's normalized course_category.
//
// Note: the legacy pre-multi-select value 'theory_practical' normalizes to the
// same token as the 'Theory + Practical' category, so old rows keep their meaning.

import { COURSE_CATEGORIES } from '@/types/courses'

export const ALL_TOKEN = 'all'

// 'Theory + Practical' -> 'theory_practical'; 'Field Work' -> 'field_work'
export function normalizeCourseCategory(category?: string | null): string {
	return (category || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
}

// Canonical token list, in the same order the courses master lists categories.
export const COURSE_TYPE_TOKENS: string[] = COURSE_CATEGORIES.map(normalizeCourseCategory)

// token -> human label ('theory_practical' -> 'Theory + Practical')
export const COURSE_TYPE_LABELS: Record<string, string> = {
	[ALL_TOKEN]: 'All',
	...Object.fromEntries(COURSE_CATEGORIES.map(c => [normalizeCourseCategory(c), c])),
}

// Stored value -> token set. 'all' collapses to {all}.
export function parseApplicability(value?: string | null): Set<string> {
	const raw = (value || '').trim()
	if (!raw) return new Set([ALL_TOKEN])

	const tokens = new Set<string>()
	for (const part of raw.split(',')) {
		const token = normalizeCourseCategory(part)
		if (token) tokens.add(token)
	}
	if (tokens.size === 0) return new Set([ALL_TOKEN])
	// 'all' alongside anything else is still 'all'
	if (tokens.has(ALL_TOKEN)) return new Set([ALL_TOKEN])
	return tokens
}

// Token set -> stored value. Empty / 'all' both persist as 'all'.
export function serializeApplicability(tokens: Iterable<string>): string {
	const set = new Set<string>()
	for (const t of tokens) {
		const token = normalizeCourseCategory(t)
		if (token) set.add(token)
	}
	if (set.size === 0 || set.has(ALL_TOKEN)) return ALL_TOKEN
	// Canonical order, so the same selection always stores the same string
	const known = COURSE_TYPE_TOKENS.filter(t => set.has(t))
	const unknown = [...set].filter(t => !COURSE_TYPE_TOKENS.includes(t)).sort()
	return [...known, ...unknown].join(',')
}

export function formatApplicability(value?: string | null): string {
	const tokens = parseApplicability(value)
	if (tokens.has(ALL_TOKEN)) return COURSE_TYPE_LABELS[ALL_TOKEN]
	const ordered = COURSE_TYPE_TOKENS.filter(t => tokens.has(t))
	const unknown = [...tokens].filter(t => !COURSE_TYPE_TOKENS.includes(t))
	return [...ordered, ...unknown].map(t => COURSE_TYPE_LABELS[t] || t).join(', ')
}

// Does this template cover the given `courses.course_category`?
// A course with no category is only matched by an 'all' template.
export function templateAppliesToCourse(
	courseTypeApplicability: string | null | undefined,
	courseCategory?: string | null
): boolean {
	const tokens = parseApplicability(courseTypeApplicability)
	if (tokens.has(ALL_TOKEN)) return true
	const category = normalizeCourseCategory(courseCategory)
	if (!category) return false
	return tokens.has(category)
}

// Pick the best template for a course: prefer one that names the course's
// category explicitly over a generic 'all' template. Returns null when none
// apply, which callers treat as "don't generate a paper for this course".
export function pickTemplateForCourse<T extends { course_type_applicability?: string | null }>(
	templates: T[],
	courseCategory?: string | null
): T | null {
	const category = normalizeCourseCategory(courseCategory)

	if (category) {
		const specific = templates.find(t => {
			const tokens = parseApplicability(t.course_type_applicability)
			return !tokens.has(ALL_TOKEN) && tokens.has(category)
		})
		if (specific) return specific
	}

	return templates.find(t => parseApplicability(t.course_type_applicability).has(ALL_TOKEN)) || null
}
