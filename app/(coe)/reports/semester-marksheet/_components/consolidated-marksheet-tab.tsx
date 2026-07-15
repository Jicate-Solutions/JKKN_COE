'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/common/use-toast'
import { Loader2, ListChecks, Check, ChevronsUpDown, GraduationCap, Download, Users, AlertTriangle, Copy, ExternalLink, FileSpreadsheet } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useMyJKKNInstitutionFilter } from '@/hooks/use-myjkkn-institution-filter'
import { downloadConsolidatedMarksheetPDF, downloadMergedConsolidatedMarksheetPDF, fetchImageAsBase64, type ConsolidatedStudentMarksheetData } from '@/lib/utils/generate-consolidated-marksheet-pdf'
import { PDFProgressModal } from '@/components/ui/pdf-progress-modal'

// =====================================================
// TYPE DEFINITIONS
// =====================================================

interface Institution {
	id: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids?: string[] | null
}

interface Program {
	program_code: string
	program_name: string
}

interface Student {
	id: string
	registerNo: string
	name: string
}

interface ConsolidatedCourseResult {
	courseCode: string
	courseName: string
	part: string
	partDescription?: string
	semester: number
	semesterCode?: string
	courseOrder: number
	credits: number
	eseMax: number
	ciaMax: number
	totalMax: number
	eseMarks: number
	ciaMarks: number
	totalMarks: number
	percentage: number
	gradePoint: number
	letterGrade: string
	creditPoints: number
	isPassing: boolean
	result: string
}

interface ConsolidatedPartBreakdown {
	partName: string
	partDescription: string
	courses: ConsolidatedCourseResult[]
	totalCredits: number
	totalCreditPoints: number
	partCGPA: number
	creditsEarned: number
	classification: string
}

interface ConsolidatedMarksheetData {
	student: {
		id: string
		name: string
		registerNo: string
		dateOfBirth?: string
		photoUrl?: string
		firstName?: string
		lastName?: string
		fatherName?: string
		motherName?: string
		gender?: string
	}
	program: {
		code: string
		name: string
		isPG?: boolean
	}
	lastAppearance: {
		sessionId: string
		sessionName: string
		monthYear: string
		month: string
		year: string
	}
	courses: ConsolidatedCourseResult[]
	partBreakdown: ConsolidatedPartBreakdown[]
	summary: {
		totalCourses: number
		totalCredits: number
		creditsEarned: number
		totalCreditPoints: number
		cgpa: number
		overallResult: string
		classification: string
		formattedFolio?: string
	}
}

// Part order map for deterministic sort (UG: I-V, PG: A-B)
const PART_ORDER: Record<string, number> = {
	'Part I': 1,
	'Part II': 2,
	'Part III': 3,
	'Part IV': 4,
	'Part V': 5,
	'Part A': 6,
	'Part B': 7
}

// Display label for the PART column in the summary table
function partDisplayLabel(partName: string, isPG: boolean): string {
	if (isPG) {
		// PG learners use Part A / Part B — show just the letter
		if (partName === 'Part A') return 'A'
		if (partName === 'Part B') return 'B'
		return '-'
	}
	// UG learners use Part I-V — show roman numeral
	return partName.replace('Part ', '')
}

interface IneligibleInfo {
	failedCount: number
	failedCourses: {
		courseCode: string
		courseName: string
		semester: number
		part: string
		totalMarks: number
		totalMax: number
		result: string
	}[]
	student?: { id: string; name: string; registerNo: string }
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function ConsolidatedMarksheetTab() {
	const { toast } = useToast()

	// Institution filter hook
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId
	} = useInstitutionFilter()

