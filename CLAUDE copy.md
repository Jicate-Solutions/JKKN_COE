# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JKKN COE (Controller of Examination) is a Next.js 15 application for managing examination systems with role-based access control (RBAC), built with TypeScript, Supabase, and Tailwind CSS.

### Product Requirements Document (PRD)

**Complete PRD:** See [CoE PRD.txt](CoE PRD.txt) for comprehensive product requirements, features, and implementation roadmap.

**Key Information from PRD:**

1. **Purpose**: Comprehensive digital examination management system for JKKN Arts Colleges as a child application within the MyJKKN platform
2. **Development Timeline**: 90-day rapid development using AI-assisted tools (Cursor IDE & Claude Code)
3. **Tech Stack**:
   - Frontend: React.js with TypeScript (Next.js 15)
   - Backend: Node.js with Express.js
   - Database: PostgreSQL (Supabase)
   - Cache: Redis for session management
   - Storage: AWS S3 compatible storage

**Core Modules** (as per PRD Section 3):
- **Pre-Examination**: Calendar management, learner registration, hall ticket generation
- **Question Paper Management**: Question bank system, paper setting, security & confidentiality
- **Examination Conduct**: Day management, malpractice handling, special provisions
- **Evaluation**: Answer script processing, evaluation portal, internal assessment integration
- **Internal Examinations** (Arts College Specific): Internal tests, practical examinations (performance arts, visual arts, language arts), creative assessments
- **Result Processing**: Compilation, declaration, post-result services (revaluation, transparency)
- **Certification**: Certificate generation with blockchain verification, distribution
- **Analytics & Reporting**: Operational, compliance, and predictive analytics

**Development Acceleration** (PRD Section 6 & 7):
- **Cursor IDE Integration**: AI-powered code generation, component templates, auto-complete
- **Claude Code CLI**: Automated module scaffolding, testing, API documentation
- **AI Development Velocity**: 70% faster UI, 80% faster API generation, 60% faster business logic
- **Team Structure**: 7 members (2 full-stack, 1 backend, 1 UI/UX, 1 DevOps, 1 QA, 1 PM)

**Success Metrics** (PRD Section 8):
- 60% reduction in result processing time
- 70% reduction in internal exam processing time
- 80% reduction in paper consumption
- 99.9% system uptime during critical periods
- Same-day digital certificate generation

**Important Considerations**:
- All exam-related data must maintain highest security standards (AES-256 encryption)
- Support for Arts College specific features: performance arts, visual arts practicals
- Flexible assessment types: rubric-based, portfolio, competency mapping
- Multi-language support (English, Tamil, regional languages)
- WCAG 2.1 Level AA accessibility compliance

## Development Commands

### Essential Commands
```bash
npm run dev          # Start development server on http://localhost:3000
npm run build        # Build production bundle
npm run start        # Start production server
npm run lint         # Run ESLint
```

### TypeScript
- Strict mode enabled (`strict: true` in tsconfig.json)
- Path alias: `@/*` maps to root directory
- Target: ES2017

## Architecture Overview

### Authentication & Authorization

**Auth Flow:**
1. Google OAuth via Supabase Auth (`@supabase/supabase-js`)
2. Middleware validates session and checks `is_active` status ([middleware.ts](middleware.ts))
3. Client-side auth context provides user state ([lib/auth/auth-context.tsx](lib/auth/auth-context.tsx))
4. Protected routes use `<ProtectedRoute>` component ([components/protected-route.tsx](components/protected-route.tsx))

**RBAC System:**
- Database schema: `users`, `roles`, `permissions`, `role_permissions`, `user_roles` tables
- User activation check: `is_active` field in users table
- Permission checking: Via auth context hooks (`hasPermission`, `hasRole`, `hasAnyRole`)
- Route protection: Supports required permissions and roles with flexible authorization logic

**Key Auth Files:**
- [lib/supabase-server.ts](lib/supabase-server.ts) - Server-side Supabase client (uses service role key)
- [lib/auth/supabase-auth-service.ts](lib/auth/supabase-auth-service.ts) - Auth service wrapper
- [middleware.ts](middleware.ts) - Session validation, inactive user handling, public route configuration
- [components/protected-route.tsx](components/protected-route.tsx) - Client-side route guards

**Public Routes:** `/login`, `/auth/callback`, `/contact-admin`, `/verify-email`, `/`

### Email Verification System

