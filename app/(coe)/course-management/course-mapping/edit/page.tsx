"use client"

import React, { useMemo, useState, useEffect, useCallback, memo, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import { ArrowLeft, Save, RefreshCw, Calendar, Plus, X, FileText, Upload, Download, Trash2 } from "lucide-react"
import XLSX from '@/lib/utils/excel-compat'
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, ChevronDown, ChevronRight, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { generateCourseMappingPDF } from "@/lib/utils/generate-course-mapping-pdf"
import { fetchCourses as fetchCoursesService } from "@/services/course-management/course-mapping-service"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { COURSE_GROUPS } from "@/types/course-mapping"

// Types for course data
type Course = {
	id: string
	course_code: string
	course_title?: string
	course_name?: string
	course_type?: string
	course_part_master?: string
	course_category?: string
	credits?: number
	display_code?: string
}

type CourseMapping = {
	id?: string
	course_id: string
	institution_code: string
	program_code: string
	program_id?: string
	regulation_code: string
	regulation_id?: string
	batch_code?: string
	semester_code: string
	semester_id?: string
	course_group?: string
	course_category?: string
	course_order?: number
	group_order?: number | null
	internal_pass_mark?: number
	internal_max_mark?: number
	internal_converted_mark?: number
	external_pass_mark?: number
	external_max_mark?: number
	external_converted_mark?: number
	total_pass_mark?: number
	total_max_mark?: number
	annual_semester?: boolean
	registration_based?: boolean
	is_active?: boolean
	created_at?: string
	has_offerings?: boolean
	offering_count?: number
}

type Semester = {
	id: string
	semester_code: string
	semester_name: string
	semester_number: number
	semester_order?: number
	program_id?: string
}

type SemesterTableData = {
	semester: Semester
	mappings: CourseMapping[]
	isOpen: boolean
}

// Memoized Course Row Component for better performance
const CourseTableRow = memo(function CourseTableRow({
	mapping,
	rowIndex,
	courseMap,
	isPopoverOpen,
	onPopoverChange,
	onUpdateRow,
	onRemoveRow,
	courses
}: {
	mapping: CourseMapping
	rowIndex: number
	courseMap: Map<string, Course>
	isPopoverOpen: boolean
	onPopoverChange: (open: boolean) => void
	onUpdateRow: (field: string, value: any) => void
	onRemoveRow: () => void
	courses: Course[]
}) {
	const course = mapping.course_id ? courseMap.get(mapping.course_id) : null
	const isOffered = !!mapping.has_offerings

	return (
		<TableRow className={cn("hover:bg-muted/50", isOffered && "bg-amber-50/40 dark:bg-amber-950/10")}>
			<TableCell className="text-xs font-medium py-2 px-2">{rowIndex + 1}</TableCell>
			<TableCell className="py-2 px-2">
				<Popover open={isOffered ? false : isPopoverOpen} onOpenChange={isOffered ? undefined : onPopoverChange}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							role="combobox"
							aria-expanded={isPopoverOpen}
							disabled={isOffered}
							title={isOffered ? 'Course is offered — cannot be changed. Remove the exam offering first.' : undefined}
							className="h-8 w-full justify-between text-xs font-normal disabled:opacity-100 disabled:cursor-not-allowed"
						>
							<span className="flex items-center gap-1 truncate">
								{isOffered && <Lock className="h-3 w-3 shrink-0 text-amber-600" />}
								{mapping.course_id
									? (() => {
										const course = courses.find(c => c.id === mapping.course_id)
										return course?.course_code || "Select course"
									})()
									: courses.length === 0
										? "No courses"
										: "Select course"}
							</span>
							<ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-[380px] p-0" align="start">
						<Command>
							<CommandInput placeholder="Search course..." className="h-8 text-xs" />
							<CommandList>
								<CommandEmpty>No course found.</CommandEmpty>
								<CommandGroup>
									{courses.map((c, courseIndex) => (
										<CommandItem
											key={`${c.id}-${courseIndex}`}
											value={`${c.course_code} ${c.course_title || c.course_name || ''}`}
											onSelect={() => {
												onUpdateRow('course_id', c.id)
												onPopoverChange(false)
											}}
											className="text-xs"
										>
											<div className="flex flex-col flex-1">
												<span className="font-medium">{c.course_code}</span>
												<span className="text-xs text-muted-foreground truncate">
													{c.course_title || c.course_name || '-'}
												</span>
											</div>
											<Check
												className={cn(
													"ml-2 h-3 w-3 shrink-0",
													mapping.course_id === c.id ? "opacity-100" : "opacity-0"
												)}
											/>
										</CommandItem>
									))}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			</TableCell>
			<TableCell className="text-xs py-2 px-2 whitespace-normal break-words">
				{(() => {
					const course = courses.find(c => c.id === mapping.course_id)
					return course?.course_title || course?.course_name || '-'
				})()}
			</TableCell>
			<TableCell className="text-xs py-2 px-2 whitespace-normal break-words">
				{mapping.course_category || '-'}
			</TableCell>
			<TableCell className="py-2 px-2">
				<Select
					value={mapping.course_group || 'General'}
					onValueChange={(v) => onUpdateRow('course_group', v)}
				>
					<SelectTrigger className="h-7 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{COURSE_GROUPS.map(group => (
							<SelectItem key={group.value} value={group.value}>
								{group.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</TableCell>
			<TableCell className="py-2 px-2">
				<Input
					type="number"
					value={mapping.course_order || 1}
					onChange={(e) => onUpdateRow('course_order', parseFloat(e.target.value))}
					className="h-7 w-14 text-xs text-center px-1"
					min={0.1}
					max={999}
					step={0.1}
				/>
			</TableCell>
			<TableCell className="py-2 px-2">
				<Input
					type="number"
					value={mapping.group_order ?? mapping.course_order ?? ''}
					onChange={(e) => onUpdateRow('group_order', e.target.value === '' ? null : parseInt(e.target.value))}
					className="h-7 w-14 text-xs text-center px-1"
					min={1}
					max={999}
					step={1}
					placeholder="-"
					title="Group order (optional) — give elective papers the same value to group them"
				/>
			</TableCell>

			<TableCell className="text-center py-2 px-1">
				<Checkbox
					checked={mapping.annual_semester || false}
					onCheckedChange={(v) => onUpdateRow('annual_semester', v)}
					className="h-4 w-4"
				/>
			</TableCell>
			<TableCell className="text-center py-2 px-1">
				<Checkbox
					checked={mapping.registration_based || false}
					onCheckedChange={(v) => onUpdateRow('registration_based', v)}
					className="h-4 w-4"
				/>
			</TableCell>
			<TableCell className="text-center py-2 px-1">
				<Checkbox
					checked={mapping.is_active !== false}
					onCheckedChange={(v) => onUpdateRow('is_active', v)}
					className="h-4 w-4"
				/>
			</TableCell>
			<TableCell className="py-2 px-1">
				<Button
					variant="ghost"
					size="sm"
					onClick={onRemoveRow}
					disabled={isOffered}
					className="h-7 w-7 p-0 text-red-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:text-muted-foreground"
					title={isOffered ? 'Cannot delete — an exam offering references this mapping' : 'Delete mapping'}
				>
					<Trash2 className="h-3.5 w-3.5" />
				</Button>
			</TableCell>
		</TableRow>
	)
})

// Debounced Number Input for course order - prevents excessive re-renders
const DebouncedNumberInput = memo(function DebouncedNumberInput({
	value,
	onChange,
	className,
	min
}: {
	value: number
	onChange: (value: number) => void
	className?: string
	min?: number
}) {
	const [localValue, setLocalValue] = useState(value)
	const timeoutRef = useRef<NodeJS.Timeout | null>(null)

	useEffect(() => {
		setLocalValue(value)
	}, [value])

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		// Only allow integers
		const newValue = parseInt(e.target.value, 10) || 1
		setLocalValue(newValue)

		// Debounce the update to parent
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current)
		}
		timeoutRef.current = setTimeout(() => {
			onChange(newValue)
		}, 300)
	}

	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
			}
		}
	}, [])

	return (
		<Input
			type="number"
			value={localValue}
			onChange={handleChange}
			className={className}
			min={min}
			step={1}
		/>
	)
})

// Loading skeleton for semester cards
const SemesterSkeleton = memo(function SemesterSkeleton() {
	return (
		<Card>
			<CardHeader className="p-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1.5">
						<Skeleton className="h-5 w-5 rounded" />
						<Skeleton className="h-3.5 w-3.5 rounded" />
						<Skeleton className="h-3 w-28" />
						<Skeleton className="h-4 w-20 rounded-full" />
					</div>
					<Skeleton className="h-6 w-16 rounded" />
				</div>
			</CardHeader>
		</Card>
	)
})

