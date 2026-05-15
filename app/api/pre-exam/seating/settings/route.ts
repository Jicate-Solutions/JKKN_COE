import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// Defaults if no row exists for the institution yet
const DEFAULT_RULES = {
	rule_1_minimize_rooms: true,
	rule_2_same_program_separation: true,
	rule_3_shared_course_c2: true,
	rule_4_room_continuity: true,
	rule_5_equal_distribution: true,
}

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutions_id')

		if (!institutionId) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('institution_seating_settings')
			.select('rule_1_minimize_rooms, rule_2_same_program_separation, rule_3_shared_course_c2, rule_4_room_continuity, rule_5_equal_distribution')
			.eq('institutions_id', institutionId)
			.maybeSingle()

		if (error) {
			console.error('Seating settings fetch error:', error)
			// Table missing (migration not yet applied) → fall back to defaults so
			// the UI still works. Other errors bubble up.
			if (error.code === '42P01') {
				return NextResponse.json(DEFAULT_RULES)
			}
			return NextResponse.json({ error: error.message || 'Failed to fetch settings' }, { status: 500 })
		}

		return NextResponse.json(data || DEFAULT_RULES)
	} catch (e) {
		console.error('Seating settings GET error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function PUT(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()
		const { institutions_id, ...rules } = body

		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		// Coerce to booleans defensively, fall back to current defaults
		const payload = {
			institutions_id,
			rule_1_minimize_rooms: rules.rule_1_minimize_rooms !== false,
			rule_2_same_program_separation: rules.rule_2_same_program_separation !== false,
			rule_3_shared_course_c2: rules.rule_3_shared_course_c2 !== false,
			rule_4_room_continuity: rules.rule_4_room_continuity !== false,
			rule_5_equal_distribution: rules.rule_5_equal_distribution !== false,
			updated_at: new Date().toISOString(),
		}

		const { data, error } = await supabase
			.from('institution_seating_settings')
			.upsert(payload, { onConflict: 'institutions_id' })
			.select('rule_1_minimize_rooms, rule_2_same_program_separation, rule_3_shared_course_c2, rule_4_room_continuity, rule_5_equal_distribution')
			.single()

		if (error) {
			console.error('Seating settings upsert error:', error)
			// 42P01 = relation does not exist → migration not applied yet
			if (error.code === '42P01') {
				return NextResponse.json({
					error: 'institution_seating_settings table is missing. Apply migration 20260514_create_institution_seating_settings.sql first.',
				}, { status: 500 })
			}
			return NextResponse.json({
				error: error.message || 'Failed to save settings',
				code: error.code,
				details: error.details,
				hint: error.hint,
			}, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('Seating settings PUT error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
