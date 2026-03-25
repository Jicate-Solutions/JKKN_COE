# Engineering Examiner Registration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a public Engineering external faculty registration form at `/engg-examiner-registration` for Kathir College of Engineering, with admin management via the existing exam-management/examiners page enhanced with form configuration.

**Architecture:** Separate page (`/engg-examiner-registration`) with Google OAuth, 8-section multi-step form. New columns added to `examiners` table + new `examiner_form_configs` table for institution-configurable form options. Admin page gets a "Form Settings" tab for managing form configs. The existing arts form stays untouched.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (PostgreSQL), Shadcn UI, Tailwind CSS, Google Identity Services

---

## Task 1: Database Migration — Extend examiners table + create examiner_form_configs

**Files:**
- Create: `supabase/migrations/20260325_extend_examiners_for_engineering.sql`
- Modify: `types/examiner.ts`

**Step 1: Create the migration file**

```sql
-- ═══════════════════════════════════════════════════════════════
-- Engineering Examiner Registration Schema Extension
-- ═══════════════════════════════════════════════════════════════

-- 1. Add new columns to examiners table
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS form_type VARCHAR(50) DEFAULT 'arts';
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS salutation VARCHAR(10);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS highest_qualification VARCHAR(255);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS aicte_faculty_code VARCHAR(100);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS personal_email VARCHAR(255);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS official_email VARCHAR(255);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS institution_coe_contact VARCHAR(50);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS institution_coe_email VARCHAR(255);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS teaching_exp_years INTEGER;
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS industry_exp_years INTEGER;
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS total_exp_years INTEGER;
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS area_of_expertise VARCHAR(500);
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS willingness_roles TEXT[];
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS google_profile_picture TEXT;
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS declaration_acknowledged BOOLEAN DEFAULT false;
ALTER TABLE examiners ADD COLUMN IF NOT EXISTS additional_data JSONB DEFAULT '{}';

-- Index on form_type for filtering
CREATE INDEX IF NOT EXISTS idx_examiners_form_type ON examiners(form_type);

-- 2. Create examiner_form_configs table
CREATE TABLE IF NOT EXISTS examiner_form_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id),
    institution_code VARCHAR(50),
    form_type VARCHAR(50) NOT NULL,
    url_slug VARCHAR(100) UNIQUE NOT NULL,
    form_title VARCHAR(500),
    form_description TEXT,
    exam_session_label VARCHAR(100),
    departments JSONB DEFAULT '[]',
    designations JSONB DEFAULT '[]',
    willingness_roles JSONB DEFAULT '[]',
    salutations JSONB DEFAULT '["Dr", "Mr", "Mrs", "Ms"]',
    header_logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    google_client_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_institution_form_type UNIQUE(institution_id, form_type)
);

-- RLS
ALTER TABLE examiner_form_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_form_configs" ON examiner_form_configs FOR ALL USING (auth.role() = 'service_role');
-- Public can read active configs (for the public form to load)
CREATE POLICY "public_read_active_configs" ON examiner_form_configs FOR SELECT USING (is_active = true);

-- 3. Seed engineering form config for Kathir College of Engineering
-- NOTE: Replace institution_id with actual UUID from institutions table
INSERT INTO examiner_form_configs (
    institution_code,
    form_type,
    url_slug,
    form_title,
    form_description,
    exam_session_label,
    departments,
    designations,
    willingness_roles,
    salutations,
    is_active
) VALUES (
    'KCE',
    'engineering',
    'engg-examiner-registration',
    'External Faculty Database Collection Form - Kathir College of Engineering [Autonomous], Coimbatore',
    'Greetings from Office of Controller of Examinations. External Examiner''s willingness form for Question Paper setting, Scrutiny, Practical Exams, Project Viva Voce and Central Valuation.',
    'Apr/May-2026',
    '["CSE", "AI&DS", "ECE", "EEE", "MECH", "CCE", "MATHEMATICS", "PHYSICS", "CHEMISTRY", "ENGLISH", "TAMIL", "CYBER SECURITY"]',
    '["Professor", "Associate Professor", "Assistant Professor"]',
    '["Question Paper Setter", "Question Paper Scrutiny", "External Examiner for Practical Exams", "Examiner for Central Valuation"]',
    '["Dr", "Mr", "Mrs", "Ms"]',
    true
) ON CONFLICT (url_slug) DO NOTHING;
```

**Step 2: Run the migration**

