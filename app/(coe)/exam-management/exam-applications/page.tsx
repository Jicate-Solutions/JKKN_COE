'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSessionSync } from '@/hooks/use-session-sync'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/common/use-toast'
import Link from 'next/link'
import { ArrowLeft, Users, Loader2, Send, Search, ClipboardCheck, BookOpen, User, AlertTriangle, ListChecks, RefreshCw } from 'lucide-react'
import { useInstitution, type Institution } from '@/context/institution-context'
import { cn } from '@/lib/utils'
import type {
	ExamApplicationCourse,
	ExamApplicationLearner,
	ExamApplicationSubmitResult,
} from '@/types/exam-applications'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

const SOURCE_STYLES: Record<string, string> = {
	'Exam Registration': 'bg-indigo-100 text-indigo-700 border-indigo-200',
	'Backlog': 'bg-rose-100 text-rose-700 border-rose-200',
	'Offer List': 'bg-emerald-100 text-emerald-700 border-emerald-200',
	'Multiple Sources': 'bg-violet-100 text-violet-700 border-violet-200',
}

const ELIGIBILITY_STYLES: Record<string, string> = {
	'Eligible': 'bg-green-100 text-green-700 border-green-200',
	'Already Registered': 'bg-amber-100 text-amber-700 border-amber-200',
	'Already Passed': 'bg-slate-100 text-slate-600 border-slate-200',
	'Not Offered': 'bg-red-100 text-red-700 border-red-200',
	'Inactive Offering': 'bg-red-100 text-red-700 border-red-200',
	'Attempts Exhausted': 'bg-red-100 text-red-700 border-red-200',
	'Seats Full': 'bg-orange-100 text-orange-700 border-orange-200',
}

