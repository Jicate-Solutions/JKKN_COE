/**
 * Centralized Toast Notification Utilities
 *
 * Provides standardized toast notifications for all CRUD operations
 * with consistent styling and messaging across the application.
 *
 * Color Scheme:
 * - Success (Green): Successful operations
 * - Warning (Yellow): Partial success or validation warnings
 * - Error (Red): Failed operations or errors
 */

import { toast } from '@/components/ui/use-toast'

// Toast style configurations
export const TOAST_STYLES = {
	success: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
	warning: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
	error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
	info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200'
}

// Toast duration configurations (in milliseconds)
export const TOAST_DURATION = {
	short: 3000,
	normal: 5000,
	long: 6000,
	veryLong: 8000
}

// Operation type for dynamic messaging
export type OperationType = 'create' | 'update' | 'delete' | 'upload' | 'export' | 'import'

// Toast configuration interface
interface ToastConfig {
	title: string
	description?: string
	variant?: 'default' | 'destructive'
	className?: string
	duration?: number
}

/**
 * Show success toast for CRUD operations
 */
export const showSuccessToast = (
	operation: OperationType,
	entityName: string,
	details?: string | { count?: number; total?: number }
) => {
	const titles: Record<OperationType, string> = {
		create: '✅ Created Successfully',
		update: '✅ Updated Successfully',
		delete: '✅ Deleted Successfully',
		upload: '✅ Upload Complete',
		export: '✅ Export Complete',
		import: '✅ Import Complete'
	}

	let description = ''

	if (typeof details === 'object' && details.count !== undefined) {
		// For bulk operations
		const count = details.count
		const total = details.total
		description = `Successfully processed ${count} ${entityName}${count > 1 ? 's' : ''}${total ? ` out of ${total}` : ''}.`
	} else if (details) {
		// For custom description
		description = details
	} else {
		// Default descriptions
		const descriptions: Record<OperationType, string> = {
			create: `${entityName} has been created successfully.`,
			update: `${entityName} has been updated successfully.`,
			delete: `${entityName} has been deleted successfully.`,
			upload: `All ${entityName}s have been uploaded successfully.`,
			export: `${entityName}s have been exported successfully.`,
			import: `${entityName}s have been imported successfully.`
		}
		description = descriptions[operation]
	}

	toast({
		title: titles[operation],
		description,
		className: TOAST_STYLES.success,
		duration: TOAST_DURATION.normal
	})
}

/**
 * Show warning toast for validation or partial success
 */
export const showWarningToast = (
	title: string = '⚠️ Warning',
	description: string,
	duration?: number
) => {
	toast({
		title,
		description,
		className: TOAST_STYLES.warning,
		duration: duration || TOAST_DURATION.long
	})
}

/**
 * Show error toast for failed operations
 */
export const showErrorToast = (
	error: unknown,
	operation?: OperationType,
	entityName?: string
) => {
	// Extract error message
	let errorMessage = 'An unexpected error occurred. Please try again.'

	if (error instanceof Error) {
		errorMessage = error.message
	} else if (typeof error === 'string') {
		errorMessage = error
	} else if (error && typeof error === 'object' && 'message' in error) {
		errorMessage = (error as any).message
	}

	// Enhance error message based on content
	if (errorMessage.toLowerCase().includes('duplicate') || errorMessage.toLowerCase().includes('already exists')) {
		errorMessage = `This ${entityName || 'record'} already exists. Please use different values.`
	} else if (errorMessage.toLowerCase().includes('foreign key') || errorMessage.toLowerCase().includes('reference')) {
		errorMessage = `Invalid reference. Please ensure all selected values exist in the system.`
	} else if (errorMessage.toLowerCase().includes('required') || errorMessage.toLowerCase().includes('missing')) {
		errorMessage = `Please fill in all required fields.`
	} else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch')) {
		errorMessage = `Network error. Please check your connection and try again.`
	}

	// Determine title based on operation
	let title = '❌ Error'
	if (operation && entityName) {
		const titles: Record<OperationType, string> = {
			create: `❌ Failed to Create ${entityName}`,
			update: `❌ Failed to Update ${entityName}`,
			delete: `❌ Failed to Delete ${entityName}`,
			upload: '❌ Upload Failed',
			export: '❌ Export Failed',
			import: '❌ Import Failed'
		}
		title = titles[operation]
	}

	toast({
		title,
		description: errorMessage,
		variant: 'destructive',
		className: TOAST_STYLES.error,
		duration: TOAST_DURATION.long
	})
}