```bash
# Apply via Supabase MCP or direct SQL
# Verify: SELECT column_name FROM information_schema.columns WHERE table_name = 'examiners' AND column_name = 'form_type';
# Verify: SELECT * FROM examiner_form_configs;
```

**Step 3: Update TypeScript types in `types/examiner.ts`**

Add these types/interfaces after the existing code:

```typescript
// ── Engineering Examiner Extension Types ────────────────────

export interface ExaminerFormConfig {
	id: string
	institution_id?: string
	institution_code?: string
	form_type: string
	url_slug: string
	form_title?: string
	form_description?: string
	exam_session_label?: string
	departments: string[]
	designations: string[]
	willingness_roles: string[]
	salutations: string[]
	header_logo_url?: string
	is_active: boolean
	google_client_id?: string
	created_at: string
	updated_at: string
}

export interface EngineeringExaminerFormData {
	// Personal
	salutation: string
	full_name: string
	gender: string
	designation: string
	designation_other: string
	highest_qualification: string
	// Contact
	mobile: string
	personal_email: string
	official_email: string
	// Institutional
	aicte_faculty_code: string
	institution_name: string
	address_pincode: string
	institution_coe_contact: string
	institution_coe_email: string
	// Experience
	teaching_exp_years: string
	industry_exp_years: string
	total_exp_years: string
	// Academic
	department: string
	department_other: string
	ug_specialization: string
	pg_specialization: string
	phd_specialization: string
	area_of_expertise: string
	// Willingness
	willingness_roles: string[]
	// Courses
	theory_courses: { course: string; times: string }[]
	practical_courses: { course: string; times: string }[]
	// Declaration
	declaration_acknowledged: boolean
}

export const DEFAULT_ENGINEERING_FORM: EngineeringExaminerFormData = {
	salutation: '',
	full_name: '',
	gender: '',
	designation: '',
	designation_other: '',
	highest_qualification: '',
	mobile: '',
	personal_email: '',
	official_email: '',
	aicte_faculty_code: '',
	institution_name: '',
	address_pincode: '',
	institution_coe_contact: '',
	institution_coe_email: '',
	teaching_exp_years: '',
	industry_exp_years: '',
	total_exp_years: '',
	department: '',
	department_other: '',
	ug_specialization: '',
	pg_specialization: '',
	phd_specialization: '',
	area_of_expertise: '',
	willingness_roles: [],
	theory_courses: [
		{ course: '', times: '' },
		{ course: '', times: '' },
		{ course: '', times: '' },
	],
	practical_courses: [
		{ course: '', times: '' },
		{ course: '', times: '' },
		{ course: '', times: '' },
	],
	declaration_acknowledged: false,
}
```

Also extend the existing `Examiner` interface — add after `updated_by?`:

```typescript
	// Engineering-specific fields
	form_type?: string
	salutation?: string
	gender?: string
	highest_qualification?: string
	aicte_faculty_code?: string
	personal_email?: string
	official_email?: string
	institution_coe_contact?: string
	institution_coe_email?: string
	teaching_exp_years?: number
	industry_exp_years?: number
	total_exp_years?: number
	area_of_expertise?: string
	willingness_roles?: string[]
	google_profile_picture?: string
	declaration_acknowledged?: boolean
	additional_data?: Record<string, unknown>
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260325_extend_examiners_for_engineering.sql types/examiner.ts
git commit -m "feat: extend examiners schema for engineering form + form_configs table"
```

---

## Task 2: Public API — Form Config endpoint

**Files:**
- Create: `app/api/public/form-config/[slug]/route.ts`

**Step 1: Create the form config API route**

This public endpoint loads form configuration by URL slug. The public form page calls this to know which fields/options to render.

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ slug: string }> }
) {
	const { slug } = await params
	const supabase = getSupabaseServer()

	const { data, error } = await supabase
		.from('examiner_form_configs')
		.select('*')
		.eq('url_slug', slug)
		.eq('is_active', true)
		.single()

	if (error || !data) {
		return NextResponse.json(
			{ error: 'Form not found or inactive' },
			{ status: 404 }
		)
	}

	return NextResponse.json(data)
}
```

**Step 2: Commit**

```bash
git add app/api/public/form-config/\[slug\]/route.ts
git commit -m "feat: add public form-config API endpoint"
```

---

## Task 3: Extend Public Registration API for Engineering

**Files:**
- Modify: `app/api/public/examiner/register/route.ts`

**Step 1: Extend the POST handler**

Add engineering form support. The key change: detect `form_type` in request body. If `form_type === 'engineering'`, handle the extra fields and store specializations/courses in `additional_data` JSONB.

After the existing validation block, add a branch for engineering:

```typescript
// Add to the existing POST handler, after email validation:

