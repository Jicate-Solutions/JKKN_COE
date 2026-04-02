"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useSessionSync } from '@/hooks/use-session-sync'
import XLSX from "@/lib/utils/excel-compat"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useInstitution } from "@/context/institution-context"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import Link from "next/link"
import {
	Calculator,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Download,
	FileSpreadsheet,
	GraduationCap,
	Loader2,
	Search,
	Users,
	BookOpen,
	Award,
	TrendingUp,
	AlertTriangle,
	RefreshCw,
	BarChart3,
	Layers,
	Database,
	Play,
	Upload,
	Eye,
	Lock,
	Unlock,
	Send,
	CheckCheck,
	Clock,
	XCircle,
	Check,
	ChevronsUpDown,
	X,
	Trash2
} from "lucide-react"
import type { ProgramType, PartSummary } from "@/types/semester-results"
import { cn } from "@/lib/utils"

// =====================================================
// TYPE DEFINITIONS
// =====================================================

interface CourseResult {
	course_id: string
	course_code: string
	course_name: string
	course_part: string
	course_order: number
	credits: number
	semester: number
	semester_code: string
	semester_number: number
	internal_marks: number
	internal_max: number
	internal_percentage: number
	external_marks: number
	external_max: number
	external_percentage: number
	total_marks: number
	total_max: number
	percentage: number
	grade_point: number
	letter_grade: string
	grade_description: string
	credit_points: number
	is_pass: boolean
	pass_status: string
}

interface LearnerResult {
	student_id: string
	student_name: string
	register_no: string
	courses: CourseResult[]
	part_breakdown?: PartSummary[]
	semester_gpa: number
	total_credits: number
	total_credit_points: number
	passed_count: number
	failed_count: number
}

interface ProgramSummary {
	total_learners: number
	passed_learners: number
	failed_learners: number
	pass_percentage: number
	average_gpa: number
	highest_gpa: number
	lowest_gpa: number
	grade_distribution: Record<string, number>
	part_summaries?: Record<string, { average_gpa: number; total_credits: number; pass_rate: number }>
}

interface DropdownOption {
	id: string
	code: string
	name: string
	type?: ProgramType
}

interface StoredSemesterResult {
	id: string
	student_id: string
	student_name: string
	register_number: string
	semester: number
	sgpa: number
	cgpa: number
	percentage: number
	total_credits_registered: number
	total_credits_earned: number
	total_credit_points: number
	total_backlogs: number
	result_status: string
	result_class: string
	is_distinction: boolean
	is_first_class: boolean
	is_promoted: boolean
	is_published: boolean
	is_locked: boolean
	published_date: string | null
	result_declared_date: string | null
	session_code: string
	session_name: string
	program_code: string
	program_name: string
}

interface StoredResultsSummary {
	total_learners: number
	passed: number
	failed: number
	pending: number
	incomplete: number
	published: number
	unpublished: number
	locked: number
	with_backlogs: number
	distinction_count: number
	first_class_count: number
	average_sgpa: number
	average_cgpa: number
}

// =====================================================
// UG PARTS CONFIGURATION
// =====================================================

const UG_PARTS = [
	{ name: 'Part I', description: 'Language I (Tamil/Hindi/French etc.)', color: 'bg-blue-500' },
	{ name: 'Part II', description: 'Language II (English)', color: 'bg-green-500' },
	{ name: 'Part III', description: 'Core/Major Subjects', color: 'bg-purple-500' },
	{ name: 'Part IV', description: 'Allied/Skill Enhancement/Foundation', color: 'bg-orange-500' },
	{ name: 'Part V', description: 'Extension Activities/Projects', color: 'bg-pink-500' }
]

const PG_PARTS = [
	{ name: 'Part A', description: 'Core, Elective, Project', color: 'bg-indigo-500' },
	{ name: 'Part B', description: 'Soft Skills, Internship', color: 'bg-teal-500' }
]

// Page size options
const PAGE_SIZE_OPTIONS = [
	{ value: '10', label: '10' },
	{ value: '25', label: '25' },
	{ value: '50', label: '50' },
	{ value: '100', label: '100' },
]

// =====================================================
// SEARCHABLE SELECT COMPONENT
// =====================================================

interface SearchableSelectProps {
	options: DropdownOption[]
	value: string
	onValueChange: (value: string) => void
	placeholder: string
	disabled?: boolean
	className?: string
}

