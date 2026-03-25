import { getSupabaseServer } from '@/lib/supabase-server'
import { streamRows } from '@/lib/utils/supabase-fetch-all'

/**
 * API Route: Stream ALL students with progress
 * GET /api/students/fetch-all-stream
 *
 * Returns newline-delimited JSON stream with progress updates
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const institution_id = searchParams.get('institution_id')
	const is_active = searchParams.get('is_active')

	const supabase = getSupabaseServer()

	// Build filters
	const filters: Record<string, any> = {}
	if (institution_id) filters.institution_id = institution_id
	if (is_active !== null) filters.is_active = is_active === 'true'

	// Create a ReadableStream for streaming response
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder()

			try {
				let totalLoaded = 0

				// Get total count first
				let countQuery = supabase
					.from('students')
					.select('*', { count: 'exact', head: true })

				Object.entries(filters).forEach(([key, value]) => {
					countQuery = countQuery.eq(key, value)
				})

				const { count } = await countQuery

				// Send total count
				controller.enqueue(
					encoder.encode(JSON.stringify({ type: 'total', count }) + '\n')
				)

				// Stream data in batches
				for await (const batch of streamRows(supabase, 'students', {
					select: 'id, stu_register_no, student_name, email, phone_number, program_code',
					orderBy: 'stu_register_no',
					ascending: true,
					filters,
					batchSize: 1000
				})) {
					totalLoaded += batch.length

					// Send progress update
					controller.enqueue(
						encoder.encode(JSON.stringify({
							type: 'progress',
							loaded: totalLoaded,
							total: count,
							percentage: count ? Math.round((totalLoaded / count) * 100) : 0
						}) + '\n')
					)

					// Send batch data
					controller.enqueue(
						encoder.encode(JSON.stringify({ type: 'batch', data: batch }) + '\n')
					)
				}

				// Send completion
				controller.enqueue(
					encoder.encode(JSON.stringify({
						type: 'complete',
						total: totalLoaded
					}) + '\n')
				)

				controller.close()

			} catch (error) {
				console.error('Error streaming students:', error)
				controller.enqueue(
					encoder.encode(JSON.stringify({
						type: 'error',
						error: error instanceof Error ? error.message : 'Unknown error'
					}) + '\n')
				)
				controller.close()
			}
		}
	})

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	})
}
