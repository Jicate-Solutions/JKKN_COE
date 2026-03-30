'use client'

import { useState, useEffect, useMemo } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useToast } from '@/hooks/common/use-toast'
import { Download, FileText, ChevronsUpDown, X, Search, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { generateDummyNumberReportPDF } from '@/lib/utils/generate-dummy-number-report-pdf'
import Link from 'next/link'

interface Institution {
	id: string
	institution_code: string
	name: string
}

interface ExaminationSession {
	id: string
	session_code: string
	session_name: string
}

interface DummyNumber {
	id: string
	dummy_number: string
	actual_register_number: string
	roll_number_for_evaluation: number
	exam_registration?: {
		stu_register_no: string
		is_regular: boolean
		student_name?: string
		course_offering?: {
			course_code?: string
			program_code?: string
			course?: {
				course_name: string
				course_code: string
				course_category: string
				board_code?: string
				board?: {
					board_code: string
					board_name: string
					board_order: number
				}
			}
		}
	}
}

export default function DummyNumberReportPage() {
	const { toast } = useToast()

	const {
		isReady,
		institutionId: contextInstitutionId,
		mustSelectInstitution,
		shouldFilter,
	} = useInstitutionFilter()

	// State
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const [selectedSession, setSelectedSession] = useState('')
	const [institutionOpen, setInstitutionOpen] = useState(false)

	// Filter options from filter-options API
	const [filterBoards, setFilterBoards] = useState<{ board_code: string; board_name: string; board_order: number }[]>([])
	const [allCourses, setAllCourses] = useState<{ course_code: string; course_name: string; semester: number; course_order: number }[]>([])
	const [filterEntries, setFilterEntries] = useState<{
		board_code: string | null
		program_code: string | null
		course_code: string | null
		course_category: string | null
	}[]>([])

	const [selectedBoard, setSelectedBoard] = useState('')
	const [selectedCourses, setSelectedCourses] = useState<string[]>([])
	const [boardOpen, setBoardOpen] = useState(false)

	// Search state for searchable dropdowns
	const [boardSearch, setBoardSearch] = useState('')
	const [courseSearch, setCourseSearch] = useState('')

	// Report data
	const [dummyNumbers, setDummyNumbers] = useState<DummyNumber[]>([])
	const [loading, setLoading] = useState(false)
	const [exporting, setExporting] = useState(false)

	// Effective institution ID (local selection or global filter)
	const institutionId = selectedInstitutionId || contextInstitutionId

	// Whether to show institution dropdown (super_admin can always select)
	const showInstitutionDropdown = mustSelectInstitution

	// Cascading: courses filtered by selected board (preserves API sort order)
	const courses = useMemo(() => {
		if (!selectedBoard) return allCourses
		const validCodes = new Set(
			filterEntries
				.filter(e => e.board_code === selectedBoard)
				.map(e => e.course_code)
		)
		return allCourses.filter(c => validCodes.has(c.course_code))
	}, [allCourses, selectedBoard, filterEntries])

	// Filtered boards by search (preserves board_order from API)
	const filteredBoards = useMemo(() => {
		if (!boardSearch.trim()) return filterBoards
		const q = boardSearch.toLowerCase()
		return filterBoards.filter(b =>
			b.board_code.toLowerCase().includes(q) || b.board_name.toLowerCase().includes(q)
		)
	}, [filterBoards, boardSearch])

	// Filtered courses by search (preserves sort order from API)
	const filteredCourses = useMemo(() => {
		if (!courseSearch.trim()) return courses
		const q = courseSearch.toLowerCase()
		return courses.filter(c =>
			c.course_code.toLowerCase().includes(q) || c.course_name.toLowerCase().includes(q)
		)
	}, [courses, courseSearch])

	// Fetch institutions
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
		}
	}, [isReady])

	// Auto-select institution for normal users (from global filter)
	useEffect(() => {
		if (institutions.length > 0) {
			if (shouldFilter && contextInstitutionId) {
				setSelectedInstitutionId(contextInstitutionId)
			} else if (!mustSelectInstitution && contextInstitutionId) {
				setSelectedInstitutionId(contextInstitutionId)
			}
		}
	}, [institutions, shouldFilter, mustSelectInstitution, contextInstitutionId])

	// Fetch sessions when institution changes
	useEffect(() => {
		if (isReady && institutionId) {
			fetchSessions()
			setSelectedSession('')
			setDummyNumbers([])
		} else {
			setSessions([])
			setSelectedSession('')
		}
	}, [isReady, institutionId])

	// Fetch filter options when session changes
	useEffect(() => {
		if (isReady && institutionId && selectedSession) {
			fetchFilterOptions()
		} else {
			setFilterEntries([])
			setFilterBoards([])
			setAllCourses([])
			setSelectedBoard('')
			setSelectedCourses([])
		}
	}, [isReady, institutionId, selectedSession])

	// Reset courses when board changes
	useEffect(() => {
		setSelectedCourses([])
	}, [selectedBoard])

	const fetchInstitutions = async () => {
		try {
			const res = await fetch('/api/master/institutions')
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)
			}
		} catch (error) {
			console.error('Error fetching institutions:', error)
		}
	}

	const fetchSessions = async () => {
		if (!institutionId) return
		try {
			const res = await fetch(`/api/exam-management/examination-sessions?institutions_id=${institutionId}`)
			if (res.ok) {
				const data = await res.json()
				setSessions(data)
			}
		} catch (error) {
			console.error('Error fetching sessions:', error)
		}
	}

	const fetchFilterOptions = async () => {
		if (!institutionId || !selectedSession) return
		try {
			const res = await fetch(
				`/api/reports/dummy-numbers/filter-options?institutions_id=${institutionId}&examination_session_id=${selectedSession}`
			)
			if (res.ok) {
				const data = await res.json()
				setFilterEntries(data.entries || [])
				setFilterBoards(data.boards || [])
				setAllCourses(data.courses || [])
			}
		} catch (error) {
			console.error('Error fetching filter options:', error)
		}
	}

	const fetchReport = async () => {
		if (!institutionId || !selectedSession) {
			toast({ title: '⚠️ Missing Information', description: 'Please select an examination session', variant: 'destructive' })
			return
		}

		try {
			setLoading(true)
			setDummyNumbers([])

			let url = `/api/utilities/dummy-numbers?institutions_id=${institutionId}&examination_session_id=${selectedSession}`
			if (selectedBoard) url += `&board_code=${selectedBoard}`
			if (selectedCourses.length > 0) url += `&course_code=${selectedCourses.join(',')}`

			const res = await fetch(url)
			if (res.ok) {
				const result = await res.json()
				setDummyNumbers(result.data || [])
				if ((result.data || []).length === 0) {
					toast({ title: '⚠️ No Data', description: 'No dummy numbers found for the selected filters', variant: 'destructive' })
				}
			}
		} catch (error) {
			console.error('Error fetching report:', error)
			toast({ title: '❌ Error', description: 'Failed to fetch report data', variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}

	const exportToPDF = async () => {
		if (dummyNumbers.length === 0) return

		try {
			setExporting(true)

			const institution = institutions.find(i => i.id === institutionId)
			const session = sessions.find(s => s.id === selectedSession)

			// Load logos
			let logoImage: string | undefined
			let rightLogoImage: string | undefined

			try {
				const logoResponse = await fetch('/jkkn_logo.png')
				if (logoResponse.ok) {
					const blob = await logoResponse.blob()
					logoImage = await new Promise<string>((resolve) => {
						const reader = new FileReader()
						reader.onloadend = () => resolve(reader.result as string)
						reader.readAsDataURL(blob)
					})
				}

				const rightLogoResponse = await fetch('/jkkncas_logo.png')
				if (rightLogoResponse.ok) {
					const blob = await rightLogoResponse.blob()
					rightLogoImage = await new Promise<string>((resolve) => {
						const reader = new FileReader()
						reader.onloadend = () => resolve(reader.result as string)
						reader.readAsDataURL(blob)
					})
				}
			} catch (e) {
				console.warn('Failed to load logos:', e)
			}

			const records = dummyNumbers.map(dn => ({
				roll_number_for_evaluation: dn.roll_number_for_evaluation,
				dummy_number: dn.dummy_number,
				actual_register_number: dn.actual_register_number,
				student_name: dn.exam_registration?.student_name || '',
				board_code: dn.exam_registration?.course_offering?.course?.board_code || dn.exam_registration?.course_offering?.course?.board?.board_code || '',
				program_code: dn.exam_registration?.course_offering?.program_code || '',
				course_code: dn.exam_registration?.course_offering?.course?.course_code || '',
				course_name: dn.exam_registration?.course_offering?.course?.course_name || '',
				type: dn.exam_registration?.is_regular ? 'R' : 'A',
			}))

			const boardInfo = selectedBoard ? filterBoards.find(b => b.board_code === selectedBoard) : undefined

			generateDummyNumberReportPDF({
				institutionName: institution?.name || '',
				institutionCode: institution?.institution_code || '',
				sessionName: session?.session_name || '',
				sessionCode: session?.session_code || '',
				boardName: boardInfo?.board_name,
				boardCode: selectedBoard || undefined,
				courseCodes: selectedCourses.length > 0 ? selectedCourses : undefined,
				logoImage,
				rightLogoImage,
				records,
			})

			toast({
				title: '✅ PDF Exported',
				description: `Exported ${dummyNumbers.length} records to PDF`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('PDF export error:', error)
			toast({ title: '❌ Export Failed', description: 'Failed to generate PDF', variant: 'destructive' })
		} finally {
			setExporting(false)
		}
	}

	const exportToExcel = async () => {
		if (dummyNumbers.length === 0) return

		try {
			setExporting(true)

			const institution = institutions.find(i => i.id === institutionId)
			const session = sessions.find(s => s.id === selectedSession)

			const ExcelJS = await import('exceljs')
			const workbook = new ExcelJS.default.Workbook()
			const worksheet = workbook.addWorksheet('Dummy Number Report')

			const baseFont = { name: 'Times New Roman', size: 12 }

			// Title rows
			const titleRow = worksheet.addRow(['DUMMY NUMBER REPORT'])
			titleRow.font = { ...baseFont, bold: true, size: 14 }
			worksheet.mergeCells('A1:G1')
			titleRow.alignment = { horizontal: 'center' }

			const sessionRow = worksheet.addRow([`Examination Session: ${session?.session_name || ''}`])
			sessionRow.font = { ...baseFont, bold: true }
			worksheet.mergeCells('A2:G2')
			sessionRow.alignment = { horizontal: 'center' }

			const instRow = worksheet.addRow([`Institution: ${institution?.institution_code || ''} - ${institution?.name || ''}`])
			instRow.font = { ...baseFont }
			worksheet.mergeCells('A3:G3')
			instRow.alignment = { horizontal: 'center' }

			// Empty row
			worksheet.addRow([])

			// Header row
			const headers = ['S.No', 'Dummy Number', 'Register Number', 'Learner Name', 'Board', 'Course Code', 'Type']
			const headerRow = worksheet.addRow(headers)
			headerRow.font = { ...baseFont, bold: true }
			headerRow.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFE0E0E0' },
			}
			headerRow.eachCell((cell) => {
				cell.border = {
					top: { style: 'thin' },
					left: { style: 'thin' },
					bottom: { style: 'thin' },
					right: { style: 'thin' },
				}
				cell.alignment = { horizontal: 'center', vertical: 'middle' }
			})

			// Data rows
			dummyNumbers.forEach((dn, idx) => {
				const row = worksheet.addRow([
					idx + 1,
					dn.dummy_number,
					dn.actual_register_number,
					dn.exam_registration?.student_name || '',
					dn.exam_registration?.course_offering?.course?.board_code || dn.exam_registration?.course_offering?.course?.board?.board_code || '',
					dn.exam_registration?.course_offering?.course?.course_code || '',
					dn.exam_registration?.is_regular ? 'Regular' : 'Arrear',
				])
				row.font = baseFont
				row.eachCell((cell) => {
					cell.border = {
						top: { style: 'thin' },
						left: { style: 'thin' },
						bottom: { style: 'thin' },
						right: { style: 'thin' },
					}
				})
			})

			// Auto-size columns
			worksheet.columns = [
				{ width: 8 },   // S.No
				{ width: 20 },  // Dummy Number
				{ width: 22 },  // Register Number
				{ width: 35 },  // Learner Name
				{ width: 12 },  // Board
				{ width: 20 },  // Course Code
				{ width: 12 },  // Type
			]

			// Total row
			const totalRow = worksheet.addRow([`Total Records: ${dummyNumbers.length}`])
			totalRow.font = { ...baseFont, bold: true }
			worksheet.mergeCells(`A${totalRow.number}:G${totalRow.number}`)

			const buffer = await workbook.xlsx.writeBuffer()
			const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
			const url = window.URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `Dummy_Number_Report_${session?.session_code || 'report'}_${new Date().toISOString().split('T')[0]}.xlsx`
			a.click()
			window.URL.revokeObjectURL(url)

			toast({
				title: '✅ Excel Exported',
				description: `Exported ${dummyNumbers.length} records to Excel`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('Excel export error:', error)
			toast({ title: '❌ Export Failed', description: 'Failed to generate Excel', variant: 'destructive' })
		} finally {
			setExporting(false)
		}
	}

	// Select All courses toggle
	const handleSelectAllCourses = (checked: boolean) => {
		if (checked) {
			setSelectedCourses(courses.map(c => c.course_code))
		} else {
			setSelectedCourses([])
		}
	}

	const allCoursesSelected = courses.length > 0 && selectedCourses.length === courses.length

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					{/* Breadcrumb */}
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
									<Link href="#">Reports</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Dummy Number Report</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					<div className="space-y-6">
						{/* Header */}
						<div>
							<h1 className="text-3xl font-bold text-heading">Dummy Number Report</h1>
							<p className="text-muted-foreground mt-2">
								Download dummy number allocation report as PDF or Excel
							</p>
						</div>

						{/* Filters Card */}
						<Card>
							<CardHeader>
								<CardTitle>Report Filters</CardTitle>
								<CardDescription>
									Select exam session and filters to generate the dummy number report
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-6">
								{/* Institution & Exam Session - single row */}
								<div className={cn("grid gap-4", showInstitutionDropdown ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
									{/* Institution - shown for super_admin with "All Institutions" */}
									{showInstitutionDropdown && (
										<div className="space-y-2">
											<Label>
												Institution <span className="text-red-500">*</span>
											</Label>
											<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
												<PopoverTrigger asChild>
													<Button variant="outline" className="w-full justify-between font-normal">
														{selectedInstitutionId
															? (() => {
																const inst = institutions.find(i => i.id === selectedInstitutionId)
																return inst ? `${inst.institution_code} - ${inst.name}` : 'Select institution'
															})()
															: 'Select institution'}
														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[350px] p-0" align="start">
													<Command>
														<CommandInput placeholder="Search institution..." />
														<CommandList>
															<CommandEmpty>No institution found.</CommandEmpty>
															<CommandGroup>
																{institutions.map((inst) => (
																	<CommandItem
																		key={inst.id}
																		value={`${inst.institution_code} ${inst.name}`}
																		onSelect={() => {
																			setSelectedInstitutionId(inst.id)
																			setInstitutionOpen(false)
																		}}
																	>
																		<Check className={cn("mr-2 h-4 w-4", selectedInstitutionId === inst.id ? "opacity-100" : "opacity-0")} />
																		{inst.institution_code} - {inst.name}
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
									<div className="space-y-2">
										<Label>
											Examination Session <span className="text-red-500">*</span>
										</Label>
										<Select
											value={selectedSession}
											onValueChange={(v) => {
												setSelectedSession(v)
												setDummyNumbers([])
											}}
											disabled={!institutionId}
										>
										<SelectTrigger>
											<SelectValue placeholder={!institutionId ? 'Select institution first' : 'Select session'} />
										</SelectTrigger>
										<SelectContent>
											{sessions.map((session) => (
												<SelectItem key={session.id} value={session.id}>
													{session.session_name}{session.session_code !== session.session_name ? ` (${session.session_code})` : ''}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									</div>
								</div>

								{/* Board & Course Filters */}
								{selectedSession && (
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										{/* Board of Study - Searchable, sorted by board_order */}
										<div className="space-y-2">
											<Label>Board of Study</Label>
											<div className="flex gap-2">
												<Popover open={boardOpen} onOpenChange={(open) => { setBoardOpen(open); if (!open) setBoardSearch('') }}>
													<PopoverTrigger asChild>
														<Button variant="outline" className="flex-1 justify-between font-normal">
															{selectedBoard
																? (() => {
																	const b = filterBoards.find(b => b.board_code === selectedBoard)
																	return b ? `${b.board_code} - ${b.board_name}` : selectedBoard
																})()
																: 'All boards'}
															<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
														</Button>
													</PopoverTrigger>
													<PopoverContent className="w-[350px] p-0" align="start">
														<div className="p-2 border-b">
															<input
																type="text"
																placeholder="Search board..."
																value={boardSearch}
																onChange={(e) => setBoardSearch(e.target.value)}
																className="w-full px-2 py-1.5 text-sm border rounded-md outline-none focus:ring-1 focus:ring-ring"
															/>
														</div>
														<div className="max-h-60 overflow-y-auto p-1">
															{filteredBoards.length === 0 ? (
																<p className="text-sm text-muted-foreground p-2 text-center">No boards found.</p>
															) : (
																filteredBoards.map((board) => (
																	<button
																		key={board.board_code}
																		type="button"
																		className={cn(
																			"flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent text-left",
																			selectedBoard === board.board_code && "bg-accent"
																		)}
																		onClick={() => {
																			setSelectedBoard(selectedBoard === board.board_code ? '' : board.board_code)
																			setBoardOpen(false)
																			setBoardSearch('')
																		}}
																	>
																		<Check className={cn("h-4 w-4 shrink-0", selectedBoard === board.board_code ? "opacity-100" : "opacity-0")} />
																		{board.board_code} - {board.board_name}
																	</button>
																))
															)}
														</div>
													</PopoverContent>
												</Popover>
												{selectedBoard && (
													<Button
														variant="outline"
														size="sm"
														onClick={() => setSelectedBoard('')}
														className="px-2"
													>
														Clear
													</Button>
												)}
											</div>
										</div>

										{/* Course Multi-Select - Searchable, preserves sort order */}
										<div className="space-y-2">
											<Label>Course Code</Label>
											<div className="flex gap-2">
												<Popover onOpenChange={(open) => { if (!open) setCourseSearch('') }}>
													<PopoverTrigger asChild>
														<Button variant="outline" className="flex-1 justify-between font-normal">
															{selectedCourses.length === 0
																? 'All courses'
																: allCoursesSelected
																	? 'All courses selected'
																	: `${selectedCourses.length} course${selectedCourses.length > 1 ? 's' : ''} selected`}
															<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
														</Button>
													</PopoverTrigger>
													<PopoverContent className="w-[450px] p-0" align="start">
														<div className="p-2 border-b space-y-1">
															<input
																type="text"
																placeholder="Search course code or name..."
																value={courseSearch}
																onChange={(e) => setCourseSearch(e.target.value)}
																className="w-full px-2 py-1.5 text-sm border rounded-md outline-none focus:ring-1 focus:ring-ring"
															/>
															<button
																type="button"
																className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent font-medium"
																onClick={() => handleSelectAllCourses(!allCoursesSelected)}
															>
																<Check className={cn("h-4 w-4 shrink-0", allCoursesSelected ? "opacity-100" : "opacity-0")} />
																Select All ({courses.length})
															</button>
														</div>
														<div className="max-h-60 overflow-y-auto p-1">
															{filteredCourses.length === 0 ? (
																<p className="text-sm text-muted-foreground p-2 text-center">No courses found.</p>
															) : (
																filteredCourses.map((course) => (
																	<button
																		key={course.course_code}
																		type="button"
																		className={cn(
																			"flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent text-left",
																			selectedCourses.includes(course.course_code) && "bg-accent"
																		)}
																		onClick={() => {
																			setSelectedCourses(prev =>
																				prev.includes(course.course_code)
																					? prev.filter(c => c !== course.course_code)
																					: [...prev, course.course_code]
																			)
																		}}
																	>
																		<Check className={cn("h-4 w-4 shrink-0", selectedCourses.includes(course.course_code) ? "opacity-100" : "opacity-0")} />
																		<span className="truncate">{course.course_code} - {course.course_name}</span>
																	</button>
																))
															)}
														</div>
													</PopoverContent>
												</Popover>
												{selectedCourses.length > 0 && (
													<Button
														variant="outline"
														size="sm"
														onClick={() => setSelectedCourses([])}
														className="px-2"
													>
														<X className="h-4 w-4" />
													</Button>
												)}
											</div>
											{/* Selected course badges */}
											{selectedCourses.length > 0 && selectedCourses.length <= 10 && (
												<div className="flex flex-wrap gap-1 mt-1">
													{selectedCourses.map(code => (
														<Badge key={code} variant="secondary" className="text-xs">
															{code}
															<button
																type="button"
																title={`Remove ${code}`}
																className="ml-1 hover:text-destructive"
																onClick={() => setSelectedCourses(prev => prev.filter(c => c !== code))}
															>
																<X className="h-3 w-3" />
															</button>
														</Badge>
													))}
												</div>
											)}
										</div>
									</div>
								)}

								{/* Generate Report Button */}
								{institutionId && selectedSession && (
									<div className="flex flex-wrap gap-2">
										<Button
											onClick={fetchReport}
											disabled={loading || !institutionId || !selectedSession}
										>
											{loading ? (
												<>
													<Loader2 className="h-4 w-4 mr-2 animate-spin" />
													Loading...
												</>
											) : (
												<>
													<Search className="h-4 w-4 mr-2" />
													Generate Report
												</>
											)}
										</Button>

										{dummyNumbers.length > 0 && (
											<>
												<Button variant="outline" onClick={exportToPDF} disabled={exporting}>
													<FileText className="h-4 w-4 mr-2" />
													Export PDF
												</Button>
												<Button variant="outline" onClick={exportToExcel} disabled={exporting}>
													<Download className="h-4 w-4 mr-2" />
													Export Excel
												</Button>
											</>
										)}
									</div>
								)}
							</CardContent>
						</Card>

						{/* Results Table */}
						{dummyNumbers.length > 0 && (
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between">
										<div>
											<CardTitle>Report Data</CardTitle>
											<CardDescription>
												Total {dummyNumbers.length} dummy number records found
											</CardDescription>
										</div>
										<Badge variant="outline" className="text-sm">
											{dummyNumbers.length} records
										</Badge>
									</div>
								</CardHeader>
								<CardContent>
									<div className="rounded-md border overflow-auto max-h-[600px]">
										<Table>
											<TableHeader className="sticky top-0 bg-background z-10">
												<TableRow>
													<TableHead className="w-[60px] text-center">S.No</TableHead>
													<TableHead className="text-center">Dummy Number</TableHead>
													<TableHead className="text-center">Register Number</TableHead>
													<TableHead>Learner Name</TableHead>
													<TableHead className="text-center">Board</TableHead>
													<TableHead className="text-center">Course Code</TableHead>
													<TableHead className="text-center">Type</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{dummyNumbers.map((dn, idx) => (
													<TableRow key={dn.id}>
														<TableCell className="text-center">{idx + 1}</TableCell>
														<TableCell className="text-center font-mono">{dn.dummy_number}</TableCell>
														<TableCell className="text-center font-mono">{dn.actual_register_number}</TableCell>
														<TableCell>{dn.exam_registration?.student_name || '-'}</TableCell>
														<TableCell className="text-center">{dn.exam_registration?.course_offering?.course?.board_code || dn.exam_registration?.course_offering?.course?.board?.board_code || '-'}</TableCell>
														<TableCell className="text-center">{dn.exam_registration?.course_offering?.course?.course_code || '-'}</TableCell>
														<TableCell className="text-center">
															<Badge variant={dn.exam_registration?.is_regular ? 'default' : 'secondary'} className="text-xs">
																{dn.exam_registration?.is_regular ? 'Regular' : 'Arrear'}
															</Badge>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								</CardContent>
							</Card>
						)}

						{/* Empty state */}
						{!loading && dummyNumbers.length === 0 && selectedSession && !mustSelectInstitution && (
							<Card>
								<CardContent className="py-12 text-center text-muted-foreground">
									<FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
									<p>Click &quot;Generate Report&quot; to fetch dummy number data</p>
								</CardContent>
							</Card>
						)}
					</div>
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
