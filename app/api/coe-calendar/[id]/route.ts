import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { validateEventPayload, mapCalendarDbError } from '@/lib/coe-calendar/validate'
import { resolveProgramCodes } from '@/lib/coe-calendar/programs'

// Next 15+ passes route params as a Promise.
type RouteContext = { params: Promise<{ id: string }> }

export async function PUT(request: Request, { params }: RouteContext) {
	const supabase = getSupabaseServer()
	const { id } = await params
	const body = await request.json()

	if (!id) {
		return NextResponse.json({ error: 'ID is required' }, { status: 400 })
	}

	// Partial mode: only the fields actually sent are validated and written.
	// Institution columns are never writable — institution is fixed at creation
	// and the mirrored columns are trigger-maintained.
	const { values, errors } = validateEventPayload(body, { partial: true })

	if (Object.keys(errors).length > 0) {
		return NextResponse.json(
			{ error: Object.values(errors)[0], errors },
			{ status: 400 },
		)
	}

	if (Object.keys(values).length === 0) {
		return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 })
	}

	// One read serves both the date-order guard and the programme lookup, which
	// must be scoped to the event's own institution.
	const needsCurrent =
		values.program_codes !== undefined
		|| ((values.event_start_date || values.event_end_date)
			&& !(values.event_start_date && values.event_end_date))

	let current: {
		event_start_date: string
		event_end_date: string
		institutions_id: string
	} | null = null

	if (needsCurrent) {
		const { data } = await supabase
			.from('coe_calendar')
			.select('event_start_date, event_end_date, institutions_id')
			.eq('id', id)
			.maybeSingle()
		current = data as typeof current
	}

	if (values.program_codes !== undefined && current) {
		const resolved = await resolveProgramCodes(
			supabase,
			current.institutions_id,
			values.program_codes,
		)
		if (!resolved.ok) {
			return NextResponse.json(
				{ error: `Unknown programme code(s): ${resolved.unknown.join(', ')}` },
				{ status: 400 },
			)
		}
		values.program_codes = resolved.codes
	}

	if ((values.event_start_date || values.event_end_date)
		&& !(values.event_start_date && values.event_end_date)) {
		if (current) {
			const start = values.event_start_date || current.event_start_date
			const end = values.event_end_date || current.event_end_date
			if (end < start) {
				return NextResponse.json(
					{ error: 'End date must be on or after start date' },
					{ status: 400 },
				)
			}
		}
	}

	const { data, error } = await supabase
		.from('coe_calendar')
		.update(values)
		.eq('id', id)
		.select()
		.single()

	if (error) {
		const mapped = mapCalendarDbError(error)
		if (mapped.status === 500) console.error('coe_calendar PUT error:', error)
		return NextResponse.json({ error: mapped.message }, { status: mapped.status })
	}

	if (!data) {
		return NextResponse.json({ error: 'Event not found' }, { status: 404 })
	}

	return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: RouteContext) {
	const supabase = getSupabaseServer()
	const { id } = await params

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
