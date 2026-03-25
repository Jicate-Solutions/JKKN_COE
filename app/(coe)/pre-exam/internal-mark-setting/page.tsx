"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs"
import {
	Download,
	Upload,
	PlusCircle,
	Search,
	ChevronLeft,
	ChevronRight,
	ChevronDown,
	Settings2,
	Edit,
	Trash2,
	FileSpreadsheet,
	RefreshCw,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	Eye,
	Copy,
	CheckCircle,
	XCircle,
	AlertTriangle,
	Layers,
	LayoutGrid,
	Calendar,
	Target,
	Shield,
	Percent,
	GraduationCap,
	BookOpen,
	Beaker,
	FolderOpen,
	Clock,
	Users,
	FileCheck,
	Activity,
	MoreHorizontal,
} from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
import type {
	InternalAssessmentPattern,
	InternalAssessmentComponent,
	InternalAssessmentSubComponent,
	InternalAssessmentEligibilityRule,
	InternalAssessmentPassingRule,
	InternalAssessmentPatternFormData,
	InternalAssessmentComponentFormData,
	CourseTypeApplicability,
	ProgramTypeApplicability,
	ProgramCategoryApplicability,
	AssessmentFrequency,
	CalculationMethod,
	RoundingMethod,
	PatternStatus,
} from "@/types/internal-assessment-pattern"

// Extended pattern interface with nested data
interface PatternWithRelations extends InternalAssessmentPattern {
	internal_assessment_components?: (InternalAssessmentComponent & {
		internal_assessment_sub_components?: InternalAssessmentSubComponent[]
	})[]
	internal_assessment_eligibility_rules?: InternalAssessmentEligibilityRule[]
	internal_assessment_passing_rules?: InternalAssessmentPassingRule[]
}

// Dropdown option interfaces
interface InstitutionOption {
	id: string
	institution_code: string
	name?: string
	counselling_code?: string | null
}

interface RegulationOption {
	id: string
	regulation_code: string
	regulation_year?: number
	regulation_name?: string
}

// Default form data
const defaultPatternFormData: InternalAssessmentPatternFormData = {
	institution_code: "",
	regulation_code: "",
	pattern_code: "",
	pattern_name: "",
	description: "",
	course_type_applicability: "all",
	program_type_applicability: "all",
	program_category_applicability: "all",
	assessment_frequency: "semester",
	assessment_periods_per_semester: "1",
	wef_date: new Date().toISOString().split("T")[0],
	wef_batch_code: "",
	rounding_method: "round",
	decimal_precision: "2",
	is_default: false,
	is_active: true,
}

const defaultComponentFormData: InternalAssessmentComponentFormData = {
	pattern_id: "",
	component_code: "",
	component_name: "",
	component_description: "",
	weightage_percentage: "",
	display_order: "1",
	is_visible_to_learner: true,
	is_mandatory: true,
	can_be_waived: false,
	waiver_requires_approval: true,
	has_sub_components: false,
	calculation_method: "sum",
	best_of_count: "",
	requires_scheduled_exam: false,
	allows_continuous_assessment: true,
	is_active: true,
}

