# Validation Patterns

Comprehensive validation patterns used in JKKN COE entity CRUD pages.

## Complete Validation Function Example

```typescript
const validate = () => {
  const e: Record<string, string> = {}

  // 1. REQUIRED FIELD VALIDATION
  if (!formData.institution_code.trim()) {
    e.institution_code = 'Institution code is required'
  }
  if (!formData.degree_code.trim()) {
    e.degree_code = 'Degree code is required'
  }
  if (!formData.degree_name.trim()) {
    e.degree_name = 'Degree name is required'
  }

  // 2. FORMAT VALIDATION (Regex)
  if (formData.degree_code && !/^[A-Za-z0-9\-_]+$/.test(formData.degree_code)) {
    e.degree_code = 'Code can only contain letters, numbers, hyphens, and underscores'
  }

  // 3. LENGTH CONSTRAINTS
  if (formData.degree_code.length > 50) {
    e.degree_code = 'Degree code must be 50 characters or less'
  }
  if (formData.degree_name.length > 255) {
    e.degree_name = 'Degree name must be 255 characters or less'
  }
  if (formData.description && formData.description.length > 1000) {
    e.description = 'Description must be 1000 characters or less'
  }

  // 4. NUMERIC RANGE VALIDATION
  if (formData.credits && (Number(formData.credits) < 0 || Number(formData.credits) > 10)) {
    e.credits = 'Credits must be between 0 and 10'
  }

  // 5. CONDITIONAL VALIDATION
  if (formData.split_credit) {
    if (!formData.theory_credit || Number(formData.theory_credit) === 0) {
      e.theory_credit = 'Theory credit is required when split credit is enabled'
    }
    if (!formData.practical_credit || Number(formData.practical_credit) === 0) {
      e.practical_credit = 'Practical credit is required when split credit is enabled'
    }
  }

  // 6. URL VALIDATION
  if (formData.syllabus_pdf_url && formData.syllabus_pdf_url.trim()) {
    try {
      new URL(formData.syllabus_pdf_url)
    } catch {
      e.syllabus_pdf_url = 'Please enter a valid URL (e.g., https://example.com/file.pdf)'
    }
  }

  // 7. EMAIL VALIDATION
  if (formData.email && formData.email.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      e.email = 'Please enter a valid email address'
    }
  }

  // 8. PHONE NUMBER VALIDATION
  if (formData.phone && formData.phone.trim()) {
    const phoneRegex = /^[0-9]{10}$/
    if (!phoneRegex.test(formData.phone.replace(/\D/g, ''))) {
      e.phone = 'Phone number must be 10 digits'
    }
  }

  // 9. DATE VALIDATION
  if (formData.start_date && formData.end_date) {
    const start = new Date(formData.start_date)
    const end = new Date(formData.end_date)
    if (end <= start) {
      e.end_date = 'End date must be after start date'
    }
  }

  // 10. BOOLEAN/STATUS VALIDATION
  if (formData.is_active !== undefined && formData.is_active !== null) {
    if (typeof formData.is_active !== 'boolean') {
      const statusValue = String(formData.is_active).toLowerCase()
      if (statusValue !== 'true' && statusValue !== 'false' &&
          statusValue !== 'active' && statusValue !== 'inactive') {
        e.is_active = 'Status must be true/false or Active/Inactive'
      }
    }
  }

  setErrors(e)
  return Object.keys(e).length === 0
}
```

## Field-Level Validation Display

```typescript
<div className="space-y-2">
  <Label htmlFor="degree_code">
    Degree Code <span className="text-red-500">*</span>
  </Label>
  <Input
    id="degree_code"
    value={formData.degree_code}
    onChange={(e) => setFormData({ ...formData, degree_code: e.target.value })}
    className={errors.degree_code ? 'border-red-500' : ''}
    placeholder="e.g., BSC"
  />
  {errors.degree_code && (
    <p className="text-sm text-red-500">{errors.degree_code}</p>
  )}
</div>
```

## Import/Upload Validation

