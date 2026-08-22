/**
 * Register number generation rules.
 *
 * Shared by the "Generate Register Number" page (client-side preview) and
 * /api/users/register-numbers/generate (server-side save). Both sides must
 * produce byte-identical numbers, so the rule lives here once — the server
 * recomputes rather than trusting the numbers the client previewed.
 */

/**
 * Zero-padding width is the LENGTH of the start number as the user typed it.
 *   '001' -> 3 digits (001, 002, ... 010, ... 100)
 *   '1'   -> unpadded (1, 2, 3)
 *   '0001'-> 4 digits
 */
export function getPadWidth(startNumber: string): number {
	const trimmed = String(startNumber ?? '').trim()
	return Math.max(trimmed.length, 1)
}

/** Numeric value of the start number ('001' -> 1). Returns NaN when unparseable. */
export function parseStartNumber(startNumber: string): number {
	const trimmed = String(startNumber ?? '').trim()
	if (!/^\d+$/.test(trimmed)) return NaN
	return parseInt(trimmed, 10)
}

/**
 * Build one register number.
 *
 * @param prefix       e.g. 'BCS26'
 * @param startNumber  e.g. '001' — raw string, its length sets the padding
 * @param offset       0-based position in the sorted cohort
 */
export function buildRegisterNumber(prefix: string, startNumber: string, offset: number): string {
	const start = parseStartNumber(startNumber)
	const width = getPadWidth(startNumber)
	const value = (isNaN(start) ? 1 : start) + offset
	return `${String(prefix ?? '').trim()}${String(value).padStart(width, '0')}`
}

/** Normalised display name for a learner record from MyJKKN. */
export function learnerDisplayName(learner: {
	first_name?: string | null
	last_name?: string | null
	name?: string | null
	student_name?: string | null
}): string {
	const joined = `${learner.first_name || ''} ${learner.last_name || ''}`.trim()
	return joined || learner.name || learner.student_name || ''
}

/**
 * Alphabetical (A–Z) comparator used for program-wise assignment.
 *
 * `localeCompare` with sensitivity 'base' so case and accents don't reorder
 * names. `id` is a mandatory tiebreaker: two learners can share a name, and
 * without a unique tiebreaker the sort is unstable across runs — regenerating
 * would then hand the same two learners each other's numbers.
 */
export function compareByName(
	a: { name: string; id: string },
	b: { name: string; id: string }
): number {
	const byName = a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true })
	if (byName !== 0) return byName
	return a.id.localeCompare(b.id)
}

/** Sort a cohort A–Z by name. Returns a new array; the input is untouched. */
export function sortAlphabetically<T extends { name: string; id: string }>(rows: T[]): T[] {
	return [...rows].sort(compareByName)
}
