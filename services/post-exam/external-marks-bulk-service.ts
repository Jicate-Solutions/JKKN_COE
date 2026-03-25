/**
 * External Marks Bulk Upload Service
 * Handles all API calls for bulk external marks operations
 */

import type {
	ExternalMark,
	Institution,
	ExamSession,
	Program,
	Course,
	BulkUploadPayload,
	BulkUploadResponse,
	BulkDeleteResponse
} from '@/types/external-marks'

const API_BASE = '/api/post-exam/external-marks-bulk'

/**
 * Fetch all institutions
 */
export async function fetchInstitutions(): Promise<Institution[]> {
	const res = await fetch(`${API_BASE}?action=institutions`)
	if (!res.ok) {
		throw new Error('Failed to fetch institutions')
	}
	return res.json()
}

/**
 * Fetch sessions for an institution
 */
export async function fetchSessions(institutionId: string): Promise<ExamSession[]> {
	const res = await fetch(`${API_BASE}?action=sessions&institutionId=${institutionId}`)
	if (!res.ok) {
		throw new Error('Failed to fetch sessions')
	}
	return res.json()
}

/**
 * Fetch programs for an institution
 */
export async function fetchPrograms(institutionId: string): Promise<Program[]> {
	const res = await fetch(`${API_BASE}?action=programs&institutionId=${institutionId}`)
	if (!res.ok) {
		throw new Error('Failed to fetch programs')
	}
	return res.json()
}

/**
 * Fetch courses for an institution
 */
export async function fetchCourses(institutionId: string): Promise<Course[]> {
	const res = await fetch(`${API_BASE}?action=courses&institutionId=${institutionId}`)
	if (!res.ok) {
		throw new Error('Failed to fetch courses')
	}
	return res.json()
}

/**
 * Fetch external marks with filters
 */
export async function fetchExternalMarks(filters: {
	institutionId: string
	sessionId?: string
	programId?: string
	courseId?: string
}): Promise<ExternalMark[]> {
	let url = `${API_BASE}?action=marks&institutionId=${filters.institutionId}`
	if (filters.sessionId) url += `&sessionId=${filters.sessionId}`
	if (filters.programId) url += `&programId=${filters.programId}`
	if (filters.courseId) url += `&courseId=${filters.courseId}`

	const res = await fetch(url)
	if (!res.ok) {
		const errorData = await res.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to fetch marks data')
	}
	return res.json()
}

/**
 * Bulk upload external marks - processes in batches for better performance
 * @param payload - Upload payload with marks data
 * @param onProgress - Optional callback for progress updates
 */
export async function bulkUploadMarks(
	payload: BulkUploadPayload,
	onProgress?: (current: number, total: number) => void
): Promise<BulkUploadResponse> {
	console.log('=== bulkUploadMarks called ===')
	console.log('payload:', { ...payload, marks_data: `${payload.marks_data.length} rows` })
	console.log('First row sample:', payload.marks_data[0])

	const BATCH_SIZE = 50 // Process 50 rows at a time to avoid timeouts
	const totalRows = payload.marks_data.length

	// If small dataset, process all at once
	if (totalRows <= BATCH_SIZE) {
		return await processSingleBatch(payload)
	}

	// Process in batches for large datasets
	console.log(`Processing ${totalRows} rows in batches of ${BATCH_SIZE}`)

	const aggregatedResult: BulkUploadResponse = {
		total: 0,
		successful: 0,
		failed: 0,
		skipped: 0,
		batch_number: '',
		errors: [],
		validation_errors: []
	}

	let processed = 0
	const batches = Math.ceil(totalRows / BATCH_SIZE)

	for (let i = 0; i < batches; i++) {
		const start = i * BATCH_SIZE
		const end = Math.min(start + BATCH_SIZE, totalRows)
		const batchData = payload.marks_data.slice(start, end)

		console.log(`Processing batch ${i + 1}/${batches}: rows ${start + 1} to ${end}`)

		const batchPayload: BulkUploadPayload = {
			...payload,
			marks_data: batchData
		}

		try {
			const batchResult = await processSingleBatch(batchPayload)

			// Aggregate results
			aggregatedResult.total += batchResult.total
			aggregatedResult.successful += batchResult.successful
			aggregatedResult.failed += batchResult.failed
			aggregatedResult.skipped += batchResult.skipped
			aggregatedResult.batch_number = batchResult.batch_number // Use last batch number

			if (batchResult.errors) {
				// Adjust row numbers for batch offset
				const adjustedErrors = batchResult.errors.map(err => ({
					...err,
					row: err.row + start
				}))
				aggregatedResult.errors = [...(aggregatedResult.errors || []), ...adjustedErrors]
			}
			if (batchResult.validation_errors) {
				const adjustedValidationErrors = batchResult.validation_errors.map(err => ({
					...err,
					row: err.row + start
				}))
				aggregatedResult.validation_errors = [...(aggregatedResult.validation_errors || []), ...adjustedValidationErrors]
			}

			processed = end

			// Report progress
			if (onProgress) {
				onProgress(processed, totalRows)
			}

		} catch (error) {
			console.error(`Batch ${i + 1} failed:`, error)
			// Continue with remaining batches even if one fails
			aggregatedResult.failed += batchData.length
			processed = end

			if (onProgress) {
				onProgress(processed, totalRows)
			}
		}

		// Small delay between batches to prevent overwhelming the server
		if (i < batches - 1) {
			await new Promise(resolve => setTimeout(resolve, 100))
		}
	}

	console.log('=== Batch processing complete ===', aggregatedResult)
	return aggregatedResult
}

/**
 * Process a single batch of marks data
 */
async function processSingleBatch(payload: BulkUploadPayload): Promise<BulkUploadResponse> {
	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 60000) // 1 minute timeout per batch

		const res = await fetch(API_BASE, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
			signal: controller.signal
		})

		clearTimeout(timeoutId)

		console.log('API response status:', res.status)
		const result = await res.json()
		console.log('API response result:', result)

		if (!res.ok) {
			throw new Error(result.error || 'Upload failed')
		}

		return result
	} catch (error: any) {
		console.error('=== processSingleBatch error ===', error)
		if (error.name === 'AbortError') {
			throw new Error('Batch upload timed out.')
		}
		throw error
	}
}

/**
 * Bulk delete external marks
 */
export async function bulkDeleteMarks(ids: string[]): Promise<BulkDeleteResponse> {
	const res = await fetch(API_BASE, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'bulk-delete',
			ids
		})
	})

	const result = await res.json()

	if (!res.ok) {
		// Return the result even on error as it may contain non_deletable info
		if (result.non_deletable) {
			return result
		}
		throw new Error(result.error || 'Delete failed')
	}

	return result
}
