"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/common/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import LearnerDetails from "./learner-details"
import {
	Search,
	ChevronLeft,
	ChevronRight,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	Users,
	TrendingUp,
	RefreshCw,
	CheckCircle,
	XCircle,
	AlertTriangle,
	Database,
	Eye,
	Filter,
	X
} from "lucide-react"

interface MyJKKNLearner {
	id: string
	first_name: string
	last_name: string
	roll_number: string
	institution: {
		id: string
		name: string
	}
	department: {
		id: string
		department_name: string
	}
	program: {
		id: string
		program_name: string
	}
	degree: {
		id: string
		degree_name: string
	}
	is_profile_complete: boolean
}

interface MyJKKNResponse {
	data: MyJKKNLearner[]
	metadata: {
		page: number
		totalPages: number
		total: number
	}
}

export default function MyJKKNLearnersPage() {
	const { toast } = useToast()

	// Institution filter hook for multi-tenant filtering
	const {
		filter,
		isReady,
		appendToUrl
	} = useInstitutionFilter()

	const [learners, setLearners] = useState<MyJKKNLearner[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [sortColumn, setSortColumn] = useState<keyof MyJKKNLearner | null>(null)
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
	const [currentPage, setCurrentPage] = useState(1)
	const [totalPages, setTotalPages] = useState(1)
	const [totalLearners, setTotalLearners] = useState(0)
	const [connectionError, setConnectionError] = useState<string | null>(null)
	const [selectedLearnerId, setSelectedLearnerId] = useState<string | null>(null)

	// Filter states
	const [institutionFilter, setInstitutionFilter] = useState("all")
	const [departmentFilter, setDepartmentFilter] = useState("all")
	const [programFilter, setProgramFilter] = useState("all")
	const [profileStatusFilter, setProfileStatusFilter] = useState("all")

	// Filter options loaded from database
	const [institutions, setInstitutions] = useState<Array<{ id: string; institution_code: string; name: string }>>([])
	const [departments, setDepartments] = useState<Array<{ id: string; department_code: string; department_name: string }>>([])
	const [programs, setPrograms] = useState<Array<{ id: string; program_code: string; program_name: string }>>([])

	// Search states for filters
	const [institutionSearch, setInstitutionSearch] = useState("")
	const [departmentSearch, setDepartmentSearch] = useState("")
	const [programSearch, setProgramSearch] = useState("")

	// Loading states for filters
	const [institutionLoading, setInstitutionLoading] = useState(false)
	const [departmentLoading, setDepartmentLoading] = useState(false)
	const [programLoading, setProgramLoading] = useState(false)

	const itemsPerPage = 20

	// Fetch institutions from database
	const fetchInstitutions = useCallback(async (search: string = '') => {
		try {
			setInstitutionLoading(true)
			const params = new URLSearchParams()
			if (search) params.append('search', search)

			const response = await fetch(`/api/filters/institutions?${params.toString()}`)
			if (!response.ok) throw new Error('Failed to fetch institutions')

			const data = await response.json()
			setInstitutions(data.data || [])
		} catch (error) {
			console.error('Error fetching institutions:', error)
		} finally {
			setInstitutionLoading(false)
		}
	}, [])

	// Fetch departments from database with cascading filter
	const fetchDepartments = useCallback(async (search: string = '') => {
		try {
			setDepartmentLoading(true)
			const params = new URLSearchParams()
			if (search) params.append('search', search)
			if (institutionFilter && institutionFilter !== 'all') {
				params.append('institution_id', institutionFilter)
			}

			const response = await fetch(`/api/filters/departments?${params.toString()}`)
			if (!response.ok) throw new Error('Failed to fetch departments')

			const data = await response.json()
			setDepartments(data.data || [])
		} catch (error) {
			console.error('Error fetching departments:', error)
		} finally {
			setDepartmentLoading(false)
		}
	}, [institutionFilter])

	// Fetch programs from database with cascading filters
	const fetchPrograms = useCallback(async (search: string = '') => {
		try {
			setProgramLoading(true)
			const params = new URLSearchParams()
			if (search) params.append('search', search)
			if (institutionFilter && institutionFilter !== 'all') {
				params.append('institution_id', institutionFilter)
			}
			if (departmentFilter && departmentFilter !== 'all') {
				params.append('department_id', departmentFilter)
			}

			const response = await fetch(`/api/filters/programs?${params.toString()}`)
			if (!response.ok) throw new Error('Failed to fetch programs')

			const data = await response.json()
			setPrograms(data.data || [])
		} catch (error) {
			console.error('Error fetching programs:', error)
		} finally {
			setProgramLoading(false)
		}
	}, [institutionFilter, departmentFilter])

	// Fetch learners from API with institution filter
	const fetchLearners = async (page: number = 1) => {
		try {
			setLoading(true)
			setConnectionError(null)

			// Build query parameters
			const params = new URLSearchParams({
				page: page.toString(),
				limit: itemsPerPage.toString()
			})

			// Add filter parameters if selected (skip "all" values)
			if (institutionFilter && institutionFilter !== 'all') {
				params.append('institution_id', institutionFilter)
			}
			if (departmentFilter && departmentFilter !== 'all') {
				params.append('department_id', departmentFilter)
			}
			if (programFilter && programFilter !== 'all') {
				params.append('program_id', programFilter)
			}
			if (profileStatusFilter !== 'all') {
				params.append('is_profile_complete', profileStatusFilter)
			}

			// Use institution filter for multi-tenant data access
			const url = appendToUrl(`/api/api-management/learners?${params.toString()}`)
			const response = await fetch(url)

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}))
				throw new Error(errorData.error || `API Error: ${response.statusText}`)
			}

			const responseData: MyJKKNResponse = await response.json()

			setLearners(responseData.data || [])
			setTotalPages(responseData.metadata.totalPages)
			setTotalLearners(responseData.metadata.total)
			setCurrentPage(responseData.metadata.page)

			if (responseData.data.length === 0 && page === 1) {
				toast({
					title: "ℹ️ No Data",
					description: "No learners found in MyJKKN API",
					className: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200",
				})
			}
		} catch (error) {
			console.error('Error fetching MyJKKN learners:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to fetch learners'
			setConnectionError(errorMessage)
			setLearners([])
			toast({
				title: "❌ Connection Error",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setLoading(false)
		}
	}

	// Load filter options when institution filter is ready
	useEffect(() => {
		if (!isReady) return
		fetchInstitutions()
		fetchDepartments()
		fetchPrograms()
	}, [isReady, filter])

	// Reload departments when institution filter changes (excluding initial load)
	useEffect(() => {
		if (institutionFilter !== 'all') {
			fetchDepartments()
		}
	}, [institutionFilter])

	// Reload programs when institution or department filter changes (excluding initial load)
	useEffect(() => {
		if (institutionFilter !== 'all' || departmentFilter !== 'all') {
			fetchPrograms()
		}
	}, [institutionFilter, departmentFilter])

	// Load learners on mount, page change, or filter change
	useEffect(() => {
		fetchLearners(currentPage)
	}, [currentPage, institutionFilter, departmentFilter, programFilter, profileStatusFilter])

	// Reset to page 1 when filters change
	useEffect(() => {
		if (currentPage !== 1) {
			setCurrentPage(1)
		}
	}, [institutionFilter, departmentFilter, programFilter, profileStatusFilter])

	// Clear filters function
	const clearFilters = () => {
		setInstitutionFilter("all")
		setDepartmentFilter("all")
		setProgramFilter("all")
		setProfileStatusFilter("all")
		setSearchTerm("")
	}

	// Handle institution filter change with cascading reset
	const handleInstitutionChange = (value: string) => {
		setInstitutionFilter(value)
		// Reset dependent filters when institution changes
		setDepartmentFilter('all')
		setProgramFilter('all')
	}

	// Handle department filter change with cascading reset
	const handleDepartmentChange = (value: string) => {
		setDepartmentFilter(value)
		// Reset dependent filter when department changes
		setProgramFilter('all')
	}

	// Convert filter options to SearchableSelect format
	const institutionOptions = useMemo<SearchableSelectOption[]>(() => [
		{ value: 'all', label: 'All Institutions' },
		...institutions.map(inst => ({
			value: inst.id,
			label: `${inst.institution_code} - ${inst.name}`
		}))
	], [institutions])

	const departmentOptions = useMemo<SearchableSelectOption[]>(() => [
		{ value: 'all', label: 'All Departments' },
		...departments.map(dept => ({
			value: dept.id,
			label: `${dept.department_code} - ${dept.department_name}`
		}))
	], [departments])

	const programOptions = useMemo<SearchableSelectOption[]>(() => [
		{ value: 'all', label: 'All Programs' },
		...programs.map(prog => ({
			value: prog.id,
			label: `${prog.program_code} - ${prog.program_name}`
		}))
	], [programs])

	// Filter learners by search term
	const filteredLearners = useMemo(() => {
		if (!searchTerm.trim()) return learners

		const term = searchTerm.toLowerCase()
		return learners.filter(learner =>
			learner.first_name?.toLowerCase().includes(term) ||
			learner.last_name?.toLowerCase().includes(term) ||
			learner.roll_number?.toLowerCase().includes(term) ||
			learner.department?.department_name?.toLowerCase().includes(term) ||
			learner.program?.program_name?.toLowerCase().includes(term) ||
			learner.institution?.name?.toLowerCase().includes(term)
		)
	}, [learners, searchTerm])

	// Sort learners
	const sortedLearners = useMemo(() => {
		if (!sortColumn) return filteredLearners

		return [...filteredLearners].sort((a, b) => {
			let aVal: any = a[sortColumn]
			let bVal: any = b[sortColumn]

			// Handle nested objects for institution, department, program
			if (sortColumn === 'institution' && typeof aVal === 'object') {
				aVal = aVal?.name
				bVal = bVal?.name
			} else if (sortColumn === 'department' && typeof aVal === 'object') {
				aVal = aVal?.department_name
				bVal = bVal?.department_name
			} else if (sortColumn === 'program' && typeof aVal === 'object') {
				aVal = aVal?.program_name
				bVal = bVal?.program_name
			}

			if (aVal === null || aVal === undefined) return 1
			if (bVal === null || bVal === undefined) return -1

			const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
			return sortDirection === "asc" ? comparison : -comparison
		})
	}, [filteredLearners, sortColumn, sortDirection])

	// Handle column sort
	const handleSort = (column: keyof MyJKKNLearner) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc")
		} else {
			setSortColumn(column)
			setSortDirection("asc")
		}
	}

	// Get sort icon
	const getSortIcon = (column: keyof MyJKKNLearner) => {
		if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-4 w-4" />
		return sortDirection === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />
	}

	// Calculate statistics
	const stats = useMemo(() => {
		const profileComplete = learners.filter(s => s.is_profile_complete).length
		const profileIncomplete = learners.filter(s => !s.is_profile_complete).length

		return {
			total: totalLearners,
			profileComplete,
			profileIncomplete,
			currentPageCount: learners.length
		}
	}, [learners, totalLearners])

	// If a learner is selected, show details view
	if (selectedLearnerId) {
		return (
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset>
					<AppHeader />
					<div className="flex flex-1 flex-col gap-4 p-4 overflow-auto">
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link href="/">Home</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbLink
										asChild
										className="cursor-pointer"
										onClick={() => setSelectedLearnerId(null)}
									>
										<span>MyJKKN Learners</span>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Learner Details</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
						<LearnerDetails
							learnerId={selectedLearnerId}
							onBack={() => setSelectedLearnerId(null)}
						/>
					</div>
					<AppFooter />
				</SidebarInset>
			</SidebarProvider>
		)
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 overflow-auto">
					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/">Home</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>MyJKKN Learners</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Scorecard Section */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Total Learners</p>
										<p className="text-xl font-bold">{stats.total}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<Users className="h-3 w-3 text-blue-600 dark:text-blue-400" />
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Profile Complete</p>
										<p className="text-xl font-bold text-green-600">{stats.profileComplete}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
										<CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Profile Incomplete</p>
										<p className="text-xl font-bold text-orange-600">{stats.profileIncomplete}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
										<AlertTriangle className="h-3 w-3 text-orange-600 dark:text-orange-400" />
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Current Page</p>
										<p className="text-xl font-bold text-purple-600">{stats.currentPageCount}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
										<Database className="h-3 w-3 text-purple-600 dark:text-purple-400" />
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Connection Error Alert */}
					{connectionError && (
						<Alert variant="destructive" className="border-red-200 bg-red-50 dark:bg-red-900/20">
							<AlertTriangle className="h-4 w-4" />
							<AlertDescription className="ml-2">
								<strong>Connection Error:</strong> {connectionError}
								<br />
								<span className="text-xs mt-1 block">Please check your API key configuration and network connection.</span>
							</AlertDescription>
						</Alert>
					)}

					{/* Main Content */}
					<Card className="flex-1 flex flex-col overflow-hidden">
						<CardHeader className="flex-shrink-0 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
							<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
										<Users className="h-5 w-5 text-white" />
									</div>
									<div>
										<CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
											MyJKKN Learners
										</CardTitle>
										<CardDescription className="mt-1">
											Learners data from MyJKKN API system
										</CardDescription>
									</div>
								</div>
								<div className="flex gap-2">
									<Button
										size="sm"
										variant="outline"
										onClick={() => fetchStudents(currentPage)}
										disabled={loading}
										className="h-9"
									>
										<RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
										Refresh
									</Button>
								</div>
							</div>

							{/* Search Bar */}
							<div className="mt-4 flex items-center gap-2">
								<div className="relative flex-1">
									<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									<Input
										placeholder="Search by name, roll number, department, program..."
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
										className="pl-9 h-9"
									/>
								</div>
							</div>

							{/* Filters */}
							<div className="mt-4 flex flex-wrap items-center gap-2">
								<div className="flex items-center gap-2">
									<Filter className="h-4 w-4 text-muted-foreground" />
									<span className="text-sm font-medium text-muted-foreground">Filters:</span>
								</div>

								{/* Institution Filter - Searchable */}
								<SearchableSelect
									value={institutionFilter}
									onValueChange={handleInstitutionChange}
									options={institutionOptions}
									placeholder="All Institutions"
									searchPlaceholder="Search institutions..."
									emptyText="No institutions found"
									className="h-9 w-[220px]"
									loading={institutionLoading}
									onSearchChange={fetchInstitutions}
								/>

								{/* Department Filter - Searchable with Cascading */}
								<SearchableSelect
									value={departmentFilter}
									onValueChange={handleDepartmentChange}
									options={departmentOptions}
									placeholder="All Departments"
									searchPlaceholder="Search departments..."
									emptyText="No departments found"
									className="h-9 w-[220px]"
									loading={departmentLoading}
									onSearchChange={fetchDepartments}
									disabled={institutionFilter === 'all'}
								/>

								{/* Program Filter - Searchable with Cascading */}
								<SearchableSelect
									value={programFilter}
									onValueChange={setProgramFilter}
									options={programOptions}
									placeholder="All Programs"
									searchPlaceholder="Search programs..."
									emptyText="No programs found"
									className="h-9 w-[220px]"
									loading={programLoading}
									onSearchChange={fetchPrograms}
									disabled={institutionFilter === 'all' || departmentFilter === 'all'}
								/>

								{/* Profile Status Filter */}
								<Select value={profileStatusFilter} onValueChange={setProfileStatusFilter}>
									<SelectTrigger className="h-9 w-[160px]">
										<SelectValue placeholder="All Status" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Status</SelectItem>
										<SelectItem value="true">Complete</SelectItem>
										<SelectItem value="false">Incomplete</SelectItem>
									</SelectContent>
								</Select>

								{/* Clear Filters Button */}
								{(institutionFilter !== 'all' || departmentFilter !== 'all' || programFilter !== 'all' || profileStatusFilter !== 'all' || searchTerm) && (
									<Button
										size="sm"
										variant="ghost"
										onClick={clearFilters}
										className="h-9 px-2"
									>
										<X className="h-4 w-4 mr-1" />
										Clear All
									</Button>
								)}
							</div>
						</CardHeader>

						{/* Table */}
						<CardContent className="flex-1 overflow-auto p-0">
							{loading ? (
								<div className="flex items-center justify-center h-64">
									<RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
								</div>
							) : sortedLearners.length === 0 ? (
								<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
									<Users className="h-12 w-12 mb-4 opacity-20" />
									<p className="text-lg font-medium">No learners found</p>
									<p className="text-sm">Try adjusting your search or refresh the data</p>
								</div>
							) : (
								<Table>
									<TableHeader className="sticky top-0 bg-background z-10">
										<TableRow>
											<TableHead className="cursor-pointer" onClick={() => handleSort('roll_number')}>
												<div className="flex items-center">
													Roll Number
													{getSortIcon('roll_number')}
												</div>
											</TableHead>
											<TableHead className="cursor-pointer" onClick={() => handleSort('first_name')}>
												<div className="flex items-center">
													First Name
													{getSortIcon('first_name')}
												</div>
											</TableHead>
											<TableHead className="cursor-pointer" onClick={() => handleSort('last_name')}>
												<div className="flex items-center">
													Last Name
													{getSortIcon('last_name')}
												</div>
											</TableHead>
											<TableHead className="cursor-pointer" onClick={() => handleSort('institution')}>
												<div className="flex items-center">
													Institution
													{getSortIcon('institution')}
												</div>
											</TableHead>
											<TableHead className="cursor-pointer" onClick={() => handleSort('department')}>
												<div className="flex items-center">
													Department
													{getSortIcon('department')}
												</div>
											</TableHead>
											<TableHead className="cursor-pointer" onClick={() => handleSort('program')}>
												<div className="flex items-center">
													Program
													{getSortIcon('program')}
												</div>
											</TableHead>
											<TableHead className="cursor-pointer" onClick={() => handleSort('is_profile_complete')}>
												<div className="flex items-center">
													Profile Status
													{getSortIcon('is_profile_complete')}
												</div>
											</TableHead>
											<TableHead className="text-center">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{sortedLearners.map((learner) => (
											<TableRow key={learner.id} className="hover:bg-muted/50">
												<TableCell className="font-mono text-sm">{learner.roll_number}</TableCell>
												<TableCell className="font-medium">{learner.first_name}</TableCell>
												<TableCell className="font-medium">{learner.last_name}</TableCell>
												<TableCell className="text-sm text-muted-foreground">{learner.institution?.name || 'N/A'}</TableCell>
												<TableCell className="text-sm">{learner.department?.department_name || 'N/A'}</TableCell>
												<TableCell className="text-sm">{learner.program?.program_name || 'N/A'}</TableCell>
												<TableCell>
													{learner.is_profile_complete ? (
														<Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-200 dark:border-green-800">
															<CheckCircle className="h-3 w-3 mr-1" />
															Complete
														</Badge>
													) : (
														<Badge variant="outline" className="bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-200 dark:border-orange-800">
															<XCircle className="h-3 w-3 mr-1" />
															Incomplete
														</Badge>
													)}
												</TableCell>
												<TableCell className="text-center">
													<Button
														size="sm"
														variant="ghost"
														onClick={() => setSelectedLearnerId(learner.id)}
														className="h-8"
													>
														<Eye className="h-4 w-4 mr-1" />
														View
													</Button>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>

						{/* Pagination */}
						{!loading && sortedLearners.length > 0 && (
							<div className="flex-shrink-0 border-t p-4 flex items-center justify-between">
								<div className="text-sm text-muted-foreground">
									Showing <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> to{' '}
									<span className="font-medium">{Math.min(currentPage * itemsPerPage, totalLearners)}</span> of{' '}
									<span className="font-medium">{totalLearners}</span> learners
								</div>
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
										disabled={currentPage === 1}
										className="h-8"
									>
										<ChevronLeft className="h-4 w-4 mr-1" />
										Previous
									</Button>
									<div className="text-sm font-medium px-3">
										Page {currentPage} of {totalPages}
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
										disabled={currentPage === totalPages}
										className="h-8"
									>
										Next
										<ChevronRight className="h-4 w-4 ml-1" />
									</Button>
								</div>
							</div>
						)}
					</Card>
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
