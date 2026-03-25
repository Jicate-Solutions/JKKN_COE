# MyJKKN API Routes Reference

Complete API route implementation patterns for the MyJKKN integration.

## Directory Structure

```
app/api/myjkkn/
├── institutions/
│   └── route.ts          # GET /api/myjkkn/institutions
├── departments/
│   └── route.ts          # GET /api/myjkkn/departments
├── programs/
│   └── route.ts          # GET /api/myjkkn/programs
├── degrees/
│   └── route.ts          # GET /api/myjkkn/degrees
├── courses/
│   └── route.ts          # GET /api/myjkkn/courses
├── semesters/
│   └── route.ts          # GET /api/myjkkn/semesters
├── students/
│   ├── route.ts          # GET /api/myjkkn/students
│   └── [id]/
│       └── route.ts      # GET /api/myjkkn/students/[id]
└── staff/
    ├── route.ts          # GET /api/myjkkn/staff
    └── [id]/
        └── route.ts      # GET /api/myjkkn/staff/[id]
```

## List Endpoint Pattern

### Template

```typescript
import { NextRequest, NextResponse } from 'next/server'
import {
  fetchMyJKKN[Entity],
  fetchAllMyJKKN[Entity],
  MyJKKNApiError,
} from '@/lib/myjkkn-api'

/**
 * GET /api/myjkkn/[entities]
 *
 * Fetches [entities] from the MyJKKN API
 *
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 * - search: Search by name, code, etc.
 * - [entity_specific_filters]
 * - all: Fetch all pages (true/false)
 */
export async function GET(request: NextRequest) {
  console.log('[API /myjkkn/[entities]] Request received')

  try {
    const { searchParams } = new URL(request.url)
    const page = searchParams.get('page')
    const limit = searchParams.get('limit')
    const search = searchParams.get('search')
    // Entity-specific filters
    const entityFilter = searchParams.get('entity_id')
    const isActive = searchParams.get('is_active') ?? searchParams.get('isActive')
    const fetchAll = searchParams.get('all') === 'true'

    // If fetching all, use the helper that handles pagination
    if (fetchAll) {
      const items = await fetchAllMyJKKN[Entity]({
        limit: limit ? parseInt(limit, 10) : 100,
        search: search || undefined,
        entity_id: entityFilter || undefined,
        is_active: isActive ? isActive === 'true' : undefined,
      })

      return NextResponse.json({
        data: items,
        metadata: {
          page: 1,
          totalPages: 1,
          total: items.length,
        },
      })
    }

    // Otherwise, fetch a single page
    const response = await fetchMyJKKN[Entity]({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search: search || undefined,
      entity_id: entityFilter || undefined,
      is_active: isActive ? isActive === 'true' : undefined,
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error('MyJKKN [entity] fetch error:', error)

    if (error instanceof MyJKKNApiError) {
      return NextResponse.json(
        { error: error.message, status: error.status },
        { status: error.status }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to fetch [entities] from MyJKKN: ${errorMessage}` },
      { status: 500 }
    )
  }
}
```

### Institutions Route (Complete Example)

```typescript
// app/api/myjkkn/institutions/route.ts

import { NextRequest, NextResponse } from 'next/server'
import {
  fetchMyJKKNInstitutions,
  fetchAllMyJKKNInstitutions,
  MyJKKNApiError,
} from '@/lib/myjkkn-api'

/**
 * GET /api/myjkkn/institutions
 *
 * Fetches institutions from the MyJKKN API
 *
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10)
 * - search: Search by name
 * - is_active: Filter by status (true/false)
 * - all: Fetch all pages (true/false)
 */
