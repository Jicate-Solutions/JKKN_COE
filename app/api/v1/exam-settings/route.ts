import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

const DEFAULT_STUDENTS_PER_BUNDLE = 60

// GET: Fetch exam settings for an institution
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institution_id')

		if (!institutionId) {
			return NextResponse.json(
				{ error: 'Missing required parameter: institution_id' },
				{ status: 400 }
			)
		}

		const { data, error } = await supabase
			.from('exam_settings')
			.select('id, institutions_id, students_per_bundle, created_at, updated_at')
			.eq('institutions_id', institutionId)
			.maybeSingle()

		if (error) {
			console.error('Error fetching exam settings:', error)
			return NextResponse.json(
				{ error: error.message || 'Failed to fetch exam settings' },
				{ status: 500 }
			)
		}

		// Return defaults if no row exists yet
		if (!data) {
			return NextResponse.json({
				institutions_id: institutionId,
				students_per_bundle: DEFAULT_STUDENTS_PER_BUNDLE,
				is_default: true
			})
		}

		return NextResponse.json({ ...data, is_default: false })
	} catch (err) {
		console.error('Unexpected error in GET /api/v1/exam-settings:', err)
		const message = err instanceof Error ? err.message : 'Unexpected server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

// PUT: Upsert exam settings for an institution
export async function PUT(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const institutionId: string | undefined = body.institutions_id
		const studentsPerBundle: number | undefined = body.students_per_bundle

		if (!institutionId) {
			return NextResponse.json(
				{ error: 'Missing required field: institutions_id' },
				{ status: 400 }
			)
		}

		if (
			typeof studentsPerBundle !== 'number' ||
			!Number.isInteger(studentsPerBundle) ||
			studentsPerBundle <= 0 ||
			studentsPerBundle > 500
		) {
			return NextResponse.json(
				{ error: 'students_per_bundle must be an integer between 1 and 500' },
				{ status: 400 }
			)
		}

		const { data, error } = await supabase
			.from('exam_settings')
			.upsert(
				{
					institutions_id: institutionId,
					students_per_bundle: studentsPerBundle
				},
				{ onConflict: 'institutions_id' }
			)
			.select('id, institutions_id, students_per_bundle, created_at, updated_at')
			.single()

		if (error) {
			console.error('Error upserting exam settings:', error)
			return NextResponse.json(
				{ error: error.message || 'Failed to save exam settings' },
				{ status: 500 }
			)
		}

		return NextResponse.json(data)
	} catch (err) {
		console.error('Unexpected error in PUT /api/v1/exam-settings:', err)
		const message = err instanceof Error ? err.message : 'Unexpected server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
