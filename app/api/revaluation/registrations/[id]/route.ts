import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/registrations/[id]
// Fetch single revaluation application
// =====================================================
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = params

		const { data, error } = await supabase
			.from('revaluation_registrations')
			.select('*')
			.eq('id', id)
			.single()

		if (error) {
			console.error('[Revaluation Registration GET] Error:', error)
			return NextResponse.json({ error: 'Failed to fetch revaluation application' }, { status: 500 })
		}

		if (!data) {
			return NextResponse.json({ error: 'Revaluation application not found' }, { status: 404 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('[Revaluation Registration GET] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =====================================================
// PUT /api/revaluation/registrations/[id]
// Update revaluation application (status, approval, etc.)
// =====================================================
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = params
		const body = await request.json()

		// Build update payload (only allowed fields)
		const updatePayload: any = {}

		// Status updates
		if (body.status) updatePayload.status = body.status

		// Payment verification
		if (body.payment_status) {
			updatePayload.payment_status = body.payment_status
			if (body.payment_status === 'Verified') {
				updatePayload.payment_verified_date = new Date().toISOString()
				// Get current user from auth context if available
				if (body.verified_by_user_id) {
					updatePayload.payment_verified_by = body.verified_by_user_id
				}
			}
		}

		// Approval
		if (body.approved_by) {
			updatePayload.approved_by = body.approved_by
			updatePayload.approved_date = new Date().toISOString()
			updatePayload.status = 'Approved'
		}

		// Rejection
		if (body.rejection_reason) {
			updatePayload.rejection_reason = body.rejection_reason
			updatePayload.status = 'Rejected'
		}

		// Assignment
		if (body.examiner_assignment_id) {
			updatePayload.examiner_assignment_id = body.examiner_assignment_id
			updatePayload.assigned_date = new Date().toISOString()
			updatePayload.status = 'Assigned'
			// Set deadline (30 days from now)
			const deadline = new Date()
			deadline.setDate(deadline.getDate() + 30)
			updatePayload.evaluation_deadline = deadline.toISOString().split('T')[0]
		}

		// Publication
		if (body.published_by) {
			updatePayload.published_by = body.published_by
			updatePayload.published_date = new Date().toISOString()
			updatePayload.status = 'Published'
		}

		// Audit
		updatePayload.updated_at = new Date().toISOString()
		if (body.updated_by_user_id) {
			updatePayload.updated_by = body.updated_by_user_id
		}

		// Update record
		const { data, error } = await supabase
			.from('revaluation_registrations')
			.update(updatePayload)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('[Revaluation Registration PUT] Error:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'Duplicate entry' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to update revaluation application' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('[Revaluation Registration PUT] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =====================================================
// DELETE /api/revaluation/registrations/[id]
// Cancel/delete revaluation application
// =====================================================
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = params

		// Check if can be deleted (only before marks entry)
		const { data: existing } = await supabase
			.from('revaluation_registrations')
			.select('status')
			.eq('id', id)
			.single()

		if (existing && ['Evaluated', 'Verified', 'Published'].includes(existing.status)) {
			return NextResponse.json(
				{ error: 'Cannot delete - revaluation already evaluated or published' },
				{ status: 400 }
			)
		}

		// Soft delete - set status to Cancelled
		const { error } = await supabase
			.from('revaluation_registrations')
			.update({ status: 'Cancelled', updated_at: new Date().toISOString() })
			.eq('id', id)

		if (error) {
			console.error('[Revaluation Registration DELETE] Error:', error)
			return NextResponse.json({ error: 'Failed to cancel revaluation application' }, { status: 500 })
		}

		return NextResponse.json({ success: true, message: 'Revaluation application cancelled' })
	} catch (error) {
		console.error('[Revaluation Registration DELETE] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