**Implementation:**
- Verification codes stored in `verification_codes` table with email, code, expiry, and usage tracking
- Race condition protection: Atomic updates with `.is('used_at', null)` check ([app/api/auth/verify-email/route.ts](app/api/auth/verify-email/route.ts))
- Database constraint: Partial unique index on `(email, code) WHERE used_at IS NULL` prevents duplicate unused codes
- Security: Service role bypasses RLS policies for server-side verification

### Database Layer

**Supabase Configuration:**
- PostgreSQL database with Row Level Security (RLS)
- Service role key bypasses RLS for server operations
- Migrations in [supabase/migrations/](supabase/migrations/)
- Key tables: users, roles, permissions, role_permissions, user_roles, verification_codes, institutions, departments, programs, courses, regulations, semesters

### UI Architecture

**Component Structure:**
- App Router ([app/](app/)) with route groups: `coe/` for protected pages
- Shadcn UI + Radix UI primitives for accessible components
- Tailwind CSS with dark mode support via `next-themes`
- Mobile-responsive layouts using utility-first CSS

**Layout Pattern:**
- [app/coe/layout.tsx](app/coe/layout.tsx) - Wraps authenticated pages with `<ProtectedRoute>`
- [app/layout.tsx](app/layout.tsx) - Root layout with theme provider and auth context

**Typography & Fonts:**
- **Body Font**: Inter (weights: 400, 500, 600)
  - Font family: `'Inter', 'Helvetica Neue', Arial, sans-serif`
  - Usage: All body text, captions, UI elements
  - Weight: 400 (normal) for regular text
- **Heading Font**: Montserrat (weights: 600, 700)
  - Font family: `'Montserrat', 'Segoe UI', Arial, sans-serif`
  - Usage: All headings, titles, section headers
  - Weights: 600 (semibold) or 700 (bold)
- **Font Loading**: Via Next.js Font optimization with `display: swap`
- **CSS Variables**: `--font-inter`, `--font-montserrat`
- **Tailwind Classes**:
  - `font-inter` or `font-sans` - Inter for body text
  - `font-heading` or `font-montserrat` - Montserrat for headings
- **Typography Utilities** ([styles/globals.css](styles/globals.css)):
  - `.text-display` - 4xl/5xl, bold, Montserrat
  - `.text-heading-lg` - 3xl, bold, Montserrat
  - `.text-heading` - 2xl, semibold, Montserrat
  - `.text-subheading` - lg, semibold, Montserrat
  - `.text-body` - base, normal, Inter
  - `.text-caption` - sm, normal, Inter

## Development Standards

**Critical conventions from [.cursor/rules/DEVELOPMENT_STANDARDS.md](.cursor/rules/DEVELOPMENT_STANDARDS.md):**

### Naming Conventions
- **PascalCase**: Components, Types, Interfaces
- **kebab-case**: Directory names, file names
- **camelCase**: Variables, functions, methods, hooks, props
- **UPPERCASE**: Environment variables, constants
- Event handlers: `handleClick`, `handleSubmit`
- Boolean variables: `isLoading`, `hasError`, `canSubmit`
- Custom hooks: `useAuth`, `useForm`

### Code Style
- Use tabs for indentation
- Single quotes for strings
- Omit semicolons (unless required)
- Strict equality (`===`)
- Functional components with TypeScript interfaces
- Prefer `interface` over `type` for object structures

### Next.js Best Practices
- Use App Router for routing
- Default to Server Components, use `'use client'` only when needed (event listeners, browser APIs, state, client-only libraries)
- Use Next.js built-in components: `Image`, `Link`, `Script`
- URL query parameters for data fetching and server state management

### Form Design Standards

**Form Container Pattern:**
```typescript
<Sheet open={sheetOpen} onOpenChange={(o) => {
  if (!o) resetForm()
  setSheetOpen(o)
}}>
  <SheetContent className="sm:max-w-[800px] overflow-y-auto">
    {/* Form sections with space-y-8 */}
  </SheetContent>
</Sheet>
```

**Form Widths:** Default `sm:max-w-[800px]`, narrow `[600px]`, wide `[1000px]`

**Header Structure:** Gradient background with icon, title, description
**Section Structure:** Icon + gradient title + border separator
**Field Structure:** Label (with required asterisk) + Input + error message
**Validation:** Inline validation with error state styling
**Toast Notifications:** Success (green) with emoji, errors (destructive red)

### State Management
- Local: `useState`, `useReducer`, `useContext`
- Global: Redux Toolkit (if needed)
- Use selectors to encapsulate state access

