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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import { PlusCircle, Edit, Trash2, Save, RefreshCw, Link2, BookText, School, Calendar, Plus, X, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"

type CourseMapping = {
	id?: string
	course_id: string
	institution_code: string
	program_code: string
	batch_code: string
	semester_code: string
	course_group?: string
	course_order?: number
	internal_max_mark?: number
	internal_pass_mark?: number
	internal_converted_mark?: number
	external_max_mark?: number
	external_pass_mark?: number
	external_converted_mark?: number
	total_pass_mark?: number
	total_max_mark?: number
	annual_semester?: boolean
	registration_based?: boolean
	is_active?: boolean
	created_at?: string
	course?: {
		id: string
		course_code: string
		course_name?: string
		course_title?: string
		course_type?: string
		credits?: number
	}
}

type Semester = {
	id: string
	semester_code: string
	semester_name: string
	semester_number: number
	program_id?: string
}

type SemesterTableData = {
	semester: Semester
	mappings: CourseMapping[]
	isOpen: boolean
}

const COURSE_GROUPS = [
	{ value: "General", label: "General" },
	{ value: "Elective - I", label: "Elective - I" },
	{ value: "Elective - II", label: "Elective - II" },
	{ value: "Elective - III", label: "Elective - III" },
	{ value: "Elective - IV", label: "Elective - IV" },
	{ value: "Elective - V", label: "Elective - V" },
	{ value: "Elective - VI", label: "Elective - VI" }
]

export default function CourseMappingPage() {
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const { toast } = useToast()

	// Parent form state
	const [selectedInstitution, setSelectedInstitution] = useState("")
	const [selectedProgram, setSelectedProgram] = useState("")
	const [selectedBatch, setSelectedBatch] = useState("")

	// Dropdown data states
	const [institutions, setInstitutions] = useState<any[]>([])
	const [programs, setPrograms] = useState<any[]>([])
	const [courses, setCourses] = useState<any[]>([])
	const [batches, setBatches] = useState<any[]>([])
	const [semesters, setSemesters] = useState<Semester[]>([])

	// Semester tables data
	const [semesterTables, setSemesterTables] = useState<SemesterTableData[]>([])

	// Select all states
	const [selectAllRegistration, setSelectAllRegistration] = useState<{ [key: string]: boolean }>({})
	const [selectAllStatus, setSelectAllStatus] = useState<{ [key: string]: boolean }>({})

	// Existing mappings (for edit mode)
	const [existingMappings, setExistingMappings] = useState<CourseMapping[]>([])

	// Fetch institutions on mount
	useEffect(() => {
		fetchInstitutions()
	}, [])

	// Fetch programs when institution changes
	useEffect(() => {
		if (selectedInstitution) {
			fetchPrograms(selectedInstitution)
			setSelectedProgram("")
			setSelectedBatch("")
			setSemesterTables([])
		}
	}, [selectedInstitution])

	// Fetch batches and semesters when program changes
	useEffect(() => {
		if (selectedProgram) {
			fetchBatches(selectedProgram)
			fetchSemesters(selectedProgram)
			fetchCourses(selectedInstitution, selectedProgram)
			setSelectedBatch("")
			setSemesterTables([])
		}
	}, [selectedProgram, selectedInstitution])

	// Load existing mappings when batch is selected
	useEffect(() => {
		if (selectedBatch && semesters.length > 0) {
			loadExistingMappings()
		}
	}, [selectedBatch, semesters])

	const fetchInstitutions = async () => {
		try {
			const res = await fetch('/api/master/institutions')
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)
			}
		} catch (err) {
			console.error('Error fetching institutions:', err)
		}
	}

	const fetchPrograms = async (institutionCode: string) => {
		try {
			const res = await fetch(`/api/master/programs?institution_code=${institutionCode}`)
			if (res.ok) {
				const data = await res.json()
				setPrograms(data)
			}
		} catch (err) {
			console.error('Error fetching programs:', err)
		}
	}

	const fetchBatches = async (programCode: string) => {
		try {
			// Note: You may need to update this endpoint to filter by program
			const res = await fetch('/api/master/batches')
			if (res.ok) {
				const data = await res.json()
				setBatches(data)
			}
		} catch (err) {
			console.error('Error fetching batches:', err)
		}
	}

	const fetchSemesters = async (programCode: string) => {
		try {
			const res = await fetch('/api/master/semesters')
			if (res.ok) {
				const data = await res.json()
				// Filter semesters by program if needed
				setSemesters(data)

				// Initialize semester tables
				const tables: SemesterTableData[] = data.map((sem: Semester) => ({
					semester: sem,
					mappings: [],
					isOpen: false
				}))
				setSemesterTables(tables)
			}
		} catch (err) {
			console.error('Error fetching semesters:', err)
		}
	}

	const fetchCourses = async (institutionCode: string, programCode: string) => {
		try {
			const res = await fetch(`/api/master/courses?institution_code=${institutionCode}`)
			if (res.ok) {
				const data = await res.json()
				setCourses(data)
			}
		} catch (err) {
			console.error('Error fetching courses:', err)
		}
	}

	const loadExistingMappings = async () => {
		if (!selectedInstitution || !selectedProgram || !selectedBatch) return

		try {
			setLoading(true)
			const res = await fetch(`/api/course-management/course-mapping?institution_code=${selectedInstitution}&program_code=${selectedProgram}&batch_code=${selectedBatch}`)

			if (res.ok) {
				const data = await res.json()
				setExistingMappings(data)

				// Organize mappings by semester
				const updatedTables = semesterTables.map(table => {
					const semesterMappings = data.filter((m: CourseMapping) => m.semester_code === table.semester.semester_code)
					return {
						...table,
						mappings: semesterMappings.length > 0 ? semesterMappings : [{
							course_id: "",
							institution_code: selectedInstitution,
							program_code: selectedProgram,
							batch_code: selectedBatch,
							semester_code: table.semester.semester_code,
							course_group: "General",
							course_order: 1,
							internal_max_mark: 25,
							internal_pass_mark: 0,
							internal_converted_mark: 0,
							external_max_mark: 75,
							external_pass_mark: 30,
							external_converted_mark: 75,
							total_max_mark: 100,
							total_pass_mark: 40,
							annual_semester: false,
							registration_based: false,
							is_active: true
						}],
						isOpen: semesterMappings.length > 0
					}
				})

				setSemesterTables(updatedTables)
			}
		} catch (err) {
			console.error('Error loading existing mappings:', err)
			toast({
				title: '❌ Error',
				description: 'Failed to load existing course mappings.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}

	const addCourseRow = (semesterIndex: number) => {
		const newRow: CourseMapping = {
			course_id: "",
			institution_code: selectedInstitution,
			program_code: selectedProgram,
			batch_code: selectedBatch,
			semester_code: semesterTables[semesterIndex].semester.semester_code,
			course_group: "General",
			course_order: semesterTables[semesterIndex].mappings.length + 1,
			internal_max_mark: 25,
			internal_pass_mark: 0,
			internal_converted_mark: 0,
			external_max_mark: 75,
			external_pass_mark: 30,
			external_converted_mark: 75,
			total_max_mark: 100,
			total_pass_mark: 40,
			annual_semester: false,
			registration_based: false,
			is_active: true
		}

		const updated = [...semesterTables]
		updated[semesterIndex].mappings.push(newRow)
		setSemesterTables(updated)
	}

	const removeCourseRow = (semesterIndex: number, rowIndex: number) => {
		const updated = [...semesterTables]
		updated[semesterIndex].mappings.splice(rowIndex, 1)
		setSemesterTables(updated)
	}

	const updateCourseRow = (semesterIndex: number, rowIndex: number, field: string, value: any) => {
		const updated = [...semesterTables]
		updated[semesterIndex].mappings[rowIndex] = {
			...updated[semesterIndex].mappings[rowIndex],
			[field]: value
		}

		// Auto-fill course name when course is selected
		if (field === 'course_id' && value) {
			const course = courses.find(c => c.id === value)
			if (course) {
				updated[semesterIndex].mappings[rowIndex].course = course
			}
		}

		setSemesterTables(updated)
	}

	const toggleSemesterTable = (semesterIndex: number) => {
		const updated = [...semesterTables]
		updated[semesterIndex].isOpen = !updated[semesterIndex].isOpen
		setSemesterTables(updated)
	}

	const toggleAllRegistration = (semesterIndex: number) => {
		const key = `semester_${semesterIndex}`
		const newValue = !selectAllRegistration[key]

		setSelectAllRegistration({ ...selectAllRegistration, [key]: newValue })

		const updated = [...semesterTables]
		updated[semesterIndex].mappings = updated[semesterIndex].mappings.map(m => ({
			...m,
			registration_based: newValue
		}))
		setSemesterTables(updated)
	}

	const toggleAllStatus = (semesterIndex: number) => {
		const key = `semester_${semesterIndex}`
		const newValue = !selectAllStatus[key]

		setSelectAllStatus({ ...selectAllStatus, [key]: newValue })

		const updated = [...semesterTables]
		updated[semesterIndex].mappings = updated[semesterIndex].mappings.map(m => ({
			...m,
			is_active: newValue
		}))
		setSemesterTables(updated)
	}

	const validateBeforeSave = () => {
		if (!selectedInstitution) {
			toast({
				title: '⚠️ Validation Error',
				description: 'Please select an institution.',
				variant: 'destructive'
			})
			return false
		}

		if (!selectedProgram) {
			toast({
				title: '⚠️ Validation Error',
				description: 'Please select a program.',
				variant: 'destructive'
			})
			return false
		}

		if (!selectedBatch) {
			toast({
				title: '⚠️ Validation Error',
				description: 'Please select a batch.',
				variant: 'destructive'
			})
			return false
		}

		// Check if at least one course is mapped
		const hasCourseMappings = semesterTables.some(table =>
			table.mappings.some(m => m.course_id)
		)

		if (!hasCourseMappings) {
			toast({
				title: '⚠️ Validation Error',
				description: 'Please add at least one course mapping.',
				variant: 'destructive'
			})
			return false
		}

		return true
	}

	const saveAllMappings = async () => {
		if (!validateBeforeSave()) return

		try {
			setSaving(true)

			// Collect all mappings from all semesters
			const allMappings = []
			for (const table of semesterTables) {
				for (const mapping of table.mappings) {
					if (mapping.course_id) { // Only save rows with selected courses
						allMappings.push({
							...mapping,
							institution_code: selectedInstitution,
							program_code: selectedProgram,
							batch_code: selectedBatch
						})
					}
				}
			}

			if (allMappings.length === 0) {
				toast({
					title: '⚠️ No Courses Selected',
					description: 'Please select at least one course to map.',
					variant: 'destructive'
				})
				return
			}

			// Delete existing mappings first (if any)
			if (existingMappings.length > 0) {
				for (const existing of existingMappings) {
					if (existing.id) {
						await fetch(`/api/course-management/course-mapping?id=${existing.id}`, {
							method: 'DELETE'
						})
					}
				}
			}

			// Save all mappings in bulk
			const res = await fetch('/api/course-management/course-mapping', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bulk: true,
					mappings: allMappings
				})
			})

			if (res.ok) {
				const result = await res.json()

				if (result.errors && result.errors.length > 0) {
					toast({
						title: '⚠️ Partial Success',
						description: result.message,
						variant: 'destructive'
					})
				} else {
					toast({
						title: '✅ Success',
						description: `All course mappings saved successfully for ${selectedBatch}.`,
						className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
					})
				}

				// Reload mappings
				await loadExistingMappings()
			} else {
				const error = await res.json()
				throw new Error(error.error || 'Failed to save mappings')
			}
		} catch (err: any) {
			toast({
				title: '❌ Error',
				description: err.message || 'Failed to save course mappings.',
				variant: 'destructive'
			})
		} finally {
			setSaving(false)
		}
	}

	const resetForm = () => {
		setSelectedInstitution("")
		setSelectedProgram("")
		setSelectedBatch("")
		setSemesterTables([])
		setExistingMappings([])
		setSelectAllRegistration({})
		setSelectAllStatus({})
	}

	const handleRefresh = async () => {
		if (selectedBatch) {
			await loadExistingMappings()
			toast({
				title: '✅ Refreshed',
				description: 'Course mappings have been refreshed.',
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		}
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
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
									<BreadcrumbPage>Course Mapping</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Parent Form Card */}
					<Card>
						<CardHeader className="p-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
										<Link2 className="h-4 w-4 text-primary" />
									</div>
									<div>
										<h2 className="text-lg font-semibold">Course Mapping Configuration</h2>
										<p className="text-sm text-muted-foreground">Map courses to programs, batches and semesters</p>
									</div>
								</div>
								<div className="flex gap-2">
									<Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading || !selectedBatch}>
										<RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
										Refresh
									</Button>
									<Button variant="outline" size="sm" onClick={resetForm}>
										Reset
									</Button>
									<Button size="sm" onClick={saveAllMappings} disabled={saving || loading}>
										<Save className="h-4 w-4 mr-2" />
										Save All
									</Button>
								</div>
							</div>
						</CardHeader>
						<CardContent className="p-4 pt-0">
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div className="space-y-2">
									<Label>Institution <span className="text-red-500">*</span></Label>
									<Select value={selectedInstitution} onValueChange={setSelectedInstitution}>
										<SelectTrigger>
											<SelectValue placeholder="Select institution" />
										</SelectTrigger>
										<SelectContent>
											{institutions.map(inst => (
												<SelectItem key={inst.id} value={inst.institution_code}>
													{inst.institution_name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label>Program <span className="text-red-500">*</span></Label>
									<Select value={selectedProgram} onValueChange={setSelectedProgram} disabled={!selectedInstitution}>
										<SelectTrigger>
											<SelectValue placeholder="Select program" />
										</SelectTrigger>
										<SelectContent>
											{programs.map(prog => (
												<SelectItem key={prog.id} value={prog.program_code}>
													{prog.program_name} ({prog.program_code})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label>Batch <span className="text-red-500">*</span></Label>
									<Select value={selectedBatch} onValueChange={setSelectedBatch} disabled={!selectedProgram}>
										<SelectTrigger>
											<SelectValue placeholder="Select batch" />
										</SelectTrigger>
										<SelectContent>
											{batches.map(batch => (
												<SelectItem key={batch.id} value={batch.batch_code}>
													{batch.batch_name} ({batch.batch_code})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							{selectedInstitution && selectedProgram && selectedBatch && (
								<div className="mt-4 p-3 bg-muted rounded-lg">
									<div className="grid grid-cols-3 gap-4 text-sm">
										<div>
											<span className="font-medium">Institution Code:</span> {selectedInstitution}
										</div>
										<div>
											<span className="font-medium">Program Code:</span> {selectedProgram}
										</div>
										<div>
											<span className="font-medium">Batch Code:</span> {selectedBatch}
										</div>
									</div>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Semester Tables */}
					{selectedBatch && semesterTables.length > 0 && (
						<div className="space-y-4">
							{semesterTables.map((table, semIndex) => (
								<Card key={table.semester.id}>
									<CardHeader className="p-4">
										<Collapsible open={table.isOpen} onOpenChange={() => toggleSemesterTable(semIndex)}>
											<CollapsibleTrigger asChild>
												<div className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors">
													<div className="flex items-center gap-3">
														<Button variant="ghost" size="sm" className="h-6 w-6 p-0">
															{table.isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
														</Button>
														<Calendar className="h-5 w-5 text-primary" />
														<h3 className="text-lg font-semibold">{table.semester.semester_name}</h3>
														<Badge variant="outline" className="ml-2">
															{table.mappings.filter(m => m.course_id).length} courses mapped
														</Badge>
													</div>
													<div className="flex gap-2">
														<Button
															size="sm"
															variant="outline"
															onClick={(e) => {
																e.stopPropagation()
																addCourseRow(semIndex)
															}}
														>
															<Plus className="h-3 w-3 mr-1" />
															Add Course
														</Button>
													</div>
												</div>
											</CollapsibleTrigger>

											<CollapsibleContent>
												<div className="mt-4 overflow-x-auto">
													<Table>
														<TableHeader>
															<TableRow>
																<TableHead className="w-[40px]">#</TableHead>
																<TableHead className="w-[180px]">Course Code</TableHead>
																<TableHead className="w-[200px]">Course Name</TableHead>
																<TableHead className="w-[120px]">Course Group</TableHead>
																<TableHead className="w-[80px]">Order</TableHead>
																<TableHead className="w-[150px] text-center" colSpan={3}>Internal Marks</TableHead>
																<TableHead className="w-[150px] text-center" colSpan={3}>External Marks</TableHead>
																<TableHead className="w-[100px] text-center" colSpan={2}>Total</TableHead>
																<TableHead className="w-[80px] text-center">Is Annual</TableHead>
																<TableHead className="w-[100px] text-center">
																	<div className="flex flex-col items-center gap-1">
																		<span>Registration</span>
																		<Checkbox
																			checked={selectAllRegistration[`semester_${semIndex}`] || false}
																			onCheckedChange={() => toggleAllRegistration(semIndex)}
																			aria-label="Select all registration based"
																		/>
																	</div>
																</TableHead>
																<TableHead className="w-[80px] text-center">
																	<div className="flex flex-col items-center gap-1">
																		<span>Active</span>
																		<Checkbox
																			checked={selectAllStatus[`semester_${semIndex}`] !== false}
																			onCheckedChange={() => toggleAllStatus(semIndex)}
																			aria-label="Select all active"
																		/>
																	</div>
																</TableHead>
																<TableHead className="w-[60px]">Action</TableHead>
															</TableRow>
															<TableRow>
																<TableHead></TableHead>
																<TableHead></TableHead>
																<TableHead></TableHead>
																<TableHead></TableHead>
																<TableHead></TableHead>
																<TableHead className="text-xs text-center">Pass</TableHead>
																<TableHead className="text-xs text-center">Max</TableHead>
																<TableHead className="text-xs text-center">Convert</TableHead>
																<TableHead className="text-xs text-center">Pass</TableHead>
																<TableHead className="text-xs text-center">Max</TableHead>
																<TableHead className="text-xs text-center">Convert</TableHead>
																<TableHead className="text-xs text-center">Pass</TableHead>
																<TableHead className="text-xs text-center">Max</TableHead>
																<TableHead></TableHead>
																<TableHead></TableHead>
																<TableHead></TableHead>
																<TableHead></TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{table.mappings.length === 0 ? (
																<TableRow>
																	<TableCell colSpan={17} className="text-center text-muted-foreground">
																		No courses mapped. Click "Add Course" to start.
																	</TableCell>
																</TableRow>
															) : (
																table.mappings.map((mapping, rowIndex) => (
																	<TableRow key={rowIndex}>
																		<TableCell className="text-xs">{rowIndex + 1}</TableCell>
																		<TableCell>
																			<Select
																				value={mapping.course_id}
																				onValueChange={(v) => updateCourseRow(semIndex, rowIndex, 'course_id', v)}
																			>
																				<SelectTrigger className="h-8 text-xs">
																					<SelectValue placeholder="Select course" />
																				</SelectTrigger>
																				<SelectContent>
																					{courses.map(course => (
																						<SelectItem key={course.id} value={course.id}>
																							{course.course_code}
																						</SelectItem>
																					))}
																				</SelectContent>
																			</Select>
																		</TableCell>
																		<TableCell className="text-xs">
																			{mapping.course?.course_title || mapping.course?.course_name || '-'}
																		</TableCell>
																		<TableCell>
																			<Select
																				value={mapping.course_group || "General"}
																				onValueChange={(v) => updateCourseRow(semIndex, rowIndex, 'course_group', v)}
																			>
																				<SelectTrigger className="h-8 text-xs">
																					<SelectValue />
																				</SelectTrigger>
																				<SelectContent>
																					{COURSE_GROUPS.map(group => (
																						<SelectItem key={group.value} value={group.value}>
																							{group.label}
																						</SelectItem>
																					))}
																				</SelectContent>
																			</Select>
																		</TableCell>
																		<TableCell>
																			<Input
																				type="number"
																				value={mapping.course_order || 1}
																				onChange={(e) => updateCourseRow(semIndex, rowIndex, 'course_order', parseInt(e.target.value))}
																				className="h-8 w-16 text-xs text-center"
																				min={1}
																				max={999}
																			/>
																		</TableCell>
																		<TableCell>
																			<Input
																				type="number"
																				value={mapping.internal_pass_mark || 0}
																				onChange={(e) => updateCourseRow(semIndex, rowIndex, 'internal_pass_mark', parseInt(e.target.value))}
																				className="h-8 w-12 text-xs text-center"
																				min={0}
																			/>
																		</TableCell>
																		<TableCell>
																			<Input
																				type="number"
																				value={mapping.internal_max_mark || 0}
																				onChange={(e) => updateCourseRow(semIndex, rowIndex, 'internal_max_mark', parseInt(e.target.value))}
																				className="h-8 w-12 text-xs text-center"
																				min={0}
																			/>
																		</TableCell>
																		<TableCell>
																			<Input
																				type="number"
																				value={mapping.internal_converted_mark || 0}
																				onChange={(e) => updateCourseRow(semIndex, rowIndex, 'internal_converted_mark', parseInt(e.target.value))}
																				className="h-8 w-12 text-xs text-center"
																				min={0}
																			/>
																		</TableCell>
																		<TableCell>
																			<Input
																				type="number"
																				value={mapping.external_pass_mark || 0}
																				onChange={(e) => updateCourseRow(semIndex, rowIndex, 'external_pass_mark', parseInt(e.target.value))}
																				className="h-8 w-12 text-xs text-center"
																				min={0}
																			/>
																		</TableCell>
																		<TableCell>
																			<Input
																				type="number"
																				value={mapping.external_max_mark || 0}
																				onChange={(e) => updateCourseRow(semIndex, rowIndex, 'external_max_mark', parseInt(e.target.value))}
																				className="h-8 w-12 text-xs text-center"
																				min={0}
																			/>
																		</TableCell>
																		<TableCell>
																			<Input
																				type="number"
																				value={mapping.external_converted_mark || 0}
																				onChange={(e) => updateCourseRow(semIndex, rowIndex, 'external_converted_mark', parseInt(e.target.value))}
																				className="h-8 w-12 text-xs text-center"
																				min={0}
																			/>
																		</TableCell>
																		<TableCell>
																			<Input
																				type="number"
																				value={mapping.total_pass_mark || 0}
																				onChange={(e) => updateCourseRow(semIndex, rowIndex, 'total_pass_mark', parseInt(e.target.value))}
																				className="h-8 w-12 text-xs text-center"
																				min={0}
																			/>
																		</TableCell>
																		<TableCell>
																			<Input
																				type="number"
																				value={mapping.total_max_mark || 0}
																				onChange={(e) => updateCourseRow(semIndex, rowIndex, 'total_max_mark', parseInt(e.target.value))}
																				className="h-8 w-12 text-xs text-center"
																				min={0}
																			/>
																		</TableCell>
																		<TableCell className="text-center">
																			<Checkbox
																				checked={mapping.annual_semester || false}
																				onCheckedChange={(v) => updateCourseRow(semIndex, rowIndex, 'annual_semester', v)}
																			/>
																		</TableCell>
																		<TableCell className="text-center">
																			<Checkbox
																				checked={mapping.registration_based || false}
																				onCheckedChange={(v) => updateCourseRow(semIndex, rowIndex, 'registration_based', v)}
																			/>
																		</TableCell>
																		<TableCell className="text-center">
																			<Checkbox
																				checked={mapping.is_active !== false}
																				onCheckedChange={(v) => updateCourseRow(semIndex, rowIndex, 'is_active', v)}
																			/>
																		</TableCell>
																		<TableCell>
																			<Button
																				variant="ghost"
																				size="sm"
																				onClick={() => removeCourseRow(semIndex, rowIndex)}
																				className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
																			>
																				<X className="h-4 w-4" />
																			</Button>
																		</TableCell>
																	</TableRow>
																))
															)}
														</TableBody>
													</Table>
												</div>
											</CollapsibleContent>
										</Collapsible>
									</CardHeader>
								</Card>
							))}
						</div>
					)}
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}