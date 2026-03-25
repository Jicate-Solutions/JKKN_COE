# JKKN COE CRUD Page Generator Skill

## Overview
This skill generates fully-featured CRUD pages for the JKKN College of Engineering application with consistent UI/UX, comprehensive validation, bulk operations, and error handling.

---

## Core Capabilities

### 1. Full-Stack CRUD Implementation
- **Frontend**: React/Next.js with TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Next.js API routes with Supabase integration
- **Features**: Create, Read, Update, Delete with validation and error handling

### 2. Advanced Data Management
- **Search & Filter**: Real-time search across multiple fields, status filtering
- **Sorting**: Multi-column sorting with visual indicators
- **Pagination**: 10 items per page with navigation controls
- **Bulk Operations**: Import/Export with detailed error tracking

### 3. Import/Export Functionality
- **Export Formats**: JSON, Excel (.xlsx)
- **Template Export**: Pre-formatted Excel with reference sheets
- **Import Formats**: JSON, CSV, Excel
- **Validation**: Row-by-row validation with detailed error reporting

### 4. UI Design Standards
- **Font Sizes**:
  - Page Title: `text-2xl font-bold`
  - Section Headers: `text-lg font-bold`
  - Form Labels: `text-sm font-semibold` (required) / `text-sm font-medium` (optional)
  - Table Headers: `text-[11px]`
  - Table Cells: `text-[11px]`
  - Buttons: `text-xs` (size sm), `h-8` for toolbar, `h-10` for forms
  - Input Fields: `h-8` (search/filters), `h-10` (forms)
  - Breadcrumbs: Default size
  - Toast Messages: Default size
  - Error Messages: `text-xs`

---

## Usage Instructions

### Step 1: Define Your Entity

Fill in these placeholders:

```yaml
# Entity Identification
ENTITY_NAME: "Course"              # Singular, PascalCase
ENTITY_NAME_PLURAL: "Courses"      # Plural, PascalCase
entity_name: "course"              # Singular, lowercase
entity_name_plural: "courses"      # Plural, lowercase
TABLE_NAME: "courses"              # Database table name
API_ROUTE: "courses"               # API endpoint path
PAGE_ROUTE: "courses"              # Frontend route path
ICON_NAME: "BookOpen"              # Lucide icon name

# Database Schema
DATABASE_FIELDS:
  - name: "course_code"
    type: "VARCHAR(50)"
    required: true
    validation: "alphanumeric with hyphens/underscores"
  
  - name: "course_title"
    type: "VARCHAR(255)"
    required: true
    validation: "max 255 characters"
  
  - name: "credits"
    type: "INTEGER"
    required: false
    validation: "numeric, range 1-10"

# Foreign Key Relationships
FOREIGN_KEYS:
  - field: "institution_code"
    references: "institutions(institution_code)"
    display_field: "institution_name"
    required: true
    
  - field: "regulation_code"
    references: "regulations(regulation_code)"
    display_field: "regulation_name"
    required: true

# Display Configuration
PRIMARY_DISPLAY_FIELD: "course_code"      # Main identifier in lists
SECONDARY_DISPLAY_FIELD: "course_title"   # Secondary identifier
DESCRIPTION_FIELD: "description"          # Optional description field
```

### Step 2: Generate the Code

Use this prompt structure:

```
Create a complete CRUD page for managing [ENTITY_NAME_PLURAL] in the JKKN COE application.

Use the entity details from Step 1 above.

Generate both:
1. Frontend: app/coe/[PAGE_ROUTE]/page.tsx
2. Backend: app/api/[API_ROUTE]/route.ts

Follow all patterns from the degree module reference implementation including:
- Font size specifications (text-[11px] for tables, text-xs for buttons)
- Complete scorecard section
- Foreign key auto-mapping
- Row-by-row upload validation
- Detailed error dialog with upload summary
- Template export with reference sheets
```

---

## Generated Features Checklist

### Frontend Components (page.tsx)

#### ✅ Data Management
- [ ] TypeScript interface with all fields
- [ ] State management (items, loading, search, sort, pagination)
- [ ] Data fetching from API with error handling
- [ ] Foreign key dropdown population
- [ ] Real-time search across multiple fields
- [ ] Status filtering (All/Active/Inactive)
- [ ] Multi-column sorting with icons
- [ ] Pagination (10 items per page)

#### ✅ Form & Validation
- [ ] Add/Edit sheet with gradient header design
- [ ] Form sections with gradient headers
- [ ] Required field indicators (red asterisk)
- [ ] Client-side validation with error messages
- [ ] Foreign key dropdown selectors
- [ ] Status toggle (Active/Inactive)
- [ ] Form reset on cancel/success

