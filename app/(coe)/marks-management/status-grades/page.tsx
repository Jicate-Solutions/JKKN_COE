'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/hooks/common/use-toast'
import {
	ClipboardCheck,
	Save,
	Check,
	ChevronsUpDown,
	Upload,
	Download,
	Users,
	Search,
	RefreshCw,
	Loader2,
	AlertTriangle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { StatusGradeDropdown, StatusGradeBadge } from '@/components/marks/status-grade-dropdown'
import { StatusGradeImportDialog } from '@/components/marks/status-grade-import-dialog'
import { BulkStatusUpdateDialog } from '@/components/marks/bulk-status-update-dialog'
import XLSX from '@/lib/utils/excel-compat'
import {
	VALID_STATUS_GRADES,
	type StatusGradeValue,
	type StatusGradeRow,
	type StatusType,
	type InstitutionOption,
	type SessionOption,
	type ProgramOption,
	type CourseOption
} from '@/types/status-grades'

// =========================================================
// Page Component
// =========================================================

export default function StatusGradesPage() {
	const { toast } = useToast()

	// Institution filter hook
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId: contextInstitutionId
	} = useInstitutionFilter()

	// =========================================================
	// Dropdown State
	// =========================================================
	const [institutions, setInstitutions] = useState<InstitutionOption[]>([])
	const [sessions, setSessions] = useState<SessionOption[]>([])
	const [programs, setPrograms] = useState<ProgramOption[]>([])
	const [courses, setCourses] = useState<CourseOption[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('')
	const [selectedSessionId, setSelectedSessionId] = useState<string>('')
	const [selectedProgramId, setSelectedProgramId] = useState<string>('')
	const [selectedCourseId, setSelectedCourseId] = useState<string>('')
	const [statusType, setStatusType] = useState<StatusType>('internal')

	// Combobox open states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [savingAll, setSavingAll] = useState(false)

	// =========================================================
	// Data State
	// =========================================================
	const [students, setStudents] = useState<StatusGradeRow[]>([])
	const [courseInfo, setCourseInfo] = useState<{
		course_code: string
		course_title: string
		evaluation_type: string
		result_type: string
	} | null>(null)
	const [searchTerm, setSearchTerm] = useState('')

	// Dialog states
	const [importDialogOpen, setImportDialogOpen] = useState(false)
	const [bulkUpdateDialogOpen, setBulkUpdateDialogOpen] = useState(false)

	// Effective institution ID
	const effectiveInstitutionId = selectedInstitutionId || contextInstitutionId

	// =========================================================
	// Computed
	// =========================================================
	const hasUnsavedChanges = useMemo(
		() => students.some(s => s.is_modified),
		[students]
	)

	const modifiedCount = useMemo(
		() => students.filter(s => s.is_modified).length,
		[students]
	)

	const filteredStudents = useMemo(() => {
		if (!searchTerm) return students
		const term = searchTerm.toLowerCase()
		return students.filter(s =>
			s.register_no.toLowerCase().includes(term) ||
			s.student_name.toLowerCase().includes(term)
		)
	}, [students, searchTerm])

	// =========================================================
	// Auto-fill institution for non-admin users
	// =========================================================
	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId])

	// Load institutions for admin
	useEffect(() => {
		if (isReady && mustSelectInstitution) {
			loadInstitutions()
		}
	}, [isReady, mustSelectInstitution])

	// Load sessions when institution changes
	useEffect(() => {
		if (isReady && effectiveInstitutionId) {
			loadSessions(effectiveInstitutionId)
			resetDependentFields(['session', 'program', 'course'])
		}
	}, [isReady, effectiveInstitutionId])

	// Load programs when session changes
	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId) {
			loadPrograms(effectiveInstitutionId, statusType, selectedSessionId)
			loadCourses(effectiveInstitutionId, selectedSessionId, statusType, selectedProgramId)
			resetDependentFields(['course'])
		}
	}, [isReady, selectedSessionId])

	// Load courses when program changes
	useEffect(() => {
		if (isReady && effectiveInstitutionId && selectedSessionId) {
			loadCourses(effectiveInstitutionId, selectedSessionId, statusType, selectedProgramId)
		}
	}, [selectedProgramId])

	// Reload programs and courses when status type changes
	useEffect(() => {
		if (isReady && effectiveInstitutionId && selectedSessionId) {
			loadPrograms(effectiveInstitutionId, statusType, selectedSessionId)
			loadCourses(effectiveInstitutionId, selectedSessionId, statusType, selectedProgramId)
			resetDependentFields(['program', 'course'])
		}
	}, [statusType])

	// =========================================================
	// Reset helpers
	// =========================================================
	const resetDependentFields = (fields: string[]) => {
		if (fields.includes('session')) {
			setSelectedSessionId('')
			setSessions([])
		}
		if (fields.includes('program')) {
			setSelectedProgramId('')
			setPrograms([])
		}
		if (fields.includes('course')) {
			setSelectedCourseId('')
			setCourses([])
		}
		setStudents([])
		setCourseInfo(null)
		setSearchTerm('')
	}

	// =========================================================
	// Data Loading
	// =========================================================
	const loadInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/marks/status-grades?action=institutions')
			const res = await fetch(url)
			if (!res.ok) throw new Error('Failed to load institutions')
			const data = await res.json()
			setInstitutions(data)
		} catch {
			toast({ title: 'Error', description: 'Failed to load institutions', variant: 'destructive' })
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, toast])

	const loadSessions = useCallback(async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			const res = await fetch(`/api/marks/status-grades?action=sessions&institutionId=${institutionId}`)
			if (!res.ok) throw new Error('Failed to load sessions')
			const data = await res.json()
			setSessions(data)
		} catch {
			toast({ title: 'Error', description: 'Failed to load examination sessions', variant: 'destructive' })
		} finally {
			setLoadingSessions(false)
		}
	}, [toast])

	const loadPrograms = useCallback(async (institutionId: string, statusTypeFilter: StatusType, sessionId?: string) => {
		try {
			setLoadingPrograms(true)
			// Map 'internal' to 'Internal' and 'external' to 'External' for API
			const statusTypeParam = statusTypeFilter === 'internal' ? 'Internal' : 'External'
			let url = `/api/marks/status-grades?action=programs&institutionId=${institutionId}&statusType=${statusTypeParam}`
			if (sessionId) url += `&sessionId=${sessionId}`
			const res = await fetch(url)
			if (!res.ok) throw new Error('Failed to load programs')
			const data = await res.json()
			setPrograms(data)
		} catch {
			toast({ title: 'Error', description: 'Failed to load programs', variant: 'destructive' })
		} finally {
			setLoadingPrograms(false)
		}
	}, [toast])

	const loadCourses = useCallback(async (institutionId: string, sessionId: string, statusTypeFilter: StatusType, programId?: string) => {
		try {
			setLoadingCourses(true)
			// Map 'internal' to 'Internal' and 'external' to 'External' for API
			const statusTypeParam = statusTypeFilter === 'internal' ? 'Internal' : 'External'
			let url = `/api/marks/status-grades?action=courses&institutionId=${institutionId}&sessionId=${sessionId}&statusType=${statusTypeParam}`
			if (programId) url += `&programId=${programId}`
			const res = await fetch(url)
			if (!res.ok) throw new Error('Failed to load courses')
			const data = await res.json()
			setCourses(data)
		} catch {
			toast({ title: 'Error', description: 'Failed to load status courses', variant: 'destructive' })
		} finally {
			setLoadingCourses(false)
		}
	}, [toast])

	const loadStudents = useCallback(async () => {
		if (!effectiveInstitutionId || !selectedSessionId || !selectedCourseId) {
			toast({
				title: 'Selection Required',
				description: 'Please select Institution, Session, and Course',
				variant: 'destructive'
			})
			return
		}

		try {
			setLoadingStudents(true)
			setStudents([])
			setCourseInfo(null)

			const url = `/api/marks/status-grades?institutions_id=${effectiveInstitutionId}&examination_session_id=${selectedSessionId}&course_id=${selectedCourseId}&status_type=${statusType}`
			const res = await fetch(url)

			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error || 'Failed to load students')
			}

			const data = await res.json()
			setStudents(data.students || [])
			setCourseInfo(data.course_info || null)

			toast({
				title: 'Learners Loaded',
				description: `Loaded ${data.students?.length || 0} learners for ${data.course_info?.course_code || 'course'}`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (err: any) {
			toast({
				title: 'Error',
				description: err.message || 'Failed to load students',
				variant: 'destructive'
			})
		} finally {
			setLoadingStudents(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, selectedCourseId, statusType, toast])

	// =========================================================
	// Grade Editing
	// =========================================================
	const handleGradeChange = useCallback((index: number, grade: StatusGradeValue) => {
		setStudents(prev => {
			const updated = [...prev]
			const student = { ...updated[index] }
			student.new_grade = grade
			student.is_modified = grade !== (student.current_grade || '')
			student.error = null
			updated[index] = student
			return updated
		})
	}, [])

	const handleResetRow = useCallback((index: number) => {
		setStudents(prev => {
			const updated = [...prev]
			const student = { ...updated[index] }
			student.new_grade = ''
			student.is_modified = false
			student.error = null
			updated[index] = student
			return updated
		})
	}, [])

	// =========================================================
	// Save Individual
	// =========================================================
	const handleSaveRow = useCallback(async (index: number) => {
		const student = students[index]
		if (!student.new_grade || !student.is_modified) return

		setStudents(prev => {
			const updated = [...prev]
			updated[index] = { ...updated[index], is_saving: true, error: null }
			return updated
		})

		try {
			const res = await fetch('/api/marks/status-grades', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					student_id: student.student_id,
					exam_registration_id: student.exam_registration_id,
					course_id: student.course_id,
					examination_session_id: selectedSessionId,
					institutions_id: effectiveInstitutionId,
					status_type: statusType,
					grade: student.new_grade
				})
			})

			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error || 'Failed to save')
			}

			setStudents(prev => {
				const updated = [...prev]
				updated[index] = {
					...updated[index],
					current_grade: student.new_grade as StatusGradeValue,
					is_modified: false,
					is_saving: false,
					error: null
				}
				return updated
			})

			toast({
				title: 'Grade Saved',
				description: `Saved grade for ${student.register_no}`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (err: any) {
			setStudents(prev => {
				const updated = [...prev]
				updated[index] = {
					...updated[index],
					is_saving: false,
					error: err.message || 'Failed to save'
				}
				return updated
			})

			toast({
				title: 'Save Failed',
				description: err.message || 'Failed to save grade',
				variant: 'destructive'
			})
		}
	}, [students, selectedSessionId, effectiveInstitutionId, statusType, toast])

	// =========================================================
	// Save All Modified
	// =========================================================
	const handleSaveAll = useCallback(async () => {
		const modifiedStudents = students.filter(s => s.is_modified && s.new_grade)
		if (modifiedStudents.length === 0) {
			toast({ title: 'No Changes', description: 'No modified grades to save', variant: 'destructive' })
			return
		}

		setSavingAll(true)
		try {
			const res = await fetch('/api/marks/status-grades', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: effectiveInstitutionId,
					examination_session_id: selectedSessionId,
					course_id: selectedCourseId,
					status_type: statusType,
					grades: modifiedStudents.map(s => ({
						student_id: s.student_id,
						exam_registration_id: s.exam_registration_id,
						grade: s.new_grade,
						register_no: s.register_no
					}))
				})
			})

			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error || 'Failed to save grades')
			}

			const result = await res.json()

			// Update local state
			setStudents(prev => prev.map(s => {
				if (s.is_modified && s.new_grade) {
					// Check if this student had an error
					const hasError = result.errors?.find((e: any) => e.student_id === s.student_id)
					if (hasError) {
						return { ...s, error: hasError.error, is_saving: false }
					}
					return {
						...s,
						current_grade: s.new_grade as StatusGradeValue,
						is_modified: false,
						is_saving: false,
						error: null
					}
				}
				return s
			}))

			toast({
				title: 'Grades Saved',
				description: `${result.successful} of ${result.total} grades saved successfully${result.failed > 0 ? `. ${result.failed} failed.` : ''}`,
				className: result.failed > 0
					? 'bg-amber-50 border-amber-200 text-amber-800'
					: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (err: any) {
			toast({
				title: 'Save Failed',
				description: err.message || 'Failed to save grades',
				variant: 'destructive'
			})
		} finally {
			setSavingAll(false)
		}
	}, [students, effectiveInstitutionId, selectedSessionId, selectedCourseId, statusType, toast])

	// =========================================================
	// Import Handler
	// =========================================================
	const handleImport = useCallback(async (grades: { register_no: string; grade: string }[]) => {
		const res = await fetch('/api/marks/status-grades/import', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				institutions_id: effectiveInstitutionId,
				examination_session_id: selectedSessionId,
				course_id: selectedCourseId,
				status_type: statusType,
				grades
			})
		})

		if (!res.ok) {
			const err = await res.json()
			throw new Error(err.error || 'Import failed')
		}

		const result = await res.json()

		toast({
			title: 'Import Complete',
			description: `${result.successful} of ${result.total} grades imported${result.failed > 0 ? `. ${result.failed} failed.` : ''}`,
			className: result.failed > 0
				? 'bg-amber-50 border-amber-200 text-amber-800'
				: 'bg-green-50 border-green-200 text-green-800'
		})

		// Reload students to reflect changes
		await loadStudents()
	}, [effectiveInstitutionId, selectedSessionId, selectedCourseId, statusType, toast, loadStudents])

	// =========================================================
	// Bulk Update Handler
	// =========================================================
	const handleBulkApply = useCallback(async (studentIds: string[], grade: StatusGradeValue) => {
		// Update local state first (optimistic)
		setStudents(prev => prev.map(s => {
			if (studentIds.includes(s.student_id)) {
				return {
					...s,
					new_grade: grade,
					is_modified: grade !== (s.current_grade || '')
				}
			}
			return s
		}))

		toast({
			title: 'Grades Applied',
			description: `Applied "${grade}" to ${studentIds.length} students. Click "Save All" to persist.`,
			className: 'bg-blue-50 border-blue-200 text-blue-800'
		})
	}, [toast])

	// =========================================================
	// Export Handlers
	// =========================================================
	const handleExportTemplate = useCallback(async () => {
		if (!effectiveInstitutionId || !selectedSessionId || !selectedCourseId) return

		try {
			const res = await fetch(
				`/api/marks/status-grades/export?institutions_id=${effectiveInstitutionId}&examination_session_id=${selectedSessionId}&course_id=${selectedCourseId}&status_type=${statusType}&mode=template`
			)

			if (!res.ok) throw new Error('Failed to export template')

			const data = await res.json()
			const rows = data.rows || []

			if (rows.length === 0) {
				toast({ title: 'No Data', description: 'No students found for this course', variant: 'destructive' })
				return
			}

			// Generate Excel file with ExcelJS
			const ws = XLSX.utils.json_to_sheet(rows)

			// Set column widths
			ws['!cols'] = [
				{ wch: 18 }, // Register No
				{ wch: 30 }, // Student Name
				{ wch: 20 }, // Current Grade
				{ wch: 20 }  // New Grade
			]

			// Add data validation for New Grade column
			ws['!dataValidation'] = [
				{
					type: 'list',
					sqref: `D2:D${rows.length + 1}`,
					formula1: `"${VALID_STATUS_GRADES.join(',')}"`,
					showDropDown: true,
					showErrorMessage: true,
					errorTitle: 'Invalid Grade',
					error: `Grade must be one of: ${VALID_STATUS_GRADES.join(', ')}`
				}
			]

			const wb = XLSX.utils.book_new()
			XLSX.utils.book_append_sheet(wb, ws, 'Status Grades')

			const courseCode = data.course_info?.course_code || 'STATUS'
			await XLSX.writeFile(wb, `Status_Grades_Template_${courseCode}.xlsx`)

			toast({
				title: 'Template Downloaded',
				description: `Template exported for ${courseCode}`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (err: any) {
			toast({
				title: 'Export Failed',
				description: err.message || 'Failed to export template',
				variant: 'destructive'
			})
		}
	}, [effectiveInstitutionId, selectedSessionId, selectedCourseId, statusType, toast])

	const handleExportCurrent = useCallback(async () => {
		if (!effectiveInstitutionId || !selectedSessionId || !selectedCourseId) return

		try {
			const res = await fetch(
				`/api/marks/status-grades/export?institutions_id=${effectiveInstitutionId}&examination_session_id=${selectedSessionId}&course_id=${selectedCourseId}&status_type=${statusType}&mode=current`
			)

			if (!res.ok) throw new Error('Failed to export data')

			const data = await res.json()
			const rows = data.rows || []

			if (rows.length === 0) {
				toast({ title: 'No Data', description: 'No data to export', variant: 'destructive' })
				return
			}

			const ws = XLSX.utils.json_to_sheet(rows)
			ws['!cols'] = [
				{ wch: 18 },
				{ wch: 30 },
				{ wch: 20 },
				{ wch: 20 }
			]

			const wb = XLSX.utils.book_new()
			XLSX.utils.book_append_sheet(wb, ws, 'Status Grades')

			const courseCode = data.course_info?.course_code || 'STATUS'
			await XLSX.writeFile(wb, `Status_Grades_Current_${courseCode}.xlsx`)

			toast({
				title: 'Data Exported',
				description: `Current grades exported for ${courseCode}`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (err: any) {
			toast({
				title: 'Export Failed',
				description: err.message || 'Failed to export data',
				variant: 'destructive'
			})
		}
	}, [effectiveInstitutionId, selectedSessionId, selectedCourseId, statusType, toast])

	// =========================================================
	// Unsaved changes warning
	// =========================================================
	useEffect(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (hasUnsavedChanges) {
				e.preventDefault()
				e.returnValue = ''
			}
		}
		window.addEventListener('beforeunload', handleBeforeUnload)
		return () => window.removeEventListener('beforeunload', handleBeforeUnload)
	}, [hasUnsavedChanges])

	// =========================================================
	// Render
	// =========================================================
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
									<Link href="#">Marks Management</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Status Grades</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex-1 p-4 space-y-4 overflow-auto">
					{/* Page Header */}
					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
							<ClipboardCheck className="h-5 w-5 text-violet-600 dark:text-violet-400" />
						</div>
						<div>
							<h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-grotesk">
								Status Grade Entry
							</h1>
							<p className="text-xs text-muted-foreground">
								Manage grades for status-based papers (Commended, Highly Commended, AAA)
							</p>
						</div>
					</div>

					{/* Loading state */}
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

					{/* Filters Section */}
					{isReady && (
						<Card className="shadow-sm">
							<CardContent className="p-3">
								<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
									{/* Institution - only for super_admin */}
									{mustSelectInstitution && (
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">
												Institution <span className="text-red-500">*</span>
											</Label>
											<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
												<PopoverTrigger asChild>
													<Button
														variant="outline"
														role="combobox"
														className="w-full justify-between h-9 text-left text-xs truncate"
														disabled={loadingInstitutions}
													>
														<span className="flex-1 pr-2 truncate">
															{selectedInstitutionId
																? institutions.find(i => i.id === selectedInstitutionId)?.name
																: loadingInstitutions ? 'Loading...' : 'Select institution...'}
														</span>
														<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[400px] p-0" align="start">
													<Command>
														<CommandInput placeholder="Search institution..." className="h-8 text-xs" />
														<CommandEmpty className="text-xs py-4">No institution found.</CommandEmpty>
														<CommandGroup className="max-h-56 overflow-auto">
															{institutions.map(inst => (
																<CommandItem
																	key={inst.id}
																	value={`${inst.institution_code} ${inst.name}`}
																	onSelect={() => {
																		setSelectedInstitutionId(inst.id)
																		setInstitutionOpen(false)
																	}}
																	className="py-2 text-xs"
																>
																	<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', selectedInstitutionId === inst.id ? 'opacity-100' : 'opacity-0')} />
																	<span className="flex-1 line-clamp-2">{inst.institution_code} - {inst.name}</span>
																</CommandItem>
															))}
														</CommandGroup>
													</Command>
												</PopoverContent>
											</Popover>
										</div>
									)}

									{/* Exam Session */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">
											Exam Session <span className="text-red-500">*</span>
										</Label>
										<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													className="w-full justify-between h-9 text-left text-xs truncate"
													disabled={!effectiveInstitutionId || loadingSessions}
												>
													<span className="flex-1 pr-2 truncate">
														{selectedSessionId
															? sessions.find(s => s.id === selectedSessionId)?.session_name
															: loadingSessions ? 'Loading...' : 'Select session...'}
													</span>
													<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[350px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search session..." className="h-8 text-xs" />
													<CommandEmpty className="text-xs py-4">No session found.</CommandEmpty>
													<CommandGroup className="max-h-56 overflow-auto">
														{sessions.map(session => (
															<CommandItem
																key={session.id}
																value={`${session.session_code} ${session.session_name}`}
																onSelect={() => {
																	setSelectedSessionId(session.id)
																	setSessionOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', selectedSessionId === session.id ? 'opacity-100' : 'opacity-0')} />
																<span className="flex-1 line-clamp-2">{session.session_code} - {session.session_name}</span>
															</CommandItem>
														))}
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									{/* Program (mandatory filter) */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Program *</Label>
										<Popover open={programOpen} onOpenChange={setProgramOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													className="w-full justify-between h-9 text-left text-xs truncate"
													disabled={!selectedSessionId || loadingPrograms}
												>
													<span className="flex-1 pr-2 truncate">
														{selectedProgramId
															? programs.find(p => p.id === selectedProgramId)?.program_name
															: loadingPrograms ? 'Loading...' : 'All programs...'}
													</span>
													<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[350px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search program..." className="h-8 text-xs" />
													<CommandEmpty className="text-xs py-4">No program found.</CommandEmpty>
													<CommandGroup className="max-h-56 overflow-auto">
														<CommandItem
															value="__all__"
															onSelect={() => {
																setSelectedProgramId('')
																setProgramOpen(false)
															}}
															className="py-2 text-xs"
														>
															<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', !selectedProgramId ? 'opacity-100' : 'opacity-0')} />
															All Programs
														</CommandItem>
														{programs.map(prog => (
															<CommandItem
																key={prog.id}
																value={`${prog.program_code} ${prog.program_name}`}
																onSelect={() => {
																	setSelectedProgramId(prog.id)
																	setProgramOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', selectedProgramId === prog.id ? 'opacity-100' : 'opacity-0')} />
																<span className="flex-1 line-clamp-2">{prog.program_code} - {prog.program_name}</span>
															</CommandItem>
														))}
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									{/* Course (status papers only) */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">
											Status Course <span className="text-red-500">*</span>
										</Label>
										<Popover open={courseOpen} onOpenChange={setCourseOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													className="w-full justify-between h-9 text-left text-xs truncate"
													disabled={!selectedSessionId || loadingCourses}
												>
													<span className="flex-1 pr-2 truncate">
														{selectedCourseId
															? courses.find(c => c.id === selectedCourseId)?.course_title
															: loadingCourses ? 'Loading...' : 'Select status course...'}
													</span>
													<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[450px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search course..." className="h-8 text-xs" />
													<CommandEmpty className="text-xs py-4">No status courses found.</CommandEmpty>
													<CommandGroup className="max-h-56 overflow-auto">
														{courses.map(course => (
															<CommandItem
																key={course.id}
																value={`${course.course_code} ${course.course_title}`}
																onSelect={() => {
																	setSelectedCourseId(course.id)
																	setCourseOpen(false)

																	// Auto-detect status type from evaluation_type
																	const evalType = course.evaluation_type?.toUpperCase() || ''
																	if (evalType === 'CIA' || evalType === 'CIA ONLY') {
																		setStatusType('internal')
																	} else if (evalType === 'ESE' || evalType === 'ESE ONLY' || evalType === 'EXTERNAL') {
																		setStatusType('external')
																	}
																}}
																className="py-2 text-xs"
															>
																<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', selectedCourseId === course.id ? 'opacity-100' : 'opacity-0')} />
																<span className="flex-1 line-clamp-2">
																	{course.course_code} - {course.course_title}
																	<span className="text-muted-foreground ml-1">({course.evaluation_type})</span>
																</span>
															</CommandItem>
														))}
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									{/* Status Type Radio */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">
											Status Type <span className="text-red-500">*</span>
										</Label>
										<RadioGroup
											value={statusType}
											onValueChange={(v) => setStatusType(v as StatusType)}
											className="flex gap-4 pt-1"
										>
											<div className="flex items-center space-x-2">
												<RadioGroupItem value="internal" id="internal" />
												<Label htmlFor="internal" className="text-xs cursor-pointer">Internal (CIA)</Label>
											</div>
											<div className="flex items-center space-x-2">
												<RadioGroupItem value="external" id="external" />
												<Label htmlFor="external" className="text-xs cursor-pointer">External (ESE)</Label>
											</div>
										</RadioGroup>
									</div>
								</div>

								<div className="flex justify-end mt-3">
									<Button
										onClick={loadStudents}
										disabled={!selectedCourseId || loadingStudents}
										className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs"
									>
										{loadingStudents ? (
											<>
												<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
												Loading...
											</>
										) : (
											<>
												<RefreshCw className="h-3.5 w-3.5 mr-1.5" />
												Load Learners
											</>
										)}
									</Button>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Data Section */}
					{students.length > 0 && courseInfo && (
						<Card className="shadow-md">
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between flex-wrap gap-2">
									<div>
										<CardTitle className="flex items-center gap-2 font-grotesk text-base">
											<div className="h-2 w-2 rounded-full bg-violet-500" />
											Status Grades - {courseInfo.course_code}
										</CardTitle>
										<CardDescription className="text-xs mt-1">
											{courseInfo.course_title} ({courseInfo.evaluation_type}) - {students.length} learners
										</CardDescription>
									</div>

									{/* Actions Bar */}
									<div className="flex flex-wrap gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => setImportDialogOpen(true)}
											className="h-8 text-xs"
										>
											<Upload className="h-3.5 w-3.5 mr-1.5" />
											Import Excel
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={handleExportTemplate}
											className="h-8 text-xs"
										>
											<Download className="h-3.5 w-3.5 mr-1.5" />
											Template
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={handleExportCurrent}
											className="h-8 text-xs"
										>
											<Download className="h-3.5 w-3.5 mr-1.5" />
											Export Data
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => setBulkUpdateDialogOpen(true)}
											className="h-8 text-xs"
										>
											<Users className="h-3.5 w-3.5 mr-1.5" />
											Bulk Update
										</Button>
										{hasUnsavedChanges && (
											<Button
												size="sm"
												onClick={handleSaveAll}
												disabled={savingAll}
												className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs"
											>
												{savingAll ? (
													<>
														<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
														Saving...
													</>
												) : (
													<>
														<Save className="h-3.5 w-3.5 mr-1.5" />
														Save All ({modifiedCount})
													</>
												)}
											</Button>
										)}
									</div>
								</div>

								{/* Unsaved changes warning */}
								{hasUnsavedChanges && (
									<div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
										<div className="flex items-center gap-2">
											<AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
											<span className="text-xs font-medium text-amber-800 dark:text-amber-200">
												{modifiedCount} unsaved change{modifiedCount !== 1 ? 's' : ''}. Click "Save All" to persist changes.
											</span>
										</div>
									</div>
								)}

								{/* Search */}
								<div className="mt-3 relative w-full max-w-xs">
									<Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
									<Input
										placeholder="Search by register no or name..."
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
										className="pl-8 h-9 text-xs"
									/>
								</div>
							</CardHeader>

							<CardContent className="space-y-2 pt-0">
								<div className="border rounded-lg">
									<Table>
										<TableHeader>
											<TableRow className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-600 hover:to-purple-600">
												<TableHead className="w-12 text-white font-semibold text-xs">S.No</TableHead>
												<TableHead className="text-white font-semibold text-xs">Register No</TableHead>
												<TableHead className="text-white font-semibold text-xs">Student Name</TableHead>
												<TableHead className="text-white font-semibold text-xs w-[140px]">Current Grade</TableHead>
												<TableHead className="text-white font-semibold text-xs w-[200px]">New Grade</TableHead>
												<TableHead className="text-white font-semibold text-xs w-[140px]">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{filteredStudents.length === 0 ? (
												<TableRow>
													<TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
														{searchTerm ? 'No students match your search' : 'No students found'}
													</TableCell>
												</TableRow>
											) : (
												filteredStudents.map((student, index) => (
													<TableRow
														key={student.student_id}
														className={cn(
															'hover:bg-violet-50/50 dark:hover:bg-violet-900/10',
															student.is_modified && 'bg-amber-50/50 dark:bg-amber-900/10',
															student.error && 'bg-red-50/50 dark:bg-red-900/10'
														)}
													>
														<TableCell className="font-medium text-xs py-2">{index + 1}</TableCell>
														<TableCell className="font-mono text-xs py-2">{student.register_no}</TableCell>
														<TableCell className="text-xs py-2">{student.student_name}</TableCell>
														<TableCell className="py-2">
															<StatusGradeBadge grade={student.current_grade} />
														</TableCell>
														<TableCell className="py-2">
															<div className="flex items-center gap-2">
																<div className="w-[170px]">
																	<StatusGradeDropdown
																		value={student.new_grade || student.current_grade || ''}
																		onChange={(grade) => {
																			const actualIndex = students.findIndex(s => s.student_id === student.student_id)
																			if (actualIndex !== -1) handleGradeChange(actualIndex, grade)
																		}}
																		size="sm"
																	/>
																</div>
																{student.is_modified && (
																	<Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300">
																		Changed
																	</Badge>
																)}
															</div>
															{student.error && (
																<p className="text-[10px] text-red-600 mt-1">{student.error}</p>
															)}
														</TableCell>
														<TableCell className="py-2">
															<div className="flex gap-1">
																<Button
																	variant="ghost"
																	size="sm"
																	onClick={() => {
																		const actualIndex = students.findIndex(s => s.student_id === student.student_id)
																		if (actualIndex !== -1) handleSaveRow(actualIndex)
																	}}
																	disabled={!student.is_modified || student.is_saving}
																	className="h-7 px-2 text-xs"
																>
																	{student.is_saving ? (
																		<Loader2 className="h-3 w-3 animate-spin" />
																	) : (
																		<>
																			<Save className="h-3 w-3 mr-1" />
																			Save
																		</>
																	)}
																</Button>
																<Button
																	variant="ghost"
																	size="sm"
																	onClick={() => {
																		const actualIndex = students.findIndex(s => s.student_id === student.student_id)
																		if (actualIndex !== -1) handleResetRow(actualIndex)
																	}}
																	disabled={!student.is_modified || student.is_saving}
																	className="h-7 px-2 text-xs text-muted-foreground"
																>
																	Reset
																</Button>
															</div>
														</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>
								</div>

								{/* Footer summary */}
								<div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
									<span>
										Showing {filteredStudents.length} of {students.length} learners
										{searchTerm && ` (filtered by "${searchTerm}")`}
									</span>
									<div className="flex gap-3">
										<span>
											With grades: {students.filter(s => s.current_grade).length}
										</span>
										<span>
											Without grades: {students.filter(s => !s.current_grade).length}
										</span>
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Empty state when no students loaded */}
					{isReady && students.length === 0 && !loadingStudents && selectedCourseId && (
						<Card className="shadow-sm">
							<CardContent className="p-8 text-center">
								<ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
								<p className="text-sm font-medium text-muted-foreground">No students loaded</p>
								<p className="text-xs text-muted-foreground mt-1">
									Click "Load Learners" to fetch students for the selected course
								</p>
							</CardContent>
						</Card>
					)}
				</div>

				<AppFooter />

				{/* Dialogs */}
				<StatusGradeImportDialog
					open={importDialogOpen}
					onOpenChange={setImportDialogOpen}
					onImport={handleImport}
					statusType={statusType}
					courseName={courseInfo ? `${courseInfo.course_code} - ${courseInfo.course_title}` : ''}
				/>

				<BulkStatusUpdateDialog
					open={bulkUpdateDialogOpen}
					onOpenChange={setBulkUpdateDialogOpen}
					students={students}
					onApply={handleBulkApply}
				/>
			</SidebarInset>
		</SidebarProvider>
	)
}
