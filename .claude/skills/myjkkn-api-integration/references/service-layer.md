# MyJKKN Service Layer Reference

Complete service layer implementation for the MyJKKN API integration.

## File Location

`services/myjkkn-service.ts`

## Complete Implementation

```typescript
/**
 * MyJKKN Service
 *
 * Service layer for interacting with the MyJKKN external API.
 * Handles all data fetching and business logic for MyJKKN integration.
 */

import type {
  MyJKKNPaginatedResponse,
  MyJKKNSingleResponse,
  MyJKKNInstitution,
  MyJKKNInstitutionFetchOptions,
  MyJKKNDepartment,
  MyJKKNDepartmentFetchOptions,
  MyJKKNProgram,
  MyJKKNProgramFetchOptions,
  MyJKKNDegree,
  MyJKKNDegreeFetchOptions,
  MyJKKNCourse,
  MyJKKNCourseFetchOptions,
  MyJKKNSemester,
  MyJKKNSemesterFetchOptions,
  MyJKKNStudent,
  MyJKKNStudentFetchOptions,
  MyJKKNStaff,
  MyJKKNStaffFetchOptions,
} from '@/types/myjkkn'

// ==================== Configuration ====================

function getBaseUrl(): string {
  return process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
}

function getApiKey(): string {
  return process.env.MYJKKN_API_KEY || ''
}

// ==================== Error Class ====================

export class MyJKKNApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MyJKKNApiError'
    this.status = status
  }
}

// ==================== Core Fetch Function ====================

async function fetchFromMyJKKN<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = getApiKey()
  const baseUrl = getBaseUrl()

  console.log('[MyJKKN Service] API Key present:', !!apiKey)

  if (!apiKey) {
    throw new MyJKKNApiError('MYJKKN_API_KEY is not configured', 500)
  }

  const url = `${baseUrl}${endpoint}`
  console.log('[MyJKKN Service] Fetching:', url)

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...options.headers,
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  console.log('[MyJKKN Service] Response status:', response.status)

  if (!response.ok) {
    let errorMessage = 'Failed to fetch from MyJKKN API'

    try {
      const errorData = await response.json()
      errorMessage = errorData.message || errorData.error || errorMessage
    } catch {
      // Use default error message
    }

    throw new MyJKKNApiError(errorMessage, response.status)
  }

  return response.json()
}

// ==================== Institution Service ====================

export async function fetchMyJKKNInstitutions(
  options: MyJKKNInstitutionFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNInstitution>> {
  const params = new URLSearchParams()

  params.append('page', String(options.page || 1))
  params.append('limit', String(options.limit || 10))

  if (options.search) params.append('search', options.search)
  if (options.is_active !== undefined) params.append('isActive', String(options.is_active))

  const endpoint = `/api-management/organizations/institutions?${params.toString()}`
  return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNInstitution>>(endpoint)
}

export async function fetchAllMyJKKNInstitutions(
  options: Omit<MyJKKNInstitutionFetchOptions, 'page'> = {}
): Promise<MyJKKNInstitution[]> {
  const allInstitutions: MyJKKNInstitution[] = []
  let currentPage = 1
  let totalPages = 1

  do {
    const response = await fetchMyJKKNInstitutions({
      ...options,
      page: currentPage,
      limit: options.limit || 100,
    })

    allInstitutions.push(...response.data)
    totalPages = response.metadata.totalPages
    currentPage++
  } while (currentPage <= totalPages)

  return allInstitutions
}

// ==================== Department Service ====================

export async function fetchMyJKKNDepartments(
  options: MyJKKNDepartmentFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNDepartment>> {
  const params = new URLSearchParams()

  params.append('page', String(options.page || 1))
  params.append('limit', String(options.limit || 10))

  if (options.search) params.append('search', options.search)
  if (options.institution_id) params.append('institution_id', options.institution_id)
  if (options.degree_id) params.append('degree_id', options.degree_id)
  if (options.is_active !== undefined) params.append('isActive', String(options.is_active))

  const endpoint = `/api-management/organizations/departments?${params.toString()}`
  return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNDepartment>>(endpoint)
}

export async function fetchAllMyJKKNDepartments(
  options: Omit<MyJKKNDepartmentFetchOptions, 'page'> = {}
): Promise<MyJKKNDepartment[]> {
  const allDepartments: MyJKKNDepartment[] = []
  let currentPage = 1
  let totalPages = 1

  do {
    const response = await fetchMyJKKNDepartments({
      ...options,
      page: currentPage,
      limit: options.limit || 100,
    })

    allDepartments.push(...response.data)
    totalPages = response.metadata.totalPages
    currentPage++
  } while (currentPage <= totalPages)

  return allDepartments
}

// ==================== Student Service ====================

export async function fetchMyJKKNStudents(
  options: MyJKKNStudentFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNStudent>> {
  const params = new URLSearchParams()

  params.append('page', String(options.page || 1))
  params.append('limit', String(options.limit || 10))

  if (options.search) params.append('search', options.search)
  if (options.institution_id) params.append('institution_id', options.institution_id)
  if (options.department_id) params.append('department_id', options.department_id)
  if (options.program_id) params.append('program_id', options.program_id)
  if (options.is_profile_complete !== undefined) {
    params.append('is_profile_complete', String(options.is_profile_complete))
  }

  const endpoint = `/api-management/students?${params.toString()}`
  return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNStudent>>(endpoint)
}

export async function fetchMyJKKNStudentById(
  id: string
): Promise<MyJKKNSingleResponse<MyJKKNStudent>> {
  const endpoint = `/api-management/students/${id}`
  return fetchFromMyJKKN<MyJKKNSingleResponse<MyJKKNStudent>>(endpoint)
}

export async function fetchAllMyJKKNStudents(
  options: Omit<MyJKKNStudentFetchOptions, 'page'> = {}
): Promise<MyJKKNStudent[]> {
  const allStudents: MyJKKNStudent[] = []
  let currentPage = 1
  let totalPages = 1

  do {
    const response = await fetchMyJKKNStudents({
      ...options,
      page: currentPage,
      limit: options.limit || 100,
    })

    allStudents.push(...response.data)
    totalPages = response.metadata.totalPages
    currentPage++
  } while (currentPage <= totalPages)

  return allStudents
}

// ==================== Staff Service ====================

export async function fetchMyJKKNStaff(
  options: MyJKKNStaffFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNStaff>> {
  const params = new URLSearchParams()

  if (options.all) {
    params.append('all', 'true')
  } else {
    params.append('page', String(options.page || 1))
    params.append('limit', String(options.limit || 10))
  }

  if (options.search) params.append('search', options.search)
  if (options.institution_id) params.append('institution_id', options.institution_id)
  if (options.department_id) params.append('department_id', options.department_id)
  if (options.category_id) params.append('category_id', options.category_id)
  if (options.is_active !== undefined) params.append('is_active', String(options.is_active))

  const endpoint = `/api-management/staff?${params.toString()}`
  return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNStaff>>(endpoint)
}

export async function fetchMyJKKNStaffById(
  id: string
): Promise<MyJKKNSingleResponse<MyJKKNStaff>> {
  const endpoint = `/api-management/staff/${id}`
  return fetchFromMyJKKN<MyJKKNSingleResponse<MyJKKNStaff>>(endpoint)
}

export async function fetchAllMyJKKNStaff(
  options: Omit<MyJKKNStaffFetchOptions, 'page' | 'limit' | 'all'> = {}
): Promise<MyJKKNStaff[]> {
  const response = await fetchMyJKKNStaff({
    ...options,
    all: true,
  })

  return response.data
}
```

