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

// ── Which categories sit a written theory paper ─────────────────────────────
//
// A Question Paper setter is appointed to write a THEORY paper. Practical and
// laboratory examinations are conducted and valued in the lab by the practical
// examiners (pre-exam/practical-allotment) — there is no written paper for
// anyone to set, so those courses must never reach the QP assignment screen.
//
// A combined course ("Theory + Practical", "Theory + Project") does sit a
// written theory paper for its theory half, so it stays eligible.
//
// This is a rule about the examination, not about template configuration: it is
// applied BEFORE any format matching, so a format that happened to name
// 'practical' still cannot pull a lab course into the list.

export const THEORY_PAPER_TOKENS: ReadonlySet<string> = new Set([
	'theory',
	'theory_practical',
	'theory_project',
])

/** Does this `courses.course_category` sit a written end-semester theory paper? */
export function hasTheoryPaper(courseCategory?: string | null): boolean {
	return THEORY_PAPER_TOKENS.has(normalizeCourseCategory(courseCategory))
}

/** Human label for why a course was left out, used in the UI's excluded note. */
export function nonTheoryReason(courseCategory?: string | null): string {
	const label = (courseCategory || '').trim()
	return label
		? `${label} — no written theory paper`
		: 'No course category set — cannot confirm it sits a written theory paper'
}

// ── Program type (ug / pg / diploma / certificate / all) ────────────────────
//
// `ia_paper_templates.program_type_applicability` holds a single token. It is a
// second, independent dimension to the course category: an institution commonly
// runs one ESE format for its UG programmes and another for its PG ones, both
// covering exactly the same course categories.

/** 'UG' / 'ug' / '' -> 'ug' | ''. Anything unrecognised normalises to ''. */
export function normalizeProgramType(value?: string | null): string {
	return (value || '').trim().toLowerCase()
}

// Does this template cover the given program type?
// A template with no program type set ('' / 'all') covers everything.
export function templateAppliesToProgramType(
	programTypeApplicability: string | null | undefined,
	programType?: string | null
): boolean {
	const token = normalizeProgramType(programTypeApplicability)
	if (!token || token === ALL_TOKEN) return true
	const want = normalizeProgramType(programType)
	if (!want) return false
	return token === want
}

/**
 * Pick the best template for a course.
 *
 * Two independent dimensions are ranked, most specific first, so a template that
 * names BOTH the course category and the programme type always beats one that
 * names only one of them:
 *
 *   1. category named + program type named
 *   2. category named + program type 'all'
 *   3. category 'all'  + program type named
 *   4. category 'all'  + program type 'all'
 *
 * `programType` is optional: the CIA callers do not pass it, and a template
 * whose program type is 'all' matches regardless. Passing it matters when an
 * institution keeps a UG and a PG format side by side with identical course
 * categories — without it the two are indistinguishable and whichever the
 * database happens to return first wins every course.
 *
 * Returns null when none apply, which callers treat as "no paper for this course".
 */
export function pickTemplateForCourse<
	T extends { course_type_applicability?: string | null; program_type_applicability?: string | null },
>(templates: T[], courseCategory?: string | null, programType?: string | null): T | null {
	const category = normalizeCourseCategory(courseCategory)
	const want = normalizeProgramType(programType)

	const namesCategory = (t: T) => {
		const tokens = parseApplicability(t.course_type_applicability)
		return !tokens.has(ALL_TOKEN) && !!category && tokens.has(category)
	}
	const anyCategory = (t: T) => parseApplicability(t.course_type_applicability).has(ALL_TOKEN)
	const namesProgram = (t: T) => {
		const token = normalizeProgramType(t.program_type_applicability)
		return !!token && token !== ALL_TOKEN && !!want && token === want
	}
	// A template restricted to another programme type must never be picked, even
	// as the last resort — a PG format on a UG paper is wrong, not a fallback.
	//
	// When the caller supplies no program type at all (the CIA routes), this
	// dimension is simply not in play and every template stays eligible, exactly
	// as before program-type ranking existed.
	const programOk = (t: T) => !want || templateAppliesToProgramType(t.program_type_applicability, want)

	const tiers: ((t: T) => boolean)[] = [
		t => namesCategory(t) && namesProgram(t),
		t => namesCategory(t) && programOk(t),
		t => anyCategory(t) && namesProgram(t),
		t => anyCategory(t) && programOk(t),
	]

	for (const tier of tiers) {
		const hit = templates.find(tier)
		if (hit) return hit
	}
	return null
}
