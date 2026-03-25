# Bug Reporter - Advanced Configuration & Usage Guide

This guide covers the advanced bug reporter features implemented in the JKKN COE application.

## Table of Contents

1. [Overview](#overview)
2. [Custom Widget Styling](#custom-widget-styling)
3. [Conditional Rendering](#conditional-rendering)
4. [Programmatic Bug Reporting](#programmatic-bug-reporting)
5. [Error Boundary Integration](#error-boundary-integration)
6. [Configuration](#configuration)
7. [Best Practices](#best-practices)

---

## Overview

The JKKN COE application includes a comprehensive bug reporting system with the following features:

- **Custom Styling**: Customizable widget appearance with brand fonts
- **Conditional Rendering**: Role-based and environment-based visibility
- **Programmatic Reporting**: Manual error reporting via hooks
- **Error Boundaries**: Automatic error reporting for React errors

---

## Custom Widget Styling

The bug reporter widget is styled to match the application's design system.

### Default Positioning

The bug reporter button is positioned at the **bottom-left** corner of the screen:

```css
/* styles/globals.css */
.bug-reporter-widget {
  bottom: 2rem !important;
  left: 2rem !important;
  z-index: 9999 !important;
}
```

### Custom Font

The bug reporter uses the application's Inter font for consistency:

```css
.bug-reporter-sdk {
  font-family: var(--font-inter) !important;
}
```

---

## Conditional Rendering

The bug reporter is conditionally rendered based on user roles and environment.

### When is it enabled?

1. **Always** in `development` mode
2. **Production mode** - only for users with specific roles:
   - `admin`
   - `super_admin`
   - `beta-tester`
   - `developer`
3. **Force enable** - via environment variable (see Configuration)

### Implementation

```tsx
// components/bug-reporter/bug-reporter-wrapper.tsx
const isBugReporterEnabled = useMemo(() => {
  // Always enable in development
  if (process.env.NODE_ENV === 'development') {
    return true
  }

  // In production, check user authentication
  if (!isAuthenticated || !user) {
    return false
  }

  // Enable for specific roles
  const allowedRoles = ['admin', 'super_admin', 'beta-tester', 'developer']
  const hasAllowedRole = allowedRoles.some((role) => hasRole(role))

  // Enable if user has allowed role OR force enabled
  return hasAllowedRole || process.env.NEXT_PUBLIC_BUG_REPORTER_FORCE_ENABLE === 'true'
}, [isAuthenticated, user, hasRole])
```

---

## Programmatic Bug Reporting

Use the `useBugReporter` hook to manually report bugs from your code.

### Basic Usage

```tsx
import { useBugReporter } from '@/hooks'

function MyComponent() {
  const { reportBug, reportError, reportException } = useBugReporter()

  // Report a bug manually
  const handleReportBug = async () => {
    await reportBug({
      title: 'Button not responding',
      description: 'The submit button is not responding to clicks',
      category: 'bug',
      severity: 'medium'
    })
  }

  // Report an error
  const handleAction = async () => {
    try {
      await someAsyncOperation()
    } catch (error) {
      await reportError(error, 'Failed to complete action')
    }
  }

  return (
    <button onClick={handleAction}>
      Do Something
    </button>
  )
}
```

### Report Error with Context

```tsx
import { useBugReporter } from '@/hooks'

function DataFetchComponent() {
  const { reportException } = useBugReporter()

  const fetchData = async () => {
    try {
      const response = await fetch('/api/data')
      if (!response.ok) throw new Error('Failed to fetch')
      return await response.json()
    } catch (error) {
      // Report with additional context
      await reportException(error, {
        action: 'fetchData',
        component: 'DataFetchComponent',
        userId: user?.id,
        additionalInfo: {
          endpoint: '/api/data',
          timestamp: Date.now()
        }
      })
      throw error
    }
  }

  return <div>...</div>
}
```

### Hook API

#### `reportBug(options: BugReportOptions)`

Report a bug with detailed information.

**Options:**
- `title` (string, required): Bug title
- `description` (string, required): Detailed description
- `category` (string, optional): 'bug' | 'error' | 'feature' | 'feedback' | 'other'
- `page_url` (string, optional): Current page URL (auto-filled)
- `console_logs` (string[], optional): Console logs
- `severity` (string, optional): 'low' | 'medium' | 'high' | 'critical'
- `metadata` (object, optional): Additional metadata

**Returns:** `Promise<{ success: boolean, error?: string }>`

#### `reportError(error: Error, customTitle?: string)`

Report an error with automatic context extraction.

**Parameters:**
- `error` (Error | unknown, required): The error to report
- `customTitle` (string, optional): Custom title for the report

**Returns:** `Promise<{ success: boolean, error?: string }>`

#### `reportException(error: Error, context?: object)`

Report a caught exception with additional context.

**Context Object:**
- `action` (string, optional): Action being performed
- `component` (string, optional): Component name
- `userId` (string, optional): User ID
- `additionalInfo` (object, optional): Extra information

**Returns:** `Promise<{ success: boolean, error?: string }>`

---

## Error Boundary Integration

The `ErrorBoundary` component automatically reports React errors to the bug reporter.

### Basic Usage

```tsx
import { ErrorBoundary } from '@/components/error-boundary'

function App() {
  return (
    <ErrorBoundary>
      <YourComponent />
    </ErrorBoundary>
  )
}
```

### With Custom Fallback UI

```tsx
import { ErrorBoundary } from '@/components/error-boundary'

function CustomErrorUI() {
  return <div>Something went wrong. Please refresh the page.</div>
}

function App() {
  return (
    <ErrorBoundary
      fallback={<CustomErrorUI />}
      showDetails={true}
      onError={(error, errorInfo) => {
        console.log('Error caught:', error, errorInfo)
      }}
    >
      <YourComponent />
    </ErrorBoundary>
  )
}
```

### Props

- `children` (ReactNode, required): Child components to wrap
- `fallback` (ReactNode, optional): Custom error UI
- `showDetails` (boolean, optional): Show error details (default: dev mode only)
- `onError` (function, optional): Callback when error is caught

### Features

✅ Automatic error reporting to bug reporter system
✅ User-friendly error UI with recovery options
✅ Stack trace display in development mode
✅ Component stack trace
✅ "Try Again" and "Go Home" buttons

---

## Configuration

### Environment Variables

Add these to your `.env.local` file:

```bash
# Bug Reporter Configuration (Required)
NEXT_PUBLIC_BUG_REPORTER_API_KEY=your_api_key_here
NEXT_PUBLIC_BUG_REPORTER_API_URL=https://your-bug-reporter-api.com

# Force enable bug reporter (Optional)
# Set to 'true' to enable for all users regardless of role
NEXT_PUBLIC_BUG_REPORTER_FORCE_ENABLE=false
```

### Allowed Roles

To customize which roles can see the bug reporter, edit the allowed roles in:

```tsx
// components/bug-reporter/bug-reporter-wrapper.tsx
const allowedRoles = ['admin', 'super_admin', 'beta-tester', 'developer']
```

---

## Best Practices

### 1. Error Reporting in Try-Catch Blocks

Always report caught errors that affect user experience:

```tsx
try {
  await criticalOperation()
} catch (error) {
  // Report the error
  await reportError(error, 'Critical operation failed')

  // Show user-friendly message
  toast.error('Something went wrong. Please try again.')
}
```

### 2. Add Context to Error Reports

Include relevant context for easier debugging:

```tsx
await reportException(error, {
  action: 'saveUserProfile',
  component: 'ProfileForm',
  userId: user.id,
  additionalInfo: {
    formData: sanitizedFormData,
    attemptNumber: retryCount
  }
})
```

### 3. Use Error Boundaries for Critical Sections

Wrap important sections of your app:

```tsx
<ErrorBoundary>
  <CriticalFeature />
</ErrorBoundary>
```

### 4. Don't Over-Report

Avoid reporting expected errors or validation failures:

```tsx
// ❌ Bad - Don't report validation errors
if (!formData.email) {
  await reportBug({ title: 'Email missing' })
}

// ✅ Good - Only report unexpected errors
try {
  await api.saveData(formData)
} catch (error) {
  if (error.status !== 400) { // Not a validation error
    await reportError(error)
  }
}
```

### 5. Sanitize Sensitive Data

Never include passwords, tokens, or sensitive data in bug reports:

```tsx
const sanitizedFormData = {
  ...formData,
  password: '[REDACTED]',
  token: '[REDACTED]'
}

await reportException(error, {
  additionalInfo: { formData: sanitizedFormData }
})
```

---

## Examples

### Example 1: Form Submission with Error Reporting

```tsx
import { useBugReporter } from '@/hooks'
import { useToast } from '@/hooks'

function FormComponent() {
  const { reportException } = useBugReporter()
  const { toast } = useToast()

  const handleSubmit = async (formData: FormData) => {
    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        throw new Error('Submission failed')
      }

      toast.success('Form submitted successfully!')
    } catch (error) {
      // Report error with context
      await reportException(error, {
        action: 'formSubmit',
        component: 'FormComponent',
        additionalInfo: {
          formType: 'userProfile',
          fieldCount: Object.keys(formData).length
        }
      })

      toast.error('Failed to submit form. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  )
}
```

### Example 2: API Error Interceptor

```tsx
// lib/api-client.ts
import { useBugReporter } from '@/hooks'

export async function apiCall(endpoint: string, options?: RequestInit) {
  const { reportException } = useBugReporter()

  try {
    const response = await fetch(endpoint, options)

    if (!response.ok) {
      const error = new Error(`API Error: ${response.status}`)

      // Report 5xx errors (server errors)
      if (response.status >= 500) {
        await reportException(error, {
          action: 'apiCall',
          additionalInfo: {
            endpoint,
            status: response.status,
            method: options?.method || 'GET'
          }
        })
      }

      throw error
    }

    return await response.json()
  } catch (error) {
    // Report network errors
    if (error instanceof TypeError) {
      await reportException(error, {
        action: 'apiCall',
        additionalInfo: {
          endpoint,
          errorType: 'NetworkError'
        }
      })
    }

    throw error
  }
}
```

### Example 3: Page-Level Error Boundary

```tsx
// app/coe/courses/page.tsx
import { ErrorBoundary } from '@/components/error-boundary'

export default function CoursesPage() {
  return (
    <ErrorBoundary>
      <CoursesPageContent />
    </ErrorBoundary>
  )
}

function CoursesPageContent() {
  // Your page content
  return <div>...</div>
}
```

---

## Troubleshooting

### Bug reporter not showing?

1. Check environment variables are set correctly
2. Verify user has an allowed role in production
3. Check browser console for errors
4. Set `NEXT_PUBLIC_BUG_REPORTER_FORCE_ENABLE=true` temporarily

### Errors not being reported?

1. Check `useBugReporter().isAvailable` returns `true`
2. Verify the API URL is correct
3. Check network requests in browser DevTools
4. Ensure bug reporter SDK is initialized

### Widget positioning issues?

1. Check for conflicting CSS styles
2. Verify `globals.css` has the bug reporter styles
3. Try increasing z-index if widget is hidden
4. Clear browser cache and rebuild

---

## Support

For issues or questions:

1. Check the [Bug Reporter SDK Documentation](https://github.com/boobalan-jkkn/bug-reporter-sdk)
2. File an issue on the project repository
3. Contact the development team

---

## Changelog

### v1.0.0 (2025-11-14)
- ✅ Custom widget styling with brand fonts
- ✅ Conditional rendering based on roles and environment
- ✅ `useBugReporter` hook for programmatic reporting
- ✅ `ErrorBoundary` component with automatic reporting
- ✅ Comprehensive documentation and examples
