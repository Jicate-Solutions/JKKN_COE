# Toast Notification System Guide

## Overview

This guide explains how to use the centralized toast notification system across all pages in the JKKN COE application. The system provides consistent, user-friendly feedback for all CRUD operations with standardized styling and messaging.

## Color Scheme

- ✅ **Success (Green)**: Successful operations
- ⚠️ **Warning (Yellow)**: Partial success or validation warnings
- ❌ **Error (Red)**: Failed operations or errors
- ℹ️ **Info (Blue)**: General information or status updates

## Quick Start

### 1. Import Toast Utilities

```typescript
import {
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showValidationToast,
  showInfoToast,
  showUploadSummaryToast,
  handleApiResponse,
  withToastHandler
} from '@/lib/utils/toast-utils'
import { ENTITY_NAMES } from '@/lib/constants/toast-config'
```

### 2. Basic Usage Examples

#### Success Toast
```typescript
// Simple success
showSuccessToast('create', ENTITY_NAMES.course)

// With custom details
showSuccessToast('update', ENTITY_NAMES.course, 'Course CS101 has been updated')

// With count (for bulk operations)
showSuccessToast('delete', ENTITY_NAMES.courses, { count: 5 })
```

#### Error Toast
```typescript
// From error object
showErrorToast(error, 'create', ENTITY_NAMES.course)

// With custom message
showErrorToast('Network connection failed', 'update', ENTITY_NAMES.course)
```

#### Warning Toast
```typescript
showWarningToast('⚠️ Incomplete Data', 'Some fields are missing optional values')
```

#### Validation Toast
```typescript
// With validation errors object
showValidationToast(errors)

// With custom message
showValidationToast(undefined, 'Please complete all required fields')
```

#### Info Toast
```typescript
showInfoToast('ℹ️ Processing', 'Your request is being processed...')
```

## Common Patterns

### Pattern 1: Form Save/Update

```typescript
const save = async () => {
  // Validate first
  if (!validate()) {
    showValidationToast(errors)
    return
  }

  // Use withToastHandler wrapper
  await withToastHandler(
    async () => {
      const response = await fetch('/api/courses', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save')
      }

      const saved = await response.json()
      // Update local state
      setCourses(prev => [...prev, saved])
      // Close form
      setSheetOpen(false)
    },
    {
      operation: editing ? 'update' : 'create',
      entityName: ENTITY_NAMES.course,
      onSuccess: () => {
        resetForm()
      }
    }
  )
}
```

### Pattern 2: Delete with Confirmation

```typescript
const handleDelete = async (id: string) => {
  await withToastHandler(
    async () => {
      const response = await fetch(`/api/courses/${id}`, {
        method: 'DELETE'
      })

      const result = await handleApiResponse(
        response,
        'delete',
        ENTITY_NAMES.course
      )

      if (result.success) {
        // Update local state
        setCourses(prev => prev.filter(c => c.id !== id))
      } else {
        throw new Error(result.error)
      }
    },
    {
      operation: 'delete',
      entityName: ENTITY_NAMES.course
    }
  )
}
```

### Pattern 3: Bulk Upload with Error Tracking

```typescript
const handleUpload = async (file: File) => {
  showProcessingToast('Processing uploaded file...')

  // Parse file and process rows
  let successCount = 0
  let errorCount = 0
  const errors = []

  for (const row of data) {
    try {
      const response = await fetch('/api/courses', {
        method: 'POST',
        body: JSON.stringify(row)
      })

      if (response.ok) {
        successCount++
      } else {
        errorCount++
        const errorData = await response.json()
        errors.push({
          row: rowNumber,
          error: errorData.error
        })
      }
    } catch (error) {
      errorCount++
      errors.push({
        row: rowNumber,
        error: error.message
      })
    }
  }

  // Show summary
  showUploadSummaryToast(
    data.length,
    successCount,
    errorCount,
    ENTITY_NAMES.course
  )

  // Show error dialog if needed
  if (errors.length > 0) {
    setUploadErrors(errors)
    setShowErrorDialog(true)
  }
}
```

### Pattern 4: Export Operations

```typescript
const exportData = () => {
  try {
    // Export logic here
    const blob = new Blob([data], { type: 'application/json' })
    // ... download logic

    showSuccessToast('export', ENTITY_NAMES.courses, {
      count: courses.length
    })
  } catch (error) {
    showErrorToast(error, 'export', ENTITY_NAMES.courses)
  }
}
```

### Pattern 5: Refresh/Reload Data

```typescript
const refreshData = async () => {
  try {
    const response = await fetch('/api/courses')
    const result = await handleApiResponse(
      response,
      'fetch',
      ENTITY_NAMES.courses
    )

    if (result.success) {
      setCourses(result.data)
      showInfoToast(
        '✅ Refreshed',
        `Loaded ${result.data.length} courses.`
      )
    }
  } catch (error) {
    showErrorToast(error, undefined, ENTITY_NAMES.courses)
  }
}
```

## API Error Handling

### Using handleApiResponse Helper

