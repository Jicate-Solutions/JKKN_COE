import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

type Ctx = { params: Promise<{ id: string }> }

// GET ?round=1 → list exam_timetables rows for this setting + round
export async function GET(request: Request, { params }: Ctx) {
	const { id: settingId } = await params
	const { searchParams } = new URL(request.url)
	const round = Number(searchParams.get('round') || 1)

	const supabase = getSupabaseServer()
	const { data, error } = await supabase
		.from('exam_timetables')
		.select(`
			id, course_offering_id, exam_date, start_time, end_time, room_id, room_name,
			course_offerings(id, course_id, courses:course_id(course_code, course_name))
		`)
		.eq('cia_setting_id', settingId)
		.eq('cia_round', round)
		.order('exam_date', { ascending: true })

	if (error) {
		console.error('CIA timetable GET error:', error)
		return NextResponse.json({ error: 'Failed to fetch timetable' }, { status: 500 })
	}
	return NextResponse.json(data || [])
}

// POST body: { round, course_offering_id, exam_date, start_time?, end_time?, room_id?, room_name? }
export async function POST(request: Request, { params }: Ctx) {
	try {
		const { id: settingId } = await params
		const body = await request.json()
		const { round, course_offering_id, exam_date, start_time, end_time, room_id, room_name } = body

		if (!round || !course_offering_id || !exam_date) {
			return NextResponse.json({ error: 'round, course_offering_id, exam_date are required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Load setting for institutions_id, examination_session_id, and round_name
		const { data: setting } = await supabase
			.from('cia_entry_settings')
			.select('institutions_id, examination_session_id, cia_rounds')
			.eq('id', settingId)
			.single()
		if (!setting) return NextResponse.json({ error: 'Setting not found' }, { status: 404 })

		const roundObj = (setting.cia_rounds as any[]).find((r: any) => r.round === round)
		const cia_round_name = roundObj?.round_name || `CIA-${round}`

		// Check for existing row (upsert: one row per setting+round+course)
		const { data: existing } = await supabase
			.from('exam_timetables')
			.select('id')
			.eq('cia_setting_id', settingId)
			.eq('cia_round', round)
			.eq('course_offering_id', course_offering_id)
			.maybeSingle()

		const payload = {
			institutions_id: setting.institutions_id,
			examination_session_id: setting.examination_session_id,
			course_offering_id,
			exam_date,
			start_time: start_time || null,
			end_time: end_time || null,
			room_id: room_id || null,
			room_name: room_name || null,
			cia_setting_id: settingId,
			cia_round: round,
			cia_round_name,
		}

		const { data, error } = existing
			? await supabase.from('exam_timetables').update(payload).eq('id', existing.id).select().single()
			: await supabase.from('exam_timetables').insert(payload).select().single()

		if (error) {
			console.error('CIA timetable upsert error:', error)
			return NextResponse.json({ error: 'Failed to save timetable row' }, { status: 500 })
		}
		return NextResponse.json(data, { status: existing ? 200 : 201 })
	} catch (e) {
		console.error('CIA timetable POST exception:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE ?timetable_id=<uuid>
export async function DELETE(request: Request, { params }: Ctx) {
	const { id: settingId } = await params
	const { searchParams } = new URL(request.url)
	const timetableId = searchParams.get('timetable_id')
	if (!timetableId) return NextResponse.json({ error: 'timetable_id is required' }, { status: 400 })

	const supabase = getSupabaseServer()
	const { error } = await supabase
		.from('exam_timetables')
		.delete()
		.eq('id', timetableId)
		.eq('cia_setting_id', settingId) // scope guard: can only delete own rows
	if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
	return NextResponse.json({ success: true })
}