### Security
- Input sanitization for XSS prevention
- DOMPurify for HTML sanitization
- Atomic database operations to prevent race conditions
- Unique constraints for data integrity

## Key Patterns

### Protected Route Usage
```typescript
<ProtectedRoute
  requiredPermissions={['courses:read']}
  requiredRoles={['admin', 'teacher']}
  requireAnyRole={true}
  redirectTo="/login"
>
  {children}
</ProtectedRoute>
```

### Auth Context Hooks
```typescript
const { user, isAuthenticated, hasPermission, hasRole } = useAuth()
```

### Server-Side Supabase Client
```typescript
import { getSupabaseServer } from '@/lib/supabase-server'
const supabase = getSupabaseServer() // Uses service role key
```

### Comprehensive Form Validation Pattern

Reference implementation: [app/coe/courses/page.tsx](app/coe/courses/page.tsx)

**Validation Function Structure:**
```typescript
const validate = () => {
  const e: Record<string, string> = {}

  // Required field validation
  if (!formData.institution_code.trim()) e.institution_code = 'Institution code is required'
  if (!formData.regulation_code.trim()) e.regulation_code = 'Regulation code is required'
  if (!formData.course_code.trim()) e.course_code = 'Course code is required'
  if (!formData.course_title.trim()) e.course_title = 'Course title is required'

  // Format validation with regex
  if (formData.course_code && !/^[A-Za-z0-9\-_]+$/.test(formData.course_code)) {
    e.course_code = 'Course code can only contain letters, numbers, hyphens, and underscores'
  }

  // Numeric range validation
  if (formData.credits && (Number(formData.credits) < 0 || Number(formData.credits) > 10)) {
    e.credits = 'Credits must be between 0 and 10'
  }

  // Conditional validation based on other fields
  if (formData.split_credit) {
    if (!formData.theory_credit || Number(formData.theory_credit) === 0) {
      e.theory_credit = 'Theory credit is required when split credit is enabled'
    }
    if (!formData.practical_credit || Number(formData.practical_credit) === 0) {
      e.practical_credit = 'Practical credit is required when split credit is enabled'
    }
  }

  // URL validation
  if (formData.syllabus_pdf_url && formData.syllabus_pdf_url.trim()) {
    try {
      new URL(formData.syllabus_pdf_url)
    } catch {
      e.syllabus_pdf_url = 'Please enter a valid URL (e.g., https://example.com/syllabus.pdf)'
    }
  }

  setErrors(e)
  return Object.keys(e).length === 0
}
```

**Error State Management:**
```typescript
const [errors, setErrors] = useState<Record<string, string>>({})
```

**Inline Error Display:**
```typescript
<div className="space-y-2">
  <Label htmlFor="course_code">
    Course Code <span className="text-red-500">*</span>
  </Label>
  <Input
    id="course_code"
    value={formData.course_code}
    onChange={(e) => setFormData({ ...formData, course_code: e.target.value })}
    className={errors.course_code ? 'border-red-500' : ''}
  />
  {errors.course_code && (
    <p className="text-sm text-red-500">{errors.course_code}</p>
  )}
</div>
```

**Form Submission with Validation:**
```typescript
const handleSubmit = async () => {
  if (!validate()) {
    toast({
      title: '⚠️ Validation Error',
      description: 'Please fix all validation errors before submitting.',
      variant: 'destructive',
      className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
    })
    return
  }
  
  try {
    setLoading(true)
    
    const response = await fetch('/api/endpoint', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMsg = errorData.error || 'Failed to save record'
      
      // Check for specific error types
      if (errorMsg.includes('duplicate') || errorMsg.includes('already exists')) {
        throw new Error(`This record already exists. Please use different values.`)
      }
      
      throw new Error(errorMsg)
    }
    
    const savedData = await response.json()
    
    toast({
      title: editing ? '✅ Record Updated' : '✅ Record Created',
      description: `Successfully ${editing ? 'updated' : 'created'} the record.`,
      className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
    })
    
    setSheetOpen(false)
    resetForm()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to save record. Please try again.'
    
    toast({
      title: '❌ Save Failed',
      description: errorMessage,
      variant: 'destructive',
      className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
    })
  } finally {
    setLoading(false)
  }
}
```

### Toggle Button Implementation

**Using shadcn/ui Switch Component:**
```typescript
import { Switch } from '@/components/ui/switch'

// Simple toggle
<div className="flex items-center gap-3">
  <Label htmlFor="split_credit">Split Credit</Label>
  <Switch
    id="split_credit"
    checked={formData.split_credit}
    onCheckedChange={(v) => setFormData({ ...formData, split_credit: v })}
  />
</div>
```

