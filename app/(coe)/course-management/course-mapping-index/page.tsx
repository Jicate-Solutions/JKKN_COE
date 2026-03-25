"use client"

import { useState, useEffect, useMemo } from "react"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import { FileText, Search, BookOpen, Edit2, RefreshCw, MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight, Layers } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { generateCourseMappingPDF } from "@/lib/utils/generate-course-mapping-pdf"

type CourseMappingGroup = {
	institution_code: string
	program_code: string
	regulation_code: string
	institution_name?: string
	program_name?: string
	regulation_name?: string
	total_courses: number
	created_at?: string
}

export default function CourseMappingIndexPage() {
	const [loading, setLoading] = useState(false)
	const [groups, setGroups] = useState<CourseMappingGroup[]>([])
	const [searchTerm, setSearchTerm] = useState("")
	const [itemsPerPage, setItemsPerPage] = useState(10)
	const [currentPage, setCurrentPage] = useState(1)
	const { toast } = useToast()

	// Institution context for filtering
	const {
		institutionCode: contextInstitutionCode,
		isReady: institutionContextReady,
		appendToUrl
	} = useInstitutionFilter()

	// Fetch course mapping groups with institution filter
	const fetchCourseMappingGroups = async () => {
		try {
			setLoading(true)
			// Build URL with institution filter
			let url = '/api/course-management/course-mapping/groups'
			if (contextInstitutionCode) {
				url = appendToUrl(url)
			}
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setGroups(data)
			} else {
				const error = await res.json()
				toast({
					title: 'Error',
					description: error.error || 'Failed to fetch course mapping groups',
					variant: 'destructive'
				})
			}
		} catch (err) {
			console.error('Error fetching course mapping groups:', err)
			toast({
				title: 'Error',
				description: 'Failed to load course mapping groups. Please try again.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}

	// Fetch data when institution context is ready or changes
	useEffect(() => {
		if (!institutionContextReady) return
		fetchCourseMappingGroups()
	}, [institutionContextReady, contextInstitutionCode])

	// Filter groups based on search term
	const filteredGroups = useMemo(() => groups.filter(group => {
		const searchLower = searchTerm.toLowerCase()
		return (
			group.institution_code?.toLowerCase().includes(searchLower) ||
			group.institution_name?.toLowerCase().includes(searchLower) ||
			group.program_code?.toLowerCase().includes(searchLower) ||
			group.program_name?.toLowerCase().includes(searchLower) ||
			group.regulation_code?.toLowerCase().includes(searchLower) ||
			group.regulation_name?.toLowerCase().includes(searchLower)
		)
	}), [groups, searchTerm])

	// Dynamic page size options
	const pageSizeOptions = useMemo(() => {
		const allSizes = [10, 20, 50, 100, 250, 500, 1000]
		const total = filteredGroups.length
		const options = allSizes.filter(s => s < total)
		if (!options.includes(10)) options.unshift(10)
		if (total > 10) options.push(total)
		return options
	}, [filteredGroups.length])

	const isShowAll = itemsPerPage >= filteredGroups.length
	const effectivePerPage = isShowAll ? filteredGroups.length || 1 : itemsPerPage

	// Pagination
	const totalPages = Math.ceil(filteredGroups.length / effectivePerPage) || 1
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = startIndex + effectivePerPage
	const currentGroups = filteredGroups.slice(startIndex, endIndex)

	// Reset page when search or page size changes
	useEffect(() => {
		setCurrentPage(1)
	}, [searchTerm, itemsPerPage])

	// Stats
	const stats = useMemo(() => ({
		total: groups.length,
		totalCourses: groups.reduce((sum, g) => sum + (g.total_courses || 0), 0),
		uniquePrograms: new Set(groups.map(g => g.program_code)).size,
		uniqueRegulations: new Set(groups.map(g => g.regulation_code)).size,
	}), [groups])

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0">
					<div className="flex items-center gap-2">
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link href="/dashboard">Dashboard</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Course Mapping</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Scorecards */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.total}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Mappings</p>
									</div>
									<Layers className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.totalCourses}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Courses</p>
									</div>
									<BookOpen className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.uniquePrograms}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Unique Programs</p>
									</div>
									<FileText className="h-5 w-5 text-purple-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.uniqueRegulations}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Regulations</p>
									</div>
									<BookOpen className="h-5 w-5 text-amber-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

					<TooltipProvider delayDuration={300}>
				<Card className="flex-1 flex flex-col min-h-0">
						<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<div>
										<h2 className="text-base font-semibold">Course Mapping</h2>
										<p className="text-xs text-muted-foreground">View and manage course mappings by program and regulation</p>
									</div>
									<div className="flex items-center gap-1.5">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={fetchCourseMappingGroups} disabled={loading}>
													<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Refresh</TooltipContent>
										</Tooltip>
										<Button variant="outline" size="sm" className="h-8 text-sm px-3" asChild>
											<Link href="/course-management/course-mapping/add">
												<Edit2 className="h-3.5 w-3.5 mr-1.5" />
												Add New Mapping
											</Link>
										</Button>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<div className="relative flex-1 lg:w-[260px]">
										<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
										<Input
											value={searchTerm}
											onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
											placeholder="Search mappings..."
											className="pl-8 h-8 text-sm"
										/>
									</div>
								</div>
							</div>
						</CardHeader>

						<CardContent className="flex-1 overflow-auto p-0">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-muted/50">
											<TableRow>
												<TableHead className="w-[200px] font-semibold text-xs h-8">Institution</TableHead>
												<TableHead className="w-[150px] font-semibold text-xs h-8">Program Code</TableHead>
												<TableHead className="w-[250px] font-semibold text-xs h-8">Program Name</TableHead>
												<TableHead className="font-semibold text-xs h-8">Regulation</TableHead>
												<TableHead className="text-center font-semibold text-xs h-8">Total Courses</TableHead>
												<TableHead className="text-center font-semibold text-xs h-8">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{loading ? (
												<TableRow>
													<TableCell colSpan={6} className="h-32 text-center">
														<div className="flex flex-col items-center gap-2 text-muted-foreground">
															<RefreshCw className="h-5 w-5 animate-spin" />
															<span className="text-sm">Loading course mappings...</span>
														</div>
													</TableCell>
												</TableRow>
											) : currentGroups.length === 0 ? (
												<TableRow>
													<TableCell colSpan={6} className="h-32 text-center">
														<div className="flex flex-col items-center gap-2 text-muted-foreground">
															<BookOpen className="h-8 w-8 opacity-20" />
															<span className="text-sm">{searchTerm ? 'No matching records found' : 'No course mappings found'}</span>
															{!searchTerm && <span className="text-xs">Create your first mapping to get started</span>}
														</div>
													</TableCell>
												</TableRow>
											) : (
												currentGroups.map((group) => (
													<TableRow key={`${group.institution_code}-${group.program_code}-${group.regulation_code}`} className="hover:bg-muted/50">
														<TableCell className="py-2">
															<div className="flex flex-col">
																<span className="font-medium text-sm">
																	{group.institution_name || group.institution_code}
																</span>
																<span className="text-xs text-muted-foreground">
																	{group.institution_code}
																</span>
															</div>
														</TableCell>
														<TableCell className="py-2">
															<span className="font-mono text-sm">{group.program_code}</span>
														</TableCell>
														<TableCell className="py-2">
															<span className="text-sm">{group.program_name || '-'}</span>
														</TableCell>
														<TableCell className="py-2">
															<div className="flex flex-col">
																<span className="text-sm">{group.regulation_code}</span>
																{group.regulation_name && (
																	<span className="text-xs text-muted-foreground">{group.regulation_name}</span>
																)}
															</div>
														</TableCell>
														<TableCell className="text-center py-2">
															<Badge variant="secondary" className="font-semibold text-xs h-5">
																{group.total_courses}
															</Badge>
														</TableCell>
														<TableCell className="text-center py-2">
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button variant="ghost" size="sm" className="h-7 w-7 p-0">
																		<MoreHorizontal className="h-4 w-4" />
																	</Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="end" className="w-40">
																	<DropdownMenuItem asChild>
																		<Link href={`/course-management/course-mapping/edit?institution=${group.institution_code}&program=${group.program_code}&regulation=${group.regulation_code}`}>
																			<Edit2 className="h-3.5 w-3.5 mr-2" />
																			Edit Mapping
																		</Link>
																	</DropdownMenuItem>
																	<DropdownMenuSeparator />
																	<DropdownMenuItem
																		onClick={async () => {
																			try {
																				const response = await fetch(`/api/course-management/course-mapping/report?institution_code=${group.institution_code}&program_code=${group.program_code}&regulation_code=${group.regulation_code}`)

																				if (!response.ok) {
																					throw new Error('Failed to fetch report data')
																				}

																				const reportData = await response.json()

																				if (!reportData.mappings || reportData.mappings.length === 0) {
																					toast({
																						title: 'No Data',
																						description: 'No course mappings found.',
																						variant: 'destructive'
																					})
																					return
																				}

																				generateCourseMappingPDF(reportData)

																				toast({
																					title: 'PDF Generated',
																					description: 'Course mapping report has been downloaded',
																					className: 'bg-green-50 border-green-200 text-green-800'
																				})
																			} catch (error) {
																				toast({
																					title: 'Error',
																					description: 'Failed to generate PDF',
																					variant: 'destructive'
																				})
																			}
																		}}
																	>
																		<FileText className="h-3.5 w-3.5 mr-2" />
																		Export PDF
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>

							{/* Pagination */}
							<div className="flex items-center justify-between pt-3 px-4 pb-3 border-t">
								<div className="flex items-center gap-3">
									<p className="text-sm text-muted-foreground tabular-nums">
										{filteredGroups.length === 0 ? 'No results' : `${startIndex + 1}\u2013${Math.min(endIndex, filteredGroups.length)} of ${filteredGroups.length}`}
									</p>
									<div className="flex items-center gap-1.5">
										<span className="text-xs text-muted-foreground">Rows</span>
										<Select
											value={String(itemsPerPage)}
											onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}
										>
											<SelectTrigger className="h-7 w-[70px] text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{pageSizeOptions.map((size) => (
													<SelectItem key={size} value={String(size)}>
														{size === filteredGroups.length ? 'All' : size}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>
								<div className="flex items-center gap-1">
									<Button
										variant="outline"
										size="sm"
										onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
										disabled={currentPage === 1}
										className="h-7 w-7 p-0"
									>
										<ChevronLeft className="h-3.5 w-3.5" />
									</Button>
									<span className="text-xs text-muted-foreground px-2 tabular-nums">
										{currentPage} / {totalPages}
									</span>
									<Button
										variant="outline"
										size="sm"
										onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
										disabled={currentPage >= totalPages}
										className="h-7 w-7 p-0"
									>
										<ChevronRight className="h-3.5 w-3.5" />
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