export async function GET(request: NextRequest) {
  console.log('[API /myjkkn/institutions] Request received')

  try {
    const { searchParams } = new URL(request.url)
    const page = searchParams.get('page')
    const limit = searchParams.get('limit')
    const search = searchParams.get('search')
    // Support both 'is_active' and 'isActive' for flexibility
    const isActive = searchParams.get('is_active') ?? searchParams.get('isActive')
    const fetchAll = searchParams.get('all') === 'true'

    // If fetching all, use the helper that handles pagination
    if (fetchAll) {
      const institutions = await fetchAllMyJKKNInstitutions({
        limit: limit ? parseInt(limit, 10) : 100,
        search: search || undefined,
        is_active: isActive ? isActive === 'true' : undefined,
      })

      return NextResponse.json({
        data: institutions,
        metadata: {
          page: 1,
          totalPages: 1,
          total: institutions.length,
        },
      })
    }

    // Otherwise, fetch a single page
    const response = await fetchMyJKKNInstitutions({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search: search || undefined,
      is_active: isActive ? isActive === 'true' : undefined,
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error('MyJKKN institutions fetch error:', error)

    if (error instanceof MyJKKNApiError) {
      return NextResponse.json(
        { error: error.message, status: error.status },
        { status: error.status }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to fetch institutions from MyJKKN: ${errorMessage}` },
      { status: 500 }
    )
  }
}
```

### Students Route (With Additional Filters)

```typescript
// app/api/myjkkn/students/route.ts

import { NextRequest, NextResponse } from 'next/server'
import {
  fetchMyJKKNStudents,
  fetchAllMyJKKNStudents,
  MyJKKNApiError,
} from '@/lib/myjkkn-api'

/**
 * GET /api/myjkkn/students
 *
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 * - search: Search by first_name, last_name, email, mobile, roll_number
 * - institution_id: Filter by institution UUID
 * - department_id: Filter by department UUID
 * - program_id: Filter by program UUID
 * - is_profile_complete: Filter by profile completion status (true/false)
 * - all: Fetch all pages (true/false)
 */
export async function GET(request: NextRequest) {
  console.log('[API /myjkkn/students] Request received')

  try {
    const { searchParams } = new URL(request.url)
    const page = searchParams.get('page')
    const limit = searchParams.get('limit')
    const search = searchParams.get('search')
    const institutionId = searchParams.get('institution_id')
    const departmentId = searchParams.get('department_id')
    const programId = searchParams.get('program_id')
    const isProfileComplete = searchParams.get('is_profile_complete')
    const fetchAll = searchParams.get('all') === 'true'

    if (fetchAll) {
      const students = await fetchAllMyJKKNStudents({
        limit: limit ? parseInt(limit, 10) : 100,
        search: search || undefined,
        institution_id: institutionId || undefined,
        department_id: departmentId || undefined,
        program_id: programId || undefined,
        is_profile_complete: isProfileComplete ? isProfileComplete === 'true' : undefined,
      })

      return NextResponse.json({
        data: students,
        metadata: {
          page: 1,
          totalPages: 1,
          total: students.length,
        },
      })
    }

    const response = await fetchMyJKKNStudents({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search: search || undefined,
      institution_id: institutionId || undefined,
      department_id: departmentId || undefined,
      program_id: programId || undefined,
      is_profile_complete: isProfileComplete ? isProfileComplete === 'true' : undefined,
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error('MyJKKN students fetch error:', error)

    if (error instanceof MyJKKNApiError) {
      return NextResponse.json(
        { error: error.message, status: error.status },
        { status: error.status }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to fetch students from MyJKKN: ${errorMessage}` },
      { status: 500 }
    )
  }
}
```

## Single Item Endpoint Pattern (Dynamic Route)

### Template

```typescript
// app/api/myjkkn/[entities]/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import {
  fetchMyJKKN[Entity]ById,
  MyJKKNApiError,
} from '@/lib/myjkkn-api'

/**
 * GET /api/myjkkn/[entities]/[id]
 *
 * Fetches a single [entity] by ID from the MyJKKN API
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  console.log('[API /myjkkn/[entities]/[id]] Request received for ID:', id)

  try {
    if (!id) {
      return NextResponse.json(
        { error: '[Entity] ID is required' },
        { status: 400 }
      )
    }

    const response = await fetchMyJKKN[Entity]ById(id)

    return NextResponse.json(response)
  } catch (error) {
    console.error('MyJKKN [entity] fetch error:', error)

    if (error instanceof MyJKKNApiError) {
      return NextResponse.json(
        { error: error.message, status: error.status },
        { status: error.status }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to fetch [entity] from MyJKKN: ${errorMessage}` },
      { status: 500 }
    )
  }
}
```

### Student By ID Route (Complete Example)

```typescript
// app/api/myjkkn/students/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import {
  fetchMyJKKNStudentById,
  MyJKKNApiError,
} from '@/lib/myjkkn-api'

/**
 * GET /api/myjkkn/students/[id]
 *
 * Fetches a single student by ID from the MyJKKN API
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  console.log('[API /myjkkn/students/[id]] Request received for ID:', id)

  try {
    if (!id) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      )
    }

    const response = await fetchMyJKKNStudentById(id)

    return NextResponse.json(response)
  } catch (error) {
    console.error('MyJKKN student fetch error:', error)

    if (error instanceof MyJKKNApiError) {
      return NextResponse.json(
        { error: error.message, status: error.status },
        { status: error.status }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to fetch student from MyJKKN: ${errorMessage}` },
      { status: 500 }
    )
  }
}
```

## All API Endpoints Summary

| Endpoint | Method | Description | Filters |
|----------|--------|-------------|---------|
| `/api/myjkkn/institutions` | GET | List institutions | search, is_active, all |
| `/api/myjkkn/departments` | GET | List departments | search, institution_id, degree_id, is_active, all |
| `/api/myjkkn/programs` | GET | List programs | search, institution_id, department_id, degree_id, is_active, all |
| `/api/myjkkn/degrees` | GET | List degrees | search, institution_id, degree_type, is_active, all |
| `/api/myjkkn/courses` | GET | List courses | search, institution_id, department_id, program_id, degree_id, is_active, all |
| `/api/myjkkn/semesters` | GET | List semesters | search, institution_id, program_id, semester_type, is_active, all |
| `/api/myjkkn/students` | GET | List students | search, institution_id, department_id, program_id, is_profile_complete, all |
| `/api/myjkkn/students/[id]` | GET | Get student by ID | - |
| `/api/myjkkn/staff` | GET | List staff | search, institution_id, department_id, category_id, is_active, all |
| `/api/myjkkn/staff/[id]` | GET | Get staff by ID | - |

## Common Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number for pagination |
| `limit` | number | 10 | Items per page (max: 100) |
| `search` | string | - | Search query |
| `is_active` | boolean | - | Filter by active status |
| `all` | boolean | false | Fetch all pages at once |

## Error Response Format

```typescript
// API Error Response
{
  "error": "Error message here",
  "status": 400 | 401 | 404 | 500
}
```

## Usage Examples

### Fetch paginated institutions
```bash
GET /api/myjkkn/institutions?page=1&limit=10
```

### Search students with filters
```bash
GET /api/myjkkn/students?search=john&institution_id=uuid-here&is_profile_complete=true
```

### Fetch all departments for an institution
```bash
GET /api/myjkkn/departments?institution_id=uuid-here&all=true
```

### Get single student by ID
```bash
GET /api/myjkkn/students/uuid-here
```