```typescript
const response = await fetch('/api/endpoint', options)

const result = await handleApiResponse(
  response,
  'create',  // operation type
  ENTITY_NAMES.course,  // entity name
  () => {  // optional success callback
    console.log('Success!')
  }
)

if (result.success) {
  // Handle success
  console.log(result.data)
} else {
  // Error toast already shown by handleApiResponse
  console.error(result.error)
}
```

### Database Error Code Mapping

The system automatically maps common PostgreSQL error codes to user-friendly messages:

```typescript
// These errors are automatically handled:
- 23505: Duplicate entry → "This record already exists"
- 23503: Foreign key violation → "Invalid reference"
- 23502: Required field missing → "Required field is missing"
- 23514: Check constraint → "Invalid value"
```

## Upload Error Dialog Pattern

For bulk operations, use the standardized error dialog:

```typescript
// State for upload tracking
const [uploadSummary, setUploadSummary] = useState({
  total: 0,
  success: 0,
  failed: 0
})

const [uploadErrors, setUploadErrors] = useState<Array<{
  row: number
  [entity]_code: string
  [entity]_name: string
  errors: string[]
}>>([])

// Show dialog with errors
if (uploadErrors.length > 0) {
  setUploadErrors(errors)
  setShowErrorDialog(true)
}

// Use showUploadSummaryToast for summary
showUploadSummaryToast(
  total,
  successCount,
  errorCount,
  ENTITY_NAMES.course
)
```

## Configuration

### Toast Durations

```typescript
import { TOAST_DURATION } from '@/lib/constants/toast-config'

// Available durations (in milliseconds)
TOAST_DURATION.instant  // 1500ms
TOAST_DURATION.short    // 3000ms
TOAST_DURATION.normal   // 5000ms (default)
TOAST_DURATION.long     // 6000ms
TOAST_DURATION.veryLong // 8000ms
```

### Custom Toast Styles

```typescript
import { TOAST_STYLES } from '@/lib/constants/toast-config'

// Use predefined styles
toast({
  title: 'Custom Toast',
  description: 'Message',
  className: TOAST_STYLES.success,  // or .warning, .error, .info
  duration: TOAST_DURATION.normal
})
```

## Entity Name Constants

Always use predefined entity names for consistency:

```typescript
import { ENTITY_NAMES } from '@/lib/constants/toast-config'

// Available entities
ENTITY_NAMES.course      // 'Course'
ENTITY_NAMES.courses     // 'Courses'
ENTITY_NAMES.department  // 'Department'
ENTITY_NAMES.degree      // 'Degree'
ENTITY_NAMES.institution // 'Institution'
ENTITY_NAMES.program     // 'Program'
ENTITY_NAMES.regulation  // 'Regulation'
ENTITY_NAMES.section     // 'Section'
ENTITY_NAMES.semester    // 'Semester'
ENTITY_NAMES.student     // 'Student'
// ... and more
```

## Migration Guide

### Before (Old Pattern)
```typescript
toast({
  title: '✅ Record Created',
  description: `${formData.course_title} has been successfully created.`,
  className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
})
```

### After (New Pattern)
```typescript
showSuccessToast('create', ENTITY_NAMES.course, formData.course_title)
```

### Benefits of New System

1. **Consistency**: All toasts follow the same visual pattern
2. **Maintainability**: Centralized styling and messages
3. **Error Handling**: Automatic error message parsing
4. **Type Safety**: TypeScript support for operations and entities
5. **Accessibility**: Proper ARIA labels and color contrast
6. **Dark Mode**: Automatic dark mode support
7. **Internationalization Ready**: Centralized messages for easy translation

## Best Practices

1. **Always validate before API calls**
   ```typescript
   if (!validate()) {
     showValidationToast(errors)
     return
   }
   ```

2. **Use entity constants**
   ```typescript
   // Good
   showSuccessToast('create', ENTITY_NAMES.course)

   // Avoid
   showSuccessToast('create', 'Course')
   ```

3. **Handle all error cases**
   ```typescript
   try {
     // operation
   } catch (error) {
     showErrorToast(error, operation, entity)
   }
   ```

4. **Provide meaningful error messages**
   ```typescript
   throw new Error('Institution code not found. Please ensure it exists.')
   ```

5. **Use appropriate toast duration**
   ```typescript
   // Short for quick confirmations
   showInfoToast('Copied!', '', TOAST_DURATION.short)

   // Long for complex messages
   showWarningToast('Warning', detailedMessage, TOAST_DURATION.long)
   ```

## Troubleshooting

### Toast Not Showing
- Ensure `useToast` hook is available in component
- Check if toast provider is wrapped around app
- Verify import paths are correct

### Wrong Styling
- Check if Tailwind classes are being purged
- Ensure dark mode classes are configured
- Verify toast-utils import is correct

### Error Messages Not User-Friendly
- Implement proper error extraction in API routes
- Return `{ error: "message" }` format from API
- Use database error code mapping

## Support

For issues or improvements to the toast system:
1. Check `/lib/utils/toast-utils.ts` for implementation
2. Review `/lib/constants/toast-config.ts` for configuration
3. See example usage in `/app/coe/courses/page-refactored.tsx`