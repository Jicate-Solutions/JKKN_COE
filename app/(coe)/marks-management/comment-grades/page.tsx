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
import { Save, Loader2, MessageSquare, Search, RefreshCw, AlertCircle } from 'lucide-react'
import type {
	CommentGradeRow,
	CommentGradeOption,
	SessionOption,
	CourseOfferingOption,
} from '@/types/comment-grades'

interface ProgramOption {
	program_id: string
	program_code: string
}

export default function CommentGradeEntryPage() {
	const { toast } = useToast()
	const { isReady, institutionId } = useInstitutionFilter()

	// ── filter state ──────────────────────────────────────────
	const { selectedSessionId: sessionId, setSelectedSessionId: setSessionId, mustSelectSession } = useSessionSync()
	const [programId, setProgramId] = useState('')
	const [courseId, setCourseId] = useState('')
	const [courseOfferingId, setCourseOfferingId] = useState('')
	const [searchTerm, setSearchTerm] = useState('')

	// ── data state ────────────────────────────────────────────
	const [sessions, setSessions] = useState<SessionOption[]>([])
	const [programs, setPrograms] = useState<ProgramOption[]>([])
	const [courses, setCourses] = useState<CourseOfferingOption[]>([])
	const [gradeOptions, setGradeOptions] = useState<CommentGradeOption[]>([])
	const [students, setStudents] = useState<CommentGradeRow[]>([])

	// ── loading state ─────────────────────────────────────────
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [saving, setSaving] = useState(false)

	// Load sessions when institution is ready
	useEffect(() => {
		if (!isReady || !institutionId) return
		setLoadingSessions(true)
		fetch(`/api/marks/comment-grades?action=sessions&institutionId=${institutionId}`)
			.then(r => r.json())
			.then(data => setSessions(Array.isArray(data) ? data : []))
			.catch(() => toast({ title: 'Failed to load sessions', variant: 'destructive' }))
			.finally(() => setLoadingSessions(false))
	}, [isReady, institutionId])

	// Load grade options (from grades table, grade_category = 'comment')
	useEffect(() => {
		if (!institutionId) return
		fetch(`/api/grading/grades?grade_category=comment&institutions_id=${institutionId}`)
			.then(r => r.json())
			.then(data => setGradeOptions(Array.isArray(data) ? data : []))
	}, [institutionId])

	// Load programs when session changes
	useEffect(() => {
		if (!institutionId || !sessionId) { setPrograms([]); setProgramId(''); setCourses([]); setCourseId(''); return }
		setLoadingPrograms(true)
		fetch(`/api/marks/comment-grades?action=programs&institutionId=${institutionId}&sessionId=${sessionId}`)
			.then(r => r.json())
			.then(data => setPrograms(Array.isArray(data) ? data : []))
			.catch(() => toast({ title: 'Failed to load programs', variant: 'destructive' }))
			.finally(() => setLoadingPrograms(false))
	}, [institutionId, sessionId])

	// Load courses when program changes
	useEffect(() => {
		if (!institutionId || !sessionId || !programId) { setCourses([]); setCourseId(''); return }
		setLoadingCourses(true)
		fetch(`/api/marks/comment-grades?action=courses&institutionId=${institutionId}&sessionId=${sessionId}&programId=${programId}`)
			.then(r => r.json())
			.then(data => setCourses(Array.isArray(data) ? data : []))
			.catch(() => toast({ title: 'Failed to load courses', variant: 'destructive' }))
			.finally(() => setLoadingCourses(false))
	}, [institutionId, sessionId, programId])

	// Load students when course changes
	const loadStudents = useCallback(() => {
		if (!institutionId || !sessionId || !courseId || !courseOfferingId) { setStudents([]); return }
		setLoadingStudents(true)
		fetch(`/api/marks/comment-grades?action=students&institutionId=${institutionId}&sessionId=${sessionId}&courseId=${courseId}&courseOfferingId=${courseOfferingId}`)
			.then(r => r.json())
			.then(data => {
				const rows: CommentGradeRow[] = (data.students || []).map((s: any) => ({
					...s,
					new_grade: s.current_grade || '',
					is_modified: false,
					is_saving: false,
					error: null,
				}))
				setStudents(rows)
			})
			.catch(() => toast({ title: 'Failed to load learners', variant: 'destructive' }))
			.finally(() => setLoadingStudents(false))
	}, [institutionId, sessionId, courseId, courseOfferingId])

	useEffect(() => { loadStudents() }, [loadStudents])

	// Update grade for one row
	const handleGradeChange = (examRegId: string, grade: string) => {
		setStudents(prev => prev.map(s =>
			s.exam_registration_id === examRegId
				? { ...s, new_grade: grade, is_modified: grade !== (s.current_grade || '') }
				: s
		))
	}

	// Save all modified rows
	const handleSave = async () => {
		const modified = students.filter(s => s.is_modified && s.new_grade)
		if (!modified.length) {
			toast({ title: 'No changes', description: 'Select grades for learners first.' })
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
				entries: modified.map(s => ({
					student_id: s.student_id,
					exam_registration_id: s.exam_registration_id,
					final_marks_id: s.final_marks_id,
					register_number: s.register_number,
					grade: s.new_grade,
					description: gradeOptions.find(g => g.grade === s.new_grade)?.description || s.new_grade,
				})),
			}

			const res = await fetch('/api/marks/comment-grades', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			const result = await res.json()

			if (result.successful > 0) {
				toast({
					title: '✅ Grades Saved',
					description: `${result.successful} grade(s) saved successfully.`,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
				loadStudents()
			}
			if (result.failed > 0) {
				toast({
					title: '❌ Some grades failed',
					description: `${result.failed} grade(s) could not be saved.`,
					variant: 'destructive',
				})
			}
		} catch {
			toast({ title: 'Failed to save grades', variant: 'destructive' })
		} finally {
			setSaving(false)
		}
	}

	const filteredStudents = students.filter(s =>
		!searchTerm || s.register_number.toLowerCase().includes(searchTerm.toLowerCase())
	)
	const modifiedCount = students.filter(s => s.is_modified).length

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
								<BreadcrumbPage>Comment Grade Entry</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Header */}
					<div>
						<h1 className="text-2xl font-bold flex items-center gap-2">
							<MessageSquare className="h-6 w-6 text-blue-600" />
							Comment Grade Entry
						</h1>
						<p className="text-muted-foreground mt-1">
							Assign descriptive grades to learners for comment-type courses. Saves directly to final marks.
						</p>
					</div>

					{/* Grade options warning */}
					{gradeOptions.length === 0 && institutionId && (
						<div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
							<AlertCircle className="h-4 w-4 shrink-0" />
							No comment grades configured for this institution. Add grades with{' '}
							<strong>grade_category = &apos;comment&apos;</strong> in Grading → Grades.
						</div>
					)}

					{/* Filters */}
					<Card>
						<CardHeader>
							<CardTitle>Select Course</CardTitle>
							<CardDescription>Only courses with result type = Comment are shown</CardDescription>
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
											: courses.length === 0 ? 'No comment courses found'
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

					{/* Student table */}
					{courseId && (
						<Card>
							<CardHeader className="flex flex-row items-center justify-between">
								<div>
									<CardTitle>Learners</CardTitle>
									<CardDescription>
										{filteredStudents.length} learner(s)
										{modifiedCount > 0 && (
											<span className="ml-2 text-amber-600 font-medium">
												· {modifiedCount} unsaved change{modifiedCount !== 1 ? 's' : ''}
											</span>
										)}
									</CardDescription>
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
													<TableHead>Current Grade</TableHead>
													<TableHead>Assign Grade</TableHead>
													<TableHead className="w-28">Status</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{filteredStudents.length === 0 ? (
													<TableRow>
														<TableCell colSpan={5} className="text-center text-muted-foreground py-10">
															No learners found for this course.
														</TableCell>
													</TableRow>
												) : filteredStudents.map((student, idx) => (
													<TableRow
														key={student.exam_registration_id}
														className={student.is_modified ? 'bg-amber-50 dark:bg-amber-950/20' : ''}
													>
														<TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
														<TableCell className="font-mono font-medium">{student.register_number}</TableCell>
														<TableCell>
															{student.current_grade
																? <Badge variant="outline">{student.current_grade}</Badge>
																: <span className="text-muted-foreground text-sm">Not assigned</span>
															}
														</TableCell>
														<TableCell>
															<Select
																value={student.new_grade}
																onValueChange={(v) => handleGradeChange(student.exam_registration_id, v)}
																disabled={gradeOptions.length === 0}
															>
																<SelectTrigger className="w-52">
																	<SelectValue placeholder="Select grade..." />
																</SelectTrigger>
																<SelectContent>
																	{gradeOptions.map(g => (
																		<SelectItem key={g.id} value={g.grade}>
																			{g.grade}
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
														</TableCell>
														<TableCell>
															{student.is_modified ? (
																<Badge className="bg-amber-100 text-amber-800 border-amber-200">
																	Modified
																</Badge>
															) : student.current_grade ? (
																<Badge className="bg-green-100 text-green-800 border-green-200">
																	Saved
																</Badge>
															) : null}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>

										{/* Save button at bottom */}
										{modifiedCount > 0 && (
											<div className="flex justify-end pt-4 border-t mt-4">
												<Button onClick={handleSave} disabled={saving} className="gap-2">
													{saving
														? <Loader2 className="h-4 w-4 animate-spin" />
														: <Save className="h-4 w-4" />
													}
													Save {modifiedCount} Change{modifiedCount !== 1 ? 's' : ''}
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
