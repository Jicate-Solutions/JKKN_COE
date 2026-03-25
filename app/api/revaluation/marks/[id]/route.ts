import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/marks/[id]
// Fetch single revaluation marks entry
// =====================================================
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = params

		const { data, error } = await supabase
			.from('revaluation_marks')
			.select('*')
			.eq('id', id)
			.single()

		if (error) {
			console.error('[Revaluation Marks GET] Error:', error)
			return NextResponse.json({ error: 'Failed to fetch marks entry' }, { status: 500 })
		}

		if (!data) {
			return NextResponse.json({ error: 'Marks entry not found' }, { status: 404 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('[Revaluation Marks GET] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =====================================================
// PUT /api/revaluation/marks/[id]
// Update revaluation marks entry (or submit/verify/lock)
// =====================================================
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = params
		const body = await request.json()

		// Fetch existing marks
		const { data: existing, error: fetchError } = await supabase
			.from('revaluation_marks')
			.select('entry_status, is_active')
			.eq('id', id)
			.single()

		if (fetchError || !existing) {
			return NextResponse.json({ error: 'Marks entry not found' }, { status: 404 })
		}

		// Build update payload
		const updatePayload: any = {}

		// Marks data updates (only if Draft)
		if (existing.entry_status === 'Draft') {
			if (body.question_wise_marks !== undefined)
				updatePayload.question_wise_marks = body.question_wise_marks
			if (body.total_marks_obtained !== undefined) {
				updatePayload.total_marks_obtained = Number(body.total_marks_obtained)
			}
			if (body.total_marks_in_words !== undefined)
				updatePayload.total_marks_in_words = body.total_marks_in_words.trim()
			if (body.marks_out_of !== undefined) updatePayload.marks_out_of = Number(body.marks_out_of)

			// Recalculate percentage if marks changed
			if (updatePayload.total_marks_obtained !== undefined || updatePayload.marks_out_of !== undefined) {
				const totalMarks = updatePayload.total_marks_obtained ?? existing.total_marks_obtained
				const marksOutOf = updatePayload.marks_out_of ?? existing.marks_out_of
				updatePayload.percentage = (totalMarks / marksOutOf) * 100
			}

			if (body.evaluation_date) updatePayload.evaluation_date = body.evaluation_date
			if (body.evaluation_time_minutes !== undefined)
				updatePayload.evaluation_time_minutes = Number(body.evaluation_time_minutes)
			if (body.evaluator_remarks !== undefined)
				updatePayload.evaluator_remarks = body.evaluator_remarks?.trim() || null
		}

		// Submit action
		if (body.action === 'submit') {
			if (existing.entry_status !== 'Draft') {
				return NextResponse.json({ error: 'Can only submit draft entries' }, { status: 400 })
			}
			updatePayload.entry_status = 'Submitted'
			updatePayload.submitted_at = new Date().toISOString()
		}

		// Verify action
		if (body.action === 'verify') {
			if (existing.entry_status !== 'Submitted') {
				return NextResponse.json({ error: 'Can only verify submitted entries' }, { status: 400 })
			}
			updatePayload.entry_status = 'Verified'
			updatePayload.verified_by = body.verified_by_user_id || null
			updatePayload.verified_at = new Date().toISOString()
		}

		// Reject action
		if (body.action === 'reject') {
			if (existing.entry_status !== 'Submitted') {
				return NextResponse.json({ error: 'Can only reject submitted entries' }, { status: 400 })
			}
			updatePayload.entry_status = 'Rejected'
			updatePayload.verified_by = body.verified_by_user_id || null
			updatePayload.verified_at = new Date().toISOString()
		}

		// Lock action
		if (body.action === 'lock') {
			if (existing.entry_status !== 'Verified') {
				return NextResponse.json({ error: 'Can only lock verified entries' }, { status: 400 })
			}
			updatePayload.entry_status = 'Locked'
			updatePayload.locked_by = body.locked_by_user_id || null
			updatePayload.locked_at = new Date().toISOString()
		}

		// Moderation
		if (body.is_moderated !== undefined) {
			updatePayload.is_moderated = body.is_moderated
			if (body.is_moderated) {
				updatePayload.moderated_by = body.moderated_by_user_id || null
				updatePayload.moderation_date = new Date().toISOString().split('T')[0]
				if (body.marks_before_moderation !== undefined)
					updatePayload.marks_before_moderation = Number(body.marks_before_moderation)
				if (body.marks_after_moderation !== undefined)
					updatePayload.marks_after_moderation = Number(body.marks_after_moderation)
				if (body.moderation_remarks) updatePayload.moderation_remarks = body.moderation_remarks.trim()
			}
		}

		// Audit
		updatePayload.updated_at = new Date().toISOString()
		if (body.updated_by_user_id) {
			updatePayload.updated_by = body.updated_by_user_id
		}

		// Update record
		const { data, error } = await supabase
			.from('revaluation_marks')
			.update(updatePayload)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('[Revaluation Marks PUT] Error:', error)
			return NextResponse.json({ error: 'Failed to update marks entry' }, { status: 500 })
		}

		// If verified, update revaluation status to Evaluated
		if (updatePayload.entry_status === 'Verified') {
			const { data: marks } = await supabase
				.from('revaluation_marks')
				.select('revaluation_registration_id')
				.eq('id', id)
				.single()

			if (marks?.revaluation_registration_id) {
				await supabase
					.from('revaluation_registrations')
					.update({
						status: 'Evaluated',
						updated_at: new Date().toISOString(),
					})
					.eq('id', marks.revaluation_registration_id)
			}
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('[Revaluation Marks PUT] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =====================================================
// DELETE /api/revaluation/marks/[id]
// Delete revaluation marks entry (only if Draft)
// =====================================================
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = params

		// Check status before delete
		const { data: existing } = await supabase
			.from('revaluation_marks')
			.select('entry_status')
			.eq('id', id)
			.single()

		if (existing && existing.entry_status !== 'Draft') {
			return NextResponse.json(
				{ error: 'Can only delete draft entries' },
				{ status: 400 }
			)
		}

		const { error } = await supabase.from('revaluation_marks').delete().eq('id', id)

		if (error) {
			console.error('[Revaluation Marks DELETE] Error:', error)
			if (error.code === '23503') {
				return NextResponse.json(
					{ error: 'Cannot delete - has related records' },
					{ status: 400 }
				)
			}
			return NextResponse.json({ error: 'Failed to delete marks entry' }, { status: 500 })
		}

		return NextResponse.json({ success: true, message: 'Marks entry deleted' })
	} catch (error) {
		console.error('[Revaluation Marks DELETE] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