#### ✅ CRUD Operations
- [ ] Create with foreign key resolution
- [ ] Read with filtering options
- [ ] Update with validation
- [ ] Delete with confirmation dialog
- [ ] Success/error toast notifications

#### ✅ Bulk Operations
- [ ] Export to JSON
- [ ] Export to Excel with formatted columns
- [ ] Template export with:
  - Sample row with proper values
  - Mandatory fields marked red with asterisk
  - Reference sheets for foreign keys
  - Styled headers and data rows
- [ ] Import from JSON/CSV/Excel
- [ ] Row-by-row validation during import
- [ ] Upload summary cards (Total/Success/Failed)
- [ ] Detailed error dialog with:
  - Row numbers from Excel file
  - Entity identifiers
  - Specific validation errors
  - Helpful tips section

#### ✅ UI Components
- [ ] Scorecard section (4 cards):
  - Total items
  - Active items
  - Inactive items
  - New this month
- [ ] Breadcrumb navigation
- [ ] Search bar (text-xs, h-8)
- [ ] Status filter dropdown
- [ ] Action buttons toolbar (text-xs, h-8)
- [ ] Data table with proper column widths
- [ ] Table headers (text-[11px], sortable)
- [ ] Table cells (text-[11px])
- [ ] Status badges (Active/Inactive colored)
- [ ] Pagination controls
- [ ] Loading states
- [ ] Empty states

#### ✅ Font Sizes (Critical)
```typescript
// Buttons
"text-xs px-2 h-8"  // Toolbar buttons (Refresh, Template, Upload, etc.)
"text-xs px-2 h-8"  // Add button
"h-7 w-7 p-0"       // Edit/Delete icon buttons

// Table
"text-[11px]"       // Table headers
"text-[11px]"       // Table cells

// Form
"text-sm font-semibold"  // Required labels
"text-sm font-medium"    // Optional labels
"text-xs"                // Error messages
"h-10"                   // Form inputs
"text-2xl font-bold"     // Sheet title
"text-lg font-bold"      // Section headers

// Search & Filters
"text-xs"           // Search input text
"h-8"               // Search input height
"h-8"               // Filter dropdown height

// Cards
"text-xs"           // Card labels
"text-xl font-bold" // Card values
```

### Backend API (route.ts)

#### ✅ GET Endpoint
- [ ] Fetch all records with optional filtering
- [ ] Sort by created_at (descending)
- [ ] Status field normalization
- [ ] Error handling

#### ✅ POST Endpoint
- [ ] Foreign key auto-mapping (code → id)
- [ ] Validation with descriptive errors
- [ ] Duplicate key error handling (23505)
- [ ] Foreign key constraint error handling (23503)
- [ ] Required field validation
- [ ] Success response with normalized data

#### ✅ PUT Endpoint
- [ ] Foreign key auto-mapping (code → id)
- [ ] Update validation
- [ ] Constraint error handling
- [ ] Success response with normalized data

#### ✅ DELETE Endpoint
- [ ] ID validation
- [ ] Cascade delete handling
- [ ] Error handling
- [ ] Success response

---

## Foreign Key Auto-Mapping Pattern

### Frontend → Backend Flow

```typescript
// Frontend sends code
const payload = {
  institution_code: "JKKN",
  course_code: "CS101",
  course_title: "Data Structures"
}

// Backend auto-maps code to ID
// 1. Lookup institution by code
const { data: inst } = await supabase
  .from('institutions')
  .select('id, institution_code')
  .eq('institution_code', 'JKKN')
  .maybeSingle()

// 2. Add ID to payload
const insertPayload = {
  institution_code: "JKKN",
  institutions_id: inst.id,  // Auto-mapped
  course_code: "CS101",
  course_title: "Data Structures"
}

// 3. Insert with both code and ID
await supabase.from('courses').insert([insertPayload])
```

### Error Handling
```typescript
// Invalid code
if (!inst) {
  return NextResponse.json({
    error: `Invalid institution_code: ${institution_code}. Institution not found.`
  }, { status: 400 })
}

// Duplicate entry (23505)
if (error.code === '23505') {
  return NextResponse.json({
    error: 'Course already exists. Please use different values.'
  }, { status: 400 })
}

// Foreign key violation (23503)
if (error.code === '23503') {
  return NextResponse.json({
    error: 'Invalid reference. Please select a valid option.'
  }, { status: 400 })
}
```

---

## Import/Export Implementation

### Template Export Structure

