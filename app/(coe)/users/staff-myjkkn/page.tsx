"use client"

/**
 * Staff Page - MyJKKN Data Source
 *
 * This page displays staff profiles sourced from MyJKKN API.
 * This is a READ-ONLY view - all CRUD operations are managed in MyJKKN.
 *
 * Migration Note: This page replaces the old staff management page
 * that used local COE database tables.
 */

import { useState, useMemo } from "react"
import Link from "next/link"
import XLSX from "@/lib/utils/excel-compat"
import { AppFooter } from "@/components/layout/app-footer"
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/common/use-toast"
import {
	Download,
	Search,
	ChevronLeft,
	ChevronRight,
	Users,
	TrendingUp,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	RefreshCw,
	ExternalLink,
	AlertCircle,
	Info,
	Clock,
	Briefcase,
} from "lucide-react"
import { useMyJKKNStaff } from "@/hooks/myjkkn/use-myjkkn-data"
import { useInstitutionFilter } from "@/context/institution-context"
import type { COEStaff } from "@/services/myjkkn/myjkkn-adapter-service"

export default function StaffMyJKKNPage() {
	const { toast } = useToast()

	// Institution filter
	const { filter, shouldFilter, isLoading: institutionLoading } = useInstitutionFilter()

	// Fetch staff from MyJKKN
	const {
		data: staff,
		loading,
		error,
		refetch,
	} = useMyJKKNStaff({
		institution_code: shouldFilter ? filter.institution_code : undefined,
	})

	// Local state for filtering and pagination
	const [searchTerm, setSearchTerm] = useState("")
	const [statusFilter, setStatusFilter] = useState("all")
	const [departmentFilter, setDepartmentFilter] = useState("all")
	const [designationFilter, setDesignationFilter] = useState("all")
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)

	// Handle sorting
	const handleSort = (column: string) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
		} else {
			setSortColumn(column)
			setSortDirection('asc')
		}
	}

	// Filter and sort staff
	const filteredStaff = useMemo(() => {
		return staff
			.filter((member) => {
				const matchesSearch = member.staff_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
					member.staff_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
					member.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
					member.designation?.toLowerCase().includes(searchTerm.toLowerCase())
				const matchesStatus = statusFilter === "all" ||
					(statusFilter === "active" && member.is_active) ||
					(statusFilter === "inactive" && !member.is_active)
				const matchesDepartment = departmentFilter === "all" || member.department_code === departmentFilter
				const matchesDesignation = designationFilter === "all" || member.designation === designationFilter
				return matchesSearch && matchesStatus && matchesDepartment && matchesDesignation
			})
			.sort((a, b) => {
				if (!sortColumn) return 0

				let aValue: string | number
				let bValue: string | number

				switch (sortColumn) {
					case 'staff_code':
						aValue = a.staff_code?.toLowerCase() || ''
						bValue = b.staff_code?.toLowerCase() || ''
						break
					case 'staff_name':
						aValue = a.staff_name?.toLowerCase() || ''
						bValue = b.staff_name?.toLowerCase() || ''
						break
					case 'department_code':
						aValue = a.department_code?.toLowerCase() || ''
						bValue = b.department_code?.toLowerCase() || ''
						break
					case 'designation':
						aValue = a.designation?.toLowerCase() || ''
						bValue = b.designation?.toLowerCase() || ''
						break
					case 'status':
						aValue = a.is_active ? 1 : 0
						bValue = b.is_active ? 1 : 0
						break
					default:
						return 0
				}

				if (sortDirection === 'asc') {
					return aValue > bValue ? 1 : aValue < bValue ? -1 : 0
				} else {
					return aValue < bValue ? 1 : aValue > bValue ? -1 : 0
				}
			})
	}, [staff, searchTerm, statusFilter, departmentFilter, designationFilter, sortColumn, sortDirection])

	// Get unique values for filters
	const uniqueDepartments = useMemo(() => {
		return [...new Set(staff.map(s => s.department_code).filter(Boolean))].sort()
	}, [staff])

	const uniqueDesignations = useMemo(() => {
		return [...new Set(staff.map(s => s.designation).filter(Boolean))].sort()
	}, [staff])

	// Dynamic page size options
	const pageSizeOptions = useMemo(() => {
		const allSizes = [10, 20, 50, 100, 250, 500, 1000]
		const total = filteredStaff.length
		const options = allSizes.filter(s => s < total)
		if (!options.includes(10)) options.unshift(10)
		if (total > 10) options.push(total)
		return options
	}, [filteredStaff.length])

	// Effective per page (show all if itemsPerPage >= total)
	const isShowAll = itemsPerPage >= filteredStaff.length
	const effectivePerPage = isShowAll ? filteredStaff.length || 1 : itemsPerPage

	// Calculate pagination
	const totalPages = Math.ceil(filteredStaff.length / effectivePerPage)
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = startIndex + effectivePerPage
	const paginatedStaff = filteredStaff.slice(startIndex, endIndex)

	// Helper functions
	const getSortIcon = (column: string) => {
		if (sortColumn !== column) {
			return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
		}
		return sortDirection === 'asc'
			? <ArrowUp className="h-3 w-3" />
			: <ArrowDown className="h-3 w-3" />
	}

	// Export function
	const handleExport = () => {
		const excelData = filteredStaff.map((member, index) => ({
			'S.No': index + 1,
			'Staff Code': member.staff_code,
			'Staff Name': member.staff_name,
			'Email': member.email || '',
			'Phone': member.phone || '',
			'Designation': member.designation || '',
			'Department': member.department_code || '',
			'Qualification': member.qualification || '',
			'Specialization': member.specialization || '',
			'Institution': member.institution_code || '',
			'Status': member.is_active ? 'Active' : 'Inactive',
		}))

		const ws = XLSX.utils.json_to_sheet(excelData)
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Staff')
		XLSX.writeFile(wb, `staff_myjkkn_export_${new Date().toISOString().split('T')[0]}.xlsx`)

		toast({
			title: "Export Successful",
			description: `Exported ${excelData.length} staff members.`,
			className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
		})
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
									<BreadcrumbPage>Staff Directory (MyJKKN)</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Header Section */}
					<div className="flex items-center justify-between flex-shrink-0">
						<div>
							<h1 className="text-xl font-bold tracking-tight">Staff Directory</h1>
							<p className="text-xs text-muted-foreground">
								View staff profiles from MyJKKN master data
							</p>
						</div>
					</div>

					{/* MyJKKN Data Source Notice */}
					<Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
						<Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
						<AlertTitle className="text-blue-800 dark:text-blue-200">Data Source: MyJKKN</AlertTitle>
						<AlertDescription className="text-blue-700 dark:text-blue-300">
							This data is sourced from the MyJKKN platform. To manage staff profiles,
							please use the MyJKKN administration portal.
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
								<Button variant="link" className="h-auto p-0 ml-2" onClick={refetch}>
									Try again
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
										<p className="text-2xl font-bold tracking-tight">{staff.length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Staff</p>
									</div>
									<Users className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>

						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{staff.filter(s => s.is_active).length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Active Staff</p>
									</div>
									<Briefcase className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>

						<Card className="border-l-4 border-l-red-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{staff.filter(s => !s.is_active).length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Inactive Staff</p>
									</div>
									<Clock className="h-5 w-5 text-red-500/40" />
								</div>
							</CardContent>
						</Card>

						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{uniqueDepartments.length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Departments</p>
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
											<Users className="h-3 w-3 text-primary" />
										</div>
										<div>
											<h2 className="text-sm font-semibold">Staff</h2>
											<p className="text-xs text-muted-foreground">Browse and filter staff records from MyJKKN</p>
										</div>
									</div>
								</div>
								<div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
									<div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto flex-wrap">
										<Select value={statusFilter} onValueChange={setStatusFilter}>
											<SelectTrigger className="w-[120px] h-8">
												<SelectValue placeholder="Status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Status</SelectItem>
												<SelectItem value="active">Active</SelectItem>
												<SelectItem value="inactive">Inactive</SelectItem>
											</SelectContent>
										</Select>

										<Select value={departmentFilter} onValueChange={setDepartmentFilter}>
											<SelectTrigger className="w-[130px] h-8">
												<SelectValue placeholder="Department" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Depts</SelectItem>
												{uniqueDepartments.map(dept => (
													<SelectItem key={dept} value={dept!}>{dept}</SelectItem>
												))}
											</SelectContent>
										</Select>

										<Select value={designationFilter} onValueChange={setDesignationFilter}>
											<SelectTrigger className="w-[140px] h-8">
												<SelectValue placeholder="Designation" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Roles</SelectItem>
												{uniqueDesignations.map(des => (
													<SelectItem key={des} value={des!}>{des}</SelectItem>
												))}
											</SelectContent>
										</Select>

										<div className="relative w-full sm:w-[180px]">
											<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
											<Input
												placeholder="Search staff..."
												value={searchTerm}
												onChange={(e) => setSearchTerm(e.target.value)}
												className="pl-8 h-8 text-xs"
											/>
										</div>
									</div>

									<div className="flex gap-1 flex-wrap">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="outline"
													size="sm"
													className="h-8 w-8 p-0"
													onClick={refetch}
													disabled={isLoading}
												>
													<RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Refresh data</TooltipContent>
										</Tooltip>
										<Button
											variant="outline"
											size="sm"
											className="text-xs px-2 h-8"
											onClick={handleExport}
											disabled={filteredStaff.length === 0}
										>
											<Download className="h-3 w-3 mr-1" />
											Export
										</Button>
									</div>
								</div>
							</CardHeader>

							<CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
								<div className="rounded-md border overflow-hidden" style={{ height: '440px' }}>
									<div className="h-full overflow-auto">
										<Table>
											<TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
												<TableRow>
													<TableHead className="w-[110px] text-xs">
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleSort('staff_code')}
															className="h-auto p-0 font-medium hover:bg-transparent"
														>
															Staff Code
															<span className="ml-1">
																{getSortIcon('staff_code')}
															</span>
														</Button>
													</TableHead>
													<TableHead className="text-xs">
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleSort('staff_name')}
															className="h-auto p-0 font-medium hover:bg-transparent"
														>
															Staff Name
															<span className="ml-1">
																{getSortIcon('staff_name')}
															</span>
														</Button>
													</TableHead>
													<TableHead className="w-[130px] text-xs">
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleSort('designation')}
															className="h-auto p-0 font-medium hover:bg-transparent"
														>
															Designation
															<span className="ml-1">
																{getSortIcon('designation')}
															</span>
														</Button>
													</TableHead>
													<TableHead className="w-[100px] text-xs">
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleSort('department_code')}
															className="h-auto p-0 font-medium hover:bg-transparent"
														>
															Dept
															<span className="ml-1">
																{getSortIcon('department_code')}
															</span>
														</Button>
													</TableHead>
													<TableHead className="w-[130px] text-xs">Email</TableHead>
													<TableHead className="w-[80px] text-xs">
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
														<TableCell colSpan={6} className="h-32 text-center">
															<div className="flex flex-col items-center gap-2 text-muted-foreground">
																<RefreshCw className="h-5 w-5 animate-spin" />
																<span className="text-sm">Loading staff from MyJKKN...</span>
															</div>
														</TableCell>
													</TableRow>
												) : paginatedStaff.length > 0 ? (
													paginatedStaff.map((member) => (
														<TableRow key={member.id}>
															<TableCell className="font-medium text-sm">
																{member.staff_code}
															</TableCell>
															<TableCell className="text-sm">
																{member.staff_name}
															</TableCell>
															<TableCell className="text-sm">
																{member.designation || '-'}
															</TableCell>
															<TableCell className="text-sm">
																{member.department_code || '-'}
															</TableCell>
															<TableCell className="text-sm text-muted-foreground truncate max-w-[130px]">
																{member.email || '-'}
															</TableCell>
															<TableCell>
																<Badge variant={member.is_active ? "default" : "secondary"} className="text-xs">
																	{member.is_active ? "Active" : "Inactive"}
																</Badge>
															</TableCell>
														</TableRow>
													))
												) : (
													<TableRow>
														<TableCell colSpan={6} className="h-32 text-center">
															<div className="flex flex-col items-center gap-2 text-muted-foreground">
																<Users className="h-8 w-8 opacity-30" />
																<span className="text-sm">No staff members found.</span>
															</div>
														</TableCell>
													</TableRow>
												)}
											</TableBody>
										</Table>
									</div>
								</div>

								{/* Pagination Controls */}
								<div className="flex items-center justify-between pt-3">
									<div className="flex items-center gap-3">
										<p className="text-sm text-muted-foreground tabular-nums">
											{filteredStaff.length === 0 ? 'No results' : `${startIndex + 1}\u2013${Math.min(endIndex, filteredStaff.length)} of ${filteredStaff.length}`}
										</p>
										<div className="flex items-center gap-1.5">
											<span className="text-xs text-muted-foreground">Rows</span>
											<Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
												<SelectTrigger className="h-7 w-[70px] text-xs">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{pageSizeOptions.map((size) => (
														<SelectItem key={size} value={String(size)}>
															{size === filteredStaff.length ? 'All' : size}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
									<div className="flex items-center gap-1">
										<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 w-7 p-0"><ChevronLeft className="h-3.5 w-3.5" /></Button>
										<span className="text-xs text-muted-foreground px-2 tabular-nums">{currentPage} / {totalPages || 1}</span>
										<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="h-7 w-7 p-0"><ChevronRight className="h-3.5 w-3.5" /></Button>
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
