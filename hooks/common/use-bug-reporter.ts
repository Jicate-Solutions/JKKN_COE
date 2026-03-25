import { useBugReporter as useSDKBugReporter } from '@boobalan_jkkn/bug-reporter-sdk'
import { useCallback } from 'react'

interface BugReportOptions {
	title: string
	description: string
	category?: 'bug' | 'error' | 'feature' | 'feedback' | 'other'
	page_url?: string
	console_logs?: string[]
	severity?: 'low' | 'medium' | 'high' | 'critical'
	metadata?: Record<string, any>
}

/**
 * Custom hook for programmatic bug reporting
 *
 * @example
 * ```tsx
 * const { reportBug, reportError, isReporting } = useBugReporter()
 *
 * // Report an error
 * try {
 *   // Some code that might throw
 * } catch (error) {
 *   await reportError(error, 'Failed to load data')
 * }
 *
 * // Report a bug manually
 * await reportBug({
 *   title: 'Button not responding',
 *   description: 'The submit button is not responding to clicks',
 *   category: 'bug',
 *   severity: 'medium'
 * })
 * ```
 */
export function useBugReporter() {
	const { apiClient } = useSDKBugReporter()

	/**
	 * Report a bug with detailed information
	 */
	const reportBug = useCallback(
		async (options: BugReportOptions) => {
			if (!apiClient) {
				console.warn('Bug reporter API client not available')
				return { success: false, error: 'API client not initialized' }
			}

			try {
				const report = {
					title: options.title,
					description: options.description,
					page_url: options.page_url || window.location.href,
					category: options.category || 'bug',
					console_logs: options.console_logs || [],
					severity: options.severity,
					metadata: options.metadata
				}

				await apiClient.createBugReport(report)
				return { success: true }
			} catch (error) {
				console.error('Failed to report bug:', error)
				return {
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				}
			}
		},
		[apiClient]
	)

	/**
	 * Report an error with automatic context extraction
	 */
	const reportError = useCallback(
		async (error: Error | unknown, customTitle?: string) => {
			const errorMessage = error instanceof Error ? error.message : String(error)
			const errorStack = error instanceof Error ? error.stack : undefined

			const description = errorStack
				? `${errorMessage}\n\nStack Trace:\n${errorStack}`
				: errorMessage

			return reportBug({
				title: customTitle || `Error: ${errorMessage}`,
				description,
				category: 'error',
				severity: 'high',
				metadata: {
					errorName: error instanceof Error ? error.name : 'UnknownError',
					timestamp: new Date().toISOString()
				}
			})
		},
		[reportBug]
	)

	/**
	 * Report a caught exception with additional context
	 */
	const reportException = useCallback(
		async (
			error: Error | unknown,
			context: {
				action?: string
				component?: string
				userId?: string
				additionalInfo?: Record<string, any>
			} = {}
		) => {
			const errorMessage = error instanceof Error ? error.message : String(error)
			const errorStack = error instanceof Error ? error.stack : undefined

			const contextInfo = [
				context.action && `Action: ${context.action}`,
				context.component && `Component: ${context.component}`,
				context.userId && `User ID: ${context.userId}`
			]
				.filter(Boolean)
				.join('\n')

			const description = [
				errorMessage,
				errorStack && `\nStack Trace:\n${errorStack}`,
				contextInfo && `\nContext:\n${contextInfo}`,
				context.additionalInfo &&
					`\nAdditional Info:\n${JSON.stringify(context.additionalInfo, null, 2)}`
			]
				.filter(Boolean)
				.join('\n')

			return reportBug({
				title: context.action
					? `Exception in ${context.action}: ${errorMessage}`
					: `Exception: ${errorMessage}`,
				description,
				category: 'error',
				severity: 'high',
				metadata: {
					...context.additionalInfo,
					errorName: error instanceof Error ? error.name : 'UnknownError',
					timestamp: new Date().toISOString(),
					userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined
				}
			})
		},
		[reportBug]
	)

	return {
		reportBug,
		reportError,
		reportException,
		isAvailable: !!apiClient
	}
}
