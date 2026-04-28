import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
	try {
		const { id } = await params
		const supabase = getSupabaseServer()

		const { data, error } = await supabase
			.from('cia_marks')
			.select('*')
			.eq('id', id)
			.single()

		if (error || !data) {
			return NextResponse.json({ error: 'Mark not found' }, { status: 404 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('CIA marks GET [id] error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function PUT(request: Request, { params }: Ctx) {
	try {
		const { id } = await params
		const supabase = getSupabaseServer()
		const body = await request.json()

		// Check if locked
		const { data: existing } = await supabase
			.from('cia_marks')
			.select('is_locked')
			.eq('id', id)
			.single()

		if (existing?.is_locked) {
			return NextResponse.json(
				{ error: 'Cannot update locked marks' },
				{ status: 403 }
			)
		}

		const { data, error } = await supabase
			.from('cia_marks')
			.update({
				...body,
				updated_at: new Date().toISOString(),
			})
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('Error updating CIA mark:', error)
			return NextResponse.json({ error: 'Failed to update mark' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('CIA marks PUT [id] error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function DELETE(request: Request, { params }: Ctx) {
	try {
		const { id } = await params
		const supabase = getSupabaseServer()

		// Check if locked
		const { data: existing } = await supabase
			.from('cia_marks')
			.select('is_locked')
			.eq('id', id)
			.single()

		if (existing?.is_locked) {
			return NextResponse.json(
				{ error: 'Cannot delete locked marks' },
				{ status: 403 }
			)
		}

		const { error } = await supabase
			.from('cia_marks')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting CIA mark:', error)
			return NextResponse.json({ error: 'Failed to delete mark' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('CIA marks DELETE [id] error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
