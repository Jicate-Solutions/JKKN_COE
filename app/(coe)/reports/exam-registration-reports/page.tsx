"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSessionSync } from '@/hooks/use-session-sync'
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { cn } from "@/lib/utils"
import Link from "next/link"
import {
	ClipboardCheck,
	FileText,
	FileSpreadsheet,
	Loader2,
	Check,
	ChevronsUpDown,
	Filter,
	ChevronLeft,
	ChevronRight,
	Users,
	Download,
} from "lucide-react"
import type { ReportType } from "@/types/exam-registration-reports"
import { generateExamRegistrationReportPdf } from "@/lib/utils/generate-exam-registration-report-pdf"
import { exportExamRegistrationReportExcel } from "@/lib/utils/exam-registration-report-excel"

interface InstitutionOption {
	id: string
	institution_code: string
	name: string
}

interface SessionOption {
	id: string
	session_code: string
	session_name: string
}

const COURSE_CATEGORY_OPTIONS = ['Theory', 'Practical', 'Project', 'Field Work']

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
function toRoman(n: number): string { return ROMAN[n] || String(n) }

type ReportCategory = 'exam-reg-app' | 'registration' | 'exam-date'

const REPORT_CATEGORIES: { value: ReportCategory; label: string }[] = [
	{ value: 'exam-reg-app', label: 'Exam Registration & Application' },
	{ value: 'registration', label: 'Board Wise Report' },
	{ value: 'exam-date', label: 'Exam Date Wise Report' },
]

const REPORT_OPTIONS: { value: ReportType; label: string; description: string; group: ReportCategory; section?: string }[] = [
	{ value: 'student-exam-registration', label: 'Student Exam Registration', description: 'Learner-wise regular exam registration (regular papers only)', group: 'exam-reg-app', section: 'Program wise Report' },
	{ value: 'student-exam-registration-summary', label: 'Student Exam Registration - Subject Summary', description: 'Subject-wise registered count per program & year (A4 portrait, no incharge columns)', group: 'exam-reg-app', section: 'Program wise Report' },
	{ value: 'student-fee-details', label: 'Student Exam Application', description: 'Learner-wise exam application with courses and fee columns', group: 'exam-reg-app', section: 'Program wise Report' },
	{ value: 'student-wise-registration', label: 'Student Exam Registration', description: 'Student-wise regular exam registration (regular papers only)', group: 'exam-reg-app', section: 'Student wise Report' },
	{ value: 'student-wise-application', label: 'Student Exam Application', description: 'Student-wise exam application with courses and fee columns', group: 'exam-reg-app', section: 'Student wise Report' },
	{ value: 'course-count-regular-arrear', label: 'Regular / Arrear Count', description: 'Course-wise student count split by Regular and Arrear', group: 'registration' },
	{ value: 'course-count-year-wise', label: 'Board & Year Wise Course List', description: 'Course-wise student count split by Year', group: 'registration' },
	{ value: 'course-count-program-year-wise', label: 'Board & Program Wise Registration List', description: 'Course-wise count with Program Code, split by Year', group: 'registration' },
	{ value: 'course-count-program-year-section', label: 'Program Wise Registration List', description: 'Course-wise student count grouped by Program', group: 'registration' },
	{ value: 'board-wise-exam-timetable', label: 'Board Wise Exam Timetable', description: 'Board-wise exam timetable with date and session', group: 'exam-date' },
	{ value: 'exam-date-wise-summary', label: 'Exam Date-wise Summary', description: 'Date-wise FN/AN registration count summary', group: 'exam-date' },
	{ value: 'qp-packing-list', label: 'QP Packing List', description: 'Question Paper packing list - one page per date & session', group: 'exam-date' },
	{ value: 'exam-date-wise-registration', label: 'Exam Date Wise Registration/QP Count', description: 'Course-wise registration count grouped by Exam Date and Session (FN/AN)', group: 'exam-date' },
	{ value: 'exam-date-wise-attendance', label: 'Exam Date Wise Attendance/Answer Sheet Count', description: 'Course-wise registration and attendance count grouped by Exam Date and Session (FN/AN)', group: 'exam-date' },
]

