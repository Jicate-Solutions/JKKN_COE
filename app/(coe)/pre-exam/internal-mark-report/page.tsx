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
import { Download, Loader2, Check, ChevronsUpDown, FileText } from "lucide-react"

interface Institution { id: string; name: string; institution_code: string; myjkkn_institution_ids: string[] }
interface Session { id: string; session_name: string; session_code: string; institutions_id?: string }
interface Program { id: string; program_code: string; program_name: string; program_type: string | null; program_order: number | null }
interface CourseOffering { course_offering_id: string; course_id: string; course_code: string; course_name: string; internal_max_mark: number; course_order: number; program_id: string; program_code: string; semester: number; course_category: string | null }
interface AssessmentOption { id: string; label: string; setting: any; round: any }

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

	// Assessment → Programs
	useEffect(() => {
		setSelectedProgram(""); setAvailableSemesters([]); setSelectedSemester("")
		setCourseOfferings([]); setSelectedCourses([])
		if (isReady && effectiveInstitutionId && effectiveSession && selectedAssessment && institutions.length > 0) fetchPrograms()
		else setPrograms([])
	}, [selectedAssessment])

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

	// ===== Consolidated PDF =====
	const [activeTab, setActiveTab] = useState('course-wise')
	// Multi-semester selection (shared with main Semester dropdown)
	const [multiSemesters, setMultiSemesters] = useState<number[]>([])
	const [semesterPopoverOpen, setSemesterPopoverOpen] = useState(false)

	// Reset multi-semester when program changes
	useEffect(() => {
		setMultiSemesters([])
		setCourseOfferings([])
		setSelectedCourses([])
	}, [selectedProgram])

	// Fetch courses from all selected semesters (for Course-Wise tab)
	useEffect(() => {
		if (isReady && effectiveInstitutionId && effectiveSession && selectedProgram && multiSemesters.length > 0) {
			const prog = programs.find(p => p.id === selectedProgram)
			if (prog?.program_code) {
				const cats: string[] = Array.isArray(activeAssessment?.setting?.course_type) ? activeAssessment.setting.course_type : []
				fetchCoursesForSemesters(prog.program_code, multiSemesters, cats)
			}
		} else {
			setCourseOfferings([])
			setSelectedCourses([])
		}
	}, [multiSemesters, selectedProgram])

	const handleConsolidatedPDF = async () => {
		if (!activeAssessment || !effectiveSession || !selectedProgram || multiSemesters.length === 0) {
			toast({ title: '❌ Select Assessment, Program, and at least one Semester', variant: 'destructive' }); return
		}
		try {
			setGenerating(true)
			const prog = programs.find(p => p.id === selectedProgram)
			if (!prog) return

			// Fetch data for each selected semester in parallel
			const semesterResults = await Promise.all(
				multiSemesters.sort((a, b) => a - b).map(async (sem) => {
					const res = await fetch(`/api/pre-exam/internal-mark-report?action=consolidated&institutions_id=${effectiveInstitutionId}&examination_session_id=${effectiveSession}&program_code=${prog.program_code}&semester=${sem}&cia_round=${activeAssessment.round.round}`)
					if (!res.ok) return null
					const data = await res.json()
					return {
						semester: sem,
						courses: data.courses || [],
						learners: data.learners || [],
					}
				})
			)

			// Filter out empty semesters
			const validSemesters = semesterResults.filter(s => s && s.learners.length > 0) as { semester: number, courses: any[], learners: any[] }[]

			if (validSemesters.length === 0) {
				toast({ title: '❌ No data found for selected semesters', variant: 'destructive' }); return
			}

			const loadImage = async (url: string): Promise<string> => {
				try { const r = await fetch(url); const blob = await r.blob(); return new Promise((res, rej) => { const reader = new FileReader(); reader.onloadend = () => res(reader.result as string); reader.onerror = rej; reader.readAsDataURL(blob) }) } catch { return '' }
			}
			const [leftLogo, rightLogo] = await Promise.all([loadImage('/jkkncas_logo.png'), loadImage('/jkkn_logo.png')])
			const institution = institutions.find(i => i.id === effectiveInstitutionId)

			const { generateConsolidatedInternalMarksPDF } = await import('@/lib/utils/generate-consolidated-internal-marks-pdf')
			generateConsolidatedInternalMarksPDF({
				institution_name: institution?.name || '',
				program_code: prog.program_code,
				program_name: prog.program_name,
				exam_session: sessions.find(s => s.id === effectiveSession)?.session_name || '',
				assessment_name: activeAssessment.setting.setting_name,
				cia_round_name: activeAssessment.round.round_name,
				semesters: validSemesters,
				logoImage: leftLogo,
				rightLogoImage: rightLogo,
			})

			const skipped = multiSemesters.length - validSemesters.length
			toast({
				title: '✅ Consolidated Report Generated',
				description: `${validSemesters.length} semester(s) included${skipped > 0 ? `, ${skipped} skipped (no data)` : ''}`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (error) {
			console.error('Consolidated PDF error:', error)
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
						<CardContent>
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

								{/* Assessment — no date filtering */}
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

								{/* Program */}
								<div className="space-y-1 min-w-[150px] flex-1">
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

								{/* Semester — multi-select */}
								<div className="space-y-1 min-w-[150px] flex-1">
									<label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										Semester <span className="text-red-500">*</span>
										{activeTab === 'consolidated' && <span className="ml-1 text-[10px] font-normal normal-case text-indigo-600">(multi)</span>}
									</label>
									<Popover open={semesterPopoverOpen} onOpenChange={setSemesterPopoverOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												className="w-full justify-between h-10 text-sm font-normal"
												disabled={availableSemesters.length === 0}
											>
												<span className="truncate">
													{availableSemesters.length === 0
														? 'Select Program first'
														: multiSemesters.length === 0
															? 'Select Semester'
															: multiSemesters.length === 1
																? `Semester ${multiSemesters[0]}`
																: `${multiSemesters.length} semesters`}
												</span>
												<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[240px] p-0" align="start">
											<div className="p-2 border-b flex items-center justify-between">
												<span className="text-xs font-medium">{multiSemesters.length} selected</span>
												<div className="flex gap-2">
													<Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setMultiSemesters([...availableSemesters])}>All</Button>
													<span className="text-xs text-muted-foreground">|</span>
													<Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setMultiSemesters([])}>Clear</Button>
												</div>
											</div>
											<div className="p-2 max-h-60 overflow-auto space-y-1">
												{availableSemesters.map(sem => (
													<label key={sem} className={cn(
														"flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-sm",
														multiSemesters.includes(sem) ? "bg-indigo-50" : "hover:bg-muted"
													)}>
														<Checkbox
															checked={multiSemesters.includes(sem)}
															onCheckedChange={(checked) => {
																setMultiSemesters(prev => checked
																	? [...prev, sem].sort((a, b) => a - b)
																	: prev.filter(s => s !== sem)
																)
															}}
														/>
														<span>Semester {sem}</span>
													</label>
												))}
											</div>
										</PopoverContent>
									</Popover>
								</div>

							</div>
						</CardContent>
					</Card>

					{/* Report Type Tabs — always visible once assessment selected */}
					{activeAssessment && (
						<Tabs value={activeTab} onValueChange={setActiveTab}>
							<TabsList>
								<TabsTrigger value="course-wise">Course Wise</TabsTrigger>
								<TabsTrigger value="consolidated">Consolidated</TabsTrigger>
							</TabsList>

							{/* ─── Course Wise Tab ─── */}
							<TabsContent value="course-wise" className="space-y-4 mt-4">
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
										<CardContent className="pt-0 space-y-4">
											{(() => {
												// Group courses by semester
												const bySem = new Map<number, typeof courseOfferings>()
												for (const co of courseOfferings) {
													const sem = (co as any).semester || 0
													if (!bySem.has(sem)) bySem.set(sem, [])
													bySem.get(sem)!.push(co)
												}
												const sortedSems = [...bySem.keys()].sort((a, b) => a - b)

												return sortedSems.map(sem => {
													const semCourses = bySem.get(sem) || []
													const semCourseIds = semCourses.map(c => c.course_offering_id)
													const allSelected = semCourseIds.every(id => selectedCourses.includes(id))
													return (
														<div key={sem} className="space-y-2">
															<div className="flex items-center justify-between border-b pb-1">
																<div className="flex items-center gap-2">
																	<Badge variant="secondary" className="text-xs">Semester {sem}</Badge>
																	<span className="text-xs text-muted-foreground">{semCourses.length} courses</span>
																</div>
																<Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => {
																	setSelectedCourses(prev => {
																		const set = new Set(prev)
																		if (allSelected) semCourseIds.forEach(id => set.delete(id))
																		else semCourseIds.forEach(id => set.add(id))
																		return [...set]
																	})
																}}>
																	{allSelected ? 'Deselect' : 'Select'} Sem {sem}
																</Button>
															</div>
															<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
																{semCourses.map(co => (
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
														</div>
													)
												})
											})()}
										</CardContent>
									</Card>
								)}
								{selectedCourses.length > 0 && activeAssessment && (
									<Card className="border-l-4 border-l-purple-500">
										<CardContent className="py-3 px-4">
											<div className="flex items-center gap-3 flex-wrap">
												<FileText className="h-5 w-5 text-purple-500" />
												<span className="text-sm font-semibold">{selectedCourses.length} course{selectedCourses.length > 1 ? 's' : ''} selected</span>
												<Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-xs">{activeAssessment.round.round_name}</Badge>
												<div className="flex-1" />
												<Button onClick={handleGeneratePDF} disabled={generating} size="sm" className="bg-purple-600 hover:bg-purple-700">
													{generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
													{generating ? 'Generating...' : 'Download PDF'}
												</Button>
											</div>
										</CardContent>
									</Card>
								)}
							</TabsContent>

							{/* ─── Consolidated Tab ─── */}
							<TabsContent value="consolidated" className="mt-4">
								<Card className="border-l-4 border-l-indigo-500">
									<CardContent className="py-4 px-4">
										<div className="flex items-center gap-3 flex-wrap">
											<FileText className="h-5 w-5 text-indigo-500" />
											<div className="flex-1 min-w-0">
												<span className="text-sm font-semibold block">Consolidated Report</span>
												<span className="text-xs text-muted-foreground">
													{!selectedProgram
														? 'Select Program to continue'
														: multiSemesters.length === 0
															? 'Select at least one Semester from the Semester dropdown above'
															: (() => {
																const p = programs.find(p => p.id === selectedProgram)
																return `${p?.program_code || ''} - ${p?.program_name || ''} | Semesters: ${multiSemesters.sort((a, b) => a - b).join(', ')} | ${activeAssessment.round.round_name} — each semester prints on a new page`
															})()}
												</span>
											</div>
											<Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 text-xs shrink-0">
												{multiSemesters.length} sem{multiSemesters.length !== 1 ? 's' : ''}
											</Badge>
											<Button
												onClick={handleConsolidatedPDF}
												disabled={generating || !selectedProgram || multiSemesters.length === 0}
												size="sm"
												className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
											>
												{generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
												{generating ? 'Generating...' : 'Download PDF'}
											</Button>
										</div>
									</CardContent>
								</Card>
							</TabsContent>
						</Tabs>
					)}
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
