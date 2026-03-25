# MyJKKN API Types Reference

Complete TypeScript type definitions for the MyJKKN API integration.

## File Location

`types/myjkkn.ts`

## Common Types

```typescript
/**
 * Paginated response wrapper for all list endpoints
 */
export interface MyJKKNPaginatedResponse<T> {
  data: T[]
  metadata: {
    page: number
    totalPages: number
    total: number
    limit?: number
    returned?: number
  }
}

/**
 * Single item response wrapper
 */
export interface MyJKKNSingleResponse<T> {
  data: T
}
```

## Entity Types

### Institution

```typescript
export interface MyJKKNInstitution {
  id: string
  name: string
  counselling_code: string
  category: string
  institution_type: string
  phone?: string
  email?: string
  website?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MyJKKNInstitutionFetchOptions {
  page?: number
  limit?: number
  search?: string
  is_active?: boolean
}
```

### Department

```typescript
export interface MyJKKNDepartment {
  id: string
  department_name: string
  department_code: string
  institution_id: string
  degree_id: string
  is_active: boolean
  institution?: {
    id: string
    name: string
    counselling_code: string
  }
  degree?: {
    id: string
    degree_id: string
    degree_name: string
  }
  created_at: string
  updated_at: string
}

export interface MyJKKNDepartmentFetchOptions {
  page?: number
  limit?: number
  search?: string
  institution_id?: string
  degree_id?: string
  is_active?: boolean
}
```

### Program

```typescript
export interface MyJKKNProgram {
  id: string
  program_id: string
  program_name: string
  institution_id: string
  department_id: string
  degree_id: string
  is_active: boolean
  institution?: {
    id: string
    name: string
    counselling_code: string
  }
  department?: {
    id: string
    department_name: string
    department_code: string
  }
  degree?: {
    id: string
    degree_id: string
    degree_name: string
  }
  created_at: string
  updated_at: string
}

export interface MyJKKNProgramFetchOptions {
  page?: number
  limit?: number
  search?: string
  institution_id?: string
  department_id?: string
  degree_id?: string
  is_active?: boolean
}
```

### Degree

```typescript
export interface MyJKKNDegree {
  id: string
  degree_id: string
  degree_name: string
  degree_type: string
  institution_id: string
  is_active: boolean
  institution?: {
    id: string
    name: string
    counselling_code: string
  }
  created_at: string
  updated_at: string
}

export interface MyJKKNDegreeFetchOptions {
  page?: number
  limit?: number
  search?: string
  institution_id?: string
  degree_type?: string
  is_active?: boolean
}
```

### Course

```typescript
export interface MyJKKNCourse {
  id: string
  course_code: string
  course_name: string
  institution_id: string
  degree_id: string
  department_id: string
  program_id: string
  is_active: boolean
  institution?: {
    id: string
    name: string
    counselling_code: string
  }
  department?: {
    id: string
    department_name: string
    department_code: string
  }
  program?: {
    id: string
    program_id: string
    program_name: string
  }
  degree?: {
    id: string
    degree_id: string
    degree_name: string
  }
  created_at: string
  updated_at: string
}

export interface MyJKKNCourseFetchOptions {
  page?: number
  limit?: number
  search?: string
  institution_id?: string
  degree_id?: string
  department_id?: string
  program_id?: string
  is_active?: boolean
}
```

### Semester

```typescript
export interface MyJKKNSemester {
  id: string
  semester_code: string
  semester_name: string
  semester_type: string
  institution_id: string
  degree_id: string
  department_id: string
  program_id: string
  course_id?: string
  is_active: boolean
  institution?: {
    id: string
    name: string
    counselling_code: string
  }
  degree?: {
    id: string
    degree_id: string
    degree_name: string
  }
  department?: {
    id: string
    department_name: string
    department_code: string
  }
  program?: {
    id: string
    program_id: string
    program_name: string
  }
  course?: {
    id: string
    course_code: string
    course_name: string
  }
  created_at: string
  updated_at: string
}

export interface MyJKKNSemesterFetchOptions {
  page?: number
  limit?: number
  search?: string
  institution_id?: string
  degree_id?: string
  department_id?: string
  program_id?: string
  course_id?: string
  semester_type?: string
  is_active?: boolean
}
```

### Student

```typescript
export interface MyJKKNStudent {
  id: string
  first_name: string
  last_name: string
  roll_number: string
  student_email: string
  college_email?: string
  student_mobile: string
  father_name?: string
  mother_name?: string
  date_of_birth?: string
  gender?: string
  religion?: string
  community?: string
  permanent_address_street?: string
  permanent_address_district?: string
  permanent_address_state?: string
  permanent_address_pin_code?: string
  institution?: {
    id: string
    name: string
  }
  department?: {
    id: string
    department_name: string
  }
  program?: {
    id: string
    program_name: string
  }
  degree?: {
    id: string
    degree_name: string
  }
  is_profile_complete: boolean
  created_at: string
  updated_at: string
}

export interface MyJKKNStudentFetchOptions {
  page?: number
  limit?: number
  search?: string
  institution_id?: string
  department_id?: string
  program_id?: string
  is_profile_complete?: boolean
}
```

### Staff

```typescript
export interface MyJKKNStaff {
  id: string
  staff_id: string
  first_name: string
  last_name: string
  email: string
  mobile?: string
  category?: {
    id: string
    category_name: string
  }
  institution?: {
    id: string
    name: string
  }
  department?: {
    id: string
    department_name: string
  }
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MyJKKNStaffFetchOptions {
  page?: number
  limit?: number
  all?: boolean
  search?: string
  institution_id?: string
  department_id?: string
  category_id?: string
  is_active?: boolean
}
```

## Type Naming Conventions

| Pattern | Example | Usage |
|---------|---------|-------|
| `MyJKKN[Entity]` | `MyJKKNStudent` | Entity interface |
| `MyJKKN[Entity]FetchOptions` | `MyJKKNStudentFetchOptions` | Query parameters |
| `MyJKKNPaginatedResponse<T>` | `MyJKKNPaginatedResponse<MyJKKNStudent>` | List response |
| `MyJKKNSingleResponse<T>` | `MyJKKNSingleResponse<MyJKKNStudent>` | Single item response |

## Usage Examples

```typescript
// Import types
import type {
  MyJKKNStudent,
  MyJKKNStudentFetchOptions,
  MyJKKNPaginatedResponse,
} from '@/types/myjkkn'

// Use in function signature
async function fetchStudents(
  options: MyJKKNStudentFetchOptions
): Promise<MyJKKNPaginatedResponse<MyJKKNStudent>> {
  // Implementation
}

// Use in component state
const [students, setStudents] = useState<MyJKKNStudent[]>([])
```