export default function ExamRegistrationReportsPage() {
	const { toast } = useToast()
	const { hasAnyRole } = useAuth()

	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	// Filter state
	const [institutions, setInstitutions] = useState<InstitutionOption[]>([])
	const [sessions, setSessions] = useState<SessionOption[]>([])
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('')
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [selectedCourseCategories, setSelectedCourseCategories] = useState<string[]>([])
	const [selectedReportCategory, setSelectedReportCategory] = useState<ReportCategory | ''>('')
	const [selectedReportType, setSelectedReportType] = useState<ReportType | ''>('')

	// Report data from API
	const [reportData, setReportData] = useState<any[]>([])
	const [reportMeta, setReportMeta] = useState<{
		institution_name: string
		institution_code: string
		session_name: string
		session_code: string
	} | null>(null)

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingReport, setLoadingReport] = useState(false)
	const [exportingPdf, setExportingPdf] = useState(false)
	const [exportingExcel, setExportingExcel] = useState(false)

	// Popover states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [categoryOpen, setCategoryOpen] = useState(false)

	// Pagination
	const [currentPage, setCurrentPage] = useState(1)
	const pageSize = 50

	// ── Fetch institutions ──

	const fetchInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/master/institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(Array.isArray(data) ? data : data.data || [])
			}
		} catch (error) {
			console.error('Error fetching institutions:', error)
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl])

	useEffect(() => {
		if (isReady) fetchInstitutions()
	}, [isReady, fetchInstitutions])

	// Auto-select institution for non-super_admin
	useEffect(() => {
		if (institutions.length > 0) {
			if (institutions.length === 1) {
				setSelectedInstitutionId(institutions[0].id)
			} else if (shouldFilter && contextInstitutionId) {
				setSelectedInstitutionId(contextInstitutionId)
			} else if (!mustSelectInstitution && contextInstitutionId) {
				setSelectedInstitutionId(contextInstitutionId)
			}
		}
	}, [institutions, shouldFilter, mustSelectInstitution, contextInstitutionId])

	// ── Fetch sessions when institution changes ──

	const fetchSessions = useCallback(async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			setSessions([])
			const res = await fetch(`/api/exam-management/examination-sessions?institutions_id=${institutionId}`)
			if (res.ok) {
				const data = await res.json()
				setSessions(Array.isArray(data) ? data : data.data || [])
			}
		} catch (error) {
			console.error('Error fetching sessions:', error)
		} finally {
			setLoadingSessions(false)
		}
	}, [])

	useEffect(() => {
		if (selectedInstitutionId) {
			fetchSessions(selectedInstitutionId)
			setSelectedSessionId('')
			setSelectedCourseCategories([])
			setSelectedReportCategory('')
			setSelectedReportType('')
			setReportData([])
			setReportMeta(null)
		}
	}, [selectedInstitutionId, fetchSessions])

	// Reset pagination on data change
	useEffect(() => {
		setCurrentPage(1)
	}, [reportData])

	// ── Generate Report ──

	const fetchReport = useCallback(async (reportType?: ReportType) => {
		const typeToFetch = reportType || selectedReportType
		if (!selectedInstitutionId || !selectedSessionId || !typeToFetch) {
			return
		}

		try {
			setLoadingReport(true)
			setReportData([])
			setReportMeta(null)

			const url = `/api/reports/exam-registration-reports?institutions_id=${selectedInstitutionId}&examination_session_id=${selectedSessionId}&report_type=${typeToFetch}`
			const res = await fetch(url)
			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error || 'Failed to fetch report data')
			}

			const result = await res.json()
			setReportData(result.data || [])
			setReportMeta({
				institution_name: result.institution_name || '',
				institution_code: result.institution_code || '',
				session_name: result.session_name || '',
				session_code: result.session_code || '',
			})

			toast({
				title: 'Report Generated',
				description: `Found ${result.data?.length || 0} registration records.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('Error generating report:', error)
			toast({
				title: 'Error',
				description: error instanceof Error ? error.message : 'Failed to generate report',
				variant: 'destructive',
			})
		} finally {
			setLoadingReport(false)
		}
	}, [selectedInstitutionId, selectedSessionId, selectedReportType, toast])

	// Auto-generate: when report type is selected and filters are set
	const handleReportTypeSelect = useCallback((type: ReportType) => {
		setSelectedReportType(type)
		if (selectedInstitutionId && selectedSessionId) {
			// Small delay to let state update visually before loading
			setTimeout(() => fetchReport(type), 50)
		}
	}, [selectedInstitutionId, selectedSessionId, fetchReport])

	// ── Filtered report data (by course category) ──

	const filteredReportData = useMemo(() => {
		if (selectedCourseCategories.length === 0 || selectedCourseCategories.length === COURSE_CATEGORY_OPTIONS.length) return reportData
		return reportData.filter(r => {
			const cat = r.course_offering?.course_category
			// Include rows with unknown category (fallback offerings) — don't silently drop them
			return !cat || selectedCourseCategories.includes(cat)
		})
	}, [reportData, selectedCourseCategories])

	// Student-type reports: count unique learners (by register no), not raw registration rows
	const STUDENT_REPORT_TYPES = ['student-fee-details', 'student-exam-registration', 'student-exam-registration-summary', 'student-wise-application', 'student-wise-registration']
	const isStudentReport = STUDENT_REPORT_TYPES.includes(selectedReportType as string)
	const uniqueStudentCount = useMemo(
		() => isStudentReport ? new Set(filteredReportData.map((r: any) => r.stu_register_no).filter(Boolean)).size : 0,
		[filteredReportData, isStudentReport]
	)

	// ── Export PDF ──

	const handleExportPdf = useCallback(async () => {
		if (reportData.length === 0 || !reportMeta) {
			toast({ title: 'No Data', description: 'Generate a report first.', variant: 'destructive' })
			return
		}

		try {
			setExportingPdf(true)

			// Load logos
			let logoBase64: string | undefined
			let rightLogoBase64: string | undefined

			try {
				// Engineering college: single left logo (jkkncet), no right logo
				const isEngineering = (reportMeta.institution_code || '').toUpperCase() === 'CET' || (reportMeta.institution_name || '').toUpperCase().includes('ENGINEER')
				const [logoRes, rightLogoRes] = await Promise.all([
					fetch(isEngineering ? '/jkkncet_logo.png' : '/jkkn_logo.png'),
					fetch('/jkkncas_logo.png'),
				])
				if (logoRes.ok) {
					const blob = await logoRes.blob()
					logoBase64 = await new Promise<string>((resolve) => {
						const reader = new FileReader()
						reader.onloadend = () => resolve(reader.result as string)
						reader.readAsDataURL(blob)
					})
				}
				if (rightLogoRes.ok && !isEngineering) {
					const blob = await rightLogoRes.blob()
					rightLogoBase64 = await new Promise<string>((resolve) => {
						const reader = new FileReader()
						reader.onloadend = () => resolve(reader.result as string)
						reader.readAsDataURL(blob)
					})
				}
			} catch (e) {
				console.warn('Logo not loaded:', e)
			}

			// Generate separate UG and PG PDFs
			const skipCategoryFilter = selectedReportType === 'qp-packing-list'
			const baseOpts = {
				report_type: selectedReportType as ReportType,
				institution_name: reportMeta.institution_name,
				institution_code: reportMeta.institution_code,
				session_name: reportMeta.session_name,
				session_code: reportMeta.session_code,
				data: filteredReportData,
				logoImage: logoBase64,
				rightLogoImage: rightLogoBase64,
				course_category_filter: skipCategoryFilter ? undefined : (selectedCourseCategories.length < COURSE_CATEGORY_OPTIONS.length ? selectedCourseCategories : undefined),
			}

			const fileNames: string[] = []

			// Exam date-wise reports: single combined file (no UG/PG split)
			const isDateWiseReport = selectedReportType === 'exam-date-wise-registration' || selectedReportType === 'exam-date-wise-attendance' || selectedReportType === 'board-wise-exam-timetable' || selectedReportType === 'exam-date-wise-summary' || selectedReportType === 'qp-packing-list'
				// Student-wise forms: one page per student — single combined file for ALL students (no UG/PG split)
				const isStudentWiseForm = selectedReportType === 'student-wise-registration' || selectedReportType === 'student-wise-application'

			if (isDateWiseReport || isStudentWiseForm) {
				const file = generateExamRegistrationReportPdf(baseOpts)
				if (file) fileNames.push(file)
			} else {
				// Other reports: separate UG and PG PDFs
				const ugFile = generateExamRegistrationReportPdf({ ...baseOpts, course_level: 'UG' })
				if (ugFile) fileNames.push(ugFile)
				const pgFile = generateExamRegistrationReportPdf({ ...baseOpts, course_level: 'PG' })
				if (pgFile) fileNames.push(pgFile)
			}

			if (fileNames.length === 0) {
				toast({ title: 'No Data', description: 'No data found for selected filters.', variant: 'destructive' })
				return
			}

			toast({
				title: 'PDF Generated',
				description: `${fileNames.join(' & ')} downloaded.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('PDF export error:', error)
			toast({ title: 'Export Failed', description: 'Failed to generate PDF.', variant: 'destructive' })
		} finally {
			setExportingPdf(false)
		}
	}, [filteredReportData, reportData, reportMeta, selectedCourseCategories, selectedReportType, toast])

	// ── Export Excel ──

	const handleExportExcel = useCallback(async () => {
		if (reportData.length === 0 || !reportMeta) {
			toast({ title: 'No Data', description: 'Generate a report first.', variant: 'destructive' })
			return
		}

		try {
			setExportingExcel(true)

			await exportExamRegistrationReportExcel({
				report_type: selectedReportType as ReportType,
				institution_name: reportMeta.institution_name,
				institution_code: reportMeta.institution_code,
				session_name: reportMeta.session_name,
				session_code: reportMeta.session_code,
				data: filteredReportData,
				course_category_filter: selectedCourseCategories.length < COURSE_CATEGORY_OPTIONS.length ? selectedCourseCategories : undefined,
			})

			toast({
				title: 'Excel Exported',
				description: 'File has been downloaded.',
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('Excel export error:', error)
			toast({ title: 'Export Failed', description: 'Failed to export Excel.', variant: 'destructive' })
		} finally {
			setExportingExcel(false)
		}
	}, [filteredReportData, reportData, reportMeta, selectedCourseCategories, selectedReportType, toast])

	// ── Aggregated preview data ──

	const previewData = useMemo(() => {
		if (filteredReportData.length === 0) return []

		const reportData2 = filteredReportData

		// Build student year map: each student's current year based on their max regular semester
		const studentYearMap = new Map<string, string>()
		const studentMaxRegSem = new Map<string, number>()
		const studentMaxAnySem = new Map<string, number>()
		const roman = ['I', 'II', 'III', 'IV', 'V']
		for (const row of reportData2) {
			const regNo = row.stu_register_no
			if (!regNo) continue
			const sem = row.course_offering?.semester || 0
			if (sem <= 0) continue
			if (row.is_regular) {
				studentMaxRegSem.set(regNo, Math.max(studentMaxRegSem.get(regNo) || 0, sem))
			}
			studentMaxAnySem.set(regNo, Math.max(studentMaxAnySem.get(regNo) || 0, sem))
		}
		for (const regNo of new Set([...studentMaxRegSem.keys(), ...studentMaxAnySem.keys()])) {
			const maxSem = studentMaxRegSem.get(regNo) || studentMaxAnySem.get(regNo) || 1
			const yearNum = Math.ceil(maxSem / 2)
			studentYearMap.set(regNo, `${roman[yearNum - 1] || yearNum} Year`)
		}

		switch (selectedReportType) {
			case 'student-fee-details':
			case 'student-exam-registration':
			case 'student-exam-registration-summary':
			case 'student-wise-application':
			case 'student-wise-registration': {
				// Flatten to per-student rows with course list
				const studentMap = new Map<string, { name: string; dob: string; program_code: string; courses: { semester: number; course_order: number; course_code: string; course_name: string }[] }>()
				for (const row of reportData2) {
					const regNo = row.stu_register_no || 'Unknown'
					if (!studentMap.has(regNo)) {
						studentMap.set(regNo, { name: row.student_name || '', dob: row.date_of_birth || '', program_code: row.course_offering?.program_code || row.program_code || '', courses: [] })
					}
					const co = row.course_offering
					if (co) {
						const student = studentMap.get(regNo)!
						// Deduplicate by course_code (same course can exist under multiple offerings)
						if (!student.courses.some(c => c.course_code === co.course_code)) {
							student.courses.push({ semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code || '', course_name: co.course_name || '' })
						}
					}
				}
				return Array.from(studentMap.entries())
					.sort((a, b) => a[0].localeCompare(b[0]))
					.map(([regNo, info]) => {
						info.courses.sort((a, b) => (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))
						return { regNo, ...info }
					})
			}

			case 'course-count-regular-arrear': {
				const countMap = new Map<string, any>()
				for (const row of reportData2) {
					const co = row.course_offering
					if (!co) continue
					const key = `${co.board_code || ''}|${co.course_code}`
					if (!countMap.has(key)) {
						countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_code: co.program_code || '', program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', regular: 0, arrear: 0 })
					}
					const entry = countMap.get(key)!
					if (row.is_regular) entry.regular++
					else entry.arrear++
				}
				return Array.from(countMap.values()).sort((a: any, b: any) =>
				(a.board_order - b.board_order) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code)
				)
			}

			case 'course-count-year-wise': {
				const countMap = new Map<string, any>()
				for (const row of reportData2) {
					const co = row.course_offering
					if (!co) continue
					const key = `${co.board_code || ''}|${co.course_code}`
					// Use student's current year, not course semester
					const year = studentYearMap.get(row.stu_register_no) || 'I Year'
					if (!countMap.has(key)) {
						countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_code: co.program_code || '', program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', years: {} })
					}
					const entry = countMap.get(key)!
					entry.years[year] = (entry.years[year] || 0) + 1
				}
				return Array.from(countMap.values()).sort((a: any, b: any) =>
				(a.board_order - b.board_order) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code)
				)
			}

			case 'course-count-program-year-wise': {
				const countMap = new Map<string, any>()
				for (const row of reportData2) {
					const co = row.course_offering
					if (!co) continue
					const programCode = co.program_code || row.program_code || ''
					const key = `${co.board_code || ''}|${programCode}|${co.course_code}`
					// Use student's current year, not course semester
					const year = studentYearMap.get(row.stu_register_no) || 'I Year'
					if (!countMap.has(key)) {
						countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_code: programCode, program_board_order: co.program_board_order ?? 999, program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', years: {} })
					}
					const entry = countMap.get(key)!
					entry.years[year] = (entry.years[year] || 0) + 1
				}
				return Array.from(countMap.values()).sort((a: any, b: any) =>
				(a.board_order - b.board_order) || (a.program_order - b.program_order) || a.program_code.localeCompare(b.program_code) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code)
			)
			}

			case 'course-count-program-year-section': {
				// Group by program_code → list of courses with year-wise student counts
				const programMap = new Map<string, { program_code: string; program_name: string | null; program_order: number; courses: Map<string, { semester: number; course_order: number; course_code: string; course_name: string; years: Record<string, number> }> }>()

				for (const row of reportData2) {
					const co = row.course_offering
					if (!co) continue
					const programCode = co.program_code || row.program_code || ''
					const studentYear = studentYearMap.get(row.stu_register_no) || 'I Year'

					if (!programMap.has(programCode)) {
						programMap.set(programCode, {
							program_code: programCode,
							program_name: co.program_name || null,
							program_order: co.program_order ?? 999,
							courses: new Map(),
						})
					}
					const program = programMap.get(programCode)!
					const courseKey = co.course_code
					if (!program.courses.has(courseKey)) {
						program.courses.set(courseKey, {
							semester: co.semester || 0,
							course_order: co.course_order ?? 999,
							course_code: co.course_code,
							course_name: co.course_name || '',
							years: {},
						})
					}
					const course = program.courses.get(courseKey)!
					course.years[studentYear] = (course.years[studentYear] || 0) + 1
				}

				return Array.from(programMap.values())
					.sort((a, b) =>
						(a.program_order - b.program_order) ||
						a.program_code.localeCompare(b.program_code)
					)
					.map(section => ({
						program_code: section.program_code,
						program_name: section.program_name,
						courses: Array.from(section.courses.values())
							.sort((a, b) => (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code)),
					}))
			}

			case 'board-wise-exam-timetable': {
				// Board-wise exam timetable: one row per board+course with exam date & session
				const countMap = new Map<string, any>()
				for (const row of reportData2) {
					const co = row.course_offering
					if (!co) continue
					const examDate = row.exam_date || ''
					const examSession = row.exam_session || ''
					const key = `${co.board_code || ''}|${co.course_code}|${examDate}|${examSession}`
					if (!countMap.has(key)) {
						countMap.set(key, {
							board_code: co.board_code || '',
							board_name: co.board_name || '',
							board_order: co.board_order ?? 999,
							semester: co.semester || 0,
							course_order: co.course_order ?? 999,
							course_code: co.course_code,
							course_name: co.course_name || '',
							exam_date: examDate,
							exam_session: examSession,
						})
					}
				}
				return Array.from(countMap.values()).sort((a: any, b: any) =>
					(a.board_order - b.board_order) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code)
				)
			}

			case 'qp-packing-list':
			// Same preview as board-wise-exam-timetable but with count
			{
				const groupMap = new Map<string, any[]>()
				for (const row of reportData2) {
					const co = row.course_offering
					if (!co) continue
					const examDate = row.exam_date || ''
					const examSession = row.exam_session || ''
					if (!examDate || !examSession) continue
					const groupKey = `${examDate}|${examSession}`
					if (!groupMap.has(groupKey)) groupMap.set(groupKey, [])
					const courses = groupMap.get(groupKey)!
					let existing = courses.find((c: any) => c.course_code === co.course_code)
					if (!existing) {
						existing = { semester: co.semester || 0, board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', course_order: co.course_order ?? 999, registered: 0 }
						courses.push(existing)
					}
					existing.registered++
				}
				const result: any[] = []
				const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
					const [dA, sA] = a.split('|'); const [dB, sB] = b.split('|')
					const dc = new Date(dA).getTime() - new Date(dB).getTime()
					if (dc !== 0) return dc
					return (sA === 'FN' ? 0 : 1) - (sB === 'FN' ? 0 : 1)
				})
				for (const key of sortedKeys) {
					const [examDate, examSession] = key.split('|')
					const courses = groupMap.get(key)!
					courses.sort((a: any, b: any) => (a.semester - b.semester) || (a.board_order - b.board_order) || (a.course_order - b.course_order))
					result.push({ exam_date: examDate, exam_session: examSession, courses })
				}
				return result
			}

			case 'exam-date-wise-summary': {
				// Group registrations by exam_date, count FN and AN
				const dateMap = new Map<string, { exam_date: string; fn: number; an: number }>()
				for (const row of reportData2) {
					const examDate = row.exam_date
					if (!examDate) continue
					const session = row.exam_session || ''
					if (!dateMap.has(examDate)) {
						dateMap.set(examDate, { exam_date: examDate, fn: 0, an: 0 })
					}
					const entry = dateMap.get(examDate)!
					if (session === 'FN') entry.fn++
					else if (session === 'AN') entry.an++
				}
				return Array.from(dateMap.values())
					.sort((a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime())
			}

			default:
				return []
		}
	}, [filteredReportData, selectedReportType])

	// Unique year columns for year-wise reports
	const yearColumns = useMemo(() => {
		if (selectedReportType !== 'course-count-year-wise' && selectedReportType !== 'course-count-program-year-wise' && selectedReportType !== 'course-count-program-year-section') return []
		const allYears = new Set<string>()
		previewData.forEach((row: any) => {
			if (row.years) Object.keys(row.years).forEach(y => allYears.add(y))
			// For program-year-section, courses have years
			if (row.courses) row.courses.forEach((c: any) => { if (c.years) Object.keys(c.years).forEach(y => allYears.add(y)) })
		})
		const order = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
		return Array.from(allYears).sort((a, b) => order.indexOf(a) - order.indexOf(b))
	}, [previewData, selectedReportType])

	// Pagination
	const paginatedData = useMemo(() => {
		const start = (currentPage - 1) * pageSize
		return previewData.slice(start, start + pageSize)
	}, [previewData, currentPage])

	const totalPages = Math.ceil(previewData.length / pageSize) || 1

	// Display helpers
	const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
	const selectedSession = sessions.find(s => s.id === selectedSessionId)
	const currentReportOption = REPORT_OPTIONS.find(r => r.value === selectedReportType)

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
									<Link href="/dashboard">Dashboard</Link>
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
								<BreadcrumbPage>Exam Registration Report</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page Header */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
								<ClipboardCheck className="h-5 w-5 text-white" />
							</div>
							<div>
								<h1 className="text-2xl font-bold">Exam Registration Report</h1>
								<p className="text-sm text-muted-foreground">Select filters and a report type to generate exam reports</p>
							</div>
						</div>
					</div>

					{/* Filters + Report Selection — Single Card */}
					<Card>
						<CardContent className="pt-5 space-y-4">
							{/* All dropdowns in one row */}
							<div className={cn(
								"grid gap-3",
								mustSelectInstitution ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-3"
							)}>
								{/* Institution (only for super_admin with "All Institutions") */}
								{mustSelectInstitution && (
									<div className="space-y-1.5">
										<Label className="text-xs">Institution *</Label>
										<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
											<PopoverTrigger asChild>
												<Button variant="outline" role="combobox" className="w-full justify-between text-xs h-9" disabled={loadingInstitutions}>
													<span className="truncate">
														{loadingInstitutions ? 'Loading...' : selectedInstitution ? `${selectedInstitution.institution_code} - ${selectedInstitution.name}` : 'Select Institution'}
													</span>
													<ChevronsUpDown className="h-3 w-3 ml-2 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[350px] p-0">
												<Command>
													<CommandInput placeholder="Search institution..." className="h-8 text-xs" />
													<CommandList>
														<CommandEmpty className="py-2 text-xs">No institution found.</CommandEmpty>
														<CommandGroup>
															{institutions.map((inst) => (
																<CommandItem
																	key={inst.id}
																	value={`${inst.institution_code} ${inst.name}`}
																	onSelect={() => {
																		setSelectedInstitutionId(inst.id)
																		setInstitutionOpen(false)
																	}}
																	className="text-xs"
																>
																	<Check className={cn("mr-2 h-3 w-3", selectedInstitutionId === inst.id ? "opacity-100" : "opacity-0")} />
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
								{mustSelectSession && (
								<div className="space-y-1.5">
									<Label className="text-xs">Examination Session *</Label>
									<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between text-xs h-9" disabled={!selectedInstitutionId || loadingSessions}>
												<span className="truncate">
													{loadingSessions ? 'Loading...' : selectedSession ? selectedSession.session_name : 'Select Session'}
												</span>
												<ChevronsUpDown className="h-3 w-3 ml-2 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[300px] p-0">
											<Command>
												<CommandInput placeholder="Search session..." className="h-8 text-xs" />
												<CommandList>
													<CommandEmpty className="py-2 text-xs">No session found.</CommandEmpty>
													<CommandGroup>
														{sessions.map((sess) => (
															<CommandItem
																key={sess.id}
																value={sess.session_name}
																onSelect={() => {
																	setSelectedSessionId(sess.id)
																	setSessionOpen(false)
																}}
																className="text-xs"
															>
																<Check className={cn("mr-2 h-3 w-3", selectedSessionId === sess.id ? "opacity-100" : "opacity-0")} />
																{sess.session_name}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>
								)}

								{/* Course Category (multi-select) */}
								<div className="space-y-1.5">
									<Label className="text-xs">Course Category</Label>
									<Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between text-xs h-9" disabled={!selectedSessionId}>
												<span className="truncate">
													{selectedCourseCategories.length === 0
														? 'Select categories'
														: selectedCourseCategories.length === COURSE_CATEGORY_OPTIONS.length
															? 'All Categories'
															: selectedCourseCategories.join(', ')}
												</span>
												<ChevronsUpDown className="h-3 w-3 ml-2 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[220px] p-0">
											<Command>
												<CommandList>
													<CommandGroup>
														<CommandItem
															onSelect={() => {
																if (selectedCourseCategories.length === COURSE_CATEGORY_OPTIONS.length) {
																	setSelectedCourseCategories([])
																} else {
																	setSelectedCourseCategories([...COURSE_CATEGORY_OPTIONS])
																}
															}}
															className="text-xs font-medium"
														>
															<Check className={cn("mr-2 h-3 w-3", selectedCourseCategories.length === COURSE_CATEGORY_OPTIONS.length ? "opacity-100" : "opacity-0")} />
															Select All
														</CommandItem>
													</CommandGroup>
													<CommandGroup>
														{COURSE_CATEGORY_OPTIONS.map((cat) => (
															<CommandItem
																key={cat}
																value={cat}
																onSelect={() => {
																	setSelectedCourseCategories(prev =>
																		prev.includes(cat)
																			? prev.filter(c => c !== cat)
																			: [...prev, cat]
																	)
																}}
																className="text-xs"
															>
																<Check className={cn("mr-2 h-3 w-3", selectedCourseCategories.includes(cat) ? "opacity-100" : "opacity-0")} />
																{cat}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Reports Category Dropdown */}
								<div className="space-y-1.5">
									<Label className="text-xs">Reports *</Label>
									<Select
										value={selectedReportCategory}
										onValueChange={(v) => {
											setSelectedReportCategory(v as ReportCategory)
											setSelectedReportType('')
											setReportData([])
											setReportMeta(null)
										}}
									>
										<SelectTrigger className="text-xs h-9">
											<SelectValue placeholder="Select report category" />
										</SelectTrigger>
										<SelectContent>
											{REPORT_CATEGORIES.map((cat) => (
												<SelectItem key={cat.value} value={cat.value} className="text-xs">
													{cat.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							{/* Radio Buttons — shown only when category is selected, grouped by section */}
							{selectedReportCategory && (() => {
								const categoryOptions = REPORT_OPTIONS.filter(o => o.group === selectedReportCategory)
								// Group by section in first-seen order (sections optional)
								const sections: { name: string | undefined; items: typeof categoryOptions }[] = []
								for (const o of categoryOptions) {
									let sec = sections.find(s => s.name === o.section)
									if (!sec) { sec = { name: o.section, items: [] }; sections.push(sec) }
									sec.items.push(o)
								}

								const renderCard = (opt: typeof categoryOptions[number]) => {
									const isSelected = selectedReportType === opt.value
									return (
										<button
											key={opt.value}
											type="button"
											title={opt.description}
											onClick={() => handleReportTypeSelect(opt.value)}
											disabled={loadingReport}
											className={cn(
												'flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all whitespace-nowrap',
												isSelected
													? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
													: 'border-muted hover:border-muted-foreground/30 hover:bg-muted/50',
												loadingReport && !isSelected && 'opacity-50 cursor-not-allowed'
											)}
										>
											{/* Radio circle */}
											<div className={cn(
												'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
												isSelected
													? 'border-emerald-500 bg-emerald-500'
													: 'border-muted-foreground/40'
											)}>
												{isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
											</div>
											<span className={cn(
												'text-xs font-medium',
												isSelected && 'text-emerald-700 dark:text-emerald-300'
											)}>
												{opt.label}
											</span>
											{isSelected && loadingReport && (
												<Loader2 className="h-3 w-3 shrink-0 animate-spin text-emerald-500" />
											)}
										</button>
									)
								}

								return (
									<div className="space-y-3">
										{sections.map((sec) => (
											<div key={sec.name || 'default'} className="space-y-2">
												<Label className={cn('text-xs', sec.name ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
													{sec.name || 'Choose a report type'}
												</Label>
												<div className="flex flex-wrap gap-2">
													{sec.items.map(renderCard)}
												</div>
											</div>
										))}
									</div>
								)
							})()}

							{/* Download Buttons — shown when report is generated */}
							{selectedReportType && reportData.length > 0 && reportMeta && (
								<div className="border-t pt-4">
									<div className="flex items-center gap-3 flex-wrap">
										<Badge variant="outline" className="text-xs">
											{reportMeta.institution_code} - {reportMeta.institution_name}
										</Badge>
										<Badge variant="outline" className="text-xs">
											{reportMeta.session_name}
										</Badge>
										<Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
											<Users className="h-3 w-3 mr-1" />
											{isStudentReport
												? `${uniqueStudentCount} students`
												: filteredReportData.length !== reportData.length
													? `${filteredReportData.length} / ${reportData.length} records`
													: `${reportData.length} records`
											}
										</Badge>
										<div className="ml-auto flex items-center gap-2">
											<Button
												size="sm"
												onClick={handleExportPdf}
												disabled={exportingPdf}
												className="gap-2 bg-red-600 hover:bg-red-700 text-white"
											>
												{exportingPdf ? (
													<Loader2 className="h-4 w-4 animate-spin" />
												) : (
													<FileText className="h-4 w-4" />
												)}
												PDF
											</Button>
											<Button
												size="sm"
												onClick={handleExportExcel}
												disabled={exportingExcel}
												className="gap-2 bg-green-600 hover:bg-green-700 text-white"
											>
												{exportingExcel ? (
													<Loader2 className="h-4 w-4 animate-spin" />
												) : (
													<FileSpreadsheet className="h-4 w-4" />
												)}
												Excel
											</Button>
										</div>
									</div>
								</div>
							)}

							{/* Hint: filters not set */}
							{selectedReportType && (!selectedInstitutionId || !selectedSessionId) && (
								<p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
									<Filter className="h-3 w-3" />
									Select Institution and Examination Session above to generate this report.
								</p>
							)}
						</CardContent>
					</Card>

					{/* Preview Table */}
					{previewData.length > 0 && (
						<Card>
							<CardHeader className="pb-3">
								<CardTitle className="text-sm">Preview: {currentReportOption?.label}</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="rounded-md border overflow-x-auto">
									{(selectedReportType === 'student-fee-details' || selectedReportType === 'student-exam-registration' || selectedReportType === 'student-exam-registration-summary' || selectedReportType === 'student-wise-application' || selectedReportType === 'student-wise-registration') && (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-center w-12">S.No</TableHead>
													<TableHead className="text-center">Register No</TableHead>
													<TableHead>Name</TableHead>
													<TableHead className="text-center">DOB</TableHead>
													<TableHead className="text-center">Courses</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{paginatedData.length === 0 ? (
													<TableRow>
														<TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No data</TableCell>
													</TableRow>
												) : (
													paginatedData.map((row: any, idx: number) => (
														<TableRow key={idx}>
															<TableCell className="text-center text-xs">{(currentPage - 1) * pageSize + idx + 1}</TableCell>
															<TableCell className="text-center text-xs font-medium">{row.regNo}</TableCell>
															<TableCell className="text-xs">{row.name}</TableCell>
															<TableCell className="text-center text-xs">{row.dob || '-'}</TableCell>
															<TableCell className="text-center text-xs font-semibold">{row.courses.length}</TableCell>
														</TableRow>
													))
												)}
											</TableBody>
										</Table>
									)}

									{selectedReportType === 'course-count-regular-arrear' && (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-center w-12">S.No</TableHead>
													<TableHead className="text-center">Board</TableHead>
													<TableHead className="text-center w-14">Sem</TableHead>
													<TableHead className="text-center">Course Code</TableHead>
													<TableHead>Course Name</TableHead>
													<TableHead className="text-center">Regular</TableHead>
													<TableHead className="text-center">Arrear</TableHead>
													<TableHead className="text-center">Total</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{paginatedData.length === 0 ? (
													<TableRow>
														<TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No data</TableCell>
													</TableRow>
												) : (
													paginatedData.map((row: any, idx: number) => (
														<TableRow key={idx}>
															<TableCell className="text-center text-xs">{(currentPage - 1) * pageSize + idx + 1}</TableCell>
															<TableCell className="text-center text-xs max-w-[150px] break-words">{row.board_code ? `${row.board_code}${row.board_name ? ` - ${row.board_name}` : ''}` : '-'}</TableCell>
															<TableCell className="text-center text-xs">{row.semester ? toRoman(row.semester) : '-'}</TableCell>
															<TableCell className="text-center text-xs font-medium">{row.course_code}</TableCell>
															<TableCell className="text-xs max-w-[200px] break-words">{row.course_name || '-'}</TableCell>
															<TableCell className="text-center text-xs">{row.regular}</TableCell>
															<TableCell className="text-center text-xs">{row.arrear}</TableCell>
															<TableCell className="text-center text-xs font-semibold">{row.regular + row.arrear}</TableCell>
														</TableRow>
													))
												)}
											</TableBody>
										</Table>
									)}

									{selectedReportType === 'course-count-year-wise' && (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-center w-12">S.No</TableHead>
													<TableHead className="text-center">Board</TableHead>
													<TableHead className="text-center w-14">Sem</TableHead>
													<TableHead className="text-center">Course Code</TableHead>
													<TableHead className="text-center">Course Name</TableHead>
													{yearColumns.map(y => (
														<TableHead key={y} className="text-center">{y}</TableHead>
													))}
													<TableHead className="text-center">Total</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{paginatedData.length === 0 ? (
													<TableRow>
														<TableCell colSpan={6 + yearColumns.length} className="text-center py-8 text-muted-foreground">No data</TableCell>
													</TableRow>
												) : (
													paginatedData.map((row: any, idx: number) => {
														const total = yearColumns.reduce((sum, y) => sum + (row.years[y] || 0), 0)
														return (
															<TableRow key={idx}>
																<TableCell className="text-center text-xs">{(currentPage - 1) * pageSize + idx + 1}</TableCell>
																<TableCell className="text-center text-xs max-w-[150px] break-words">{row.board_code ? `${row.board_code}${row.board_name ? ` - ${row.board_name}` : ''}` : '-'}</TableCell>
																<TableCell className="text-center text-xs">{row.semester ? toRoman(row.semester) : '-'}</TableCell>
																<TableCell className="text-center text-xs font-medium">{row.course_code}</TableCell>
																<TableCell className="text-xs max-w-[200px] break-words">{row.course_name || '-'}</TableCell>
																{yearColumns.map(y => (
																	<TableCell key={y} className="text-center text-xs">{row.years[y] || 0}</TableCell>
																))}
																<TableCell className="text-center text-xs font-semibold">{total}</TableCell>
															</TableRow>
														)
													})
												)}
											</TableBody>
										</Table>
									)}

									{selectedReportType === 'course-count-program-year-wise' && (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-center w-12">S.No</TableHead>
													<TableHead className="text-center">Board</TableHead>
													<TableHead className="text-center">Program</TableHead>
													<TableHead className="text-center w-14">Sem</TableHead>
													<TableHead className="text-center">Course Code</TableHead>
													<TableHead className="text-center">Course Name</TableHead>
													{yearColumns.map(y => (
														<TableHead key={y} className="text-center">{y}</TableHead>
													))}
													<TableHead className="text-center">Total</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{paginatedData.length === 0 ? (
													<TableRow>
														<TableCell colSpan={7 + yearColumns.length} className="text-center py-8 text-muted-foreground">No data</TableCell>
													</TableRow>
												) : (
													paginatedData.map((row: any, idx: number) => {
														const total = yearColumns.reduce((sum, y) => sum + (row.years[y] || 0), 0)
														return (
															<TableRow key={idx}>
																<TableCell className="text-center text-xs">{(currentPage - 1) * pageSize + idx + 1}</TableCell>
																<TableCell className="text-center text-xs max-w-[150px] break-words">{row.board_code ? `${row.board_code}${row.board_name ? ` - ${row.board_name}` : ''}` : '-'}</TableCell>
																<TableCell className="text-center text-xs">{row.program_code || '-'}</TableCell>
																<TableCell className="text-center text-xs">{row.semester ? toRoman(row.semester) : '-'}</TableCell>
																<TableCell className="text-center text-xs font-medium">{row.course_code}</TableCell>
																<TableCell className="text-xs max-w-[200px] break-words">{row.course_name || '-'}</TableCell>
																{yearColumns.map(y => (
																	<TableCell key={y} className="text-center text-xs">{row.years[y] || 0}</TableCell>
																))}
																<TableCell className="text-center text-xs font-semibold">{total}</TableCell>
															</TableRow>
														)
													})
												)}
											</TableBody>
										</Table>
									)}

									{selectedReportType === 'course-count-program-year-section' && (
										<div className="space-y-6">
											{previewData.length === 0 ? (
												<div className="text-center py-8 text-muted-foreground">No data</div>
											) : (
												previewData.map((section: any, sIdx: number) => (
													<div key={section.program_code} className="border rounded-lg overflow-hidden">
														<div className="bg-slate-100 dark:bg-slate-800 px-4 py-2">
															<span className="font-semibold text-sm">
																Program & Branch : {section.program_code}{section.program_name ? ` - ${section.program_name}` : ''}
															</span>
														</div>
														<Table>
															<TableHeader>
																<TableRow>
																	<TableHead className="text-center w-12">S.No</TableHead>
																	<TableHead className="text-center w-14">Sem</TableHead>
																	<TableHead className="text-center">Course Code</TableHead>
																	<TableHead>Course Name</TableHead>
																	{yearColumns.map(y => (
																		<TableHead key={y} className="text-center w-20">{y}</TableHead>
																	))}
																	<TableHead className="text-center w-16">Total</TableHead>
																</TableRow>
															</TableHeader>
															<TableBody>
																{section.courses.map((course: any, cIdx: number) => {
																	const total = yearColumns.reduce((sum: number, y: string) => sum + (course.years[y] || 0), 0)
																	return (
																		<TableRow key={course.course_code}>
																			<TableCell className="text-center text-xs">{cIdx + 1}</TableCell>
																			<TableCell className="text-center text-xs">{toRoman(course.semester)}</TableCell>
																			<TableCell className="text-center text-xs font-medium">{course.course_code}</TableCell>
																			<TableCell className="text-xs">{course.course_name}</TableCell>
																			{yearColumns.map(y => (
																				<TableCell key={y} className="text-center text-xs">{course.years[y] || 0}</TableCell>
																			))}
																			<TableCell className="text-center text-xs font-semibold">{total}</TableCell>
																		</TableRow>
																	)
																})}
															</TableBody>
														</Table>
													</div>
												))
											)}
										</div>
									)}

									{selectedReportType === 'board-wise-exam-timetable' && (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-center w-12">S.No</TableHead>
													<TableHead className="text-center">Board</TableHead>
													<TableHead className="text-center">Exam Date</TableHead>
													<TableHead className="text-center w-14">Session</TableHead>
													<TableHead className="text-center w-14">Sem</TableHead>
													<TableHead className="text-center">Course Code</TableHead>
													<TableHead>Course Name</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{paginatedData.length === 0 ? (
													<TableRow>
														<TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No data</TableCell>
													</TableRow>
												) : (
													paginatedData.map((row: any, idx: number) => (
														<TableRow key={idx}>
															<TableCell className="text-center text-xs">{(currentPage - 1) * pageSize + idx + 1}</TableCell>
															<TableCell className="text-center text-xs max-w-[150px] break-words">{row.board_code ? `${row.board_code}${row.board_name ? ` - ${row.board_name}` : ''}` : '-'}</TableCell>
															<TableCell className="text-center text-xs">{row.exam_date || '-'}</TableCell>
															<TableCell className="text-center text-xs">{row.exam_session || '-'}</TableCell>
															<TableCell className="text-center text-xs">{row.semester ? toRoman(row.semester) : '-'}</TableCell>
															<TableCell className="text-center text-xs font-medium">{row.course_code}</TableCell>
															<TableCell className="text-xs max-w-[200px] break-words">{row.course_name || '-'}</TableCell>
														</TableRow>
													))
												)}
											</TableBody>
										</Table>
									)}

									{selectedReportType === 'qp-packing-list' && (
										<div className="space-y-6">
											{previewData.length === 0 ? (
												<div className="text-center py-8 text-muted-foreground">No data</div>
											) : (
												previewData.map((group: any) => (
													<div key={`${group.exam_date}-${group.exam_session}`} className="border rounded-lg overflow-hidden">
														<div className="bg-slate-100 dark:bg-slate-800 px-4 py-2">
															<span className="font-semibold text-sm">
																Exam Date : {group.exam_date} &nbsp;&nbsp; Session : {group.exam_session}
															</span>
														</div>
														<Table>
															<TableHeader>
																<TableRow>
																	<TableHead className="text-center w-12">S.No</TableHead>
																	<TableHead className="text-center w-14">Sem</TableHead>
																	<TableHead className="text-center">Board</TableHead>
																	<TableHead className="text-center">Course Code</TableHead>
																	<TableHead>Course Name</TableHead>
																	<TableHead className="text-center w-20">QP Count</TableHead>
																</TableRow>
															</TableHeader>
															<TableBody>
																{group.courses.map((c: any, idx: number) => (
																	<TableRow key={c.course_code}>
																		<TableCell className="text-center text-xs">{idx + 1}</TableCell>
																		<TableCell className="text-center text-xs">{toRoman(c.semester)}</TableCell>
																		<TableCell className="text-center text-xs">{c.board_code}</TableCell>
																		<TableCell className="text-center text-xs font-medium">{c.course_code}</TableCell>
																		<TableCell className="text-xs">{c.course_name}</TableCell>
																		<TableCell className="text-center text-xs font-semibold">{c.registered}</TableCell>
																	</TableRow>
																))}
																<TableRow>
																	<TableCell colSpan={5} className="text-right text-xs font-bold">Total :</TableCell>
																	<TableCell className="text-center text-xs font-bold">{group.courses.reduce((s: number, c: any) => s + c.registered, 0)}</TableCell>
																</TableRow>
															</TableBody>
														</Table>
													</div>
												))
											)}
										</div>
									)}

									{selectedReportType === 'exam-date-wise-summary' && (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-center w-12">S.No</TableHead>
													<TableHead className="text-center">Exam Date</TableHead>
													<TableHead className="text-center w-24">FN</TableHead>
													<TableHead className="text-center w-24">AN</TableHead>
													<TableHead className="text-center w-24">Total</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{paginatedData.length === 0 ? (
													<TableRow>
														<TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No data</TableCell>
													</TableRow>
												) : (
													paginatedData.map((row: any, idx: number) => (
														<TableRow key={idx}>
															<TableCell className="text-center text-xs">{(currentPage - 1) * pageSize + idx + 1}</TableCell>
															<TableCell className="text-center text-xs">{row.exam_date || '-'}</TableCell>
															<TableCell className="text-center text-xs">{row.fn}</TableCell>
															<TableCell className="text-center text-xs">{row.an}</TableCell>
															<TableCell className="text-center text-xs font-semibold">{row.fn + row.an}</TableCell>
														</TableRow>
													))
												)}
											</TableBody>
										</Table>
									)}
								</div>

								{/* Pagination */}
								{totalPages > 1 && (
									<div className="flex items-center justify-between mt-4">
										<p className="text-xs text-muted-foreground">
											Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, previewData.length)} of {previewData.length} rows
										</p>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="icon"
												className="h-7 w-7"
												onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
												disabled={currentPage === 1}
											>
												<ChevronLeft className="h-4 w-4" />
											</Button>
											<span className="text-xs">
												Page {currentPage} of {totalPages}
											</span>
											<Button
												variant="outline"
												size="icon"
												className="h-7 w-7"
												onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
												disabled={currentPage === totalPages}
											>
												<ChevronRight className="h-4 w-4" />
											</Button>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					)}

					{/* Empty State */}
					{reportData.length === 0 && !loadingReport && (
						<Card>
							<CardContent className="py-16">
								<div className="flex flex-col items-center justify-center text-center">
									<div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
										<ClipboardCheck className="h-8 w-8 text-muted-foreground" />
									</div>
									<h3 className="text-lg font-semibold mb-1">No Report Generated</h3>
									<p className="text-sm text-muted-foreground max-w-md">
										Select an Institution and Examination Session, choose a report category, then pick a report type to generate automatically.
									</p>
								</div>
							</CardContent>
						</Card>
					)}
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
