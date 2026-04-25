import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

type Ctx = { params: Promise<{ id: string }> }

// GET ?round=1 → courses in scope for this setting+round, merged with existing timetable rows
export async function GET(request: Request, { params }: Ctx) {
	try {
		const { id: settingId } = await params
		const { searchParams } = new URL(request.url)
		const round = Number(searchParams.get('round') || 1)

		const supabase = getSupabaseServer()

		// 1. Load setting scope
		const { data: setting } = await supabase
			.from('cia_entry_settings')
			.select('institutions_id, examination_session_id, program_codes, course_type, regulation_code')
			.eq('id', settingId)
			.single()
		if (!setting) return NextResponse.json([], { status: 404 })

		// 2. Find matching course_offerings
		let query = supabase
			.from('course_offerings')
			.select('id, course_id, program_code, courses:course_id(course_code, course_name, course_type)')
			.eq('institutions_id', setting.institutions_id)
			.eq('examination_session_id', setting.examination_session_id)
		if (Array.isArray(setting.program_codes) && setting.program_codes.length > 0) {
			query = query.in('program_code', setting.program_codes)
		}
		if (setting.regulation_code) {
			query = query.eq('regulation_code', setting.regulation_code)
		}

		const { data: offerings } = await query.range(0, 9999)
		let filtered = offerings || []

		// Filter by course_type if specified
		if (Array.isArray(setting.course_type) && setting.course_type.length > 0) {
			filtered = filtered.filter((o: any) =>
				setting.course_type.includes(o.courses?.course_type)
			)
		}

		// 3. Load existing timetable rows for this setting+round
		const { data: existing } = await supabase
			.from('exam_timetables')
			.select('id, course_offering_id, exam_date, start_time, end_time, room_name')
			.eq('cia_setting_id', settingId)
			.eq('cia_round', round)

		const existingMap = new Map((existing || []).map(t => [t.course_offering_id, t]))

		// 4. Build response: one row per course offering
		const rows = filtered.map((o: any) => {
			const tt = existingMap.get(o.id)
			return {
				course_offering_id: o.id,
				course_code: o.courses?.course_code || '',
				course_name: o.courses?.course_name || '',
				exam_date: tt?.exam_date || null,
				start_time: tt?.start_time || null,
				end_time: tt?.end_time || null,
				room_name: tt?.room_name || null,
				existing_timetable_id: tt?.id || null,
			}
		})

		return NextResponse.json(rows)
	} catch (e) {
		console.error('CIA timetable scope error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