**Conditional Field Enabling/Disabling:**
```typescript
// Theory Credit field - enabled only when Split Credit is ON
<Input
  type="number"
  value={formData.theory_credit}
  onChange={(e) => setFormData({ ...formData, theory_credit: e.target.value })}
  disabled={!formData.split_credit}
  className={!formData.split_credit ? 'bg-muted cursor-not-allowed' : ''}
/>

// Practical Credit field - enabled only when Split Credit is ON
<Input
  type="number"
  value={formData.practical_credit}
  onChange={(e) => setFormData({ ...formData, practical_credit: e.target.value })}
  disabled={!formData.split_credit}
  className={!formData.split_credit ? 'bg-muted cursor-not-allowed' : ''}
/>
```

### Toast Notification Patterns

**Success Toast (Green):**
```typescript
toast({
  title: '✅ Success',
  description: 'Course created successfully!',
  className: 'bg-green-50 border-green-200'
})
```

**Error Toast (Red):**
```typescript
toast({
  title: '❌ Error',
  description: errorMessage,
  variant: 'destructive'
})
```

**Warning Toast (Yellow):**
```typescript
toast({
  title: '⚠️ Validation Error',
  description: 'Please fix all errors before submitting.',
  variant: 'destructive'
})
```

### Enhanced Upload Summary with Row Count Tracking

Reference implementation: [app/coe/degree/page.tsx](app/coe/degree/page.tsx)

**State Management for Upload Summary:**
```typescript
const [uploadSummary, setUploadSummary] = useState<{
  total: number
  success: number
  failed: number
}>({ total: 0, success: 0, failed: 0 })

const [uploadErrors, setUploadErrors] = useState<Array<{
  row: number
  degree_code: string
  degree_name: string
  errors: string[]
}>>([])
```

