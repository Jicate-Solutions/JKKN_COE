'use client'

/**
 * Learner Directory - MyJKKN Data Source
 *
 * Read-only view of learner profiles from the MyJKKN `learners/profiles` API.
 * All CRUD lives in MyJKKN.
 *
 * Data strategy: the page loads the ENTIRE roster once, via
 * /api/myjkkn/learner-profiles/directory (a `lifecycle_status=all` sweep that is
 * cached server-side). Everything after that — lifecycle status / program /
 * semester filters, search, sorting, paging — is client-side.
 *
 * That is deliberate. MyJKKN's own institution / program / semester filters are
 * unreliable, and with server-side paging the filter dropdowns could only ever
 * offer the values that happened to land on the current page. Sweeping once and
 * matching client-side is the pattern the rest of the codebase uses for this
 * endpoint, and it makes the dropdowns and the counts describe the whole roster.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import XLSX from '@/lib/utils/excel-compat'
import { AppFooter } from '@/components/layout/app-footer'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/common/use-toast'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	Download,
	FileText,
	Search,
	ChevronLeft,
	ChevronRight,
	GraduationCap,
	TrendingUp,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	RefreshCw,
	ExternalLink,
	AlertCircle,
	Info,
	Clock,
	Users,
} from 'lucide-react'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { generateLearnerDirectoryPDF } from '@/lib/utils/generate-learner-directory-pdf'
import { generateLearnerProfilePDF } from '@/lib/utils/generate-learner-profile-pdf'
import { getInstitutionHeader } from '@/lib/utils/institution-header'
import type { LearnerDirectoryRow } from '@/types/learner-directory'

// Items per page options for client-side pagination
const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50, 100, 500]

const ALL = 'all'
// Radix Select rejects an empty item value, and MyJKKN does leave
// lifecycle_status blank on some rows — file those under a sentinel.
const UNKNOWN_STATUS = '__unknown__'

/** 'not_joined' → 'Not Joined'. Blank lifecycle rows are grouped as 'Unknown'. */
function formatLifecycleLabel(status: string): string {
	if (!status) return 'Unknown'
	return status
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

/**
 * Resolve learner photos to base64 so jsPDF can embed them. MyJKKN serves
 * photos from a remote host and jsPDF cannot pull a URL itself, so each one is
 * fetched here — PHOTO_CONCURRENCY at a time, and a failure just leaves the
 * card with an empty "Affix Photo" box.
 */
const PHOTO_CONCURRENCY = 20

async function withPhotos<T extends { student_photo_url?: string }>(rows: T[]): Promise<T[]> {
	const resolved = [...rows]
	for (let i = 0; i < resolved.length; i += PHOTO_CONCURRENCY) {
		const slice = resolved.slice(i, i + PHOTO_CONCURRENCY)
		await Promise.all(slice.map(async (row, offset) => {
			if (!row.student_photo_url) return
			const base64 = await loadLogo(row.student_photo_url)
			resolved[i + offset] = { ...row, student_photo_url: base64 || undefined }
		}))
	}
	return resolved
}

async function loadLogo(url: string): Promise<string | null> {
	try {
		const res = await fetch(url)
		if (!res.ok) return null
		return await blobToBase64(await res.blob())
	} catch {
		return null
	}
}

interface FilterOption {
	value: string
	label: string
	count: number
	/** Longer descriptive name shown beside the code (programs only). */
	name?: string
}

export default function LearnersMyJKKNPage() {
	const { toast } = useToast()

	// Institution filter (skill-based hook)
	const {
		filter,
		shouldFilter,
		isReady,
		isLoading: institutionFilterLoading,
		appendToUrl,
	} = useInstitutionFilter()

	const institutionLoading = !isReady || institutionFilterLoading

	// Full roster from MyJKKN (one sweep, then everything is client-side)
	const [learners, setLearners] = useState<LearnerDirectoryRow[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [fetchedAt, setFetchedAt] = useState<number | null>(null)
	const [sweepComplete, setSweepComplete] = useState(true)
	const [pdfBusy, setPdfBusy] = useState<string | null>(null)

	// Filters, sorting and pagination (all local)
	const [searchTerm, setSearchTerm] = useState('')
	const [debouncedSearch, setDebouncedSearch] = useState('')
	// Lifecycle status defaults to Active — the roster that day-to-day work needs.
	const [statusFilter, setStatusFilter] = useState('active')
	const [programFilter, setProgramFilter] = useState(ALL)
	const [semesterFilter, setSemesterFilter] = useState(ALL)
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(50)

	// Debounce search input (300ms delay)
	const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	useEffect(() => {
		if (searchTimeoutRef.current) {
			clearTimeout(searchTimeoutRef.current)
		}
		searchTimeoutRef.current = setTimeout(() => {
			setDebouncedSearch(searchTerm)
			setCurrentPage(1)
		}, 300)
		return () => {
			if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
		}
	}, [searchTerm])

	// Fetch the whole roster. `refresh` bypasses the server-side sweep cache.
	const loadLearners = useCallback(async (refresh = false) => {
		if (!isReady) return

		try {
			setLoading(true)
			setError(null)

			const baseUrl = refresh
				? '/api/myjkkn/learner-profiles/directory?refresh=true'
				: '/api/myjkkn/learner-profiles/directory'
			const response = await fetch(appendToUrl(baseUrl))

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}))
				throw new Error(errorData.error || 'Failed to load learners from MyJKKN')
			}

			const result = await response.json()
			const rawData: LearnerDirectoryRow[] = result.data || []

			// Extra safety: the MyJKKN institution filter is unreliable, so re-check.
			const scoped = shouldFilter && filter.institution_code
				? rawData.filter(learner => learner.institution_code === filter.institution_code)
				: rawData

			setLearners(scoped)
			setFetchedAt(result.metadata?.fetchedAt ?? Date.now())
			setSweepComplete(result.metadata?.complete !== false)
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load learners from MyJKKN'
			setError(message)
			setLearners([])
			setFetchedAt(null)
		} finally {
			setLoading(false)
		}
	}, [appendToUrl, filter.institution_code, isReady, shouldFilter])

	// Reload only when the institution context changes — not on paging or search.
	useEffect(() => {
		if (!isReady) return
		loadLearners()
	}, [isReady, loadLearners])

	// Lifecycle status options come from the roster itself, so whatever states
	// MyJKKN actually uses (active / alumni / discontinued / ...) all show up.
	const lifecycleOptions = useMemo((): FilterOption[] => {
		const counts = new Map<string, number>()
		for (const learner of learners) {
			const status = learner.lifecycle_status || ''
			counts.set(status, (counts.get(status) || 0) + 1)
		}
		return [...counts.entries()]
			.map(([value, count]) => ({
				value: value || UNKNOWN_STATUS,
				label: formatLifecycleLabel(value),
				count,
			}))
			// Active first, then alphabetical.
			.sort((a, b) => {
				if (a.value === 'active') return -1
				if (b.value === 'active') return 1
				return a.label.localeCompare(b.label)
			})
	}, [learners])

	// Guard the 'active' default: if MyJKKN files this roster under some other
	// lifecycle value, an Active default would show an empty table on first load.
	// Applied once, so a later deliberate choice is never overridden.
	const defaultStatusResolvedRef = useRef(false)
	useEffect(() => {
		if (defaultStatusResolvedRef.current || loading || learners.length === 0) return
		defaultStatusResolvedRef.current = true
		if (!lifecycleOptions.some(option => option.value === 'active')) {
			setStatusFilter(ALL)
		}
	}, [lifecycleOptions, learners.length, loading])

	// Rows matching the lifecycle filter — the base for program options and stats.
	const statusFiltered = useMemo(() => {
		if (statusFilter === ALL) return learners
		const wanted = statusFilter === UNKNOWN_STATUS ? '' : statusFilter
		return learners.filter(learner => (learner.lifecycle_status || '') === wanted)
	}, [learners, statusFilter])

	// Program options cascade from the lifecycle selection. Each option carries
	// the program name alongside the code — several codes differ only by suffix
	// (CSE vs CSE-SH), so the code alone doesn't say what the program is.
	const programOptions = useMemo((): FilterOption[] => {
		const counts = new Map<string, number>()
		const names = new Map<string, string>()
		for (const learner of statusFiltered) {
			if (!learner.program_code) continue
			counts.set(learner.program_code, (counts.get(learner.program_code) || 0) + 1)
			if (learner.program_name && !names.has(learner.program_code)) {
				names.set(learner.program_code, learner.program_name)
			}
		}
		return [...counts.entries()]
			.map(([value, count]) => {
				const name = names.get(value) || ''
				return {
					value,
					label: value,
					count,
					// MyJKKN repeats the code as the name for a few programs
					// (BDS, BPHARM, PHARMD) — don't render "BDS - BDS".
					name: name && name !== value ? name : undefined,
				}
			})
			.sort((a, b) => a.label.localeCompare(b.label))
	}, [statusFiltered])

	const programFiltered = useMemo(() => {
		if (programFilter === ALL) return statusFiltered
		return statusFiltered.filter(learner => learner.program_code === programFilter)
	}, [statusFiltered, programFilter])

	// ...and semester options cascade from lifecycle + program.
	const semesterOptions = useMemo((): FilterOption[] => {
		const counts = new Map<number, number>()
		for (const learner of programFiltered) {
			if (!learner.current_semester) continue
			counts.set(learner.current_semester, (counts.get(learner.current_semester) || 0) + 1)
		}
		return [...counts.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([value, count]) => ({ value: String(value), label: `Semester ${value}`, count }))
	}, [programFiltered])

	// Drop a selection that the new cascade no longer offers.
	useEffect(() => {
		if (programFilter !== ALL && !programOptions.some(o => o.value === programFilter)) {
			setProgramFilter(ALL)
		}
	}, [programOptions, programFilter])

	useEffect(() => {
		if (semesterFilter !== ALL && !semesterOptions.some(o => o.value === semesterFilter)) {
			setSemesterFilter(ALL)
		}
	}, [semesterOptions, semesterFilter])

	// Handle sorting
	const handleSort = (column: string) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
		} else {
			setSortColumn(column)
			setSortDirection('asc')
		}
	}

	// Final result set: cascaded filters + search + sort
	const filteredLearners = useMemo(() => {
		const term = debouncedSearch.trim().toLowerCase()

		const rows = programFiltered.filter((learner) => {
			if (semesterFilter !== ALL && String(learner.current_semester ?? '') !== semesterFilter) {
				return false
			}
			if (!term) return true
			return [
				learner.register_number,
				learner.roll_number,
				learner.learner_name,
				learner.email,
				learner.phone,
				learner.program_code,
			].some(field => field?.toLowerCase().includes(term))
		})

		if (!sortColumn) return rows

		const sorted = [...rows]
		sorted.sort((a, b) => {
			let aValue: string | number
			let bValue: string | number

			switch (sortColumn) {
				case 'register_number':
					aValue = (a.register_number || a.roll_number || '').toLowerCase()
					bValue = (b.register_number || b.roll_number || '').toLowerCase()
					break
				case 'learner_name':
					aValue = a.learner_name?.toLowerCase() || ''
					bValue = b.learner_name?.toLowerCase() || ''
					break
				case 'program_code':
					aValue = a.program_code?.toLowerCase() || ''
					bValue = b.program_code?.toLowerCase() || ''
					break
				case 'current_semester':
					aValue = a.current_semester || 0
					bValue = b.current_semester || 0
					break
				case 'admission_year':
					aValue = a.admission_year || 0
					bValue = b.admission_year || 0
					break
				case 'status':
					aValue = a.lifecycle_status || ''
					bValue = b.lifecycle_status || ''
					break
				default:
					return 0
			}

			if (aValue === bValue) return 0
			const cmp = aValue > bValue ? 1 : -1
			return sortDirection === 'asc' ? cmp : -cmp
		})
		return sorted
	}, [programFiltered, semesterFilter, debouncedSearch, sortColumn, sortDirection])

	// Client-side pagination over the filtered set
	const totalFiltered = filteredLearners.length
	const totalPages = Math.max(1, Math.ceil(totalFiltered / itemsPerPage))

	// Snap back into range when filters shrink the result set below the current page
	useEffect(() => {
		if (currentPage > totalPages) setCurrentPage(totalPages)
	}, [currentPage, totalPages])

	const pageStartIndex = (currentPage - 1) * itemsPerPage
	const paginatedLearners = useMemo(
		() => filteredLearners.slice(pageStartIndex, pageStartIndex + itemsPerPage),
		[filteredLearners, pageStartIndex, itemsPerPage]
	)
	const startIndex = totalFiltered === 0 ? 0 : pageStartIndex + 1
	const endIndex = Math.min(pageStartIndex + itemsPerPage, totalFiltered)

	// Stats describe the whole roster, not just the visible page
	const activeCount = useMemo(() => learners.filter(l => l.is_active).length, [learners])
	const inactiveCount = learners.length - activeCount

	// Helper functions
	const getSortIcon = (column: string) => {
		if (sortColumn !== column) {
			return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
		}
		return sortDirection === 'asc'
			? <ArrowUp className="h-3 w-3" />
			: <ArrowDown className="h-3 w-3" />
	}

	// Helper function to format date
	const formatDate = (dateStr?: string) => {
		if (!dateStr) return ''
		try {
			const date = new Date(dateStr)
			if (isNaN(date.getTime())) return dateStr
			return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
		} catch {
			return dateStr
		}
	}

	const formatTime = (epochMs: number) =>
		new Date(epochMs).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

	// Helper function to get initials for avatar
	const getInitials = (name: string) => {
		const parts = name.trim().split(/\s+/).filter(Boolean)
		if (parts.length >= 2) {
			return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
		}
		if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
		return 'NA'
	}

	// Handle items per page change
	const handleItemsPerPageChange = (value: string) => {
		setItemsPerPage(Number(value))
		setCurrentPage(1)
	}

	// Export every row that matches the current filters, not just this page
	const handleExport = () => {
		const excelData = filteredLearners.map((learner, index) => ({
			'S.No': index + 1,
			'Register Number': learner.register_number || '',
			'Roll Number': learner.roll_number || '',
			'Learner Name': learner.learner_name || '',
			'First Name': learner.first_name || '',
			'Middle Name': learner.middle_name || '',
			'Last Name': learner.last_name || '',
			'Email': learner.email || '',
			'Phone': learner.phone || '',
			'Date of Birth': formatDate(learner.date_of_birth),
			'Gender': learner.gender || '',
			'Institution Code': learner.institution_code || '',
			'Program Code': learner.program_code || '',
			'Department Code': learner.department_code || '',
			'Current Semester': learner.current_semester ?? '',
			'Admission Year': learner.admission_year ?? '',
			'Batch': learner.batch_name || '',
			'Father Name': learner.father_name || '',
			'Mother Name': learner.mother_name || '',
			'Guardian Name': learner.guardian_name || '',
			'Address': learner.address || '',
			'City': learner.city || '',
			'State': learner.state || '',
			'Country': learner.country || '',
			'Pincode': learner.pincode || '',
			'Aadhar Number': learner.aadhar_number || '',
			'ABC ID': learner.abc_id || '',
			'Lifecycle Status': formatLifecycleLabel(learner.lifecycle_status),
		}))

		if (excelData.length === 0) return

		const ws = XLSX.utils.json_to_sheet(excelData)

		// Auto-adjust column widths
		const colWidths = Object.keys(excelData[0] || {}).map(key => ({
			wch: Math.max(key.length, 15)
		}))
		ws['!cols'] = colWidths

		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Learners')
		XLSX.writeFile(wb, `learners_myjkkn_${new Date().toISOString().split('T')[0]}.xlsx`)

		toast({
			title: 'Export Successful',
			description: `Exported ${excelData.length.toLocaleString()} learners.`,
			className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
		})
	}

	// Human-readable filter summary, printed in the PDF header
	const filterSummary = useMemo(() => ({
		status: statusFilter === ALL
			? 'All'
			: (lifecycleOptions.find(o => o.value === statusFilter)?.label || statusFilter),
		program: programFilter === ALL ? 'All' : programFilter,
		semester: semesterFilter === ALL ? 'All' : `Semester ${semesterFilter}`,
		search: debouncedSearch.trim() || undefined,
	}), [statusFilter, programFilter, semesterFilter, debouncedSearch, lifecycleOptions])

	/** Logos for a PDF letterhead: JKKN brand left, the institution's own right. */
	const loadLetterheadLogos = useCallback(async (institutionCode: string) => {
		const header = getInstitutionHeader(institutionCode)
		const [logoImage, rightLogoImage] = await Promise.all([
			loadLogo('/jkkn_logo.png'),
			loadLogo(header.logo_path),
		])
		return { logoImage, rightLogoImage }
	}, [])

	// Download every filtered row as a directory PDF, in the attendance sheet style
	const handleDownloadDirectoryPdf = async () => {
		if (totalFiltered === 0 || pdfBusy) return

		setPdfBusy('directory')
		try {
			// All rows share an institution whenever one is selected; otherwise the
			// roster spans the group and the letterhead falls back to the group name.
			const institutionCode = shouldFilter ? (filteredLearners[0]?.institution_code || '') : ''
			const institutionName = institutionCode
				? filteredLearners[0]?.institution_name || undefined
				: 'JKKN Educational Institutions'

			const { logoImage, rightLogoImage } = await loadLetterheadLogos(institutionCode)

			generateLearnerDirectoryPDF({
				learners: filteredLearners,
				institutionCode,
				institutionName,
				filters: filterSummary,
				logoImage,
				rightLogoImage,
			})

			toast({
				title: 'PDF Downloaded',
				description: `${totalFiltered.toLocaleString()} learners exported.`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
			})
		} catch (err) {
			toast({
				title: 'PDF Failed',
				description: err instanceof Error ? err.message : 'Could not generate the PDF.',
				variant: 'destructive',
			})
		} finally {
			setPdfBusy(null)
		}
	}

	// Student Profile forms — two per landscape sheet, photos embedded
	const handleDownloadProfilePdf = async () => {
		if (totalFiltered === 0 || pdfBusy) return

		setPdfBusy('profile')
		try {
			// Every institution present needs its own letterhead logo, since a
			// group-wide export can mix colleges across cards.
			const codes = [...new Set(filteredLearners.map(l => l.institution_code).filter(Boolean))]
			const logoEntries = await Promise.all(
				codes.map(async code => [code, await loadLogo(getInstitutionHeader(code).logo_path)] as const)
			)
			const institutionLogos: Record<string, string> = {}
			for (const [code, logo] of logoEntries) {
				if (logo) institutionLogos[code] = logo
			}

			const logoImage = await loadLogo('/jkkn_logo.png')

			// jsPDF can only embed data URLs, so each photo has to be fetched and
			// converted first. Bounded concurrency keeps a large class set from
			// opening hundreds of simultaneous requests.
			const learners = await withPhotos(filteredLearners)

			generateLearnerProfilePDF({ learners, logoImage, institutionLogos })

			toast({
				title: 'Student Profile Downloaded',
				description: `${totalFiltered.toLocaleString()} profiles across ${Math.ceil(totalFiltered / 2)} sheets.`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
			})
		} catch (err) {
			toast({
				title: 'PDF Failed',
				description: err instanceof Error ? err.message : 'Could not generate the PDF.',
				variant: 'destructive',
			})
		} finally {
			setPdfBusy(null)
		}
	}

	// Loading state
	const isLoading = loading || institutionLoading

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					{/* Breadcrumb Navigation */}
					<div className="flex items-center gap-2 flex-shrink-0 px-0 py-0">
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link href="/" className="hover:text-primary">Dashboard</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Learners (MyJKKN)</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Header Section */}
					<div className="flex items-center justify-between flex-shrink-0">
						<div>
							<h1 className="text-xl font-bold tracking-tight">Learner Directory</h1>
							<p className="text-xs text-muted-foreground">
								View learner profiles from MyJKKN master data
							</p>
						</div>
					</div>

					{/* MyJKKN Data Source Notice */}
					<Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
						<Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
						<AlertTitle className="text-blue-800 dark:text-blue-200">Data Source: MyJKKN</AlertTitle>
						<AlertDescription className="text-blue-700 dark:text-blue-300">
							All learner profiles across every lifecycle status are loaded from the MyJKKN platform.
							To manage learner profiles, please use the MyJKKN administration portal.
							<Button variant="link" className="h-auto p-0 ml-2 text-blue-600 dark:text-blue-400" asChild>
								<a href="https://jkkn.ai" target="_blank" rel="noopener noreferrer">
									Open MyJKKN <ExternalLink className="h-3 w-3 ml-1" />
								</a>
							</Button>
						</AlertDescription>
					</Alert>

					{/* Error Alert */}
					{error && (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>Error Loading Data</AlertTitle>
							<AlertDescription>
								{error}
								<Button variant="link" className="h-auto p-0 ml-2" onClick={() => loadLearners(true)}>
									Try again
								</Button>
							</AlertDescription>
						</Alert>
					)}

					{/* Partial sweep warning — some MyJKKN pages failed, list may be short */}
					{!error && !sweepComplete && !isLoading && (
						<Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
							<AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
							<AlertTitle className="text-amber-800 dark:text-amber-200">Partial data</AlertTitle>
							<AlertDescription className="text-amber-700 dark:text-amber-300">
								MyJKKN did not return every page of learner profiles, so some learners may be missing.
								<Button variant="link" className="h-auto p-0 ml-2 text-amber-700 dark:text-amber-300" onClick={() => loadLearners(true)}>
									Reload
								</Button>
							</AlertDescription>
						</Alert>
					)}

					{/* Scorecard Section */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{learners.length.toLocaleString()}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Learners</p>
									</div>
									<Users className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>

						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{activeCount.toLocaleString()}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Active</p>
									</div>
									<GraduationCap className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>

						<Card className="border-l-4 border-l-red-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{inactiveCount.toLocaleString()}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Not Active</p>
									</div>
									<Clock className="h-5 w-5 text-red-500/40" />
								</div>
							</CardContent>
						</Card>

						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{totalFiltered.toLocaleString()} shown</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Page {currentPage} of {totalPages}</p>
									</div>
									<TrendingUp className="h-5 w-5 text-purple-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Data Table Card */}
					<TooltipProvider delayDuration={300}>
						<Card className="flex-1 flex flex-col min-h-0">
							<CardHeader className="flex-shrink-0 p-3">
								<div className="flex items-center justify-between mb-2">
									<div className="flex items-center gap-2">
										<div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
											<GraduationCap className="h-3 w-3 text-primary" />
										</div>
										<div>
											<h2 className="text-sm font-semibold">Learners</h2>
											<p className="text-xs text-muted-foreground">
												Browse and filter learner records from MyJKKN
												{fetchedAt && !isLoading && (
													<span className="ml-1">· loaded {formatTime(fetchedAt)}</span>
												)}
											</p>
										</div>
									</div>
								</div>
								<div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
									<div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto flex-wrap">
										<Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1) }}>
											<SelectTrigger className="w-[170px] h-8">
												<SelectValue placeholder="Lifecycle Status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value={ALL}>All Statuses ({learners.length})</SelectItem>
												{lifecycleOptions.map(option => (
													<SelectItem key={option.value} value={option.value}>
														{option.label} ({option.count})
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										<Select value={programFilter} onValueChange={(v) => { setProgramFilter(v); setCurrentPage(1) }}>
											<SelectTrigger className="w-[160px] h-8">
												{/* Explicit children keep the trigger to the code — the
												    full "CODE - Name" only needs to be in the list. */}
												<SelectValue>
													{programFilter === ALL ? 'All Programs' : programFilter}
												</SelectValue>
											</SelectTrigger>
											<SelectContent className="max-w-[440px]">
												<SelectItem value={ALL}>All Programs</SelectItem>
												{programOptions.map(option => (
													<SelectItem key={option.value} value={option.value}>
														<span className="font-medium">{option.label}</span>
														{option.name && (
															<span className="text-muted-foreground"> - {option.name}</span>
														)}
														<span className="text-muted-foreground"> ({option.count})</span>
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										<Select value={semesterFilter} onValueChange={(v) => { setSemesterFilter(v); setCurrentPage(1) }}>
											<SelectTrigger className="w-[150px] h-8">
												<SelectValue placeholder="Semester" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value={ALL}>All Semesters</SelectItem>
												{semesterOptions.map(option => (
													<SelectItem key={option.value} value={option.value}>
														{option.label} ({option.count})
													</SelectItem>
												))}
											</SelectContent>
										</Select>

										<div className="relative w-full sm:w-[220px]">
											<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
											<Input
												placeholder="Search by name, reg no, email..."
												value={searchTerm}
												onChange={(e) => setSearchTerm(e.target.value)}
												className="pl-8 h-8 text-xs"
											/>
											{searchTerm && searchTerm !== debouncedSearch && (
												<span className="absolute right-2 top-1/2 -translate-y-1/2">
													<RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
												</span>
											)}
										</div>
									</div>

									<div className="flex gap-1 flex-wrap items-center">
										<Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
											<SelectTrigger className="w-[90px] h-8">
												<SelectValue placeholder="Per page" />
											</SelectTrigger>
											<SelectContent>
												{ITEMS_PER_PAGE_OPTIONS.map(option => (
													<SelectItem key={option} value={String(option)}>{option} rows</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="outline"
													size="sm"
													className="h-8 w-8 p-0"
													onClick={() => loadLearners(true)}
													disabled={isLoading}
												>
													<RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Reload from MyJKKN</TooltipContent>
										</Tooltip>
										<Button
											variant="outline"
											size="sm"
											className="text-xs px-2 h-8"
											onClick={handleExport}
											disabled={totalFiltered === 0}
										>
											<Download className="h-3 w-3 mr-1" />
											Excel
										</Button>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="outline"
													size="sm"
													className="text-xs px-2 h-8"
													disabled={totalFiltered === 0 || pdfBusy !== null}
												>
													{pdfBusy
														? <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
														: <FileText className="h-3 w-3 mr-1" />}
													PDF
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-64">
												<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
													{totalFiltered.toLocaleString()} learners in the current filter
												</DropdownMenuLabel>
												<DropdownMenuSeparator />
												<DropdownMenuItem onSelect={handleDownloadDirectoryPdf}>
													<div>
														<div className="text-xs font-medium">Learner Directory</div>
														<div className="text-[11px] text-muted-foreground">
															Landscape list, grouped by program
														</div>
													</div>
												</DropdownMenuItem>
												<DropdownMenuItem onSelect={handleDownloadProfilePdf}>
													<div>
														<div className="text-xs font-medium">Student Profile</div>
														<div className="text-[11px] text-muted-foreground">
															Verification form, 2 per sheet ({Math.ceil(totalFiltered / 2).toLocaleString()} sheets)
														</div>
													</div>
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								</div>
							</CardHeader>

							<CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
								<div className="rounded-md border overflow-hidden flex-1">
									<div className="h-full overflow-auto">
										<Table>
											<TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
												<TableRow>
													<TableHead className="w-[50px] text-xs">Photo</TableHead>
													<TableHead className="w-[120px] text-xs">
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleSort('register_number')}
															className="h-auto p-0 font-medium hover:bg-transparent"
														>
															Reg. No.
															<span className="ml-1">
																{getSortIcon('register_number')}
															</span>
														</Button>
													</TableHead>
													<TableHead className="min-w-[150px] text-xs">
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleSort('learner_name')}
															className="h-auto p-0 font-medium hover:bg-transparent"
														>
															Learner Name
															<span className="ml-1">
																{getSortIcon('learner_name')}
															</span>
														</Button>
													</TableHead>
													<TableHead className="w-[180px] text-xs">Email</TableHead>
													<TableHead className="w-[100px] text-xs">DOB</TableHead>
													<TableHead className="w-[80px] text-xs">Institution</TableHead>
													<TableHead className="w-[100px] text-xs">
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleSort('program_code')}
															className="h-auto p-0 font-medium hover:bg-transparent"
														>
															Program
															<span className="ml-1">
																{getSortIcon('program_code')}
															</span>
														</Button>
													</TableHead>
													<TableHead className="w-[60px] text-xs">
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleSort('current_semester')}
															className="h-auto p-0 font-medium hover:bg-transparent"
														>
															Sem
															<span className="ml-1">
																{getSortIcon('current_semester')}
															</span>
														</Button>
													</TableHead>
													<TableHead className="w-[70px] text-xs">
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleSort('admission_year')}
															className="h-auto p-0 font-medium hover:bg-transparent"
														>
															Year
															<span className="ml-1">
																{getSortIcon('admission_year')}
															</span>
														</Button>
													</TableHead>
													<TableHead className="w-[80px] text-xs">Batch</TableHead>
													<TableHead className="w-[90px] text-xs">
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleSort('status')}
															className="h-auto p-0 font-medium hover:bg-transparent"
														>
															Status
															<span className="ml-1">
																{getSortIcon('status')}
															</span>
														</Button>
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{isLoading ? (
													<TableRow>
														<TableCell colSpan={11} className="h-32 text-center">
															<div className="flex flex-col items-center gap-2 text-muted-foreground">
																<RefreshCw className="h-5 w-5 animate-spin" />
																<span className="text-sm">Loading all learner profiles from MyJKKN...</span>
															</div>
														</TableCell>
													</TableRow>
												) : paginatedLearners.length > 0 ? (
													paginatedLearners.map((learner) => (
														<TableRow key={learner.id}>
															<TableCell className="p-2">
																<Avatar className="h-8 w-8">
																	{learner.student_photo_url && (
																		<AvatarImage
																			src={learner.student_photo_url}
																			alt={learner.learner_name || 'Learner photo'}
																		/>
																	)}
																	<AvatarFallback className="bg-primary/10 text-primary text-[10px]">
																		{getInitials(learner.learner_name)}
																	</AvatarFallback>
																</Avatar>
															</TableCell>
															<TableCell className="font-medium text-sm">
																{learner.register_number || learner.roll_number || '-'}
															</TableCell>
															<TableCell className="text-sm">
																<div>
																	<div className="font-medium">{learner.learner_name || '-'}</div>
																	{learner.phone && (
																		<div className="text-xs text-muted-foreground">{learner.phone}</div>
																	)}
																</div>
															</TableCell>
															<TableCell className="text-sm text-muted-foreground">
																{learner.email || '-'}
															</TableCell>
															<TableCell className="text-sm">
																{formatDate(learner.date_of_birth) || '-'}
															</TableCell>
															<TableCell className="text-sm">
																{learner.institution_code || '-'}
															</TableCell>
															<TableCell className="text-sm">
																{learner.program_code || '-'}
															</TableCell>
															<TableCell className="text-sm text-center">
																{learner.current_semester || '-'}
															</TableCell>
															<TableCell className="text-sm text-center">
																{learner.admission_year || '-'}
															</TableCell>
															<TableCell className="text-sm text-muted-foreground">
																{learner.batch_name || '-'}
															</TableCell>
															<TableCell>
																<Badge variant={learner.is_active ? 'default' : 'secondary'} className="text-xs">
																	{formatLifecycleLabel(learner.lifecycle_status)}
																</Badge>
															</TableCell>
														</TableRow>
													))
												) : (
													<TableRow>
														<TableCell colSpan={11} className="h-32 text-center">
															<div className="flex flex-col items-center gap-2 text-muted-foreground">
																<GraduationCap className="h-8 w-8 opacity-30" />
																<span className="text-sm">No learners found.</span>
															</div>
														</TableCell>
													</TableRow>
												)}
											</TableBody>
										</Table>
									</div>
								</div>

								{/* Pagination Controls */}
								<div className="flex items-center justify-between pt-3 flex-shrink-0">
									<div className="flex items-center gap-3">
										<p className="text-sm text-muted-foreground tabular-nums">
											{totalFiltered === 0 ? 'No results' : `${startIndex}–${endIndex} of ${totalFiltered.toLocaleString()}`}
											{debouncedSearch && (
												<span className="ml-1 text-xs">(searching: &quot;{debouncedSearch}&quot;)</span>
											)}
										</p>
									</div>
									<div className="flex items-center gap-1">
										<Button
											variant="outline"
											size="sm"
											onClick={() => setCurrentPage(1)}
											disabled={currentPage === 1}
											className="h-7 px-2 text-xs"
										>
											First
										</Button>
										<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 w-7 p-0"><ChevronLeft className="h-3.5 w-3.5" /></Button>
										<span className="text-xs text-muted-foreground px-2 tabular-nums">{currentPage} / {totalPages}</span>
										<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="h-7 w-7 p-0"><ChevronRight className="h-3.5 w-3.5" /></Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => setCurrentPage(totalPages)}
											disabled={currentPage >= totalPages}
											className="h-7 px-2 text-xs"
										>
											Last
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					</TooltipProvider>
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