export default function ExamApplicationsPage() {
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

	const myjkknInstitutionIds: string[] = useMemo(() => {
		if (mustSelectInstitution) return selectedInstitution?.myjkkn_institution_ids || []
		return currentMyJKKNInstitutionIds || []
	}, [mustSelectInstitution, selectedInstitution, currentMyJKKNInstitutionIds])

	// Session
	const { selectedSessionId: sessionId, setSelectedSessionId: setSessionId, mustSelectSession } = useSessionSync()
	const [sessionCode, setSessionCode] = useState('')
	const { sessions, loading: loadingSessions } = useExamSessions({ institutionsId: institutionsId || null })

	// Learner search
	const [searchQuery, setSearchQuery] = useState('')
	const [searchResults, setSearchResults] = useState<ExamApplicationLearner[]>([])
	const [searching, setSearching] = useState(false)
	const [selectedLearner, setSelectedLearner] = useState<ExamApplicationLearner | null>(null)

	// Merged course list
	const [courses, setCourses] = useState<ExamApplicationCourse[]>([])
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
	const [submitting, setSubmitting] = useState(false)

	// Course table filters
	const [courseSearch, setCourseSearch] = useState('')
	const [sourceFilter, setSourceFilter] = useState('all')
	const [eligibilityFilter, setEligibilityFilter] = useState('all')

	const resetLearnerState = useCallback(() => {
		setSearchQuery('')
		setSearchResults([])
		setSelectedLearner(null)
		setCourses([])
		setSelectedKeys(new Set())
		setCourseSearch('')
		setSourceFilter('all')
		setEligibilityFilter('all')
	}, [])

	// Reset when institution changes
	useEffect(() => {
		setSessionId('')
		setSessionCode('')
		resetLearnerState()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [institutionsId])

	// Reset when session changes
	useEffect(() => {
		resetLearnerState()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId])

	// Keep session_code in sync with the globally selected session
	useEffect(() => {
		if (!sessionId) return
		const match = sessions.find(s => s.id === sessionId)
		if (match) setSessionCode(match.session_code || '')
	}, [sessionId, sessions])

	// -------------------------------------------------------------
	// Learner search (MyJKKN)
	// -------------------------------------------------------------
	const searchLearners = useCallback(async () => {
		const q = searchQuery.trim()
		if (!q || q.length < 2 || !sessionId) return

		setSearching(true)
		setSearchResults([])
		setSelectedLearner(null)
		setCourses([])
		setSelectedKeys(new Set())

		try {
			if (myjkknInstitutionIds.length === 0) {
				toast({ title: '⚠️ No MyJKKN Link', description: 'Institution is not linked to MyJKKN', variant: 'destructive' })
				return
			}

			const allResults: ExamApplicationLearner[] = []
			const seenIds = new Set<string>()
			const lower = q.toLowerCase()

			const allowedInstitutions = new Set(myjkknInstitutionIds)

			for (const myjkknInstId of myjkknInstitutionIds) {
				const params = new URLSearchParams({ institution_id: myjkknInstId, fetchAll: 'true' })
				const res = await fetch(`/api/myjkkn/learner-profiles?${params}`)
				if (!res.ok) continue
				const raw = await res.json()
				const list: any[] = raw?.data || raw || []

				// MyJKKN ignores the institution_id query filter and returns every learner
				// on the platform, so the response must be scoped here. Only trust the
				// field when the response actually carries it - some MyJKKN record shapes
				// strip institution_id, and filtering on a missing field would find nobody.
				const responseCarriesInstitution = list.some((s: any) => s?.institution_id)

				list.forEach((s: any) => {
					const id = s.id
					if (!id || seenIds.has(id)) return
					if (responseCarriesInstitution && allowedInstitutions.size > 0 && !allowedInstitutions.has(s.institution_id)) return
					const regNo = (s.register_number || '').toLowerCase()
					const fullName = `${s.first_name || ''} ${s.last_name || ''}`.trim().toLowerCase()
					if (!regNo.includes(lower) && !fullName.includes(lower)) return
					seenIds.add(id)
					allResults.push({
						id,
						register_number: s.register_number || s.roll_number || '',
						first_name: s.first_name || '',
						last_name: s.last_name || '',
						program_code: s.program_code || '',
						program_name: s.program_name || '',
						current_semester: s.current_semester || 0,
						institution_id: s.institution_id || '',
					})
				})
			}

			allResults.sort((a, b) => a.register_number.localeCompare(b.register_number))
			setSearchResults(allResults.slice(0, 20))

			if (allResults.length === 0) {
				toast({ title: 'No learners found', description: `Nothing matched "${q}"` })
			}
		} catch (err) {
			console.error('[ExamApplications] Search error:', err)
			toast({ title: '❌ Search Failed', description: 'Failed to search learners', variant: 'destructive' })
		} finally {
			setSearching(false)
		}
	}, [searchQuery, sessionId, myjkknInstitutionIds, toast])

	// -------------------------------------------------------------
	// Merged course list (Exam Registration + Backlog + Offer List)
	// -------------------------------------------------------------
	const loadCourses = useCallback(async (learner: ExamApplicationLearner) => {
		if (!institutionsId || !sessionId) return

		setLoadingCourses(true)
		setCourses([])
		setSelectedKeys(new Set())

		try {
			const params = new URLSearchParams({
				institutions_id: institutionsId,
				examination_session_id: sessionId,
			})
			if (learner.id) params.set('student_id', learner.id)
			if (learner.register_number) params.set('register_number', learner.register_number)
			if (learner.program_code) params.set('program_code', learner.program_code)
			if (learner.current_semester) params.set('semester', String(learner.current_semester))

			const res = await fetch(`/api/exam-management/exam-applications/courses?${params}`)
			const raw = await res.json()

			if (!res.ok) {
				throw new Error(raw?.error || 'Failed to build the course list')
			}

			setCourses(raw?.data || [])
		} catch (err) {
			console.error('[ExamApplications] Load courses error:', err)
			toast({
				title: '❌ Failed',
				description: err instanceof Error ? err.message : 'Failed to load courses for this learner',
				variant: 'destructive',
			})
		} finally {
			setLoadingCourses(false)
		}
	}, [institutionsId, sessionId, toast])

	const selectLearner = (learner: ExamApplicationLearner) => {
		setSelectedLearner(learner)
		setSearchResults([])
		loadCourses(learner)
	}

	// -------------------------------------------------------------
	// Selection
	// -------------------------------------------------------------
	const filteredCourses = useMemo(() => {
		const q = courseSearch.trim().toLowerCase()
		return courses.filter(c => {
			if (q && !c.course_code.toLowerCase().includes(q) && !c.course_name.toLowerCase().includes(q)) return false
			if (sourceFilter !== 'all' && !c.sources.includes(sourceFilter as any)) return false
			if (eligibilityFilter === 'eligible' && !c.is_eligible) return false
			if (eligibilityFilter === 'not_eligible' && c.is_eligible) return false
			return true
		})
	}, [courses, courseSearch, sourceFilter, eligibilityFilter])

	const selectableCourses = useMemo(() => filteredCourses.filter(c => c.is_eligible), [filteredCourses])
	const allChecked = selectableCourses.length > 0 && selectableCourses.every(c => selectedKeys.has(c.key))
	const someChecked = !allChecked && selectableCourses.some(c => selectedKeys.has(c.key))

	const toggleCourse = (course: ExamApplicationCourse) => {
		if (!course.is_eligible) return
		setSelectedKeys(prev => {
			const next = new Set(prev)
			if (next.has(course.key)) next.delete(course.key)
			else next.add(course.key)
			return next
		})
	}

	const toggleAll = () => {
		setSelectedKeys(prev => {
			const next = new Set(prev)
			if (allChecked) selectableCourses.forEach(c => next.delete(c.key))
			else selectableCourses.forEach(c => next.add(c.key))
			return next
		})
	}

	// -------------------------------------------------------------
	// Submit
	// -------------------------------------------------------------
	const handleSubmit = async () => {
		if (!selectedLearner || selectedKeys.size === 0) {
			toast({ title: '⚠️ Nothing selected', description: 'Select at least one eligible course', variant: 'destructive' })
			return
		}

		setSubmitting(true)
		try {
			const payload = {
				institutions_id: institutionsId,
				institution_code: institutionCode,
				examination_session_id: sessionId,
				session_code: sessionCode,
				student_id: selectedLearner.id,
				register_number: selectedLearner.register_number,
				student_name: `${selectedLearner.first_name} ${selectedLearner.last_name || ''}`.trim(),
				program_code: selectedLearner.program_code,
				semester: selectedLearner.current_semester,
				courses: courses
					.filter(c => selectedKeys.has(c.key))
					.map(c => ({ course_code: c.course_code, course_offering_id: c.course_offering_id })),
			}

			const res = await fetch('/api/exam-management/exam-applications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			const raw = await res.json()

			if (!res.ok && !raw?.summary) {
				throw new Error(raw?.error || 'Failed to submit the exam application')
			}

			const summary = raw?.summary || { created: 0, skipped: 0, failed: 0 }
			const parts: string[] = []
			if (summary.created) parts.push(`${summary.created} applied`)
			if (summary.skipped) parts.push(`${summary.skipped} already registered (skipped)`)
			if (summary.failed) parts.push(`${summary.failed} rejected`)

			if (summary.failed === 0) {
				toast({
					title: '✅ Application Submitted',
					description: parts.join(', ') || 'No changes',
					className: 'bg-green-50 border-green-200 text-green-800',
				})
			} else {
				const failedList: ExamApplicationSubmitResult[] = (raw?.results || []).filter((r: ExamApplicationSubmitResult) => r.status === 'failed')
				toast({
					title: '⚠️ Partially Submitted',
					description: `${parts.join(', ')} — ${failedList.slice(0, 3).map(f => `${f.course_code}: ${f.reason}`).join('; ')}`,
					variant: 'destructive',
				})
			}

			setSelectedKeys(new Set())
			await loadCourses(selectedLearner)
		} catch (err) {
			console.error('[ExamApplications] Submit error:', err)
			toast({
				title: '❌ Submit Failed',
				description: err instanceof Error ? err.message : 'Failed to submit the exam application',
				variant: 'destructive',
			})
		} finally {
			setSubmitting(false)
		}
	}

	// -------------------------------------------------------------
	// Stats
	// -------------------------------------------------------------
	const stats = useMemo(() => ({
		total: courses.length,
		eligible: courses.filter(c => c.is_eligible).length,
		backlog: courses.filter(c => c.is_backlog).length,
		registered: courses.filter(c => c.is_registered).length,
	}), [courses])

	const romanSemester = (value: number | null | undefined) =>
		value == null ? '—' : (ROMAN[value] || String(value))

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0">

						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem><BreadcrumbLink asChild><Link href="/dashboard">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem><BreadcrumbLink asChild><Link href="/exam-management/exam-registrations">Exam Registrations</Link></BreadcrumbLink></BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem><BreadcrumbPage>Exam Applications</BreadcrumbPage></BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						{/* Stats */}
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 flex-shrink-0">
							<Card className="border-l-4 border-l-violet-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{stats.total}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Courses</p>
										</div>
										<ListChecks className="h-5 w-5 text-violet-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight text-green-600">{stats.eligible}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Eligible</p>
										</div>
										<BookOpen className="h-5 w-5 text-green-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-rose-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight text-rose-600">{stats.backlog}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Backlog / Arrear</p>
										</div>
										<AlertTriangle className="h-5 w-5 text-rose-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight text-amber-600">{stats.registered}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Already Registered</p>
										</div>
										<ClipboardCheck className="h-5 w-5 text-amber-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight text-blue-600">{selectedKeys.size}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Selected</p>
										</div>
										<BookOpen className="h-5 w-5 text-blue-500/40" />
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Filters + Learner search */}
						<Card>
							<CardHeader className="px-4 py-3 border-b">
								<div className="flex items-center justify-between">
									<div>
										<h2 className="text-base font-semibold">Exam Application</h2>
										<p className="text-xs text-muted-foreground">
											Select a session and a learner — courses are merged from exam registrations, backlogs and the offer list
										</p>
									</div>
									<div className="flex items-center gap-2">
										<Link href="/exam-management/exam-applications/bulk">
											<Button variant="outline" size="sm" className="h-8 text-sm px-3 gap-1.5">
												<ListChecks className="h-3.5 w-3.5" />Bulk Application
											</Button>
										</Link>
										<Link href="/exam-management/exam-registrations">
											<Button variant="outline" size="sm" className="h-8 text-sm px-3 gap-1.5">
												<ArrowLeft className="h-3.5 w-3.5" />Registrations
											</Button>
										</Link>
									</div>
								</div>
							</CardHeader>
							<CardContent className="p-4 space-y-4">
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

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

									{mustSelectSession && (
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">Exam Session</Label>
											<Select
												value={sessionId}
												onValueChange={val => {
													const s = sessions.find(s => s.id === val)
													setSessionId(val)
													setSessionCode(s?.session_code || '')
												}}
												disabled={!institutionsId || loadingSessions}
											>
												<SelectTrigger className="h-8 text-sm">
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

									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Search Learner</Label>
										<div className="flex gap-2">
											<div className="relative flex-1">
												<Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
												<Input
													value={searchQuery}
													onChange={e => setSearchQuery(e.target.value)}
													onKeyDown={e => e.key === 'Enter' && searchLearners()}
													placeholder="Register no or name..."
													className="pl-8 h-9 text-sm"
													disabled={!sessionId}
												/>
											</div>
											<Button
												size="sm"
												variant="outline"
												onClick={searchLearners}
												disabled={!sessionId || !searchQuery.trim() || searching}
												className="h-9 px-3"
											>
												{searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
											</Button>
										</div>
									</div>
								</div>

								{/* Search results */}
								{searchResults.length > 0 && !selectedLearner && (
									<div className="border rounded-lg overflow-hidden">
										<div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
											{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found — click to select
										</div>
										<div className="divide-y max-h-52 overflow-y-auto">
											{searchResults.map(learner => (
												<button
													key={learner.id}
													onClick={() => selectLearner(learner)}
													className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors flex items-center gap-3"
												>
													<User className="h-4 w-4 text-slate-400 shrink-0" />
													<div className="min-w-0">
														<p className="text-sm font-medium font-mono">{learner.register_number}</p>
														<p className="text-xs text-muted-foreground truncate">
															{`${learner.first_name} ${learner.last_name || ''}`.trim()}
															{learner.program_code && (
																<span className="ml-2 text-slate-400">· {learner.program_code} · Sem {learner.current_semester}</span>
															)}
														</p>
													</div>
												</button>
											))}
										</div>
									</div>
								)}

								{/* Selected learner */}
								{selectedLearner && (
									<div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
										<User className="h-5 w-5 text-blue-500 shrink-0" />
										<div className="flex-1 min-w-0">
											<p className="text-sm font-semibold">{`${selectedLearner.first_name} ${selectedLearner.last_name || ''}`.trim()}</p>
											<p className="text-xs text-muted-foreground font-mono">{selectedLearner.register_number}</p>
										</div>
										<div className="flex gap-2 flex-wrap">
											{selectedLearner.program_code && <Badge variant="outline" className="text-xs">{selectedLearner.program_code}</Badge>}
											{selectedLearner.current_semester > 0 && (
												<Badge variant="outline" className="text-xs">Sem {romanSemester(selectedLearner.current_semester)}</Badge>
											)}
										</div>
										<Button
											variant="ghost"
											size="sm"
											className="h-7 text-xs text-slate-500 gap-1.5"
											onClick={() => loadCourses(selectedLearner)}
											disabled={loadingCourses}
										>
											<RefreshCw className={cn('h-3.5 w-3.5', loadingCourses && 'animate-spin')} />
											Refresh
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="h-7 text-xs text-slate-500"
											onClick={resetLearnerState}
										>
											Change
										</Button>
									</div>
								)}
							</CardContent>
						</Card>

						{/* Course list */}
						{selectedLearner && (
							<Card className="flex-1 flex flex-col min-h-0">
								<CardHeader className="px-4 py-3 border-b">
									<div className="flex items-center justify-between gap-3 flex-wrap">
										<div>
											<h2 className="text-base font-semibold">Application Courses</h2>
											<p className="text-xs text-muted-foreground">
												{loadingCourses
													? 'Merging exam registrations, backlogs and offer list...'
													: courses.length === 0
														? 'No courses found for this learner'
														: `${filteredCourses.length} of ${courses.length} courses · duplicates removed by course code`}
											</p>
										</div>
										<div className="flex items-center gap-2 flex-wrap">
											<div className="relative">
												<Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
												<Input
													value={courseSearch}
													onChange={e => setCourseSearch(e.target.value)}
													placeholder="Filter courses..."
													className="pl-8 h-8 text-sm w-48"
												/>
											</div>
											<Select value={sourceFilter} onValueChange={setSourceFilter}>
												<SelectTrigger className="h-8 text-sm w-44"><SelectValue /></SelectTrigger>
												<SelectContent>
													<SelectItem value="all">All Sources</SelectItem>
													<SelectItem value="Exam Registration">Exam Registration</SelectItem>
													<SelectItem value="Backlog">Backlog</SelectItem>
													<SelectItem value="Offer List">Offer List</SelectItem>
												</SelectContent>
											</Select>
											<Select value={eligibilityFilter} onValueChange={setEligibilityFilter}>
												<SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
												<SelectContent>
													<SelectItem value="all">All Eligibility</SelectItem>
													<SelectItem value="eligible">Eligible only</SelectItem>
													<SelectItem value="not_eligible">Not eligible</SelectItem>
												</SelectContent>
											</Select>
											<Button
												size="sm"
												onClick={handleSubmit}
												disabled={submitting || selectedKeys.size === 0}
												className="h-8 text-sm px-4 gap-1.5 disabled:opacity-50"
											>
												{submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
												Submit {selectedKeys.size > 0 ? `(${selectedKeys.size})` : ''}
											</Button>
										</div>
									</div>
								</CardHeader>

								{loadingCourses ? (
									<div className="flex flex-col items-center gap-2 text-muted-foreground py-20">
										<Loader2 className="h-5 w-5 animate-spin" />
										<span className="text-sm">Building the merged course list...</span>
									</div>
								) : filteredCourses.length === 0 ? (
									<div className="flex flex-col items-center gap-2 text-muted-foreground py-20">
										<BookOpen className="h-8 w-8 opacity-20" />
										<span className="text-sm">
											{courses.length === 0
												? 'No exam registrations, backlogs or offered courses found for this learner'
												: 'No courses match the current filters'}
										</span>
									</div>
								) : (
									<div className="overflow-x-auto">
										<table className="w-full text-sm">
											<thead>
												<tr className="bg-muted/50">
													<th className="px-5 py-3 text-left w-10">
														<Checkbox
															checked={allChecked}
															// @ts-ignore - shadcn checkbox indeterminate visual state
															data-state={someChecked ? 'indeterminate' : allChecked ? 'checked' : 'unchecked'}
															onCheckedChange={toggleAll}
															disabled={selectableCourses.length === 0}
															className="border-slate-400"
														/>
													</th>
													<th className="px-3 py-3 text-center text-xs font-semibold w-12">#</th>
													<th className="px-3 py-3 text-left text-xs font-semibold w-36">Course Code</th>
													<th className="px-3 py-3 text-left text-xs font-semibold">Course Name</th>
													<th className="px-3 py-3 text-center text-xs font-semibold w-24">Semester</th>
													<th className="px-3 py-3 text-left text-xs font-semibold w-36">Course Type</th>
													<th className="px-3 py-3 text-center text-xs font-semibold w-44">Source</th>
													<th className="px-4 py-3 text-center text-xs font-semibold w-52">Eligibility</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-50">
												{filteredCourses.map((course, idx) => {
													const isChecked = selectedKeys.has(course.key)
													return (
														<tr
															key={course.key}
															onClick={() => toggleCourse(course)}
															className={cn(
																'transition-colors',
																!course.is_eligible
																	? 'opacity-60 bg-slate-50/40 cursor-not-allowed'
																	: isChecked
																		? 'bg-blue-50 hover:bg-blue-50/80 cursor-pointer'
																		: 'hover:bg-slate-50/60 cursor-pointer'
															)}
														>
															<td className="px-5 py-2.5" onClick={e => e.stopPropagation()}>
																<Checkbox
																	checked={isChecked && course.is_eligible}
																	onCheckedChange={() => toggleCourse(course)}
																	disabled={!course.is_eligible}
																	className="border-slate-300"
																/>
															</td>
															<td className="px-3 py-2.5 text-center text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
															<td className="px-3 py-2.5">
																<span className="text-sm font-medium font-mono">{course.course_code || '—'}</span>
															</td>
															<td className="px-3 py-2.5 text-sm">
																{course.course_name || '—'}
																{course.is_backlog && course.original_semester != null && (
																	<span className="ml-2 text-xs text-rose-500">
																		(arrear from Sem {romanSemester(course.original_semester)}, attempt {course.attempt_number})
																	</span>
																)}
															</td>
															<td className="px-3 py-2.5 text-center text-sm tabular-nums">{romanSemester(course.semester)}</td>
															<td className="px-3 py-2.5 text-sm text-muted-foreground">{course.course_type || '—'}</td>
															<td className="px-3 py-2.5 text-center">
																<Badge
																	className={cn(
																		'text-xs font-normal border',
																		SOURCE_STYLES[course.source_label] || 'bg-slate-100 text-slate-600 border-slate-200'
																	)}
																	title={course.sources.join(', ')}
																>
																	{course.source_label}
																</Badge>
															</td>
															<td className="px-4 py-2.5 text-center">
																<Badge
																	className={cn(
																		'text-xs font-normal border',
																		ELIGIBILITY_STYLES[course.eligibility_status] || 'bg-slate-100 text-slate-600 border-slate-200'
																	)}
																	title={course.eligibility_reason || ''}
																>
																	{course.eligibility_status}
																</Badge>
															</td>
														</tr>
													)
												})}
											</tbody>
										</table>
									</div>
								)}
							</Card>
						)}

						{/* Empty state */}
						{!selectedLearner && (
							<Card>
								<div className="flex flex-col items-center gap-2 text-muted-foreground py-20">
									<Users className="h-8 w-8 opacity-20" />
									<span className="text-sm">
										{sessionId
											? 'Search and select a learner to build their exam application'
											: 'Select an exam session to begin'}
									</span>
								</div>
							</Card>
						)}

					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
