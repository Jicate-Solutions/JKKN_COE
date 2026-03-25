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
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/common/use-toast'
import Link from 'next/link'
import { ArrowLeft, Users, Loader2, Save, RefreshCw, LayoutList, ChevronsUpDown, Check, Search, ClipboardCheck } from 'lucide-react'
import { useInstitution, type Institution } from '@/context/institution-context'
import { cn } from '@/lib/utils'

interface Program {
	program_code: string
	program_name: string
	program_order?: number
}

interface CourseOffering {
	id: string
	course_code: string
	course_title?: string
	course_mapping_id?: string
	semester: number
	semester_code?: string
	program_code: string
}

interface Learner {
	id: string
	stu_register_no: string
	student_name: string
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
					className="h-9 w-full justify-between rounded-lg border-slate-300 font-normal text-sm hover:border-blue-400 px-3"
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
					<CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} className="h-9 text-sm" />
					<CommandList className="max-h-56 overflow-y-auto">
						{filtered.length === 0
							? <CommandEmpty className="py-4 text-sm text-center text-slate-400">No results found</CommandEmpty>
							: filtered.map(opt => (
								<CommandItem key={opt.value} value={opt.value}
									onSelect={() => { onValueChange(opt.value === value ? '' : opt.value); setOpen(false); setSearch('') }}
									className="text-sm cursor-pointer"
								>
									<Check className={cn('mr-2 h-4 w-4 shrink-0', value === opt.value ? 'opacity-100' : 'opacity-0')} />
									{opt.label}
								</CommandItem>
							))
						}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

