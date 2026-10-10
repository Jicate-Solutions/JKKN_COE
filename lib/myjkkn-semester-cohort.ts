import { fetchMyJKKNLearnerProfiles, fetchMyJKKNRegulations } from '@/lib/myjkkn-api'
import { MYJKKN_MAX_PER_PAGE } from '@/lib/myjkkn-learner-enrichment'
import type { CohortLearner } from '@/lib/exam-registration-cohort-regulation'

/**
 * One MyJKKN semester cohort: the learners currently in a semester_id.
 *
 * semester_id is one of the few filters MyJKKN applies server-side, so this is a single
 * small request per semester instead of a sweep of every learner on the platform. A
 * semester_id belongs to a program, not to a regulation — narrow the cohort with
 * `placeCohortByRegulation` before treating it as one regulation's learners.
 */

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SemesterCohortLearner extends CohortLearner {
	student_name: string
	student_photo_url: string
	institution_id: string
}

// Regulations change a few times a year; resolving id → code per request would add a
// MyJKKN round-trip to every cohort load.
const REGULATION_CACHE_TTL = 5 * 60 * 1000
let regulationCache: { codes: Map<string, string>; timestamp: number } | null = null

export async function getRegulationCodes(): Promise<Map<string, string>> {
	if (regulationCache && Date.now() - regulationCache.timestamp < REGULATION_CACHE_TTL) {
		return regulationCache.codes
	}
	const codes = new Map<string, string>()
	for (let page = 1; ; page++) {
		const res = await fetchMyJKKNRegulations({ page, limit: MYJKKN_MAX_PER_PAGE })
		const rows = res.data || []
		for (const r of rows) {
			if (r.id && r.regulation_code) codes.set(r.id, r.regulation_code)
		}
		if (rows.length < MYJKKN_MAX_PER_PAGE) break
	}
	regulationCache = { codes, timestamp: Date.now() }
	return codes
}

// The bulk-register page reads a cohort twice in quick succession: once to learn which
// semesters hold learners, again when a semester is picked. Kept only long enough to
// cover that.
const COHORT_CACHE_TTL = 60 * 1000
const cohortCache = new Map<string, { rows: any[]; timestamp: number }>()

async function fetchRawCohort(semesterId: string): Promise<any[]> {
	const cached = cohortCache.get(semesterId)
	if (cached && Date.now() - cached.timestamp < COHORT_CACHE_TTL) return cached.rows

	const rows: any[] = []
	for (let page = 1; ; page++) {
		const res = await fetchMyJKKNLearnerProfiles({ semester_id: semesterId, page, limit: MYJKKN_MAX_PER_PAGE })
		const pageRows: any[] = res.data || []
		rows.push(...pageRows)
		// A short page is the end. metadata.totalPages is not trusted — it over-reports,
		// and asking for the phantom page answers 500.
		const total = (res as any).metadata?.total
		if (pageRows.length < MYJKKN_MAX_PER_PAGE) break
		if (typeof total === 'number' && rows.length >= total) break
	}
	cohortCache.set(semesterId, { rows, timestamp: Date.now() })
	return rows
}

/**
 * The learners of one semester, each with the regulation MyJKKN records for them
 * ('' when unset). `institutionIds` scopes the result to the caller's institution.
 */
export async function fetchSemesterCohort(
	semesterId: string,
	institutionIds: string[],
	regulationCodes: Map<string, string>
): Promise<SemesterCohortLearner[]> {
	const allowedInstitutions = new Set(institutionIds)
	const seen = new Set<string>()
	const cohort: SemesterCohortLearner[] = []
	for (const l of await fetchRawCohort(semesterId)) {
		// Guard against MyJKKN ignoring the filter (it does for most other params).
		if (!l?.id || seen.has(l.id) || l.semester_id !== semesterId) continue
		if (l.institution_id && allowedInstitutions.size > 0 && !allowedInstitutions.has(l.institution_id)) continue
		seen.add(l.id)
		cohort.push({
			id: l.id,
			stu_register_no: l.register_number || l.roll_number || '',
			student_name: `${l.first_name || ''} ${l.last_name || ''}`.trim(),
			student_photo_url: l.student_photo_url || '',
			regulation_code: (l.regulation_id && regulationCodes.get(l.regulation_id)) || '',
			admission_year: l.admission_year ?? null,
			institution_id: l.institution_id || '',
		})
	}
	return cohort
}
