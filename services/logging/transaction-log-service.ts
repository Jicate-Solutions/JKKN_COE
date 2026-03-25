/**
 * Transaction Log Service
 * Handles logging of user actions and transactions to the database
 */

export interface TransactionLogEntry {
	action: string
	resource_type?: string
	resource_id?: string
	old_values?: Record<string, unknown>
	new_values?: Record<string, unknown>
	metadata?: Record<string, unknown>
	status?: 'success' | 'error' | 'pending'
	error_message?: string
}

export interface TransactionLogResponse {
	success: boolean
	id?: string
	error?: string
}

class TransactionLogService {
	private baseUrl = '/api/transaction-logs'
	private queue: TransactionLogEntry[] = []
	private isProcessing = false
	private batchTimeout: NodeJS.Timeout | null = null
	private readonly BATCH_DELAY = 100 // ms to wait before sending batch
	private readonly MAX_BATCH_SIZE = 10

	/**
	 * Get user data and access token from localStorage (from parent app auth)
	 * access_token is used to lookup session in sessions table (where session_token = access_token)
	 */
	private getUserData(): { user_email: string | null; access_token: string | null } {
		if (typeof window === 'undefined') return { user_email: null, access_token: null }
		try {
			const userData = localStorage.getItem('user_data')
			const accessToken = localStorage.getItem('access_token')

			let userEmail: string | null = null
			if (userData) {
				const user = JSON.parse(userData)
				userEmail = user.email || null
			}

			return {
				user_email: userEmail,
				access_token: accessToken || null,
			}
		} catch {
			// Ignore parsing errors
		}
		return { user_email: null, access_token: null }
	}

