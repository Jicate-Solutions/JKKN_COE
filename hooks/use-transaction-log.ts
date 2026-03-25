'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { transactionLogService, TransactionLogEntry } from '@/services/logging/transaction-log-service'

interface UseTransactionLogOptions {
	trackPageViews?: boolean
}

/**
 * Hook for transaction logging with automatic user context
 */
export function useTransactionLog(options: UseTransactionLogOptions = {}) {
	const { trackPageViews = false } = options
	const { user } = useAuth()
	const pathname = usePathname()
	const lastPathRef = useRef<string>('')

	// Track page views automatically if enabled
	useEffect(() => {
		if (trackPageViews && pathname && pathname !== lastPathRef.current) {
			const fromPath = lastPathRef.current
			lastPathRef.current = pathname

			// Don't log initial page load as navigation (no from_path)
			if (fromPath) {
				transactionLogService.logNavigation({
					from_path: fromPath,
					to_path: pathname,
				})
			} else {
				transactionLogService.logPageView(pathname)
			}
		}
	}, [pathname, trackPageViews])

	/**
	 * Log a navigation event
	 */
	const logNavigation = useCallback((params: {
		from_path?: string
		to_path: string
		menu_title?: string
		menu_section?: string
	}) => {
		transactionLogService.logNavigation(params)
	}, [])

	/**
	 * Log a page view
	 */
	const logPageView = useCallback((path: string, title?: string) => {
		transactionLogService.logPageView(path, title)
	}, [])

	/**
	 * Log a create operation
	 */
	const logCreate = useCallback(async (params: {
		resource_type: string
		resource_id: string
		new_values: Record<string, unknown>
		metadata?: Record<string, unknown>
	}) => {
		return transactionLogService.logCreate(params)
	}, [])

	/**
	 * Log an update operation
	 */
	const logUpdate = useCallback(async (params: {
		resource_type: string
		resource_id: string
		old_values: Record<string, unknown>
		new_values: Record<string, unknown>
		metadata?: Record<string, unknown>
	}) => {
		return transactionLogService.logUpdate(params)
	}, [])

	/**
	 * Log a delete operation
	 */
	const logDelete = useCallback(async (params: {
		resource_type: string
		resource_id: string
		old_values: Record<string, unknown>
		metadata?: Record<string, unknown>
	}) => {
		return transactionLogService.logDelete(params)
	}, [])

	/**
	 * Log a button/action click
	 */
	const logClick = useCallback((params: {
		element: string
		action?: string
		metadata?: Record<string, unknown>
	}) => {
		transactionLogService.logClick(params)
	}, [])

	/**
	 * Log a search action
	 */
	const logSearch = useCallback((params: {
		query: string
		resource_type: string
		results_count?: number
		filters?: Record<string, unknown>
	}) => {
		transactionLogService.logSearch(params)
	}, [])

	/**
	 * Log file operations
	 */
	const logFileOperation = useCallback(async (params: {
		operation: 'import' | 'export' | 'upload' | 'download'
		resource_type: string
		file_name?: string
		records_count?: number
		success_count?: number
		error_count?: number
		metadata?: Record<string, unknown>
	}) => {
		return transactionLogService.logFileOperation(params)
	}, [])

	/**
	 * Log an error
	 */
	const logError = useCallback(async (params: {
		action: string
		resource_type?: string
		resource_id?: string
		error_message: string
		metadata?: Record<string, unknown>
	}) => {
		return transactionLogService.logError(params)
	}, [])

	/**
	 * Log auth events
	 */
	const logAuth = useCallback((action: 'login' | 'logout' | 'session_refresh' | 'session_expired') => {
		transactionLogService.logAuth(action)
	}, [])

	/**
	 * Generic log function for custom actions
	 */
	const log = useCallback(async (entry: TransactionLogEntry) => {
		return transactionLogService.log(entry)
	}, [])

	/**
	 * Queue a log entry (fire-and-forget)
	 */
	const queueLog = useCallback((entry: TransactionLogEntry) => {
		transactionLogService.queueLog(entry)
	}, [])

	return {
		logNavigation,
		logPageView,
		logCreate,
		logUpdate,
		logDelete,
		logClick,
		logSearch,
		logFileOperation,
		logError,
		logAuth,
		log,
		queueLog,
		user,
	}
}

/**
 * Simple hook for just navigation logging
 */
export function useNavigationLog() {
	const pathname = usePathname()
	const lastPathRef = useRef<string>('')

	const logNavigation = useCallback((params: {
		to_path: string
		menu_title?: string
		menu_section?: string
	}) => {
		transactionLogService.logNavigation({
			from_path: lastPathRef.current || pathname,
			...params,
		})
	}, [pathname])

	// Update last path when pathname changes
	useEffect(() => {
		if (pathname !== lastPathRef.current) {
			lastPathRef.current = pathname
		}
	}, [pathname])

	return { logNavigation }
}
