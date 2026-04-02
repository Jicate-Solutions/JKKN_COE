// API Key Management type definitions

// =====================================================
// Constants
// =====================================================

export const API_MODULES = [
	'results',
	'registrations',
	'marks',
	'learners',
	'timetables',
	'courses',
] as const

export const API_OPERATIONS = [
	'read',
	'create',
	'update',
	'delete',
] as const

// =====================================================
// Union Types
// =====================================================

export type ApiModule = typeof API_MODULES[number]
export type ApiOperation = typeof API_OPERATIONS[number]

// =====================================================
// api_applications
// =====================================================

export interface ApiApplication {
	id: string
	name: string
	description?: string | null
	owner?: string | null
	allowed_domains: string[]
	status: 'active' | 'suspended'
	institutions_id?: string | null
	institution_code?: string | null
	created_by?: string | null
	created_at: string
	updated_at: string
}

export interface ApiApplicationFormData {
	name: string
	description?: string
	owner?: string
	allowed_domains: string[]
	status: 'active' | 'suspended'
	institutions_id?: string
	institution_code?: string
}

// =====================================================
// api_keys
// =====================================================

export interface ApiKey {
	id: string
	app_id: string
	access_key_id: string
	secret_key_hash: string
	key_name: string
	status: 'active' | 'revoked' | 'expired'
	expires_at?: string | null
	last_used_at?: string | null
	created_by?: string | null
	created_at: string
}

export interface ApiKeyCreateResponse {
	id: string
	app_id: string
	access_key_id: string
	secret_key: string
	key_name: string
	expires_at?: string | null
	created_at: string
}

export interface ApiKeyFormData {
	app_id: string
	key_name: string
	expires_at?: string
}

// =====================================================
// api_permissions
// =====================================================

export interface ApiPermission {
	id: string
	app_id: string
	module: ApiModule
	operation: ApiOperation
	institution_id?: string | null
	created_at: string
}

export interface ApiPermissionFormData {
	app_id: string
	module: ApiModule
	operation: ApiOperation
	institution_id?: string
}

// =====================================================
// api_audit_logs
// =====================================================

export interface ApiAuditLog {
	id: string
	app_id?: string | null
	access_key_id?: string | null
	method: string
	endpoint: string
	query_params?: Record<string, unknown> | null
	request_body?: Record<string, unknown> | null
	response_status?: number | null
	response_time_ms?: number | null
	ip_address?: string | null
	origin?: string | null
	user_agent?: string | null
	error_message?: string | null
	created_at: string
}

export interface AuditLogFilters {
	app_id?: string
	access_key_id?: string
	method?: string
	endpoint?: string
	response_status?: number
	start_date?: string
	end_date?: string
	search?: string
}

// =====================================================
// api_key_events
// =====================================================

export interface ApiKeyEvent {
	id: string
	key_id: string
	event_type: 'created' | 'revoked' | 'regenerated' | 'expired'
	performed_by?: string | null
	metadata?: Record<string, unknown> | null
	created_at: string
}

// =====================================================
// External API Context (attached to authenticated requests)
// =====================================================

export interface ExternalApiContext {
	appId: string
	appName: string
	accessKeyId: string
	allowedDomains: string[]
	institutionsId?: string | null
	institutionCode?: string | null
	allowedModules: ApiPermission[]
	/** Institution IDs the app may access. Empty array = all institutions. */
	allowedInstitutionIds: string[]
	requestId: string
}

// =====================================================
// External API Response Types
// =====================================================

export interface ExternalApiErrorResponse {
	error: string
	code: string
	request_id?: string
	details?: Record<string, unknown>
}

export interface ExternalApiSuccessResponse<T> {
	data: T
	request_id: string
	total?: number
	metadata?: Record<string, unknown>
}
