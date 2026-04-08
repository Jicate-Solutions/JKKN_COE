import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

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
 *   - limit (optional): Max records (default 5000, max 10000)
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
	const limit = Math.min(Number(searchParams.get('limit')) || 5000, 10000)

	if (!institutionsId || !sessionId) {
		return NextResponse.json({ error: 'institutions_id and examination_session_id are required' }, { status: 400 })
	}

	// Verify institution access
	if (ctx.allowedInstitutionIds.length > 0 && !ctx.allowedInstitutionIds.includes(institutionsId)) {
		return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
	}

	let query = supabase
		.from('exam_registrations')
		.select('id, institutions_id, institution_code, examination_session_id, session_code, course_offering_id, course_code, program_code, student_id, stu_register_no, student_name, is_regular, attempt_number, registration_status, fee_paid')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.order('stu_register_no')

	if (programCode) query = query.eq('program_code', programCode)
	if (courseCode) query = query.eq('course_code', courseCode)
	if (courseOfferingId) query = query.eq('course_offering_id', courseOfferingId)
	if (isRegular === 'true') query = query.eq('is_regular', true)
	if (isRegular === 'false') query = query.eq('is_regular', false)

	const { data, error } = await query.range(0, limit - 1)

	if (error) {
		console.error('Error fetching registrations:', error)
		return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
	}

	return NextResponse.json({ data: data || [], total: data?.length || 0 })
})

export const POST = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const body = await request.json()

	if (body.institutions_id && ctx.allowedInstitutionIds.length > 0 && !ctx.allowedInstitutionIds.includes(body.institutions_id)) {
		return NextResponse.json({ error: 'Forbidden', message: 'Cannot create registration for this institution' }, { status: 403 })
	}

	const { data, error } = await supabase
		.from('exam_registrations')
		.insert(body)
		.select()
		.single()

	if (error) {
		if (error.code === '23505') return NextResponse.json({ error: 'Registration already exists' }, { status: 400 })
		if (error.code === '23503') return NextResponse.json({ error: 'Invalid reference' }, { status: 400 })
		return NextResponse.json({ error: 'Failed to create registration' }, { status: 500 })
	}

	return NextResponse.json({ data }, { status: 201 })
})
