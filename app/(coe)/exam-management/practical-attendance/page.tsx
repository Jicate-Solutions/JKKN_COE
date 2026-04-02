'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/hooks/common/use-toast'
import { Loader2, ClipboardCheck, Users, CheckCircle, XCircle, AlertTriangle, Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getISTDate } from '@/lib/utils/date-utils'

import Link from 'next/link'

// Institution filter hook
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useSessionSync } from '@/hooks/use-session-sync'

// Auth context
import { useAuth } from '@/lib/auth/auth-context-parent'

// Type imports
import type {
	PracticalInstitution,
	PracticalSession,
	PracticalCourse,
	PracticalBatch,
	PracticalStudent,
	PracticalAttendanceRecord,
} from '@/types/practical-attendance'

// Service layer imports
import {
	fetchPracticalInstitutions,
	fetchPracticalSessions,
	fetchPracticalCourses,
	fetchPracticalBatches,
	checkPracticalAttendance,
	loadBatchStudents,
	savePracticalAttendance,
} from '@/services/exam-management/practical-attendance-service'

export default function PracticalAttendancePage() {
	const { toast } = useToast()
	const { user } = useAuth()

	// Institution filter hook - handles role-based institution access
	const {
		isReady,
		appendToUrl,
		getInstitutionIdForCreate,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<PracticalInstitution[]>([])
	const [sessions, setSessions] = useState<PracticalSession[]>([])
	const [courses, setCourses] = useState<PracticalCourse[]>([])
	const [batches, setBatches] = useState<PracticalBatch[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('')
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [selectedCourseId, setSelectedCourseId] = useState<string>('')
	const [selectedBatchId, setSelectedBatchId] = useState<string>('')

	// Student list and attendance
	const [students, setStudents] = useState<PracticalStudent[]>([])
	const [attendanceRecords, setAttendanceRecords] = useState<PracticalAttendanceRecord[]>([])

	// UI state
	const [loading, setLoading] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [saving, setSaving] = useState(false)
	const [isViewMode, setIsViewMode] = useState(false)
	const [showStudentList, setShowStudentList] = useState(false)
	const [showConfirmDialog, setShowConfirmDialog] = useState(false)

	// Combobox open state
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)

	// Search state for dropdowns
	const [institutionSearch, setInstitutionSearch] = useState('')
	const [sessionSearch, setSessionSearch] = useState('')
	const [courseSearch, setCourseSearch] = useState('')

	// Today's date in IST (used for API queries)
	const todayIST = getISTDate()

	// Fetch institutions when context is ready
	const fetchInstitutions = useCallback(async () => {
		try {
			const data = await fetchPracticalInstitutions(appendToUrl)
			setInstitutions(data)
		} catch (error) {
			console.error('Error fetching institutions:', error)
		}
	}, [appendToUrl])

	// Load institutions when context is ready
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
		}
	}, [isReady, fetchInstitutions])

	// Auto-select institution for normal users (non super_admin)
	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId && institutions.length > 0) {
			const exists = institutions.some(inst => inst.id === contextInstitutionId)
			if (exists) {
				console.log('Auto-selecting institution for normal user:', contextInstitutionId)
				setSelectedInstitutionId(contextInstitutionId)
			}
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId, institutions])

	// Cascade 1: Institution → Sessions
	useEffect(() => {
		if (selectedInstitutionId) {
			console.log('Cascade 1: Institution changed, fetching sessions for:', selectedInstitutionId)
			// Reset dependent fields
			setSelectedSessionId('')
			setSelectedCourseId('')
			setSelectedBatchId('')
			setSessions([])
			setCourses([])
			setBatches([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
			// Fetch sessions
			fetchSessions(selectedInstitutionId)
		} else {
			setSelectedSessionId('')
			setSelectedCourseId('')
			setSelectedBatchId('')
			setSessions([])
			setCourses([])
			setBatches([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
		}
	}, [selectedInstitutionId])

	const fetchSessions = async (institutionId: string) => {
		try {
			setLoading(true)
			const data = await fetchPracticalSessions(institutionId)
			setSessions(data)
		} catch (error) {
			console.error('Error fetching sessions:', error)
		} finally {
			setLoading(false)
		}
	}

	// Cascade 2: Session → Courses (practical courses for today)
	useEffect(() => {
		if (selectedSessionId && selectedInstitutionId) {
			// Reset dependent fields
			setSelectedCourseId('')
			setSelectedBatchId('')
			setCourses([])
			setBatches([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
			// Fetch courses
			fetchCoursesData(selectedInstitutionId, selectedSessionId)
		} else if (!selectedSessionId) {
			setSelectedCourseId('')
			setSelectedBatchId('')
			setCourses([])
			setBatches([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
		}
	}, [selectedSessionId])

	const fetchCoursesData = async (institutionId: string, sessionId: string) => {
		try {
			setLoading(true)
			const data = await fetchPracticalCourses(institutionId, sessionId)
			setCourses(data)

			if (data.length === 0) {
				toast({
					title: 'No Practical Courses Found',
					description: 'No practical courses with exams scheduled for today.',
					className: 'bg-blue-50 border-blue-200 text-blue-800',
				})
			}
		} catch (error) {
			console.error('Error fetching courses:', error)
			toast({
				title: 'Error',
				description: error instanceof Error ? error.message : 'Failed to fetch courses',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	// Cascade 3: Course → Batches
	useEffect(() => {
		if (selectedCourseId && selectedSessionId && selectedInstitutionId) {
			// Reset dependent fields
			setSelectedBatchId('')
			setBatches([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
			// Fetch batches
			fetchBatchesData(selectedInstitutionId, selectedSessionId, selectedCourseId)
		} else if (!selectedCourseId) {
			setSelectedBatchId('')
			setBatches([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
		}
	}, [selectedCourseId])

	const fetchBatchesData = async (institutionId: string, sessionId: string, courseId: string) => {
		try {
			setLoading(true)
			const data = await fetchPracticalBatches(institutionId, sessionId, courseId)
			setBatches(data)
		} catch (error) {
			console.error('Error fetching batches:', error)
			toast({
				title: 'Error',
				description: error instanceof Error ? error.message : 'Failed to fetch batches',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	// Cascade 4: Batch → Load Students
	useEffect(() => {
		if (selectedBatchId) {
			// Reset state before loading
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
			// Load students
			handleLoadStudents(selectedBatchId)
		} else {
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
		}
	}, [selectedBatchId])

	// Load student list for selected batch
	const handleLoadStudents = async (timetableId: string) => {
		try {
			setLoadingStudents(true)

			// First, check if attendance already exists
			const checkData = await checkPracticalAttendance(timetableId)

			if (checkData.exists && checkData.data.length > 0) {
				// Attendance already exists - load in view mode
				setIsViewMode(true)

				// Map existing attendance records to display format
				const existingRecords: PracticalAttendanceRecord[] = checkData.data.map((att: any) => ({
					exam_registration_id: att.exam_registration_id,
					student_id: att.student_id,
					stu_register_no: att.stu_register_no,
					student_name: att.student_name,
					attempt_number: att.attempt_number,
					is_regular: att.is_regular,
					is_present: att.attendance_status === 'Present',
					is_absent: att.attendance_status === 'Absent',
					attendance_status: att.attendance_status,
					remarks: att.remarks || '',
				}))

				// Sort by is_regular (TRUE first), then register number, then attempt number
				const sortedExistingRecords = existingRecords.sort((a, b) => {
					const aRegular = a.is_regular === true ? 0 : 1
					const bRegular = b.is_regular === true ? 0 : 1
					if (aRegular !== bRegular) return aRegular - bRegular

					const regNoCompare = a.stu_register_no.localeCompare(b.stu_register_no)
					if (regNoCompare !== 0) return regNoCompare

					return (a.attempt_number || 1) - (b.attempt_number || 1)
				})

				setAttendanceRecords(sortedExistingRecords)
				setShowStudentList(true)

				toast({
					title: 'Attendance Already Recorded',
					description: 'Attendance has already been recorded for this batch. Viewing in read-only mode.',
					className: 'bg-blue-50 border-blue-200 text-blue-800',
				})

				return
			}

			// Load fresh student list for new attendance
			setIsViewMode(false)
			const studentData = await loadBatchStudents(timetableId)

			if (studentData.length === 0) {
				toast({
					title: 'No Students Allotted',
					description: 'No students allotted for this batch. Please contact COE Office.',
					className: 'bg-yellow-50 border-yellow-200 text-yellow-800',
				})
				setShowStudentList(false)
				return
			}

			// Sort student data by is_regular (TRUE first), then register number, then attempt number
			const sortedStudentData = studentData.sort((a, b) => {
				const aRegular = a.is_regular === true ? 0 : 1
				const bRegular = b.is_regular === true ? 0 : 1
				if (aRegular !== bRegular) return aRegular - bRegular

				const regNoCompare = a.stu_register_no.localeCompare(b.stu_register_no)
				if (regNoCompare !== 0) return regNoCompare

				return (a.attempt_number || 1) - (b.attempt_number || 1)
			})

			setStudents(sortedStudentData)

			// Initialize attendance records - all students start as Absent
			const initialRecords: PracticalAttendanceRecord[] = sortedStudentData.map((student: PracticalStudent) => ({
				exam_registration_id: student.id,
				student_id: student.student_id,
				stu_register_no: student.stu_register_no,
				student_name: student.student_name,
				attempt_number: student.attempt_number,
				is_regular: student.is_regular,
				is_present: false,
				is_absent: true,
				attendance_status: 'Absent',
				remarks: '',
			}))

			setAttendanceRecords(initialRecords)
			setShowStudentList(true)

			toast({
				title: 'Students Loaded',
				description: `${studentData.length} student${studentData.length > 1 ? 's' : ''} loaded. Mark attendance below.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('Error loading students:', error)
			toast({
				title: 'Error',
				description: error instanceof Error ? error.message : 'Failed to load student list. Please try again.',
				variant: 'destructive',
			})
		} finally {
			setLoadingStudents(false)
		}
	}

	// Toggle individual student attendance
	const handleToggleAttendance = (index: number) => {
		if (isViewMode) return

		const updated = [...attendanceRecords]
		updated[index].is_present = !updated[index].is_present
		updated[index].is_absent = !updated[index].is_present
		updated[index].attendance_status = updated[index].is_present ? 'Present' : 'Absent'
		setAttendanceRecords(updated)
	}

	// Mark all present toggle
	const handleMarkAllPresent = () => {
		if (isViewMode) return

		const allPresent = attendanceRecords.every(r => r.is_present)
		const updated = attendanceRecords.map(record => ({
			...record,
			is_present: !allPresent,
			is_absent: allPresent,
			attendance_status: !allPresent ? 'Present' : 'Absent',
		}))
		setAttendanceRecords(updated)

		toast({
			title: !allPresent ? 'All Marked Present' : 'All Marked Absent',
			description: !allPresent ? 'All students have been marked as present.' : 'All students have been marked as absent.',
			className: 'bg-green-50 border-green-200 text-green-800',
		})
	}

	// Update remarks
	const handleRemarksChange = (index: number, remarks: string) => {
		if (isViewMode) return

		const updated = [...attendanceRecords]
		updated[index].remarks = remarks
		setAttendanceRecords(updated)
	}

	// Save attendance - show confirmation dialog
	const handleSaveAttendance = async () => {
		if (isViewMode) {
			toast({
				title: 'Read-Only Mode',
				description: 'Attendance has already been recorded and cannot be modified.',
				variant: 'destructive',
			})
			return
		}

		setShowConfirmDialog(true)
	}

	// Actual save function after confirmation
	const confirmSaveAttendance = async () => {
		setShowConfirmDialog(false)

		try {
			setSaving(true)

			console.log('Starting save practical attendance with data:', {
				institutions_id: selectedInstitutionId,
				examination_session_id: selectedSessionId,
				exam_timetable_id: selectedBatchId,
				course_id: selectedCourseId,
				attendance_count: attendanceRecords.length,
			})

			await savePracticalAttendance({
				institutions_id: selectedInstitutionId,
				examination_session_id: selectedSessionId,
				exam_timetable_id: selectedBatchId,
				course_id: selectedCourseId,
				verified_by: user?.id,
				created_by: user?.id,
				submitted_by: user?.id,
				attendance_records: attendanceRecords.map(record => ({
					exam_registration_id: record.exam_registration_id,
					student_id: record.student_id,
					attempt_number: record.attempt_number,
					is_regular: record.is_regular,
					is_absent: record.is_absent,
					remarks: record.remarks || undefined,
				})),
			})

			toast({
				title: 'Attendance Recorded',
				description: 'Practical attendance successfully saved.',
				className: 'bg-green-50 border-green-200 text-green-800',
				duration: 5000,
			})

			// Switch to view mode and update batch's attendance_exists in local state
			setIsViewMode(true)
			setBatches(prev => prev.map(b =>
				b.timetable_id === selectedBatchId
					? { ...b, attendance_exists: true }
					: b
			))
		} catch (error) {
			console.error('Error saving attendance:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to save attendance'

			toast({
				title: 'Save Failed',
				description: errorMessage,
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
				duration: 8000,
			})
		} finally {
			setSaving(false)
		}
	}

	// Get display values
	const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
	const selectedSession = sessions.find(s => s.id === selectedSessionId)
	const selectedCourse = courses.find(c => c.course_id === selectedCourseId)
	const selectedBatch = batches.find(b => b.timetable_id === selectedBatchId)

	// Count present/absent
	const presentCount = attendanceRecords.filter(r => r.is_present).length
	const absentCount = attendanceRecords.filter(r => !r.is_present).length
	const allPresent = attendanceRecords.length > 0 && attendanceRecords.every(r => r.is_present)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					<div className="flex items-center justify-between gap-2">
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link href="/dashboard">Home</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link href="/dashboard">During-Exam</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Practical Attendance</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Title Section */}
					<div className="flex items-center gap-3">
						<div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-900/20 flex items-center justify-center">
							<ClipboardCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
						</div>
						<div>
							<h1 className="text-xl font-bold">Practical Exam Attendance</h1>
							<p className="text-xs text-muted-foreground">Record batch-wise attendance for practical exams</p>
						</div>
					</div>

					<div className="space-y-3">
						{/* Cascading Filter Dropdowns */}
						<Card className="shadow-sm">
							<CardContent className="p-3">
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
									{/* 1. Institution - Only show for super_admin */}
									{mustSelectInstitution && (
										<div className="space-y-1">
											<Label htmlFor="institution" className="text-xs font-medium">
												Institution <span className="text-red-500">*</span>
											</Label>
											<Popover open={institutionOpen} onOpenChange={(open) => {
												setInstitutionOpen(open)
												if (!open) setInstitutionSearch('')
											}}>
												<PopoverTrigger asChild>
													<Button
														variant="outline"
														role="combobox"
														aria-expanded={institutionOpen}
														className="h-auto min-h-[28px] text-xs justify-start w-full font-normal px-2 py-1.5"
														disabled={loading}
													>
														<span className="flex-1 text-left whitespace-normal break-words leading-tight">
															{selectedInstitutionId
																? institutions.find((inst) => inst.id === selectedInstitutionId)
																	? `${institutions.find((inst) => inst.id === selectedInstitutionId)?.institution_code} - ${institutions.find((inst) => inst.id === selectedInstitutionId)?.institution_name}`
																	: 'Select institution'
																: 'Select institution'}
														</span>
														<ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[300px] max-w-[90vw] p-0" align="start">
													<Command shouldFilter={false}>
														<CommandInput
															placeholder="Search institution..."
															className="h-9 text-xs"
															value={institutionSearch}
															onValueChange={setInstitutionSearch}
														/>
														<CommandList className="max-h-[300px]">
															<CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No institution found.</CommandEmpty>
															<CommandGroup>
																{institutions
																	.filter((inst) => {
																		if (!institutionSearch) return true
																		const search = institutionSearch.toLowerCase()
																		return (
																			inst.institution_code.toLowerCase().includes(search) ||
																			inst.institution_name.toLowerCase().includes(search)
																		)
																	})
																	.map((inst) => (
																	<CommandItem
																		key={inst.id}
																		value={inst.id}
																		onSelect={() => {
																			setSelectedInstitutionId(inst.id)
																			setInstitutionOpen(false)
																		}}
																		className={cn(
																			'text-xs py-2 px-2 cursor-pointer',
																			selectedInstitutionId === inst.id && 'bg-amber-100 dark:bg-amber-900/30'
																		)}
																	>
																		{inst.institution_code} - {inst.institution_name}
																	</CommandItem>
																))}
															</CommandGroup>
														</CommandList>
													</Command>
												</PopoverContent>
											</Popover>
										</div>
									)}

									{/* 2. Exam Session */}
									{mustSelectSession && (
									<div className="space-y-1">
										<Label htmlFor="session" className="text-xs font-medium">
											Exam Session <span className="text-red-500">*</span>
										</Label>
										<Popover open={sessionOpen} onOpenChange={(open) => {
											setSessionOpen(open)
											if (!open) setSessionSearch('')
										}}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={sessionOpen}
													className="h-auto min-h-[28px] text-xs justify-start w-full font-normal px-2 py-1.5"
													disabled={!selectedInstitutionId || loading}
												>
													<span className="flex-1 text-left whitespace-normal break-words leading-tight">
														{selectedSessionId
															? sessions.find((s) => s.id === selectedSessionId)?.session_name || 'Select session...'
															: 'Select session...'}
													</span>
													<ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[300px] max-w-[90vw] p-0" align="start">
												<Command shouldFilter={false}>
													<CommandInput
														placeholder="Search session..."
														className="h-9 text-xs"
														value={sessionSearch}
														onValueChange={setSessionSearch}
													/>
													<CommandList className="max-h-[300px]">
														<CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No session found.</CommandEmpty>
														<CommandGroup>
															{sessions
																.filter((session) => {
																	if (!sessionSearch) return true
																	const search = sessionSearch.toLowerCase()
																	return session.session_name.toLowerCase().includes(search)
																})
																.map((session) => (
																<CommandItem
																	key={session.id}
																	value={session.id}
																	onSelect={() => {
																		setSelectedSessionId(session.id)
																		setSessionOpen(false)
																	}}
																	className={cn(
																		'text-xs py-2 px-2 cursor-pointer',
																		selectedSessionId === session.id && 'bg-amber-100 dark:bg-amber-900/30'
																	)}
																>
																	{session.session_name}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
									)}

									{/* 3. Course */}
									<div className="space-y-1">
										<Label htmlFor="course" className="text-xs font-medium">
											Course <span className="text-red-500">*</span>
										</Label>
										<Popover open={courseOpen} onOpenChange={(open) => {
											setCourseOpen(open)
											if (!open) setCourseSearch('')
										}}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={courseOpen}
													className="h-auto min-h-[28px] text-xs justify-start w-full font-normal px-2 py-1.5"
													disabled={!selectedSessionId || loading}
												>
													<span className="flex-1 text-left whitespace-normal break-words leading-tight">
														{selectedCourseId
															? (() => {
																const c = courses.find((c) => c.course_id === selectedCourseId)
																return c ? `${c.course_code} - ${c.course_name}` : 'Select course...'
															})()
															: 'Select course...'}
													</span>
													<ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[300px] max-w-[90vw] p-0" align="start">
												<Command shouldFilter={false}>
													<CommandInput
														placeholder="Search course..."
														className="h-9 text-xs"
														value={courseSearch}
														onValueChange={setCourseSearch}
													/>
													<CommandList className="max-h-[300px]">
														<CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No practical courses for today.</CommandEmpty>
														<CommandGroup>
															{courses
																.filter((course) => {
																	if (!courseSearch) return true
																	const search = courseSearch.toLowerCase()
																	return (
																		course.course_code.toLowerCase().includes(search) ||
																		course.course_name.toLowerCase().includes(search)
																	)
																})
																.map((course) => (
																<CommandItem
																	key={course.course_id}
																	value={course.course_id}
																	onSelect={() => {
																		setSelectedCourseId(course.course_id)
																		setCourseOpen(false)
																	}}
																	className={cn(
																		'text-xs py-2 px-2 cursor-pointer',
																		selectedCourseId === course.course_id && 'bg-amber-100 dark:bg-amber-900/30'
																	)}
																>
																	{course.course_code} - {course.course_name}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									{/* 4. Batch */}
									<div className="space-y-1">
										<Label htmlFor="batch" className="text-xs font-medium">
											Batch <span className="text-red-500">*</span>
										</Label>
										<Select
											value={selectedBatchId}
											onValueChange={setSelectedBatchId}
											disabled={!selectedCourseId || loading}
										>
											<SelectTrigger id="batch" className="h-auto min-h-[28px] text-xs">
												<SelectValue placeholder={
													!selectedCourseId
														? 'Select course first'
														: batches.length === 0
															? 'No batches found'
															: 'Select batch'
												} />
											</SelectTrigger>
											<SelectContent>
												{batches.map((batch) => (
													<SelectItem key={batch.timetable_id} value={batch.timetable_id} className="text-xs">
														Batch {batch.batch_no} ({batch.session}, {batch.student_count} students){batch.attendance_exists ? ' \u2713' : ''}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Loading indicator */}
									{loadingStudents && selectedBatchId && (
										<div className="flex items-center justify-center col-span-full h-7">
											<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
												<Loader2 className="h-3 w-3 animate-spin" />
												<span>Loading students...</span>
											</div>
										</div>
									)}
								</div>
							</CardContent>
						</Card>

						{/* Empty state when course selected but no batches */}
						{selectedCourseId && !loading && batches.length === 0 && (
							<Card className="shadow-sm">
								<CardContent className="p-6">
									<div className="flex flex-col items-center justify-center text-center space-y-2">
										<Users className="h-8 w-8 text-muted-foreground/50" />
										<p className="text-sm text-muted-foreground">No practical batches found for today</p>
										<p className="text-xs text-muted-foreground/70">Please check if practical exam timetables have been published for today&apos;s date.</p>
									</div>
								</CardContent>
							</Card>
						)}

						{/* Batch Info Card */}
						{showStudentList && selectedBatch && (
							<Card className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 border-indigo-200 dark:border-indigo-800 shadow-sm">
								<CardContent className="p-2">
									<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
										{mustSelectInstitution && (
											<div>
												<p className="text-xs font-medium text-muted-foreground">Institution</p>
												<p className="text-xs font-semibold">{selectedInstitution?.institution_code}</p>
											</div>
										)}
										<div>
											<p className="text-xs font-medium text-muted-foreground">Course</p>
											<p className="text-xs font-semibold">{selectedCourse?.course_code} - {selectedCourse?.course_name}</p>
										</div>
										<div>
											<p className="text-xs font-medium text-muted-foreground">Batch</p>
											<Badge variant="secondary" className="text-xs">Batch {selectedBatch.batch_no}</Badge>
										</div>
										<div>
											<p className="text-xs font-medium text-muted-foreground">Session</p>
											<Badge variant="outline" className="text-xs">{selectedBatch.session}</Badge>
										</div>
										<div>
											<p className="text-xs font-medium text-muted-foreground">Exam Date</p>
											<Badge variant="outline" className="text-xs">
												{new Date(selectedBatch.exam_date).toLocaleDateString('en-IN', {
													day: '2-digit',
													month: 'short',
													year: 'numeric',
												})}
											</Badge>
										</div>
										<div>
											<p className="text-xs font-medium text-muted-foreground">Total Learners</p>
											<p className="text-xs font-semibold">{attendanceRecords.length}</p>
										</div>
										{isViewMode && (
											<div>
												<Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 text-xs">
													View Only
												</Badge>
											</div>
										)}
									</div>

									{isViewMode && (
										<div className="mt-2 p-1.5 bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
											<div className="flex items-center gap-1.5">
												<AlertTriangle className="h-3 w-3 text-blue-600 dark:text-blue-400" />
												<span className="text-xs font-medium text-blue-800 dark:text-blue-200">
													Attendance has already been recorded for this batch. Use Attendance Correction for changes.
												</span>
											</div>
										</div>
									)}
								</CardContent>
							</Card>
						)}

						{/* Attendance Marking Grid */}
						{showStudentList && (
							<Card>
								<CardHeader className="border-b p-3">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											<div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
												<ClipboardCheck className="h-3 w-3 text-white" />
											</div>
											<div>
												<h2 className="text-sm font-bold">
													<span className="text-blue-600">Mark Attendance</span> | Total Learners: {attendanceRecords.length} | Present: <span className="text-green-600">{presentCount}</span> | Absent: <span className="text-red-600">{absentCount}</span>
												</h2>
												<p className="text-xs text-muted-foreground">
													{isViewMode ? 'Viewing recorded attendance' : 'Check the box to mark learner as present'}
												</p>
											</div>
										</div>
										{!isViewMode && (
											<div className="flex items-center gap-2">
												<Checkbox
													id="mark-all-present"
													checked={allPresent}
													onCheckedChange={handleMarkAllPresent}
												/>
												<Label htmlFor="mark-all-present" className="text-xs font-medium cursor-pointer">
													Mark All Present
												</Label>
											</div>
										)}
									</div>

									{/* Attendance counts */}
									{!isViewMode && (
										<div className="flex items-center gap-4 mt-2">
											<div className="flex items-center gap-1.5">
												<CheckCircle className="h-3.5 w-3.5 text-green-600" />
												<span className="text-xs font-medium text-green-700">Present: {presentCount}</span>
											</div>
											<div className="flex items-center gap-1.5">
												<XCircle className="h-3.5 w-3.5 text-red-600" />
												<span className="text-xs font-medium text-red-700">Absent: {absentCount}</span>
											</div>
										</div>
									)}
								</CardHeader>
								<CardContent className="pt-4 p-3">
									<div className="border rounded-lg overflow-hidden">
										<div className="max-h-[60vh] overflow-y-auto">
											<Table>
												<TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900/50 z-10">
													<TableRow>
														<TableHead className="w-12 text-xs">S.No</TableHead>
														<TableHead className="text-xs">Register Number</TableHead>
														<TableHead className="text-xs">Learner Name</TableHead>
														<TableHead className="w-24 text-xs text-center">Present</TableHead>
														<TableHead className="w-24 text-xs text-center">Status</TableHead>
														<TableHead className="text-xs">Remarks</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{attendanceRecords.map((record, index) => (
														<TableRow key={record.exam_registration_id}>
															<TableCell className="text-sm font-medium">{index + 1}</TableCell>
															<TableCell className="text-sm font-mono">
																{record.stu_register_no}
																{!record.is_regular && (
																	<Badge variant="outline" className="ml-2 text-[10px] bg-orange-50 text-orange-700 border-orange-200">
																		Supplementary
																	</Badge>
																)}
															</TableCell>
															<TableCell className="text-sm">{record.student_name}</TableCell>
															<TableCell className="text-center">
																<div className="flex justify-center">
																	<Checkbox
																		checked={record.is_present}
																		onCheckedChange={() => handleToggleAttendance(index)}
																		disabled={isViewMode}
																	/>
																</div>
															</TableCell>
															<TableCell className="text-center">
																<Badge
																	className={`text-xs font-medium ${
																		record.is_present
																			? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200'
																			: 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200'
																	}`}
																>
																	{record.attendance_status}
																</Badge>
															</TableCell>
															<TableCell>
																<Input
																	value={record.remarks}
																	onChange={(e) => handleRemarksChange(index, e.target.value)}
																	placeholder="Optional remarks"
																	disabled={isViewMode}
																	className="h-7 text-xs"
																/>
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</div>
									</div>

									{/* Save Button */}
									{!isViewMode && (
										<div className="flex justify-end gap-2 mt-4 pt-4 border-t">
											<Button
												onClick={handleSaveAttendance}
												disabled={saving}
												size="sm"
												className="min-w-[200px] h-8 px-3 text-xs"
											>
												{saving ? (
													<>
														<Loader2 className="h-3 w-3 mr-1 animate-spin" />
														Saving...
													</>
												) : (
													<>
														<CheckCircle className="h-3 w-3 mr-1" />
														Save Attendance
													</>
												)}
											</Button>
										</div>
									)}
								</CardContent>
							</Card>
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
							<CheckCircle className="h-5 w-5 text-blue-600" />
							Confirm Attendance
						</AlertDialogTitle>
						<AlertDialogDescription>
							Please review the attendance summary before submitting:
						</AlertDialogDescription>
					</AlertDialogHeader>

					<div className="space-y-3 py-4">
						{/* Course Info */}
						<div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-lg">
							<span className="text-sm font-medium text-slate-700 dark:text-slate-300">Course</span>
							<span className="text-sm font-semibold">{selectedCourse?.course_code} - {selectedCourse?.course_name}</span>
						</div>

						{/* Batch Info */}
						<div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-lg">
							<span className="text-sm font-medium text-slate-700 dark:text-slate-300">Batch</span>
							<Badge variant="secondary" className="text-xs">Batch {selectedBatch?.batch_no}</Badge>
						</div>

						{/* Date */}
						<div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-lg">
							<span className="text-sm font-medium text-slate-700 dark:text-slate-300">Date</span>
							<span className="text-sm font-semibold">
								{selectedBatch ? new Date(selectedBatch.exam_date).toLocaleDateString('en-IN', {
									day: '2-digit',
									month: 'short',
									year: 'numeric',
								}) : '-'}
							</span>
						</div>

						{/* Present Count */}
						<div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
							<div className="flex items-center gap-2">
								<CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
								<span className="text-sm font-medium text-green-900 dark:text-green-100">Present</span>
							</div>
							<span className="text-lg font-bold text-green-700 dark:text-green-300">{presentCount}</span>
						</div>

						{/* Absent Count */}
						<div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
							<div className="flex items-center gap-2">
								<XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
								<span className="text-sm font-medium text-red-900 dark:text-red-100">Absent</span>
							</div>
							<span className="text-lg font-bold text-red-700 dark:text-red-300">{absentCount}</span>
						</div>

						{/* Total */}
						<div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
							<div className="flex items-center gap-2">
								<Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
								<span className="text-sm font-medium text-blue-900 dark:text-blue-100">Total</span>
							</div>
							<span className="text-lg font-bold text-blue-700 dark:text-blue-300">{attendanceRecords.length}</span>
						</div>

						{/* Warning */}
						<div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mt-4">
							<AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
							<p className="text-xs text-yellow-800 dark:text-yellow-200">
								Once saved, attendance cannot be modified from this page. Use Attendance Correction for changes.
							</p>
						</div>
					</div>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmSaveAttendance}
							className="bg-green-600 hover:bg-green-700"
						>
							Confirm & Save
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
