/**
 * useFormValidation Hook - Practical Examples
 *
 * This file contains real-world examples of using the useFormValidation hook
 * across different types of forms in the JKKN COE application.
 */

import { useFormValidation, ValidationPresets } from '@/hooks/common/use-form-validation'

// ============================================================================
// EXAMPLE 1: Simple Entity Form (Degree, Department, Institution)
// ============================================================================

export function SimpleDegreeFormExample() {
  const [formData, setFormData] = useState({
    institution_code: '',
    degree_code: '',
    degree_name: '',
    display_name: '',
    description: '',
    is_active: true,
  })

  const { errors, validate, clearErrors } = useFormValidation({
    institution_code: [ValidationPresets.required('Institution code is required')],
    degree_code: [ValidationPresets.required('Degree code is required')],
    degree_name: [ValidationPresets.required('Degree name is required')],
  })

  const handleSave = async () => {
    if (!validate(formData)) {
      toast({
        title: '⚠️ Validation Error',
        description: 'Please fix all validation errors before submitting.',
        variant: 'destructive',
      })
      return
    }

    try {
      const response = await fetch('/api/degrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) throw new Error('Failed to save')

      toast({
        title: '✅ Success',
        description: 'Degree created successfully',
      })
      clearErrors()
      setFormData(initialState)
    } catch (error) {
      toast({
        title: '❌ Error',
        description: error.message,
        variant: 'destructive',
      })
    }
  }

  return (
    <form>
      <Input
        value={formData.degree_code}
        onChange={(e) => setFormData({ ...formData, degree_code: e.target.value })}
        className={errors.degree_code ? 'border-red-500' : ''}
      />
      {errors.degree_code && <p className="text-red-500">{errors.degree_code}</p>}
      {/* ... more fields */}
    </form>
  )
}

// ============================================================================
// EXAMPLE 2: Complex Form with Multiple Validation Rules (Courses)
// ============================================================================

export function ComplexCourseFormExample() {
  const [formData, setFormData] = useState({
    course_code: '',
    course_title: '',
    credits: '',
    theory_credit: '',
    practical_credit: '',
    split_credit: false,
    exam_duration: '',
    syllabus_pdf_url: '',
  })

  const { errors, validate, clearErrors } = useFormValidation({
    course_code: [
      ValidationPresets.required('Course code is required'),
      ValidationPresets.alphanumericWithSpecial(
        'Course code can only contain letters, numbers, hyphens, and underscores'
      ),
    ],
    course_title: [ValidationPresets.required('Course title is required')],
    credits: [
      ValidationPresets.required('Credits is required'),
      ValidationPresets.range(0, 99, 'Credits must be between 0 and 99'),
    ],
    theory_credit: [
      ValidationPresets.custom(
        (value, formData) => {
          if (formData.split_credit) {
            return value && Number(value) > 0
          }
          return true
        },
        'Theory credit is required when split credit is enabled'
      ),
      ValidationPresets.range(0, 99, 'Theory credit must be between 0 and 99'),
    ],
    practical_credit: [
      ValidationPresets.custom(
        (value, formData) => {
          if (formData.split_credit) {
            return value && Number(value) > 0
          }
          return true
        },
        'Practical credit is required when split credit is enabled'
      ),
      ValidationPresets.range(0, 99, 'Practical credit must be between 0 and 99'),
    ],
    exam_duration: [
      ValidationPresets.range(0, 150, 'Duration must be between 0 and 150 minutes'),
    ],
    syllabus_pdf_url: [
      ValidationPresets.url('Please enter a valid URL (e.g., https://example.com/syllabus.pdf)'),
    ],
  })

  const handleSave = async () => {
    if (!validate(formData)) {
      toast({
        title: '⚠️ Validation Error',
        description: 'Please fix all validation errors before submitting.',
        variant: 'destructive',
      })
      return
    }

    // Save logic...
  }

  return <form>{/* Form fields */}</form>
}

// ============================================================================
// EXAMPLE 3: Form with Real-time Validation (Program)
// ============================================================================

export function RealtimeValidationExample() {
  const [formData, setFormData] = useState({
    program_code: '',
    program_name: '',
    duration_years: '',
  })

  const { errors, validate, validateSingleField, clearError } = useFormValidation({
    program_code: [
      ValidationPresets.required('Program code is required'),
      ValidationPresets.alphanumericWithSpecial(),
    ],
    program_name: [ValidationPresets.required('Program name is required')],
    duration_years: [ValidationPresets.range(1, 10, 'Duration must be between 1 and 10 years')],
  })

  // Real-time validation on blur
  const handleBlur = (fieldName: string) => {
    validateSingleField(fieldName, formData[fieldName], formData)
  }

  // Clear error on change
  const handleChange = (fieldName: string, value: any) => {
    setFormData({ ...formData, [fieldName]: value })
    if (errors[fieldName]) {
      clearError(fieldName)
    }
  }

  return (
    <form>
      <Input
        value={formData.program_code}
        onChange={(e) => handleChange('program_code', e.target.value)}
        onBlur={() => handleBlur('program_code')}
        className={errors.program_code ? 'border-red-500' : ''}
      />
      {errors.program_code && <p className="text-red-500">{errors.program_code}</p>}
    </form>
  )
}

// ============================================================================
// EXAMPLE 4: Form with Server-Side Validation (User Registration)
// ============================================================================

export function ServerSideValidationExample() {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  })

  const { errors, validate, setFieldError, setMultipleErrors, clearErrors } = useFormValidation({
    email: [ValidationPresets.required('Email is required'), ValidationPresets.email()],
    username: [
      ValidationPresets.required('Username is required'),
      ValidationPresets.alphanumeric(),
    ],
    password: [
      ValidationPresets.required('Password is required'),
      ValidationPresets.custom(
        (value) => value.length >= 8,
        'Password must be at least 8 characters'
      ),
    ],
    confirmPassword: [
      ValidationPresets.required('Please confirm password'),
      ValidationPresets.custom(
        (value, formData) => value === formData.password,
        'Passwords do not match'
      ),
    ],
  })

  const handleRegister = async () => {
    // Clear any previous server-side errors
    clearErrors()

    // Client-side validation
    if (!validate(formData)) {
      toast({
        title: '⚠️ Validation Error',
        description: 'Please fix all validation errors before submitting.',
        variant: 'destructive',
      })
      return
    }

    try {
      const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()

        // Handle server-side validation errors
        if (errorData.field && errorData.message) {
          // Single field error
          setFieldError(errorData.field, errorData.message)
        } else if (errorData.errors) {
          // Multiple field errors
          setMultipleErrors(errorData.errors)
        }

        throw new Error(errorData.error || 'Registration failed')
      }

      toast({
        title: '✅ Success',
        description: 'Registration successful',
      })
    } catch (error) {
      toast({
        title: '❌ Error',
        description: error.message,
        variant: 'destructive',
      })
    }
  }

  return <form>{/* Form fields */}</form>
}