**Upload with Detailed Row Tracking:**
```typescript
const handleImport = async () => {
  // ... file parsing logic ...

  setLoading(true)
  let successCount = 0
  let errorCount = 0
  const uploadErrors: Array<{
    row: number
    degree_code: string
    degree_name: string
    errors: string[]
  }> = []

  for (let i = 0; i < mapped.length; i++) {
    const degree = mapped[i]
    const rowNumber = i + 2 // +2 for header row in Excel

    try {
      const response = await fetch('/api/degrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(degree),
      })

      if (response.ok) {
        const savedDegree = await response.json()
        setItems(prev => [savedDegree, ...prev])
        successCount++
      } else {
        const errorData = await response.json()
        errorCount++
        uploadErrors.push({
          row: rowNumber,
          degree_code: degree.degree_code || 'N/A',
          degree_name: degree.degree_name || 'N/A',
          errors: [errorData.error || 'Failed to save degree']
        })
      }
    } catch (error) {
      errorCount++
      uploadErrors.push({
        row: rowNumber,
        degree_code: degree.degree_code || 'N/A',
        degree_name: degree.degree_name || 'N/A',
        errors: [error instanceof Error ? error.message : 'Network error']
      })
    }
  }

  setLoading(false)
  const totalRows = mapped.length

  // Update upload summary
  setUploadSummary({
    total: totalRows,
    success: successCount,
    failed: errorCount
  })

  // Show error dialog if needed
  if (uploadErrors.length > 0) {
    setImportErrors(uploadErrors)
    setErrorPopupOpen(true)
  }

  // Show appropriate toast message
  if (successCount > 0 && errorCount === 0) {
    toast({
      title: "✅ Upload Complete",
      description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} (${successCount} degree${successCount > 1 ? 's' : ''}) to the database.`,
      className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
      duration: 5000,
    })
  } else if (successCount > 0 && errorCount > 0) {
    toast({
      title: "⚠️ Partial Upload Success",
      description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: ${successCount} successful, ${errorCount} failed. View error details below.`,
      className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
      duration: 6000,
    })
  } else if (errorCount > 0) {
    toast({
      title: "❌ Upload Failed",
      description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: 0 successful, ${errorCount} failed. View error details below.`,
      variant: "destructive",
      className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
      duration: 6000,
    })
  }
}
```

**Visual Upload Summary in Error Dialog:**
```typescript
<AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
  <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
    <AlertDialogHeader>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
          <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
        <div>
          <AlertDialogTitle className="text-xl font-bold text-red-600 dark:text-red-400">
            Data Validation Errors
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground mt-1">
            Please fix the following errors before importing the data
          </AlertDialogDescription>
        </div>
      </div>
    </AlertDialogHeader>

    <div className="space-y-4">
      {/* Upload Summary Cards */}
      {uploadSummary.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Total Rows</div>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{uploadSummary.total}</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Successful</div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">{uploadSummary.success}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Failed</div>
            <div className="text-2xl font-bold text-red-700 dark:text-red-300">{uploadSummary.failed}</div>
          </div>
        </div>
      )}

      {/* Error Summary */}
      <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <span className="font-semibold text-red-800 dark:text-red-200">
            {importErrors.length} row{importErrors.length > 1 ? 's' : ''} failed validation
          </span>
        </div>
        <p className="text-sm text-red-700 dark:text-red-300">
          Please correct these errors in your Excel file and try uploading again. Row numbers correspond to your Excel file (including header row).
        </p>
      </div>

      {/* Detailed Error List */}
      <div className="space-y-3">
        {importErrors.map((error, index) => (
          <div key={index} className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-900/5">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-200 dark:border-red-700">
                  Row {error.row}
                </Badge>
                <span className="font-medium text-sm">
                  {error.degree_code} - {error.degree_name}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              {error.errors.map((err, errIndex) => (
                <div key={errIndex} className="flex items-start gap-2 text-sm">
                  <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-red-700 dark:text-red-300">{err}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Helpful Tips */}
      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mt-0.5">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">i</span>
          </div>
          <div>
            <h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">Common Fixes:</h4>
            <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <li>• Ensure all required fields are provided and not empty</li>
              <li>• Foreign keys must reference existing records (e.g., institution_code)</li>
              <li>• Check field length constraints (e.g., degree_code ≤ 50 chars)</li>
              <li>• Verify data format matches expected patterns</li>
              <li>• Status values: true/false or Active/Inactive</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <AlertDialogFooter>
      <AlertDialogAction onClick={() => setErrorPopupOpen(false)}>
        Close
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Enhanced API Error Handling:**
```typescript
// Individual save operations with specific error messages
const save = async () => {
  if (!validate()) return

  try {
    const response = await fetch('/api/degrees', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to save degree')
    }

    const savedDegree = await response.json()

    toast({
      title: editing ? "✅ Degree Updated" : "✅ Degree Created",
      description: `${savedDegree.degree_name} has been successfully ${editing ? 'updated' : 'created'}.`,
      className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to save degree. Please try again.'
    toast({
      title: "❌ Save Failed",
      description: errorMessage,
      variant: "destructive",
      className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
    })
  }
}
```

**Key Features:**
- ✅ **Row Count Tracking**: Displays exact counts (total, success, failed)
- ✅ **Visual Summary Cards**: Color-coded cards in error dialog (blue/green/red)
- ✅ **Detailed Error Messages**: Shows Excel row numbers and specific validation errors
- ✅ **Foreign Key Validation**: Client-side and server-side validation with clear error messages
- ✅ **User-Friendly Feedback**: Clear, actionable messages with proper pluralization
- ✅ **Enhanced Duration**: Longer toast duration (5-6s) for complex messages
- ✅ **Error Prevention Tips**: Helpful guidance in error dialog

### Foreign Key Auto-Mapping Pattern

**IMPORTANT**: When creating or updating entities with foreign key relationships, implement automatic ID mapping from codes to ensure referential integrity.

#### Program Module: Institution, Degree & Department Auto-Mapping

Reference implementation: [app/api/program/route.ts](app/api/program/route.ts) and [app/api/program/[id]/route.ts](app/api/program/[id]/route.ts)

**API Implementation (POST/PUT endpoints):**

```typescript
// 1. Validate and fetch institutions_id from institution_code (required)
const { data: institutionData, error: institutionError } = await supabase
  .from('institutions')
  .select('id')
  .eq('institution_code', String(institution_code))
  .single()

if (institutionError || !institutionData) {
  return NextResponse.json({
    error: `Institution with code "${institution_code}" not found. Please ensure the institution exists.`
  }, { status: 400 })
}

// 2. Validate and fetch degree_id from degree_code (required)
const { data: degreeData, error: degreeError } = await supabase
  .from('degrees')
  .select('id')
  .eq('degree_code', String(degree_code))
  .single()

if (degreeError || !degreeData) {
  return NextResponse.json({
    error: `Degree with code "${degree_code}" not found. Please ensure the degree exists.`
  }, { status: 400 })
}

// 3. Validate and fetch offering_department_id from offering_department_code (optional)
let offeringDepartmentId = null
if (offering_department_code) {
  const { data: deptData, error: deptError } = await supabase
    .from('departments')
    .select('id')
    .eq('department_code', String(offering_department_code))
    .single()

  if (deptError || !deptData) {
    return NextResponse.json({
      error: `Department with code "${offering_department_code}" not found. Please ensure the department exists.`
    }, { status: 400 })
  }
  offeringDepartmentId = deptData.id
}

// 4. Insert with both IDs and codes
const { data, error } = await supabase
  .from('programs')
  .insert({
    institutions_id: institutionData.id,        // FK reference
    institution_code: String(institution_code), // Human-readable code
    degree_id: degreeData.id,                   // FK reference
    degree_code: String(degree_code),           // Human-readable code
    offering_department_id: offeringDepartmentId, // Optional FK reference
    offering_department_code: offering_department_code ? String(offering_department_code) : null,
    // ... other fields
  })
  .select('*')
  .single()

// 5. Handle foreign key constraint errors
if (error) {
  console.error('Program insert error:', error)
  if (error.code === '23503') {
    return NextResponse.json({
      error: 'Foreign key constraint failed. Ensure institution and degree exist.'
    }, { status: 400 })
  }
  throw error
}
```

**Frontend Error Handling:**

```typescript
const save = async () => {
  if (!validate()) return
  try {
    setSaving(true)
    const res = await fetch('/api/program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    })

    if (!res.ok) {
      const errorData = await res.json()
      throw new Error(errorData.error || 'Create failed')
    }

    const created = await res.json()
    setItems((p) => [created, ...p])
    // ... success handling
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to save program'
    alert(errorMessage)
  }
}
```

**Key Features:**
- ✅ **Automatic ID Resolution**: Maps human-readable codes to database UUIDs
- ✅ **Pre-Insert Validation**: Ensures all referenced entities exist before insertion
- ✅ **Clear Error Messages**: Specific messages indicating which code is invalid
- ✅ **Optional FK Support**: Handles nullable foreign keys (e.g., offering_department_id)
- ✅ **Referential Integrity**: Prevents orphaned records and constraint violations
- ✅ **User-Friendly**: Shows codes in error messages instead of UUIDs

**Applies To:**
- Programs: `institution_code` → `institutions_id`, `degree_code` → `degree_id`, `offering_department_code` → `offering_department_id`
- Courses: Similar pattern for any course-related foreign keys
- Students: Similar pattern for program/section/semester foreign keys

## Important Notes

- **Race Conditions:** Always use atomic updates with conditional checks when marking records as used/processed
- **RLS Bypass:** Service role key bypasses Row Level Security - use carefully in server-side API routes
- **Session Timeout:** Handled via middleware and client-side session timeout provider
- **Inactive Users:** Automatically signed out and redirected to login with error cookie
- **Page Refresh Issues:** Middleware includes delays to prevent race conditions during auth state hydration

## API Error Handling

### Server-Side Error Response Pattern

**Reference Implementation:** [app/api/section/route.ts](app/api/section/route.ts)

All API routes should handle common database errors and return user-friendly error messages:

```typescript
if (error) {
  console.error('Error creating/updating record:', error)
  
  // Handle duplicate key constraint violation (23505)
  if (error.code === '23505') {
    return NextResponse.json({ 
      error: `Record already exists. Please use different values.` 
    }, { status: 400 })
  }
  
  // Handle foreign key constraint violation (23503)
  if (error.code === '23503') {
    return NextResponse.json({ 
      error: 'Invalid reference. Please select a valid option.' 
    }, { status: 400 })
  }
  
  // Handle check constraint violation (23514)
  if (error.code === '23514') {
    return NextResponse.json({ 
      error: 'Invalid value. Please check your input.' 
    }, { status: 400 })
  }
  
  // Generic error
  return NextResponse.json({ error: 'Failed to save record' }, { status: 500 })
}
```

### Common PostgreSQL Error Codes

- **23505**: Unique constraint violation (duplicates)
- **23503**: Foreign key constraint violation (invalid reference)
- **23514**: Check constraint violation (invalid value)
- **23502**: Not-null constraint violation (missing required field)

### Best Practices

1. **Always log the full error** for debugging: `console.error('Error:', error)`
2. **Return specific messages** based on error codes
3. **Use 400 status** for validation/constraint errors
4. **Use 500 status** for unexpected server errors
5. **Include field context** in error messages (e.g., which field caused the duplicate)
6. **Don't expose sensitive details** to end users (keep technical details in server logs)
