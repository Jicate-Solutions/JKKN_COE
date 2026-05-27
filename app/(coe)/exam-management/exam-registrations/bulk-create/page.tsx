'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution, type Institution } from '@/context/institution-context'
import { useSessionSync } from '@/hooks/use-session-sync'
import { useExamSessions } from '@/hooks/use-exam-sessions'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { ArrowLeft, BookOpen, Check, ChevronsUpDown, ClipboardCheck, Loader2, Save, Search, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

interface ProgramOption { program_code: string; program_name: string; program_order?: number }
interface CourseRow { course_offering_id: string; course_mapping_id: string; course_code: string; course_name: string; semester: number; semester_code: string }
interface LearnerRow { id: string; stu_register_no: string; student_name: string }

function parseSemesterNumber(semCode: string): number {
	const m = semCode.match(/(\d+)/)
	return m ? parseInt(m[1], 10) : 0
}

// ── Searchable single-select ──
function SearchableSelect({
	value, onValueChange, placeholder, options, disabled, loading, searchPlaceholder,
}: {
	value: string
	onValueChange: (v: string) => void
	placeholder: string
	options: { value: string; label: string }[]
	disabled?: boolean
	loading?: boolean
	searchPlaceholder?: string
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')
	const filtered = useMemo(() => {
		if (!search.trim()) return options
		const q = search.toLowerCase()
		return options.filter(o => o.label.toLowerCase().includes(q))
	}, [options, search])
	const selected = options.find(o => o.value === value)

	return (
		<Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch('') }}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled || loading}
					className="h-9 w-full justify-between rounded-md font-normal text-sm px-3"
				>
					{loading ? (
						<span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading...</span>
					) : (
						<span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected?.label || placeholder}</span>
					)}
					<ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-1" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[220px]" align="start">
				<Command shouldFilter={false}>
					<CommandInput placeholder={searchPlaceholder || 'Search...'} value={search} onValueChange={setSearch} className="h-9 text-sm" />
					<CommandList className="max-h-60 overflow-y-auto">
						{filtered.length === 0
							? <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">No results found</CommandEmpty>
							: filtered.map(opt => (
								<CommandItem
									key={opt.value}
									value={opt.value}
									onSelect={() => { onValueChange(opt.value); setOpen(false); setSearch('') }}
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

export default function BulkCreateExamRegistrationPage() {
	const router = useRouter()
	const { toast } = useToast()

	const {
		institutionCode: contextInstitutionCode,
		institutionId: contextInstitutionId,
		isReady: institutionContextReady,
		mustSelectInstitution,
	} = useInstitutionFilter()

	const { availableInstitutions, selectedInstitution, selectInstitution, currentMyJKKNInstitutionIds } = useInstitution()

	const institutionsId = institutionContextReady && !mustSelectInstitution
		? (contextInstitutionId ?? '')
		: (selectedInstitution?.id ?? '')
	const institutionCode = institutionContextReady && !mustSelectInstitution
		? (contextInstitutionCode ?? '')
		: (selectedInstitution?.institution_code ?? '')

	const myjkknInstitutionIds: string[] = useMemo(() => {
		if (mustSelectInstitution) return selectedInstitution?.myjkkn_institution_ids || []
		return currentMyJKKNInstitutionIds || []
	}, [mustSelectInstitution, selectedInstitution, currentMyJKKNInstitutionIds])

	// Cascade state
	const { selectedSessionId: sessionId, setSelectedSessionId: setSessionId, mustSelectSession } = useSessionSync()
	const [sessionCode, setSessionCode] = useState('')
	const [programCode, setProgramCode] = useState('')
	const [regulationCode, setRegulationCode] = useState('')
	const [semesterCode, setSemesterCode] = useState('')
	const [semesterId, setSemesterId] = useState('')

	// Dropdown data
	const [programs, setPrograms] = useState<ProgramOption[]>([])
	const [regulations, setRegulations] = useState<string[]>([])
	const [semesters, setSemesters] = useState<{ value: string; id: string; label: string }[]>([])
	const [courses, setCourses] = useState<CourseRow[]>([])
	const [learners, setLearners] = useState<LearnerRow[]>([])
	const [registeredKeys, setRegisteredKeys] = useState<Set<string>>(new Set()) // `studentId|courseOfferingId`

	// Selection state
	const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set())
	const [selectedLearners, setSelectedLearners] = useState<Set<string>>(new Set())

	// Search
	const [courseSearch, setCourseSearch] = useState('')
	const [learnerSearch, setLearnerSearch] = useState('')

	// Loading
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingRegulations, setLoadingRegulations] = useState(false)
	const [loadingSemesters, setLoadingSemesters] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [loadingLearners, setLoadingLearners] = useState(false)
	const [loadingRegistered, setLoadingRegistered] = useState(false)
	const [saving, setSaving] = useState(false)
	const [confirmOpen, setConfirmOpen] = useState(false)

	const { sessions, loading: loadingSessions } = useExamSessions({ institutionsId: institutionsId || null })

	// ── Reset on institution change ──
	useEffect(() => {
		setSessionId('')
		setSessionCode('')
		setProgramCode('')
		setRegulationCode('')
		setSemesterCode('')
		setPrograms([])
		setRegulations([])
		setSemesters([])
		setCourses([])
		setLearners([])
		setSelectedCourses(new Set())
		setSelectedLearners(new Set())
		setRegisteredKeys(new Set())
	}, [institutionsId])

	// ── Load programs (institution + session) ──
	useEffect(() => {
		if (!institutionCode || !sessionId) {
			setPrograms([])
			return
		}
		setLoadingPrograms(true)
		setProgramCode('')
		setRegulationCode('')
		setSemesterCode('')
		setRegulations([])
		setSemesters([])
		setCourses([])
		setLearners([])
		setSelectedCourses(new Set())
		setSelectedLearners(new Set())

		Promise.all([
			fetch(`/api/course-management/course-mapping?institution_code=${institutionCode}&is_active=true`).then(r => r.json()),
			fetch(`/api/master/programs-cache?institution_code=${institutionCode}`).then(r => r.json()).catch(() => []),
		])
			.then(([mappingData, cacheData]) => {
				const mappings: any[] = Array.isArray(mappingData) ? mappingData : []
				const cached: { program_code: string; program_name: string; program_order: number }[] = Array.isArray(cacheData) ? cacheData : []
				const nameMap = new Map(cached.map(p => [p.program_code, { name: p.program_name, order: p.program_order }]))
				const seen = new Set<string>()
				const distinct: ProgramOption[] = []
				mappings.forEach(m => {
					if (m.program_code && !seen.has(m.program_code)) {
						seen.add(m.program_code)
						const c = nameMap.get(m.program_code)
						distinct.push({ program_code: m.program_code, program_name: c?.name || m.program_code, program_order: c?.order ?? 999 })
					}
				})
				distinct.sort((a, b) => (a.program_order! - b.program_order!) || a.program_code.localeCompare(b.program_code))
				setPrograms(distinct)
			})
			.catch(() => setPrograms([]))
			.finally(() => setLoadingPrograms(false))
	}, [institutionCode, sessionId])

	// ── Load regulations (institution + program) ──
	useEffect(() => {
		if (!institutionCode || !programCode) {
			setRegulations([])
			return
		}
		setLoadingRegulations(true)
		setRegulationCode('')
		setSemesterCode('')
		setSemesters([])
		setCourses([])
		setLearners([])
		setSelectedCourses(new Set())
		setSelectedLearners(new Set())

		fetch(`/api/course-management/course-offering/lookups?type=regulations&institution_code=${encodeURIComponent(institutionCode)}&program_code=${encodeURIComponent(programCode)}`)
			.then(r => r.json())
			.then(data => setRegulations(Array.isArray(data) ? data : []))
			.catch(() => setRegulations([]))
			.finally(() => setLoadingRegulations(false))
	}, [institutionCode, programCode])

	// ── Load semesters (institution + program + regulation) ──
	useEffect(() => {
		if (!institutionCode || !programCode || !regulationCode) {
			setSemesters([])
			return
		}
		setLoadingSemesters(true)
		setSemesterCode('')
		setCourses([])
		setLearners([])
		setSelectedCourses(new Set())
		setSelectedLearners(new Set())

		fetch(`/api/course-management/course-offering/lookups?type=semesters&institution_code=${encodeURIComponent(institutionCode)}&program_code=${encodeURIComponent(programCode)}&regulation_code=${encodeURIComponent(regulationCode)}`)
			.then(r => r.json())
			.then((data: any[]) => {
				const arr = Array.isArray(data) ? data : []
				setSemesters(arr.map(item => {
					const code = item.semester_code || item
					const num = parseSemesterNumber(code)
					return {
						value: code,
						id: item.semester_id || '',
						label: num > 0 ? `Semester ${ROMAN[num] || num}` : code
					}
				}))
			})
			.catch(() => setSemesters([]))
			.finally(() => setLoadingSemesters(false))
	}, [institutionCode, programCode, regulationCode])

	// ── Load courses for selected scope ──
	const loadCourses = useCallback(async () => {
		if (!institutionsId || !institutionCode || !sessionId || !programCode || !regulationCode || !semesterCode) {
			setCourses([])
			return
		}
		setLoadingCourses(true)
		setSelectedCourses(new Set())
		try {
			const params = new URLSearchParams({
				type: 'courses',
				institutions_id: institutionsId,
				institution_code: institutionCode,
				examination_session_id: sessionId,
				program_code: programCode,
				regulation_code: regulationCode,
				semester_code: semesterCode,
			})
			const res = await fetch(`/api/exam-management/exam-registrations/bulk-create/lookups?${params}`)
			const data = await res.json()
			setCourses(Array.isArray(data) ? data : [])
		} catch (e) {
			console.error('[bulk-create] load courses failed:', e)
			setCourses([])
		} finally {
			setLoadingCourses(false)
		}
	}, [institutionsId, institutionCode, sessionId, programCode, regulationCode, semesterCode])

	useEffect(() => { loadCourses() }, [loadCourses])

	// Track why learners got filtered out (for diagnostics in empty state)
	const [learnerFilterStats, setLearnerFilterStats] = useState({ total: 0, programMismatch: 0, semesterMismatch: 0 })

	// Helper: parse semester value (handles number, string code, raw semester_id)
	const getSemesterNum = useCallback((val: unknown): number => {
		if (val == null) return 0
		const n = Number(val)
		if (!isNaN(n) && n > 0) return n
		return parseSemesterNumber(String(val))
	}, [])

	// ── Load learners (program + semester) from MyJKKN ──
	const loadLearners = useCallback(async () => {
		if (!programCode || !semesterCode || myjkknInstitutionIds.length === 0) {
			setLearners([])
			setLearnerFilterStats({ total: 0, programMismatch: 0, semesterMismatch: 0 })
			return
		}
		setLoadingLearners(true)
		setSelectedLearners(new Set())
		try {
			const targetSemesterNum = parseSemesterNumber(semesterCode)
			const all: LearnerRow[] = []
			const seen = new Set<string>()
			let total = 0
			let programMismatch = 0
			let semesterMismatch = 0
			const sampleSemesterMismatches: Array<{ reg: string; raw: string; parsed: number }> = []

			for (const myjkknInstId of myjkknInstitutionIds) {
				// Pass program_code + current_semester (number) for filtering
				const params = new URLSearchParams({
					institution_id: myjkknInstId,
					fetchAll: 'true',
					program_code: programCode,
					current_semester: String(targetSemesterNum),
				})
				const res = await fetch(`/api/myjkkn/learner-profiles?${params}`)
				if (!res.ok) continue
				const raw = await res.json()
				const list: any[] = raw?.data || raw || []
				for (const s of list) {
					const id = s.id
					if (!id || seen.has(id)) continue
					total++
					const learnerProg = s.program_code || s.program_id
					if (learnerProg && learnerProg !== programCode) { programMismatch++; continue }
					// Filter by current_semester number (parse from learner data)
					const learnerSemNum = getSemesterNum(s.current_semester)
					if (learnerSemNum !== targetSemesterNum) {
						semesterMismatch++
						if (sampleSemesterMismatches.length < 5) {
							sampleSemesterMismatches.push({
								reg: s.register_number || s.roll_number || '?',
								raw: String(s.current_semester),
								parsed: targetSemesterNum,
							})
						}
						continue
					}
					seen.add(id)
					all.push({
						id,
						stu_register_no: s.register_number || s.roll_number || '',
						student_name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.name || '',
					})
				}
			}
			if (sampleSemesterMismatches.length > 0) {
				const details = sampleSemesterMismatches.map(s => `${s.reg}: raw="${s.raw}" → parsed=${s.parsed}`).join(', ')
				console.log(`[bulk-create] ${semesterMismatch} learners skipped (expected ${targetSemester}): ${details}`)
				console.log('[bulk-create] Full samples:', sampleSemesterMismatches)
			}
			all.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no))
			setLearners(all)
			setLearnerFilterStats({ total, programMismatch, semesterMismatch })
		} catch (e) {
			console.error('[bulk-create] load learners failed:', e)
			toast({ title: '❌ Load Failed', description: 'Failed to load learners from MyJKKN', variant: 'destructive' })
		} finally {
			setLoadingLearners(false)
		}
	}, [programCode, semesterCode, myjkknInstitutionIds, toast, getSemesterNum])

	useEffect(() => { loadLearners() }, [loadLearners])

	// ── Load existing registrations for the selected courses ──
	useEffect(() => {
		if (!institutionsId || !sessionId || courses.length === 0) {
			setRegisteredKeys(new Set())
			return
		}
		setLoadingRegistered(true)
		const ids = courses.map(c => c.course_offering_id).join(',')
		const params = new URLSearchParams({
			type: 'registered',
			institutions_id: institutionsId,
			institution_code: institutionCode,
			examination_session_id: sessionId,
			course_offering_ids: ids,
		})
		fetch(`/api/exam-management/exam-registrations/bulk-create/lookups?${params}`)
			.then(r => r.json())
			.then((data: any[]) => {
				const keys = new Set<string>()
				;(Array.isArray(data) ? data : []).forEach(r => {
					if (r.student_id && r.course_offering_id) keys.add(`${r.student_id}|${r.course_offering_id}`)
					if (r.stu_register_no && r.course_offering_id) keys.add(`reg:${r.stu_register_no}|${r.course_offering_id}`)
				})
				setRegisteredKeys(keys)
			})
			.catch(() => setRegisteredKeys(new Set()))
			.finally(() => setLoadingRegistered(false))
	}, [institutionsId, sessionId, courses])

	// ── Filtered lists ──
	const filteredCourses = useMemo(() => {
		if (!courseSearch.trim()) return courses
		const q = courseSearch.toLowerCase()
		return courses.filter(c =>
			c.course_code.toLowerCase().includes(q) ||
			c.course_name.toLowerCase().includes(q)
		)
	}, [courses, courseSearch])

	const filteredLearners = useMemo(() => {
		if (!learnerSearch.trim()) return learners
		const q = learnerSearch.toLowerCase()
		return learners.filter(l =>
			l.stu_register_no.toLowerCase().includes(q) ||
			l.student_name.toLowerCase().includes(q)
		)
	}, [learners, learnerSearch])

	// ── Course select-all ──
	const allCoursesChecked = filteredCourses.length > 0 && filteredCourses.every(c => selectedCourses.has(c.course_offering_id))
	const toggleAllCourses = () => {
		setSelectedCourses(prev => {
			const next = new Set(prev)
			if (allCoursesChecked) filteredCourses.forEach(c => next.delete(c.course_offering_id))
			else filteredCourses.forEach(c => next.add(c.course_offering_id))
			return next
		})
	}
	const toggleCourse = (id: string) => {
		setSelectedCourses(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id); else next.add(id)
			return next
		})
	}

	// ── Registered-state per learner (for the currently-selected courses) ──
	// count = how many of the selected courses this learner is already registered for
	const registeredCountByLearner = useMemo(() => {
		const map = new Map<string, number>()
		if (selectedCourses.size === 0) return map
		for (const l of learners) {
			let count = 0
			for (const cid of selectedCourses) {
				const sidKey = `${l.id}|${cid}`
				const regKey = `reg:${l.stu_register_no}|${cid}`
				if (registeredKeys.has(sidKey) || registeredKeys.has(regKey)) count++
			}
			if (count > 0) map.set(l.id, count)
		}
		return map
	}, [learners, selectedCourses, registeredKeys])

	const isLearnerFullyRegistered = useCallback(
		(id: string) => selectedCourses.size > 0 && registeredCountByLearner.get(id) === selectedCourses.size,
		[selectedCourses, registeredCountByLearner]
	)

	// ── Learner select-all (skips fully-registered learners) ──
	const selectableLearners = useMemo(
		() => filteredLearners.filter(l => !isLearnerFullyRegistered(l.id)),
		[filteredLearners, isLearnerFullyRegistered]
	)
	const allLearnersChecked = selectableLearners.length > 0 && selectableLearners.every(l => selectedLearners.has(l.id))
	const toggleAllLearners = () => {
		setSelectedLearners(prev => {
			const next = new Set(prev)
			if (allLearnersChecked) selectableLearners.forEach(l => next.delete(l.id))
			else selectableLearners.forEach(l => next.add(l.id))
			return next
		})
	}
	const toggleLearner = (id: string) => {
		if (isLearnerFullyRegistered(id)) return // can't unselect fully-registered
		setSelectedLearners(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id); else next.add(id)
			return next
		})
	}

	// ── Computed: pairs (cross-product), excluding already-registered ──
	const pairs = useMemo(() => {
		const result: Array<{ course_offering_id: string; student_id: string }> = []
		for (const cid of selectedCourses) {
			for (const lid of selectedLearners) {
				const learner = learners.find(l => l.id === lid)
				const sidKey = `${lid}|${cid}`
				const regKey = learner ? `reg:${learner.stu_register_no}|${cid}` : ''
				if (registeredKeys.has(sidKey) || (regKey && registeredKeys.has(regKey))) continue
				result.push({ course_offering_id: cid, student_id: lid })
			}
		}
		return result
	}, [selectedCourses, selectedLearners, learners, registeredKeys])

	const grossPairCount = selectedCourses.size * selectedLearners.size
	const skipCount = grossPairCount - pairs.length

	// ── Save ──
	const handleSaveClick = () => {
		if (!institutionsId || !sessionId || !programCode) {
			toast({ title: '⚠️ Missing scope', description: 'Select institution, session, and program first.', variant: 'destructive' })
			return
		}
		if (selectedCourses.size === 0) {
			toast({ title: '⚠️ No courses selected', description: 'Pick at least one course.', variant: 'destructive' })
			return
		}
		if (selectedLearners.size === 0) {
			toast({ title: '⚠️ No learners selected', description: 'Pick at least one learner.', variant: 'destructive' })
			return
		}
		if (pairs.length === 0) {
			toast({ title: '⚠️ Nothing to register', description: 'All selected pairs are already registered.', variant: 'destructive' })
			return
		}
		setConfirmOpen(true)
	}

	const handleConfirmSave = async () => {
		setConfirmOpen(false)
		setSaving(true)
		try {
			const selectedCourseRows = courses.filter(c => selectedCourses.has(c.course_offering_id))
			const selectedLearnerRows = learners.filter(l => selectedLearners.has(l.id))

			const payload = {
				institutions_id: institutionsId,
				institution_code: institutionCode,
				examination_session_id: sessionId,
				session_code: sessionCode,
				program_code: programCode,
				regulation_code: regulationCode,
				semester_code: semesterCode,
				courses: selectedCourseRows.map(c => ({
					course_offering_id: c.course_offering_id,
					course_code: c.course_code,
				})),
				learners: selectedLearnerRows.map(l => ({
					student_id: l.id,
					stu_register_no: l.stu_register_no,
					student_name: l.student_name,
				})),
				pairs,
			}

			const res = await fetch('/api/exam-management/exam-registrations/bulk-create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			const result = await res.json()

			if (!res.ok) {
				toast({ title: '❌ Save failed', description: result.error || 'Unknown error', variant: 'destructive' })
				return
			}

			const variant = result.failed > 0 ? 'destructive' : undefined
			toast({
				title: result.failed > 0 ? '⚠️ Partial Save' : '✅ Registrations Saved',
				description: result.message,
				...(variant ? { variant } : { className: 'bg-green-50 border-green-200 text-green-800' }),
			})

			setSelectedCourses(new Set())
			setSelectedLearners(new Set())
			// Refresh registered keys so the just-created rows are reflected
			const ids = courses.map(c => c.course_offering_id).join(',')
			if (ids) {
				const params = new URLSearchParams({
					type: 'registered',
					institutions_id: institutionsId,
					institution_code: institutionCode,
					examination_session_id: sessionId,
					course_offering_ids: ids,
				})
				fetch(`/api/exam-management/exam-registrations/bulk-create/lookups?${params}`)
					.then(r => r.json())
					.then((data: any[]) => {
						const keys = new Set<string>()
						;(Array.isArray(data) ? data : []).forEach(r => {
							if (r.student_id && r.course_offering_id) keys.add(`${r.student_id}|${r.course_offering_id}`)
							if (r.stu_register_no && r.course_offering_id) keys.add(`reg:${r.stu_register_no}|${r.course_offering_id}`)
						})
						setRegisteredKeys(keys)
					})
					.catch(() => {})
			}
		} catch (e) {
			console.error('[bulk-create] save failed:', e)
			toast({ title: '❌ Save failed', description: 'Unexpected error', variant: 'destructive' })
		} finally {
			setSaving(false)
		}
	}

	// ── Stats ──
	const totalLearners = learners.length
	const totalCourses = courses.length

	// Dropdown option data
	const programOptions = useMemo(() => programs.map(p => ({ value: p.program_code, label: `${p.program_code} - ${p.program_name}` })), [programs])
	const regulationOptions = useMemo(() => regulations.map(r => ({ value: r, label: r })), [regulations])

	const showInstitutionField = mustSelectInstitution

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0 pb-24">

						{/* Breadcrumb */}
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem><BreadcrumbLink asChild><Link href="/dashboard">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem><BreadcrumbLink asChild><Link href="/exam-management/exam-registrations">Exam Registrations</Link></BreadcrumbLink></BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem><BreadcrumbPage>Bulk Register</BreadcrumbPage></BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						{/* Stats */}
						<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
							<Card className="border-l-4 border-l-emerald-500">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{totalCourses}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Courses Available</p>
									</div>
									<BookOpen className="h-5 w-5 text-emerald-500/40" />
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-blue-500">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{totalLearners}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Learners Available</p>
									</div>
									<Users className="h-5 w-5 text-blue-500/40" />
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-purple-500">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400">{selectedCourses.size} × {selectedLearners.size}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Courses × Learners Selected</p>
									</div>
									<Check className="h-5 w-5 text-purple-500/40" />
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-amber-500">
								<CardContent className="p-4 flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{pairs.length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">
											New Registrations{skipCount > 0 ? ` (${skipCount} dup)` : ''}
										</p>
									</div>
									<ClipboardCheck className="h-5 w-5 text-amber-500/40" />
								</CardContent>
							</Card>
						</div>

						{/* Filters */}
						<Card>
							<CardHeader className="px-4 py-3 border-b">
								<div className="flex items-center justify-between">
									<div>
										<h2 className="text-base font-semibold">Bulk Exam Registration</h2>
										<p className="text-xs text-muted-foreground">Institution → Session → Program → Regulation → Semester → pick courses & learners</p>
									</div>
									<Link href="/exam-management/exam-registrations">
										<Button variant="outline" size="sm" className="h-8 text-sm px-3 gap-1.5">
											<ArrowLeft className="h-3.5 w-3.5" />Back
										</Button>
									</Link>
								</div>
							</CardHeader>
							<CardContent className="p-4">
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">

									{/* Institution */}
									{showInstitutionField && (
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">Institution <span className="text-red-500">*</span></Label>
											<Select
												value={selectedInstitution?.id || ''}
												onValueChange={val => {
													const inst = availableInstitutions.find((i: Institution) => i.id === val)
													selectInstitution(inst || null)
												}}
											>
												<SelectTrigger className="h-9 text-sm">
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

									{/* Session */}
									{mustSelectSession && (
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">Exam Session <span className="text-red-500">*</span></Label>
											<Select
												value={sessionId}
												onValueChange={val => {
													setSessionId(val)
													const s = sessions.find(s => s.id === val)
													setSessionCode(s?.session_code || '')
												}}
												disabled={!institutionsId || loadingSessions}
											>
												<SelectTrigger className="h-9 text-sm">
													{loadingSessions
														? <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading...</span>
														: <SelectValue placeholder="Select session" />
													}
												</SelectTrigger>
												<SelectContent>
													{sessions.map(s => <SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>)}
												</SelectContent>
											</Select>
										</div>
									)}

									{/* Program */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Program <span className="text-red-500">*</span></Label>
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

									{/* Regulation */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Regulation <span className="text-red-500">*</span></Label>
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

									{/* Semester */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Semester <span className="text-red-500">*</span></Label>
										<Select value={semesterCode} onValueChange={(code) => {
											setSemesterCode(code)
											const sem = semesters.find(s => s.value === code)
											setSemesterId(sem?.id || '')
										}} disabled={!regulationCode || loadingSemesters}>
											<SelectTrigger className="h-9 text-sm">
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
								</div>
							</CardContent>
						</Card>

						{/* Courses + Learners (side-by-side on lg+) */}
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

							{/* Courses */}
							<Card className="flex flex-col min-h-[420px]">
								<CardHeader className="px-4 py-3 border-b">
									<div className="flex items-center justify-between gap-3 flex-wrap">
										<div>
											<h3 className="text-sm font-semibold">Courses</h3>
											<p className="text-xs text-muted-foreground">
												{loadingCourses
													? 'Loading courses...'
													: courses.length === 0
														? 'Select all filters above to load courses'
														: `${filteredCourses.length} of ${courses.length} • ${selectedCourses.size} selected`}
											</p>
										</div>
										{courses.length > 0 && (
											<div className="relative">
												<Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
												<Input
													value={courseSearch}
													onChange={e => setCourseSearch(e.target.value)}
													placeholder="Search course..."
													className="pl-8 h-8 text-sm w-44"
												/>
											</div>
										)}
									</div>
								</CardHeader>
								<CardContent className="p-0 flex-1 overflow-y-auto">
									{loadingCourses ? (
										<div className="flex items-center justify-center h-full p-8 text-sm text-muted-foreground">
											<Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...
										</div>
									) : filteredCourses.length === 0 ? (
										<div className="flex flex-col items-center justify-center h-full p-8 text-sm text-muted-foreground">
											<BookOpen className="h-8 w-8 mb-2 opacity-40" />
											<p>{courses.length === 0 ? 'No courses to show' : 'No courses match search'}</p>
										</div>
									) : (
										<div>
											{/* Select All header */}
											<label className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/40 cursor-pointer text-xs font-medium sticky top-0">
												<Checkbox checked={allCoursesChecked} onCheckedChange={toggleAllCourses} />
												<span>Select all ({filteredCourses.length})</span>
											</label>
											<div>
												{filteredCourses.map(c => {
													const checked = selectedCourses.has(c.course_offering_id)
													return (
														<label
															key={c.course_offering_id}
															className={cn(
																'flex items-start gap-2 px-4 py-2 border-b cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30',
																checked && 'bg-blue-50/40 dark:bg-blue-950/20'
															)}
														>
															<Checkbox
																checked={checked}
																onCheckedChange={() => toggleCourse(c.course_offering_id)}
																className="mt-0.5"
															/>
															<div className="min-w-0 flex-1">
																<div className="flex items-center gap-2">
																	<span className="text-xs font-mono text-muted-foreground">{c.course_code}</span>
																	<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Sem {ROMAN[c.semester] || c.semester}</Badge>
																</div>
																<div className="text-sm break-words">{c.course_name}</div>
															</div>
														</label>
													)
												})}
											</div>
										</div>
									)}
								</CardContent>
							</Card>

							{/* Learners */}
							<Card className="flex flex-col min-h-[420px]">
								<CardHeader className="px-4 py-3 border-b">
									<div className="flex items-center justify-between gap-3 flex-wrap">
										<div>
											<h3 className="text-sm font-semibold">Learners</h3>
											<p className="text-xs text-muted-foreground">
												{loadingLearners
													? 'Loading learners...'
													: learners.length === 0
														? 'Select program & semester to load learners'
														: `${filteredLearners.length} of ${learners.length} • ${selectedLearners.size} selected`}
											</p>
										</div>
										{learners.length > 0 && (
											<div className="relative">
												<Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
												<Input
													value={learnerSearch}
													onChange={e => setLearnerSearch(e.target.value)}
													placeholder="Search learner..."
													className="pl-8 h-8 text-sm w-44"
												/>
											</div>
										)}
									</div>
								</CardHeader>
								<CardContent className="p-0 flex-1 overflow-y-auto">
									{loadingLearners ? (
										<div className="flex items-center justify-center h-full p-8 text-sm text-muted-foreground">
											<Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...
										</div>
									) : filteredLearners.length === 0 ? (
										<div className="flex flex-col items-center justify-center h-full p-8 text-sm text-muted-foreground text-center">
											<Users className="h-8 w-8 mb-2 opacity-40" />
											{learners.length === 0 ? (
												learnerFilterStats.total === 0 ? (
													<p>No learners to show</p>
												) : (
													<div className="space-y-1">
														<p>No learners match <span className="font-medium">{programCode}</span> · Semester {ROMAN[parseSemesterNumber(semesterCode)] || parseSemesterNumber(semesterCode)}</p>
														<p className="text-xs">
															Scanned {learnerFilterStats.total} learner{learnerFilterStats.total !== 1 ? 's' : ''} for this institution:
															{' '}<span className="text-amber-600">{learnerFilterStats.programMismatch} different program</span>,
															{' '}<span className="text-amber-600">{learnerFilterStats.semesterMismatch} different semester</span>
														</p>
													</div>
												)
											) : (
												<p>No learners match search</p>
											)}
										</div>
									) : (
										<div>
											<label className="flex items-center gap-2 px-4 py-2 border-b bg-slate-50 dark:bg-slate-900/40 cursor-pointer text-xs font-medium sticky top-0">
												<Checkbox checked={allLearnersChecked} onCheckedChange={toggleAllLearners} />
												<span>
													Select all ({selectableLearners.length})
													{filteredLearners.length > selectableLearners.length && (
														<span className="ml-2 text-muted-foreground font-normal">
															· {filteredLearners.length - selectableLearners.length} already registered
														</span>
													)}
												</span>
											</label>
											<div>
												{filteredLearners.map(l => {
													const fullyRegistered = isLearnerFullyRegistered(l.id)
													const regCount = registeredCountByLearner.get(l.id) || 0
													const checked = fullyRegistered || selectedLearners.has(l.id)
													return (
														<label
															key={l.id}
															className={cn(
																'flex items-center gap-2 px-4 py-2 border-b',
																fullyRegistered
																	? 'bg-amber-50/40 dark:bg-amber-950/20 cursor-not-allowed'
																	: 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30',
																!fullyRegistered && checked && 'bg-blue-50/40 dark:bg-blue-950/20'
															)}
														>
															<Checkbox
																checked={checked}
																disabled={fullyRegistered}
																onCheckedChange={() => toggleLearner(l.id)}
															/>
															<div className="min-w-0 flex-1">
																<div className="flex items-center gap-2">
																	<span className="text-xs font-mono text-muted-foreground">{l.stu_register_no}</span>
																	{fullyRegistered ? (
																		<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
																			Registered
																		</Badge>
																	) : regCount > 0 ? (
																		<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
																			{regCount}/{selectedCourses.size} registered
																		</Badge>
																	) : null}
																</div>
																<div className="text-sm truncate">{l.student_name}</div>
															</div>
														</label>
													)
												})}
											</div>
										</div>
									)}
								</CardContent>
							</Card>
						</div>

					</div>
				</PageTransition>

				{/* Sticky footer */}
				<div className="border-t bg-background px-4 py-3 sticky bottom-0">
					<div className="flex items-center justify-between gap-3 flex-wrap">
						<div className="text-sm text-muted-foreground">
							{selectedCourses.size > 0 && selectedLearners.size > 0 ? (
								<>
									Will create <span className="font-semibold text-foreground">{pairs.length}</span> registration{pairs.length !== 1 ? 's' : ''}
									{skipCount > 0 && <span className="ml-2 text-amber-600 dark:text-amber-400">({skipCount} duplicate{skipCount !== 1 ? 's' : ''} will be skipped)</span>}
									{loadingRegistered && <span className="ml-2 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />checking duplicates...</span>}
								</>
							) : (
								<>Select courses and learners to register</>
							)}
						</div>
						<Button
							onClick={handleSaveClick}
							disabled={saving || pairs.length === 0}
							className="h-9 text-sm px-5 gap-2"
						>
							{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
							Register {pairs.length > 0 ? `(${pairs.length})` : ''}
						</Button>
					</div>
				</div>

				<AppFooter />

				{/* Confirm dialog */}
				<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Confirm Bulk Registration</AlertDialogTitle>
							<AlertDialogDescription asChild>
								<div className="space-y-2 text-sm">
									<p>
										You are about to register{' '}
										<span className="font-semibold text-foreground">{selectedLearners.size} learner{selectedLearners.size !== 1 ? 's' : ''}</span>{' '}
										across{' '}
										<span className="font-semibold text-foreground">{selectedCourses.size} course{selectedCourses.size !== 1 ? 's' : ''}</span>.
									</p>
									<p className="text-green-700 dark:text-green-400">
										+ {pairs.length} new registration{pairs.length !== 1 ? 's' : ''} will be created
									</p>
									{skipCount > 0 && (
										<p className="text-amber-700 dark:text-amber-400">
											{skipCount} already-registered pair{skipCount !== 1 ? 's' : ''} will be skipped
										</p>
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
