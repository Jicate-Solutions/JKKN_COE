'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useExamSessions } from '@/hooks/use-exam-sessions'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/common/use-toast'
import Link from 'next/link'
import { ArrowLeft, BookOpen, CheckSquare, Loader2, Save, RefreshCw, LayoutList, ChevronsUpDown, Check, ChevronRight, Trash2 } from 'lucide-react'
import { useInstitution, type Institution } from '@/context/institution-context'
import { cn } from '@/lib/utils'

interface Program {
	program_code: string
	program_name: string
	program_order?: number
}

interface Regulation {
	regulation_code: string
}

interface CourseMapping {
	id: string
	course_id: string
	course_code: string
	course_title: string
	semester_code: string
	regulation_code: string
	program_code: string
	institution_code: string
	course_group?: string
	course_order?: number
	internal_max_mark?: number | null
	external_max_mark?: number | null
	total_max_mark?: number | null
}

interface SemesterGroup {
	semester_code: string
	semester_label: string
	semester_number: number
	courses: CourseMapping[]
}

function parseSemesterNumber(semCode: string): number {
	// Sem1, Sem2 ...
	const semMatch = semCode.match(/Sem(\d+)/i)
	if (semMatch) return parseInt(semMatch[1])
	// CODE-1, CODE-2, UEN-1 ...
	const dashMatch = semCode.match(/-(\d+)$/)
	if (dashMatch) return parseInt(dashMatch[1])
	// any trailing number
	const numMatch = semCode.match(/(\d+)$/)
	if (numMatch) return parseInt(numMatch[1])
	return 0
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

// Each semester gets a distinct color — accordion header bg + table header bg + text
const SEMESTER_COLORS = [
	{ header: 'bg-blue-50 border-blue-200',      tableHead: 'bg-blue-50/60',    text: 'text-blue-800',    badge: 'border-blue-200 text-blue-600' },
	{ header: 'bg-emerald-50 border-emerald-200', tableHead: 'bg-emerald-50/60', text: 'text-emerald-800', badge: 'border-emerald-200 text-emerald-600' },
	{ header: 'bg-violet-50 border-violet-200',   tableHead: 'bg-violet-50/60',  text: 'text-violet-800',  badge: 'border-violet-200 text-violet-600' },
	{ header: 'bg-amber-50 border-amber-200',     tableHead: 'bg-amber-50/60',   text: 'text-amber-800',   badge: 'border-amber-200 text-amber-600' },
	{ header: 'bg-teal-50 border-teal-200',       tableHead: 'bg-teal-50/60',    text: 'text-teal-800',    badge: 'border-teal-200 text-teal-600' },
	{ header: 'bg-rose-50 border-rose-200',       tableHead: 'bg-rose-50/60',    text: 'text-rose-800',    badge: 'border-rose-200 text-rose-600' },
	{ header: 'bg-indigo-50 border-indigo-200',   tableHead: 'bg-indigo-50/60',  text: 'text-indigo-800',  badge: 'border-indigo-200 text-indigo-600' },
	{ header: 'bg-cyan-50 border-cyan-200',       tableHead: 'bg-cyan-50/60',    text: 'text-cyan-800',    badge: 'border-cyan-200 text-cyan-600' },
]

function formatSemesterLabel(semCode: string): string {
	const num = parseSemesterNumber(semCode)
	if (num === 0) return 'Semester'
	const roman = ROMAN[num] || String(num)
	return `Semester ${roman}`
}

// Searchable combobox
interface SearchableSelectProps {
	value: string
	onValueChange: (val: string) => void
	placeholder: string
	searchPlaceholder: string
	options: { value: string; label: string }[]
	disabled?: boolean
	loading?: boolean
}

function SearchableSelect({ value, onValueChange, placeholder, searchPlaceholder, options, disabled, loading }: SearchableSelectProps) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')

	const filtered = useMemo(() => {
		if (!search.trim()) return options
		const lower = search.toLowerCase()
		return options.filter(o => o.label.toLowerCase().includes(lower))
	}, [options, search])

	const selectedLabel = options.find(o => o.value === value)?.label

	return (
		<Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch('') }}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled || loading}
					className="h-9 w-full justify-between rounded-lg border-slate-300 font-normal text-sm hover:border-blue-400 focus:border-blue-500 px-3"
				>
					{loading ? (
						<span className="flex items-center gap-2 text-slate-400"><Loader2 className="h-3 w-3 animate-spin" />Loading...</span>
					) : (
						<span className={cn('truncate', !selectedLabel && 'text-slate-400')}>{selectedLabel || placeholder}</span>
					)}
					<ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400 ml-1" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[220px]" align="start">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={searchPlaceholder}
						value={search}
						onValueChange={setSearch}
						className="h-9 text-sm"
					/>
					<CommandList className="max-h-56 overflow-y-auto">
						{filtered.length === 0 ? (
							<CommandEmpty className="py-4 text-sm text-center text-slate-400">No results found</CommandEmpty>
						) : (
							filtered.map(opt => (
								<CommandItem
									key={opt.value}
									value={opt.value}
									onSelect={() => {
										onValueChange(opt.value === value ? '' : opt.value)
										setOpen(false)
										setSearch('')
									}}
									className="text-sm cursor-pointer"
								>
									<Check className={cn('mr-2 h-4 w-4 shrink-0', value === opt.value ? 'opacity-100' : 'opacity-0')} />
									{opt.label}
								</CommandItem>
							))
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

export default function ProgramWiseCourseOfferingPage() {
	const { toast } = useToast()

	const {
		institutionCode: contextInstitutionCode,
		institutionId: contextInstitutionId,
		isReady: institutionContextReady,
		mustSelectInstitution,
	} = useInstitutionFilter()

	const { availableInstitutions, selectedInstitution, selectInstitution } = useInstitution()

	const institutionsId = institutionContextReady && !mustSelectInstitution ? (contextInstitutionId ?? '') : (selectedInstitution?.id ?? '')
	const institutionCode = institutionContextReady && !mustSelectInstitution ? (contextInstitutionCode ?? '') : (selectedInstitution?.institution_code ?? '')

	// Selected filters
	const [sessionId, setSessionId] = useState('')
	const [sessionCode, setSessionCode] = useState('')
	const [programCode, setProgramCode] = useState('')
	const [regulationCode, setRegulationCode] = useState('')

	// Dropdown data
	const [programs, setPrograms] = useState<Program[]>([])
	const [regulations, setRegulations] = useState<Regulation[]>([])

	// Course data
	const [semesterGroups, setSemesterGroups] = useState<SemesterGroup[]>([])
	// Maps course_mapping_id → offering_id (for delete)
	const [offeringIdMap, setOfferingIdMap] = useState<Map<string, string>>(new Map())
	// Keys set for O(1) "already offered" checks
	const existingOfferingKeys = useMemo(() => new Set(offeringIdMap.keys()), [offeringIdMap])
	// IDs currently being removed
	const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())

	// Selection state — keyed by course_mapping.id
	const [selected, setSelected] = useState<Set<string>>(new Set())

	// Accordion — all semesters expanded by default
	const [expandedSemesters, setExpandedSemesters] = useState<Set<string>>(new Set())

	const toggleSemesterExpand = (semCode: string) => {
		setExpandedSemesters(prev => {
			const next = new Set(prev)
			if (next.has(semCode)) next.delete(semCode)
			else next.add(semCode)
			return next
		})
	}

	// Loading
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingRegulations, setLoadingRegulations] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [saving, setSaving] = useState(false)

	// ── Exam Sessions ─────────────────────────────────────────────────────────
	const { sessions, loading: loadingSessions } = useExamSessions({
		institutionsId: institutionsId || null,
	})

	// ── Reset on institution change ───────────────────────────────────────────
	useEffect(() => {
		setSessionId('')
		setSessionCode('')
		setProgramCode('')
		setRegulationCode('')
		setSemesterGroups([])
		setOfferingIdMap(new Map())
		setSelected(new Set())
	}, [institutionsId])

	// ── Load Programs: distinct codes from course_mapping + names from cache ──
	useEffect(() => {
		if (!institutionCode || !sessionId) return
		setLoadingPrograms(true)
		setProgramCode('')
		setRegulationCode('')
		setSemesterGroups([])
		setOfferingIdMap(new Map())
		setSelected(new Set())

		Promise.all([
			fetch(`/api/course-management/course-mapping?institution_code=${institutionCode}&is_active=true`).then(r => r.json()),
			fetch(`/api/master/programs-cache?institution_code=${institutionCode}`).then(r => r.json()),
		])
			.then(([mappingData, cacheData]) => {
				const mappings: any[] = Array.isArray(mappingData) ? mappingData : []
				const cached: { program_code: string; program_name: string; program_order: number }[] = Array.isArray(cacheData) ? cacheData : []

				// Build name lookup from cache
				const nameMap = new Map(cached.map(p => [p.program_code, { name: p.program_name, order: p.program_order }]))

				// Distinct program codes from mappings
				const seen = new Set<string>()
				const distinct: Program[] = []
				mappings.forEach(m => {
					if (m.program_code && !seen.has(m.program_code)) {
						seen.add(m.program_code)
						const cached = nameMap.get(m.program_code)
						distinct.push({
							program_code: m.program_code,
							program_name: cached?.name || m.program_code,
							program_order: cached?.order ?? 999,
						})
					}
				})

				// Sort by program_order then code
				distinct.sort((a, b) => (a.program_order - b.program_order) || a.program_code.localeCompare(b.program_code))
				setPrograms(distinct)
			})
			.catch(() => setPrograms([]))
			.finally(() => setLoadingPrograms(false))
	}, [institutionCode, sessionId])

	// ── Load Regulations ──────────────────────────────────────────────────────
	useEffect(() => {
		if (!institutionCode || !programCode) return
		setLoadingRegulations(true)
		setRegulationCode('')
		setSemesterGroups([])
		setSelected(new Set())

		fetch(`/api/course-management/course-mapping?institution_code=${institutionCode}&program_code=${programCode}&is_active=true`)
			.then(r => r.json())
			.then(data => {
				const arr: any[] = Array.isArray(data) ? data : []
				const seen = new Set<string>()
				const distinct: Regulation[] = []
				arr.forEach(m => {
					if (m.regulation_code && !seen.has(m.regulation_code)) {
						seen.add(m.regulation_code)
						distinct.push({ regulation_code: m.regulation_code })
					}
				})
				distinct.sort((a, b) => a.regulation_code.localeCompare(b.regulation_code))
				setRegulations(distinct)
			})
			.catch(() => setRegulations([]))
			.finally(() => setLoadingRegulations(false))
	}, [institutionCode, programCode])

	// ── Load Course Mappings ──────────────────────────────────────────────────
	const loadCourses = useCallback(async () => {
		if (!institutionCode || !programCode || !regulationCode || !sessionId) return
		setLoadingCourses(true)
		setSemesterGroups([])
		setSelected(new Set())

		try {
			const params = new URLSearchParams({
				institution_code: institutionCode,
				program_code: programCode,
				regulation_code: regulationCode,
				is_active: 'true',
			})
			const res = await fetch(`/api/course-management/course-mapping?${params}`)
			const raw = await res.json()

			// API returns: { id, course_id, ..., courses: { course_code, course_title, ... } }
			const mappings: CourseMapping[] = (Array.isArray(raw) ? raw : []).map((m: any) => ({
				id: m.id,
				course_id: m.course_id,
				course_code: m.courses?.course_code || m.course_code || '',
				course_title: m.courses?.course_title || m.course_title || '',
				semester_code: m.semester_code || '',
				regulation_code: m.regulation_code || '',
				program_code: m.program_code || '',
				institution_code: m.institution_code || '',
				course_group: m.course_group || '',
				course_order: m.course_order,
				internal_max_mark: m.courses?.internal_max_mark ?? m.internal_max_mark ?? null,
				external_max_mark: m.courses?.external_max_mark ?? m.external_max_mark ?? null,
				total_max_mark: m.courses?.total_max_mark ?? m.total_max_mark ?? null,
			}))

			// Load existing offerings to detect duplicates
			// Use course_mapping_id to match against course_mapping.id
			const offeringParams = new URLSearchParams({
				institution_code: institutionCode,
				examination_session_id: sessionId,
			})
			const offeringRes = await fetch(`/api/course-management/course-offering?${offeringParams}`)
			const offeringRaw = await offeringRes.json()
			const existingOfferings: any[] = Array.isArray(offeringRaw) ? offeringRaw : (offeringRaw?.data || [])

			// Map course_mapping_id → offering_id for delete support
			const idMap = new Map<string, string>()
			existingOfferings.forEach((o: any) => {
				if (o.program_code === programCode && o.course_mapping_id) {
					idMap.set(o.course_mapping_id, o.id)
				}
			})
			setOfferingIdMap(idMap)

			// Group by semester
			const semMap = new Map<string, CourseMapping[]>()
			mappings.forEach(m => {
				const key = m.semester_code || 'Unknown'
				if (!semMap.has(key)) semMap.set(key, [])
				semMap.get(key)!.push(m)
			})

			const groups: SemesterGroup[] = Array.from(semMap.entries())
				.map(([semCode, courses]) => ({
					semester_code: semCode,
					semester_label: formatSemesterLabel(semCode),
					semester_number: parseSemesterNumber(semCode),
					// Sort courses by course_order asc; null/0 goes last
					courses: [...courses].sort((a, b) => {
						const oa = (a.course_order != null && a.course_order > 0) ? a.course_order : 99999
						const ob = (b.course_order != null && b.course_order > 0) ? b.course_order : 99999
						return oa - ob
					}),
				}))
				// Sort semesters by number asc; unknown (0) goes last
				.sort((a, b) => {
					if (a.semester_number === 0 && b.semester_number !== 0) return 1
					if (b.semester_number === 0 && a.semester_number !== 0) return -1
					return a.semester_number - b.semester_number
				})

			setSemesterGroups(groups)
			// Default: all collapsed
			setExpandedSemesters(new Set())
		} catch (err) {
			console.error('[ProgramWise] Error loading courses:', err)
			toast({ title: '❌ Load Failed', description: 'Failed to load course mappings', variant: 'destructive' })
		} finally {
			setLoadingCourses(false)
		}
	}, [institutionCode, programCode, regulationCode, sessionId, toast])

	useEffect(() => {
		loadCourses()
	}, [loadCourses])

	// ── Selection Handlers ────────────────────────────────────────────────────
	const toggleCourse = (id: string) => {
		setSelected(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	const toggleSemester = (group: SemesterGroup, allChecked: boolean) => {
		setSelected(prev => {
			const next = new Set(prev)
			group.courses.forEach(c => {
				if (existingOfferingKeys.has(c.id)) return
				if (allChecked) next.delete(c.id)
				else next.add(c.id)
			})
			return next
		})
	}

	const isSemesterAllChecked = (group: SemesterGroup): boolean => {
		const eligible = group.courses.filter(c => !existingOfferingKeys.has(c.id))
		return eligible.length > 0 && eligible.every(c => selected.has(c.id))
	}

	const isSemesterIndeterminate = (group: SemesterGroup): boolean => {
		const eligible = group.courses.filter(c => !existingOfferingKeys.has(c.id))
		const checked = eligible.filter(c => selected.has(c.id))
		return checked.length > 0 && checked.length < eligible.length
	}

	// ── Dropdown options ───────────────────────────────────────────────────────
	const programOptions = useMemo(() =>
		programs.map(p => ({
			value: p.program_code,
			label: `${p.program_code} - ${p.program_name}`,
		})),
		[programs]
	)

	const regulationOptions = useMemo(() =>
		regulations.map(r => ({
			value: r.regulation_code,
			label: r.regulation_code,
		})),
		[regulations]
	)

	// ── Save ──────────────────────────────────────────────────────────────────
	const handleSave = async () => {
		if (selected.size === 0) {
			toast({ title: '⚠️ Nothing selected', description: 'Please select at least one course to offer', variant: 'destructive' })
			return
		}

		setSaving(true)
		let successCount = 0
		let skipCount = 0
		let failCount = 0

		const selectedMappings: CourseMapping[] = []
		semesterGroups.forEach(group => {
			group.courses.forEach(c => {
				if (selected.has(c.id)) selectedMappings.push(c)
			})
		})

		for (const mapping of selectedMappings) {
			try {
				const payload = {
					institution_code: institutionCode,
					session_code: sessionCode,
					program_code: programCode,
					course_code: mapping.course_code,
					semester_code: mapping.semester_code,
					semester: parseSemesterNumber(mapping.semester_code) || 1,
					section: null,
					faculty_id: null,
					max_enrollment: null,
					enrolled_count: 0,
					is_active: true,
				}

				const res = await fetch('/api/course-management/course-offering', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})

				if (res.status === 409) skipCount++
				else if (!res.ok) failCount++
				else successCount++
			} catch {
				failCount++
			}
		}

		setSaving(false)

		const parts: string[] = []
		if (successCount > 0) parts.push(`${successCount} added`)
		if (skipCount > 0) parts.push(`${skipCount} already existed (skipped)`)
		if (failCount > 0) parts.push(`${failCount} failed`)

		if (failCount === 0) {
			toast({
				title: '✅ Course Offerings Saved',
				description: parts.join(', '),
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} else {
			toast({ title: '⚠️ Partially Saved', description: parts.join(', '), variant: 'destructive' })
		}

		await loadCourses()
		setSelected(new Set())
	}

	// ── Remove Offering ───────────────────────────────────────────────────────
	const handleRemoveOffering = async (courseMappingId: string) => {
		const offeringId = offeringIdMap.get(courseMappingId)
		if (!offeringId) return

		setRemovingIds(prev => new Set(prev).add(courseMappingId))
		try {
			const res = await fetch(`/api/course-management/course-offering?id=${offeringId}`, { method: 'DELETE' })
			if (!res.ok) throw new Error('Delete failed')
			// Remove from map immediately — table updates instantly
			setOfferingIdMap(prev => {
				const next = new Map(prev)
				next.delete(courseMappingId)
				return next
			})
		} catch {
			toast({ title: '❌ Remove Failed', description: 'Could not remove the course offering', variant: 'destructive' })
		} finally {
			setRemovingIds(prev => {
				const next = new Set(prev)
				next.delete(courseMappingId)
				return next
			})
		}
	}

	// ── Stats ──────────────────────────────────────────────────────────────────
	const totalCourses = semesterGroups.reduce((s, g) => s + g.courses.length, 0)
	const alreadyOffered = semesterGroups.reduce((s, g) => s + g.courses.filter(c => existingOfferingKeys.has(c.id)).length, 0)
	const available = totalCourses - alreadyOffered

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">

						{/* Breadcrumb */}
						<div className="flex items-center gap-2">
							<Breadcrumb>
								<BreadcrumbList>
									<BreadcrumbItem>
										<BreadcrumbLink asChild><Link href="/dashboard">Dashboard</Link></BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbLink asChild><Link href="/course-management/course-offering">Course Offers</Link></BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage>Program Wise</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</div>

						{/* Stats */}
						<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
							<Card className="border-slate-200 shadow-sm rounded-2xl">
								<CardContent className="p-4">
									<p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Total</p>
									<p className="text-3xl font-bold text-slate-900 mt-0.5 font-grotesk">{totalCourses}</p>
								</CardContent>
							</Card>
							<Card className="border-amber-100 shadow-sm rounded-2xl">
								<CardContent className="p-4">
									<p className="text-xs text-amber-600 uppercase tracking-wide font-medium">Already Offered</p>
									<p className="text-3xl font-bold text-amber-600 mt-0.5 font-grotesk">{alreadyOffered}</p>
								</CardContent>
							</Card>
							<Card className="border-emerald-100 shadow-sm rounded-2xl">
								<CardContent className="p-4">
									<p className="text-xs text-emerald-600 uppercase tracking-wide font-medium">Available</p>
									<p className="text-3xl font-bold text-emerald-600 mt-0.5 font-grotesk">{available}</p>
								</CardContent>
							</Card>
							<Card className="border-blue-100 shadow-sm rounded-2xl">
								<CardContent className="p-4">
									<p className="text-xs text-blue-600 uppercase tracking-wide font-medium">Selected</p>
									<p className="text-3xl font-bold text-blue-600 mt-0.5 font-grotesk">{selected.size}</p>
								</CardContent>
							</Card>
						</div>

						{/* Filter Card */}
						<Card className="border-slate-200 shadow-sm rounded-2xl">
							<CardHeader className="px-6 py-4 border-b border-slate-100">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center ring-1 ring-blue-100">
											<LayoutList className="h-4 w-4 text-blue-600" />
										</div>
										<div>
											<h2 className="text-base font-bold text-slate-900 font-grotesk">Program Wise Course Offering</h2>
											<p className="text-xs text-slate-500">Select filters to load courses, then check and save</p>
										</div>
									</div>
									<Link href="/course-management/course-offering">
										<Button variant="outline" size="sm" className="h-8 px-3 rounded-lg border-slate-300 gap-1.5 text-xs">
											<ArrowLeft className="h-3.5 w-3.5" />
											Back
										</Button>
									</Link>
								</div>
							</CardHeader>
							<CardContent className="p-5">
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

									{/* Institution — super_admin only */}
									{mustSelectInstitution && (
										<div className="space-y-1.5">
											<Label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Institution</Label>
											<Select
												value={selectedInstitution?.id || ''}
												onValueChange={val => {
													const inst = availableInstitutions.find((i: Institution) => i.id === val)
													selectInstitution(inst || null)
												}}
											>
												<SelectTrigger className="h-9 rounded-lg border-slate-300 text-sm">
													<SelectValue placeholder="Select institution" />
												</SelectTrigger>
												<SelectContent>
													{availableInstitutions.filter((i: Institution) => i.id !== 'all').map((inst: Institution) => (
														<SelectItem key={inst.id} value={inst.id}>
															{inst.institution_name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}

									{/* Exam Session */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Exam Session</Label>
										<Select
											value={sessionId}
											onValueChange={val => {
												const s = sessions.find(s => s.id === val)
												setSessionId(val)
												setSessionCode(s?.session_code || '')
											}}
											disabled={!institutionsId || loadingSessions}
										>
											<SelectTrigger className="h-9 rounded-lg border-slate-300 text-sm">
												{loadingSessions
													? <span className="flex items-center gap-2 text-slate-400"><Loader2 className="h-3 w-3 animate-spin" />Loading...</span>
													: <SelectValue placeholder="Select session" />
												}
											</SelectTrigger>
											<SelectContent>
												{sessions.map(s => (
													<SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Program */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Program</Label>
										<SearchableSelect
											value={programCode}
											onValueChange={val => setProgramCode(val)}
											placeholder="Select program"
											searchPlaceholder="Search program..."
											options={programOptions}
											disabled={!sessionId}
											loading={loadingPrograms}
										/>
									</div>

									{/* Regulation */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Regulation</Label>
										<SearchableSelect
											value={regulationCode}
											onValueChange={setRegulationCode}
											placeholder="Select regulation"
											searchPlaceholder="Search regulation..."
											options={regulationOptions}
											disabled={!programCode}
											loading={loadingRegulations}
										/>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Course Table Card */}
						<Card className="flex-1 border-slate-200 shadow-sm rounded-2xl overflow-hidden">
							<CardHeader className="px-6 py-4 border-b border-slate-100">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center ring-1 ring-emerald-100">
											<BookOpen className="h-4 w-4 text-emerald-600" />
										</div>
										<div>
											<h2 className="text-base font-bold text-slate-900 font-grotesk">Courses by Semester</h2>
											<p className="text-xs text-slate-500">
												{loadingCourses
													? 'Loading courses...'
													: semesterGroups.length === 0
														? 'Select all filters above to load courses'
														: `${totalCourses} courses across ${semesterGroups.length} semesters`}
											</p>
										</div>
									</div>
									<div className="flex items-center gap-2">
										{semesterGroups.length > 0 && (
											<Button variant="outline" size="sm" onClick={loadCourses} disabled={loadingCourses} className="h-8 w-8 p-0 rounded-lg border-slate-300">
												<RefreshCw className={`h-3.5 w-3.5 ${loadingCourses ? 'animate-spin' : ''}`} />
											</Button>
										)}
										<Button
											size="sm"
											onClick={handleSave}
											disabled={saving || selected.size === 0}
											className="h-8 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs shadow-sm disabled:opacity-50"
										>
											{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
											Save {selected.size > 0 ? `(${selected.size})` : ''}
										</Button>
									</div>
								</div>
							</CardHeader>

							{loadingCourses ? (
								<div className="flex items-center justify-center py-20 text-slate-400">
									<Loader2 className="h-8 w-8 animate-spin mr-3" />
									<span className="text-sm">Loading courses...</span>
								</div>
							) : semesterGroups.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
									<BookOpen className="h-12 w-12 opacity-25" />
									<p className="text-sm">Select institution, session, program and regulation to view courses</p>
								</div>
							) : (
								<div className="divide-y divide-slate-100">
									{semesterGroups.map((group, groupIdx) => {
										const allChecked = isSemesterAllChecked(group)
										const indeterminate = isSemesterIndeterminate(group)
										const eligibleCount = group.courses.filter(c => !existingOfferingKeys.has(c.id)).length
										const isExpanded = expandedSemesters.has(group.semester_code)
										const offeredCount = group.courses.length - eligibleCount
										const color = SEMESTER_COLORS[groupIdx % SEMESTER_COLORS.length]
										let rowIndex = 0

										return (
											<div key={group.semester_code}>
												{/* Semester accordion header */}
												<div
													className={cn('flex items-center gap-3 px-5 py-3 cursor-pointer select-none border-b transition-colors hover:brightness-95', color.header)}
													onClick={() => toggleSemesterExpand(group.semester_code)}
												>
													<ChevronRight className={cn('h-4 w-4 transition-transform duration-200 shrink-0', color.text, isExpanded && 'rotate-90')} />
													<div
														className="shrink-0"
														onClick={e => e.stopPropagation()}
													>
														<Checkbox
															checked={allChecked}
															// @ts-ignore
															data-state={indeterminate ? 'indeterminate' : allChecked ? 'checked' : 'unchecked'}
															onCheckedChange={() => toggleSemester(group, allChecked)}
															disabled={eligibleCount === 0}
															className="border-slate-400"
														/>
													</div>
													<span className={cn('text-sm font-bold font-grotesk flex-1', color.text)}>{group.semester_label}</span>
													<div className="flex items-center gap-2">
														<Badge variant="outline" className={cn('text-xs font-normal', color.badge)}>
															{group.courses.length} courses
														</Badge>
														{offeredCount > 0 && (
															<Badge className="text-xs bg-amber-100 text-amber-700 border border-amber-200 font-normal">
																{offeredCount} already offered
															</Badge>
														)}
													</div>
												</div>

												{/* Course table — visible when expanded */}
												{isExpanded && (
													<table className="w-full text-sm">
														<thead>
															<tr className={cn('border-b border-slate-100', color.tableHead)}>
																<th className="w-10 px-5 py-2" />
																<th className="w-10 px-2 py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">#</th>
																<th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-32">Code</th>
																<th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Course Name</th>
																<th className="px-4 py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide w-36">Status</th>
															</tr>
														</thead>
														<tbody className="divide-y divide-slate-50">
															{group.courses.map(course => {
																const isOffered = existingOfferingKeys.has(course.id)
																const isChecked = selected.has(course.id)
																rowIndex++
																return (
																	<tr
																		key={course.id}
																		onClick={() => !isOffered && toggleCourse(course.id)}
																		className={cn(
																			'transition-colors cursor-pointer',
																			isOffered
																				? 'opacity-55 cursor-not-allowed bg-slate-50/40'
																				: isChecked
																					? 'bg-blue-50 hover:bg-blue-50/80'
																					: 'hover:bg-slate-50/60'
																		)}
																	>
																		<td className="px-5 py-2.5" onClick={e => e.stopPropagation()}>
																			<Checkbox
																				checked={isChecked && !isOffered}
																				onCheckedChange={() => !isOffered && toggleCourse(course.id)}
																				disabled={isOffered}
																				className="border-slate-300"
																			/>
																		</td>
																		<td className="px-2 py-2.5 text-center text-xs text-slate-400 tabular-nums">{rowIndex}</td>
																		<td className="px-3 py-2.5">
																			<span className="font-mono text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
																				{course.course_code || '—'}
																			</span>
																		</td>
																		<td className="px-3 py-2.5">
																			<span className="text-sm text-slate-800">
																				{course.course_title || course.course_code || '—'}
																			</span>
																		</td>
																		<td className="px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
																			{isOffered ? (
																				<div className="flex items-center justify-center gap-1.5">
																					<Badge className="text-xs bg-amber-100 text-amber-700 border border-amber-200 gap-1 font-normal">
																						<CheckSquare className="h-3 w-3" />
																						Already Offered
																					</Badge>
																					<button
																						onClick={() => handleRemoveOffering(course.id)}
																						disabled={removingIds.has(course.id)}
																						className="h-6 w-6 flex items-center justify-center rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
																						title="Remove offering"
																					>
																						{removingIds.has(course.id)
																							? <Loader2 className="h-3 w-3 animate-spin" />
																							: <Trash2 className="h-3 w-3" />
																						}
																					</button>
																				</div>
																			) : isChecked ? (
																				<Badge className="text-xs bg-blue-100 text-blue-700 border border-blue-200 font-normal">
																					Selected
																				</Badge>
																			) : (
																				<span className="text-xs text-slate-300">—</span>
																			)}
																		</td>
																	</tr>
																)
															})}
														</tbody>
													</table>
												)}
											</div>
										)
									})}
								</div>
							)}
						</Card>

					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