function parseSemesterNumber(semCode: string): number {
	const semMatch = semCode.match(/Sem(\d+)/i)
	if (semMatch) return parseInt(semMatch[1])
	const dashMatch = semCode.match(/-(\d+)$/)
	if (dashMatch) return parseInt(dashMatch[1])
	const numMatch = semCode.match(/(\d+)$/)
	if (numMatch) return parseInt(numMatch[1])
	return 0
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

export default function ProgramWiseExamRegistrationPage() {
	const { toast } = useToast()

	const {
		institutionCode: contextInstitutionCode,
		institutionId: contextInstitutionId,
		isReady: institutionContextReady,
		mustSelectInstitution,
	} = useInstitutionFilter()

	const { availableInstitutions, selectedInstitution, selectInstitution, currentMyJKKNInstitutionIds } = useInstitution()

	const institutionsId = institutionContextReady && !mustSelectInstitution ? (contextInstitutionId ?? '') : (selectedInstitution?.id ?? '')
	const institutionCode = institutionContextReady && !mustSelectInstitution ? (contextInstitutionCode ?? '') : (selectedInstitution?.institution_code ?? '')

	// Derive myjkkn_institution_ids directly from context (no API call)
	const myjkknInstitutionIds: string[] = useMemo(() => {
		if (mustSelectInstitution) return selectedInstitution?.myjkkn_institution_ids || []
		return currentMyJKKNInstitutionIds || []
	}, [mustSelectInstitution, selectedInstitution, currentMyJKKNInstitutionIds])

	// Filters
	const [sessionId, setSessionId] = useState('')
	const [sessionCode, setSessionCode] = useState('')
	const [programCode, setProgramCode] = useState('')
	const [semester, setSemester] = useState('')
	const [courseOfferingId, setCourseOfferingId] = useState('')
	const [courseCode, setCourseCode] = useState('')

	// Data
	const [programs, setPrograms] = useState<Program[]>([])
	const [courseOfferings, setCourseOfferings] = useState<CourseOffering[]>([])
	const [learners, setLearners] = useState<Learner[]>([])
	const [alreadyRegistered, setAlreadyRegistered] = useState<Set<string>>(new Set())

	// Selection
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [searchText, setSearchText] = useState('')

	// Data
	const [semesters, setSemesters] = useState<{ value: string; label: string }[]>([])

	// Loading
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingSemesters, setLoadingSemesters] = useState(false)
	const [loadingOfferings, setLoadingOfferings] = useState(false)
	const [loadingLearners, setLoadingLearners] = useState(false)
	const [saving, setSaving] = useState(false)

	const { sessions, loading: loadingSessions } = useExamSessions({ institutionsId: institutionsId || null })

	// Reset on institution change
	useEffect(() => {
		setSessionId(''); setSessionCode(''); setProgramCode(''); setSemester('')
		setSemesters([]); setCourseOfferingId(''); setCourseCode(''); setLearners([]); setSelected(new Set())
	}, [institutionsId])

	// Load programs from cache
	useEffect(() => {
		if (!institutionCode || !sessionId) return
		setLoadingPrograms(true)
		setProgramCode(''); setSemester(''); setCourseOfferingId(''); setCourseCode('')
		setLearners([]); setSelected(new Set())

		Promise.all([
			fetch(`/api/course-management/course-mapping?institution_code=${institutionCode}&is_active=true`).then(r => r.json()),
			fetch(`/api/master/programs-cache?institution_code=${institutionCode}`).then(r => r.json()),
		])
			.then(([mappingData, cacheData]) => {
				const mappings: any[] = Array.isArray(mappingData) ? mappingData : []
				const cached: { program_code: string; program_name: string; program_order: number }[] = Array.isArray(cacheData) ? cacheData : []
				const nameMap = new Map(cached.map(p => [p.program_code, { name: p.program_name, order: p.program_order }]))
				const seen = new Set<string>()
				const distinct: Program[] = []
				mappings.forEach(m => {
					if (m.program_code && !seen.has(m.program_code)) {
						seen.add(m.program_code)
						const c = nameMap.get(m.program_code)
						distinct.push({ program_code: m.program_code, program_name: c?.name || m.program_code, program_order: c?.order ?? 999 })
					}
				})
				distinct.sort((a, b) => (a.program_order - b.program_order) || a.program_code.localeCompare(b.program_code))
				setPrograms(distinct)
			})
			.catch(() => setPrograms([]))
			.finally(() => setLoadingPrograms(false))
	}, [institutionCode, sessionId])

	// Load semesters from course mapping when program selected
	useEffect(() => {
		if (!institutionCode || !programCode) { setSemesters([]); setSemester(''); return }
		setLoadingSemesters(true)
		setSemester(''); setCourseOfferingId(''); setCourseCode('')
		setLearners([]); setSelected(new Set())

		fetch(`/api/course-management/course-mapping?institution_code=${institutionCode}&program_code=${encodeURIComponent(programCode)}&is_active=true`)
			.then(r => r.json())
			.then((data: any[]) => {
				const arr: any[] = Array.isArray(data) ? data : []
				const semMap = new Map<number, string>()
				arr.forEach(m => {
					const code: string = m.semester_code || ''
					const num = parseSemesterNumber(code)
					if (num > 0 && !semMap.has(num)) semMap.set(num, code)
				})
				const sorted = [...semMap.entries()].sort((a, b) => a[0] - b[0])
				setSemesters(sorted.map(([num]) => ({
					value: String(num),
					label: `Semester ${ROMAN[num] || num}`,
				})))
			})
			.catch(() => setSemesters([]))
			.finally(() => setLoadingSemesters(false))
	}, [institutionCode, programCode])

	// Load course offerings when program + semester selected
	useEffect(() => {
		if (!institutionCode || !sessionId || !programCode || !semester) return
		setLoadingOfferings(true)
		setCourseOfferingId(''); setCourseCode('')
		setLearners([]); setSelected(new Set())

		const params = new URLSearchParams({
			institution_code: institutionCode,
			examination_session_id: sessionId,
			program_code: programCode,
			semester: semester,
		})
		fetch(`/api/course-management/course-offering?${params}`)
			.then(r => r.json())
			.then(data => {
				const arr: any[] = Array.isArray(data) ? data : (data?.data || [])
				setCourseOfferings(arr.map(o => ({
					id: o.id,
					course_code: o.course_code || '',
					course_title: o.course_title || o.course_name || '',
					course_mapping_id: o.course_mapping_id,
					semester: o.semester || parseInt(semester),
					semester_code: o.semester_code,
					program_code: o.program_code,
				})))
			})
			.catch(() => setCourseOfferings([]))
			.finally(() => setLoadingOfferings(false))
	}, [institutionCode, sessionId, programCode, semester])

	// Load learners from MyJKKN learner-profiles API (institution → program → semester)
	// Note: MyJKKN /api-management/students does not exist; correct endpoint is learner-profiles.
	// Server-side program/semester filtering is unreliable, so we fetch all and filter client-side.
	const loadLearners = useCallback(async () => {
		if (!institutionsId || !programCode || !semester || !courseOfferingId) return
		setLoadingLearners(true)
		setLearners([]); setSelected(new Set())

		try {
			const myjkknIds = myjkknInstitutionIds

			if (myjkknIds.length === 0) {
				toast({ title: '⚠️ No MyJKKN Link', description: 'Institution not linked to MyJKKN', variant: 'destructive' })
				return
			}

			const allLearners: Learner[] = []
			const seenIds = new Set<string>()
			const targetSemester = parseInt(semester, 10)

			for (const myjkknInstId of myjkknIds) {
				// Use fetchAll=true so the server paginates through all records server-side.
				// Filter client-side by program_code and current_semester since MyJKKN
				// server-side filtering is unreliable for these params.
				const params = new URLSearchParams({
					institution_id: myjkknInstId,
					fetchAll: 'true',
				})
				const res = await fetch(`/api/myjkkn/learner-profiles?${params}`)
				if (!res.ok) continue
				const raw = await res.json()
				const list: any[] = raw?.data || raw || []

				list.forEach((s: any) => {
					const id = s.id
					if (!id || seenIds.has(id)) return
					// Client-side filter: only include learners matching program and semester
					if (s.program_code !== programCode) return
					if (s.current_semester !== targetSemester) return
					seenIds.add(id)
					allLearners.push({
						id,
						stu_register_no: s.register_number || s.roll_number || '',
						student_name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.name || '',
					})
				})
			}

			// Sort by register number
			allLearners.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no))
			setLearners(allLearners)

			// Fetch existing registrations for this course offering
			const regRes = await fetch(`/api/exam-management/exam-registrations?course_offering_id=${courseOfferingId}`)
			const regRaw = await regRes.json()
			const regs: any[] = Array.isArray(regRaw) ? regRaw : (regRaw?.data || [])
			const regKeys = new Set<string>(regs.map((r: any) => r.student_id || r.stu_register_no).filter(Boolean))
			setAlreadyRegistered(regKeys)
		} catch (err) {
			console.error('[ProgramWise Reg] Error loading learners:', err)
			toast({ title: '❌ Load Failed', description: 'Failed to load learners', variant: 'destructive' })
		} finally {
			setLoadingLearners(false)
		}
	}, [institutionsId, myjkknInstitutionIds, programCode, semester, courseOfferingId, toast])

	// Only trigger learner load when courseOfferingId is explicitly set
	// Using courseOfferingId directly avoids stale-closure race where programCode/semester
	// changes recreate loadLearners before the reset effects clear courseOfferingId
	useEffect(() => {
		if (!courseOfferingId) {
			setLearners([])
			setSelected(new Set())
			return
		}
		loadLearners()
	}, [courseOfferingId]) // eslint-disable-line react-hooks/exhaustive-deps

	// Filter learners by search
	const filteredLearners = useMemo(() => {
		if (!searchText.trim()) return learners
		const lower = searchText.toLowerCase()
		return learners.filter(l =>
			l.stu_register_no.toLowerCase().includes(lower) ||
			l.student_name.toLowerCase().includes(lower)
		)
	}, [learners, searchText])

	const isAlreadyRegistered = (l: Learner) =>
		alreadyRegistered.has(l.id) || alreadyRegistered.has(l.stu_register_no)

	// Selection
	const toggleLearner = (id: string) => {
		setSelected(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	const eligibleFiltered = filteredLearners.filter(l => !isAlreadyRegistered(l))
	const allChecked = eligibleFiltered.length > 0 && eligibleFiltered.every(l => selected.has(l.id))
	const indeterminate = !allChecked && eligibleFiltered.some(l => selected.has(l.id))

	const toggleAll = () => {
		setSelected(prev => {
			const next = new Set(prev)
			if (allChecked) eligibleFiltered.forEach(l => next.delete(l.id))
			else eligibleFiltered.forEach(l => next.add(l.id))
			return next
		})
	}

	// Save
	const handleSave = async () => {
		if (selected.size === 0) {
			toast({ title: '⚠️ Nothing selected', description: 'Select at least one learner', variant: 'destructive' })
			return
		}
		if (!courseOfferingId) {
			toast({ title: '⚠️ No course selected', description: 'Select a course offering first', variant: 'destructive' })
			return
		}

		setSaving(true)
		let successCount = 0; let skipCount = 0; let failCount = 0

		const selectedLearners = learners.filter(l => selected.has(l.id))

		for (const learner of selectedLearners) {
			try {
				const payload = {
					institutions_id: institutionsId,
					institution_code: institutionCode,
					student_id: learner.id,
					stu_register_no: learner.stu_register_no,
					student_name: learner.student_name,
					examination_session_id: sessionId,
					session_code: sessionCode,
					course_offering_id: courseOfferingId,
					course_code: courseCode,
					program_code: programCode,
					registration_status: 'Pending',
					is_regular: true,
					attempt_number: 1,
					fee_paid: false,
				}
				const res = await fetch('/api/exam-management/exam-registrations', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})
				if (res.status === 400 || res.status === 409) {
					const err = await res.json()
					if (err?.error?.toLowerCase().includes('duplicate')) skipCount++
					else failCount++
				} else if (!res.ok) {
					failCount++
				} else {
					successCount++
				}
			} catch {
				failCount++
			}
		}

		setSaving(false)
		const parts: string[] = []
		if (successCount) parts.push(`${successCount} registered`)
		if (skipCount) parts.push(`${skipCount} already registered (skipped)`)
		if (failCount) parts.push(`${failCount} failed`)

		if (failCount === 0) {
			toast({ title: '✅ Registrations Saved', description: parts.join(', '), className: 'bg-green-50 border-green-200 text-green-800' })
		} else {
			toast({ title: '⚠️ Partially Saved', description: parts.join(', '), variant: 'destructive' })
		}

		await loadLearners()
		setSelected(new Set())
	}

	// Stats
	const totalLearners = learners.length
	const alreadyCount = learners.filter(l => isAlreadyRegistered(l)).length
	const availableCount = totalLearners - alreadyCount

	const programOptions = useMemo(() =>
		programs.map(p => ({ value: p.program_code, label: `${p.program_code} - ${p.program_name}` })),
		[programs]
	)

	const courseOptions = useMemo(() =>
		courseOfferings.map(o => ({
			value: o.id,
			label: o.course_code ? (o.course_title ? `${o.course_code} - ${o.course_title}` : o.course_code) : o.id,
		})),
		[courseOfferings]
	)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0">

						{/* Breadcrumb */}
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem><BreadcrumbLink asChild><Link href="/dashboard">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem><BreadcrumbLink asChild><Link href="/exam-management/exam-registrations">Exam Registrations</Link></BreadcrumbLink></BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem><BreadcrumbPage>Program Wise</BreadcrumbPage></BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						{/* Stats */}
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
							<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{totalLearners}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Learners</p>
										</div>
										<Users className="h-5 w-5 text-emerald-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{alreadyCount}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Already Registered</p>
										</div>
										<ClipboardCheck className="h-5 w-5 text-amber-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight text-green-600 dark:text-green-400">{availableCount}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Available</p>
										</div>
										<Users className="h-5 w-5 text-green-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">{selected.size}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Selected</p>
										</div>
										<Check className="h-5 w-5 text-blue-500/40" />
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Filters */}
						<Card>
							<CardHeader className="px-4 py-3 border-b">
								<div className="flex items-center justify-between">
									<div>
										<h2 className="text-base font-semibold">Program Wise Registration</h2>
										<p className="text-xs text-muted-foreground">Select filters to load learners, then register them for a course</p>
									</div>
									<Link href="/exam-management/exam-registrations">
										<Button variant="outline" size="sm" className="h-8 text-sm px-3 gap-1.5">
											<ArrowLeft className="h-3.5 w-3.5" />Back
										</Button>
									</Link>
								</div>
							</CardHeader>
							<CardContent className="p-4">
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">

									{/* Institution */}
									{mustSelectInstitution && (
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">Institution</Label>
											<Select
												value={selectedInstitution?.id || ''}
												onValueChange={val => {
													const inst = availableInstitutions.find((i: Institution) => i.id === val)
													selectInstitution(inst || null)
												}}
											>
												<SelectTrigger className="h-8 text-sm">
													<SelectValue placeholder="Select institution" />
												</SelectTrigger>
												<SelectContent>
													{availableInstitutions.filter((i: Institution) => i.id !== 'all').map((inst: Institution) => (
														<SelectItem key={inst.id} value={inst.id}>{inst.institution_name}</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}

									{/* Exam Session */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Exam Session</Label>
										<Select
											value={sessionId}
											onValueChange={val => {
												const s = sessions.find(s => s.id === val)
												setSessionId(val); setSessionCode(s?.session_code || '')
											}}
											disabled={!institutionsId || loadingSessions}
										>
											<SelectTrigger className="h-8 text-sm">
												{loadingSessions ? <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading...</span> : <SelectValue placeholder="Select session" />}
											</SelectTrigger>
											<SelectContent>
												{sessions.map(s => <SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>)}
											</SelectContent>
										</Select>
									</div>

									{/* Program */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Program</Label>
										<SearchableSelect
											value={programCode}
											onValueChange={setProgramCode}
											placeholder="Select program"
											searchPlaceholder="Search program..."
											options={programOptions}
											disabled={!sessionId}
											loading={loadingPrograms}
										/>
									</div>

									{/* Semester */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Semester</Label>
										<Select value={semester} onValueChange={setSemester} disabled={!programCode || loadingSemesters}>
											<SelectTrigger className="h-8 text-sm">
												{loadingSemesters
													? <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading...</span>
													: <SelectValue placeholder="Select semester" />
												}
											</SelectTrigger>
											<SelectContent>
												{semesters.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
											</SelectContent>
										</Select>
									</div>

									{/* Course */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Course</Label>
										<SearchableSelect
											value={courseOfferingId}
											onValueChange={val => {
												setCourseOfferingId(val)
												const offering = courseOfferings.find(o => o.id === val)
												setCourseCode(offering?.course_code || '')
											}}
											placeholder="Select course"
											searchPlaceholder="Search course..."
											options={courseOptions}
											disabled={!semester}
											loading={loadingOfferings}
										/>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Learner Table */}
						<TooltipProvider delayDuration={300}>
							<Card className="flex-1 flex flex-col min-h-0">
								<CardHeader className="px-4 py-3 border-b">
									<div className="flex items-center justify-between gap-3 flex-wrap">
										<div>
											<h2 className="text-base font-semibold">Learners</h2>
											<p className="text-xs text-muted-foreground">
												{loadingLearners ? 'Loading learners...' : learners.length === 0 ? 'Select all filters above' : `${totalLearners} learners loaded`}
											</p>
										</div>
										<div className="flex items-center gap-2 flex-wrap">
											{learners.length > 0 && (
												<div className="relative">
													<Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
													<Input
														value={searchText}
														onChange={e => setSearchText(e.target.value)}
														placeholder="Search learner..."
														className="pl-8 h-8 text-sm w-44"
													/>
												</div>
											)}
											{learners.length > 0 && (
												<Tooltip>
													<TooltipTrigger asChild>
														<Button variant="outline" size="sm" onClick={loadLearners} disabled={loadingLearners} className="h-8 w-8 p-0">
															<RefreshCw className={`h-3.5 w-3.5 ${loadingLearners ? 'animate-spin' : ''}`} />
														</Button>
													</TooltipTrigger>
													<TooltipContent>Refresh learners</TooltipContent>
												</Tooltip>
											)}
											<Button
												size="sm"
												onClick={handleSave}
												disabled={saving || selected.size === 0 || !courseOfferingId}
												className="h-8 text-sm px-4 gap-1.5 disabled:opacity-50"
											>
												{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
												Register {selected.size > 0 ? `(${selected.size})` : ''}
											</Button>
										</div>
									</div>
								</CardHeader>

								{loadingLearners ? (
									<div className="flex flex-col items-center gap-2 text-muted-foreground py-20">
										<RefreshCw className="h-5 w-5 animate-spin" />
										<span className="text-sm">Loading learners from MyJKKN...</span>
									</div>
								) : learners.length === 0 ? (
									<div className="flex flex-col items-center gap-2 text-muted-foreground py-20">
										<Users className="h-8 w-8 opacity-20" />
										<span className="text-sm">Select all filters above to load learners</span>
									</div>
								) : (
									<div className="overflow-x-auto">
										<table className="w-full text-sm">
											<thead>
												<tr className="bg-muted/50">
													<th className="px-5 py-3 text-left w-10">
														<Checkbox
															checked={allChecked}
															// @ts-ignore
															data-state={indeterminate ? 'indeterminate' : allChecked ? 'checked' : 'unchecked'}
															onCheckedChange={toggleAll}
															className="border-slate-400"
														/>
													</th>
													<th className="px-3 py-3 text-center text-xs font-semibold w-12">#</th>
													<th className="px-3 py-3 text-left text-xs font-semibold w-40">Register No</th>
													<th className="px-3 py-3 text-left text-xs font-semibold">Name</th>
													<th className="px-4 py-3 text-center text-xs font-semibold w-36">Status</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-50">
												{filteredLearners.map((learner, idx) => {
													const registered = isAlreadyRegistered(learner)
													const isChecked = selected.has(learner.id)
													return (
														<tr
															key={learner.id}
															onClick={() => !registered && toggleLearner(learner.id)}
															className={cn(
																'transition-colors cursor-pointer',
																registered ? 'opacity-55 bg-slate-50/40 cursor-not-allowed'
																	: isChecked ? 'bg-blue-50 hover:bg-blue-50/80'
																		: 'hover:bg-slate-50/60'
															)}
														>
															<td className="px-5 py-2.5" onClick={e => e.stopPropagation()}>
																<Checkbox
																	checked={isChecked && !registered}
																	onCheckedChange={() => !registered && toggleLearner(learner.id)}
																	disabled={registered}
																	className="border-slate-300"
																/>
															</td>
															<td className="px-3 py-2.5 text-center text-xs tabular-nums">{idx + 1}</td>
															<td className="px-3 py-2.5">
																<span className="text-sm font-medium font-mono">
																	{learner.stu_register_no || '—'}
																</span>
															</td>
															<td className="px-3 py-2.5 text-sm">{learner.student_name || '—'}</td>
															<td className="px-4 py-2.5 text-center">
																{registered ? (
																	<Badge className="text-xs bg-amber-100 text-amber-700 border border-amber-200 font-normal">
																		Already Registered
																	</Badge>
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
									</div>
								)}
							</Card>
						</TooltipProvider>

					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
