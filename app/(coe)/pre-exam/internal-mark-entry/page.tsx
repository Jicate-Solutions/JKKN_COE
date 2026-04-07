"use client"

import { useState, useEffect, useMemo } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { useSessionSync } from "@/hooks/use-session-sync"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { Save, Loader2, Search, RefreshCw, AlertTriangle, Check, ChevronsUpDown } from "lucide-react"

// Types
interface Institution {
	id: string
	name: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids: string[]
}

interface Session {
	id: string
	session_name: string
	session_code: string
	institutions_id?: string
}

interface Program {
	id: string
	program_code: string
	program_name: string
	program_type: string | null
	program_order: number | null
}

interface CourseOffering {
	course_offering_id: string
	course_mapping_id: string
	course_id: string
	course_code: string
	course_name: string
	internal_max_mark: number
	course_order: number
	program_id: string
	program_code: string
	semester: number
}

interface Learner {
	id: string // exam_registration_id
	student_id: string
	stu_register_no: string
	student_name: string
	course_offering_id: string
	institutions_id: string
}

interface PatternComponent {
	component_code: string
	component_name: string
	weightage_percentage?: number
	display_order: number
	is_mandatory?: boolean
}

export default function InternalMarkEntryPage() {
	const { toast } = useToast()
	const { user } = useAuth()

	const {
		filter,
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId
	} = useInstitutionFilter()

	const { selectedSessionId: selectedSession, setSelectedSessionId: setSelectedSession } = useSessionSync()
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()

	// Data state
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [availableSemesters, setAvailableSemesters] = useState<number[]>([])
	const [courseOfferings, setCourseOfferings] = useState<CourseOffering[]>([])
	const [learners, setLearners] = useState<Learner[]>([])
	const [components, setComponents] = useState<PatternComponent[]>([])

	// Local institution selection (for super_admin with "All Institutions" global filter)
	const [localInstitutionId, setLocalInstitutionId] = useState("")

	// Effective institution ID: global filter takes priority, fallback to local selection
	const effectiveInstitutionId = institutionId || localInstitutionId || ""

	// Filter state
	const [selectedProgram, setSelectedProgram] = useState("")
	const [selectedSemester, setSelectedSemester] = useState("")
	const [selectedCourseOffering, setSelectedCourseOffering] = useState("")

	// CIA round state
	const [ciaConfig, setCiaConfig] = useState<{ setting_id: string | null, total_rounds: number, cia_rounds: any[] } | null>(null)
	const [selectedCiaRound, setSelectedCiaRound] = useState("")

	// Mark entry state
	const [maxMarks, setMaxMarks] = useState<Record<string, number>>({})
	const [learnerMarks, setLearnerMarks] = useState<Record<string, Record<string, number>>>({})
	const [errors, setErrors] = useState<Record<string, Record<string, string>>>({})

	// Grouped programs (UG first, then PG, sorted by program_order)
	const ugPrograms = useMemo(() =>
		programs.filter(p => (p.program_type || '').toUpperCase() !== 'PG')
			.sort((a, b) => (a.program_order ?? 999) - (b.program_order ?? 999)),
		[programs]
	)
	const pgPrograms = useMemo(() =>
		programs.filter(p => (p.program_type || '').toUpperCase() === 'PG')
			.sort((a, b) => (a.program_order ?? 999) - (b.program_order ?? 999)),
		[programs]
	)

	// Course offerings are already filtered by semester from API — no client-side filter needed

	// UI state
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [searchTerm, setSearchTerm] = useState("")
	const [learnersLoading, setLearnersLoading] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)

	// Derived: selected course info
	const selectedCourse = useMemo(() => {
		return courseOfferings.find(co => co.course_offering_id === selectedCourseOffering)
	}, [courseOfferings, selectedCourseOffering])

	// Total max marks from components
	const totalMaxMarks = useMemo(() => {
		return Object.values(maxMarks).reduce((sum, val) => sum + (val || 0), 0)
	}, [maxMarks])

	// Filtered learners by search
	const filteredLearners = useMemo(() => {
		if (!searchTerm) return learners
		const term = searchTerm.toLowerCase()
		return learners.filter(l =>
			l.stu_register_no?.toLowerCase().includes(term) ||
			l.student_name?.toLowerCase().includes(term)
		)
	}, [learners, searchTerm])

	// ===== Data Fetching — Cascading: Institution → Session → Program → Semester → Course =====

	const cascadeBaseUrl = (instId: string, sessionId: string) =>
		`/api/pre-exam/internal-mark-entry?action=filter-cascade&institutions_id=${instId}&examination_session_id=${sessionId}`

	// 1. Load institutions + sessions on mount
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
			fetchSessions()
		}
	}, [isReady])

	// 2. When institution + session are set → fetch registered program codes + MyJKKN names
	useEffect(() => {
		if (isReady && effectiveInstitutionId && selectedSession && institutions.length > 0) {
			fetchPrograms()
		} else {
			setPrograms([])
		}
		// Reset downstream
		setSelectedProgram("")
		setAvailableSemesters([])
		setSelectedSemester("")
		setCourseOfferings([])
		setSelectedCourseOffering("")
		setLearners([])
	}, [isReady, institutionId, localInstitutionId, selectedSession, institutions.length])

	// 3. When program is selected → fetch semesters + CIA config
	useEffect(() => {
		if (isReady && effectiveInstitutionId && selectedSession && selectedProgram && selectedProgram !== 'all') {
			const prog = programs.find(p => p.id === selectedProgram)
			if (prog?.program_code) {
				fetchSemesters(prog.program_code)
				fetchCiaConfig(prog.program_code)
			}
		} else {
			setAvailableSemesters([])
			setCiaConfig(null)
		}
		// Reset downstream
		setSelectedSemester("")
		setCourseOfferings([])
		setSelectedCourseOffering("")
		setSelectedCiaRound("")
		setLearners([])
	}, [selectedProgram])

	// 4. When semester is selected → fetch courses
	useEffect(() => {
		if (isReady && effectiveInstitutionId && selectedSession && selectedProgram && selectedSemester) {
			const prog = programs.find(p => p.id === selectedProgram)
			if (prog?.program_code) {
				fetchCourses(prog.program_code, selectedSemester)
			}
		} else {
			setCourseOfferings([])
		}
		// Reset downstream
		setSelectedCourseOffering("")
		setSelectedCiaRound("")
		setLearners([])
	}, [selectedSemester])

	// 5. When course is selected → auto-select CIA round if only 1, reset learners
	useEffect(() => {
		if (selectedCourseOffering) {
			// Auto-select if only 1 round
			if (ciaConfig && ciaConfig.total_rounds === 1) {
				setSelectedCiaRound("1")
			} else {
				setSelectedCiaRound("")
			}
		}
		setLearners([])
		setComponents([])
		setMaxMarks({})
		setLearnerMarks({})
		setErrors({})
	}, [selectedCourseOffering])

	// 6. When CIA round is selected → load components from config + fetch learners
	useEffect(() => {
		if (selectedCourseOffering && selectedSession && selectedCiaRound && ciaConfig) {
			const roundNum = Number(selectedCiaRound)
			const round = ciaConfig.cia_rounds.find((r: any) => r.round === roundNum)
			if (round) {
				// Set components and max marks from CIA config
				const comps = round.components.map((c: any) => ({
					component_code: c.code,
					component_name: c.name,
					display_order: 0,
				}))
				setComponents(comps)
				const initialMax: Record<string, number> = {}
				round.components.forEach((c: any) => {
					initialMax[c.code] = c.max_marks || 0
				})
				setMaxMarks(initialMax)
			}

			// Fetch learners filtered by CIA round
			fetchLearners(selectedCourseOffering, selectedSession, roundNum)
		} else if (!selectedCiaRound) {
			setLearners([])
			setComponents([])
			setMaxMarks({})
			setLearnerMarks({})
			setErrors({})
		}
	}, [selectedCiaRound])

	// Legacy: When course is selected without CIA config → fetch pattern components (backward compat)
	// Only runs when ciaConfig is explicitly null (no setting found) and CIA round flow is not active
	useEffect(() => {
		if (selectedCourseOffering && selectedSession && ciaConfig === null) {
			const co = courseOfferings.find(c => c.course_offering_id === selectedCourseOffering)
			if (co) {
				fetchLearners(selectedCourseOffering, selectedSession)
				fetchPatternComponents(co.course_id, co.program_id, co.course_offering_id)
			}
		}
	}, [selectedCourseOffering, selectedSession, ciaConfig])

	// ===== Fetch Functions =====

	const fetchInstitutions = async () => {
		try {
			const url = appendToUrl('/api/pre-exam/internal-marks?action=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data.map((i: any) => ({
					id: i.id,
					name: i.name || i.institution_name,
					institution_code: i.institution_code,
					institution_name: i.institution_name || i.name,
					myjkkn_institution_ids: i.myjkkn_institution_ids || [],
				})))
			}
		} catch (error) {
			console.error('Failed to fetch institutions:', error)
		}
	}

	const fetchSessions = async () => {
		try {
			const res = await fetch('/api/pre-exam/internal-marks?action=sessions')
			if (res.ok) {
				const data = await res.json()
				setSessions(data)
			}
		} catch (error) {
			console.error('Failed to fetch sessions:', error)
		}
	}

	const fetchPrograms = async () => {
		try {
			const institution = institutions.find(i => i.id === effectiveInstitutionId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			// Fetch registered program codes from exam_registrations (cascade API)
			const cascadeRes = await fetch(`${cascadeBaseUrl(effectiveInstitutionId, selectedSession!)}&step=programs`)
			const registeredCodes: string[] = cascadeRes.ok ? await cascadeRes.json() : []

			if (registeredCodes.length === 0) {
				setPrograms([])
				return
			}

			// Fetch MyJKKN programs for display names, types, ordering
			if (myjkknIds.length > 0) {
				const allProgs = await fetchMyJKKNPrograms(myjkknIds)
				// Filter to only programs with actual registrations
				const filtered = allProgs
					.filter((p: any) => registeredCodes.includes(p.program_code || p.program_id))
					.map((p: any) => ({
						id: p.id,
						program_code: p.program_code || p.program_id,
						program_name: p.program_name || p.name,
						program_type: p.program_type || null,
						program_order: p.program_order ?? null,
					}))
				setPrograms(filtered)
			} else {
				// Fallback: use codes directly (no MyJKKN names available)
				setPrograms(registeredCodes.map(code => ({
					id: code,
					program_code: code,
					program_name: code,
					program_type: null,
					program_order: null,
				})))
			}
		} catch (error) {
			console.error('Failed to fetch programs:', error)
			setPrograms([])
		}
	}

	const fetchSemesters = async (programCode: string) => {
		try {
			const res = await fetch(`${cascadeBaseUrl(effectiveInstitutionId, selectedSession!)}&step=semesters&program_code=${programCode}`)
			if (res.ok) {
				const data: number[] = await res.json()
				setAvailableSemesters(data)
			} else {
				setAvailableSemesters([])
			}
		} catch (error) {
			console.error('Failed to fetch semesters:', error)
			setAvailableSemesters([])
		}
	}

	const fetchCourses = async (programCode: string, semester: string) => {
		try {
			setLoading(true)
			const res = await fetch(`${cascadeBaseUrl(effectiveInstitutionId, selectedSession!)}&step=courses&program_code=${programCode}&semester=${semester}`)
			if (res.ok) {
				const data = await res.json()
				setCourseOfferings(data)
			} else {
				setCourseOfferings([])
			}
		} catch (error) {
			console.error('Failed to fetch courses:', error)
			setCourseOfferings([])
		} finally {
			setLoading(false)
		}
	}

	const fetchCiaConfig = async (programCode: string) => {
		try {
			const res = await fetch(`/api/pre-exam/internal-mark-entry?action=cia-config&institutions_id=${effectiveInstitutionId}&examination_session_id=${selectedSession}&program_code=${programCode}`)
			if (res.ok) {
				const data = await res.json()
				setCiaConfig(data)
			} else {
				setCiaConfig(null)
			}
		} catch (error) {
			console.error('Failed to fetch CIA config:', error)
			setCiaConfig(null)
		}
	}

	const fetchLearners = async (courseOfferingId: string, sessionId: string, ciaRound?: number) => {
		try {
			setLearnersLoading(true)
			let url = `/api/pre-exam/internal-mark-entry?action=learners&course_offering_id=${courseOfferingId}&examination_session_id=${sessionId}`
			if (ciaRound) url += `&cia_round=${ciaRound}`
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setLearners(data)
				// Initialize empty marks for each learner
				const marks: Record<string, Record<string, number>> = {}
				data.forEach((l: Learner) => {
					marks[l.id] = {}
				})
				setLearnerMarks(marks)
				setErrors({})
			} else {
				setLearners([])
			}
		} catch (error) {
			console.error('Failed to fetch learners:', error)
			setLearners([])
		} finally {
			setLearnersLoading(false)
		}
	}

	const fetchPatternComponents = async (courseId: string, programId: string, courseOfferingId: string) => {
		try {
			const instId = effectiveInstitutionId
			if (!instId) return

			const res = await fetch(`/api/pre-exam/internal-mark-entry?action=pattern-components&course_id=${courseId}&program_id=${programId}&institutions_id=${instId}`)
			if (res.ok) {
				const data = await res.json()
				const comps = data.components || []
				setComponents(comps)
				// Initialize max marks to 0 for each component
				const initialMax: Record<string, number> = {}
				comps.forEach((c: PatternComponent) => {
					initialMax[c.component_code] = 0
				})
				setMaxMarks(initialMax)
			}
		} catch (error) {
			console.error('Failed to fetch pattern components:', error)
		}
	}

	// ===== Mark Entry Handlers =====

	const handleMaxMarkChange = (componentCode: string, value: string) => {
		const numValue = value === '' ? 0 : parseInt(value, 10)
		if (isNaN(numValue) || numValue < 0) return
		setMaxMarks(prev => ({ ...prev, [componentCode]: numValue }))
	}

	const handleMarkChange = (examRegId: string, componentCode: string, value: string) => {
		const numValue = value === '' ? 0 : parseInt(value, 10)
		if (isNaN(numValue) || numValue < 0) return

		setLearnerMarks(prev => ({
			...prev,
			[examRegId]: {
				...prev[examRegId],
				[componentCode]: numValue
			}
		}))

		// Validate against max mark
		const max = maxMarks[componentCode] || 0
		if (max > 0 && numValue > max) {
			setErrors(prev => ({
				...prev,
				[examRegId]: {
					...prev[examRegId],
					[componentCode]: `Exceeds max (${max})`
				}
			}))
		} else {
			setErrors(prev => {
				const updated = { ...prev }
				if (updated[examRegId]) {
					delete updated[examRegId][componentCode]
					if (Object.keys(updated[examRegId]).length === 0) {
						delete updated[examRegId]
					}
				}
				return updated
			})
		}
	}

	const getLearnerTotal = (examRegId: string): number => {
		const marks = learnerMarks[examRegId] || {}
		return Object.values(marks).reduce((sum, val) => sum + (val || 0), 0)
	}

	// ===== Save =====

	const hasValidationErrors = useMemo(() => {
		return Object.keys(errors).length > 0
	}, [errors])

	const hasAnyMarks = useMemo(() => {
		return Object.values(learnerMarks).some(marks =>
			Object.values(marks).some(v => v > 0)
		)
	}, [learnerMarks])

	const handleSave = async () => {
		// Validate max marks are set
		const activeComponents = components.filter(c => (maxMarks[c.component_code] || 0) > 0)
		if (activeComponents.length === 0) {
			toast({
				title: '❌ No Max Marks Set',
				description: 'Please set max marks for at least one component before saving.',
				variant: 'destructive'
			})
			return
		}

		if (hasValidationErrors) {
			toast({
				title: '❌ Validation Errors',
				description: 'Please fix all mark errors before saving.',
				variant: 'destructive'
			})
			return
		}

		if (!hasAnyMarks) {
			toast({
				title: '❌ No Marks Entered',
				description: 'Please enter marks for at least one learner.',
				variant: 'destructive'
			})
			return
		}

		const co = courseOfferings.find(c => c.course_offering_id === selectedCourseOffering)
		if (!co) return

		const instId = effectiveInstitutionId
		if (!instId) return

		// Build only the active max marks (where max > 0)
		const activeMaxMarks: Record<string, number> = {}
		for (const [code, val] of Object.entries(maxMarks)) {
			if (val > 0) activeMaxMarks[code] = val
		}

		// Build learner marks array (only learners with marks entered)
		const marksToSave = learners
			.filter(l => {
				const marks = learnerMarks[l.id] || {}
				return Object.values(marks).some(v => v > 0)
			})
			.map(l => ({
				exam_registration_id: l.id,
				student_id: l.student_id,
				register_no: l.stu_register_no,
				marks: learnerMarks[l.id] || {}
			}))

		if (marksToSave.length === 0) {
			toast({
				title: '❌ No Marks to Save',
				description: 'Enter marks for at least one learner.',
				variant: 'destructive'
			})
			return
		}

		try {
			setSaving(true)
			const res = await fetch('/api/pre-exam/internal-mark-entry', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: instId,
					examination_session_id: selectedSession,
					course_offering_id: co.course_offering_id,
					course_id: co.course_id,
					program_id: co.program_id,
					cia_round: Number(selectedCiaRound) || 1,
					max_marks: activeMaxMarks,
					learner_marks: marksToSave
				})
			})

			const result = await res.json()

			if (res.ok) {
				toast({
					title: '✅ Marks Saved',
					description: result.message || `Saved marks for ${marksToSave.length} learners.`,
					className: 'bg-green-50 border-green-200 text-green-800'
				})
				// Refresh learners list (saved ones will be excluded)
				fetchLearners(co.course_offering_id, selectedSession!, Number(selectedCiaRound) || undefined)
			} else {
				toast({
					title: '❌ Save Failed',
					description: result.error || 'Failed to save marks.',
					variant: 'destructive'
				})
			}
		} catch (error) {
			console.error('Save error:', error)
			toast({
				title: '❌ Network Error',
				description: 'Unable to connect to server.',
				variant: 'destructive'
			})
		} finally {
			setSaving(false)
		}
	}

	// ===== Reset =====

	const handleReset = () => {
		setLocalInstitutionId("")
		setSelectedProgram("")
		setAvailableSemesters([])
		setSelectedSemester("")
		setCourseOfferings([])
		setSelectedCourseOffering("")
		setCiaConfig(null)
		setSelectedCiaRound("")
		setLearners([])
		setComponents([])
		setMaxMarks({})
		setLearnerMarks({})
		setErrors({})
		setSearchTerm("")
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader>
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem><BreadcrumbLink asChild><Link href="/">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbLink>Pre-Exam</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>Internal Mark Entry</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex flex-1 flex-col gap-4 p-4 overflow-y-auto">
					{/* Filters Card */}
					<Card>
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between">
								<CardTitle className="text-lg">Internal Mark Entry</CardTitle>
								<Button variant="outline" size="sm" onClick={handleReset}>
									<RefreshCw className="h-4 w-4 mr-2" />
									Reset
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
								{/* Institution - only visible when global filter is "All Institutions" */}
								{mustSelectInstitution && (
									<div className="space-y-1.5">
										<label className="text-sm font-medium text-muted-foreground">Institution <span className="text-red-500">*</span></label>
										<Select
											value={localInstitutionId}
											onValueChange={setLocalInstitutionId}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select Institution" />
											</SelectTrigger>
											<SelectContent>
												{institutions.map(inst => (
													<SelectItem key={inst.id} value={inst.id}>
														{inst.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}

								{/* Exam Session */}
								<div className="space-y-1.5">
									<label className="text-sm font-medium text-muted-foreground">Exam Session <span className="text-red-500">*</span></label>
									<Select
										value={selectedSession || ""}
										onValueChange={setSelectedSession}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select Session" />
										</SelectTrigger>
										<SelectContent>
											{sessions
												.filter(s => !shouldFilter || !institutionId || s.institutions_id === institutionId)
												.map(s => (
													<SelectItem key={s.id} value={s.id}>
														{s.session_name}
													</SelectItem>
												))}
										</SelectContent>
									</Select>
								</div>

								{/* Program - searchable, grouped by UG/PG, sorted by program_order */}
								<div className="space-y-1.5">
									<label className="text-sm font-medium text-muted-foreground">Program <span className="text-red-500">*</span></label>
									<Popover open={programOpen} onOpenChange={setProgramOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={programOpen}
												className="w-full justify-between h-9 text-sm font-normal"
												disabled={programs.length === 0}
											>
												<span className="truncate">
													{selectedProgram && selectedProgram !== 'all'
														? (() => {
															const p = programs.find(p => p.id === selectedProgram)
															return p ? `${p.program_code} - ${p.program_name}` : 'Select Program'
														})()
														: programs.length === 0 ? 'Select Session first' : 'Select Program'}
												</span>
												<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[350px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search program..." className="h-8 text-xs" />
												<CommandEmpty className="text-xs py-4">No program found.</CommandEmpty>
												{ugPrograms.length > 0 && (
													<CommandGroup heading="UG Programs" className="max-h-60 overflow-auto">
														{ugPrograms.map(p => (
															<CommandItem
																key={p.id}
																value={`${p.program_code} ${p.program_name}`}
																onSelect={() => {
																	setSelectedProgram(p.id)
																	setProgramOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedProgram === p.id ? "opacity-100" : "opacity-0")} />
																<span className="flex-1 whitespace-normal">{p.program_code} - {p.program_name}</span>
															</CommandItem>
														))}
													</CommandGroup>
												)}
												{pgPrograms.length > 0 && (
													<CommandGroup heading="PG Programs" className="max-h-60 overflow-auto">
														{pgPrograms.map(p => (
															<CommandItem
																key={p.id}
																value={`${p.program_code} ${p.program_name}`}
																onSelect={() => {
																	setSelectedProgram(p.id)
																	setProgramOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedProgram === p.id ? "opacity-100" : "opacity-0")} />
																<span className="flex-1 whitespace-normal">{p.program_code} - {p.program_name}</span>
															</CommandItem>
														))}
													</CommandGroup>
												)}
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Semester */}
								<div className="space-y-1.5">
									<label className="text-sm font-medium text-muted-foreground">Semester <span className="text-red-500">*</span></label>
									<Select
										value={selectedSemester}
										onValueChange={setSelectedSemester}
										disabled={availableSemesters.length === 0}
									>
										<SelectTrigger className="h-9">
											<SelectValue placeholder={availableSemesters.length === 0 ? 'Select Program first' : 'Select Semester'} />
										</SelectTrigger>
										<SelectContent>
											{availableSemesters.map(sem => (
												<SelectItem key={sem} value={String(sem)}>
													Semester {sem}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Course - searchable, sorted by course_order */}
								<div className="space-y-1.5">
									<label className="text-sm font-medium text-muted-foreground">Course <span className="text-red-500">*</span></label>
									<Popover open={courseOpen} onOpenChange={setCourseOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={courseOpen}
												className="w-full justify-between h-9 text-sm font-normal"
												disabled={!selectedSemester || loading || courseOfferings.length === 0}
											>
												<span className="truncate">
													{selectedCourseOffering
														? (() => {
															const co = courseOfferings.find(c => c.course_offering_id === selectedCourseOffering)
															return co ? `${co.course_code} - ${co.course_name}` : 'Select Course'
														})()
														: loading ? 'Loading courses...' : courseOfferings.length === 0 ? 'Select Semester first' : 'Select Course'}
												</span>
												<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[450px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search course code or name..." className="h-8 text-xs" />
												<CommandEmpty className="text-xs py-4">No course found.</CommandEmpty>
												<CommandGroup className="max-h-72 overflow-auto">
													{courseOfferings.map(co => (
														<CommandItem
															key={co.course_offering_id}
															value={`${co.course_code} ${co.course_name}`}
															onSelect={() => {
																setSelectedCourseOffering(co.course_offering_id)
																setCourseOpen(false)
															}}
															className="py-2 text-xs"
														>
															<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedCourseOffering === co.course_offering_id ? "opacity-100" : "opacity-0")} />
															<span className="flex-1 whitespace-normal">{co.course_code} - {co.course_name}</span>
														</CommandItem>
													))}
												</CommandGroup>
											</Command>
										</PopoverContent>
									</Popover>
								</div>
								{/* CIA Round */}
								{ciaConfig && ciaConfig.total_rounds > 1 && selectedCourseOffering && (
									<div className="space-y-1.5">
										<label className="text-sm font-medium text-muted-foreground">CIA Round <span className="text-red-500">*</span></label>
										<Select value={selectedCiaRound} onValueChange={setSelectedCiaRound}>
											<SelectTrigger className="h-9">
												<SelectValue placeholder="Select Round" />
											</SelectTrigger>
											<SelectContent>
												{ciaConfig.cia_rounds.map((r: any) => (
													<SelectItem key={r.round} value={String(r.round)}>
														{r.round_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
							</div>
						</CardContent>
					</Card>

					{/* Course Info + Max Marks Config */}
					{selectedCourse && components.length > 0 && (
						<Card>
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between">
									<div>
										<CardTitle className="text-base">
											{selectedCourse.course_code} - {selectedCourse.course_name}
										</CardTitle>
										<p className="text-sm text-muted-foreground mt-1">
											Max Internal Mark: <span className="font-semibold">{selectedCourse.internal_max_mark}</span>
											{totalMaxMarks > 0 && (
												<>
													{' '} | Component Total: <span className={`font-semibold ${totalMaxMarks > selectedCourse.internal_max_mark ? 'text-red-500' : 'text-green-600'}`}>{totalMaxMarks}</span>
												</>
											)}
										</p>
									</div>
									<Badge variant="outline" className="text-xs">
										{components.length} Components
									</Badge>
								</div>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground mb-3">Set max marks for each assessment component:</p>
								<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
									{components.map(comp => (
										<div key={comp.component_code} className="space-y-1">
											<label className="text-xs font-medium text-muted-foreground">
												{comp.component_name}
												{comp.is_mandatory && <span className="text-red-500 ml-0.5">*</span>}
											</label>
											<Input
												type="number"
												min={0}
												value={maxMarks[comp.component_code] || ''}
												onChange={(e) => handleMaxMarkChange(comp.component_code, e.target.value)}
												placeholder="0"
												className="h-8 text-sm"
											/>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					)}

					{/* Learners Mark Entry Table */}
					{selectedCourseOffering && (
						<Card>
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between">
									<CardTitle className="text-base">
										Learner Marks Entry
										{learners.length > 0 && (
											<Badge variant="secondary" className="ml-2">{learners.length} learners</Badge>
										)}
									</CardTitle>
									<div className="flex items-center gap-2">
										<div className="relative">
											<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
											<Input
												placeholder="Search by register no or name..."
												value={searchTerm}
												onChange={(e) => setSearchTerm(e.target.value)}
												className="pl-8 h-8 w-64"
											/>
										</div>
										<Button
											onClick={handleSave}
											disabled={saving || !hasAnyMarks || hasValidationErrors}
											size="sm"
										>
											{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
											{saving ? 'Saving...' : 'Save Marks'}
										</Button>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								{learnersLoading ? (
									<div className="flex items-center justify-center py-12">
										<Loader2 className="h-6 w-6 animate-spin mr-2" />
										<span className="text-muted-foreground">Loading learners...</span>
									</div>
								) : filteredLearners.length === 0 ? (
									<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
										<AlertTriangle className="h-8 w-8 mb-2" />
										<p>{learners.length === 0 ? 'No regular learners found for this course, or all marks have already been entered.' : 'No matching learners found.'}</p>
									</div>
								) : (
									<div className="overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="w-12 text-center">S.No</TableHead>
													<TableHead className="w-36">Register Number</TableHead>
													<TableHead className="min-w-[200px]">Name of the Learner</TableHead>
													{components
														.filter(c => (maxMarks[c.component_code] || 0) > 0)
														.map(comp => (
															<TableHead key={comp.component_code} className="text-center min-w-[80px]">
																{comp.component_name}
																<br />
																<span className="text-xs font-normal text-muted-foreground">Max: {maxMarks[comp.component_code]}</span>
															</TableHead>
														))
													}
													<TableHead className="text-center w-20">Total</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{filteredLearners.map((learner, idx) => {
													const total = getLearnerTotal(learner.id)
													const activeComponents = components.filter(c => (maxMarks[c.component_code] || 0) > 0)
													return (
														<TableRow key={learner.id}>
															<TableCell className="text-center text-sm">{idx + 1}</TableCell>
															<TableCell className="text-sm font-mono">{learner.stu_register_no}</TableCell>
															<TableCell className="text-sm">{learner.student_name}</TableCell>
															{activeComponents.map(comp => {
																const error = errors[learner.id]?.[comp.component_code]
																return (
																	<TableCell key={comp.component_code} className="text-center p-1">
																		<Input
																			type="number"
																			min={0}
																			max={maxMarks[comp.component_code] || 999}
																			value={learnerMarks[learner.id]?.[comp.component_code] ?? ''}
																			onChange={(e) => handleMarkChange(learner.id, comp.component_code, e.target.value)}
																			className={`h-8 w-16 text-center text-sm mx-auto ${error ? 'border-red-500 bg-red-50' : ''}`}
																			placeholder="0"
																		/>
																		{error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
																	</TableCell>
																)
															})}
															<TableCell className="text-center font-semibold text-sm">
																{total > 0 ? total : '-'}
															</TableCell>
														</TableRow>
													)
												})}
											</TableBody>
										</Table>
									</div>
								)}
							</CardContent>
						</Card>
					)}
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
