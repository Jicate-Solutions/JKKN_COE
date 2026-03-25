"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useInstitution } from "@/context/institution-context"
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
import { PlusCircle, Edit, Trash2, Save, RefreshCw, Link2, BookText, School, Calendar, Plus, X, ChevronDown, ChevronRight, CheckCircle2, Info } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

type CourseMapping = {
	id?: string
	course_id: string
	institution_code: string
	program_code: string
	batch_code: string
	regulation_code: string
	regulation_id?: string
	semester_code: string
	course_group?: string
	course_category?: string
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
	const searchParams = useSearchParams()
	const { fetchRegulations: fetchMyJKKNRegulations } = useMyJKKNInstitutionFilter()
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const { toast } = useToast()

	// Institution context - for institution-based filtering
	const {
		institutionCode: contextInstitutionCode,
		isReady: institutionContextReady,
		mustSelectInstitution
	} = useInstitutionFilter()

	const {
		availableInstitutions,
		canSwitchInstitution,
		currentInstitution
	} = useInstitution()

	// Parent form state
	const [selectedInstitution, setSelectedInstitution] = useState("")
	const [selectedProgram, setSelectedProgram] = useState("")
	const [selectedBatch, setSelectedBatch] = useState("")
	const [selectedRegulation, setSelectedRegulation] = useState("")
	const [selectedOfferingDepartment, setSelectedOfferingDepartment] = useState("")

	// Dropdown data states
	const [institutions, setInstitutions] = useState<any[]>([])
	const [programs, setPrograms] = useState<any[]>([])
	const [courses, setCourses] = useState<any[]>([])
	const [batches, setBatches] = useState<any[]>([])
	const [regulations, setRegulations] = useState<any[]>([])
	const [regulationsLoading, setRegulationsLoading] = useState(false)
	const [semesters, setSemesters] = useState<Semester[]>([])

	// Semester tables data
	const [semesterTables, setSemesterTables] = useState<SemesterTableData[]>([])

	// Select all states
	const [selectAllRegistration, setSelectAllRegistration] = useState<{ [key: string]: boolean }>({})
	const [selectAllStatus, setSelectAllStatus] = useState<{ [key: string]: boolean }>({})

	// Existing mappings (for edit mode)
	const [existingMappings, setExistingMappings] = useState<CourseMapping[]>([])

	// Popover open state for course selection (track by semesterIndex_rowIndex)
	const [openPopovers, setOpenPopovers] = useState<{ [key: string]: boolean }>({})

	// ============ FUNCTION DEFINITIONS (before useEffects) ============

	const fetchInstitutions = async () => {
		// Skip fetch if we already have institutions from context
		if (availableInstitutions.length > 0) return

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
			// Fetch semesters filtered by program_code
			const res = await fetch(`/api/master/semesters?program_code=${programCode}`)
			if (res.ok) {
				const data = await res.json()
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

	const fetchCourses = async (institutionCode: string, programCode: string, regulationCode?: string, offeringDepartmentCode?: string) => {
		try {
			// Filter courses by institution_code, offering_department_code, and regulation_code
			// Note: programCode is passed but not used since courses table doesn't have program_code column
			let url = `/api/master/courses?institution_code=${institutionCode}`
			// Use offering_department_code for filtering (derived from selected program)
			if (offeringDepartmentCode) {
				url += `&offering_department_code=${offeringDepartmentCode}`
			}
			if (regulationCode) {
				url += `&regulation_code=${regulationCode}`
			}
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setCourses(data)
			}
		} catch (err) {
			console.error('Error fetching courses:', err)
		}
	}

	// Fetch regulations from MyJKKN API using hook (two-step lookup with client-side filtering)
	const fetchRegulations = useCallback(async (institutionCode: string, _programCode: string) => {
		try {
			setRegulationsLoading(true)
			setRegulations([])

			// Find the institution to get its counselling_code for MyJKKN API filtering
			const institution = institutions.find((i: any) => i.institution_code === institutionCode)
			const counsellingCode = institution?.counselling_code || undefined

			// Use hook to fetch regulations (handles two-step lookup and deduplication)
			const regs = await fetchMyJKKNRegulations(counsellingCode)

			setRegulations(regs.map(r => ({
				...r,
				regulation_name: r.regulation_name || r.regulation_code
			})))
		} catch (err) {
			console.error('[CourseMapping] Error fetching regulations from MyJKKN:', err)
		} finally {
			setRegulationsLoading(false)
		}
	}, [institutions, fetchMyJKKNRegulations])

	// ============ USE EFFECTS ============

	// Update institutions list from context (runs first to populate institutions)
	useEffect(() => {
		if (availableInstitutions.length > 0) {
			// Map context institutions to match expected format
			const mappedInstitutions = availableInstitutions.map(inst => ({
				id: inst.id,
				institution_code: inst.institution_code,
				name: inst.institution_name,
				counselling_code: inst.counselling_code
			}))
			setInstitutions(mappedInstitutions)
		}
	}, [availableInstitutions])

	// Fetch institutions on mount (fallback if context doesn't have them)
	useEffect(() => {
		fetchInstitutions()
	}, [])

	// Handle URL parameters after institutions are loaded
	useEffect(() => {
		if (institutions.length === 0) return

		// Pre-populate from URL parameters
		const institution = searchParams.get('institution')
		const program = searchParams.get('program')
		const batch = searchParams.get('batch')
		const regulation = searchParams.get('regulation')

		if (institution && !selectedInstitution) setSelectedInstitution(institution)
		if (program && !selectedProgram) setSelectedProgram(program)
		if (batch && !selectedBatch) setSelectedBatch(batch)
		if (regulation && !selectedRegulation) setSelectedRegulation(regulation)
	}, [institutions, searchParams])

	// Auto-select institution from context when ready (for non-super_admin users)
	useEffect(() => {
		if (!institutionContextReady) return
		if (institutions.length === 0) return

		// If user has a specific institution from context and nothing is selected yet
		if (contextInstitutionCode && !selectedInstitution) {
			setSelectedInstitution(contextInstitutionCode)
		}
	}, [institutionContextReady, contextInstitutionCode, selectedInstitution, institutions])

	// Fetch programs when institution changes
	useEffect(() => {
		if (selectedInstitution && institutions.length > 0) {
			fetchPrograms(selectedInstitution)
			fetchRegulations(selectedInstitution, "")
			setSelectedProgram("")
			setSelectedBatch("")
			setSelectedRegulation("")
			setSemesterTables([])
			setCourses([])  // Clear courses when institution changes
		}
	}, [selectedInstitution, institutions, fetchRegulations])

	// Fetch batches and semesters when program changes
	useEffect(() => {
		if (selectedProgram) {
			// Find the selected program to get its offering_department_code
			const program = programs.find(p => p.program_code === selectedProgram)
			const offeringDept = program?.offering_department_code || ""
			setSelectedOfferingDepartment(offeringDept)

			fetchBatches(selectedProgram)
			fetchSemesters(selectedProgram)
			// Pass offering department code for course filtering
			fetchCourses(selectedInstitution, selectedProgram, selectedRegulation, offeringDept)
			fetchRegulations(selectedInstitution, selectedProgram)
			setSelectedBatch("")
			setSemesterTables([])
		}
	}, [selectedProgram, selectedInstitution, programs, fetchRegulations])

	// Load existing mappings when batch is selected
	useEffect(() => {
		if (selectedBatch && semesters.length > 0) {
			loadExistingMappings()
		}
	}, [selectedBatch, semesters])

	// Refetch courses when regulation changes
	useEffect(() => {
		if (selectedRegulation && selectedInstitution && selectedProgram) {
			fetchCourses(selectedInstitution, selectedProgram, selectedRegulation, selectedOfferingDepartment)
		}
	}, [selectedRegulation, selectedOfferingDepartment])

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
					const semesterMappings = data
						.filter((m: CourseMapping) => m.semester_code === table.semester.semester_code)
						.map((m: any) => {
							// Merge mark fields from courses table (if available)
							if (m.courses) {
								return {
									...m,
									internal_max_mark: m.courses.internal_max_mark ?? m.internal_max_mark,
									internal_pass_mark: m.courses.internal_pass_mark ?? m.internal_pass_mark,
									internal_converted_mark: m.courses.internal_converted_mark ?? m.internal_converted_mark,
									external_max_mark: m.courses.external_max_mark ?? m.external_max_mark,
									external_pass_mark: m.courses.external_pass_mark ?? m.external_pass_mark,
									external_converted_mark: m.courses.external_converted_mark ?? m.external_converted_mark,
									total_pass_mark: m.courses.total_pass_mark ?? m.total_pass_mark,
									total_max_mark: m.courses.total_max_mark ?? m.total_max_mark
								}
							}
							return m
						})
					return {
						...table,
						mappings: semesterMappings.length > 0 ? semesterMappings : [{
							course_id: "",
							institution_code: selectedInstitution,
							program_code: selectedProgram,
							batch_code: selectedBatch,
							regulation_code: selectedRegulation,
							semester_code: table.semester.semester_code,
							course_group: "General",
							course_order: 1,
							internal_max_mark: 40,
							internal_pass_mark: 14,
							internal_converted_mark: 25,
							external_max_mark: 60,
							external_pass_mark: 26,
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
			regulation_code: selectedRegulation,
			semester_code: semesterTables[semesterIndex].semester.semester_code,
			course_group: "General",
			course_category: "",
			course_order: semesterTables[semesterIndex].mappings.length + 1,
			internal_max_mark: 40,
			internal_pass_mark: 14,
			internal_converted_mark: 25,
			external_max_mark: 60,
			external_pass_mark: 26,
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

	const removeCourseRow = async (semesterIndex: number, rowIndex: number) => {
		const updated = [...semesterTables]
		const mappingToRemove = updated[semesterIndex].mappings[rowIndex]

		// If this is a saved mapping, confirm before deleting
		if (mappingToRemove.id && mappingToRemove.course_id) {
			const courseName = courses.find(c => c.id === mappingToRemove.course_id)?.course_title || 'this course'
			const confirmDelete = window.confirm(`Are you sure you want to delete the mapping for "${courseName}"? This action cannot be undone.`)

			if (!confirmDelete) {
				return
			}
		}

		// If this mapping has an ID, it exists in the database and needs to be deleted
		if (mappingToRemove.id) {
			try {
				const deleteRes = await fetch(`/api/course-management/course-mapping?id=${mappingToRemove.id}`, {
					method: 'DELETE'
				})

				if (!deleteRes.ok) {
					const error = await deleteRes.json()
					toast({
						title: '❌ Delete Failed',
						description: error.error || 'Failed to delete course mapping from database.',
						variant: 'destructive'
					})
					return // Don't remove from UI if database delete failed
				}

				toast({
					title: '✅ Deleted',
					description: 'Course mapping removed successfully.',
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			} catch (err) {
				toast({
					title: '❌ Network Error',
					description: 'Failed to connect to server. Please check your connection.',
					variant: 'destructive'
				})
				return // Don't remove from UI if network error occurred
			}
		}

		// Remove from UI after successful database delete (or if it was never saved)
		updated[semesterIndex].mappings.splice(rowIndex, 1)
		setSemesterTables(updated)

		// Update existingMappings if this was a saved mapping
		if (mappingToRemove.id) {
			setExistingMappings(prev => prev.filter(m => m.id !== mappingToRemove.id))
		}
	}

	const updateCourseRow = (semesterIndex: number, rowIndex: number, field: string, value: any) => {
		const updated = [...semesterTables]
		updated[semesterIndex].mappings[rowIndex] = {
			...updated[semesterIndex].mappings[rowIndex],
			[field]: value
		}

		// Auto-fill course details when course is selected
		if (field === 'course_id' && value) {
			const course = courses.find(c => c.id === value)
			if (course) {
				// Auto-fill course category
				updated[semesterIndex].mappings[rowIndex].course_category = course.course_category || course.course_type || ''

				// Auto-fill marks details from the course
				if (course.internal_max_mark !== undefined) {
					updated[semesterIndex].mappings[rowIndex].internal_max_mark = course.internal_max_mark
				}
				if (course.internal_pass_mark !== undefined) {
					updated[semesterIndex].mappings[rowIndex].internal_pass_mark = course.internal_pass_mark
				}
				if (course.internal_converted_mark !== undefined) {
					updated[semesterIndex].mappings[rowIndex].internal_converted_mark = course.internal_converted_mark
				}
				if (course.external_max_mark !== undefined) {
					updated[semesterIndex].mappings[rowIndex].external_max_mark = course.external_max_mark
				}
				if (course.external_pass_mark !== undefined) {
					updated[semesterIndex].mappings[rowIndex].external_pass_mark = course.external_pass_mark
				}
				if (course.external_converted_mark !== undefined) {
					updated[semesterIndex].mappings[rowIndex].external_converted_mark = course.external_converted_mark
				}
				if (course.total_pass_mark !== undefined) {
					updated[semesterIndex].mappings[rowIndex].total_pass_mark = course.total_pass_mark
				}
				if (course.total_max_mark !== undefined) {
					updated[semesterIndex].mappings[rowIndex].total_max_mark = course.total_max_mark
				}
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

		if (!selectedRegulation) {
			toast({
				title: '⚠️ Validation Error',
				description: 'Please select a regulation.',
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
							batch_code: selectedBatch,
							regulation_code: selectedRegulation
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

			// First, try to delete existing mappings (if any)
			let deletionErrors = []
			if (existingMappings.length > 0) {
				for (const existing of existingMappings) {
					if (existing.id) {
						try {
							const deleteRes = await fetch(`/api/course-management/course-mapping?id=${existing.id}`, {
								method: 'DELETE'
							})
							if (!deleteRes.ok) {
								const deleteError = await deleteRes.json()
								deletionErrors.push(`Failed to remove existing mapping: ${deleteError.error || 'Unknown error'}`)
							}
						} catch (err) {
							deletionErrors.push(`Network error while removing existing mappings`)
						}
					}
				}
			}

			// If there were deletion errors, show warning but continue
			if (deletionErrors.length > 0) {
				toast({
					title: '⚠️ Warning',
					description: 'Some existing mappings could not be removed. Proceeding with save...',
					variant: 'destructive'
				})
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
					// Build detailed error message
					let errorMessage = `Successfully saved ${result.successful.length} mappings, but ${result.errors.length} failed:\n\n`

					// Group errors by type for better readability
					const errorGroups = result.errors.reduce((acc: any, err: any) => {
						const key = err.error || 'Unknown error'
						if (!acc[key]) acc[key] = []
						acc[key].push(`Semester: ${err.semester_code}, Course: ${err.course_id}`)
						return acc
					}, {})

					for (const [error, items] of Object.entries(errorGroups)) {
						errorMessage += `❌ ${error}:\n`
						;(items as string[]).forEach(item => {
							errorMessage += `   - ${item}\n`
						})
					}

					toast({
						title: '⚠️ Partial Success',
						description: errorMessage,
						variant: 'destructive',
						className: 'whitespace-pre-wrap'
					})

					// Don't reload - keep the current state so user can fix errors
					console.error('Mapping errors:', result.errors)
				} else {
					toast({
						title: '✅ Success',
						description: `All ${allMappings.length} course mappings saved successfully for ${selectedBatch}.`,
						className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
					})

					// Only reload on complete success
					await loadExistingMappings()
				}
			} else {
				const error = await res.json()

				// Parse and display detailed error information
				let errorMessage = error.error || 'Failed to save mappings'

				if (error.details) {
					errorMessage += '\n\nDetails:\n'
					if (Array.isArray(error.details)) {
						error.details.forEach((detail: any) => {
							errorMessage += `• ${detail}\n`
						})
					} else {
						errorMessage += `• ${error.details}`
					}
				}

				toast({
					title: '❌ Save Failed',
					description: errorMessage,
					variant: 'destructive',
					className: 'whitespace-pre-wrap'
				})

				// Don't throw - keep the form data intact
				console.error('Save error:', error)
			}
		} catch (err: any) {
			// Network or unexpected errors
			toast({
				title: '❌ Unexpected Error',
				description: `An unexpected error occurred: ${err.message || 'Please check your connection and try again.'}`,
				variant: 'destructive'
			})
			console.error('Unexpected error:', err)
		} finally {
			setSaving(false)
		}
	}

	const resetForm = () => {
		// Only reset institution if user can switch institutions (super_admin)
		if (canSwitchInstitution) {
			setSelectedInstitution("")
		}
		setSelectedProgram("")
		setSelectedBatch("")
		setSelectedRegulation("")
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
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 relative z-0">
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
							<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
								<div className="space-y-2">
									<Label>Institution <span className="text-red-500">*</span></Label>
									<Select
										value={selectedInstitution}
										onValueChange={setSelectedInstitution}
										disabled={!canSwitchInstitution && !!contextInstitutionCode}
									>
										<SelectTrigger className={!canSwitchInstitution && contextInstitutionCode ? "bg-muted" : ""}>
											<SelectValue placeholder={!institutionContextReady ? "Loading..." : "Select institution"} />
										</SelectTrigger>
										<SelectContent>
											{institutions.map(inst => (
												<SelectItem key={inst.id} value={inst.institution_code}>
													{inst.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{!canSwitchInstitution && contextInstitutionCode && (
										<p className="text-xs text-muted-foreground">Auto-selected based on your account</p>
									)}
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

								<div className="space-y-2">
									<Label>Regulation <span className="text-red-500">*</span></Label>
									<Select value={selectedRegulation} onValueChange={setSelectedRegulation} disabled={!selectedProgram}>
										<SelectTrigger>
											<SelectValue placeholder="Select regulation" />
										</SelectTrigger>
										<SelectContent>
											{regulations.map(reg => (
												<SelectItem key={reg.id} value={reg.regulation_code}>
													{reg.regulation_name} ({reg.regulation_code})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							{selectedInstitution && selectedProgram && selectedBatch && selectedRegulation && (
								<div className="mt-4 p-3 bg-muted rounded-lg">
									<div className="grid grid-cols-4 gap-4 text-sm">
										<div>
											<span className="font-medium">Institution Code:</span> {selectedInstitution}
										</div>
										<div>
											<span className="font-medium">Program Code:</span> {selectedProgram}
										</div>
										<div>
											<span className="font-medium">Batch Code:</span> {selectedBatch}
										</div>
										<div>
											<span className="font-medium">Regulation Code:</span> {selectedRegulation}
										</div>
									</div>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Semester Tables */}
					{selectedBatch && semesterTables.length > 0 && (
						<div className="space-y-4 relative">
							{/* Course Filter Indicator */}
							{(selectedInstitution || selectedProgram || selectedRegulation) && (
								<div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
									<div className="flex items-center gap-2">
										
										<span className="text-xs text-blue-600 dark:text-blue-400 ml-auto">
											{courses.length} course{courses.length !== 1 ? 's' : ''} available
										</span>
									</div>
								</div>
							)}
							{semesterTables.map((table, semIndex) => (
								<Card key={table.semester.id} className="relative overflow-hidden">
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
												<div className="mt-6 border rounded-lg bg-background shadow-sm">
													<div className="overflow-x-auto overflow-y-auto max-h-[500px] relative isolate scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 dark:scrollbar-thumb-gray-600 dark:scrollbar-track-gray-800 pr-2">
														<Table className="mr-2">
															<TableHeader className="sticky top-0 z-[5] bg-muted/95 backdrop-blur-sm border-b shadow-sm">
																<TableRow>
																	<TableHead className="w-[50px] py-2 font-bold text-black dark:text-white">#</TableHead>
																	<TableHead className="w-[180px] py-2 font-bold text-black dark:text-white">Course Code</TableHead>
																	<TableHead className="w-[220px] py-2 font-bold text-black dark:text-white">Course Name</TableHead>
																	<TableHead className="w-[150px] py-2 font-bold text-black dark:text-white">Course Category</TableHead>
			
																	<TableHead className="w-[80px] py-2 font-bold text-black dark:text-white">Order</TableHead>
																	
																	<TableHead className="w-[100px] text-center py-2 font-bold text-black dark:text-white">Annual</TableHead>
																	<TableHead className="w-[120px] text-center py-2 font-bold text-black dark:text-white">
																	<div className="flex flex-col items-center gap-1">
																		<span>Registration</span>
																		<Checkbox
																			checked={selectAllRegistration[`semester_${semIndex}`] || false}
																			onCheckedChange={() => toggleAllRegistration(semIndex)}
																			aria-label="Select all registration based"
																		/>
																	</div>
																</TableHead>
																<TableHead className="w-[100px] text-center py-2 font-bold text-black dark:text-white">
																	<div className="flex flex-col items-center gap-1">
																		<span>Active</span>
																		<Checkbox
																			checked={selectAllStatus[`semester_${semIndex}`] !== false}
																			onCheckedChange={() => toggleAllStatus(semIndex)}
																			aria-label="Select all active"
																		/>
																	</div>
																</TableHead>
																<TableHead className="w-[80px] py-2 font-bold text-black dark:text-white">Action</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{table.mappings.length === 0 ? (
																<TableRow>
																	<TableCell colSpan={18} className="text-center text-muted-foreground">
																		No courses mapped. Click "Add Course" to start.
																	</TableCell>
																</TableRow>
															) : (
																table.mappings.map((mapping, rowIndex) => (
																	<TableRow key={rowIndex} className="hover:bg-muted/50">
																		<TableCell className="text-sm font-medium py-3">{rowIndex + 1}</TableCell>
																		<TableCell className="py-3">
																			<Popover
																				open={openPopovers[`${semIndex}_${rowIndex}`] || false}
																				onOpenChange={(open) => {
																					setOpenPopovers(prev => ({
																						...prev,
																						[`${semIndex}_${rowIndex}`]: open
																					}))
																				}}
																			>
																				<PopoverTrigger asChild>
																					<Button
																						variant="outline"
																						role="combobox"
																						aria-expanded={openPopovers[`${semIndex}_${rowIndex}`] || false}
																						className="h-9 w-full justify-between text-sm font-normal"
																					>
																						{mapping.course_id
																							? (() => {
																								const course = courses.find(c => c.id === mapping.course_id)
																								return course?.course_code || "Select course"
																							})()
																							: courses.length === 0
																								? "No courses available"
																								: "Select course"}
																						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
																					</Button>
																				</PopoverTrigger>
																				<PopoverContent className="w-[400px] p-0" align="start">
																					<Command>
																						<CommandInput placeholder="Search by course code or name..." className="h-9" />
																						<CommandList>
																							<CommandEmpty>No course found.</CommandEmpty>
																							<CommandGroup>
																								{courses.map((course) => (
																									<CommandItem
																										key={course.id}
																										value={`${course.course_code} ${course.course_title || course.course_name || ''}`}
																										onSelect={() => {
																											updateCourseRow(semIndex, rowIndex, 'course_id', course.id)
																											setOpenPopovers(prev => ({
																												...prev,
																												[`${semIndex}_${rowIndex}`]: false
																											}))
																										}}
																									>
																										<div className="flex flex-col">
																											<span className="font-medium">{course.course_code}</span>
																											<span className="text-xs text-muted-foreground">
																												{course.course_title || course.course_name || '-'}
																											</span>
																										</div>
																										<Check
																											className={cn(
																												"ml-auto h-4 w-4",
																												mapping.course_id === course.id ? "opacity-100" : "opacity-0"
																											)}
																										/>
																									</CommandItem>
																								))}
																							</CommandGroup>
																						</CommandList>
																					</Command>
																				</PopoverContent>
																			</Popover>
																		</TableCell>
																		<TableCell className="text-sm py-3">
																			{(() => {
																				const course = courses.find(c => c.id === mapping.course_id)
																				return course?.course_title || course?.course_name || '-'
																			})()}
																		</TableCell>
																		<TableCell className="text-sm py-3">
																			{mapping.course_category || '-'}
																		</TableCell>
																		
																		<TableCell className="py-3">
																			<Input
																				type="number"
																				value={mapping.course_order || 1}
																				onChange={(e) => updateCourseRow(semIndex, rowIndex, 'course_order', parseFloat(e.target.value))}
																				className="h-9 w-20 text-sm text-center"
																				min={0.1}
																				max={999}
																				step={0.1}
																			/>
																		</TableCell>
																		
																		<TableCell className="text-center py-3">
																			<Checkbox
																				checked={mapping.annual_semester || false}
																				onCheckedChange={(v) => updateCourseRow(semIndex, rowIndex, 'annual_semester', v)}
																				className="h-5 w-5"
																			/>
																		</TableCell>
																		<TableCell className="text-center py-3">
																			<Checkbox
																				checked={mapping.registration_based || false}
																				onCheckedChange={(v) => updateCourseRow(semIndex, rowIndex, 'registration_based', v)}
																				className="h-5 w-5"
																			/>
																		</TableCell>
																		<TableCell className="text-center py-3">
																			<Checkbox
																				checked={mapping.is_active !== false}
																				onCheckedChange={(v) => updateCourseRow(semIndex, rowIndex, 'is_active', v)}
																				className="h-5 w-5"
																			/>
																		</TableCell>
																		<TableCell className="py-3">
																			<Button
																				variant="ghost"
																				size="sm"
																				onClick={() => removeCourseRow(semIndex, rowIndex)}
																				className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
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