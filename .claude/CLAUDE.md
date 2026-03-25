# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

```bash
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Build production bundle
npm run lint         # Run ESLint
```

**Key Paths:**
- Auth: `lib/auth/`, `middleware.ts`, `components/protected-route.tsx`
- API Routes: `app/api/`
- Pages: `app/(coe)/`
- Services: `services/`
- Types: `types/`
- Migrations: `supabase/migrations/`

## Database Architecture

**CRITICAL:** When debugging database issues, always check BOTH databases:

| Database | Contains | Key Tables |
|----------|----------|------------|
| **COE (Local Supabase)** | Exam data, registrations, marks, results | `exam_registrations`, `internal_marks`, `final_marks`, `course_offerings`, `institutions` |
| **MyJKKN (External API)** | Learner profiles, photos, DOB, batches | `learners_profiles` (via API), `student_photo_url`, `date_of_birth` |

**Common Mistake:** Assuming learner photos/DOB exist in COE - they don't! Always fetch from MyJKKN API.

## Project Overview

JKKN COE (Controller of Examination) - Next.js 15 app with TypeScript, Supabase, and Tailwind CSS for managing examination systems.

**Complete PRD:** See `.claude/COE PRD.txt` for requirements and roadmap.

**Tech Stack:** Next.js 15, React 19, Supabase (PostgreSQL), Shadcn UI, Tailwind CSS, Zod

## JKKN Terminology Standards

**CRITICAL:** Always use JKKN terminology:

| Standard Term | JKKN Term | Example |
|---------------|-----------|---------|
| Student | **Learner** | `types/learners.ts`, not `types/students.ts` |
| student_id | learner_id | Database fields, API parameters |
| /students | /learners | API routes |

**Positive Language:** "Needs improvement" not "Failed", "Learning opportunity" not "Backlog"

## Architecture

### Authentication & RBAC

**Flow:** Google OAuth → Supabase Auth → Middleware validation → Auth Context → Protected Routes

**Key Files:**
- `lib/supabase-server.ts` - Server-side client (service role key)
- `middleware.ts` - Session validation, `is_active` check
- `lib/auth/auth-context.tsx` - Client auth state
- `components/protected-route.tsx` - Route guards

**Usage:**
```typescript
// Auth context
const { user, hasPermission, hasRole } = useAuth()

// Protected route
<ProtectedRoute requiredPermissions={['courses:read']} requiredRoles={['admin']}>
  {children}
</ProtectedRoute>

// Server-side
import { getSupabaseServer } from '@/lib/supabase-server'
const supabase = getSupabaseServer()
```

**Public Routes:** `/login`, `/auth/callback`, `/contact-admin`, `/verify-email`, `/`

### Multi-Tenant Institution Context

Users see only their institution's data unless super_admin.

**Key Files:** `context/institution-context.tsx`, `hooks/use-institution-filter.ts`, `hooks/use-institution-field.ts`

**Full Guide:** See `.claude/skills/myjkkn-coe-dev-rules/SKILL.md` for complete rules.

```typescript
// In pages - use the dedicated hook
const {
  filter,
  isReady,
  appendToUrl,
  getInstitutionIdForCreate,
  mustSelectInstitution,  // true when "All Institutions" selected
  shouldFilter,
  institutionId
} = useInstitutionFilter()

// Fetch with filter
useEffect(() => {
  if (isReady) {
    const url = appendToUrl('/api/entity')
    fetch(url).then(...)
  }
}, [isReady, filter])
```

**Role Behavior:**

| User Type | View | Create | Update | Delete | Upload | Download |
|-----------|------|--------|--------|--------|--------|----------|
| Normal User | Own institution | Own institution (auto-filled) | Own records | Own records | Own institution | Own institution |
| super_admin (All) | ALL institutions | Must select in form | Any record | Any record | Must select | ALL data |
| super_admin (Specific) | Selected only | Selected (auto-filled) | Selected records | Selected records | Selected | Selected |

**Key Properties:**
- `mustSelectInstitution` - `true` when super_admin views "All Institutions" (show institution UI)
- `shouldFilter` - `true` when filtering should be applied
- `getInstitutionIdForCreate()` - Returns institution ID for new records

### MyJKKN API Integration

COE integrates with MyJKKN for shared data (regulations, learners, batches).

**Full Guide:** See `.claude/skills/myjkkn-coe-dev-rules/SKILL.md` for complete field mappings.

**Critical Constraints:**
1. Use `myjkkn_institution_ids` array directly - no two-step lookup needed!
2. Server-side filtering often ignored - **always filter client-side by `institution_id`**
3. Deduplicate by CODE field (e.g., `regulation_code`, `program_id`), NOT by `id`

**Field Name Differences (MyJKKN → COE):**