// Determine form_type
const formType = body.form_type || 'arts'

// Build the insert payload
let insertPayload: Record<string, unknown> = {
	full_name: body.full_name.trim().toUpperCase(),
	email: body.email.toLowerCase().trim(),
	mobile: body.mobile?.trim() || null,
	designation: body.designation?.trim() || null,
	department: body.department?.trim() || null,
	institution_name: body.institution_name?.trim() || null,
	institution_address: body.institution_address?.trim() || null,
	status: 'PENDING',
	email_verified: body.email_verified || false,
	form_type: formType,
	institution_code: body.institution_code || null,
	google_profile_picture: body.google_profile_picture || null,
}

if (formType === 'engineering') {
	// Engineering-specific columns
	insertPayload = {
		...insertPayload,
		salutation: body.salutation?.trim() || null,
		gender: body.gender?.trim() || null,
		highest_qualification: body.highest_qualification?.trim() || null,
		aicte_faculty_code: body.aicte_faculty_code?.trim() || null,
		personal_email: body.personal_email?.toLowerCase().trim() || null,
		official_email: body.official_email?.toLowerCase().trim() || null,
		institution_coe_contact: body.institution_coe_contact?.trim() || null,
		institution_coe_email: body.institution_coe_email?.toLowerCase().trim() || null,
		teaching_exp_years: body.teaching_exp_years ? Number(body.teaching_exp_years) : null,
		industry_exp_years: body.industry_exp_years ? Number(body.industry_exp_years) : null,
		total_exp_years: body.total_exp_years ? Number(body.total_exp_years) : null,
		area_of_expertise: body.area_of_expertise?.trim() || null,
		willingness_roles: body.willingness_roles || [],
		declaration_acknowledged: body.declaration_acknowledged || false,
		examiner_type: 'ALL', // Engineering examiners are multi-role
		// JSONB overflow for specializations and courses
		additional_data: {
			ug_specialization: body.ug_specialization?.trim() || null,
			pg_specialization: body.pg_specialization?.trim() || null,
			phd_specialization: body.phd_specialization?.trim() || null,
			theory_courses: body.theory_courses || [],
			practical_courses: body.practical_courses || [],
			address_pincode: body.address_pincode?.trim() || null,
		},
	}

	// Resolve institution_code to institution_id
	if (body.institution_code) {
		const { data: inst } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', body.institution_code)
			.maybeSingle()
		if (inst) {
			insertPayload.institution_id = inst.id
		}
	}
} else {
	// Existing arts logic (keep as-is for the board-based flow)
	// ... existing code for ug_experience_years, pg_experience_years,
	// examiner_type determination, board associations, etc.
}
```

**Important:** Do NOT delete existing arts registration logic. Wrap it in the `else` branch of `formType === 'engineering'`.

**Step 2: Commit**

```bash
git add app/api/public/examiner/register/route.ts
git commit -m "feat: extend registration API to handle engineering form submissions"
```

---

## Task 4: Add `/engg-examiner-registration` to Middleware Public Routes

**Files:**
- Modify: `middleware.ts`

**Step 1: Add the route to the public routes array**

Find the `publicRoutes` array in middleware.ts and add:

```typescript
'/engg-examiner-registration',
```

Right after the existing `/arts-examiner-registration` entry.

**Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat: add engg-examiner-registration to public routes"
```

---

## Task 5: Build the Engineering Examiner Registration Page

**Files:**
- Create: `app/engg-examiner-registration/page.tsx`

**This is the largest task.** The page follows the exact same pattern as `app/arts-examiner-registration/page.tsx` but with 8 form sections and config-driven dropdowns.

**Step 1: Create the page**

Reference the existing arts form at `app/arts-examiner-registration/page.tsx` for:
- Google Identity Services integration pattern (lines 53-182)
- Toast pattern
- Already-submitted / checking-status screens (lines 248-299)
- Form submission pattern (lines 203-239)

The engineering page structure:

