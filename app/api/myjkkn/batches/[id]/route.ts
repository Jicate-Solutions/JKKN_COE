import { NextRequest, NextResponse } from 'next/server'
import { fetchMyJKKNBatchById, MyJKKNApiError } from '@/lib/myjkkn-api'

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params

		if (!id) {
			return NextResponse.json(
				{ error: 'Batch ID is required' },
				{ status: 400 }
			)
		}

		// The id is placed in the upstream URL; anything but a UUID ("../..")
		// could steer the request to a different MyJKKN endpoint under our API key.
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
			return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
		}

		const batch = await fetchMyJKKNBatchById(id)
		return NextResponse.json(batch)
	} catch (error) {
		console.error('Error fetching batch from MyJKKN:', error)
		if (error instanceof MyJKKNApiError) {
			return NextResponse.json(
				{ error: error.message, status: error.status, details: error.details },
				{ status: error.status }
			)
		}
		return NextResponse.json(
			{ error: 'Failed to fetch batch from MyJKKN' },
			{ status: 500 }
		)
	}
}