| MyJKKN Field | COE Local Field | Notes |
|--------------|-----------------|-------|
| `course_name` | `course_title` | **Different name!** |
| `program_id` | `program_code` | MyJKKN `program_id` is CODE ("BCA"), NOT UUID |
| `institution_id` | `institutions_id` | COE uses **plural** form |
| `college_email` | `learner_email` | Multiple fallbacks |

**Use the hook:** `useMyJKKNInstitutionFilter` from `hooks/use-myjkkn-institution-filter.ts`

```typescript
const { fetchPrograms, fetchRegulations } = useMyJKKNInstitutionFilter()

// Get myjkkn_institution_ids from COE institution
const institution = institutions.find(i => i.id === institutionId)
const myjkknIds = institution?.myjkkn_institution_ids || []

// Use IDs directly - no lookup needed!
const programs = await fetchPrograms(myjkknIds)
const regulations = await fetchRegulations(myjkknIds)
```

## Development Standards

**See:** `.cursor/rules/DEVELOPMENT_STANDARDS.md` for full standards.

**Key Conventions:**
- **PascalCase**: Components, Types, Interfaces
- **kebab-case**: Directories, files
- **camelCase**: Variables, functions, hooks
- **UPPERCASE**: Environment variables, constants

**Code Style:** Tabs, single quotes, no semicolons, strict equality (`===`)

**Next.js:** Default Server Components, use `'use client'` only when needed

## Data Requirements

**Before testing or debugging marks generation:**

| Course Type | Required Data | Notes |
|-------------|---------------|-------|
| Regular (External Exam) | `exam_registrations` + `exam_timetables` + `internal_marks` | Must have valid timetable entries |
| CIA (Internal Only) | `exam_registrations` + `internal_marks` | No external exam - ensure `internal_marks` exist |

**Checklist before final marks generation:**
1. Verify `exam_registrations` exist for all learners in the course
2. Verify `internal_marks` records exist (especially for CIA courses)
3. Check course `exam_type` field to determine if external marks are expected

## Key Patterns

### Form Validation

```typescript
const [errors, setErrors] = useState<Record<string, string>>({})

const validate = () => {
  const e: Record<string, string> = {}
  if (!formData.field.trim()) e.field = 'Required'
  // Pattern: !/^regex$/.test(value)
  // Range: Number(value) < min || Number(value) > max
  setErrors(e)
  return Object.keys(e).length === 0
}
```

### API Error Handling

```typescript
// Server-side (API routes)
if (error) {
  if (error.code === '23505') return NextResponse.json({ error: 'Already exists' }, { status: 400 })
  if (error.code === '23503') return NextResponse.json({ error: 'Invalid reference' }, { status: 400 })
  return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
}
```

**PostgreSQL Error Codes:** 23505 (duplicate), 23503 (FK violation), 23514 (check constraint), 23502 (not-null)

### Foreign Key Auto-Mapping

Always resolve codes to UUIDs before insert:

```typescript
// 1. Lookup institution_code → institutions_id
const { data: inst } = await supabase.from('institutions').select('id').eq('institution_code', code).single()
if (!inst) return NextResponse.json({ error: `Institution "${code}" not found` }, { status: 400 })

// 2. Insert with both ID and code
.insert({ institutions_id: inst.id, institution_code: code, ... })
```

### Toast Patterns

```typescript
// Success
toast({ title: '✅ Created', description: '...', className: 'bg-green-50 border-green-200 text-green-800' })
// Error
toast({ title: '❌ Failed', description: '...', variant: 'destructive' })
```

### Form Sheet Pattern

Reference: `app/(coe)/master/degrees/page.tsx`

```typescript
<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
  <SheetContent className="sm:max-w-[800px] overflow-y-auto">
    {/* Form sections with space-y-8 */}
  </SheetContent>
</Sheet>
```

## API Route Patterns

