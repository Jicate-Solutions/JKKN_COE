import { NextRequest, NextResponse } from 'next/server'
import { fetchMyJKKNLearnerProfiles, MyJKKNApiError } from '@/lib/myjkkn-api'
import {
	MYJKKN_MAX_PER_PAGE,
	enrichLearnerData,
	fetchLookupData,
} from '@/lib/myjkkn-learner-enrichment'
import type { LearnerDirectoryRow } from '@/types/learner-directory'

/**
 * GET /api/myjkkn/learner-profiles/directory
 *
 * The whole MyJKKN learner roster in one response, for the Learner Directory
 * page (/users/learners-myjkkn).
 *
 * Why a full sweep instead of server-side paging:
 *  - The page's Lifecycle Status / Program / Semester dropdowns must list every
 *    value that exists, not just the values that happen to land on page 1.
 *  - MyJKKN's `institution_id` / `program_code` / `register_number` filters are
 *    unreliable, so the working pattern is "sweep once, match client-side".
 *  - MyJKKN hard-caps every page at 200 rows regardless of `limit`, and 500s
 *    when asked for a page past `metadata.totalPages`.
 *  - `lifecycle_status=all` is required, or the endpoint silently omits every
 *    non-active learner — which is exactly the set the status filter exists for.
 *
 * The sweep is memoised process-wide for TTL_MS so paging/sorting/searching on
 * the page costs nothing, and `?refresh=true` forces a fresh one.
 *
 * Query params:
 *   institution_code  restrict to one institution (applied after enrichment)
 *   refresh=true      bypass and rebuild the cache
 */

const PAGE_CONCURRENCY = 8
const MAX_PAGES = 500
const TTL_MS = 5 * 60 * 1000       // a complete sweep is good for 5 minutes
const PARTIAL_TTL_MS = 60 * 1000   // an incomplete sweep is retried sooner

interface SweepResult {
	rows: LearnerDirectoryRow[]
	fetchedAt: number
	complete: boolean
}

let cached: SweepResult | null = null
let inflight: Promise<SweepResult> | null = null

const str = (v: unknown): string => (v == null ? '' : String(v))
const num = (v: unknown): number | null => {
	if (v == null || v === '') return null
	const n = Number(v)
	return Number.isFinite(n) ? n : null
}

/** Project an enriched profile down to the fields the directory renders/exports. */
function toDirectoryRow(learner: unknown): LearnerDirectoryRow {
	const l = learner as Record<string, unknown>
	return {
		id: str(l.id),
		register_number: str(l.register_number),
		roll_number: str(l.roll_number),
		learner_name: str(l.learner_name),
		first_name: str(l.first_name),
		middle_name: str(l.middle_name),
		last_name: str(l.last_name),
		email: str(l.email),
		phone: str(l.phone),
		date_of_birth: str(l.date_of_birth),
		gender: str(l.gender),
		institution_id: str(l.institution_id),
		institution_code: str(l.institution_code),
		institution_name: str(l.institution_name),
		program_id: str(l.program_id),
		program_code: str(l.program_code),
		program_name: str(l.program_name),
		department_code: str(l.department_code),
		department_name: str(l.department_name),
		batch_id: str(l.batch_id),
		batch_name: str(l.batch_name),
		semester_id: str(l.semester_id),
		semester_code: str(l.semester_code),
		current_semester: num(l.current_semester),
		admission_year: num(l.admission_year),
		lifecycle_status: str(l.lifecycle_status).toLowerCase(),
		is_active: Boolean(l.is_active),
		student_photo_url: str(l.student_photo_url),
		father_name: str(l.father_name),
		mother_name: str(l.mother_name),
		guardian_name: str(l.guardian_name),
		address: str(l.address || l.permanent_address_street),
		city: str(l.city || l.permanent_address_district),
		state: str(l.state || l.permanent_address_state),
		country: str(l.country),
		pincode: str(l.pincode || l.permanent_address_pincode),
		aadhar_number: str(l.aadhar_number),
		abc_id: str(l.abc_id),
	}
}

