# Server-Side Pagination Guide

## Overview

This document describes the server-side pagination implementation for handling large datasets (>10,000 rows) in the JKKN COE application.

## Problem Statement

**Supabase/PostgREST Limits:**
- Default: 1,000 rows
- Fixed limit (with `.range()`): 10,000 rows
- For tables exceeding 10,000 rows: Requires server-side pagination

## Solution Architecture

### Three-Tier Approach

1. **Small Datasets (<1,000 rows)**: Default behavior, no pagination needed
2. **Medium Datasets (1,000-10,000 rows)**: Use `.range(0, 9999)` static limit
3. **Large Datasets (>10,000 rows)**: Implement dynamic server-side pagination

---

## Backend Implementation

### Step 1: Update API Route

**File:** `app/api/[entity]/route.ts`

```typescript
import { parsePaginationParams, createPaginationMeta, createPaginatedResponse } from '@/lib/utils/pagination'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Parse pagination parameters
		const { page, pageSize, from, to, usePagination } = parsePaginationParams(searchParams)

		// Build query with pagination
		let query = supabase
			.from('table_name')
			.select('*', { count: 'exact' }) // IMPORTANT: Add count: 'exact'
			.order('created_at', { ascending: false })
			.range(from, to) // Dynamic range based on page

		// Apply filters
		const filter = searchParams.get('filter')
		if (filter) {
			query = query.eq('field', filter)
		}

		// Execute query with count
		const { data, error, count } = await query

		if (error) {
			return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
		}

		// Create pagination metadata
		const pagination = createPaginationMeta(count, page, pageSize)

		// Return response (backward compatible)
		const response = createPaginatedResponse(data || [], pagination, usePagination)

		return NextResponse.json(response)
	} catch (e) {
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

### API Response Formats

#### Without Pagination (Backward Compatible)
```
GET /api/items
```

**Response:**
```json
[
  { "id": "1", "name": "Item 1" },
  { "id": "2", "name": "Item 2" }
]
```

#### With Pagination
```
GET /api/items?page=2&pageSize=100
```

**Response:**
```json
{
  "data": [
    { "id": "101", "name": "Item 101" },
    { "id": "102", "name": "Item 102" }
  ],
  "pagination": {
    "page": 2,
    "pageSize": 100,
    "total": 15420,
    "totalPages": 155,
    "hasMore": true,
    "hasPrevious": true
  }
}
```

---

## Frontend Implementation

### Step 1: Add Pagination State

```typescript
import { useState, useEffect } from 'react'
import {
	createInitialPaginationState,
	fetchPaginatedData,
	getPaginationRangeText,
	type PaginationState
} from '@/lib/utils/pagination'

export default function MyPage() {
	const [items, setItems] = useState([])
	const [loading, setLoading] = useState(false)
	const [pagination, setPagination] = useState(createInitialPaginationState(100))

	// Fetch data with pagination
	const loadData = async (page: number = 1) => {
		try {
			setLoading(true)
			const { data, pagination: meta } = await fetchPaginatedData(
				'/api/items',
				page,
				pagination.pageSize,
				{
					filter: 'active', // Additional filters
					status: 'approved'
				}
			)
			setItems(data)
			setPagination(meta)
		} catch (error) {
			console.error('Error loading data:', error)
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		loadData(1)
	}, [])

	return (
		<div>
			{/* Data display */}
			<div className="data-container">
				{items.map(item => (
					<div key={item.id}>{item.name}</div>
				))}
			</div>

			{/* Pagination controls */}
			<div className="pagination-controls">
				<div className="text-sm text-muted-foreground">
					{getPaginationRangeText(pagination)}
				</div>
				<div className="flex gap-2">
					<Button
						disabled={!pagination.hasPrevious || loading}
						onClick={() => loadData(pagination.page - 1)}
					>
						Previous
					</Button>
					<span className="px-4 py-2">
						Page {pagination.page} of {pagination.totalPages}
					</span>
					<Button
						disabled={!pagination.hasMore || loading}
						onClick={() => loadData(pagination.page + 1)}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	)
}
```

### Step 2: Advanced Pagination UI

For a more advanced pagination UI with page numbers:

```typescript
import { generatePageNumbers } from '@/lib/utils/pagination'

function PaginationControls({ pagination, onPageChange, loading }) {
	const pageNumbers = generatePageNumbers(pagination.page, pagination.totalPages)

	return (
		<div className="flex items-center justify-between mt-4">
			{/* Range text */}
			<div className="text-sm text-muted-foreground">
				{getPaginationRangeText(pagination)}
			</div>

			{/* Page controls */}
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={!pagination.hasPrevious || loading}
					onClick={() => onPageChange(pagination.page - 1)}
				>
					<ChevronLeft className="h-4 w-4 mr-1" />
					Previous
				</Button>

				{/* Page numbers */}
				<div className="flex gap-1">
					{pageNumbers.map((pageNum, idx) => {
						if (pageNum === '...') {
							return <span key={`ellipsis-${idx}`} className="px-2">...</span>
						}
						const isActive = pageNum === pagination.page
						return (
							<Button
								key={pageNum}
								variant={isActive ? "default" : "outline"}
								size="sm"
								className="min-w-[40px]"
								disabled={loading}
								onClick={() => onPageChange(pageNum as number)}
							>
								{pageNum}
							</Button>
						)
					})}
				</div>

				<Button
					variant="outline"
					size="sm"
					disabled={!pagination.hasMore || loading}
					onClick={() => onPageChange(pagination.page + 1)}
				>
					Next
					<ChevronRight className="h-4 w-4 ml-1" />
				</Button>
			</div>
		</div>
	)
}
```

---

## Migration Guide

### Converting Existing Pages to Pagination

#### Before (Client-side pagination only):

```typescript
const [items, setItems] = useState([])
const [currentPage, setCurrentPage] = useState(1)
const itemsPerPage = 10

