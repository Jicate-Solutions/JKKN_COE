# Institutions Module Documentation

## Table of Contents
1. [Module Overview](#module-overview)
2. [File Structure](#file-structure)
3. [Architecture Layers](#architecture-layers)
4. [Type Definitions](#type-definitions)
5. [Services Layer](#services-layer)
6. [API Endpoints](#api-endpoints)
7. [Pages and Components](#pages-and-components)
8. [Utilities](#utilities)
9. [Premium Design System](#premium-design-system)
10. [Code Examples](#code-examples)
11. [Best Practices](#best-practices)

---

## Module Overview

### Purpose
The Institutions module manages educational institution records within the JKKN COE system. It provides comprehensive CRUD operations for institution data including contact information, address details, institutional metadata, and department information for six key departments (Transportation, Administration, Accounts, Admission, Placement, and Anti-Ragging).

### Key Features
- **Full CRUD Operations**: Create, Read, Update, Delete institution records
- **Bulk Import/Export**: Import from Excel/CSV/JSON, export to Excel/JSON with templates
- **Advanced Filtering**: Filter by status (Active/Inactive), search across multiple fields
- **Data Validation**: Client-side and server-side validation with detailed error reporting
- **Department Management**: Six configurable departments with contact information
- **Premium UI/UX**: Modern, responsive design with emerald accent color
- **Statistics Dashboard**: Real-time stats (Total, Active, Inactive, New This Month)
- **Row-Level Error Tracking**: Detailed error reporting during bulk imports

### Module Information
- **Route Path**: `/master/institutions`
- **API Base**: `/api/master/institutions`
- **Primary Color**: Emerald (600/700)
- **Icon**: Building2 (Lucide)
- **Module Type**: Master Data Management

---

## File Structure

### Project Structure Compliance
All files follow the standard 5-layer architecture pattern:

```
jkkncoe/
├── app/
│   ├── (coe)/
│   │   └── master/
│   │       └── institutions/
│   │           ├── page.tsx                    # Index/List page
│   │           ├── add/
│   │           │   └── page.tsx                # Add new institution
│   │           ├── edit/
│   │           │   └── [id]/
│   │           │       └── page.tsx            # Edit institution
│   │           └── view/
│   │               └── [id]/
│   │                   └── page.tsx            # View institution details
│   └── api/
│       └── master/
│           └── institutions/
│               ├── route.ts                    # GET, POST, PUT, DELETE
│               └── [id]/
│                   └── route.ts                # GET by ID
├── types/
│   └── institutions.ts                         # TypeScript interfaces
├── services/
│   └── master/
│       └── institutions-service.ts             # Service layer functions
├── lib/
│   └── utils/
│       ├── institution-validation.ts           # Validation utilities
│       └── institution-export-import.ts        # Export/Import utilities
└── components/
    └── stats/
        └── premium-institution-stats.tsx       # Statistics component
```

### File Organization Verification
- **Naming Convention**: All directories use `kebab-case` ✓
- **Component Naming**: All component files use `PascalCase` ✓
- **Import Paths**: All use `@/` alias for absolute imports ✓
- **Route Groups**: Properly uses `(coe)` route group ✓
- **API Routes**: Follow Next.js 15 App Router conventions ✓

---

## Architecture Layers

### Layer 1: Types
**Location**: `types/institutions.ts`

Defines all TypeScript interfaces and types for the module.

**Key Types**:
- `Institution`: Main entity interface
- `InstitutionFormData`: Form data structure
- `DepartmentInfo`: Nested department structure
- `InstitutionImportError`: Error tracking for imports
- `UploadSummary`: Upload statistics

### Layer 2: Services
**Location**: `services/master/institutions-service.ts`

Provides data access layer abstracting API calls.

**Key Functions**:
- `fetchInstitutions()`: Retrieve all institutions
- `createInstitution(data)`: Create new institution
- `updateInstitution(id, data)`: Update existing institution
- `deleteInstitution(id)`: Delete institution

### Layer 3: API Routes
**Location**: `app/api/master/institutions/`

Server-side API endpoints using Next.js Route Handlers.

**Endpoints**:
- `GET /api/master/institutions`: List all institutions
- `POST /api/master/institutions`: Create institution
- `PUT /api/master/institutions`: Update institution
- `DELETE /api/master/institutions?id={id}`: Delete institution
- `GET /api/master/institutions/[id]`: Get single institution

### Layer 4: Pages (UI Components)
**Location**: `app/(coe)/master/institutions/`

Client-side React components for user interaction.

**Pages**:
- `page.tsx`: Index/List view with table, filters, pagination
- `add/page.tsx`: Create new institution form
- `edit/[id]/page.tsx`: Edit existing institution form
- `view/[id]/page.tsx`: View institution details (read-only)

### Layer 5: Utilities
**Location**: `lib/utils/`

Shared utility functions for validation and data processing.

**Utilities**:
- `institution-validation.ts`: Data validation logic
- `institution-export-import.ts`: Export/Import functionality

---

## Type Definitions

### Core Types

#### DepartmentInfo
```typescript
export type DepartmentInfo = {
  name?: string
  designation?: string
  email?: string
  mobile?: string
}
```

**Usage**: Stores contact information for six key departments (Transportation, Administration, Accounts, Admission, Placement, Anti-Ragging).

#### Institution
```typescript
export interface Institution {
  id: string                              // UUID primary key
  institution_code: string                 // Unique institution code
  name: string                            // Institution name
  phone?: string                          // Contact phone
  email?: string                          // Contact email
  website?: string                        // Website URL
  created_by?: string                     // Creator user ID
  counselling_code?: string               // Counselling admission code
  accredited_by?: string                  // Accreditation body
  address_line1?: string                  // Address line 1
  address_line2?: string                  // Address line 2
  address_line3?: string                  // Address line 3
  city?: string                           // City
  state?: string                          // State
  country?: string                        // Country
  logo_url?: string                       // Logo image URL
  transportation_dept?: DepartmentInfo    // Transportation dept
  administration_dept?: DepartmentInfo    // Administration dept
  accounts_dept?: DepartmentInfo          // Accounts dept
  admission_dept?: DepartmentInfo         // Admission dept
  placement_dept?: DepartmentInfo         // Placement dept
  anti_ragging_dept?: DepartmentInfo      // Anti-ragging dept
  institution_type?: string               // Type: university, college, school, institute
  pin_code?: string                       // PIN code (6 digits)
  timetable_type?: string                 // Timetable: week_order, day_order, custom
  is_active: boolean                      // Active status
  created_at: string                      // Creation timestamp
}
```

#### InstitutionFormData
```typescript
export interface InstitutionFormData {
  institution_code: string
  name: string
  phone: string
  email: string
  website: string
  counselling_code: string
  accredited_by: string
  address_line1: string
  address_line2: string
  address_line3: string
  city: string
  state: string
  country: string
  pin_code: string
  logo_url: string
  institution_type: string
  timetable_type: string
  transportation_dept: DepartmentInfo
  administration_dept: DepartmentInfo
  accounts_dept: DepartmentInfo
  admission_dept: DepartmentInfo
  placement_dept: DepartmentInfo
  anti_ragging_dept: DepartmentInfo
  is_active: boolean
}
```

**Usage**: Form state management in Add/Edit pages.

#### InstitutionImportError
```typescript
export interface InstitutionImportError {
  row: number                   // Excel row number (includes header)
  institution_code: string      // Institution code for identification
  name: string                  // Institution name for identification
  errors: string[]              // Array of validation error messages
}
```

**Usage**: Tracks validation errors during bulk import operations.

#### UploadSummary
```typescript
export interface UploadSummary {
  total: number      // Total rows processed
  success: number    // Successful imports
  failed: number     // Failed imports
}
```

**Usage**: Displays upload statistics in error dialog.

---

## Services Layer

### Location
`services/master/institutions-service.ts`

### Purpose
Abstracts API calls and provides a clean interface for data operations. Handles error responses and converts them to user-friendly error messages.

### Functions

#### fetchInstitutions()
```typescript
export async function fetchInstitutions(): Promise<Institution[]>
```

**Description**: Retrieves all institutions from the database.

**Returns**: Array of Institution objects

**Throws**: Error with message "Failed to fetch institutions"

**Example**:
```typescript
import { fetchInstitutions } from '@/services/master/institutions-service'

const institutions = await fetchInstitutions()
console.log(`Found ${institutions.length} institutions`)
```

#### createInstitution(data)
```typescript
export async function createInstitution(data: InstitutionFormData): Promise<Institution>
```

**Description**: Creates a new institution record.

**Parameters**:
- `data`: InstitutionFormData object with institution details

**Returns**: Created Institution object

**Throws**: Error with API error message or "Failed to create institution"

**Example**:
```typescript
import { createInstitution } from '@/services/master/institutions-service'

const newInstitution = await createInstitution({
  institution_code: 'JKKN001',
  name: 'JKKN University',
  email: 'info@jkkn.edu',
  // ... other fields
  is_active: true
})
```

#### updateInstitution(id, data)
```typescript
export async function updateInstitution(id: string, data: InstitutionFormData): Promise<Institution>
```

**Description**: Updates an existing institution record.

**Parameters**:
- `id`: Institution UUID
- `data`: InstitutionFormData object with updated details

**Returns**: Updated Institution object

**Throws**: Error with API error message or "Failed to update institution"

**Example**:
```typescript
import { updateInstitution } from '@/services/master/institutions-service'

const updatedInstitution = await updateInstitution('uuid-here', {
  institution_code: 'JKKN001',
  name: 'JKKN University - Updated',
  // ... other fields
  is_active: true
})
```

#### deleteInstitution(id)
```typescript
export async function deleteInstitution(id: string): Promise<void>
```

**Description**: Deletes an institution record.

**Parameters**:
- `id`: Institution UUID

**Returns**: void

**Throws**: Error with API error message or "Failed to delete institution"

**Example**:
```typescript
import { deleteInstitution } from '@/services/master/institutions-service'

await deleteInstitution('uuid-here')
console.log('Institution deleted successfully')
```

---

## API Endpoints

### Base Route: `/api/master/institutions/route.ts`

#### GET /api/master/institutions
**Description**: Retrieve all institutions

**Method**: GET

**Query Parameters**: None

**Response**:
```json
[
  {
    "id": "uuid",
    "institution_code": "JKKN001",
    "name": "JKKN University",
    "email": "info@jkkn.edu",
    "phone": "+91 9000000000",
    "is_active": true,
    // ... other fields
  }
]
```

**Error Responses**:
- `500`: Internal server error

**Implementation Details**:
- Uses service role Supabase client
- Orders by `created_at` descending
- Limit: 10,000 rows (range 0-9999)
- Selects all fields including JSONB department data

#### POST /api/master/institutions
**Description**: Create new institution

**Method**: POST

**Request Body**:
```json
{
  "institution_code": "JKKN001",
  "name": "JKKN University",
  "email": "info@jkkn.edu",
  "phone": "+91 9000000000",
  "website": "https://jkkn.edu",
  "counselling_code": "JKKN001",
  "accredited_by": "NAAC",
  "address_line1": "123 Main Street",
  "city": "Chennai",
  "state": "Tamil Nadu",
  "country": "India",
  "pin_code": "600001",
  "institution_type": "university",
  "timetable_type": "week_order",
  "transportation_dept": {
    "name": "John Doe",
    "email": "transport@jkkn.edu",
    "mobile": "+91 9000000001",
    "designation": "Transport Head"
  },
  // ... other departments
  "is_active": true
}
```

**Response**:
```json
{
  "id": "uuid",
  "institution_code": "JKKN001",
  "name": "JKKN University",
  // ... all fields
  "created_at": "2025-11-16T10:00:00Z"
}
```

**Status Codes**:
- `201`: Created successfully
- `500`: Internal server error

#### PUT /api/master/institutions
**Description**: Update existing institution

**Method**: PUT

**Request Body**:
```json
{
  "id": "uuid",
  "institution_code": "JKKN001",
  "name": "JKKN University - Updated",
  // ... all fields to update
}
```

**Response**:
```json
{
  "id": "uuid",
  "institution_code": "JKKN001",
  "name": "JKKN University - Updated",
  // ... all fields
  "created_at": "2025-11-16T10:00:00Z"
}
```

**Status Codes**:
- `200`: Updated successfully
- `500`: Internal server error

#### DELETE /api/master/institutions
**Description**: Delete institution

**Method**: DELETE

**Query Parameters**:
- `id` (required): Institution UUID

**Example**: `/api/master/institutions?id=uuid-here`

**Response**:
```json
{
  "success": true
}
```

**Error Responses**:
- `400`: Institution ID is required
- `500`: Failed to delete institution

### Detail Route: `/api/master/institutions/[id]/route.ts`

#### GET /api/master/institutions/[id]
**Description**: Get single institution by ID

**Method**: GET

**URL Parameters**:
- `id`: Institution UUID

**Example**: `/api/master/institutions/uuid-here`

**Response**:
```json
{
  "id": "uuid",
  "institution_code": "JKKN001",
  "name": "JKKN University",
  // ... all fields
}
```

**Error Responses**:
- `400`: Institution ID is required
- `404`: Institution not found
- `500`: Internal server error

---

## Pages and Components

### Index Page (`page.tsx`)

#### Location
`app/(coe)/master/institutions/page.tsx`

#### Features
- Data table with sorting, searching, pagination
- Status filter (All, Active, Inactive)
- Bulk import/export (JSON, Excel, CSV)
- Template download
- Premium statistics cards
- Row-level error tracking for imports
- Responsive design

#### State Management
```typescript
const [items, setItems] = useState<Institution[]>([])
const [loading, setLoading] = useState(true)
const [searchTerm, setSearchTerm] = useState("")
const [sortColumn, setSortColumn] = useState<string | null>(null)
const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
const [currentPage, setCurrentPage] = useState(1)
const [itemsPerPage, setItemsPerPage] = useState<number | "all">(10)
const [statusFilter, setStatusFilter] = useState("all")
const [errorPopupOpen, setErrorPopupOpen] = useState(false)
const [importErrors, setImportErrors] = useState<InstitutionImportError[]>([])
const [uploadSummary, setUploadSummary] = useState<{
  total: number
  success: number
  failed: number
}>({ total: 0, success: 0, failed: 0 })
```

#### Key Functions

**Data Fetching**:
```typescript
const fetchInstitutions = async () => {
  try {
    setLoading(true)
    const data = await fetchInstitutionsService()
    setItems(data)
  } catch (error) {
    console.error('Error fetching institutions:', error)
    setItems([])
  } finally {
    setLoading(false)
  }
}
```

**Sorting**:
```typescript
const handleSort = (column: string) => {
  if (sortColumn === column) {
    setSortDirection(sortDirection === "asc" ? "desc" : "asc")
  } else {
    setSortColumn(column)
    setSortDirection("asc")
  }
}
```

**Filtering & Search**:
```typescript
const filtered = useMemo(() => {
  const q = searchTerm.toLowerCase()
  const data = items
    .filter((i) =>
      [i.institution_code, i.name, i.email, i.phone, i.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    )
    .filter((i) =>
      statusFilter === "all" ||
      (statusFilter === "active" ? i.is_active : !i.is_active)
    )

  if (!sortColumn) return data
  // ... sorting logic
}, [items, searchTerm, sortColumn, sortDirection, statusFilter])
```

**Import with Validation**:
```typescript
const handleImport = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.csv,.xlsx,.xls'
  input.onchange = async (e) => {
    // Parse file (JSON/CSV/Excel)
    // Validate each row
    // Track errors with row numbers
    // Upload valid rows
    // Show upload summary and errors
  }
  input.click()
}
```

**Delete Operation**:
```typescript
const remove = async (id: string) => {
  try {
    setLoading(true)
    const institutionName = items.find(i => i.id === id)?.name || 'Institution'
    await deleteInstitution(id)
    setItems((prev) => prev.filter((p) => p.id !== id))
    toast({
      title: "✅ Institution Deleted",
      description: `${institutionName} has been successfully deleted.`,
      className: "bg-orange-50 border-orange-200 text-orange-800"
    })
  } catch (error) {
    // ... error handling
  }
}
```

#### UI Sections

**Header Section**:
- Page title with Building2 icon
- Action buttons (Refresh, Template, Export JSON, Export Excel, Import, Add)
- Status filter dropdown
- Search input

**Stats Section**:
- Premium statistics cards (Total, Active, Inactive, New This Month)
- Real-time calculation
- Loading state animation

**Table Section**:
- Sortable columns (Institution Code, Name, Status)
- Status badges (Active/Inactive)
- Action buttons (View, Edit, Delete)
- Delete confirmation dialog

**Pagination Section**:
- Items per page selector (10, 20, 50, 100, All)
- Page navigation
- Current page indicator

**Error Dialog**:
- Upload summary cards (Total, Success, Failed)
- Detailed error list with row numbers
- Common fixes tips
- Color-coded design (blue/green/red)

### Add Page (`add/page.tsx`)

#### Location
`app/(coe)/master/institutions/add/page.tsx`

#### Features
- Multi-section form layout
- Form validation with `useFormValidation` hook
- Department information tabs
- Status toggle
- Premium design with emerald accents

#### State Management
```typescript
const [loading, setLoading] = useState(false)
const [formData, setFormData] = useState({
  institution_code: "",
  name: "",
  phone: "",
  email: "",
  website: "",
  // ... all fields
  transportation_dept: {} as DepartmentInfo,
  // ... all departments
  is_active: true,
})

const { errors, validate, clearErrors } = useFormValidation({
  institution_code: [ValidationPresets.required('Institution code is required')],
  name: [ValidationPresets.required('Institution name is required')],
  email: [ValidationPresets.email('Invalid email address')],
})
```

#### Form Sections

1. **Basic Information**:
   - Institution Code (required)
   - Institution Name (required)
   - Email (validated)
   - Phone
   - Website
   - Logo URL

2. **Address Information**:
   - Address Line 1, 2, 3
   - City, State, Country
   - PIN Code

3. **Institutional Details**:
   - Counselling Code
   - Accredited By
   - Institution Type (Select)
   - Timetable Type (Select)

4. **Department Information** (Tabs):
   - Transportation Department
   - Administration Department
   - Accounts Department
   - Admission Department
   - Placement Department
   - Anti-Ragging Department

   Each department has: Name, Designation, Email, Mobile

5. **Status**:
   - Active/Inactive toggle (Switch)

#### Save Handler
```typescript
const handleSave = async () => {
  if (!validate(formData)) {
    toast({
      title: "⚠️ Validation Error",
      description: "Please fix all validation errors before submitting.",
      variant: "destructive"
    })
    return
  }

  try {
    setLoading(true)
    const newInstitution = await createInstitution(formData as InstitutionFormData)

    toast({
      title: "✅ Institution Created",
      description: `${newInstitution.name} has been successfully created.`,
      className: "bg-green-50 border-green-200 text-green-800"
    })

    router.push('/master/institutions')
  } catch (error) {
    // ... error handling
  } finally {
    setLoading(false)
  }
}
```

### Edit Page (`edit/[id]/page.tsx`)

#### Location
`app/(coe)/master/institutions/edit/[id]/page.tsx`

#### Features
- Pre-populated form with existing data
- Loading state while fetching
- Not found state handling
- Same form structure as Add page
- Update operation instead of create

#### Additional State
```typescript
const [fetching, setFetching] = useState(true)
const [notFound, setNotFound] = useState(false)
```

#### Data Fetching
```typescript
useEffect(() => {
  const fetchInstitution = async () => {
    try {
      setFetching(true)
      const response = await fetch(`/api/master/institutions/${params.id}`)

      if (!response.ok) {
        setNotFound(true)
        return
      }

      const institution: Institution = await response.json()

      setFormData({
        institution_code: institution.institution_code,
        name: institution.name,
        // ... populate all fields
        is_active: institution.is_active,
      })
    } catch (error) {
      // ... error handling
      setNotFound(true)
    } finally {
      setFetching(false)
    }
  }

  if (params.id) {
    fetchInstitution()
  }
}, [params.id, toast])
```

#### Loading State UI
```typescript
if (fetching) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading institution data...</p>
      </div>
    </div>
  )
}
```

#### Not Found State UI
```typescript
if (notFound) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Institution Not Found</h2>
        <p className="text-muted-foreground mb-4">
          The institution you're looking for doesn't exist.
        </p>
        <Button onClick={() => router.push('/master/institutions')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Institutions
        </Button>
      </div>
    </div>
  )
}
```

### View Page (`view/[id]/page.tsx`)

#### Location
`app/(coe)/master/institutions/view/[id]/page.tsx`

#### Features
- Read-only view of institution details
- Same layout as Edit page
- All inputs are disabled
- Loading and not found states
- Edit button to navigate to edit page

#### Key Differences from Edit Page
```typescript
// All inputs are disabled
<Input
  disabled
  className="h-11 rounded-lg bg-slate-100"
  value={institution.institution_code || ''}
/>

// Status shown as Badge instead of Switch
<Badge
  variant={institution.is_active ? "default" : "secondary"}
  className={`text-sm font-semibold ${
    institution.is_active
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-red-100 text-red-700'
  }`}
>
  {institution.is_active ? "Active" : "Inactive"}
</Badge>

// Edit button in header
<Button onClick={handleEdit}>
  <Edit className="h-4 w-4 mr-2" />
  Edit
</Button>
```

---

## Utilities

### Validation Utility

#### Location
`lib/utils/institution-validation.ts`

#### Purpose
Provides comprehensive validation for institution data during imports.

#### Function: validateInstitutionData()

```typescript
export function validateInstitutionData(data: any, rowIndex: number): string[]
```

**Parameters**:
- `data`: Institution data object to validate
- `rowIndex`: Row number for error reporting

**Returns**: Array of error message strings (empty if valid)

**Validation Rules**:

1. **Institution Code** (Required):
   - Must not be empty
   - Max 50 characters

2. **Name** (Required):
   - Must not be empty
   - Max 200 characters

3. **Email** (Optional):
   - Valid email format (regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
   - Max 100 characters

4. **Phone** (Optional):
   - Valid format (regex: `/^[\+]?[0-9\s\-\(\)]{10,15}$/`)
   - 10-15 digits with optional +, spaces, hyphens, parentheses

5. **Website** (Optional):
   - Valid URL format (using `new URL()`)
   - Max 255 characters

6. **PIN Code** (Optional):
   - Exactly 6 digits (regex: `/^[0-9]{6}$/`)

7. **Institution Type** (Optional):
   - Must be one of: `university`, `college`, `school`, `institute`

8. **Timetable Type** (Optional):
   - Must be one of: `week_order`, `day_order`, `custom`

9. **Status** (Optional):
   - Boolean or string: `true`/`false`/`active`/`inactive`

10. **String Length Limits**:
    - Counselling Code: 50 chars
    - Accredited By: 100 chars
    - Address Lines 1-3: 255 chars each
    - City, State, Country: 100 chars each
    - Logo URL: 500 chars

**Example Usage**:
```typescript
import { validateInstitutionData } from '@/lib/utils/institution-validation'

const data = {
  institution_code: 'JKKN001',
  name: 'JKKN University',
  email: 'info@jkkn.edu',
  // ... other fields
}

const errors = validateInstitutionData(data, 2)
if (errors.length > 0) {
  console.log('Row 2 validation errors:', errors)
  // ["Email format is invalid", "PIN Code must be exactly 6 digits"]
}
```

### Export/Import Utility

#### Location
`lib/utils/institution-export-import.ts`

#### Functions

##### exportToJSON(institutions)
```typescript
export function exportToJSON(institutions: Institution[]): void
```

**Description**: Exports institutions to JSON file

**Parameters**:
- `institutions`: Array of Institution objects

**Output**: Downloads JSON file with formatted data

**File Name**: `institutions_YYYY-MM-DD.json`

**Example**:
```typescript
import { exportToJSON } from '@/lib/utils/institution-export-import'

const handleDownload = () => exportToJSON(filtered)
```

##### exportToExcel(institutions)
```typescript
export function exportToExcel(institutions: Institution[]): void
```

**Description**: Exports institutions to Excel file

**Parameters**:
- `institutions`: Array of Institution objects

**Output**: Downloads Excel (.xlsx) file with:
- Formatted column headers
- Auto-sized columns
- Wrapped text for department columns
- Formatted dates

**File Name**: `institutions_export_YYYY-MM-DD.xlsx`

**Excel Features**:
- 25 columns with optimized widths
- Department data formatted with newlines
- Status shown as "Active"/"Inactive"
- Dates formatted as YYYY-MM-DD

**Example**:
```typescript
import { exportToExcel } from '@/lib/utils/institution-export-import'

const handleExport = () => exportToExcel(filtered)
```

##### exportTemplate()
```typescript
export function exportTemplate(): void
```

**Description**: Exports blank template with sample data

**Output**: Downloads Excel template with:
- Sample row showing expected format
- Mandatory fields marked with * and red background
- Optional fields with gray background
- Optimized column widths

**File Name**: `institutions_template_YYYY-MM-DD.xlsx`

**Template Fields**:
- Institution Code * (red, mandatory)
- Name * (red, mandatory)
- Phone, Email, Website
- Counselling Code, Accredited By
- Address Lines 1-3
- City, State, Country, PIN Code
- Logo URL
- Institution Type, Timetable Type
- Status

**Example**:
```typescript
import { exportTemplate } from '@/lib/utils/institution-export-import'

const handleTemplateExport = () => exportTemplate()
```

#### Helper Function: formatDepartment()
```typescript
function formatDepartment(dept: any): string
```

**Description**: Formats department object for export

**Parameters**:
- `dept`: DepartmentInfo object

**Returns**: Formatted string with newlines separating:
- Name
- Email
- Mobile
- Designation

**Example**:
```typescript
const formatted = formatDepartment({
  name: 'John Doe',
  email: 'john@jkkn.edu',
  mobile: '+91 9000000000',
  designation: 'Head of Department'
})
// Returns: "John Doe\njohn@jkkn.edu\n+91 9000000000\nHead of Department"
```

### Statistics Component

#### Location
`components/stats/premium-institution-stats.tsx`

#### Purpose
Displays real-time statistics for institutions module.

#### Component: PremiumInstitutionStats

```typescript
interface PremiumInstitutionStatsProps {
  items: Institution[]
  loading?: boolean
}

export function PremiumInstitutionStats({
  items = [],
  loading = false
}: PremiumInstitutionStatsProps)
```

**Props**:
- `items`: Array of Institution objects
- `loading`: Optional loading state

**Statistics Calculated**:
1. **Total Institutions**: `items.length`
2. **Active**: Count of institutions where `is_active === true`
3. **Inactive**: Count of institutions where `is_active === false`
4. **New This Month**: Count of institutions created in current month

**UI Features**:
- 4-column grid (responsive: 1 col mobile, 2 col tablet, 4 col desktop)
- Color-coded icons and values:
  - Total: Blue
  - Active: Emerald
  - Inactive: Red
  - New This Month: Purple
- Loading state with skeleton animation
- Hover effects with premium card styling
- Dark mode support

**Example Usage**:
```typescript
import { PremiumInstitutionStats } from '@/components/stats/premium-institution-stats'

<PremiumInstitutionStats items={items} loading={loading} />
```

---

## Premium Design System

### Design Principles
- **Consistency**: Uniform spacing, colors, and typography
- **Accessibility**: WCAG 2.1 Level AA compliance
- **Responsiveness**: Mobile-first design
- **Premium Feel**: Smooth animations, subtle shadows, rounded corners

### Color Palette

#### Primary Colors (Emerald)
```css
/* Emerald 50 - Backgrounds */
bg-emerald-50: #ecfdf5

/* Emerald 100 - Icons, Badges */
bg-emerald-100: #d1fae5

/* Emerald 600 - Primary Actions */
bg-emerald-600: #059669

/* Emerald 700 - Hover States */
bg-emerald-700: #047857
```

#### Semantic Colors
```css
/* Success - Green */
bg-green-50: #f0fdf4
text-green-800: #166534

/* Error - Red */
bg-red-50: #fef2f2
text-red-800: #991b1b

/* Warning - Yellow/Orange */
bg-yellow-50: #fefce8
text-yellow-800: #854d0e

/* Info - Blue */
bg-blue-50: #eff6ff
text-blue-800: #1e40af

/* Neutral - Slate */
bg-slate-50: #f8fafc
bg-slate-100: #f1f5f9
text-slate-700: #334155
text-slate-900: #0f172a
```

### Typography

#### Font Families
```css
/* Headings - Space Grotesk */
font-grotesk: 'Space Grotesk', 'Segoe UI', Arial, sans-serif
font-heading: var(--font-grotesk)

/* Body - Inter */
font-inter: 'Inter', 'Helvetica Neue', Arial, sans-serif
font-sans: var(--font-inter)
```

#### Font Sizes
```css
/* Display */
text-3xl: 1.875rem (30px)
text-2xl: 1.5rem (24px)

/* Headings */
text-xl: 1.25rem (20px)
text-lg: 1.125rem (18px)

/* Body */
text-base: 1rem (16px)
text-sm: 0.875rem (14px)
text-xs: 0.75rem (12px)
```

#### Font Weights
```css
font-bold: 700       /* Headings */
font-semibold: 600   /* Subheadings */
font-medium: 500     /* Labels */
font-normal: 400     /* Body text */
```

### Spacing System

#### Major Sections
```css
space-y-10: 2.5rem (40px) gap between major sections
```

#### Subsections
```css
space-y-5: 1.25rem (20px) gap between subsections
```

#### Form Fields
```css
space-y-2: 0.5rem (8px) gap between label and input
gap-2: 0.5rem (8px) gap between inline elements
gap-3: 0.75rem (12px) gap between cards
gap-4: 1rem (16px) gap between groups
```

#### Padding
```css
/* Card Padding */
px-8: 2rem (32px) horizontal padding
py-6: 1.5rem (24px) vertical padding

/* Content Padding */
p-6: 1.5rem (24px) all sides
p-4: 1rem (16px) all sides
p-3: 0.75rem (12px) all sides
```

### Border Radius

```css
/* Cards */
rounded-2xl: 1rem (16px)

/* Sections, Inputs */
rounded-xl: 0.75rem (12px)

/* Buttons, Icons */
rounded-lg: 0.5rem (8px)
```

### Component Heights

```css
/* Primary Inputs */
h-11: 2.75rem (44px)

/* Secondary Inputs (in tabs) */
h-10: 2.5rem (40px)

/* Buttons */
h-9: 2.25rem (36px)

/* Icons (large) */
h-12 w-12: 3rem (48px)

/* Icons (medium) */
h-8 w-8: 2rem (32px)

/* Icons (small) */
h-6 w-6: 1.5rem (24px)
```

### Shadow System

```css
/* Card Shadow */
shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)

/* Hover Shadow */
hover:shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1)
```

### Transitions

```css
/* Standard Transition */
transition-all duration-200

/* Colors Only */
transition-colors
```

### Section Header Pattern

```html
<div class="flex items-center gap-3">
  <div class="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
    <Building2 class="h-4 w-4 text-emerald-700" />
  </div>
  <h2 class="text-lg font-semibold text-slate-900 font-grotesk">Section Title</h2>
</div>
```

### Card Pattern

```html
<div class="bg-white p-6 rounded-xl border border-slate-200">
  <!-- Content -->
</div>
```

### Input Pattern

```html
<div class="space-y-2">
  <Label class="text-sm font-medium text-slate-700">
    Field Name <span class="text-red-500">*</span>
  </Label>
  <Input
    class="h-11 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
  />
  {error && <p class="text-xs text-red-600">{error}</p>}
</div>
```

### Button Pattern

```html
<!-- Primary Button -->
<Button class="h-11 px-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-md transition-all duration-200">
  Save
</Button>

<!-- Secondary Button -->
<Button variant="outline" class="h-11 px-8 rounded-xl border-slate-300 hover:bg-slate-50 transition-all duration-200">
  Cancel
</Button>
```

### Badge Pattern

```html
<!-- Active Badge -->
<Badge class="bg-emerald-100 text-emerald-700 border-emerald-200">
  Active
</Badge>

<!-- Inactive Badge -->
<Badge variant="secondary" class="bg-red-100 text-red-700 border-red-200">
  Inactive
</Badge>
```

### Toast Pattern

```typescript
// Success Toast
toast({
  title: "✅ Success",
  description: "Operation completed successfully.",
  className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
})

// Error Toast
toast({
  title: "❌ Error",
  description: "Operation failed.",
  variant: "destructive",
  className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
})

// Warning Toast
toast({
  title: "⚠️ Warning",
  description: "Please review your input.",
  className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
})
```

---

## Code Examples

### Complete Add Page Flow

```typescript
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/common/use-toast"
import { useFormValidation, ValidationPresets } from "@/hooks/common/use-form-validation"
import { createInstitution } from "@/services/master/institutions-service"
import type { DepartmentInfo, InstitutionFormData } from "@/types/institutions"

export default function AddInstitutionPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    institution_code: "",
    name: "",
    email: "",
    // ... all fields
    transportation_dept: {} as DepartmentInfo,
    is_active: true,
  })

  // Validation
  const { errors, validate } = useFormValidation({
    institution_code: [ValidationPresets.required('Institution code is required')],
    name: [ValidationPresets.required('Institution name is required')],
    email: [ValidationPresets.email('Invalid email address')],
  })

  // Save handler
  const handleSave = async () => {
    if (!validate(formData)) {
      toast({
        title: "⚠️ Validation Error",
        description: "Please fix all validation errors before submitting.",
        variant: "destructive",
      })
      return
    }

    try {
      setLoading(true)
      const newInstitution = await createInstitution(formData as InstitutionFormData)

      toast({
        title: "✅ Institution Created",
        description: `${newInstitution.name} has been successfully created.`,
        className: "bg-green-50 border-green-200 text-green-800",
      })

      router.push('/master/institutions')
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'Failed to create institution. Please try again.'

      toast({
        title: "❌ Save Failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form>
      {/* Basic Information Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-emerald-700" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 font-grotesk">
            Basic Information
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-white p-6 rounded-xl border border-slate-200">
          <div className="space-y-2">
            <Label htmlFor="institution_code" className="text-sm font-medium text-slate-700">
              Institution Code <span className="text-red-500">*</span>
            </Label>
            <Input
              id="institution_code"
              value={formData.institution_code}
              onChange={(e) => setFormData({ ...formData, institution_code: e.target.value })}
              className={`h-11 rounded-lg border-slate-300 focus:border-emerald-500 ${errors.institution_code ? 'border-red-500' : ''}`}
              placeholder="e.g., JKKN001"
            />
            {errors.institution_code && (
              <p className="text-xs text-red-600">{errors.institution_code}</p>
            )}
          </div>

          {/* Additional fields... */}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-8 border-t border-slate-200">
        <Button
          variant="outline"
          onClick={() => router.push('/master/institutions')}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {loading ? 'Creating...' : 'Create Institution'}
        </Button>
      </div>
    </form>
  )
}
```

### Complete Import with Error Tracking

```typescript
const handleImport = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.csv,.xlsx,.xls'

  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      // Parse file based on type
      let rows: Partial<Institution>[] = []

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const data = new Uint8Array(await file.arrayBuffer())
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws)

        rows = json.map(j => ({
          institution_code: String(j['Institution Code *'] || ''),
          name: String(j['Name *'] || ''),
          email: String(j['Email'] || ''),
          // ... map all fields
          is_active: String(j['Status'] || '').toLowerCase() === 'active'
        }))
      }

      // Validate rows
      const validationErrors: InstitutionImportError[] = []

      rows.forEach((row, index) => {
        const errors = validateInstitutionData(row, index + 2)
        if (errors.length > 0) {
          validationErrors.push({
            row: index + 2,
            institution_code: row.institution_code || 'N/A',
            name: row.name || 'N/A',
            errors: errors
          })
        }
      })

      // Show validation errors if any
      if (validationErrors.length > 0) {
        setImportErrors(validationErrors)
        setUploadSummary({
          total: rows.length,
          success: 0,
          failed: validationErrors.length
        })
        setErrorPopupOpen(true)
        return
      }

      // Upload valid rows
      setLoading(true)
      let successCount = 0
      let errorCount = 0
      const uploadErrors: InstitutionImportError[] = []

      for (let i = 0; i < rows.length; i++) {
        const institution = rows[i]
        const rowNumber = i + 2

        try {
          const response = await fetch('/api/master/institutions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(institution),
          })

          if (response.ok) {
            const savedInstitution = await response.json()
            setItems(prev => [savedInstitution, ...prev])
            successCount++
          } else {
            const errorData = await response.json()
            errorCount++
            uploadErrors.push({
              row: rowNumber,
              institution_code: institution.institution_code || 'N/A',
              name: institution.name || 'N/A',
              errors: [errorData.error || 'Failed to save institution']
            })
          }
        } catch (error) {
          errorCount++
          uploadErrors.push({
            row: rowNumber,
            institution_code: institution.institution_code || 'N/A',
            name: institution.name || 'N/A',
            errors: [error instanceof Error ? error.message : 'Network error']
          })
        }
      }

      setLoading(false)

      // Update summary
      setUploadSummary({
        total: rows.length,
        success: successCount,
        failed: errorCount
      })

      // Show errors if any
      if (uploadErrors.length > 0) {
        setImportErrors(uploadErrors)
        setErrorPopupOpen(true)
      }

      // Show toast
      if (successCount > 0 && errorCount === 0) {
        toast({
          title: "✅ Upload Complete",
          description: `Successfully uploaded all ${successCount} institution${successCount > 1 ? 's' : ''}.`,
          className: "bg-green-50 border-green-200 text-green-800",
        })
      } else if (successCount > 0 && errorCount > 0) {
        toast({
          title: "⚠️ Partial Upload Success",
          description: `${successCount} successful, ${errorCount} failed.`,
          className: "bg-yellow-50 border-yellow-200 text-yellow-800",
        })
      } else {
        toast({
          title: "❌ Upload Failed",
          description: `0 successful, ${errorCount} failed.`,
          variant: "destructive",
        })
      }
    } catch (err) {
      console.error('Import error:', err)
      toast({
        title: "❌ Import Error",
        description: "Import failed. Please check your file format.",
        variant: "destructive",
      })
    }
  }

  input.click()
}
```

### Error Dialog Component

```typescript
<AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
  <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto rounded-3xl">
    <AlertDialogHeader>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
          <XCircle className="h-5 w-5 text-red-600" />
        </div>
        <div>
          <AlertDialogTitle className="text-xl font-bold text-red-600">
            Data Validation Errors
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground mt-1">
            Please fix the following errors before importing
          </AlertDialogDescription>
        </div>
      </div>
    </AlertDialogHeader>

    <div className="space-y-4">
      {/* Upload Summary Cards */}
      {uploadSummary.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 border-blue-200 rounded-lg p-3">
            <div className="text-xs text-blue-600 font-medium mb-1">Total Rows</div>
            <div className="text-2xl font-bold text-blue-700">{uploadSummary.total}</div>
          </div>
          <div className="bg-green-50 border-green-200 rounded-lg p-3">
            <div className="text-xs text-green-600 font-medium mb-1">Successful</div>
            <div className="text-2xl font-bold text-green-700">{uploadSummary.success}</div>
          </div>
          <div className="bg-red-50 border-red-200 rounded-lg p-3">
            <div className="text-xs text-red-600 font-medium mb-1">Failed</div>
            <div className="text-2xl font-bold text-red-700">{uploadSummary.failed}</div>
          </div>
        </div>
      )}

      {/* Error Summary */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <span className="font-semibold text-red-800">
            {importErrors.length} row{importErrors.length > 1 ? 's' : ''} failed validation
          </span>
        </div>
        <p className="text-sm text-red-700">
          Please correct these errors and try uploading again.
        </p>
      </div>

      {/* Detailed Error List */}
      <div className="space-y-3">
        {importErrors.map((error, index) => (
          <div key={index} className="border border-red-200 rounded-xl p-4 bg-red-50/50">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300">
                  Row {error.row}
                </Badge>
                <span className="font-medium text-sm">
                  {error.institution_code} - {error.name}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              {error.errors.map((err, errIndex) => (
                <div key={errIndex} className="flex items-start gap-2 text-sm">
                  <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-red-700">{err}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Helpful Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center mt-0.5">
            <span className="text-xs font-bold text-blue-600">i</span>
          </div>
          <div>
            <h4 className="font-semibold text-blue-800 text-sm mb-1">Common Fixes:</h4>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• Ensure Institution Code and Name are provided and not empty</li>
              <li>• Use valid email format (e.g., user@domain.com)</li>
              <li>• Use valid phone format (10-15 digits)</li>
              <li>• PIN Code must be exactly 6 digits</li>
              <li>• Status: true/false or Active/Inactive</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <AlertDialogFooter>
      <AlertDialogCancel>Close</AlertDialogCancel>
      <Button onClick={() => { setErrorPopupOpen(false); setImportErrors([]) }}>
        Try Again
      </Button>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Best Practices

### Architecture Best Practices

1. **Separation of Concerns**
   - Keep business logic in services layer
   - Keep validation logic in utilities
   - Keep UI logic in components
   - Keep API logic in route handlers

2. **Type Safety**
   - Always define TypeScript interfaces
   - Use strict null checks
   - Avoid `any` type
   - Use type guards for runtime checks

3. **Error Handling**
   - Always wrap async operations in try-catch
   - Provide user-friendly error messages
   - Log errors for debugging
   - Handle edge cases (network errors, validation errors, not found)

4. **State Management**
   - Use local state for component-specific data
   - Use URL params for shareable state (filters, pagination)
   - Reset form state after successful operations
   - Show loading states during async operations

### Code Quality Best Practices

1. **Naming Conventions**
   - Files: `kebab-case`
   - Components: `PascalCase`
   - Functions: `camelCase`
   - Constants: `UPPERCASE_SNAKE_CASE`
   - Boolean variables: `isActive`, `hasError`, `canSubmit`
   - Event handlers: `handleClick`, `handleSubmit`

2. **Import Organization**
   ```typescript
   // 1. External libraries
   import { useState } from "react"
   import { useRouter } from "next/navigation"

   // 2. UI components
   import { Button } from "@/components/ui/button"
   import { Input } from "@/components/ui/input"

   // 3. Custom hooks
   import { useToast } from "@/hooks/common/use-toast"

   // 4. Types
   import type { Institution } from "@/types/institutions"

   // 5. Services
   import { createInstitution } from "@/services/master/institutions-service"

   // 6. Utilities
   import { validateInstitutionData } from "@/lib/utils/institution-validation"
   ```

3. **Component Structure**
   ```typescript
   // 1. Imports

   // 2. Types/Interfaces (if component-specific)

   // 3. Component function
   export default function ComponentName() {
     // 4. Hooks (in order: router, state, effects, custom)

     // 5. Event handlers

     // 6. Helper functions

     // 7. Render logic (early returns for loading/error states)

     // 8. Main JSX
     return (...)
   }
   ```

4. **Function Length**
   - Keep functions under 50 lines
   - Extract complex logic into helper functions
   - Use early returns to reduce nesting

5. **Comments**
   - Use JSDoc for public functions
   - Comment complex business logic
   - Don't comment obvious code
   - Keep comments up-to-date

### UI/UX Best Practices

1. **Loading States**
   - Always show loading indicators
   - Disable buttons during operations
   - Use skeleton loaders for data tables

2. **Error States**
   - Show inline validation errors
   - Use toast notifications for operation results
   - Provide actionable error messages
   - Show detailed errors in dialogs for bulk operations

3. **Success Feedback**
   - Show success toasts after operations
   - Auto-redirect after create/update
   - Update UI optimistically when safe

4. **Accessibility**
   - Use semantic HTML
   - Provide aria labels
   - Support keyboard navigation
   - Ensure sufficient color contrast
   - Use focus indicators

5. **Responsive Design**
   - Use responsive grid layouts
   - Test on mobile, tablet, desktop
   - Use proper breakpoints (sm, md, lg, xl)
   - Stack columns on mobile

### Performance Best Practices

1. **Data Fetching**
   - Use React Query or SWR for caching (future improvement)
   - Implement pagination for large datasets
   - Use debounce for search inputs
   - Lazy load components when appropriate

2. **Re-rendering**
   - Use `useMemo` for expensive calculations
   - Use `useCallback` for event handlers passed as props
   - Avoid inline object/array creation in render

3. **Bundle Size**
   - Use dynamic imports for large components
   - Tree-shake unused code
   - Optimize images and assets

### Security Best Practices

1. **Input Validation**
   - Validate on both client and server
   - Sanitize user input
   - Use whitelists over blacklists
   - Validate file uploads (type, size)

2. **API Security**
   - Use service role key only on server
   - Never expose API keys in client code
   - Implement rate limiting (future improvement)
   - Validate request parameters

3. **Data Protection**
   - Never log sensitive data
   - Use HTTPS in production
   - Implement proper CORS policies
   - Use environment variables for secrets

### Testing Best Practices (Future Improvements)

1. **Unit Tests**
   - Test validation functions
   - Test service layer functions
   - Test utility functions
   - Aim for 80%+ coverage

2. **Integration Tests**
   - Test API endpoints
   - Test form submissions
   - Test error scenarios

3. **E2E Tests**
   - Test critical user flows
   - Test CRUD operations
   - Test import/export functionality

---

## Conclusion

The Institutions module is a comprehensive, production-ready implementation following all project guidelines and best practices. It demonstrates:

- **Clean Architecture**: Proper separation of concerns across 5 layers
- **Type Safety**: Full TypeScript coverage with strict typing
- **Premium UI/UX**: Modern, accessible, responsive design
- **Error Handling**: Comprehensive error tracking and user feedback
- **Data Validation**: Client and server-side validation
- **Bulk Operations**: Import/Export with detailed error reporting
- **Code Quality**: Consistent naming, organization, and patterns

This module can serve as a reference implementation for other modules in the JKKN COE system.

---

## Related Documentation

- [Project Structure](../../.cursor/rules/DEVELOPMENT_STANDARDS.md)
- [CLAUDE.md](../../CLAUDE.md)
- [CoE PRD](../../CoE PRD.txt)
- [API Error Handling](../../CLAUDE.md#api-error-handling)
- [Form Design Standards](../../CLAUDE.md#form-design-standards)

---

**Last Updated**: November 16, 2025
**Module Version**: 1.0.0
**Author**: JKKN Development Team
