"use client"

import { useMemo, useState, useEffect } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import { Package, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Trash2, FileSpreadsheet, Sparkles, AlertTriangle, XCircle, CheckCircle, ChevronsUpDown } from "lucide-react"

// Import types
import type { AnswerSheetPacket, PacketDetailView, Institution, ExaminationSession, Course, PacketStatus } from "@/types/answer-sheet-packets"

export default function AnswerSheetPacketsPage() {
	const { toast } = useToast()
	const [items, setItems] = useState<AnswerSheetPacket[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
	const [currentPage, setCurrentPage] = useState(1)
	const itemsPerPage = 15

	// Filters
	const [institutionFilter, setInstitutionFilter] = useState("all")
	const [sessionFilter, setSessionFilter] = useState("all")
	const [courseFilter, setCourseFilter] = useState("all")
	const [statusFilter, setStatusFilter] = useState<PacketStatus | "all">("all")

	// Dropdowns
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [courses, setCourses] = useState<Course[]>([])
	const [allPackets, setAllPackets] = useState<PacketDetailView[]>([]) // Store ALL packets for filtering

	// Generation state
	const [generating, setGenerating] = useState(false)
	const [genInstitution, setGenInstitution] = useState("")
	const [genSession, setGenSession] = useState("")
	const [genCourses, setGenCourses] = useState<string[]>([])
	const [coursePopoverOpen, setCoursePopoverOpen] = useState(false)
	const [generationResult, setGenerationResult] = useState<{
		success: boolean
		message: string
		total_packets: number
		total_students: number
		courses_processed: number
		details: Array<{ course_code: string; packets: number; students: number; error?: string }>
	} | null>(null)

	// Search states for dropdowns
	const [institutionSearch, setInstitutionSearch] = useState("")
	const [sessionSearch, setSessionSearch] = useState("")
	const [courseSearch, setCourseSearch] = useState("")

	// Filtered dropdown lists
	const filteredInstitutions = useMemo(() => {
		if (!institutionSearch) return institutions
		const search = institutionSearch.toLowerCase()
		return institutions.filter(inst =>
			inst.institution_code.toLowerCase().includes(search) ||
			inst.name?.toLowerCase().includes(search)
		)
	}, [institutions, institutionSearch])

	const filteredSessions = useMemo(() => {
		if (!sessionSearch) return sessions
		const search = sessionSearch.toLowerCase()
		return sessions.filter(sess =>
			sess.session_code.toLowerCase().includes(search) ||
			sess.session_name?.toLowerCase().includes(search)
		)
	}, [sessions, sessionSearch])

	const filteredCourses = useMemo(() => {
		// First filter to only show Theory courses
		let theoryCourses = courses.filter(course =>
			course.course_category === "Theory"
		)

		// Exclude courses that already have packets generated for the selected institution + session
		if (genInstitution && genSession) {
			// Filter packets for current institution and session
			const matchingPackets = allPackets.filter(packet => {
				const instMatch = packet.institution_code === genInstitution
				const sessMatch = packet.session_code === genSession
				return instMatch && sessMatch
			})

			// Extract unique course codes from matching packets
			const generatedCourseCodes = new Set(
				matchingPackets.map(packet => packet.course_code)
			)

			// Debug: Log the filtering details
			console.log(`[Course Filter] Selected Institution: "${genInstitution}"`)
			console.log(`[Course Filter] Selected Session: "${genSession}"`)
			console.log(`[Course Filter] Total packets in DB: ${allPackets.length}`)
			console.log(`[Course Filter] Matching packets: ${matchingPackets.length}`)
			console.log(`[Course Filter] Unique course codes with packets:`, Array.from(generatedCourseCodes))
			console.log(`[Course Filter] Theory courses before exclusion: ${theoryCourses.length}`)

			// Sample packet for debugging
			if (matchingPackets.length > 0) {
				console.log(`[Course Filter] Sample matching packet:`, {
					institution_code: matchingPackets[0].institution_code,
					session_code: matchingPackets[0].session_code,
					course_code: matchingPackets[0].course_code
				})
			}

			theoryCourses = theoryCourses.filter(course =>
				!generatedCourseCodes.has(course.course_code)
			)

			console.log(`[Course Filter] Theory courses after exclusion: ${theoryCourses.length}`)
		}

		// Sort courses alphabetically by course_code
		theoryCourses.sort((a, b) => a.course_code.localeCompare(b.course_code))

		if (!courseSearch) return theoryCourses
		const search = courseSearch.toLowerCase()
		return theoryCourses.filter(course =>
			course.course_code.toLowerCase().includes(search) ||
			course.course_title?.toLowerCase().includes(search)
		)
	}, [courses, courseSearch, genInstitution, genSession, allPackets])

	// Fetch ALL packets (unfiltered) for course dropdown filtering
	const fetchAllPackets = async () => {
		try {
			const response = await fetch('/api/post-exam/answer-sheet-packets')
			if (response.ok) {
				const data = await response.json()
				console.log('[fetchAllPackets] Fetched packets count:', data.length)
				setAllPackets(data)
			}
		} catch (error) {
			console.error('Error fetching all packets:', error)
		}
	}

	// Fetch data from API
	const fetchPackets = async () => {
		try {
			setLoading(true)
			const params = new URLSearchParams()
			if (institutionFilter !== 'all') params.append('institution_code', institutionFilter)
			if (sessionFilter !== 'all') params.append('exam_session', sessionFilter)
			if (courseFilter !== 'all') params.append('course_code', courseFilter)
			if (statusFilter !== 'all') params.append('status', statusFilter)

			const response = await fetch(`/api/post-exam/answer-sheet-packets?${params.toString()}`)
			if (!response.ok) {
				throw new Error('Failed to fetch answer sheet packets')
			}
			const data = await response.json()
			setItems(data)
		} catch (error) {
			console.error('Error fetching answer sheet packets:', error)
			setItems([])
		} finally {
			setLoading(false)
		}
	}

	// Fetch dropdowns
	const fetchDropdowns = async () => {
		try {
			// Fetch institutions
			const instRes = await fetch('/api/master/institutions')
			if (instRes.ok) {
				const instData = await instRes.json()
				setInstitutions(instData)
			}

			// Fetch examination sessions
			const sessRes = await fetch('/api/exam-management/examination-sessions')
			if (sessRes.ok) {
				const sessData = await sessRes.json()
				setSessions(sessData)
			}

			// Fetch courses
			const courseRes = await fetch('/api/master/courses')
			if (courseRes.ok) {
				const courseData = await courseRes.json()
				setCourses(courseData)
			}
		} catch (error) {
			console.error('Error fetching dropdowns:', error)
		}
	}

	// Load data on component mount
	useEffect(() => {
		fetchDropdowns()
		fetchPackets()
		fetchAllPackets() // Fetch all packets for course filtering
	}, [])

	// Reload packets when filters change
	useEffect(() => {
		fetchPackets()
	}, [institutionFilter, sessionFilter, courseFilter, statusFilter])

	const handleSort = (column: string) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc")
		} else {
			setSortColumn(column)
			setSortDirection("asc")
		}
	}

	const getSortIcon = (column: string) => {
		if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
		return sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
	}

	const filtered = useMemo(() => {
		const q = searchTerm.toLowerCase()
		const data = items.filter((i) => {
			const searchFields = [
				i.packet_no,
				i.barcode,
				i.packet_location,
			].filter(Boolean).map((v) => String(v).toLowerCase())

			return searchFields.some((v) => v.includes(q))
		})

		if (!sortColumn) return data
		const sorted = [...data].sort((a, b) => {
			const av = (a as any)[sortColumn]
			const bv = (b as any)[sortColumn]
			if (av === bv) return 0
			if (sortDirection === "asc") return av > bv ? 1 : -1
			return av < bv ? 1 : -1
		})
		return sorted
	}, [items, searchTerm, sortColumn, sortDirection])

	const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1
	const startIndex = (currentPage - 1) * itemsPerPage
	const endIndex = startIndex + itemsPerPage
	const pageItems = filtered.slice(startIndex, endIndex)

	useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, itemsPerPage])

	const handleGeneratePackets = async () => {
		if (!genInstitution || !genSession) {
			toast({
				title: "⚠️ Validation Error",
				description: "Please select institution and examination session.",
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
			return
		}

		try {
			setGenerating(true)

			// If no courses selected, show error
			if (genCourses.length === 0) {
				toast({
					title: "⚠️ Validation Error",
					description: "Please select at least one course.",
					variant: "destructive",
					className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
				})
				setGenerating(false)
				return
			}

			// Generate packets for each selected course sequentially
			const results = []
			for (const courseCode of genCourses) {
				const response = await fetch('/api/post-exam/answer-sheet-packets/generate-packets', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						institution_code: genInstitution,
						exam_session: genSession,
						course_code: courseCode,
					}),
				})

				if (response.ok) {
					const result = await response.json()
					results.push(result)
				}
			}

			// Aggregate results from all courses
			const result = {
				total_packets_created: results.reduce((sum, r) => sum + r.total_packets_created, 0),
				total_students_assigned: results.reduce((sum, r) => sum + r.total_students_assigned, 0),
				courses_processed: results.length,
				message: `Generated packets for ${results.length} course(s)`,
				course_results: results.flatMap(r => r.course_results || [])
			}

			// Set generation result for UI display
			setGenerationResult({
				success: true,
				message: `Successfully generated ${result.total_packets_created} packet(s) for ${result.courses_processed} course(s)`,
				total_packets: result.total_packets_created,
				total_students: result.total_students_assigned,
				courses_processed: result.courses_processed,
				details: result.course_results.map((cr: any) => ({
					course_code: cr.course_code,
					packets: cr.packets_created || 0,
					students: cr.students_assigned || 0,
					error: cr.error
				}))
			})

			// Refresh packets list
			await fetchPackets()
			await fetchAllPackets() // Also refresh all packets for course filtering

			// Clear selected courses and close dropdown after successful generation
			setGenCourses([])
			setCoursePopoverOpen(false)
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to generate packets. Please try again.'

			// Enhanced error message with helpful tips
			const errorTips = [
				'Ensure students have been assigned dummy numbers for the selected session',
				'Verify that attendance has been marked for the students',
				'Check that the courses are marked as Theory category',
				'Confirm that the institution, session, and course codes are correct'
			]

			toast({
				title: "❌ Packet Generation Failed",
				description: (
					<div className="space-y-2">
						<p className="font-semibold text-red-700 dark:text-red-300">{errorMessage}</p>
						<div className="mt-3 pt-2 border-t border-red-200 dark:border-red-800">
							<p className="text-xs font-semibold mb-1">Troubleshooting Tips:</p>
							<ul className="text-xs space-y-1 list-disc list-inside">
								{errorTips.map((tip, index) => (
									<li key={index} className="text-red-600 dark:text-red-400">{tip}</li>
								))}
							</ul>
						</div>
					</div>
				),
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
				duration: 10000,
			})
		} finally {
			setGenerating(false)
		}
	}

	const handleDelete = async (id: string) => {
		try {
			setLoading(true)
			const response = await fetch(`/api/post-exam/answer-sheet-packets/${id}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to delete packet')
			}

			setItems((prev) => prev.filter((p) => p.id !== id))

			toast({
				title: "✅ Packet Deleted",
				description: "Packet has been successfully deleted.",
				className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
			})
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to delete packet. Please try again.'
			toast({
				title: "❌ Delete Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setLoading(false)
		}
	}

	const getStatusBadgeVariant = (status: PacketStatus) => {
		switch (status) {
			case 'Created':
				return 'default'
			case 'Assigned':
				return 'secondary'
			case 'In Evaluation':
				return 'outline'
			case 'Completed':
				return 'default'
			case 'Archived':
				return 'secondary'
			case 'Returned':
				return 'destructive'
			case 'Missing':
				return 'destructive'
			default:
				return 'default'
		}
	}

	const getStatusBadgeColor = (status: PacketStatus) => {
		switch (status) {
			case 'Created':
				return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-700'
			case 'Assigned':
				return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/20 dark:text-purple-200 dark:border-purple-700'
			case 'In Evaluation':
				return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-200 dark:border-yellow-700'
			case 'Completed':
				return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-200 dark:border-green-700'
			case 'Archived':
				return 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/20 dark:text-gray-200 dark:border-gray-700'
			case 'Returned':
				return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/20 dark:text-orange-200 dark:border-orange-700'
			case 'Missing':
				return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-200 dark:border-red-700'
			default:
				return 'bg-gray-100 text-gray-800'
		}
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader
					breadcrumb={
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
										<Link href="/post-exam">Post Exam</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Answer Sheet Packets</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					}
				/>

				<div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
					{/* Header Section */}
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-bold text-gray-900 dark:text-white font-heading flex items-center gap-2">
								<div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
									<Package className="h-5 w-5 text-white" />
								</div>
								Answer Sheet Packets
							</h1>
							<p className="text-muted-foreground mt-1">
								Manage answer sheet packets for evaluation
							</p>
						</div>
						<Button onClick={() => fetchPackets()} size="sm" variant="outline">
							<RefreshCw className="h-4 w-4 mr-2" />
							Refresh
						</Button>
					</div>

					{/* Packet Generation Card */}
					<Card className="border-2 border-dashed border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-900/10">
						<CardHeader>
							<div className="flex items-center gap-3">
								<div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
									<Sparkles className="h-5 w-5 text-white" />
								</div>
								<div>
									<h2 className="text-lg font-heading font-semibold text-gray-900 dark:text-white">
										Generate Answer Sheet Packets
									</h2>
									<p className="text-sm text-muted-foreground">
										Automatically create packets based on attendance (UG: 25 sheets, PG: 20 sheets)
									</p>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
								<div>
									<Label htmlFor="gen-institution">Institution <span className="text-red-500">*</span></Label>
									<Select
										value={genInstitution}
										onValueChange={setGenInstitution}
										onOpenChange={(open) => !open && setInstitutionSearch("")}
									>
										<SelectTrigger id="gen-institution">
											<SelectValue placeholder="Select institution" />
										</SelectTrigger>
										<SelectContent>
											<div className="p-2 border-b sticky top-0 bg-popover z-10">
												<Input
													placeholder="Search institutions..."
													value={institutionSearch}
													onChange={(e) => setInstitutionSearch(e.target.value)}
													className="h-8"
													onClick={(e) => e.stopPropagation()}
												/>
											</div>
											{filteredInstitutions.length === 0 ? (
												<div className="p-2 text-sm text-muted-foreground text-center">No institutions found</div>
											) : (
												filteredInstitutions.map((inst) => (
													<SelectItem key={inst.id} value={inst.institution_code}>
														{inst.institution_code} - {inst.name}
													</SelectItem>
												))
											)}
										</SelectContent>
									</Select>
								</div>

								<div>
									<Label htmlFor="gen-session">Exam Session <span className="text-red-500">*</span></Label>
									<Select
										value={genSession}
										onValueChange={setGenSession}
										onOpenChange={(open) => !open && setSessionSearch("")}
									>
										<SelectTrigger id="gen-session">
											<SelectValue placeholder="Select session" />
										</SelectTrigger>
										<SelectContent>
											<div className="p-2 border-b sticky top-0 bg-popover z-10">
												<Input
													placeholder="Search sessions..."
													value={sessionSearch}
													onChange={(e) => setSessionSearch(e.target.value)}
													className="h-8"
													onClick={(e) => e.stopPropagation()}
												/>
											</div>
											{filteredSessions.length === 0 ? (
												<div className="p-2 text-sm text-muted-foreground text-center">No sessions found</div>
											) : (
												filteredSessions.map((sess) => (
													<SelectItem key={sess.id} value={sess.session_code}>
														{sess.session_code} - {sess.session_name}
													</SelectItem>
												))
											)}
										</SelectContent>
									</Select>
								</div>

								<div>
									<Label htmlFor="gen-course">Courses (Select Multiple - Theory Only)</Label>

									{/* Selected Courses Display */}
									{genCourses.length > 0 && (
										<div className="flex flex-wrap gap-1 p-2 border rounded-md bg-muted/30 mb-2">
											{genCourses.map((courseCode) => {
												const course = courses.find(c => c.course_code === courseCode)
												return (
													<Badge key={courseCode} variant="secondary" className="text-xs">
														{course?.course_code}
														<button
															onClick={() => setGenCourses(prev => prev.filter(c => c !== courseCode))}
															className="ml-1 hover:text-destructive"
														>
															×
														</button>
													</Badge>
												)
											})}
										</div>
									)}

									{/* Course Selection Popover with Checkboxes */}
									<Popover open={coursePopoverOpen} onOpenChange={setCoursePopoverOpen}>
										<PopoverTrigger asChild>
											<Button
												id="gen-course"
												variant="outline"
												role="combobox"
												aria-expanded={coursePopoverOpen}
												className="w-full justify-between"
											>
												{genCourses.length > 0 ? `${genCourses.length} course(s) selected` : "Select courses..."}
												<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[600px] p-0" align="start">
											<div className="p-2 border-b sticky top-0 bg-popover z-10">
												<Input
													placeholder="Search courses..."
													value={courseSearch}
													onChange={(e) => setCourseSearch(e.target.value)}
													className="h-8"
												/>
											</div>
											<div className="max-h-[400px] overflow-y-auto">
												{filteredCourses.length === 0 ? (
													<div className="p-4 text-sm text-muted-foreground text-center">
														{genInstitution && genSession ? "All courses have packets generated" : "No theory courses available"}
													</div>
												) : (
													<div className="p-2 space-y-1">
														{filteredCourses.map((course) => (
															<div
																key={course.id}
																className="flex items-start space-x-3 p-2 hover:bg-muted rounded-md cursor-pointer"
																onClick={() => {
																	setGenCourses(prev =>
																		prev.includes(course.course_code)
																			? prev.filter(c => c !== course.course_code)
																			: [...prev, course.course_code]
																	)
																}}
															>
																<Checkbox
																	checked={genCourses.includes(course.course_code)}
																	onCheckedChange={(checked) => {
																		setGenCourses(prev =>
																			checked
																				? [...prev, course.course_code]
																				: prev.filter(c => c !== course.course_code)
																		)
																	}}
																	onClick={(e) => e.stopPropagation()}
																/>
																<div className="flex-1 space-y-1">
																	<p className="text-sm font-medium leading-none">
																		{course.course_code}
																	</p>
																	<p className="text-xs text-muted-foreground whitespace-normal break-words">
																		{course.course_title}
																	</p>
																</div>
															</div>
														))}
													</div>
												)}
											</div>
											<div className="p-2 border-t bg-muted/30 flex justify-between items-center">
												<span className="text-xs text-muted-foreground">
													{genCourses.length} of {filteredCourses.length} selected
												</span>
												{genCourses.length > 0 && (
													<Button
														variant="ghost"
														size="sm"
														onClick={() => setGenCourses([])}
														className="h-7 text-xs"
													>
														Clear All
													</Button>
												)}
											</div>
										</PopoverContent>
									</Popover>
								</div>

								<div className="flex items-end">
									<Button
										onClick={handleGeneratePackets}
										disabled={generating || !genInstitution || !genSession}
										className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
									>
										{generating ? (
											<>
												<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
												Generating...
											</>
										) : (
											<>
												<Sparkles className="h-4 w-4 mr-2" />
												Generate Packets
											</>
										)}
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Generation Result Status */}
					{generationResult && (
						<Card className={generationResult.success ? "border-green-500 bg-green-50 dark:bg-green-900/10" : "border-red-500 bg-red-50 dark:bg-red-900/10"}>
							<CardContent className="pt-6">
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-2 mb-3">
											{generationResult.success ? (
												<CheckCircle className="h-5 w-5 text-green-600" />
											) : (
												<XCircle className="h-5 w-5 text-red-600" />
											)}
											<h3 className={`font-semibold ${generationResult.success ? "text-green-900 dark:text-green-100" : "text-red-900 dark:text-red-100"}`}>
												{generationResult.message}
											</h3>
										</div>

										<div className="grid grid-cols-3 gap-4 mb-4">
											<div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-green-200 dark:border-green-800">
												<div className="text-xs text-muted-foreground mb-1">Total Packets</div>
												<div className="text-xl font-bold text-green-600 dark:text-green-400">{generationResult.total_packets}</div>
											</div>
											<div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
												<div className="text-xs text-muted-foreground mb-1">Students Assigned</div>
												<div className="text-xl font-bold text-blue-600 dark:text-blue-400">{generationResult.total_students}</div>
											</div>
											<div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
												<div className="text-xs text-muted-foreground mb-1">Courses Processed</div>
												<div className="text-xl font-bold text-purple-600 dark:text-purple-400">{generationResult.courses_processed}</div>
											</div>
										</div>

										{generationResult.details.length > 0 && (
											<div className="space-y-2">
												<h4 className="text-sm font-semibold text-muted-foreground">Course Details:</h4>
												<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
													{generationResult.details.map((detail, index) => (
														<div key={index} className="bg-white dark:bg-gray-800 rounded-md p-2 border text-sm">
															{detail.error ? (
																<div className="flex items-center gap-2 text-red-600">
																	<XCircle className="h-4 w-4" />
																	<span className="font-medium">{detail.course_code}</span>
																	<span className="text-xs">- {detail.error}</span>
																</div>
															) : (
																<div className="flex items-center justify-between">
																	<div className="flex items-center gap-2">
																		<CheckCircle className="h-4 w-4 text-green-600" />
																		<span className="font-medium">{detail.course_code}</span>
																	</div>
																	<div className="text-xs text-muted-foreground">
																		{detail.packets} packets, {detail.students} students
																	</div>
																</div>
															)}
														</div>
													))}
												</div>
											</div>
										)}
									</div>

									<Button
										variant="ghost"
										size="icon"
										onClick={() => setGenerationResult(null)}
										className="ml-2"
									>
										<XCircle className="h-4 w-4" />
									</Button>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Filters & Search */}
					<Card>
						<CardContent className="pt-6">
							<div className="grid grid-cols-1 md:grid-cols-6 gap-4">
								{/* Search */}
								<div className="md:col-span-2">
									<div className="relative">
										<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
										<Input
											placeholder="Search by packet no, barcode, location..."
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
											className="pl-9"
										/>
									</div>
								</div>

								{/* Institution Filter */}
								<div>
									<Select value={institutionFilter} onValueChange={setInstitutionFilter}>
										<SelectTrigger>
											<SelectValue placeholder="All Institutions" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Institutions</SelectItem>
											{institutions.map((inst) => (
												<SelectItem key={inst.id} value={inst.institution_code}>
													{inst.institution_code}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Session Filter */}
								<div>
									<Select value={sessionFilter} onValueChange={setSessionFilter}>
										<SelectTrigger>
											<SelectValue placeholder="All Sessions" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Sessions</SelectItem>
											{sessions.map((sess) => (
												<SelectItem key={sess.id} value={sess.session_code}>
													{sess.session_code}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Course Filter */}
								<div>
									<Select value={courseFilter} onValueChange={setCourseFilter}>
										<SelectTrigger>
											<SelectValue placeholder="All Courses" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Courses</SelectItem>
											{courses.map((course) => (
												<SelectItem key={course.id} value={course.course_code}>
													{course.course_code}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Status Filter */}
								<div>
									<Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PacketStatus | "all")}>
										<SelectTrigger>
											<SelectValue placeholder="All Statuses" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Statuses</SelectItem>
											<SelectItem value="Created">Created</SelectItem>
											<SelectItem value="Assigned">Assigned</SelectItem>
											<SelectItem value="In Evaluation">In Evaluation</SelectItem>
											<SelectItem value="Completed">Completed</SelectItem>
											<SelectItem value="Archived">Archived</SelectItem>
											<SelectItem value="Returned">Returned</SelectItem>
											<SelectItem value="Missing">Missing</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Statistics */}
					<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
						{/* Total Card */}
						<Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800 shadow-sm hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-2 mb-2">
											<Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
											<p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Total</p>
										</div>
										<div className="grid grid-cols-2 gap-2">
											<div>
												<div className="text-xl font-bold text-blue-900 dark:text-blue-100">{filtered.length}</div>
												<div className="text-xs text-blue-600/70 dark:text-blue-400/70">Packets</div>
											</div>
											<div>
												<div className="text-xl font-bold text-blue-900 dark:text-blue-100">{new Set(filtered.map(p => p.course_code)).size}</div>
												<div className="text-xs text-blue-600/70 dark:text-blue-400/70">Courses</div>
											</div>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Completed Card */}
						<Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800 shadow-sm hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-2 mb-2">
											<CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
											<p className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">Completed</p>
										</div>
										<div className="grid grid-cols-2 gap-2">
											<div>
												<div className="text-xl font-bold text-green-900 dark:text-green-100">{filtered.filter((p) => p.packet_status === 'Completed').length}</div>
												<div className="text-xs text-green-600/70 dark:text-green-400/70">Packets</div>
											</div>
											<div>
												<div className="text-xl font-bold text-green-900 dark:text-green-100">{new Set(filtered.filter((p) => p.packet_status === 'Completed').map(p => p.course_code)).size}</div>
												<div className="text-xs text-green-600/70 dark:text-green-400/70">Courses</div>
											</div>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* In Evaluation Card */}
						<Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 border-yellow-200 dark:border-yellow-800 shadow-sm hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-2 mb-2">
											<RefreshCw className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
											<p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 uppercase tracking-wide">In Evaluation</p>
										</div>
										<div className="grid grid-cols-2 gap-2">
											<div>
												<div className="text-xl font-bold text-yellow-900 dark:text-yellow-100">{filtered.filter((p) => p.packet_status === 'In Evaluation').length}</div>
												<div className="text-xs text-yellow-600/70 dark:text-yellow-400/70">Packets</div>
											</div>
											<div>
												<div className="text-xl font-bold text-yellow-900 dark:text-yellow-100">{new Set(filtered.filter((p) => p.packet_status === 'In Evaluation').map(p => p.course_code)).size}</div>
												<div className="text-xs text-yellow-600/70 dark:text-yellow-400/70">Courses</div>
											</div>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Total Sheets Card */}
						<Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800 shadow-sm hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-2 mb-2">
											<FileSpreadsheet className="h-4 w-4 text-purple-600 dark:text-purple-400" />
											<p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">Total Sheets</p>
										</div>
										<div>
											<div className="text-xl font-bold text-purple-900 dark:text-purple-100">
												{filtered.reduce((sum, p) => sum + p.total_sheets, 0)}
											</div>
											<div className="text-xs text-purple-600/70 dark:text-purple-400/70">Answer Sheets</div>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Table */}
					<Card>
						<CardContent className="pt-6">
							{loading ? (
								<div className="flex items-center justify-center h-64">
									<RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
								</div>
							) : filtered.length === 0 ? (
								<div className="flex flex-col items-center justify-center h-64 text-center">
									<Package className="h-16 w-16 text-muted-foreground/20 mb-4" />
									<p className="text-base font-medium text-muted-foreground">No packets found</p>
									<p className="text-sm text-muted-foreground">Generate packets or adjust your filters</p>
								</div>
							) : (
								<>
									<div className="overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="cursor-pointer" onClick={() => handleSort("packet_no")}>
														<div className="flex items-center gap-1">
															Packet No {getSortIcon("packet_no")}
														</div>
													</TableHead>
													<TableHead>Course</TableHead>
													<TableHead className="cursor-pointer" onClick={() => handleSort("total_sheets")}>
														<div className="flex items-center gap-1">
															Total Sheets {getSortIcon("total_sheets")}
														</div>
													</TableHead>
													<TableHead className="cursor-pointer" onClick={() => handleSort("sheets_evaluated")}>
														<div className="flex items-center gap-1">
															Evaluated {getSortIcon("sheets_evaluated")}
														</div>
													</TableHead>
													<TableHead>Progress</TableHead>
													<TableHead className="cursor-pointer" onClick={() => handleSort("packet_status")}>
														<div className="flex items-center gap-1">
															Status {getSortIcon("packet_status")}
														</div>
													</TableHead>
													<TableHead>Barcode</TableHead>
													<TableHead className="text-right">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{pageItems.map((item) => (
													<TableRow key={item.id}>
														<TableCell className="font-medium">{item.packet_no}</TableCell>
														<TableCell>
															<div className="flex flex-col">
																<span className="text-sm font-medium">{(item as any).course_code}</span>
																<span className="text-xs text-muted-foreground">{(item as any).course_title}</span>
															</div>
														</TableCell>
														<TableCell>
															<span className="font-semibold text-blue-600 dark:text-blue-400">
																{item.total_sheets}
															</span>
														</TableCell>
														<TableCell>
															<span className="font-semibold text-green-600 dark:text-green-400">
																{item.sheets_evaluated}
															</span>
														</TableCell>
														<TableCell>
															<div className="flex items-center gap-2">
																<div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
																	<div
																		className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all"
																		style={{ width: `${item.evaluation_progress}%` }}
																	/>
																</div>
																<span className="text-xs font-medium text-muted-foreground">
																	{item.evaluation_progress}%
																</span>
															</div>
														</TableCell>
														<TableCell>
															<Badge variant={getStatusBadgeVariant(item.packet_status)} className={getStatusBadgeColor(item.packet_status)}>
																{item.packet_status}
															</Badge>
														</TableCell>
														<TableCell>
															<span className="text-xs font-mono text-muted-foreground">{item.barcode || '-'}</span>
														</TableCell>
														<TableCell className="text-right">
															<AlertDialog>
																<AlertDialogTrigger asChild>
																	<Button variant="ghost" size="sm">
																		<Trash2 className="h-4 w-4 text-red-500" />
																	</Button>
																</AlertDialogTrigger>
																<AlertDialogContent>
																	<AlertDialogHeader>
																		<AlertDialogTitle>Delete Packet?</AlertDialogTitle>
																		<AlertDialogDescription>
																			This will delete packet {item.packet_no} and clear assignments for all students in this packet. This action cannot be undone.
																		</AlertDialogDescription>
																	</AlertDialogHeader>
																	<AlertDialogFooter>
																		<AlertDialogCancel>Cancel</AlertDialogCancel>
																		<AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-red-500 hover:bg-red-600">
																			Delete
																		</AlertDialogAction>
																	</AlertDialogFooter>
																</AlertDialogContent>
															</AlertDialog>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>

									{/* Pagination */}
									<div className="flex items-center justify-between mt-4 pt-4 border-t">
										<div className="text-sm text-muted-foreground">
											Showing {startIndex + 1} to {Math.min(endIndex, filtered.length)} of {filtered.length} packets
										</div>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
												disabled={currentPage === 1}
											>
												<ChevronLeft className="h-4 w-4" />
											</Button>
											<div className="text-sm font-medium">
												Page {currentPage} of {totalPages}
											</div>
											<Button
												variant="outline"
												size="sm"
												onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
												disabled={currentPage === totalPages}
											>
												<ChevronRight className="h-4 w-4" />
											</Button>
										</div>
									</div>
								</>
							)}
						</CardContent>
					</Card>
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
