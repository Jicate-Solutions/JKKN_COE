import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

/**
 * GET /api/v1/boards
 *
 * Returns boards accessible by the API key.
 * If the key is scoped to specific institutions, only those boards are returned.
 *
 * Permission required: boards:read
 * Auth: X-API-Key-Id + X-API-Secret headers
 *
 * Query params:
 *   - institution_code  (optional) Filter by institution code (e.g., "CAS")
 *   - institutions_id   (optional) Filter by institution UUID
 *   - board_code        (optional) Filter by board code (e.g., "MKU")
 *   - board_type        (optional) Filter by board type
 *   - is_active         (optional) "true" | "false"
 */
export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionCode = searchParams.get('institution_code')
		const institutionsId = searchParams.get('institutions_id')
		const boardCode = searchParams.get('board_code')
		const boardType = searchParams.get('board_type')
		const isActive = searchParams.get('is_active')

		let query = supabase
			.from('board')
			.select('id, institutions_id, institution_code, board_code, board_name, display_name, board_type, board_order, status, created_at, updated_at', { count: 'exact' })
			.order('board_order', { ascending: true, nullsFirst: false })
			.order('board_name', { ascending: true })
			.range(0, 9999)

		// Scope to allowed institutions if key is restricted
		if (context.allowedInstitutionIds && context.allowedInstitutionIds.length > 0) {
			query = query.in('institutions_id', context.allowedInstitutionIds)
		}

		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		} else if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		if (boardCode) {
			query = query.eq('board_code', boardCode)
		}
		if (boardType) {
			query = query.eq('board_type', boardType)
		}
		if (isActive !== null) {
			query = query.eq('status', isActive === 'true')
		}

		const { data, error, count } = await query

		if (error) {
			console.error('Error fetching boards:', error)
			return NextResponse.json({ error: 'Failed to fetch boards' }, { status: 500 })
		}

		const boards = (data || []).map((row: any) => ({
			...row,
			is_active: row.status ?? true,
		}))

		return NextResponse.json({ data: boards, total: count ?? boards.length })
	} catch (error) {
		console.error('Boards GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

/**
 * POST /api/v1/boards
 *
 * Create a new board.
 *
 * Permission required: boards:create
 * Auth: X-API-Key-Id + X-API-Secret headers
 *
 * Body (JSON):
 *   - institution_code  (required) Institution code
 *   - board_code        (required) Unique board code within institution
 *   - board_name        (required) Full board name
 *   - display_name      (optional)
 *   - board_type        (optional) e.g. "University", "Autonomous"
 *   - board_order       (optional) Sort order integer
 *   - is_active         (optional, default true)
 */
export const POST = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		if (!body.institution_code) {
			return NextResponse.json({ error: 'institution_code is required' }, { status: 400 })
		}
		if (!body.board_code?.trim()) {
			return NextResponse.json({ error: 'board_code is required' }, { status: 400 })
		}
		if (!body.board_name?.trim()) {
			return NextResponse.json({ error: 'board_name is required' }, { status: 400 })
		}

		// Resolve institution
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id, institution_code')
			.eq('institution_code', body.institution_code)
			.maybeSingle()

		if (instError || !institution) {
			return NextResponse.json({
				error: `Institution with code "${body.institution_code}" not found`
			}, { status: 400 })
		}

		// Check institution access
		if (context.allowedInstitutionIds && context.allowedInstitutionIds.length > 0) {
			if (!context.allowedInstitutionIds.includes(institution.id)) {
				return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
			}
		}

		const { data, error } = await supabase
			.from('board')
			.insert({
				institutions_id: institution.id,
				institution_code: institution.institution_code,
				board_code: body.board_code.trim(),
				board_name: body.board_name.trim(),
				display_name: body.display_name || null,
				board_type: body.board_type || null,
				board_order: body.board_order ?? null,
				status: body.is_active !== undefined ? Boolean(body.is_active) : true,
			})
			.select()
			.single()

		if (error) {
			console.error('Error creating board:', error)
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'A board with this code already exists for the institution'
				}, { status: 409 })
			}
			if (error.code === '23503') {
				return NextResponse.json({ error: 'Invalid institution reference' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to create board' }, { status: 500 })
		}

		return NextResponse.json({
			data: { ...data, is_active: (data as any).status ?? true }
		}, { status: 201 })
	} catch (error) {
		console.error('Boards POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

/**
 * PUT /api/v1/boards?id=<uuid>
 *
 * Update an existing board.
 *
 * Permission required: boards:update
 * Auth: X-API-Key-Id + X-API-Secret headers
 */
export const PUT = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
		}

		const body = await request.json()

		// Verify the board belongs to an allowed institution
		if (context.allowedInstitutionIds && context.allowedInstitutionIds.length > 0) {
			const { data: existing } = await supabase
				.from('board')
				.select('institutions_id')
				.eq('id', id)
				.maybeSingle()

			if (!existing || !context.allowedInstitutionIds.includes(existing.institutions_id)) {
				return NextResponse.json({ error: 'Access denied for this board' }, { status: 403 })
			}
		}

		const updatePayload: Record<string, unknown> = {}
		if (body.board_code !== undefined) updatePayload.board_code = body.board_code
		if (body.board_name !== undefined) updatePayload.board_name = body.board_name
		if (body.display_name !== undefined) updatePayload.display_name = body.display_name || null
		if (body.board_type !== undefined) updatePayload.board_type = body.board_type || null
		if (body.board_order !== undefined) updatePayload.board_order = body.board_order
		if (body.is_active !== undefined) updatePayload.status = Boolean(body.is_active)

		if (Object.keys(updatePayload).length === 0) {
			return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('board')
			.update(updatePayload)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('Error updating board:', error)
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'A board with this code already exists for the institution'
				}, { status: 409 })
			}
			return NextResponse.json({ error: 'Failed to update board' }, { status: 500 })
		}

		return NextResponse.json({
			data: { ...data, is_active: (data as any).status ?? true }
		})
	} catch (error) {
		console.error('Boards PUT error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

/**
 * DELETE /api/v1/boards?id=<uuid>
 *
 * Delete a board by ID.
 *
 * Permission required: boards:delete
 * Auth: X-API-Key-Id + X-API-Secret headers
 */
export const DELETE = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
		}

		// Verify institution access
		if (context.allowedInstitutionIds && context.allowedInstitutionIds.length > 0) {
			const { data: existing } = await supabase
				.from('board')
				.select('institutions_id')
				.eq('id', id)
				.maybeSingle()

			if (!existing || !context.allowedInstitutionIds.includes(existing.institutions_id)) {
				return NextResponse.json({ error: 'Access denied for this board' }, { status: 403 })
			}
		}

		const { error } = await supabase
			.from('board')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting board:', error)
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Cannot delete: this board is referenced by other records'
				}, { status: 409 })
			}
			return NextResponse.json({ error: 'Failed to delete board' }, { status: 500 })
		}

		return NextResponse.json({ data: { id, deleted: true } })
	} catch (error) {
		console.error('Boards DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})
