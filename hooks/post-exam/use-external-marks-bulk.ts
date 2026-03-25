'use client'

/**
 * Custom Hook for External Marks Bulk Upload
 * Manages state, data fetching, filtering, sorting, and pagination
 * Uses institution filter for proper multi-tenant support
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import type {
	ExternalMark,
	ExamSession,
	Program,
	Course,
	Institution,
	ImportPreviewRow,
	UploadSummary,
	UploadError,
	LookupMode
} from '@/types/external-marks'
import {
	bulkUploadMarks,
	bulkDeleteMarks
} from '@/services/post-exam/external-marks-bulk-service'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useMyJKKNInstitutionFilter, ProgramOption } from '@/hooks/use-myjkkn-institution-filter'

interface UseExternalMarksBulkReturn {
	// Data
	items: ExternalMark[]
	institutions: Institution[]
	sessions: ExamSession[]
	programs: Program[]
	courses: Course[]

	// Loading & Error States
	loading: boolean
	fetchError: string | null

	// Institution filter info
	institutionId: string | null
	mustSelectInstitution: boolean
	isReady: boolean

	// Filters
	selectedInstitution: string
	selectedSession: string
	selectedProgram: string
	selectedCourse: string
	statusFilter: string
	searchTerm: string

	// Filter Setters
	setSelectedInstitution: (id: string) => void
	setSelectedSession: (id: string) => void
	setSelectedProgram: (id: string) => void
	setSelectedCourse: (id: string) => void
	setStatusFilter: (status: string) => void
	setSearchTerm: (term: string) => void

	// Sorting
	sortColumn: string | null
	sortDirection: 'asc' | 'desc'
	handleSort: (column: string) => void

	// Pagination
	currentPage: number
	itemsPerPage: number
	totalPages: number
	setCurrentPage: (page: number) => void
	setItemsPerPage: (count: number) => void

	// Computed Data
	filtered: ExternalMark[]
	pageItems: ExternalMark[]
	startIndex: number
	endIndex: number

	// Selection
	selectedIds: Set<string>
	selectAll: boolean
	handleSelectAll: (checked: boolean) => void
	handleSelectItem: (id: string, checked: boolean) => void
	clearSelection: () => void

	// Import/Upload State
	importPreviewData: ImportPreviewRow[]
	setImportPreviewData: (data: ImportPreviewRow[]) => void
	uploadErrors: UploadError[]
	setUploadErrors: (errors: UploadError[]) => void
	uploadSummary: UploadSummary
	setUploadSummary: (summary: UploadSummary) => void

	// Actions
	refreshData: () => Promise<void>
	uploadMarks: (
		validRows: ImportPreviewRow[],
		userId: string | undefined,
		lookupMode?: LookupMode,
		onProgress?: (current: number, total: number) => void
	) => Promise<{ success: boolean; result?: any; error?: string }>
	deleteSelected: () => Promise<{ success: boolean; result?: any; error?: string }>
}

export function useExternalMarksBulk(): UseExternalMarksBulkReturn {
	// Use institution filter for multi-tenant support
	const {
		institutionId,
		appendToUrl,
		isReady,
		mustSelectInstitution,
		getInstitutionIdForCreate
	} = useInstitutionFilter()

	// Use MyJKKN API for programs
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()

	// Data State
	const [items, setItems] = useState<ExternalMark[]>([])
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExamSession[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [courses, setCourses] = useState<Course[]>([])

	// Loading & Error States
	const [loading, setLoading] = useState(false)
	const [fetchError, setFetchError] = useState<string | null>(null)

	// Filter State
	const [selectedInstitution, setSelectedInstitutionState] = useState('')
	const [selectedSession, setSelectedSession] = useState('')
	const [selectedProgram, setSelectedProgram] = useState('')
	const [selectedCourse, setSelectedCourse] = useState('')
	const [statusFilter, setStatusFilter] = useState('all')
	const [searchTerm, setSearchTerm] = useState('')

	// Handle institution change - reset dependent filters
	const setSelectedInstitution = useCallback((id: string) => {
		setSelectedInstitutionState(id)
		// Reset session when institution changes (sessions are filtered by institution)
		setSelectedSession('')
	}, [])

	// Sort State
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

	// Pagination State
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)

	// Selection State
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const [selectAll, setSelectAll] = useState(false)

	// Import/Upload State
	const [importPreviewData, setImportPreviewData] = useState<ImportPreviewRow[]>([])
	const [uploadErrors, setUploadErrors] = useState<UploadError[]>([])
	const [uploadSummary, setUploadSummary] = useState<UploadSummary>({
		total: 0,
		success: 0,
		failed: 0,
		skipped: 0
	})

	// Fetch institutions on mount
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
			fetchSessions()
		}
	}, [isReady])

	// Fetch programs and courses based on institution context
	useEffect(() => {
		if (isReady && institutions.length > 0) {
			const instId = getInstitutionIdForCreate()
			if (instId) {
				fetchProgramsFromMyJKKN(instId)
				fetchCourses(instId)
			} else if (mustSelectInstitution) {
				// super_admin with "All Institutions" - fetch all
				fetchAllProgramsFromMyJKKN()
				fetchAllCourses()
			}
		}
	}, [isReady, mustSelectInstitution, getInstitutionIdForCreate, institutions])

	// Fetch marks when ready or filters change
	useEffect(() => {
		if (isReady) {
			fetchMarks()
		}
	}, [isReady, selectedInstitution, selectedSession, selectedProgram, selectedCourse])

	const fetchInstitutions = async () => {
		try {
			const res = await fetch('/api/post-exam/external-marks-bulk?action=institutions')
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)
			}
		} catch (error) {
			console.error('Failed to fetch institutions:', error)
		}
	}

	const fetchSessions = async () => {
		try {
			const res = await fetch('/api/post-exam/external-marks-bulk?action=all-sessions')
			if (res.ok) {
				const data = await res.json()
				setSessions(data)
			}
		} catch (error) {
			console.error('Failed to fetch sessions:', error)
		}
	}

	// Fetch programs from MyJKKN API using institution's myjkkn_institution_ids
	const fetchProgramsFromMyJKKN = async (instId: string) => {
		try {
			// Find institution to get myjkkn_institution_ids
			const institution = institutions.find(i => i.id === instId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			if (myjkknIds.length === 0) {
				console.warn('No myjkkn_institution_ids found for institution:', instId)
				setPrograms([])
				return
			}

			// Fetch from MyJKKN API
			const programOptions = await fetchMyJKKNPrograms(myjkknIds)

			// Map ProgramOption to Program type expected by the component
			const mappedPrograms: Program[] = programOptions.map(p => ({
				id: p.id,
				program_code: p.program_code,
				program_name: p.program_name,
				program_order: p.program_order
			}))

			// Sort by program_order
			mappedPrograms.sort((a, b) => (a.program_order || 999) - (b.program_order || 999))

			setPrograms(mappedPrograms)
		} catch (error) {
			console.error('Failed to fetch programs from MyJKKN:', error)
			setPrograms([])
		}
	}

	// Fetch all programs from MyJKKN API (for super_admin with "All Institutions")
	const fetchAllProgramsFromMyJKKN = async () => {
		try {
			// Fetch from MyJKKN API without institution filter (will get all programs)
			const programOptions = await fetchMyJKKNPrograms()

			// Map ProgramOption to Program type expected by the component
			const mappedPrograms: Program[] = programOptions.map(p => ({
				id: p.id,
				program_code: p.program_code,
				program_name: p.program_name,
				program_order: p.program_order
			}))

			// Sort by program_order
			mappedPrograms.sort((a, b) => (a.program_order || 999) - (b.program_order || 999))

			setPrograms(mappedPrograms)
		} catch (error) {
			console.error('Failed to fetch all programs from MyJKKN:', error)
			setPrograms([])
		}
	}

	const fetchCourses = async (instId: string) => {
		try {
			const res = await fetch(`/api/post-exam/external-marks-bulk?action=courses&institutionId=${instId}`)
			if (res.ok) {
				const data = await res.json()
				setCourses(data)
			}
		} catch (error) {
			console.error('Failed to fetch courses:', error)
		}
	}

	const fetchAllCourses = async () => {
		try {
			const res = await fetch('/api/post-exam/external-marks-bulk?action=all-courses')
			if (res.ok) {
				const data = await res.json()
				setCourses(data)
			}
		} catch (error) {
			console.error('Failed to fetch all courses:', error)
		}
	}

	// Fetch marks using institution filter
	const fetchMarks = useCallback(async () => {
		try {
			setLoading(true)
			setFetchError(null)

			// Use appendToUrl for proper institution filtering based on user role
			let url = appendToUrl('/api/post-exam/external-marks-bulk?action=marks')
			// Add selected institution filter (for super_admin filtering within "All Institutions" view)
			if (selectedInstitution) url += `&institutionId=${selectedInstitution}`
			if (selectedSession) url += `&sessionId=${selectedSession}`
			if (selectedProgram) url += `&programId=${selectedProgram}`
			if (selectedCourse) url += `&courseId=${selectedCourse}`

			const res = await fetch(url)
			const data = await res.json()

			if (res.ok) {
				setItems(data)
				setFetchError(null)
			} else {
				console.error('Failed to fetch marks:', data.error)
				setFetchError(data.error || 'Failed to fetch marks')
				setItems([])
			}
		} catch (error) {
			console.error('Failed to fetch marks:', error)
			setFetchError('Unable to connect to the server. Please check your connection and try again.')
			setItems([])
		} finally {
			setLoading(false)
		}
	}, [appendToUrl, selectedInstitution, selectedSession, selectedProgram, selectedCourse])

	// Sorting
	const handleSort = useCallback((column: string) => {
		if (sortColumn === column) {
			setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
		} else {
			setSortColumn(column)
			setSortDirection('asc')
		}
	}, [sortColumn])

	// Filtering and Sorting
	const filtered = useMemo(() => {
		const q = searchTerm.toLowerCase()
		let data = items.filter((i) =>
			[i.dummy_number, i.student_name, i.course_code, i.course_name]
				.filter(Boolean)
				.some((v) => String(v).toLowerCase().includes(q))
		)

		if (statusFilter !== 'all') {
			data = data.filter((i) => i.entry_status?.toLowerCase() === statusFilter.toLowerCase())
		}

		// If user clicked a column header, use that sort
		if (sortColumn) {
			return [...data].sort((a, b) => {
				const av = (a as any)[sortColumn]
				const bv = (b as any)[sortColumn]
				if (av === bv) return 0
				if (sortDirection === 'asc') return av > bv ? 1 : -1
				return av < bv ? 1 : -1
			})
		}

		// Default sort: Institution → Exam Session → Course Order
		// This ensures consistent ordering after search/filter
		return [...data].sort((a, b) => {
			// First by institution_code
			const instCompare = (a.institution_code || '').localeCompare(b.institution_code || '')
			if (instCompare !== 0) return instCompare
			// Then by session_name
			const sessionCompare = (a.session_name || '').localeCompare(b.session_name || '')
			if (sessionCompare !== 0) return sessionCompare
			// Then by course_order
			return (a.course_order || 999) - (b.course_order || 999)
		})
	}, [items, searchTerm, sortColumn, sortDirection, statusFilter])

	// Pagination
	const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1
	const startIndex = (currentPage - 1) * itemsPerPage
	const endIndex = startIndex + itemsPerPage
	const pageItems = filtered.slice(startIndex, endIndex)

	// Reset page on filter/sort changes
	useEffect(() => {
		setCurrentPage(1)
	}, [searchTerm, sortColumn, sortDirection, statusFilter, itemsPerPage])

	// Selection handlers
	const handleSelectAll = useCallback((checked: boolean) => {
		setSelectAll(checked)
		if (checked) {
			setSelectedIds(new Set(pageItems.map(item => item.id)))
		} else {
			setSelectedIds(new Set())
		}
	}, [pageItems])

	const handleSelectItem = useCallback((id: string, checked: boolean) => {
		setSelectedIds(prev => {
			const newSelected = new Set(prev)
			if (checked) {
				newSelected.add(id)
			} else {
				newSelected.delete(id)
			}
			setSelectAll(newSelected.size === pageItems.length)
			return newSelected
		})
	}, [pageItems.length])

	const clearSelection = useCallback(() => {
		setSelectedIds(new Set())
		setSelectAll(false)
	}, [])

	// Upload marks - uses institution_code from each row (like internal marks)
	const uploadMarks = useCallback(async (
		validRows: ImportPreviewRow[],
		userId: string | undefined,
		lookupMode: LookupMode = 'dummy_number',
		onProgress?: (current: number, total: number) => void
	) => {
		console.log('=== useExternalMarksBulk.uploadMarks called ===')
		console.log('validRows count:', validRows.length)
		console.log('lookupMode:', lookupMode)
		console.log('userId:', userId)

		if (validRows.length === 0) {
			return { success: false, error: 'No valid rows to upload.' }
		}

		setLoading(true)

		try {
			// Include institution_code from each row for multi-institution support
			const marksData = validRows.map(row => ({
				institution_code: row.institution_code,
				dummy_number: row.dummy_number,
				register_number: row.register_number,
				subject_code: row.subject_code,
				course_code: row.course_code,
				session_code: row.session_code,
				program_code: row.program_code,
				total_marks_obtained: row.total_marks_obtained,
				marks_out_of: row.marks_out_of,
				remarks: row.remarks
			}))

			console.log('Prepared marksData:', marksData.length, 'rows')
			console.log('First row:', marksData[0])

			const result = await bulkUploadMarks({
				action: 'bulk-upload',
				lookup_mode: lookupMode,
				marks_data: marksData,
				file_name: 'bulk_upload.xlsx',
				file_type: 'XLSX',
				uploaded_by: userId
			}, onProgress)

			console.log('bulkUploadMarks returned:', result)

			// Update summary
			setUploadSummary({
				total: result.total || 0,
				success: result.successful || 0,
				failed: result.failed || 0,
				skipped: result.skipped || 0
			})

			// Collect errors
			const allErrors = [
				...(result.errors || []),
				...(result.validation_errors || [])
			]

			if (allErrors.length > 0) {
				setUploadErrors(allErrors)
			}

			// Refresh data
			await fetchMarks()
			setImportPreviewData([])

			return { success: true, result }
		} catch (error) {
			console.error('=== uploadMarks catch error ===', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to upload marks'

			// Set error summary so dialog can show
			setUploadSummary({
				total: validRows.length,
				success: 0,
				failed: validRows.length,
				skipped: 0
			})
			setUploadErrors([{
				row: 0,
				dummy_number: '-',
				course_code: '-',
				errors: [errorMessage]
			}])

			return {
				success: false,
				error: errorMessage
			}
		} finally {
			setLoading(false)
			console.log('=== uploadMarks completed ===')
		}
	}, [fetchMarks])

	// Delete selected marks
	const deleteSelected = useCallback(async () => {
		if (selectedIds.size === 0) {
			return { success: false, error: 'No items selected' }
		}

		const totalSelected = selectedIds.size
		setLoading(true)

		try {
			const result = await bulkDeleteMarks(Array.from(selectedIds))

			const deleted = result.deleted || 0
			const skipped = result.skipped || 0

			// Update summary for error dialog
			setUploadSummary({
				total: totalSelected,
				success: deleted,
				failed: 0,
				skipped: skipped
			})

			// Format errors for error dialog if any were skipped
			if (result.non_deletable && result.non_deletable.length > 0) {
				const deleteErrors = result.non_deletable.map((e, index) => ({
					row: index + 1,
					dummy_number: e.dummy_number,
					course_code: '-',
					errors: [e.reason]
				}))
				setUploadErrors(deleteErrors)
			}

			clearSelection()
			await fetchMarks()

			return { success: true, result: { deleted, skipped, non_deletable: result.non_deletable } }
		} catch (error) {
			console.error('Delete error:', error)
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to delete records'
			}
		} finally {
			setLoading(false)
		}
	}, [selectedIds, clearSelection, fetchMarks])

	return {
		// Data
		items,
		institutions,
		sessions,
		programs,
		courses,

		// Loading & Error States
		loading,
		fetchError,

		// Institution filter info
		institutionId,
		mustSelectInstitution,
		isReady,

		// Filters
		selectedInstitution,
		selectedSession,
		selectedProgram,
		selectedCourse,
		statusFilter,
		searchTerm,

		// Filter Setters
		setSelectedInstitution,
		setSelectedSession,
		setSelectedProgram,
		setSelectedCourse,
		setStatusFilter,
		setSearchTerm,

		// Sorting
		sortColumn,
		sortDirection,
		handleSort,

		// Pagination
		currentPage,
		itemsPerPage,
		totalPages,
		setCurrentPage,
		setItemsPerPage,

		// Computed Data
		filtered,
		pageItems,
		startIndex,
		endIndex,

		// Selection
		selectedIds,
		selectAll,
		handleSelectAll,
		handleSelectItem,
		clearSelection,

		// Import/Upload State
		importPreviewData,
		setImportPreviewData,
		uploadErrors,
		setUploadErrors,
		uploadSummary,
		setUploadSummary,

		// Actions
		refreshData: fetchMarks,
		uploadMarks,
		deleteSelected
	}
}
