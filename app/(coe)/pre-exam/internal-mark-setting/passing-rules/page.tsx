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
import { Textarea } from "@/components/ui/textarea"
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
	Target,
	CheckCircle,
	XCircle,
	Percent,
	Gift,
	Award,
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
import type { InternalAssessmentPassingRule, InternalAssessmentPattern } from "@/types/internal-assessment-pattern"

interface PassingRuleFormData {
	pattern_id: string
	rule_code: string
	rule_name: string
	rule_description: string
	minimum_pass_percentage: string
	component_wise_minimum_enabled: boolean
	component_wise_minimum_percentage: string
	grace_mark_enabled: boolean
	grace_mark_percentage_limit: string
	apply_rounding_before_pass_check: boolean
	priority_order: string
	is_active: boolean
}

const defaultFormData: PassingRuleFormData = {
	pattern_id: "",
	rule_code: "",
	rule_name: "",
	rule_description: "",
	minimum_pass_percentage: "",
	component_wise_minimum_enabled: false,
	component_wise_minimum_percentage: "",
	grace_mark_enabled: false,
	grace_mark_percentage_limit: "",
	apply_rounding_before_pass_check: true,
	priority_order: "1",
	is_active: true,
}

interface RuleWithPattern extends InternalAssessmentPassingRule {
	internal_assessment_patterns?: {
		pattern_code: string
		pattern_name: string
	}
}

