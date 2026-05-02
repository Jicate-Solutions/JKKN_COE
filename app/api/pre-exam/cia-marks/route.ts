import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// Standard component codes that have dedicated columns on cia_marks.
// Anything outside this set must come in via the extra_marks JSONB column.
const STANDARD_COMPONENT_TO_COLUMN: Record<string, string> = {
	assignment: 'assignment_marks',
	quiz: 'quiz_marks',
	mid_term: 'mid_term_marks',
	presentation: 'presentation_marks',
	attendance: 'attendance_marks',
	lab: 'lab_marks',
	project: 'project_marks',
	seminar: 'seminar_marks',
	viva: 'viva_marks',
	other: 'other_marks',
	test_1: 'test_1_mark',
	test_2: 'test_2_mark',
	test_3: 'test_3_mark',
}

const STANDARD_MAX_TO_COLUMN: Record<string, string> = {
	assignment: 'max_assignment_marks',
	quiz: 'max_quiz_marks',
	mid_term: 'max_mid_term_marks',
	presentation: 'max_presentation_marks',
	attendance: 'max_attendance_marks',
	lab: 'max_lab_marks',
	project: 'max_project_marks',
	seminar: 'max_seminar_marks',
	viva: 'max_viva_marks',
	other: 'max_other_marks',
	test_1: 'max_test_1_mark',
	test_2: 'max_test_2_mark',
	test_3: 'max_test_3_mark',
}

/**
 * Splits a payload `component_marks` map into:
 *   - flat columns for the 13 standard codes
 *   - a residual extra_marks object for everything else
 * Caller may also pass `extra_marks` directly — those are merged in.
 */
function mapComponentsToColumns(input: {
	component_marks?: Record<string, number>
	extra_marks?: Record<string, number>
	extra_marks_max?: Record<string, number>
}) {
	const out: Record<string, unknown> = {}
	const residualExtra: Record<string, number> = { ...(input.extra_marks || {}) }

	if (input.component_marks) {
		for (const [code, value] of Object.entries(input.component_marks)) {
			const col = STANDARD_COMPONENT_TO_COLUMN[code]
			if (col) {
				out[col] = value
			} else {
				residualExtra[code] = value
			}
		}
	}

	out.extra_marks = residualExtra
	if (input.extra_marks_max) out.extra_marks_max = input.extra_marks_max

	return out
}

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const supabase = getSupabaseServer()

		const settingId = searchParams.get('cia_setting_id')
		const roundNumber = searchParams.get('cia_round')
		const institutionId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')

		let query = supabase.from('cia_marks').select('*')

		if (settingId) query = query.eq('cia_setting_id', settingId)
		if (roundNumber) query = query.eq('cia_round', parseInt(roundNumber))
		if (institutionId) query = query.eq('institutions_id', institutionId)
		if (sessionId) query = query.eq('examination_session_id', sessionId)

		const { data, error } = await query.order('created_at', { ascending: false }).range(0, 9999)

		if (error) {
			console.error('Error fetching CIA marks:', error)
			return NextResponse.json({ error: 'Failed to fetch marks' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('CIA marks GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			institutions_id,
			examination_session_id,
			exam_registration_id,
			student_id,
			cia_setting_id,
			cia_round,
			cia_round_name,
			component_marks,
			extra_marks,
			extra_marks_max,
			round_total_marks,
			submission_date,
			submitted_by,
		} = body

		// Validation
		if (!institutions_id || !examination_session_id || !exam_registration_id) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}
		if (!cia_setting_id || !cia_round) {
			return NextResponse.json({ error: 'CIA setting ID and round number are required' }, { status: 400 })
		}

		const mapped = mapComponentsToColumns({ component_marks, extra_marks, extra_marks_max })

		const { data, error } = await supabase
			.from('cia_marks')
			.insert({
				institutions_id,
				examination_session_id,
				exam_registration_id,
				student_id,
				cia_setting_id,
				cia_round,
				cia_round_name: cia_round_name || null,
				...mapped,
				round_total_marks: round_total_marks || null,
				submission_date: submission_date || new Date().toISOString().slice(0, 10),
				submitted_by: submitted_by || null,
			})
			.select()
			.single()

		if (error) {
			console.error('Error creating CIA marks:', error)
			if (error.code === '23505') {
				return NextResponse.json(
					{ error: 'Marks already exist for this learner in this round' },
					{ status: 400 }
				)
			}
			return NextResponse.json({ error: 'Failed to create marks' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('CIA marks POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function PUT(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()
		const { id, ...updateData } = body

		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		// Check if locked
		const { data: existing } = await supabase
			.from('cia_marks')
			.select('is_locked')
			.eq('id', id)
			.single()

		if (existing?.is_locked) {
			return NextResponse.json(
				{ error: 'Cannot update locked marks. Unlock first.' },
				{ status: 403 }
			)
		}

		// Don't allow changing institution/session after creation
		delete updateData.institutions_id
		delete updateData.examination_session_id
		delete updateData.cia_setting_id
		delete updateData.cia_round

		// Map component_marks/extra_marks payload onto column shape
		const mapped = mapComponentsToColumns({
			component_marks: updateData.component_marks,
			extra_marks: updateData.extra_marks,
			extra_marks_max: updateData.extra_marks_max,
		})
		delete updateData.component_marks

		const { data, error } = await supabase
			.from('cia_marks')
			.update({
				...updateData,
				...mapped,
				updated_at: new Date().toISOString(),
			})
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('Error updating CIA marks:', error)
			return NextResponse.json({ error: 'Failed to update marks' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('CIA marks PUT error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
