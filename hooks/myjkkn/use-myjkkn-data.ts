/**
 * MyJKKN Data Hooks
 *
 * Custom React hooks for fetching master data from MyJKKN APIs.
 * These hooks handle loading states, error handling, and data adaptation.
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
	adaptRegulations,
	adaptDepartments,
	adaptPrograms,
	adaptSemesters,
	adaptLearners,
	adaptStaffList,
	type COERegulation,
	type COEDepartment,
	type COEProgram,
	type COESemester,
	type COELearner,
	type COEStaff,
} from '@/services/myjkkn/myjkkn-adapter-service'

// =====================================================
// TYPES
// =====================================================

interface UseMyJKKNDataOptions {
	institution_code?: string
	program_code?: string
	department_code?: string
	is_active?: boolean
	limit?: number
	/** If true and no institution_code provided, return empty array (for non-super admin with no institution) */
	requireFilter?: boolean
}

interface UseMyJKKNDataResult<T> {
	data: T[]
	loading: boolean
	error: string | null
	refetch: () => Promise<void>
	metadata: {
		total: number
		page: number
		totalPages: number
	} | null
}

// =====================================================
// BASE FETCH HOOK
// =====================================================

function useMyJKKNFetch<T, R>(
	endpoint: string,
	adapter: (data: R[]) => T[],
	options: UseMyJKKNDataOptions = {},
	enabled: boolean = true
): UseMyJKKNDataResult<T> {
	const [data, setData] = useState<T[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [metadata, setMetadata] = useState<{
		total: number
		page: number
		totalPages: number
	} | null>(null)

	const fetchData = useCallback(async () => {
		if (!enabled) {
			setLoading(false)
			return
		}

		// If filter is required but no institution_code provided, return empty array
		// This handles non-super admin users with no assigned institution
		if (options.requireFilter && !options.institution_code) {
			setData([])
			setLoading(false)
			setMetadata(null)
			return
		}

		try {
			setLoading(true)
			setError(null)

			// Build query params
			const params = new URLSearchParams()
			if (options.institution_code) params.set('institution_code', options.institution_code)
			if (options.program_code) params.set('program_code', options.program_code)
			if (options.department_code) params.set('department_code', options.department_code)
			if (options.is_active !== undefined) params.set('is_active', String(options.is_active))
			// Set limit - default to 100000 to fetch all data
			const requestedLimit = options.limit || 100000
			params.set('limit', String(requestedLimit))
			// Enable fetchAll mode to paginate through all results
			if (requestedLimit > 200) {
				params.set('fetchAll', 'true')
			}

			const queryString = params.toString()
			const url = queryString ? `${endpoint}?${queryString}` : endpoint

			const response = await fetch(url)

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}))
				throw new Error(errorData.error || `Failed to fetch data from ${endpoint}`)
			}

			const result = await response.json()

			// Handle both paginated and direct array responses
			const rawData = Array.isArray(result) ? result : (result.data || [])
			const adaptedData = adapter(rawData)
			setData(adaptedData)

			// Set metadata if available
			if (result.metadata) {
				setMetadata({
					total: result.metadata.total,
					page: result.metadata.page,
					totalPages: result.metadata.totalPages,
				})
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data'
			setError(errorMessage)
			console.error(`[MyJKKN] Error fetching ${endpoint}:`, err)
		} finally {
			setLoading(false)
		}
	}, [endpoint, adapter, options.institution_code, options.program_code, options.department_code, options.is_active, options.limit, options.requireFilter, enabled])

	useEffect(() => {
		fetchData()
	}, [fetchData])

	return {
		data,
		loading,
		error,
		refetch: fetchData,
		metadata,
	}
}

// =====================================================
// ENTITY-SPECIFIC HOOKS
// =====================================================

/**
 * Hook for fetching Regulations from MyJKKN
 */
export function useMyJKKNRegulations(options: UseMyJKKNDataOptions = {}): UseMyJKKNDataResult<COERegulation> {
	return useMyJKKNFetch<COERegulation, any>(
		'/api/myjkkn/regulations',
		adaptRegulations,
		options
	)
}