function SearchableSelect({ options, value, onValueChange, placeholder, disabled, className }: SearchableSelectProps) {
	const [open, setOpen] = useState(false)
	const [searchQuery, setSearchQuery] = useState("")

	const filteredOptions = useMemo(() => {
		if (!searchQuery) return options
		const query = searchQuery.toLowerCase()
		return options.filter(opt =>
			opt.code.toLowerCase().includes(query) ||
			opt.name.toLowerCase().includes(query)
		)
	}, [options, searchQuery])

	const selectedOption = options.find(opt => opt.id === value)

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className={cn("w-full justify-between font-normal", className)}
				>
					<span className="truncate text-left flex-1">
						{selectedOption ? (selectedOption.code === selectedOption.name ? selectedOption.name : `${selectedOption.code} - ${selectedOption.name}`) : placeholder}
					</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[400px] p-0" align="start">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={`Search ${placeholder.toLowerCase()}...`}
						value={searchQuery}
						onValueChange={setSearchQuery}
					/>
					<CommandList className="max-h-[300px]">
						{filteredOptions.length === 0 ? (
							<div className="py-6 text-center text-sm text-muted-foreground">No results found.</div>
						) : (
							<CommandGroup>
								{filteredOptions.map(option => (
									<CommandItem
										key={option.id}
										value={option.id}
										onSelect={() => {
											onValueChange(option.id)
											setOpen(false)
											setSearchQuery("")
										}}
										className="cursor-pointer"
									>
										<Check
											className={cn(
												"mr-2 h-4 w-4",
												value === option.id ? "opacity-100" : "opacity-0"
											)}
										/>
										<div className="flex flex-col">
											<span className="font-medium">{option.code}</span>
											<span className="text-xs text-muted-foreground line-clamp-2">{option.name}</span>
										</div>
										{option.type && (
											<Badge
												variant="outline"
												className={cn(
													"ml-auto text-[10px]",
													option.type === 'UG' ? "border-blue-500 text-blue-600" : "border-purple-500 text-purple-600"
												)}
											>
												{option.type}
											</Badge>
										)}
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

// =====================================================
// MULTI-SELECT PROGRAM COMPONENT
// =====================================================

interface MultiSelectProgramProps {
	options: DropdownOption[]
	selectedIds: string[]
	onSelectionChange: (ids: string[]) => void
	placeholder: string
	disabled?: boolean
	loading?: boolean
}

function MultiSelectProgram({ options, selectedIds, onSelectionChange, placeholder, disabled, loading }: MultiSelectProgramProps) {
	const [open, setOpen] = useState(false)
	const [searchQuery, setSearchQuery] = useState("")

	// Determine the selected program type (UG or PG)
	const selectedType = useMemo(() => {
		if (selectedIds.length === 0) return null
		const firstSelected = options.find(opt => opt.id === selectedIds[0])
		return firstSelected?.type || null
	}, [selectedIds, options])

	const filteredOptions = useMemo(() => {
		let filtered = options
		if (searchQuery) {
			const query = searchQuery.toLowerCase()
			filtered = filtered.filter(opt =>
				opt.code.toLowerCase().includes(query) ||
				opt.name.toLowerCase().includes(query)
			)
		}
		return filtered
	}, [options, searchQuery])

	const toggleSelection = (id: string) => {
		const option = options.find(opt => opt.id === id)
		if (!option) return

		if (selectedIds.includes(id)) {
			// Remove from selection
			onSelectionChange(selectedIds.filter(selectedId => selectedId !== id))
		} else {
			// Add to selection - only if same type or no selection yet
			if (selectedType && option.type !== selectedType) {
				return // Can't mix UG and PG
			}
			onSelectionChange([...selectedIds, id])
		}
	}

	const isOptionDisabled = (option: DropdownOption) => {
		if (!selectedType) return false
		return option.type !== selectedType
	}

	const clearAll = () => {
		onSelectionChange([])
	}

	const selectedOptions = options.filter(opt => selectedIds.includes(opt.id))

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled || loading}
					className="w-full justify-between font-normal min-h-[40px] h-auto"
				>
					<div className="flex flex-wrap gap-1 flex-1 text-left">
						{loading ? (
							<span className="flex items-center gap-2 text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								Loading programs...
							</span>
						) : selectedOptions.length > 0 ? (
							selectedOptions.length <= 2 ? (
								selectedOptions.map(opt => (
									<Badge key={opt.id} variant="secondary" className="text-xs">
										{opt.code}
									</Badge>
								))
							) : (
								<Badge variant="secondary" className="text-xs">
									{selectedOptions.length} programs selected
								</Badge>
							)
						) : (
							<span className="text-muted-foreground">{placeholder}</span>
						)}
					</div>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[450px] p-0" align="start">
				<div className="flex flex-col">
					<div className="flex items-center border-b px-3">
						<Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
						<input
							placeholder="Search programs..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
						/>
						{selectedIds.length > 0 && (
							<Button variant="ghost" size="sm" onClick={clearAll} className="h-8 px-2">
								<X className="h-4 w-4" />
							</Button>
						)}
					</div>
					{selectedType && (
						<div className="px-3 py-2 border-b bg-muted/50">
							<Badge variant="outline" className={cn(
								"text-xs",
								selectedType === 'UG' ? "border-blue-500 text-blue-600 bg-blue-50" : "border-purple-500 text-purple-600 bg-purple-50"
							)}>
								{selectedType === 'UG' ? 'UG Programs Only' : 'PG Programs Only'} (mixing disabled)
							</Badge>
						</div>
					)}
					<div className="max-h-[300px] overflow-y-auto overflow-x-hidden">
						{filteredOptions.length === 0 ? (
							<div className="py-6 text-center text-sm text-muted-foreground">No programs found.</div>
						) : (
							<div className="p-2">
								{filteredOptions.map(option => {
									const isDisabled = isOptionDisabled(option)
									const isSelected = selectedIds.includes(option.id)
									return (
										<div
											key={option.id}
											onClick={() => !isDisabled && toggleSelection(option.id)}
											className={cn(
												"flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer",
												isSelected && "bg-blue-50 dark:bg-blue-900/20",
												isDisabled && "opacity-40 cursor-not-allowed",
												!isDisabled && !isSelected && "hover:bg-muted"
											)}
										>
											<Checkbox
												checked={isSelected}
												disabled={isDisabled}
												className="pointer-events-none"
											/>
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2">
													<span className="font-medium text-sm">{option.code}</span>
													<Badge
														variant="outline"
														className={cn(
															"text-[10px]",
															option.type === 'UG' ? "border-blue-500 text-blue-600" : "border-purple-500 text-purple-600"
														)}
													>
														{option.type}
													</Badge>
												</div>
												<span className="text-xs text-muted-foreground line-clamp-1">{option.name}</span>
											</div>
										</div>
									)
								})}
							</div>
						)}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

// =====================================================
// MULTI-SELECT SEMESTER COMPONENT
// =====================================================

interface MultiSelectSemesterProps {
	semesters: number[]
	selectedSemesters: number[]
	onSelectionChange: (semesters: number[]) => void
	disabled?: boolean
}

function MultiSelectSemester({ semesters, selectedSemesters, onSelectionChange, disabled }: MultiSelectSemesterProps) {
	const [open, setOpen] = useState(false)

	const toggleSemester = (sem: number) => {
		if (selectedSemesters.includes(sem)) {
			onSelectionChange(selectedSemesters.filter(s => s !== sem))
		} else {
			onSelectionChange([...selectedSemesters, sem].sort((a, b) => a - b))
		}
	}

	const selectAll = () => {
		onSelectionChange([...semesters])
	}

	const clearAll = () => {
		onSelectionChange([])
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled || semesters.length === 0}
					className="w-full justify-between font-normal"
				>
					<span className="truncate">
						{selectedSemesters.length === 0
							? "Select semester(s)"
								: `Sem ${selectedSemesters.join(", ")}`}
					</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[250px] p-2" align="start">
				<div className="flex items-center justify-between mb-2 pb-2 border-b">
					<span className="text-sm font-medium">Select Semesters</span>
					<div className="flex gap-1">
						<Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs">
							All
						</Button>
						<Button variant="ghost" size="sm" onClick={clearAll} className="h-7 text-xs">
							Clear
						</Button>
					</div>
				</div>
				<div className="grid grid-cols-3 gap-2">
					{semesters.map(sem => (
						<div
							key={sem}
							onClick={() => toggleSemester(sem)}
							className={cn(
								"flex items-center justify-center gap-1 px-3 py-2 rounded-md cursor-pointer border text-sm",
								selectedSemesters.includes(sem)
									? "bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
									: "hover:bg-muted"
							)}
						>
							{selectedSemesters.includes(sem) && <Check className="h-3 w-3" />}
							Sem {sem}
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function SemesterResultsPage() {
	const { toast } = useToast()
	const { user } = useAuth()

	// Institution filter hook
	const {
		filter,
		isReady,
		appendToUrl,
		getInstitutionIdForCreate,
		mustSelectInstitution,
		shouldFilter,
		institutionId
	} = useInstitutionFilter()

	// Institution context for accessing available institutions with myjkkn_institution_ids
	const { availableInstitutions } = useInstitution()

	// MyJKKN institution filter hook for fetching programs from MyJKKN API
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()

	// Selection state - updated for multi-select
	const [selectedInstitution, setSelectedInstitution] = useState("")
	const { selectedSessionId: selectedSession, setSelectedSessionId: setSelectedSession, mustSelectSession } = useSessionSync()
	const [selectedPrograms, setSelectedPrograms] = useState<string[]>([])
	const [selectedSemesters, setSelectedSemesters] = useState<number[]>([])
	const [programType, setProgramType] = useState<ProgramType | null>(null)

	// Dropdown data
	const [institutions, setInstitutions] = useState<(DropdownOption & { myjkkn_institution_ids?: string[] })[]>([])
	const [sessions, setSessions] = useState<DropdownOption[]>([])
	const [programs, setPrograms] = useState<DropdownOption[]>([])
	const [programsLoading, setProgramsLoading] = useState(false)
	const [semesters, setSemesters] = useState<number[]>([])

	// Results state
	const [loading, setLoading] = useState(false)
	const [learnerResults, setLearnerResults] = useState<LearnerResult[]>([])
	const [summary, setSummary] = useState<ProgramSummary | null>(null)

	// UI state
	const [searchTerm, setSearchTerm] = useState("")
	const [groupByPart, setGroupByPart] = useState(true)
	const [expandedLearners, setExpandedLearners] = useState<Set<string>>(new Set())
	const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
	const [activeTab, setActiveTab] = useState<'results' | 'summary' | 'parts'>('results')
	const [mainTab, setMainTab] = useState<'calculate' | 'stored'>('calculate')

	// Pagination state
	const [pageSize, setPageSize] = useState<string>('50')
	const [currentPage, setCurrentPage] = useState(1)
	const [storedPageSize, setStoredPageSize] = useState<string>('50')
	const [storedCurrentPage, setStoredCurrentPage] = useState(1)

	// Stored results state
	const [storedResults, setStoredResults] = useState<StoredSemesterResult[]>([])
	const [storedSummary, setStoredSummary] = useState<StoredResultsSummary | null>(null)
	const [storedLoading, setStoredLoading] = useState(false)
	const [selectedStoredIds, setSelectedStoredIds] = useState<Set<string>>(new Set())

	// Action states
	const [generating, setGenerating] = useState(false)
	const [declaring, setDeclaring] = useState(false)
	const [publishing, setPublishing] = useState(false)
	const [creatingBacklogs, setCreatingBacklogs] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [resultsExist, setResultsExist] = useState(false)

	// Helper function to infer UG/PG grade system from program code/name
	const inferGradeSystemFromProgram = useCallback((programCode?: string, programName?: string): ProgramType => {
		const code = (programCode || '').toUpperCase()
		const name = (programName || '').toUpperCase()
		// PG patterns: M.A., M.Sc., MBA, MCA, M.Com, M.Phil, Ph.D, etc.
		const pgPatterns = ['M.', 'MA', 'MSC', 'MBA', 'MCA', 'MCOM', 'MPHIL', 'PHD', 'PH.D', 'MASTER', 'POST']
		for (const pattern of pgPatterns) {
			if (code.includes(pattern) || name.includes(pattern)) {
				return 'PG'
			}
		}
		return 'UG'
	}, [])

	// Callback definitions - must be before useEffect hooks that use them
	const fetchInstitutions = useCallback(async () => {
		try {
			// Use institutions from context if available (for super_admin or single institution)
			if (availableInstitutions.length > 0) {
				const mapped = availableInstitutions.map(inst => ({
					id: inst.id,
					code: inst.institution_code,
					name: inst.institution_name,
					myjkkn_institution_ids: (inst as any).myjkkn_institution_ids || []
				}))
				setInstitutions(mapped)
				return
			}

			// Fallback to API fetch
			const url = appendToUrl('/api/grading/final-marks?action=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data.map((i: any) => ({
					id: i.id,
					code: i.institution_code,
					name: i.name,
					myjkkn_institution_ids: i.myjkkn_institution_ids || []
				})))
			}
		} catch (e) {
			console.error('Failed to fetch institutions:', e)
		}
	}, [appendToUrl, availableInstitutions])

	const fetchSessions = useCallback(async (institutionId: string) => {
		try {
			const res = await fetch(`/api/grading/final-marks?action=sessions&institutionId=${institutionId}`)
			if (res.ok) {
				const data = await res.json()
				setSessions(data.map((s: any) => ({
					id: s.id,
					code: s.session_code,
					name: s.session_name
				})))
			}
		} catch (e) {
			console.error('Failed to fetch sessions:', e)
		}
	}, [])

	// Use ref for institutions to avoid dependency cycle
	const institutionsRef = useRef(institutions)
	useEffect(() => {
		institutionsRef.current = institutions
	}, [institutions])

	// Fetch programs from MyJKKN API using myjkkn_institution_ids
	const fetchPrograms = useCallback(async (institutionId: string) => {
		try {
			setProgramsLoading(true)
			setPrograms([])

			// Get the institution with its myjkkn_institution_ids from ref to avoid dependency cycle
			const currentInstitutions = institutionsRef.current
			const institution = currentInstitutions.find(i => i.id === institutionId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			if (myjkknIds.length === 0) {
				console.warn('[SemesterResults] No MyJKKN institution IDs found for institution:', institutionId)
				// Fallback to local programs table
				const res = await fetch(`/api/grading/final-marks?action=programs&institutionId=${institutionId}`)
				if (res.ok) {
					const data = await res.json()
					setPrograms(data.map((p: any) => ({
						id: p.id,
						code: p.program_code,
						name: p.program_name,
						type: (p.grade_system_code || 'UG') as ProgramType
					})))
				}
				return
			}

			// Fetch programs from MyJKKN API using the hook
			console.log('[SemesterResults] Fetching programs from MyJKKN for institution IDs:', myjkknIds)
			const progs = await fetchMyJKKNPrograms(myjkknIds)

			// Transform MyJKKN programs to DropdownOption format and sort by program_code
			const transformedPrograms = progs.map(p => ({
				id: p.id, // MyJKKN UUID
				code: p.program_code, // Code like "BCA"
				name: p.program_name,
				type: inferGradeSystemFromProgram(p.program_code, p.program_name)
			})).sort((a, b) => a.code.localeCompare(b.code))

			console.log('[SemesterResults] Fetched', transformedPrograms.length, 'programs from MyJKKN')
			setPrograms(transformedPrograms)
		} catch (e) {
			console.error('Failed to fetch programs:', e)
			setPrograms([])
		} finally {
			setProgramsLoading(false)
		}
	}, [fetchMyJKKNPrograms, inferGradeSystemFromProgram])

	const fetchSemesters = useCallback(async (institutionId: string, programId: string, sessionId: string, programCode?: string) => {
		try {
			console.log('Fetching semesters with:', { institutionId, programId, sessionId, programCode })
			// Pass both programId (MyJKKN UUID) and programCode (text like "BCA") for filtering
			const params = new URLSearchParams({
				action: 'semesters',
				institutionId,
				programId,
				sessionId
			})
			if (programCode) {
				params.append('programCode', programCode)
			}
			const res = await fetch(`/api/grading/semester-results?${params.toString()}`)
			if (res.ok) {
				const data = await res.json()
				console.log('Semesters fetched:', data)
				setSemesters(data)
			} else {
				const errorData = await res.json()
				console.error('Failed to fetch semesters:', errorData)
			}
		} catch (e) {
			console.error('Failed to fetch semesters:', e)
		}
	}, [])

	// Fetch institutions on mount when ready
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
		}
	}, [isReady, fetchInstitutions])

	// Auto-fill institution from context when available
	useEffect(() => {
		if (isReady && !mustSelectInstitution && institutions.length > 0) {
			const autoId = getInstitutionIdForCreate()
			if (autoId && !selectedInstitution) {
				setSelectedInstitution(autoId)
			}
		}
	}, [isReady, mustSelectInstitution, institutions, getInstitutionIdForCreate, selectedInstitution])

	// Fetch sessions and programs when institution changes
	// Note: Programs need institutions to be loaded to get myjkkn_institution_ids
	// Using institutionsRef to avoid dependency cycle - only run when selectedInstitution changes
	useEffect(() => {
		const currentInstitutions = institutionsRef.current
		if (selectedInstitution && currentInstitutions.length > 0) {
			// Fetch sessions and programs in parallel for better performance
			Promise.all([
				fetchSessions(selectedInstitution),
				fetchPrograms(selectedInstitution)
			])
		} else if (selectedInstitution && currentInstitutions.length === 0) {
			// Institution selected but institutions not loaded yet - just fetch sessions
			fetchSessions(selectedInstitution)
		} else {
			setSessions([])
			setPrograms([])
		}
		setSelectedSession("")
		setSelectedPrograms([])
		setSelectedSemesters([])
		setSemesters([])
		setLearnerResults([])
		setSummary(null)
		setProgramType(null)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedInstitution, fetchSessions, fetchPrograms])

	// Refresh programs and clear data when session changes (for same institution)
	useEffect(() => {
		if (selectedSession && selectedInstitution) {
			// Clear previous data
			setSelectedPrograms([])
			setSelectedSemesters([])
			setSemesters([])
			setLearnerResults([])
			setSummary(null)
			setStoredResults([])
			setStoredSummary(null)
			setSelectedStoredIds(new Set())
			setProgramType(null)

			// Refresh programs for the new session
			fetchPrograms(selectedInstitution)
		}
	}, [selectedSession])

	// Fetch semesters when programs and session change
	useEffect(() => {
		if (selectedPrograms.length > 0 && selectedSession && selectedInstitution) {
			// Fetch semesters for the first selected program
			// Get programCode from programs state for filtering course_offerings
			const selectedProgramData = programs.find(p => p.id === selectedPrograms[0])
			const programCode = selectedProgramData?.code || ''
			fetchSemesters(selectedInstitution, selectedPrograms[0], selectedSession, programCode)
		} else {
			setSemesters([])
		}
		setSelectedSemesters([])
		setLearnerResults([])
		setSummary(null)
	}, [selectedPrograms, selectedSession, selectedInstitution, fetchSemesters, programs])

	// Update program type when programs selection changes
	useEffect(() => {
		if (selectedPrograms.length > 0) {
			const firstProgram = programs.find(p => p.id === selectedPrograms[0])
			setProgramType(firstProgram?.type || null)
		} else {
			setProgramType(null)
		}
	}, [selectedPrograms, programs])

	// Check if semester results already exist when selection changes
	useEffect(() => {
		const checkExistingResults = async () => {
			if (!selectedInstitution || !selectedSession || selectedPrograms.length === 0) {
				setResultsExist(false)
				return
			}

			try {
				// Get programCode from programs state
				const selectedProgramData = programs.find(p => p.id === selectedPrograms[0])
				const programCode = selectedProgramData?.code || ''

				const params = new URLSearchParams({
					action: 'check-exists',
					institutionId: selectedInstitution,
					sessionId: selectedSession,
					programId: selectedPrograms[0] // MyJKKN UUID (fallback)
				})
				if (programCode) {
					params.append('programCode', programCode) // Text code like "BCA" (preferred)
				}
				if (selectedSemesters.length === 1) {
					params.append('semester', String(selectedSemesters[0]))
				}

				const res = await fetch(`/api/grading/semester-results?${params.toString()}`)
				if (res.ok) {
					const data = await res.json()
					setResultsExist(data.exists || false)
				}
			} catch (e) {
				console.error('Failed to check existing results:', e)
			}
		}

		checkExistingResults()
	}, [selectedInstitution, selectedSession, selectedPrograms, selectedSemesters, programs])

	// Auto-refresh stored results when switching to "Stored Results" tab or when filters change
	useEffect(() => {
		// Clear selection when filters change
		setSelectedStoredIds(new Set())

		// Auto-fetch if on stored tab and selections are made
		if (mainTab === 'stored' && selectedInstitution && selectedSession && selectedPrograms.length > 0) {
			fetchStoredResults()
		}
	}, [mainTab, selectedInstitution, selectedSession, selectedPrograms, selectedSemesters])

	const fetchResults = async () => {
		if (!selectedInstitution || !selectedSession || selectedPrograms.length === 0) {
			toast({
				title: 'Missing Selection',
				description: 'Please select institution, session, and at least one program',
				variant: 'destructive'
			})
			return
		}

		setLoading(true)
		setLearnerResults([])
		setSummary(null)
		setCurrentPage(1)

		try {
			// For now, fetch results for the first selected program
			// TODO: Support multiple programs in a single fetch
			// Get program_code from programs state (MyJKKN data)
			const selectedProgramData = programs.find(p => p.id === selectedPrograms[0])
			const programCode = selectedProgramData?.code || ''

			const params = new URLSearchParams({
				action: 'program-results',
				institutionId: selectedInstitution,
				sessionId: selectedSession,
				programId: selectedPrograms[0],
				programCode: programCode, // Add program_code for filtering final_marks
				programType: programType || 'UG',
				includePartBreakdown: groupByPart ? 'true' : 'false'
			})

			if (selectedSemesters.length === 1) {
				params.append('semester', String(selectedSemesters[0]))
			} else if (selectedSemesters.length > 1) {
				// Multiple semesters - pass as comma-separated
				params.append('semesters', selectedSemesters.join(','))
			}

			const res = await fetch(`/api/grading/semester-results?${params.toString()}`)
			if (!res.ok) {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to fetch results')
			}

			const data = await res.json()
			setLearnerResults(data.results || [])
			setSummary(data.summary || null)

			toast({
				title: 'Results Loaded',
				description: `Fetched results for ${data.results?.length || 0} learners.`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (e) {
			console.error('Fetch error:', e)
			toast({
				title: 'Fetch Failed',
				description: e instanceof Error ? e.message : 'Failed to fetch results',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}

	// Fetch stored semester results
	const fetchStoredResults = async () => {
		if (!selectedInstitution || !selectedSession || selectedPrograms.length === 0) {
			toast({
				title: 'Missing Selection',
				description: 'Please select institution, session, and at least one program',
				variant: 'destructive'
			})
			return
		}

		setStoredLoading(true)
		setStoredResults([])
		setStoredSummary(null)
		setSelectedStoredIds(new Set())
		setStoredCurrentPage(1)

		try {
			// Fetch results for ALL selected programs
			const allResults: StoredSemesterResult[] = []

			for (const programId of selectedPrograms) {
				// Get programCode from programs state
				const programData = programs.find(p => p.id === programId)
				const programCode = programData?.code || ''

				const params = new URLSearchParams({
					action: 'stored-results',
					institutionId: selectedInstitution,
					sessionId: selectedSession,
					programId: programId // MyJKKN UUID (fallback)
				})
				if (programCode) {
					params.append('programCode', programCode) // Text code like "BCA" (preferred)
				}

				if (selectedSemesters.length === 1) {
					params.append('semester', String(selectedSemesters[0]))
				}

				const res = await fetch(`/api/grading/semester-results?${params.toString()}`)
				if (!res.ok) {
					const errorData = await res.json()
					throw new Error(errorData.error || 'Failed to fetch stored results')
				}

				const data = await res.json()
				if (data.results && data.results.length > 0) {
					allResults.push(...data.results)
				}
			}

			// Sort combined results by register_number
			allResults.sort((a, b) => (a.register_number || '').localeCompare(b.register_number || ''))

			// Recalculate summary for combined results
			const combinedSummary = {
				total_learners: allResults.length,
				passed: allResults.filter(r => r.result_status === 'Pass').length,
				failed: allResults.filter(r => r.result_status === 'Fail').length,
				pending: allResults.filter(r => r.result_status === 'Pending').length,
				incomplete: allResults.filter(r => r.result_status === 'Incomplete').length,
				published: allResults.filter(r => r.is_published).length,
				unpublished: allResults.filter(r => !r.is_published).length,
				locked: allResults.filter(r => r.is_locked).length,
				with_backlogs: allResults.filter(r => r.total_backlogs > 0).length,
				distinction_count: allResults.filter(r => r.is_distinction).length,
				first_class_count: allResults.filter(r => r.is_first_class).length,
				average_sgpa: allResults.length > 0
					? Math.round(allResults.reduce((sum, r) => sum + (r.sgpa || 0), 0) / allResults.length * 100) / 100
					: 0,
				average_cgpa: allResults.length > 0
					? Math.round(allResults.reduce((sum, r) => sum + (r.cgpa || 0), 0) / allResults.length * 100) / 100
					: 0
			}

			setStoredResults(allResults)
			setStoredSummary(combinedSummary)
			setResultsExist(allResults.length > 0)

			toast({
				title: 'Stored Results Loaded',
				description: `Found ${allResults.length} semester result records across ${selectedPrograms.length} program(s).`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (e) {
			console.error('Fetch stored results error:', e)
			toast({
				title: 'Fetch Failed',
				description: e instanceof Error ? e.message : 'Failed to fetch stored results',
				variant: 'destructive'
			})
		} finally {
			setStoredLoading(false)
		}
	}

	// Generate semester results (calculate and store in DB)
	const handleGenerateResults = async () => {
		if (!selectedSession || selectedPrograms.length === 0) {
			toast({
				title: 'Missing Selection',
				description: 'Please select session and at least one program',
				variant: 'destructive'
			})
			return
		}

		setGenerating(true)

		try {
			const res = await fetch('/api/grading/semester-results', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'generate-results',
					sessionId: selectedSession,
					programId: selectedPrograms[0],
					semester: selectedSemesters.length === 1 ? selectedSemesters[0] : null,
					programType: programType || 'UG'
				})
			})

			if (!res.ok) {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to generate results')
			}

			const data = await res.json()

			if (data.summary?.success > 0) {
				toast({
					title: '✅ Results Generated Successfully',
					description: `${data.summary.success} semester result(s) stored in database.${data.summary.failed > 0 ? ` (${data.summary.failed} failed)` : ''}`,
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
					duration: 5000
				})
			} else if (data.summary?.total === 0) {
				toast({
					title: 'No Results to Generate',
					description: 'No final marks found for the selected criteria.',
					className: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200'
				})
			} else {
				toast({
					title: 'Results Generated',
					description: data.message,
					className: 'bg-green-50 border-green-200 text-green-800'
				})
			}

			setMainTab('stored')
			await fetchStoredResults()
		} catch (e) {
			console.error('Generate error:', e)
			toast({
				title: '❌ Generation Failed',
				description: e instanceof Error ? e.message : 'Failed to generate results. Please try again.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
			})
		} finally {
			setGenerating(false)
		}
	}

	// Declare selected results
	const handleDeclareResults = async () => {
		if (selectedStoredIds.size === 0) {
			toast({
				title: 'No Selection',
				description: 'Please select results to declare',
				variant: 'destructive'
			})
			return
		}

		setDeclaring(true)

		try {
			const res = await fetch('/api/grading/semester-results', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'declare-results',
					semesterResultIds: Array.from(selectedStoredIds),
					userId: user?.id,
					userEmail: user?.email
				})
			})

			if (!res.ok) {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to declare results')
			}

			const data = await res.json()

			toast({
				title: 'Results Declared',
				description: data.message,
				className: 'bg-green-50 border-green-200 text-green-800'
			})

			setSelectedStoredIds(new Set())
			await fetchStoredResults()
		} catch (e) {
			console.error('Declare error:', e)
			toast({
				title: 'Declaration Failed',
				description: e instanceof Error ? e.message : 'Failed to declare results',
				variant: 'destructive'
			})
		} finally {
			setDeclaring(false)
		}
	}

	// Publish selected results
	const handlePublishResults = async () => {
		if (selectedStoredIds.size === 0) {
			toast({
				title: 'No Selection',
				description: 'Please select results to publish',
				variant: 'destructive'
			})
			return
		}

		const selectedResults = storedResults.filter(r => selectedStoredIds.has(r.id))
		const undeclared = selectedResults.filter(r => !r.result_declared_date)
		if (undeclared.length > 0) {
			toast({
				title: 'Cannot Publish',
				description: `${undeclared.length} result(s) are not declared yet. Please declare first.`,
				variant: 'destructive'
			})
			return
		}

		setPublishing(true)

		try {
			const res = await fetch('/api/grading/semester-results', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'publish-results',
					semesterResultIds: Array.from(selectedStoredIds),
					userId: user?.id,
					userEmail: user?.email
				})
			})

			if (!res.ok) {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to publish results')
			}

			const data = await res.json()

			toast({
				title: 'Results Published',
				description: data.message,
				className: 'bg-green-50 border-green-200 text-green-800'
			})

			setSelectedStoredIds(new Set())
			await fetchStoredResults()
		} catch (e) {
			console.error('Publish error:', e)
			toast({
				title: 'Publication Failed',
				description: e instanceof Error ? e.message : 'Failed to publish results',
				variant: 'destructive'
			})
		} finally {
			setPublishing(false)
		}
	}

	// Create backlogs from failed results
	const handleCreateBacklogs = async () => {
		if (!selectedSession) {
			toast({
				title: 'Missing Selection',
				description: 'Please select session',
				variant: 'destructive'
			})
			return
		}

		setCreatingBacklogs(true)

		try {
			const res = await fetch('/api/grading/semester-results', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'create-backlogs',
					sessionId: selectedSession,
					programId: selectedPrograms.length > 0 ? selectedPrograms[0] : null,
					semester: selectedSemesters.length === 1 ? selectedSemesters[0] : null
				})
			})

			if (!res.ok) {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to create backlogs')
			}

			const data = await res.json()

			toast({
				title: 'Backlogs Created',
				description: data.message,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (e) {
			console.error('Create backlogs error:', e)
			toast({
				title: 'Failed',
				description: e instanceof Error ? e.message : 'Failed to create backlogs',
				variant: 'destructive'
			})
		} finally {
			setCreatingBacklogs(false)
		}
	}

	// Delete non-published semester results based on filters
	const handleDeleteResults = async () => {
		if (!selectedInstitution || !selectedSession || selectedPrograms.length === 0) {
			toast({
				title: 'Missing Selection',
				description: 'Please select institution, session, and at least one program',
				variant: 'destructive'
			})
			return
		}

		// Confirm deletion
		const confirmDelete = window.confirm(
			'Are you sure you want to delete all non-published semester results for the selected filters?\n\nThis action cannot be undone.'
		)
		if (!confirmDelete) return

		setDeleting(true)

		try {
			const res = await fetch('/api/grading/semester-results', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'delete-results',
					institutionId: selectedInstitution,
					sessionId: selectedSession,
					programIds: selectedPrograms,
					semesters: selectedSemesters.length > 0 ? selectedSemesters : null
				})
			})

			if (!res.ok) {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to delete results')
			}

			const data = await res.json()

			toast({
				title: '✅ Deleted',
				description: data.message || `Deleted ${data.deleted_count || 0} semester results`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})

			// Refresh stored results
			await fetchStoredResults()
		} catch (e) {
			console.error('Delete error:', e)
			toast({
				title: '❌ Delete Failed',
				description: e instanceof Error ? e.message : 'Failed to delete results',
				variant: 'destructive'
			})
		} finally {
			setDeleting(false)
		}
	}

	// Toggle selection
	const toggleStoredSelection = (id: string) => {
		setSelectedStoredIds(prev => {
			const newSet = new Set(prev)
			if (newSet.has(id)) {
				newSet.delete(id)
			} else {
				newSet.add(id)
			}
			return newSet
		})
	}

	// Select all stored results (on current page)
	const selectAllStored = () => {
		setSelectedStoredIds(new Set(paginatedStoredResults.map(r => r.id)))
	}

	// Select all across all pages
	const selectAllStoredGlobal = () => {
		setSelectedStoredIds(new Set(filteredStoredResults.map(r => r.id)))
	}

	// Clear selection
	const clearStoredSelection = () => {
		setSelectedStoredIds(new Set())
	}

	const toggleLearnerExpand = (learnerId: string) => {
		setExpandedLearners(prev => {
			const newSet = new Set(prev)
			if (newSet.has(learnerId)) {
				newSet.delete(learnerId)
			} else {
				newSet.add(learnerId)
			}
			return newSet
		})
	}

	const expandAll = () => {
		setExpandedLearners(new Set(learnerResults.map(s => s.student_id)))
	}

	const collapseAll = () => {
		setExpandedLearners(new Set())
	}

	// Filter and paginate results
	const filteredResults = useMemo(() => {
		if (!searchTerm) return learnerResults
		const search = searchTerm.toLowerCase()
		return learnerResults.filter(s =>
			s.register_no.toLowerCase().includes(search) ||
			s.student_name.toLowerCase().includes(search)
		)
	}, [learnerResults, searchTerm])

	const paginatedResults = useMemo(() => {
		if (pageSize === 'all') return filteredResults
		const size = parseInt(pageSize)
		const start = (currentPage - 1) * size
		return filteredResults.slice(start, start + size)
	}, [filteredResults, pageSize, currentPage])

	const totalPages = useMemo(() => {
		if (pageSize === 'all') return 1
		return Math.ceil(filteredResults.length / parseInt(pageSize))
	}, [filteredResults.length, pageSize])

	// Filter stored results
	const [storedSearchTerm, setStoredSearchTerm] = useState("")

	const filteredStoredResults = useMemo(() => {
		if (!storedSearchTerm) return storedResults
		const search = storedSearchTerm.toLowerCase()
		return storedResults.filter(r =>
			r.register_number.toLowerCase().includes(search) ||
			r.student_name.toLowerCase().includes(search)
		)
	}, [storedResults, storedSearchTerm])

	const paginatedStoredResults = useMemo(() => {
		if (storedPageSize === 'all') return filteredStoredResults
		const size = parseInt(storedPageSize)
		const start = (storedCurrentPage - 1) * size
		return filteredStoredResults.slice(start, start + size)
	}, [filteredStoredResults, storedPageSize, storedCurrentPage])

	const storedTotalPages = useMemo(() => {
		if (storedPageSize === 'all') return 1
		return Math.ceil(filteredStoredResults.length / parseInt(storedPageSize))
	}, [filteredStoredResults.length, storedPageSize])

	// Button visibility logic based on declaration/publication status
	const allDeclared = useMemo(() => {
		return storedResults.length > 0 && storedResults.every(r => r.result_declared_date !== null)
	}, [storedResults])

	const allPublished = useMemo(() => {
		return storedResults.length > 0 && storedResults.every(r => r.is_published === true)
	}, [storedResults])

	const showDeclareButton = !allDeclared
	const showPublishButton = allDeclared && !allPublished
	const showDeleteButton = storedResults.length > 0 && !allPublished

	// Export to Excel
	const handleExport = () => {
		if (learnerResults.length === 0) {
			toast({
				title: 'No Data',
				description: 'No results to export.',
				variant: 'destructive'
			})
			return
		}

		const program = programs.find(p => p.id === selectedPrograms[0])
		const session = sessions.find(s => s.id === selectedSession)

		const exportData: any[] = []

		learnerResults.forEach(learner => {
			learner.courses.forEach(course => {
				exportData.push({
					'Register No': learner.register_no,
					'Learner Name': learner.student_name,
					'Semester': course.semester,
					'Part': course.course_part,
					'Course Code': course.course_code,
					'Course Name': course.course_name,
					'Credits': course.credits,
					'Internal': `${course.internal_marks}/${course.internal_max}`,
					'External': `${course.external_marks}/${course.external_max}`,
					'Total': `${course.total_marks}/${course.total_max}`,
					'Percentage': course.percentage.toFixed(2),
					'Grade': course.letter_grade,
					'Grade Point': course.grade_point,
					'Credit Points': course.credit_points.toFixed(2),
					'Status': course.pass_status
				})
			})

			exportData.push({
				'Register No': learner.register_no,
				'Learner Name': learner.student_name,
				'Semester': '',
				'Part': 'TOTAL',
				'Course Code': '',
				'Course Name': '',
				'Credits': learner.total_credits,
				'Internal': '',
				'External': '',
				'Total': '',
				'Percentage': '',
				'Grade': '',
				'Grade Point': '',
				'Credit Points': learner.total_credit_points.toFixed(2),
				'Status': `GPA: ${learner.semester_gpa.toFixed(2)}`
			})
		})

		const ws = XLSX.utils.json_to_sheet(exportData)
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Semester Results')

		const fileName = `semester_results_${program?.code || 'program'}_${session?.code || 'session'}_${new Date().toISOString().split('T')[0]}.xlsx`
		XLSX.writeFile(wb, fileName)

		toast({
			title: 'Export Successful',
			description: `Exported ${learnerResults.length} learner records.`,
			className: 'bg-green-50 border-green-200 text-green-800'
		})
	}

	const parts = programType === 'UG' ? UG_PARTS : PG_PARTS
	const hasResults = learnerResults.length > 0
	const canFetch = selectedInstitution && selectedSession && selectedPrograms.length > 0

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					{/* Breadcrumb */}
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
									<BreadcrumbLink asChild>
										<Link href="/grading/grades">Grading</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Semester Results & GPA</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Page Header */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 flex items-center justify-center">
								<Calculator className="h-5 w-5 text-white" />
							</div>
							<div>
								<h1 className="text-2xl font-bold">Semester Results & GPA Calculator</h1>
								<p className="text-sm text-muted-foreground">View and calculate GPA/CGPA with Part-wise breakdown</p>
							</div>
						</div>
						{programType && (
							<Badge
								className={cn(
									"text-sm font-semibold px-4 py-1.5",
									programType === 'UG'
										? "bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0"
										: "bg-gradient-to-r from-purple-500 to-purple-600 text-white border-0"
								)}
							>
								{programType} Program
							</Badge>
						)}
					</div>

					{/* Selection Card */}
					<Card>
						<CardHeader className="pb-3">
							<div className="flex items-center gap-3">
								<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
									<GraduationCap className="h-4 w-4 text-white" />
								</div>
								<div>
									<CardTitle className="text-lg">Select Parameters</CardTitle>
									<CardDescription>Choose institution, session, program and semester</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className={`grid grid-cols-1 gap-4 ${mustSelectInstitution ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
								{/* Institution - Show only when mustSelectInstitution is true */}
								{mustSelectInstitution && (
									<div className="space-y-2">
										<Label>Institution *</Label>
										<SearchableSelect
											options={institutions}
											value={selectedInstitution}
											onValueChange={setSelectedInstitution}
											placeholder="Select institution"
										/>
									</div>
								)}
								{mustSelectSession && (
								<div className="space-y-2">
									<Label>Examination Session *</Label>
									<SearchableSelect
										options={sessions}
										value={selectedSession}
										onValueChange={setSelectedSession}
										placeholder="Select session"
										disabled={mustSelectInstitution && !selectedInstitution}
									/>
								</div>
								)}
								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<Label>Program(s) *</Label>
										{selectedInstitution && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => {
													setSelectedPrograms([])
													setSelectedSemesters([])
													fetchPrograms(selectedInstitution)
												}}
												disabled={programsLoading}
												className="h-7 px-2"
											>
												<RefreshCw className={`h-3.5 w-3.5 ${programsLoading ? 'animate-spin' : ''}`} />
											</Button>
										)}
									</div>
									<MultiSelectProgram
										options={programs}
										selectedIds={selectedPrograms}
										onSelectionChange={setSelectedPrograms}
										placeholder="Select program(s)"
										disabled={mustSelectInstitution && !selectedInstitution}
										loading={programsLoading}
									/>
								</div>
								<div className="space-y-2">
									<Label>Semester(s)</Label>
									<MultiSelectSemester
										semesters={semesters}
										selectedSemesters={selectedSemesters}
										onSelectionChange={setSelectedSemesters}
										disabled={semesters.length === 0}
									/>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Main Tabs: Calculate vs Stored */}
					<Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'calculate' | 'stored')}>
						<div className="flex items-center justify-between">
							<TabsList className="grid w-[400px] grid-cols-2 h-11">
								<TabsTrigger
									value="calculate"
									className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-md"
								>
									<Calculator className="h-4 w-4" />
									Calculate Results (Preview)
								</TabsTrigger>
								<TabsTrigger
									value="stored"
									className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md"
								>
									<Database className="h-4 w-4" />
									Stored Results
								</TabsTrigger>
							</TabsList>
						</div>

						{/* Calculate Tab Content */}
						<TabsContent value="calculate" className="mt-4 space-y-4">
							{/* Fetch Controls */}
							<Card>
								<CardContent className="py-4">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-4">
											<div className="flex items-center gap-2">
												<Switch
													id="groupByPart"
													checked={groupByPart}
													onCheckedChange={setGroupByPart}
												/>
												<Label htmlFor="groupByPart" className="text-sm">Group by Part</Label>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<Button onClick={fetchResults} disabled={!canFetch || loading}>
												{loading ? (
													<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading...</>
												) : (
													<><Eye className="h-4 w-4 mr-2" /> Preview Results</>
												)}
											</Button>
											{resultsExist ? (
												<Badge variant="outline" className="text-green-600 border-green-600 bg-green-50">
													<CheckCircle2 className="h-3 w-3 mr-1" />
													Results Already Generated
												</Badge>
											) : learnerResults.length > 0 ? (
												<Button
													variant="default"
													onClick={handleGenerateResults}
													disabled={!canFetch || generating}
													className="bg-green-600 hover:bg-green-700"
												>
													{generating ? (
														<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
													) : (
														<><Play className="h-4 w-4 mr-2" /> Save GPA</>
													)}
												</Button>
											) : null}
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Results Section */}
							{learnerResults.length > 0 && (
								<>
									{/* Summary Cards */}
									<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
										<Card>
											<CardContent className="p-3">
												<div className="flex items-center justify-between">
													<div>
														<p className="text-xs font-medium text-muted-foreground">Total Learners</p>
														<p className="text-xl font-bold">{summary?.total_learners || 0}</p>
													</div>
													<Users className="h-5 w-5 text-blue-500" />
												</div>
											</CardContent>
										</Card>
										<Card>
											<CardContent className="p-3">
												<div className="flex items-center justify-between">
													<div>
														<p className="text-xs font-medium text-muted-foreground">Passed</p>
														<p className="text-xl font-bold text-green-600">{summary?.passed_learners || 0}</p>
													</div>
													<CheckCircle2 className="h-5 w-5 text-green-500" />
												</div>
											</CardContent>
										</Card>
										<Card>
											<CardContent className="p-3">
												<div className="flex items-center justify-between">
													<div>
														<p className="text-xs font-medium text-muted-foreground">Failed</p>
														<p className="text-xl font-bold text-red-600">{summary?.failed_learners || 0}</p>
													</div>
													<AlertTriangle className="h-5 w-5 text-red-500" />
												</div>
											</CardContent>
										</Card>
										<Card>
											<CardContent className="p-3">
												<div className="flex items-center justify-between">
													<div>
														<p className="text-xs font-medium text-muted-foreground">Pass %</p>
														<p className="text-xl font-bold">{summary?.pass_percentage || 0}%</p>
													</div>
													<TrendingUp className="h-5 w-5 text-blue-500" />
												</div>
											</CardContent>
										</Card>
										<Card>
											<CardContent className="p-3">
												<div className="flex items-center justify-between">
													<div>
														<p className="text-xs font-medium text-muted-foreground">Avg GPA</p>
														<p className="text-xl font-bold text-purple-600">{summary?.average_gpa?.toFixed(2) || '0.00'}</p>
													</div>
													<Award className="h-5 w-5 text-purple-500" />
												</div>
											</CardContent>
										</Card>
										<Card>
											<CardContent className="p-3">
												<div className="flex items-center justify-between">
													<div>
														<p className="text-xs font-medium text-muted-foreground">Highest GPA</p>
														<p className="text-xl font-bold text-green-600">{summary?.highest_gpa?.toFixed(2) || '0.00'}</p>
													</div>
													<TrendingUp className="h-5 w-5 text-green-500" />
												</div>
											</CardContent>
										</Card>
										<Card>
											<CardContent className="p-3">
												<div className="flex items-center justify-between">
													<div>
														<p className="text-xs font-medium text-muted-foreground">Lowest GPA</p>
														<p className="text-xl font-bold text-orange-600">{summary?.lowest_gpa?.toFixed(2) || '0.00'}</p>
													</div>
													<BarChart3 className="h-5 w-5 text-orange-500" />
												</div>
											</CardContent>
										</Card>
									</div>

									{/* Tabs for different views */}
									<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
										<div className="flex items-center justify-between">
											<TabsList className="h-10">
												<TabsTrigger
													value="results"
													className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md"
												>
													<Users className="h-4 w-4" />
													Learner Results
												</TabsTrigger>
												<TabsTrigger
													value="parts"
													className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-amber-600 data-[state=active]:text-white data-[state=active]:shadow-md"
												>
													<Layers className="h-4 w-4" />
													Part-wise Analysis
												</TabsTrigger>
												<TabsTrigger
													value="summary"
													className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-rose-600 data-[state=active]:text-white data-[state=active]:shadow-md"
												>
													<BarChart3 className="h-4 w-4" />
													Grade Distribution
												</TabsTrigger>
											</TabsList>
											<div className="flex items-center gap-2">
												<div className="relative">
													<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
													<Input
														value={searchTerm}
														onChange={(e) => setSearchTerm(e.target.value)}
														placeholder="Search learners..."
														className="pl-8 h-9 w-48"
													/>
												</div>
												<Select value={pageSize} onValueChange={(v) => { setPageSize(v); setCurrentPage(1); }}>
													<SelectTrigger className="w-24 h-9">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{PAGE_SIZE_OPTIONS.map(opt => (
															<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
														))}
													</SelectContent>
												</Select>
												<Button variant="outline" size="sm" onClick={handleExport}>
													<Download className="h-4 w-4 mr-1" />
													Export
												</Button>
											</div>
										</div>

										{/* Learner Results Tab */}
										<TabsContent value="results" className="mt-4">
											<Card>
												<CardHeader className="py-3">
													<div className="flex items-center justify-between">
														<div className="flex items-center gap-2">
															<CardTitle className="text-lg">Learner Results</CardTitle>
															<Badge variant="secondary" className="text-xs">
																{filteredResults.length} learners
															</Badge>
														</div>
														<div className="flex gap-2">
															<Button variant="ghost" size="sm" onClick={expandAll}>
																Expand All
															</Button>
															<Button variant="ghost" size="sm" onClick={collapseAll}>
																Collapse All
															</Button>
														</div>
													</div>
												</CardHeader>
												<CardContent className="p-0">
													<div className="divide-y">
														{paginatedResults.map(learner => (
															<Collapsible
																key={learner.student_id}
																open={expandedLearners.has(learner.student_id)}
																onOpenChange={() => toggleLearnerExpand(learner.student_id)}
															>
																<CollapsibleTrigger asChild>
																	<div className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer">
																		<div className="flex items-center gap-4">
																			<ChevronRight className={`h-4 w-4 transition-transform ${expandedLearners.has(learner.student_id) ? 'rotate-90' : ''}`} />
																			<div>
																				<div className="font-medium">{learner.register_no}</div>
																				<div className="text-sm text-muted-foreground">{learner.student_name}</div>
																			</div>
																		</div>
																		<div className="flex items-center gap-4">
																			<Badge variant="outline" className="text-xs">
																				{learner.courses.length} Courses
																			</Badge>
																			<Badge variant="outline" className="text-xs">
																				{learner.total_credits} Credits
																			</Badge>
																			{learner.failed_count > 0 ? (
																				<Badge variant="destructive" className="text-xs">
																					{learner.failed_count} Arrear(s)
																				</Badge>
																			) : (
																				<Badge className="bg-green-600 text-xs">Passed</Badge>
																			)}
																			<Badge className={`text-sm font-bold ${learner.semester_gpa >= 8 ? 'bg-green-600' : learner.semester_gpa >= 6 ? 'bg-blue-600' : 'bg-orange-600'}`}>
																				GPA: {learner.semester_gpa.toFixed(2)}
																			</Badge>
																		</div>
																	</div>
																</CollapsibleTrigger>
																<CollapsibleContent>
																	<div className="px-4 pb-4">
																		{groupByPart && learner.part_breakdown ? (
																			<div className="space-y-4">
																				{learner.part_breakdown.map(part => (
																					<div key={part.part_name} className="border rounded-lg overflow-hidden">
																						<div className={`px-4 py-2 ${parts.find(p => p.name === part.part_name)?.color || 'bg-gray-500'} text-white flex items-center justify-between`}>
																							<div className="flex items-center gap-2">
																								<span className="font-semibold">{part.part_name}</span>
																								<span className="text-xs opacity-80">
																									({parts.find(p => p.name === part.part_name)?.description})
																								</span>
																							</div>
																							<div className="flex items-center gap-3 text-sm">
																								<span>{part.total_credits} Credits</span>
																								<span className="font-bold">GPA: {part.part_gpa.toFixed(2)}</span>
																							</div>
																						</div>
																						<Table>
																							<TableHeader>
																								<TableRow className="bg-slate-100 dark:bg-slate-800/50">
																									<TableHead className="text-xs font-semibold">Course</TableHead>
																									<TableHead className="text-xs text-center font-semibold">Cr</TableHead>
																									<TableHead className="text-xs text-center font-semibold">Int</TableHead>
																									<TableHead className="text-xs text-center font-semibold">Ext</TableHead>
																									<TableHead className="text-xs text-center font-semibold">Total</TableHead>
																									<TableHead className="text-xs text-center font-semibold">%</TableHead>
																									<TableHead className="text-xs text-center font-semibold">Grade</TableHead>
																									<TableHead className="text-xs text-center font-semibold">GP</TableHead>
																									<TableHead className="text-xs text-center font-semibold">CP</TableHead>
																									<TableHead className="text-xs text-center font-semibold">Status</TableHead>
																								</TableRow>
																							</TableHeader>
																							<TableBody>
																								{part.courses.map(course => (
																									<TableRow key={course.course_id}>
																										<TableCell className="text-xs">
																											<span className="font-medium">{course.course_code}</span>
																											<span className="text-muted-foreground ml-1">- {course.course_name}</span>
																										</TableCell>
																										<TableCell className="text-xs text-center">{course.credits}</TableCell>
																										<TableCell className="text-xs text-center">{course.internal_marks}/{course.internal_max}</TableCell>
																										<TableCell className="text-xs text-center">{course.external_marks}/{course.external_max}</TableCell>
																										<TableCell className="text-xs text-center font-medium">{course.total_marks}/{course.total_max}</TableCell>
																										<TableCell className="text-xs text-center">{course.percentage.toFixed(1)}</TableCell>
																										<TableCell className="text-xs text-center">
																											<Badge variant="outline">{course.letter_grade}</Badge>
																										</TableCell>
																										<TableCell className="text-xs text-center font-bold">{course.grade_point}</TableCell>
																										<TableCell className="text-xs text-center">{course.credit_points.toFixed(1)}</TableCell>
																										<TableCell className="text-center">
																											<Badge
																												variant={course.is_pass ? "default" : "destructive"}
																												className={`text-[10px] ${course.is_pass ? 'bg-green-600' : 'bg-red-600'}`}
																											>
																												{course.pass_status}
																											</Badge>
																										</TableCell>
																									</TableRow>
																								))}
																							</TableBody>
																						</Table>
																					</div>
																				))}
																			</div>
																		) : (
																			<div className="border rounded-lg overflow-hidden">
																				<Table>
																					<TableHeader>
																						<TableRow className="bg-slate-100 dark:bg-slate-800/50">
																							<TableHead className="text-xs font-semibold">Course</TableHead>
																							<TableHead className="text-xs text-center font-semibold">Part</TableHead>
																							<TableHead className="text-xs text-center font-semibold">Cr</TableHead>
																							<TableHead className="text-xs text-center font-semibold">Int</TableHead>
																							<TableHead className="text-xs text-center font-semibold">Ext</TableHead>
																							<TableHead className="text-xs text-center font-semibold">Total</TableHead>
																							<TableHead className="text-xs text-center font-semibold">%</TableHead>
																							<TableHead className="text-xs text-center font-semibold">Grade</TableHead>
																							<TableHead className="text-xs text-center font-semibold">GP</TableHead>
																							<TableHead className="text-xs text-center font-semibold">CP</TableHead>
																							<TableHead className="text-xs text-center font-semibold">Status</TableHead>
																						</TableRow>
																					</TableHeader>
																					<TableBody>
																						{learner.courses.map(course => (
																							<TableRow key={course.course_id}>
																								<TableCell className="text-xs">
																									<span className="font-medium">{course.course_code}</span>
																									<span className="text-muted-foreground ml-1">- {course.course_name}</span>
																								</TableCell>
																								<TableCell className="text-xs text-center">
																									<Badge variant="outline" className="text-[10px]">{course.course_part}</Badge>
																								</TableCell>
																								<TableCell className="text-xs text-center">{course.credits}</TableCell>
																								<TableCell className="text-xs text-center">{course.internal_marks}/{course.internal_max}</TableCell>
																								<TableCell className="text-xs text-center">{course.external_marks}/{course.external_max}</TableCell>
																								<TableCell className="text-xs text-center font-medium">{course.total_marks}/{course.total_max}</TableCell>
																								<TableCell className="text-xs text-center">{course.percentage.toFixed(1)}</TableCell>
																								<TableCell className="text-xs text-center">
																									<Badge variant="outline">{course.letter_grade}</Badge>
																								</TableCell>
																								<TableCell className="text-xs text-center font-bold">{course.grade_point}</TableCell>
																								<TableCell className="text-xs text-center">{course.credit_points.toFixed(1)}</TableCell>
																								<TableCell className="text-center">
																									<Badge
																										variant={course.is_pass ? "default" : "destructive"}
																										className={`text-[10px] ${course.is_pass ? 'bg-green-600' : 'bg-red-600'}`}
																									>
																										{course.pass_status}
																									</Badge>
																								</TableCell>
																							</TableRow>
																						))}
																					</TableBody>
																				</Table>
																			</div>
																		)}

																		{/* Learner Summary */}
																		<div className="mt-3 p-3 bg-muted/30 rounded-lg flex items-center justify-between">
																			<div className="flex items-center gap-6 text-sm">
																				<span>Total Credits: <strong>{learner.total_credits}</strong></span>
																				<span>Credit Points: <strong>{learner.total_credit_points.toFixed(2)}</strong></span>
																				<span>Passed: <strong className="text-green-600">{learner.passed_count}</strong></span>
																				<span>Failed: <strong className="text-red-600">{learner.failed_count}</strong></span>
																			</div>
																			<div className="text-lg font-bold">
																				Semester GPA: <span className="text-purple-600">{learner.semester_gpa.toFixed(2)}</span>
																			</div>
																		</div>
																	</div>
																</CollapsibleContent>
															</Collapsible>
														))}
													</div>

													{filteredResults.length === 0 && (
														<div className="text-center py-8 text-muted-foreground">
															<Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
															<p>{searchTerm ? 'No matching learners found' : 'No results available'}</p>
														</div>
													)}

													{/* Pagination */}
													{totalPages > 1 && (
														<div className="flex items-center justify-between px-4 py-3 border-t">
															<div className="text-sm text-muted-foreground">
																Showing {((currentPage - 1) * parseInt(pageSize)) + 1} to {Math.min(currentPage * parseInt(pageSize), filteredResults.length)} of {filteredResults.length}
															</div>
															<div className="flex items-center gap-2">
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
																	disabled={currentPage === 1}
																>
																	Previous
																</Button>
																<span className="text-sm">Page {currentPage} of {totalPages}</span>
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
																	disabled={currentPage === totalPages}
																>
																	Next
																</Button>
															</div>
														</div>
													)}
												</CardContent>
											</Card>
										</TabsContent>

										{/* Part-wise Analysis Tab */}
										<TabsContent value="parts" className="mt-4">
											<Card>
												<CardHeader>
													<CardTitle className="text-lg">Part-wise Analysis</CardTitle>
													<CardDescription>Performance breakdown by course parts</CardDescription>
												</CardHeader>
												<CardContent>
													{summary?.part_summaries ? (
														<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
															{parts.map(part => {
																const partData = summary.part_summaries?.[part.name]
																if (!partData) return null

																return (
																	<Card key={part.name} className="overflow-hidden">
																		<div className={`h-2 ${part.color}`} />
																		<CardContent className="p-4">
																			<div className="flex items-center justify-between mb-3">
																				<div>
																					<h4 className="font-semibold">{part.name}</h4>
																					<p className="text-xs text-muted-foreground">{part.description}</p>
																				</div>
																			</div>
																			<div className="grid grid-cols-3 gap-2 text-center">
																				<div className="p-2 bg-muted/50 rounded">
																					<div className="text-lg font-bold text-purple-600">{partData.average_gpa.toFixed(2)}</div>
																					<div className="text-[10px] text-muted-foreground">Avg GPA</div>
																				</div>
																				<div className="p-2 bg-muted/50 rounded">
																					<div className="text-lg font-bold">{partData.total_credits}</div>
																					<div className="text-[10px] text-muted-foreground">Credits</div>
																				</div>
																				<div className="p-2 bg-muted/50 rounded">
																					<div className="text-lg font-bold text-green-600">{partData.pass_rate}%</div>
																					<div className="text-[10px] text-muted-foreground">Pass Rate</div>
																				</div>
																			</div>
																		</CardContent>
																	</Card>
																)
															})}
														</div>
													) : (
														<div className="text-center py-8 text-muted-foreground">
															<Layers className="h-12 w-12 mx-auto mb-3 opacity-50" />
															<p>Enable "Group by Part" option to see part-wise analysis</p>
														</div>
													)}
												</CardContent>
											</Card>
										</TabsContent>

										{/* Grade Distribution Tab */}
										<TabsContent value="summary" className="mt-4">
											<Card>
												<CardHeader>
													<CardTitle className="text-lg">Grade Distribution</CardTitle>
													<CardDescription>Distribution of grades across all courses</CardDescription>
												</CardHeader>
												<CardContent>
													{summary?.grade_distribution && Object.keys(summary.grade_distribution).length > 0 ? (
														<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
															{['O', 'D+', 'D', 'A+', 'A', 'B', 'C', 'U', 'AAA'].map(grade => {
																const count = summary.grade_distribution[grade] || 0
																const total = Object.values(summary.grade_distribution).reduce((a, b) => a + b, 0)
																const percentage = total > 0 ? Math.round((count / total) * 100) : 0

																return (
																	<Card key={grade} className={`${count === 0 ? 'opacity-50' : ''}`}>
																		<CardContent className="p-3 text-center">
																			<Badge
																				variant="outline"
																				className={`text-lg font-bold mb-2 ${
																					grade === 'O' ? 'border-green-500 text-green-600' :
																					grade === 'U' || grade === 'AAA' ? 'border-red-500 text-red-600' :
																					''
																				}`}
																			>
																				{grade}
																			</Badge>
																			<div className="text-2xl font-bold">{count}</div>
																			<div className="text-xs text-muted-foreground">{percentage}%</div>
																		</CardContent>
																	</Card>
																)
															})}
														</div>
													) : (
														<div className="text-center py-8 text-muted-foreground">
															<BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
															<p>No grade distribution data available</p>
														</div>
													)}
												</CardContent>
											</Card>
										</TabsContent>
									</Tabs>
								</>
							)}

							{/* Empty State for Calculate Tab */}
							{!loading && learnerResults.length === 0 && (
								<Card className="py-12">
									<CardContent className="text-center">
										<div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
											<Calculator className="h-8 w-8 text-muted-foreground" />
										</div>
										<h3 className="text-lg font-semibold mb-2">No Results Calculated</h3>
										<p className="text-muted-foreground mb-4">
											Select institution, session, and program, then click "Preview Results" to calculate GPA/CGPA.
										</p>
										<p className="text-xs text-muted-foreground">
											After previewing, click "Save GPA" to store results to the database.
										</p>
									</CardContent>
								</Card>
							)}
						</TabsContent>

						{/* Stored Results Tab Content */}
						<TabsContent value="stored" className="mt-4 space-y-4">
							{/* Action Controls */}
							<Card>
								<CardContent className="py-4">
									<div className="flex items-center justify-between flex-wrap gap-3">
										<div className="flex items-center gap-2 flex-wrap">
											<Button
												variant="outline"
												size="sm"
												onClick={fetchStoredResults}
												disabled={!canFetch || storedLoading}
												className="bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300"
											>
												{storedLoading ? (
													<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading...</>
												) : (
													<><RefreshCw className="h-4 w-4 mr-2" /> Refresh</>
												)}
											</Button>
											{storedResults.length > 0 && (
												<>
													<Button
														variant="outline"
														size="sm"
														onClick={selectAllStored}
														className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700 dark:bg-green-900/20 dark:hover:bg-green-900/30 dark:border-green-800 dark:text-green-300"
													>
														<Check className="h-4 w-4 mr-1" />
														Select All
													</Button>
													{selectedStoredIds.size > 0 && (
														<>
															<Button
																variant="outline"
																size="sm"
																onClick={clearStoredSelection}
																className="bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:hover:bg-orange-900/30 dark:border-orange-800 dark:text-orange-300"
															>
																<X className="h-4 w-4 mr-1" />
																Clear Selection
															</Button>
															<Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300">
																{selectedStoredIds.size} selected
															</Badge>
														</>
													)}
												</>
											)}
										</div>
										<div className="flex items-center gap-2 flex-wrap">
											{showDeclareButton && (
												<Button
													variant="outline"
													onClick={handleDeclareResults}
													disabled={selectedStoredIds.size === 0 || declaring}
												>
													{declaring ? (
														<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Declaring...</>
													) : (
														<><CheckCheck className="h-4 w-4 mr-2" /> Declare Selected</>
													)}
												</Button>
											)}
											{showPublishButton && (
												<Button
													variant="default"
													onClick={handlePublishResults}
													disabled={selectedStoredIds.size === 0 || publishing}
													className="bg-blue-600 hover:bg-blue-700"
												>
													{publishing ? (
														<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Publishing...</>
													) : (
														<><Send className="h-4 w-4 mr-2" /> Publish Selected</>
													)}
												</Button>
											)}
											<Button
												variant="secondary"
												onClick={handleCreateBacklogs}
												disabled={creatingBacklogs || !selectedSession}
												className="bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:hover:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800"
											>
												{creatingBacklogs ? (
													<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
												) : (
													<><AlertTriangle className="h-4 w-4 mr-2" /> Create Backlogs</>
												)}
											</Button>
											{showDeleteButton && (
												<Button
													variant="destructive"
													onClick={handleDeleteResults}
													disabled={deleting}
													className="bg-red-600 hover:bg-red-700"
												>
													{deleting ? (
														<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</>
													) : (
														<><Trash2 className="h-4 w-4 mr-2" /> Delete Results</>
													)}
												</Button>
											)}
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Stored Results Summary */}
							{storedSummary && (
								<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
									<Card>
										<CardContent className="p-3">
											<div className="flex items-center justify-between">
												<div>
													<p className="text-xs font-medium text-muted-foreground">Total</p>
													<p className="text-xl font-bold">{storedSummary.total_learners}</p>
												</div>
												<Users className="h-5 w-5 text-blue-500" />
											</div>
										</CardContent>
									</Card>
									<Card>
										<CardContent className="p-3">
											<div className="flex items-center justify-between">
												<div>
													<p className="text-xs font-medium text-muted-foreground">Passed</p>
													<p className="text-xl font-bold text-green-600">{storedSummary.passed}</p>
												</div>
												<CheckCircle2 className="h-5 w-5 text-green-500" />
											</div>
										</CardContent>
									</Card>
									<Card>
										<CardContent className="p-3">
											<div className="flex items-center justify-between">
												<div>
													<p className="text-xs font-medium text-muted-foreground">Failed</p>
													<p className="text-xl font-bold text-red-600">{storedSummary.failed}</p>
												</div>
												<XCircle className="h-5 w-5 text-red-500" />
											</div>
										</CardContent>
									</Card>
									<Card>
										<CardContent className="p-3">
											<div className="flex items-center justify-between">
												<div>
													<p className="text-xs font-medium text-muted-foreground">Published</p>
													<p className="text-xl font-bold text-blue-600">{storedSummary.published}</p>
												</div>
												<Send className="h-5 w-5 text-blue-500" />
											</div>
										</CardContent>
									</Card>
									<Card>
										<CardContent className="p-3">
											<div className="flex items-center justify-between">
												<div>
													<p className="text-xs font-medium text-muted-foreground">Avg SGPA</p>
													<p className="text-xl font-bold text-purple-600">{storedSummary.average_sgpa.toFixed(2)}</p>
												</div>
												<Award className="h-5 w-5 text-purple-500" />
											</div>
										</CardContent>
									</Card>
									<Card>
										<CardContent className="p-3">
											<div className="flex items-center justify-between">
												<div>
													<p className="text-xs font-medium text-muted-foreground">With Backlogs</p>
													<p className="text-xl font-bold text-orange-600">{storedSummary.with_backlogs}</p>
												</div>
												<AlertTriangle className="h-5 w-5 text-orange-500" />
											</div>
										</CardContent>
									</Card>
								</div>
							)}

							{/* Stored Results Table */}
							{storedResults.length > 0 ? (
								<Card>
									<CardHeader className="py-3">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<CardTitle className="text-lg">Semester Results</CardTitle>
												<Badge variant="secondary" className="text-xs">
													{filteredStoredResults.length} records
												</Badge>
											</div>
											<div className="flex items-center gap-2">
												<div className="relative">
													<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
													<Input
														value={storedSearchTerm}
														onChange={(e) => { setStoredSearchTerm(e.target.value); setStoredCurrentPage(1); }}
														placeholder="Search..."
														className="pl-8 h-9 w-48"
													/>
												</div>
												<Select value={storedPageSize} onValueChange={(v) => { setStoredPageSize(v); setStoredCurrentPage(1); }}>
													<SelectTrigger className="w-24 h-9">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{PAGE_SIZE_OPTIONS.map(opt => (
															<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										</div>
									</CardHeader>
									<CardContent className="p-0">
										<div className="overflow-x-auto">
											<Table>
												<TableHeader>
													<TableRow className="bg-slate-100 dark:bg-slate-800/50">
														<TableHead className="w-10">
															<Checkbox
																checked={selectedStoredIds.size === paginatedStoredResults.length && paginatedStoredResults.length > 0}
																onCheckedChange={(checked) => checked ? selectAllStored() : clearStoredSelection()}
															/>
														</TableHead>
														<TableHead className="text-xs font-semibold">Register No</TableHead>
														<TableHead className="text-xs font-semibold">Learner Name</TableHead>
														<TableHead className="text-xs text-center font-semibold">Sem</TableHead>
														<TableHead className="text-xs text-center font-semibold">SGPA</TableHead>
														<TableHead className="text-xs text-center font-semibold">CGPA</TableHead>
														<TableHead className="text-xs text-center font-semibold">%</TableHead>
														<TableHead className="text-xs text-center font-semibold">Credits</TableHead>
														<TableHead className="text-xs text-center font-semibold">Backlogs</TableHead>
														<TableHead className="text-xs text-center font-semibold">Status</TableHead>
														<TableHead className="text-xs text-center font-semibold">Published</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{paginatedStoredResults.map(result => (
														<TableRow key={result.id} className={selectedStoredIds.has(result.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}>
															<TableCell>
																<Checkbox
																	checked={selectedStoredIds.has(result.id)}
																	onCheckedChange={() => toggleStoredSelection(result.id)}
																/>
															</TableCell>
															<TableCell className="text-xs font-medium">{result.register_number}</TableCell>
															<TableCell className="text-xs max-w-[200px] truncate" title={result.student_name}>{result.student_name}</TableCell>
															<TableCell className="text-xs text-center">{result.semester}</TableCell>
															<TableCell className="text-xs text-center font-bold text-purple-600">{result.sgpa?.toFixed(2)}</TableCell>
															<TableCell className="text-xs text-center font-bold text-indigo-600">{result.cgpa?.toFixed(2)}</TableCell>
															<TableCell className="text-xs text-center">{result.percentage?.toFixed(1)}%</TableCell>
															<TableCell className="text-xs text-center">{result.total_credits_earned}/{result.total_credits_registered}</TableCell>
															<TableCell className="text-center">
																{result.total_backlogs > 0 ? (
																	<Badge variant="destructive" className="text-[10px]">{result.total_backlogs}</Badge>
																) : (
																	<Badge variant="outline" className="text-[10px] text-green-600">0</Badge>
																)}
															</TableCell>
															<TableCell className="text-center">
																<Badge
																	variant={result.result_status === 'Pass' ? 'default' : result.result_status === 'Fail' ? 'destructive' : 'secondary'}
																	className={`text-[10px] ${result.result_status === 'Pass' ? 'bg-green-600' : ''}`}
																>
																	{result.result_status}
																</Badge>
															</TableCell>
															<TableCell className="text-center">
																{result.is_published ? (
																	<Badge className="text-[10px] bg-blue-600">
																		<CheckCircle2 className="h-3 w-3 mr-1" /> Yes
																	</Badge>
																) : result.result_declared_date ? (
																	<Badge variant="outline" className="text-[10px] text-yellow-600">
																		<Clock className="h-3 w-3 mr-1" /> Declared
																	</Badge>
																) : (
																	<Badge variant="outline" className="text-[10px] text-gray-500">
																		Pending
																	</Badge>
																)}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</div>

										{/* Pagination */}
										{storedTotalPages > 1 && (
											<div className="flex items-center justify-between px-4 py-3 border-t">
												<div className="text-sm text-muted-foreground">
													Showing {((storedCurrentPage - 1) * parseInt(storedPageSize)) + 1} to {Math.min(storedCurrentPage * parseInt(storedPageSize), filteredStoredResults.length)} of {filteredStoredResults.length}
												</div>
												<div className="flex items-center gap-2">
													<Button
														variant="outline"
														size="sm"
														onClick={() => setStoredCurrentPage(p => Math.max(1, p - 1))}
														disabled={storedCurrentPage === 1}
													>
														Previous
													</Button>
													<span className="text-sm">Page {storedCurrentPage} of {storedTotalPages}</span>
													<Button
														variant="outline"
														size="sm"
														onClick={() => setStoredCurrentPage(p => Math.min(storedTotalPages, p + 1))}
														disabled={storedCurrentPage === storedTotalPages}
													>
														Next
													</Button>
												</div>
											</div>
										)}
									</CardContent>
								</Card>
							) : (
								<Card className="py-12">
									<CardContent className="text-center">
										<div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
											<Database className="h-8 w-8 text-muted-foreground" />
										</div>
										<h3 className="text-lg font-semibold mb-2">No Stored Results</h3>
										<p className="text-muted-foreground mb-4">
											Click "Refresh" to fetch stored semester results, or use "Save GPA" in the Calculate tab.
										</p>
									</CardContent>
								</Card>
							)}
						</TabsContent>
					</Tabs>
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
