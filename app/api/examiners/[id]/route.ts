import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params
		const supabase = getSupabaseServer()

		const { data, error } = await supabase
			.from('examiners')
			.select(`
				*,
				examiner_board_associations (
					id,
					board_id,
					board_code,
					willing_for_valuation,
					willing_for_practical,
					willing_for_scrutiny,
					is_active,
					board:board (
						id,
						board_code,
						board_name,
						board_type
					)
				)
			`)
			.eq('id', id)
			.single()

		if (error) {
			console.error('Error fetching examiner:', error)
			return NextResponse.json({ error: 'Examiner not found' }, { status: 404 })
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('Examiner fetch error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Handle status toggle
		if (body.status !== undefined) {
			const { data, error } = await supabase
				.from('examiners')
				.update({
					status: body.status,
					status_remarks: body.status_remarks || null,
					updated_at: new Date().toISOString(),
				})
				.eq('id', id)
				.select()
				.single()

			if (error) {
				console.error('Error updating examiner status:', error)
				return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
			}

			return NextResponse.json(data)
		}

		// Handle email verification
		if (body.email_verified !== undefined) {
			const { data, error } = await supabase
				.from('examiners')
				.update({
					email_verified: body.email_verified,
					email_verified_at: body.email_verified ? new Date().toISOString() : null,
					updated_at: new Date().toISOString(),
				})
				.eq('id', id)
				.select()
				.single()

			if (error) {
				console.error('Error updating email verification:', error)
				return NextResponse.json({ error: 'Failed to update verification' }, { status: 500 })
			}

			return NextResponse.json(data)
		}

		return NextResponse.json({ error: 'No valid update field provided' }, { status: 400 })
	} catch (e) {
		console.error('Examiner patch error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params
		const supabase = getSupabaseServer()

		const { error } = await supabase
			.from('examiners')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting examiner:', error)
			return NextResponse.json({ error: 'Failed to delete examiner' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (e) {
		console.error('Examiner deletion error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
