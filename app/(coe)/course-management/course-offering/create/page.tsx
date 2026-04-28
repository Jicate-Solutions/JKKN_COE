'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution } from '@/context/institution-context'
import { useMyJKKNInstitutionFilter } from '@/hooks/use-myjkkn-institution-filter'
import { useExaminationSession } from '@/context/examination-session-context'
import { ChevronDown, ChevronRight, ArrowLeft, Loader2, BookOpen, Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Roman numeral helper ──
const toRoman = (num: number): string => {
	const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
	let result = ''
	for (const [value, symbol] of map) {
		while (num >= value) { result += symbol; num -= value }
	}
	return result
}

interface Institution {
	id: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids?: string[]
}

interface ExamSession {
	id: string
	session_code: string
	session_name: string
	institutions_id: string
}

interface ProgramOption {
	id: string
	program_code: string
	program_name: string
}

interface CourseItem {
	course_mapping_id: string
	course_id: string
	course_code: string
	course_name: string
}

interface SelectedCourses {
	[semesterCode: string]: Set<string>
}

// ── Searchable Select Component ──
function SearchableSelect({
	value,
	onValueChange,
	options,
	placeholder,
	disabled,
	searchPlaceholder,
}: {
	value: string
	onValueChange: (v: string) => void
	options: { value: string; label: string }[]
	placeholder: string
	disabled?: boolean
	searchPlaceholder?: string
}) {
	const [open, setOpen] = useState(false)

	const selected = options.find(o => o.value === value)

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className="h-10 w-full justify-between font-normal text-left"
				>
					<span className="truncate">{selected?.label || placeholder}</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
				<Command>
					<CommandInput placeholder={searchPlaceholder || 'Search...'} />
					<CommandList>
						<CommandEmpty>No results found.</CommandEmpty>
						<CommandGroup>
							{options.map(opt => (
								<CommandItem
									key={opt.value}
									value={opt.label}
									onSelect={() => { onValueChange(opt.value); setOpen(false) }}
								>
									<Check className={cn('mr-2 h-4 w-4', value === opt.value ? 'opacity-100' : 'opacity-0')} />
									<span className="truncate">{opt.label}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

// ── Multi-select Semester Dropdown ──
function SemesterMultiSelect({
	semesters,
	selected,
	onToggle,
	onSelectAll,
	onClear,
	disabled,
}: {
	semesters: string[]
	selected: Set<string>
	onToggle: (sem: string, checked: boolean) => void
	onSelectAll: () => void
	onClear: () => void
	disabled?: boolean
}) {
	const [open, setOpen] = useState(false)

	const getSemLabel = (semCode: string) => {
		const match = semCode.match(/(\d+)/)
		return match ? `Semester ${toRoman(parseInt(match[1]))}` : semCode
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className="h-10 w-full justify-between font-normal text-left"
				>
					<span className="truncate">
						{selected.size === 0
							? 'Select semesters'
							: `${selected.size} semester${selected.size !== 1 ? 's' : ''}`}
					</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
				<div className="p-2 border-b">
					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<span>{selected.size} selected</span>
						<div className="flex gap-2">
							<button type="button" onClick={onSelectAll} className="text-primary hover:underline">All</button>
							<span>|</span>
							<button type="button" onClick={onClear} className="text-primary hover:underline">Clear</button>
						</div>
					</div>
				</div>
				<div className="max-h-[200px] overflow-y-auto p-1">
					{semesters.map(sem => (
						<label
							key={sem}
							className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
						>
							<Checkbox
								checked={selected.has(sem)}
								onCheckedChange={(checked) => onToggle(sem, !!checked)}
							/>
							<span className="text-sm">{getSemLabel(sem)}</span>
						</label>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}

export default function CreateCourseOfferingPage() {
	const router = useRouter()
	const { toast } = useToast()

	const {
		institutionId: contextInstitutionId,
		isReady: institutionReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
	} = useInstitutionFilter()

	const { availableInstitutions } = useInstitution()
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()
	const { currentSession } = useExaminationSession()

	// Form state
	const [institutionsId, setInstitutionsId] = useState('')
	const [institutionCode, setInstitutionCode] = useState('')
	const [examSessionId, setExamSessionId] = useState('')
	const [sessionCode, setSessionCode] = useState('')
	const [programId, setProgramId] = useState('')
	const [programCode, setProgramCode] = useState('')
	const [regulationCode, setRegulationCode] = useState('')

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [examSessions, setExamSessions] = useState<ExamSession[]>([])
	const [programs, setPrograms] = useState<ProgramOption[]>([])
	const [regulations, setRegulations] = useState<string[]>([])
	const [semesters, setSemesters] = useState<string[]>([])
	const [coursesBySemester, setCoursesBySemester] = useState<Record<string, CourseItem[]>>({})

	// Selection state
	const [selectedSemesters, setSelectedSemesters] = useState<Set<string>>(new Set())
	const [selectedCourses, setSelectedCourses] = useState<SelectedCourses>({})
	const [expandedSemesters, setExpandedSemesters] = useState<Set<string>>(new Set())

	// Existing offerings from DB (for sync: tracks what was pre-checked)
	// Map: "course_mapping_id|semester_code" → offering id
	const [existingOfferingsMap, setExistingOfferingsMap] = useState<Map<string, string>>(new Map())
	const [initialChecked, setInitialChecked] = useState<SelectedCourses>({}) // snapshot of what DB had
	const [confirmOpen, setConfirmOpen] = useState(false)

	// Loading states
	const [loadingRegulations, setLoadingRegulations] = useState(false)
	const [loadingSemesters, setLoadingSemesters] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState<Record<string, boolean>>({})
	const [loadingExisting, setLoadingExisting] = useState(false)
	const [submitting, setSubmitting] = useState(false)

	// Total selected count
	const totalSelected = useMemo(() => {
		let count = 0
		for (const sem of selectedSemesters) {
			count += selectedCourses[sem]?.size || 0
		}
		return count
	}, [selectedSemesters, selectedCourses])

	const selectedSemesterCount = selectedSemesters.size

	// ── Diff calculation ──
	const diff = useMemo(() => {
		const toInsert: Array<{ semCode: string; cmId: string }> = []
		const toDelete: Array<{ semCode: string; cmId: string; offeringId: string }> = []
		let unchanged = 0

		// Find new additions (checked now but wasn't before)
		for (const sem of selectedSemesters) {
			const current = selectedCourses[sem] || new Set()
			const initial = initialChecked[sem] || new Set()
			for (const cmId of current) {
				if (initial.has(cmId)) {
					unchanged++
				} else {
					toInsert.push({ semCode: sem, cmId })
				}
			}
		}

		// Find removals (was checked before but not now)
		for (const sem of Object.keys(initialChecked)) {
			const initial = initialChecked[sem] || new Set()
			const current = selectedSemesters.has(sem) ? (selectedCourses[sem] || new Set()) : new Set<string>()
			for (const cmId of initial) {
				if (!current.has(cmId)) {
					const key = `${cmId}|${sem}`
					const offeringId = existingOfferingsMap.get(key)
					if (offeringId) {
						toDelete.push({ semCode: sem, cmId, offeringId })
					}
				}
			}
		}

		return { toInsert, toDelete, unchanged }
	}, [selectedSemesters, selectedCourses, initialChecked, existingOfferingsMap])

	const hasChanges = diff.toInsert.length > 0 || diff.toDelete.length > 0

	// ── Helpers ──
	const getSemesterLabel = (semCode: string) => {
		const match = semCode.match(/(\d+)/)
		return match ? `Semester ${toRoman(parseInt(match[1]))}` : semCode
	}

	const getSemesterNumber = (semCode: string) => {
		const match = semCode.match(/(\d+)/)
		return match ? parseInt(match[1]) : 0
	}

	// ── Fetch institutions ──
	const fetchInstitutions = useCallback(async () => {
		try {
			const url = appendToUrl('/api/master/institutions')
			const res = await fetch(url)
			if (!res.ok) return
			const data = await res.json()
			const mapped = (Array.isArray(data) ? data : [])
				.filter((i: any) => i?.institution_code)
				.map((i: any) => ({
					id: i.id,
					institution_code: i.institution_code,
					institution_name: i.institution_name || i.name,
					myjkkn_institution_ids: i.myjkkn_institution_ids || [],
				}))
			setInstitutions(mapped)
		} catch (e) {
			console.error('Failed to load institutions:', e)
		}
	}, [appendToUrl])

	// ── Fetch exam sessions ──
	const fetchExamSessions = useCallback(async (instId: string) => {
		try {
			const res = await fetch(`/api/exam-management/examination-sessions?institutions_id=${instId}`)
			if (!res.ok) return
			const data = await res.json()
			const mapped = (Array.isArray(data) ? data : []).map((s: any) => ({
				id: s.id,
				session_code: s.session_code,
				session_name: s.session_name,
				institutions_id: s.institutions_id,
			}))
			setExamSessions(mapped)
		} catch (e) {
			console.error('Failed to load exam sessions:', e)
		}
	}, [])

	// ── Fetch programs from MyJKKN ──
	const fetchPrograms = useCallback(async (instId: string) => {
		const inst = institutions.find(i => i.id === instId) || availableInstitutions?.find((i: any) => i.id === instId)
		const myjkknIds = inst?.myjkkn_institution_ids || []
		if (myjkknIds.length === 0) {
			setPrograms([])
			return
		}
		try {
			const progs = await fetchMyJKKNPrograms(myjkknIds)
			const mapped: ProgramOption[] = (progs || []).map((p: any) => ({
				id: p.id,
				program_code: p.program_id || p.program_code,
				program_name: p.program_name || p.name || p.program_id,
			}))
			setPrograms(mapped)
		} catch (e) {
			console.error('Failed to load programs:', e)
			setPrograms([])
		}
	}, [institutions, availableInstitutions, fetchMyJKKNPrograms])

	// ── Fetch regulations from course_mapping ──
	const fetchRegulations = useCallback(async (instCode: string, progCode: string) => {
		setLoadingRegulations(true)
		try {
			const res = await fetch(
				`/api/course-management/course-offering/lookups?type=regulations&institution_code=${encodeURIComponent(instCode)}&program_code=${encodeURIComponent(progCode)}`
			)
			if (!res.ok) throw new Error('Failed')
			const data = await res.json()
			setRegulations(Array.isArray(data) ? data : [])
		} catch (e) {
			console.error('Failed to load regulations:', e)
			setRegulations([])
		} finally {
			setLoadingRegulations(false)
		}
	}, [])

	// ── Fetch semesters from course_mapping ──
	const fetchSemesters = useCallback(async (instCode: string, progCode: string, regCode: string) => {
		setLoadingSemesters(true)
		try {
			const res = await fetch(
				`/api/course-management/course-offering/lookups?type=semesters&institution_code=${encodeURIComponent(instCode)}&program_code=${encodeURIComponent(progCode)}&regulation_code=${encodeURIComponent(regCode)}`
			)
			if (!res.ok) throw new Error('Failed')
			const data = await res.json()
			setSemesters(Array.isArray(data) ? data.map((item: any) => item.semester_code).filter(Boolean) : [])
		} catch (e) {
			console.error('Failed to load semesters:', e)
			setSemesters([])
		} finally {
			setLoadingSemesters(false)
		}
	}, [])

	// ── Fetch existing offerings for selected semesters ──
	const fetchExistingOfferings = useCallback(async (semCodes: string[]) => {
		if (!institutionsId || !examSessionId || !programCode || semCodes.length === 0) return
		setLoadingExisting(true)
		try {
			const res = await fetch(
				`/api/course-management/course-offering/lookups?type=existing&institutions_id=${encodeURIComponent(institutionsId)}&examination_session_id=${encodeURIComponent(examSessionId)}&program_code=${encodeURIComponent(programCode)}&semester_codes=${encodeURIComponent(semCodes.join(','))}`
			)
			if (!res.ok) return
			const data = await res.json()
			const offerings: Array<{ id: string; course_mapping_id: string; semester_code: string }> = Array.isArray(data) ? data : []

			// Build map: "cmId|semCode" -> offering id
			const map = new Map<string, string>()
			const checkedBySem: SelectedCourses = {}

			for (const o of offerings) {
				map.set(`${o.course_mapping_id}|${o.semester_code}`, o.id)
				if (!checkedBySem[o.semester_code]) checkedBySem[o.semester_code] = new Set()
				checkedBySem[o.semester_code].add(o.course_mapping_id)
			}

			setExistingOfferingsMap(prev => {
				const next = new Map(prev)
				for (const [k, v] of map) next.set(k, v)
				return next
			})

			// Set initial checked state and pre-check existing
			setInitialChecked(prev => ({ ...prev, ...checkedBySem }))
			setSelectedCourses(prev => {
				const next = { ...prev }
				for (const [sem, cmIds] of Object.entries(checkedBySem)) {
					next[sem] = new Set([...(next[sem] || []), ...cmIds])
				}
				return next
			})
		} catch (e) {
			console.error('Failed to load existing offerings:', e)
		} finally {
			setLoadingExisting(false)
		}
	}, [institutionsId, examSessionId, programCode])

	// ── Fetch courses for a semester from course_mapping ──
	const fetchCoursesForSemester = useCallback(async (semCode: string) => {
		setLoadingCourses(prev => ({ ...prev, [semCode]: true }))
		try {
			const res = await fetch(
				`/api/course-management/course-offering/lookups?type=courses&institution_code=${encodeURIComponent(institutionCode)}&program_code=${encodeURIComponent(programCode)}&regulation_code=${encodeURIComponent(regulationCode)}&semester_code=${encodeURIComponent(semCode)}`
			)
			if (!res.ok) throw new Error('Failed')
			const data = await res.json()
			const courses: CourseItem[] = Array.isArray(data) ? data : []
			setCoursesBySemester(prev => ({ ...prev, [semCode]: courses }))

			// Don't auto-select all — instead, only pre-check existing offerings
			// The existing offerings are loaded separately via fetchExistingOfferings
			// For NEW semesters with no existing data, start empty (user picks what to add)
		} catch (e) {
			console.error(`Failed to load courses for ${semCode}:`, e)
			setCoursesBySemester(prev => ({ ...prev, [semCode]: [] }))
		} finally {
			setLoadingCourses(prev => ({ ...prev, [semCode]: false }))
		}
	}, [institutionCode, programCode, regulationCode])

	// ── Init: load institutions ──
	useEffect(() => {
		if (!institutionReady) return
		fetchInstitutions()
	}, [institutionReady, fetchInstitutions])

	// Auto-set institution from context
	useEffect(() => {
		if (contextInstitutionId && shouldFilter && !mustSelectInstitution) {
			setInstitutionsId(contextInstitutionId)
			const inst = institutions.find(i => i.id === contextInstitutionId)
			if (inst) setInstitutionCode(inst.institution_code)
		}
	}, [contextInstitutionId, shouldFilter, mustSelectInstitution, institutions])

	// Auto-set exam session from context
	useEffect(() => {
		if (currentSession && examSessions.length > 0) {
			const match = examSessions.find(s => s.id === currentSession.id)
			if (match) {
				setExamSessionId(match.id)
				setSessionCode(match.session_code)
			}
		}
	}, [currentSession, examSessions])

	// Fetch exam sessions + programs when institution changes
	useEffect(() => {
		if (!institutionsId) return
		fetchExamSessions(institutionsId)
		fetchPrograms(institutionsId)
		setExamSessionId('')
		setSessionCode('')
		setProgramId('')
		setProgramCode('')
		setRegulationCode('')
		setRegulations([])
		setSemesters([])
		setSelectedSemesters(new Set())
		setSelectedCourses({})
		setCoursesBySemester({})
		setExistingOfferingsMap(new Map())
		setInitialChecked({})
	}, [institutionsId, fetchExamSessions, fetchPrograms])

	// Fetch regulations when program changes
	useEffect(() => {
		if (!institutionCode || !programCode) return
		fetchRegulations(institutionCode, programCode)
		setRegulationCode('')
		setSemesters([])
		setSelectedSemesters(new Set())
		setSelectedCourses({})
		setCoursesBySemester({})
		setExistingOfferingsMap(new Map())
		setInitialChecked({})
	}, [institutionCode, programCode, fetchRegulations])

	// Fetch semesters when regulation changes
	useEffect(() => {
		if (!institutionCode || !programCode || !regulationCode) return
		fetchSemesters(institutionCode, programCode, regulationCode)
		setSelectedSemesters(new Set())
		setSelectedCourses({})
		setCoursesBySemester({})
		setExistingOfferingsMap(new Map())
		setInitialChecked({})
	}, [institutionCode, programCode, regulationCode, fetchSemesters])

	// ── Handlers ──

	const handleInstitutionChange = (id: string) => {
		setInstitutionsId(id)
		const inst = institutions.find(i => i.id === id)
		setInstitutionCode(inst?.institution_code || '')
	}

	const handleExamSessionChange = (id: string) => {
		setExamSessionId(id)
		const session = examSessions.find(s => s.id === id)
		setSessionCode(session?.session_code || '')
	}

	const handleProgramChange = (id: string) => {
		setProgramId(id)
		const prog = programs.find(p => p.id === id)
		setProgramCode(prog?.program_code || '')
	}

	const handleSemesterToggle = (semCode: string, checked: boolean) => {
		setSelectedSemesters(prev => {
			const next = new Set(prev)
			if (checked) { next.add(semCode) } else { next.delete(semCode) }
			return next
		})

		if (checked) {
			if (!coursesBySemester[semCode]) {
				fetchCoursesForSemester(semCode)
			}
			// Fetch existing offerings for this semester to pre-check
			fetchExistingOfferings([semCode])
			setExpandedSemesters(prev => new Set(prev).add(semCode))
		} else {
			setSelectedCourses(prev => { const next = { ...prev }; delete next[semCode]; return next })
			setExpandedSemesters(prev => { const next = new Set(prev); next.delete(semCode); return next })
		}
	}

	const handleSelectAllSemesters = () => {
		const allSems = new Set(semesters)
		setSelectedSemesters(allSems)
		semesters.forEach(sem => {
			if (!coursesBySemester[sem]) {
				fetchCoursesForSemester(sem)
			}
		})
		// Fetch existing for all semesters
		fetchExistingOfferings(semesters)
		setExpandedSemesters(new Set(semesters))
	}

	const handleClearSemesters = () => {
		setSelectedSemesters(new Set())
		setSelectedCourses({})
		setExpandedSemesters(new Set())
	}

	const handleCourseToggle = (semCode: string, courseMappingId: string, checked: boolean) => {
		setSelectedCourses(prev => {
			const semSet = new Set(prev[semCode] || [])
			if (checked) { semSet.add(courseMappingId) } else { semSet.delete(courseMappingId) }
			return { ...prev, [semCode]: semSet }
		})
	}

	const handleSelectAllCourses = (semCode: string, checked: boolean) => {
		const courses = coursesBySemester[semCode] || []
		setSelectedCourses(prev => ({
			...prev,
			[semCode]: checked ? new Set(courses.map(c => c.course_mapping_id)) : new Set(),
		}))
	}

	const toggleAccordion = (semCode: string) => {
		setExpandedSemesters(prev => {
			const next = new Set(prev)
			if (next.has(semCode)) { next.delete(semCode) } else { next.add(semCode) }
			return next
		})
	}

	// ── Submit (with confirm dialog) ──
	const handleSaveClick = () => {
		if (!institutionsId) { toast({ title: 'Institution is required', variant: 'destructive' }); return }
		if (!examSessionId) { toast({ title: 'Examination session is required', variant: 'destructive' }); return }
		if (!programCode) { toast({ title: 'Program is required', variant: 'destructive' }); return }
		if (!regulationCode) { toast({ title: 'Regulation is required', variant: 'destructive' }); return }
		if (!hasChanges) { toast({ title: 'No changes to save', variant: 'destructive' }); return }
		setConfirmOpen(true)
	}

	const handleConfirmSave = async () => {
		setConfirmOpen(false)
		setSubmitting(true)
		try {
			// Build insert items from diff.toInsert
			const items: Array<{ course_mapping_id: string; course_id: string; course_code: string; semester: number; semester_code: string }> = []
			for (const { semCode, cmId } of diff.toInsert) {
				const courses = coursesBySemester[semCode] || []
				const course = courses.find(c => c.course_mapping_id === cmId)
				if (course) {
					items.push({
						course_mapping_id: course.course_mapping_id,
						course_id: course.course_id,
						course_code: course.course_code,
						semester: getSemesterNumber(semCode),
						semester_code: semCode,
					})
				}
			}

			// Build delete IDs from diff.toDelete
			const deleteIds = diff.toDelete.map(d => d.offeringId)

			const res = await fetch('/api/course-management/course-offering/bulk-create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: institutionsId,
					institution_code: institutionCode,
					examination_session_id: examSessionId,
					session_code: sessionCode,
					program_id: programId,
					program_code: programCode,
					items,
					delete_ids: deleteIds,
				}),
			})

			const result = await res.json()

			if (!res.ok) {
				toast({ title: 'Failed to save', description: result.error || 'Unknown error', variant: 'destructive' })
				return
			}

			toast({
				title: 'Changes saved',
				description: result.message,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			router.push('/course-management/course-offering')
		} catch (e) {
			console.error('Save error:', e)
			toast({ title: 'Failed to save', description: 'An unexpected error occurred', variant: 'destructive' })
		} finally {
			setSubmitting(false)
		}
	}

	const showInstitutionField = mustSelectInstitution || !shouldFilter || !contextInstitutionId

	// ── Dropdown options ──
	const institutionOptions = institutions.map(i => ({ value: i.id, label: i.institution_name }))
	const examSessionOptions = examSessions.map(s => ({ value: s.id, label: s.session_name }))
	const programOptions = programs.map(p => ({ value: p.id, label: `${p.program_code} - ${p.program_name}` }))
	const regulationOptions = regulations.map(r => ({ value: r, label: r }))

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col h-screen overflow-hidden">
				<AppHeader>
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink href="/course-management/course-offering">Course Management</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink href="/course-management/course-offering">Course Offerings</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Add / Update</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex-1 overflow-auto p-3">
					<Card className="max-w-5xl mx-auto">
						<CardHeader className="p-4 pb-3 border-b">
							<div className="flex items-center gap-2">
								<Button variant="ghost" size="sm" onClick={() => router.push('/course-management/course-offering')} className="h-7 w-7 p-0">
									<ArrowLeft className="h-4 w-4" />
								</Button>
								<div>
									<h1 className="text-base font-semibold">Add / Update Course Offerings</h1>
									<p className="text-xs text-muted-foreground">Select courses to offer for an examination session</p>
								</div>
							</div>
						</CardHeader>

						<CardContent className="p-4 space-y-4">
							{/* ── Configuration + Semester in one row ── */}
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
								{showInstitutionField && (
									<div className="space-y-1.5">
										<Label className="text-xs font-semibold">Institution <span className="text-red-500">*</span></Label>
										<SearchableSelect
											value={institutionsId}
											onValueChange={handleInstitutionChange}
											options={institutionOptions}
											placeholder="Select institution"
											searchPlaceholder="Search institution..."
										/>
									</div>
								)}

								<div className="space-y-1.5">
									<Label className="text-xs font-semibold">Examination Session <span className="text-red-500">*</span></Label>
									<SearchableSelect
										value={examSessionId}
										onValueChange={handleExamSessionChange}
										options={examSessionOptions}
										placeholder="Select session"
										disabled={!institutionsId}
										searchPlaceholder="Search session..."
									/>
								</div>

								<div className="space-y-1.5">
									<Label className="text-xs font-semibold">Program <span className="text-red-500">*</span></Label>
									<SearchableSelect
										value={programId}
										onValueChange={handleProgramChange}
										options={programOptions}
										placeholder="Select program"
										disabled={!institutionsId}
										searchPlaceholder="Search program..."
									/>
								</div>

								<div className="space-y-1.5">
									<Label className="text-xs font-semibold">Regulation <span className="text-red-500">*</span></Label>
									<SearchableSelect
										value={regulationCode}
										onValueChange={setRegulationCode}
										options={regulationOptions}
										placeholder={loadingRegulations ? 'Loading...' : 'Select regulation'}
										disabled={!programCode || loadingRegulations}
										searchPlaceholder="Search regulation..."
									/>
								</div>

								{semesters.length > 0 && (
									<div className="space-y-1.5">
										<Label className="text-xs font-semibold">Semester <span className="text-red-500">*</span></Label>
										<SemesterMultiSelect
											semesters={semesters}
											selected={selectedSemesters}
											onToggle={handleSemesterToggle}
											onSelectAll={handleSelectAllSemesters}
											onClear={handleClearSemesters}
										/>
									</div>
								)}
							</div>

							{/* Semester badges */}
							{selectedSemesters.size > 0 && (
								<div className="flex flex-wrap gap-1.5">
									{[...selectedSemesters].sort((a, b) => getSemesterNumber(a) - getSemesterNumber(b)).map(sem => (
										<Badge key={sem} variant="secondary" className="gap-1 text-xs">
											{getSemesterLabel(sem)}
											<button
												type="button"
												title="Remove semester"
												onClick={() => handleSemesterToggle(sem, false)}
												className="ml-0.5 hover:text-destructive"
											>
												<X className="h-3 w-3" />
											</button>
										</Badge>
									))}
								</div>
							)}

							{loadingSemesters && (
								<div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
									<Loader2 className="h-4 w-4 animate-spin" /> Loading semesters...
								</div>
							)}

							{/* ── Select Courses ── */}
							{selectedSemesters.size > 0 && (
								<div className="space-y-3">
									<div className="flex items-center justify-between pb-1.5 border-b">
										<div>
											<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Courses</h3>
											<p className="text-xs text-muted-foreground mt-0.5">
												{totalSelected} of {Object.values(coursesBySemester).reduce((sum, c) => sum + c.length, 0)} selected
											</p>
										</div>
										<div className="flex gap-2 text-xs">
											<button
												type="button"
												onClick={() => {
													for (const sem of selectedSemesters) {
														const courses = coursesBySemester[sem] || []
														handleSelectAllCourses(sem, true)
													}
												}}
												className="text-primary hover:underline"
											>
												Select All
											</button>
											<span className="text-muted-foreground">|</span>
											<button
												type="button"
												onClick={() => {
													for (const sem of selectedSemesters) {
														handleSelectAllCourses(sem, false)
													}
												}}
												className="text-primary hover:underline"
											>
												Clear
											</button>
										</div>
									</div>

									{[...selectedSemesters].sort((a, b) => getSemesterNumber(a) - getSemesterNumber(b)).map(semCode => {
										const courses = coursesBySemester[semCode] || []
										const selected = selectedCourses[semCode] || new Set()
										const isExpanded = expandedSemesters.has(semCode)
										const isLoading = loadingCourses[semCode]
										const allSelected = courses.length > 0 && selected.size === courses.length

										return (
											<div key={semCode} className="border rounded-lg overflow-hidden">
												{/* Accordion Header — uses div, not button */}
												<div
													className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors cursor-pointer select-none"
													onClick={() => toggleAccordion(semCode)}
												>
													<div className="flex items-center gap-2">
														{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
														<Badge variant="outline" className="font-semibold">{getSemesterLabel(semCode)}</Badge>
														<span className="text-xs text-muted-foreground">
															{isLoading ? '...' : `${courses.length} courses`}
														</span>
													</div>
													{!isLoading && courses.length > 0 && (
														<div onClick={e => e.stopPropagation()}>
															<label className="flex items-center gap-2 text-xs cursor-pointer">
																<Checkbox
																	checked={allSelected}
																	onCheckedChange={(checked) => handleSelectAllCourses(semCode, !!checked)}
																/>
																<span className="text-muted-foreground">Select Sem {toRoman(getSemesterNumber(semCode))}</span>
															</label>
														</div>
													)}
												</div>

												{/* Accordion Body — 2-column grid */}
												{isExpanded && (
													<div className="px-3 py-2">
														{isLoading ? (
															<div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
																<Loader2 className="h-4 w-4 animate-spin" /> Loading courses...
															</div>
														) : courses.length === 0 ? (
															<p className="text-sm text-muted-foreground py-2">No courses mapped for this semester</p>
														) : (
															<div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5">
																{courses.map(course => {
																	const isExisting = !!(initialChecked[semCode]?.has(course.course_mapping_id))
																	return (
																		<label
																			key={course.course_mapping_id}
																			className={cn(
																				"flex items-start gap-2 py-1.5 px-2 rounded cursor-pointer",
																				isExisting
																					? "bg-green-50/50 dark:bg-green-950/20 hover:bg-green-50 dark:hover:bg-green-950/30"
																					: "hover:bg-slate-50 dark:hover:bg-slate-900/30"
																			)}
																		>
																			<Checkbox
																				checked={selected.has(course.course_mapping_id)}
																				onCheckedChange={(checked) => handleCourseToggle(semCode, course.course_mapping_id, !!checked)}
																				className="mt-0.5"
																			/>
																			<div className="min-w-0">
																				<span className="text-xs font-mono text-muted-foreground">{course.course_code}</span>
																				<span className="text-sm ml-2 break-words">{course.course_name}</span>
																			</div>
																		</label>
																	)
																})}
															</div>
														)}
													</div>
												)}
											</div>
										)
									})}
								</div>
							)}

							{/* ── Empty state ── */}
							{regulationCode && !loadingSemesters && semesters.length === 0 && (
								<div className="text-center py-8 text-muted-foreground">
									<BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
									<p className="text-sm">No semesters found in course mapping for this combination</p>
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				{/* ── Sticky Footer ── */}
				{selectedSemesters.size > 0 && (
					<div className="border-t bg-background px-3 py-2">
						<div className="max-w-5xl mx-auto flex items-center justify-between">
							<div className="text-sm text-muted-foreground space-y-0.5">
								<p>
									<span className="font-semibold text-foreground">{totalSelected}</span> course{totalSelected !== 1 ? 's' : ''} selected across{' '}
									<span className="font-semibold text-foreground">{selectedSemesterCount}</span> semester{selectedSemesterCount !== 1 ? 's' : ''}
								</p>
								{hasChanges && (
									<p className="text-xs">
										{diff.toInsert.length > 0 && <span className="text-green-600">+{diff.toInsert.length} new</span>}
										{diff.toInsert.length > 0 && diff.toDelete.length > 0 && <span className="mx-1">·</span>}
										{diff.toDelete.length > 0 && <span className="text-red-600">-{diff.toDelete.length} remove</span>}
										{diff.unchanged > 0 && <span className="ml-1">· {diff.unchanged} unchanged</span>}
									</p>
								)}
							</div>
							<Button onClick={handleSaveClick} disabled={submitting || !hasChanges} className="min-w-[160px]">
								{submitting ? (
									<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
								) : diff.toDelete.length > 0 && diff.toInsert.length > 0 ? (
									'Update Offerings'
								) : diff.toDelete.length > 0 ? (
									`Remove ${diff.toDelete.length} Offering${diff.toDelete.length !== 1 ? 's' : ''}`
								) : (
									`Add ${diff.toInsert.length} Offering${diff.toInsert.length !== 1 ? 's' : ''}`
								)}
							</Button>
						</div>
					</div>
				)}

				<AppFooter />

				{/* ── Confirm Dialog ── */}
				<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Confirm Changes</AlertDialogTitle>
							<AlertDialogDescription asChild>
								<div className="space-y-2 text-sm">
									{diff.toInsert.length > 0 && (
										<p className="text-green-700 dark:text-green-400">+ {diff.toInsert.length} offering{diff.toInsert.length !== 1 ? 's' : ''} will be created</p>
									)}
									{diff.toDelete.length > 0 && (
										<p className="text-red-700 dark:text-red-400">- {diff.toDelete.length} offering{diff.toDelete.length !== 1 ? 's' : ''} will be removed</p>
									)}
									{diff.unchanged > 0 && (
										<p className="text-muted-foreground">= {diff.unchanged} offering{diff.unchanged !== 1 ? 's' : ''} unchanged</p>
									)}
								</div>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={handleConfirmSave}>Confirm</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</SidebarInset>
		</SidebarProvider>
	)
}