```
'use client'

1. Imports (same Shadcn components + icons)
2. Constants: INSTITUTION_CODE = 'KCE'
3. Types: GooglePayload (same as arts), FormConfig
4. Component: EnggExaminerRegistrationPage
   a. State: googleVerified, googleUser, gsiReady (same)
   b. State: formData (EngineeringExaminerFormData from types)
   c. State: formConfig (loaded from API)
   d. State: loading, submitting, submitted, alreadySubmitted, errors
   e. useEffect: fetch form config from /api/public/form-config/engg-examiner-registration
   f. Google OAuth handlers (same as arts)
   g. handleCheckStatus (same as arts, check email on Google sign-in)
   h. Validation function (8-section validation)
   i. handleSubmit → POST to /api/public/examiner/register with form_type: 'engineering'
   j. Render:
      - Already submitted screens (same pattern)
      - Checking status screen (same pattern)
      - Google sign-in screen (if not verified)
      - Form with 8 sections
```

**Key UI patterns for the form sections:**

```tsx
{/* Section 1: Personal Information */}
<Card>
  <CardContent className="p-5 space-y-4">
    <h3 className="font-semibold flex items-center gap-2">
      <User className="w-4 h-4 text-blue-600" /> Personal Information
    </h3>
    <div className="grid grid-cols-2 gap-4">
      {/* Salutation dropdown — options from formConfig.salutations */}
      {/* Name input — onChange: value.toUpperCase() */}
      {/* Gender dropdown */}
      {/* Designation dropdown + "Other" reveals text input */}
      {/* Highest Qualification */}
    </div>
  </CardContent>
</Card>

{/* Section 2–8: Follow same Card pattern */}

{/* Section 6: Willingness Roles — multi-checkbox from formConfig.willingness_roles */}
<div className="space-y-2">
  {formConfig?.willingness_roles.map((role) => (
    <div key={role} className="flex items-center gap-2">
      <Checkbox
        checked={formData.willingness_roles.includes(role)}
        onCheckedChange={(checked) => {
          setFormData(prev => ({
            ...prev,
            willingness_roles: checked
              ? [...prev.willingness_roles, role]
              : prev.willingness_roles.filter(r => r !== role)
          }))
        }}
      />
      <Label>{role}</Label>
    </div>
  ))}
</div>

{/* Section 7: Courses — 3 entries each */}
{[0, 1, 2].map((i) => (
  <div key={i} className="grid grid-cols-3 gap-2">
    <div className="col-span-2">
      <Label>Theory Course {i + 1}</Label>
      <Input
        value={formData.theory_courses[i].course}
        onChange={(e) => updateTheoryCourse(i, 'course', e.target.value)}
        placeholder="e.g. Engineering Graphics"
      />
    </div>
    <div>
      <Label>Times Handled</Label>
      <Input
        value={formData.theory_courses[i].times}
        onChange={(e) => updateTheoryCourse(i, 'times', e.target.value)}
        placeholder="e.g. 03"
        type="number"
      />
    </div>
  </div>
))}

{/* Section 8: Declaration */}
<div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
  <Checkbox
    checked={formData.declaration_acknowledged}
    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, declaration_acknowledged: !!checked }))}
  />
  <p className="text-sm text-gray-700">
    I hereby declare that the information furnished above is true and correct.
    I am willing to serve as an External Examiner for the upcoming examinations.
  </p>
</div>
```

**Validation rules:**

```typescript
const validate = () => {
  const e: Record<string, string> = {}

  // Personal
  if (!formData.salutation) e.salutation = 'Required'
  if (!formData.full_name.trim()) e.full_name = 'Name is required'
  if (!/^[A-Z\s.]+$/.test(formData.full_name.trim())) e.full_name = 'Name must be uppercase letters only'
  if (!formData.gender) e.gender = 'Required'
  if (!formData.designation && !formData.designation_other) e.designation = 'Required'
  if (!formData.highest_qualification.trim()) e.highest_qualification = 'Required'

  // Contact
  if (!formData.mobile.trim()) e.mobile = 'Required'
  if (formData.mobile && !/^[6-9][0-9]{9}$/.test(formData.mobile.replace(/\s/g, '')))
    e.mobile = 'Enter valid 10-digit Indian mobile number'
  if (!formData.personal_email.trim()) e.personal_email = 'Required'
  if (formData.personal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.personal_email))
    e.personal_email = 'Invalid email'
  if (!formData.official_email.trim()) e.official_email = 'Required'
  if (formData.official_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.official_email))
    e.official_email = 'Invalid email'

  // Institutional
  if (!formData.aicte_faculty_code.trim()) e.aicte_faculty_code = 'Required'
  if (!formData.institution_name.trim()) e.institution_name = 'Required'
  if (!formData.address_pincode.trim()) e.address_pincode = 'Required'
  if (!formData.institution_coe_contact.trim()) e.institution_coe_contact = 'Required'
  if (!formData.institution_coe_email.trim()) e.institution_coe_email = 'Required'

  // Experience
  if (!formData.teaching_exp_years) e.teaching_exp_years = 'Required'
  if (!formData.total_exp_years) e.total_exp_years = 'Required'
  if (Number(formData.total_exp_years) < Number(formData.teaching_exp_years))
    e.total_exp_years = 'Must be ≥ teaching experience'

  // Academic
  const dept = formData.department || formData.department_other
  if (!dept) e.department = 'Required'
  if (!formData.ug_specialization.trim()) e.ug_specialization = 'Required'
  if (!formData.pg_specialization.trim()) e.pg_specialization = 'Required'
  if (!formData.phd_specialization.trim()) e.phd_specialization = 'Required'
  if (!formData.area_of_expertise.trim()) e.area_of_expertise = 'Required'

  // Willingness
  if (formData.willingness_roles.length === 0) e.willingness_roles = 'Select at least one role'

  // Courses
  const hasTheory = formData.theory_courses.some(c => c.course.trim())
  if (!hasTheory) e.theory_courses = 'At least one theory course required'
  const hasPractical = formData.practical_courses.some(c => c.course.trim())
  if (!hasPractical) e.practical_courses = 'At least one practical course required'

  // Declaration
  if (!formData.declaration_acknowledged) e.declaration = 'You must acknowledge the declaration'

  setErrors(e)
  return Object.keys(e).length === 0
}
```

