'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb, BreadcrumbItem, BreadcrumbLink,
	BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
	Select, SelectContent, SelectItem,
	SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
	Table, TableBody, TableCell,
	TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useSessionSync } from '@/hooks/use-session-sync'
import { Award, Loader2, Save, Search, RefreshCw, CheckCircle, Clock } from 'lucide-react'
import type { SessionOption, CourseOfferingOption } from '@/types/credit-entry'

interface ProgramOption {
	program_id: string
	program_code: string
}

export default function CreditEntryPage() {
	const { toast } = useToast()
	const { isReady, institutionId } = useInstitutionFilter()

	// ── filter state ──────────────────────────────────────────
	const { selectedSessionId: sessionId, setSelectedSessionId: setSessionId, mustSelectSession } = useSessionSync()
	const [programId, setProgramId] = useState('')
	const [courseId, setCourseId] = useState('')
	const [courseOfferingId, setCourseOfferingId] = useState('')
	const [creditValue, setCreditValue] = useState<string>('')
	const [searchTerm, setSearchTerm] = useState('')

	// ── data state ────────────────────────────────────────────
	const [sessions, setSessions] = useState<SessionOption[]>([])
	const [programs, setPrograms] = useState<ProgramOption[]>([])
	const [courses, setCourses] = useState<CourseOfferingOption[]>([])
	const [students, setStudents] = useState<any[]>([])

	// ── loading state ─────────────────────────────────────────
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [saving, setSaving] = useState(false)

	// Load sessions when institution ready
	useEffect(() => {
		if (!isReady || !institutionId) return
		setLoadingSessions(true)
		fetch(`/api/marks/credit-entry?action=sessions&institutionId=${institutionId}`)
			.then(r => r.json())
			.then(data => setSessions(Array.isArray(data) ? data : []))
			.catch(() => toast({ title: 'Failed to load sessions', variant: 'destructive' }))
			.finally(() => setLoadingSessions(false))
	}, [isReady, institutionId])

	// Load programs when session changes
	useEffect(() => {
		if (!institutionId || !sessionId) { setPrograms([]); setProgramId(''); setCourses([]); setCourseId(''); return }
		setLoadingPrograms(true)
		fetch(`/api/marks/credit-entry?action=programs&institutionId=${institutionId}&sessionId=${sessionId}`)
			.then(r => r.json())
			.then(data => setPrograms(Array.isArray(data) ? data : []))
			.catch(() => toast({ title: 'Failed to load programs', variant: 'destructive' }))
			.finally(() => setLoadingPrograms(false))
	}, [institutionId, sessionId])

	// Load courses when program changes
	useEffect(() => {
		if (!institutionId || !sessionId || !programId) { setCourses([]); setCourseId(''); return }
		setLoadingCourses(true)
		fetch(`/api/marks/credit-entry?action=courses&institutionId=${institutionId}&sessionId=${sessionId}&programId=${programId}`)
			.then(r => r.json())
			.then(data => setCourses(Array.isArray(data) ? data : []))
			.catch(() => toast({ title: 'Failed to load courses', variant: 'destructive' }))
			.finally(() => setLoadingCourses(false))
	}, [institutionId, sessionId, programId])

	// Load students when course changes
	const loadStudents = useCallback(() => {
		if (!institutionId || !sessionId || !courseId || !courseOfferingId) { setStudents([]); return }
		setLoadingStudents(true)
		fetch(`/api/marks/credit-entry?action=students&institutionId=${institutionId}&sessionId=${sessionId}&courseId=${courseId}&courseOfferingId=${courseOfferingId}`)
			.then(r => r.json())
			.then(data => setStudents(data.students || []))
			.catch(() => toast({ title: 'Failed to load learners', variant: 'destructive' }))
			.finally(() => setLoadingStudents(false))
	}, [institutionId, sessionId, courseId, courseOfferingId])

	useEffect(() => { loadStudents() }, [loadStudents])

	// Assign credit to all learners
	const handleSave = async () => {
		const parsed = parseFloat(creditValue)
		if (!creditValue || isNaN(parsed) || parsed < 0) {
			toast({ title: 'Enter a valid credit value', variant: 'destructive' })
			return
		}
		if (!students.length) {
			toast({ title: 'No learners to assign credit to', variant: 'destructive' })
			return
		}

		setSaving(true)
		try {
			const payload = {
				institutions_id: institutionId,
				examination_session_id: sessionId,
				course_id: courseId,
				course_offering_id: courseOfferingId,
				program_id: programId,
				credit_value: parsed,
				entries: students.map(s => ({
					student_id: s.student_id,
					exam_registration_id: s.exam_registration_id,
					final_marks_id: s.final_marks_id,
					register_number: s.register_number,
				})),
			}

			const res = await fetch('/api/marks/credit-entry', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			const result = await res.json()

			if (result.successful > 0) {
				toast({
					title: '✅ Credit Assigned',
					description: `${result.successful} learner(s) assigned ${parsed} credit(s).`,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
				loadStudents()
			}
			if (result.failed > 0) {
				toast({
					title: '❌ Some failed',
					description: `${result.failed} learner(s) could not be updated.`,
					variant: 'destructive',
				})
			}
		} catch {
			toast({ title: 'Failed to assign credit', variant: 'destructive' })
		} finally {
			setSaving(false)
		}
	}

	const filteredStudents = students.filter(s =>
		!searchTerm || s.register_number?.toLowerCase().includes(searchTerm.toLowerCase())
	)
	const assignedCount = students.filter(s => s.already_assigned).length
	const pendingCount = students.length - assignedCount

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<div className="flex flex-col gap-6 p-6">

					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink href="/dashboard">Home</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Credit Entry</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Header */}
					<div>
						<h1 className="text-2xl font-bold flex items-center gap-2">
							<Award className="h-6 w-6 text-purple-600" />
							Credit Entry
						</h1>
						<p className="text-muted-foreground mt-1">
							Assign credit to learners for credit-type courses. No marks or grades — credit only.
						</p>
					</div>

					{/* Filters */}
					<Card>
						<CardHeader>
							<CardTitle>Select Course</CardTitle>
							<CardDescription>Only courses with result type = Credit are shown</CardDescription>
						</CardHeader>
						<CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
							{/* Session */}
							{mustSelectSession && (
							<div className="space-y-2">
								<label className="text-sm font-medium">Examination Session</label>
								<Select
									value={sessionId}
									onValueChange={v => { setSessionId(v); setProgramId(''); setCourseId(''); setCourseOfferingId('') }}
									disabled={loadingSessions || !isReady}
								>
									<SelectTrigger>
										<SelectValue placeholder={loadingSessions ? 'Loading...' : 'Select session'} />
									</SelectTrigger>
									<SelectContent>
										{sessions.map(s => (
											<SelectItem key={s.id} value={s.id}>
												{s.session_name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							)}

							{/* Program */}
							<div className="space-y-2">
								<label className="text-sm font-medium">Program</label>
								<Select
									value={programId}
									onValueChange={v => { setProgramId(v); setCourseId(''); setCourseOfferingId('') }}
									disabled={!sessionId || loadingPrograms}
								>
									<SelectTrigger>
										<SelectValue placeholder={
											!sessionId ? 'Select session first'
											: loadingPrograms ? 'Loading...'
											: programs.length === 0 ? 'No programs found'
											: 'Select program'
										} />
									</SelectTrigger>
									<SelectContent>
										{programs.map(p => (
											<SelectItem key={p.program_id} value={p.program_id}>
												{p.program_code}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Course */}
							<div className="space-y-2 lg:col-span-2">
								<label className="text-sm font-medium">Course</label>
								<Select
									value={courseId}
									onValueChange={(v) => {
										const co = courses.find(c => c.course_id === v)
										setCourseId(v)
										setCourseOfferingId(co?.id || '')
									}}
									disabled={!programId || loadingCourses}
								>
									<SelectTrigger>
										<SelectValue placeholder={
											!sessionId ? 'Select session first'
											: !programId ? 'Select program first'
											: loadingCourses ? 'Loading...'
											: courses.length === 0 ? 'No credit courses found'
											: 'Select course'
										} />
									</SelectTrigger>
									<SelectContent>
										{courses.map(c => (
											<SelectItem key={c.course_id} value={c.course_id}>
												{c.courses?.course_code} — {c.courses?.course_name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</CardContent>
					</Card>

					{/* Summary badges */}
					{courseId && !loadingStudents && students.length > 0 && (
						<div className="flex gap-3">
							<Badge className="bg-green-100 text-green-800 border-green-200 gap-1 px-3 py-1">
								<CheckCircle className="h-3.5 w-3.5" />
								{assignedCount} Assigned
							</Badge>
							<Badge variant="outline" className="text-amber-600 border-amber-300 gap-1 px-3 py-1">
								<Clock className="h-3.5 w-3.5" />
								{pendingCount} Pending
							</Badge>
						</div>
					)}

					{/* Student table */}
					{courseId && (
						<Card>
							<CardHeader className="flex flex-row items-center justify-between">
								<div>
									<CardTitle>Learners</CardTitle>
									<CardDescription>{filteredStudents.length} learner(s)</CardDescription>
								</div>
								<div className="flex gap-2">
									<div className="relative">
										<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
										<Input
											placeholder="Search register no..."
											className="pl-9 w-48"
											value={searchTerm}
											onChange={e => setSearchTerm(e.target.value)}
										/>
									</div>
									<Button variant="outline" size="icon" onClick={loadStudents} title="Refresh">
										<RefreshCw className="h-4 w-4" />
									</Button>
								</div>
							</CardHeader>
							<CardContent>
								{loadingStudents ? (
									<div className="flex justify-center py-12">
										<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
									</div>
								) : (
									<>
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="w-12">#</TableHead>
													<TableHead>Register No</TableHead>
													<TableHead>Status</TableHead>
													<TableHead>Current Credit</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{filteredStudents.length === 0 ? (
													<TableRow>
														<TableCell colSpan={4} className="text-center text-muted-foreground py-10">
															No learners found for this course.
														</TableCell>
													</TableRow>
												) : filteredStudents.map((s, idx) => (
													<TableRow key={s.exam_registration_id}>
														<TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
														<TableCell className="font-mono font-medium">{s.register_number}</TableCell>
														<TableCell>
															{s.already_assigned ? (
																<Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
																	<CheckCircle className="h-3 w-3" /> Assigned
																</Badge>
															) : (
																<Badge variant="outline" className="text-amber-600 border-amber-300 gap-1">
																	<Clock className="h-3 w-3" /> Pending
																</Badge>
															)}
														</TableCell>
														<TableCell>
															{s.credit_value != null ? (
																<span className="font-semibold text-purple-700 dark:text-purple-300">
																	{s.credit_value}
																</span>
															) : (
																<span className="text-muted-foreground text-sm">—</span>
															)}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>

										{/* Credit input + Save button at bottom */}
										{students.length > 0 && (
											<div className="flex items-center justify-end gap-3 pt-4 border-t mt-4">
												<label className="text-sm font-medium">Credit Value</label>
												<Input
													type="number"
													min={0}
													step={0.5}
													className="w-24"
													value={creditValue}
													onChange={e => setCreditValue(e.target.value)}
													placeholder="e.g. 3"
												/>
												<Button
													onClick={handleSave}
													disabled={saving || !creditValue}
													className="gap-2"
												>
													{saving
														? <Loader2 className="h-4 w-4 animate-spin" />
														: <Save className="h-4 w-4" />
													}
													Assign All ({students.length})
												</Button>
											</div>
										)}
									</>
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
