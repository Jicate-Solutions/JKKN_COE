'use client'

import { useState, useEffect, useCallback } from 'react'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from '@/components/ui/command'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/common/use-toast'
import { Users, Check, ChevronsUpDown, Save, Lock, RefreshCcw, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface Batch {
	id: string
	exam_date: string
	session: string
	exam_time: string | null
	batch_capacity: number
	batch_no: number
	assigned_count: number
	course_id: string
}

interface Student {
	serial_number: number
	exam_registration_id: string
	register_number: string
	student_name: string
	is_regular: boolean
	program_code: string
	program_name: string
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function BatchAllotmentPage() {
	const { toast } = useToast()

	// Institution filter hook -- provides role-based filtering
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [courses, setCourses] = useState<Course[]>([])
	const [batches, setBatches] = useState<Batch[]>([])
	const [unassignedStudents, setUnassignedStudents] = useState<Student[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('')
	const [selectedSessionId, setSelectedSessionId] = useState<string>('')
	const [selectedCourseId, setSelectedCourseId] = useState<string>('')
	const [selectedBatchId, setSelectedBatchId] = useState<string>('')
	const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())

	// Summary counts
	const [totalRegistered, setTotalRegistered] = useState(0)
	const [totalAssigned, setTotalAssigned] = useState(0)

	// Combobox open states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [loadingBatches, setLoadingBatches] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [saving, setSaving] = useState(false)
	const [assignedStudents, setAssignedStudents] = useState<Student[]>([])
	const [isViewingAssigned, setIsViewingAssigned] = useState(false)
	const [selectedProgramFilter, setSelectedProgramFilter] = useState<string>('')
	const [programFilterOpen, setProgramFilterOpen] = useState(false)

	// Effective institution ID -- from explicit selection or from context
	const effectiveInstitutionId = selectedInstitutionId || contextInstitutionId || ''

	// ---------------------------------------------------------------------------
	// Auto-fill institution for non-super-admin
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId])

	// ---------------------------------------------------------------------------
	// Load institutions (only when super_admin views "All Institutions")
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && mustSelectInstitution) {
			loadInstitutions()
		}
	}, [isReady, mustSelectInstitution])

	// ---------------------------------------------------------------------------
	// Cascading load effects
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && effectiveInstitutionId) {
			loadSessions(effectiveInstitutionId)
			resetDependentFields(['session', 'course', 'batch'])
		}
	}, [isReady, effectiveInstitutionId])

	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId) {
			loadCourses(effectiveInstitutionId, selectedSessionId)
			resetDependentFields(['course', 'batch'])
		}
	}, [isReady, selectedSessionId])

	useEffect(() => {
		if (isReady && selectedCourseId && effectiveInstitutionId && selectedSessionId) {
			loadBatches(effectiveInstitutionId, selectedSessionId, selectedCourseId)
			loadUnassignedStudents(effectiveInstitutionId, selectedSessionId, selectedCourseId)
			resetDependentFields(['batch'])
		}
	}, [isReady, selectedCourseId])

	// ---------------------------------------------------------------------------
	// Reset helpers
	// ---------------------------------------------------------------------------

	const resetDependentFields = (fields: string[]) => {
		if (fields.includes('session')) {
			setSelectedSessionId('')
			setSessions([])
		}
		if (fields.includes('course')) {
			setSelectedCourseId('')
			setCourses([])
		}
		if (fields.includes('batch')) {
			setSelectedBatchId('')
			setBatches([])
			setUnassignedStudents([])
			setSelectedStudentIds(new Set())
			setTotalRegistered(0)
			setTotalAssigned(0)
			setAssignedStudents([])
			setIsViewingAssigned(false)
			setSelectedProgramFilter('')
		}
	}

	// ---------------------------------------------------------------------------
	// Data loaders
	// ---------------------------------------------------------------------------

	const loadInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/pre-exam/batch-allotment?action=institutions')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load institutions')
			const data = await response.json()
			setInstitutions(data)
		} catch {
			toast({
				title: '❌ Error',
				description: 'Failed to load institutions',
				variant: 'destructive',
			})
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, toast])

	const loadSessions = useCallback(async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			const url = appendToUrl(
				`/api/pre-exam/batch-allotment?action=sessions&institutionId=${institutionId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load sessions')
			const data = await response.json()
			setSessions(data)
		} catch {
			toast({
				title: '❌ Error',
				description: 'Failed to load examination sessions',
				variant: 'destructive',
			})
		} finally {
			setLoadingSessions(false)
		}
	}, [appendToUrl, toast])

	const loadCourses = useCallback(async (institutionId: string, sessionId: string) => {
		try {
			setLoadingCourses(true)
			const url = appendToUrl(
				`/api/pre-exam/batch-allotment?action=practical-courses` +
				`&institutionId=${institutionId}` +
				`&sessionId=${sessionId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load courses')
			const data = await response.json()
			setCourses(data)
		} catch {
			toast({
				title: '❌ Error',
				description: 'Failed to load practical courses',
				variant: 'destructive',
			})
		} finally {
			setLoadingCourses(false)
		}
	}, [appendToUrl, toast])

	const loadBatches = useCallback(async (
		institutionId: string,
		sessionId: string,
		courseId: string
	) => {
		try {
			setLoadingBatches(true)
			const url = appendToUrl(
				`/api/pre-exam/batch-allotment?action=batches` +
				`&institutionId=${institutionId}` +
				`&sessionId=${sessionId}` +
				`&courseId=${courseId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load batches')
			const data = await response.json()
			setBatches(data)
		} catch {
			toast({
				title: '❌ Error',
				description: 'Failed to load practical batches',
				variant: 'destructive',
			})
		} finally {
			setLoadingBatches(false)
		}
	}, [appendToUrl, toast])

	const loadUnassignedStudents = useCallback(async (
		institutionId: string,
		sessionId: string,
		courseId: string
	) => {
		try {
			setLoadingStudents(true)
			const url = `/api/pre-exam/batch-allotment?action=unassigned-students` +
				`&institutionId=${institutionId}` +
				`&sessionId=${sessionId}` +
				`&courseId=${courseId}`
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load students')
			const data = await response.json()
			setUnassignedStudents(data.students || [])
			setTotalRegistered(data.total_registered || 0)
			setTotalAssigned(data.total_assigned || 0)
		} catch {
			toast({
				title: '❌ Error',
				description: 'Failed to load unassigned learners',
				variant: 'destructive',
			})
		} finally {
			setLoadingStudents(false)
		}
	}, [toast])

	// Refresh batches helper (after assignment)
	const fetchBatches = useCallback(async () => {
		if (!effectiveInstitutionId || !selectedSessionId || !selectedCourseId) return
		await loadBatches(effectiveInstitutionId, selectedSessionId, selectedCourseId)
	}, [effectiveInstitutionId, selectedSessionId, selectedCourseId, loadBatches])

	// ---------------------------------------------------------------------------
	// Lock check -- disable batch if exam date has passed
	// ---------------------------------------------------------------------------

	const isBatchLocked = (batch: Batch) => {
		const today = new Date()
		today.setHours(0, 0, 0, 0)
		const examDate = new Date(batch.exam_date)
		examDate.setHours(0, 0, 0, 0)
		return examDate < today
	}

	// ---------------------------------------------------------------------------
	// Reassign handler -- remove all assignments from a full batch
	// ---------------------------------------------------------------------------

	const handleReassign = async (batchId: string) => {
		if (!confirm('Are you sure you want to remove all student assignments from this batch? This cannot be undone.')) return

		try {
			const response = await fetch(`/api/pre-exam/batch-allotment?timetable_id=${batchId}`, { method: 'DELETE' })
			const result = await response.json()
			if (response.ok && result.success) {
				toast({
					title: '✅ Reassigned',
					description: 'All assignments removed. You can now re-assign students.',
					className: 'bg-green-50 border-green-200 text-green-800',
				})
				await fetchBatches() // Refresh batch counts
				// Refresh unassigned students
				if (effectiveInstitutionId && selectedSessionId && selectedCourseId) {
					await loadUnassignedStudents(effectiveInstitutionId, selectedSessionId, selectedCourseId)
				}
				setSelectedBatchId('')
				setUnassignedStudents([])
				setSelectedStudentIds(new Set())
				setAssignedStudents([])
				setIsViewingAssigned(false)
			} else {
				toast({
					title: '❌ Failed',
					description: result.error || 'Failed to reassign batch',
					variant: 'destructive',
				})
			}
		} catch {
			toast({
				title: '❌ Error',
				description: 'Network error',
				variant: 'destructive',
			})
		}
	}

	// ---------------------------------------------------------------------------
	// Batch selection -- auto-select top N students by remaining capacity
	// ---------------------------------------------------------------------------

	const handleBatchSelect = async (batchId: string) => {
		const batch = batches.find(b => b.id === batchId)
		const isFull = batch ? batch.assigned_count >= batch.batch_capacity : false

		setSelectedBatchId(batchId)
		setSelectedProgramFilter('')
		setLoadingStudents(true)

		if (isFull) {
			// View mode — fetch assigned students (read-only)
			setIsViewingAssigned(true)
			setUnassignedStudents([])
			setSelectedStudentIds(new Set())
			try {
				const url = `/api/pre-exam/batch-allotment?action=batch-assigned-students&timetableId=${batchId}`
				const response = await fetch(url)
				const data = await response.json()
				setAssignedStudents(Array.isArray(data) ? data : [])
			} catch {
				toast({
					title: '❌ Error',
					description: 'Failed to load assigned learners',
					variant: 'destructive',
				})
			} finally {
				setLoadingStudents(false)
			}
		} else {
			// Assign mode — fetch unassigned students (with checkboxes)
			setIsViewingAssigned(false)
			setAssignedStudents([])
			try {
				const url = `/api/pre-exam/batch-allotment?action=unassigned-students` +
					`&institutionId=${effectiveInstitutionId}` +
					`&sessionId=${selectedSessionId}` +
					`&courseId=${selectedCourseId}`
				const response = await fetch(url)
				const data = await response.json()
				const students: Student[] = data.students || []
				setUnassignedStudents(students)
				setTotalRegistered(data.total_registered || 0)
				setTotalAssigned(data.total_assigned || 0)

				// Auto-select top N (remaining capacity for this batch)
				const remaining = batch ? batch.batch_capacity - batch.assigned_count : 0
				const autoSelected = new Set<string>()
				for (let i = 0; i < Math.min(remaining, students.length); i++) {
					autoSelected.add(students[i].exam_registration_id)
				}
				setSelectedStudentIds(autoSelected)
			} catch {
				toast({
					title: '❌ Error',
					description: 'Failed to load unassigned learners',
					variant: 'destructive',
				})
			} finally {
				setLoadingStudents(false)
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Checkbox handlers
	// ---------------------------------------------------------------------------

	const toggleStudent = (regId: string) => {
		setSelectedStudentIds(prev => {
			const next = new Set(prev)
			if (next.has(regId)) {
				next.delete(regId)
			} else {
				next.add(regId)
			}
			return next
		})
	}

	const toggleSelectAll = () => {
		if (selectedStudentIds.size === unassignedStudents.length) {
			setSelectedStudentIds(new Set())
		} else {
			setSelectedStudentIds(new Set(unassignedStudents.map(s => s.exam_registration_id)))
		}
	}

	// ---------------------------------------------------------------------------
	// Assign handler
	// ---------------------------------------------------------------------------

	const handleAssign = async () => {
		if (selectedStudentIds.size === 0) {
			toast({
				title: '⚠️ No Learners Selected',
				description: 'Select at least one learner to assign',
				variant: 'destructive',
			})
			return
		}

		setSaving(true)
		try {
			const response = await fetch('/api/pre-exam/batch-allotment', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					timetable_id: selectedBatchId,
					institutions_id: effectiveInstitutionId,
					exam_registration_ids: Array.from(selectedStudentIds),
				}),
			})
			const result = await response.json()
			if (response.ok && result.success) {
				toast({
					title: '✅ Assigned',
					description: `${result.assigned} learners assigned to batch`,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
				// Refresh batches to update counts
				await fetchBatches()
				// Refresh unassigned students
				await loadUnassignedStudents(effectiveInstitutionId, selectedSessionId, selectedCourseId)
				setSelectedStudentIds(new Set())
				setSelectedBatchId('')
			} else {
				toast({
					title: '❌ Failed',
					description: result.error || 'Failed to assign learners',
					variant: 'destructive',
				})
			}
		} catch {
			toast({
				title: '❌ Error',
				description: 'Network error while saving assignments',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}

	// ---------------------------------------------------------------------------
	// Derived values
	// ---------------------------------------------------------------------------

	const selectedBatch = batches.find(b => b.id === selectedBatchId)
	const batchRemaining = selectedBatch
		? selectedBatch.batch_capacity - selectedBatch.assigned_count
		: 0
	const isOverCapacity = selectedStudentIds.size > batchRemaining

	const totalUnassigned = totalRegistered - totalAssigned

	// Program filter derived values
	const currentStudentList = isViewingAssigned ? assignedStudents : unassignedStudents
	const programMap = new Map<string, string>()
	for (const s of currentStudentList) {
		if (s.program_code && !programMap.has(s.program_code)) {
			programMap.set(s.program_code, s.program_name || '')
		}
	}
	const availablePrograms = [...programMap.entries()]
		.map(([code, name]) => ({ code, name, label: name ? `${code} - ${name}` : code }))
		.sort((a, b) => a.code.localeCompare(b.code))
	const activeProgramFilter = selectedProgramFilter && selectedProgramFilter !== 'all' ? selectedProgramFilter : ''
	const filteredUnassigned = activeProgramFilter
		? unassignedStudents.filter(s => s.program_code === activeProgramFilter)
		: unassignedStudents
	const filteredAssigned = activeProgramFilter
		? assignedStudents.filter(s => s.program_code === activeProgramFilter)
		: assignedStudents

	// Batch date formatter
	const formatBatchDate = (dateStr: string): string => {
		if (!dateStr) return ''
		const d = new Date(dateStr)
		return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<>

					{/* Loading context */}
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

					{/* Cascading filters */}
					{isReady && (
						<Card className="shadow-sm">
							<CardContent className="p-2">
								<div className={cn(
									'grid grid-cols-1 gap-3',
									mustSelectInstitution
										? 'md:grid-cols-2 lg:grid-cols-3'
										: 'md:grid-cols-2'
								)}>

									{/* Institution -- only for super_admin "All Institutions" */}
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
														aria-expanded={institutionOpen}
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
																	<Check className={cn(
																		'mr-2 h-3.5 w-3.5 shrink-0',
																		selectedInstitutionId === inst.id ? 'opacity-100' : 'opacity-0'
																	)} />
																	<span className="flex-1 line-clamp-2">
																		{inst.institution_code} - {inst.name}
																	</span>
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
													aria-expanded={sessionOpen}
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
											<PopoverContent className="w-[300px] p-0" align="start">
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
																<Check className={cn(
																	'mr-2 h-3.5 w-3.5 shrink-0',
																	selectedSessionId === session.id ? 'opacity-100' : 'opacity-0'
																)} />
																<span className="flex-1 line-clamp-2">
																	{session.session_name}
																</span>
															</CommandItem>
														))}
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									{/* Course */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">
											Course <span className="text-red-500">*</span>
										</Label>
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
															? courses.find(c => c.id === selectedCourseId)?.course_name
															: loadingCourses ? 'Loading...' : 'Select course...'}
													</span>
													<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[400px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search course..." className="h-8 text-xs" />
													<CommandEmpty className="text-xs py-4">No practical course found.</CommandEmpty>
													<CommandGroup className="max-h-56 overflow-auto">
														{courses.map(course => (
															<CommandItem
																key={course.id}
																value={`${course.course_code} ${course.course_name}`}
																onSelect={() => {
																	setSelectedCourseId(course.id)
																	setCourseOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn(
																	'mr-2 h-3.5 w-3.5 shrink-0',
																	selectedCourseId === course.id ? 'opacity-100' : 'opacity-0'
																)} />
																<span className="flex-1 line-clamp-2">
																	{course.course_code} - {course.course_name}
																</span>
															</CommandItem>
														))}
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Loading batches indicator */}
					{loadingBatches && (
						<Card className="shadow-sm">
							<CardContent className="p-4">
								<div className="flex items-center justify-center gap-2 text-muted-foreground">
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
									<span className="text-sm">Loading batches...</span>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Batch summary cards + student table */}
					{!loadingBatches && selectedCourseId && batches.length > 0 && (
						<>
							{/* Batch summary cards */}
							<Card className="shadow-sm">
								<CardHeader className="pb-2">
									<CardTitle className="flex items-center gap-2 font-grotesk text-base">
										<div className="h-2 w-2 rounded-full bg-violet-500" />
										Batch Summary
									</CardTitle>
								</CardHeader>
								<CardContent className="pt-0 pb-3">
									<div className="flex gap-3 overflow-x-auto pb-1">
										{batches.map(batch => {
											const isFull = batch.assigned_count >= batch.batch_capacity
											const isSelected = selectedBatchId === batch.id
											const isLocked = isBatchLocked(batch)

											return (
												<div
													key={batch.id}
													onClick={() => {
														if (!isLocked) handleBatchSelect(batch.id)
													}}
													role="button"
													tabIndex={isLocked ? -1 : 0}
													className={cn(
														'flex-shrink-0 rounded-lg border-2 p-3 text-left transition-all min-w-[140px]',
														isLocked && 'border-gray-300 bg-gray-50 dark:bg-gray-900/20 dark:border-gray-700 cursor-not-allowed opacity-60',
														!isLocked && isSelected && 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-400 cursor-pointer',
														!isLocked && !isSelected && isFull && 'border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700 cursor-pointer hover:border-green-400',
														!isLocked && !isSelected && !isFull && 'border-border hover:border-violet-300 dark:hover:border-violet-600 cursor-pointer',
													)}
												>
													<div className="flex items-center justify-between mb-1">
														<span className="text-sm font-semibold">
															Batch {batch.batch_no}
														</span>
														{isLocked ? (
															<Lock className="h-4 w-4 text-gray-500 dark:text-gray-400" />
														) : isFull ? (
															<Check className="h-4 w-4 text-green-600 dark:text-green-400" />
														) : null}
													</div>
													<div className="text-xs text-muted-foreground mb-1">
														{formatBatchDate(batch.exam_date)} {batch.session}
													</div>
													{isLocked ? (
														<div className="text-xs font-medium text-gray-500 dark:text-gray-400">
															Exam date has passed
														</div>
													) : (
														<div className={cn(
															'text-xs font-medium',
															isFull
																? 'text-green-700 dark:text-green-400'
																: batch.assigned_count > 0
																	? 'text-amber-700 dark:text-amber-400'
																	: 'text-muted-foreground'
														)}>
															{batch.assigned_count}/{batch.batch_capacity}
														</div>
													)}
													{isFull && !isLocked && (
														<span className="text-[10px] text-muted-foreground mt-1">Click to view</span>
													)}
												</div>
											)
										})}
									</div>

									{/* Summary bar */}
									<div className="flex items-center gap-4 text-xs text-muted-foreground mt-3 pt-3 border-t">
										<span>Total: <span className="font-medium text-foreground">{totalRegistered}</span></span>
										<span className="text-green-700 dark:text-green-400">
											Assigned: <span className="font-medium">{totalAssigned}</span>
										</span>
										<span className="text-amber-700 dark:text-amber-400">
											Unassigned: <span className="font-medium">{totalUnassigned}</span>
										</span>
									</div>
								</CardContent>
							</Card>

							{/* Loading students indicator */}
							{loadingStudents && (
								<Card className="shadow-sm">
									<CardContent className="p-4">
										<div className="flex items-center justify-center gap-2 text-muted-foreground">
											<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
											<span className="text-sm">Loading learners...</span>
										</div>
									</CardContent>
								</Card>
							)}

							{/* ========== ASSIGNED STUDENTS TABLE (View mode) ========== */}
							{!loadingStudents && selectedBatchId && isViewingAssigned && assignedStudents.length > 0 && (
								<Card className="shadow-md">
									<CardHeader className="pb-3">
										<div className="flex items-center justify-between flex-wrap gap-2">
											<CardTitle className="flex items-center gap-2 font-grotesk text-base">
												<Eye className="h-4 w-4 text-green-600" />
												Assigned Learners — Batch {selectedBatch?.batch_no}
											</CardTitle>
											<div className="flex items-center gap-2 flex-wrap">
												{availablePrograms.length > 1 && (
													<Popover open={programFilterOpen} onOpenChange={setProgramFilterOpen}>
														<PopoverTrigger asChild>
															<Button
																variant="outline"
																role="combobox"
																aria-expanded={programFilterOpen}
																className="h-7 w-[220px] justify-between text-xs font-normal"
															>
																<span className="truncate">
																	{selectedProgramFilter && selectedProgramFilter !== 'all'
																		? availablePrograms.find(p => p.code === selectedProgramFilter)?.label || selectedProgramFilter
																		: 'All Programs'}
																</span>
																<ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
															</Button>
														</PopoverTrigger>
														<PopoverContent className="w-[320px] p-0" align="end">
															<Command>
																<CommandInput placeholder="Search program..." className="h-8 text-xs" />
																<CommandEmpty>No program found.</CommandEmpty>
																<CommandGroup className="max-h-[200px] overflow-auto">
																	<CommandItem
																		value="all-programs"
																		onSelect={() => { setSelectedProgramFilter('all'); setProgramFilterOpen(false) }}
																		className="text-xs"
																	>
																		<Check className={cn('mr-2 h-3 w-3', (!selectedProgramFilter || selectedProgramFilter === 'all') ? 'opacity-100' : 'opacity-0')} />
																		All Programs
																	</CommandItem>
																	{availablePrograms.map(p => (
																		<CommandItem
																			key={p.code}
																			value={`${p.code} ${p.name}`}
																			onSelect={() => { setSelectedProgramFilter(p.code); setProgramFilterOpen(false) }}
																			className="text-xs"
																		>
																			<Check className={cn('mr-2 h-3 w-3 shrink-0', selectedProgramFilter === p.code ? 'opacity-100' : 'opacity-0')} />
																			<span className="whitespace-normal break-words">{p.label}</span>
																		</CommandItem>
																	))}
																</CommandGroup>
															</Command>
														</PopoverContent>
													</Popover>
												)}
												<Badge
													variant="outline"
													className="text-xs px-2 py-0.5 bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800"
												>
													<Users className="h-3 w-3 mr-1 inline" />
													{assignedStudents.length} Assigned
												</Badge>
											</div>
										</div>
									</CardHeader>

									<CardContent className="space-y-3 pt-0">
										<div className="border rounded-lg overflow-hidden">
											<Table>
												<TableHeader>
													<TableRow className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-600 hover:to-emerald-600">
														<TableHead className="w-12 text-white font-semibold text-sm">#</TableHead>
														<TableHead className="text-white font-semibold text-sm">Register No</TableHead>
														<TableHead className="text-white font-semibold text-sm">Name</TableHead>
														<TableHead className="text-white font-semibold text-sm">Program</TableHead>
														<TableHead className="text-white font-semibold text-sm">Type</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{filteredAssigned.map((student, idx) => (
														<TableRow
															key={student.exam_registration_id}
															className="hover:bg-green-50/50 dark:hover:bg-green-900/10"
														>
															<TableCell className="font-medium text-sm py-2">
																{idx + 1}
															</TableCell>
															<TableCell className="font-mono text-sm py-2 font-semibold">
																{student.register_number || '—'}
															</TableCell>
															<TableCell className="text-sm py-2">
																{student.student_name || '—'}
															</TableCell>
															<TableCell className="text-sm py-2">
																{student.program_code || '—'}
															</TableCell>
															<TableCell className="py-2">
																{student.is_regular ? (
																	<Badge className="text-xs bg-green-100 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
																		Regular
																	</Badge>
																) : (
																	<Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
																		Arrear
																	</Badge>
																)}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</div>

										{/* Reassign action at bottom */}
										{!isBatchLocked(selectedBatch!) && (
											<div className="flex items-center justify-between">
												<p className="text-xs text-muted-foreground">
													{assignedStudents.length} learners assigned to Batch {selectedBatch?.batch_no}
												</p>
												<Button
													variant="outline"
													onClick={() => handleReassign(selectedBatchId)}
													className="h-8 text-xs text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-800"
												>
													<RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
													Reassign Batch
												</Button>
											</div>
										)}
									</CardContent>
								</Card>
							)}

							{/* ========== UNASSIGNED STUDENTS TABLE (Assign mode) ========== */}
							{!loadingStudents && selectedBatchId && !isViewingAssigned && unassignedStudents.length > 0 && (
								<Card className="shadow-md">
									<CardHeader className="pb-3">
										<div className="flex items-center justify-between flex-wrap gap-2">
											<CardTitle className="flex items-center gap-2 font-grotesk text-base">
												<div className="h-2 w-2 rounded-full bg-violet-500" />
												Unassigned Learners
											</CardTitle>
											<div className="flex items-center gap-2 flex-wrap">
												{availablePrograms.length > 1 && (
													<Popover open={programFilterOpen} onOpenChange={setProgramFilterOpen}>
														<PopoverTrigger asChild>
															<Button
																variant="outline"
																role="combobox"
																aria-expanded={programFilterOpen}
																className="h-7 w-[220px] justify-between text-xs font-normal"
															>
																<span className="truncate">
																	{selectedProgramFilter && selectedProgramFilter !== 'all'
																		? availablePrograms.find(p => p.code === selectedProgramFilter)?.label || selectedProgramFilter
																		: 'All Programs'}
																</span>
																<ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
															</Button>
														</PopoverTrigger>
														<PopoverContent className="w-[320px] p-0" align="end">
															<Command>
																<CommandInput placeholder="Search program..." className="h-8 text-xs" />
																<CommandEmpty>No program found.</CommandEmpty>
																<CommandGroup className="max-h-[200px] overflow-auto">
																	<CommandItem
																		value="all-programs"
																		onSelect={() => { setSelectedProgramFilter('all'); setProgramFilterOpen(false) }}
																		className="text-xs"
																	>
																		<Check className={cn('mr-2 h-3 w-3', (!selectedProgramFilter || selectedProgramFilter === 'all') ? 'opacity-100' : 'opacity-0')} />
																		All Programs
																	</CommandItem>
																	{availablePrograms.map(p => (
																		<CommandItem
																			key={p.code}
																			value={`${p.code} ${p.name}`}
																			onSelect={() => { setSelectedProgramFilter(p.code); setProgramFilterOpen(false) }}
																			className="text-xs"
																		>
																			<Check className={cn('mr-2 h-3 w-3 shrink-0', selectedProgramFilter === p.code ? 'opacity-100' : 'opacity-0')} />
																			<span className="whitespace-normal break-words">{p.label}</span>
																		</CommandItem>
																	))}
																</CommandGroup>
															</Command>
														</PopoverContent>
													</Popover>
												)}
												<Badge
													variant="outline"
													className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800"
												>
													<Users className="h-3 w-3 mr-1 inline" />
													{unassignedStudents.length} Unassigned
												</Badge>
												<Badge
													variant="outline"
													className={cn(
														'text-xs px-2 py-0.5',
														isOverCapacity
															? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
															: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800'
													)}
												>
													Selected: {selectedStudentIds.size} / {batchRemaining} capacity
												</Badge>
											</div>
										</div>
									</CardHeader>

									<CardContent className="space-y-3 pt-0">
										{isOverCapacity && (
											<div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
												<span className="text-xs font-medium text-red-800 dark:text-red-200">
													Selection exceeds batch capacity. Please deselect {selectedStudentIds.size - batchRemaining} learner(s).
												</span>
											</div>
										)}

										<div className="border rounded-lg overflow-hidden">
											<Table>
												<TableHeader>
													<TableRow className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-600 hover:to-purple-600">
														<TableHead className="w-10 text-white">
															<Checkbox
																checked={
																	filteredUnassigned.length > 0 &&
																	filteredUnassigned.every(s => selectedStudentIds.has(s.exam_registration_id))
																}
																onCheckedChange={toggleSelectAll}
																className="border-white data-[state=checked]:bg-white data-[state=checked]:text-violet-600"
															/>
														</TableHead>
														<TableHead className="w-12 text-white font-semibold text-sm">#</TableHead>
														<TableHead className="text-white font-semibold text-sm">Register No</TableHead>
														<TableHead className="text-white font-semibold text-sm">Name</TableHead>
														<TableHead className="text-white font-semibold text-sm">Program</TableHead>
														<TableHead className="text-white font-semibold text-sm">Type</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{filteredUnassigned.map((student, idx) => (
														<TableRow
															key={student.exam_registration_id}
															className={cn(
																'hover:bg-violet-50/50 dark:hover:bg-violet-900/10',
																selectedStudentIds.has(student.exam_registration_id) && 'bg-violet-50/30 dark:bg-violet-900/5'
															)}
														>
															<TableCell className="py-2">
																<Checkbox
																	checked={selectedStudentIds.has(student.exam_registration_id)}
																	onCheckedChange={() => toggleStudent(student.exam_registration_id)}
																/>
															</TableCell>
															<TableCell className="font-medium text-sm py-2">
																{idx + 1}
															</TableCell>
															<TableCell className="font-mono text-sm py-2 font-semibold">
																{student.register_number || '—'}
															</TableCell>
															<TableCell className="text-sm py-2">
																{student.student_name || '—'}
															</TableCell>
															<TableCell className="text-sm py-2">
																{student.program_code || '—'}
															</TableCell>
															<TableCell className="py-2">
																{student.is_regular ? (
																	<Badge className="text-xs bg-green-100 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
																		Regular
																	</Badge>
																) : (
																	<Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
																		Arrear
																	</Badge>
																)}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</div>

										{/* Action bar */}
										<div className="flex items-center justify-between">
											<p className="text-xs text-muted-foreground">
												{selectedStudentIds.size} of {unassignedStudents.length} learners selected for Batch {selectedBatch?.batch_no}
											</p>
											<Button
												onClick={handleAssign}
												disabled={saving || selectedStudentIds.size === 0 || isOverCapacity}
												className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs"
											>
												<Save className="h-3.5 w-3.5 mr-1.5" />
												{saving ? 'Assigning...' : `Assign to Batch ${selectedBatch?.batch_no || ''}`}
											</Button>
										</div>
									</CardContent>
								</Card>
							)}

							{/* Empty state -- batch selected but no unassigned students (and not viewing assigned) */}
							{!loadingStudents && selectedBatchId && !isViewingAssigned && unassignedStudents.length === 0 && (
								<Card className="shadow-sm">
									<CardContent className="p-8">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Users className="h-8 w-8 opacity-40" />
											<p className="text-sm font-medium">No unassigned learners remaining</p>
											<p className="text-xs">All registered learners have been assigned to batches</p>
										</div>
									</CardContent>
								</Card>
							)}
						</>
					)}

					{/* Empty state -- course selected but no batches */}
					{!loadingBatches && selectedCourseId && batches.length === 0 && (
						<Card className="shadow-sm">
							<CardContent className="p-8">
								<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
									<Users className="h-8 w-8 opacity-40" />
									<p className="text-sm font-medium">No practical batches found</p>
									<p className="text-xs">Ensure published practical timetable entries exist for this course</p>
								</div>
							</CardContent>
						</Card>
					)}

		</>
	)
}