export default function CourseMappingEditPage() {
	const searchParams = useSearchParams()
	const router = useRouter()
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const { toast } = useToast()

	// Institution filter hook for multi-tenant filtering
	const {
		isReady: institutionContextReady,
		appendToUrl,
		institutionCode: contextInstitutionCode,
		mustSelectInstitution,
		myjkknInstitutionIds
	} = useInstitutionFilter()

	// MyJKKN institution filter hook for fetching MyJKKN data
	const {
		fetchPrograms: fetchProgramsFromMyJKKN,
		fetchRegulations: fetchRegulationsFromMyJKKN,
		fetchSemesters: fetchSemestersFromMyJKKN
	} = useMyJKKNInstitutionFilter()

	// Get URL parameters (NO BATCH)
	const institutionParam = searchParams.get('institution')
	const programParam = searchParams.get('program')
	const regulationParam = searchParams.get('regulation')

	// Parent form state (institution, program, regulation are locked)
	const [selectedInstitution, setSelectedInstitution] = useState(institutionParam || "")
	const [selectedProgram, setSelectedProgram] = useState(programParam || "")
	const [selectedRegulation, setSelectedRegulation] = useState(regulationParam || "")
	const [selectedOfferingDepartment, setSelectedOfferingDepartment] = useState("")
	const [batchCode, setBatchCode] = useState("") // Get from existing mappings

	// Store IDs for saving (UUIDs from database)
	const [selectedProgramId, setSelectedProgramId] = useState<string>("")
	const [selectedRegulationId, setSelectedRegulationId] = useState<string>("")

	// Display names for locked fields
	const [institutionName, setInstitutionName] = useState("")
	const [programName, setProgramName] = useState("")
	const [regulationName, setRegulationName] = useState("")

	// Dropdown data states
	const [courses, setCourses] = useState<Course[]>([])
	const [semesters, setSemesters] = useState<Semester[]>([])
	const [initialLoading, setInitialLoading] = useState(true)
	const [loadingProgress, setLoadingProgress] = useState<string>('')

	// Memoized course lookup map for O(1) access - major performance improvement
	const courseMap = useMemo(() => {
		const map = new Map<string, Course>()
		courses.forEach(course => map.set(course.id, course))
		return map
	}, [courses])

	// Semester tables data
	const [semesterTables, setSemesterTables] = useState<SemesterTableData[]>([])

	// Select all states
	const [selectAllRegistration, setSelectAllRegistration] = useState<{ [key: string]: boolean }>({})
	const [selectAllStatus, setSelectAllStatus] = useState<{ [key: string]: boolean }>({})

	// Existing mappings
	const [existingMappings, setExistingMappings] = useState<CourseMapping[]>([])

	// Popover open state
	const [openPopovers, setOpenPopovers] = useState<{ [key: string]: boolean }>({})

	// Bulk upload state
	const [uploadSummary, setUploadSummary] = useState<{ total: number; success: number; failed: number }>({ total: 0, success: 0, failed: 0 })
	const [uploadErrors, setUploadErrors] = useState<Array<{ row: number; course_code: string; semester: string; errors: string[] }>>([])

	// Fetch initial data on mount - optimized to reduce waterfall
	useEffect(() => {
		if (!institutionContextReady) {
			console.log("[Edit Page] Institution context not ready yet")
			return
		}

		if (!institutionParam || !programParam || !regulationParam) {
			toast({
				title: '⚠️ Missing Parameters',
				description: 'Required parameters (institution, program, regulation) are missing. Redirecting to index page...',
				variant: 'destructive'
			})
			setTimeout(() => router.push('/course-management/course-mapping-index'), 2000)
			return
		}

		console.log("[Edit Page] Starting optimized initial data fetch", { institutionParam, programParam, regulationParam })
		setInitialLoading(true)
		setLoadingProgress('Loading institution, program, and regulation data...')

		// Optimize: Fetch institution, regulation, and program data in parallel
		Promise.all([
			fetchInstitutionName(institutionParam),
			fetchRegulationName(regulationParam),
			fetchProgramData(programParam)
		])
			.then(async ([, , programId]) => {
				console.log("[Edit Page] Parallel fetch completed, programId:", programId)
				setLoadingProgress('Loading semesters and courses...')

				// Once we have program_id, fetch semesters and courses in parallel
				await Promise.all([
					fetchSemesters(programParam, programId || undefined),
					fetchCourses(institutionParam, programParam, regulationParam)
				])

				setLoadingProgress('Finalizing...')
			})
			.catch(err => {
				console.error("[Edit Page] Error in initial data fetch:", err)
				setLoadingProgress('')
				toast({
					title: '❌ Loading Error',
					description: 'Failed to load initial data. Please refresh the page.',
					variant: 'destructive'
				})
			})
			.finally(() => {
				console.log("[Edit Page] Initial data fetch completed")
				setLoadingProgress('')
				setInitialLoading(false)
			})
	}, [institutionContextReady, institutionParam, programParam, regulationParam])

	// Note: Courses are now fetched in the initial data fetch above
	// This useEffect is kept for manual refresh scenarios but won't run on initial mount
	// since courses are already being fetched in parallel with semesters

	// Load existing mappings when semesters are loaded (same as add page)
	// This ensures semesterTables are initialized before loading mappings
	useEffect(() => {
		console.log("[Edit Page] useEffect for loadExistingMappings triggered", {
			semestersLength: semesters.length,
			semesterTablesLength: semesterTables.length,
			selectedInstitution,
			selectedProgram,
			selectedRegulation,
			existingMappingsLength: existingMappings.length
		})
		// Match add page logic: trigger when semesters are loaded (not just semesterTables)
		if (semesters.length > 0 && semesterTables.length > 0 && selectedInstitution && selectedProgram && selectedRegulation && existingMappings.length === 0) {
			console.log("[Edit Page] Calling loadExistingMappings...")
			loadExistingMappings()
		} else {
			console.log("[Edit Page] Conditions not met for loadExistingMappings", {
				semestersLength: semesters.length,
				semesterTablesLength: semesterTables.length,
				hasInstitution: !!selectedInstitution,
				hasProgram: !!selectedProgram,
				hasRegulation: !!selectedRegulation,
				hasExistingMappings: existingMappings.length > 0
			})
		}
	}, [semesters.length, semesterTables.length, selectedInstitution, selectedProgram, selectedRegulation, existingMappings.length])

	const fetchInstitutionName = async (code: string) => {
		try {
			const res = await fetch(`/api/master/institutions`)
			if (res.ok) {
				const data = await res.json()
				// Find the institution matching the code
				const institution = data.find((inst: any) => inst.institution_code === code)
				if (institution) {
					setInstitutionName(institution.name)
				}
			}
		} catch (err) {
			console.error('Error fetching institution:', err)
		}
	}

	const fetchProgramData = async (code: string) => {
		try {
			// Use the hook to fetch programs from MyJKKN
			const programs = await fetchProgramsFromMyJKKN(myjkknInstitutionIds || [], { requireFilter: false })
			
			console.log(`[Edit Page] fetchProgramData: Fetched ${programs.length} programs from MyJKKN`)
			
			// Find the program by code (program_id or program_code in MyJKKN)
			// In MyJKKN, program_id is the CODE field (like "BE-3"), and id is the UUID
			const program = programs.find((p: any) => 
				p.program_code === code || p.program_id === code
			)
			
			if (program) {
				setProgramName(program.program_name || code)
				// Note: ProgramOption doesn't have department_code, only department_id
				setSelectedOfferingDepartment("")
				// Store MyJKKN program.id (UUID) for saving
				setSelectedProgramId(program.id)
				console.log(`[Edit Page] fetchProgramData: Found MyJKKN program: ${program.id} (program_code: ${code})`)
				return program.id
			} else {
				console.warn(`[Edit Page] fetchProgramData: Program "${code}" not found in ${programs.length} programs`)
				console.log(`[Edit Page] fetchProgramData: Available program codes:`, programs.map((p: any) => ({
					program_code: p.program_code,
					program_id: p.program_id,
					id: p.id
				})))
			}
		} catch (err) {
			console.error('[Edit Page] Error fetching program from MyJKKN:', err)
		}
		return null
	}

	const fetchRegulationName = async (code: string) => {
		try {
			// Use the hook to fetch regulations from MyJKKN
			const regulations = await fetchRegulationsFromMyJKKN(myjkknInstitutionIds || [], false)
			
			console.log(`[Edit Page] fetchRegulationName: Fetched ${regulations.length} regulations from MyJKKN`)
			
			// Find the regulation by regulation_code
			const regulation = regulations.find((r: any) => r.regulation_code === code)
			
			if (regulation) {
				setRegulationName(regulation.regulation_name || code)
				// Store MyJKKN regulation.id (UUID) for saving
				setSelectedRegulationId(regulation.id)
				console.log(`[Edit Page] Found MyJKKN regulation: ${regulation.id} (regulation_code: ${code})`)
			} else {
				console.warn(`[Edit Page] fetchRegulationName: Regulation "${code}" not found in ${regulations.length} regulations`)
			}
		} catch (err) {
			console.error('[Edit Page] Error fetching regulation from MyJKKN:', err)
		}
	}

	const fetchSemesters = async (programCode: string, programId?: string) => {
		try {
			console.log(`[Edit Page] Starting fetchSemesters for program ${programCode}`, { programId, selectedProgramId, myjkknInstitutionIds })
			
			// Get myjkkn_institution_ids - ensure we have them before proceeding
			let myjkknIds: string[] = []
			if (myjkknInstitutionIds && myjkknInstitutionIds.length > 0) {
				myjkknIds = myjkknInstitutionIds
			} else {
				// Fallback: fetch from institutions API
				const institutionCodeToUse = institutionParam || selectedInstitution
				if (institutionCodeToUse) {
					try {
						const instRes = await fetch(`/api/master/institutions?institution_code=${institutionCodeToUse}`)
						if (instRes.ok) {
							const instData = await instRes.json()
							if (instData.length > 0 && instData[0].myjkkn_institution_ids) {
								myjkknIds = instData[0].myjkkn_institution_ids
								console.log(`[Edit Page] fetchSemesters: Fetched myjkkn_institution_ids from API:`, myjkknIds)
							}
						}
					} catch (err) {
						console.error('[Edit Page] Error fetching institution:', err)
					}
				}
			}

			if (myjkknIds.length === 0) {
				console.warn('[Edit Page] No myjkkn_institution_ids found, cannot fetch semesters')
				toast({
					title: '⚠️ Warning',
					description: 'No MyJKKN institution IDs found. Cannot fetch semesters.',
					variant: 'destructive'
				})
				return
			}
			
			// First, try to get program_id (UUID) from MyJKKN if not provided
			// In MyJKKN, program_id is the CODE (like "BE-3"), not a UUID
			// We need to find the program by program_code to get its UUID (id field)
			let programIdToUse = programId || selectedProgramId || null
			
			if (!programIdToUse) {
				console.log(`[Edit Page] programId not provided, searching for program ${programCode} in MyJKKN...`)
				// Use the hook to fetch programs and find the matching one
				const programs = await fetchProgramsFromMyJKKN(myjkknIds, { requireFilter: false })
				const program = programs.find((p: any) => 
					p.program_code === programCode || p.program_id === programCode
				)
				
				if (program?.id) {
					programIdToUse = program.id // Use the UUID (id field) for fetching semesters
					// Also update selectedProgramId if not already set
					if (!selectedProgramId) {
						setSelectedProgramId(program.id)
					}
					console.log(`[Edit Page] Found program_id from MyJKKN: ${programIdToUse} (program_code: ${programCode})`)
				} else {
					console.warn(`[Edit Page] Program "${programCode}" not found in ${programs.length} programs`)
				}
			} else {
				console.log(`[Edit Page] Using provided programId: ${programIdToUse}`)
			}

			if (!programIdToUse) {
				console.error('[Edit Page] No program_id found for program:', programCode)
				console.error('[Edit Page] Debug info:', {
					programCode,
					programId,
					selectedProgramId,
					myjkknIdsCount: myjkknIds.length
				})
				toast({
					title: '❌ Error',
					description: `Program ID not found for ${programCode}. Please check if the program exists in MyJKKN.`,
					variant: 'destructive'
				})
				return
			}

			// Use the hook to fetch semesters from MyJKKN
			// Note: The hook expects program_id to be the UUID (id field), not the CODE
			const semesterOptions = await fetchSemestersFromMyJKKN(myjkknIds, { 
				program_id: programIdToUse,
				requireFilter: false 
			})
			
			console.log(`[Edit Page] Fetched ${semesterOptions.length} semesters from MyJKKN hook for program ${programCode}`)
			
			// Convert to Semester type
			// Note: SemesterOption from hook has semester_name, semester_number, but may not have semester_code or semester_order
			// We need to fetch the full semester data from MyJKKN API to get these fields
			const allSemesters: Semester[] = []
			const seenIds = new Set<string>()
			
			// Fetch full semester data from MyJKKN API to get semester_code and semester_order
			for (const myjkknInstId of myjkknIds) {
				try {
					const res = await fetch(`/api/myjkkn/semesters?institution_id=${myjkknInstId}&program_id=${programIdToUse}&is_active=true&limit=1000`)
					if (res.ok) {
						const response = await res.json()
						const data = response.data || response || []
						
						const semesters = Array.isArray(data)
							? data.filter((s: any) => s?.id && s.is_active !== false)
							: []
						
						for (const sem of semesters) {
							if (!seenIds.has(sem.id)) {
								seenIds.add(sem.id)
								
								// Extract semester_number from semester_name if not provided (e.g., "Semester 2" -> 2)
								let semesterNumber = sem.semester_number
								if (!semesterNumber && sem.semester_name) {
									const nameMatch = sem.semester_name.match(/(\d+)/)
									if (nameMatch) {
										semesterNumber = parseInt(nameMatch[1], 10)
									}
								}
								// Fallback to semester_order if still not found
								if (!semesterNumber) {
									semesterNumber = sem.semester_order || 0
								}
								
								// Ensure semester_code is always set - use semester_number as fallback
								const semesterCode = sem.semester_code || (semesterNumber > 0 ? `SEM${semesterNumber}` : `SEM-${sem.id.substring(0, 8)}`)
								
								// Ensure semester_name is always set
								const semesterName = sem.semester_name || sem.name || `Semester ${semesterNumber}`
								
								console.log(`[Edit Page] Processing semester:`, {
									id: sem.id,
									raw_semester_code: sem.semester_code,
									raw_semester_number: sem.semester_number,
									raw_semester_name: sem.semester_name,
									raw_semester_order: sem.semester_order,
									extracted_semester_number: semesterNumber,
									final_semester_code: semesterCode,
									final_semester_name: semesterName
								})
								
								allSemesters.push({
									id: sem.id,
									semester_code: semesterCode,
									semester_name: semesterName,
									semester_number: semesterNumber,
									semester_order: sem.semester_order || semesterNumber,
									program_id: sem.program_id
								})
							}
						}
					}
				} catch (err) {
					console.error(`[Edit Page] Error fetching full semester data for institution ${myjkknInstId}:`, err)
				}
			}
			
			// If no semesters found from direct API call, fall back to using hook results
			if (allSemesters.length === 0 && semesterOptions.length > 0) {
				console.warn('[Edit Page] No semesters from direct API call, using hook results (may be missing semester_code/semester_order)')
				semesterOptions.forEach((sem: any) => {
					// Extract semester_number from semester_name if not provided (e.g., "Semester 2" -> 2)
					let semesterNumber = sem.semester_number
					if (!semesterNumber && sem.semester_name) {
						const nameMatch = sem.semester_name.match(/(\d+)/)
						if (nameMatch) {
							semesterNumber = parseInt(nameMatch[1], 10)
						}
					}
					// Fallback to semester_order if still not found
					if (!semesterNumber) {
						semesterNumber = sem.semester_order || 0
					}
					
					const semesterCode = sem.semester_code || (semesterNumber > 0 ? `SEM${semesterNumber}` : `SEM-${sem.id.substring(0, 8)}`)
					const semesterName = sem.semester_name || `Semester ${semesterNumber}`
					
					console.log(`[Edit Page] Processing semester from hook:`, {
						id: sem.id,
						semester_name: sem.semester_name,
						extracted_semester_number: semesterNumber,
						final_semester_code: semesterCode
					})
					
					allSemesters.push({
						id: sem.id,
						semester_code: semesterCode,
						semester_name: semesterName,
						semester_number: semesterNumber,
						semester_order: sem.semester_order || semesterNumber,
						program_id: sem.program_id
					})
				})
			}

			// Sort by semester_order ascending, fallback to semester_number if order is not available
			allSemesters.sort((a, b) => {
				const orderA = a.semester_order !== undefined ? a.semester_order : a.semester_number || 0
				const orderB = b.semester_order !== undefined ? b.semester_order : b.semester_number || 0
				return orderA - orderB
			})

			console.log(`[Edit Page] Fetched ${allSemesters.length} semesters from MyJKKN for program ${programCode}`, allSemesters.map(s => `${s.semester_code} - ${s.semester_name}`))
			setSemesters(allSemesters)

			// Initialize semester tables
			const tables: SemesterTableData[] = allSemesters.map((sem: Semester) => ({
				semester: sem,
				mappings: [],
				isOpen: false
			}))
			setSemesterTables(tables)
			console.log(`[Edit Page] Initialized ${tables.length} semester tables`, tables.map(t => `${t.semester.semester_code} - ${t.semester.semester_name}`))
		} catch (err) {
			console.error('[Edit Page] Error fetching semesters:', err)
			toast({
				title: '❌ Error',
				description: `Failed to fetch semesters: ${err instanceof Error ? err.message : 'Unknown error'}`,
				variant: 'destructive'
			})
		}
	}

	const fetchCourses = async (institutionCode: string, programCode: string, regulationCode: string) => {
		try {
			// Filter courses by institution_code and regulation_code only
			// Note: offering_department_code filter removed - courses are available across all departments
			const data = await fetchCoursesService(institutionCode, undefined, regulationCode)
			console.log(`[Edit Page] Fetched ${data.length} courses for ${institutionCode}, regulation: ${regulationCode}`)
			console.log(`[Edit Page] Course IDs:`, data.map(c => c.id))
			console.log(`[Edit Page] Course codes:`, data.map(c => c.course_code))
			setCourses(data)
			console.log(`[Edit Page] Courses state updated, total courses:`, data.length)
		} catch (err) {
			console.error('[Edit Page] Error fetching courses:', err)
			toast({
				title: '❌ Error',
				description: `Failed to fetch courses: ${err instanceof Error ? err.message : 'Unknown error'}`,
				variant: 'destructive'
			})
		}
	}

	const loadExistingMappings = async () => {
		try {
			setLoading(true)
			setLoadingProgress('Loading existing course mappings...')
			const res = await fetch(`/api/course-management/course-mapping?institution_code=${selectedInstitution}&program_code=${selectedProgram}&regulation_code=${selectedRegulation}`)

			if (res.ok) {
				const data: CourseMapping[] = await res.json()
				setExistingMappings(data)
				console.log("=== DEBUG: Course Mapping Data ===")
				console.log("Total mappings loaded:", data.length)
				if (data.length > 0) {
					const uniqueSemCodes = [...new Set(data.map((m: CourseMapping) => m.semester_code))]
					console.log("DB semester_codes:", uniqueSemCodes)
					// Extract batch_code from first mapping (all mappings should have same batch_code)
					const firstBatchCode = data[0].batch_code
					if (firstBatchCode) {
						setBatchCode(firstBatchCode)
						console.log("Batch code:", firstBatchCode)
					}
				}
				console.log("Semester table codes:", semesterTables.map(t => t.semester.semester_code))
				console.log("Semester table names:", semesterTables.map(t => t.semester.semester_name))

				// Check if mapped courses need to be fetched (only fetch missing ones in a single batch call)
				const courseIds = data.map((m: CourseMapping) => m.course_id)
				const mappedCourseIds: string[] = [...new Set(courseIds.filter((id: string | undefined): id is string => typeof id === 'string' && id.length > 0))]
				if (mappedCourseIds.length > 0) {
					// Get current courses to check which ones are missing
					const currentCourseIds = new Set(courses.map(c => c.id))
					const missingCourseIds = mappedCourseIds.filter((id: string) => !currentCourseIds.has(id))

					if (missingCourseIds.length > 0) {
						try {
							// Fetch all missing courses in a single batch call using comma-separated IDs
							const idsParam = missingCourseIds.join(',')
							const res = await fetch(`/api/master/courses?ids=${idsParam}`)
							if (res.ok) {
								const mappedCourses = await res.json()
								// Merge with existing courses array, deduplicating by id
								// (avoids duplicate React keys in the course picker dropdown)
								setCourses(prevCourses => {
									const seen = new Set(prevCourses.map(c => c.id))
									const newCourses = (Array.isArray(mappedCourses) ? mappedCourses : []).filter((c: any) => {
										if (!c?.id || seen.has(c.id)) return false
										seen.add(c.id)
										return true
									})
									return [...prevCourses, ...newCourses]
								})
							}
						} catch (err) {
							console.error('Error fetching mapped course details:', err)
						}
					}
				}

				// Organize mappings by semester
				// Match using the same simple approach as add page, with fallback for format differences
				const updatedTables = semesterTables.map(table => {
					const semesterCode = table.semester.semester_code
					const semesterNumber = table.semester.semester_number
					const semesterName = table.semester.semester_name

					console.log(`[Edit Page] Matching semester: code="${semesterCode}", number=${semesterNumber}, name="${semesterName}"`)

					// Primary: Exact match (same as add page)
					let semesterMappings = data.filter((m: CourseMapping) => m.semester_code === semesterCode)

					// Fallback: If no exact matches found, try flexible matching for format differences
					// This handles cases where DB has "ECE-SEM-2" but MyJKKN returns different format
					if (semesterMappings.length === 0) {
						console.log(`[Edit Page] No exact match for ${semesterCode}, trying flexible matching...`)
						console.log(`[Edit Page] Available DB semester codes:`, data.map((m: CourseMapping) => m.semester_code))

						semesterMappings = data.filter((m: CourseMapping) => {
							const dbCode = (m.semester_code || '').trim()

							// Case-insensitive match
							if (dbCode.toLowerCase() === semesterCode.toLowerCase()) {
								console.log(`[Edit Page] Case-insensitive match: ${dbCode} === ${semesterCode}`)
								return true
							}

							// Extract trailing number and match with semester_number
							// Check if semester_number is valid (not 0 or undefined)
							if (semesterNumber && semesterNumber > 0) {
								// Pattern: "ECE-SEM-2" -> extract "2"
								const semPatternMatch = dbCode.match(/-SEM-(\d+)$/i)
								if (semPatternMatch) {
									const semNumber = semPatternMatch[1]
									if (semNumber === semesterNumber.toString()) {
										console.log(`[Edit Page] Flexible match (SEM pattern): ${dbCode} (SEM-${semNumber}) === semester ${semesterNumber}`)
										return true
									}
								}

								// Generic trailing number match
								const trailingNumberMatch = dbCode.match(/(\d+)$/)
								if (trailingNumberMatch) {
									const trailingNum = trailingNumberMatch[1]
									if (trailingNum === semesterNumber.toString()) {
										console.log(`[Edit Page] Flexible match (trailing number): ${dbCode} (ends with ${trailingNum}) === semester ${semesterNumber}`)
										return true
									}
								}
							} else {
								console.log(`[Edit Page] Skipping flexible match for ${semesterCode} - semester_number is ${semesterNumber} (invalid)`)
							}

							return false
						})

						if (semesterMappings.length > 0) {
							console.log(`[Edit Page] Found ${semesterMappings.length} mapping(s) using flexible matching for ${semesterCode}`)
						} else {
							console.log(`[Edit Page] No flexible matches found for ${semesterCode}`)
						}
					} else {
						console.log(`[Edit Page] Found ${semesterMappings.length} exact match(es) for ${semesterCode}`)
					}

					// Sort mappings by course_order
					const sortedMappings = semesterMappings.sort((a: CourseMapping, b: CourseMapping) => {
						return (a.course_order || 0) - (b.course_order || 0)
					})

					// Return table with mappings - all semesters start closed by default
					return {
						...table,
						mappings: sortedMappings,
						isOpen: false
					}
				})

				setSemesterTables(updatedTables)
				console.log("=== DEBUG: Updated Semester Tables ===")
				console.log("Total tables:", updatedTables.length)
				updatedTables.forEach((table, idx) => {
					console.log(`Table ${idx}: ${table.semester.semester_name}, mappings: ${table.mappings.length}, isOpen: ${table.isOpen}`)
				})
			}
		} catch (err) {
			console.error('Error loading existing mappings:', err)
			toast({
				title: '❌ Error',
				description: 'Failed to load existing course mappings.',
				variant: 'destructive'
			})
		} finally {
			setLoadingProgress('')
			setLoading(false)
		}
	}

	const addCourseRow = useCallback((semesterIndex: number) => {
		setSemesterTables(prev => {
			// Get batch_code from existing mappings (any mapping in any semester should have it)
			let existingBatchCode = batchCode
			if (!existingBatchCode) {
				for (const table of prev) {
					const mappingWithBatch = table.mappings.find(m => m.batch_code)
					if (mappingWithBatch?.batch_code) {
						existingBatchCode = mappingWithBatch.batch_code
						break
					}
				}
			}

			const newRow: CourseMapping = {
				course_id: "",
				institution_code: selectedInstitution,
				program_code: selectedProgram,
				regulation_code: selectedRegulation,
				batch_code: existingBatchCode,
				semester_code: prev[semesterIndex].semester.semester_code,
				course_group: 'General',
				course_category: "",
				course_order: prev[semesterIndex].mappings.length + 1,
				group_order: prev[semesterIndex].mappings.length + 1,
				internal_max_mark: 40,
				internal_pass_mark: 14,
				internal_converted_mark: 25,
				external_max_mark: 60,
				external_pass_mark: 26,
				external_converted_mark: 75,
				total_max_mark: 100,
				total_pass_mark: 40,
				annual_semester: false,
				registration_based: false,
				is_active: true
			}

			const updated = [...prev]
			updated[semesterIndex] = {
				...updated[semesterIndex],
				mappings: [...updated[semesterIndex].mappings, newRow],
				isOpen: true // Ensure the semester table is expanded so the new row is visible
			}
			return updated
		})
	}, [batchCode, selectedInstitution, selectedProgram, selectedRegulation])

	const removeCourseRow = async (semesterIndex: number, rowIndex: number) => {
		const updated = [...semesterTables]
		const mappingToRemove = updated[semesterIndex].mappings[rowIndex]

		if (mappingToRemove.id && mappingToRemove.course_id) {
			const courseName = courses.find(c => c.id === mappingToRemove.course_id)?.course_title || 'this course'
			const confirmDelete = window.confirm(`Are you sure you want to delete the mapping for "${courseName}"?`)

			if (!confirmDelete) return
		}

		if (mappingToRemove.id) {
			try {
				const deleteRes = await fetch(`/api/course-management/course-mapping?id=${mappingToRemove.id}`, {
					method: 'DELETE'
				})

				if (!deleteRes.ok) {
					const error = await deleteRes.json()
					toast({
						title: '❌ Delete Failed',
						description: error.error || 'Failed to delete course mapping.',
						variant: 'destructive'
					})
					return
				}

				toast({
					title: '✅ Deleted',
					description: 'Course mapping removed successfully.',
					className: 'bg-green-50 border-green-200 text-green-800'
				})
			} catch (err) {
				toast({
					title: '❌ Network Error',
					description: 'Failed to connect to server.',
					variant: 'destructive'
				})
				return
			}
		}

		updated[semesterIndex].mappings.splice(rowIndex, 1)
		setSemesterTables(updated)

		if (mappingToRemove.id) {
			setExistingMappings(prev => prev.filter(m => m.id !== mappingToRemove.id))
		}
	}

	const updateCourseRow = useCallback((semesterIndex: number, rowIndex: number, field: string, value: any) => {
		setSemesterTables(prev => {
			const updated = [...prev]
			updated[semesterIndex] = {
				...updated[semesterIndex],
				mappings: [...updated[semesterIndex].mappings]
			}
			updated[semesterIndex].mappings[rowIndex] = {
				...updated[semesterIndex].mappings[rowIndex],
				[field]: value
			}

			if (field === 'course_id' && value) {
				const course = courseMap.get(value)
				if (course) {
					updated[semesterIndex].mappings[rowIndex].course_category = course.course_category || course.course_type || ''
					
					// Auto-fill marks details from the course (if available)
					if ((course as any).internal_max_mark !== undefined) {
						updated[semesterIndex].mappings[rowIndex].internal_max_mark = (course as any).internal_max_mark
					}
					if ((course as any).internal_pass_mark !== undefined) {
						updated[semesterIndex].mappings[rowIndex].internal_pass_mark = (course as any).internal_pass_mark
					}
					if ((course as any).internal_converted_mark !== undefined) {
						updated[semesterIndex].mappings[rowIndex].internal_converted_mark = (course as any).internal_converted_mark
					}
					if ((course as any).external_max_mark !== undefined) {
						updated[semesterIndex].mappings[rowIndex].external_max_mark = (course as any).external_max_mark
					}
					if ((course as any).external_pass_mark !== undefined) {
						updated[semesterIndex].mappings[rowIndex].external_pass_mark = (course as any).external_pass_mark
					}
					if ((course as any).external_converted_mark !== undefined) {
						updated[semesterIndex].mappings[rowIndex].external_converted_mark = (course as any).external_converted_mark
					}
					if ((course as any).total_pass_mark !== undefined) {
						updated[semesterIndex].mappings[rowIndex].total_pass_mark = (course as any).total_pass_mark
					}
					if ((course as any).total_max_mark !== undefined) {
						updated[semesterIndex].mappings[rowIndex].total_max_mark = (course as any).total_max_mark
					}
				}
			}

			return updated
		})
	}, [courseMap])

	const toggleSemesterTable = useCallback((semesterIndex: number) => {
		setSemesterTables(prev => {
			const isCurrentlyOpen = prev[semesterIndex].isOpen

			// Create new array with all semesters closed first
			const updated = prev.map((table, idx) => {
				// If opening a new semester, close all others
				if (!isCurrentlyOpen && idx !== semesterIndex) {
					return { ...table, isOpen: false }
				}
				// If closing current semester, keep others as is
				if (isCurrentlyOpen && idx !== semesterIndex) {
					return table
				}
				// Toggle the clicked semester
				if (idx === semesterIndex) {
					return { ...table, isOpen: !isCurrentlyOpen }
				}
				return table
			})

			return updated
		})
	}, [])

	const toggleAllRegistration = useCallback((semesterIndex: number) => {
		const key = `semester_${semesterIndex}`
		setSelectAllRegistration(prev => {
			const newValue = !prev[key]
			setSemesterTables(prevTables => {
				const updated = [...prevTables]
				updated[semesterIndex] = {
					...updated[semesterIndex],
					mappings: updated[semesterIndex].mappings.map(m => ({
						...m,
						registration_based: newValue
					}))
				}
				return updated
			})
			return { ...prev, [key]: newValue }
		})
	}, [])

	const toggleAllStatus = useCallback((semesterIndex: number) => {
		const key = `semester_${semesterIndex}`
		setSelectAllStatus(prev => {
			const newValue = !prev[key]
			setSemesterTables(prevTables => {
				const updated = [...prevTables]
				updated[semesterIndex] = {
					...updated[semesterIndex],
					mappings: updated[semesterIndex].mappings.map(m => ({
						...m,
						is_active: newValue
					}))
				}
				return updated
			})
			return { ...prev, [key]: newValue }
		})
	}, [])

	const saveAllMappings = async () => {
		try {
			setSaving(true)

			// Get batch_code from existing mappings as fallback
			let existingBatchCode = batchCode
			if (!existingBatchCode) {
				for (const table of semesterTables) {
					const mappingWithBatch = table.mappings.find(m => m.batch_code)
					if (mappingWithBatch?.batch_code) {
						existingBatchCode = mappingWithBatch.batch_code
						break
					}
				}
			}

		// Validate that MyJKKN IDs are available
		if (!selectedProgramId) {
			toast({
				title: '❌ Missing Program ID',
				description: 'Program ID not found. Please refresh the page and try again.',
				variant: 'destructive'
			})
			setSaving(false)
			return
		}

		if (!selectedRegulationId) {
			toast({
				title: '❌ Missing Regulation ID',
				description: 'Regulation ID not found. Please refresh the page and try again.',
				variant: 'destructive'
			})
			setSaving(false)
			return
		}

		// Collect all mappings (clean them to remove any nested relations)
		const allMappings = []
		for (const table of semesterTables) {
			for (const mapping of table.mappings) {
				if (mapping.course_id) {
					// Validate semester_id is available
					if (!table.semester.id) {
						console.warn(`[Edit Page] Missing semester_id for semester: ${table.semester.semester_code}`)
						toast({
							title: '⚠️ Warning',
							description: `Semester ID not found for ${table.semester.semester_name}. Skipping this mapping.`,
							variant: 'destructive'
						})
						continue
					}

					// Create a clean mapping object without nested relations
					allMappings.push({
						id: mapping.id,
						course_id: mapping.course_id,
						institution_code: selectedInstitution,
						program_code: selectedProgram,
						program_id: selectedProgramId, // MyJKKN program.id
						regulation_code: selectedRegulation,
						regulation_id: selectedRegulationId, // MyJKKN regulation.id
						batch_code: mapping.batch_code || existingBatchCode,
						semester_code: mapping.semester_code,
						semester_id: table.semester.id, // MyJKKN semester.id
						course_group: mapping.course_group || 'General',
						course_category: mapping.course_category,
						course_order: mapping.course_order,
						group_order: mapping.group_order ?? mapping.course_order ?? null,
						internal_pass_mark: mapping.internal_pass_mark,
						internal_max_mark: mapping.internal_max_mark,
						internal_converted_mark: mapping.internal_converted_mark,
						external_pass_mark: mapping.external_pass_mark,
						external_max_mark: mapping.external_max_mark,
						external_converted_mark: mapping.external_converted_mark,
						total_pass_mark: mapping.total_pass_mark,
						total_max_mark: mapping.total_max_mark,
						annual_semester: mapping.annual_semester,
						registration_based: mapping.registration_based,
						is_active: mapping.is_active
					})
				}
			}
		}

		if (allMappings.length === 0) {
			toast({
				title: '⚠️ No Courses Selected',
				description: 'Please select at least one course to map.',
				variant: 'destructive'
			})
			setSaving(false)
			return
		}

		// Log IDs being sent for debugging
		console.log('[Edit Page] Saving mappings with MyJKKN IDs:', {
			program_id: selectedProgramId,
			regulation_id: selectedRegulationId,
			totalMappings: allMappings.length,
			sampleMapping: allMappings[0] ? {
				program_id: allMappings[0].program_id,
				regulation_id: allMappings[0].regulation_id,
				semester_id: allMappings[0].semester_id
			} : null
		})

		// Send all mappings to API (handles UPSERT - insert or update)
		console.log('Saving mappings (UPSERT):', allMappings)
			const res = await fetch('/api/course-management/course-mapping', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bulk: true,
					mappings: allMappings
				})
			})

			const result = await res.json()
			console.log('Save result:', result)

			let totalSuccess = 0
			let totalErrors = 0
			let errorMessages: string[] = []

			if (res.ok) {
				totalSuccess = result.success?.length || 0
				totalErrors = result.errors?.length || 0
				if (result.errors && result.errors.length > 0) {
					errorMessages = result.errors.map((e: any) => e.error || 'Unknown error')
				}
			} else {
				totalErrors = allMappings.length
				errorMessages = [result.error || 'Failed to save mappings']
			}

			if (totalErrors > 0 && totalSuccess > 0) {
				const errorDetail = errorMessages.length > 0 ? ` (${errorMessages[0]})` : ''
				toast({
					title: '⚠️ Partial Success',
					description: `${totalSuccess} saved successfully, ${totalErrors} failed${errorDetail}.`,
					variant: 'destructive',
					className: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
					duration: 6000
				})
			} else if (totalErrors > 0) {
				const errorDetail = errorMessages.length > 0 ? `: ${errorMessages[0]}` : ''
				toast({
					title: '❌ Save Failed',
					description: `Failed to save ${totalErrors} mapping(s)${errorDetail}.`,
					variant: 'destructive',
					className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
					duration: 6000
				})
			} else {
				toast({
					title: '✅ Success',
					description: `${totalSuccess} course mapping(s) saved successfully.`,
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
					duration: 5000
				})
			}

			// Small delay to ensure database commits are complete
			await new Promise(resolve => setTimeout(resolve, 300))

			// Reload data to get fresh state from server
			await loadExistingMappings()
		} catch (err: any) {
			toast({
				title: '❌ Error',
				description: err.message || 'An unexpected error occurred.',
				variant: 'destructive'
			})
		} finally {
			setSaving(false)
		}
	}

	const handleGeneratePDF = async () => {
		try {
			setLoading(true)

			// Validate required selections
			if (!selectedInstitution || !selectedProgram || !selectedRegulation) {
				toast({
					title: '⚠️ Missing Selection',
					description: 'Please select Institution, Program, and Regulation before generating the report.',
					variant: 'destructive'
				})
				return
			}

			// Build URL with form selections
			// Note: These are form-selected parameters, not from global institution filter
			const baseUrl = `/api/course-management/course-mapping/report`
			const params = new URLSearchParams({
				institution_code: selectedInstitution,
				program_code: selectedProgram,
				regulation_code: selectedRegulation
			})
			const url = `${baseUrl}?${params.toString()}`

			const response = await fetch(url)

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}))
				const errorMessage = errorData.error || `Failed to fetch report data (${response.status})`
				
				toast({
					title: '❌ Generation Failed',
					description: errorMessage,
					variant: 'destructive'
				})
				return
			}

			const reportData = await response.json()

			if (!reportData.mappings || reportData.mappings.length === 0) {
				toast({
					title: '⚠️ No Data',
					description: 'No course mappings found for the selected criteria.',
					variant: 'destructive'
				})
				return
			}

			generateCourseMappingPDF(reportData)

			toast({
				title: '✅ PDF Generated',
				description: 'Course mapping report downloaded successfully.',
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('PDF generation error:', error)
			toast({
				title: '❌ Generation Failed',
				description: error instanceof Error ? error.message : 'Failed to generate PDF report.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}

	const downloadBulkUpdateTemplate = async () => {
		// Create template with current mappings data including all reference data
		const templateData: any[] = []

		for (const table of semesterTables) {
			for (const mapping of table.mappings) {
				if (mapping.course_id) {
					const course = courses.find(c => c.id === mapping.course_id)
					templateData.push({
						'Institution Code': selectedInstitution,
						'Program Code': selectedProgram,
						'Regulation Code': selectedRegulation,
						'Batch Code': mapping.batch_code || batchCode || '',
						'Semester Code': table.semester.semester_code,
						'Semester Name': table.semester.semester_name,
						'Course Code': course?.course_code || '',
						'Course Name': course?.course_title || '',
						'Display Code': course?.display_code || '',
						'Course Type': course?.course_type || '',
						'Course Part': course?.course_part_master || '',
						'Credits': course?.credits || 0,
						'Course Category': mapping.course_category || '',
						'Course Group': mapping.course_group || 'General',
						'Course Order': mapping.course_order || 1,
						'Group Order': mapping.group_order ?? mapping.course_order ?? '',
						'Annual Semester (TRUE/FALSE)': mapping.annual_semester ? 'TRUE' : 'FALSE',
						'Registration Based (TRUE/FALSE)': mapping.registration_based ? 'TRUE' : 'FALSE',
						'Active (TRUE/FALSE)': mapping.is_active !== false ? 'TRUE' : 'FALSE'
					})
				}
			}
		}

		if (templateData.length === 0) {
			// Create empty template with headers for adding new mappings
			templateData.push({
				'Institution Code': selectedInstitution,
				'Program Code': selectedProgram,
				'Regulation Code': selectedRegulation,
				'Batch Code': batchCode || '',
				'Semester Code': '',
				'Semester Name': '',
				'Course Code': '',
				'Course Name': '',
				'Display Code': '',
				'Course Type': '',
				'Course Part': '',
				'Credits': 0,
				'Course Category': '',
				'Course Group': 'General',
				'Course Order': 1,
				'Group Order': '',
				'Annual Semester (TRUE/FALSE)': 'FALSE',
				'Registration Based (TRUE/FALSE)': 'FALSE',
				'Active (TRUE/FALSE)': 'TRUE'
			})
		}

		// Create Reference Data sheet
		const referenceData: any[][] = []

		// Fetch reference data from APIs
		try {
			// Fetch institutions
			const institutionsRes = await fetch('/api/master/institutions')
			const institutions = institutionsRes.ok ? await institutionsRes.json() : []

			// Fetch regulations
			const regulationsRes = await fetch('/api/master/regulations')
			const regulations = regulationsRes.ok ? await regulationsRes.json() : []

			// Fetch programs
			const programsRes = await fetch('/api/master/programs')
			const programs = programsRes.ok ? await programsRes.json() : []

			// Build reference data sheet
			referenceData.push(['']) // Empty row
			referenceData.push(['INSTITUTION CODES'])
			referenceData.push(['Category', 'Code/Value', 'Name/Description'])
			referenceData.push(['Institution Code', 'Institution Name', ''])
			institutions.forEach((inst: any) => {
				referenceData.push(['', inst.institution_code || '', inst.name || inst.institution_name || ''])
			})

			referenceData.push([''])
			referenceData.push(['REGULATION CODES'])
			referenceData.push(['Category', 'Code/Value', 'Name/Description'])
			referenceData.push(['Regulation Code', 'Regulation Name', ''])
			regulations.forEach((reg: any) => {
				referenceData.push(['', reg.regulation_code || '', reg.regulation_name || ''])
			})

			referenceData.push([''])
			referenceData.push(['PROGRAM CODES'])
			referenceData.push(['Category', 'Code/Value', 'Name/Description'])
			referenceData.push(['Program Code', 'Program Name', ''])
			programs.forEach((prog: any) => {
				referenceData.push(['', prog.program_code || '', prog.program_name || ''])
			})

			referenceData.push([''])
			referenceData.push(['SEMESTER CODES'])
			referenceData.push(['Category', 'Code/Value', 'Name/Description'])
			referenceData.push(['Semester Code', 'Semester Name', ''])
			semesters.forEach((sem: Semester) => {
				referenceData.push(['', sem.semester_code || '', sem.semester_name || ''])
			})

			referenceData.push([''])
			referenceData.push(['AVAILABLE COURSES'])
			referenceData.push(['Category', 'Code/Value', 'Name/Description'])
			referenceData.push(['Course Code', 'Course Name', 'Course Type'])
			courses.forEach((course: any) => {
				referenceData.push(['', course.course_code || '', course.course_title || '', course.course_type || ''])
			})

		} catch (err) {
			console.error('Error fetching reference data:', err)
		}

		const ws = XLSX.utils.json_to_sheet(templateData)
		const wsRef = XLSX.utils.aoa_to_sheet(referenceData)
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Course Mappings')
		XLSX.utils.book_append_sheet(wb, wsRef, 'Reference Data')
		XLSX.writeFile(wb, `course_mapping_${selectedProgram}_${selectedRegulation}_${new Date().toISOString().split('T')[0]}.xlsx`)

		toast({
			title: '✅ Template Downloaded',
			description: `${templateData.length} course mapping(s) exported to Excel with reference data.`,
			className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
		})
	}

	const handleBulkUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		try {
			setLoading(true)
			let jsonData: any[] = []

			// Parse file
			if (file.name.endsWith('.json')) {
				const text = await file.text()
				const parsed = JSON.parse(text)
				jsonData = Array.isArray(parsed) ? parsed : [parsed]
			} else {
				const data = await file.arrayBuffer()
				const workbook = await XLSX.read(data)
				const worksheet = workbook.Sheets[workbook.SheetNames[0]]
				jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]
			}

			let successCount = 0
			let errorCount = 0
			let addedCount = 0
			let updatedCount = 0
			const errorDetails: Array<{ row: number; course_code: string; semester: string; errors: string[] }> = []

			// Get batch_code from existing mappings or from file
			let existingBatchCode = batchCode
			if (!existingBatchCode) {
				for (const table of semesterTables) {
					const mappingWithBatch = table.mappings.find(m => m.batch_code)
					if (mappingWithBatch?.batch_code) {
						existingBatchCode = mappingWithBatch.batch_code
						break
					}
				}
			}

			for (let i = 0; i < jsonData.length; i++) {
				const row = jsonData[i]
				const rowNumber = i + 2 // +2 for header row

				try {
					const courseCode = row['Course Code'] || row.course_code
					const semesterCode = row['Semester Code'] || row.semester_code
					const rowBatchCode = row['Batch Code'] || row.batch_code || existingBatchCode

					if (!courseCode?.trim()) {
						errorCount++
						errorDetails.push({
							row: rowNumber,
							course_code: 'N/A',
							semester: semesterCode || 'N/A',
							errors: ['Course code is required']
						})
						continue
					}

					if (!semesterCode?.trim()) {
						errorCount++
						errorDetails.push({
							row: rowNumber,
							course_code: courseCode,
							semester: 'N/A',
							errors: ['Semester code is required']
						})
						continue
					}

					// Find the course by course_code
					const course = courses.find(c => c.course_code === courseCode.trim())
					if (!course) {
						errorCount++
						errorDetails.push({
							row: rowNumber,
							course_code: courseCode,
							semester: semesterCode,
							errors: [`Course "${courseCode}" not found in available courses`]
						})
						continue
					}

					// Find existing mapping by course_id and semester_code (for update)
					// First check in existingMappings from database
					let existingMapping: CourseMapping | undefined = existingMappings.find(m =>
						m.course_id === course.id && m.semester_code === semesterCode
					)

					// Also check in semesterTables if not found
					if (!existingMapping) {
						for (const table of semesterTables) {
							existingMapping = table.mappings.find(m =>
								m.course_id === course.id &&
								(m.semester_code === semesterCode || table.semester.semester_code === semesterCode)
							)
							if (existingMapping) break
						}
					}

					// Find semester from semesterTables to get semester_id
					const semesterTable = semesterTables.find(t => 
						t.semester.semester_code === semesterCode || 
						t.semester.semester_name.toLowerCase() === semesterCode.toLowerCase()
					)

					// Build mapping payload
					const mappingPayload: any = {
						course_id: course.id,
						institution_code: row['Institution Code'] || row.institution_code || selectedInstitution,
						program_code: row['Program Code'] || row.program_code || selectedProgram,
						program_id: selectedProgramId, // MyJKKN program.id
						regulation_code: row['Regulation Code'] || row.regulation_code || selectedRegulation,
						regulation_id: selectedRegulationId, // MyJKKN regulation.id
						batch_code: rowBatchCode,
						semester_code: semesterCode,
						semester_id: semesterTable?.semester.id || "", // MyJKKN semester.id
						course_category: row['Course Category'] || row.course_category || course.course_category || '',
						course_group: String(row['Course Group'] || row.course_group || 'General'),
						course_order: Number(row['Course Order'] || row.course_order) || 1,
						group_order: (row['Group Order'] ?? row.group_order) === '' || (row['Group Order'] ?? row.group_order) == null ? (Number(row['Course Order'] || row.course_order) || null) : Number(row['Group Order'] ?? row.group_order),
						annual_semester: typeof row.annual_semester === 'boolean'
							? row.annual_semester
							: String(row['Annual Semester (TRUE/FALSE)'] || row.annual_semester || 'FALSE').toUpperCase() === 'TRUE',
						registration_based: typeof row.registration_based === 'boolean'
							? row.registration_based
							: String(row['Registration Based (TRUE/FALSE)'] || row.registration_based || 'FALSE').toUpperCase() === 'TRUE',
						is_active: typeof row.is_active === 'boolean'
							? row.is_active
							: String(row['Active (TRUE/FALSE)'] || row.is_active || 'TRUE').toUpperCase() !== 'FALSE'
					}

					// Track if this is an update or add
					const isUpdate = !!existingMapping?.id

					// If existing mapping found, include id for update
					if (existingMapping?.id) {
						mappingPayload.id = existingMapping.id
					}

					// Send to API
					const res = await fetch('/api/course-management/course-mapping', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							bulk: true,
							mappings: [mappingPayload]
						})
					})

					if (res.ok) {
						const result = await res.json()
						if (result.success && result.success.length > 0) {
							successCount++
							if (isUpdate) {
								updatedCount++
							} else {
								addedCount++
							}
						} else if (result.errors && result.errors.length > 0) {
							errorCount++
							errorDetails.push({
								row: rowNumber,
								course_code: courseCode,
								semester: semesterCode,
								errors: result.errors.map((e: any) => e.error || 'Unknown error')
							})
						} else {
							successCount++
							if (isUpdate) {
								updatedCount++
							} else {
								addedCount++
							}
						}
					} else {
						errorCount++
						const errorData = await res.json().catch(() => ({}))
						errorDetails.push({
							row: rowNumber,
							course_code: courseCode,
							semester: semesterCode,
							errors: [errorData.error || 'Failed to save mapping']
						})
					}
				} catch (err) {
					errorCount++
					errorDetails.push({
						row: rowNumber,
						course_code: row['Course Code'] || row.course_code || 'N/A',
						semester: row['Semester Code'] || row.semester_code || 'N/A',
						errors: [err instanceof Error ? err.message : 'Unknown error']
					})
				}
			}

			// Update summary
			setUploadSummary({
				total: jsonData.length,
				success: successCount,
				failed: errorCount
			})

			// Build description with add/update counts
			const successDescription = successCount > 0
				? `${addedCount > 0 ? `${addedCount} added` : ''}${addedCount > 0 && updatedCount > 0 ? ', ' : ''}${updatedCount > 0 ? `${updatedCount} updated` : ''}`
				: ''

			// Show results
			if (errorCount === 0) {
				toast({
					title: '✅ Bulk Import Complete',
					description: `Successfully processed ${successCount} mapping(s): ${successDescription}.`,
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
					duration: 5000
				})
			} else if (successCount > 0) {
				setUploadErrors(errorDetails)
				toast({
					title: '⚠️ Partial Import Success',
					description: `${successDescription}, ${errorCount} failed. Check console for details.`,
					className: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
					duration: 6000
				})
				console.error('Bulk import errors:', errorDetails)
			} else {
				setUploadErrors(errorDetails)
				toast({
					title: '❌ Bulk Import Failed',
					description: `All ${errorCount} mapping(s) failed. Check console for details.`,
					variant: 'destructive',
					className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
					duration: 6000
				})
				console.error('Bulk import errors:', errorDetails)
			}

			// Reload data
			await loadExistingMappings()

			// Reset file input
			e.target.value = ''
		} catch (error) {
			console.error('Bulk import error:', error)
			toast({
				title: '❌ Bulk Import Failed',
				description: error instanceof Error ? error.message : 'Failed to process file.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
			})
		} finally {
			setLoading(false)
		}
	}

	// Show loading state while context is initializing
	if (!institutionContextReady) {
		return (
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="flex flex-col min-h-screen">
					<AppHeader />
					<div className="flex flex-1 flex-col gap-4 p-4 pt-0 items-center justify-center">
						<div className="text-center">
							<RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
							<p className="mt-2 text-muted-foreground">Loading...</p>
						</div>
					</div>
					<AppFooter />
				</SidebarInset>
			</SidebarProvider>
		)
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-2 p-2 pt-0 relative z-0">
					<div className="flex items-center gap-2">
						<Breadcrumb className="text-xs">
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link href="/dashboard" className="text-xs">Dashboard</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link href="/course-management/course-mapping-index" className="text-xs">Mapping Index</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage className="text-xs">Edit</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Header Card with Locked Fields */}
					<Card>
						<CardHeader className="p-2">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										asChild
										className="h-7 text-xs px-2"
									>
										<Link href="/course-management/course-mapping-index">
											<ArrowLeft className="h-3 w-3 mr-1" />
											Back
										</Link>
									</Button>
									<div className="h-6 w-px bg-border" />
									<div>
										<h2 className="text-base font-semibold">Edit Course Mapping</h2>
										<p className="text-xs text-muted-foreground">Manage course mappings</p>
									</div>
								</div>
								<div className="flex gap-1.5">
									<Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={handleGeneratePDF} disabled={loading}>
										<FileText className="h-3 w-3 mr-1" />
										PDF
									</Button>
									<Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={downloadBulkUpdateTemplate} disabled={loading}>
										<Download className="h-3 w-3 mr-1" />
										Export
									</Button>
									<Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => document.getElementById('bulk-update-file')?.click()} disabled={loading}>
										<Upload className="h-3 w-3 mr-1" />
										Import
									</Button>
									<input
										id="bulk-update-file"
										type="file"
										accept=".xlsx,.xls,.json"
										onChange={handleBulkUpdate}
										className="hidden"
									/>
									<Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={loadExistingMappings} disabled={loading}>
										<RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
										Refresh
									</Button>
									<Button size="sm" className="h-7 text-xs px-2" onClick={saveAllMappings} disabled={saving || loading}>
										<Save className="h-3 w-3 mr-1" />
										{saving ? 'Saving...' : 'Save All'}
									</Button>
								</div>
							</div>
						</CardHeader>
						<CardContent className="p-2 pt-0">
							{/* Locked Selection Display (NO BATCH) */}
							<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
								<Card className="border-l-4 border-l-blue-500">
									<CardContent className="p-3">
										<Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Institution</Label>
										<p className="font-bold mt-1 text-sm">{institutionName || selectedInstitution}</p>
										<p className="text-xs text-muted-foreground">{selectedInstitution}</p>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-emerald-500">
									<CardContent className="p-3">
										<Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Program</Label>
										<p className="font-bold mt-1 text-sm">{programName || selectedProgram}</p>
										<p className="text-xs text-muted-foreground">{selectedProgram}</p>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-purple-500">
									<CardContent className="p-3">
										<Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Regulation</Label>
										<p className="font-bold mt-1 text-sm">{regulationName || selectedRegulation}</p>
										<p className="text-xs text-muted-foreground">{selectedRegulation}</p>
									</CardContent>
								</Card>
							</div>
						</CardContent>
					</Card>

					{/* Loading Skeleton */}
					{initialLoading && (
						<div className="space-y-2">
							<div className="border rounded-lg p-2">
								<div className="flex items-center gap-2 text-muted-foreground">
									<RefreshCw className="h-3.5 w-3.5 animate-spin" />
									<span className="text-xs">
										{loadingProgress || 'Loading course mappings...'}
									</span>
								</div>
							</div>
							{[1, 2, 3, 4].map((i) => (
								<SemesterSkeleton key={i} />
							))}
						</div>
					)}

					{/* Semester Tables */}
					{!initialLoading && selectedRegulation && semesterTables.length > 0 && (
						<div className="space-y-2 relative">
							{courses.length > 0 ? (
								<div className="border rounded-lg p-2">
									<span className="text-xs text-muted-foreground">
										{courses.length} course{courses.length !== 1 ? 's' : ''} available
									</span>
								</div>
							) : (
								<div className="border rounded-lg p-2">
									<div className="flex items-center gap-2 text-muted-foreground">
										<RefreshCw className="h-3.5 w-3.5 animate-spin" />
										<span className="text-xs">
											No courses loaded for "{selectedInstitution}" - "{selectedRegulation}".
										</span>
									</div>
								</div>
							)}

							{semesterTables.map((table, semIndex) => {
								const isOddSemester = table.semester.semester_number % 2 === 1
								const cardBorderClass = isOddSemester
									? 'border-l-4 border-l-blue-500'
									: 'border-l-4 border-l-emerald-500'

								return (
									<Card key={table.semester.id} className={cardBorderClass}>
										<CardHeader className="p-2">
											<Collapsible open={table.isOpen} onOpenChange={() => toggleSemesterTable(semIndex)}>
												<CollapsibleTrigger asChild>
													<div className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded-lg p-1.5 -m-1.5 transition-colors">
														<div className="flex items-center gap-1.5">
															<Button variant="ghost" size="sm" className="h-5 w-5 p-0">
																{table.isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
															</Button>
															<Calendar className={`h-3.5 w-3.5 ${isOddSemester ? 'text-blue-500/40' : 'text-emerald-500/40'}`} />
															<h3 className="text-xs font-semibold">{table.semester.semester_name}</h3>
															<Badge variant="secondary" className="ml-1 text-xs h-4 px-1.5">
																{table.mappings.filter(m => m.course_id).length} courses
															</Badge>
														</div>
													<Button
														size="sm"
														className="h-6 text-xs px-1.5"
														onClick={(e) => {
															e.stopPropagation()
															addCourseRow(semIndex)
														}}
													>
														<Plus className="h-3 w-3 mr-0.5" />
														Add
													</Button>
												</div>
											</CollapsibleTrigger>

											<CollapsibleContent>
												<div className="mt-3 border rounded-lg bg-background overflow-hidden">
													<div className="overflow-x-auto overflow-y-auto relative" style={{ maxHeight: "26rem" }}>
														<Table>
															<TableHeader className="sticky top-0 z-[5] bg-muted/50">
																<TableRow>
																	<TableHead className="w-10 text-xs h-8 font-semibold px-2">#</TableHead>
																	<TableHead className="w-[120px] text-xs h-8 font-semibold px-2 whitespace-normal">Course Code</TableHead>
																	<TableHead className="min-w-[250px] text-xs h-8 font-semibold px-2 whitespace-normal">Course Name</TableHead>
																	<TableHead className="w-[100px] text-xs h-8 font-semibold px-2 whitespace-normal">Category</TableHead>
																	<TableHead className="w-[120px] text-xs h-8 font-semibold px-2 whitespace-normal">Course Group</TableHead>
																	<TableHead className="w-16 text-xs h-8 font-semibold px-2">Order</TableHead>
																	<TableHead className="w-16 text-xs h-8 font-semibold px-2">Grp Order</TableHead>
																	<TableHead className="w-16 text-center text-xs h-8 font-semibold px-1">
																		<div className="flex flex-col items-center gap-0.5">
																			<span className="text-xs font-semibold">Annual</span>
																		</div>
																	</TableHead>
																	<TableHead className="w-20 text-center text-xs h-8 font-semibold px-1">
																		<div className="flex flex-col items-center gap-0.5">
																			<span className="text-xs font-semibold">Reg</span>
																			<Checkbox
																				checked={selectAllRegistration[`semester_${semIndex}`] || false}
																				onCheckedChange={() => toggleAllRegistration(semIndex)}
																				aria-label="Select all registration based"
																				className="h-3 w-3"
																			/>
																		</div>
																	</TableHead>
																	<TableHead className="w-16 text-center text-xs h-8 font-semibold px-1">
																		<div className="flex flex-col items-center gap-0.5">
																			<span className="text-xs font-semibold">Active</span>
																			<Checkbox
																				checked={selectAllStatus[`semester_${semIndex}`] !== false}
																				onCheckedChange={() => toggleAllStatus(semIndex)}
																				aria-label="Select all active"
																				className="h-3 w-3"
																			/>
																		</div>
																	</TableHead>
																	<TableHead className="w-14 text-xs h-8 font-semibold px-1">Action</TableHead>
																</TableRow>

															</TableHeader>
															<TableBody>
																{table.mappings.length === 0 ? (
																	<TableRow>
																		<TableCell colSpan={11} className="text-center text-muted-foreground py-3 text-xs">
																			No courses mapped. Click "Add" to start.
																		</TableCell>
																	</TableRow>
																) : (
																	table.mappings.map((mapping, rowIndex) => (
																		<CourseTableRow
																			key={`${semIndex}-${mapping.id || `new-${rowIndex}`}-${rowIndex}`}
																			mapping={mapping}
																			rowIndex={rowIndex}
																			courseMap={courseMap}
																			isPopoverOpen={openPopovers[`${semIndex}_${rowIndex}`] || false}
																			onPopoverChange={(open) => {
																				setOpenPopovers(prev => ({
																					...prev,
																					[`${semIndex}_${rowIndex}`]: open
																				}))
																			}}
																			onUpdateRow={(field, value) => updateCourseRow(semIndex, rowIndex, field, value)}
																			onRemoveRow={() => removeCourseRow(semIndex, rowIndex)}
																			courses={courses}
																		/>
																	))
																)}
															</TableBody>
														</Table>
													</div>
												</div>
											</CollapsibleContent>
										</Collapsible>
									</CardHeader>
								</Card>
							)
						})}
						</div>
					)}
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}

