import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/fee-config
// Fetch revaluation fee configurations
// =====================================================
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Extract filters
		const institutionCode = searchParams.get('institution_code')
		const institutionsId = searchParams.get('institutions_id')
		const isActive = searchParams.get('is_active')

		// Build query
		let query = supabase.from('revaluation_fee_config').select('*')

		// Institution filter
		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		} else if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		// Active filter
		if (isActive !== null) {
			query = query.eq('is_active', isActive === 'true')
		}

		// Order by effective_from descending
		query = query.order('effective_from', { ascending: false })

		// Override default row limit
		const { data, error } = await query.range(0, 9999)

		if (error) {
			console.error('[Fee Config GET] Error:', error)
			return NextResponse.json({ error: 'Failed to fetch fee configurations' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('[Fee Config GET] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =====================================================
// POST /api/revaluation/fee-config
// Create revaluation fee configuration
// =====================================================
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		// Validate required fields
		if (!body.institutions_id) {
			return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
		}

		if (
			body.attempt_1_fee === undefined ||
			body.attempt_2_fee === undefined ||
			body.attempt_3_fee === undefined
		) {
			return NextResponse.json({ error: 'All attempt fees are required' }, { status: 400 })
		}

		if (!body.effective_from) {
			return NextResponse.json({ error: 'Effective from date is required' }, { status: 400 })
		}

		// Validate fee amounts
		const attempt1 = Number(body.attempt_1_fee)
		const attempt2 = Number(body.attempt_2_fee)
		const attempt3 = Number(body.attempt_3_fee)

		if (attempt1 < 0 || attempt2 < 0 || attempt3 < 0) {
			return NextResponse.json({ error: 'Fee amounts must be non-negative' }, { status: 400 })
		}

		// Fetch institution details for code
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('institution_code')
			.eq('id', body.institutions_id)
			.single()

		if (instError || !institution) {
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		// If setting as active, deactivate other configs for this institution
		if (body.is_active) {
			await supabase
				.from('revaluation_fee_config')
				.update({ is_active: false })
				.eq('institutions_id', body.institutions_id)
				.eq('is_active', true)
		}

		// Create fee configuration
		const { data, error } = await supabase
			.from('revaluation_fee_config')
			.insert({
				institutions_id: body.institutions_id,
				institution_code: institution.institution_code,
				attempt_1_fee: attempt1,
				attempt_2_fee: attempt2,
				attempt_3_fee: attempt3,
				theory_course_fee: body.theory_course_fee ? Number(body.theory_course_fee) : null,
				practical_course_fee: body.practical_course_fee ? Number(body.practical_course_fee) : null,
				project_course_fee: body.project_course_fee ? Number(body.project_course_fee) : null,
				effective_from: body.effective_from,
				effective_to: body.effective_to || null,
				is_active: body.is_active ?? true,
				created_by: body.created_by_user_id || null,
			})
			.select()
			.single()

		if (error) {
			console.error('[Fee Config POST] Error:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'Fee configuration already exists' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to create fee configuration' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('[Fee Config POST] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =====================================================
// PUT /api/revaluation/fee-config
// Update revaluation fee configuration
// =====================================================
export async function PUT(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		if (!body.id) {
			return NextResponse.json({ error: 'Configuration ID is required' }, { status: 400 })
		}

		// Build update payload
		const updatePayload: any = {}

		if (body.attempt_1_fee !== undefined) updatePayload.attempt_1_fee = Number(body.attempt_1_fee)
		if (body.attempt_2_fee !== undefined) updatePayload.attempt_2_fee = Number(body.attempt_2_fee)
		if (body.attempt_3_fee !== undefined) updatePayload.attempt_3_fee = Number(body.attempt_3_fee)
		if (body.theory_course_fee !== undefined)
			updatePayload.theory_course_fee = body.theory_course_fee ? Number(body.theory_course_fee) : null
		if (body.practical_course_fee !== undefined)
			updatePayload.practical_course_fee = body.practical_course_fee
				? Number(body.practical_course_fee)
				: null
		if (body.project_course_fee !== undefined)
			updatePayload.project_course_fee = body.project_course_fee
				? Number(body.project_course_fee)
				: null
		if (body.effective_from) updatePayload.effective_from = body.effective_from
		if (body.effective_to !== undefined) updatePayload.effective_to = body.effective_to || null
		if (body.is_active !== undefined) {
			updatePayload.is_active = body.is_active

			// If activating, deactivate others for same institution
			if (body.is_active) {
				const { data: currentConfig } = await supabase
					.from('revaluation_fee_config')
					.select('institutions_id')
					.eq('id', body.id)
					.single()

				if (currentConfig) {
					await supabase
						.from('revaluation_fee_config')
						.update({ is_active: false })
						.eq('institutions_id', currentConfig.institutions_id)
						.eq('is_active', true)
						.neq('id', body.id)
				}
			}
		}

		updatePayload.updated_at = new Date().toISOString()
		if (body.updated_by_user_id) {
			updatePayload.updated_by = body.updated_by_user_id
		}

		// Update record
		const { data, error } = await supabase
			.from('revaluation_fee_config')
			.update(updatePayload)
			.eq('id', body.id)
			.select()
			.single()

		if (error) {
			console.error('[Fee Config PUT] Error:', error)
			return NextResponse.json({ error: 'Failed to update fee configuration' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('[Fee Config PUT] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =====================================================
// DELETE /api/revaluation/fee-config
// Delete revaluation fee configuration
// =====================================================
export async function DELETE(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Configuration ID is required' }, { status: 400 })
		}

		// Check if config is in use
		const { data: inUse } = await supabase
			.from('revaluation_registrations')
			.select('id')
			.limit(1)

		// If any revaluations exist, prevent deletion of fee config
		if (inUse && inUse.length > 0) {
			return NextResponse.json(
				{ error: 'Cannot delete - fee configuration may be in use' },
				{ status: 400 }
			)
		}

		const { error } = await supabase.from('revaluation_fee_config').delete().eq('id', id)

		if (error) {
			console.error('[Fee Config DELETE] Error:', error)
			if (error.code === '23503') {
				return NextResponse.json(
					{ error: 'Cannot delete - configuration is in use' },
					{ status: 400 }
				)
			}
			return NextResponse.json({ error: 'Failed to delete fee configuration' }, { status: 500 })
		}

		return NextResponse.json({ success: true, message: 'Fee configuration deleted' })
	} catch (error) {
		console.error('[Fee Config DELETE] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
