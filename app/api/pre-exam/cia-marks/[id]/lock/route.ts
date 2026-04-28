import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
	try {
		const { id } = await params
		const body = await request.json()
		const { action, locked_by } = body // action: 'lock' | 'unlock'

		if (!action || !['lock', 'unlock'].includes(action)) {
			return NextResponse.json({ error: "Action must be 'lock' or 'unlock'" }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		const { data: existing } = await supabase
			.from('cia_marks')
			.select('*')
			.eq('id', id)
			.single()

		if (!existing) {
			return NextResponse.json({ error: 'Mark not found' }, { status: 404 })
		}

		const isLocking = action === 'lock'
		const updateData = {
			is_locked: isLocking,
			locked_at: isLocking ? new Date().toISOString() : null,
			locked_by: isLocking ? locked_by || null : null,
			updated_at: new Date().toISOString(),
		}

		const { data, error } = await supabase
			.from('cia_marks')
			.update(updateData)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('Error updating CIA mark lock status:', error)
			return NextResponse.json({ error: 'Failed to update lock status' }, { status: 500 })
		}

		// Audit trail
		await supabase.from('cia_marks_audit').insert({
			cia_mark_id: id,
			cia_setting_id: existing.cia_setting_id,
			cia_round: existing.cia_round,
			action: isLocking ? 'lock' : 'unlock',
			performed_by: locked_by || null,
		})

		return NextResponse.json({
			success: true,
			message: `Marks ${isLocking ? 'locked' : 'unlocked'} successfully`,
			data,
		})
	} catch (error) {
		console.error('CIA marks lock error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
