"use client"

import { useState, useEffect, useMemo } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { Loader2, FileText, Check, ChevronsUpDown, Ticket, GraduationCap, Users, Download, ClipboardList } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { generateHallTicketPDF } from "@/lib/utils/generate-hall-ticket-pdf"
import { generateHallTicketDistributionPDF } from "@/lib/utils/generate-hall-ticket-distribution-pdf"
import type { HallTicketData, HallTicketApiResponse, HallTicketPdfSettings } from "@/types/hall-ticket"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"

interface Institution {
	id: string
	institution_code: string
	name: string
	myjkkn_institution_ids?: string[] | null
}

interface ExaminationSession {
	id: string
	session_name: string
	session_code: string
}

interface Program {
	id: string
	program_code: string
	program_name: string
	program_duration_yrs?: number
}

interface Student {
	stu_register_no: string
	student_name: string
}

// =====================================================
// SEMESTER TYPE WITH semester_group FOR YEAR-WISE GROUPING
// =====================================================

interface SemesterWithGroup {
	id: string
	semester_code: string
	semester_name: string
	display_order: number
	semester_group?: string // e.g., "I Year", "II Year"
}

// =====================================================
// MULTI-SELECT SEMESTER COMPONENT
// =====================================================

interface MultiSelectSemesterProps {
	semesters: SemesterWithGroup[]
	selectedSemesters: string[] // Now using semester IDs
	onSelectionChange: (semesters: string[]) => void
	disabled?: boolean
}