```typescript
// Sheet 1: Template with sample data
const sample = [{
  'Institution Code *': 'JKKN',
  'Course Code *': 'CS101',
  'Course Title *': 'Data Structures',
  'Credits': '4',
  'Status': 'Active'
}]

// Sheet 2: Institution Code Reference
const institutionReference = institutions.map(inst => ({
  'Institution Code': inst.institution_code,
  'Institution Name': inst.name || 'N/A',
  'Status': inst.is_active ? 'Active' : 'Inactive'
}))

// Style mandatory headers (red with asterisk)
const mandatoryFields = ['Institution Code', 'Course Code', 'Course Title']
for (let col = range.s.c; col <= range.e.c; col++) {
  const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
  const cell = ws[cellAddress]
  const isMandatory = mandatoryFields.includes(cell.v as string)
  
  if (isMandatory) {
    cell.v = cell.v + ' *'
    cell.s = {
      font: { color: { rgb: 'FF0000' }, bold: true },
      fill: { fgColor: { rgb: 'FFE6E6' } }
    }
  }
}
```

### Import Validation

```typescript
const validateCourseData = (data: any, rowIndex: number) => {
  const errors: string[] = []
  
  // Required fields
  if (!data.course_code || data.course_code.trim() === '') {
    errors.push('Course Code is required')
  }
  
  // Length validation
  if (data.course_code && data.course_code.length > 50) {
    errors.push('Course Code must be 50 characters or less')
  }
  
  // Format validation
  if (data.course_code && !/^[A-Za-z0-9\-_]+$/.test(data.course_code)) {
    errors.push('Course Code can only contain letters, numbers, hyphens, and underscores')
  }
  
  // Numeric validation
  if (data.credits && (Number(data.credits) < 1 || Number(data.credits) > 10)) {
    errors.push('Credits must be between 1 and 10')
  }
  
  return errors
}
```

### Upload Error Dialog

```typescript
// Error tracking structure
const [importErrors, setImportErrors] = useState<Array<{
  row: number
  course_code: string
  course_title: string
  errors: string[]
}>>([])

const [uploadSummary, setUploadSummary] = useState<{
  total: number
  success: number
  failed: number
}>({ total: 0, success: 0, failed: 0 })

// Display in dialog
{uploadSummary.total > 0 && (
  <div className="grid grid-cols-3 gap-3">
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
      <div className="text-xs text-blue-600 font-medium mb-1">Total Rows</div>
      <div className="text-2xl font-bold text-blue-700">{uploadSummary.total}</div>
    </div>
    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
      <div className="text-xs text-green-600 font-medium mb-1">Successful</div>
      <div className="text-2xl font-bold text-green-700">{uploadSummary.success}</div>
    </div>
    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
      <div className="text-xs text-red-600 font-medium mb-1">Failed</div>
      <div className="text-2xl font-bold text-red-700">{uploadSummary.failed}</div>
    </div>
  </div>
)}
```

---

## Toast Notification Patterns

```typescript
// Success (Create)
toast({
  title: "✅ Course Created",
  description: `${newCourse.course_title} has been successfully created.`,
  className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
})

// Success (Update)
toast({
  title: "✅ Course Updated",
  description: `${updatedCourse.course_title} has been successfully updated.`,
  className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
})

// Success (Delete)
toast({
  title: "✅ Course Deleted",
  description: `${courseName} has been successfully deleted.`,
  className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
})

// Upload Complete (All Success)
toast({
  title: "✅ Upload Complete",
  description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''}.`,
  className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
  duration: 5000,
})

// Upload Partial Success
toast({
  title: "⚠️ Partial Upload Success",
  description: `Processed ${totalRows} rows: ${successCount} successful, ${errorCount} failed.`,
  className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
  duration: 6000,
})

// Error
toast({
  title: "❌ Save Failed",
  description: errorMessage,
  variant: "destructive",
  className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
})
```

---

## Common Customizations

### Multiple Foreign Keys
```typescript
// Repeat auto-mapping pattern for each FK
let institution_code: string | undefined = body.institution_code
let institutions_id: string | undefined = body.institutions_id

let regulation_code: string | undefined = body.regulation_code
let regulations_id: string | undefined = body.regulations_id

// Map institution
if (institution_code) {
  const { data: inst } = await supabase
    .from('institutions')
    .select('id, institution_code')
    .eq('institution_code', institution_code)
    .maybeSingle()
  institutions_id = inst?.id
}

// Map regulation
if (regulation_code) {
  const { data: reg } = await supabase
    .from('regulations')
    .select('id, regulation_code')
    .eq('regulation_code', regulation_code)
    .maybeSingle()
  regulations_id = reg?.id
}
```

### Conditional Fields
```typescript
// Split credit example
const [showSplitCredit, setShowSplitCredit] = useState(false)

