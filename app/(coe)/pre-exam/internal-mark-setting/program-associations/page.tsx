"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
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
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { useToast } from "@/hooks/common/use-toast"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
	PlusCircle,
	Search,
	ChevronLeft,
	ChevronRight,
	Edit,
	Trash2,
	RefreshCw,
	Layers,
	CheckCircle,
	XCircle,
	GraduationCap,
	Calendar,
	MoreHorizontal,
	Download,
	Upload,
	FileSpreadsheet,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import type { InternalAssessmentPattern, PatternProgramAssociation } from "@/types/internal-assessment-pattern"

interface Program {
	id: string
	program_code: string
	program_name: string
}

interface AssociationFormData {
	pattern_id: string
	program_id: string
	effective_from_date: string
	effective_to_date: string
	is_active: boolean
}

const defaultFormData: AssociationFormData = {
	pattern_id: "",
	program_id: "",
	effective_from_date: new Date().toISOString().split("T")[0],
	effective_to_date: "",
	is_active: true,
}

interface AssociationWithRelations extends PatternProgramAssociation {
	internal_assessment_patterns?: {
		id: string
		pattern_code: string
		pattern_name: string
		status: string
	}
	programs?: {
		id: string
		program_code: string
		program_name: string
	}
}

export default function ProgramAssociationsPage() {
	// State
	const [associations, setAssociations] = useState<AssociationWithRelations[]>([])
	const [patterns, setPatterns] = useState<InternalAssessmentPattern[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [patternFilter, setPatternFilter] = useState<string>("all")

	// Pagination
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)
	const [deleteTarget, setDeleteTarget] = useState<AssociationWithRelations | null>(null)

	// Form states
	const [sheetOpen, setSheetOpen] = useState(false)
	const [editing, setEditing] = useState<AssociationWithRelations | null>(null)
	const [formData, setFormData] = useState<AssociationFormData>(defaultFormData)
	const [errors, setErrors] = useState<Record<string, string>>({})

	// Delete confirmation
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [associationToDelete, setAssociationToDelete] = useState<AssociationWithRelations | null>(null)

	const { toast } = useToast()
	const { isReady, appendToUrl } = useInstitutionFilter()

	// Fetch associations
	const fetchAssociations = async () => {
		try {
			setLoading(true)
			const response = await fetch(appendToUrl("/api/internal-assessment-patterns/program-associations"))
			if (response.ok) {
				const data = await response.json()
				setAssociations(data)
			} else {
				throw new Error("Failed to fetch program associations")
			}
		} catch (error) {
			console.error("Error fetching program associations:", error)
			toast({
				title: "Error",
				description: "Failed to fetch program associations",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}

	// Fetch patterns for dropdown
	const fetchPatterns = async () => {
		try {
			const response = await fetch(appendToUrl("/api/internal-assessment-patterns"))
			if (response.ok) {
				const data = await response.json()
				setPatterns(data.filter((p: InternalAssessmentPattern) => p.status === "active"))
			}
		} catch (error) {
			console.error("Error fetching patterns:", error)
		}
	}

	// Fetch programs for dropdown
	const fetchPrograms = async () => {
		try {
			const response = await fetch(appendToUrl("/api/program"))
			if (response.ok) {
				const data = await response.json()
				setPrograms(data)
			}
		} catch (error) {
			console.error("Error fetching programs:", error)
		}
	}

	useEffect(() => {
		if (isReady) {
			fetchAssociations()
			fetchPatterns()
			fetchPrograms()
		}
	}, [isReady])

	// Filter associations
	const filteredAssociations = useMemo(() => {
		return associations.filter((assoc) => {
			const matchesSearch =
				assoc.program_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
				assoc.programs?.program_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
				assoc.internal_assessment_patterns?.pattern_name?.toLowerCase().includes(searchTerm.toLowerCase())
			const matchesPattern = patternFilter === "all" || assoc.pattern_id === patternFilter
			return matchesSearch && matchesPattern
		})
	}, [associations, searchTerm, patternFilter])

	// Dynamic page size options
	const pageSizeOptions = useMemo(() => {
		const allSizes = [10, 20, 50, 100, 250, 500, 1000]
		const total = filteredAssociations.length
		const options = allSizes.filter(s => s < total)
		if (!options.includes(10)) options.unshift(10)
		if (total > 10) options.push(total)
		return options
	}, [filteredAssociations.length])

	const isShowAll = itemsPerPage >= filteredAssociations.length
	const effectivePerPage = isShowAll ? filteredAssociations.length || 1 : itemsPerPage

	// Paginated associations
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = startIndex + effectivePerPage
	const paginatedAssociations = useMemo(() => {
		return filteredAssociations.slice(startIndex, endIndex)
	}, [filteredAssociations, startIndex, endIndex])

	const totalPages = Math.ceil(filteredAssociations.length / effectivePerPage) || 1

	// Stats
	const stats = useMemo(() => {
		const total = associations.length
		const active = associations.filter((a) => a.is_active).length
		const inactive = total - active
		const uniquePrograms = new Set(associations.map(a => a.program_id)).size
		return { total, active, inactive, uniquePrograms }
	}, [associations])

	// Validate form
	const validate = () => {
		const newErrors: Record<string, string> = {}

		if (!formData.pattern_id) {
			newErrors.pattern_id = "Pattern is required"
		}
		if (!formData.program_id) {
			newErrors.program_id = "Program is required"
		}
		if (!formData.effective_from_date) {
			newErrors.effective_from_date = "Effective from date is required"
		}

		if (formData.effective_to_date && formData.effective_from_date) {
			if (new Date(formData.effective_to_date) < new Date(formData.effective_from_date)) {
				newErrors.effective_to_date = "End date must be after start date"
			}
		}

		setErrors(newErrors)
		return Object.keys(newErrors).length === 0
	}

	// Save association
	const handleSave = async () => {
		if (!validate()) {
			toast({
				title: "Validation Error",
				description: "Please fix the errors before saving",
				variant: "destructive",
			})
			return
		}

		try {
			const selectedProgram = programs.find(p => p.id === formData.program_id)
			const payload = {
				...formData,
				program_code: selectedProgram?.program_code || "",
				effective_to_date: formData.effective_to_date || null,
			}

			const url = "/api/internal-assessment-patterns/program-associations"
			const method = editing ? "PUT" : "POST"
			const body = editing ? { id: editing.id, ...payload } : payload

			const response = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			})

			if (response.ok) {
				toast({
					title: editing ? "Association Updated" : "Association Created",
					description: `Program association has been ${editing ? "updated" : "created"} successfully`,
					className: "bg-green-50 border-green-200 text-green-800",
				})
				setSheetOpen(false)
				resetForm()
				fetchAssociations()
			} else {
				const errorData = await response.json()
				throw new Error(errorData.error || "Failed to save association")
			}
		} catch (error) {
			console.error("Error saving association:", error)
			toast({
				title: "Error",
				description: error instanceof Error ? error.message : "Failed to save association",
				variant: "destructive",
			})
		}
	}

	// Delete association
	const handleDelete = async () => {
		if (!associationToDelete) return

		try {
			const response = await fetch(`/api/internal-assessment-patterns/program-associations?id=${associationToDelete.id}`, {
				method: "DELETE",
			})

			if (response.ok) {
				toast({
					title: "Association Deleted",
					description: "Program association has been deleted",
					className: "bg-orange-50 border-orange-200 text-orange-800",
				})
				setDeleteDialogOpen(false)
				setAssociationToDelete(null)
				fetchAssociations()
			} else {
				const errorData = await response.json()
				throw new Error(errorData.error || "Failed to delete association")
			}
		} catch (error) {
			console.error("Error deleting association:", error)
			toast({
				title: "Error",
				description: error instanceof Error ? error.message : "Failed to delete association",
				variant: "destructive",
			})
		}
	}

	// Reset form
	const resetForm = () => {
		setFormData(defaultFormData)
		setEditing(null)
		setErrors({})
	}

	// Open edit
	const openEdit = (assoc: AssociationWithRelations) => {
		setEditing(assoc)
		setFormData({
			pattern_id: assoc.pattern_id,
			program_id: assoc.program_id,
			effective_from_date: assoc.effective_from_date,
			effective_to_date: assoc.effective_to_date || "",
			is_active: assoc.is_active,
		})
		setSheetOpen(true)
	}

	// Format date
	const formatDate = (dateStr: string | null) => {
		if (!dateStr) return "-"
		return new Date(dateStr).toLocaleDateString()
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<main className="flex-1 p-6 space-y-6">
					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/dashboard">Dashboard</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/pre-exam/internal-mark-setting">Internal Mark Setting</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Program Associations</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page Header */}
					<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
						<div>
							<h1 className="text-2xl font-bold tracking-tight">Program Associations</h1>
							<p className="text-muted-foreground">
								Link programs to assessment patterns (default patterns for all courses in a program)
							</p>
						</div>
						<Button
							onClick={() => {
								resetForm()
								setSheetOpen(true)
							}}
							className="bg-brand-green hover:bg-brand-green-600"
						>
							<PlusCircle className="mr-2 h-4 w-4" />
							Add Association
						</Button>
					</div>

					{/* Stats Cards */}
					<div className="grid gap-4 md:grid-cols-4">
						<Card className="border-l-4 border-l-blue-500">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">Total Associations</CardTitle>
								<Layers className="h-4 w-4 text-blue-500" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{stats.total}</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-green-500">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">Active</CardTitle>
								<CheckCircle className="h-4 w-4 text-green-500" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{stats.active}</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-gray-500">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">Inactive</CardTitle>
								<XCircle className="h-4 w-4 text-gray-500" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{stats.inactive}</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-purple-500">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">Unique Programs</CardTitle>
								<GraduationCap className="h-4 w-4 text-purple-500" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{stats.uniquePrograms}</div>
							</CardContent>
						</Card>
					</div>

					{/* Filters */}
					<Card>
						<CardContent className="pt-6">
							<div className="flex flex-col gap-4 md:flex-row md:items-center">
								{/* Search */}
								<div className="relative flex-1">
									<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										placeholder="Search by program or pattern..."
										value={searchTerm}
										onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
										className="pl-9 h-9"
									/>
								</div>

								{/* Pattern Filter */}
								<Select
									value={patternFilter}
									onValueChange={(v) => { setPatternFilter(v); setCurrentPage(1) }}
								>
									<SelectTrigger className="w-[250px] h-9">
										<SelectValue placeholder="All Patterns" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Patterns</SelectItem>
										{patterns.map((pattern) => (
											<SelectItem key={pattern.id} value={pattern.id}>
												{pattern.pattern_code} - {pattern.pattern_name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>

								{/* Refresh Button */}
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												variant="outline"
												size="sm"
												onClick={fetchAssociations}
												className="h-9"
											>
												<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
											</Button>
										</TooltipTrigger>
										<TooltipContent>Refresh Data</TooltipContent>
									</Tooltip>
								</TooltipProvider>

								{/* Export Dropdown */}
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="outline" size="sm" className="h-9">
											<FileSpreadsheet className="h-4 w-4 mr-1" />
											Export
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem>
											<Download className="h-4 w-4 mr-2" />
											Export CSV
										</DropdownMenuItem>
										<DropdownMenuItem>
											<FileSpreadsheet className="h-4 w-4 mr-2" />
											Export Excel
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem>
											<Upload className="h-4 w-4 mr-2" />
											Import
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</CardContent>
					</Card>

					{/* Associations Table */}
					<Card>
						<CardContent className="pt-6">
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="text-xs">Program Code</TableHead>
											<TableHead className="text-xs">Program Name</TableHead>
											<TableHead className="text-xs">Pattern</TableHead>
											<TableHead className="text-xs">Effective From</TableHead>
											<TableHead className="text-xs">Effective To</TableHead>
											<TableHead className="text-xs">Status</TableHead>
											<TableHead className="text-xs text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{loading ? (
											<TableRow>
												<TableCell colSpan={7} className="text-center py-8">
													<RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
													<p className="text-sm text-muted-foreground mt-2">Loading associations...</p>
												</TableCell>
											</TableRow>
										) : paginatedAssociations.length === 0 ? (
											<TableRow>
												<TableCell colSpan={7} className="text-center py-8">
													<Layers className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
													<p className="text-sm text-muted-foreground">No program associations found</p>
													<Button
														variant="link"
														onClick={() => setSheetOpen(true)}
														className="mt-2"
													>
														Create your first association
													</Button>
												</TableCell>
											</TableRow>
										) : (
											paginatedAssociations.map((assoc) => (
												<TableRow key={assoc.id}>
													<TableCell className="text-sm font-medium">{assoc.program_code}</TableCell>
													<TableCell className="text-sm">{assoc.programs?.program_name || "-"}</TableCell>
													<TableCell className="text-sm">
														<Badge variant="outline" className="text-xs">
															{assoc.internal_assessment_patterns?.pattern_code} - {assoc.internal_assessment_patterns?.pattern_name}
														</Badge>
													</TableCell>
													<TableCell className="text-sm">{formatDate(assoc.effective_from_date)}</TableCell>
													<TableCell className="text-sm">{formatDate(assoc.effective_to_date)}</TableCell>
													<TableCell>
														<Badge className={assoc.is_active
															? "bg-green-100 text-green-800 text-xs"
															: "bg-gray-100 text-gray-800 text-xs"
														}>
															{assoc.is_active ? "Active" : "Inactive"}
														</Badge>
													</TableCell>
													<TableCell className="text-right">
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button variant="ghost" size="sm" className="h-7 w-7 p-0">
																	<MoreHorizontal className="h-4 w-4" />
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																<DropdownMenuItem onClick={() => openEdit(assoc)}>
																	<Edit className="h-4 w-4 mr-2" />
																	Edit
																</DropdownMenuItem>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	className="text-destructive focus:text-destructive"
																	onClick={() => {
																		setAssociationToDelete(assoc)
																		setDeleteDialogOpen(true)
																	}}
																>
																	<Trash2 className="h-4 w-4 mr-2" />
																	Delete
																</DropdownMenuItem>
															</DropdownMenuContent>
														</DropdownMenu>
													</TableCell>
												</TableRow>
											))
										)}
									</TableBody>
								</Table>
							</div>

							{/* Pagination */}
							<div className="flex items-center justify-between pt-3">
								<div className="flex items-center gap-3">
									<p className="text-sm text-muted-foreground tabular-nums">
										{filteredAssociations.length === 0
											? "No results"
											: `${startIndex + 1}\u2013${Math.min(endIndex, filteredAssociations.length)} of ${filteredAssociations.length}`}
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
														{size === filteredAssociations.length ? "All" : size}
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
				</main>
				<AppFooter />
			</SidebarInset>

			{/* Association Form Sheet */}
			<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
				<SheetContent className="sm:max-w-[600px] overflow-y-auto">
					<SheetHeader className="space-y-4 pb-6 border-b">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
								<Layers className="h-5 w-5 text-white" />
							</div>
							<div>
								<SheetTitle className="text-xl">
									{editing ? "Edit Program Association" : "Add Program Association"}
								</SheetTitle>
								<SheetDescription>
									Link a program to a specific assessment pattern
								</SheetDescription>
							</div>
						</div>
					</SheetHeader>

					<div className="py-6 space-y-8">
						{/* Pattern & Program Selection */}
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<Layers className="h-5 w-5 text-brand-green" />
								<h3 className="text-lg font-semibold">Association Details</h3>
							</div>
							<Separator />

							<div className="space-y-2">
								<Label htmlFor="pattern_id">
									Assessment Pattern <span className="text-red-500">*</span>
								</Label>
								<Select
									value={formData.pattern_id}
									onValueChange={(v) => setFormData({ ...formData, pattern_id: v })}
								>
									<SelectTrigger className={errors.pattern_id ? "border-red-500" : ""}>
										<SelectValue placeholder="Select pattern" />
									</SelectTrigger>
									<SelectContent>
										{patterns.map((pattern) => (
											<SelectItem key={pattern.id} value={pattern.id}>
												{pattern.pattern_code} - {pattern.pattern_name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{errors.pattern_id && (
									<p className="text-xs text-red-500">{errors.pattern_id}</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="program_id">
									Program <span className="text-red-500">*</span>
								</Label>
								<Select
									value={formData.program_id}
									onValueChange={(v) => setFormData({ ...formData, program_id: v })}
									disabled={!!editing}
								>
									<SelectTrigger className={errors.program_id ? "border-red-500" : ""}>
										<SelectValue placeholder="Select program" />
									</SelectTrigger>
									<SelectContent>
										{programs.map((program) => (
											<SelectItem key={program.id} value={program.id}>
												{program.program_code} - {program.program_name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{errors.program_id && (
									<p className="text-xs text-red-500">{errors.program_id}</p>
								)}
							</div>
						</div>

						{/* Effective Dates */}
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<Calendar className="h-5 w-5 text-brand-green" />
								<h3 className="text-lg font-semibold">Effective Period</h3>
							</div>
							<Separator />

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="effective_from_date">
										Effective From <span className="text-red-500">*</span>
									</Label>
									<Input
										id="effective_from_date"
										type="date"
										value={formData.effective_from_date}
										onChange={(e) => setFormData({ ...formData, effective_from_date: e.target.value })}
										className={errors.effective_from_date ? "border-red-500" : ""}
									/>
									{errors.effective_from_date && (
										<p className="text-xs text-red-500">{errors.effective_from_date}</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="effective_to_date">Effective To</Label>
									<Input
										id="effective_to_date"
										type="date"
										value={formData.effective_to_date}
										onChange={(e) => setFormData({ ...formData, effective_to_date: e.target.value })}
										className={errors.effective_to_date ? "border-red-500" : ""}
									/>
									{errors.effective_to_date && (
										<p className="text-xs text-red-500">{errors.effective_to_date}</p>
									)}
									<p className="text-xs text-muted-foreground">Leave empty for indefinite</p>
								</div>
							</div>
						</div>

						{/* Status */}
						<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
							<div className="space-y-0.5">
								<Label>Active</Label>
								<p className="text-xs text-muted-foreground">
									Enable this association
								</p>
							</div>
							<Switch
								checked={formData.is_active}
								onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
							/>
						</div>

						{/* Actions */}
						<div className="flex justify-end gap-3 pt-4 border-t">
							<Button
								variant="outline"
								onClick={() => {
									resetForm()
									setSheetOpen(false)
								}}
							>
								Cancel
							</Button>
							<Button
								onClick={handleSave}
								className="bg-brand-green hover:bg-brand-green-600"
							>
								{editing ? "Update Association" : "Create Association"}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Program Association?</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete the association for program &quot;{associationToDelete?.program_code}&quot;?
							This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
