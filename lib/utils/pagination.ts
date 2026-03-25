/**
 * Pagination Utility Functions
 * Reusable pagination helpers for API routes and frontend
 */

// ==================== BACKEND UTILITIES ====================

/**
 * Parse pagination parameters from URL search params
 * @param searchParams - URL search params
 * @returns Pagination configuration with from/to range
 */
export function parsePaginationParams(searchParams: URLSearchParams) {
	const page = parseInt(searchParams.get('page') || '1', 10)
	const pageSize = parseInt(searchParams.get('pageSize') || '10000', 10) // Default 10k for backward compatibility
	const from = (page - 1) * pageSize
	const to = from + pageSize - 1

	return {
		page,
		pageSize,
		from,
		to,
		usePagination: searchParams.has('page') || searchParams.has('pageSize')
	}
}

/**
 * Create pagination metadata from Supabase query results
 * @param count - Total count from Supabase query
 * @param page - Current page number
 * @param pageSize - Items per page
 * @returns Pagination metadata object
 */
export function createPaginationMeta(count: number | null, page: number, pageSize: number) {
	const total = count || 0
	const totalPages = Math.ceil(total / pageSize)

	return {
		page,
		pageSize,
		total,
		totalPages,
		hasMore: page < totalPages,
		hasPrevious: page > 1
	}
}

/**
 * Create a paginated API response
 * @param data - Data array to return
 * @param pagination - Pagination metadata
 * @param usePagination - Whether to wrap in pagination format
 * @returns Formatted response object
 */
export function createPaginatedResponse<T>(
	data: T[],
	pagination: ReturnType<typeof createPaginationMeta>,
	usePagination: boolean = true
) {
	if (usePagination) {
		return {
			data,
			pagination
		}
	}
	// Backward compatibility: return data array directly
	return data
}

// ==================== FRONTEND UTILITIES ====================

/**
 * Pagination state interface for frontend components
 */
export interface PaginationState {
	page: number
	pageSize: number
	total: number
	totalPages: number
	hasMore: boolean
	hasPrevious?: boolean
}

/**
 * Hook-compatible pagination state creator
 * @param initialPageSize - Initial items per page (default: 1000)
 * @returns Initial pagination state
 */
export function createInitialPaginationState(initialPageSize: number = 1000): PaginationState {
	return {
		page: 1,
		pageSize: initialPageSize,
		total: 0,
		totalPages: 0,
		hasMore: false,
		hasPrevious: false
	}
}

/**
 * Build API URL with pagination parameters
 * @param baseUrl - Base API endpoint URL
 * @param page - Page number
 * @param pageSize - Items per page
 * @param additionalParams - Additional query parameters
 * @returns Complete URL with query parameters
 */
export function buildPaginatedUrl(
	baseUrl: string,
	page: number,
	pageSize: number,
	additionalParams?: Record<string, string>
): string {
	const url = new URL(baseUrl, window.location.origin)
	url.searchParams.set('page', page.toString())
	url.searchParams.set('pageSize', pageSize.toString())

	if (additionalParams) {
		Object.entries(additionalParams).forEach(([key, value]) => {
			if (value) {
				url.searchParams.set(key, value)
			}
		})
	}

	return url.toString()
}

/**
 * Fetch paginated data from API
 * @param url - API endpoint URL
 * @param page - Page number
 * @param pageSize - Items per page
 * @param additionalParams - Additional query parameters
 * @returns Promise with data and pagination metadata
 */
export async function fetchPaginatedData<T>(
	url: string,
	page: number = 1,
	pageSize: number = 1000,
	additionalParams?: Record<string, string>
): Promise<{ data: T[], pagination: PaginationState }> {
	const fullUrl = buildPaginatedUrl(url, page, pageSize, additionalParams)
	const response = await fetch(fullUrl)

	if (!response.ok) {
		throw new Error(`Failed to fetch data: ${response.statusText}`)
	}

	const result = await response.json()

	// Handle both paginated and non-paginated responses
	if (Array.isArray(result)) {
		// Non-paginated response (backward compatibility)
		return {
			data: result,
			pagination: {
				page: 1,
				pageSize: result.length,
				total: result.length,
				totalPages: 1,
				hasMore: false,
				hasPrevious: false
			}
		}
	}

	// Paginated response
	return {
		data: result.data || [],
		pagination: result.pagination || createInitialPaginationState(pageSize)
	}
}

/**
 * Calculate range display text (e.g., "Showing 1-10 of 100")
 * @param pagination - Pagination state
 * @returns Range display string
 */
export function getPaginationRangeText(pagination: PaginationState): string {
	const { page, pageSize, total } = pagination

	if (total === 0) {
		return 'Showing 0 items'
	}

	const start = (page - 1) * pageSize + 1
	const end = Math.min(page * pageSize, total)

	return `Showing ${start}-${end} of ${total}`
}

/**
 * Generate page numbers array for pagination controls
 * @param currentPage - Current page number
 * @param totalPages - Total number of pages
 * @param maxButtons - Maximum number of page buttons to show (default: 5)
 * @returns Array of page numbers to display
 */
export function generatePageNumbers(
	currentPage: number,
	totalPages: number,
	maxButtons: number = 5
): (number | string)[] {
	if (totalPages <= maxButtons) {
		return Array.from({ length: totalPages }, (_, i) => i + 1)
	}

	const pages: (number | string)[] = []
	const halfButtons = Math.floor(maxButtons / 2)

	let startPage = Math.max(1, currentPage - halfButtons)
	let endPage = Math.min(totalPages, currentPage + halfButtons)

	// Adjust if at the beginning
	if (currentPage <= halfButtons) {
		endPage = maxButtons
	}

	// Adjust if at the end
	if (currentPage >= totalPages - halfButtons) {
		startPage = totalPages - maxButtons + 1
	}

	// Always show first page
	if (startPage > 1) {
		pages.push(1)
		if (startPage > 2) {
			pages.push('...')
		}
	}

	// Add page numbers
	for (let i = startPage; i <= endPage; i++) {
		pages.push(i)
	}

	// Always show last page
	if (endPage < totalPages) {
		if (endPage < totalPages - 1) {
			pages.push('...')
		}
		pages.push(totalPages)
	}

	return pages
}

// ==================== EXAMPLE USAGE ====================

/**
 * Example API route implementation:
 *
 * ```typescript
 * export async function GET(request: Request) {
 *   const { searchParams } = new URL(request.url)
 *   const { page, pageSize, from, to, usePagination } = parsePaginationParams(searchParams)
 *
 *   const { data, error, count } = await supabase
 *     .from('table_name')
 *     .select('*', { count: 'exact' })
 *     .range(from, to)
 *
 *   const pagination = createPaginationMeta(count, page, pageSize)
 *   const response = createPaginatedResponse(data, pagination, usePagination)
 *
 *   return NextResponse.json(response)
 * }
 * ```
 *
 * Example frontend implementation:
 *
 * ```typescript
 * const [pagination, setPagination] = useState(createInitialPaginationState(100))
 * const [items, setItems] = useState([])
 *
 * const loadData = async (page: number) => {
 *   const { data, pagination: meta } = await fetchPaginatedData(
 *     '/api/items',
 *     page,
 *     pagination.pageSize
 *   )
 *   setItems(data)
 *   setPagination(meta)
 * }
 *
 * // In your component:
 * <div>{getPaginationRangeText(pagination)}</div>
 * <button onClick={() => loadData(pagination.page + 1)} disabled={!pagination.hasMore}>
 *   Next Page
 * </button>
 * ```
 */