## Service Function Patterns

### List Endpoint Pattern

```typescript
export async function fetchMyJKKN[Entity](
  options: MyJKKN[Entity]FetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKN[Entity]>> {
  const params = new URLSearchParams()

  // Required pagination params
  params.append('page', String(options.page || 1))
  params.append('limit', String(options.limit || 10))

  // Optional filters
  if (options.search) params.append('search', options.search)
  if (options.is_active !== undefined) params.append('isActive', String(options.is_active))
  // Add entity-specific filters...

  const endpoint = `/api-management/[path]?${params.toString()}`
  return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKN[Entity]>>(endpoint)
}
```

### Fetch All Pattern (Handles Pagination)

```typescript
export async function fetchAllMyJKKN[Entity](
  options: Omit<MyJKKN[Entity]FetchOptions, 'page'> = {}
): Promise<MyJKKN[Entity][]> {
  const allItems: MyJKKN[Entity][] = []
  let currentPage = 1
  let totalPages = 1

  do {
    const response = await fetchMyJKKN[Entity]({
      ...options,
      page: currentPage,
      limit: options.limit || 100,
    })

    allItems.push(...response.data)
    totalPages = response.metadata.totalPages
    currentPage++
  } while (currentPage <= totalPages)

  return allItems
}
```

### Single Item Pattern

```typescript
export async function fetchMyJKKN[Entity]ById(
  id: string
): Promise<MyJKKNSingleResponse<MyJKKN[Entity]>> {
  const endpoint = `/api-management/[path]/${id}`
  return fetchFromMyJKKN<MyJKKNSingleResponse<MyJKKN[Entity]>>(endpoint)
}
```

## Re-export File

`lib/myjkkn-api.ts`:

```typescript
/**
 * MyJKKN API Client
 *
 * Re-exports types and service functions for backward compatibility.
 */

// Re-export all types
export type {
  MyJKKNPaginatedResponse,
  MyJKKNSingleResponse,
  MyJKKNInstitution,
  MyJKKNInstitutionFetchOptions,
  MyJKKNDepartment,
  MyJKKNDepartmentFetchOptions,
  // ... other types
} from '@/types/myjkkn'

// Re-export all service functions
export {
  MyJKKNApiError,
  fetchMyJKKNInstitutions,
  fetchAllMyJKKNInstitutions,
  fetchMyJKKNDepartments,
  fetchAllMyJKKNDepartments,
  // ... other functions
} from '@/services/myjkkn-service'
```

## Usage in API Routes

```typescript
import {
  fetchMyJKKNStudents,
  fetchAllMyJKKNStudents,
  MyJKKNApiError,
} from '@/lib/myjkkn-api'

// In route handler
const response = await fetchMyJKKNStudents({
  page: 1,
  limit: 10,
  search: 'john',
  institution_id: 'uuid-here',
})
```
