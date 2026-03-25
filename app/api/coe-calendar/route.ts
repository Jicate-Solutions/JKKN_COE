import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const institutionsId = searchParams.get('institutions_id')
	const institutionCode = searchParams.get('institution_code')
	const academicYear = searchParams.get('academic_year')
	const examCategory = searchParams.get('exam_category')
	const status = searchParams.get('status') || 'ACTIVE'

	let query = supabase.from('coe_calendar').select('*')

	if (institutionsId) {
		query = query.eq('institutions_id', institutionsId)
	} else if (institutionCode) {
		query = query.eq('institution_code', institutionCode)
	}

	if (academicYear) query = query.eq('academic_year', academicYear)
	if (examCategory) query = query.eq('exam_category', examCategory)
	if (status !== 'ALL') query = query.eq('status', status)

	query = query.order('event_start_date', { ascending: true })

	const { data, error } = await query.range(0, 9999)

	if (error) {
		console.error('coe_calendar GET error:', error)
		return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 })
	}

	return NextResponse.json(data || [])
}

export async function POST(request: Request) {
	const supabase = getSupabaseServer()
	const body = await request.json()

	if (!body.event_title?.trim()) {
		return NextResponse.json({ error: 'Event title is required' }, { status: 400 })
	}
	if (!body.exam_category) {
		return NextResponse.json({ error: 'Category is required' }, { status: 400 })
	}
	if (!body.event_start_date) {
		return NextResponse.json({ error: 'Start date is required' }, { status: 400 })
	}
	if (!body.event_end_date) {
		return NextResponse.json({ error: 'End date is required' }, { status: 400 })
	}

	let institutions_id = body.institutions_id
	const institution_code = body.institution_code

	if (institution_code && !institutions_id) {
		const { data: inst } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', institution_code)
			.maybeSingle()
		if (!inst) {
			return NextResponse.json({ error: `Institution "${institution_code}" not found` }, { status: 400 })
		}
		institutions_id = inst.id
	}

	if (!institutions_id) {
		return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
	}

	const { data, error } = await supabase
		.from('coe_calendar')
		.insert({
			institutions_id,
			institution_code,
			academic_year: body.academic_year || '2025-2026',
			programme_type: body.programme_type || 'BOTH',
			exam_category: body.exam_category,
			event_title: body.event_title.trim(),
			event_description: body.event_description?.trim() || null,
			event_start_date: body.event_start_date,
			event_end_date: body.event_end_date,
			status: body.status || 'ACTIVE',
			is_bulk_uploaded: false,
		})
		.select()
		.single()

	if (error) {
		console.error('coe_calendar POST error:', error)
		return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
	}

	return NextResponse.json(data, { status: 201 })
}