**Step 2: Verify the page renders**

```bash
npm run dev
# Visit http://localhost:3000/engg-examiner-registration
# Verify: Google sign-in button shows, form loads config
```

**Step 3: Commit**

```bash
git add app/engg-examiner-registration/page.tsx
git commit -m "feat: add engineering examiner registration public form"
```

---

## Task 6: Admin API — Form Config CRUD

**Files:**
- Create: `app/api/examiner-form-configs/route.ts`

**Step 1: Create the admin API for form config management**

```typescript
// GET: List all form configs (filtered by institution)
// POST: Create new form config
// PUT: Update form config
// DELETE: Delete form config

// GET supports: institutions_id, institution_code query params
// POST requires: form_type, url_slug (unique)
// PUT requires: id, update fields
// DELETE requires: id query param
```

Follow the standard COE API route patterns from CLAUDE.md:
- GET with institution filtering via `useInstitutionFilter` params
- POST with FK auto-mapping (institution_code → institution_id)
- PUT that prevents changing institution after creation
- DELETE with FK constraint check
- Error codes: 23505 (duplicate slug), 23503 (FK violation)

**Step 2: Commit**

```bash
git add app/api/examiner-form-configs/route.ts
git commit -m "feat: add examiner form configs admin API"
```

---

## Task 7: Extend Admin Examiners API — form_type filter + new fields in responses

**Files:**
- Modify: `app/api/examiners/route.ts`

**Step 1: Add form_type filter to GET**

In the GET handler, add:
- Accept `form_type` query parameter
- Filter: `if (formType && formType !== 'all') query = query.eq('form_type', formType)`
- Add `form_type` to the stats breakdown
- Include new columns in the SELECT: `form_type, salutation, gender, highest_qualification, willingness_roles, additional_data`

**Step 2: Update POST/PUT to handle new fields**

In the POST handler, accept all new engineering fields in the insert payload.
In the PUT handler, allow updating engineering-specific fields.

**Step 3: Commit**

```bash
git add app/api/examiners/route.ts
git commit -m "feat: add form_type filter and engineering fields to admin API"
```

---

## Task 8: Admin Page — Form Settings Tab

**Files:**
- Modify: `app/(coe)/exam-management/examiners/page.tsx`

**Step 1: Add tab navigation**

Add a simple tab bar above the existing content:

