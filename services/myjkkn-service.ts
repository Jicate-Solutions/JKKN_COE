/**
 * MyJKKN API Service Layer
 *
 * Provides functions to fetch data from the MyJKKN external API (jkkn.ai)
 * Following the 5-layer architecture pattern
 */

import type {
	MyJKKNPaginatedResponse,
	MyJKKNInstitution,
	MyJKKNDepartment,
	MyJKKNProgram,
	MyJKKNDegree,
	MyJKKNCourse,
	MyJKKNSemester,
	MyJKKNStudent,
	MyJKKNStaff,
	MyJKKNRegulation,
	MyJKKNBatch,
	MyJKKNAcademicYear,
	MyJKKNLearnerProfile,
	MyJKKNInstitutionFetchOptions,
	MyJKKNDepartmentFetchOptions,
	MyJKKNProgramFetchOptions,
	MyJKKNDegreeFetchOptions,
	MyJKKNCourseFetchOptions,
	MyJKKNSemesterFetchOptions,
	MyJKKNStudentFetchOptions,
	MyJKKNStaffFetchOptions,
	MyJKKNRegulationFetchOptions,
	MyJKKNBatchFetchOptions,
	MyJKKNAcademicYearFetchOptions,
	MyJKKNLearnerProfileFetchOptions,
	MyJKKNBaseFetchOptions,
	MYJKKN_API_ENDPOINTS,
} from '@/types/myjkkn'

// =====================================================
// CONFIGURATION
// =====================================================

function getBaseUrl(): string {
	return process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
}

function getApiKey(): string {
	return process.env.MYJKKN_API_KEY || ''
}

// =====================================================
// ERROR CLASS
// =====================================================

export class MyJKKNApiError extends Error {
	status: number
	details?: unknown

	constructor(message: string, status: number, details?: unknown) {
		super(message)
		this.name = 'MyJKKNApiError'
		this.status = status
		this.details = details
	}
}

// =====================================================
// CORE FETCH FUNCTION
// =====================================================

const MYJKKN_FETCH_TIMEOUT_MS = Number(process.env.MYJKKN_FETCH_TIMEOUT_MS) || 30000 // per-attempt timeout; MyJKKN takes >10s under load
const MYJKKN_TRANSPORT_RETRIES = 1 // extra attempts on timeout / network failure (each one already burned a full timeout)
const MYJKKN_SERVER_ERROR_RETRIES = 3 // extra attempts on 5xx — MyJKKN answers concurrent load with transient 500s
const MYJKKN_RETRY_BASE_MS = 500 // backoff doubles per retry: 500ms, 1s, 2s