<div className="flex items-center gap-4">
  <Label className="text-sm font-semibold">Split Credit</Label>
  <button
    type="button"
    onClick={() => setShowSplitCredit(!showSplitCredit)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      showSplitCredit ? 'bg-blue-500' : 'bg-gray-300'
    }`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
      showSplitCredit ? 'translate-x-6' : 'translate-x-1'
    }`} />
  </button>
</div>

{showSplitCredit && (
  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label htmlFor="theory_credit">Theory Credit</Label>
      <Input id="theory_credit" type="number" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="practical_credit">Practical Credit</Label>
      <Input id="practical_credit" type="number" />
    </div>
  </div>
)}
```

### Enum Fields
```typescript
<div className="space-y-2">
  <Label htmlFor="course_type" className="text-sm font-semibold">
    Course Type <span className="text-red-500">*</span>
  </Label>
  <Select
    value={formData.course_type}
    onValueChange={(value) => setFormData(prev => ({ ...prev, course_type: value }))}
  >
    <SelectTrigger className={`h-10 ${errors.course_type ? 'border-destructive' : ''}`}>
      <SelectValue placeholder="Select Course Type" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="theory">Theory</SelectItem>
      <SelectItem value="practical">Practical</SelectItem>
      <SelectItem value="hybrid">Hybrid</SelectItem>
    </SelectContent>
  </Select>
  {errors.course_type && <p className="text-xs text-destructive">{errors.course_type}</p>}
</div>
```

---

## Quality Assurance Checklist

Before deployment, verify:

### Functionality
- [ ] All CRUD operations work correctly
- [ ] Search filters data properly
- [ ] Sorting works on all columns
- [ ] Pagination navigates correctly
- [ ] Foreign key dropdowns populate
- [ ] Foreign key auto-mapping works
- [ ] Form validation catches all errors
- [ ] Delete confirmation prevents accidents
- [ ] Import validates all rows
- [ ] Export includes all data
- [ ] Template has correct reference sheets

### UI/UX
- [ ] All font sizes match specifications
- [ ] Button heights are consistent (h-8 toolbar, h-10 forms)
- [ ] Input heights are consistent (h-8 filters, h-10 forms)
- [ ] Table text is readable (text-[11px])
- [ ] Status badges have correct colors
- [ ] Icons are appropriate size
- [ ] Loading states display properly
- [ ] Empty states are informative
- [ ] Error messages are helpful
- [ ] Toast notifications are clear

### Data Integrity
- [ ] Required fields enforced
- [ ] Foreign keys validated
- [ ] Duplicate entries prevented
- [ ] Field length limits respected
- [ ] Numeric ranges validated
- [ ] Status values normalized

### Error Handling
- [ ] API errors caught and displayed
- [ ] Network errors handled gracefully
- [ ] Validation errors show specific messages
- [ ] Upload errors tracked per row
- [ ] Error dialog shows helpful tips
- [ ] Console logs aid debugging

---

## Reference Files

- **Frontend Example**: `app/coe/degree/page.tsx`
- **Backend Example**: `app/api/degrees/route.ts`
- **Template Source**: `UNIVERSAL_CRUD_PROMPT_TEMPLATE.md`

---

## Quick Start Example

```bash
# Generate a Courses CRUD page

Entity: Course
Table: courses
Required: institution_code, regulation_code, course_code, course_title
Optional: display_name, description, credits, theory_credit, practical_credit

# This generates:
# - app/coe/courses/page.tsx (1200+ lines)
# - app/api/courses/route.ts (220+ lines)

# Features included:
# ✅ Search, filter, sort, paginate
# ✅ Add/Edit/Delete with validation
# ✅ Import/Export with error tracking
# ✅ Template download with reference sheets
# ✅ Foreign key auto-mapping
# ✅ Proper font sizes throughout
```

---

## Version Information

- **Template Version**: 1.0
- **Last Updated**: 2025-01-14
- **Reference**: Degree module implementation
- **Framework**: Next.js 14+ with App Router
- **UI Library**: shadcn/ui + Tailwind CSS
- **Database**: Supabase (PostgreSQL)

---

## Support Notes

### Common Issues

1. **Foreign Key Not Found**
   - Ensure parent table data exists
   - Check code field matches exactly
   - Verify auto-mapping logic runs

2. **Import Validation Fails**
   - Check Excel column headers match exactly
   - Ensure mandatory fields have asterisks
   - Verify reference sheet data is current

3. **Font Sizes Inconsistent**
   - Use text-[11px] for all table content
   - Use text-xs for buttons and search
   - Use h-8 for toolbar, h-10 for forms

4. **Toast Not Showing**
   - Ensure useToast hook imported
   - Check className for styling
   - Verify duration is set appropriately

---

**End of CRUD Generator Skill Document**