```tsx
const [activeTab, setActiveTab] = useState<'examiners' | 'form-settings'>('examiners')

// In render, before the existing content:
<div className="flex gap-1 mb-4 border-b">
  <button
    className={`px-4 py-2 text-sm font-medium ${activeTab === 'examiners' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
    onClick={() => setActiveTab('examiners')}
  >
    Examiners
  </button>
  <button
    className={`px-4 py-2 text-sm font-medium ${activeTab === 'form-settings' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
    onClick={() => setActiveTab('form-settings')}
  >
    Form Settings
  </button>
</div>

{activeTab === 'examiners' && (
  // ... existing examiners table content
)}

{activeTab === 'form-settings' && (
  <FormSettingsTab />
)}
```

**Step 2: Build the FormSettingsTab component inline**

The Form Settings tab shows:
- Table of `examiner_form_configs` rows
- Add/Edit sheet with fields:
  - Institution selector
  - Form type (engineering/arts)
  - URL slug (auto-generated from institution, editable)
  - Form title, description, exam session label
  - Departments list (tag input — type + Enter to add, X to remove)
  - Designations list (same tag input pattern)
  - Willingness roles list (same tag input pattern)
  - Active/Inactive toggle
- Copy public link button (copies `coe.jkkn.ai/<slug>`)

**Step 3: Add form_type filter to the Examiners tab**

Add a new filter dropdown next to the existing status/type filters:

```tsx
<Select value={formTypeFilter} onValueChange={setFormTypeFilter}>
  <SelectTrigger className="w-[140px]">
    <SelectValue placeholder="Form Type" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Forms</SelectItem>
    <SelectItem value="engineering">Engineering</SelectItem>
    <SelectItem value="arts">Arts</SelectItem>
  </SelectContent>
</Select>
```

**Step 4: Enhance examiner detail view for engineering fields**

When viewing an examiner with `form_type === 'engineering'`, show additional sections:
- Specializations (from additional_data)
- Courses handled (from additional_data)
- Willingness roles (from willingness_roles array)
- Declaration status

**Step 5: Commit**

```bash
git add app/\(coe\)/exam-management/examiners/page.tsx
git commit -m "feat: add Form Settings tab and form_type filter to admin examiners page"
```

---

## Task 9: Extend Export for Engineering Fields

**Files:**
- Modify: `app/(coe)/exam-management/examiners/page.tsx` (export function)

**Step 1: Add engineering columns to Excel export**

When exporting, detect if items include engineering examiners and add columns:
- Salutation, Gender, Qualification, AICTE Code
- Personal Email, Official Email
- Teaching/Industry/Total Experience
- Department, Specializations (UG, PG, PhD)
- Area of Expertise
- Willingness Roles (join with comma)
- Theory Courses (flatten from JSONB)
- Practical Courses (flatten from JSONB)

Use the existing XLSX export pattern in the page.

**Step 2: Commit**

```bash
git add app/\(coe\)/exam-management/examiners/page.tsx
git commit -m "feat: include engineering fields in examiner Excel export"
```

---

## Task 10: Polish & Test

**Step 1: Test the full flow end-to-end**

1. Visit `/engg-examiner-registration`
2. Sign in with Google
3. Fill all 8 sections
4. Submit — verify record appears in admin page with `form_type: 'engineering'`
5. In admin, approve the examiner
6. Re-visit form with same Google account — verify "already registered" screen

**Step 2: Test admin Form Settings**

1. Go to exam-management/examiners → Form Settings tab
2. Edit the engineering config — add a new department
3. Verify the public form shows the new department in dropdown

**Step 3: Test export**

1. Export examiners to Excel
2. Verify engineering-specific columns appear

**Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete engineering examiner registration system"
```

---

## Architecture Summary

```
┌──────────────────────────────────┐
│  Public Form                     │
│  /engg-examiner-registration     │
│  (Google OAuth → 8-section form) │
└──────────────┬───────────────────┘
               │ POST /api/public/examiner/register
               │ (form_type: 'engineering')
               ▼
┌──────────────────────────────────┐
│  examiners table                 │
│  ├── core columns (shared)       │
│  ├── engineering columns (new)   │
│  └── additional_data JSONB       │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  Admin: exam-management/examiners│
│  ├── Tab: Examiners (+ filter)   │
│  ├── Tab: Form Settings          │
│  └── Export (+ engineering cols)  │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  examiner_form_configs table     │
│  (JSONB departments, roles, etc) │
│  Loaded by public form via API   │
│  Managed by admin Form Settings  │
└──────────────────────────────────┘
```

## Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260325_extend_examiners_for_engineering.sql` | Create | Schema migration |
| `types/examiner.ts` | Modify | Add engineering types + form config interface |
| `app/api/public/form-config/[slug]/route.ts` | Create | Public form config API |
| `app/api/public/examiner/register/route.ts` | Modify | Handle engineering submissions |
| `middleware.ts` | Modify | Add public route |
| `app/engg-examiner-registration/page.tsx` | Create | Engineering public form |
| `app/api/examiner-form-configs/route.ts` | Create | Admin form config CRUD |
| `app/api/examiners/route.ts` | Modify | Add form_type filter + fields |
| `app/(coe)/exam-management/examiners/page.tsx` | Modify | Form Settings tab + filter + detail view |