const fetchData = async () => {
	const response = await fetch('/api/items')
	const data = await response.json()
	setItems(data) // All data loaded at once
}

// Client-side slicing
const pageItems = items.slice(
	(currentPage - 1) * itemsPerPage,
	currentPage * itemsPerPage
)
```

#### After (Server-side pagination):

```typescript
const [items, setItems] = useState([])
const [pagination, setPagination] = useState(createInitialPaginationState(10))

const fetchData = async (page: number) => {
	const { data, pagination: meta } = await fetchPaginatedData(
		'/api/items',
		page,
		10 // pageSize
	)
	setItems(data) // Only current page loaded
	setPagination(meta)
}

// No client-side slicing needed
const pageItems = items // Already paginated by server
```

---

## Performance Considerations

### When to Use Pagination

| Table Size | Strategy | Reason |
|------------|----------|--------|
| < 1,000 | Default (no pagination) | Fast enough, simple implementation |
| 1,000 - 10,000 | Static `.range(0, 9999)` | Good performance, backward compatible |
| > 10,000 | Server-side pagination | Required for scalability |

### Optimization Tips

1. **Index Database Columns**: Ensure `created_at` or sort columns are indexed
2. **Cache Results**: Consider Redis caching for frequently accessed pages
3. **Lazy Loading**: Load initial page quickly, fetch more as needed
4. **Virtual Scrolling**: For very large lists, use virtualization libraries
5. **Preload Next Page**: Preload next page in background for better UX

---

## Testing Checklist

- [ ] API returns correct data count
- [ ] First page loads correctly
- [ ] Last page loads correctly
- [ ] Middle pages load correctly
- [ ] Empty result sets handled
- [ ] Filtering works with pagination
- [ ] Sorting maintains across pages
- [ ] Backward compatibility (no page param)
- [ ] Page size changes work correctly
- [ ] Total count is accurate

---

## API Routes Using Pagination

### Currently Implemented
✅ `app/api/exam-registrations/route.ts` - Full pagination support

### Recommended for Pagination
- `app/api/students/route.ts` - Large student populations
- `app/api/courses/route.ts` - Extensive course catalogs
- `app/api/course-offering/route.ts` - Many offerings per session
- `app/api/exam-attendance/route.ts` - High volume attendance records

### May Not Need Pagination
- `app/api/institutions/route.ts` - Limited number of institutions
- `app/api/departments/route.ts` - Limited number of departments
- `app/api/regulations/route.ts` - Limited number of regulations
- `app/api/semesters/route.ts` - Limited number of semesters

---

## Common Patterns

### Pattern 1: Infinite Scroll

```typescript
const [items, setItems] = useState([])
const [pagination, setPagination] = useState(createInitialPaginationState(50))

const loadMore = async () => {
	if (!pagination.hasMore) return

	const { data, pagination: meta } = await fetchPaginatedData(
		'/api/items',
		pagination.page + 1,
		pagination.pageSize
	)

	setItems(prev => [...prev, ...data]) // Append to existing
	setPagination(meta)
}

// Use with intersection observer or scroll event
```

### Pattern 2: Search with Pagination

```typescript
const [searchTerm, setSearchTerm] = useState('')
const [pagination, setPagination] = useState(createInitialPaginationState(20))

const search = async (query: string, page: number = 1) => {
	const { data, pagination: meta } = await fetchPaginatedData(
		'/api/items',
		page,
		pagination.pageSize,
		{ search: query }
	)

	setItems(data)
	setPagination(meta)
}

// Reset to page 1 when search changes
useEffect(() => {
	search(searchTerm, 1)
}, [searchTerm])
```

### Pattern 3: Combined Client + Server Pagination

```typescript
// For dropdown filters: Fetch all options without pagination
const fetchFilterOptions = async () => {
	const response = await fetch('/api/filter-options') // No page param
	return response.json() // Returns all data
}

// For main data: Use server-side pagination
const fetchData = async (page: number) => {
	const { data, pagination } = await fetchPaginatedData(
		'/api/items',
		page,
		100
	)
	return { data, pagination }
}
```

---

## Troubleshooting

### Issue: Count is incorrect

**Solution:** Ensure `{ count: 'exact' }` is in the select:
```typescript
.select('*', { count: 'exact' })
```

### Issue: Old code breaks after adding pagination

**Solution:** The implementation is backward compatible. Without `page` or `pageSize` params, it returns data array directly.

### Issue: Performance degradation with large offsets

**Solution:** Use cursor-based pagination for very large datasets:
```typescript
.select('*')
.gt('id', lastId)
.limit(pageSize)
```

### Issue: Total count is slow

**Solution:** Cache the count or use estimated count:
```typescript
.select('*', { count: 'estimated' })
```

---

## Best Practices

1. **Always include total count** for accurate pagination
2. **Use reasonable page sizes** (50-200 items typically)
3. **Show loading states** during pagination transitions
4. **Preserve user context** (filters, search) across pages
5. **Cache previous pages** when using infinite scroll
6. **Debounce search** to avoid excessive API calls
7. **Handle edge cases** (empty results, single page, etc.)
8. **Test with real data volumes** matching production

---

## References

- [Supabase Pagination Docs](https://supabase.com/docs/guides/api/pagination)
- [PostgREST Range Headers](https://postgrest.org/en/stable/api.html#limits-and-pagination)
- [Pagination Utility Source](../lib/utils/pagination.ts)
- [Example Implementation](../app/api/exam-registrations/route.ts)

---

**Last Updated:** 2025-01-03
**Version:** 1.0
**Status:** ✅ Production Ready