// ============================================================================
// EXAMPLE 5: Reusable Validation Rules (Constants)
// ============================================================================

// Define validation rules as constants for reusability
export const INSTITUTION_VALIDATION_RULES = {
  institution_code: [
    ValidationPresets.required('Institution code is required'),
    ValidationPresets.alphanumericWithSpecial(),
  ],
  name: [ValidationPresets.required('Institution name is required')],
}

export const DEGREE_VALIDATION_RULES = {
  institution_code: [ValidationPresets.required('Institution code is required')],
  degree_code: [ValidationPresets.required('Degree code is required')],
  degree_name: [ValidationPresets.required('Degree name is required')],
}

export const COURSE_VALIDATION_RULES = {
  institution_code: [ValidationPresets.required('Institution code is required')],
  regulation_code: [ValidationPresets.required('Regulation code is required')],
  course_code: [
    ValidationPresets.required('Course code is required'),
    ValidationPresets.alphanumericWithSpecial(),
  ],
  course_title: [ValidationPresets.required('Course name is required')],
  display_code: [ValidationPresets.required('Display code is required')],
  qp_code: [ValidationPresets.required('QP code is required')],
  course_category: [ValidationPresets.required('Course category is required')],
  evaluation_type: [ValidationPresets.required('Evaluation type is required')],
  result_type: [ValidationPresets.required('Result type is required')],
  credits: [ValidationPresets.range(0, 99, 'Credit must be between 0 and 99')],
  theory_credit: [
    ValidationPresets.custom(
      (value, formData) => {
        if (formData.split_credit) {
          return value && Number(value) > 0
        }
        return true
      },
      'Theory credit is required when split credit is enabled'
    ),
    ValidationPresets.range(0, 99, 'Theory credit must be between 0 and 99'),
  ],
  practical_credit: [
    ValidationPresets.custom(
      (value, formData) => {
        if (formData.split_credit) {
          return value && Number(value) > 0
        }
        return true
      },
      'Practical credit is required when split credit is enabled'
    ),
    ValidationPresets.range(0, 99, 'Practical credit must be between 0 and 99'),
  ],
  exam_duration: [ValidationPresets.range(0, 150, 'Duration must be between 0 and 150 minutes')],
}

