'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from '@/components/ui/command'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/common/use-toast'
import { FlaskConical, Save, Check, ChevronsUpDown, Users, AlertTriangle, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Institution {
	id: string
	name: string
	institution_code: string
}

interface Session {
	id: string
	session_name: string
	session_code: string
}

interface Course {
	id: string
	course_code: string
	course_name: string
	external_max_mark: number | null
}

interface Batch {
	id: string
	exam_date: string
	session: string
	exam_time: string | null
	batch_capacity: number
	batch_no: number
}

interface Student {
	serial_number: number
	exam_registration_id: string
	register_number: string
	student_name: string
	is_regular: boolean
	program_code: string | null
	total_marks_obtained: number | null
	status: string | null
	evaluator_remarks: string | null
	has_existing_marks: boolean
	is_absent_in_attendance: boolean
}

interface CourseDetails {
	course_code: string
	course_name: string
	maximum_marks: number
	minimum_pass_marks: number
}

interface Examiners {
	internal: { name: string } | null
	external: { name: string; designation: string | null; institution: string | null } | null
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function PracticalMarkEntryPage() {
	const { toast } = useToast()

	// Institution filter hook — provides role-based filtering
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [courses, setCourses] = useState<Course[]>([])
	const [batches, setBatches] = useState<Batch[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('')
	const [selectedSessionId, setSelectedSessionId] = useState<string>('')
	const [selectedCourseId, setSelectedCourseId] = useState<string>('')
	const [selectedBatchId, setSelectedBatchId] = useState<string>('')

	// Combobox open states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)

	// Mark entry states
	const [students, setStudents] = useState<Student[]>([])
	const [courseDetails, setCourseDetails] = useState<CourseDetails | null>(null)
	const [examiners, setExaminers] = useState<Examiners | null>(null)

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [loadingBatches, setLoadingBatches] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [saving, setSaving] = useState(false)

	// View mode state (read-only after saving marks)
	const [isViewMode, setIsViewMode] = useState(false)

	// Effective institution ID — from explicit selection or from context
	const effectiveInstitutionId = selectedInstitutionId || contextInstitutionId || ''

	// ---------------------------------------------------------------------------
	// Auto-fill institution for non-super-admin
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId])

	// ---------------------------------------------------------------------------
	// Load institutions (only when super_admin views "All Institutions")
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && mustSelectInstitution) {
			loadInstitutions()
		}
	}, [isReady, mustSelectInstitution])

	// ---------------------------------------------------------------------------
	// Cascading load effects
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && effectiveInstitutionId) {
			loadSessions(effectiveInstitutionId)
			resetDependentFields(['session', 'course', 'batch'])
		}
	}, [isReady, effectiveInstitutionId])

	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId) {
			loadCourses(effectiveInstitutionId, selectedSessionId)
			resetDependentFields(['course', 'batch'])
		}
	}, [isReady, selectedSessionId])

	useEffect(() => {
		if (isReady && selectedCourseId && effectiveInstitutionId && selectedSessionId) {
			loadBatches(effectiveInstitutionId, selectedSessionId, selectedCourseId)
			resetDependentFields(['batch'])
		}
	}, [isReady, selectedCourseId])

	// ---------------------------------------------------------------------------
	// Reset helpers
	// ---------------------------------------------------------------------------

	const resetDependentFields = (fields: string[]) => {
		if (fields.includes('session')) {
			setSelectedSessionId('')
			setSessions([])
		}
		if (fields.includes('course')) {
			setSelectedCourseId('')
			setCourses([])
		}
		if (fields.includes('batch')) {
			setSelectedBatchId('')
			setBatches([])
		}
		setStudents([])
		setCourseDetails(null)
		setExaminers(null)
		setIsViewMode(false)
	}

	// ---------------------------------------------------------------------------
	// Data loaders
	// ---------------------------------------------------------------------------

	const loadInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/post-exam/practical-marks?action=institutions')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load institutions')
			const data = await response.json()
			setInstitutions(data)
		} catch {
			toast({
				title: '❌ Error',
				description: 'Failed to load institutions',
				variant: 'destructive',
			})
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, toast])

	const loadSessions = useCallback(async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			const url = appendToUrl(
				`/api/post-exam/practical-marks?action=sessions&institutionId=${institutionId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load sessions')
			const data = await response.json()
			setSessions(data)
		} catch {
			toast({
				title: '❌ Error',
				description: 'Failed to load examination sessions',
				variant: 'destructive',
			})
		} finally {
			setLoadingSessions(false)
		}
	}, [appendToUrl, toast])

	const loadCourses = useCallback(async (institutionId: string, sessionId: string) => {
		try {
			setLoadingCourses(true)
			const url = appendToUrl(
				`/api/post-exam/practical-marks?action=practical-courses` +
				`&institutionId=${institutionId}` +
				`&sessionId=${sessionId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load courses')
			const data = await response.json()
			setCourses(data)
		} catch {
			toast({
				title: '❌ Error',
				description: 'Failed to load practical courses',
				variant: 'destructive',
			})
		} finally {
			setLoadingCourses(false)
		}
	}, [appendToUrl, toast])

	const loadBatches = useCallback(async (
		institutionId: string,
		sessionId: string,
		courseId: string
	) => {
		try {
			setLoadingBatches(true)
			const url = appendToUrl(
				`/api/post-exam/practical-marks?action=practical-batches` +
				`&institutionId=${institutionId}` +
				`&sessionId=${sessionId}` +
				`&courseId=${courseId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load batches')
			const data = await response.json()
			setBatches(data)
		} catch {
			toast({
				title: '❌ Error',
				description: 'Failed to load practical batches',
				variant: 'destructive',
			})
		} finally {
			setLoadingBatches(false)
		}
	}, [appendToUrl, toast])

	const loadBatchStudents = useCallback(async (timetableId: string) => {
		if (!effectiveInstitutionId || !selectedSessionId || !selectedCourseId || !timetableId) return

		try {
			setLoadingStudents(true)
			const response = await fetch(
				`/api/post-exam/practical-marks?action=batch-students` +
				`&institutionId=${effectiveInstitutionId}` +
				`&sessionId=${selectedSessionId}` +
				`&courseId=${selectedCourseId}` +
				`&timetableId=${timetableId}`
			)

			if (!response.ok) {
				const err = await response.json()
				throw new Error(err.error || 'Failed to load learners')
			}

			const data = await response.json()
			setStudents(data.students || [])
			setCourseDetails(data.course_details || null)
			setExaminers(data.examiners || null)

			toast({
				title: '✅ Learners Loaded',
				description: `Loaded ${data.students?.length ?? 0} learners for this batch`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (err) {
			toast({
				title: '❌ Error',
				description: err instanceof Error ? err.message : 'Failed to load learners',
				variant: 'destructive',
			})
		} finally {
			setLoadingStudents(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, selectedCourseId, toast])

	// ---------------------------------------------------------------------------
	// Batch selection — auto-load students when batch is selected
	// ---------------------------------------------------------------------------

	const handleBatchSelect = (batchId: string) => {
		setSelectedBatchId(batchId)
		setStudents([])
		setCourseDetails(null)
		if (batchId) {
			loadBatchStudents(batchId)
		}
	}

	// ---------------------------------------------------------------------------
	// Student mark update helper
	// ---------------------------------------------------------------------------

	const updateStudent = (idx: number, updates: Partial<Student>) => {
		if (isViewMode) return
		setStudents(prev => {
			const next = [...prev]
			next[idx] = { ...next[idx], ...updates }
			return next
		})
	}

	// ---------------------------------------------------------------------------
	// Save handler
	// ---------------------------------------------------------------------------

	const handleSave = async () => {
		const maxMarks = courseDetails?.maximum_marks || 100

		// Validate: marks exceeding maximum
		const invalidMarks = students.filter(
			s => s.status === 'Present' && s.total_marks_obtained !== null && s.total_marks_obtained > maxMarks
		)
		if (invalidMarks.length > 0) {
			toast({
				title: '❌ Validation Error',
				description: `${invalidMarks.length} learner(s) have marks exceeding the maximum of ${maxMarks}`,
				variant: 'destructive',
			})
			return
		}

		// Collect all students to save: present with marks + absent students
		const marksToSave = students
			.filter(s => {
				// Include absent students (save with AB status)
				if (s.is_absent_in_attendance || s.status === 'AB') return true
				// Include present students that have marks entered
				if (s.status === 'Present' && s.total_marks_obtained !== null) return true
				return false
			})
			.map(s => {
				const isAbsent = s.is_absent_in_attendance || s.status === 'AB'
				return {
					exam_registration_id: s.exam_registration_id,
					register_number: s.register_number,
					total_marks_obtained: isAbsent ? null : s.total_marks_obtained,
					status: isAbsent ? 'AB' : s.status,
				}
			})

		if (marksToSave.length === 0) {
			toast({
				title: '⚠️ No Data to Save',
				description: 'No marks entered and no absent learners found',
				variant: 'destructive',
			})
			return
		}

		setSaving(true)
		try {
			const response = await fetch('/api/post-exam/practical-marks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: effectiveInstitutionId,
					examination_session_id: selectedSessionId,
					course_id: selectedCourseId,
					timetable_id: selectedBatchId,
					marks: marksToSave,
				}),
			})

			const result = await response.json()

			if (response.ok && result.success) {
				const allAbsent = marksToSave.every(m => m.status === 'AB')
				toast({
					title: allAbsent ? '✅ Data Saved' : '✅ Marks Saved',
					description: allAbsent
						? 'All learners marked as absent. Data saved successfully.'
						: `${result.saved} of ${result.total} marks saved successfully`,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
				// Switch to view mode
				setIsViewMode(true)
				// Auto-download PDF after successful save (fetches fresh data from API)
				await generatePDF()
			} else {
				toast({
					title: '❌ Save Failed',
					description: result.error || 'Failed to save marks',
					variant: 'destructive',
				})
			}
		} catch {
			toast({
				title: '❌ Error',
				description: 'Network error while saving marks',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}

	// ---------------------------------------------------------------------------
	// PDF generation
	// ---------------------------------------------------------------------------

	const generatePDF = async () => {
		if (!selectedBatchId || !effectiveInstitutionId || !selectedSessionId || !selectedCourseId) return

		try {
			const { generatePracticalMarksPDF } = await import('@/lib/utils/generate-practical-marks-pdf')

			// Fetch fresh data from API to get evaluator_remarks from DB
			const freshResponse = await fetch(
				`/api/post-exam/practical-marks?action=batch-students` +
				`&institutionId=${effectiveInstitutionId}` +
				`&sessionId=${selectedSessionId}` +
				`&courseId=${selectedCourseId}` +
				`&timetableId=${selectedBatchId}`
			)
			if (!freshResponse.ok) throw new Error('Failed to fetch fresh data for PDF')
			const freshData = await freshResponse.json()
			const freshStudents = freshData.students || []
			const freshCourseDetails = freshData.course_details
			const freshExaminers = freshData.examiners

			if (freshStudents.length === 0 || !freshCourseDetails) return

			const now = new Date()
			const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
			const examMonthYear = `${monthNames[now.getMonth()]}, ${now.getFullYear()}`
			const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`

			// Get batch label
			const selectedBatch = batches.find(b => b.id === selectedBatchId)
			const batchLabel = selectedBatch ? getBatchLabel(selectedBatch) : 'Unknown Batch'

			// Load logos as base64
			const loadImageAsBase64 = async (url: string): Promise<string> => {
				const response = await fetch(url)
				const blob = await response.blob()
				return new Promise((resolve, reject) => {
					const reader = new FileReader()
					reader.onloadend = () => resolve(reader.result as string)
					reader.onerror = reject
					reader.readAsDataURL(blob)
				})
			}

			const [leftLogo, rightLogo] = await Promise.all([
				loadImageAsBase64('/jkkncas_logo.png'),
				loadImageAsBase64('/jkkn_logo.png')
			])

			const pdfData = {
				course_code: freshCourseDetails.course_code,
				course_name: freshCourseDetails.course_name,
				maximum_marks: freshCourseDetails.maximum_marks,
				minimum_pass_marks: freshCourseDetails.minimum_pass_marks,
				batch_label: batchLabel,
				exam_date: dateStr,
				exam_month_year: examMonthYear,
				students: freshStudents.map((s: any) => ({
					serial_number: s.serial_number,
					register_number: s.register_number,
					student_name: s.student_name,
					total_marks_obtained: s.total_marks_obtained,
					status: s.status,
					evaluator_remarks: s.evaluator_remarks,
				})),
				logoImage: leftLogo,
				rightLogoImage: rightLogo,
				internalExaminer: freshExaminers?.internal || null,
				externalExaminer: freshExaminers?.external || null,
			}

			const fileName = generatePracticalMarksPDF(pdfData)

			toast({
				title: '✅ PDF Downloaded',
				description: `Marks sheet saved as ${fileName}`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('PDF generation error:', error)
			toast({
				title: '❌ PDF Generation Failed',
				description: error instanceof Error ? error.message : 'Failed to generate PDF',
				variant: 'destructive',
			})
		}
	}

	// ---------------------------------------------------------------------------
	// Derived summary stats
	// ---------------------------------------------------------------------------

	const totalEntered = students.filter(s => s.status !== null).length
	const totalPresent = students.filter(s => s.status === 'Present').length
	const totalAbsent = students.filter(s => s.status === 'AB').length

	// Batch label helper
	const getBatchLabel = (batch: Batch): string => {
		const date = batch.exam_date
			? new Date(batch.exam_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
			: ''
		return `Batch ${batch.batch_no} — ${date} ${batch.session}${batch.batch_capacity ? ` (Cap: ${batch.batch_capacity})` : ''}`
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader>
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/dashboard">Dashboard</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="#">Post-Exam</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Practical Mark Entry</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex-1 p-4 space-y-4 overflow-auto">

					{/* Page header */}
					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
							<FlaskConical className="h-5 w-5 text-violet-600 dark:text-violet-400" />
						</div>
						<div>
							<h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-grotesk">
								Practical Mark Entry
							</h1>
						</div>
					</div>

					{/* Loading context */}
					{!isReady && (
						<Card className="shadow-sm">
							<CardContent className="p-4">
								<div className="flex items-center justify-center gap-2 text-muted-foreground">
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
									<span className="text-sm">Loading institution context...</span>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Cascading filters */}
					{isReady && (
						<Card className="shadow-sm">
							<CardContent className="p-2">
								<div className={cn(
									'grid grid-cols-1 gap-3',
									mustSelectInstitution
										? 'md:grid-cols-2 lg:grid-cols-4'
										: 'md:grid-cols-3'
								)}>

									{/* Institution — only for super_admin "All Institutions" */}
									{mustSelectInstitution && (
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">
												Institution <span className="text-red-500">*</span>
											</Label>
											<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
												<PopoverTrigger asChild>
													<Button
														variant="outline"
														role="combobox"
														aria-expanded={institutionOpen}
														className="w-full justify-between h-9 text-left text-xs truncate"
														disabled={loadingInstitutions}
													>
														<span className="flex-1 pr-2 truncate">
															{selectedInstitutionId
																? institutions.find(i => i.id === selectedInstitutionId)?.name
																: loadingInstitutions ? 'Loading...' : 'Select institution...'}
														</span>
														<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[400px] p-0" align="start">
													<Command>
														<CommandInput placeholder="Search institution..." className="h-8 text-xs" />
														<CommandEmpty className="text-xs py-4">No institution found.</CommandEmpty>
														<CommandGroup className="max-h-56 overflow-auto">
															{institutions.map(inst => (
																<CommandItem
																	key={inst.id}
																	value={`${inst.institution_code} ${inst.name}`}
																	onSelect={() => {
																		setSelectedInstitutionId(inst.id)
																		setInstitutionOpen(false)
																	}}
																	className="py-2 text-xs"
																>
																	<Check className={cn(
																		'mr-2 h-3.5 w-3.5 shrink-0',
																		selectedInstitutionId === inst.id ? 'opacity-100' : 'opacity-0'
																	)} />
																	<span className="flex-1 line-clamp-2">
																		{inst.institution_code} - {inst.name}
																	</span>
																</CommandItem>
															))}
														</CommandGroup>
													</Command>
												</PopoverContent>
											</Popover>
										</div>
									)}

									{/* Exam Session */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">
											Exam Session <span className="text-red-500">*</span>
										</Label>
										<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={sessionOpen}
													className="w-full justify-between h-9 text-left text-xs truncate"
													disabled={!effectiveInstitutionId || loadingSessions}
												>
													<span className="flex-1 pr-2 truncate">
														{selectedSessionId
															? sessions.find(s => s.id === selectedSessionId)?.session_name
															: loadingSessions ? 'Loading...' : 'Select session...'}
													</span>
													<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[300px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search session..." className="h-8 text-xs" />
													<CommandEmpty className="text-xs py-4">No session found.</CommandEmpty>
													<CommandGroup className="max-h-56 overflow-auto">
														{sessions.map(session => (
															<CommandItem
																key={session.id}
																value={session.session_name}
																onSelect={() => {
																	setSelectedSessionId(session.id)
																	setSessionOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn(
																	'mr-2 h-3.5 w-3.5 shrink-0',
																	selectedSessionId === session.id ? 'opacity-100' : 'opacity-0'
																)} />
																<span className="flex-1 line-clamp-2">
																	{session.session_name}
																</span>
															</CommandItem>
														))}
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									{/* Course */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">
											Course <span className="text-red-500">*</span>
										</Label>
										<Popover open={courseOpen} onOpenChange={setCourseOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={courseOpen}
													className="w-full justify-between h-9 text-left text-xs truncate"
													disabled={!selectedSessionId || loadingCourses}
												>
													<span className="flex-1 pr-2 truncate">
														{selectedCourseId
															? courses.find(c => c.id === selectedCourseId)?.course_name
															: loadingCourses ? 'Loading...' : 'Select course...'}
													</span>
													<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[400px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search course..." className="h-8 text-xs" />
													<CommandEmpty className="text-xs py-4">No courses with attendance taken today.</CommandEmpty>
													<CommandGroup className="max-h-56 overflow-auto">
														{courses.map(course => (
															<CommandItem
																key={course.id}
																value={`${course.course_code} ${course.course_name}`}
																onSelect={() => {
																	setSelectedCourseId(course.id)
																	setCourseOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn(
																	'mr-2 h-3.5 w-3.5 shrink-0',
																	selectedCourseId === course.id ? 'opacity-100' : 'opacity-0'
																)} />
																<span className="flex-1 line-clamp-2">
																	{course.course_code} - {course.course_name}
																</span>
															</CommandItem>
														))}
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									{/* Batch — simple Select, auto-loads students on change */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">
											Batch <span className="text-red-500">*</span>
										</Label>
										<Select
											value={selectedBatchId}
											onValueChange={handleBatchSelect}
											disabled={!selectedCourseId || loadingBatches}
										>
											<SelectTrigger className="h-9 text-xs w-full">
												<SelectValue
													placeholder={
														loadingBatches ? 'Loading...' : 'Select batch...'
													}
												/>
											</SelectTrigger>
											<SelectContent>
												{batches.map(batch => (
													<SelectItem key={batch.id} value={batch.id} className="text-xs">
														{getBatchLabel(batch)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Loading students indicator */}
					{loadingStudents && (
						<Card className="shadow-sm">
							<CardContent className="p-4">
								<div className="flex items-center justify-center gap-2 text-muted-foreground">
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
									<span className="text-sm">Loading learners...</span>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Mark entry table */}
					{!loadingStudents && students.length > 0 && courseDetails && (
						<Card className="shadow-md">
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between flex-wrap gap-2">
									<CardTitle className="flex items-center gap-2 font-grotesk text-base">
										<div className="h-2 w-2 rounded-full bg-violet-500" />
										Mark Entry
									</CardTitle>
									<div className="flex items-center gap-2 flex-wrap">
										<Badge
											variant="outline"
											className="text-xs px-2 py-0.5 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800"
										>
											Max: {courseDetails.maximum_marks}
										</Badge>
										<Badge
											variant="outline"
											className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
										>
											Pass: {courseDetails.minimum_pass_marks}
										</Badge>
										<Badge
											variant="outline"
											className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800"
										>
											<Users className="h-3 w-3 mr-1 inline" />
											{students.length} Learners
										</Badge>
									</div>
								</div>
								<CardDescription className="text-xs mt-1">
									{courseDetails.course_code} — {courseDetails.course_name}
								</CardDescription>

								{/* Summary stats */}
								<div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
									<span>Total: <span className="font-medium text-foreground">{students.length}</span></span>
									<span>Entered: <span className="font-medium text-foreground">{totalEntered}</span></span>
									<span className="text-green-700 dark:text-green-400">
										Present: <span className="font-medium">{totalPresent}</span>
									</span>
									<span className="text-red-600 dark:text-red-400">
										Absent: <span className="font-medium">{totalAbsent}</span>
									</span>
								</div>

								{/* View Mode Indicator */}
								{isViewMode && (
									<div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
										<div className="flex items-center gap-2">
											<AlertTriangle className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
											<span className="text-xs font-medium text-blue-800 dark:text-blue-200">
												Marks have been saved and are in read-only mode
											</span>
										</div>
									</div>
								)}
							</CardHeader>

							<CardContent className="space-y-3 pt-0">
								<div className="border rounded-lg overflow-hidden">
									<Table>
										<TableHeader>
											<TableRow className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-600 hover:to-purple-600">
												<TableHead className="w-12 text-white font-semibold text-sm">#</TableHead>
												<TableHead className="text-white font-semibold text-sm">Register No</TableHead>
												<TableHead className="text-white font-semibold text-sm">Name</TableHead>
												<TableHead className="text-white font-semibold text-sm">
													Mark / {courseDetails.maximum_marks}
												</TableHead>
												<TableHead className="text-white font-semibold text-sm">Status</TableHead>
												<TableHead className="text-white font-semibold text-sm">Result</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{students.map((student, idx) => (
												<TableRow
													key={student.exam_registration_id}
													className={cn(
														'hover:bg-violet-50/50 dark:hover:bg-violet-900/10',
														student.status === 'AB' && 'bg-red-50/40 dark:bg-red-900/10'
													)}
												>
													{/* Serial */}
													<TableCell className="font-medium text-sm py-2">
														{student.serial_number}
													</TableCell>

													{/* Register number */}
													<TableCell className="font-mono text-sm py-2 font-semibold">
														{student.register_number || '—'}
													</TableCell>

													{/* Name */}
													<TableCell className="text-sm py-2">
														{student.student_name || '—'}
													</TableCell>

													{/* Mark input */}
													<TableCell className="py-2">
														<Input
															id={`mark-input-${idx}`}
															type="text"
															inputMode="decimal"
															value={
																student.is_absent_in_attendance
																	? 'AB'
																	: student.status === 'AB'
																		? 'AB'
																		: student.total_marks_obtained !== null
																			? student.total_marks_obtained
																			: ''
															}
															onChange={e => {
																if (student.is_absent_in_attendance) return
																const val = e.target.value.trim()
																const passMark = courseDetails?.minimum_pass_marks ?? 0
																if (val.toUpperCase() === 'AB') {
																	updateStudent(idx, { status: 'AB', total_marks_obtained: null, evaluator_remarks: 'RA RE-APPEAR' })
																} else if (val === '') {
																	updateStudent(idx, { status: null, total_marks_obtained: null, evaluator_remarks: null })
																} else {
																	const num = parseFloat(val)
																	if (!isNaN(num) && num >= 0) {
																		updateStudent(idx, { status: 'Present', total_marks_obtained: num, evaluator_remarks: num >= passMark ? 'PASS' : 'FAIL' })
																	}
																}
															}}
															onKeyDown={e => {
																if (student.is_absent_in_attendance) return
																if (e.key === 'Enter') {
																	e.preventDefault()
																	// Skip to next non-absent input
																	let nextIdx = idx + 1
																	while (nextIdx < students.length && students[nextIdx].is_absent_in_attendance) {
																		nextIdx++
																	}
																	const next = document.getElementById(`mark-input-${nextIdx}`)
																	if (next) {
																		next.focus();
																		(next as HTMLInputElement).select()
																	}
																}
															}}
															onFocus={e => e.target.select()}
															disabled={isViewMode || student.is_absent_in_attendance}
															className={cn(
																'w-24 text-center font-mono h-8 text-sm',
																student.is_absent_in_attendance &&
																	'bg-red-50 text-red-600 font-semibold border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 cursor-not-allowed',
																!student.is_absent_in_attendance && student.status === 'AB' &&
																	'bg-red-50 text-red-600 font-semibold border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
																student.status === 'Present' &&
																student.total_marks_obtained !== null &&
																student.total_marks_obtained > courseDetails.maximum_marks &&
																	'border-red-500',
																isViewMode && 'bg-muted cursor-not-allowed'
															)}
															placeholder="—"
														/>
													</TableCell>

													{/* Status badge */}
													<TableCell className="py-2">
														{student.status === 'AB' ? (
															<Badge variant="destructive" className="text-xs">Absent</Badge>
														) : student.status === 'Present' ? (
															<Badge className="text-xs bg-green-100 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
																Present
															</Badge>
														) : (
															<span className="text-muted-foreground text-xs">—</span>
														)}
													</TableCell>

													{/* Result badge */}
													<TableCell className="py-2">
														{student.status === 'AB' ? (
															<span className="text-muted-foreground text-xs">—</span>
														) : student.status === 'Present' && student.total_marks_obtained !== null ? (
															<Badge className={cn(
																'text-xs font-medium',
																student.total_marks_obtained >= courseDetails.minimum_pass_marks
																	? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300'
																	: 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300'
															)}>
																{student.total_marks_obtained >= courseDetails.minimum_pass_marks ? 'PASS' : 'FAIL'}
															</Badge>
														) : (
															<span className="text-muted-foreground text-xs">—</span>
														)}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>

								{/* Action bar */}
								<div className="flex items-center justify-between">
									{isViewMode ? (
										<p className="text-xs text-muted-foreground">
											Marks saved successfully. You can download the PDF or select a new batch.
										</p>
									) : (
										<p className="text-xs text-muted-foreground">
											Enter marks for present learners. Absent learners (from attendance) are locked. Press <kbd className="px-1 py-0.5 rounded bg-muted text-xs font-mono">Enter</kbd> to move to next row.
										</p>
									)}
									<div className="flex gap-2">
										{isViewMode ? (
											<>
												<Button
													variant="outline"
													className="h-8 text-xs"
													onClick={() => {
														setStudents([])
														setCourseDetails(null)
														setSelectedBatchId('')
														setIsViewMode(false)
													}}
												>
													New Entry
												</Button>
												<Button
													onClick={generatePDF}
													className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs"
												>
													<FileText className="h-3.5 w-3.5 mr-1.5" />
													Download PDF
												</Button>
											</>
										) : (
											<>
												<Button
													variant="outline"
													className="h-8 text-xs"
													onClick={() => {
														setStudents([])
														setCourseDetails(null)
														setSelectedBatchId('')
													}}
												>
													Cancel
												</Button>
												<Button
													onClick={handleSave}
													disabled={saving}
													className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs"
												>
													<Save className="h-3.5 w-3.5 mr-1.5" />
													{saving ? 'Saving...' : 'Save Marks'}
												</Button>
											</>
										)}
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Empty state — batch selected but no students */}
					{!loadingStudents && selectedBatchId && students.length === 0 && courseDetails && (
						<Card className="shadow-sm">
							<CardContent className="p-8">
								<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
									<Users className="h-8 w-8 opacity-40" />
									<p className="text-sm font-medium">No learners found for this batch</p>
									<p className="text-xs">Ensure exam registrations exist with fee paid for this course</p>
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
