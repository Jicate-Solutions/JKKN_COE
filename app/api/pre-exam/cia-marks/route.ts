import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

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
			round_total_marks,
			ai_tools_score,
			ai_tools_max_marks,
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
				component_marks: component_marks || {},
				round_total_marks: round_total_marks || null,
				ai_tools_score: ai_tools_score || null,
				ai_tools_max_marks: ai_tools_max_marks || null,
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

		const { data, error } = await supabase
			.from('cia_marks')
			.update({
				...updateData,
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
