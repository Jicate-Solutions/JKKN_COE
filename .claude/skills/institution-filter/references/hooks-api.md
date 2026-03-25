# Institution Filter Hooks API Reference

## useInstitutionFilter

**File:** `hooks/use-institution-filter.ts`

**Purpose:** Filter data on index/list pages and control UI visibility

**Returns:**
```typescript
{
  // Core filter values
  filter: { institution_code?: string, institutions_id?: string }
  queryString: string                    // "institution_code=CAS&institutions_id=uuid"
  shouldFilter: boolean                  // true if filtering is active
  isReady: boolean                       // true when context initialized

  // Current institution info
  institutionCode: string | null
  institutionId: string | null

  // Utility functions
  appendToUrl: (url: string) => string   // Append filter params to URL
  mergeWithBody: <T>(body: T) => T       // Merge filter into request body
  filterData: <T>(data: T[], key?) => T[] // Filter array client-side
  belongsToInstitution: <T>(item: T, key?) => boolean

  // For create operations
  getInstitutionCodeForCreate: () => string | null
  getInstitutionIdForCreate: () => string | null
  mustSelectInstitution: boolean         // true when "All Institutions" selected

  // Loading state
  isLoading: boolean
  isInitialized: boolean
}
```

**Usage:**
```typescript
const {
  filter,
  isReady,
  appendToUrl,
  getInstitutionIdForCreate,
  mustSelectInstitution,
  shouldFilter,
  institutionId
} = useInstitutionFilter()

// Wait for ready state
useEffect(() => {
  if (isReady) {
    const url = appendToUrl('/api/entity')
    fetch(url).then(...)
  }
}, [isReady, filter])

// Auto-fill institution in form reset
const resetForm = () => {
  const autoInstitutionId = getInstitutionIdForCreate() || ''
  setFormData({ institutions_id: autoInstitutionId, ... })
}

// UI visibility control
{mustSelectInstitution && <TableHead>Institution</TableHead>}

// Form field visibility
{mustSelectInstitution || !shouldFilter || !institutionId ? (
  <InstitutionDropdown />
) : null}
```

---

## useInstitutionField

**File:** `hooks/use-institution-field.ts`

**Purpose:** Manage institution dropdown visibility and defaults in forms

**Returns:**
```typescript
{
  // Field visibility
  shouldShowField: boolean         // True when dropdown should be visible
  shouldAutoFill: boolean          // True when institution should be auto-filled
  requiresSelection: boolean       // True when user must manually select

  // Default values for forms
  defaultInstitutionCode: string | null
  defaultInstitutionId: string | null
  defaultInstitution: Institution | null

  // Available options for dropdown
  availableInstitutions: Institution[]

  // Loading state
  isLoading: boolean

  // User role info
  canSwitchInstitution: boolean
  isSuperAdmin: boolean

  // Current filter state
  shouldFilter: boolean
}
```

**Usage:**
```typescript
const { shouldShowField, defaultInstitutionCode, availableInstitutions } = useInstitutionField()

// Auto-fill when field is hidden
useEffect(() => {
  if (!shouldShowField && defaultInstitutionCode) {
    setFormData(prev => ({ ...prev, institution_code: defaultInstitutionCode }))
  }
}, [shouldShowField, defaultInstitutionCode])

// Render dropdown only when needed
{shouldShowField && <InstitutionDropdown ... />}
```

---

## useInstitutionFormField

**File:** `hooks/use-institution-field.ts`

**Purpose:** Auto-sync institution field in form state

**Parameters:**
- `setFormData` - React setState function for form
- `fieldName` - Name of institution_code field (default: 'institution_code')

**Returns:** Same as `useInstitutionField`

**Usage:**
```typescript
const [formData, setFormData] = useState({ institution_code: '', name: '' })
const institutionField = useInstitutionFormField(setFormData)
// Form data automatically synced when institution changes
```

---

## useMyJKKNInstitutionFilter

**File:** `hooks/use-myjkkn-institution-filter.ts`

**Purpose:** Two-step lookup for MyJKKN API integration

**Returns:**
```typescript
{
  fetchInstitutionIds: (counsellingCode: string) => Promise<string[]>
  fetchRegulations: (counsellingCode?: string, requireFilter?: boolean) => Promise<RegulationOption[]>
  fetchLearnerProfiles: (counsellingCode?: string, options?) => Promise<LearnerProfileOption[]>
  fetchPrograms: (counsellingCode?: string, options?) => Promise<ProgramOption[]>
  fetchSemesters: (counsellingCode?: string, options?) => Promise<SemesterOption[]>
  fetchBatches: (counsellingCode?: string, options?) => Promise<BatchOption[]>
  fetchFilteredData: <T>(endpoint, counsellingCode, deduplicateField?, requireFilter?) => Promise<T[]>
}
```

**Critical Notes:**
1. MyJKKN uses `counselling_code` which equals COE's `institution_code`
2. One `counselling_code` may map to multiple MyJKKN institution IDs (aided + self-financing)
3. Always filters client-side because MyJKKN API may ignore server-side filters
4. Deduplicates by code field (e.g., `regulation_code`), not by `id`

**Usage:**
```typescript
const { fetchRegulations } = useMyJKKNInstitutionFilter()

// Find institution's counselling_code first
const institution = institutions.find(i => i.id === institutionId)
const counsellingCode = institution?.counselling_code

// Fetch regulations filtered by institution
const regs = await fetchRegulations(counsellingCode)
```

---

## useInstitution (Context)

**File:** `context/institution-context.tsx`

**Purpose:** Raw institution context data (prefer hooks above for most use cases)

**Returns:**
```typescript
{
  currentInstitution: Institution | null
  currentInstitutionCode: string | null
  currentInstitutionId: string | null
  selectedInstitution: Institution | null  // super_admin selection
  availableInstitutions: Institution[]
  canSwitchInstitution: boolean            // true for super_admin
  setSelectedInstitution: (inst) => void
  isLoading: boolean
  isInitialized: boolean
  shouldFilter: boolean
  institutionFilter: { institution_code?: string, institutions_id?: string }
  queryParams: string
}
```

---

## Quick Reference: Which Hook to Use

| Use Case | Hook |
|----------|------|
| Index page data filtering | `useInstitutionFilter` |
| API URL with filter params | `useInstitutionFilter.appendToUrl()` |
| Show/hide institution column | `useInstitutionFilter.mustSelectInstitution` |
| Show/hide institution field in form | `useInstitutionFilter` (mustSelectInstitution \|\| !shouldFilter \|\| !institutionId) |
| Auto-fill institution in form | `useInstitutionFilter.getInstitutionIdForCreate()` |
| MyJKKN API data (regulations, learners) | `useMyJKKNInstitutionFilter` |
| Higher-level form field management | `useInstitutionField` |
