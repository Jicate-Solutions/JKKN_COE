"use client"

import { useState, useEffect, useCallback } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { Loader2, ClipboardCheck, Calendar, BookOpen, Clock, Users, CheckCircle, XCircle, AlertTriangle, Check, ChevronsUpDown, FileText, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { getISTDate } from "@/lib/utils/date-utils"

import Link from "next/link"

// Institution filter hook
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
// MyJKKN API integration hook for fetching programs
import { useMyJKKNInstitutionFilter } from '@/hooks/use-myjkkn-institution-filter'

// Type imports
import type {
	Institution,
	ExaminationSession,
	Program,
	CourseOffering,
	ExamDate,
	StudentRegistration,
	AttendanceRecord,
} from '@/types/exam-attendance'

// Service layer imports
import {
	fetchSessions as fetchSessionsService,
	fetchSessionTypes as fetchSessionTypesService,
	fetchCourses as fetchCoursesService,
	checkAttendance,
	loadStudents,
	saveAttendance as saveAttendanceService,
} from '@/services/exam-management/exam-attendance-service'

export default function ExamAttendancePage() {
	const { toast } = useToast()

	// Institution filter hook - handles role-based institution access
	const {
		isReady,
		appendToUrl,
		getInstitutionIdForCreate,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	// MyJKKN API hook for fetching programs
	const { fetchPrograms: fetchProgramsFromMyJKKN } = useMyJKKNInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [sessionTypes, setSessionTypes] = useState<ExamDate[]>([])
	const [courses, setCourses] = useState<CourseOffering[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	const [selectedSessionId, setSelectedSessionId] = useState<string>("")
	const [selectedProgramCode, setSelectedProgramCode] = useState<string>("")
	const [selectedExamDate, setSelectedExamDate] = useState<string>("")
	const [selectedSessionType, setSelectedSessionType] = useState<string>("")
	const [selectedCourseCode, setSelectedCourseCode] = useState<string>("")

	// Student list and attendance
	const [students, setStudents] = useState<StudentRegistration[]>([])
	const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])

	// UI state
	const [loading, setLoading] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [saving, setSaving] = useState(false)
	const [isViewMode, setIsViewMode] = useState(false)
	const [showStudentList, setShowStudentList] = useState(false)
	const [generatingPDF, setGeneratingPDF] = useState(false)

	// Combobox open state
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)

	// Search state for dropdowns
	const [institutionSearch, setInstitutionSearch] = useState("")
	const [sessionSearch, setSessionSearch] = useState("")
	const [programSearch, setProgramSearch] = useState("")
	const [courseSearch, setCourseSearch] = useState("")

	// Fetch institutions when context is ready
	const fetchInstitutions = useCallback(async () => {
		try {
			// Use appendToUrl to apply institution filter for non-super_admin users
			const url = appendToUrl('/api/exam-management/exam-attendance/dropdowns?type=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)
			}
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
	// When shouldFilter is true and contextInstitutionId exists, auto-fill the institution
	// Wait for institutions to be loaded first to ensure cascade works properly
	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId && institutions.length > 0) {
			// Verify the context institution exists in the loaded list
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
			// Reset dependent fields first
			setSelectedSessionId("")
			setSelectedProgramCode("")
			setSelectedExamDate("")
			setSelectedSessionType("")
			setSelectedCourseCode("")
			setSessions([])
			setPrograms([])
			setSessionTypes([])
			setCourses([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
			// Then fetch new data
			fetchSessions(selectedInstitutionId)
		} else {
			// Clear everything if institution is deselected
			setSelectedSessionId("")
			setSelectedProgramCode("")
			setSelectedExamDate("")
			setSelectedSessionType("")
			setSelectedCourseCode("")
			setSessions([])
			setPrograms([])
			setSessionTypes([])
			setCourses([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
		}
	}, [selectedInstitutionId])

	const fetchSessions = async (institutionId: string) => {
		try {
			setLoading(true)
			const data = await fetchSessionsService(institutionId)
			setSessions(data)
		} catch (error) {
			console.error('Error fetching sessions:', error)
		} finally {
			setLoading(false)
		}
	}

	// Cascade 2: Session → Programs
	useEffect(() => {
		if (selectedSessionId && selectedInstitutionId) {
			// Reset dependent fields first
			setSelectedProgramCode("")
			setSelectedExamDate("")
			setSelectedSessionType("")
			setSelectedCourseCode("")
			setPrograms([])
			setSessionTypes([])
			setCourses([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
			// Then fetch new data
			fetchPrograms(selectedInstitutionId, selectedSessionId)
		} else if (!selectedSessionId) {
			// Clear everything if session is deselected
			setSelectedProgramCode("")
			setSelectedExamDate("")
			setSelectedSessionType("")
			setSelectedCourseCode("")
			setPrograms([])
			setSessionTypes([])
			setCourses([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
		}
	}, [selectedSessionId])

	const fetchPrograms = async (institutionId: string, _sessionId: string) => {
		try {
			setLoading(true)
			// Get myjkkn_institution_ids from the selected institution
			const institution = institutions.find(inst => inst.id === institutionId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			if (myjkknIds.length === 0) {
				console.warn('No myjkkn_institution_ids found for institution:', institutionId)
				setPrograms([])
				return
			}

			// Fetch programs from MyJKKN API
			const programData = await fetchProgramsFromMyJKKN(myjkknIds)

			// Sort by program_order ASC, then by program_code
			const sortedPrograms = programData.sort((a, b) => {
				const orderA = a.program_order ?? 999
				const orderB = b.program_order ?? 999
				if (orderA !== orderB) return orderA - orderB
				return a.program_code.localeCompare(b.program_code)
			})

			// Map to match the Program type expected by the component
			const mappedPrograms: Program[] = sortedPrograms.map(p => ({
				id: p.id,
				program_code: p.program_code,
				program_name: p.program_name,
				program_order: p.program_order
			}))

			setPrograms(mappedPrograms)
		} catch (error) {
			console.error('Error fetching programs from MyJKKN:', error)
			setPrograms([])
		} finally {
			setLoading(false)
		}
	}

	// Cascade 3: Program → Set today's date automatically
	useEffect(() => {
		if (selectedInstitutionId && selectedSessionId && selectedProgramCode) {
			// Reset dependent fields first
			setSelectedSessionType("")
			setSelectedCourseCode("")
			setSessionTypes([])
			setCourses([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
			// Set today's date in IST
			const today = getISTDate()
			setSelectedExamDate(today)
		} else if (!selectedProgramCode) {
			// Clear everything if program is deselected
			setSelectedExamDate("")
			setSelectedSessionType("")
			setSelectedCourseCode("")
			setSessionTypes([])
			setCourses([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
		}
	}, [selectedProgramCode])

	// Cascade 4: Exam Date → Session Types (FN/AN)
	useEffect(() => {
		if (selectedInstitutionId && selectedSessionId && selectedProgramCode && selectedExamDate) {
			// Reset dependent fields first
			setSelectedSessionType("")
			setSelectedCourseCode("")
			setSessionTypes([])
			setCourses([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
			// Then fetch new data
			fetchSessionTypes(selectedInstitutionId, selectedSessionId, selectedProgramCode, selectedExamDate)
		} else if (!selectedExamDate) {
			// Clear everything if date is cleared
			setSelectedSessionType("")
			setSelectedCourseCode("")
			setSessionTypes([])
			setCourses([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
		}
	}, [selectedExamDate])

	const fetchSessionTypes = async (institutionId: string, sessionId: string, programCode: string, examDate: string) => {
		try {
			setLoading(true)
			const data = await fetchSessionTypesService(institutionId, sessionId, programCode, examDate)
			setSessionTypes(data)

			if (data.length === 0) {
				toast({
					title: "ℹ️ No Sessions Found",
					description: "No exam available for today.",
					className: "bg-blue-50 border-blue-200 text-blue-800",
				})
			}
		} catch (error) {
			console.error('Error fetching session types:', error)
			toast({
				title: "❌ Error",
				description: error instanceof Error ? error.message : 'Failed to fetch session types',
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}

	// Cascade 5: Session Type → Courses
	useEffect(() => {
		if (selectedInstitutionId && selectedSessionId && selectedProgramCode && selectedExamDate && selectedSessionType) {
			// Reset dependent fields first
			setSelectedCourseCode("")
			setCourses([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
			// Then fetch new data
			fetchCourses(selectedInstitutionId, selectedSessionId, selectedProgramCode, selectedExamDate, selectedSessionType)
		} else if (!selectedSessionType) {
			// Clear everything if session type is deselected
			setSelectedCourseCode("")
			setCourses([])
			setStudents([])
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
		}
	}, [selectedSessionType])

	const fetchCourses = async (institutionId: string, sessionId: string, programCode: string, examDate: string, sessionType: string) => {
		try {
			setLoading(true)
			const data = await fetchCoursesService(institutionId, sessionId, programCode, examDate, sessionType)
			setCourses(data)

			if (data.length === 0) {
				toast({
					title: "ℹ️ No Courses Found",
					description: "No courses available for this session.",
					className: "bg-blue-50 border-blue-200 text-blue-800",
				})
			}
		} catch (error) {
			console.error('Error fetching courses:', error)
			toast({
				title: "❌ Error",
				description: error instanceof Error ? error.message : 'Failed to fetch courses',
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}

	// Cascade 6: Course → Auto-load Students
	useEffect(() => {
		if (selectedInstitutionId && selectedSessionId && selectedProgramCode && selectedExamDate && selectedSessionType && selectedCourseCode) {
			// Reset state before loading
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
			// Load students
			handleLoadStudents()
		} else if (!selectedCourseCode) {
			// Clear student list if course is deselected
			setAttendanceRecords([])
			setShowStudentList(false)
			setIsViewMode(false)
		}
	}, [selectedCourseCode])

	// Load student list after all parent selections are complete
	const handleLoadStudents = async () => {
		if (!selectedInstitutionId || !selectedSessionId || !selectedProgramCode || !selectedExamDate || !selectedSessionType || !selectedCourseCode) {
			return // Silently return if not all fields selected
		}

		try {
			setLoadingStudents(true)

			// First, check if attendance already exists
			const checkData = await checkAttendance(
				selectedInstitutionId,
				selectedSessionId,
				selectedCourseCode,
				selectedExamDate,
				selectedSessionType,
				selectedProgramCode
			)

			if (checkData.exists && checkData.data.length > 0) {
				// Attendance already exists - load in view mode
				setIsViewMode(true)

				// Map existing attendance records to display format
				const existingRecords: AttendanceRecord[] = checkData.data.map((att: any) => ({
					exam_registration_id: att.exam_registration_id,
					student_id: att.student_id,
					stu_register_no: att.stu_register_no,
					student_name: att.student_name,
					attempt_number: att.attempt_number,
					is_regular: att.is_regular,
					is_present: att.attendance_status === 'Present',
					is_absent: att.attendance_status === 'Absent',
					attendance_status: att.attendance_status,
					remarks: att.remarks || ''
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
					title: "ℹ️ Attendance Already Recorded",
					description: "Attendance has already been recorded for this exam. Viewing in read-only mode.",
					className: "bg-blue-50 border-blue-200 text-blue-800",
				})

				return
			}

			// Load fresh student list for new attendance
			setIsViewMode(false)
			const studentData = await loadStudents(
				selectedInstitutionId,
				selectedSessionId,
				selectedCourseCode,
				selectedExamDate,
				selectedSessionType,
				selectedProgramCode
			)

			if (studentData.length === 0) {
				toast({
					title: "ℹ️ No Students Found",
					description: "No registered students found for this exam.",
					className: "bg-yellow-50 border-yellow-200 text-yellow-800",
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

			// Initialize attendance records
			const initialRecords: AttendanceRecord[] = sortedStudentData.map((student: StudentRegistration) => ({
				exam_registration_id: student.id,
				student_id: student.student_id,
				stu_register_no: student.stu_register_no,
				student_name: student.student_name,
				attempt_number: student.attempt_number,
				is_regular: student.is_regular,
				is_present: false,
				is_absent: true,
				attendance_status: 'Absent',
				remarks: ''
			}))

			setAttendanceRecords(initialRecords)
			setShowStudentList(true)

			toast({
				title: "✅ Students Loaded",
				description: `${studentData.length} student${studentData.length > 1 ? 's' : ''} loaded. Mark attendance below.`,
				className: "bg-green-50 border-green-200 text-green-800",
			})
		} catch (error) {
			console.error('Error loading students:', error)
			toast({
				title: "❌ Error",
				description: "Failed to load student list. Please try again.",
				variant: "destructive",
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
		updated[index].is_absent = !updated[index].is_present // Set is_absent as opposite of is_present
		updated[index].attendance_status = updated[index].is_present ? 'Present' : 'Absent'
		setAttendanceRecords(updated)
	}

	// Select all as present
	const handleSelectAllPresent = () => {
		if (isViewMode) return

		const updated = attendanceRecords.map(record => ({
			...record,
			is_present: true,
			is_absent: false,
			attendance_status: 'Present'
		}))
		setAttendanceRecords(updated)

		toast({
			title: "✅ All Marked Present",
			description: "All students have been marked as present.",
			className: "bg-green-50 border-green-200 text-green-800",
		})
	}

	// Update remarks
	const handleRemarksChange = (index: number, remarks: string) => {
		if (isViewMode) return

		const updated = [...attendanceRecords]
		updated[index].remarks = remarks
		setAttendanceRecords(updated)
	}

	// State for confirmation dialog
	const [showConfirmDialog, setShowConfirmDialog] = useState(false)

	// Save attendance
	const handleSaveAttendance = async () => {
		if (isViewMode) {
			toast({
				title: "⚠️ Read-Only Mode",
				description: "Attendance has already been recorded and cannot be modified.",
				variant: "destructive",
			})
			return
		}

		// Show confirmation dialog instead of saving directly
		setShowConfirmDialog(true)
	}

	// Actual save function after confirmation
	const confirmSaveAttendance = async () => {
		setShowConfirmDialog(false)

		try {
			setSaving(true)

			console.log('Starting save attendance with data:', {
				institutions_id: selectedInstitutionId,
				exam_session_code: selectedSessionId,
				course_code: selectedCourseCode,
				exam_date: selectedExamDate,
				session_code: selectedSessionType,
				program_code: selectedProgramCode,
				attendance_count: attendanceRecords.length,
			})

			await saveAttendanceService({
				institutions_id: selectedInstitutionId,
				exam_session_code: selectedSessionId,
				course_code: selectedCourseCode,
				exam_date: selectedExamDate,
				session_code: selectedSessionType,
				program_code: selectedProgramCode,
				attendance_records: attendanceRecords,
			})

			toast({
				title: "✅ Attendance Recorded",
				description: "Attendance successfully saved.",
				className: "bg-green-50 border-green-200 text-green-800",
				duration: 5000,
			})

			setIsViewMode(true)
		} catch (error) {
			console.error('Error saving attendance:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to save attendance'

			toast({
				title: "❌ Save Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
				duration: 8000,
			})
		} finally {
			setSaving(false)
		}
	}

	
	// Get display values for header
	const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
	const selectedSession = sessions.find(s => s.id === selectedSessionId)
	const selectedCourse = courses.find(c => c.course_code === selectedCourseCode)

	// Count present/absent
	const presentCount = attendanceRecords.filter(r => r.is_present).length
	const absentCount = attendanceRecords.filter(r => !r.is_present).length

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
										<Link href="/dashboard">Dashboard</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Exam Attendance</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
						
					</div>

					<div className="space-y-3">
					{/* Compact Form - Cascading Dropdowns */}
					<Card className="shadow-sm">
						<CardContent className="p-3">
							<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
								{/* 1. Institution - Only show when mustSelectInstitution is true (super_admin with "All Institutions") */}
								{/* For normal users, institution is auto-filled and completely hidden */}
								{mustSelectInstitution && (
									<div className="space-y-1">
										<Label htmlFor="institution" className="text-xs font-medium">
											Institution <span className="text-red-500">*</span>
										</Label>
										<Popover open={institutionOpen} onOpenChange={(open) => {
											setInstitutionOpen(open)
											if (!open) setInstitutionSearch("")
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
																: "Select institution"
															: "Select institution"}
													</span>
													<ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[500px] max-w-[90vw] p-0" align="start">
												<Command shouldFilter={false}>
													<CommandInput
														placeholder="Search institution..."
														className="h-9 text-xs"
														value={institutionSearch}
														onValueChange={setInstitutionSearch}
													/>
													<CommandList className="max-h-[300px]">
														<CommandEmpty className="py-6 text-center text-xs text-muted-foreground">No institution found.</CommandEmpty>
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
																		"flex items-start gap-3 py-3 px-3 cursor-pointer rounded-md mb-2 mx-1 transition-all duration-200",
																		selectedInstitutionId === inst.id
																			? "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-2 border-amber-400 dark:border-amber-600 shadow-md"
																			: "hover:bg-gradient-to-r hover:from-amber-50/30 hover:to-yellow-50/30 dark:hover:from-amber-900/10 dark:hover:to-yellow-900/10 border-2 border-transparent hover:border-amber-200 dark:hover:border-amber-700"
																	)}
																>
																	<Check
																		className={cn(
																			"mt-1 h-4 w-4 shrink-0",
																			selectedInstitutionId === inst.id
																				? "opacity-100 text-amber-600 dark:text-amber-400"
																				: "opacity-0"
																		)}
																	/>
																	<div className="flex-1 min-w-0 space-y-1">
																		<div className={cn(
																			"text-sm font-semibold",
																			selectedInstitutionId === inst.id
																				? "text-amber-900 dark:text-amber-100"
																				: "text-foreground"
																		)}>
																			{inst.institution_code}
																		</div>
																		<div className={cn(
																			"text-xs break-words whitespace-normal leading-relaxed",
																			selectedInstitutionId === inst.id
																				? "text-amber-700 dark:text-amber-300"
																				: "text-muted-foreground"
																		)}>
																			{inst.institution_name}
																		</div>
																	</div>
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								)}

								{/* 2. Examination Session */}
								<div className="space-y-1">
									<Label htmlFor="session" className="text-xs font-medium">
										Examination Session <span className="text-red-500">*</span>
									</Label>
									<Popover open={sessionOpen} onOpenChange={(open) => {
										setSessionOpen(open)
										if (!open) setSessionSearch("")
									}}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={sessionOpen}
												className="h-auto min-h-[28px] text-xs justify-start w-full font-normal px-2 py-1.5"
												disabled={!selectedInstitutionId || loading || sessions.length === 0}
											>
												<span className="flex-1 text-left whitespace-normal break-words leading-tight">
													{selectedSessionId
														? sessions.find((s) => s.id === selectedSessionId)
															? `${sessions.find((s) => s.id === selectedSessionId)?.session_name} (${sessions.find((s) => s.id === selectedSessionId)?.session_type})`
															: "Select session"
														: "Select session"}
												</span>
												<ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[500px] max-w-[90vw] p-0" align="start">
											<Command shouldFilter={false}>
												<CommandInput
													placeholder="Search session..."
													className="h-9 text-xs"
													value={sessionSearch}
													onValueChange={setSessionSearch}
												/>
												<CommandList className="max-h-[300px]">
													<CommandEmpty className="py-6 text-center text-xs text-muted-foreground">No session found.</CommandEmpty>
													<CommandGroup>
														{sessions
															.filter((session) => {
																if (!sessionSearch) return true
																const search = sessionSearch.toLowerCase()
																return (
																	session.session_name.toLowerCase().includes(search) ||
																	session.session_type.toLowerCase().includes(search)
																)
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
																	"flex items-start gap-3 py-3 px-3 cursor-pointer rounded-md mb-2 mx-1 transition-all duration-200",
																	selectedSessionId === session.id
																		? "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-2 border-amber-400 dark:border-amber-600 shadow-md"
																		: "hover:bg-gradient-to-r hover:from-amber-50/30 hover:to-yellow-50/30 dark:hover:from-amber-900/10 dark:hover:to-yellow-900/10 border-2 border-transparent hover:border-amber-200 dark:hover:border-amber-700"
																)}
															>
																<Check
																	className={cn(
																		"mt-1 h-4 w-4 shrink-0",
																		selectedSessionId === session.id ? "opacity-100 text-amber-600 dark:text-amber-400" : "opacity-0"
																	)}
																/>
																<div className="flex-1 min-w-0 space-y-1">
																	<div className={cn(
																		"text-sm font-semibold break-words whitespace-normal leading-relaxed",
																		selectedSessionId === session.id
																			? "text-amber-900 dark:text-amber-100"
																			: "text-foreground"
																	)}>
																		{session.session_name}
																	</div>
																	<div className="text-xs text-muted-foreground">
																		<Badge variant="outline" className="text-xs font-normal">
																			{session.session_type}
																		</Badge>
																	</div>
																</div>
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* 3. Program Code */}
								<div className="space-y-1">
									<Label htmlFor="program" className="text-xs font-medium">
										Program Code <span className="text-red-500">*</span>
									</Label>
									<Popover open={programOpen} onOpenChange={(open) => {
										setProgramOpen(open)
										if (!open) setProgramSearch("")
									}}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={programOpen}
												className="h-auto min-h-[28px] text-xs justify-start w-full font-normal px-2 py-1.5"
												disabled={!selectedSessionId || loading || programs.length === 0}
											>
												<span className="flex-1 text-left whitespace-normal break-words leading-tight">
													{selectedProgramCode
														? programs.find((p) => p.program_code === selectedProgramCode)
															? `${programs.find((p) => p.program_code === selectedProgramCode)?.program_code} - ${programs.find((p) => p.program_code === selectedProgramCode)?.program_name}`
															: "Select program"
														: "Select program"}
												</span>
												<ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[500px] max-w-[90vw] p-0" align="start">
											<Command shouldFilter={false}>
												<CommandInput
													placeholder="Search program..."
													className="h-9 text-xs"
													value={programSearch}
													onValueChange={setProgramSearch}
												/>
												<CommandList className="max-h-[300px]">
													<CommandEmpty className="py-6 text-center text-xs text-muted-foreground">No program found.</CommandEmpty>
													<CommandGroup>
														{programs
															.filter((program) => {
																if (!programSearch) return true
																const search = programSearch.toLowerCase()
																return (
																	program.program_code.toLowerCase().includes(search) ||
																	program.program_name.toLowerCase().includes(search)
																)
															})
															.map((program) => (
															<CommandItem
																key={program.id}
																value={program.program_code}
																onSelect={() => {
																	setSelectedProgramCode(program.program_code)
																	setProgramOpen(false)
																}}
																className={cn(
																	"flex items-start gap-3 py-3 px-3 cursor-pointer rounded-md mb-2 mx-1 transition-all duration-200",
																	selectedProgramCode === program.program_code
																		? "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-2 border-amber-400 dark:border-amber-600 shadow-md"
																		: "hover:bg-gradient-to-r hover:from-amber-50/30 hover:to-yellow-50/30 dark:hover:from-amber-900/10 dark:hover:to-yellow-900/10 border-2 border-transparent hover:border-amber-200 dark:hover:border-amber-700"
																)}
															>
																<Check
																	className={cn(
																		"mt-1 h-4 w-4 shrink-0",
																		selectedProgramCode === program.program_code ? "opacity-100 text-amber-600 dark:text-amber-400" : "opacity-0"
																	)}
																/>
																<div className="flex-1 min-w-0 space-y-1">
																	<div className={cn(
																		"text-sm font-semibold",
																		selectedProgramCode === program.program_code
																			? "text-amber-900 dark:text-amber-100"
																			: "text-foreground"
																	)}>
																		{program.program_code}
																	</div>
																	<div className={cn(
																		"text-xs break-words whitespace-normal leading-relaxed",
																		selectedProgramCode === program.program_code
																			? "text-amber-700 dark:text-amber-300"
																			: "text-muted-foreground"
																	)}>
																		{program.program_name}
																	</div>
																</div>
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* 4. Exam Date */}
								{selectedProgramCode && (
									<div className="space-y-1">
										<Label htmlFor="exam_date" className="text-xs font-medium">
											Exam Date <span className="text-red-500">*</span>
										</Label>
										<Input
											id="exam_date"
											type="text"
											value={selectedExamDate ? new Date(selectedExamDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').join('-') : ''}
											disabled
											className="h-7 text-xs bg-muted"
										/>
									</div>
								)}

								{/* 5. Session Type (FN/AN) - Only visible after program selection */}
								{selectedProgramCode && (
									<div className="space-y-1">
										<Label htmlFor="session_type" className="text-xs font-medium">
											Session (FN/AN) <span className="text-red-500">*</span>
										</Label>
										<Select
											value={selectedSessionType}
											onValueChange={setSelectedSessionType}
											disabled={loading}
										>
											<SelectTrigger id="session_type" className="h-7 text-xs">
												<SelectValue placeholder="Select session" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="FN">FN</SelectItem>
												<SelectItem value="AN">AN</SelectItem>
											</SelectContent>
										</Select>
									</div>
								)}

								{/* 6. Course Code - Only visible after session type selection */}
								{selectedSessionType && (
									<div className="space-y-1">
										<Label htmlFor="course" className="text-xs font-medium">
											Course Code <span className="text-red-500">*</span>
										</Label>
										<Popover open={courseOpen} onOpenChange={(open) => {
											setCourseOpen(open)
											if (!open) setCourseSearch("")
										}}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={courseOpen}
													className="h-auto min-h-[28px] text-xs justify-start w-full font-normal px-2 py-1.5"
													disabled={loading || courses.length === 0}
												>
													<span className="flex-1 text-left whitespace-normal break-words leading-tight">
														{selectedCourseCode
															? courses.find((c) => c.course_code === selectedCourseCode)
																? `${courses.find((c) => c.course_code === selectedCourseCode)?.course_code} - ${courses.find((c) => c.course_code === selectedCourseCode)?.course_title}`
																: "Select course"
															: loading
																? "Loading courses..."
																: courses.length === 0
																	? "No courses available"
																	: "Select course"}
													</span>
													<ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[500px] max-w-[90vw] p-0" align="start">
												<Command shouldFilter={false}>
													<CommandInput
														placeholder="Search course..."
														className="h-9 text-xs"
														value={courseSearch}
														onValueChange={setCourseSearch}
													/>
													<CommandList className="max-h-[300px]">
														<CommandEmpty className="py-6 text-center text-xs text-muted-foreground">No course found.</CommandEmpty>
														<CommandGroup>
															{courses
																.filter((course) => {
																	if (!courseSearch) return true
																	const search = courseSearch.toLowerCase()
																	return (
																		course.course_code.toLowerCase().includes(search) ||
																		course.course_title.toLowerCase().includes(search)
																	)
																})
																.map((course) => (
																<CommandItem
																	key={course.course_code}
																	value={course.course_code}
																	onSelect={() => {
																		setSelectedCourseCode(course.course_code)
																		setCourseOpen(false)
																	}}
																	className={cn(
																		"flex items-start gap-3 py-3 px-3 cursor-pointer rounded-md mb-2 mx-1 transition-all duration-200",
																		selectedCourseCode === course.course_code
																			? "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-2 border-amber-400 dark:border-amber-600 shadow-md"
																			: "hover:bg-gradient-to-r hover:from-amber-50/30 hover:to-yellow-50/30 dark:hover:from-amber-900/10 dark:hover:to-yellow-900/10 border-2 border-transparent hover:border-amber-200 dark:hover:border-amber-700"
																	)}
																>
																	<Check
																		className={cn(
																			"mt-1 h-4 w-4 shrink-0",
																			selectedCourseCode === course.course_code ? "opacity-100 text-amber-600 dark:text-amber-400" : "opacity-0"
																		)}
																	/>
																	<div className="flex-1 min-w-0 space-y-1">
																		<div className={cn(
																			"text-sm font-semibold",
																			selectedCourseCode === course.course_code
																				? "text-amber-900 dark:text-amber-100"
																				: "text-foreground"
																		)}>
																			{course.course_code}
																		</div>
																		<div className={cn(
																			"text-xs break-words whitespace-normal leading-relaxed",
																			selectedCourseCode === course.course_code
																				? "text-amber-700 dark:text-amber-300"
																				: "text-muted-foreground"
																		)}>
																			{course.course_title}
																		</div>
																	</div>
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								)}

								{/* Loading indicator - shown when auto-loading students */}
								{loadingStudents && selectedCourseCode && (
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

					{/* Summary Header (visible when students are loaded) */}
					{showStudentList && (
						<Card className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 border-indigo-200 dark:border-indigo-800 shadow-sm">
							<CardContent className="p-2">
								<div className={`grid grid-cols-2 sm:grid-cols-3 ${mustSelectInstitution ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-2`}>
									{/* Institution - Only show when mustSelectInstitution is true (super_admin viewing All Institutions) */}
									{mustSelectInstitution && (
										<div>
											<p className="text-xs font-medium text-muted-foreground">Institution</p>
											<p className="text-xs font-semibold">{selectedInstitution?.institution_code}</p>
										</div>
									)}
									<div>
										<p className="text-xs font-medium text-muted-foreground">Session</p>
										<p className="text-xs font-semibold">{selectedSession?.session_name}</p>
									</div>
									<div>
										<p className="text-xs font-medium text-muted-foreground">Course</p>
										<p className="text-xs font-semibold">{selectedCourse?.course_code}</p>
									</div>
									<div>
										<p className="text-xs font-medium text-muted-foreground">Exam Date</p>
										<p className="text-xs font-semibold">
											{selectedExamDate ? new Date(selectedExamDate).toLocaleDateString('en-IN', {
												day: '2-digit',
												month: 'short',
												year: 'numeric'
											}) : '-'}
										</p>
									</div>
									<div>
										<p className="text-xs font-medium text-muted-foreground">Session</p>
										<p className="text-xs font-semibold">{selectedSessionType || '-'}</p>
									</div>
									<div>
										<p className="text-xs font-medium text-muted-foreground">Total Learners</p>
										<p className="text-xs font-semibold">{attendanceRecords.length}</p>
									</div>
								</div>

								{isViewMode && (
									<div className="mt-2 p-1.5 bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
										<div className="flex items-center gap-1.5">
											<AlertTriangle className="h-3 w-3 text-red-600 dark:text-blue-400" />
											<span className="text-xs font-medium text-red-800 dark:text-red-200">
												Attendance has already been recorded for this exam
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
											<h2 className="text-sm font-bold"><a className="text-x font-bold text-blue-600">Mark Attendance</a>  | Total Learners: {attendanceRecords.length} | Present : <a className="text-x font-bold text-green-600">{presentCount}</a> | Absent: <a className="text-x font-bold text-red-600">{absentCount}</a> </h2>
											<p className="text-xs text-muted-foreground">
												{isViewMode ? 'Viewing recorded attendance' : 'Check the box to mark learner as present'}
											</p>
										</div>
									</div>
									{!isViewMode && (
										<Button onClick={handleSelectAllPresent} variant="outline" size="sm" className="h-7 px-2 text-xs">
											<CheckCircle className="h-3 w-3 mr-1" />
											Mark All Present
										</Button>
									)}
								</div>
							</CardHeader>
							<CardContent className="pt-4 p-3">
								<div className="border rounded-lg overflow-hidden">
									<div className="max-h-[440px] overflow-y-auto">
										<Table>
											<TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900/50 z-10">
												<TableRow>
													<TableHead className="w-12 text-xs">S.No</TableHead>
													<TableHead className="text-xs">Register Number</TableHead>
													<TableHead className="text-xs">Learner Name</TableHead>
													<TableHead className="w-24 text-xs text-center">Present/Absent</TableHead>
													<TableHead className="w-24 text-xs text-center">Attendance</TableHead>
													<TableHead className="text-xs">Remarks</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{attendanceRecords.map((record, index) => (
													<TableRow key={record.exam_registration_id}>
														<TableCell className="text-sm font-medium">{index + 1}</TableCell>
														<TableCell className="text-sm font-mono">{record.stu_register_no}</TableCell>
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
																		? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200"
																		: "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200"
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

								{!isViewMode && (
									<div className="flex justify-end gap-2 mt-4 pt-4 border-t">
										<Button onClick={handleSaveAttendance} disabled={saving} size="sm" className="h-8 px-3 text-xs">
											{saving ? (
												<>
													<Loader2 className="h-3 w-3 mr-1 animate-spin" />
													Saving...
												</>
											) : (
												<>
													<CheckCircle className="h-3 w-3 mr-1" />
													Save
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
							Confirm Attendance Submission
						</AlertDialogTitle>
						<AlertDialogDescription>
							Please review the attendance summary before submitting:
						</AlertDialogDescription>
					</AlertDialogHeader>

					<div className="space-y-3 py-4">
						{/* Total Learners */}
						<div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
							<div className="flex items-center gap-2">
								<Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
								<span className="text-sm font-medium text-blue-900 dark:text-blue-100">Total Learners</span>
							</div>
							<span className="text-lg font-bold text-blue-700 dark:text-blue-300">{attendanceRecords.length}</span>
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

						{/* Warning */}
						<div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mt-4">
							<AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
							<p className="text-xs text-yellow-800 dark:text-yellow-200">
								Once submitted, attendance records cannot be modified. Please ensure all information is correct.
							</p>
						</div>
					</div>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmSaveAttendance}
							className="bg-green-600 hover:bg-green-700"
						>
							Confirm & Submit
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
