import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * DELETE /api/post-exam/bundle-numbers/:id
 */
export async function DELETE(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params

		if (!id) {
			return NextResponse.json({ error: 'Bundle number id is required' }, { status: 400 })
		}

		const { error } = await supabase
			.from('bundle_numbers')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting bundle number:', error)
			return NextResponse.json({ error: 'Failed to delete bundle number' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error in DELETE /api/post-exam/bundle-numbers/[id]:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
