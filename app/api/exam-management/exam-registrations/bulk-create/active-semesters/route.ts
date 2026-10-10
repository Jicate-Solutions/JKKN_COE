import { NextRequest, NextResponse } from 'next/server'
import { fetchAllMyJKKNPrograms, fetchAllMyJKKNSemesters } from '@/lib/myjkkn-api'
import { MYJKKN_MAX_PER_PAGE } from '@/lib/myjkkn-learner-enrichment'
import { placeCohortByRegulation, regulationKey } from '@/lib/exam-registration-cohort-regulation'
import { fetchSemesterCohort, getRegulationCodes } from '@/lib/myjkkn-semester-cohort'

/**
 * GET /api/exam-management/exam-registrations/bulk-create/active-semesters
 *
 * Which semesters of a program currently hold learners, and of which regulation — so
 * the bulk exam-registration page can offer only the semesters the selected regulation
 * is studying in right now (EEE R-2021: Semesters V and VII, nothing else).
 *
 * Query params:
 *  - institution_ids : comma-separated MyJKKN institution UUIDs (required)
 *  - program_code    : COE program code, e.g. "EEE" (required)
 *  - regulations     : comma-separated regulation codes COE has mapped for the program.
 *                      Used to place learners MyJKKN records no regulation for.
 *
 * Returns: { data: ActiveSemester[], source: 'myjkkn' } — one entry per MyJKKN semester
 * row of the program, including the empty ones. `by_regulation` is keyed by the
 * regulation's year ("2021"), the form regulations are compared on.
 */

interface ProgramSemester {
	id: string
	program_id: string
	semester_code: string
	semester_name: string
	semester_order: number
}

// Programs and semesters change a few times a year; both lists are swept whole because
// MyJKKN ignores the program / institution filters on these endpoints.
const STRUCTURE_CACHE_TTL = 5 * 60 * 1000
let structureCache: { programs: any[]; semesters: ProgramSemester[]; timestamp: number } | null = null

async function getProgramStructure() {
	if (structureCache && Date.now() - structureCache.timestamp < STRUCTURE_CACHE_TTL) return structureCache
	const [programs, semesters] = await Promise.all([
		fetchAllMyJKKNPrograms({ all: true, limit: MYJKKN_MAX_PER_PAGE }),
		fetchAllMyJKKNSemesters({ all: true, limit: MYJKKN_MAX_PER_PAGE }),
	])
	structureCache = {
		programs: programs as any[],
		semesters: (semesters as any[]).map(s => ({
			id: s.id,
			program_id: s.program_id,
			semester_code: s.semester_code || '',
			semester_name: s.semester_name || '',
			semester_order: Number(s.semester_order) || 0,
		})),
		timestamp: Date.now(),
	}
	return structureCache
}

// MyJKKN answers a burst of parallel requests with transient 500s, so cohorts are
// fetched a few at a time.
const COHORT_CONCURRENCY = 4

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url)
	const institutionIds = (searchParams.get('institution_ids') || '').split(',').map(s => s.trim()).filter(Boolean)
	const programCode = (searchParams.get('program_code') || '').trim()
	const regulations = (searchParams.get('regulations') || '').split(',').map(s => s.trim()).filter(Boolean)

	if (institutionIds.length === 0 || !programCode) {
		return NextResponse.json(
			{ error: 'institution_ids and program_code are required', data: [], source: 'myjkkn' },
			{ status: 400 }
		)
	}

	try {
		const [{ programs, semesters }, regulationCodes] = await Promise.all([
			getProgramStructure(),
			getRegulationCodes().catch(e => {
				console.error('[active-semesters] regulation lookup failed:', e)
				return new Map<string, string>()
			}),
		])

		// MyJKKN files the program CODE under program_id; `id` is the UUID semesters point at.
		const allowedInstitutions = new Set(institutionIds)
		const programIds = new Set(
			programs
				.filter(p => (p.program_code || p.program_id) === programCode && allowedInstitutions.has(p.institution_id))
				.map(p => p.id as string)
		)
		const programSemesters = semesters
			.filter(s => programIds.has(s.program_id))
			.sort((a, b) => a.semester_order - b.semester_order || a.semester_code.localeCompare(b.semester_code))

		const data: Array<{
			semester_id: string
			semester_code: string
			semester_name: string
			total: number
			by_regulation: Record<string, number>
			unplaced: number
		}> = []

		for (let i = 0; i < programSemesters.length; i += COHORT_CONCURRENCY) {
			const batch = programSemesters.slice(i, i + COHORT_CONCURRENCY)
			const cohorts = await Promise.all(
				batch.map(s => fetchSemesterCohort(s.id, institutionIds, regulationCodes))
			)
			batch.forEach((s, index) => {
				const cohort = cohorts[index]
				const placements = placeCohortByRegulation(cohort, regulations)
				const byRegulation: Record<string, number> = {}
				for (const placement of placements.values()) {
					const key = regulationKey(placement.regulation_code)
					byRegulation[key] = (byRegulation[key] || 0) + 1
				}
				data.push({
					semester_id: s.id,
					semester_code: s.semester_code,
					semester_name: s.semester_name,
					total: cohort.length,
					by_regulation: byRegulation,
					unplaced: cohort.length - placements.size,
				})
			})
		}

		console.log(
			`[active-semesters] ${programCode}: ${programSemesters.length} semesters, ${data.filter(d => d.total > 0).length} with learners`
		)

		return NextResponse.json({ data, source: 'myjkkn' })
	} catch (e) {
		console.error('[active-semesters] unexpected error:', e)
		return NextResponse.json(
			{ error: 'Failed to fetch active semesters', data: [], source: 'myjkkn' },
			{ status: 500 }
		)
	}
}
