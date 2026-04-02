'use client'

import { useState, useEffect } from 'react'
import { useSessionSync } from '@/hooks/use-session-sync'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from "@/hooks/common/use-toast"
import { Shuffle, Hash, Trash2, Download, Eye, EyeOff, FileText, ChevronsUpDown, X } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'
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
					board_order: number
				}
			}
		}
	}
}

export default function DummyNumbersPage() {
	const { toast } = useToast()
	const { user } = useAuth()

	// Global institution filter - uses context from header dropdown
	const {
		isReady,
		institutionId,
		mustSelectInstitution,
	} = useInstitutionFilter()

	// Form state - removed local institution selection (uses global filter)
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const { selectedSessionId: selectedSession, setSelectedSessionId: setSelectedSession, mustSelectSession } = useSessionSync()
	const [sourceMode, setSourceMode] = useState<'attendance' | 'registration'>('attendance')
	const [generationMode, setGenerationMode] = useState<'sequence' | 'shuffle'>('sequence')
	const [dummyNumberFormat, setDummyNumberFormat] = useState('DN{N:4}')
	const [startFrom, setStartFrom] = useState('1')

	// Filter state - raw entries + pre-sorted lists from API
	const [filterEntries, setFilterEntries] = useState<{
		board_code: string | null
		program_code: string | null
		course_code: string | null
		course_category: string | null
	}[]>([])
	const [filterBoards, setFilterBoards] = useState<{ board_code: string; board_name: string; board_order: number }[]>([])
	const [allPrograms, setAllPrograms] = useState<{ program_code: string; program_name: string; program_order: number }[]>([])
	const [allCourses, setAllCourses] = useState<{ course_code: string; course_name: string; semester: number; course_order: number }[]>([])
	const [selectedBoard, setSelectedBoard] = useState('')
	const [selectedCourses, setSelectedCourses] = useState<string[]>([])
	const [selectedProgram, setSelectedProgram] = useState('')
	const [selectedCourseCategories, setSelectedCourseCategories] = useState<string[]>([])
	const [registrationCount, setRegistrationCount] = useState<number | null>(null)

	// Cascading: programs filtered by board (keep API sort order)
	const validProgramCodes = selectedBoard
		? new Set(filterEntries.filter(e => e.board_code === selectedBoard).map(e => e.program_code))
		: null
	const programs = validProgramCodes
		? allPrograms.filter(p => validProgramCodes.has(p.program_code))
		: allPrograms

	// Cascading: courses filtered by board + program + category (keep API sort order)
	const validCourseCodes = new Set(
		filterEntries
			.filter(e => {
				if (selectedBoard && e.board_code !== selectedBoard) return false
				if (selectedProgram && e.program_code !== selectedProgram) return false
				if (selectedCourseCategories.length > 0 && !selectedCourseCategories.includes(e.course_category || '')) return false
				return true
			})
			.map(e => e.course_code)
	)
	const courses = allCourses.filter(c => validCourseCodes.has(c.course_code))

	// Data state
	const [dummyNumbers, setDummyNumbers] = useState<DummyNumber[]>([])
	const [loading, setLoading] = useState(false)
	const [generating, setGenerating] = useState(false)
	const [previewing, setPreviewing] = useState(false)
	const [previewData, setPreviewData] = useState<{ count: number; students: any[] } | null>(null)
	const [showDeleteDialog, setShowDeleteDialog] = useState(false)
	const [hideActualNumbers, setHideActualNumbers] = useState(true)

	// Fetch institutions for display purposes (e.g., PDF export)
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
		}
	}, [isReady])

	// Fetch sessions when global institution filter changes
	useEffect(() => {
		if (isReady && institutionId) {
			fetchSessions()
		} else {
			setSessions([])
			setSelectedSession('')
		}
	}, [isReady, institutionId])

	// Fetch dummy numbers when institution, session, or filters change
	useEffect(() => {
		if (isReady && institutionId && selectedSession) {
			fetchDummyNumbers()
		} else {
			setDummyNumbers([])
		}
	}, [isReady, institutionId, selectedSession, selectedBoard, selectedCourses, selectedProgram])

	// Fetch filter entries when session changes
	useEffect(() => {
		if (isReady && institutionId && selectedSession) {
			fetchFilterOptions()
		} else {
			setFilterEntries([])
			setFilterBoards([])
			setAllPrograms([])
			setAllCourses([])
			setSelectedBoard('')
			setSelectedProgram('')
			setSelectedCourses([])
		}
	}, [isReady, institutionId, selectedSession])

	// Cascade: when board changes, reset program and courses
	useEffect(() => {
		setSelectedProgram('')
		setSelectedCourses([])
		setPreviewData(null)
	}, [selectedBoard])

	// Cascade: when program changes, reset courses
	useEffect(() => {
		setSelectedCourses([])
	}, [selectedProgram])

	// Fetch registration count when course filter changes
	useEffect(() => {
		if (selectedCourses.length > 0 && institutionId && selectedSession) {
			fetchRegistrationCount()
		} else {
			setRegistrationCount(null)
		}
	}, [selectedCourses, institutionId, selectedSession])

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
				`/api/utilities/dummy-numbers/filter-options?institutions_id=${institutionId}&examination_session_id=${selectedSession}`
			)
			if (res.ok) {
				const data = await res.json()
				setFilterEntries(data.entries || [])
				setFilterBoards(data.boards || [])
				setAllPrograms(data.programs || [])
				setAllCourses(data.courses || [])
			}
		} catch (error) {
			console.error('Error fetching filter options:', error)
		}
	}

	const fetchRegistrationCount = async () => {
		if (!institutionId || !selectedSession || selectedCourses.length === 0) return
		try {
			const params = new URLSearchParams({
				institutions_id: institutionId!,
				examination_session_id: selectedSession,
				course_code: selectedCourses.join(','),
			})
			if (selectedBoard) params.set('board_code', selectedBoard)
			if (selectedProgram) params.set('program_code', selectedProgram)

			const res = await fetch(`/api/utilities/dummy-numbers/registration-count?${params}`)
			if (res.ok) {
				const data = await res.json()
				setRegistrationCount(data.count ?? null)
			}
		} catch (error) {
			console.error('Error fetching registration count:', error)
		}
	}

	const fetchDummyNumbers = async () => {
		if (!institutionId) return
		try {
			setLoading(true)
			let url = `/api/utilities/dummy-numbers?institutions_id=${institutionId}&examination_session_id=${selectedSession}`

			if (selectedBoard) url += `&board_code=${selectedBoard}`
			if (selectedCourses.length > 0) url += `&course_code=${selectedCourses.join(',')}`
			if (selectedProgram) url += `&program_code=${selectedProgram}`

			const res = await fetch(url)
			if (res.ok) {
				const result = await res.json()
				setDummyNumbers(result.data || [])
			}
		} catch (error) {
			console.error('Error fetching dummy numbers:', error)
		} finally {
			setLoading(false)
		}
	}

	const handlePreview = async () => {
		if (!institutionId || !selectedSession) {
			toast({ title: '⚠️ Missing Information', description: 'Please select an institution and examination session', variant: 'destructive' })
			return
		}
		try {
			setPreviewing(true)
			setPreviewData(null)

			const payload: any = {
				institutions_id: institutionId,
				examination_session_id: selectedSession,
				source_mode: sourceMode,
				generation_mode: generationMode,
				dummy_number_format: dummyNumberFormat,
				start_from: parseInt(startFrom) || 1,
				preview_only: true,
			}
			if (selectedBoard) payload.board_code = selectedBoard
			if (selectedCourses.length > 0) payload.course_codes = selectedCourses
			if (selectedProgram) payload.program_code = selectedProgram
			if (selectedCourseCategories.length > 0) payload.course_categories = selectedCourseCategories

			const res = await fetch('/api/utilities/dummy-numbers/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			const result = await res.json()

			if (!res.ok) {
				throw new Error(result.error || 'Preview failed')
			}

			setPreviewData({ count: result.count, students: result.preview || [] })
			toast({
				title: '✅ Preview Ready',
				description: `Found ${result.count} students matching your criteria`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'Preview failed'
			toast({ title: '❌ Preview Failed', description: msg, variant: 'destructive' })
		} finally {
			setPreviewing(false)
		}
	}

	const exportPreviewToExcel = async () => {
		if (!previewData || previewData.students.length === 0) return

		const wsData = [
			['Roll No.', 'Dummy Number', 'Register No.', 'Student Name', 'Board', 'Program', 'Course', 'Type'],
			...previewData.students.map((s: any) => [
				s.roll,
				s.dummy_number,
				s.register_no,
				s.student_name,
				s.board,
				s.program,
				s.course,
				s.type,
			])
		]

		const wb = new ExcelJS.Workbook()
		const ws = wb.addWorksheet('Dummy Numbers Preview')
		ws.addRows(wsData)
		ws.columns = [
			{ width: 8 }, { width: 15 }, { width: 20 }, { width: 30 },
			{ width: 8 }, { width: 10 }, { width: 12 }, { width: 10 },
		]
		const buffer = await wb.xlsx.writeBuffer()
		const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `dummy-numbers-preview-${new Date().toISOString().split('T')[0]}.xlsx`
		a.click()
		URL.revokeObjectURL(url)

		toast({
			title: '✅ Excel Exported',
			description: `Exported ${previewData.students.length} students to Excel for review`,
			className: 'bg-green-50 border-green-200 text-green-800',
		})
	}

	const handleGenerate = async () => {
		if (!institutionId || !selectedSession) {
			toast({
				title: '⚠️ Missing Information',
				description: 'Please select an institution from the header and an examination session',
				variant: 'destructive',
			})
			return
		}

		if (!dummyNumberFormat.trim()) {
			toast({
				title: '⚠️ Missing Format',
				description: 'Please enter a dummy number format',
				variant: 'destructive',
			})
			return
		}

		const startNumber = parseInt(startFrom)
		if (isNaN(startNumber) || startNumber < 1) {
			toast({
				title: '⚠️ Invalid Start Number',
				description: 'Please enter a valid starting number (minimum 1)',
				variant: 'destructive',
			})
			return
		}

		try {
			setGenerating(true)

			const payload: any = {
				institutions_id: institutionId,
				examination_session_id: selectedSession,
				source_mode: sourceMode,
				generation_mode: generationMode,
				dummy_number_format: dummyNumberFormat,
				start_from: startNumber,
				generated_by: user?.id || null,
			}

			// Add filters if selected
			if (selectedBoard) payload.board_code = selectedBoard
			if (selectedCourses.length > 0) payload.course_codes = selectedCourses
			if (selectedProgram) payload.program_code = selectedProgram
			if (selectedCourseCategories.length > 0) payload.course_categories = selectedCourseCategories

			const res = await fetch('/api/utilities/dummy-numbers/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			const result = await res.json()

			if (!res.ok) {
				throw new Error(result.error || 'Failed to generate dummy numbers')
			}

			toast({
				title: '✅ Generation Complete',
				description: `Successfully generated ${result.count} dummy numbers`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
			})

			// Clear preview and refresh the data
			setPreviewData(null)
			fetchDummyNumbers()
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to generate dummy numbers'
			toast({
				title: '❌ Generation Failed',
				description: errorMessage,
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		} finally {
			setGenerating(false)
		}
	}

	const handleDeleteAll = async () => {
		if (!institutionId || !selectedSession) {
			return
		}

		try {
			setLoading(true)

			const res = await fetch(
				`/api/utilities/dummy-numbers?institutions_id=${institutionId}&examination_session_id=${selectedSession}`,
				{ method: 'DELETE' }
			)

			const result = await res.json()

			if (!res.ok) {
				throw new Error(result.error || 'Failed to delete dummy numbers')
			}

			toast({
				title: '✅ Deleted Successfully',
				description: result.message,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
			})

			setDummyNumbers([])
			setShowDeleteDialog(false)
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to delete dummy numbers'
			toast({
				title: '❌ Deletion Failed',
				description: errorMessage,
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	const exportToExcel = async () => {
		if (dummyNumbers.length === 0) {
			toast({
				title: '⚠️ No Data',
				description: 'No dummy numbers to export',
				variant: 'destructive',
			})
			return
		}

		const ExcelJS = await import('exceljs')
		const workbook = new ExcelJS.default.Workbook()
		const worksheet = workbook.addWorksheet('Dummy Numbers')

		const headers = [
			'Roll No.',
			'Dummy Number',
			'Actual Register Number',
			'Student Name',
			'Board',
			'Program',
			'Course',
			'Type',
		]

		const baseFont = { name: 'Times New Roman', size: 12 }

		// Add header row
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
		})

		// Add data rows
		dummyNumbers.forEach((dn) => {
			const row = worksheet.addRow([
				dn.roll_number_for_evaluation,
				dn.dummy_number,
				dn.actual_register_number,
				dn.exam_registration?.student_name || '',
				dn.exam_registration?.course_offering?.course?.board?.board_code || '',
				dn.exam_registration?.course_offering?.program_code || '',
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
		worksheet.columns.forEach((column, index) => {
			let maxLength = headers[index].length
			dummyNumbers.forEach((dn) => {
				const values = [
					dn.roll_number_for_evaluation,
					dn.dummy_number,
					dn.actual_register_number,
					dn.exam_registration?.student_name || '',
					dn.exam_registration?.course_offering?.course?.board?.board_code || '',
					dn.exam_registration?.course_offering?.program_code || '',
					dn.exam_registration?.course_offering?.course?.course_code || '',
					dn.exam_registration?.is_regular ? 'Regular' : 'Arrear',
				]
				maxLength = Math.max(maxLength, String(values[index] || '').length)
			})
			column.width = Math.min(maxLength + 4, 50)
		})

		const buffer = await workbook.xlsx.writeBuffer()
		const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
		const url = window.URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `dummy-numbers-${selectedSession}-${new Date().toISOString().split('T')[0]}.xlsx`
		a.click()
		window.URL.revokeObjectURL(url)

		toast({
			title: '✅ Export Complete',
			description: `Exported ${dummyNumbers.length} dummy numbers to Excel`,
			className: 'bg-green-50 border-green-200 text-green-800',
		})
	}

	const exportToPDF = () => {
		if (dummyNumbers.length === 0) {
			toast({
				title: '⚠️ No Data',
				description: 'No dummy numbers to export',
				variant: 'destructive',
			})
			return
		}

		// Get institution and session names
		const institution = institutions.find((i) => i.id === institutionId)
		const session = sessions.find((s) => s.id === selectedSession)

		const doc = new jsPDF('landscape')

		// Add title
		doc.setFontSize(16)
		doc.text('Dummy Number Generation Report', 14, 15)

		// Add institution and session info
		doc.setFontSize(10)
		doc.text(`Institution: ${institution?.name || 'N/A'}`, 14, 22)
		doc.text(`Session: ${session?.session_name || 'N/A'}`, 14, 28)
		doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 34)
		doc.text(`Total Students: ${dummyNumbers.length}`, 14, 40)

		// Prepare table data
		const headers = [
			['Roll No.', 'Dummy Number', 'Actual Register No.', 'Student Name', 'Board', 'Program', 'Course', 'Type']
		]

		const rows = dummyNumbers.map((dn) => [
			dn.roll_number_for_evaluation,
			dn.dummy_number,
			hideActualNumbers ? '••••••••' : dn.actual_register_number,
			dn.exam_registration?.student_name || '',
			dn.exam_registration?.course_offering?.course?.board?.board_code || '-',
			dn.exam_registration?.course_offering?.program_code || '-',
			dn.exam_registration?.course_offering?.course?.course_code || '-',
			dn.exam_registration?.is_regular ? 'Regular' : 'Arrear',
		])

		// Generate table
		autoTable(doc, {
			head: headers,
			body: rows,
			startY: 45,
			theme: 'grid',
			styles: {
				fontSize: 8,
				cellPadding: 2,
			},
			headStyles: {
				fillColor: [22, 163, 74], // Green color matching the theme
				textColor: 255,
				fontStyle: 'bold',
			},
			alternateRowStyles: {
				fillColor: [249, 250, 251],
			},
			columnStyles: {
				0: { cellWidth: 20 },  // Roll No.
				1: { cellWidth: 30 },  // Dummy Number
				2: { cellWidth: 35 },  // Actual Register No.
				3: { cellWidth: 50 },  // Student Name
				4: { cellWidth: 30 },  // Board
				5: { cellWidth: 30 },  // Program
				6: { cellWidth: 30 },  // Course
				7: { cellWidth: 25 },  // Type
			},
		})

		// Save PDF
		doc.save(`dummy-numbers-${session?.session_code || 'report'}-${new Date().toISOString().split('T')[0]}.pdf`)

		toast({
			title: '✅ PDF Export Complete',
			description: `Exported ${dummyNumbers.length} dummy numbers to PDF`,
			className: 'bg-green-50 border-green-200 text-green-800',
		})
	}

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
									<Link href="/utilities">Utilities</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Dummy Numbers</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					<div className="space-y-6">
					{/* Header */}
					<div>
						<h1 className="text-3xl font-bold text-heading">Dummy Number Generation</h1>
						<p className="text-muted-foreground mt-2">
							Generate anonymous dummy numbers for students appearing in examinations
						</p>
					</div>

			{/* Configuration Card */}
			<Card>
				<CardHeader>
					<CardTitle>Configuration</CardTitle>
					<CardDescription>
						Select session and configure dummy number generation settings
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* Show message when super_admin has "All Institutions" selected */}
					{mustSelectInstitution && (
						<div className="p-4 border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 rounded-lg">
							<p className="text-sm text-amber-800 dark:text-amber-200">
								Please select a specific institution from the header dropdown to generate dummy numbers.
							</p>
						</div>
					)}

					{/* Session Selection - only show when institution is selected and no global session */}
					{!mustSelectInstitution && mustSelectSession && (
						<div className="space-y-2">
							<Label htmlFor="session">
								Examination Session <span className="text-red-500">*</span>
							</Label>
							<Select
								value={selectedSession}
								onValueChange={setSelectedSession}
								disabled={!institutionId}
							>
								<SelectTrigger>
									<SelectValue placeholder={!institutionId ? "Select institution first" : "Select session"} />
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
					)}

					{/* Filter Options */}
					{institutionId && selectedSession && (
						<div className="space-y-4">
							<div>
								<Label className="text-sm font-semibold">Filter Options (Optional)</Label>
								<p className="text-xs text-muted-foreground">
									Apply filters to generate dummy numbers for specific boards, courses, or programs only
								</p>
							</div>

							{/* Course Category */}
							<div className="space-y-2">
								<Label>Course Category</Label>
								<div className="flex flex-wrap gap-4">
									{['Theory', 'Practical', 'Project', 'Field Work'].map((cat) => (
										<label key={cat} className="flex items-center gap-2 cursor-pointer">
											<Checkbox
												checked={selectedCourseCategories.includes(cat)}
												onCheckedChange={(checked) => {
													setSelectedCourseCategories(prev =>
														checked
															? [...prev, cat]
															: prev.filter(c => c !== cat)
													)
													setSelectedCourses([])
													setPreviewData(null)
												}}
											/>
											<span className="text-sm">{cat}</span>
										</label>
									))}
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								{/* 1. Board of Study */}
								<div className="space-y-2">
									<Label htmlFor="board">Board of Study</Label>
									<div className="flex gap-2">
										<Select value={selectedBoard || undefined} onValueChange={setSelectedBoard}>
											<SelectTrigger className="flex-1">
												<SelectValue placeholder="All boards" />
											</SelectTrigger>
											<SelectContent>
												{filterBoards.map((board) => (
													<SelectItem key={board.board_code} value={board.board_code}>
														{board.board_code} - {board.board_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
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

								{/* 2. Program (filtered by board) */}
								<div className="space-y-2">
									<Label htmlFor="program">Program</Label>
									<div className="flex gap-2">
										<Select value={selectedProgram || undefined} onValueChange={setSelectedProgram}>
											<SelectTrigger className="flex-1">
												<SelectValue placeholder="All programs" />
											</SelectTrigger>
											<SelectContent>
												{programs.map((program) => (
													<SelectItem key={program.program_code} value={program.program_code}>
														{program.program_code} - {program.program_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{selectedProgram && (
											<Button
												variant="outline"
												size="sm"
												onClick={() => setSelectedProgram('')}
												className="px-2"
											>
												Clear
											</Button>
										)}
									</div>
								</div>

								{/* 3. Course (filtered by board + program) */}
								<div className="space-y-2">
									<Label htmlFor="course">Course</Label>
									<div className="flex gap-2">
										<Popover>
											<PopoverTrigger asChild>
												<Button variant="outline" className="flex-1 justify-between font-normal">
													{selectedCourses.length === 0
														? 'All courses'
														: `${selectedCourses.length} course${selectedCourses.length > 1 ? 's' : ''} selected`}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[400px] p-0" align="start">
												<div className="max-h-60 overflow-y-auto p-2 space-y-1">
													{courses.length === 0 ? (
														<p className="text-sm text-muted-foreground p-2">No courses available</p>
													) : (
														courses.map((course) => (
															<label
																key={course.course_code}
																className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent"
															>
																<Checkbox
																	checked={selectedCourses.includes(course.course_code)}
																	onCheckedChange={(checked) => {
																		setSelectedCourses(prev =>
																			checked
																				? [...prev, course.course_code]
																				: prev.filter(c => c !== course.course_code)
																		)
																	}}
																/>
																<span className="truncate">{course.course_code} - {course.course_name}</span>
															</label>
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
									{selectedCourses.length > 0 && (
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
							{/* Registration count when courses are selected */}
							{selectedCourses.length > 0 && registrationCount !== null && (
								<div className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
									<span className="text-sm text-blue-700 dark:text-blue-300">Total Registrations:</span>
									<span className="text-lg font-bold text-blue-900 dark:text-blue-100">{registrationCount}</span>
								</div>
							)}
						</div>
					)}

					{/* Source Mode & Generation Mode - side by side */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div className="space-y-2">
							<Label>Source Mode</Label>
							<RadioGroup value={sourceMode} onValueChange={(v) => setSourceMode(v as any)}>
								<div className="flex items-center space-x-2">
									<RadioGroupItem value="attendance" id="attendance" />
									<Label htmlFor="attendance" className="font-normal cursor-pointer">
										Attendance Based (Present Students Only)
									</Label>
								</div>
								<div className="flex items-center space-x-2">
									<RadioGroupItem value="registration" id="registration" />
									<Label htmlFor="registration" className="font-normal cursor-pointer">
										Registration Based (All Approved Students)
									</Label>
								</div>
							</RadioGroup>
						</div>

						<div className="space-y-2">
							<Label>Generation Mode</Label>
							<RadioGroup value={generationMode} onValueChange={(v) => setGenerationMode(v as any)}>
								<div className="flex items-center space-x-2">
									<RadioGroupItem value="sequence" id="sequence" />
									<Label htmlFor="sequence" className="font-normal cursor-pointer flex items-center gap-2">
										<Hash className="h-4 w-4" />
										Sequential (Ordered by board → program → course → type)
									</Label>
								</div>
								<div className="flex items-center space-x-2">
									<RadioGroupItem value="shuffle" id="shuffle" />
									<Label htmlFor="shuffle" className="font-normal cursor-pointer flex items-center gap-2">
										<Shuffle className="h-4 w-4" />
										Shuffle (Randomized order)
									</Label>
							</div>
						</RadioGroup>
						</div>
					</div>

					{/* Format & Starting Number */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="format">
								Dummy Number Format <span className="text-red-500">*</span>
							</Label>
							<Input
								id="format"
								value={dummyNumberFormat}
								onChange={(e) => setDummyNumberFormat(e.target.value)}
								placeholder="DN{N:4}"
							/>
							<p className="text-xs text-muted-foreground">
								Use {'{N:4}'} for 4-digit padding. Example: DN{'{N:4}'} → DN0001, DN0002, ...
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="startFrom">
								Start From <span className="text-red-500">*</span>
							</Label>
							<Input
								id="startFrom"
								type="number"
								min="1"
								value={startFrom}
								onChange={(e) => setStartFrom(e.target.value)}
								placeholder="1"
							/>
							<p className="text-xs text-muted-foreground">Starting number for dummy number sequence</p>
						</div>
					</div>

					{/* Preview & Generate Buttons */}
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							onClick={handlePreview}
							disabled={previewing || generating || !institutionId || !selectedSession || mustSelectInstitution}
						>
							{previewing ? 'Loading Preview...' : 'Preview'}
						</Button>

						{previewData && (
							<Button
								onClick={handleGenerate}
								disabled={generating || !institutionId || !selectedSession || mustSelectInstitution}
							>
								{generating ? 'Generating...' : `Generate ${previewData.count} Dummy Numbers`}
							</Button>
						)}

						{dummyNumbers.length > 0 && (
							<>
								<Button variant="outline" onClick={exportToExcel}>
									<Download className="h-4 w-4 mr-2" />
									Export Excel
								</Button>
								<Button variant="outline" onClick={exportToPDF}>
									<FileText className="h-4 w-4 mr-2" />
									Export PDF
								</Button>
								<Button
									variant="outline"
									onClick={() => setHideActualNumbers(!hideActualNumbers)}
								>
									{hideActualNumbers ? (
										<>
											<Eye className="h-4 w-4 mr-2" />
											Show Register Numbers
										</>
									) : (
										<>
											<EyeOff className="h-4 w-4 mr-2" />
											Hide Register Numbers
										</>
									)}
								</Button>
								<Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
									<Trash2 className="h-4 w-4 mr-2" />
									Delete All
								</Button>
							</>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Preview Table */}
			{previewData && previewData.students.length > 0 && (
				<Card className="border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-900/10">
					<CardHeader>
						<div className="flex items-center justify-between">
							<div>
								<CardTitle className="text-blue-900 dark:text-blue-100">
									Preview ({previewData.count} students)
								</CardTitle>
								<CardDescription>
									{previewData.count > 50
										? `Showing first 50 of ${previewData.count} students. Download Excel to review all.`
										: 'Review the data below and click "Generate" to confirm.'}
								</CardDescription>
							</div>
							<Button variant="outline" onClick={exportPreviewToExcel} className="border-blue-300 text-blue-700 hover:bg-blue-100">
								<Download className="h-4 w-4 mr-2" />
								Download Excel Preview
							</Button>
						</div>
					</CardHeader>
					<CardContent>
						<div className="border rounded-lg overflow-hidden">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-16">Roll</TableHead>
										<TableHead>Dummy No.</TableHead>
										<TableHead>Register No.</TableHead>
										<TableHead>Student Name</TableHead>
										<TableHead>Board</TableHead>
										<TableHead>Program</TableHead>
										<TableHead>Course</TableHead>
										<TableHead>Type</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{previewData.students.slice(0, 50).map((s: any, i: number) => (
										<TableRow key={i}>
											<TableCell className="font-medium">{s.roll}</TableCell>
											<TableCell className="font-mono font-semibold">{s.dummy_number}</TableCell>
											<TableCell className="font-mono">{s.register_no}</TableCell>
											<TableCell>{s.student_name}</TableCell>
											<TableCell>{s.board}</TableCell>
											<TableCell>{s.program}</TableCell>
											<TableCell>{s.course}</TableCell>
											<TableCell>
												<Badge variant={s.type === 'Regular' ? 'default' : 'secondary'}>
													{s.type}
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

			{/* Data Table */}
			{institutionId && selectedSession && !mustSelectInstitution && (
				<Card>
					<CardHeader>
						<CardTitle>Generated Dummy Numbers ({dummyNumbers.length})</CardTitle>
						<CardDescription>
							{dummyNumbers.length > 0
								? 'List of generated dummy numbers for the selected session'
								: 'No dummy numbers generated yet'}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{loading ? (
							<div className="text-center py-8 text-muted-foreground">Loading...</div>
						) : dummyNumbers.length === 0 ? (
							<div className="text-center py-8 text-muted-foreground">
								No dummy numbers found. Click "Generate Dummy Numbers" to create them.
							</div>
						) : (
							<div className="border rounded-lg overflow-hidden">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-20">Roll No.</TableHead>
											<TableHead>Dummy Number</TableHead>
											<TableHead>Actual Register No.</TableHead>
											<TableHead>Student Name</TableHead>
											<TableHead>Board</TableHead>
											<TableHead>Program</TableHead>
											<TableHead>Course</TableHead>
											<TableHead>Type</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{dummyNumbers.map((dn) => (
											<TableRow key={dn.id}>
												<TableCell className="font-medium">
													{dn.roll_number_for_evaluation}
												</TableCell>
												<TableCell className="font-mono font-semibold">
													{dn.dummy_number}
												</TableCell>
												<TableCell className="font-mono">
													{hideActualNumbers ? '••••••••' : dn.actual_register_number}
												</TableCell>
												<TableCell>
													{dn.exam_registration?.student_name || '-'}
												</TableCell>
												<TableCell>{dn.exam_registration?.course_offering?.course?.board?.board_code || '-'}</TableCell>
												<TableCell>
													{dn.exam_registration?.course_offering?.program_code || '-'}
												</TableCell>
												<TableCell>
													{dn.exam_registration?.course_offering?.course?.course_code || '-'}
												</TableCell>
												<TableCell>
													<Badge variant={dn.exam_registration?.is_regular ? 'default' : 'secondary'}>
														{dn.exam_registration?.is_regular ? 'Regular' : 'Arrear'}
													</Badge>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						)}
					</CardContent>
				</Card>
			)}

					{/* Delete Confirmation Dialog */}
					<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Are you sure?</AlertDialogTitle>
								<AlertDialogDescription>
									This will delete all {dummyNumbers.length} dummy numbers for the selected institution and
									session. This action cannot be undone.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction onClick={handleDeleteAll} className="bg-red-600 hover:bg-red-700">
									Delete All
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
					</div>
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