export default function PassingRulesPage() {
	// State
	const [rules, setRules] = useState<RuleWithPattern[]>([])
	const [patterns, setPatterns] = useState<InternalAssessmentPattern[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [patternFilter, setPatternFilter] = useState<string>("all")

	// Pagination
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)
	const [deleteTarget, setDeleteTarget] = useState<RuleWithPattern | null>(null)

	// Form states
	const [sheetOpen, setSheetOpen] = useState(false)
	const [editing, setEditing] = useState<RuleWithPattern | null>(null)
	const [formData, setFormData] = useState<PassingRuleFormData>(defaultFormData)
	const [errors, setErrors] = useState<Record<string, string>>({})

	// Delete confirmation
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [ruleToDelete, setRuleToDelete] = useState<RuleWithPattern | null>(null)

	const { toast } = useToast()

	// Fetch rules
	const fetchRules = async () => {
		try {
			setLoading(true)
			const response = await fetch("/api/internal-assessment-patterns/passing-rules")
			if (response.ok) {
				const data = await response.json()
				setRules(data)
			} else {
				throw new Error("Failed to fetch passing rules")
			}
		} catch (error) {
			console.error("Error fetching passing rules:", error)
			toast({
				title: "Error",
				description: "Failed to fetch passing rules",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}

	// Fetch patterns for dropdown
	const fetchPatterns = async () => {
		try {
			const response = await fetch("/api/internal-assessment-patterns")
			if (response.ok) {
				const data = await response.json()
				setPatterns(data)
			}
		} catch (error) {
			console.error("Error fetching patterns:", error)
		}
	}

	useEffect(() => {
		fetchRules()
		fetchPatterns()
	}, [])

	// Filter rules
	const filteredRules = useMemo(() => {
		return rules.filter((rule) => {
			const matchesSearch =
				rule.rule_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
				rule.rule_name.toLowerCase().includes(searchTerm.toLowerCase())
			const matchesPattern = patternFilter === "all" || rule.pattern_id === patternFilter
			return matchesSearch && matchesPattern
		})
	}, [rules, searchTerm, patternFilter])

	// Dynamic page size options
	const pageSizeOptions = useMemo(() => {
		const allSizes = [10, 20, 50, 100, 250, 500, 1000]
		const total = filteredRules.length
		const options = allSizes.filter(s => s < total)
		if (!options.includes(10)) options.unshift(10)
		if (total > 10) options.push(total)
		return options
	}, [filteredRules.length])

	const isShowAll = itemsPerPage >= filteredRules.length
	const effectivePerPage = isShowAll ? filteredRules.length || 1 : itemsPerPage

	// Paginated rules
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = startIndex + effectivePerPage
	const paginatedRules = useMemo(() => {
		return filteredRules.slice(startIndex, endIndex)
	}, [filteredRules, startIndex, endIndex])

	const totalPages = Math.ceil(filteredRules.length / effectivePerPage) || 1

	// Stats
	const stats = useMemo(() => {
		const total = rules.length
		const active = rules.filter((r) => r.is_active).length
		const inactive = total - active
		const withGrace = rules.filter((r) => r.grace_mark_enabled).length
		return { total, active, inactive, withGrace }
	}, [rules])

	// Validate form
	const validate = () => {
		const newErrors: Record<string, string> = {}

		if (!formData.pattern_id) {
			newErrors.pattern_id = "Pattern is required"
		}
		if (!formData.rule_code.trim()) {
			newErrors.rule_code = "Rule code is required"
		}
		if (!formData.rule_name.trim()) {
			newErrors.rule_name = "Rule name is required"
		}
		if (!formData.minimum_pass_percentage) {
			newErrors.minimum_pass_percentage = "Minimum pass percentage is required"
		} else {
			const val = parseFloat(formData.minimum_pass_percentage)
			if (isNaN(val) || val < 0 || val > 100) {
				newErrors.minimum_pass_percentage = "Must be between 0 and 100"
			}
		}

		if (formData.component_wise_minimum_enabled && formData.component_wise_minimum_percentage) {
			const val = parseFloat(formData.component_wise_minimum_percentage)
			if (isNaN(val) || val < 0 || val > 100) {
				newErrors.component_wise_minimum_percentage = "Must be between 0 and 100"
			}
		}

		if (formData.grace_mark_enabled && formData.grace_mark_percentage_limit) {
			const val = parseFloat(formData.grace_mark_percentage_limit)
			if (isNaN(val) || val < 0 || val > 100) {
				newErrors.grace_mark_percentage_limit = "Must be between 0 and 100"
			}
		}

		setErrors(newErrors)
		return Object.keys(newErrors).length === 0
	}

	// Save rule
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
			const payload = {
				...formData,
				minimum_pass_percentage: parseFloat(formData.minimum_pass_percentage),
				component_wise_minimum_percentage: formData.component_wise_minimum_percentage ? parseFloat(formData.component_wise_minimum_percentage) : null,
				grace_mark_percentage_limit: formData.grace_mark_percentage_limit ? parseFloat(formData.grace_mark_percentage_limit) : null,
				priority_order: parseInt(formData.priority_order) || 1,
			}

			const url = "/api/internal-assessment-patterns/passing-rules"
			const method = editing ? "PUT" : "POST"
			const body = editing ? { id: editing.id, ...payload } : payload

			const response = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			})

			if (response.ok) {
				const savedRule = await response.json()
				toast({
					title: editing ? "Rule Updated" : "Rule Created",
					description: `${savedRule.rule_name} has been ${editing ? "updated" : "created"} successfully`,
					className: "bg-green-50 border-green-200 text-green-800",
				})
				setSheetOpen(false)
				resetForm()
				fetchRules()
			} else {
				const errorData = await response.json()
				throw new Error(errorData.error || "Failed to save rule")
			}
		} catch (error) {
			console.error("Error saving rule:", error)
			toast({
				title: "Error",
				description: error instanceof Error ? error.message : "Failed to save rule",
				variant: "destructive",
			})
		}
	}

	// Delete rule
	const handleDelete = async () => {
		if (!ruleToDelete) return

		try {
			const response = await fetch(`/api/internal-assessment-patterns/passing-rules?id=${ruleToDelete.id}`, {
				method: "DELETE",
			})

			if (response.ok) {
				toast({
					title: "Rule Deleted",
					description: `${ruleToDelete.rule_name} has been deleted`,
					className: "bg-orange-50 border-orange-200 text-orange-800",
				})
				setDeleteDialogOpen(false)
				setRuleToDelete(null)
				fetchRules()
			} else {
				const errorData = await response.json()
				throw new Error(errorData.error || "Failed to delete rule")
			}
		} catch (error) {
			console.error("Error deleting rule:", error)
			toast({
				title: "Error",
				description: error instanceof Error ? error.message : "Failed to delete rule",
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
	const openEdit = (rule: RuleWithPattern) => {
		setEditing(rule)
		setFormData({
			pattern_id: rule.pattern_id,
			rule_code: rule.rule_code,
			rule_name: rule.rule_name,
			rule_description: rule.rule_description || "",
			minimum_pass_percentage: rule.minimum_pass_percentage.toString(),
			component_wise_minimum_enabled: rule.component_wise_minimum_enabled,
			component_wise_minimum_percentage: rule.component_wise_minimum_percentage?.toString() || "",
			grace_mark_enabled: rule.grace_mark_enabled,
			grace_mark_percentage_limit: rule.grace_mark_percentage_limit?.toString() || "",
			apply_rounding_before_pass_check: rule.apply_rounding_before_pass_check,
			priority_order: rule.priority_order.toString(),
			is_active: rule.is_active,
		})
		setSheetOpen(true)
	}

	// Get pattern name
	const getPatternName = (patternId: string) => {
		const pattern = patterns.find(p => p.id === patternId)
		return pattern ? `${pattern.pattern_code} - ${pattern.pattern_name}` : patternId
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
								<BreadcrumbPage>Passing Rules</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page Header */}
					<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
						<div>
							<h1 className="text-2xl font-bold tracking-tight">Passing Rules</h1>
							<p className="text-muted-foreground">
								Define rules for determining if learner has passed or needs support
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
							Add Rule
						</Button>
					</div>

					{/* Stats Cards */}
					<div className="grid gap-4 md:grid-cols-4">
						<Card className="border-l-4 border-l-blue-500">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">Total Rules</CardTitle>
								<Target className="h-4 w-4 text-blue-500" />
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
								<CardTitle className="text-sm font-medium">With Grace Marks</CardTitle>
								<Gift className="h-4 w-4 text-purple-500" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{stats.withGrace}</div>
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
										placeholder="Search rules..."
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
												onClick={fetchRules}
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

					{/* Rules Table */}
					<Card>
						<CardContent className="pt-6">
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="text-xs">Rule Code</TableHead>
											<TableHead className="text-xs">Rule Name</TableHead>
											<TableHead className="text-xs">Pattern</TableHead>
											<TableHead className="text-xs">Min Pass %</TableHead>
											<TableHead className="text-xs">Component Min</TableHead>
											<TableHead className="text-xs">Grace Marks</TableHead>
											<TableHead className="text-xs">Priority</TableHead>
											<TableHead className="text-xs">Status</TableHead>
											<TableHead className="text-xs text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{loading ? (
											<TableRow>
												<TableCell colSpan={9} className="text-center py-8">
													<RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
													<p className="text-sm text-muted-foreground mt-2">Loading rules...</p>
												</TableCell>
											</TableRow>
										) : paginatedRules.length === 0 ? (
											<TableRow>
												<TableCell colSpan={9} className="text-center py-8">
													<Target className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
													<p className="text-sm text-muted-foreground">No passing rules found</p>
													<Button
														variant="link"
														onClick={() => setSheetOpen(true)}
														className="mt-2"
													>
														Create your first rule
													</Button>
												</TableCell>
											</TableRow>
										) : (
											paginatedRules.map((rule) => (
												<TableRow key={rule.id}>
													<TableCell className="text-sm font-medium">{rule.rule_code}</TableCell>
													<TableCell className="text-sm">{rule.rule_name}</TableCell>
													<TableCell className="text-sm">
														<Badge variant="outline" className="text-xs">
															{getPatternName(rule.pattern_id)}
														</Badge>
													</TableCell>
													<TableCell className="text-sm font-semibold text-green-600">
														{rule.minimum_pass_percentage}%
													</TableCell>
													<TableCell className="text-sm">
														{rule.component_wise_minimum_enabled ? (
															<Badge className="bg-blue-100 text-blue-800 text-xs">
																{rule.component_wise_minimum_percentage}%
															</Badge>
														) : (
															<Badge variant="secondary" className="text-xs">Disabled</Badge>
														)}
													</TableCell>
													<TableCell className="text-sm">
														{rule.grace_mark_enabled ? (
															<Badge className="bg-purple-100 text-purple-800 text-xs">
																Up to {rule.grace_mark_percentage_limit || 0}%
															</Badge>
														) : (
															<Badge variant="secondary" className="text-xs">Disabled</Badge>
														)}
													</TableCell>
													<TableCell className="text-sm">{rule.priority_order}</TableCell>
													<TableCell>
														<Badge className={rule.is_active
															? "bg-green-100 text-green-800 text-xs"
															: "bg-gray-100 text-gray-800 text-xs"
														}>
															{rule.is_active ? "Active" : "Inactive"}
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
																<DropdownMenuItem onClick={() => openEdit(rule)}>
																	<Edit className="h-4 w-4 mr-2" />
																	Edit
																</DropdownMenuItem>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	className="text-destructive focus:text-destructive"
																	onClick={() => {
																		setRuleToDelete(rule)
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
										{filteredRules.length === 0
											? "No results"
											: `${startIndex + 1}\u2013${Math.min(endIndex, filteredRules.length)} of ${filteredRules.length}`}
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
														{size === filteredRules.length ? "All" : size}
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

			{/* Rule Form Sheet */}
			<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
				<SheetContent className="sm:max-w-[700px] overflow-y-auto">
					<SheetHeader className="space-y-4 pb-6 border-b">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
								<Target className="h-5 w-5 text-white" />
							</div>
							<div>
								<SheetTitle className="text-xl">
									{editing ? "Edit Passing Rule" : "Add Passing Rule"}
								</SheetTitle>
								<SheetDescription>
									Define criteria for determining pass/fail status
								</SheetDescription>
							</div>
						</div>
					</SheetHeader>

					<div className="py-6 space-y-8">
						{/* Basic Information */}
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<Target className="h-5 w-5 text-brand-green" />
								<h3 className="text-lg font-semibold">Basic Information</h3>
							</div>
							<Separator />

							<div className="space-y-2">
								<Label htmlFor="pattern_id">
									Pattern <span className="text-red-500">*</span>
								</Label>
								<Select
									value={formData.pattern_id}
									onValueChange={(v) => setFormData({ ...formData, pattern_id: v })}
									disabled={!!editing}
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

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="rule_code">
										Rule Code <span className="text-red-500">*</span>
									</Label>
									<Input
										id="rule_code"
										value={formData.rule_code}
										onChange={(e) => setFormData({ ...formData, rule_code: e.target.value })}
										placeholder="e.g., PASS_STD"
										className={errors.rule_code ? "border-red-500" : ""}
									/>
									{errors.rule_code && (
										<p className="text-xs text-red-500">{errors.rule_code}</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="rule_name">
										Rule Name <span className="text-red-500">*</span>
									</Label>
									<Input
										id="rule_name"
										value={formData.rule_name}
										onChange={(e) => setFormData({ ...formData, rule_name: e.target.value })}
										placeholder="e.g., Standard Passing Rule"
										className={errors.rule_name ? "border-red-500" : ""}
									/>
									{errors.rule_name && (
										<p className="text-xs text-red-500">{errors.rule_name}</p>
									)}
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="rule_description">Description</Label>
								<Textarea
									id="rule_description"
									value={formData.rule_description}
									onChange={(e) => setFormData({ ...formData, rule_description: e.target.value })}
									placeholder="Describe the passing rule..."
									rows={2}
								/>
							</div>
						</div>

						{/* Passing Criteria */}
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<Percent className="h-5 w-5 text-brand-green" />
								<h3 className="text-lg font-semibold">Passing Criteria</h3>
							</div>
							<Separator />

							<div className="space-y-2">
								<Label htmlFor="minimum_pass_percentage">
									Minimum Pass Percentage <span className="text-red-500">*</span>
								</Label>
								<Input
									id="minimum_pass_percentage"
									type="number"
									value={formData.minimum_pass_percentage}
									onChange={(e) => setFormData({ ...formData, minimum_pass_percentage: e.target.value })}
									placeholder="e.g., 40"
									min="0"
									max="100"
									className={errors.minimum_pass_percentage ? "border-red-500" : ""}
								/>
								{errors.minimum_pass_percentage && (
									<p className="text-xs text-red-500">{errors.minimum_pass_percentage}</p>
								)}
								<p className="text-xs text-muted-foreground">Overall minimum percentage to pass internal assessment</p>
							</div>

							<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
								<div className="space-y-0.5">
									<Label>Component-wise Minimum</Label>
									<p className="text-xs text-muted-foreground">
										Require minimum in each component
									</p>
								</div>
								<Switch
									checked={formData.component_wise_minimum_enabled}
									onCheckedChange={(v) => setFormData({ ...formData, component_wise_minimum_enabled: v })}
								/>
							</div>

							{formData.component_wise_minimum_enabled && (
								<div className="space-y-2">
									<Label htmlFor="component_wise_minimum_percentage">Component Minimum %</Label>
									<Input
										id="component_wise_minimum_percentage"
										type="number"
										value={formData.component_wise_minimum_percentage}
										onChange={(e) => setFormData({ ...formData, component_wise_minimum_percentage: e.target.value })}
										placeholder="e.g., 30"
										min="0"
										max="100"
										className={errors.component_wise_minimum_percentage ? "border-red-500" : ""}
									/>
									{errors.component_wise_minimum_percentage && (
										<p className="text-xs text-red-500">{errors.component_wise_minimum_percentage}</p>
									)}
									<p className="text-xs text-muted-foreground">Minimum percentage required in each mandatory component</p>
								</div>
							)}

							<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
								<div className="space-y-0.5">
									<Label>Apply Rounding Before Pass Check</Label>
									<p className="text-xs text-muted-foreground">
										Round marks before checking pass criteria
									</p>
								</div>
								<Switch
									checked={formData.apply_rounding_before_pass_check}
									onCheckedChange={(v) => setFormData({ ...formData, apply_rounding_before_pass_check: v })}
								/>
							</div>
						</div>

						{/* Grace Marks */}
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<Gift className="h-5 w-5 text-brand-green" />
								<h3 className="text-lg font-semibold">Grace Marks</h3>
							</div>
							<Separator />

							<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
								<div className="space-y-0.5">
									<Label>Grace Marks Enabled</Label>
									<p className="text-xs text-muted-foreground">
										Allow grace marks to help learners pass
									</p>
								</div>
								<Switch
									checked={formData.grace_mark_enabled}
									onCheckedChange={(v) => setFormData({ ...formData, grace_mark_enabled: v })}
								/>
							</div>

							{formData.grace_mark_enabled && (
								<div className="space-y-2">
									<Label htmlFor="grace_mark_percentage_limit">Grace Mark Limit %</Label>
									<Input
										id="grace_mark_percentage_limit"
										type="number"
										value={formData.grace_mark_percentage_limit}
										onChange={(e) => setFormData({ ...formData, grace_mark_percentage_limit: e.target.value })}
										placeholder="e.g., 5"
										min="0"
										max="100"
										className={errors.grace_mark_percentage_limit ? "border-red-500" : ""}
									/>
									{errors.grace_mark_percentage_limit && (
										<p className="text-xs text-red-500">{errors.grace_mark_percentage_limit}</p>
									)}
									<p className="text-xs text-muted-foreground">Maximum grace marks as percentage of total</p>
								</div>
							)}
						</div>

						{/* Priority & Status */}
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<Award className="h-5 w-5 text-brand-green" />
								<h3 className="text-lg font-semibold">Priority & Status</h3>
							</div>
							<Separator />

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="priority_order">Priority Order</Label>
									<Input
										id="priority_order"
										type="number"
										value={formData.priority_order}
										onChange={(e) => setFormData({ ...formData, priority_order: e.target.value })}
										min="1"
									/>
									<p className="text-xs text-muted-foreground">Lower number = higher priority</p>
								</div>

								<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg h-fit">
									<div className="space-y-0.5">
										<Label>Active</Label>
										<p className="text-xs text-muted-foreground">Enable this rule</p>
									</div>
									<Switch
										checked={formData.is_active}
										onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
									/>
								</div>
							</div>
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
								{editing ? "Update Rule" : "Create Rule"}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Passing Rule?</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete &quot;{ruleToDelete?.rule_name}&quot;?
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