/** One pass over every page of learners/profiles, across all lifecycle states. */
async function sweepAllProfiles(): Promise<SweepResult> {
	const startedAt = Date.now()
	// lifecycle_status=all is what makes alumni / discontinued learners visible.
	const baseOptions = { lifecycle_status: 'all', limit: MYJKKN_MAX_PER_PAGE }

	const [lookups, firstPage] = await Promise.all([
		fetchLookupData(),
		fetchMyJKKNLearnerProfiles({ ...baseOptions, page: 1 }),
	])

	const raw: unknown[] = [...(firstPage.data || [])]
	const info = (firstPage as any).metadata || (firstPage as any).pagination || {}
	const reportedTotal = info.total ?? null
	const totalPages = Math.min(
		info.totalPages || (reportedTotal ? Math.ceil(reportedTotal / MYJKKN_MAX_PER_PAGE) : 1) || 1,
		MAX_PAGES
	)

	// Stop AT totalPages — requesting past it is what makes MyJKKN return 500s.
	let complete = true
	for (let start = 2; start <= totalPages; start += PAGE_CONCURRENCY) {
		const pages: number[] = []
		for (let p = start; p < start + PAGE_CONCURRENCY && p <= totalPages; p++) pages.push(p)

		const results = await Promise.all(
			pages.map(async (page) => {
				try {
					const res = await fetchMyJKKNLearnerProfiles({ ...baseOptions, page })
					return res.data || []
				} catch (err) {
					console.error(`[Learner Directory] page ${page} failed:`, err)
					return null
				}
			})
		)

		for (const rows of results) {
			// null = that page errored; keep the rest rather than losing the sweep.
			if (rows === null) { complete = false; continue }
			raw.push(...rows)
		}
	}

	const rows = (enrichLearnerData(raw, lookups) as unknown[]).map(toDirectoryRow)

	console.log(
		`[Learner Directory] Swept ${rows.length} learner profiles across ${totalPages} page(s) ` +
		`in ${Date.now() - startedAt}ms (complete=${complete})`
	)

	return { rows, fetchedAt: Date.now(), complete }
}

/** The sweep, at most once per TTL per process; concurrent callers share one. */
async function getSweep(forceRefresh: boolean): Promise<SweepResult> {
	if (!forceRefresh && cached) {
		const ttl = cached.complete ? TTL_MS : PARTIAL_TTL_MS
		if (Date.now() - cached.fetchedAt < ttl) return cached
	}
	if (inflight) return inflight

	inflight = sweepAllProfiles()
		.then((result) => { cached = result; return result })
		.finally(() => { inflight = null })

	return inflight
}

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url)
	const institutionCode = searchParams.get('institution_code')
	const forceRefresh = searchParams.get('refresh') === 'true'

	try {
		const wasCached = !forceRefresh
			&& cached !== null
			&& Date.now() - cached.fetchedAt < (cached.complete ? TTL_MS : PARTIAL_TTL_MS)

		const sweep = await getSweep(forceRefresh)

		// MyJKKN ignores its own institution filter, so scope here instead. The
		// page also re-checks client-side; this keeps the payload proportional.
		const data = institutionCode
			? sweep.rows.filter(r => r.institution_code === institutionCode)
			: sweep.rows

		return NextResponse.json({
			data,
			metadata: {
				total: data.length,
				totalAll: sweep.rows.length,
				fetchedAt: sweep.fetchedAt,
				complete: sweep.complete,
				cached: wasCached,
			},
		})
	} catch (error) {
		console.error('[Learner Directory] Sweep failed:', error)
		if (error instanceof MyJKKNApiError) {
			return NextResponse.json(
				{ error: error.message, status: error.status, details: error.details },
				{ status: error.status }
			)
		}
		return NextResponse.json(
			{ error: 'Failed to fetch learner profiles from MyJKKN' },
			{ status: 500 }
		)
	}
}
