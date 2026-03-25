# Institutions Management Page

## Overview

The Institutions page (`page.tsx`) is a comprehensive CRUD interface for managing educational institutions in the JKKN COE system. It provides full data table functionality with import/export capabilities, filtering, sorting, and pagination.

## Features

### Core Functionality
- **View Institutions**: Data table with sortable columns
- **Add Institution**: Navigate to add form
- **Edit Institution**: Navigate to edit form with pre-filled data
- **View Details**: Navigate to detailed view page
- **Delete Institution**: Confirmation dialog with soft delete

### Data Table Features
- **Search**: Filter by institution code, name, email, phone, city
- **Status Filter**: All, Active, Inactive
- **Sorting**: Click column headers (College Code, College Name, Status)
- **Pagination**: 10, 20, 50, 100, or All items per page

### Import/Export Features
- **Export JSON**: Download filtered data as JSON file
- **Export Excel**: Download filtered data as XLSX file
- **Download Template**: Get empty Excel template for bulk import
- **Import File**: Upload JSON, CSV, or Excel files with validation

## File Structure

```
app/(coe)/master/institutions/
├── page.tsx              # Main list page (this file)
├── add/
│   └── page.tsx          # Add new institution form
├── edit/
│   └── [id]/
│       └── page.tsx      # Edit institution form
└── view/
    └── [id]/
        └── page.tsx      # View institution details
```

## Dependencies

### Types
- `@/types/institutions` - `Institution`, `InstitutionImportError`

### Services
- `@/services/master/institutions-service` - `fetchInstitutions`, `deleteInstitution`

### Utilities
- `@/lib/utils/institution-validation` - `validateInstitutionData`
- `@/lib/utils/institution-export-import` - `exportToJSON`, `exportToExcel`, `exportTemplate`

### Components
- `@/components/stats/premium-institution-stats` - Stats cards component
- Shadcn UI components (Table, Card, Button, Select, etc.)

## State Management

```typescript
const [items, setItems] = useState<Institution[]>([])        // Institution data
const [loading, setLoading] = useState(true)                  // Loading state
const [searchTerm, setSearchTerm] = useState("")              // Search filter
const [sortColumn, setSortColumn] = useState<string | null>(null)
const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
const [currentPage, setCurrentPage] = useState(1)
const [itemsPerPage, setItemsPerPage] = useState<number | "all">(10)
const [statusFilter, setStatusFilter] = useState("all")
const [errorPopupOpen, setErrorPopupOpen] = useState(false)   // Error dialog
const [importErrors, setImportErrors] = useState<InstitutionImportError[]>([])
const [uploadSummary, setUploadSummary] = useState({...})     // Upload stats
```

## Import Validation

The import process validates each row for:

### Required Fields
- Institution Code
- Name

### Format Validation
- Email format (user@domain.com)
- Phone format (10-15 digits)
- Website URL format
- PIN Code (6 digits)

### Allowed Values
- **Institution Type**: university, college, school, institute
- **Timetable Type**: week_order (default)
- **Status**: true/false or Active/Inactive

## Error Handling

### Upload Error Dialog
Displays detailed error information:
- **Summary Cards**: Total rows, Successful, Failed
- **Error Details**: Row number, institution code, name, specific errors
- **Common Fixes**: Helpful tips for resolving issues

### Toast Notifications
- ✅ **Green**: Successful operations
- ⚠️ **Yellow**: Partial success (some rows failed)
- ❌ **Red**: Complete failure or validation errors

## API Endpoints

- `GET /api/master/institutions` - Fetch all institutions
- `POST /api/master/institutions` - Create new institution
- `DELETE /api/master/institutions/[id]` - Delete institution

## Data Model

```typescript
interface Institution {
  id: string
  institution_code: string
  name: string
  phone?: string
  email?: string
  website?: string
  counselling_code?: string
  accredited_by?: string
  address_line1?: string
  address_line2?: string
  address_line3?: string
  city?: string
  state?: string
  country?: string
  pin_code?: string
  logo_url?: string
  institution_type: string
  timetable_type: string
  transportation_dept?: DepartmentInfo
  administration_dept?: DepartmentInfo
  accounts_dept?: DepartmentInfo
  admission_dept?: DepartmentInfo
  placement_dept?: DepartmentInfo
  anti_ragging_dept?: DepartmentInfo
  is_active: boolean
  created_at: string
}
```

## Excel Template Columns

| Column Name | Required | Description |
|-------------|----------|-------------|
| Institution Code * | Yes | Unique identifier |
| Name * | Yes | Institution name |
| Phone | No | Contact phone |
| Email | No | Contact email |
| Website | No | Institution website |
| Counselling Code | No | Admission counselling code |
| Accredited By | No | Accreditation body |
| Address Line 1 | No | Street address |
| Address Line 2 | No | Additional address |
| Address Line 3 | No | Additional address |
| City | No | City name |
| State | No | State/Province |
| Country | No | Country name |
| PIN Code | No | Postal code (6 digits) |
| Logo URL | No | URL to institution logo |
| Institution Type | No | university/college/school/institute |
| Timetable Type | No | week_order (default) |
| Status | No | Active/Inactive |

## Usage

### Adding New Institution
1. Click "Add Institution" button
2. Fill required fields (Institution Code, Name)
3. Save to create new record

### Bulk Import
1. Click "Download Template" to get Excel format
2. Fill data following column specifications
3. Click "Import File" and select your file
4. Review any validation errors in popup
5. Fix errors and re-import if needed

### Filtering Data
1. Use status dropdown to filter Active/Inactive
2. Type in search box to filter by multiple fields
3. Click column headers to sort

### Exporting Data
- **JSON**: For data backup or API integration
- **Excel**: For reporting or manual editing