export default function InternalMarkSettingPage() {
	// MyJKKN API hook for institution filtering
	const { fetchRegulations: fetchMyJKKNRegulations } = useMyJKKNInstitutionFilter()

	// Institution filter hook for multi-tenant filtering
	const {
		filter,
		isReady,
		appendToUrl,
		getInstitutionCodeForCreate,
		mustSelectInstitution,
		shouldFilter,
		institutionCode
	} = useInstitutionFilter()

	// State for patterns
	const [patterns, setPatterns] = useState<PatternWithRelations[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [statusFilter, setStatusFilter] = useState<"all" | PatternStatus>("all")
	const [courseTypeFilter, setCourseTypeFilter] = useState<"all" | CourseTypeApplicability>("all")
	const [programTypeFilter, setProgramTypeFilter] = useState<"all" | ProgramTypeApplicability>("all")

	// Pagination
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)

	// Form states
	const [patternSheetOpen, setPatternSheetOpen] = useState(false)
	const [componentDialogOpen, setComponentDialogOpen] = useState(false)
	const [editingPattern, setEditingPattern] = useState<PatternWithRelations | null>(null)
	const [editingComponent, setEditingComponent] = useState<InternalAssessmentComponent | null>(null)
	const [selectedPatternForComponent, setSelectedPatternForComponent] = useState<PatternWithRelations | null>(null)
	const [patternFormData, setPatternFormData] = useState<InternalAssessmentPatternFormData>(defaultPatternFormData)
	const [componentFormData, setComponentFormData] = useState<InternalAssessmentComponentFormData>(defaultComponentFormData)
	const [errors, setErrors] = useState<Record<string, string>>({})

	// Delete confirmation
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [patternToDelete, setPatternToDelete] = useState<PatternWithRelations | null>(null)
	const [componentToDelete, setComponentToDelete] = useState<InternalAssessmentComponent | null>(null)

	// View pattern details
	const [viewDialogOpen, setViewDialogOpen] = useState(false)
	const [viewingPattern, setViewingPattern] = useState<PatternWithRelations | null>(null)

	// Dropdown data
	const [institutions, setInstitutions] = useState<InstitutionOption[]>([])
	const [regulations, setRegulations] = useState<RegulationOption[]>([])
	const [regulationsLoading, setRegulationsLoading] = useState(false)

	const { toast } = useToast()

	// Fetch patterns with institution filter
	const fetchPatterns = async () => {
		try {
			setLoading(true)
			// Use institution filter for multi-tenant data access
			const url = appendToUrl("/api/internal-assessment-patterns")
			const response = await fetch(url)
			if (response.ok) {
				const data = await response.json()
				setPatterns(data)
			} else {
				throw new Error("Failed to fetch patterns")
			}
		} catch (error) {
			console.error("Error fetching patterns:", error)
			toast({
				title: "Error",
				description: "Failed to fetch internal assessment patterns",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}

	// Fetch institutions
	const fetchInstitutions = async () => {
		try {
			const instResponse = await fetch("/api/master/institutions")
			if (instResponse.ok) {
				const data = await instResponse.json()
				// Map to include counselling_code
				const mapped = Array.isArray(data)
					? data.filter((i: any) => i?.institution_code).map((i: any) => ({
						id: i.id,
						institution_code: i.institution_code,
						name: i.institution_name || i.name,
						counselling_code: i.counselling_code || null
					}))
					: []
				setInstitutions(mapped)
			}
		} catch (error) {
			console.error("Error fetching institutions:", error)
		}
	}

	// Fetch regulations from MyJKKN API using hook (two-step lookup with client-side filtering)
	const fetchRegulations = useCallback(async (institutionCode?: string) => {
		try {
			setRegulationsLoading(true)
			setRegulations([])

			// If no institution selected, clear regulations
			if (!institutionCode) {
				return
			}

			// Find the counselling_code for the selected institution
			const institution = institutions.find(i => i.institution_code === institutionCode)
			const counsellingCode = institution?.counselling_code || undefined

			// Use hook to fetch regulations (handles two-step lookup and deduplication)
			const regs = await fetchMyJKKNRegulations(counsellingCode)

			setRegulations(regs.map(r => ({
				id: r.id,
				regulation_code: r.regulation_code,
				regulation_name: r.regulation_name,
				regulation_year: r.regulation_year || r.effective_year
			})))
		} catch (error) {
			console.error('[InternalMarkSetting] Error fetching regulations from MyJKKN:', error)
		} finally {
			setRegulationsLoading(false)
		}
	}, [institutions, fetchMyJKKNRegulations])

	// Load data when institution filter is ready
	useEffect(() => {
		if (isReady) {
			fetchPatterns()
			fetchInstitutions()
		}
	}, [isReady, filter])

	// Fetch regulations when institution changes in form
	useEffect(() => {
		if (patternFormData.institution_code && institutions.length > 0) {
			fetchRegulations(patternFormData.institution_code)
		} else {
			setRegulations([])
		}
	}, [patternFormData.institution_code, fetchRegulations, institutions.length])

	// Filter and search patterns
	const filteredPatterns = useMemo(() => {
		return patterns.filter((pattern) => {
			const matchesSearch =
				pattern.pattern_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
				pattern.pattern_name.toLowerCase().includes(searchTerm.toLowerCase())
			const matchesStatus = statusFilter === "all" || pattern.status === statusFilter
			const matchesCourseType =
				courseTypeFilter === "all" || pattern.course_type_applicability === courseTypeFilter
			const matchesProgramType =
				programTypeFilter === "all" || pattern.program_type_applicability === programTypeFilter

			return matchesSearch && matchesStatus && matchesCourseType && matchesProgramType
		})
	}, [patterns, searchTerm, statusFilter, courseTypeFilter, programTypeFilter])

	// Dynamic page size options
	const pageSizeOptions = useMemo(() => {
		const allSizes = [10, 20, 50, 100, 250, 500, 1000]
		const total = filteredPatterns.length
		const options = allSizes.filter(s => s < total)
		if (!options.includes(10)) options.unshift(10)
		if (total > 10) options.push(total)
		return options
	}, [filteredPatterns.length])

	const isShowAll = itemsPerPage >= filteredPatterns.length
	const effectivePerPage = isShowAll ? filteredPatterns.length || 1 : itemsPerPage

	// Paginated patterns
	const paginatedPatterns = useMemo(() => {
		const start = (currentPage - 1) * effectivePerPage
		return filteredPatterns.slice(start, start + effectivePerPage)
	}, [filteredPatterns, currentPage, effectivePerPage])

	const totalPages = Math.ceil(filteredPatterns.length / effectivePerPage) || 1
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = startIndex + effectivePerPage

	// Stats
	const stats = useMemo(() => {
		const total = patterns.length
		const active = patterns.filter((p) => p.status === "active").length
		const draft = patterns.filter((p) => p.status === "draft").length
		const archived = patterns.filter((p) => p.status === "archived").length
		return { total, active, draft, archived }
	}, [patterns])

	// Validate pattern form
	const validatePatternForm = () => {
		const newErrors: Record<string, string> = {}

		if (!patternFormData.institution_code.trim()) {
			newErrors.institution_code = "Institution is required"
		}
		if (!patternFormData.pattern_code.trim()) {
			newErrors.pattern_code = "Pattern code is required"
		}
		if (!patternFormData.pattern_name.trim()) {
			newErrors.pattern_name = "Pattern name is required"
		}
		if (!patternFormData.wef_date) {
			newErrors.wef_date = "W.E.F date is required"
		}

		setErrors(newErrors)
		return Object.keys(newErrors).length === 0
	}

	// Validate component form
	const validateComponentForm = () => {
		const newErrors: Record<string, string> = {}

		if (!componentFormData.component_code.trim()) {
			newErrors.component_code = "Component code is required"
		}
		if (!componentFormData.component_name.trim()) {
			newErrors.component_name = "Component name is required"
		}
		if (!componentFormData.weightage_percentage.trim()) {
			newErrors.weightage_percentage = "Weightage percentage is required"
		} else {
			const weightage = parseFloat(componentFormData.weightage_percentage)
			if (isNaN(weightage) || weightage < 0 || weightage > 100) {
				newErrors.weightage_percentage = "Weightage must be between 0 and 100"
			}
		}

		setErrors(newErrors)
		return Object.keys(newErrors).length === 0
	}

	// Save pattern
	const handleSavePattern = async () => {
		if (!validatePatternForm()) {
			toast({
				title: "Validation Error",
				description: "Please fix the errors before saving",
				variant: "destructive",
			})
			return
		}

		try {
			const payload = {
				...patternFormData,
				assessment_periods_per_semester: parseInt(patternFormData.assessment_periods_per_semester) || 1,
				decimal_precision: parseInt(patternFormData.decimal_precision) || 2,
			}

			const url = "/api/internal-assessment-patterns"
			const method = editingPattern ? "PUT" : "POST"
			const body = editingPattern ? { id: editingPattern.id, ...payload } : payload

			const response = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			})

			if (response.ok) {
				const savedPattern = await response.json()
				toast({
					title: editingPattern ? "Pattern Updated" : "Pattern Created",
					description: `${savedPattern.pattern_name} has been ${editingPattern ? "updated" : "created"} successfully`,
					className: "bg-green-50 border-green-200 text-green-800",
				})
				setPatternSheetOpen(false)
				resetPatternForm()
				fetchPatterns()
			} else {
				const errorData = await response.json()
				throw new Error(errorData.error || "Failed to save pattern")
			}
		} catch (error) {
			console.error("Error saving pattern:", error)
			toast({
				title: "Error",
				description: error instanceof Error ? error.message : "Failed to save pattern",
				variant: "destructive",
			})
		}
	}

	// Save component
	const handleSaveComponent = async () => {
		if (!validateComponentForm()) {
			toast({
				title: "Validation Error",
				description: "Please fix the errors before saving",
				variant: "destructive",
			})
			return
		}

		try {
			const payload = {
				...componentFormData,
				pattern_id: selectedPatternForComponent?.id,
				weightage_percentage: parseFloat(componentFormData.weightage_percentage),
				display_order: parseInt(componentFormData.display_order) || 1,
				best_of_count: componentFormData.best_of_count ? parseInt(componentFormData.best_of_count) : null,
			}

			const url = "/api/internal-assessment-patterns/components"
			const method = editingComponent ? "PUT" : "POST"
			const body = editingComponent ? { id: editingComponent.id, ...payload } : payload

			const response = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			})

			if (response.ok) {
				const savedComponent = await response.json()
				toast({
					title: editingComponent ? "Component Updated" : "Component Added",
					description: `${savedComponent.component_name} has been ${editingComponent ? "updated" : "added"} successfully`,
					className: "bg-green-50 border-green-200 text-green-800",
				})
				setComponentDialogOpen(false)
				resetComponentForm()
				fetchPatterns()
			} else {
				const errorData = await response.json()
				throw new Error(errorData.error || "Failed to save component")
			}
		} catch (error) {
			console.error("Error saving component:", error)
			toast({
				title: "Error",
				description: error instanceof Error ? error.message : "Failed to save component",
				variant: "destructive",
			})
		}
	}

	// Delete pattern
	const handleDeletePattern = async () => {
		if (!patternToDelete) return

		try {
			const response = await fetch(`/api/internal-assessment-patterns?id=${patternToDelete.id}`, {
				method: "DELETE",
			})

			if (response.ok) {
				toast({
					title: "Pattern Deleted",
					description: `${patternToDelete.pattern_name} has been deleted`,
					className: "bg-orange-50 border-orange-200 text-orange-800",
				})
				setDeleteDialogOpen(false)
				setPatternToDelete(null)
				fetchPatterns()
			} else {
				const errorData = await response.json()
				throw new Error(errorData.error || "Failed to delete pattern")
			}
		} catch (error) {
			console.error("Error deleting pattern:", error)
			toast({
				title: "Error",
				description: error instanceof Error ? error.message : "Failed to delete pattern",
				variant: "destructive",
			})
		}
	}

	// Reset forms
	const resetPatternForm = () => {
		// Auto-fill institution_code from context if available
		const autoInstitutionCode = getInstitutionCodeForCreate() || ""
		setPatternFormData({
			...defaultPatternFormData,
			institution_code: autoInstitutionCode,
		})
		setEditingPattern(null)
		setErrors({})
	}

	const resetComponentForm = () => {
		setComponentFormData(defaultComponentFormData)
		setEditingComponent(null)
		setSelectedPatternForComponent(null)
		setErrors({})
	}

	// Open edit pattern
	const openEditPattern = (pattern: PatternWithRelations) => {
		setEditingPattern(pattern)
		setPatternFormData({
			institution_code: pattern.institution_code,
			regulation_code: pattern.regulation_code || "",
			pattern_code: pattern.pattern_code,
			pattern_name: pattern.pattern_name,
			description: pattern.description || "",
			course_type_applicability: pattern.course_type_applicability,
			program_type_applicability: pattern.program_type_applicability,
			program_category_applicability: pattern.program_category_applicability,
			assessment_frequency: pattern.assessment_frequency,
			assessment_periods_per_semester: String(pattern.assessment_periods_per_semester || 1),
			wef_date: pattern.wef_date,
			wef_batch_code: pattern.wef_batch_code || "",
			rounding_method: pattern.rounding_method,
			decimal_precision: String(pattern.decimal_precision || 2),
			is_default: pattern.is_default,
			is_active: pattern.is_active,
		})
		setPatternSheetOpen(true)
	}

	// Open add component dialog
	const openAddComponent = (pattern: PatternWithRelations) => {
		setSelectedPatternForComponent(pattern)
		setComponentFormData({
			...defaultComponentFormData,
			pattern_id: pattern.id,
		})
		setEditingComponent(null)
		setComponentDialogOpen(true)
	}

	// Open edit component dialog
	const openEditComponent = (pattern: PatternWithRelations, component: InternalAssessmentComponent) => {
		setSelectedPatternForComponent(pattern)
		setEditingComponent(component)
		setComponentFormData({
			pattern_id: pattern.id,
			component_code: component.component_code,
			component_name: component.component_name,
			component_description: component.component_description || "",
			weightage_percentage: String(component.weightage_percentage),
			display_order: String(component.display_order || 1),
			is_visible_to_learner: component.is_visible_to_learner,
			is_mandatory: component.is_mandatory,
			can_be_waived: component.can_be_waived,
			waiver_requires_approval: component.waiver_requires_approval,
			has_sub_components: component.has_sub_components,
			calculation_method: component.calculation_method || "sum",
			best_of_count: component.best_of_count ? String(component.best_of_count) : "",
			requires_scheduled_exam: component.requires_scheduled_exam,
			allows_continuous_assessment: component.allows_continuous_assessment,
			is_active: component.is_active,
		})
		setComponentDialogOpen(true)
	}

	// Delete component
	const handleDeleteComponent = async (componentId: string) => {
		try {
			const response = await fetch(`/api/internal-assessment-patterns/components?id=${componentId}`, {
				method: "DELETE",
			})

			if (response.ok) {
				toast({
					title: "Component Deleted",
					description: "Component has been deleted successfully",
					className: "bg-orange-50 border-orange-200 text-orange-800",
				})
				fetchPatterns()
				// Update the viewing pattern if open
				if (viewingPattern) {
					const updatedPattern = patterns.find(p => p.id === viewingPattern.id)
					if (updatedPattern) {
						setViewingPattern(updatedPattern)
					}
				}
			} else {
				const errorData = await response.json()
				throw new Error(errorData.error || "Failed to delete component")
			}
		} catch (error) {
			console.error("Error deleting component:", error)
			toast({
				title: "Error",
				description: error instanceof Error ? error.message : "Failed to delete component",
				variant: "destructive",
			})
		}
	}

	// Get status badge color
	const getStatusBadgeColor = (status: PatternStatus) => {
		switch (status) {
			case "active":
				return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
			case "draft":
				return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
			case "archived":
				return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400"
			default:
				return "bg-gray-100 text-gray-800"
		}
	}

	// Get course type icon
	const getCourseTypeIcon = (type: CourseTypeApplicability) => {
		switch (type) {
			case "theory":
				return <BookOpen className="h-4 w-4" />
			case "practical":
				return <Beaker className="h-4 w-4" />
			case "project":
				return <FolderOpen className="h-4 w-4" />
			case "theory_practical":
				return <Layers className="h-4 w-4" />
			default:
				return <LayoutGrid className="h-4 w-4" />
		}
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
									<Link href="/pre-exam">Pre-Examination</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Internal Mark Setting</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page Header */}
					<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
						<div>
							<h1 className="text-2xl font-bold tracking-tight">Internal Mark Setting</h1>
							<p className="text-muted-foreground">
								Configure internal learning assessment patterns and distribution structures
							</p>
						</div>
						<Button
							onClick={() => {
								// Check if super_admin needs to select an institution first
								if (mustSelectInstitution) {
									toast({
										title: "Select Institution",
										description: "Please select an institution from the header before creating a pattern.",
										className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200"
									})
									return
								}
								resetPatternForm()
								setPatternSheetOpen(true)
							}}
							className="bg-brand-green hover:bg-brand-green-600"
						>
							<PlusCircle className="mr-2 h-4 w-4" />
							Create Pattern
						</Button>
					</div>

					{/* Stats Cards */}
					<div className="grid gap-4 md:grid-cols-4">
						<Card className="border-l-4 border-l-blue-500">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">Total Patterns</CardTitle>
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
						<Card className="border-l-4 border-l-yellow-500">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">Draft</CardTitle>
								<Edit className="h-4 w-4 text-yellow-500" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{stats.draft}</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-gray-500">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">Archived</CardTitle>
								<FileCheck className="h-4 w-4 text-gray-500" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{stats.archived}</div>
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
										placeholder="Search patterns..."
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
										className="pl-9 h-9"
									/>
								</div>

								{/* Status Filter */}
								<Select
									value={statusFilter}
									onValueChange={(v) => setStatusFilter(v as any)}
								>
									<SelectTrigger className="w-[140px] h-9">
										<SelectValue placeholder="Status" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Status</SelectItem>
										<SelectItem value="active">Active</SelectItem>
										<SelectItem value="draft">Draft</SelectItem>
										<SelectItem value="archived">Archived</SelectItem>
									</SelectContent>
								</Select>

								{/* Course Type Filter */}
								<Select
									value={courseTypeFilter}
									onValueChange={(v) => setCourseTypeFilter(v as any)}
								>
									<SelectTrigger className="w-[160px] h-9">
										<SelectValue placeholder="Course Type" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Course Types</SelectItem>
										<SelectItem value="theory">Theory</SelectItem>
										<SelectItem value="practical">Practical</SelectItem>
										<SelectItem value="project">Project</SelectItem>
										<SelectItem value="theory_practical">Theory + Practical</SelectItem>
									</SelectContent>
								</Select>

								{/* Program Type Filter */}
								<Select
									value={programTypeFilter}
									onValueChange={(v) => setProgramTypeFilter(v as any)}
								>
									<SelectTrigger className="w-[140px] h-9">
										<SelectValue placeholder="Program" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Programs</SelectItem>
										<SelectItem value="ug">UG</SelectItem>
										<SelectItem value="pg">PG</SelectItem>
										<SelectItem value="diploma">Diploma</SelectItem>
										<SelectItem value="certificate">Certificate</SelectItem>
									</SelectContent>
								</Select>

								{/* Refresh Button */}
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												variant="outline"
												size="sm"
												onClick={fetchPatterns}
												className="h-9 w-9 p-0"
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
											<Download className="h-4 w-4 mr-1" />
											Export
											<ChevronDown className="h-3 w-3 ml-1" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem>
											<FileSpreadsheet className="h-4 w-4 mr-2" />
											Export as Excel
										</DropdownMenuItem>
										<DropdownMenuItem>
											<Download className="h-4 w-4 mr-2" />
											Export as CSV
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem>
											<Upload className="h-4 w-4 mr-2" />
											Import from Excel
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</CardContent>
					</Card>

					{/* Patterns Table */}
					<Card>
						<CardContent className="pt-6">
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="text-xs">Pattern Code</TableHead>
											<TableHead className="text-xs">Pattern Name</TableHead>
											<TableHead className="text-xs">Course Type</TableHead>
											<TableHead className="text-xs">Program Type</TableHead>
											<TableHead className="text-xs">Frequency</TableHead>
											<TableHead className="text-xs">Components</TableHead>
											<TableHead className="text-xs">W.E.F</TableHead>
											<TableHead className="text-xs">Status</TableHead>
											<TableHead className="text-xs text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{loading ? (
											<TableRow>
												<TableCell colSpan={9} className="text-center py-8">
													<RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
													<p className="text-sm text-muted-foreground mt-2">Loading patterns...</p>
												</TableCell>
											</TableRow>
										) : paginatedPatterns.length === 0 ? (
											<TableRow>
												<TableCell colSpan={9} className="text-center py-8">
													<Layers className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
													<p className="text-sm text-muted-foreground">No patterns found</p>
													<Button
														variant="link"
														onClick={() => setPatternSheetOpen(true)}
														className="mt-2"
													>
														Create your first pattern
													</Button>
												</TableCell>
											</TableRow>
										) : (
											paginatedPatterns.map((pattern) => (
												<TableRow key={pattern.id}>
													<TableCell className="text-sm font-medium">
														{pattern.pattern_code}
														{pattern.is_default && (
															<Badge variant="outline" className="ml-2 text-[9px]">
																Default
															</Badge>
														)}
													</TableCell>
													<TableCell className="text-sm">{pattern.pattern_name}</TableCell>
													<TableCell className="text-sm">
														<div className="flex items-center gap-1">
															{getCourseTypeIcon(pattern.course_type_applicability)}
															<span className="capitalize">
																{pattern.course_type_applicability.replace("_", " + ")}
															</span>
														</div>
													</TableCell>
													<TableCell className="text-sm uppercase">
														{pattern.program_type_applicability}
													</TableCell>
													<TableCell className="text-sm capitalize">
														{pattern.assessment_frequency}
													</TableCell>
													<TableCell className="text-sm">
														<Badge variant="secondary">
															{pattern.internal_assessment_components?.length || 0} components
														</Badge>
													</TableCell>
													<TableCell className="text-sm">
														{new Date(pattern.wef_date).toLocaleDateString()}
													</TableCell>
													<TableCell>
														<Badge className={getStatusBadgeColor(pattern.status)}>
															{pattern.status}
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
																<DropdownMenuItem
																	onClick={() => {
																		setViewingPattern(pattern)
																		setViewDialogOpen(true)
																	}}
																>
																	<Eye className="h-4 w-4 mr-2" />
																	View Details
																</DropdownMenuItem>
																<DropdownMenuItem onClick={() => openAddComponent(pattern)}>
																	<PlusCircle className="h-4 w-4 mr-2" />
																	Add Component
																</DropdownMenuItem>
																<DropdownMenuItem onClick={() => openEditPattern(pattern)}>
																	<Edit className="h-4 w-4 mr-2" />
																	Edit Pattern
																</DropdownMenuItem>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	className="text-destructive focus:text-destructive"
																	onClick={() => {
																		setPatternToDelete(pattern)
																		setDeleteDialogOpen(true)
																	}}
																>
																	<Trash2 className="h-4 w-4 mr-2" />
																	Delete Pattern
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
										{filteredPatterns.length === 0
											? 'No results'
											: `${startIndex + 1}–${Math.min(endIndex, filteredPatterns.length)} of ${filteredPatterns.length}`
										}
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
														{size === filteredPatterns.length ? 'All' : size}
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

			{/* Pattern Form Sheet */}
			<Sheet open={patternSheetOpen} onOpenChange={(o) => { if (!o) resetPatternForm(); setPatternSheetOpen(o) }}>
				<SheetContent className="sm:max-w-[800px] overflow-y-auto">
					<SheetHeader className="space-y-4 pb-6 border-b">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
								<Settings2 className="h-5 w-5 text-white" />
							</div>
							<div>
								<SheetTitle className="text-xl">
									{editingPattern ? "Edit Pattern" : "Create Pattern"}
								</SheetTitle>
								<SheetDescription>
									Define internal learning assessment pattern structure
								</SheetDescription>
							</div>
						</div>
					</SheetHeader>

					<div className="py-6 space-y-8">
						{/* Basic Information */}
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<FileCheck className="h-5 w-5 text-brand-green" />
								<h3 className="text-lg font-semibold">Basic Information</h3>
							</div>
							<Separator />

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="institution_code">
										Institution <span className="text-red-500">*</span>
									</Label>
									{/* Show read-only input for non-super_admin users, dropdown for super_admin */}
									{shouldFilter && institutionCode ? (
										<Input
											value={patternFormData.institution_code}
											disabled
											className="bg-muted"
										/>
									) : (
										<Select
											value={patternFormData.institution_code}
											onValueChange={(v) => setPatternFormData({ ...patternFormData, institution_code: v, regulation_code: "" })}
										>
											<SelectTrigger className={errors.institution_code ? "border-red-500" : ""}>
												<SelectValue placeholder="Select institution" />
											</SelectTrigger>
											<SelectContent>
												{institutions.map((inst) => (
													<SelectItem key={inst.id} value={inst.institution_code}>
														{inst.institution_code} {inst.name ? `- ${inst.name}` : ""}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									)}
									{errors.institution_code && (
										<p className="text-xs text-red-500">{errors.institution_code}</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="regulation_code">Regulation</Label>
									<Select
										value={patternFormData.regulation_code || "none"}
										onValueChange={(v) => setPatternFormData({ ...patternFormData, regulation_code: v === "none" ? "" : v })}
										disabled={!patternFormData.institution_code || regulationsLoading}
									>
										<SelectTrigger className={!patternFormData.institution_code ? "bg-muted cursor-not-allowed" : ""}>
											<SelectValue placeholder={
												regulationsLoading
													? "Loading regulations..."
													: !patternFormData.institution_code
														? "Select institution first"
														: "Select regulation"
											} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">None</SelectItem>
											{regulations.map((reg) => (
												<SelectItem key={reg.id} value={reg.regulation_code}>
													{reg.regulation_code} {reg.regulation_year ? `(${reg.regulation_year})` : ""} {reg.regulation_name ? `- ${reg.regulation_name}` : ""}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{!patternFormData.institution_code && (
										<p className="text-xs text-muted-foreground">Select an institution to load regulations</p>
									)}
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="pattern_code">
										Pattern Code <span className="text-red-500">*</span>
									</Label>
									<Input
										id="pattern_code"
										value={patternFormData.pattern_code}
										onChange={(e) => setPatternFormData({ ...patternFormData, pattern_code: e.target.value })}
										placeholder="e.g., THEORY_UG_2024"
										className={errors.pattern_code ? "border-red-500" : ""}
									/>
									{errors.pattern_code && (
										<p className="text-xs text-red-500">{errors.pattern_code}</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="pattern_name">
										Pattern Name <span className="text-red-500">*</span>
									</Label>
									<Input
										id="pattern_name"
										value={patternFormData.pattern_name}
										onChange={(e) => setPatternFormData({ ...patternFormData, pattern_name: e.target.value })}
										placeholder="e.g., Theory UG Internal Pattern 2024"
										className={errors.pattern_name ? "border-red-500" : ""}
									/>
									{errors.pattern_name && (
										<p className="text-xs text-red-500">{errors.pattern_name}</p>
									)}
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="description">Description</Label>
								<Textarea
									id="description"
									value={patternFormData.description}
									onChange={(e) => setPatternFormData({ ...patternFormData, description: e.target.value })}
									placeholder="Describe the pattern..."
									rows={2}
								/>
							</div>
						</div>

						{/* Applicability */}
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<Target className="h-5 w-5 text-brand-green" />
								<h3 className="text-lg font-semibold">Applicability</h3>
							</div>
							<Separator />

							<div className="grid grid-cols-3 gap-4">
								<div className="space-y-2">
									<Label>Course Type</Label>
									<Select
										value={patternFormData.course_type_applicability}
										onValueChange={(v) => setPatternFormData({
											...patternFormData,
											course_type_applicability: v as CourseTypeApplicability
										})}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Types</SelectItem>
											<SelectItem value="theory">Theory</SelectItem>
											<SelectItem value="practical">Practical</SelectItem>
											<SelectItem value="project">Project</SelectItem>
											<SelectItem value="theory_practical">Theory + Practical</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label>Program Type</Label>
									<Select
										value={patternFormData.program_type_applicability}
										onValueChange={(v) => setPatternFormData({
											...patternFormData,
											program_type_applicability: v as ProgramTypeApplicability
										})}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Programs</SelectItem>
											<SelectItem value="ug">UG</SelectItem>
											<SelectItem value="pg">PG</SelectItem>
											<SelectItem value="diploma">Diploma</SelectItem>
											<SelectItem value="certificate">Certificate</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label>Program Category</Label>
									<Select
										value={patternFormData.program_category_applicability}
										onValueChange={(v) => setPatternFormData({
											...patternFormData,
											program_category_applicability: v as ProgramCategoryApplicability
										})}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Categories</SelectItem>
											<SelectItem value="arts">Arts</SelectItem>
											<SelectItem value="science">Science</SelectItem>
											<SelectItem value="skill_based">Skill-Based</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</div>

						{/* Assessment Configuration */}
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<Calendar className="h-5 w-5 text-brand-green" />
								<h3 className="text-lg font-semibold">Assessment Configuration</h3>
							</div>
							<Separator />

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label>Assessment Frequency</Label>
									<Select
										value={patternFormData.assessment_frequency}
										onValueChange={(v) => setPatternFormData({
											...patternFormData,
											assessment_frequency: v as AssessmentFrequency
										})}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="monthly">Monthly</SelectItem>
											<SelectItem value="periodic">Periodic</SelectItem>
											<SelectItem value="semester">Semester</SelectItem>
											<SelectItem value="annual">Annual</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label>Periods per Semester</Label>
									<Input
										type="number"
										value={patternFormData.assessment_periods_per_semester}
										onChange={(e) => setPatternFormData({
											...patternFormData,
											assessment_periods_per_semester: e.target.value
										})}
										min="1"
										max="12"
									/>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label>
										W.E.F Date <span className="text-red-500">*</span>
									</Label>
									<Input
										type="date"
										value={patternFormData.wef_date}
										onChange={(e) => setPatternFormData({ ...patternFormData, wef_date: e.target.value })}
										className={errors.wef_date ? "border-red-500" : ""}
									/>
									{errors.wef_date && (
										<p className="text-xs text-red-500">{errors.wef_date}</p>
									)}
								</div>

								<div className="space-y-2">
									<Label>W.E.F Batch Code</Label>
									<Input
										value={patternFormData.wef_batch_code}
										onChange={(e) => setPatternFormData({ ...patternFormData, wef_batch_code: e.target.value })}
										placeholder="e.g., 2024-25"
									/>
								</div>
							</div>
						</div>

						{/* Calculation Settings */}
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<Percent className="h-5 w-5 text-brand-green" />
								<h3 className="text-lg font-semibold">Calculation Settings</h3>
							</div>
							<Separator />

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label>Rounding Method</Label>
									<Select
										value={patternFormData.rounding_method}
										onValueChange={(v) => setPatternFormData({
											...patternFormData,
											rounding_method: v as RoundingMethod
										})}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="round">Round (Standard)</SelectItem>
											<SelectItem value="floor">Floor (Down)</SelectItem>
											<SelectItem value="ceil">Ceil (Up)</SelectItem>
											<SelectItem value="none">No Rounding</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label>Decimal Precision</Label>
									<Select
										value={patternFormData.decimal_precision}
										onValueChange={(v) => setPatternFormData({
											...patternFormData,
											decimal_precision: v
										})}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="0">0 decimals</SelectItem>
											<SelectItem value="1">1 decimal</SelectItem>
											<SelectItem value="2">2 decimals</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
								<div className="space-y-0.5">
									<Label>Set as Default Pattern</Label>
									<p className="text-xs text-muted-foreground">
										This pattern will be used when no specific pattern is assigned
									</p>
								</div>
								<Switch
									checked={patternFormData.is_default}
									onCheckedChange={(v) => setPatternFormData({ ...patternFormData, is_default: v })}
								/>
							</div>

							<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
								<div className="space-y-0.5">
									<Label>Active</Label>
									<p className="text-xs text-muted-foreground">
										Inactive patterns cannot be used for new assessments
									</p>
								</div>
								<Switch
									checked={patternFormData.is_active}
									onCheckedChange={(v) => setPatternFormData({ ...patternFormData, is_active: v })}
								/>
							</div>
						</div>

						{/* Actions */}
						<div className="flex justify-end gap-3 pt-4 border-t">
							<Button
								variant="outline"
								onClick={() => {
									resetPatternForm()
									setPatternSheetOpen(false)
								}}
							>
								Cancel
							</Button>
							<Button
								onClick={handleSavePattern}
								className="bg-brand-green hover:bg-brand-green-600"
							>
								{editingPattern ? "Update Pattern" : "Create Pattern"}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* Component Dialog */}
			<Dialog open={componentDialogOpen} onOpenChange={(o) => { if (!o) resetComponentForm(); setComponentDialogOpen(o) }}>
				<DialogContent className="max-w-[600px]">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Layers className="h-5 w-5 text-brand-green" />
							{editingComponent ? "Edit Component" : "Add Component"}
						</DialogTitle>
						<DialogDescription>
							{selectedPatternForComponent && (
								<span>Adding to: {selectedPatternForComponent.pattern_name}</span>
							)}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="component_code">
									Component Code <span className="text-red-500">*</span>
								</Label>
								<Input
									id="component_code"
									value={componentFormData.component_code}
									onChange={(e) => setComponentFormData({ ...componentFormData, component_code: e.target.value })}
									placeholder="e.g., TEST"
									className={errors.component_code ? "border-red-500" : ""}
								/>
								{errors.component_code && (
									<p className="text-xs text-red-500">{errors.component_code}</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="component_name">
									Component Name <span className="text-red-500">*</span>
								</Label>
								<Input
									id="component_name"
									value={componentFormData.component_name}
									onChange={(e) => setComponentFormData({ ...componentFormData, component_name: e.target.value })}
									placeholder="e.g., Periodic Tests"
									className={errors.component_name ? "border-red-500" : ""}
								/>
								{errors.component_name && (
									<p className="text-xs text-red-500">{errors.component_name}</p>
								)}
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="weightage_percentage">
									Weightage % <span className="text-red-500">*</span>
								</Label>
								<Input
									id="weightage_percentage"
									type="number"
									value={componentFormData.weightage_percentage}
									onChange={(e) => setComponentFormData({ ...componentFormData, weightage_percentage: e.target.value })}
									placeholder="e.g., 40"
									min="0"
									max="100"
									className={errors.weightage_percentage ? "border-red-500" : ""}
								/>
								{errors.weightage_percentage && (
									<p className="text-xs text-red-500">{errors.weightage_percentage}</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="display_order">Display Order</Label>
								<Input
									id="display_order"
									type="number"
									value={componentFormData.display_order}
									onChange={(e) => setComponentFormData({ ...componentFormData, display_order: e.target.value })}
									min="1"
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="component_description">Description</Label>
							<Textarea
								id="component_description"
								value={componentFormData.component_description}
								onChange={(e) => setComponentFormData({ ...componentFormData, component_description: e.target.value })}
								placeholder="Describe this component..."
								rows={2}
							/>
						</div>

						<Separator />

						<div className="grid grid-cols-2 gap-4">
							<div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
								<Label className="text-sm">Mandatory</Label>
								<Switch
									checked={componentFormData.is_mandatory}
									onCheckedChange={(v) => setComponentFormData({ ...componentFormData, is_mandatory: v })}
								/>
							</div>

							<div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
								<Label className="text-sm">Can Be Waived</Label>
								<Switch
									checked={componentFormData.can_be_waived}
									onCheckedChange={(v) => setComponentFormData({ ...componentFormData, can_be_waived: v })}
								/>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
								<Label className="text-sm">Has Sub-Components</Label>
								<Switch
									checked={componentFormData.has_sub_components}
									onCheckedChange={(v) => setComponentFormData({ ...componentFormData, has_sub_components: v })}
								/>
							</div>

							<div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
								<Label className="text-sm">Requires Scheduled Exam</Label>
								<Switch
									checked={componentFormData.requires_scheduled_exam}
									onCheckedChange={(v) => setComponentFormData({ ...componentFormData, requires_scheduled_exam: v })}
								/>
							</div>
						</div>

						{componentFormData.has_sub_components && (
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label>Calculation Method</Label>
									<Select
										value={componentFormData.calculation_method}
										onValueChange={(v) => setComponentFormData({
											...componentFormData,
											calculation_method: v as CalculationMethod
										})}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="sum">Sum</SelectItem>
											<SelectItem value="average">Average</SelectItem>
											<SelectItem value="best_of">Best Of</SelectItem>
											<SelectItem value="weighted_average">Weighted Average</SelectItem>
										</SelectContent>
									</Select>
								</div>

								{componentFormData.calculation_method === "best_of" && (
									<div className="space-y-2">
										<Label>Best Of Count</Label>
										<Input
											type="number"
											value={componentFormData.best_of_count}
											onChange={(e) => setComponentFormData({ ...componentFormData, best_of_count: e.target.value })}
											placeholder="e.g., 2"
											min="1"
										/>
									</div>
								)}
							</div>
						)}
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => { resetComponentForm(); setComponentDialogOpen(false) }}>
							Cancel
						</Button>
						<Button onClick={handleSaveComponent} className="bg-brand-green hover:bg-brand-green-600">
							{editingComponent ? "Update Component" : "Add Component"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* View Pattern Dialog */}
			<Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
				<DialogContent className="max-w-[800px] max-h-[80vh] overflow-y-auto">
					{viewingPattern && (
						<>
							<DialogHeader>
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-lg bg-gradient-to-br from-brand-green to-brand-green-600 flex items-center justify-center">
										<Layers className="h-5 w-5 text-white" />
									</div>
									<div>
										<DialogTitle>{viewingPattern.pattern_name}</DialogTitle>
										<DialogDescription className="flex items-center gap-2">
											<span>{viewingPattern.pattern_code}</span>
											<span>•</span>
											<Badge className={getStatusBadgeColor(viewingPattern.status)}>
												{viewingPattern.status}
											</Badge>
										</DialogDescription>
									</div>
								</div>
							</DialogHeader>

							<Tabs defaultValue="components" className="mt-4">
								<TabsList className="grid w-full grid-cols-3">
									<TabsTrigger value="components">Components</TabsTrigger>
									<TabsTrigger value="eligibility">Eligibility Rules</TabsTrigger>
									<TabsTrigger value="passing">Passing Rules</TabsTrigger>
								</TabsList>

								<TabsContent value="components" className="mt-4">
									<div className="space-y-3">
										{viewingPattern.internal_assessment_components?.length === 0 ? (
											<div className="text-center py-8 text-muted-foreground">
												<Layers className="h-8 w-8 mx-auto mb-2" />
												<p>No components defined</p>
												<Button
													variant="link"
													onClick={() => {
														setViewDialogOpen(false)
														openAddComponent(viewingPattern)
													}}
												>
													Add first component
												</Button>
											</div>
										) : (
											viewingPattern.internal_assessment_components?.map((comp) => (
												<Card key={comp.id} className="p-4">
													<div className="flex items-center justify-between">
														<div className="flex items-center gap-3">
															<div className="h-10 w-10 rounded-full bg-brand-green/10 flex items-center justify-center">
																<Percent className="h-5 w-5 text-brand-green" />
															</div>
															<div>
																<h4 className="font-medium">{comp.component_name}</h4>
																<p className="text-sm text-muted-foreground">
																	{comp.component_code} • {comp.is_mandatory ? "Mandatory" : "Optional"}
																</p>
															</div>
														</div>
														<div className="flex items-center gap-4">
															<div className="text-right">
																<div className="text-2xl font-bold text-brand-green">
																	{comp.weightage_percentage}%
																</div>
																<p className="text-xs text-muted-foreground">Weightage</p>
															</div>
															<div className="flex items-center gap-1">
																<Button
																	variant="ghost"
																	size="sm"
																	className="h-8 w-8 p-0"
																	onClick={() => {
																		setViewDialogOpen(false)
																		openEditComponent(viewingPattern, comp)
																	}}
																	title="Edit Component"
																>
																	<Edit className="h-4 w-4" />
																</Button>
																<Button
																	variant="ghost"
																	size="sm"
																	className="h-8 w-8 p-0 text-destructive hover:text-destructive"
																	onClick={() => handleDeleteComponent(comp.id)}
																	title="Delete Component"
																>
																	<Trash2 className="h-4 w-4" />
																</Button>
															</div>
														</div>
													</div>
													{comp.has_sub_components && comp.internal_assessment_sub_components && (
														<div className="mt-4 pt-4 border-t">
															<p className="text-sm font-medium mb-2">Sub-Components:</p>
															<div className="flex flex-wrap gap-2">
																{comp.internal_assessment_sub_components.map((sub) => (
																	<Badge key={sub.id} variant="outline">
																		{sub.sub_component_name} ({sub.sub_weightage_percentage}%)
																	</Badge>
																))}
															</div>
														</div>
													)}
												</Card>
											))
										)}

										{/* Total Weightage */}
										{viewingPattern.internal_assessment_components && viewingPattern.internal_assessment_components.length > 0 && (
											<Card className="p-4 bg-muted/50">
												<div className="flex items-center justify-between">
													<span className="font-medium">Total Weightage</span>
													<span className="text-xl font-bold">
														{viewingPattern.internal_assessment_components.reduce(
															(sum, c) => sum + (c.weightage_percentage || 0),
															0
														)}%
													</span>
												</div>
											</Card>
										)}
									</div>
								</TabsContent>

								<TabsContent value="eligibility" className="mt-4">
									<div className="space-y-3">
										{viewingPattern.internal_assessment_eligibility_rules?.length === 0 ? (
											<div className="text-center py-8 text-muted-foreground">
												<Shield className="h-8 w-8 mx-auto mb-2" />
												<p>No eligibility rules defined</p>
											</div>
										) : (
											viewingPattern.internal_assessment_eligibility_rules?.map((rule) => (
												<Card key={rule.id} className="p-4">
													<div className="flex items-center gap-3">
														<Shield className="h-5 w-5 text-blue-500" />
														<div>
															<h4 className="font-medium">{rule.rule_name}</h4>
															<p className="text-sm text-muted-foreground">{rule.rule_code}</p>
														</div>
													</div>
													<div className="mt-3 grid grid-cols-2 gap-2 text-sm">
														{rule.minimum_overall_percentage && (
															<div className="flex items-center gap-2">
																<span className="text-muted-foreground">Min Overall:</span>
																<span className="font-medium">{rule.minimum_overall_percentage}%</span>
															</div>
														)}
														{rule.minimum_attendance_percentage && (
															<div className="flex items-center gap-2">
																<span className="text-muted-foreground">Min Attendance:</span>
																<span className="font-medium">{rule.minimum_attendance_percentage}%</span>
															</div>
														)}
													</div>
												</Card>
											))
										)}
									</div>
								</TabsContent>

								<TabsContent value="passing" className="mt-4">
									<div className="space-y-3">
										{viewingPattern.internal_assessment_passing_rules?.length === 0 ? (
											<div className="text-center py-8 text-muted-foreground">
												<Target className="h-8 w-8 mx-auto mb-2" />
												<p>No passing rules defined</p>
											</div>
										) : (
											viewingPattern.internal_assessment_passing_rules?.map((rule) => (
												<Card key={rule.id} className="p-4">
													<div className="flex items-center gap-3">
														<Target className="h-5 w-5 text-green-500" />
														<div>
															<h4 className="font-medium">{rule.rule_name}</h4>
															<p className="text-sm text-muted-foreground">{rule.rule_code}</p>
														</div>
													</div>
													<div className="mt-3 grid grid-cols-2 gap-2 text-sm">
														<div className="flex items-center gap-2">
															<span className="text-muted-foreground">Min Pass %:</span>
															<span className="font-medium">{rule.minimum_pass_percentage}%</span>
														</div>
														{rule.grace_mark_enabled && (
															<div className="flex items-center gap-2">
																<span className="text-muted-foreground">Grace Marks:</span>
																<Badge variant="outline">Enabled</Badge>
															</div>
														)}
													</div>
												</Card>
											))
										)}
									</div>
								</TabsContent>
							</Tabs>

							<DialogFooter className="mt-6">
								<Button variant="outline" onClick={() => setViewDialogOpen(false)}>
									Close
								</Button>
								<Button
									onClick={() => {
										setViewDialogOpen(false)
										openEditPattern(viewingPattern)
									}}
									className="bg-brand-green hover:bg-brand-green-600"
								>
									<Edit className="mr-2 h-4 w-4" />
									Edit Pattern
								</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Pattern?</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete &quot;{patternToDelete?.pattern_name}&quot;?
							This action cannot be undone and will also delete all associated components and rules.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeletePattern}
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