async function fetchFromMyJKKN<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
	const apiKey = getApiKey()
	if (!apiKey) {
		throw new MyJKKNApiError('MYJKKN_API_KEY not configured in environment', 500)
	}

	// Build URL with query parameters
	const url = new URL(`${getBaseUrl()}${endpoint}`)
	if (params) {
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined && value !== null && value !== '') {
				url.searchParams.append(key, String(value))
			}
		})
	}

	let attempt = 0
	let transportRetries = 0
	let serverErrorRetries = 0

	for (;;) {
		if (attempt === 0) {
			console.log(`[MyJKKN API] Fetching: ${url.toString()}`)
		} else {
			const backoff = MYJKKN_RETRY_BASE_MS * 2 ** (attempt - 1)
			console.warn(`[MyJKKN API] Retry ${attempt} in ${backoff}ms: ${endpoint}`)
			await new Promise(resolve => setTimeout(resolve, backoff))
		}
		attempt++

		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), MYJKKN_FETCH_TIMEOUT_MS)

		try {
			const response = await fetch(url.toString(), {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Accept': 'application/json',
					'Content-Type': 'application/json',
				},
				cache: 'no-store',
				signal: controller.signal,
			})

			if (!response.ok) {
				const errorBody = await response.json().catch(() => ({}))
				console.error(`[MyJKKN API] Error ${response.status}:`, errorBody)
				if (response.status >= 500 && serverErrorRetries < MYJKKN_SERVER_ERROR_RETRIES) {
					serverErrorRetries++
					continue
				}
				throw new MyJKKNApiError(
					errorBody.message || errorBody.error || `API Error: ${response.status}`,
					response.status,
					errorBody
				)
			}

			const data = await response.json()
			console.log(`[MyJKKN API] Success: ${endpoint} - ${data.metadata?.total || data.data?.length || 0} records`)

			return data
		} catch (error) {
			if (error instanceof MyJKKNApiError) throw error
			if (error instanceof Error && error.name === 'AbortError') {
				console.error(`[MyJKKN API] Timed out after ${MYJKKN_FETCH_TIMEOUT_MS / 1000}s (attempt ${attempt}): ${endpoint}`)
				if (transportRetries < MYJKKN_TRANSPORT_RETRIES) {
					transportRetries++
					continue
				}
				throw new MyJKKNApiError(
					`MyJKKN API request timed out after ${MYJKKN_FETCH_TIMEOUT_MS / 1000}s: ${endpoint}`,
					504
				)
			}
			// Network-level failure (DNS, connection reset, ...) — retry once
			if (transportRetries < MYJKKN_TRANSPORT_RETRIES) {
				transportRetries++
				console.error(`[MyJKKN API] Network error (attempt ${attempt}): ${endpoint}`, error)
				continue
			}
			throw error
		} finally {
			clearTimeout(timeout)
		}
	}
}

// =====================================================
// HELPER: FETCH ALL PAGES
// =====================================================

async function fetchAllPages<T>(
	fetchFn: (options: MyJKKNBaseFetchOptions) => Promise<MyJKKNPaginatedResponse<T>>,
	options: MyJKKNBaseFetchOptions = {}
): Promise<T[]> {
	const allData: T[] = []
	let page = 1
	let totalPages = 1
	const limit = options.limit || 100
	let effectiveLimit = limit // the server may silently cap page size below what we ask for
	const MAX_PAGES = 50  // Safety limit to prevent infinite loops

	do {
		console.log(`[fetchAllPages] Fetching page ${page}...`)
		const response = await fetchFn({ ...options, page, limit, all: false })

		// Handle response.data - might be array or nested
		const pageData = Array.isArray(response.data) ? response.data : []
		allData.push(...pageData)

		console.log(`[fetchAllPages] Page ${page} returned ${pageData.length} records (total so far: ${allData.length})`)

		// Safety check: if we got no data, stop
		if (pageData.length === 0) {
			console.log(`[fetchAllPages] Got 0 records, stopping pagination`)
			break
		}

		const total = typeof response.metadata?.total === 'number' ? response.metadata.total : undefined

		// Some endpoints silently cap page size below the limit we ask for (learner
		// profiles cap at 200). Learn the real page size from page 1 so that a short
		// page keeps meaning "end of results" rather than "capped".
		if (page === 1 && pageData.length < effectiveLimit && total !== undefined && total > pageData.length) {
			effectiveLimit = pageData.length
			console.log(`[fetchAllPages] Server capped page size at ${effectiveLimit} (requested ${limit}, total ${total})`)
		}

		// Stop as soon as we hold everything the server says exists.
		if (total !== undefined && allData.length >= total) {
			console.log(`[fetchAllPages] Have all ${total} records, stopping`)
			break
		}

		// A short page is the end of the result set, whatever the metadata claims.
		// MyJKKN's metadata.totalPages is not trustworthy — /organizations/institutions
		// reports totalPages 2 for 14 records — and requesting the phantom page answers
		// 500 every time, which would abort the whole sweep.
		if (pageData.length < effectiveLimit) {
			console.log(`[fetchAllPages] Page ${page} returned ${pageData.length} < page size ${effectiveLimit} — last page, stopping`)
			break
		}

		// Full page — work out whether to expect another
		if (typeof response.metadata?.totalPages === 'number') {
			totalPages = response.metadata.totalPages
			console.log(`[fetchAllPages] Using metadata.totalPages: ${totalPages}`)
		} else if (total !== undefined) {
			totalPages = Math.ceil(total / effectiveLimit) || 1
			console.log(`[fetchAllPages] Calculated totalPages from total: ${totalPages} (total: ${total}, page size: ${effectiveLimit})`)
		} else {
			// No metadata - a full page means there may be another
			totalPages = page + 1
			console.log(`[fetchAllPages] No metadata, got full page (${pageData.length}), will try page ${page + 1}`)
		}

		page++

		// Safety limit to prevent infinite loops
		if (page > MAX_PAGES) {
			console.warn(`[fetchAllPages] Reached max pages limit (${MAX_PAGES}), stopping`)
			break
		}
	} while (page <= totalPages)

	console.log(`[fetchAllPages] Complete! Fetched ${allData.length} total records across ${page - 1} pages`)
	return allData
}

