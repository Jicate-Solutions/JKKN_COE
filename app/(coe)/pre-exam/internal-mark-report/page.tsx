"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { useSessionSync } from "@/hooks/use-session-sync"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { Download, Loader2, Check, ChevronsUpDown, FileText, AlertTriangle, ChevronDown, ChevronRight, Clock } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Institution { id: string; name: string; institution_code: string; myjkkn_institution_ids: string[] }
interface Session { id: string; session_name: string; session_code: string; institutions_id?: string }
interface Program { id: string; program_code: string; program_name: string; program_type: string | null; program_order: number | null }
interface CourseOffering { course_offering_id: string; course_id: string; course_code: string; course_name: string; internal_max_mark: number; course_order: number; program_id: string; program_code: string; semester: number; course_category: string | null }
interface AssessmentOption { id: string; label: string; setting: any; round: any }
interface PendingCourse { course_offering_id: string; course_code: string; course_name: string; course_category: string | null; total_learners: number; entered_count: number; pending_count: number; status: 'not_started' | 'partial' }
interface PendingSemester { semester: number; courses: PendingCourse[] }
interface PendingProgram { program_code: string; semesters: PendingSemester[] }

export default function InternalMarkReportPage() {
	const { toast } = useToast()
	const { user } = useAuth()
	const { isReady, appendToUrl, mustSelectInstitution, shouldFilter, institutionId } = useInstitutionFilter()
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()
	const { selectedSessionId: globalSession } = useSessionSync()

	// Data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [assessmentOptions, setAssessmentOptions] = useState<AssessmentOption[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [availableSemesters, setAvailableSemesters] = useState<number[]>([])
	const [courseOfferings, setCourseOfferings] = useState<CourseOffering[]>([])

	const [localInstitutionId, setLocalInstitutionId] = useState("")
	const effectiveInstitutionId = institutionId || localInstitutionId || ""
	const selectedSession = globalSession || ""
	const [localSession, setLocalSession] = useState("")
	const effectiveSession = selectedSession || localSession

	// Filter state
	const [selectedAssessment, setSelectedAssessment] = useState("")
	const [selectedProgram, setSelectedProgram] = useState("")
	const [selectedSemester, setSelectedSemester] = useState("")
	const [selectedCourses, setSelectedCourses] = useState<string[]>([])
	// Keep for backward compat with cascade
	const selectedCourseOffering = selectedCourses[0] || ""

	// UI
	const [generating, setGenerating] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)

	// Cache MyJKKN programs
	const myjkknCacheRef = useRef<{ promise: Promise<any[]> | null; data: any[] }>({ promise: null, data: [] })
	const getMyJKKNPrograms = async (): Promise<any[]> => {
		if (myjkknCacheRef.current.data.length > 0) return myjkknCacheRef.current.data
		if (myjkknCacheRef.current.promise) return myjkknCacheRef.current.promise
		const inst = institutions.find(i => i.id === effectiveInstitutionId)
		const ids = inst?.myjkkn_institution_ids || []
		if (ids.length === 0) return []
		myjkknCacheRef.current.promise = fetchMyJKKNPrograms(ids)
		const result = await myjkknCacheRef.current.promise
		myjkknCacheRef.current.data = result
		myjkknCacheRef.current.promise = null
		return result
	}

	const activeAssessment = useMemo(() => assessmentOptions.find(a => a.id === selectedAssessment) || null, [assessmentOptions, selectedAssessment])
	const selectedCourse = useMemo(() => courseOfferings.find(co => co.course_offering_id === selectedCourseOffering), [courseOfferings, selectedCourseOffering])

	const ugPrograms = useMemo(() => programs.filter(p => (p.program_type || '').toUpperCase() !== 'PG').sort((a, b) => (a.program_order ?? 999) - (b.program_order ?? 999)), [programs])
	const pgPrograms = useMemo(() => programs.filter(p => (p.program_type || '').toUpperCase() === 'PG').sort((a, b) => (a.program_order ?? 999) - (b.program_order ?? 999)), [programs])

	const cascadeBaseUrl = (instId: string, sessionId: string) =>
		`/api/pre-exam/internal-mark-entry?action=filter-cascade&institutions_id=${instId}&examination_session_id=${sessionId}`

	// ===== Cascade Effects =====

	useEffect(() => {
		if (isReady) { fetchInstitutions(); fetchSessions() }
	}, [isReady])

	useEffect(() => {
		if (isReady && effectiveInstitutionId && institutions.length > 0) getMyJKKNPrograms().catch(() => {})
	}, [isReady, effectiveInstitutionId, institutions.length])

	// Session → Assessments
	useEffect(() => {
		setSelectedAssessment(""); setPrograms([]); setSelectedProgram("")
		setAvailableSemesters([]); setSelectedSemester("")
		setCourseOfferings([]); setSelectedCourses([])
		if (isReady && effectiveInstitutionId && effectiveSession) fetchAssessments()
		else setAssessmentOptions([])
	}, [isReady, institutionId, localInstitutionId, effectiveSession])

	// Assessment → Programs (includes institutions.length to fix race condition)
	useEffect(() => {
		setSelectedProgram(""); setAvailableSemesters([]); setSelectedSemester("")
		setCourseOfferings([]); setSelectedCourses([])
		if (isReady && effectiveInstitutionId && effectiveSession && selectedAssessment && institutions.length > 0) fetchPrograms()
		else if (!selectedAssessment) setPrograms([])
	}, [selectedAssessment, institutions.length])

	// Program → Semesters
	useEffect(() => {
		setAvailableSemesters([]); setSelectedSemester("")
		setCourseOfferings([]); setSelectedCourses([])
		if (isReady && effectiveInstitutionId && effectiveSession && selectedProgram) {
			const prog = programs.find(p => p.id === selectedProgram)
			if (prog?.program_code) fetchSemesters(prog.program_code)
		}
	}, [selectedProgram])

	// Note: Course fetching is now handled by the multi-semester effect below (after handleConsolidatedPDF)

	// ===== Fetch Functions =====

	const fetchInstitutions = async () => {
		try {
			const res = await fetch(appendToUrl('/api/pre-exam/internal-marks?action=institutions'))
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data.map((i: any) => ({ id: i.id, name: i.name || i.institution_name, institution_code: i.institution_code, myjkkn_institution_ids: i.myjkkn_institution_ids || [] })))
			}
		} catch (e) { console.error('Failed to fetch institutions:', e) }
	}

	const fetchSessions = async () => {
		try {
			const res = await fetch('/api/pre-exam/internal-marks?action=sessions')
			if (res.ok) setSessions(await res.json())
		} catch (e) { console.error('Failed to fetch sessions:', e) }
	}

	const fetchAssessments = async () => {
		try {
			// Use report API — no date filtering
			const res = await fetch(`/api/pre-exam/internal-mark-report?action=assessments&institutions_id=${effectiveInstitutionId}&examination_session_id=${effectiveSession}`)
			if (res.ok) setAssessmentOptions(await res.json())
			else setAssessmentOptions([])
		} catch (e) { console.error('Failed to fetch assessments:', e); setAssessmentOptions([]) }
	}

	const fetchPrograms = async () => {
		try {
			if (!activeAssessment) { setPrograms([]); return }
			const settingCodes: string[] = activeAssessment.setting.program_codes || []
			const [registeredCodes, myjkknProgs] = await Promise.all([
				fetch(`${cascadeBaseUrl(effectiveInstitutionId, effectiveSession)}&step=programs`).then(r => r.ok ? r.json() : []),
				getMyJKKNPrograms(),
			])
			const validCodes = settingCodes.length > 0 ? registeredCodes.filter((c: string) => settingCodes.includes(c)) : registeredCodes
			if (validCodes.length === 0) { setPrograms([]); return }
			if (myjkknProgs.length > 0) {
				setPrograms(myjkknProgs.filter((p: any) => validCodes.includes(p.program_code || p.program_id)).map((p: any) => ({
					id: p.id, program_code: p.program_code || p.program_id, program_name: p.program_name || p.name, program_type: p.program_type || null, program_order: p.program_order ?? null,
				})))
			} else {
				setPrograms(validCodes.map((c: string) => ({ id: c, program_code: c, program_name: c, program_type: null, program_order: null })))
			}
		} catch (e) { console.error('Failed to fetch programs:', e); setPrograms([]) }
	}

	const fetchSemesters = async (programCode: string) => {
		try {
			const res = await fetch(`${cascadeBaseUrl(effectiveInstitutionId, effectiveSession)}&step=semesters&program_code=${programCode}`)
			if (res.ok) setAvailableSemesters(await res.json())
			else setAvailableSemesters([])
		} catch (e) { setAvailableSemesters([]) }
	}

	const fetchCourses = async (programCode: string, semester: string, categories: string[] = []) => {
		try {
			const res = await fetch(`${cascadeBaseUrl(effectiveInstitutionId, effectiveSession)}&step=courses&program_code=${programCode}&semester=${semester}`)
			if (res.ok) {
				let data = await res.json()
				if (categories.length > 0) {
					const lowerCats = categories.map(c => c.toLowerCase())
					data = data.filter((co: any) => {
						const cat = (co.course_category || '').toLowerCase()
						return cat && lowerCats.includes(cat)
					})
				}
				setCourseOfferings(data)
			} else setCourseOfferings([])
		} catch (e) { setCourseOfferings([]) }
	}

	// Fetch courses from multiple semesters in parallel, merge + dedupe
	const fetchCoursesForSemesters = async (programCode: string, semesters: number[], categories: string[] = []) => {
		try {
			const sortedSems = [...semesters].sort((a, b) => a - b)
			const results = await Promise.all(sortedSems.map(async (sem) => {
				const res = await fetch(`${cascadeBaseUrl(effectiveInstitutionId, effectiveSession)}&step=courses&program_code=${programCode}&semester=${sem}`)
				if (!res.ok) return []
				let data = await res.json()
				if (categories.length > 0) {
					const lowerCats = categories.map(c => c.toLowerCase())
					data = data.filter((co: any) => {
						const cat = (co.course_category || '').toLowerCase()
						return cat && lowerCats.includes(cat)
					})
				}
				// Ensure semester is set on each course
				return data.map((co: any) => ({ ...co, semester: co.semester ?? sem }))
			}))

			// Merge + dedupe by course_offering_id, sorted by semester then course_order
			const seen = new Set<string>()
			const merged: any[] = []
			for (const arr of results) {
				for (const co of arr) {
					if (!seen.has(co.course_offering_id)) {
						seen.add(co.course_offering_id)
						merged.push(co)
					}
				}
			}
			merged.sort((a, b) => {
				if (a.semester !== b.semester) return a.semester - b.semester
				return (a.course_order ?? 999) - (b.course_order ?? 999)
			})
			setCourseOfferings(merged)
		} catch (e) {
			console.error('Failed to fetch courses for semesters:', e)
			setCourseOfferings([])
		}
	}

	// ===== Generate PDF =====

	const handleGeneratePDF = async () => {
		if (selectedCourses.length === 0 || !activeAssessment || !effectiveSession) {
			toast({ title: '❌ Select at least one course', variant: 'destructive' }); return
		}

		try {
			setGenerating(true)
			const prog = programs.find(p => p.id === selectedProgram)
			const ciaRound = activeAssessment.round.round
			const roundComponents = activeAssessment.round.components || []
			const institution = institutions.find(i => i.id === effectiveInstitutionId)
			const sessionName = sessions.find(s => s.id === effectiveSession)?.session_name || ''

			const markFieldMap: Record<string, string> = {
				'assignment': 'assignment_marks', 'quiz': 'quiz_marks', 'mid_term': 'mid_term_marks',
				'presentation': 'presentation_marks', 'attendance': 'attendance_marks', 'lab': 'lab_marks',
				'project': 'project_marks', 'seminar': 'seminar_marks', 'viva': 'viva_marks',
				'test_1': 'test_1_mark', 'test_2': 'test_2_mark', 'test_3': 'test_3_mark', 'other': 'other_marks',
			}

			// Load logos once
			const loadImage = async (url: string): Promise<string> => {
				try { const r = await fetch(url); const blob = await r.blob(); return new Promise((res, rej) => { const reader = new FileReader(); reader.onloadend = () => res(reader.result as string); reader.onerror = rej; reader.readAsDataURL(blob) }) } catch { return '' }
			}
			const [leftLogo, rightLogo] = await Promise.all([loadImage('/jkkncas_logo.png'), loadImage('/jkkn_logo.png')])

			// Fetch data for all selected courses in parallel
			const allCourseData = await Promise.all(selectedCourses.map(async (coId) => {
				const co = courseOfferings.find(c => c.course_offering_id === coId)
				if (!co) return null

				let url = `/api/pre-exam/internal-mark-report?action=report-data&course_offering_id=${coId}&examination_session_id=${effectiveSession}&cia_round=${ciaRound}`
				if (prog?.program_code) url += `&program_code=${prog.program_code}`
				const res = await fetch(url)
				if (!res.ok) return null
				const learners = await res.json()

				const pdfComponents = roundComponents.map((c: any) => ({
					code: c.code, name: c.name,
					max_marks: c.max_marks || co.internal_max_mark || 0,
				}))

				const pdfLearners = learners.map((l: any, idx: number) => {
					const componentMarks: Record<string, number> = {}
					let total = 0
					if (l.saved_marks) {
						for (const comp of roundComponents) {
							const dbField = markFieldMap[comp.code]
							const val = dbField ? (l.saved_marks[dbField] || 0) : 0
							if (val > 0) { componentMarks[comp.code] = val; total += val }
						}
					}
					return { serial_number: idx + 1, register_number: l.dummy_number || l.stu_register_no, student_name: l.student_name, component_marks: componentMarks, total }
				})

				return {
					institution_name: institution?.name || 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)',
					program_code: prog?.program_code || '', program_name: prog?.program_name || '',
					semester: co.semester || '', course_code: co.course_code, course_name: co.course_name,
					internal_max_mark: co.internal_max_mark, exam_session: sessionName,
					assessment_name: activeAssessment.setting.setting_name, cia_round_name: activeAssessment.round.round_name,
					components: pdfComponents, learners: pdfLearners, logoImage: leftLogo, rightLogoImage: rightLogo,
				}
			}))

			// Filter out nulls and courses with no marks
			const validCourses = allCourseData.filter(c => c && c.learners.some((l: any) => l.total > 0)) as any[]

			if (validCourses.length === 0) {
				toast({ title: '❌ No marks found', description: 'No marks entered for the selected courses.', variant: 'destructive' }); return
			}

			const { generateMultiCourseInternalMarksPDF, generateInternalMarksPDF } = await import('@/lib/utils/generate-internal-marks-pdf')

			if (validCourses.length === 1) {
				generateInternalMarksPDF(validCourses[0])
			} else {
				generateMultiCourseInternalMarksPDF(validCourses)
			}

			const skipped = selectedCourses.length - validCourses.length
			toast({
				title: '✅ Report Generated',
				description: `${validCourses.length} course(s) downloaded${skipped > 0 ? `, ${skipped} skipped (no marks)` : ''}`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (error) {
			console.error('PDF generation error:', error)
			toast({ title: '❌ Failed to generate PDF', variant: 'destructive' })
		} finally {
			setGenerating(false)
		}
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
							<BreadcrumbItem><BreadcrumbPage>Internal Mark Report</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex flex-1 flex-col gap-4 p-4 overflow-y-auto">
					<Card>
						<CardHeader className="pb-3">
							<div>
								<CardTitle className="text-lg">Internal Mark Report</CardTitle>
								<p className="text-sm text-muted-foreground mt-1">Generate internal mark entry PDF report</p>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							{/* ─── Global Filters: Institution, Session, Assessment ─── */}
							<div className="flex flex-wrap gap-3">
								{/* Institution */}
								{mustSelectInstitution && (
									<div className="space-y-1 min-w-[150px] flex-1">
										<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Institution <span className="text-red-500">*</span></label>
										<Select value={localInstitutionId} onValueChange={setLocalInstitutionId}>
											<SelectTrigger className="h-10"><SelectValue placeholder="Select Institution" /></SelectTrigger>
											<SelectContent>
												{institutions.map(inst => <SelectItem key={inst.id} value={inst.id}>{inst.institution_code} - {inst.name}</SelectItem>)}
											</SelectContent>
										</Select>
									</div>
								)}

								{/* Session */}
								{!globalSession && (
									<div className="space-y-1 min-w-[150px] flex-1">
										<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exam Session <span className="text-red-500">*</span></label>
										<Select value={localSession} onValueChange={setLocalSession}>
											<SelectTrigger className="h-10"><SelectValue placeholder="Select Session" /></SelectTrigger>
											<SelectContent>
												{sessions.filter(s => !shouldFilter || !institutionId || s.institutions_id === institutionId).map(s => (
													<SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}

								{/* Assessment */}
								<div className="space-y-1 min-w-[150px] flex-1">
									<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assessment <span className="text-red-500">*</span></label>
									<Select value={selectedAssessment} onValueChange={setSelectedAssessment} disabled={assessmentOptions.length === 0}>
										<SelectTrigger className="h-10"><SelectValue placeholder={!effectiveSession ? 'Select Session first' : assessmentOptions.length === 0 ? 'No assessments' : 'Select Assessment'} /></SelectTrigger>
										<SelectContent className="max-w-[450px]">
											{assessmentOptions.map(opt => (
												<SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							{/* ─── Premium Tab Selector ─── */}
							{activeAssessment && (
								<div className="flex flex-wrap gap-2 pt-1">
									<button
										type="button"
										onClick={() => setActiveTab('course-wise')}
										className={cn(
											"inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200",
											activeTab === 'course-wise'
												? "bg-gradient-to-r from-purple-500 to-purple-700 text-white shadow-md shadow-purple-200"
												: "bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 hover:border-purple-300"
										)}
									>
										<FileText className="h-3.5 w-3.5" />
										Course Wise
									</button>
									<button
										type="button"
										onClick={() => setActiveTab('consolidated')}
										className={cn(
											"inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200",
											activeTab === 'consolidated'
												? "bg-gradient-to-r from-indigo-500 to-indigo-700 text-white shadow-md shadow-indigo-200"
												: "bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 hover:border-indigo-300"
										)}
									>
										<FileText className="h-3.5 w-3.5" />
										Consolidated
									</button>
									<button
										type="button"
										onClick={() => setActiveTab('pending')}
										className={cn(
											"inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200",
											activeTab === 'pending'
												? "bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-md shadow-orange-200"
												: "bg-white hover:bg-orange-50 text-orange-700 border border-orange-200 hover:border-orange-300"
										)}
									>
										<AlertTriangle className="h-3.5 w-3.5" />
										Pending Mark Entry
									</button>
								</div>
							)}

							{/* ─── Tab-specific filters: Program & Semester (only for Course Wise & Consolidated) ─── */}
							{activeAssessment && activeTab !== 'pending' && (
								<div className="flex flex-wrap gap-3 pt-1 border-t">
									{/* Program */}
									<div className="space-y-1 min-w-[200px] flex-1">
										<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Program <span className="text-red-500">*</span></label>
										<Popover open={programOpen} onOpenChange={setProgramOpen}>
											<PopoverTrigger asChild>
												<Button variant="outline" role="combobox" className="w-full justify-between h-10 text-sm font-normal" disabled={programs.length === 0}>
													<span className="truncate">
														{selectedProgram ? (() => { const p = programs.find(p => p.id === selectedProgram); return p ? `${p.program_code} - ${p.program_name}` : 'Select Program' })() : programs.length === 0 ? 'Select Assessment first' : 'Select Program'}
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
																<CommandItem key={p.id} value={`${p.program_code} ${p.program_name}`} onSelect={() => { setSelectedProgram(p.id); setProgramOpen(false) }} className="py-2 text-xs">
																	<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedProgram === p.id ? "opacity-100" : "opacity-0")} />
																	<span className="flex-1 whitespace-normal">{p.program_code} - {p.program_name}</span>
																</CommandItem>
															))}
														</CommandGroup>
													)}
													{pgPrograms.length > 0 && (
														<CommandGroup heading="PG Programs" className="max-h-60 overflow-auto">
															{pgPrograms.map(p => (
																<CommandItem key={p.id} value={`${p.program_code} ${p.program_name}`} onSelect={() => { setSelectedProgram(p.id); setProgramOpen(false) }} className="py-2 text-xs">
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
								<div className="space-y-1 min-w-[150px] flex-1">
									<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Semester <span className="text-red-500">*</span></label>
									<Select value={selectedSemester} onValueChange={setSelectedSemester} disabled={availableSemesters.length === 0}>
										<SelectTrigger className="h-10"><SelectValue placeholder={availableSemesters.length === 0 ? 'Select Program first' : 'Select Semester'} /></SelectTrigger>
										<SelectContent>
											{availableSemesters.map(sem => <SelectItem key={sem} value={String(sem)}>Semester {sem}</SelectItem>)}
										</SelectContent>
									</Select>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Course multi-select */}
					{courseOfferings.length > 0 && (
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<div>
										<CardTitle className="text-sm">Select Courses</CardTitle>
										<p className="text-xs text-muted-foreground">{selectedCourses.length} of {courseOfferings.length} selected</p>
									</div>
									<div className="flex gap-2">
										<Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setSelectedCourses(courseOfferings.map(co => co.course_offering_id))}>Select All</Button>
										<span className="text-xs text-muted-foreground">|</span>
										<Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setSelectedCourses([])}>Clear</Button>
									</div>
								</div>
							</CardHeader>
							<CardContent className="pt-0">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
									{courseOfferings.map(co => (
										<label key={co.course_offering_id} className={cn(
											"flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors text-sm",
											selectedCourses.includes(co.course_offering_id) ? "bg-purple-50 border-purple-300" : "hover:bg-muted/50"
										)}>
											<Checkbox
												checked={selectedCourses.includes(co.course_offering_id)}
												onCheckedChange={(checked) => {
													setSelectedCourses(prev => checked
														? [...prev, co.course_offering_id]
														: prev.filter(id => id !== co.course_offering_id)
													)
												}}
											/>
											<span className="font-mono text-xs text-muted-foreground">{co.course_code}</span>
											<span className="text-xs truncate">{co.course_name}</span>
										</label>
									))}
								</div>
							</CardContent>
						</Card>
					)}

					{/* Download bar */}
					{selectedCourses.length > 0 && activeAssessment && (
						<Card className="border-l-4 border-l-purple-500">
							<CardContent className="py-3 px-4">
								<div className="flex items-center gap-3 flex-wrap">
									<FileText className="h-5 w-5 text-purple-500" />
									<span className="text-sm font-semibold">{selectedCourses.length} course{selectedCourses.length > 1 ? 's' : ''} selected</span>
									<Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-xs">{activeAssessment.round.round_name}</Badge>
									<div className="flex-1" />
									<Button
										onClick={handleGeneratePDF}
										disabled={generating}
										size="sm"
										className="bg-purple-600 hover:bg-purple-700"
									>
										{generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
										{generating ? 'Generating...' : 'Download PDF'}
									</Button>
								</div>
							</CardContent>
						</Card>
					)}
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