	/**
	 * Log a transaction/action
	 */
	async log(entry: TransactionLogEntry): Promise<TransactionLogResponse> {
		try {
			const { user_email, access_token } = this.getUserData()
			const response = await fetch(this.baseUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...entry,
					user_email,
					access_token, // Used to lookup session by session_token
				}),
			})

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}))
				return {
					success: false,
					error: errorData.error || 'Failed to log transaction',
				}
			}

			const data = await response.json()
			return { success: true, id: data.id }
		} catch (error) {
			console.error('Transaction log error:', error)
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Network error',
			}
		}
	}

	/**
	 * Queue a log entry for batch processing (fire-and-forget)
	 * Use this for non-critical logs like navigation clicks
	 */
	queueLog(entry: TransactionLogEntry): void {
		this.queue.push(entry)

		// Clear existing timeout
		if (this.batchTimeout) {
			clearTimeout(this.batchTimeout)
		}

		// Process immediately if batch is full
		if (this.queue.length >= this.MAX_BATCH_SIZE) {
			this.processBatch()
			return
		}

		// Otherwise wait for more entries
		this.batchTimeout = setTimeout(() => {
			this.processBatch()
		}, this.BATCH_DELAY)
	}

	/**
	 * Process queued log entries
	 */
	private async processBatch(): Promise<void> {
		if (this.isProcessing || this.queue.length === 0) return

		this.isProcessing = true
		const batch = this.queue.splice(0, this.MAX_BATCH_SIZE)
		const { user_email, access_token } = this.getUserData()

		try {
			await fetch(`${this.baseUrl}/batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ entries: batch, user_email, access_token }),
			})
		} catch (error) {
			// Fire-and-forget - just log the error
			console.error('Batch log error:', error)
		} finally {
			this.isProcessing = false

			// Process remaining items
			if (this.queue.length > 0) {
				this.processBatch()
			}
		}
	}

	// ==================== Predefined Action Loggers ====================

	/**
	 * Log navigation/page view
	 */
	logNavigation(params: {
		from_path?: string
		to_path: string
		menu_title?: string
		menu_section?: string
	}): void {
		this.queueLog({
			action: 'navigation',
			resource_type: 'page',
			resource_id: params.to_path,
			metadata: {
				from_path: params.from_path,
				to_path: params.to_path,
				menu_title: params.menu_title,
				menu_section: params.menu_section,
				timestamp: new Date().toISOString(),
			},
			status: 'success',
		})
	}

	/**
	 * Log page view
	 */
	logPageView(path: string, title?: string): void {
		this.queueLog({
			action: 'page_view',
			resource_type: 'page',
			resource_id: path,
			metadata: {
				path,
				title,
				timestamp: new Date().toISOString(),
			},
			status: 'success',
		})
	}

	/**
	 * Log CRUD operations
	 */
	async logCreate(params: {
		resource_type: string
		resource_id: string
		new_values: Record<string, unknown>
		metadata?: Record<string, unknown>
	}): Promise<TransactionLogResponse> {
		return this.log({
			action: 'create',
			resource_type: params.resource_type,
			resource_id: params.resource_id,
			new_values: params.new_values,
			metadata: params.metadata,
			status: 'success',
		})
	}

	async logUpdate(params: {
		resource_type: string
		resource_id: string
		old_values: Record<string, unknown>
		new_values: Record<string, unknown>
		metadata?: Record<string, unknown>
	}): Promise<TransactionLogResponse> {
		return this.log({
			action: 'update',
			resource_type: params.resource_type,
			resource_id: params.resource_id,
			old_values: params.old_values,
			new_values: params.new_values,
			metadata: params.metadata,
			status: 'success',
		})
	}

	async logDelete(params: {
		resource_type: string
		resource_id: string
		old_values: Record<string, unknown>
		metadata?: Record<string, unknown>
	}): Promise<TransactionLogResponse> {
		return this.log({
			action: 'delete',
			resource_type: params.resource_type,
			resource_id: params.resource_id,
			old_values: params.old_values,
			metadata: params.metadata,
			status: 'success',
		})
	}

	/**
	 * Log button/action clicks
	 */
	logClick(params: {
		element: string
		action?: string
		metadata?: Record<string, unknown>
	}): void {
		this.queueLog({
			action: params.action || 'click',
			resource_type: 'ui_element',
			resource_id: params.element,
			metadata: {
				...params.metadata,
				timestamp: new Date().toISOString(),
			},
			status: 'success',
		})
	}

	/**
	 * Log search actions
	 */
	logSearch(params: {
		query: string
		resource_type: string
		results_count?: number
		filters?: Record<string, unknown>
	}): void {
		this.queueLog({
			action: 'search',
			resource_type: params.resource_type,
			metadata: {
				query: params.query,
				results_count: params.results_count,
				filters: params.filters,
				timestamp: new Date().toISOString(),
			},
			status: 'success',
		})
	}

	/**
	 * Log file operations (import/export)
	 */
	async logFileOperation(params: {
		operation: 'import' | 'export' | 'upload' | 'download'
		resource_type: string
		file_name?: string
		records_count?: number
		success_count?: number
		error_count?: number
		metadata?: Record<string, unknown>
	}): Promise<TransactionLogResponse> {
		return this.log({
			action: `file_${params.operation}`,
			resource_type: params.resource_type,
			metadata: {
				file_name: params.file_name,
				records_count: params.records_count,
				success_count: params.success_count,
				error_count: params.error_count,
				...params.metadata,
				timestamp: new Date().toISOString(),
			},
			status: params.error_count && params.error_count > 0 ? 'error' : 'success',
		})
	}

	/**
	 * Log errors
	 */
	async logError(params: {
		action: string
		resource_type?: string
		resource_id?: string
		error_message: string
		metadata?: Record<string, unknown>
	}): Promise<TransactionLogResponse> {
		return this.log({
			action: params.action,
			resource_type: params.resource_type,
			resource_id: params.resource_id,
			error_message: params.error_message,
			metadata: params.metadata,
			status: 'error',
		})
	}

	/**
	 * Log login/logout actions
	 */
	logAuth(action: 'login' | 'logout' | 'session_refresh' | 'session_expired'): void {
		this.queueLog({
			action: `auth_${action}`,
			resource_type: 'session',
			metadata: {
				timestamp: new Date().toISOString(),
			},
			status: 'success',
		})
	}
}

// Export singleton instance
export const transactionLogService = new TransactionLogService()
