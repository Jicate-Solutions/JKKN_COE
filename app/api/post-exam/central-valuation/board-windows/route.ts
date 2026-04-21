import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')
	const sessionId = searchParams.get('session_id')

	if (!institutionsId || !sessionId) {
		return NextResponse.json({ error: 'institutions_id and session_id are required' }, { status: 400 })
	}

	const supabase = getSupabaseServer()
	const { data, error } = await supabase
		.from('board_valuation_windows')
		.select('*')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.order('board_code')

	if (error) {
		console.error('board-windows GET error:', error)
		return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
	}
	return NextResponse.json(data || [])
}

export async function PUT(request: Request) {
	const body = await request.json()
	const {
		institutions_id,
		examination_session_id,
		board_code,
		board_name,
		from_date,
		to_date,
	} = body

	if (!institutions_id || !examination_session_id || !board_code || !from_date || !to_date) {
		return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
	}
	if (new Date(to_date) < new Date(from_date)) {
		return NextResponse.json({ error: 'to_date must be >= from_date' }, { status: 400 })
	}

	const supabase = getSupabaseServer()
	const { data, error } = await supabase
		.from('board_valuation_windows')
		.upsert(
			{
				institutions_id,
				examination_session_id,
				board_code,
				board_name: board_name ?? null,
				from_date,
				to_date,
				updated_at: new Date().toISOString(),
			},
			{ onConflict: 'institutions_id,examination_session_id,board_code' }
		)
		.select()
		.single()

	if (error) {
		console.error('board-windows PUT error:', error)
		return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
	}
	return NextResponse.json(data)
}
