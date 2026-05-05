'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useSessionSync } from '@/hooks/use-session-sync'
import { Edit3, Check, ChevronsUpDown, History, Save, AlertTriangle, Download, FileText, Search, Loader2 } from 'lucide-react'
import { numberToWords } from '@/services/post-exam/external-mark-entry-service'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth/auth-context-parent'
import Link from 'next/link'

interface Institution {
	id: string
	name: string
	institution_code: string
	institution_name?: string
}

interface ExamSession {
	id: string
	session_code: string
	session_name: string
}

interface Course {
	id: string
	course_code: string
	course_name: string
}

interface Student {
	id: string
	student_dummy_id: string
	dummy_number: string
	exam_registration_id: string
	register_number?: string
	program_id: string | null
	total_marks_obtained: number | null
	total_marks_in_words: string
	remarks: string
	marks_out_of: number
	source?: string
}

interface CourseDetails {
	subject_code: string
	subject_name: string
	maximum_marks: number
	minimum_pass_marks: number
}

interface CorrectionHistory {
	id: string
	old_marks: number
	new_marks: number
	marks_difference: number
	correction_reason: string
	correction_type: string
	corrected_at: string
	users: {
		full_name: string
		email: string
	}
}

export default function ExternalMarkCorrectionPage() {
	const { toast } = useToast()
	const { user } = useAuth()

	// Institution filter hook
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [examSessions, setExamSessions] = useState<ExamSession[]>([])
	const [courses, setCourses] = useState<Course[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('')
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [selectedCourseId, setSelectedCourseId] = useState<string>('')
	const [registerNumber, setRegisterNumber] = useState<string>('')

	// Combobox open states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)
	const [courseSearchQuery, setCourseSearchQuery] = useState('')

	// Students and course details
	const [students, setStudents] = useState<Student[]>([])
	const [courseDetails, setCourseDetails] = useState<CourseDetails | null>(null)

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [saving, setSaving] = useState(false)

	// Edit dialog state
	const [editDialogOpen, setEditDialogOpen] = useState(false)
	const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
	const [newMarks, setNewMarks] = useState<string>('')
	const [correctionReason, setCorrectionReason] = useState<string>('')
	const [correctionType, setCorrectionType] = useState<string>('')
	const [referenceNumber, setReferenceNumber] = useState<string>('')

	// History dialog state
	const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
	const [correctionHistory, setCorrectionHistory] = useState<CorrectionHistory[]>([])
	const [loadingHistory, setLoadingHistory] = useState(false)

	// Load institutions when context is ready
	useEffect(() => {
		if (isReady) {
			loadInstitutions()
		}
	}, [isReady])

	// Auto-select institution for normal users
	useEffect(() => {
		if (isReady && !mustSelectInstitution && institutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(institutionId)
		}
	}, [isReady, mustSelectInstitution, institutionId, selectedInstitutionId])

	// Load sessions when institution is selected
	useEffect(() => {
		if (selectedInstitutionId) {
			loadSessions(selectedInstitutionId)
			// Reset dependent fields
			setSelectedSessionId('')
			setExamSessions([])
			setCourses([])
			setSelectedCourseId('')
			setRegisterNumber('')
			setStudents([])
			setCourseDetails(null)
		}
	}, [selectedInstitutionId])

	// Load courses when session is selected
	useEffect(() => {
		if (selectedInstitutionId && selectedSessionId) {
			loadCourses(selectedInstitutionId, selectedSessionId)
			// Reset dependent fields
			setSelectedCourseId('')
			setRegisterNumber('')
			setStudents([])
			setCourseDetails(null)
		}
	}, [selectedSessionId])

	// Clear results when course changes
	useEffect(() => {
		setRegisterNumber('')
		setStudents([])
		setCourseDetails(null)
	}, [selectedCourseId])

	const loadInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/post-exam/external-marks-correction?action=institutions')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load institutions')
			const data = await response.json()
			setInstitutions(data.map((inst: any) => ({
				id: inst.id,
				name: inst.name || inst.institution_name,
				institution_code: inst.institution_code,
				institution_name: inst.institution_name || inst.name
			})))
		} catch {
			toast({
				title: "❌ Error",
				description: "Failed to load institutions",
				variant: "destructive",
			})
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, toast])

	const loadSessions = async (instId: string) => {
		try {
			setLoadingSessions(true)
			setExamSessions([])
			const response = await fetch(
				`/api/post-exam/external-marks-correction?action=sessions&institutionId=${instId}`
			)
			if (!response.ok) throw new Error('Failed to load sessions')
			const data = await response.json()
			setExamSessions(data)
		} catch {
			toast({
				title: "❌ Error",
				description: "Failed to load exam sessions",
				variant: "destructive",
			})
		} finally {
			setLoadingSessions(false)
		}
	}

	const loadCourses = async (instId: string, sessionId: string) => {
		try {
			setLoadingCourses(true)
			setCourses([])
			const response = await fetch(
				`/api/post-exam/external-marks-correction?action=courses&institutionId=${instId}&sessionId=${sessionId}`
			)
			if (!response.ok) throw new Error('Failed to load courses')
			const data = await response.json()
			setCourses(data)

			if (data.length === 0) {
				toast({
					title: "⚠️ No Courses",
					description: "No marks entries found for this session",
					variant: "destructive",
				})
			}
		} catch {
			toast({
				title: "❌ Error",
				description: "Failed to load courses",
				variant: "destructive",
			})
		} finally {
			setLoadingCourses(false)
		}
	}

	const searchByRegisterNumber = async () => {
		if (!selectedCourseId || !registerNumber.trim()) {
			toast({
				title: "⚠️ Selection Required",
				description: "Please select course and enter register number",
				variant: "destructive",
			})
			return
		}

		try {
			setLoadingStudents(true)
			setStudents([])
			setCourseDetails(null)

			const effectiveInstitutionId = selectedInstitutionId || institutionId
			const response = await fetch(
				`/api/post-exam/external-marks-correction?action=searchByRegister&` +
				`institutionId=${effectiveInstitutionId}&` +
				`sessionId=${selectedSessionId}&` +
				`courseId=${selectedCourseId}&` +
				`registerNumber=${encodeURIComponent(registerNumber.trim())}`
			)

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to search learner')
			}

			const data = await response.json()

			if (!data.students || data.students.length === 0) {
				toast({
					title: "⚠️ No Results",
					description: `No marks entry found for register number "${registerNumber}"`,
					variant: "destructive",
				})
				return
			}

			// Map students with marks entry IDs
			const studentsWithMarks = data.students.map((student: any) => ({
				...student,
				id: student.marks_entry_id || student.student_dummy_id,
				marks_out_of: data.course_details?.maximum_marks || 100
			}))

			setStudents(studentsWithMarks)
			setCourseDetails(data.course_details)

			toast({
				title: "✅ Learner Found",
				description: `Found ${data.students.length} entry for register number "${registerNumber}"`,
				className: "bg-green-50 border-green-200 text-green-800",
			})
		} catch (error) {
			toast({
				title: "❌ Error",
				description: error instanceof Error ? error.message : 'Failed to search',
				variant: "destructive",
			})
		} finally {
			setLoadingStudents(false)
		}
	}

	const handleEditClick = (student: Student) => {
		setSelectedStudent(student)
		setNewMarks(student.total_marks_obtained?.toString() || '')
		setCorrectionReason('')
		setCorrectionType('')
		setReferenceNumber('')
		setEditDialogOpen(true)
	}

	const handleViewHistory = async (student: Student) => {
		setSelectedStudent(student)
		setHistoryDialogOpen(true)
		setLoadingHistory(true)

		try {
			const response = await fetch(
				`/api/post-exam/external-marks-correction?action=history&marksEntryId=${student.id}`
			)
			if (!response.ok) throw new Error('Failed to load history')
			const data = await response.json()
			setCorrectionHistory(data)
		} catch {
			toast({
				title: "❌ Error",
				description: "Failed to load correction history",
				variant: "destructive",
			})
		} finally {
			setLoadingHistory(false)
		}
	}

	const handleSaveCorrection = async () => {
		if (!selectedStudent || !courseDetails) return

		// Validation
		const newMarksNum = parseFloat(newMarks)
		if (isNaN(newMarksNum) || newMarksNum < 0) {
			toast({
				title: "❌ Invalid Marks",
				description: "Please enter valid marks",
				variant: "destructive",
			})
			return
		}

		if (newMarksNum > courseDetails.maximum_marks) {
			toast({
				title: "❌ Invalid Marks",
				description: `Marks cannot exceed ${courseDetails.maximum_marks}`,
				variant: "destructive",
			})
			return
		}

		if (newMarksNum === selectedStudent.total_marks_obtained) {
			toast({
				title: "⚠️ No Change",
				description: "New marks must be different from current marks",
				variant: "destructive",
			})
			return
		}

		if (!correctionReason.trim()) {
			toast({
				title: "⚠️ Reason Required",
				description: "Please provide a reason for correction",
				variant: "destructive",
			})
			return
		}

		if (!correctionType) {
			toast({
				title: "⚠️ Type Required",
				description: "Please select correction type",
				variant: "destructive",
			})
			return
		}

		try {
			setSaving(true)
			const response = await fetch('/api/post-exam/external-marks-correction', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					marks_entry_id: selectedStudent.id,
					new_marks: newMarksNum,
					new_marks_in_words: numberToWords(newMarksNum),
					correction_reason: correctionReason.trim(),
					correction_type: correctionType,
					reference_number: referenceNumber.trim() || null,
					corrected_by: user?.id || null
				})
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to save correction')
			}

			toast({
				title: "✅ Correction Saved",
				description: `Marks for ${selectedStudent.dummy_number || registerNumber} updated from ${selectedStudent.total_marks_obtained} to ${newMarksNum}`,
				className: "bg-green-50 border-green-200 text-green-800",
			})

			setEditDialogOpen(false)

			// Refresh students data by re-searching
			searchByRegisterNumber()

		} catch (error) {
			toast({
				title: "❌ Save Failed",
				description: error instanceof Error ? error.message : 'Failed to save correction',
				variant: "destructive",
			})
		} finally {
			setSaving(false)
		}
	}

	const generatePDF = async () => {
		if (!courseDetails || students.length === 0) return

		try {
			const { generateExternalMarksPDF } = await import('@/lib/utils/generate-external-marks-pdf')

			// Look up bundle number for this institution/session/course
			let bundleNo = ''
			if (selectedInstitutionId && selectedSessionId && selectedCourseId) {
				try {
					const params = new URLSearchParams({
						institutions_id: selectedInstitutionId,
						examination_session_id: selectedSessionId,
						course_id: selectedCourseId
					})
					const res = await fetch(`/api/post-exam/bundle-numbers?${params.toString()}`)
					if (res.ok) {
						const json = await res.json()
						if (json?.bundle_number != null) bundleNo = String(json.bundle_number)
					}
				} catch (e) {
					console.warn('Bundle number lookup failed:', e)
				}
			}

			const pdfData = {
				subject_code: courseDetails.subject_code,
				subject_name: courseDetails.subject_name,
				register_number: registerNumber,
				bundle_no: bundleNo,
				maximum_marks: courseDetails.maximum_marks,
				minimum_pass_marks: courseDetails.minimum_pass_marks,
				exam_date: '',
				students: students.map(s => ({
					register_number: s.register_number || registerNumber,
					dummy_number: s.dummy_number,
					total_marks_obtained: s.total_marks_obtained,
					total_marks_in_words: s.total_marks_in_words,
					remarks: s.remarks
				}))
			}

			const fileName = generateExternalMarksPDF(pdfData as any)

			toast({
				title: "✅ PDF Downloaded",
				description: `Marks sheet saved as ${fileName}`,
				className: "bg-green-50 border-green-200 text-green-800",
			})
		} catch (error) {
			toast({
				title: "❌ PDF Generation Failed",
				description: error instanceof Error ? error.message : 'Failed to generate PDF',
				variant: "destructive",
			})
		}
	}

	// Determine grid columns based on institution visibility
	const gridCols = mustSelectInstitution ? 'lg:grid-cols-4' : 'lg:grid-cols-3'

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />

				<div className="flex-1 p-4 space-y-4 overflow-auto">
					{/* Breadcrumb */}
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
								<BreadcrumbPage>External Mark Correction</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page Header */}
					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
							<Edit3 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
						</div>
						<div>
							<h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-grotesk">
								External Mark Correction
							</h1>
							<p className="text-slate-500 dark:text-slate-400 text-sm">
								Correct external marks (Theory & Practical) by learner register number
							</p>
						</div>
					</div>

					{/* Cascading Dropdowns - Flow: Institution -> Exam Session -> Course -> Register Number */}
					<Card className="shadow-sm">
						<CardContent className="p-3">
							<div className={cn("grid grid-cols-1 md:grid-cols-2 gap-3", gridCols)}>

								{/* Institution - Only show for super_admin with "All Institutions" */}
								{mustSelectInstitution && (
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Institution <span className="text-red-500">*</span></Label>
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
															? institutions.find((inst) => inst.id === selectedInstitutionId)?.name
															: loadingInstitutions ? "Loading..." : "Select institution..."}
													</span>
													<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[400px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search institution..." className="h-8 text-xs" />
													<CommandList>
														<CommandEmpty className="text-xs py-4">No institution found.</CommandEmpty>
														<CommandGroup className="max-h-56 overflow-auto">
															{institutions.map((inst) => (
																<CommandItem
																	key={inst.id}
																	value={`${inst.institution_code} ${inst.name}`}
																	onSelect={() => {
																		setSelectedInstitutionId(inst.id)
																		setInstitutionOpen(false)
																	}}
																	className="py-2 text-xs"
																>
																	<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedInstitutionId === inst.id ? "opacity-100" : "opacity-0")} />
																	<span className="flex-1 line-clamp-2">{inst.institution_code} - {inst.name}</span>
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								)}

								{/* Exam Session */}
								{mustSelectSession && (
								<div className="space-y-1.5">
									<Label className="text-xs font-medium">Exam Session <span className="text-red-500">*</span></Label>
									<Select
										value={selectedSessionId}
										onValueChange={setSelectedSessionId}
										disabled={loadingSessions || !selectedInstitutionId}
									>
										<SelectTrigger className="h-9 text-xs">
											<SelectValue placeholder={
												!selectedInstitutionId
													? "Select institution first..."
													: loadingSessions
														? "Loading sessions..."
														: examSessions.length === 0
															? "No sessions found"
															: "Select exam session..."
											} />
										</SelectTrigger>
										<SelectContent>
											{examSessions.map((session) => (
												<SelectItem key={session.id} value={session.id} className="text-xs">
													{session.session_name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								)}

								{/* Course Combobox */}
								<div className="space-y-1.5">
									<Label className="text-xs font-medium">Course <span className="text-red-500">*</span></Label>
									<Popover open={courseOpen} onOpenChange={(open) => {
										setCourseOpen(open)
										if (!open) setCourseSearchQuery('')
									}}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={courseOpen}
												className="w-full justify-between h-9 text-left text-xs truncate font-normal"
												disabled={!selectedSessionId || loadingCourses}
											>
												{!selectedSessionId ? (
													<span className="text-muted-foreground">Select session first...</span>
												) : loadingCourses ? (
													<span className="text-muted-foreground">Loading courses...</span>
												) : selectedCourseId ? (
													<span className="truncate">
														{courses.find((c) => c.id === selectedCourseId)?.course_code}
														{' - '}
														{courses.find((c) => c.id === selectedCourseId)?.course_name}
													</span>
												) : (
													<span className="text-muted-foreground">Select course...</span>
												)}
												<ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[400px] p-0" align="start">
											<Command shouldFilter={false}>
												<CommandInput
													placeholder="Search course code or name..."
													className="h-9 text-xs"
													value={courseSearchQuery}
													onValueChange={setCourseSearchQuery}
												/>
												<CommandList>
													<CommandEmpty className="text-xs py-4">
														{courses.length === 0 ? "No courses with marks entries found." : "No course found."}
													</CommandEmpty>
													<CommandGroup className="max-h-56 overflow-auto">
														{courses
															.filter((course) => {
																if (!courseSearchQuery.trim()) return true
																const q = courseSearchQuery.toLowerCase()
																return (
																	course.course_code.toLowerCase().includes(q) ||
																	course.course_name.toLowerCase().includes(q)
																)
															})
															.map((course) => (
																<CommandItem
																	key={course.id}
																	value={`${course.course_code} ${course.course_name}`}
																	onSelect={() => {
																		setSelectedCourseId(course.id)
																		setCourseOpen(false)
																		setCourseSearchQuery('')
																	}}
																	className="py-2 text-xs"
																>
																	<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedCourseId === course.id ? "opacity-100" : "opacity-0")} />
																	<div className="flex flex-col">
																		<span className="font-medium">{course.course_code}</span>
																		<span className="text-xs text-muted-foreground">{course.course_name}</span>
																	</div>
																</CommandItem>
															))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Learner Register Number Input */}
								<div className="space-y-1.5">
									<Label className="text-xs font-medium">Learner Register Number <span className="text-red-500">*</span></Label>
									<div className="flex gap-2">
										<Input
											placeholder={!selectedCourseId ? "Select course first..." : "Enter register number..."}
											value={registerNumber}
											onChange={(e) => setRegisterNumber(e.target.value.toUpperCase())}
											onKeyDown={(e) => {
												if (e.key === 'Enter' && registerNumber.trim() && selectedCourseId) {
													searchByRegisterNumber()
												}
											}}
											disabled={!selectedCourseId}
											className="h-9 text-xs uppercase"
										/>
										<Button
											onClick={searchByRegisterNumber}
											disabled={!selectedCourseId || !registerNumber.trim() || loadingStudents}
											className="bg-amber-600 hover:bg-amber-700 text-white h-9 text-xs shrink-0"
										>
											{loadingStudents ? (
												<>
													<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
													Searching...
												</>
											) : (
												<>
													<Search className="h-3.5 w-3.5 mr-1.5" />
													Search
												</>
											)}
										</Button>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Course Details & Table */}
					{courseDetails && students.length > 0 && (
						<>
							{/* Course Info Card */}
							<Card className="shadow-sm">
								<CardContent className="p-3">
									<div className="flex items-center justify-between flex-wrap gap-3">
										<div className="flex items-center gap-6 text-sm flex-wrap">
											<div>
												<span className="text-muted-foreground">Course:</span>{' '}
												<span className="font-semibold">{courseDetails.subject_code} - {courseDetails.subject_name}</span>
											</div>
											<div>
												<span className="text-muted-foreground">Register No:</span>{' '}
												<span className="font-semibold">{registerNumber}</span>
											</div>
											<Badge variant="outline" className="text-sm font-semibold">
												Max: {courseDetails.maximum_marks} | Pass: {courseDetails.minimum_pass_marks}
											</Badge>
										</div>
										<Button
											onClick={generatePDF}
											variant="outline"
											size="sm"
											className="h-8 text-xs"
										>
											<Download className="h-3.5 w-3.5 mr-1.5" />
											Download PDF
										</Button>
									</div>
								</CardContent>
							</Card>

							{/* Learner Marks Table */}
							<Card className="shadow-md">
								<CardHeader className="pb-3">
									<CardTitle className="flex items-center gap-2 font-grotesk text-base">
										<div className="h-2 w-2 rounded-full bg-amber-500"></div>
										Marks Entry for {registerNumber}
									</CardTitle>
									<CardDescription className="text-xs">
										Click Edit to correct marks or History to view correction log
									</CardDescription>
								</CardHeader>
								<CardContent className="pt-0">
									<div className="border rounded-lg">
										<Table>
											<TableHeader>
												<TableRow className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-600 hover:to-orange-600">
													<TableHead className="w-12 text-white font-semibold text-sm">#</TableHead>
													<TableHead className="text-white font-semibold text-sm">Register No</TableHead>
													<TableHead className="text-white font-semibold text-sm">Dummy No</TableHead>
													<TableHead className="text-white font-semibold text-sm">Marks</TableHead>
													<TableHead className="text-white font-semibold text-sm">Marks in Words</TableHead>
													<TableHead className="text-white font-semibold text-sm">Source</TableHead>
													<TableHead className="text-white font-semibold text-sm">Result</TableHead>
													<TableHead className="text-white font-semibold text-sm">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{students.map((student, index) => (
													<TableRow key={student.id} className="hover:bg-amber-50/50 dark:hover:bg-amber-900/10">
														<TableCell className="text-sm py-3 text-muted-foreground">{index + 1}</TableCell>
														<TableCell className="font-semibold text-sm py-3">{student.register_number || registerNumber}</TableCell>
														<TableCell className="text-sm py-3 text-muted-foreground">{student.dummy_number || '-'}</TableCell>
														<TableCell className="text-sm py-3 font-semibold">{student.total_marks_obtained ?? '-'}</TableCell>
														<TableCell className="text-sm py-3 text-muted-foreground">{student.total_marks_in_words || '-'}</TableCell>
														<TableCell className="py-3">
															<Badge
																variant="outline"
																className={cn(
																	"text-xs",
																	student.source === 'Bulk Upload'
																		? "bg-blue-50 text-blue-700 border-blue-200"
																		: "bg-slate-50 text-slate-700 border-slate-200"
																)}
															>
																{student.source || 'Manual'}
															</Badge>
														</TableCell>
														<TableCell className="py-3">
															{student.total_marks_obtained !== null && (
																<Badge
																	className={cn(
																		"text-xs",
																		student.total_marks_obtained >= (courseDetails?.minimum_pass_marks || 0)
																			? "bg-green-100 text-green-800"
																			: "bg-red-100 text-red-800"
																	)}
																>
																	{student.total_marks_obtained >= (courseDetails?.minimum_pass_marks || 0) ? 'PASS' : 'FAIL'}
																</Badge>
															)}
														</TableCell>
														<TableCell className="py-3">
															<div className="flex gap-1">
																<Button
																	size="sm"
																	variant="outline"
																	onClick={() => handleEditClick(student)}
																	className="h-7 text-xs"
																	disabled={student.total_marks_obtained === null}
																>
																	<Edit3 className="h-3 w-3 mr-1" />
																	Edit
																</Button>
																<Button
																	size="sm"
																	variant="ghost"
																	onClick={() => handleViewHistory(student)}
																	className="h-7 text-xs"
																	disabled={student.total_marks_obtained === null}
																>
																	<History className="h-3 w-3 mr-1" />
																	History
																</Button>
															</div>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								</CardContent>
							</Card>
						</>
					)}
				</div>

				<AppFooter />
			</SidebarInset>

			{/* Edit Marks Dialog */}
			<Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
				<DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Edit3 className="h-5 w-5 text-amber-600" />
							Correct Marks
						</DialogTitle>
						<DialogDescription>
							{selectedStudent && (
								<span>
									Register No: <strong>{selectedStudent.register_number || registerNumber}</strong> |
									Dummy No: <strong>{selectedStudent.dummy_number || '-'}</strong> |
									Course: <strong>{courseDetails?.subject_code}</strong>
								</span>
							)}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						{/* Current vs New Marks */}
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label className="text-sm">Current Marks</Label>
								<Input
									value={selectedStudent?.total_marks_obtained ?? ''}
									disabled
									className="bg-muted"
								/>
							</div>
							<div className="space-y-2">
								<Label className="text-sm">New Marks <span className="text-red-500">*</span></Label>
								<Input
									type="text"
									inputMode="numeric"
									value={newMarks}
									onChange={(e) => {
										const val = e.target.value
										if (val === '' || /^\d*\.?\d*$/.test(val)) {
											setNewMarks(val)
										}
									}}
									placeholder="Enter new marks"
								/>
								{courseDetails && (
									<p className="text-xs text-muted-foreground">
										Max: {courseDetails.maximum_marks}
									</p>
								)}
							</div>
						</div>

						{/* Marks in Words Preview */}
						{newMarks && !isNaN(parseFloat(newMarks)) && (
							<div className="p-2 bg-muted rounded-md">
								<p className="text-xs text-muted-foreground">Marks in words:</p>
								<p className="text-sm font-medium">{numberToWords(parseFloat(newMarks))}</p>
							</div>
						)}

						{/* Correction Type */}
						<div className="space-y-2">
							<Label className="text-sm">Correction Type <span className="text-red-500">*</span></Label>
							<Select value={correctionType} onValueChange={setCorrectionType}>
								<SelectTrigger>
									<SelectValue placeholder="Select correction type" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Data Entry Error">Data Entry Error</SelectItem>
									<SelectItem value="Revaluation">Revaluation</SelectItem>
									<SelectItem value="Moderation">Moderation</SelectItem>
									<SelectItem value="Grace Marks">Grace Marks</SelectItem>
									<SelectItem value="Administrative">Administrative</SelectItem>
									<SelectItem value="Other">Other</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Correction Reason */}
						<div className="space-y-2">
							<Label className="text-sm">Reason for Correction <span className="text-red-500">*</span></Label>
							<Textarea
								value={correctionReason}
								onChange={(e) => setCorrectionReason(e.target.value)}
								placeholder="Explain why this correction is needed..."
								rows={3}
							/>
						</div>

						{/* Reference Number */}
						<div className="space-y-2">
							<Label className="text-sm">Reference Number (Optional)</Label>
							<Input
								value={referenceNumber}
								onChange={(e) => setReferenceNumber(e.target.value)}
								placeholder="Application/Request reference"
							/>
						</div>

						{/* Warning */}
						<div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
							<div className="flex items-start gap-2">
								<AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
								<div>
									<p className="text-sm font-medium text-amber-800 dark:text-amber-200">
										Audit Trail Notice
									</p>
									<p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
										This correction will be logged with your user ID, timestamp, and reason for audit compliance.
									</p>
								</div>
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setEditDialogOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleSaveCorrection}
							disabled={saving}
							className="bg-amber-600 hover:bg-amber-700"
						>
							<Save className="h-4 w-4 mr-2" />
							{saving ? 'Saving...' : 'Save Correction'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* History Dialog */}
			<Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
				<DialogContent className="sm:max-w-[600px]">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<History className="h-5 w-5 text-blue-600" />
							Correction History
						</DialogTitle>
						<DialogDescription>
							{selectedStudent && (
								<span>
									Register No: <strong>{selectedStudent.register_number || registerNumber}</strong> |
									Dummy No: <strong>{selectedStudent.dummy_number || '-'}</strong> |
									Current Marks: <strong>{selectedStudent.total_marks_obtained}</strong>
								</span>
							)}
						</DialogDescription>
					</DialogHeader>

					<div className="py-4">
						{loadingHistory ? (
							<div className="text-center py-8 text-muted-foreground">Loading history...</div>
						) : correctionHistory.length === 0 ? (
							<div className="text-center py-8 text-muted-foreground">
								No correction history found
							</div>
						) : (
							<div className="space-y-3 max-h-[400px] overflow-y-auto">
								{correctionHistory.map((history) => (
									<div key={history.id} className="p-3 border rounded-lg">
										<div className="flex items-center justify-between mb-2">
											<div className="flex items-center gap-2">
												<Badge variant="outline" className="text-xs">
													{history.correction_type}
												</Badge>
												<span className={cn(
													"text-sm font-semibold",
													history.marks_difference > 0 ? "text-green-600" : "text-red-600"
												)}>
													{history.old_marks} → {history.new_marks}
													<span className="ml-1">
														({history.marks_difference > 0 ? '+' : ''}{history.marks_difference})
													</span>
												</span>
											</div>
										</div>
										<p className="text-sm text-muted-foreground mb-2">
											{history.correction_reason}
										</p>
										<div className="text-xs text-muted-foreground">
											By: {history.users?.full_name || 'Unknown'} |{' '}
											{new Date(history.corrected_at).toLocaleString()}
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setHistoryDialogOpen(false)}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</SidebarProvider>
	)
}