function MultiSelectSemester({ semesters, selectedSemesters, onSelectionChange, disabled }: MultiSelectSemesterProps) {
	const [open, setOpen] = useState(false)

	const toggleSemester = (semId: string) => {
		if (selectedSemesters.includes(semId)) {
			onSelectionChange(selectedSemesters.filter(s => s !== semId))
		} else {
			// Sort by display_order when adding
			const newSelection = [...selectedSemesters, semId]
			const sorted = newSelection.sort((a, b) => {
				const semA = semesters.find(s => s.id === a)
				const semB = semesters.find(s => s.id === b)
				return (semA?.display_order || 0) - (semB?.display_order || 0)
			})
			onSelectionChange(sorted)
		}
	}

	const selectAll = () => {
		onSelectionChange(semesters.map(s => s.id))
	}

	const clearAll = () => {
		onSelectionChange([])
	}

	// Group semesters by semester_group for display (memoized)
	const sortedGroups = useMemo(() => {
		const groupedSemesters = semesters.reduce((acc, sem) => {
			const group = sem.semester_group || 'Other'
			if (!acc[group]) acc[group] = []
			acc[group].push(sem)
			return acc
		}, {} as Record<string, SemesterWithGroup[]>)

		// Sort groups by year order (I Year, II Year, III Year, IV Year)
		const yearOrder = ['I Year', 'II Year', 'III Year', 'IV Year', 'Other']
		return Object.entries(groupedSemesters).sort((a, b) => {
			const indexA = yearOrder.indexOf(a[0])
			const indexB = yearOrder.indexOf(b[0])
			return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
		})
	}, [semesters])

	const hasSelection = selectedSemesters.length > 0 && selectedSemesters.length < semesters.length

	const getDisplayContent = () => {
		if (!hasSelection) {
			return <span className="text-muted-foreground">All Semesters</span>
		}
		// Show selected semester names as badges
		const selectedSemNames = selectedSemesters
			.map(id => semesters.find(s => s.id === id))
			.filter(Boolean)
			.sort((a, b) => (a!.display_order || 0) - (b!.display_order || 0))

		if (selectedSemNames.length <= 2) {
			return (
				<div className="flex gap-1 overflow-hidden">
					{selectedSemNames.map(sem => (
						<Badge key={sem!.id} variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100 text-xs">
							{sem!.semester_name}
						</Badge>
					))}
				</div>
			)
		}
		return (
			<Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100">
				{selectedSemNames.length} Semesters
			</Badge>
		)
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled || semesters.length === 0}
					className="w-full justify-between h-10 bg-white dark:bg-gray-950"
				>
					{getDisplayContent()}
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[320px] p-2" align="start">
				<div className="flex items-center justify-between mb-2 pb-2 border-b">
					<span className="text-sm font-medium">Select Semesters</span>
					<div className="flex gap-1">
						<Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs text-blue-600 hover:text-blue-700">
							All
						</Button>
						<Button variant="ghost" size="sm" onClick={clearAll} className="h-7 text-xs text-gray-500 hover:text-gray-700">
							Clear
						</Button>
					</div>
				</div>
				<div className="space-y-3 max-h-[300px] overflow-y-auto">
					{sortedGroups.map(([group, groupSems]) => (
						<div key={group}>
							<div className="text-xs font-semibold text-muted-foreground mb-1 px-1">{group}</div>
							<div className="grid grid-cols-2 gap-2">
								{groupSems.sort((a, b) => a.display_order - b.display_order).map(sem => (
									<div
										key={sem.id}
										onClick={() => toggleSemester(sem.id)}
										className={cn(
											"flex items-center gap-1 px-3 py-2 rounded-md cursor-pointer border text-sm",
											selectedSemesters.includes(sem.id)
												? "bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
												: "hover:bg-muted"
										)}
									>
										{selectedSemesters.includes(sem.id) && <Check className="h-3 w-3 flex-shrink-0" />}
										<span className="truncate">{sem.semester_name}</span>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}

export default function HallTicketsPage() {
	const { toast } = useToast()

	// Institution filter hook
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionCode: contextInstitutionCode
	} = useInstitutionFilter()

	// MyJKKN data fetching hook
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [semesters, setSemesters] = useState<SemesterWithGroup[]>([])
	const [students, setStudents] = useState<Student[]>([])

	// Selected values
	const [selectedInstitutionCode, setSelectedInstitutionCode] = useState<string>("")
	const [selectedSessionId, setSelectedSessionId] = useState<string>("")
	const [selectedProgramId, setSelectedProgramId] = useState<string>("")
	const [selectedSemesters, setSelectedSemesters] = useState<string[]>([])
	const [selectedStudentRegNo, setSelectedStudentRegNo] = useState<string>("")

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [generating, setGenerating] = useState(false)
	const [generatingDistribution, setGeneratingDistribution] = useState(false)

	// Preview data
	const [previewData, setPreviewData] = useState<HallTicketData | null>(null)
	const [studentCount, setStudentCount] = useState<number>(0)

	// Popover open states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [studentOpen, setStudentOpen] = useState(false)

	// Load institutions on mount and auto-fill from context
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
		}
	}, [isReady])

	// Auto-fill institution from context when available (for normal users)
	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionCode && !selectedInstitutionCode) {
			setSelectedInstitutionCode(contextInstitutionCode)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionCode, selectedInstitutionCode])

	const fetchInstitutions = async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/master/institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)

				// Auto-select if only one institution
				if (data.length === 1) {
					setSelectedInstitutionCode(data[0].institution_code)
				}
			}
		} catch (error) {
			console.error('Error fetching institutions:', error)
		} finally {
			setLoadingInstitutions(false)
		}
	}

	// Institution → Sessions
	useEffect(() => {
		if (selectedInstitutionCode) {
			setSelectedSessionId("")
			setSelectedProgramId("")
			setSelectedSemesters([])
			setSelectedStudentRegNo("")
			setSessions([])
			setPrograms([])
			setSemesters([])
			setStudents([])
			setPreviewData(null)
			setStudentCount(0)
			fetchSessions()
		} else {
			setSessions([])
		}
	}, [selectedInstitutionCode])

	const fetchSessions = async () => {
		try {
			setLoadingSessions(true)
			const url = appendToUrl('/api/exam-management/examination-sessions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				// Filter by institution if needed
				const filtered = selectedInstitutionCode
					? data.filter((s: any) => !s.institution_code || s.institution_code === selectedInstitutionCode)
					: data
				setSessions(filtered)
			}
		} catch (error) {
			console.error('Error fetching sessions:', error)
		} finally {
			setLoadingSessions(false)
		}
	}

	// Session → Programs
	useEffect(() => {
		if (selectedSessionId) {
			setSelectedProgramId("")
			setSelectedSemesters([])
			setSelectedStudentRegNo("")
			setPrograms([])
			setSemesters([])
			setStudents([])
			setPreviewData(null)
			setStudentCount(0)
			fetchPrograms()
		} else {
			setPrograms([])
		}
	}, [selectedSessionId])

	const fetchPrograms = async () => {
		try {
			setLoadingPrograms(true)
			setPrograms([])

			// Get the institution with its myjkkn_institution_ids
			const institution = institutions.find(i => i.institution_code === selectedInstitutionCode)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			console.log('[HallTickets] Fetching programs for institution:', selectedInstitutionCode, 'myjkknIds:', myjkknIds)

			if (myjkknIds.length === 0) {
				console.warn('[HallTickets] No MyJKKN institution IDs found for institution:', selectedInstitutionCode)
				setPrograms([])
				return
			}

			// Fetch programs from MyJKKN API using the hook
			const progs = await fetchMyJKKNPrograms(myjkknIds)
			console.log('[HallTickets] Programs from MyJKKN:', progs.length, progs)

			// Map to our Program interface
			const mappedPrograms: Program[] = progs.map((p: any) => ({
				id: p.id,
				program_code: p.program_id || p.program_code,
				program_name: p.program_name || p.name,
				program_duration_yrs: p.duration_years || p.program_duration_yrs || 3
			}))

			setPrograms(mappedPrograms)
		} catch (error) {
			console.error('[HallTickets] Error fetching programs:', error)
			setPrograms([])
		} finally {
			setLoadingPrograms(false)
		}
	}

	// Program → Semesters
	useEffect(() => {
		if (selectedProgramId) {
			setSelectedSemesters([])
			setSelectedStudentRegNo("")
			setStudents([])
			setPreviewData(null)
			setStudentCount(0)
			fetchSemestersForProgram()
		} else {
			setSemesters([])
		}
	}, [selectedProgramId])

	// Fetch semesters from actual exam_registrations + course_offerings data
	// Only shows semesters where is_regular=true, Approved, fee_paid=true registrations exist
	const fetchSemestersForProgram = async () => {
		try {
			const selectedProgram = programs.find(p => p.id === selectedProgramId)
			if (!selectedProgram) {
				setSemesters([])
				return
			}

			const params = new URLSearchParams()
			params.set('institution_code', selectedInstitutionCode)
			params.set('examination_session_id', selectedSessionId)
			params.set('program_code', selectedProgram.program_code)

			const res = await fetch(`/api/pre-exam/hall-tickets/semesters?${params.toString()}`)
			if (res.ok) {
				const data = await res.json()
				if (data && data.length > 0) {
					const semesterData: SemesterWithGroup[] = data.map((s: any) => ({
						id: s.id,
						semester_code: s.semester_code,
						semester_name: s.semester_name,
						display_order: s.display_order || 1,
						semester_group: s.semester_group
					}))
					semesterData.sort((a, b) => a.display_order - b.display_order)
					setSemesters(semesterData)
					console.log('[HallTickets] Fetched semesters from registrations:', semesterData)
					return
				}
			}

			// Fallback: generate semester numbers based on program duration
			console.warn('[HallTickets] No semesters from registrations, using fallback')
			const durationYears = selectedProgram?.program_duration_yrs || 4
			const totalSemesters = durationYears * 2
			const fallbackSemesters: SemesterWithGroup[] = Array.from({ length: totalSemesters }, (_, i) => {
				const semNum = i + 1
				const yearNum = Math.ceil(semNum / 2)
				const yearLabels = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
				return {
					id: `fallback-${semNum}`,
					semester_code: `SEM${semNum}`,
					semester_name: `Semester ${semNum}`,
					display_order: semNum,
					semester_group: yearLabels[yearNum - 1] || `Year ${yearNum}`
				}
			})
			setSemesters(fallbackSemesters)
		} catch (error) {
			console.error('[HallTickets] Error fetching semesters:', error)
			setSemesters([])
		}
	}

	// Handle semester selection change
	const handleSemesterChange = (newSelection: string[]) => {
		setSelectedSemesters(newSelection)
		setSelectedStudentRegNo("")
		setStudents([])
		setPreviewData(null)
		setStudentCount(0)
	}

	// Fetch students when program is selected (after semesters load)
	useEffect(() => {
		if (selectedProgramId && selectedSessionId && selectedInstitutionCode) {
			fetchStudents()
			fetchHallTicketData().catch(() => {}) // auto-populate studentCount for badge
		}
	}, [selectedProgramId, selectedSessionId, selectedSemesters])

	const fetchStudents = async () => {
		try {
			setLoadingStudents(true)
			const selectedProgram = programs.find(p => p.id === selectedProgramId)
			if (!selectedProgram) return

			const params = new URLSearchParams()
			params.set('institution_code', selectedInstitutionCode)
			params.set('examination_session_id', selectedSessionId)
			params.set('program_code', selectedProgram.program_code)

			// Pass first selected semester for filtering (if not all)
			if (selectedSemesters.length > 0 && selectedSemesters.length < semesters.length) {
				const semNum = semesters.find(s => s.id === selectedSemesters[0])?.display_order
				if (semNum) params.set('semester', semNum.toString())
			}

			const res = await fetch(`/api/pre-exam/hall-tickets/students?${params.toString()}`)
			if (res.ok) {
				const data = await res.json()
				setStudents(data.students || [])
			}
		} catch (error) {
			console.error('[HallTickets] Error fetching students:', error)
			setStudents([])
		} finally {
			setLoadingStudents(false)
		}
	}

	// Fetch hall ticket data
	const fetchHallTicketData = async (studentRegNo?: string): Promise<HallTicketData | null> => {
		try {
			const params = new URLSearchParams()
			params.append('institution_code', selectedInstitutionCode)
			params.append('examination_session_id', selectedSessionId)

			// program_code is mandatory, also pass program_name for display
			const selectedProgram = programs.find(p => p.id === selectedProgramId)
			if (selectedProgram?.program_code) {
				params.append('program_code', selectedProgram.program_code)
				if (selectedProgram.program_name) {
					params.append('program_name', selectedProgram.program_name)
				}
			}

			// Pass semester filter
			if (selectedSemesters.length > 0 && selectedSemesters.length < semesters.length) {
				const semesterNumbers = selectedSemesters.map(semId => {
					const sem = semesters.find(s => s.id === semId)
					return sem?.display_order || 0
				}).filter(n => n > 0)
				if (semesterNumbers.length > 0) {
					params.append('semester_ids', semesterNumbers.join(','))
				}
			}

			// Pass individual student filter
			const regNo = studentRegNo || selectedStudentRegNo
			if (regNo) {
				params.append('student_ids', regNo)
			}

			const res = await fetch(`/api/pre-exam/hall-tickets?${params.toString()}`)
			const result: HallTicketApiResponse = await res.json()

			if (!result.success) {
				throw new Error(result.error || 'Failed to fetch hall ticket data')
			}

			setStudentCount(result.student_count || 0)
			return result.data || null
		} catch (error) {
			console.error('Error fetching hall ticket data:', error)
			throw error
		}
	}

	// Generate and download PDF
	const handleGeneratePDF = async () => {
		if (!selectedInstitutionCode || !selectedSessionId || !selectedProgramId) {
			toast({
				title: "Missing Selection",
				description: "Please select institution, examination session, and program",
				variant: "destructive"
			})
			return
		}

		try {
			setGenerating(true)

			// Fetch data
			const data = await fetchHallTicketData()

			if (!data || data.students.length === 0) {
				toast({
					title: "No Data",
					description: "No students found matching the criteria",
					variant: "destructive"
				})
				return
			}

			setPreviewData(data)

			// Fetch logo images as base64 (with fallback to local logos)
			let logoImage: string | undefined
			let rightLogoImage: string | undefined

			// Default fallback logo URLs (local public folder)
			// Left: JKKN text logo, Right: Emblem/seal
			const defaultLogoUrl = '/jkkn_logo.png'
			const defaultSecondaryLogoUrl = '/jkkncas_logo.png'

			// Try to load primary logo (from DB or fallback)
			const logoUrl = data.institution.logo_url || defaultLogoUrl
			try {
				const logoRes = await fetch(logoUrl)
				if (logoRes.ok) {
					const logoBlob = await logoRes.blob()
					logoImage = await blobToBase64(logoBlob)
				}
			} catch (e) {
				console.warn('Failed to load logo:', e)
			}

			// Try to load secondary logo (from DB or fallback)
			const secondaryLogoUrl = data.institution.secondary_logo_url || defaultSecondaryLogoUrl
			try {
				const rightLogoRes = await fetch(secondaryLogoUrl)
				if (rightLogoRes.ok) {
					const rightLogoBlob = await rightLogoRes.blob()
					rightLogoImage = await blobToBase64(rightLogoBlob)
				}
			} catch (e) {
				console.warn('Failed to load secondary logo:', e)
			}

			// Convert Google Drive URL to direct download URL
			const convertGoogleDriveUrl = (url: string): string => {
				if (!url) return url
				// Match Google Drive file URLs
				// Format: https://drive.google.com/file/d/FILE_ID/view?...
				const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
				if (driveMatch) {
					const fileId = driveMatch[1]
					return `https://drive.google.com/uc?export=view&id=${fileId}`
				}
				// Format: https://drive.google.com/open?id=FILE_ID
				const openMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/)
				if (openMatch) {
					return `https://drive.google.com/uc?export=view&id=${openMatch[1]}`
				}
				return url
			}

			// Fetch student photos as base64 (parallel fetch for performance)
			const studentsWithPhotos = await Promise.all(
				data.students.map(async (student) => {
					if (!student.student_photo_url) {
						return student
					}
					try {
						const photoUrl = convertGoogleDriveUrl(student.student_photo_url)
						const photoRes = await fetch(photoUrl)
						if (photoRes.ok) {
							const photoBlob = await photoRes.blob()
							const photoBase64 = await blobToBase64(photoBlob)
							return { ...student, student_photo_url: photoBase64 }
						}
					} catch (e) {
						console.warn(`Failed to load photo for ${student.register_number}:`, e)
					}
					return student
				})
			)

			// Update data with students that have base64 photos
			data.students = studentsWithPhotos

			// Create PDF settings
			const settings: HallTicketPdfSettings = {
				institution_name: data.institution.institution_name,
				institution_code: data.institution.institution_code,
				accreditation_text: data.institution.accreditation_text,
				address: data.institution.address,
				logo_url: data.institution.logo_url,
				secondary_logo_url: data.institution.secondary_logo_url,
				primary_color: data.institution.primary_color,
				secondary_color: data.institution.secondary_color,
			}

			// Add logo images to data
			const dataWithLogos: HallTicketData = {
				...data,
				logoImage,
				rightLogoImage
			}

			// Generate PDF
			const fileName = generateHallTicketPDF({
				data: dataWithLogos,
				settings
			})

			toast({
				title: "PDF Generated",
				description: `Hall tickets for ${data.students.length} student(s) downloaded as ${fileName}`,
				className: "bg-green-50 border-green-200 text-green-800"
			})
		} catch (error) {
			console.error('Error generating PDF:', error)
			toast({
				title: "Error",
				description: error instanceof Error ? error.message : "Failed to generate PDF",
				variant: "destructive"
			})
		} finally {
			setGenerating(false)
		}
	}

	// Generate and download Distribution PDF
	const handleGenerateDistributionPDF = async () => {
		if (!selectedInstitutionCode || !selectedSessionId || !selectedProgramId) {
			toast({
				title: "Missing Selection",
				description: "Please select institution, examination session, and program",
				variant: "destructive"
			})
			return
		}

		try {
			setGeneratingDistribution(true)

			const data = await fetchHallTicketData()

			if (!data || data.students.length === 0) {
				toast({
					title: "No Data",
					description: "No students found matching the criteria",
					variant: "destructive"
				})
				return
			}

			// Fetch logos for header
			let logoImage: string | undefined
			let rightLogoImage: string | undefined

			const defaultLogoUrl = '/jkkn_logo.png'
			const defaultSecondaryLogoUrl = '/jkkncas_logo.png'

			const logoUrl = data.institution.logo_url || defaultLogoUrl
			try {
				const logoRes = await fetch(logoUrl)
				if (logoRes.ok) {
					const logoBlob = await logoRes.blob()
					logoImage = await blobToBase64(logoBlob)
				}
			} catch (e) {
				console.warn('Failed to load logo:', e)
			}

			const secondaryLogoUrl = data.institution.secondary_logo_url || defaultSecondaryLogoUrl
			try {
				const rightLogoRes = await fetch(secondaryLogoUrl)
				if (rightLogoRes.ok) {
					const rightLogoBlob = await rightLogoRes.blob()
					rightLogoImage = await blobToBase64(rightLogoBlob)
				}
			} catch (e) {
				console.warn('Failed to load secondary logo:', e)
			}

			const dataWithLogos: HallTicketData = {
				...data,
				logoImage,
				rightLogoImage
			}

			const prog = programs.find(p => p.id === selectedProgramId)
			const fileName = generateHallTicketDistributionPDF({
				data: dataWithLogos,
				programCode: prog?.program_code || '',
				programName: prog?.program_name || ''
			})

			toast({
				title: "PDF Generated",
				description: `Distribution list for ${data.students.length} learner(s) downloaded as ${fileName}`,
				className: "bg-green-50 border-green-200 text-green-800"
			})
		} catch (error) {
			console.error('Error generating distribution PDF:', error)
			toast({
				title: "Error",
				description: error instanceof Error ? error.message : "Failed to generate PDF",
				variant: "destructive"
			})
		} finally {
			setGeneratingDistribution(false)
		}
	}

	// Helper to convert blob to base64
	const blobToBase64 = (blob: Blob): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result as string)
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	}

	// Get selected values
	const selectedInstitution = institutions.find(i => i.institution_code === selectedInstitutionCode)
	const selectedSession = sessions.find(s => s.id === selectedSessionId)
	const selectedProgram = programs.find(p => p.id === selectedProgramId)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					{/* Breadcrumb */}
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
									<BreadcrumbLink asChild>
										<Link href="/pre-exam">Pre-Exam</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Hall Tickets</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>
						{/* Header */}
						<div className="flex items-center gap-4">
							<div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
								<Ticket className="h-6 w-6 text-white" />
							</div>
							<div>
								<h1 className="text-2xl font-bold tracking-tight">Hall Ticket Generation</h1>
								<p className="text-muted-foreground">Generate and download hall tickets for individual or all learners</p>
							</div>
						</div>

						{/* Select Parameters Card */}
						<Card className="border-0 shadow-sm">
							<CardHeader className="pb-4">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center">
										<GraduationCap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
									</div>
									<div>
										<CardTitle className="text-lg">Select Parameters</CardTitle>
										<CardDescription>Choose institution, session, program and semester</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								{/* Horizontal Filter Row */}
								<div className={`grid grid-cols-1 gap-4 ${mustSelectInstitution ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
									{/* Institution - Show only when mustSelectInstitution is true */}
									{mustSelectInstitution && (
										<div className="space-y-2">
											<Label className="text-sm font-medium">
												Institution <span className="text-red-500">*</span>
											</Label>
											<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
												<PopoverTrigger asChild>
													<Button
														variant="outline"
														role="combobox"
														aria-expanded={institutionOpen}
														className="w-full justify-between h-10 bg-white dark:bg-gray-950"
														disabled={loadingInstitutions}
													>
														{loadingInstitutions ? (
															<Loader2 className="h-4 w-4 animate-spin" />
														) : selectedInstitution ? (
															<span className="truncate text-left">{selectedInstitution.institution_code} - {selectedInstitution.name.substring(0, 15)}...</span>
														) : (
															<span className="text-muted-foreground">Select institution...</span>
														)}
														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[300px] p-0" align="start">
													<Command
														filter={(value, search) => {
															if (!search) return 1
															const searchLower = search.toLowerCase()
															const valueLower = value.toLowerCase()
															return valueLower.includes(searchLower) ? 1 : 0
														}}
													>
														<CommandInput placeholder="Search institution..." />
														<CommandList>
															<CommandEmpty>No institution found.</CommandEmpty>
															<CommandGroup>
																{institutions.map((inst) => (
																	<CommandItem
																		key={inst.id}
																		value={`${inst.institution_code} ${inst.name}`}
																		onSelect={() => {
																			setSelectedInstitutionCode(inst.institution_code)
																			setInstitutionOpen(false)
																		}}
																	>
																		<Check
																			className={cn(
																				"mr-2 h-4 w-4",
																				selectedInstitutionCode === inst.institution_code ? "opacity-100" : "opacity-0"
																			)}
																		/>
																		<span className="truncate">{inst.institution_code} - {inst.name}</span>
																	</CommandItem>
																))}
															</CommandGroup>
														</CommandList>
													</Command>
												</PopoverContent>
											</Popover>
										</div>
									)}

									{/* Examination Session */}
									<div className="space-y-2">
										<Label className="text-sm font-medium">
											Examination Session <span className="text-red-500">*</span>
										</Label>
										<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={sessionOpen}
													className="w-full justify-between h-10 bg-white dark:bg-gray-950"
													disabled={!selectedInstitutionCode || loadingSessions}
												>
													{loadingSessions ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : selectedSession ? (
														<span className="truncate text-left">{selectedSession.session_code || selectedSession.session_name.substring(0, 20)}...</span>
													) : (
														<span className="text-muted-foreground">Select session...</span>
													)}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[300px] p-0" align="start">
												<Command
													filter={(value, search) => {
														if (!search) return 1
														const searchLower = search.toLowerCase()
														const valueLower = value.toLowerCase()
														return valueLower.includes(searchLower) ? 1 : 0
													}}
												>
													<CommandInput placeholder="Search session..." />
													<CommandList>
														<CommandEmpty>No session found.</CommandEmpty>
														<CommandGroup>
															{sessions.map((sess) => (
																<CommandItem
																	key={sess.id}
																	value={`${sess.session_code} ${sess.session_name}`}
																	onSelect={() => {
																		setSelectedSessionId(sess.id)
																		setSessionOpen(false)
																	}}
																>
																	<Check
																		className={cn(
																			"mr-2 h-4 w-4",
																			selectedSessionId === sess.id ? "opacity-100" : "opacity-0"
																		)}
																	/>
																	{sess.session_name}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									{/* Program with Badge */}
									<div className="space-y-2">
										<Label className="text-sm font-medium">
											Program(s) <span className="text-red-500">*</span>
										</Label>
										<Popover open={programOpen} onOpenChange={setProgramOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={programOpen}
													className="w-full justify-between h-10 bg-white dark:bg-gray-950"
													disabled={!selectedSessionId || loadingPrograms}
												>
													{loadingPrograms ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : selectedProgram ? (
														<Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100">
															{selectedProgram.program_code}
														</Badge>
													) : (
														<span className="text-muted-foreground">Select program...</span>
													)}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[350px] p-0" align="start">
												<Command
													filter={(value, search) => {
														if (!search) return 1
														const searchLower = search.toLowerCase()
														const valueLower = value.toLowerCase()
														return valueLower.includes(searchLower) ? 1 : 0
													}}
												>
													<CommandInput placeholder="Search program..." />
													<CommandList>
														<CommandEmpty>No program found.</CommandEmpty>
														<CommandGroup>
															{programs.map((prog) => (
																<CommandItem
																	key={prog.id}
																	value={`${prog.program_code} ${prog.program_name}`}
																	onSelect={() => {
																		setSelectedProgramId(prog.id)
																		setProgramOpen(false)
																	}}
																>
																	<Check
																		className={cn(
																			"mr-2 h-4 w-4",
																			selectedProgramId === prog.id ? "opacity-100" : "opacity-0"
																		)}
																	/>
																	<span className="truncate">{prog.program_code} - {prog.program_name}</span>
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									{/* Semester Dropdown */}
									<div className="space-y-2">
										<Label className="text-sm font-medium">Semester(s)</Label>
										<MultiSelectSemester
											semesters={semesters}
											selectedSemesters={selectedSemesters}
											onSelectionChange={handleSemesterChange}
											disabled={!selectedProgramId}
										/>
									</div>

									{/* Learner Dropdown (Optional - like semester marksheet) */}
									<div className="space-y-2">
										<Label className="text-sm font-medium">Learner <span className="text-xs text-muted-foreground">(Optional)</span></Label>
										<Popover open={studentOpen} onOpenChange={setStudentOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={studentOpen}
													className="w-full justify-between h-10 bg-white dark:bg-gray-950"
													disabled={!selectedProgramId || loadingStudents}
												>
													{loadingStudents ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : selectedStudentRegNo ? (
														<span className="truncate text-left font-mono text-xs">{selectedStudentRegNo}</span>
													) : (
														<span className="text-muted-foreground">All learners</span>
													)}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[300px] p-0" align="start">
												<Command
													filter={(value, search) => {
														if (!search) return 1
														return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
													}}
												>
													<CommandInput placeholder="Search by register no..." />
													<CommandList>
														<CommandEmpty>No learner found.</CommandEmpty>
														<CommandGroup>
															<CommandItem
																value=""
																onSelect={() => {
																	setSelectedStudentRegNo("")
																	setStudentOpen(false)
																}}
															>
																<Check className={cn("mr-2 h-4 w-4", selectedStudentRegNo === "" ? "opacity-100" : "opacity-0")} />
																<div className="flex items-center gap-2">
																	<Users className="h-4 w-4" />
																	<span>All learners</span>
																</div>
															</CommandItem>
															{students.map((student) => (
																<CommandItem
																	key={student.stu_register_no}
																	value={`${student.stu_register_no} ${student.student_name}`}
																	onSelect={() => {
																		setSelectedStudentRegNo(student.stu_register_no)
																		setStudentOpen(false)
																	}}
																>
																	<Check className={cn("mr-2 h-4 w-4", selectedStudentRegNo === student.stu_register_no ? "opacity-100" : "opacity-0")} />
																	<div className="flex flex-col">
																		<span className="font-mono text-xs font-medium">{student.stu_register_no}</span>
																		<span className="text-xs text-muted-foreground">{student.student_name}</span>
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

								{/* Batch Download Section - shown when program selected and no individual learner */}
								{selectedProgramId && !selectedStudentRegNo && students.length > 0 && (
									<div className="mt-4 p-4 bg-muted/50 rounded-lg border">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-3">
												<Users className="h-5 w-5 text-muted-foreground" />
												<div>
													<p className="font-medium">{studentCount > 0 ? studentCount : students.length} Learners Found</p>
													<p className="text-sm text-muted-foreground">Download all hall tickets in a single merged PDF</p>
												</div>
											</div>
											<div className="flex items-center gap-2">
												<Button
													onClick={handleGenerateDistributionPDF}
													disabled={generatingDistribution}
													variant="outline"
													className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/20"
												>
													{generatingDistribution ? (
														<Loader2 className="h-4 w-4 mr-2 animate-spin" />
													) : (
														<ClipboardList className="h-4 w-4 mr-2" />
													)}
													Distribution List
												</Button>
												<Button
													onClick={handleGeneratePDF}
													disabled={generating}
													className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
												>
													{generating ? (
														<Loader2 className="h-4 w-4 mr-2 animate-spin" />
													) : (
														<Download className="h-4 w-4 mr-2" />
													)}
													Download All Hall Tickets
												</Button>
											</div>
										</div>
									</div>
								)}

								{/* Individual Download Section - shown when specific learner selected */}
								{selectedStudentRegNo && (
									<div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-3">
												<Ticket className="h-5 w-5 text-blue-600" />
												<div>
													<p className="font-medium text-blue-800 dark:text-blue-200">
														{students.find(s => s.stu_register_no === selectedStudentRegNo)?.student_name || selectedStudentRegNo}
													</p>
													<p className="text-sm text-blue-600 dark:text-blue-400 font-mono">{selectedStudentRegNo}</p>
												</div>
											</div>
											<Button
												onClick={handleGeneratePDF}
												disabled={generating}
												className="bg-blue-600 hover:bg-blue-700 text-white"
											>
												{generating ? (
													<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												) : (
													<Download className="h-4 w-4 mr-2" />
												)}
												Download Hall Ticket
											</Button>
										</div>
									</div>
								)}
							</CardContent>
						</Card>

						{/* Preview Section */}
						{previewData && (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Users className="h-5 w-5 text-green-500" />
										Preview ({studentCount} Students)
									</CardTitle>
									<CardDescription>
										The following students will have hall tickets generated
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="max-h-96 overflow-y-auto rounded-lg border">
										<table className="w-full text-sm">
											<thead className="sticky top-0 bg-muted">
												<tr>
													<th className="px-4 py-3 text-left font-medium">S.No</th>
													<th className="px-4 py-3 text-left font-medium">Register No</th>
													<th className="px-4 py-3 text-left font-medium">Student Name</th>
													<th className="px-4 py-3 text-left font-medium">Program</th>
													<th className="px-4 py-3 text-center font-medium">Subjects</th>
												</tr>
											</thead>
											<tbody>
												{previewData.students.map((student, index) => (
													<tr key={index} className="border-t hover:bg-muted/50">
														<td className="px-4 py-3">{index + 1}</td>
														<td className="px-4 py-3 font-mono text-xs">{student.register_number}</td>
														<td className="px-4 py-3">{student.student_name}</td>
														<td className="px-4 py-3">{student.program}</td>
														<td className="px-4 py-3 text-center">
															<Badge variant="secondary">{student.subjects.length}</Badge>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</CardContent>
							</Card>
						)}

						{/* Info Card */}
						<Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
							<CardContent className="pt-6">
								<div className="flex gap-4">
									<div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
									</div>
									<div>
										<h4 className="font-semibold text-blue-800 dark:text-blue-200">Hall Ticket Format</h4>
										<ul className="mt-2 text-sm text-blue-700 dark:text-blue-300 space-y-1">
											<li>• One student per page with automatic page breaks</li>
											<li>• Includes student photo, program, and date of birth</li>
											<li>• Examination schedule with subject codes and timings</li>
											<li>• FN (Forenoon): 10:00 AM to 01:00 PM</li>
											<li>• AN (Afternoon): 02:00 PM to 05:00 PM</li>
											<li>• Signature sections for student and authorities</li>
										</ul>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