### GET Route Structure

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const institutionCode = searchParams.get('institution_code')
  const institutionsId = searchParams.get('institutions_id')
  const search = searchParams.get('search')

  let query = supabase.from('entity').select('*')

  // Institution filtering
  if (institutionCode) {
    query = query.eq('institution_code', institutionCode)
  } else if (institutionsId) {
    query = query.eq('institutions_id', institutionsId)
  }

  // Search filter (multi-field)
  if (search) {
    query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`)
  }

  // Override default 1000-row limit
  const { data, error } = await query.range(0, 9999)

  if (error) {
    console.error('Fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }

  return NextResponse.json(data || [])
}
```

### POST Route Structure

```typescript
export async function POST(request: Request) {
  const body = await request.json()

  // 1. Required field validation
  if (!body.code?.trim()) {
    return NextResponse.json({ error: 'Code is required' }, { status: 400 })
  }

  // 2. FK Auto-Mapping (code → UUID)
  let institutions_id = body.institutions_id
  let institution_code = body.institution_code

  if (institution_code && !institutions_id) {
    const { data: inst } = await supabase
      .from('institutions')
      .select('id')
      .eq('institution_code', institution_code)
      .maybeSingle()
    if (!inst) {
      return NextResponse.json({ error: `Institution "${institution_code}" not found` }, { status: 400 })
    }
    institutions_id = inst.id
  }

  // 3. Insert with both ID and code
  const { data, error } = await supabase
    .from('entity')
    .insert({
      institutions_id,
      institution_code,
      code: body.code.trim(),
      name: body.name?.trim() || null,
    })
    .select()
    .single()

  // 4. Error handling
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Already exists' }, { status: 400 })
    if (error.code === '23503') return NextResponse.json({ error: 'Invalid reference' }, { status: 400 })
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
```

### PUT Route Structure

```typescript
export async function PUT(request: Request) {
  const body = await request.json()
  const { id, ...updateData } = body

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 })
  }

  // Don't allow changing institution after creation
  delete updateData.institutions_id
  delete updateData.institution_code

  const { data, error } = await supabase
    .from('entity')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

### DELETE Route Structure

```typescript
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 })
  }

  const { error } = await supabase.from('entity').delete().eq('id', id)

  if (error) {
    if (error.code === '23503') {
      return NextResponse.json({ error: 'Cannot delete - has related records' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

### Complex Query Patterns

**Nested Relationships:**
```typescript
const { data } = await supabase
  .from('exam_registrations')
  .select(`
    id,
    student_id,
    course_offerings(
      id,
      course_mapping:course_id(
        courses:course_id(id, course_code, course_name)
      )
    )
  `)
  .eq('examination_session_id', sessionId)
```

**Separate Bulk Fetch (for one-to-many):**
```typescript
// 1. Get primary data
const { data: registrations } = await supabase.from('exam_registrations').select('*')

// 2. Extract IDs for related data
const courseOfferingIds = [...new Set(registrations.map(r => r.course_offering_id))]

// 3. Bulk fetch related data
const { data: timetables } = await supabase
  .from('exam_timetables')
  .select('*')
  .in('course_offering_id', courseOfferingIds)

// 4. Create lookup map
const timetablesMap = new Map(timetables.map(tt => [tt.course_offering_id, tt]))
```

### MyJKKN API Route Pattern

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const institutionId = searchParams.get('institutions_id')

  // Get myjkkn_institution_ids from COE institution
  const { data: institution } = await supabase
    .from('institutions')
    .select('myjkkn_institution_ids')
    .eq('id', institutionId)
    .single()

  const myjkknIds = institution?.myjkkn_institution_ids || []

  // Fetch from MyJKKN for each institution ID
  const allPrograms: any[] = []
  const seenCodes = new Set<string>()

  for (const myjkknInstId of myjkknIds) {
    const response = await fetch(`${MYJKKN_API}/programs?institution_id=${myjkknInstId}`)
    const data = await response.json()
    const programs = data.data || data || []

    // Client-side filter + deduplicate by CODE
    for (const p of programs) {
      const code = p.program_id || p.program_code
      if (code && p.institution_id === myjkknInstId && !seenCodes.has(code)) {
        seenCodes.add(code)
        allPrograms.push(p)
      }
    }
  }

  return NextResponse.json(allPrograms)
}
```

### Response Formats

```typescript
// Simple array
return NextResponse.json(data || [])

// With metadata
return NextResponse.json({
  data: formattedData,
  total: formattedData.length,
  metadata: { institution_id: institutionId }
})

// Success with details
return NextResponse.json({
  success: true,
  data: hallTicketData,
  student_count: students.length
})
```

## Debugging Guidelines

**Before assuming data is missing, check status first:**

| Symptom | Check This First |
|---------|------------------|
| Course missing from marksheet | Is `final_marks.status` = `Pending` instead of `Published`? |
| Learner photo not showing | Is `student_photo_url` null in COE? → Fetch from MyJKKN API |
| Marks not appearing in report | Is course `is_locked` = false (amber UI state)? |
| Export showing wrong data | Are you filtering by correct `institution_id`? |

**Data Status Workflow:**
```
Draft → Pending → Published → Locked
         ↑                      ↑
    (editable)            (read-only)
```

## Important Notes

- **Race Conditions:** Use atomic updates with conditional checks (`.is('used_at', null)`)
- **RLS Bypass:** Service role key bypasses RLS - use in server API routes only
- **Session Handling:** Middleware validates sessions and handles inactive users
- **MyJKKN Responses:** Always handle both `response.data` and direct array: `const data = response.data || response || []`
- **Row Limits:** Use `.range(0, 9999)` to override Supabase's default 1000-row limit
- **Institution in Updates:** Never allow changing `institutions_id` after record creation