// Usage in component
export function ComponentUsingConstantRules() {
  const { errors, validate } = useFormValidation(DEGREE_VALIDATION_RULES)
  // ... rest of component
}

// ============================================================================
// EXAMPLE 6: Dynamic Validation Rules
// ============================================================================

export function DynamicValidationExample() {
  const [formType, setFormType] = useState<'basic' | 'advanced'>('basic')

  // Define different validation rules based on form type
  const validationRules = useMemo(() => {
    if (formType === 'basic') {
      return {
        name: [ValidationPresets.required()],
        email: [ValidationPresets.required(), ValidationPresets.email()],
      }
    } else {
      return {
        name: [ValidationPresets.required()],
        email: [ValidationPresets.required(), ValidationPresets.email()],
        phone: [ValidationPresets.required()],
        address: [ValidationPresets.required()],
        zipCode: [ValidationPresets.required(), ValidationPresets.numeric()],
      }
    }
  }, [formType])

  const { errors, validate, clearErrors } = useFormValidation(validationRules)

  return <form>{/* Form fields based on formType */}</form>
}

// ============================================================================
// EXAMPLE 7: Import/Upload Validation
// ============================================================================

export function ImportValidationExample() {
  const { errors, validate } = useFormValidation(DEGREE_VALIDATION_RULES)

  const handleImport = async (jsonData: any[]) => {
    const uploadErrors: any[] = []
    let successCount = 0

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i]
      const rowNumber = i + 2 // +2 for header row

      // Validate each row
      if (!validate(row)) {
        uploadErrors.push({
          row: rowNumber,
          degree_code: row.degree_code || 'N/A',
          degree_name: row.degree_name || 'N/A',
          errors: Object.values(errors),
        })
        continue
      }

      // If valid, save to database
      try {
        const response = await fetch('/api/degrees', {
          method: 'POST',
          body: JSON.stringify(row),
        })
        if (response.ok) {
          successCount++
        }
      } catch (error) {
        uploadErrors.push({
          row: rowNumber,
          degree_code: row.degree_code || 'N/A',
          degree_name: row.degree_name || 'N/A',
          errors: ['Network error'],
        })
      }
    }

    if (uploadErrors.length > 0) {
      // Show error dialog with details
      setImportErrors(uploadErrors)
      setErrorDialogOpen(true)
    }

    toast({
      title: '✅ Upload Complete',
      description: `${successCount} records uploaded successfully`,
    })
  }

  return <div>{/* Upload UI */}</div>
}
