import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function PUT(
	request: Request,
	{ params }: { params: { id: string } }
) {
	const supabase = getSupabaseServer()
	const { id } = params
	const body = await request.json()

	if (!id) {
		return NextResponse.json({ error: 'ID is required' }, { status: 400 })
	}

	// Never allow changing institution after creation
	const { institutions_id: _i, institution_code: _c, ...updateData } = body

	const { data, error } = await supabase
		.from('coe_calendar')
		.update({
			...updateData,
			event_title: updateData.event_title?.trim(),
			event_description: updateData.event_description?.trim() || null,
		})
		.eq('id', id)
		.select()
		.single()

	if (error) {
		console.error('coe_calendar PUT error:', error)
		return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
	}

	return NextResponse.json(data)
}

export async function DELETE(
	request: Request,
	{ params }: { params: { id: string } }
) {
	const supabase = getSupabaseServer()
	const { id } = params

	if (!id) {
		return NextResponse.json({ error: 'ID is required' }, { status: 400 })
	}

	const { error } = await supabase
		.from('coe_calendar')
		.delete()
		.eq('id', id)

	if (error) {
		console.error('coe_calendar DELETE error:', error)
		return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
	}

	return NextResponse.json({ success: true })
}
