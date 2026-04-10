import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { handleDeleteWithDependencyCheck } from '@/lib/delete-helpers'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institution_code = searchParams.get('institution_code')
		const institutions_id = searchParams.get('institutions_id')

		let query = supabase
			.from('board')
			.select('*')
			.order('board_name', { ascending: true })

		// Institution filtering - supports both institution_code and institutions_id
		if (institution_code) {
			query = query.eq('institution_code', institution_code)
		} else if (institutions_id) {
			query = query.eq('institutions_id', institutions_id)
		}

		const { data, error } = await query.range(0, 9999)

		if (error) {
			console.error('Board table error:', error)
			return NextResponse.json({ error: 'Failed to fetch boards' }, { status: 500 })
		}

		const normalized = (data || []).map((row: any) => ({
			...row,
			is_active: row.status ?? row.is_active ?? true,
		}))
		return NextResponse.json(normalized)
	} catch (e) {
		console.error('Board API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Auto-map institution_code to institutions_id
		let institution_code: string | undefined = body.institution_code
		let institutions_id: string | undefined = body.institutions_id

		// If institution_code is provided, fetch institutions_id
		if (institution_code) {
			const { data: institutionData, error: institutionError } = await supabase
				.from('institutions')
				.select('id, institution_code')
				.eq('institution_code', institution_code)
				.maybeSingle()

			if (institutionError || !institutionData) {
				return NextResponse.json({
					error: `Invalid institution_code: ${institution_code}. Institution not found.`
				}, { status: 400 })
			}

			// Auto-map the institutions_id from the fetched institution
			institutions_id = institutionData.id
			console.log(`✅ Auto-mapped institution_code "${institution_code}" to institutions_id "${institutions_id}"`)
		}
		// If institutions_id is provided but no institution_code, fetch the code
		else if (institutions_id && !institution_code) {
			const { data: institutionData } = await supabase
				.from('institutions')
				.select('institution_code')
				.eq('id', institutions_id)
				.maybeSingle()
			if (institutionData?.institution_code) {
				institution_code = institutionData.institution_code
			}
		}

		// Validate required fields
		if (!institution_code || !institutions_id) {
			return NextResponse.json({
				error: 'institution_code is required and must be valid'
			}, { status: 400 })
		}

		if (!body.board_code || !body.board_code.trim()) {
			return NextResponse.json({
				error: 'board_code is required'
			}, { status: 400 })
		}

		if (!body.board_name || !body.board_name.trim()) {
			return NextResponse.json({
				error: 'board_name is required'
			}, { status: 400 })
		}

		const insertPayload: any = {
			institution_code: institution_code,
			institutions_id: institutions_id,
			board_code: body.board_code,
			board_name: body.board_name,
			display_name: body.display_name || null,
			board_type: body.board_type || null,
			board_order: body.board_order || null,
			status: body.is_active ?? true,
		}

		const { data, error } = await supabase
			.from('board')
			.insert([insertPayload])
			.select()
			.single()

		if (error) {
			console.error('Error creating board:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Board already exists with this code for the selected institution. Please use different values.'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select a valid institution.'
				}, { status: 400 })
			}

			// Check if it's a foreign key constraint error (legacy)
			if (error.message.includes('board_institutions_id_fkey')) {
				return NextResponse.json({ error: 'Invalid institution' }, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to create board' }, { status: 500 })
		}

		const normalized = data ? { ...data, is_active: (data as any).status ?? (data as any).is_active ?? true } : data
		return NextResponse.json(normalized, { status: 201 })
	} catch (e) {
		console.error('Board creation error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		if (!body.id) {
			return NextResponse.json({ error: 'Board ID is required' }, { status: 400 })
		}

		// Don't allow changing institution after creation
		const updatePayload: any = {
			board_code: body.board_code,
			board_name: body.board_name,
			display_name: body.display_name || null,
			board_type: body.board_type || null,
			board_order: body.board_order || null,
			status: body.is_active,
		}

		const { data, error } = await supabase
			.from('board')
			.update(updatePayload)
			.eq('id', body.id)
			.select()
			.single()

		if (error) {
			console.error('Error updating board:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Board already exists with this code for the selected institution. Please use different values.'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select a valid institution.'
				}, { status: 400 })
			}

			// Check if it's a foreign key constraint error (legacy)
			if (error.message.includes('board_institutions_id_fkey')) {
				return NextResponse.json({ error: 'Invalid institution' }, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to update board' }, { status: 500 })
		}

		const normalized = data ? { ...data, is_active: (data as any).status ?? (data as any).is_active ?? true } : data
		return NextResponse.json(normalized)
	} catch (e) {
		console.error('Board update error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Board ID is required' }, { status: 400 })
		}

		return handleDeleteWithDependencyCheck('board', id, request)
	} catch (e) {
		console.error('Board deletion error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
