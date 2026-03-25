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
