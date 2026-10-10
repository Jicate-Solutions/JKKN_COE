import { NextRequest, NextResponse } from 'next/server'
import { UUID_PATTERN, fetchSemesterCohort, getRegulationCodes } from '@/lib/myjkkn-semester-cohort'

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
 *  - semester_ids    : comma-separated MyJKKN semester UUIDs (required). More than one
 *                      when the COE institution spans two MyJKKN institutions that each
 *                      hold their own row for the same program semester. `semester_id`
 *                      (a single UUID) is still accepted.
 *
 * Returns: { data: LearnerRow[], count, source: 'myjkkn' }
 * regulation_code is '' when MyJKKN has no regulation recorded for the learner.
 * The caller should fall back to the full MyJKKN sweep when count === 0.
 */
export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url)
	const institutionIds = (searchParams.get('institution_ids') || '')
		.split(',')
		.map(s => s.trim())
		.filter(Boolean)
	const semesterIds = [...new Set(
		`${searchParams.get('semester_ids') || ''},${searchParams.get('semester_id') || ''}`
			.split(',')
			.map(s => s.trim())
			.filter(Boolean)
	)]

	if (institutionIds.length === 0 || semesterIds.length === 0) {
		return NextResponse.json(
			{ error: 'institution_ids and semester_ids are required', data: [], count: 0, source: 'myjkkn' },
			{ status: 400 }
		)
	}

	// The MyJKKN client only forwards a UUID semester_id; anything else would be sent
	// unfiltered and pull every learner on the platform just to match none of them.
	if (semesterIds.some(id => !UUID_PATTERN.test(id))) {
		return NextResponse.json(
			{ error: 'semester_ids must be UUIDs', data: [], count: 0, source: 'myjkkn' },
			{ status: 400 }
		)
	}

	try {
		// A regulation lookup failure must not block registration: learners then come
		// back with no regulation_code and the page places them by intake year.
		const regulationCodes = await getRegulationCodes().catch(e => {
			console.error('[eligible-learners] regulation lookup failed:', e)
			return new Map<string, string>()
		})

		const cohorts = await Promise.all(
			semesterIds.map(id => fetchSemesterCohort(id, institutionIds, regulationCodes))
		)

		const seen = new Set<string>()
		const rows = cohorts
			.flat()
			.filter(l => !seen.has(l.id) && seen.add(l.id))
			.map(l => ({
				id: l.id,
				stu_register_no: l.stu_register_no,
				student_name: l.student_name,
				student_photo_url: l.student_photo_url,
				regulation_code: l.regulation_code,
				admission_year: l.admission_year,
			}))

		rows.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no))

		console.log(
			`[eligible-learners] institutions=${institutionIds.length} semesters=${semesterIds.length} → ${rows.length} learners`
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
