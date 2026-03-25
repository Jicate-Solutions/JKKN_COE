"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import XLSX from "@/lib/utils/excel-compat"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/common/use-toast"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useInstitution } from "@/context/institution-context"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { ProgramType } from "@/types/semester-results"
import {
	AlertTriangle,
	BookOpen,
	CheckCircle2,
	ChevronRight,
	Clock,
	Download,
	FileWarning,
	Loader2,
	RefreshCw,
	Search,
	Users,
	BarChart3,
	TrendingUp,
	AlertCircle,
	Filter,
	Check,
	ChevronsUpDown,
	X
} from "lucide-react"

// =====================================================
// TYPE DEFINITIONS
// =====================================================

interface BacklogItem {
	id: string
	student_id: string
	student_name: string
	register_number: string
	institutions_id: string
	institution_code: string
	institution_name: string
	program_id: string
	program_code: string
	program_name: string
	course_id: string
	course_code: string
	course_name: string
	course_credits: number
	original_semester: number
	original_session_code: string
	original_session_name: string
	original_internal_marks: number
	original_external_marks: number
	original_total_marks: number
	original_percentage: number
	original_letter_grade: string
	failure_reason: string
	is_absent: boolean
	is_cleared: boolean
	cleared_date: string | null
	cleared_session_code: string | null
	cleared_percentage: number | null
	cleared_letter_grade: string | null
	attempt_count: number
	max_attempts_allowed: number
	semesters_pending: number
	priority_level: 'Critical' | 'High' | 'Normal' | 'Low'
	is_registered_for_arrear: boolean
	arrear_session_code: string | null
}

interface LearnerArrearSummary {
	student_id: string
	student_name: string
	register_no: string
	program_code: string
	program_name: string
	total_backlogs: number
	pending_backlogs: number
	cleared_backlogs: number
	critical_count: number
	high_priority_count: number
	backlogs_by_semester: Record<number, number>
	total_credits_pending: number
}

interface BacklogStatistics {
	total_backlogs: number
	pending_backlogs: number
	cleared_backlogs: number
	critical_count: number
	high_priority_count: number
	learners_with_arrears: number
	failure_reasons: {
		Internal: number
		External: number
		Both: number
		Absent: number
	}
}

interface DropdownOption {
	id: string
	code: string
	name: string
	type?: ProgramType
	myjkkn_institution_ids?: string[]
}

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
					<span className="truncate text-left flex-1 whitespace-normal line-clamp-2">
						{selectedOption ? `${selectedOption.code} - ${selectedOption.name}` : placeholder}
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
										<div className="flex flex-col min-w-0 flex-1">
											<span className="font-medium">{option.code}</span>
											<span className="text-xs text-muted-foreground whitespace-normal break-words">{option.name}</span>
										</div>
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
													{option.type && (
														<Badge
															variant="outline"
															className={cn(
																"text-[10px]",
																option.type === 'UG' ? "border-blue-500 text-blue-600" : "border-purple-500 text-purple-600"
															)}
														>
															{option.type}
														</Badge>
													)}
												</div>
												<span className="text-xs text-muted-foreground whitespace-normal break-words line-clamp-2">{option.name}</span>
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
							? "All Semesters"
							: selectedSemesters.length === semesters.length
								? "All Semesters"
								: `Sem ${selectedSemesters.join(', ')}`}
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
// PRIORITY COLORS
// =====================================================

const PRIORITY_COLORS: Record<string, string> = {
	Critical: 'bg-red-600 text-white',
	High: 'bg-orange-500 text-white',
	Normal: 'bg-blue-500 text-white',
	Low: 'bg-gray-400 text-white'
}