	// MyJKKN data fetching hook
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [students, setStudents] = useState<Student[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('')
	const [selectedProgramCode, setSelectedProgramCode] = useState<string>('')
	const [selectedStudentId, setSelectedStudentId] = useState<string>('')

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [loadingMarksheet, setLoadingMarksheet] = useState(false)
	const [generatingPDF, setGeneratingPDF] = useState(false)
	const [generatingBatchPDF, setGeneratingBatchPDF] = useState(false)
	const [exportingExcel, setExportingExcel] = useState(false)

	// Progress tracking for PDF generation
	const [pdfProgress, setPdfProgress] = useState({
		isOpen: false,
		currentStep: 0,
		totalSteps: 0,
		currentOperation: '',
		operationType: 'single' as 'single' | 'batch'
	})

	// Popover open states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [studentOpen, setStudentOpen] = useState(false)

	// Marksheet data
	const [marksheetData, setMarksheetData] = useState<ConsolidatedMarksheetData | null>(null)

	// Ineligibility state (set when API returns 422)
	const [ineligibleInfo, setIneligibleInfo] = useState<IneligibleInfo | null>(null)

	// =====================================================
	// DATA FETCHING
	// =====================================================

	// Load institutions when context is ready
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
		}
	}, [isReady])

	// Auto-select institution from context
	useEffect(() => {
		if (isReady && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, contextInstitutionId, selectedInstitutionId])

	const fetchInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/exam-management/exam-attendance/dropdowns?type=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)

				if (data.length === 1) {
					setSelectedInstitutionId(data[0].id)
				} else if (shouldFilter && contextInstitutionId) {
					setSelectedInstitutionId(contextInstitutionId)
				} else if (!mustSelectInstitution && contextInstitutionId) {
					setSelectedInstitutionId(contextInstitutionId)
				}
			}
		} catch (error) {
			console.error('[Consolidated Marksheet] Error fetching institutions:', error)
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, shouldFilter, mustSelectInstitution, contextInstitutionId])

	const fetchPrograms = useCallback(async (institutionId: string) => {
		try {
			setLoadingPrograms(true)
			setPrograms([])

			const institution = institutions.find(i => i.id === institutionId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			console.log('[Consolidated Marksheet] Fetching programs for institution:', institution?.institution_code, 'myjkknIds:', myjkknIds)

			if (myjkknIds.length === 0) {
				console.warn('[Consolidated Marksheet] No MyJKKN institution IDs found for institution:', institutionId)
				setPrograms([])
				return
			}

			const progs = await fetchMyJKKNPrograms(myjkknIds)
			console.log('[Consolidated Marksheet] Programs from MyJKKN:', progs.length)

			const mappedPrograms: Program[] = progs.map((p: any) => ({
				program_code: p.program_code,
				program_name: p.program_name
			}))

			setPrograms(mappedPrograms)
		} catch (error) {
			console.error('[Consolidated Marksheet] Error fetching programs:', error)
			setPrograms([])
		} finally {
			setLoadingPrograms(false)
		}
	}, [institutions, fetchMyJKKNPrograms])

	// Institution -> Programs
	useEffect(() => {
		if (selectedInstitutionId && institutions.length > 0) {
			setSelectedProgramCode('')
			setSelectedStudentId('')
			setPrograms([])
			setStudents([])
			setMarksheetData(null)
			fetchPrograms(selectedInstitutionId)
		}
	}, [selectedInstitutionId, institutions.length, fetchPrograms])

	const fetchStudents = useCallback(async (institutionId: string, programCode: string) => {
		try {
			setLoadingStudents(true)
			setStudents([])
			const url = `/api/reports/consolidated-marksheet?action=students&institutionId=${institutionId}&programCode=${programCode}`
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setStudents(data.students || [])
			} else {
				const error = await res.json()
				toast({
					title: '❌ Error',
					description: error.error || 'Failed to load learners',
					variant: 'destructive'
				})
			}
		} catch (error) {
			console.error('[Consolidated Marksheet] Error fetching students:', error)
			toast({
				title: '❌ Error',
				description: 'Failed to load learners',
				variant: 'destructive'
			})
		} finally {
			setLoadingStudents(false)
		}
	}, [toast])

	// Program -> Students
	useEffect(() => {
		if (selectedInstitutionId && selectedProgramCode) {
			setSelectedStudentId('')
			setStudents([])
			setMarksheetData(null)
			fetchStudents(selectedInstitutionId, selectedProgramCode)
		}
	}, [selectedProgramCode, selectedInstitutionId, fetchStudents])

	// Student -> Marksheet
	useEffect(() => {
		if (selectedStudentId) {
			fetchMarksheet()
		} else {
			setMarksheetData(null)
			setIneligibleInfo(null)
		}
	}, [selectedStudentId])

	const fetchMarksheet = async () => {
		if (!selectedStudentId || !selectedInstitutionId || !selectedProgramCode) return

		try {
			setLoadingMarksheet(true)
			setIneligibleInfo(null)
			setMarksheetData(null)
			const url = `/api/reports/consolidated-marksheet?action=student-marksheet&studentId=${selectedStudentId}&institutionId=${selectedInstitutionId}&programCode=${selectedProgramCode}`
			const res = await fetch(url)
			const data = await res.json()
			if (res.ok) {
				setMarksheetData(data)
			} else if (res.status === 422 && data?.eligible === false) {
				// Learner has backlogs — show dedicated ineligibility card
				setIneligibleInfo({
					failedCount: data.failedCount || 0,
					failedCourses: data.failedCourses || [],
					student: data.student
				})
			} else {
				toast({
					title: '❌ Error',
					description: data?.error || 'Failed to load consolidated marksheet',
					variant: 'destructive'
				})
			}
		} catch (error) {
			console.error('[Consolidated Marksheet] Error fetching marksheet:', error)
			toast({
				title: '❌ Error',
				description: 'Failed to load consolidated marksheet',
				variant: 'destructive'
			})
		} finally {
			setLoadingMarksheet(false)
		}
	}

	// =====================================================
	// PDF GENERATION (STUBS — PDF util module TBD)
	// =====================================================

	const handleDownloadPDF = async (withHeader: boolean = false) => {
		if (!marksheetData) return

		try {
			setGeneratingPDF(true)

			const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)

			const totalSteps = 4
			setPdfProgress({
				isOpen: true,
				currentStep: 0,
				totalSteps,
				currentOperation: 'Loading learner photo...',
				operationType: 'single'
			})

			let photoBase64: string | null = null
			if (marksheetData.student.photoUrl) {
				photoBase64 = await fetchImageAsBase64(marksheetData.student.photoUrl)
			}

			setPdfProgress(prev => ({
				...prev,
				currentStep: 1,
				currentOperation: 'Loading institution logo...'
			}))

			let logoBase64: string | undefined = undefined
			if (withHeader) {
				try {
					const logoResponse = await fetch('/jkkn_logo.png')
					if (logoResponse.ok) {
						const blob = await logoResponse.blob()
						logoBase64 = await new Promise<string>((resolve) => {
							const reader = new FileReader()
							reader.onloadend = () => resolve(reader.result as string)
							reader.readAsDataURL(blob)
						})
					}
				} catch (e) {
					console.warn('Logo not loaded:', e)
				}
			}

			setPdfProgress(prev => ({
				...prev,
				currentStep: 2,
				currentOperation: 'Preparing marksheet data...'
			}))

			const pdfData: ConsolidatedStudentMarksheetData = {
				student: {
					...marksheetData.student,
					photoUrl: photoBase64 || undefined
				},
				program: marksheetData.program,
				lastAppearance: marksheetData.lastAppearance,
				institution: selectedInstitution ? {
					name: selectedInstitution.institution_name,
					code: selectedInstitution.institution_code
				} : undefined,
				courses: marksheetData.courses,
				partBreakdown: marksheetData.partBreakdown,
				summary: marksheetData.summary,
				logoImage: logoBase64,
				generatedDate: new Date().toLocaleDateString('en-IN', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric'
				})
			}

			setPdfProgress(prev => ({
				...prev,
				currentStep: 3,
				currentOperation: 'Generating PDF document...'
			}))

			const suffix = withHeader ? '_with_header' : ''
			downloadConsolidatedMarksheetPDF(
				pdfData,
				`Consolidated_${marksheetData.student.registerNo}${suffix}.pdf`,
				{ showHeader: withHeader }
			)

			setPdfProgress(prev => ({
				...prev,
				currentStep: totalSteps,
				currentOperation: 'PDF generated successfully!'
			}))

			setTimeout(() => {
				setPdfProgress(prev => ({ ...prev, isOpen: false }))
			}, 1500)

			toast({
				title: '✅ PDF Downloaded',
				description: withHeader
					? 'Consolidated marksheet PDF (with header) has been downloaded'
					: 'Consolidated marksheet PDF has been downloaded',
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (error) {
			console.error('[Consolidated Marksheet] Error generating PDF:', error)
			setPdfProgress(prev => ({ ...prev, isOpen: false }))
			toast({
				title: '❌ Error',
				description: 'Failed to generate PDF',
				variant: 'destructive'
			})
		} finally {
			setGeneratingPDF(false)
		}
	}

	const handleBatchDownload = async (withHeader: boolean = false) => {
		if (!selectedInstitutionId || !selectedProgramCode) {
			toast({
				title: '❌ Missing Filters',
				description: 'Please select institution and program',
				variant: 'destructive'
			})
			return
		}

		if (students.length === 0) {
			toast({
				title: '❌ No Learners',
				description: 'No learners found for the selected filters',
				variant: 'destructive'
			})
			return
		}

		try {
			setGeneratingBatchPDF(true)

			const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)

			setPdfProgress({
				isOpen: true,
				currentStep: 0,
				totalSteps: 4,
				currentOperation: 'Fetching consolidated marksheet data...',
				operationType: 'batch'
			})

			const url = `/api/reports/consolidated-marksheet?action=batch-marksheet&institutionId=${selectedInstitutionId}&programCode=${selectedProgramCode}`
			const res = await fetch(url)

			if (!res.ok) {
				const error = await res.json()
				throw new Error(error.error || 'Failed to fetch batch data')
			}

			const batchData = await res.json()
			const marksheets = batchData.marksheets || []

			if (marksheets.length === 0) {
				setPdfProgress(prev => ({ ...prev, isOpen: false }))
				toast({
					title: '❌ No Data',
					description: 'No consolidated marksheet data available for the selected filters',
					variant: 'destructive'
				})
				return
			}

			const totalSteps = students.length + 3
			setPdfProgress(prev => ({
				...prev,
				currentStep: 1,
				totalSteps,
				currentOperation: `Loading learner photos (0/${marksheets.length})...`
			}))

			const photoBase64Array: (string | null)[] = []
			for (let i = 0; i < marksheets.length; i++) {
				const data = marksheets[i]
				if (data.student.photoUrl) {
					const photo = await fetchImageAsBase64(data.student.photoUrl)
					photoBase64Array.push(photo)
				} else {
					photoBase64Array.push(null)
				}

				setPdfProgress(prev => ({
					...prev,
					currentStep: 1 + i + 1,
					currentOperation: `Loading learner photos (${i + 1}/${marksheets.length})...`
				}))
			}

			setPdfProgress(prev => ({
				...prev,
				currentStep: 1 + marksheets.length,
				currentOperation: 'Loading institution logo...'
			}))

			let logoBase64: string | undefined = undefined
			if (withHeader) {
				try {
					const logoResponse = await fetch('/jkkn_logo.png')
					if (logoResponse.ok) {
						const blob = await logoResponse.blob()
						logoBase64 = await new Promise<string>((resolve) => {
							const reader = new FileReader()
							reader.onloadend = () => resolve(reader.result as string)
							reader.readAsDataURL(blob)
						})
					}
				} catch (e) {
					console.warn('Logo not loaded:', e)
				}
			}

			setPdfProgress(prev => ({
				...prev,
				currentStep: 2 + marksheets.length,
				currentOperation: `Preparing PDF (${marksheets.length} marksheets)...`
			}))

			const allStudentData: ConsolidatedStudentMarksheetData[] = marksheets.map((data: any, index: number) => ({
				student: {
					...data.student,
					photoUrl: photoBase64Array[index] || undefined
				},
				program: data.program,
				lastAppearance: data.lastAppearance,
				institution: selectedInstitution ? {
					name: selectedInstitution.institution_name,
					code: selectedInstitution.institution_code
				} : undefined,
				courses: data.courses,
				partBreakdown: data.partBreakdown,
				summary: data.summary,
				logoImage: logoBase64,
				generatedDate: new Date().toLocaleDateString('en-IN', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric'
				})
			}))

			setPdfProgress(prev => ({
				...prev,
				currentStep: 3 + marksheets.length,
				currentOperation: 'Generating PDF document...'
			}))

			const suffix = withHeader ? '_with_header' : ''
			downloadMergedConsolidatedMarksheetPDF(
				allStudentData,
				`Consolidated_${selectedProgramCode}_${marksheets.length}learners${suffix}.pdf`,
				{ showHeader: withHeader }
			)

			setPdfProgress(prev => ({
				...prev,
				currentStep: totalSteps,
				currentOperation: 'PDF generated successfully!'
			}))

			setTimeout(() => {
				setPdfProgress(prev => ({ ...prev, isOpen: false }))
			}, 1500)

			const skippedCount = batchData.skipped || 0
			const skippedSuffix = skippedCount > 0
				? ` — ${skippedCount} learner(s) skipped (pending backlogs)`
				: ''

			toast({
				title: '✅ Download Complete',
				description: withHeader
					? `Downloaded merged PDF with header (${marksheets.length} marksheets)${skippedSuffix}`
					: `Downloaded merged PDF with ${marksheets.length} marksheets${skippedSuffix}`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (error) {
			console.error('[Consolidated Marksheet] Error in batch download:', error)
			setPdfProgress(prev => ({ ...prev, isOpen: false }))
			toast({
				title: '❌ Error',
				description: error instanceof Error ? error.message : 'Failed to generate batch PDFs',
				variant: 'destructive'
			})
		} finally {
			setGeneratingBatchPDF(false)
		}
	}

	// Export the university degree-data upload sheet (.xlsx) for the whole
	// program cohort. Sourced from consolidated_results + institutions.code +
	// MyJKKN learner/program data (built server-side, streamed as a file).
	const handleUniversityExport = async () => {
		if (!selectedInstitutionId || !selectedProgramCode) {
			toast({
				title: '❌ Missing Filters',
				description: 'Please select institution and program',
				variant: 'destructive'
			})
			return
		}

		try {
			setExportingExcel(true)
			const url = `/api/reports/consolidated-marksheet?action=university-data-export&institutionId=${selectedInstitutionId}&programCode=${encodeURIComponent(selectedProgramCode)}`
			const res = await fetch(url)

			if (!res.ok) {
				let message = 'Failed to export university data'
				try {
					const err = await res.json()
					message = err?.error || message
				} catch {
					// non-JSON error body
				}
				throw new Error(message)
			}

			const blob = await res.blob()
			const disposition = res.headers.get('Content-Disposition') || ''
			const match = disposition.match(/filename="?([^"]+)"?/)
			const filename = match?.[1] || `University_Data_${selectedProgramCode}.xlsx`

			const downloadUrl = window.URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = downloadUrl
			link.download = filename
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			window.URL.revokeObjectURL(downloadUrl)

			toast({
				title: '✅ Excel Downloaded',
				description: 'University data sheet has been downloaded',
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (error) {
			console.error('[Consolidated Marksheet] Error exporting university data:', error)
			toast({
				title: '❌ Error',
				description: error instanceof Error ? error.message : 'Failed to export university data',
				variant: 'destructive'
			})
		} finally {
			setExportingExcel(false)
		}
	}

	// =====================================================
	// RENDER HELPERS
	// =====================================================

	// Sort courses: semester ASC → part order → courseOrder
	const sortedCourses = marksheetData
		? [...marksheetData.courses].sort((a, b) => {
			if (a.semester !== b.semester) return a.semester - b.semester
			const pa = PART_ORDER[a.part] ?? 99
			const pb = PART_ORDER[b.part] ?? 99
			if (pa !== pb) return pa - pb
			return a.courseOrder - b.courseOrder
		})
		: []

	const activeParts = marksheetData
		? marksheetData.partBreakdown.filter(p => p.courses.length > 0)
		: []

	// =====================================================
	// RENDER
	// =====================================================

	return (
		<>
			{/* Filter Card */}
			<Card>
				<CardHeader className="pb-4">
					<CardTitle className="flex items-center gap-2">
						<ListChecks className="h-5 w-5" />
						Consolidated Marksheet Generator
					</CardTitle>
					<CardDescription>
						Generate consolidated all-semester marksheets with CGPA and part-wise classification.
						Issued only for learners who have cleared every course across every semester.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						{/* Institution Select */}
						{(mustSelectInstitution || !shouldFilter) && (
							<div className="space-y-2">
								<Label>Institution</Label>
								<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											role="combobox"
											className="w-full justify-between"
											disabled={loadingInstitutions}
										>
											{loadingInstitutions ? (
												<span className="flex items-center gap-2">
													<Loader2 className="h-4 w-4 animate-spin" />
													Loading...
												</span>
											) : selectedInstitutionId ? (
												institutions.find(i => i.id === selectedInstitutionId)?.institution_code
											) : (
												'Select institution'
											)}
											{!loadingInstitutions && <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />}
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[300px] p-0">
										<Command>
											<CommandInput placeholder="Search institution..." />
											<CommandList>
												<CommandEmpty>No institution found.</CommandEmpty>
												<CommandGroup>
													{institutions.map(inst => (
														<CommandItem
															key={inst.id}
															value={`${inst.institution_code} ${inst.institution_name}`}
															keywords={[inst.institution_code, inst.institution_name]}
															onSelect={() => {
																setSelectedInstitutionId(inst.id)
																setInstitutionOpen(false)
															}}
														>
															<Check className={cn('mr-2 h-4 w-4', selectedInstitutionId === inst.id ? 'opacity-100' : 'opacity-0')} />
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

						{/* Program Select */}
						<div className="space-y-2">
							<Label>Program</Label>
							<Popover open={programOpen} onOpenChange={setProgramOpen}>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										role="combobox"
										className="w-full justify-between text-left"
										disabled={!selectedInstitutionId || loadingPrograms}
									>
										{loadingPrograms ? (
											<span className="flex items-center gap-2">
												<Loader2 className="h-4 w-4 animate-spin" />
												Loading...
											</span>
										) : (
											<span className="truncate">
												{selectedProgramCode
													? `${selectedProgramCode} - ${programs.find(p => p.program_code === selectedProgramCode)?.program_name || ''}`
													: 'Select program'}
											</span>
										)}
										{!loadingPrograms && <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />}
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[400px] p-0">
									<Command>
										<CommandInput placeholder="Search program..." />
										<CommandList>
											<CommandEmpty>No program found.</CommandEmpty>
											<CommandGroup>
												{programs.map(prog => (
													<CommandItem
														key={prog.program_code}
														value={`${prog.program_code} ${prog.program_name}`}
														onSelect={() => {
															setSelectedProgramCode(prog.program_code)
															setProgramOpen(false)
														}}
													>
														<Check className={cn('mr-2 h-4 w-4 shrink-0', selectedProgramCode === prog.program_code ? 'opacity-100' : 'opacity-0')} />
														<span>{prog.program_code} - {prog.program_name}</span>
													</CommandItem>
												))}
											</CommandGroup>
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
						</div>

						{/* Learner Select (Optional) */}
						<div className="space-y-2">
							<Label>Learner <span className="text-xs text-muted-foreground">(Optional)</span></Label>
							<Popover open={studentOpen} onOpenChange={setStudentOpen}>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										role="combobox"
										className="w-full justify-between"
										disabled={!selectedProgramCode || loadingStudents}
									>
										{loadingStudents ? (
											<span className="flex items-center gap-2">
												<Loader2 className="h-4 w-4 animate-spin" />
												Loading...
											</span>
										) : selectedStudentId ? (
											students.find(s => s.id === selectedStudentId)?.registerNo
										) : (
											'All learners'
										)}
										{!loadingStudents && <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />}
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[300px] p-0">
									<Command>
										<CommandInput placeholder="Search by register no..." />
										<CommandList>
											<CommandEmpty>No learner found.</CommandEmpty>
											<CommandGroup>
												<CommandItem
													value=""
													onSelect={() => {
														setSelectedStudentId('')
														setStudentOpen(false)
													}}
												>
													<Check className={cn('mr-2 h-4 w-4', selectedStudentId === '' ? 'opacity-100' : 'opacity-0')} />
													<div className="flex items-center gap-2">
														<Users className="h-4 w-4" />
														<span>All learners</span>
													</div>
												</CommandItem>
												{students.map(student => (
													<CommandItem
														key={student.id}
														value={`${student.registerNo} ${student.name}`}
														keywords={[student.registerNo, student.name]}
														onSelect={() => {
															setSelectedStudentId(student.id)
															setStudentOpen(false)
														}}
													>
														<Check className={cn('mr-2 h-4 w-4', selectedStudentId === student.id ? 'opacity-100' : 'opacity-0')} />
														<div className="flex flex-col">
															<span className="font-medium">{student.registerNo}</span>
															<span className="text-xs text-muted-foreground">{student.name}</span>
														</div>
													</CommandItem>
												))}
											</CommandGroup>
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
						</div>
					</div>

					{/* Batch Download Banner */}
					{!selectedStudentId && students.length > 0 && (
						<div className="mt-4 p-4 bg-muted/50 rounded-lg border">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<Users className="h-5 w-5 text-muted-foreground" />
									<div>
										<p className="font-medium">{students.length} Eligible Learner(s) Found</p>
										<p className="text-sm text-muted-foreground">Only learners who have cleared every course are listed. Download all consolidated marksheets in a single merged PDF.</p>
									</div>
								</div>
								<div className="flex flex-wrap gap-3 justify-end">
									<Button
										onClick={() => handleBatchDownload(false)}
										disabled={generatingBatchPDF}
										className="bg-emerald-600 hover:bg-emerald-700 text-white"
									>
										{generatingBatchPDF ? (
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
										) : (
											<Download className="h-4 w-4 mr-2" />
										)}
										Download PDF
									</Button>
									<Button
										onClick={() => handleBatchDownload(true)}
										disabled={generatingBatchPDF}
										className="bg-blue-600 hover:bg-blue-700 text-white"
									>
										{generatingBatchPDF ? (
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
										) : (
											<Download className="h-4 w-4 mr-2" />
										)}
										Download (With Header)
									</Button>
										<Button
											onClick={handleUniversityExport}
											disabled={exportingExcel}
											variant="outline"
											className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
										>
											{exportingExcel ? (
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											) : (
												<FileSpreadsheet className="h-4 w-4 mr-2" />
											)}
											Export University Data (Excel)
										</Button>
								</div>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Marksheet Display */}
			{loadingMarksheet ? (
				<Card>
					<CardContent className="flex items-center justify-center py-20">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
						<span className="ml-2 text-muted-foreground">Loading consolidated marksheet...</span>
					</CardContent>
				</Card>
			) : ineligibleInfo ? (
				<Card className="border-amber-300 bg-amber-50/50">
					<CardHeader className="pb-4">
						<div className="flex items-start gap-3">
							<div className="rounded-full bg-amber-100 p-2">
								<AlertTriangle className="h-5 w-5 text-amber-700" />
							</div>
							<div className="flex-1">
								<CardTitle className="text-lg text-amber-900">
									Not Eligible for Consolidated Marksheet
								</CardTitle>
								<CardDescription className="text-amber-800 mt-1">
									{ineligibleInfo.student?.registerNo} — {ineligibleInfo.student?.name}
								</CardDescription>
								<p className="text-sm text-amber-800 mt-2">
									A consolidated marksheet is issued only after every course across every semester is cleared.
									This learner has <span className="font-semibold">{ineligibleInfo.failedCount}</span>{' '}
									pending course(s) and must clear them before a consolidated marksheet can be generated.
								</p>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<div className="rounded-md border border-amber-200 bg-white overflow-hidden">
							<Table>
								<TableHeader>
									<TableRow className="bg-amber-100/60">
										<TableHead className="text-center w-[60px]">Sem</TableHead>
										<TableHead className="w-[80px]">Part</TableHead>
										<TableHead className="w-[120px]">Code</TableHead>
										<TableHead>Course Name</TableHead>
										<TableHead className="text-center w-[100px]">Total</TableHead>
										<TableHead className="text-center w-[80px]">Status</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{ineligibleInfo.failedCourses.map((c, idx) => (
										<TableRow key={idx}>
											<TableCell className="text-center font-medium">{c.semester}</TableCell>
											<TableCell className="text-xs text-muted-foreground">{c.part}</TableCell>
											<TableCell className="text-xs font-mono">{c.courseCode}</TableCell>
											<TableCell className="text-sm">{c.courseName}</TableCell>
											<TableCell className="text-center text-sm">{c.totalMarks}/{c.totalMax}</TableCell>
											<TableCell className="text-center">
												<Badge variant="destructive" className="text-xs">{c.result}</Badge>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			) : marksheetData ? (
				<Card>
					<CardHeader className="pb-4">
						<div className="flex items-start justify-between flex-wrap gap-3">
							<div>
								<CardTitle className="text-xl flex items-center gap-2">
									<GraduationCap className="h-5 w-5" />
									{marksheetData.student.registerNo}
								</CardTitle>
								<CardDescription className="text-base mt-1">
									{marksheetData.student.name}
								</CardDescription>
							</div>
							<div className="flex items-center gap-2 flex-wrap">
								<Badge variant="outline">{marksheetData.summary.totalCourses} Courses</Badge>
								<Badge variant="outline">{marksheetData.summary.totalCredits} Credits</Badge>
								<Badge variant={marksheetData.summary.overallResult === 'PASS' ? 'default' : 'destructive'}>
									{marksheetData.summary.overallResult === 'PASS' ? 'Pass' : 'RA'}
								</Badge>
								<Badge className="bg-yellow-500 text-black">
									CGPA: {marksheetData.summary.cgpa.toFixed(2)}
								</Badge>
								{marksheetData.summary.formattedFolio && (
									<Badge variant="outline" className="font-mono text-xs">
										Folio: {marksheetData.summary.formattedFolio}
									</Badge>
								)}
							</div>
						</div>
					</CardHeader>

					<CardContent className="space-y-6">
						{/* Flat Course Table — all semesters */}
						<div className="rounded-md border overflow-hidden">
							<Table>
								<TableHeader>
									<TableRow className="bg-muted/50">
										<TableHead className="text-center w-[50px]">Sem</TableHead>
										<TableHead className="w-[60px]">Part</TableHead>
										<TableHead className="w-[100px]">Code</TableHead>
										<TableHead>Course Name</TableHead>
										<TableHead className="text-center w-[45px]">Cr</TableHead>
										<TableHead className="text-center w-[70px]">Int</TableHead>
										<TableHead className="text-center w-[70px]">Ext</TableHead>
										<TableHead className="text-center w-[80px]">Total</TableHead>
										<TableHead className="text-center w-[55px]">%</TableHead>
										<TableHead className="text-center w-[60px]">Grade</TableHead>
										<TableHead className="text-center w-[45px]">GP</TableHead>
										<TableHead className="text-center w-[45px]">CP</TableHead>
										<TableHead className="text-center w-[70px]">Status</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedCourses.length === 0 ? (
										<TableRow>
											<TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
												No course results found
											</TableCell>
										</TableRow>
									) : (
										sortedCourses.map((course, idx) => (
											<TableRow key={idx}>
												<TableCell className="text-center font-medium">{course.semester}</TableCell>
												<TableCell className="text-xs text-muted-foreground">{course.part}</TableCell>
												<TableCell className="text-xs font-mono">{course.courseCode}</TableCell>
												<TableCell className="text-sm">{course.courseName}</TableCell>
												<TableCell className="text-center">{course.credits}</TableCell>
												<TableCell className="text-center text-sm">{course.ciaMarks}/{course.ciaMax}</TableCell>
												<TableCell className="text-center text-sm">{course.eseMarks}/{course.eseMax}</TableCell>
												<TableCell className="text-center font-medium text-sm">{course.totalMarks}/{course.totalMax}</TableCell>
												<TableCell className="text-center text-sm">{course.percentage.toFixed(1)}</TableCell>
												<TableCell className="text-center">
													<Badge variant="outline" className="text-xs">{course.letterGrade}</Badge>
												</TableCell>
												<TableCell className="text-center text-sm">{course.gradePoint.toFixed(1)}</TableCell>
												<TableCell className="text-center text-sm">{course.creditPoints.toFixed(1)}</TableCell>
												<TableCell className="text-center">
													<Badge
														variant={course.isPassing ? 'default' : 'destructive'}
														className={cn('text-xs', course.isPassing ? 'bg-green-600' : '')}
													>
														{course.result}
													</Badge>
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</div>

						{/* Part Summary Table */}
						<div>
							<h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Part-wise Summary (All Semesters)</h3>
							<div className="rounded-md border overflow-hidden">
								<Table>
									<TableHeader>
										<TableRow className="bg-muted/50">
											<TableHead className="text-center font-semibold">PART</TableHead>
											<TableHead className="text-center font-semibold">CREDITS EARNED</TableHead>
											<TableHead className="text-center font-semibold">CGPA</TableHead>
											<TableHead className="text-center font-semibold">CLASSIFICATION</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{activeParts.map((part) => (
											<TableRow key={part.partName}>
												<TableCell className="text-center font-medium">
													{partDisplayLabel(part.partName, !!marksheetData.program.isPG)}
												</TableCell>
												<TableCell className="text-center">{part.creditsEarned}</TableCell>
												<TableCell className="text-center">{part.partCGPA.toFixed(2)}</TableCell>
												<TableCell className="text-center">
													<Badge variant="outline" className="text-xs">{part.classification}</Badge>
												</TableCell>
											</TableRow>
										))}
										{/* Total row */}
										<TableRow className="bg-muted/30 font-semibold">
											<TableCell className="text-center font-bold">TOTAL</TableCell>
											<TableCell className="text-center font-bold">{marksheetData.summary.creditsEarned}</TableCell>
											<TableCell className="text-center font-bold">{marksheetData.summary.cgpa.toFixed(2)}</TableCell>
											<TableCell className="text-center">
												<Badge className="text-xs bg-blue-600 text-white">{marksheetData.summary.classification}</Badge>
											</TableCell>
										</TableRow>
									</TableBody>
								</Table>
							</div>
						</div>

						{/* Footer Note */}
						<div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
							Passing Minimum is 40% of Maximum (UG) / 50% (PG). P: Pass, RA: Re-Appear, AAA: Absent.
						</div>

						{/* Action Buttons */}
						<div className="flex flex-wrap gap-3">
							<Button
								onClick={() => handleDownloadPDF(false)}
								disabled={generatingPDF}
								className="bg-emerald-600 hover:bg-emerald-700 text-white"
							>
								{generatingPDF ? (
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								) : (
									<Download className="h-4 w-4 mr-2" />
								)}
								Download PDF
							</Button>
							<Button
								onClick={() => handleDownloadPDF(true)}
								disabled={generatingPDF}
								className="bg-blue-600 hover:bg-blue-700 text-white"
							>
								{generatingPDF ? (
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								) : (
									<Download className="h-4 w-4 mr-2" />
								)}
								Download (With Header)
							</Button>

							{/* Share Link actions — only available after folio is assigned */}
							{marksheetData.summary.formattedFolio ? (
								<>
									<Button
										variant="outline"
										onClick={async () => {
											const url = `${window.location.origin}/reports/consolidated-marksheet/${encodeURIComponent(marksheetData.summary.formattedFolio!)}`
											try {
												await navigator.clipboard.writeText(url)
												toast({
													title: '✅ Link Copied',
													description: url,
													className: 'bg-green-50 border-green-200 text-green-800'
												})
											} catch {
												toast({ title: '❌ Copy failed', variant: 'destructive' })
											}
										}}
									>
										<Copy className="h-4 w-4 mr-2" />
										Copy Share Link
									</Button>
									<Button asChild variant="outline">
										<Link
											href={`/reports/consolidated-marksheet/${encodeURIComponent(marksheetData.summary.formattedFolio)}`}
											target="_blank"
										>
											<ExternalLink className="h-4 w-4 mr-2" />
											Open Share Page
										</Link>
									</Button>
								</>
							) : (
								<div className="flex items-center text-xs text-muted-foreground px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
									<AlertTriangle className="h-3 w-3 mr-2 text-amber-600" />
									Folio not yet assigned — share link will be available after folio assignment.
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			) : !selectedStudentId && students.length > 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
						<Users className="h-16 w-16 mb-4 opacity-20" />
						<p className="text-lg font-medium">Ready to Download Consolidated Marksheets</p>
						<p className="text-sm">Select a specific learner for preview, or use "Download PDF" above to batch download</p>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
						<GraduationCap className="h-16 w-16 mb-4 opacity-20" />
						<p className="text-lg font-medium">Select institution, program, and learner</p>
						<p className="text-sm">Consolidated marksheet covers all semesters with overall CGPA</p>
					</CardContent>
				</Card>
			)}

			{/* PDF Generation Progress Modal */}
			<PDFProgressModal
				isOpen={pdfProgress.isOpen}
				currentStep={pdfProgress.currentStep}
				totalSteps={pdfProgress.totalSteps}
				currentOperation={pdfProgress.currentOperation}
				operationType={pdfProgress.operationType}
			/>
		</>
	)
}
