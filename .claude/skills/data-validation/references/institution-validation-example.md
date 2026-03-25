# Institution Validation Example

This is a complete example of the validation pattern as implemented for institutions.

## Source File: `lib/utils/institution-validation.ts`

```typescript
export function validateInstitutionData(data: any, rowIndex: number): string[] {
  const errors: string[] = []

  // Required field validations
  if (!data.institution_code || data.institution_code.trim() === '') {
    errors.push('Institution Code is required')
  } else if (data.institution_code.length > 50) {
    errors.push('Institution Code must be 50 characters or less')
  }

  if (!data.name || data.name.trim() === '') {
    errors.push('Institution Name is required')
  } else if (data.name.length > 200) {
    errors.push('Institution Name must be 200 characters or less')
  }

  // Email validation
  if (data.email && data.email.trim() !== '') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.email)) {
      errors.push('Email format is invalid')
    } else if (data.email.length > 100) {
      errors.push('Email must be 100 characters or less')
    }
  }

  // Phone validation
  if (data.phone && data.phone.trim() !== '') {
    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,15}$/
    if (!phoneRegex.test(data.phone)) {
      errors.push('Phone number format is invalid (use 10-15 digits with optional +, spaces, hyphens, parentheses)')
    }
  }

  // Website validation
  if (data.website && data.website.trim() !== '') {
    try {
      new URL(data.website)
    } catch {
      errors.push('Website URL format is invalid')
    }
    if (data.website.length > 255) {
      errors.push('Website URL must be 255 characters or less')
    }
  }

  // PIN Code validation
  if (data.pin_code && data.pin_code.trim() !== '') {
    const pinRegex = /^[0-9]{6}$/
    if (!pinRegex.test(data.pin_code)) {
      errors.push('PIN Code must be exactly 6 digits')
    }
  }

  // Institution Type validation
  if (data.institution_type && data.institution_type.trim() !== '') {
    const validTypes = ['university', 'college', 'school', 'institute']
    if (!validTypes.includes(data.institution_type)) {
      errors.push(`Institution Type must be one of: ${validTypes.join(', ')}`)
    }
  }

  // Timetable Type validation
  if (data.timetable_type && data.timetable_type.trim() !== '') {
    const validTypes = ['week_order', 'day_order', 'custom']
    if (!validTypes.includes(data.timetable_type)) {
      errors.push(`Timetable Type must be one of: ${validTypes.join(', ')}`)
    }
  }

  // Status validation
  if (data.is_active !== undefined && data.is_active !== null) {
    if (typeof data.is_active !== 'boolean') {
      const statusValue = String(data.is_active).toLowerCase()
      if (statusValue !== 'true' && statusValue !== 'false' && statusValue !== 'active' && statusValue !== 'inactive') {
        errors.push('Status must be true/false or Active/Inactive')
      }
    }
  }

  // String length validations
  const stringFields = [
    { field: 'counselling_code', maxLength: 50, name: 'Counselling Code' },
    { field: 'accredited_by', maxLength: 100, name: 'Accredited By' },
    { field: 'address_line1', maxLength: 255, name: 'Address Line 1' },
    { field: 'address_line2', maxLength: 255, name: 'Address Line 2' },
    { field: 'address_line3', maxLength: 255, name: 'Address Line 3' },
    { field: 'city', maxLength: 100, name: 'City' },
    { field: 'state', maxLength: 100, name: 'State' },
    { field: 'country', maxLength: 100, name: 'Country' },
    { field: 'logo_url', maxLength: 500, name: 'Logo URL' }
  ]

  stringFields.forEach(({ field, maxLength, name }) => {
    if (data[field] && data[field].length > maxLength) {
      errors.push(`${name} must be ${maxLength} characters or less`)
    }
  })

  return errors
}
```

## Usage in Import Handler

```typescript
import { validateInstitutionData } from '@/lib/utils/institution-validation'

// Inside handleImport function
const validationErrors: Array<{
  row: number
  institution_code: string
  name: string
  errors: string[]
}> = []

const mapped = rows.map((r, index) => {
  const institutionData = {
    id: String(Date.now() + Math.random()),
    institution_code: r.institution_code!,
    name: r.name as string,
    phone: (r as any).phone || '',
    email: (r as any).email || '',
    // ... other fields
  }

  // Validate the data
  const errors = validateInstitutionData(institutionData, index + 2) // +2 for header row
  if (errors.length > 0) {
    validationErrors.push({
      row: index + 2,
      institution_code: institutionData.institution_code || 'N/A',
      name: institutionData.name || 'N/A',
      errors: errors
    })
  }

  return institutionData
}).filter(r => r.institution_code && r.name)

// If validation errors, show dialog
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
```

## Common Fixes Message

Display this in the error dialog:

```tsx
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
        <li>• Use valid phone format (10-15 digits with optional +, spaces, hyphens)</li>
        <li>• Use valid website URL format (e.g., https://example.com)</li>
        <li>• PIN Code must be exactly 6 digits</li>
        <li>• Institution Type: university, college, school, or institute</li>
        <li>• Status: true/false or Active/Inactive</li>
      </ul>
    </div>
  </div>
</div>
```

## Form Validation Pattern

```typescript
const [errors, setErrors] = useState<Record<string, string>>({})

const validate = (): boolean => {
  const e: Record<string, string> = {}

  if (!formData.institution_code.trim()) {
    e.institution_code = 'Institution Code is required'
  }

  if (!formData.name.trim()) {
    e.name = 'Institution Name is required'
  }

  if (formData.email && formData.email.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      e.email = 'Invalid email format'
    }
  }

  if (formData.phone && formData.phone.trim()) {
    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,15}$/
    if (!phoneRegex.test(formData.phone)) {
      e.phone = 'Invalid phone format'
    }
  }

  if (formData.website && formData.website.trim()) {
    try {
      new URL(formData.website)
    } catch {
      e.website = 'Invalid URL format'
    }
  }

  if (formData.pin_code && formData.pin_code.trim()) {
    if (!/^[0-9]{6}$/.test(formData.pin_code)) {
      e.pin_code = 'PIN Code must be 6 digits'
    }
  }

  setErrors(e)
  return Object.keys(e).length === 0
}
```
