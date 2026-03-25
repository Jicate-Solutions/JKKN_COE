/**
 * Fetch all rows from a Supabase table, bypassing the 1000 row limit
 * Uses pagination to fetch data in batches
 */

import { SupabaseClient } from '@supabase/supabase-js'

interface FetchAllOptions {
	batchSize?: number // Default: 1000 (Supabase default limit)
	orderBy?: string // Column to order by for consistent pagination
	ascending?: boolean // Sort order
	filters?: Record<string, any> // Additional filters
	select?: string // Select specific columns (default: '*')
}

/**
 * Fetch all rows from a table using pagination
 * @param supabase - Supabase client instance
 * @param tableName - Name of the table to query
 * @param options - Pagination and filter options
 * @returns Array of all rows
 */
export async function fetchAllRows<T = any>(
	supabase: SupabaseClient,
	tableName: string,
	options: FetchAllOptions = {}
): Promise<T[]> {
	const {
		batchSize = 1000,
		orderBy = 'created_at',
		ascending = true,
		filters = {},
		select = '*'
	} = options

	let allData: T[] = []
	let from = 0
	let hasMore = true

	console.log(`Starting to fetch all rows from ${tableName}...`)

	while (hasMore) {
		console.log(`Fetching rows ${from} to ${from + batchSize - 1}...`)

		// Build query
		let query = supabase
			.from(tableName)
			.select(select)
			.range(from, from + batchSize - 1)
			.order(orderBy, { ascending })

		// Apply filters
		Object.entries(filters).forEach(([key, value]) => {
			query = query.eq(key, value)
		})

		const { data, error } = await query

		if (error) {
			console.error(`Error fetching rows from ${tableName}:`, error)
			throw new Error(`Failed to fetch data: ${error.message}`)
		}

		if (data && data.length > 0) {
			allData = [...allData, ...data]
			from += batchSize

			// If we got fewer rows than batchSize, we've reached the end
			hasMore = data.length === batchSize
		} else {
			hasMore = false
		}
	}

	console.log(`Successfully fetched ${allData.length} rows from ${tableName}`)
	return allData
}

/**
 * Fetch all rows with a progress callback
 * Useful for showing loading progress in UI
 */
export async function fetchAllRowsWithProgress<T = any>(
	supabase: SupabaseClient,
	tableName: string,
	onProgress: (loaded: number, total?: number) => void,
	options: FetchAllOptions = {}
): Promise<T[]> {
	const {
		batchSize = 1000,
		orderBy = 'created_at',
		ascending = true,
		filters = {},
		select = '*'
	} = options

	let allData: T[] = []
	let from = 0
	let hasMore = true

	// Get total count first (optional, but helps with progress)
	let query = supabase
		.from(tableName)
		.select('*', { count: 'exact', head: true })

	Object.entries(filters).forEach(([key, value]) => {
		query = query.eq(key, value)
	})

	const { count } = await query

	console.log(`Total rows to fetch: ${count}`)

	while (hasMore) {
		// Build query
		let dataQuery = supabase
			.from(tableName)
			.select(select)
			.range(from, from + batchSize - 1)
			.order(orderBy, { ascending })

		// Apply filters
		Object.entries(filters).forEach(([key, value]) => {
			dataQuery = dataQuery.eq(key, value)
		})

		const { data, error } = await dataQuery

		if (error) {
			throw new Error(`Failed to fetch data: ${error.message}`)
		}

		if (data && data.length > 0) {
			allData = [...allData, ...data]
			from += batchSize

			// Call progress callback
			onProgress(allData.length, count || undefined)

			hasMore = data.length === batchSize
		} else {
			hasMore = false
		}
	}

	return allData
}

/**
 * Stream rows in batches without loading all into memory at once
 * Best for processing large datasets that don't need to be in memory simultaneously
 */
export async function* streamRows<T = any>(
	supabase: SupabaseClient,
	tableName: string,
	options: FetchAllOptions = {}
): AsyncGenerator<T[], void, unknown> {
	const {
		batchSize = 1000,
		orderBy = 'created_at',
		ascending = true,
		filters = {},
		select = '*'
	} = options

	let from = 0
	let hasMore = true

	while (hasMore) {
		// Build query
		let query = supabase
			.from(tableName)
			.select(select)
			.range(from, from + batchSize - 1)
			.order(orderBy, { ascending })

		// Apply filters
		Object.entries(filters).forEach(([key, value]) => {
			query = query.eq(key, value)
		})

		const { data, error } = await query

		if (error) {
			throw new Error(`Failed to fetch data: ${error.message}`)
		}

		if (data && data.length > 0) {
			yield data // Yield batch to caller
			from += batchSize
			hasMore = data.length === batchSize
		} else {
			hasMore = false
		}
	}
}
