# useFormValidation Hook - Complete Guide

A powerful, reusable form validation hook for React applications with TypeScript support.

## Table of Contents
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Validation Rules](#validation-rules)
- [Validation Presets](#validation-presets)
- [Advanced Examples](#advanced-examples)
- [API Reference](#api-reference)

## Installation

The hook is already available in your project at `@/hooks/use-form-validation`

```tsx
import { useFormValidation, ValidationPresets } from '@/hooks/use-form-validation'
```

## Basic Usage

### Simple Form Validation

```tsx
import { useFormValidation, ValidationPresets } from '@/hooks/use-form-validation'

function MyForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    age: '',
  })

  // Define validation rules
  const { errors, validate, clearErrors } = useFormValidation({
    name: [ValidationPresets.required('Name is required')],
    email: [
      ValidationPresets.required('Email is required'),
      ValidationPresets.email(),
    ],
    age: [
      ValidationPresets.required('Age is required'),
      ValidationPresets.range(18, 100, 'Age must be between 18 and 100'),
    ],
  })

  const handleSubmit = async () => {
    if (!validate(formData)) {
      toast({
        title: '⚠️ Validation Error',
        description: 'Please fix all validation errors before submitting.',
        variant: 'destructive',
      })
      return
    }

    // Proceed with form submission
    await saveData(formData)
  }

  return (
    <form>
      <div>
        <Label>Name</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={errors.name ? 'border-red-500' : ''}
        />
        {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
      </div>

      <Button onClick={handleSubmit}>Submit</Button>
    </form>
  )
}
```

## Validation Rules

### Available Rule Types

| Rule Type | Description | Example |
|-----------|-------------|---------|
| `required` | Field must have a value | `{ type: 'required', message: 'Required' }` |
| `pattern` | Value must match regex | `{ type: 'pattern', pattern: /^[A-Z]+$/, message: 'Uppercase only' }` |
| `min` | Number must be >= min | `{ type: 'min', value: 0, message: 'Must be positive' }` |
| `max` | Number must be <= max | `{ type: 'max', value: 100, message: 'Cannot exceed 100' }` |
| `range` | Number must be in range | `{ type: 'range', value: [0, 100], message: 'Must be 0-100' }` |
| `url` | Must be valid URL | `{ type: 'url', message: 'Invalid URL' }` |
| `email` | Must be valid email | `{ type: 'email', message: 'Invalid email' }` |
| `custom` | Custom validation function | `{ type: 'custom', validator: (val) => val.length > 5, message: 'Too short' }` |

## Validation Presets

Pre-built validation rules for common scenarios:

### Required Field
```tsx
ValidationPresets.required('Custom message')
```

### Alphanumeric with Special Characters
```tsx
ValidationPresets.alphanumericWithSpecial()
// Allows: letters, numbers, hyphens, underscores
// Example: "Course-123_A"
```

### Alphanumeric Only
```tsx
ValidationPresets.alphanumeric()
// Allows: letters and numbers only
// Example: "Course123"
```

### Numeric Only
```tsx
ValidationPresets.numeric()
// Allows: digits only
// Example: "12345"
```

### Min Value
```tsx
ValidationPresets.minValue(0, 'Must be positive')
```

### Max Value
```tsx
ValidationPresets.maxValue(100, 'Cannot exceed 100')
```

### Range
```tsx
ValidationPresets.range(0, 10, 'Must be between 0 and 10')
```

### URL
```tsx
ValidationPresets.url()
```

### Email
```tsx
ValidationPresets.email()
```

### Custom Validator
```tsx
ValidationPresets.custom(
  (value, formData) => value !== formData.password,
  'Passwords must not match'
)
```

## Advanced Examples

### Example 1: Course Form (Multiple Validations per Field)

```tsx
const { errors, validate, clearErrors } = useFormValidation({
  course_code: [
    ValidationPresets.required('Course code is required'),
    ValidationPresets.alphanumericWithSpecial('Only letters, numbers, hyphens, and underscores allowed'),
  ],
  course_title: [
    ValidationPresets.required('Course title is required'),
  ],
  credits: [
    ValidationPresets.required('Credits is required'),
    ValidationPresets.range(0, 10, 'Credits must be between 0 and 10'),
  ],
  syllabus_url: [
    ValidationPresets.url('Please enter a valid URL'),
  ],
})
```

### Example 2: Conditional Validation (Split Credits)

```tsx
const { errors, validate, clearErrors, setFieldError } = useFormValidation({
  credits: [ValidationPresets.required('Credits required')],
  split_credit: [],
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
  ],
})
```

### Example 3: Real-time Validation on Blur

```tsx
function MyForm() {
  const { errors, validateSingleField } = useFormValidation({
    email: [ValidationPresets.required(), ValidationPresets.email()],
  })

  const handleEmailBlur = () => {
    validateSingleField('email', formData.email, formData)
  }

  return (
    <Input
      value={formData.email}
      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
      onBlur={handleEmailBlur}
      className={errors.email ? 'border-red-500' : ''}
    />
  )
}
```

### Example 4: Server-Side Validation Errors

```tsx
const { errors, validate, setFieldError, setMultipleErrors } = useFormValidation({
  // ... validation rules
})

const handleSubmit = async () => {
  if (!validate(formData)) return

  try {
    await saveData(formData)
  } catch (error) {
    // Set server-side validation errors
    if (error.field) {
      setFieldError(error.field, error.message)
    } else if (error.errors) {
      setMultipleErrors(error.errors)
    }
  }
}
```

### Example 5: Complex Custom Validation

```tsx
const { errors, validate } = useFormValidation({
  password: [
    ValidationPresets.required('Password is required'),
    ValidationPresets.custom(
      (value) => value.length >= 8,
      'Password must be at least 8 characters'
    ),
    ValidationPresets.custom(
      (value) => /[A-Z]/.test(value),
      'Password must contain at least one uppercase letter'
    ),
    ValidationPresets.custom(
      (value) => /[0-9]/.test(value),
      'Password must contain at least one number'
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
```

## API Reference

### Hook Return Values

```tsx
const {
  errors,                  // Current validation errors
  validate,                // Validate entire form
  validateSingleField,     // Validate one field
  clearErrors,             // Clear all errors
  clearError,              // Clear error for one field
  setFieldError,           // Set custom error for one field
  setMultipleErrors,       // Set multiple errors at once
} = useFormValidation(rules)
```

#### `errors: ValidationErrors`
Object containing all current validation errors.

```tsx
{ fieldName: 'Error message' }
```

#### `validate(formData: any): boolean`
Validates all fields defined in validation rules. Returns `true` if valid, `false` otherwise.

```tsx
if (!validate(formData)) {
  // Show error toast
  return
}
```

#### `validateSingleField(fieldName: string, fieldValue: any, formData?: any): boolean`
Validates a single field. Useful for real-time validation.

```tsx
onBlur={() => validateSingleField('email', formData.email, formData)}
```

#### `clearErrors(): void`
Clears all validation errors. Use when resetting the form.

```tsx
const resetForm = () => {
  setFormData(initialState)
  clearErrors()
}
```

#### `clearError(fieldName: string): void`
Clears validation error for a specific field.

```tsx
onChange={(e) => {
  setFormData({ ...formData, name: e.target.value })
  clearError('name')
}}
```

#### `setFieldError(fieldName: string, error: string): void`
Sets a custom error message for a field. Useful for server-side validation errors.

```tsx
catch (error) {
  setFieldError('email', 'Email already exists')
}
```

#### `setMultipleErrors(errors: ValidationErrors): void`
Sets multiple errors at once.

```tsx
catch (error) {
  setMultipleErrors({
    email: 'Email already exists',
    username: 'Username taken'
  })
}
```

## Migration Guide

### Before (Old Pattern)
```tsx
const [errors, setErrors] = useState<Record<string, string>>({})

const validate = () => {
  const e: Record<string, string> = {}
  if (!formData.name.trim()) e.name = 'Required'
  if (!formData.email.trim()) e.email = 'Required'
  if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
    e.email = 'Invalid email'
  }
  setErrors(e)
  return Object.keys(e).length === 0
}

const resetForm = () => {
  setFormData(initialState)
  setErrors({})
}
```

### After (New Pattern)
```tsx
const { errors, validate, clearErrors } = useFormValidation({
  name: [ValidationPresets.required()],
  email: [
    ValidationPresets.required(),
    ValidationPresets.email()
  ]
})

const handleSubmit = () => {
  if (!validate(formData)) return
  // ...
}

const resetForm = () => {
  setFormData(initialState)
  clearErrors()
}
```

## Benefits

✅ **Reusable**: Define validation rules once, use across all forms
✅ **Type-Safe**: Full TypeScript support with type inference
✅ **Declarative**: Clear, readable validation rules
✅ **Flexible**: Supports custom validators for complex logic
✅ **DRY**: No repetitive validation code
✅ **Maintainable**: Centralized validation logic
✅ **Testable**: Easy to unit test validation rules
✅ **Performant**: Memoized validation functions

## Best Practices

1. **Define rules outside component** for better performance:
   ```tsx
   const DEGREE_VALIDATION_RULES = {
     degree_code: [ValidationPresets.required()],
     degree_name: [ValidationPresets.required()],
   }

   function DegreeForm() {
     const { errors, validate } = useFormValidation(DEGREE_VALIDATION_RULES)
   }
   ```

2. **Use ValidationPresets** instead of writing custom rules when possible

3. **Show validation toast** when form fails validation:
   ```tsx
   if (!validate(formData)) {
     toast({
       title: '⚠️ Validation Error',
       description: 'Please fix all errors before submitting.',
       variant: 'destructive'
     })
     return
   }
   ```

4. **Clear errors on form reset**:
   ```tsx
   const resetForm = () => {
     setFormData(initialState)
     clearErrors()
     setEditing(null)
   }
   ```

5. **Apply error styling** to inputs:
   ```tsx
   <Input
     className={errors.field_name ? 'border-red-500' : ''}
   />
   ```

## Support

For questions or issues with the validation hook, contact the development team or refer to the codebase documentation in `CLAUDE.md`.
