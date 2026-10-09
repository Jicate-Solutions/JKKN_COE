import { NextRequest, NextResponse } from 'next/server'
import { fetchMyJKKNLearnerProfiles, fetchMyJKKNRegulations } from '@/lib/myjkkn-api'
import { MYJKKN_MAX_PER_PAGE } from '@/lib/myjkkn-learner-enrichment'

/**
 * GET /api/exam-management/exam-registrations/bulk-create/eligible-learners
 *
 * Fast path for the bulk exam-registration page: asks MyJKKN for exactly one semester
 * cohort (semester_id is filtered server-side there) instead of paginating every
 * learner on the platform and filtering client-side.
 *
 * A semester_id is program-specific, but it is NOT regulation-specific: the same
 * semester row serves every regulation of a program (e.g. EEE Semester III under both
 * R-2021 and R-2025). Each learner is therefore returned with the regulation_code
 * MyJKKN records for them, so the page can keep only the selected regulation, and with
 * the admission_year it needs to place the learners MyJKKN records no regulation for.
 *
 * Query params:
 *  - institution_ids : comma-separated MyJKKN institution UUIDs (required)
 *  - semester_id     : MyJKKN semester UUID, as stored on course_mapping (required)
 *
 * Returns: { data: LearnerRow[], count, source: 'myjkkn' }
 * regulation_code is '' when MyJKKN has no regulation recorded for the learner.
 * The caller should fall back to the full MyJKKN sweep when count === 0.
 */

// Regulations change a few times a year; resolving id → code per request would add a
// MyJKKN round-trip to every cohort load.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const REGULATION_CACHE_TTL = 5 * 60 * 1000
let regulationCache: { codes: Map<string, string>; timestamp: number } | null = null

async function getRegulationCodes(): Promise<Map<string, string>> {
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

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url)
	const institutionIdsParam = searchParams.get('institution_ids') || ''
	const semesterId = searchParams.get('semester_id') || ''

	const institutionIds = institutionIdsParam
		.split(',')
		.map(s => s.trim())
		.filter(Boolean)

	if (institutionIds.length === 0 || !semesterId) {
		return NextResponse.json(
			{ error: 'institution_ids and semester_id are required', data: [], count: 0, source: 'myjkkn' },
			{ status: 400 }
		)
	}

	// The MyJKKN client only forwards a UUID semester_id; anything else would be sent
	// unfiltered and pull every learner on the platform just to match none of them.
	if (!UUID_PATTERN.test(semesterId)) {
		return NextResponse.json(
			{ error: 'semester_id must be a UUID', data: [], count: 0, source: 'myjkkn' },
			{ status: 400 }
		)
	}

	try {
		const fetchPage = (page: number) =>
			fetchMyJKKNLearnerProfiles({ semester_id: semesterId, page, limit: MYJKKN_MAX_PER_PAGE })

		const [firstPage, regulationCodes] = await Promise.all([
			fetchPage(1),
			// A regulation lookup failure must not block registration: learners then come
			// back with no regulation_code and the page places them by intake year.
			getRegulationCodes().catch(e => {
				console.error('[eligible-learners] regulation lookup failed:', e)
				return new Map<string, string>()
			}),
		])

		const learners: any[] = [...(firstPage.data || [])]
		const paginationInfo = (firstPage as any).metadata || (firstPage as any).pagination || {}
		const totalPages = paginationInfo.totalPages || 1
		if (totalPages > 1) {
			const rest = await Promise.all(
				Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(i + 2))
			)
			for (const res of rest) learners.push(...(res.data || []))
		}

		const allowedInstitutions = new Set(institutionIds)
		const seen = new Set<string>()
		const rows = learners
			.filter(l => {
				// Guard against MyJKKN ignoring the filter (it does for most other params).
				if (!l?.id || seen.has(l.id) || l.semester_id !== semesterId) return false
				if (l.institution_id && !allowedInstitutions.has(l.institution_id)) return false
				seen.add(l.id)
				return true
			})
			.map(l => ({
				id: l.id,
				stu_register_no: l.register_number || l.roll_number || '',
				student_name: `${l.first_name || ''} ${l.last_name || ''}`.trim(),
				student_photo_url: l.student_photo_url || '',
				regulation_code: (l.regulation_id && regulationCodes.get(l.regulation_id)) || '',
				admission_year: l.admission_year ?? null,
			}))

		rows.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no))

		console.log(
			`[eligible-learners] institutions=${institutionIds.length} semester_id=${semesterId} → ${rows.length} learners`
		)

		return NextResponse.json({ data: rows, count: rows.length, source: 'myjkkn' })
	} catch (e) {
		console.error('[eligible-learners] unexpected error:', e)
		return NextResponse.json(
			{ error: 'Failed to fetch learners', data: [], count: 0, source: 'myjkkn' },
			{ status: 500 }
		)
	}
}