// =====================================================
// INSTITUTIONS
// =====================================================

export async function fetchMyJKKNInstitutions(
	options: MyJKKNInstitutionFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNInstitution>> {
	const { page = 1, limit = 10, search, is_active } = options

	return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNInstitution>>(
		'/api-management/organizations/institutions',
		{ page, limit, search, is_active }
	)
}

export async function fetchAllMyJKKNInstitutions(
	options: MyJKKNInstitutionFetchOptions = {}
): Promise<MyJKKNInstitution[]> {
	if (options.all) {
		return fetchAllPages<MyJKKNInstitution>(fetchMyJKKNInstitutions, options)
	}
	const response = await fetchMyJKKNInstitutions(options)
	return response.data
}

// =====================================================
// DEPARTMENTS
// =====================================================

export async function fetchMyJKKNDepartments(
	options: MyJKKNDepartmentFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNDepartment>> {
	const { page = 1, limit = 10, search, is_active, institution_id, institution_code } = options

	return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNDepartment>>(
		'/api-management/organizations/departments',
		{ page, limit, search, is_active, institution_id, institution_code }
	)
}

export async function fetchAllMyJKKNDepartments(
	options: MyJKKNDepartmentFetchOptions = {}
): Promise<MyJKKNDepartment[]> {
	if (options.all) {
		return fetchAllPages<MyJKKNDepartment>(fetchMyJKKNDepartments, options)
	}
	const response = await fetchMyJKKNDepartments(options)
	return response.data
}

// =====================================================
// PROGRAMS
// =====================================================

export async function fetchMyJKKNPrograms(
	options: MyJKKNProgramFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNProgram>> {
	const { page = 1, limit = 10, search, is_active, institution_id, institution_code, department_id, department_code, degree_id, degree_code } = options

	return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNProgram>>(
		'/api-management/organizations/programs',
		{ page, limit, search, is_active, institution_id, institution_code, department_id, department_code, degree_id, degree_code }
	)
}

export async function fetchAllMyJKKNPrograms(
	options: MyJKKNProgramFetchOptions = {}
): Promise<MyJKKNProgram[]> {
	if (options.all) {
		return fetchAllPages<MyJKKNProgram>(fetchMyJKKNPrograms, options)
	}
	const response = await fetchMyJKKNPrograms(options)
	return response.data
}

// =====================================================
// DEGREES
// =====================================================

export async function fetchMyJKKNDegrees(
	options: MyJKKNDegreeFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNDegree>> {
	const { page = 1, limit = 10, search, is_active, institution_id, institution_code, degree_level } = options

	return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNDegree>>(
		'/api-management/organizations/degrees',
		{ page, limit, search, is_active, institution_id, institution_code, degree_level }
	)
}

export async function fetchAllMyJKKNDegrees(
	options: MyJKKNDegreeFetchOptions = {}
): Promise<MyJKKNDegree[]> {
	if (options.all) {
		return fetchAllPages<MyJKKNDegree>(fetchMyJKKNDegrees, options)
	}
	const response = await fetchMyJKKNDegrees(options)
	return response.data
}

// =====================================================
// COURSES
// =====================================================

export async function fetchMyJKKNCourses(
	options: MyJKKNCourseFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNCourse>> {
	const { page = 1, limit = 10, search, is_active, institution_id, institution_code, department_id, department_code, course_type } = options

	return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNCourse>>(
		'/api-management/organizations/courses',
		{ page, limit, search, is_active, institution_id, institution_code, department_id, department_code, course_type }
	)
}

export async function fetchAllMyJKKNCourses(
	options: MyJKKNCourseFetchOptions = {}
): Promise<MyJKKNCourse[]> {
	if (options.all) {
		return fetchAllPages<MyJKKNCourse>(fetchMyJKKNCourses, options)
	}
	const response = await fetchMyJKKNCourses(options)
	return response.data
}

// =====================================================
// SEMESTERS
// =====================================================

export async function fetchMyJKKNSemesters(
	options: MyJKKNSemesterFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNSemester>> {
	const { page = 1, limit = 10, search, is_active, institution_id, institution_code, program_id, program_code } = options

	return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNSemester>>(
		'/api-management/organizations/semesters',
		{ page, limit, search, is_active, institution_id, institution_code, program_id, program_code }
	)
}

export async function fetchAllMyJKKNSemesters(
	options: MyJKKNSemesterFetchOptions = {}
): Promise<MyJKKNSemester[]> {
	if (options.all) {
		return fetchAllPages<MyJKKNSemester>(fetchMyJKKNSemesters, options)
	}
	const response = await fetchMyJKKNSemesters(options)
	return response.data
}

// =====================================================
// STUDENTS
// =====================================================

export async function fetchMyJKKNStudents(
	options: MyJKKNStudentFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNStudent>> {
	const { page = 1, limit = 10, search, is_active, institution_id, institution_code, program_id, program_code, department_id, department_code, batch_id, current_semester, admission_year } = options

	return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNStudent>>(
		'/api-management/students',
		{ page, limit, search, is_active, institution_id, institution_code, program_id, program_code, department_id, department_code, batch_id, current_semester, admission_year }
	)
}

export async function fetchAllMyJKKNStudents(
	options: MyJKKNStudentFetchOptions = {}
): Promise<MyJKKNStudent[]> {
	if (options.all) {
		return fetchAllPages<MyJKKNStudent>(fetchMyJKKNStudents, options)
	}
	const response = await fetchMyJKKNStudents(options)
	return response.data
}

export async function fetchMyJKKNStudentById(id: string): Promise<MyJKKNStudent> {
	const response = await fetchFromMyJKKN<{ data: MyJKKNStudent }>(`/api-management/students/${id}`)
	return response.data
}

// =====================================================
// STAFF
// =====================================================

export async function fetchMyJKKNStaff(
	options: MyJKKNStaffFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNStaff>> {
	const { page = 1, limit = 10, search, is_active, institution_id, institution_code, department_id, department_code, designation } = options

	return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNStaff>>(
		'/api-management/staff',
		{ page, limit, search, is_active, institution_id, institution_code, department_id, department_code, designation }
	)
}

export async function fetchAllMyJKKNStaff(
	options: MyJKKNStaffFetchOptions = {}
): Promise<MyJKKNStaff[]> {
	if (options.all) {
		return fetchAllPages<MyJKKNStaff>(fetchMyJKKNStaff, options)
	}
	const response = await fetchMyJKKNStaff(options)
	return response.data
}

export async function fetchMyJKKNStaffById(id: string): Promise<MyJKKNStaff> {
	const response = await fetchFromMyJKKN<{ data: MyJKKNStaff }>(`/api-management/staff/${id}`)
	return response.data
}

// =====================================================
// REGULATIONS
// =====================================================

export async function fetchMyJKKNRegulations(
	options: MyJKKNRegulationFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNRegulation>> {
	const { page = 1, limit = 10, search, is_active, institution_id, institution_code, effective_year } = options

	return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNRegulation>>(
		'/api-management/academic/regulations',
		{ page, limit, search, is_active, institution_id, institution_code, effective_year }
	)
}

export async function fetchAllMyJKKNRegulations(
	options: MyJKKNRegulationFetchOptions = {}
): Promise<MyJKKNRegulation[]> {
	if (options.all) {
		return fetchAllPages<MyJKKNRegulation>(fetchMyJKKNRegulations, options)
	}
	const response = await fetchMyJKKNRegulations(options)
	return response.data
}

// =====================================================
// BATCHES
// =====================================================

export async function fetchMyJKKNBatches(
	options: MyJKKNBatchFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNBatch>> {
	const { page = 1, limit = 10, search, is_active, institution_id, institution_code, program_id, program_code, regulation_id, regulation_code, start_year } = options

	return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNBatch>>(
		'/api-management/academic/batches',
		{ page, limit, search, is_active, institution_id, institution_code, program_id, program_code, regulation_id, regulation_code, start_year }
	)
}

export async function fetchAllMyJKKNBatches(
	options: MyJKKNBatchFetchOptions = {}
): Promise<MyJKKNBatch[]> {
	if (options.all) {
		return fetchAllPages<MyJKKNBatch>(fetchMyJKKNBatches, options)
	}
	const response = await fetchMyJKKNBatches(options)
	return response.data
}

export async function fetchMyJKKNBatchById(id: string): Promise<MyJKKNBatch> {
	const response = await fetchFromMyJKKN<MyJKKNBatch | { data: MyJKKNBatch }>(`/api-management/academic/batches/${id}`)
	// Handle both response structures: { data: batch } or batch directly
	const batch = (response as { data?: MyJKKNBatch }).data || response as MyJKKNBatch
	console.log('[MyJKKN API] Batch by ID response:', { id, batch_name: batch?.batch_name, raw: response })
	return batch
}

// =====================================================
// ACADEMIC YEARS
// =====================================================

export async function fetchMyJKKNAcademicYears(
	options: MyJKKNAcademicYearFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNAcademicYear>> {
	const { page = 1, limit = 50, search, is_active, institution_id, academic_year_name } = options

	return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNAcademicYear>>(
		'/api-management/academic/academic-years',
		{ page, limit, search, is_active, institution_id, academic_year_name }
	)
}

export async function fetchAllMyJKKNAcademicYears(
	options: MyJKKNAcademicYearFetchOptions = {}
): Promise<MyJKKNAcademicYear[]> {
	if (options.all) {
		return fetchAllPages<MyJKKNAcademicYear>(fetchMyJKKNAcademicYears, options)
	}
	const response = await fetchMyJKKNAcademicYears(options)
	return response.data
}

// =====================================================
// LEARNER PROFILES
// =====================================================

export async function fetchMyJKKNLearnerProfiles(
	options: MyJKKNLearnerProfileFetchOptions = {}
): Promise<MyJKKNPaginatedResponse<MyJKKNLearnerProfile>> {
	const { page = 1, limit = 10, search, is_active, institution_id, institution_code, program_id, program_code, department_id, department_code, batch_id, current_semester, admission_year, lifecycle_status } = options

	return fetchFromMyJKKN<MyJKKNPaginatedResponse<MyJKKNLearnerProfile>>(
		'/api-management/learners/profiles',
		{ page, limit, search, is_active, institution_id, institution_code, program_id, program_code, department_id, department_code, batch_id, current_semester, admission_year, lifecycle_status }
	)
}

export async function fetchAllMyJKKNLearnerProfiles(
	options: MyJKKNLearnerProfileFetchOptions = {}
): Promise<MyJKKNLearnerProfile[]> {
	if (options.all) {
		return fetchAllPages<MyJKKNLearnerProfile>(fetchMyJKKNLearnerProfiles, options)
	}
	const response = await fetchMyJKKNLearnerProfiles(options)
	return response.data
}

export async function fetchMyJKKNLearnerProfileById(id: string): Promise<MyJKKNLearnerProfile> {
	const response = await fetchFromMyJKKN<{ data: MyJKKNLearnerProfile }>(`/api-management/learners/profiles/${id}`)
	return response.data
}
