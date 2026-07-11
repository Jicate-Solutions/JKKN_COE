import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * BoS TA/DA Rates API — rate master per institution + expert category.
 * The /bos/ta-da-rates page (super_admin only) is the sole consumer.
 */

const VALID_CATEGORIES = ['university_nominee', 'subject_expert', 'industry_expert', 'alumni', 'all']

function validateRatePayload(body: any): string | null {
	if (!body.institutions_id) return 'institutions_id is required'
	if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
		return `category must be one of: ${VALID_CATEGORIES.join(', ')}`
	}
	if (!body.effective_from) return 'effective_from is required'
	for (const field of ['honorarium_amount', 'da_rate_per_day', 'ta_rate_per_km']) {
		const value = Number(body[field] ?? 0)
		if (isNaN(value) || value < 0) return `${field} must be a non-negative number`
	}
	if (body.max_travel_amount !== null && body.max_travel_amount !== undefined && body.max_travel_amount !== '') {
		const cap = Number(body.max_travel_amount)
		if (isNaN(cap) || cap < 0) return 'max_travel_amount must be a non-negative number'
	}
	if (body.effective_to && body.effective_to < body.effective_from) {
		return 'effective_to must be on or after effective_from'
	}
	return null
}

function buildRateRecord(body: any) {
	return {
		institutions_id: body.institutions_id,
		category: body.category,
		honorarium_amount: Number(body.honorarium_amount ?? 0),
		da_rate_per_day: Number(body.da_rate_per_day ?? 0),
		ta_rate_per_km: Number(body.ta_rate_per_km ?? 0),
		max_travel_amount: body.max_travel_amount === null || body.max_travel_amount === undefined || body.max_travel_amount === ''
			? null
			: Number(body.max_travel_amount),
		effective_from: body.effective_from,
		effective_to: body.effective_to || null,
		is_active: body.is_active !== false,
		notes: body.notes || null
	}
}

/** GET /api/bos/ta-da-rates?institutionId= — list rates for an institution */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutionId')

		if (!institutionId) {
			return NextResponse.json({ error: 'institutionId is required' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('bos_ta_da_rates')
			.select('*')
			.eq('institutions_id', institutionId)
			.order('category')
			.order('effective_from', { ascending: false })
			.range(0, 9999)

		if (error) {
			console.error('[BoS TA/DA Rates] GET error:', error)
			return NextResponse.json({ error: 'Failed to fetch TA/DA rates' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('[BoS TA/DA Rates] GET exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/** POST /api/bos/ta-da-rates — create a rate */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const validationError = validateRatePayload(body)
		if (validationError) {
			return NextResponse.json({ error: validationError }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('bos_ta_da_rates')
			.insert({
				...buildRateRecord(body),
				created_by: body.created_by || null
			})
			.select()
			.single()

		if (error) {
			console.error('[BoS TA/DA Rates] POST error:', error)
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'A rate for this category with the same effective-from date already exists.'
				}, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to create TA/DA rate' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('[BoS TA/DA Rates] POST exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/** PUT /api/bos/ta-da-rates — update a rate (body must include id) */
export async function PUT(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		if (!body.id) {
			return NextResponse.json({ error: 'id is required' }, { status: 400 })
		}

		const validationError = validateRatePayload(body)
		if (validationError) {
			return NextResponse.json({ error: validationError }, { status: 400 })
		}

		// institutions_id must never change after creation — reuse the stored value
		const { data: existing, error: fetchError } = await supabase
			.from('bos_ta_da_rates')
			.select('institutions_id')
			.eq('id', body.id)
			.single()

		if (fetchError || !existing) {
			return NextResponse.json({ error: 'Rate not found' }, { status: 404 })
		}

		const record = buildRateRecord(body)
		record.institutions_id = existing.institutions_id

		const { data, error } = await supabase
			.from('bos_ta_da_rates')
			.update({
				...record,
				updated_at: new Date().toISOString()
			})
			.eq('id', body.id)
			.select()
			.single()

		if (error) {
			console.error('[BoS TA/DA Rates] PUT error:', error)
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'A rate for this category with the same effective-from date already exists.'
				}, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to update TA/DA rate' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('[BoS TA/DA Rates] PUT exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/** DELETE /api/bos/ta-da-rates?id= — delete a rate */
export async function DELETE(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'id is required' }, { status: 400 })
		}

		const { error } = await supabase
			.from('bos_ta_da_rates')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('[BoS TA/DA Rates] DELETE error:', error)
			return NextResponse.json({ error: 'Failed to delete TA/DA rate' }, { status: 500 })
		}

		return NextResponse.json({ message: 'Rate deleted successfully' })
	} catch (error) {
		console.error('[BoS TA/DA Rates] DELETE exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
