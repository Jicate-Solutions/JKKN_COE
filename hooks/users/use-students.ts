import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/common/use-toast'
import type { Student, StudentFormData, DropdownData } from '@/types/students'
import {
	fetchStudents as fetchStudentsService,
	createStudent,
	updateStudent,
	deleteStudent,
	fetchDropdownData,
	fetchDepartmentsByInstitution,
	fetchProgramsByDepartment,
	fetchDegreesByProgram,
	fetchSemestersByProgram,
	fetchSectionsByProgram
} from '@/services/users/students-service'

export function useStudents() {
	const { toast } = useToast()
	const [students, setStudents] = useState<Student[]>([])
	const [loading, setLoading] = useState(true)

	// Dropdown data
	const [institutions, setInstitutions] = useState<any[]>([])
	const [departments, setDepartments] = useState<any[]>([])
	const [programs, setPrograms] = useState<any[]>([])
	const [degrees, setDegrees] = useState<any[]>([])
	const [semesters, setSemesters] = useState<any[]>([])
	const [sections, setSections] = useState<any[]>([])
	const [academicYears, setAcademicYears] = useState<any[]>([])

	// Fetch students
	const fetchStudents = useCallback(async () => {
		try {
			setLoading(true)
			const data = await fetchStudentsService()
			setStudents(data)
		} catch (error) {
			console.error('Error fetching students:', error)
			toast({
				title: '❌ Fetch Failed',
				description: 'Failed to load students.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}, [toast])

	// Refresh students
	const refreshStudents = useCallback(async () => {
		try {
			setLoading(true)
			const data = await fetchStudentsService()
			setStudents(data)
			toast({
				title: '✅ Refreshed',
				description: `Loaded ${data.length} students.`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error refreshing students:', error)
			toast({
				title: '❌ Refresh Failed',
				description: 'Failed to load students.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}, [toast])

	// Save student (create or update)
	const saveStudent = useCallback(async (data: StudentFormData, editing: Student | null) => {
		try {
			let savedStudent: Student

			if (editing) {
				savedStudent = await updateStudent(editing.id, data)
				setStudents(prev => prev.map(s => s.id === editing.id ? savedStudent : s))
				toast({
					title: '✅ Record Updated',
					description: `${data.first_name}'s profile has been updated.`,
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			} else {
				savedStudent = await createStudent(data)
				setStudents(prev => [savedStudent, ...prev])
				toast({
					title: '✅ Record Created',
					description: `${data.first_name} has been added successfully.`,
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			}

			return savedStudent
		} catch (error) {
			console.error('Save student error:', error)
			toast({
				title: '❌ Operation Failed',
				description: error instanceof Error ? error.message : 'Failed to save record.',
				variant: 'destructive'
			})
			throw error
		}
	}, [toast])

	// Remove student
	const removeStudent = useCallback(async (id: string) => {
		try {
			await deleteStudent(id)
			setStudents(prev => prev.filter(s => s.id !== id))
			toast({
				title: '✅ Record Deleted',
				description: 'Student has been removed.',
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error deleting student:', error)
			toast({
				title: '❌ Delete Failed',
				description: 'Failed to delete student.',
				variant: 'destructive'
			})
			throw error
		}
	}, [toast])

	// Load initial dropdown data
	const loadDropdownData = useCallback(async () => {
		const data = await fetchDropdownData()
		if (data.institutions) setInstitutions(data.institutions)
		if (data.academicYears) setAcademicYears(data.academicYears)
	}, [])

	// Load departments by institution
	const loadDepartments = useCallback(async (institutionId: string) => {
		const institution = institutions.find(inst => inst.id === institutionId)
		if (!institution) {
			console.error('Institution not found')
			return
		}

		const data = await fetchDepartmentsByInstitution(institutionId, institution.institution_code)
		setDepartments(data)
	}, [institutions])

	// Load programs by department
	const loadPrograms = useCallback(async (departmentId: string) => {
		const data = await fetchProgramsByDepartment(departmentId)
		setPrograms(data)
	}, [])

	// Load degrees by program
	const loadDegrees = useCallback(async (programId: string) => {
		const data = await fetchDegreesByProgram(programId)
		setDegrees(data)
	}, [])

	// Load semesters by program
	const loadSemesters = useCallback(async (programId: string) => {
		const data = await fetchSemestersByProgram(programId)
		setSemesters(data)
	}, [])

	// Load sections by program
	const loadSections = useCallback(async (programId: string) => {
		const data = await fetchSectionsByProgram(programId)
		setSections(data)
	}, [])

	// Clear cascading dropdowns
	const clearDepartments = useCallback(() => {
		setDepartments([])
		setPrograms([])
		setDegrees([])
		setSemesters([])
		setSections([])
	}, [])

	const clearPrograms = useCallback(() => {
		setPrograms([])
		setDegrees([])
		setSemesters([])
		setSections([])
	}, [])

	const clearProgramDependents = useCallback(() => {
		setDegrees([])
		setSemesters([])
		setSections([])
	}, [])

	// Load students on mount
	useEffect(() => {
		fetchStudents()
		loadDropdownData()
	}, [fetchStudents, loadDropdownData])

	return {
		students,
		loading,
		setLoading,
		fetchStudents,
		refreshStudents,
		saveStudent,
		removeStudent,
		// Dropdown data
		institutions,
		departments,
		programs,
		degrees,
		semesters,
		sections,
		academicYears,
		// Dropdown loaders
		loadDepartments,
		loadPrograms,
		loadDegrees,
		loadSemesters,
		loadSections,
		loadDropdownData,
		// Dropdown clearers
		clearDepartments,
		clearPrograms,
		clearProgramDependents,
	}
}
