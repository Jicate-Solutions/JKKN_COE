import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/registration-periods
// Fetch revaluation registration periods
// =====================================================

export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const institutionsId = searchParams.get('institutions_id')
	const examinationSessionId = searchParams.get('examination_session_id')
	const isActive = searchParams.get('is_active')

	try {
		let query = supabase
			.from('revaluation_registration_periods')
			.select('*')
			.order('created_at', { ascending: false })

		// Filter by institution
		if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		// Filter by examination session
		if (examinationSessionId) {
			query = query.eq('examination_session_id', examinationSessionId)
		}

		// Filter by active status
		if (isActive !== null && isActive !== undefined) {
			query = query.eq('is_active', isActive === 'true')
		}

		const { data, error } = await query

		if (error) {
			console.error('Registration periods fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch registration periods' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('Registration periods fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch registration periods' }, { status: 500 })
	}
}

// =====================================================
// POST /api/revaluation/registration-periods
// Create a new revaluation registration period
// =====================================================

export async function POST(request: Request) {
	const supabase = getSupabaseServer()

	try {
		const body = await request.json()

		// Required fields validation
		if (!body.examination_session_id) {
			return NextResponse.json({ error: 'Examination session is required' }, { status: 400 })
		}

		if (!body.start_date) {
			return NextResponse.json({ error: 'Start date is required' }, { status: 400 })
		}

		if (!body.end_date) {
			return NextResponse.json({ error: 'End date is required' }, { status: 400 })
		}

		if (!body.institutions_id) {
			return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
		}

		// Validate dates
		const startDate = new Date(body.start_date)
		const endDate = new Date(body.end_date)

		if (endDate <= startDate) {
			return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
		}

		// Check if period already exists for this session
		const { data: existing } = await supabase
			.from('revaluation_registration_periods')
			.select('id')
			.eq('examination_session_id', body.examination_session_id)
			.eq('institutions_id', body.institutions_id)
			.maybeSingle()

		if (existing) {
			return NextResponse.json(
				{ error: 'A revaluation period already exists for this examination session' },
				{ status: 400 }
			)
		}

		// Insert new registration period
		const { data, error } = await supabase
			.from('revaluation_registration_periods')
			.insert({
				institutions_id: body.institutions_id,
				institution_code: body.institution_code,
				examination_session_id: body.examination_session_id,
				session_code: body.session_code,
				session_name: body.session_name,
				start_date: body.start_date,
				end_date: body.end_date,
				instructions: body.instructions || null,
				is_active: body.is_active !== undefined ? body.is_active : true,
				max_courses_per_application: body.max_courses_per_application || 10,
			})
			.select()
			.single()

		if (error) {
			console.error('Registration period creation error:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'Period already exists' }, { status: 400 })
			}
			if (error.code === '23503') {
				return NextResponse.json({ error: 'Invalid reference data' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to create registration period' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('Registration period creation error:', error)
		return NextResponse.json({ error: 'Failed to create registration period' }, { status: 500 })
	}
}

// =====================================================
// PUT /api/revaluation/registration-periods
// Update a revaluation registration period
// =====================================================

export async function PUT(request: Request) {
	const supabase = getSupabaseServer()

	try {
		const body = await request.json()
		const { id, ...updateData } = body

		if (!id) {
			return NextResponse.json({ error: 'Period ID is required' }, { status: 400 })
		}

		// Validate dates if provided
		if (updateData.start_date && updateData.end_date) {
			const startDate = new Date(updateData.start_date)
			const endDate = new Date(updateData.end_date)

			if (endDate <= startDate) {
				return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
			}
		}

		// Don't allow changing institution or session
		delete updateData.institutions_id
		delete updateData.institution_code
		delete updateData.examination_session_id

		const { data, error } = await supabase
			.from('revaluation_registration_periods')
			.update(updateData)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('Registration period update error:', error)
			return NextResponse.json({ error: 'Failed to update registration period' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Registration period update error:', error)
		return NextResponse.json({ error: 'Failed to update registration period' }, { status: 500 })
	}
}

// =====================================================
// DELETE /api/revaluation/registration-periods
// Delete a revaluation registration period
// =====================================================

export async function DELETE(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const id = searchParams.get('id')

	if (!id) {
		return NextResponse.json({ error: 'Period ID is required' }, { status: 400 })
	}

	try {
		// Check if there are applications for this period
		const { data: applications } = await supabase
			.from('revaluation_registrations')
			.select('id')
			.eq('examination_session_id', id)
			.limit(1)

		if (applications && applications.length > 0) {
			return NextResponse.json(
				{ error: 'Cannot delete period with existing applications' },
				{ status: 400 }
			)
		}

		const { error } = await supabase.from('revaluation_registration_periods').delete().eq('id', id)

		if (error) {
			console.error('Registration period deletion error:', error)
			return NextResponse.json({ error: 'Failed to delete registration period' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Registration period deletion error:', error)
		return NextResponse.json({ error: 'Failed to delete registration period' }, { status: 500 })
	}
}
