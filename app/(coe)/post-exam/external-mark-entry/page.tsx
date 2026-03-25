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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/hooks/common/use-toast'
import { FileText, Save, Check, ChevronsUpDown, AlertTriangle } from 'lucide-react'
import { numberToWords } from '@/services/post-exam/external-mark-entry-service'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'

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
}

interface Packet {
	id: string
	packet_no: string
	total_sheets: number
	institutions_id: string
	examination_session_id: string
	course_id: string
}

interface Student {
	student_dummy_id: string
	dummy_number: string
	exam_registration_id: string
	program_id: string | null
	total_marks_obtained: number | null
	total_marks_in_words: string
	remarks: string
}

interface CourseDetails {
	subject_code: string
	subject_name: string
	maximum_marks: number
	minimum_pass_marks: number
	packet_no: string
	total_sheets: number
	semester_number: string
	semester_year: string
}

export default function ExternalMarkEntryPage() {
	const { toast } = useToast()

	// Institution filter hook - provides role-based filtering
	const {
		isReady,
		appendToUrl,
		getInstitutionIdForCreate,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [courses, setCourses] = useState<Course[]>([])
	const [packets, setPackets] = useState<Packet[]>([])

	// Selected values (using IDs instead of codes)
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('')
	const [selectedSessionId, setSelectedSessionId] = useState<string>('')
	const [selectedCourseId, setSelectedCourseId] = useState<string>('')
	const [selectedPacketId, setSelectedPacketId] = useState<string>('')
	const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null)

	// Combobox open states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)
	const [packetOpen, setPacketOpen] = useState(false)

	// Mark entry states
	const [students, setStudents] = useState<Student[]>([])
	const [courseDetails, setCourseDetails] = useState<CourseDetails | null>(null)

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [loadingPackets, setLoadingPackets] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [saving, setSaving] = useState(false)

	// View mode state (after saving marks)
	const [isViewMode, setIsViewMode] = useState(false)

	// Get the effective institution ID (from selection or context)
	const effectiveInstitutionId = selectedInstitutionId || contextInstitutionId

	// Auto-fill institution when not in "All Institutions" mode
	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId])

	// Load institutions on mount (only when ready and mustSelectInstitution)
	useEffect(() => {
		if (isReady && mustSelectInstitution) {
			loadInstitutions()
		}
	}, [isReady, mustSelectInstitution])

	// Load sessions when effective institution changes
	useEffect(() => {
		if (isReady && effectiveInstitutionId) {
			loadSessions(effectiveInstitutionId)
			resetDependentFields(['session', 'course', 'packet'])
		}
	}, [isReady, effectiveInstitutionId])

	// Load courses when session changes
	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId) {
			loadCourses(effectiveInstitutionId, selectedSessionId)
			resetDependentFields(['course', 'packet'])
		}
	}, [isReady, selectedSessionId])

	// Load packets when course changes
	useEffect(() => {
		if (isReady && selectedCourseId && effectiveInstitutionId) {
			loadPackets(effectiveInstitutionId, selectedSessionId, selectedCourseId)
			resetDependentFields(['packet'])
		}
	}, [isReady, selectedCourseId])

	const resetDependentFields = (fields: string[]) => {
		if (fields.includes('session')) {
			setSelectedSessionId('')
			setSessions([])
		}
		if (fields.includes('course')) {
			setSelectedCourseId('')
			setCourses([])
		}
		if (fields.includes('packet')) {
			setSelectedPacketId('')
			setSelectedPacket(null)
			setPackets([])
		}
		setStudents([])
		setCourseDetails(null)
		setIsViewMode(false)
	}

	const loadInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/post-exam/external-marks?action=institutions')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load institutions')
			const data = await response.json()
			setInstitutions(data)
		} catch (error) {
			toast({
				title: "❌ Error",
				description: "Failed to load institutions",
				variant: "destructive",
			})
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, toast])

	const loadSessions = useCallback(async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			const url = appendToUrl(
				`/api/post-exam/external-marks?action=sessions&institutionId=${institutionId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load sessions')
			const data = await response.json()
			setSessions(data)
		} catch (error) {
			toast({
				title: "❌ Error",
				description: "Failed to load examination sessions",
				variant: "destructive",
			})
		} finally {
			setLoadingSessions(false)
		}
	}, [appendToUrl, toast])

	const loadCourses = useCallback(async (institutionId: string, sessionId: string) => {
		try {
			setLoadingCourses(true)
			const url = appendToUrl(
				`/api/post-exam/external-marks?action=courses&` +
				`institutionId=${institutionId}&` +
				`sessionId=${sessionId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load courses')
			const data = await response.json()
			setCourses(data)
		} catch (error) {
			toast({
				title: "❌ Error",
				description: "Failed to load courses",
				variant: "destructive",
			})
		} finally {
			setLoadingCourses(false)
		}
	}, [appendToUrl, toast])

	const loadPackets = useCallback(async (institutionId: string, sessionId: string, courseId: string) => {
		try {
			setLoadingPackets(true)
			const url = appendToUrl(
				`/api/post-exam/external-marks?action=packets&` +
				`institutionId=${institutionId}&` +
				`sessionId=${sessionId}&` +
				`courseId=${courseId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load packets')
			const data = await response.json()
			setPackets(data)
		} catch (error) {
			toast({
				title: "❌ Error",
				description: "Failed to load packet numbers",
				variant: "destructive",
			})
		} finally {
			setLoadingPackets(false)
		}
	}, [appendToUrl, toast])

	const loadStudents = async () => {
		if (!selectedPacketId) {
			toast({
				title: "⚠️ Selection Required",
				description: "Please select all fields including packet number",
				variant: "destructive",
			})
			return
		}

		const packet = packets.find(p => p.id === selectedPacketId)
		if (!packet) return

		try {
			setLoadingStudents(true)
			setSelectedPacket(packet)
			setIsViewMode(false) // Reset view mode when loading new students

			const response = await fetch(
				`/api/post-exam/external-marks?action=students&packetId=${packet.id}`
			)

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to load students')
			}

			const data = await response.json()
			setStudents(data.students)
			setCourseDetails(data.course_details)

			toast({
				title: "✅ Learners Loaded",
				description: `Loaded ${data.students.length} learners for packet ${data.course_details.packet_no}`,
				className: "bg-green-50 border-green-200 text-green-800",
			})
		} catch (error) {
			toast({
				title: "❌ Error",
				description: error instanceof Error ? error.message : 'Failed to load learners',
				variant: "destructive",
			})
		} finally {
			setLoadingStudents(false)
		}
	}

	const handleMarksChange = (index: number, value: string) => {
		if (isViewMode) return // Prevent changes in view mode

		if (!value || !courseDetails) {
			const updated = [...students]
			updated[index].total_marks_obtained = null
			updated[index].total_marks_in_words = ''
			updated[index].remarks = ''
			setStudents(updated)
			return
		}

		const numValue = parseInt(value)
		if (isNaN(numValue)) return

		if (numValue > courseDetails.maximum_marks) {
			toast({
				title: "⚠️ Invalid Marks",
				description: `Marks cannot exceed ${courseDetails.maximum_marks}`,
				variant: "destructive",
			})
			return
		}

		const updated = [...students]
		updated[index].total_marks_obtained = numValue
		updated[index].total_marks_in_words = numberToWords(numValue)
		updated[index].remarks = numValue >= courseDetails.minimum_pass_marks ? 'PASS' : 'FAIL'
		setStudents(updated)
	}

	const handleSaveMarks = async () => {
		if (isViewMode) {
			toast({
				title: "⚠️ Read-Only Mode",
				description: "Marks have already been saved and cannot be modified.",
				variant: "destructive",
			})
			return
		}

		const missingMarks = students.filter(s => s.total_marks_obtained === null)
		if (missingMarks.length > 0) {
			toast({
				title: "⚠️ Validation Error",
				description: `Please enter marks for all ${students.length} learners`,
				variant: "destructive",
			})
			return
		}

		if (!selectedPacket || !courseDetails) return

		try {
			setSaving(true)

			// Save marks for each student
			const savePromises = students.map(student =>
				fetch('/api/post-exam/external-marks', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						institutions_id: selectedPacket.institutions_id,
						examination_session_id: selectedPacket.examination_session_id,
						exam_registration_id: student.exam_registration_id,
						student_dummy_number_id: student.student_dummy_id,
						program_id: student.program_id,
						course_id: selectedPacket.course_id,
						dummy_number: student.dummy_number,
						total_marks_obtained: student.total_marks_obtained,
						total_marks_in_words: student.total_marks_in_words,
						marks_out_of: courseDetails.maximum_marks,
						evaluation_date: new Date().toISOString().split('T')[0],
						evaluator_remarks: student.remarks,
						source: 'Manual Entry',
					})
				})
			)

			await Promise.all(savePromises)

			toast({
				title: "✅ Marks Saved",
				description: `Successfully saved marks for ${students.length} learners`,
				className: "bg-green-50 border-green-200 text-green-800",
				duration: 5000,
			})

			// Switch to view mode
			setIsViewMode(true)

			// Auto-download PDF after successful save
			await generatePDF()
		} catch (error) {
			toast({
				title: "❌ Save Failed",
				description: error instanceof Error ? error.message : 'Failed to save marks',
				variant: "destructive",
			})
		} finally {
			setSaving(false)
		}
	}

	const getTotalMarks = () => students.reduce((sum, s) => sum + (s.total_marks_obtained || 0), 0)

	const generatePDF = async () => {
		if (!courseDetails || students.length === 0) return

		try {
			// Dynamic import for client-side only
			const { generateExternalMarksPDF } = await import('@/lib/utils/generate-external-marks-pdf')

			// Get current date for exam_month_year format
			const now = new Date()
			const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
			const examMonthYear = `${monthNames[now.getMonth()]}, ${now.getFullYear()}`

			// Get selected session for semester info
			const selectedSession = sessions.find(s => s.id === selectedSessionId)

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

			// Load both logos
			const [leftLogo, rightLogo] = await Promise.all([
				loadImageAsBase64('/jkkncas_logo.png'),
				loadImageAsBase64('/jkkn_logo.png')
			])

			// Prepare PDF data
			const pdfData = {
				subject_code: courseDetails.subject_code,
				subject_name: courseDetails.subject_name,
				packet_no: courseDetails.packet_no,
				bundle_no: courseDetails.packet_no, // Using packet_no as bundle_no for now
				total_sheets: courseDetails.total_sheets,
				maximum_marks: courseDetails.maximum_marks,
				minimum_pass_marks: courseDetails.minimum_pass_marks,
				exam_date: new Date().toLocaleDateString('en-GB'),
				exam_month_year: examMonthYear,
				program_code: '', // Left blank as requested
				program_name: '',
				semester: courseDetails.semester_number || 'I', // From semester table
				year: courseDetails.semester_year || '1', // Year group from semester table (1, 2, 3)
				students: students.map(s => ({
					dummy_number: s.dummy_number,
					total_marks_obtained: s.total_marks_obtained,
					total_marks_in_words: s.total_marks_in_words,
					remarks: s.remarks
				})),
				logoImage: leftLogo,
				rightLogoImage: rightLogo
			}

			// Generate PDF
			const fileName = generateExternalMarksPDF(pdfData)

			toast({
				title: "✅ PDF Downloaded",
				description: `Marks sheet saved as ${fileName}`,
				className: "bg-green-50 border-green-200 text-green-800",
			})
		} catch (error) {
			console.error('PDF generation error:', error)
			toast({
				title: "❌ PDF Generation Failed",
				description: error instanceof Error ? error.message : 'Failed to generate PDF',
				variant: "destructive",
			})
		}
	}

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
								<BreadcrumbPage>External Mark Entry</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex-1 p-4 space-y-4 overflow-auto">
					{/* Page Header */}
					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
							<FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
						</div>
						<div>
							<h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-grotesk">
								External Mark Entry
							</h1>

						</div>
					</div>

					{/* Loading state when institution context is not ready */}
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

					{/* Cascading Dropdowns - only show when ready */}
					{isReady && (
					<Card className="shadow-sm">
						<CardContent className="p-2">

							<div className={cn(
								"grid grid-cols-1 gap-3",
								mustSelectInstitution
									? "md:grid-cols-2 lg:grid-cols-4"
									: "md:grid-cols-3"
							)}>
								{/* Institution Combobox - Only show when mustSelectInstitution is true */}
								{mustSelectInstitution && (
									<div className="space-y-1.5">
										<Label htmlFor="institution" className="text-xs font-medium">Institution <span className="text-red-500">*</span></Label>
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
																<Check
																	className={cn(
																		"mr-2 h-3.5 w-3.5 shrink-0",
																		selectedInstitutionId === inst.id ? "opacity-100" : "opacity-0"
																	)}
																/>
																<span className="flex-1 line-clamp-2">{inst.institution_code} - {inst.name}</span>
															</CommandItem>
														))}
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								)}

								{/* Session Combobox */}
								<div className="space-y-1.5">
									<Label htmlFor="session" className="text-xs font-medium">Exam Session <span className="text-red-500">*</span></Label>
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
														? sessions.find((s) => s.id === selectedSessionId)?.session_name
														: loadingSessions ? "Loading..." : "Select session..."}
												</span>
												<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[300px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search session..." className="h-8 text-xs" />
												<CommandEmpty className="text-xs py-4">No session found.</CommandEmpty>
												<CommandGroup className="max-h-56 overflow-auto">
													{sessions.map((session) => (
														<CommandItem
															key={session.id}
															value={`${session.session_code} ${session.session_name}`}
															onSelect={() => {
																setSelectedSessionId(session.id)
																setSessionOpen(false)
															}}
															className="py-2 text-xs"
														>
															<Check
																className={cn(
																	"mr-2 h-3.5 w-3.5 shrink-0",
																	selectedSessionId === session.id ? "opacity-100" : "opacity-0"
																)}
															/>
															<span className="flex-1 line-clamp-2">{session.session_code} - {session.session_name}</span>
														</CommandItem>
													))}
												</CommandGroup>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Course Combobox */}
								<div className="space-y-1.5">
									<Label htmlFor="course" className="text-xs font-medium">Course <span className="text-red-500">*</span></Label>
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
														? courses.find((c) => c.id === selectedCourseId)?.course_name
														: loadingCourses ? "Loading..." : "Select course..."}
												</span>
												<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[400px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search course..." className="h-8 text-xs" />
												<CommandEmpty className="text-xs py-4">No course found.</CommandEmpty>
												<CommandGroup className="max-h-56 overflow-auto">
													{courses.map((course) => (
														<CommandItem
															key={course.id}
															value={`${course.course_code} ${course.course_name}`}
															onSelect={() => {
																setSelectedCourseId(course.id)
																setCourseOpen(false)
															}}
															className="py-2 text-xs"
														>
															<Check
																className={cn(
																	"mr-2 h-3.5 w-3.5 shrink-0",
																	selectedCourseId === course.id ? "opacity-100" : "opacity-0"
																)}
															/>
															<span className="flex-1 line-clamp-2">{course.course_code} - {course.course_name}</span>
														</CommandItem>
													))}
												</CommandGroup>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Packet Number Combobox */}
								<div className="space-y-1.5">
									<Label htmlFor="packet" className="text-xs font-medium">Packet No <span className="text-red-500">*</span></Label>
									<Popover open={packetOpen} onOpenChange={setPacketOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={packetOpen}
												className="w-full justify-between h-9 text-left text-xs"
												disabled={!selectedCourseId || loadingPackets}
											>
												<span className="flex-1 pr-2 truncate">
													{selectedPacketId
														? packets.find((p) => p.id === selectedPacketId)?.packet_no
														: loadingPackets ? "Loading..." : "Select packet..."}
												</span>
												<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[200px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search packet..." className="h-8 text-xs" />
												<CommandEmpty className="text-xs py-4">No packet found.</CommandEmpty>
												<CommandGroup className="max-h-56 overflow-auto">
													{packets.map((packet) => (
														<CommandItem
															key={packet.id}
															value={packet.packet_no}
															onSelect={() => {
																setSelectedPacketId(packet.id)
																setPacketOpen(false)
															}}
															className="py-2 text-xs"
														>
															<Check
																className={cn(
																	"mr-2 h-3.5 w-3.5 shrink-0",
																	selectedPacketId === packet.id ? "opacity-100" : "opacity-0"
																)}
															/>
															<span className="flex-1">{packet.packet_no}</span>
														</CommandItem>
													))}
												</CommandGroup>
											</Command>
										</PopoverContent>
									</Popover>
								</div>
							</div>

							<div className="flex justify-end mt-3">
								<Button
									onClick={loadStudents}
									disabled={!selectedPacketId || loadingStudents}
									className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
								>
									{loadingStudents ? 'Loading...' : 'Load Learners'}
								</Button>
							</div>
						</CardContent>
					</Card>
					)}

					{/* Mark Entry Section */}
					{students.length > 0 && courseDetails && (
						<Card className="shadow-md">
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between">
									<CardTitle className="flex items-center gap-2 font-grotesk text-base">
										<div className="h-2 w-2 rounded-full bg-emerald-500"></div>
										Mark Entry - Packet {courseDetails.packet_no}
									</CardTitle>
									<div className="flex gap-2">
										<Badge variant="outline" className="text-sm px-3 py-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800">Max: {courseDetails.maximum_marks}</Badge>
										<Badge variant="outline" className="text-sm px-3 py-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800">Pass: {courseDetails.minimum_pass_marks}</Badge>
										<Badge variant="outline" className="text-sm px-3 py-1 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">Total: {getTotalMarks()}</Badge>
									</div>
								</div>
								<CardDescription className="text-xs mt-1">
									{courseDetails.subject_code} - {courseDetails.subject_name}
								</CardDescription>

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
							<CardContent className="space-y-2 pt-0">
								<div className="border rounded-lg">
									<Table>
										<TableHeader>
											<TableRow className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-600 hover:to-teal-600">
												<TableHead className="w-12 text-white font-semibold text-sm">#</TableHead>
												<TableHead className="text-white font-semibold text-sm">Dummy No</TableHead>
												<TableHead className="text-white font-semibold text-sm">Marks</TableHead>
												<TableHead className="text-white font-semibold text-sm">Marks in Words</TableHead>
												<TableHead className="text-white font-semibold text-sm">Result</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{students.map((student, index) => (
												<TableRow key={student.student_dummy_id} className="hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10">
													<TableCell className="font-medium text-sm py-2">{index + 1}</TableCell>
													<TableCell className="font-semibold text-sm py-2">{student.dummy_number}</TableCell>
													<TableCell className="py-2">
														<Input
															type="text"
															inputMode="numeric"
															pattern="[0-9]*"
															value={student.total_marks_obtained ?? ''}
															onChange={(e) => {
																const val = e.target.value
																if (val === '' || /^\d+$/.test(val)) {
																	handleMarksChange(index, val)
																}
															}}
															placeholder="00"
															className={cn(
																"h-8 w-20 text-center text-sm",
																isViewMode && "bg-muted cursor-not-allowed"
															)}
															disabled={isViewMode}
														/>
													</TableCell>
													<TableCell className="text-sm py-2">{student.total_marks_in_words || '-'}</TableCell>
													<TableCell className="py-2">
														<Badge
															className={cn(
																"font-medium text-sm",
																student.remarks === 'PASS'
																	? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300"
																	: student.remarks === 'FAIL'
																		? "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300"
																		: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
															)}
														>
															{student.remarks || '-'}
														</Badge>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>

								{!isViewMode && (
									<div className="flex justify-end gap-2">
										<Button
											onClick={() => {
												setStudents([])
												setSelectedPacketId('')
												setSelectedPacket(null)
												setCourseDetails(null)
												setIsViewMode(false)
											}}
											variant="outline"
											className="h-8 text-xs"
										>
											Cancel
										</Button>
										<Button
											onClick={handleSaveMarks}
											disabled={saving}
											className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
										>
											<Save className="h-3.5 w-3.5 mr-1.5" />
											{saving ? 'Saving...' : 'Save Marks'}
										</Button>
									</div>
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
