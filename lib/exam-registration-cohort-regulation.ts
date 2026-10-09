import { batchYearOf, UNMAPPED_BATCH } from '@/lib/utils/batch-year'

/**
 * Which regulation each learner of a semester cohort follows.
 *
 * A MyJKKN semester is shared by every regulation of a program, so a program + semester
 * cohort has to be narrowed by the learner's own regulation. MyJKKN records one for only
 * about half of the learners; the rest are placed with their batch, because a whole
 * semester cohort is one batch studying one regulation.
 */

export interface CohortLearner {
	id: string
	// register number, or the roll number while the learner is unnumbered
	stu_register_no: string
	// regulation recorded for the learner in MyJKKN ('' when unset)
	regulation_code: string
	admission_year: number | null
}

export interface RegulationPlacement {
	regulation_code: string
	// true when MyJKKN records no regulation for the learner and the batch's was used
	inferred: boolean
}

// MyJKKN and COE spell the same regulation differently ("R2024", "R-2024", "REG-2024"),
// so regulations are compared on the year embedded in the code.
export function regulationKey(code: string): string {
	return code.match(/\d{4}/)?.[0] ?? code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function regulationYear(code: string): number {
	return Number(code.match(/\d{4}/)?.[0]) || 0
}

// Most frequent value first; a tie goes to the smaller one (lateral entrants carry a
// later year than the batch they join, so the earlier year is the batch's own).
function byFrequency<T extends string | number>(values: T[]): Array<[T, number]> {
	const counts = new Map<T, number>()
	for (const v of values) counts.set(v, (counts.get(v) || 0) + 1)
	return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
}

// The intake year is read from the register / roll number first: MyJKKN's admission_year
// disagrees with the batch for a quarter of the learners, so it is only the last resort
// (it is all a fresh intake without numbers has).
function intakeYearOf(learner: CohortLearner): number {
	const fromNumber = batchYearOf(learner.stu_register_no)
	return fromNumber !== UNMAPPED_BATCH ? fromNumber : (learner.admission_year || UNMAPPED_BATCH)
}

/**
 * The regulation a cohort's unrecorded learners are taken to follow, or '' when it
 * cannot be told.
 *
 *  1. The regulation most of their classmates have recorded in MyJKKN.
 *  2. Otherwise the newest regulation mapped for the program that was already in
 *     force for the cohort's intake year.
 */
export function inferCohortRegulation(cohort: CohortLearner[], mappedRegulations: string[]): string {
	const recorded = cohort.filter(l => l.regulation_code)
	const ranked = byFrequency(recorded.map(l => regulationKey(l.regulation_code)))
	if (ranked.length > 0 && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
		return recorded.find(l => regulationKey(l.regulation_code) === ranked[0][0])!.regulation_code
	}

	const intakeYear = byFrequency(cohort.map(intakeYearOf).filter(y => y !== UNMAPPED_BATCH))[0]?.[0]
	if (!intakeYear) return ''
	return mappedRegulations
		.filter(code => regulationYear(code) > 0 && regulationYear(code) <= intakeYear)
		.sort((a, b) => regulationYear(b) - regulationYear(a))[0] || ''
}

/**
 * Places every learner of a cohort under a regulation. Learners that cannot be placed
 * (no regulation recorded and none inferable) are absent from the result.
 */
export function placeCohortByRegulation(
	cohort: CohortLearner[],
	mappedRegulations: string[]
): Map<string, RegulationPlacement> {
	const placements = new Map<string, RegulationPlacement>()
	const cohortRegulation = cohort.some(l => !l.regulation_code)
		? inferCohortRegulation(cohort, mappedRegulations)
		: ''
	for (const l of cohort) {
		if (l.regulation_code) placements.set(l.id, { regulation_code: l.regulation_code, inferred: false })
		else if (cohortRegulation) placements.set(l.id, { regulation_code: cohortRegulation, inferred: true })
	}
	return placements
}