```typescript
const validateEntityData = (data: any, rowIndex: number) => {
  const errors: string[] = []

  // Required field validations
  if (!data.degree_code || data.degree_code.trim() === '') {
    errors.push('Degree Code is required')
  } else if (data.degree_code.length > 50) {
    errors.push('Degree Code must be 50 characters or less')
  }

  if (!data.degree_name || data.degree_name.trim() === '') {
    errors.push('Degree Name is required')
  } else if (data.degree_name.length > 255) {
    errors.push('Degree Name must be 255 characters or less')
  }

  // Optional field validations
  if (data.display_name && data.display_name.length > 255) {
    errors.push('Display Name must be 255 characters or less')
  }

  if (data.description && data.description.length > 1000) {
    errors.push('Description must be 1000 characters or less')
  }

  // Status validation
  if (data.is_active !== undefined && data.is_active !== null) {
    if (typeof data.is_active !== 'boolean') {
      const statusValue = String(data.is_active).toLowerCase()
      if (statusValue !== 'true' && statusValue !== 'false' &&
          statusValue !== 'active' && statusValue !== 'inactive') {
        errors.push('Status must be true/false or Active/Inactive')
      }
    }
  }

  return errors
}
```

## Foreign Key Validation (Client-Side)

```typescript
const save = async () => {
  if (!validate()) {
    toast({
      title: '⚠️ Validation Error',
      description: 'Please fix all validation errors before submitting.',
      variant: 'destructive',
      className: 'bg-red-50 border-red-200 text-red-800'
    })
    return
  }

  try {
    setLoading(true)

    // Validate foreign key reference
    const selectedInstitution = institutions.find(
      inst => inst.institution_code === formData.institution_code
    )

    if (!selectedInstitution) {
      toast({
        title: '❌ Error',
        description: 'Selected institution not found. Please refresh and try again.',
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    const payload = {
      ...formData,
      institutions_id: selectedInstitution.id
    }

    // Proceed with save...
  } catch (error) {
    // Error handling...
  }
}
```

## Foreign Key Validation (Server-Side)

```typescript
// In API route (POST/PUT handler)
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
```

## Form Submission with Validation

```typescript
const handleSubmit = async () => {
  if (!validate()) {
    toast({
      title: '⚠️ Validation Error',
      description: 'Please fix all validation errors before submitting.',
      variant: 'destructive',
      className: 'bg-red-50 border-red-200 text-red-800'
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
        throw new Error('This record already exists. Please use different values.')
      }

      if (errorMsg.includes('foreign key') || errorMsg.includes('reference')) {
        throw new Error('Invalid reference. Please ensure all related records exist.')
      }

      throw new Error(errorMsg)
    }

    const savedData = await response.json()

    toast({
      title: editing ? '✅ Record Updated' : '✅ Record Created',
      description: `Successfully ${editing ? 'updated' : 'created'} the record.`,
      className: 'bg-green-50 border-green-200 text-green-800'
    })

    setSheetOpen(false)
    resetForm()
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to save record. Please try again.'

    toast({
      title: '❌ Save Failed',
      description: errorMessage,
      variant: 'destructive',
      className: 'bg-red-50 border-red-200 text-red-800'
    })
  } finally {
    setLoading(false)
  }
}
```

## Common Validation Regex Patterns

```typescript
// Alphanumeric with hyphens/underscores (codes)
const codeRegex = /^[A-Za-z0-9\-_]+$/

// Email
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Phone (10 digits)
const phoneRegex = /^[0-9]{10}$/

// URL
const urlRegex = /^(https?:\/\/)?([\w\-]+(\.[\w\-]+)+)([\w\-\.,@?^=%&:/~\+#]*[\w\-@?^=%&/~\+#])?$/

// Alphanumeric only
const alphanumericRegex = /^[A-Za-z0-9]+$/

// Letters only
const lettersOnlyRegex = /^[A-Za-z\s]+$/

// Numbers only
const numbersOnlyRegex = /^[0-9]+$/
```

## Error State Management

```typescript
const [errors, setErrors] = useState<Record<string, string>>({})

// Clear errors when opening form
const openAdd = () => {
  resetForm()
  setErrors({})
  setSheetOpen(true)
}

// Clear specific error on field change
const handleFieldChange = (field: string, value: any) => {
  setFormData({ ...formData, [field]: value })
  if (errors[field]) {
    setErrors({ ...errors, [field]: '' })
  }
}
```