/**
 * Show validation error toast
 */
export const showValidationToast = (
	errors?: string[] | Record<string, string>,
	customMessage?: string
) => {
	let description = customMessage || 'Please fix all validation errors before submitting.'

	if (Array.isArray(errors) && errors.length > 0) {
		description = errors.join(', ')
	} else if (errors && typeof errors === 'object') {
		const errorMessages = Object.values(errors).filter(Boolean)
		if (errorMessages.length > 0) {
			description = errorMessages.length === 1
				? errorMessages[0]
				: `Please fix ${errorMessages.length} validation errors.`
		}
	}

	toast({
		title: '⚠️ Validation Error',
		description,
		variant: 'destructive',
		className: TOAST_STYLES.error,
		duration: TOAST_DURATION.normal
	})
}

/**
 * Show info toast for general information
 */
export const showInfoToast = (
	title: string,
	description: string,
	duration?: number
) => {
	toast({
		title,
		description,
		className: TOAST_STYLES.info,
		duration: duration || TOAST_DURATION.normal
	})
}

/**
 * Show upload summary toast with detailed counts
 */
export const showUploadSummaryToast = (
	total: number,
	success: number,
	failed: number,
	entityName: string
) => {
	if (success > 0 && failed === 0) {
		// All successful
		showSuccessToast('upload', entityName, {
			count: success,
			total
		})
	} else if (success > 0 && failed > 0) {
		// Partial success
		showWarningToast(
			'⚠️ Partial Upload Success',
			`Processed ${total} row${total > 1 ? 's' : ''}: ${success} successful, ${failed} failed. View error details below.`,
			TOAST_DURATION.long
		)
	} else if (failed > 0) {
		// All failed
		toast({
			title: '❌ Upload Failed',
			description: `Processed ${total} row${total > 1 ? 's' : ''}: 0 successful, ${failed} failed. View error details below.`,
			variant: 'destructive',
			className: TOAST_STYLES.error,
			duration: TOAST_DURATION.long
		})
	}
}

/**
 * Show delete confirmation toast
 */
export const showDeleteConfirmationToast = (entityName: string) => {
	showInfoToast(
		'🗑️ Ready to Delete',
		`Click confirm to permanently delete this ${entityName}.`,
		TOAST_DURATION.short
	)
}

/**
 * Show loading/processing toast
 */
export const showProcessingToast = (message: string = 'Processing...') => {
	toast({
		title: '⏳ ' + message,
		className: TOAST_STYLES.info,
		duration: TOAST_DURATION.veryLong
	})
}

/**
 * Handle API response and show appropriate toast
 */
export const handleApiResponse = async (
	response: Response,
	operation: OperationType,
	entityName: string,
	successCallback?: () => void
) => {
	try {
		if (response.ok) {
			const data = await response.json()
			showSuccessToast(operation, entityName)
			successCallback?.()
			return { success: true, data }
		} else {
			const errorData = await response.json().catch(() => ({}))
			const errorMessage = errorData.error || errorData.message || `Failed to ${operation} ${entityName}`
			showErrorToast(errorMessage, operation, entityName)
			return { success: false, error: errorMessage }
		}
	} catch (error) {
		showErrorToast(error, operation, entityName)
		return { success: false, error }
	}
}

/**
 * Wrapper for form submission with toast handling
 */
export const withToastHandler = async (
	operation: () => Promise<void>,
	options: {
		operation: OperationType
		entityName: string
		onSuccess?: () => void
		onError?: (error: unknown) => void
	}
) => {
	try {
		await operation()
		showSuccessToast(options.operation, options.entityName)
		options.onSuccess?.()
	} catch (error) {
		showErrorToast(error, options.operation, options.entityName)
		options.onError?.(error)
	}
}