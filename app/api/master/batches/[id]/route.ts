import { NextRequest, NextResponse } from 'next/server'
import { BATCHES_READ_ONLY_MESSAGE, loadBatchById } from '@/lib/api-helpers/myjkkn-batches'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Batches are mastered in MyJKKN (see ../route.ts).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params
		const batch = UUID.test(id) ? await loadBatchById(id) : null
		if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
		return NextResponse.json(batch)
	} catch (err) {
		console.error('[master/batches] Could not load the batch from MyJKKN:', err)
		return NextResponse.json({ error: 'Unable to load the batch right now. Try again later.' }, { status: 502 })
	}
}

export async function PUT() {
	return NextResponse.json({ error: BATCHES_READ_ONLY_MESSAGE }, { status: 405 })
}

export async function DELETE() {
	return NextResponse.json({ error: BATCHES_READ_ONLY_MESSAGE }, { status: 405 })
}