/**
 * Hook for fetching Departments from MyJKKN
 */
export function useMyJKKNDepartments(options: UseMyJKKNDataOptions = {}): UseMyJKKNDataResult<COEDepartment> {
	return useMyJKKNFetch<COEDepartment, any>(
		'/api/myjkkn/departments',
		adaptDepartments,
		options
	)
}

/**
 * Hook for fetching Programs from MyJKKN
 */
export function useMyJKKNPrograms(options: UseMyJKKNDataOptions = {}): UseMyJKKNDataResult<COEProgram> {
	return useMyJKKNFetch<COEProgram, any>(
		'/api/myjkkn/programs',
		adaptPrograms,
		options
	)
}

/**
 * Hook for fetching Semesters from MyJKKN
 */
export function useMyJKKNSemesters(options: UseMyJKKNDataOptions = {}): UseMyJKKNDataResult<COESemester> {
	return useMyJKKNFetch<COESemester, any>(
		'/api/myjkkn/semesters',
		adaptSemesters,
		options
	)
}

/**
 * Hook for fetching Learners from MyJKKN
 */
export function useMyJKKNLearners(options: UseMyJKKNDataOptions = {}): UseMyJKKNDataResult<COELearner> {
	return useMyJKKNFetch<COELearner, any>(
		'/api/myjkkn/learner-profiles',
		adaptLearners,
		options
	)
}

/**
 * Hook for fetching Staff from MyJKKN
 */
export function useMyJKKNStaff(options: UseMyJKKNDataOptions = {}): UseMyJKKNDataResult<COEStaff> {
	return useMyJKKNFetch<COEStaff, any>(
		'/api/myjkkn/staff',
		adaptStaffList,
		options
	)
}

// =====================================================
// DROPDOWN-SPECIFIC HOOKS
// =====================================================

/**
 * Hook for fetching Regulations for dropdown use
 * Returns simplified data suitable for Select components
 */
export function useMyJKKNRegulationsDropdown(institutionCode?: string) {
	const { data, loading, error, refetch } = useMyJKKNRegulations({
		institution_code: institutionCode,
		is_active: true,
	})

	const dropdownOptions = useMemo(() => data.map(reg => ({
		value: reg.regulation_code,
		label: `${reg.regulation_code} - ${reg.regulation_name}`,
		id: reg.id,
	})), [data])

	return { options: dropdownOptions, loading, error, refetch }
}

/**
 * Hook for fetching Departments for dropdown use
 */
export function useMyJKKNDepartmentsDropdown(institutionCode?: string) {
	const { data, loading, error, refetch } = useMyJKKNDepartments({
		institution_code: institutionCode,
		is_active: true,
	})

	const dropdownOptions = useMemo(() => data.map(dept => ({
		value: dept.department_code,
		label: `${dept.department_code} - ${dept.department_name}`,
		id: dept.id,
	})), [data])

	return { options: dropdownOptions, loading, error, refetch }
}

/**
 * Hook for fetching Programs for dropdown use
 */
export function useMyJKKNProgramsDropdown(institutionCode?: string, departmentCode?: string) {
	const { data, loading, error, refetch } = useMyJKKNPrograms({
		institution_code: institutionCode,
		department_code: departmentCode,
		is_active: true,
	})

	const dropdownOptions = useMemo(() => data.map(prog => ({
		value: prog.program_code,
		label: `${prog.program_code} - ${prog.program_name}`,
		id: prog.id,
	})), [data])

	return { options: dropdownOptions, loading, error, refetch }
}

/**
 * Hook for fetching Semesters for dropdown use
 */
export function useMyJKKNSemestersDropdown(institutionCode?: string, programCode?: string) {
	const { data, loading, error, refetch } = useMyJKKNSemesters({
		institution_code: institutionCode,
		program_code: programCode,
		is_active: true,
	})

	const dropdownOptions = useMemo(() => data.map(sem => ({
		value: sem.semester_code || sem.semester_name,
		label: sem.semester_name,
		id: sem.id,
		semester_number: sem.semester_number,
	})), [data])

	return { options: dropdownOptions, loading, error, refetch }
}
