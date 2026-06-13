import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/exam-management/exam-registrations/bulk-create/eligible-learners
 *
 * Fast path for the bulk exam-registration page: returns exactly the learners for a
 * program + semester by querying the local `learners_profiles` mirror with indexed
 * filters, instead of paginating all ~thousands of institution learners from the
 * MyJKKN API and filtering client-side.
 *
 * A semester_id is program-specific (the COE `semesters` row encodes program + term),
 * so `institution_id IN (...) AND semester_id = X` uniquely identifies the cohort.
 * program_code is accepted as an optional safety filter.
 *
 * Query params:
 *  - institution_ids : comma-separated MyJKKN institution UUIDs (required)
 *  - semester_id     : COE semester UUID (required)
 *  - program_code    : optional, narrows to a single program when resolvable
 *
 * Returns: { data: LearnerRow[], count, source: 'mirror' }
 * The caller should fall back to the live MyJKKN fetch when count === 0 (stale/empty mirror).
 */
export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url)
	const institutionIdsParam = searchParams.get('institution_ids') || ''
	const semesterId = searchParams.get('semester_id') || ''
	const programCode = searchParams.get('program_code') || ''

	const institutionIds = institutionIdsParam
		.split(',')
		.map(s => s.trim())
		.filter(Boolean)

	if (institutionIds.length === 0 || !semesterId) {
		return NextResponse.json(
			{ error: 'institution_ids and semester_id are required', data: [], count: 0, source: 'mirror' },
			{ status: 400 }
		)
	}

	try {
		const supabase = getSupabaseServer()

		// Optionally resolve program_code -> program_id for an extra safety filter.
		// semester_id alone is already program-specific, so this is belt-and-suspenders.
		let programId: string | null = null
		if (programCode) {
			const { data: prog } = await supabase
				.from('programs')
				.select('id, program_code, institution_id')
				.eq('program_code', programCode)
				.in('institution_id', institutionIds)
				.limit(1)
				.maybeSingle()
			programId = prog?.id || null
		}

		let query = supabase
			.from('learners_profiles')
			.select('id, register_number, roll_number, first_name, last_name, student_photo_url', { count: 'exact' })
			.in('institution_id', institutionIds)
			.eq('semester_id', semesterId)
			.range(0, 9999)

		if (programId) query = query.eq('program_id', programId)

		const { data, error, count } = await query

		if (error) {
			console.error('[eligible-learners] query error:', error.message)
			return NextResponse.json(
				{ error: 'Failed to fetch learners', data: [], count: 0, source: 'mirror' },
				{ status: 500 }
			)
		}

		const rows = (data || []).map((l: any) => ({
			id: l.id,
			stu_register_no: l.register_number || l.roll_number || '',
			student_name: `${l.first_name || ''} ${l.last_name || ''}`.trim(),
			student_photo_url: l.student_photo_url || '',
		}))

		rows.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no))

		console.log(
			`[eligible-learners] institutions=${institutionIds.length} semester_id=${semesterId} programId=${programId || '-'} → ${rows.length} learners`
		)

		return NextResponse.json({ data: rows, count: count ?? rows.length, source: 'mirror' })
	} catch (e) {
		console.error('[eligible-learners] unexpected error:', e)
		return NextResponse.json(
			{ error: 'Internal server error', data: [], count: 0, source: 'mirror' },
			{ status: 500 }
		)
	}
}
