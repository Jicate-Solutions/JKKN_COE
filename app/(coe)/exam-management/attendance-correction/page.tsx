"use client"

import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { Loader2, Search, Edit, AlertTriangle, CheckCircle, Check, ChevronsUpDown } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useSessionSync } from '@/hooks/use-session-sync'
import { cn } from "@/lib/utils"

interface Institution {
	id: string
	institution_name: string
}

interface ExamSession {
	id: string
	session_code: string
	session_name: string
	semester_type: string | null
	exam_start_date: string | null
	exam_end_date: string | null
}

interface Course {
	id: string
	course_code: string
	course_name: string
}

interface AttendanceRecord {
	id: string
	stu_register_no: string
	student_name: string
	program_code: string
	program_name: string
	course_code: string
	course_name: string
	exam_date: string
	session: string
	attendance_status: string
	remarks: string
	updated_by: string | null
	exam_type?: string
	batch_no?: number | null
}

export default function AttendanceCorrectionPage() {
	const { toast } = useToast()
	const { user } = useAuth()
	const router = useRouter()

	// Institution filter hook
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId
	} = useInstitutionFilter()

	// Institution dropdown (for super_admin with "All Institutions" view)
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)

	// Exam session selection
	const [examSessions, setExamSessions] = useState<ExamSession[]>([])
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [loadingSessions, setLoadingSessions] = useState(false)

	// Course selection
	const [courses, setCourses] = useState<Course[]>([])
	const [selectedCourseCode, setSelectedCourseCode] = useState<string>("")
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [courseComboboxOpen, setCourseComboboxOpen] = useState(false)
	const [courseSearchQuery, setCourseSearchQuery] = useState<string>("")

	// Child: Register number search
	const [registerNo, setRegisterNo] = useState<string>("")
	const [searching, setSearching] = useState(false)

	// Single attendance record
	const [attendanceRecord, setAttendanceRecord] = useState<AttendanceRecord | null>(null)
	const [showRecord, setShowRecord] = useState(false)

	// UI state
	const [saving, setSaving] = useState(false)
	const [showConfirmDialog, setShowConfirmDialog] = useState(false)
	const [remarksError, setRemarksError] = useState(false)

	// Student info
	const [studentInfo, setStudentInfo] = useState<{
		register_no: string
		name: string
	} | null>(null)

	// Current time
	const [currentTime, setCurrentTime] = useState<Date | null>(null)

	// Format current date and time
	const formatCurrentDateTime = (date: Date | null) => {
		if (!date) return "Loading..."

		const day = date.getDate().toString().padStart(2, '0')
		const month = (date.getMonth() + 1).toString().padStart(2, '0')
		const year = date.getFullYear()
		const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
		const time = date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: true
		})

		return `${day}-${month}-${year} | ${weekday} | ${time}`
	}

	// Update current time every second
	useEffect(() => {
		setCurrentTime(new Date())
		const timer = setInterval(() => {
			setCurrentTime(new Date())
		}, 1000)

		return () => clearInterval(timer)
	}, [])

	// Load institutions when mustSelectInstitution is true
	useEffect(() => {
		if (isReady && mustSelectInstitution) {
			loadInstitutions()
		}
	}, [isReady, mustSelectInstitution])

	// Set selected institution from filter when not mustSelectInstitution
	useEffect(() => {
		if (isReady && !mustSelectInstitution && institutionId) {
			setSelectedInstitutionId(institutionId)
		}
	}, [isReady, mustSelectInstitution, institutionId])

	// Load exam sessions when institution is selected
	useEffect(() => {
		if (selectedInstitutionId) {
			fetchSessions(selectedInstitutionId)
			// Reset dependent fields
			setSelectedSessionId("")
			setCourses([])
			setSelectedCourseCode("")
			setRegisterNo("")
			setAttendanceRecord(null)
			setShowRecord(false)
			setStudentInfo(null)
		}
	}, [selectedInstitutionId])

	// Load courses when exam session is selected
	useEffect(() => {
		if (selectedInstitutionId && selectedSessionId) {
			fetchCourses(selectedInstitutionId, selectedSessionId)
			// Reset dependent fields
			setSelectedCourseCode("")
			setRegisterNo("")
			setAttendanceRecord(null)
			setShowRecord(false)
			setStudentInfo(null)
		}
	}, [selectedSessionId])

	const loadInstitutions = async () => {
		try {
			setLoadingInstitutions(true)
			const res = await fetch('/api/master/institutions')
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)
			}
		} catch (error) {
			console.error('Error loading institutions:', error)
		} finally {
			setLoadingInstitutions(false)
		}
	}

	const fetchSessions = async (instId: string) => {
		if (!instId) return

		try {
			setLoadingSessions(true)
			setExamSessions([])
			const res = await fetch(`/api/exam-management/attendance-correction/sessions?institutionId=${encodeURIComponent(instId)}`)
			if (res.ok) {
				const data = await res.json()
				setExamSessions(data)
			} else {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to fetch sessions')
			}
		} catch (error) {
			console.error('Error fetching sessions:', error)
			toast({
				title: "❌ Error",
				description: error instanceof Error ? error.message : 'Failed to load exam sessions',
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setLoadingSessions(false)
		}
	}

	const fetchCourses = async (instId: string, sessionId: string) => {
		if (!instId || !sessionId) return

		try {
			setLoadingCourses(true)
			setCourses([])
			const res = await fetch(`/api/exam-management/attendance-correction/courses?institutionId=${encodeURIComponent(instId)}&sessionId=${encodeURIComponent(sessionId)}`)
			if (res.ok) {
				const data = await res.json()
				setCourses(data)
			} else {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to fetch courses')
			}
		} catch (error) {
			console.error('Error fetching courses:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to load courses'
			toast({
				title: "❌ Error",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setLoadingCourses(false)
		}
	}

	// Search for student attendance record
	const handleSearch = async () => {
		if (!selectedCourseCode) {
			toast({
				title: "⚠️ Course Required",
				description: "Please select a course first.",
				variant: "destructive",
				className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
			})
			return
		}

		if (!registerNo.trim()) {
			toast({
				title: "⚠️ Input Required",
				description: "Please enter a student register number.",
				variant: "destructive",
				className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
			})
			return
		}

		try {
			setSearching(true)
			let searchUrl = `/api/exam-management/attendance-correction?course_code=${encodeURIComponent(selectedCourseCode)}&register_no=${encodeURIComponent(registerNo.trim())}`
			if (selectedSessionId) {
				searchUrl += `&examination_session_id=${encodeURIComponent(selectedSessionId)}`
			}
			const res = await fetch(searchUrl)

			if (!res.ok) {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to fetch attendance record')
			}

			const data = await res.json()

			setAttendanceRecord(data.record)
			setStudentInfo({
				register_no: data.student.register_no,
				name: data.student.name
			})
			setShowRecord(true)

			toast({
				title: "✅ Record Found",
				description: `Found attendance record for ${data.student.name} in ${data.record.course_code}`,
				className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
			})
		} catch (error) {
			console.error('Error searching attendance:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to search attendance record'
			toast({
				title: "❌ Search Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
			setShowRecord(false)
			setAttendanceRecord(null)
			setStudentInfo(null)
		} finally {
			setSearching(false)
		}
	}

	// Handle attendance status change
	const handleAttendanceChange = (newStatus: string) => {
		if (attendanceRecord) {
			setAttendanceRecord({
				...attendanceRecord,
				attendance_status: newStatus
			})
		}
	}

	// Handle remarks change
	const handleRemarksChange = (remarks: string) => {
		if (attendanceRecord) {
			setAttendanceRecord({
				...attendanceRecord,
				remarks
			})
			if (remarks.trim()) setRemarksError(false)
		}
	}

	// Show confirmation dialog
	const handleSubmit = () => {
		if (!attendanceRecord) {
			return
		}

		// Validate remarks (mandatory)
		if (!attendanceRecord.remarks || attendanceRecord.remarks.trim() === '') {
			setRemarksError(true)
			toast({
				title: "⚠️ Remarks Required",
				description: "Please enter remarks before submitting the correction.",
				variant: "destructive",
				className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
			})
			return
		}

		setShowConfirmDialog(true)
	}

	// Confirm and save changes
	const confirmUpdate = async () => {
		setShowConfirmDialog(false)

		if (!attendanceRecord) {
			return
		}

		if (!user?.email) {
			toast({
				title: "❌ User Error",
				description: "Unable to get user email. Please log in again.",
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
			return
		}

		try {
			setSaving(true)

			const res = await fetch('/api/exam-management/attendance-correction', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: attendanceRecord.id,
					attendance_status: attendanceRecord.attendance_status,
					remarks: attendanceRecord.remarks,
					updated_by: user.email
				})
			})

			if (!res.ok) {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to update attendance')
			}

			const result = await res.json()

			// Show success message with detailed information
			toast({
				title: "✅ Attendance Correction Saved",
				description: `Successfully updated attendance status to "${attendanceRecord.attendance_status}" for ${studentInfo?.name} (${studentInfo?.register_no}) in ${attendanceRecord.course_code}. Redirecting in 3 seconds...`,
				className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				duration: 5000,
			})

		// Redirect to attendance correction page after 3 seconds to allow message to be read
			setTimeout(() => {
				// Reset form state before redirect
				setRegisterNo("")
				setSelectedCourseCode("")
				setSelectedSessionId("")
				setCourses([])
				setAttendanceRecord(null)
				setShowRecord(false)
				setStudentInfo(null)

				// Navigate to fresh page
				router.push('/exam-management/attendance-correction')
			}, 3000)

		} catch (error) {
			console.error('Error updating attendance:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to update attendance'
			toast({
				title: "❌ Update Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setSaving(false)
		}
	}

	// Cancel and reset
	const handleCancel = () => {
		setRegisterNo("")
		setSelectedCourseCode("")
		setSelectedSessionId("")
		setCourses([])
		setAttendanceRecord(null)
		setShowRecord(false)
		setStudentInfo(null)
		setRemarksError(false)
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					<div className="flex items-center gap-2">
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link href="/dashboard">Dashboard</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Attendance Correction</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					<div className="space-y-6">
						{/* Page Header */}
						<div className="flex items-center justify-between">
							<div>
								<h1 className="text-x font-bold tracking-tight">Attendance Correction</h1>
								<p className="text-xs text-muted-foreground mt-1">Search and correct learner attendance records</p>
							</div>
							<Edit className="h-6 w-6 text-primary" />
						</div>

						{/* Search Section */}
						<Card>
							<CardHeader className="border-b p-3">
								<div className="flex items-center gap-3">
									<div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<Search className="h-3 w-3 text-white" />
									</div>
									<div>
										<h2 className="text-sm font-bold">Search Learner Attendance</h2>
										<p className="text-xs text-muted-foreground">Select course and enter learner register number</p>
									</div>
								</div>
							</CardHeader>
							<CardContent className="pt-4 p-3">
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
									{/* Institution Selection - Only shown for super_admin with "All Institutions" */}
									{mustSelectInstitution && (
										<div className="space-y-2">
											<Label htmlFor="institution" className="text-xs font-semibold">
												Institution <span className="text-red-500">*</span>
											</Label>
											<Select
												value={selectedInstitutionId}
												onValueChange={setSelectedInstitutionId}
												disabled={loadingInstitutions}
											>
												<SelectTrigger className="h-8 text-xs">
													<SelectValue placeholder={loadingInstitutions ? "Loading..." : "Select institution..."} />
												</SelectTrigger>
												<SelectContent>
													{institutions.map((inst) => (
														<SelectItem key={inst.id} value={inst.id} className="text-xs">
															{inst.institution_name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}

									{/* Exam Session Selection */}
									{mustSelectSession && (
									<div className="space-y-2">
										<Label htmlFor="exam_session" className="text-xs font-semibold">
											Exam Session <span className="text-red-500">*</span>
										</Label>
										<Select
											value={selectedSessionId}
											onValueChange={setSelectedSessionId}
											disabled={loadingSessions || !selectedInstitutionId}
										>
											<SelectTrigger className="h-8 text-xs">
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
														{session.semester_type ? ` (${session.semester_type})` : ''}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									)}

									{/* Course Selection */}
									<div className="space-y-2">
										<Label htmlFor="course_code" className="text-xs font-semibold">
											Course Code <span className="text-red-500">*</span>
										</Label>
										<Popover open={courseComboboxOpen} onOpenChange={(open) => {
											setCourseComboboxOpen(open)
											if (!open) setCourseSearchQuery("")
										}}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={courseComboboxOpen}
													className="h-8 w-full justify-between text-xs font-normal overflow-hidden"
													disabled={loadingCourses || !selectedSessionId}
												>
													{!selectedSessionId ? (
														<span className="text-muted-foreground">Select exam session first...</span>
													) : loadingCourses ? (
														<span className="text-muted-foreground">Loading courses...</span>
													) : selectedCourseCode ? (
														<span className="truncate">
															{courses.find((course) => course.course_code === selectedCourseCode)?.course_code || selectedCourseCode}
															{" - "}
															{courses.find((course) => course.course_code === selectedCourseCode)?.course_name}
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
														<CommandEmpty>
															{courses.length === 0 ? "No courses found for this session." : "No course found."}
														</CommandEmpty>
														<CommandGroup>
															{courses
																.filter((course) => {
																	if (!courseSearchQuery.trim()) return true
																	const query = courseSearchQuery.toLowerCase()
																	return (
																		course.course_code.toLowerCase().includes(query) ||
																		course.course_name.toLowerCase().includes(query)
																	)
																})
																.map((course) => (
																	<CommandItem
																		key={course.id}
																		value={`${course.course_code} ${course.course_name}`}
																		onSelect={() => {
																			setSelectedCourseCode(course.course_code)
																			setCourseComboboxOpen(false)
																			setCourseSearchQuery("")
																		}}
																		className="text-xs"
																	>
																		<Check
																			className={cn(
																				"mr-2 h-3 w-3",
																				selectedCourseCode === course.course_code ? "opacity-100" : "opacity-0"
																			)}
																		/>
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

									{/* Register Number Input */}
									<div className="space-y-2">
										<Label htmlFor="register_no" className="text-xs font-semibold">
											Learner Register Number <span className="text-red-500">*</span>
										</Label>
										<div className="flex gap-2">
											<Input
												id="register_no"
												value={registerNo}
												onChange={(e) => setRegisterNo(e.target.value.toUpperCase())}
												placeholder={!selectedCourseCode ? "Select course first..." : "Enter register number (e.g., 23CS101)"}
												className="h-8 text-xs uppercase"
												disabled={!selectedCourseCode}
												onKeyDown={(e) => {
													if (e.key === 'Enter' && selectedCourseCode) {
														handleSearch()
													}
												}}
											/>
											<Button
												onClick={handleSearch}
												disabled={searching || !selectedCourseCode || !registerNo.trim()}
												size="sm"
												className="h-8 px-3 text-xs whitespace-nowrap"
											>
												{searching ? (
													<>
														<Loader2 className="h-3 w-3 mr-1 animate-spin" />
														Searching...
													</>
												) : (
													<>
														<Search className="h-3 w-3 mr-1" />
														Search
													</>
												)}
											</Button>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Learner Info & Attendance Record */}
						{showRecord && studentInfo && attendanceRecord && (
							<>
								{/* Learner Information Card */}
								<Card className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
									<CardContent className="pt-4 p-3">
										<div className="grid grid-cols-1 md:grid-cols-4 gap-3">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Register Number</p>
												<p className="text-xs font-semibold">{studentInfo.register_no}</p>
											</div>
											<div>
												<p className="text-xs font-medium text-muted-foreground">Learner Name</p>
												<p className="text-xs font-semibold">{studentInfo.name}</p>
											</div>
											<div>
												<p className="text-xs font-medium text-muted-foreground">Course</p>
												<p className="text-xs font-semibold">{attendanceRecord.course_code}</p>
											</div>
											<div>
												<p className="text-xs font-medium text-muted-foreground">Exam Date</p>
												<p className="text-xs font-semibold">
													{new Date(attendanceRecord.exam_date).toLocaleDateString('en-IN', {
														day: '2-digit',
														month: 'short',
														year: 'numeric'
													})}
												</p>
											</div>
											{attendanceRecord.exam_type === 'Practical' && attendanceRecord.batch_no && (
												<div>
													<p className="text-xs font-medium text-muted-foreground">Exam Type</p>
													<Badge className="bg-purple-100 text-purple-800 border-purple-200">
														Practical - Batch {attendanceRecord.batch_no}
													</Badge>
												</div>
											)}
										</div>
									</CardContent>
								</Card>

								{/* Attendance Record Table */}
								<Card>
									<CardHeader className="border-b p-3">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-3">
												<div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
													<Edit className="h-3 w-3 text-white" />
												</div>
												<div>
													<h2 className="text-sm font-bold">Attendance Correction</h2>
													<p className="text-xs text-muted-foreground">Update attendance status and add mandatory remarks</p>
												</div>
											</div>
										</div>
									</CardHeader>
									<CardContent className="pt-4 p-3">
										<div className="border rounded-lg overflow-hidden">
											<Table>
												<TableHeader className="bg-slate-50 dark:bg-slate-900/50">
													<TableRow>
														<TableHead className="text-xs">Program</TableHead>
														<TableHead className="text-xs">Course</TableHead>
														<TableHead className="text-xs">Session</TableHead>
														<TableHead className="text-xs w-32">Attendance</TableHead>
														<TableHead className="text-xs">Remarks <span className="text-red-500">*</span></TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													<TableRow>
														<TableCell className="text-sm">
															<div className="flex flex-col">
																<span className="font-medium">{attendanceRecord.program_code}</span>
																<span className="text-xs text-muted-foreground">{attendanceRecord.program_name}</span>
															</div>
														</TableCell>
														<TableCell className="text-sm">
															<div className="flex flex-col">
																<span className="font-medium">{attendanceRecord.course_code}</span>
																<span className="text-xs text-muted-foreground">{attendanceRecord.course_name}</span>
															</div>
														</TableCell>
														<TableCell className="text-sm">
															<div className="flex flex-col gap-1">
																<span className="text-xs text-muted-foreground font-medium">
																	{formatCurrentDateTime(currentTime)}
																</span>
																<Badge variant="outline" className="text-xs w-fit">
																	{attendanceRecord.session}
																</Badge>
															</div>
														</TableCell>
														<TableCell>
															<Select
																value={attendanceRecord.attendance_status}
																onValueChange={handleAttendanceChange}
															>
																<SelectTrigger className={`h-7 text-xs w-24 ${
																	attendanceRecord.attendance_status === 'Absent'
																		? 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300'
																		: 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300'
																}`}>
																	<SelectValue />
																</SelectTrigger>
																<SelectContent>
																	<SelectItem value="Present">Present</SelectItem>
																	<SelectItem value="Absent">Absent</SelectItem>
																</SelectContent>
															</Select>
														</TableCell>
														<TableCell>
															<div className="space-y-1">
																<Input
																	value={attendanceRecord.remarks}
																	onChange={(e) => handleRemarksChange(e.target.value)}
																	placeholder="Enter remarks (required)"
																	className={cn("h-7 text-xs", remarksError && "border-red-500 bg-red-50 dark:bg-red-900/20")}
																/>
																{remarksError && (
																	<p className="text-[10px] text-red-500 font-medium">Remarks are required</p>
																)}
															</div>
														</TableCell>
													</TableRow>
												</TableBody>
											</Table>
										</div>

										{/* Action Buttons */}
										<div className="flex justify-end gap-2 mt-4 pt-4 border-t">
											<Button
												onClick={handleCancel}
												variant="outline"
												size="sm"
												className="h-8 px-3 text-xs"
											>
												Cancel
											</Button>
											<Button
												onClick={handleSubmit}
												disabled={saving}
												size="sm"
												className="h-8 px-3 text-xs"
											>
												{saving ? (
													<>
														<Loader2 className="h-3 w-3 mr-1 animate-spin" />
														Updating...
													</>
												) : (
													<>
														<CheckCircle className="h-3 w-3 mr-1" />
														Submit Changes
													</>
												)}
											</Button>
										</div>
									</CardContent>
								</Card>
							</>
						)}
					</div>
				</div>

				<AppFooter />
			</SidebarInset>

			{/* Confirmation Dialog */}
			<AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
				<AlertDialogContent className="max-w-md">
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2">
							<Edit className="h-5 w-5 text-blue-600" />
							Confirm Attendance Correction
						</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to update this attendance record?
						</AlertDialogDescription>
					</AlertDialogHeader>

					<div className="space-y-3 py-4">
						{/* Learner Details */}
						{studentInfo && attendanceRecord && (
							<div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
								<div>
									<p className="text-sm font-medium text-blue-900 dark:text-blue-100">
										{studentInfo.name} ({studentInfo.register_no})
									</p>
									<p className="text-xs text-blue-700 dark:text-blue-300">
										{attendanceRecord.course_code} - New Status: {attendanceRecord.attendance_status}
									</p>
								</div>
							</div>
						)}

						{/* Warning */}
						<div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
							<AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
							<p className="text-xs text-yellow-800 dark:text-yellow-200">
								This action will modify the attendance record. Your email will be recorded as the updater.
							</p>
						</div>
					</div>

					<AlertDialogFooter>
						<AlertDialogCancel>No, Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmUpdate}
							className="bg-blue-600 hover:bg-blue-700"
						>
							Yes, Update
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
