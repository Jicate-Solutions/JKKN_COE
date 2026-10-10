import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { fetchBatchedIn } from '@/lib/exam-clash'

const PAGE_SIZE = 1000

/**
 * GET /api/v1/registrations
 *
 * Returns exam registrations with filters.
 *
 * Permission required: registrations:read
 * Auth: X-API-Key-Id + X-API-Secret headers
 *
 * Query params:
 *   - institutions_id (required): COE institution UUID
 *   - examination_session_id (required): Exam session UUID
 *   - program_code (optional): Filter by program (e.g., "UEN")
 *   - course_code (optional): Filter by course code
 *   - course_offering_id (optional): Filter by course offering
 *   - is_regular (optional): "true" or "false"
 *   - semester (optional): Only registrations whose course offering is in this semester
 *   - limit (optional): Max records (default 5000, max 10000)
 *
 * Each row also carries, from its course offering: semester, semester_code,
 * course_id, course_name, regulation_code. `course_code` stays the registration's
 * own value; where it differs from the offering's course, `course_id` is right.
 *
 * Response: { data, total, has_more } — `has_more` is true when `limit` cut the result.
 */
export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const institutionsId = searchParams.get('institutions_id')
	const sessionId = searchParams.get('examination_session_id')
	const programCode = searchParams.get('program_code')
	const courseCode = searchParams.get('course_code')
	const courseOfferingId = searchParams.get('course_offering_id')
	const isRegular = searchParams.get('is_regular')
	const semesterParam = searchParams.get('semester')
	const limit = Math.min(Number(searchParams.get('limit')) || 5000, 10000)

	if (!institutionsId || !sessionId) {
		return NextResponse.json({ error: 'institutions_id and examination_session_id are required' }, { status: 400 })
	}

	const semester = semesterParam ? Number(semesterParam) : null
	if (semester != null && !Number.isInteger(semester)) {
		return NextResponse.json({ error: 'semester must be a number' }, { status: 400 })
	}

	// Verify institution access
	if (ctx.allowedInstitutionIds.length > 0 && !ctx.allowedInstitutionIds.includes(institutionsId)) {
		return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
	}

	const registrationsPage = (from: number, to: number) => {
		let query = supabase
			.from('exam_registrations')
			.select('id, institutions_id, institution_code, examination_session_id, session_code, course_offering_id, course_code, program_code, student_id, stu_register_no, student_name, is_regular, attempt_number, registration_status, fee_paid')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.order('stu_register_no')
			.order('id')

		if (programCode) query = query.eq('program_code', programCode)
		if (courseCode) query = query.eq('course_code', courseCode)
		if (courseOfferingId) query = query.eq('course_offering_id', courseOfferingId)
		if (isRegular === 'true') query = query.eq('is_regular', true)
		if (isRegular === 'false') query = query.eq('is_regular', false)

		return query.range(from, to)
	}

	try {
		// The database returns at most PAGE_SIZE rows per request whatever the range, so
		// one .range(0, limit - 1) silently dropped everything past row 1,000. Read in
		// pages; one row past `limit` is enough to know the limit cut the result. The
		// semester lives on the offering, so a semester filter has to see every row first.
		const stopAt = semester != null ? Infinity : limit + 1
		let rows: any[] = []
		for (let from = 0; rows.length < stopAt; from += PAGE_SIZE) {
			const { data, error } = await registrationsPage(from, from + PAGE_SIZE - 1)
			if (error) throw error
			rows.push(...(data || []))
			if (!data || data.length < PAGE_SIZE) break
		}

		const offerings = await fetchBatchedIn(
			[...new Set(rows.map(r => r.course_offering_id).filter(Boolean))],
			async batch => await supabase
				.from('course_offerings')
				.select('id, semester, semester_code, course_id, course_mapping_id')
				.in('id', batch)
		)
		const offeringById = new Map<string, any>(offerings.map(o => [o.id, o]))

		if (semester != null) {
			rows = rows.filter(r => offeringById.get(r.course_offering_id)?.semester === semester)
		}

		const hasMore = rows.length > limit
		if (hasMore) rows = rows.slice(0, limit)

		const listedOfferings = [...new Set(rows.map(r => r.course_offering_id))]
			.map(id => offeringById.get(id))
			.filter(Boolean)

		const courses = await fetchBatchedIn(
			[...new Set(listedOfferings.map(o => o.course_id).filter(Boolean))],
			async batch => await supabase.from('courses').select('id, course_name').in('id', batch)
		)
		const courseNameById = new Map<string, string>(courses.map(c => [c.id, c.course_name]))

		const mappings = await fetchBatchedIn(
			[...new Set(listedOfferings.map(o => o.course_mapping_id).filter(Boolean))],
			async batch => await supabase.from('course_mapping').select('id, regulation_code').in('id', batch)
		)
		const regulationByMappingId = new Map<string, string | null>(mappings.map(m => [m.id, m.regulation_code]))

		const data = rows.map(r => {
			const offering = offeringById.get(r.course_offering_id)
			return {
				...r,
				semester: offering?.semester ?? null,
				semester_code: offering?.semester_code ?? null,
				course_id: offering?.course_id ?? null,
				course_name: courseNameById.get(offering?.course_id) ?? null,
				regulation_code: regulationByMappingId.get(offering?.course_mapping_id) ?? null,
			}
		})

		return NextResponse.json({ data, total: data.length, has_more: hasMore })
	} catch (error) {
		console.error('Error fetching registrations:', error)
		return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
	}
})

export const POST = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const body = await request.json()

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 })
	}

	if (!body.institutions_id || typeof body.institutions_id !== 'string') {
		return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
	}

	if (ctx.allowedInstitutionIds.length > 0 && !ctx.allowedInstitutionIds.includes(body.institutions_id)) {
		return NextResponse.json({ error: 'Forbidden', message: 'Cannot create registration for this institution' }, { status: 403 })
	}

	// Row identity and timestamps belong to the database. Status and fee fields
	// are left to the caller on purpose: dropping `registration_status` would
	// not make a row safer, it would fall back to the column default (Approved).
	const insertRow: Record<string, unknown> = { ...body }
	for (const field of ['id', 'created_at', 'updated_at']) {
		delete insertRow[field]
	}

	const { data, error } = await supabase
		.from('exam_registrations')
		.insert(insertRow)
		.select()
		.single()

	if (error) {
		if (error.code === '23505') return NextResponse.json({ error: 'Registration already exists' }, { status: 400 })
		if (error.code === '23503') return NextResponse.json({ error: 'Invalid reference' }, { status: 400 })
		return NextResponse.json({ error: 'Failed to create registration' }, { status: 500 })
	}

	return NextResponse.json({ data }, { status: 201 })
})