const PRIORITY_BORDER_COLORS: Record<string, string> = {
	Critical: 'border-l-red-600',
	High: 'border-l-orange-500',
	Normal: 'border-l-blue-500',
	Low: 'border-l-gray-400'
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function LearnerArrearsPage() {
	const { toast } = useToast()

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

	// MyJKKN hook for fetching programs
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()

	// Selection state - updated for multi-select
	const [selectedInstitution, setSelectedInstitution] = useState("")
	const [selectedSession, setSelectedSession] = useState("")
	const [selectedPrograms, setSelectedPrograms] = useState<string[]>([])
	const [selectedSemesters, setSelectedSemesters] = useState<number[]>([])
	const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'cleared'>('pending')
	const [selectedPriority, setSelectedPriority] = useState<string>("")
	const [programType, setProgramType] = useState<ProgramType | null>(null)

	// Dropdown data
	const [institutions, setInstitutions] = useState<DropdownOption[]>([])
	const [sessions, setSessions] = useState<DropdownOption[]>([])
	const [programs, setPrograms] = useState<DropdownOption[]>([])
	const [programsLoading, setProgramsLoading] = useState(false)
	const [semesters, setSemesters] = useState<number[]>([])

	// Results state
	const [loading, setLoading] = useState(false)
	const [backlogs, setBacklogs] = useState<BacklogItem[]>([])
	const [learnerSummaries, setLearnerSummaries] = useState<LearnerArrearSummary[]>([])
	const [statistics, setStatistics] = useState<BacklogStatistics | null>(null)

	// UI state
	const [searchTerm, setSearchTerm] = useState("")
	const [expandedLearners, setExpandedLearners] = useState<Set<string>>(new Set())
	const [activeTab, setActiveTab] = useState<'overview' | 'learners' | 'courses'>('overview')

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

	// Use ref for institutions to avoid dependency cycle
	const institutionsRef = useRef(institutions)
	useEffect(() => {
		institutionsRef.current = institutions
	}, [institutions])

	// Callback definitions
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
				console.warn('[LearnerArrears] No MyJKKN institution IDs found for institution:', institutionId)
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
			const progs = await fetchMyJKKNPrograms(myjkknIds)

			// Transform MyJKKN programs to DropdownOption format and sort by program_code
			const transformedPrograms = progs.map(p => ({
				id: p.id,
				code: p.program_code,
				name: p.program_name,
				type: inferGradeSystemFromProgram(p.program_code, p.program_name)
			})).sort((a, b) => a.code.localeCompare(b.code))

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
				setSemesters(data)
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
		setBacklogs([])
		setLearnerSummaries([])
		setStatistics(null)
		setProgramType(null)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedInstitution, fetchSessions, fetchPrograms])

	// Fetch semesters when programs and session change
	useEffect(() => {
		if (selectedPrograms.length > 0 && selectedSession && selectedInstitution) {
			// Fetch semesters for the first selected program
			const selectedProgramData = programs.find(p => p.id === selectedPrograms[0])
			const programCode = selectedProgramData?.code || ''
			fetchSemesters(selectedInstitution, selectedPrograms[0], selectedSession, programCode)
		} else {
			setSemesters([])
		}
		setSelectedSemesters([])
		setBacklogs([])
		setLearnerSummaries([])
		setStatistics(null)
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

	const fetchBacklogs = async () => {
		if (!selectedInstitution || !selectedSession || selectedPrograms.length === 0) {
			toast({
				title: 'Missing Selection',
				description: 'Please select institution, exam session, and at least one program',
				variant: 'destructive'
			})
			return
		}

		setLoading(true)
		setBacklogs([])
		setLearnerSummaries([])
		setStatistics(null)

		try {
			// Fetch backlogs for ALL selected programs and combine results
			const allBacklogs: BacklogItem[] = []
			const studentBacklogMap: Record<string, LearnerArrearSummary> = {}

			for (const programId of selectedPrograms) {
				// Get programCode from programs state
				const programData = programs.find(p => p.id === programId)
				const programCode = programData?.code || ''

				const params = new URLSearchParams({
					action: 'backlogs',
					institutionId: selectedInstitution,
					sessionId: selectedSession,
					status: selectedStatus
				})

				// Use programCode for filtering (required by API)
				if (programCode) {
					params.append('programCode', programCode)
				}
				params.append('programId', programId)

				// Add selected semesters if any
				if (selectedSemesters.length > 0) {
					params.append('semesters', selectedSemesters.join(','))
				}

				const res = await fetch(`/api/grading/semester-results?${params.toString()}`)
				if (!res.ok) {
					const errorData = await res.json()
					throw new Error(errorData.error || 'Failed to fetch backlogs')
				}

				const data = await res.json()
				if (data.backlogs && data.backlogs.length > 0) {
					allBacklogs.push(...data.backlogs)
				}

				// Merge student summaries
				if (data.student_summaries) {
					data.student_summaries.forEach((summary: LearnerArrearSummary) => {
						if (!studentBacklogMap[summary.student_id]) {
							studentBacklogMap[summary.student_id] = { ...summary }
						} else {
							// Merge stats for same student across programs
							const existing = studentBacklogMap[summary.student_id]
							existing.total_backlogs += summary.total_backlogs
							existing.pending_backlogs += summary.pending_backlogs
							existing.cleared_backlogs += summary.cleared_backlogs
							existing.critical_count += summary.critical_count
							existing.high_priority_count += summary.high_priority_count
							existing.total_credits_pending += summary.total_credits_pending
							// Merge semester breakdown
							Object.entries(summary.backlogs_by_semester).forEach(([sem, count]) => {
								const semNum = parseInt(sem)
								existing.backlogs_by_semester[semNum] = (existing.backlogs_by_semester[semNum] || 0) + count
							})
						}
					})
				}
			}

			// Sort combined backlogs by register_number
			allBacklogs.sort((a, b) => (a.register_number || '').localeCompare(b.register_number || ''))

			// Recalculate combined statistics
			const combinedStats: BacklogStatistics = {
				total_backlogs: allBacklogs.length,
				pending_backlogs: allBacklogs.filter(b => !b.is_cleared).length,
				cleared_backlogs: allBacklogs.filter(b => b.is_cleared).length,
				critical_count: allBacklogs.filter(b => !b.is_cleared && b.priority_level === 'Critical').length,
				high_priority_count: allBacklogs.filter(b => !b.is_cleared && b.priority_level === 'High').length,
				learners_with_arrears: Object.values(studentBacklogMap).filter(s => s.pending_backlogs > 0).length,
				failure_reasons: {
					Internal: allBacklogs.filter(b => !b.is_cleared && b.failure_reason === 'Internal').length,
					External: allBacklogs.filter(b => !b.is_cleared && b.failure_reason === 'External').length,
					Both: allBacklogs.filter(b => !b.is_cleared && b.failure_reason === 'Both').length,
					Absent: allBacklogs.filter(b => !b.is_cleared && b.is_absent).length
				}
			}

			setBacklogs(allBacklogs)
			setLearnerSummaries(Object.values(studentBacklogMap))
			setStatistics(combinedStats)

			toast({
				title: 'Backlogs Loaded',
				description: `Found ${allBacklogs.length} backlog records across ${selectedPrograms.length} program(s).`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (e) {
			console.error('Fetch error:', e)
			toast({
				title: 'Fetch Failed',
				description: e instanceof Error ? e.message : 'Failed to fetch backlogs',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
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

	// Filter results based on search
	const filteredSummaries = useMemo(() => {
		if (!searchTerm) return learnerSummaries
		const search = searchTerm.toLowerCase()
		return learnerSummaries.filter(s =>
			s.register_no?.toLowerCase().includes(search) ||
			s.student_name?.toLowerCase().includes(search)
		)
	}, [learnerSummaries, searchTerm])

	// Get backlogs for a specific learner
	const getLearnerBacklogs = (learnerId: string): BacklogItem[] => {
		return backlogs.filter(b => b.student_id === learnerId && !b.is_cleared)
	}

	// Group backlogs by course for analysis
	const courseBacklogAnalysis = useMemo(() => {
		const courseMap: Record<string, { course_code: string; course_name: string; credits: number; count: number; students: string[] }> = {}

		backlogs.filter(b => !b.is_cleared).forEach(b => {
			if (!courseMap[b.course_id]) {
				courseMap[b.course_id] = {
					course_code: b.course_code,
					course_name: b.course_name,
					credits: b.course_credits,
					count: 0,
					students: []
				}
			}
			courseMap[b.course_id].count++
			courseMap[b.course_id].students.push(b.register_number)
		})

		return Object.values(courseMap).sort((a, b) => b.count - a.count)
	}, [backlogs])

	// Export to Excel
	const handleExport = () => {
		if (backlogs.length === 0) {
			toast({
				title: 'No Data',
				description: 'No backlogs to export.',
				variant: 'destructive'
			})
			return
		}

		const exportData = backlogs.map(b => ({
			'Register No': b.register_number,
			'Learner Name': b.student_name,
			'Program': b.program_code,
			'Semester': b.original_semester,
			'Course Code': b.course_code,
			'Course Name': b.course_name,
			'Credits': b.course_credits,
			'Original Session': b.original_session_code,
			'Internal Marks': b.original_internal_marks,
			'External Marks': b.original_external_marks,
			'Total Marks': b.original_total_marks,
			'Percentage': b.original_percentage?.toFixed(2),
			'Grade': b.original_letter_grade,
			'Failure Reason': b.failure_reason || (b.is_absent ? 'Absent' : 'Failed'),
			'Attempt Count': b.attempt_count,
			'Semesters Pending': b.semesters_pending,
			'Priority': b.priority_level,
			'Status': b.is_cleared ? 'Cleared' : 'Pending',
			'Cleared Date': b.cleared_date || '',
			'Cleared Session': b.cleared_session_code || '',
			'Cleared Grade': b.cleared_letter_grade || ''
		}))

		const ws = XLSX.utils.json_to_sheet(exportData)
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Learner Arrears')

		const fileName = `learner_arrears_${new Date().toISOString().split('T')[0]}.xlsx`
		XLSX.writeFile(wb, fileName)

		toast({
			title: 'Export Successful',
			description: `Exported ${backlogs.length} backlog records.`,
			className: 'bg-green-50 border-green-200 text-green-800'
		})
	}

	const canFetch = selectedInstitution && selectedSession && selectedPrograms.length > 0

	// Determine UG/PG badge for display
	const programTypeBadge = programType ? (
		<Badge
			variant="outline"
			className={cn(
				"ml-auto",
				programType === 'UG' ? "border-blue-500 text-blue-600 bg-blue-50" : "border-purple-500 text-purple-600 bg-purple-50"
			)}
		>
			{programType === 'UG' ? 'UG Program' : 'PG Program'}
		</Badge>
	) : null

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
									<BreadcrumbPage>Learner Arrears</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Page Header */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-lg bg-gradient-to-r from-red-500 to-orange-600 flex items-center justify-center">
								<FileWarning className="h-5 w-5 text-white" />
							</div>
							<div>
								<h1 className="text-2xl font-bold">Learner Arrears Tracker</h1>
								<p className="text-sm text-muted-foreground">Track and manage learner arrears with priority analysis</p>
							</div>
						</div>
						{programTypeBadge}
					</div>

					{/* Selection Card */}
					<Card>
						<CardHeader className="pb-3">
							<div className="flex items-center gap-3">
								<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
									<Filter className="h-4 w-4 text-white" />
								</div>
								<div>
									<CardTitle className="text-lg">Select Parameters</CardTitle>
									<CardDescription>Choose institution, session, program and semester</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							{/* First Row: Institution, Session, Program, Semester */}
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
								<div className="space-y-2">
									<Label>Program(s) *</Label>
									<MultiSelectProgram
										options={programs}
										selectedIds={selectedPrograms}
										onSelectionChange={setSelectedPrograms}
										placeholder="Select program(s)"
										disabled={(mustSelectInstitution && !selectedInstitution) || !selectedSession}
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

							{/* Fetch Button */}
							<div className="flex items-center justify-end pt-2 border-t">
								<Button onClick={fetchBacklogs} disabled={!canFetch || loading}>
									{loading ? (
										<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading...</>
									) : (
										<><RefreshCw className="h-4 w-4 mr-2" /> Fetch Backlogs</>
									)}
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* Results Section */}
					{statistics && (
						<>
							{/* Summary Cards */}
							<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
								<Card>
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Total Backlogs</p>
												<p className="text-xl font-bold">{statistics.total_backlogs}</p>
											</div>
											<BookOpen className="h-5 w-5 text-blue-500" />
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Pending</p>
												<p className="text-xl font-bold text-orange-600">{statistics.pending_backlogs}</p>
											</div>
											<Clock className="h-5 w-5 text-orange-500" />
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Cleared</p>
												<p className="text-xl font-bold text-green-600">{statistics.cleared_backlogs}</p>
											</div>
											<CheckCircle2 className="h-5 w-5 text-green-500" />
										</div>
									</CardContent>
								</Card>
								<Card className="bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-red-600 dark:text-red-400">Critical</p>
												<p className="text-xl font-bold text-red-600">{statistics.critical_count}</p>
											</div>
											<AlertTriangle className="h-5 w-5 text-red-500" />
										</div>
									</CardContent>
								</Card>
								<Card className="bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800">
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-orange-600 dark:text-orange-400">High Priority</p>
												<p className="text-xl font-bold text-orange-600">{statistics.high_priority_count}</p>
											</div>
											<AlertCircle className="h-5 w-5 text-orange-500" />
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Learners</p>
												<p className="text-xl font-bold">{statistics.learners_with_arrears}</p>
											</div>
											<Users className="h-5 w-5 text-purple-500" />
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Clearance Rate</p>
												<p className="text-xl font-bold text-green-600">
													{statistics.total_backlogs > 0
														? Math.round((statistics.cleared_backlogs / statistics.total_backlogs) * 100)
														: 0}%
												</p>
											</div>
											<TrendingUp className="h-5 w-5 text-green-500" />
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Failure Reasons Breakdown */}
							<Card>
								<CardHeader className="py-3">
									<CardTitle className="text-sm">Failure Reasons Breakdown</CardTitle>
								</CardHeader>
								<CardContent className="pb-3">
									<div className="grid grid-cols-4 gap-4">
										<div className="text-center p-3 bg-muted/50 rounded-lg">
											<div className="text-2xl font-bold text-blue-600">{statistics.failure_reasons.External}</div>
											<div className="text-xs text-muted-foreground">External</div>
										</div>
										<div className="text-center p-3 bg-muted/50 rounded-lg">
											<div className="text-2xl font-bold text-purple-600">{statistics.failure_reasons.Internal}</div>
											<div className="text-xs text-muted-foreground">Internal</div>
										</div>
										<div className="text-center p-3 bg-muted/50 rounded-lg">
											<div className="text-2xl font-bold text-orange-600">{statistics.failure_reasons.Both}</div>
											<div className="text-xs text-muted-foreground">Both</div>
										</div>
										<div className="text-center p-3 bg-muted/50 rounded-lg">
											<div className="text-2xl font-bold text-red-600">{statistics.failure_reasons.Absent}</div>
											<div className="text-xs text-muted-foreground">Absent</div>
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Tabs for different views */}
							<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
								<div className="flex items-center justify-between">
									<TabsList>
										<TabsTrigger value="overview" className="gap-2">
											<BarChart3 className="h-4 w-4" />
											Overview
										</TabsTrigger>
										<TabsTrigger value="learners" className="gap-2">
											<Users className="h-4 w-4" />
											By Learner
										</TabsTrigger>
										<TabsTrigger value="courses" className="gap-2">
											<BookOpen className="h-4 w-4" />
											By Course
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
										<Button variant="outline" size="sm" onClick={handleExport}>
											<Download className="h-4 w-4 mr-1" />
											Export
										</Button>
									</div>
								</div>

								{/* Overview Tab */}
								<TabsContent value="overview" className="mt-4">
									<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
										{/* Critical Backlogs Alert */}
										{statistics.critical_count > 0 && (
											<Card className="border-red-200 dark:border-red-800">
												<CardHeader className="py-3 bg-red-50 dark:bg-red-900/10">
													<div className="flex items-center gap-2">
														<AlertTriangle className="h-5 w-5 text-red-600" />
														<CardTitle className="text-base text-red-600">Critical Attention Required</CardTitle>
													</div>
												</CardHeader>
												<CardContent className="pt-3">
													<p className="text-sm text-muted-foreground mb-3">
														{statistics.critical_count} learners have arrears pending for 4+ semesters
													</p>
													<div className="space-y-2">
														{learnerSummaries
															.filter(s => s.critical_count > 0)
															.slice(0, 5)
															.map(s => (
																<div key={s.student_id} className="flex items-center justify-between text-sm p-2 bg-red-50/50 dark:bg-red-900/5 rounded">
																	<span className="font-medium">{s.register_no} - {s.student_name}</span>
																	<Badge variant="destructive" className="text-xs">{s.critical_count} Critical</Badge>
																</div>
															))}
													</div>
												</CardContent>
											</Card>
										)}

										{/* Top Failed Courses */}
										<Card>
											<CardHeader className="py-3">
												<CardTitle className="text-base">Most Failed Courses</CardTitle>
											</CardHeader>
											<CardContent>
												<div className="space-y-3">
													{courseBacklogAnalysis.slice(0, 5).map((course, i) => (
														<div key={course.course_code} className="flex items-center gap-3">
															<div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
																{i + 1}
															</div>
															<div className="flex-1">
																<div className="text-sm font-medium">{course.course_code}</div>
																<div className="text-xs text-muted-foreground">{course.course_name}</div>
															</div>
															<Badge variant="outline">{course.count} learners</Badge>
														</div>
													))}
												</div>
											</CardContent>
										</Card>
									</div>
								</TabsContent>

								{/* Learners Tab */}
								<TabsContent value="learners" className="mt-4">
									<Card>
										<CardHeader className="py-3">
											<CardTitle className="text-lg">Learners with Arrears</CardTitle>
										</CardHeader>
										<CardContent className="p-0">
											<div className="divide-y">
												{filteredSummaries
													.filter(s => s.pending_backlogs > 0 || selectedStatus !== 'pending')
													.map(learner => {
														const learnerBacklogs = getLearnerBacklogs(learner.student_id)

														return (
															<Collapsible
																key={learner.student_id}
																open={expandedLearners.has(learner.student_id)}
																onOpenChange={() => toggleLearnerExpand(learner.student_id)}
															>
																<CollapsibleTrigger asChild>
																	<div className={`flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer border-l-4 ${
																		learner.critical_count > 0 ? PRIORITY_BORDER_COLORS['Critical'] :
																		learner.high_priority_count > 0 ? PRIORITY_BORDER_COLORS['High'] :
																		PRIORITY_BORDER_COLORS['Normal']
																	}`}>
																		<div className="flex items-center gap-4">
																			<ChevronRight className={`h-4 w-4 transition-transform ${expandedLearners.has(learner.student_id) ? 'rotate-90' : ''}`} />
																			<div>
																				<div className="font-medium">{learner.register_no}</div>
																				<div className="text-sm text-muted-foreground">{learner.student_name}</div>
																				<div className="text-xs text-muted-foreground">{learner.program_code}</div>
																			</div>
																		</div>
																		<div className="flex items-center gap-3">
																			<div className="text-right">
																				<div className="text-sm">
																					<span className="font-bold text-orange-600">{learner.pending_backlogs}</span>
																					<span className="text-muted-foreground"> pending</span>
																				</div>
																				<div className="text-xs text-muted-foreground">
																					{learner.total_credits_pending} credits
																				</div>
																			</div>
																			{learner.critical_count > 0 && (
																				<Badge className="bg-red-600 text-xs">
																					{learner.critical_count} Critical
																				</Badge>
																			)}
																			{learner.high_priority_count > 0 && learner.critical_count === 0 && (
																				<Badge className="bg-orange-500 text-xs">
																					{learner.high_priority_count} High
																				</Badge>
																			)}
																		</div>
																	</div>
																</CollapsibleTrigger>
																<CollapsibleContent>
																	<div className="px-4 pb-4 bg-muted/30">
																		<Table>
																			<TableHeader>
																				<TableRow className="text-xs">
																					<TableHead>Sem</TableHead>
																					<TableHead>Course</TableHead>
																					<TableHead className="text-center">Cr</TableHead>
																					<TableHead className="text-center">Marks</TableHead>
																					<TableHead className="text-center">%</TableHead>
																					<TableHead className="text-center">Reason</TableHead>
																					<TableHead className="text-center">Attempts</TableHead>
																					<TableHead className="text-center">Pending</TableHead>
																					<TableHead className="text-center">Priority</TableHead>
																				</TableRow>
																			</TableHeader>
																			<TableBody>
																				{learnerBacklogs.map(b => (
																					<TableRow key={b.id} className="text-xs">
																						<TableCell>{b.original_semester}</TableCell>
																						<TableCell>
																							<span className="font-medium">{b.course_code}</span>
																							<span className="text-muted-foreground ml-1">- {b.course_name}</span>
																						</TableCell>
																						<TableCell className="text-center">{b.course_credits}</TableCell>
																						<TableCell className="text-center">
																							{b.original_total_marks?.toFixed(0) || '-'}
																						</TableCell>
																						<TableCell className="text-center">
																							{b.original_percentage?.toFixed(1) || '-'}%
																						</TableCell>
																						<TableCell className="text-center">
																							<Badge variant="outline" className="text-[10px]">
																								{b.is_absent ? 'Absent' : b.failure_reason || 'Failed'}
																							</Badge>
																						</TableCell>
																						<TableCell className="text-center">
																							{b.attempt_count}/{b.max_attempts_allowed}
																						</TableCell>
																						<TableCell className="text-center">
																							{b.semesters_pending} sem
																						</TableCell>
																						<TableCell className="text-center">
																							<Badge className={`text-[10px] ${PRIORITY_COLORS[b.priority_level]}`}>
																								{b.priority_level}
																							</Badge>
																						</TableCell>
																					</TableRow>
																				))}
																			</TableBody>
																		</Table>
																	</div>
																</CollapsibleContent>
															</Collapsible>
														)
													})}
											</div>

											{filteredSummaries.filter(s => s.pending_backlogs > 0 || selectedStatus !== 'pending').length === 0 && (
												<div className="text-center py-8 text-muted-foreground">
													<Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
													<p>{searchTerm ? 'No matching learners found' : 'No arrears found'}</p>
												</div>
											)}
										</CardContent>
									</Card>
								</TabsContent>

								{/* Courses Tab */}
								<TabsContent value="courses" className="mt-4">
									<Card>
										<CardHeader className="py-3">
											<CardTitle className="text-lg">Course-wise Backlog Analysis</CardTitle>
											<CardDescription>Courses with highest failure rates</CardDescription>
										</CardHeader>
										<CardContent>
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead>#</TableHead>
														<TableHead>Course Code</TableHead>
														<TableHead>Course Name</TableHead>
														<TableHead className="text-center">Credits</TableHead>
														<TableHead className="text-center">Failed Learners</TableHead>
														<TableHead className="text-center">% of Total</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{courseBacklogAnalysis.map((course, i) => {
														const percentage = statistics.pending_backlogs > 0
															? Math.round((course.count / statistics.pending_backlogs) * 100)
															: 0

														return (
															<TableRow key={course.course_code}>
																<TableCell className="font-bold">{i + 1}</TableCell>
																<TableCell className="font-medium">{course.course_code}</TableCell>
																<TableCell>{course.course_name}</TableCell>
																<TableCell className="text-center">{course.credits}</TableCell>
																<TableCell className="text-center">
																	<Badge variant="destructive">{course.count}</Badge>
																</TableCell>
																<TableCell>
																	<div className="flex items-center gap-2">
																		<Progress value={percentage} className="h-2 w-20" />
																		<span className="text-xs text-muted-foreground">{percentage}%</span>
																	</div>
																</TableCell>
															</TableRow>
														)
													})}
												</TableBody>
											</Table>

											{courseBacklogAnalysis.length === 0 && (
												<div className="text-center py-8 text-muted-foreground">
													<BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
													<p>No course-wise backlog data available</p>
												</div>
											)}
										</CardContent>
									</Card>
								</TabsContent>
							</Tabs>
						</>
					)}

					{/* Empty State */}
					{!loading && !statistics && (
						<Card className="py-12">
							<CardContent className="text-center">
								<div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
									<FileWarning className="h-8 w-8 text-muted-foreground" />
								</div>
								<h3 className="text-lg font-semibold mb-2">No Backlogs Loaded</h3>
								<p className="text-muted-foreground mb-4">
									Select an institution and click "Fetch Backlogs" to view learner arrear data.
								</p>
							</CardContent>
						</Card>
					)}
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
