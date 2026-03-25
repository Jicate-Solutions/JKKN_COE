"use client"

import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import {
	Calculator,
	Loader2,
	GraduationCap,
	BookOpen,
	TrendingUp,
	Award,
	Users,
	CheckCircle2,
	AlertTriangle,
	RefreshCw,
	Database
} from "lucide-react"

// =====================================================
// GRADE TABLE TYPE DEFINITION
// =====================================================

interface GradeTableEntry {
	min: number
	max: number
	gradePoint: number
	letterGrade: string
	description: string
}

/**
 * Fallback UG Grade Conversion Table (used when database fetch fails)
 */
const FALLBACK_UG_GRADE_TABLE: GradeTableEntry[] = [
	{ min: 90, max: 100, gradePoint: 10.0, letterGrade: 'O', description: 'Outstanding' },
	{ min: 80, max: 89, gradePoint: 9.0, letterGrade: 'D+', description: 'Excellent' },
	{ min: 75, max: 79, gradePoint: 8.0, letterGrade: 'D', description: 'Distinction' },
	{ min: 70, max: 74, gradePoint: 7.5, letterGrade: 'A+', description: 'Very Good' },
	{ min: 60, max: 69, gradePoint: 7.0, letterGrade: 'A', description: 'Good' },
	{ min: 50, max: 59, gradePoint: 6.0, letterGrade: 'B', description: 'Average' },
	{ min: 40, max: 49, gradePoint: 5.0, letterGrade: 'C', description: 'Satisfactory' },
	{ min: 0, max: 39, gradePoint: 0.0, letterGrade: 'U', description: 'Re-Appear' },
	{ min: -1, max: -1, gradePoint: 0.0, letterGrade: 'AAA', description: 'ABSENT' }
]

/**
 * Fallback PG Grade Conversion Table (used when database fetch fails)
 */
const FALLBACK_PG_GRADE_TABLE: GradeTableEntry[] = [
	{ min: 90, max: 100, gradePoint: 10.0, letterGrade: 'O', description: 'Outstanding' },
	{ min: 80, max: 89, gradePoint: 9.0, letterGrade: 'D+', description: 'Excellent' },
	{ min: 75, max: 79, gradePoint: 8.0, letterGrade: 'D', description: 'Distinction' },
	{ min: 70, max: 74, gradePoint: 7.5, letterGrade: 'A+', description: 'Very Good' },
	{ min: 60, max: 69, gradePoint: 7.0, letterGrade: 'A', description: 'Good' },
	{ min: 50, max: 59, gradePoint: 6.0, letterGrade: 'B', description: 'Average' },
	{ min: 0, max: 49, gradePoint: 0.0, letterGrade: 'U', description: 'Re-Appear' },
	{ min: -1, max: -1, gradePoint: 0.0, letterGrade: 'AAA', description: 'ABSENT' }
]

/**
 * Pass marks are course-specific and should be fetched from the courses table.
 * Each course has:
 *   - internal_pass_mark: Minimum internal marks to pass
 *   - external_pass_mark: Minimum external marks to pass
 *   - total_pass_mark: Minimum total marks to pass
 *
 * The following constants are ONLY used as fallback when course pass marks are not set.
 * In production, always use course-specific pass marks from the database.
 */
const FALLBACK_PASSING_REQUIREMENTS = {
	UG: { internal: 0, external: 40, total: 40 },
	PG: { internal: 0, external: 50, total: 50 }
}

// =====================================================
// TYPE DEFINITIONS
// =====================================================

interface CourseResult {
	course_id: string
	course_code: string
	course_name: string
	credits: number
	internal_marks: number
	internal_max: number
	internal_pass_mark: number
	external_marks: number
	external_max: number
	external_pass_mark: number
	total_marks: number
	total_max: number
	total_pass_mark: number
	percentage: number
	grade_point: number
	letter_grade: string
	description: string
	is_pass: boolean
	credit_points: number
	semester: number
}

interface StudentResult {
	student_id: string
	student_name: string
	register_no: string
	courses: CourseResult[]
	semester_gpa: number
	total_credits: number
	total_credit_points: number
}

interface SemesterSummary {
	semester: number
	gpa: number
	total_credits: number
	total_credit_points: number
	courses_count: number
	passed_count: number
	failed_count: number
}

interface CGPAResult {
	student_id: string
	student_name: string
	register_no: string
	semesters: SemesterSummary[]
	cgpa: number
	overall_credits: number
	overall_credit_points: number
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get grade details from percentage using appropriate table
 * @param percentage - Total percentage (0-100)
 * @param gradeTable - The grade table to use (UG or PG)
 * @param isAbsent - Whether student was absent
 */
function getGradeFromPercentage(
	percentage: number,
	gradeTable: GradeTableEntry[],
	isAbsent: boolean = false
): { gradePoint: number; letterGrade: string; description: string } {
	if (isAbsent) {
		// Look for absent entry in table first
		const absentEntry = gradeTable.find(g => g.min === -1 && g.max === -1)
		if (absentEntry) {
			return {
				gradePoint: absentEntry.gradePoint,
				letterGrade: absentEntry.letterGrade,
				description: absentEntry.description
			}
		}
		return { gradePoint: 0, letterGrade: 'AAA', description: 'ABSENT' }
	}

	// Sort table by min descending to check higher ranges first
	const sortedTable = [...gradeTable].filter(g => g.min >= 0).sort((a, b) => b.min - a.min)

	for (const grade of sortedTable) {
		if (percentage >= grade.min && percentage <= grade.max) {
			return {
				gradePoint: grade.gradePoint,
				letterGrade: grade.letterGrade,
				description: grade.description
			}
		}
	}

	// Default to fail - find the lowest passing grade entry or return default
	const failEntry = gradeTable.find(g => g.gradePoint === 0 && g.min >= 0)
	if (failEntry) {
		return {
			gradePoint: failEntry.gradePoint,
			letterGrade: failEntry.letterGrade,
			description: failEntry.description
		}
	}

	return { gradePoint: 0, letterGrade: 'U', description: 'Re-Appear' }
}

/**
 * Course-specific pass marks interface
 */
interface CoursePassMarks {
	internal_pass_mark: number
	external_pass_mark: number
	total_pass_mark: number
}

/**
 * Check if student passed based on course-specific pass marks
 * Pass marks are fetched from the courses table for each course.
 *
 * @param internalObtained - Internal marks obtained
 * @param externalObtained - External marks obtained
 * @param totalObtained - Total marks obtained
 * @param coursePassMarks - Course-specific pass marks from courses table
 * @param programType - 'UG' or 'PG' (used only as fallback)
 */
function checkPassStatus(
	internalObtained: number,
	externalObtained: number,
	totalObtained: number,
	coursePassMarks?: CoursePassMarks,
	programType: 'UG' | 'PG' = 'UG'
): boolean {
	// Use course-specific pass marks if provided, otherwise fall back to defaults
	const internalPassMark = coursePassMarks?.internal_pass_mark ?? 0
	const externalPassMark = coursePassMarks?.external_pass_mark ?? 0
	const totalPassMark = coursePassMarks?.total_pass_mark ?? 0

	// A component passes if: pass_mark = 0 (no minimum) OR obtained >= pass_mark
	const passesInternal = internalPassMark === 0 || internalObtained >= internalPassMark
	const passesExternal = externalPassMark === 0 || externalObtained >= externalPassMark
	const passesTotal = totalPassMark === 0 || totalObtained >= totalPassMark

	return passesInternal && passesExternal && passesTotal
}

/**
 * Legacy function for backward compatibility - uses percentage-based comparison
 * @deprecated Use checkPassStatus with course-specific pass marks instead
 */
function checkPassStatusByPercentage(
	internalPercentage: number,
	externalPercentage: number,
	totalPercentage: number,
	programType: 'UG' | 'PG'
): boolean {
	const req = FALLBACK_PASSING_REQUIREMENTS[programType]

	// CIA has no passing minimum
	// CE must meet minimum (40% for UG, 50% for PG)
	// Total must meet minimum (40% for UG, 50% for PG)
	return externalPercentage >= req.external && totalPercentage >= req.total
}

/**
 * Calculate GPA using dot product formula
 * GPA = (C⃗ · G⃗) / ΣCi = Σ(Ci × Gi) / ΣCi
 *
 * @param credits - Array of credit values [C1, C2, ..., Cn]
 * @param gradePoints - Array of grade points [G1, G2, ..., Gn]
 * @returns GPA rounded to 2 decimal places
 */
function calculateGPA(credits: number[], gradePoints: number[]): number {
	if (credits.length === 0 || credits.length !== gradePoints.length) {
		return 0
	}

	// Dot product: Σ(Ci × Gi)
	let dotProduct = 0
	let totalCredits = 0

	for (let i = 0; i < credits.length; i++) {
		dotProduct += credits[i] * gradePoints[i]
		totalCredits += credits[i]
	}

	if (totalCredits === 0) return 0

	// GPA = Dot product / Total credits
	return Math.round((dotProduct / totalCredits) * 100) / 100
}

/**
 * Calculate CGPA using weighted average of semester GPAs
 * CGPA = (GPA⃗ · TC⃗) / ΣTi = Σn(Σi(Cn,i × Gn,i)) / Σn(Σi(Cn,i))
 *
 * Simplified: CGPA = Σ(GPAn × TCn) / ΣTCn
 * where GPAn = semester GPA, TCn = total credits for semester n
 *
 * @param semesterGPAs - Array of semester GPAs
 * @param semesterCredits - Array of total credits per semester
 * @returns CGPA rounded to 2 decimal places
 */
function calculateCGPA(semesterGPAs: number[], semesterCredits: number[]): number {
	if (semesterGPAs.length === 0 || semesterGPAs.length !== semesterCredits.length) {
		return 0
	}

	// Weighted sum: Σ(GPAn × TCn)
	let weightedSum = 0
	let totalCredits = 0

	for (let i = 0; i < semesterGPAs.length; i++) {
		weightedSum += semesterGPAs[i] * semesterCredits[i]
		totalCredits += semesterCredits[i]
	}

	if (totalCredits === 0) return 0

	// CGPA = Weighted sum / Total credits
	return Math.round((weightedSum / totalCredits) * 100) / 100
}

/**
 * Alternative CGPA calculation - direct from all courses
 * CGPA = Σ(Ci × Gi) / ΣCi (across all semesters)
 */
function calculateCGPADirect(allCredits: number[], allGradePoints: number[]): number {
	return calculateGPA(allCredits, allGradePoints) // Same formula, just across all courses
}

// =====================================================
// MOCK DATA FOR TESTING (Replace with actual API calls)
// =====================================================

const MOCK_STUDENTS: StudentResult[] = [
	{
		student_id: '1',
		student_name: 'Arun Kumar',
		register_no: '21UCS001',
		courses: [
			{ course_id: '1', course_code: 'CS101', course_name: 'Programming Fundamentals', credits: 4, internal_marks: 38, internal_max: 40, internal_pass_mark: 0, external_marks: 52, external_max: 60, external_pass_mark: 24, total_marks: 90, total_max: 100, total_pass_mark: 40, percentage: 90, grade_point: 10.0, letter_grade: 'O', description: 'Outstanding', is_pass: true, credit_points: 40, semester: 1 },
			{ course_id: '2', course_code: 'CS102', course_name: 'Data Structures', credits: 4, internal_marks: 35, internal_max: 40, internal_pass_mark: 0, external_marks: 48, external_max: 60, external_pass_mark: 24, total_marks: 83, total_max: 100, total_pass_mark: 40, percentage: 83, grade_point: 9.0, letter_grade: 'D+', description: 'Excellent', is_pass: true, credit_points: 36, semester: 1 },
			{ course_id: '3', course_code: 'MA101', course_name: 'Mathematics I', credits: 3, internal_marks: 30, internal_max: 40, internal_pass_mark: 0, external_marks: 45, external_max: 60, external_pass_mark: 24, total_marks: 75, total_max: 100, total_pass_mark: 40, percentage: 75, grade_point: 8.0, letter_grade: 'D', description: 'Distinction', is_pass: true, credit_points: 24, semester: 1 },
		],
		semester_gpa: 0,
		total_credits: 0,
		total_credit_points: 0
	},
	{
		student_id: '2',
		student_name: 'Priya Sharma',
		register_no: '21UCS002',
		courses: [
			{ course_id: '1', course_code: 'CS101', course_name: 'Programming Fundamentals', credits: 4, internal_marks: 32, internal_max: 40, internal_pass_mark: 0, external_marks: 40, external_max: 60, external_pass_mark: 24, total_marks: 72, total_max: 100, total_pass_mark: 40, percentage: 72, grade_point: 7.5, letter_grade: 'A+', description: 'Very Good', is_pass: true, credit_points: 30, semester: 1 },
			{ course_id: '2', course_code: 'CS102', course_name: 'Data Structures', credits: 4, internal_marks: 28, internal_max: 40, internal_pass_mark: 0, external_marks: 35, external_max: 60, external_pass_mark: 24, total_marks: 63, total_max: 100, total_pass_mark: 40, percentage: 63, grade_point: 7.0, letter_grade: 'A', description: 'Good', is_pass: true, credit_points: 28, semester: 1 },
			{ course_id: '3', course_code: 'MA101', course_name: 'Mathematics I', credits: 3, internal_marks: 20, internal_max: 40, internal_pass_mark: 0, external_marks: 22, external_max: 60, external_pass_mark: 24, total_marks: 42, total_max: 100, total_pass_mark: 40, percentage: 42, grade_point: 5.0, letter_grade: 'C', description: 'Satisfactory', is_pass: true, credit_points: 15, semester: 1 },
		],
		semester_gpa: 0,
		total_credits: 0,
		total_credit_points: 0
	},
	{
		student_id: '3',
		student_name: 'Ravi Krishnan',
		register_no: '21UCS003',
		courses: [
			{ course_id: '1', course_code: 'CS101', course_name: 'Programming Fundamentals', credits: 4, internal_marks: 25, internal_max: 40, internal_pass_mark: 0, external_marks: 20, external_max: 60, external_pass_mark: 24, total_marks: 45, total_max: 100, total_pass_mark: 40, percentage: 45, grade_point: 5.0, letter_grade: 'C', description: 'Satisfactory', is_pass: true, credit_points: 20, semester: 1 },
			{ course_id: '2', course_code: 'CS102', course_name: 'Data Structures', credits: 4, internal_marks: 18, internal_max: 40, internal_pass_mark: 0, external_marks: 18, external_max: 60, external_pass_mark: 24, total_marks: 36, total_max: 100, total_pass_mark: 40, percentage: 36, grade_point: 0.0, letter_grade: 'U', description: 'Re-Appear', is_pass: false, credit_points: 0, semester: 1 },
			{ course_id: '3', course_code: 'MA101', course_name: 'Mathematics I', credits: 3, internal_marks: 22, internal_max: 40, internal_pass_mark: 0, external_marks: 30, external_max: 60, external_pass_mark: 24, total_marks: 52, total_max: 100, total_pass_mark: 40, percentage: 52, grade_point: 6.0, letter_grade: 'B', description: 'Average', is_pass: true, credit_points: 18, semester: 1 },
		],
		semester_gpa: 0,
		total_credits: 0,
		total_credit_points: 0
	}
]

// Mock Semester 2 data for CGPA calculation
const MOCK_SEM2_COURSES: CourseResult[] = [
	{ course_id: '4', course_code: 'CS201', course_name: 'OOP Concepts', credits: 4, internal_marks: 36, internal_max: 40, internal_pass_mark: 0, external_marks: 50, external_max: 60, external_pass_mark: 24, total_marks: 86, total_max: 100, total_pass_mark: 40, percentage: 86, grade_point: 9.0, letter_grade: 'D+', description: 'Excellent', is_pass: true, credit_points: 36, semester: 2 },
	{ course_id: '5', course_code: 'CS202', course_name: 'Algorithms', credits: 4, internal_marks: 34, internal_max: 40, internal_pass_mark: 0, external_marks: 46, external_max: 60, external_pass_mark: 24, total_marks: 80, total_max: 100, total_pass_mark: 40, percentage: 80, grade_point: 9.0, letter_grade: 'D+', description: 'Excellent', is_pass: true, credit_points: 36, semester: 2 },
	{ course_id: '6', course_code: 'MA201', course_name: 'Mathematics II', credits: 3, internal_marks: 28, internal_max: 40, internal_pass_mark: 0, external_marks: 43, external_max: 60, external_pass_mark: 24, total_marks: 71, total_max: 100, total_pass_mark: 40, percentage: 71, grade_point: 7.5, letter_grade: 'A+', description: 'Very Good', is_pass: true, credit_points: 22.5, semester: 2 },
]

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function TestGPACGPAPage() {
	const { toast } = useToast()

	// Selection state
	const [selectedInstitution, setSelectedInstitution] = useState("")
	const [selectedSession, setSelectedSession] = useState("")
	const [selectedProgram, setSelectedProgram] = useState("")
	const [selectedSemester, setSelectedSemester] = useState("")
	const [programType, setProgramType] = useState<'UG' | 'PG'>('UG')

	// Dropdown data
	const [institutions, setInstitutions] = useState<{ id: string; code: string; name: string }[]>([])
	const [sessions, setSessions] = useState<{ id: string; code: string; name: string }[]>([])
	const [programs, setPrograms] = useState<{ id: string; code: string; name: string; type: 'UG' | 'PG' }[]>([])
	const [semesters, setSemesters] = useState<number[]>([])
	const [loadingDropdowns, setLoadingDropdowns] = useState(false)
	const [useMockData, setUseMockData] = useState(true)

	// Results state
	const [loading, setLoading] = useState(false)
	const [studentResults, setStudentResults] = useState<StudentResult[]>([])
	const [cgpaResults, setCGPAResults] = useState<CGPAResult[]>([])
	const [showCGPA, setShowCGPA] = useState(false)

	// Grade tables state (loaded from database)
	const [ugGradeTable, setUgGradeTable] = useState<GradeTableEntry[]>(FALLBACK_UG_GRADE_TABLE)
	const [pgGradeTable, setPgGradeTable] = useState<GradeTableEntry[]>(FALLBACK_PG_GRADE_TABLE)
	const [loadingGradeTables, setLoadingGradeTables] = useState(false)
	const [gradeTablesSource, setGradeTablesSource] = useState<'database' | 'fallback'>('fallback')

	// Fetch institutions and grade tables on mount
	useEffect(() => {
		fetchInstitutions()
		fetchGradeTables()
	}, [])

	// Fetch sessions and programs when institution changes
	useEffect(() => {
		if (selectedInstitution) {
			fetchSessions(selectedInstitution)
			fetchPrograms(selectedInstitution)
		} else {
			setSessions([])
			setPrograms([])
		}
		setSelectedSession("")
		setSelectedProgram("")
		setSelectedSemester("")
		setSemesters([])
	}, [selectedInstitution])

	// Fetch semesters when program and session change
	useEffect(() => {
		if (selectedProgram && selectedSession) {
			fetchSemesters(selectedInstitution, selectedProgram, selectedSession)
		} else {
			setSemesters([])
		}
		setSelectedSemester("")
	}, [selectedProgram, selectedSession, selectedInstitution])

	// Update program type when program changes
	useEffect(() => {
		if (selectedProgram) {
			const program = programs.find(p => p.id === selectedProgram)
			if (program) {
				setProgramType(program.type)
			}
		}
	}, [selectedProgram, programs])

	const fetchInstitutions = async () => {
		try {
			const res = await fetch('/api/grading/final-marks?action=institutions')
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data.map((i: any) => ({
					id: i.id,
					code: i.institution_code,
					name: i.name
				})))
			}
		} catch (e) {
			console.error('Failed to fetch institutions:', e)
		}
	}

	/**
	 * Fetch grade tables from grade_system table
	 * Loads UG and PG grade conversion tables from database
	 */
	const fetchGradeTables = async () => {
		setLoadingGradeTables(true)
		try {
			const res = await fetch('/api/grading/grade-system?is_active=true')
			if (res.ok) {
				const data = await res.json()

				// Transform database records to GradeTableEntry format
				const transformToGradeEntry = (record: any): GradeTableEntry => ({
					min: Number(record.min_mark),
					max: Number(record.max_mark),
					gradePoint: Number(record.grade_point),
					letterGrade: record.grade,
					description: record.description
				})

				// Filter and sort by min_mark descending for UG
				const ugRecords = data
					.filter((r: any) => r.grade_system_code === 'UG')
					.map(transformToGradeEntry)
					.sort((a: GradeTableEntry, b: GradeTableEntry) => b.min - a.min)

				// Filter and sort by min_mark descending for PG
				const pgRecords = data
					.filter((r: any) => r.grade_system_code === 'PG')
					.map(transformToGradeEntry)
					.sort((a: GradeTableEntry, b: GradeTableEntry) => b.min - a.min)

				if (ugRecords.length > 0) {
					setUgGradeTable(ugRecords)
				}
				if (pgRecords.length > 0) {
					setPgGradeTable(pgRecords)
				}

				if (ugRecords.length > 0 || pgRecords.length > 0) {
					setGradeTablesSource('database')
					toast({
						title: 'Grade Tables Loaded',
						description: `Loaded ${ugRecords.length} UG and ${pgRecords.length} PG grade entries from database.`,
						className: 'bg-blue-50 border-blue-200 text-blue-800'
					})
				} else {
					setGradeTablesSource('fallback')
					console.log('No grade system records found, using fallback tables')
				}
			}
		} catch (e) {
			console.error('Failed to fetch grade tables:', e)
			setGradeTablesSource('fallback')
		} finally {
			setLoadingGradeTables(false)
		}
	}

	const fetchSessions = async (institutionId: string) => {
		try {
			const res = await fetch(`/api/grading/final-marks?action=sessions&institutionId=${institutionId}`)
			if (res.ok) {
				const data = await res.json()
				setSessions(data.map((s: any) => ({
					id: s.id,
					code: s.session_code,
					name: s.session_name
				})))
			}
		} catch (e) {
			console.error('Failed to fetch sessions:', e)
		}
	}

	const fetchPrograms = async (institutionId: string) => {
		try {
			const res = await fetch(`/api/grading/final-marks?action=programs&institutionId=${institutionId}`)
			if (res.ok) {
				const data = await res.json()
				setPrograms(data.map((p: any) => ({
					id: p.id,
					code: p.program_code,
					name: p.program_name,
					type: (p.grade_system_code || 'UG') as 'UG' | 'PG'
				})))
			}
		} catch (e) {
			console.error('Failed to fetch programs:', e)
		}
	}

	const fetchSemesters = async (institutionId: string, programId: string, sessionId: string) => {
		try {
			setLoadingDropdowns(true)
			const res = await fetch(`/api/grading/semester-results?action=semesters&institutionId=${institutionId}&programId=${programId}&sessionId=${sessionId}`)
			if (res.ok) {
				const data = await res.json()
				setSemesters(data)
			}
		} catch (e) {
			console.error('Failed to fetch semesters:', e)
		} finally {
			setLoadingDropdowns(false)
		}
	}

	const fetchProgramResults = async () => {
		if (!selectedInstitution || !selectedSession || !selectedProgram) {
			toast({
				title: '⚠️ Missing Selection',
				description: 'Please select institution, session, and program',
				variant: 'destructive'
			})
			return
		}

		setLoading(true)
		setShowCGPA(false)
		setStudentResults([])

		try {
			const params = new URLSearchParams({
				action: 'program-results',
				institutionId: selectedInstitution,
				sessionId: selectedSession,
				programId: selectedProgram,
				programType: programType
			})

			if (selectedSemester) {
				params.append('semester', selectedSemester)
			}

			const res = await fetch(`/api/grading/semester-results?${params.toString()}`)
			if (!res.ok) {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to fetch results')
			}

			const data = await res.json()

			// Transform API response to match StudentResult interface
			// Include pass marks from courses table for each course
			const transformedResults: StudentResult[] = data.results.map((r: any) => ({
				student_id: r.student_id,
				student_name: r.student_name,
				register_no: r.register_no,
				courses: r.courses.map((c: any) => ({
					course_id: c.course_id || '',
					course_code: c.course_code,
					course_name: c.course_name,
					credits: c.credits,
					internal_marks: c.internal_marks,
					internal_max: c.internal_max,
					internal_pass_mark: c.internal_pass_mark ?? 0,
					external_marks: c.external_marks,
					external_max: c.external_max,
					external_pass_mark: c.external_pass_mark ?? 0,
					total_marks: c.total_marks,
					total_max: c.total_max,
					total_pass_mark: c.total_pass_mark ?? 0,
					percentage: c.percentage,
					grade_point: c.grade_point,
					letter_grade: c.letter_grade,
					description: c.grade_description || '',
					is_pass: c.is_pass,
					credit_points: c.credit_points,
					semester: c.semester
				})),
				semester_gpa: r.semester_gpa,
				total_credits: r.total_credits,
				total_credit_points: r.total_credit_points
			}))

			setStudentResults(transformedResults)

			toast({
				title: '✅ Results Fetched',
				description: `Fetched results for ${transformedResults.length} learners from database.`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (e) {
			console.error('Fetch error:', e)
			toast({
				title: '❌ Fetch Failed',
				description: e instanceof Error ? e.message : 'Failed to fetch results',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}

	/**
	 * Calculate GPA for all students
	 * Uses vector dot product: GPA = (C⃗ · G⃗) / ΣCi
	 * Pass status uses course-specific pass marks from courses table
	 */
	const calculateResults = () => {
		setLoading(true)
		setShowCGPA(false)

		// Select the appropriate grade table based on program type
		const gradeTable = programType === 'UG' ? ugGradeTable : pgGradeTable

		try {
			// Process mock data - in real implementation, fetch from API
			const processedResults = MOCK_STUDENTS.map(student => {
				// Recalculate grades based on program type
				const processedCourses = student.courses.map(course => {
					const totalPercentage = (course.total_marks / course.total_max) * 100

					const gradeInfo = getGradeFromPercentage(totalPercentage, gradeTable)

					// Use course-specific pass marks (from courses table)
					const coursePassMarks: CoursePassMarks = {
						internal_pass_mark: course.internal_pass_mark,
						external_pass_mark: course.external_pass_mark,
						total_pass_mark: course.total_pass_mark
					}

					// Check pass status using course-specific pass marks
					const isPassing = checkPassStatus(
						course.internal_marks,
						course.external_marks,
						course.total_marks,
						coursePassMarks,
						programType
					)

					return {
						...course,
						percentage: totalPercentage,
						grade_point: isPassing ? gradeInfo.gradePoint : 0, // Grade point is 0 if failed
						letter_grade: isPassing ? gradeInfo.letterGrade : 'U',
						description: isPassing ? gradeInfo.description : 'Re-Appear',
						is_pass: isPassing,
						credit_points: isPassing ? course.credits * gradeInfo.gradePoint : 0
					}
				})

				// Extract credits and grade points as vectors
				const credits = processedCourses.map(c => c.credits)
				const gradePoints = processedCourses.map(c => c.grade_point)

				// Calculate GPA using dot product
				const gpa = calculateGPA(credits, gradePoints)
				const totalCredits = credits.reduce((sum, c) => sum + c, 0)
				const totalCreditPoints = processedCourses.reduce((sum, c) => sum + c.credit_points, 0)

				return {
					...student,
					courses: processedCourses,
					semester_gpa: gpa,
					total_credits: totalCredits,
					total_credit_points: totalCreditPoints
				}
			})

			setStudentResults(processedResults)

			toast({
				title: '✅ GPA Calculated',
				description: `Calculated GPA for ${processedResults.length} learners using dot product formula.`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (e) {
			console.error('Calculation error:', e)
			toast({
				title: '❌ Calculation Failed',
				description: 'Failed to calculate GPA',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}

	/**
	 * Calculate CGPA across all semesters
	 * Uses weighted average: CGPA = Σ(GPAn × TCn) / ΣTCn
	 */
	const calculateCGPAResults = () => {
		setLoading(true)

		// Select the appropriate grade table based on program type
		const gradeTable = programType === 'UG' ? ugGradeTable : pgGradeTable

		try {
			// For demonstration, combine Semester 1 and 2 data
			const cgpaData: CGPAResult[] = MOCK_STUDENTS.slice(0, 1).map(student => {
				// Semester 1 data
				const sem1Credits = student.courses.map(c => c.credits)
				const sem1GradePoints = student.courses.map(c => {
					const gradeInfo = getGradeFromPercentage(c.percentage, gradeTable)
					return gradeInfo.gradePoint
				})
				const sem1GPA = calculateGPA(sem1Credits, sem1GradePoints)
				const sem1TotalCredits = sem1Credits.reduce((sum, c) => sum + c, 0)

				// Semester 2 data (mock)
				const sem2Credits = MOCK_SEM2_COURSES.map(c => c.credits)
				const sem2GradePoints = MOCK_SEM2_COURSES.map(c => {
					const gradeInfo = getGradeFromPercentage(c.percentage, gradeTable)
					return gradeInfo.gradePoint
				})
				const sem2GPA = calculateGPA(sem2Credits, sem2GradePoints)
				const sem2TotalCredits = sem2Credits.reduce((sum, c) => sum + c, 0)

				// CGPA calculation using weighted average
				const cgpa = calculateCGPA(
					[sem1GPA, sem2GPA],
					[sem1TotalCredits, sem2TotalCredits]
				)

				// Alternative: Direct calculation from all courses
				const allCredits = [...sem1Credits, ...sem2Credits]
				const allGradePoints = [...sem1GradePoints, ...sem2GradePoints]
				const cgpaDirect = calculateCGPADirect(allCredits, allGradePoints)

				console.log('CGPA (weighted):', cgpa)
				console.log('CGPA (direct):', cgpaDirect)

				return {
					student_id: student.student_id,
					student_name: student.student_name,
					register_no: student.register_no,
					semesters: [
						{
							semester: 1,
							gpa: sem1GPA,
							total_credits: sem1TotalCredits,
							total_credit_points: sem1GPA * sem1TotalCredits,
							courses_count: student.courses.length,
							passed_count: student.courses.filter(c => c.is_pass).length,
							failed_count: student.courses.filter(c => !c.is_pass).length
						},
						{
							semester: 2,
							gpa: sem2GPA,
							total_credits: sem2TotalCredits,
							total_credit_points: sem2GPA * sem2TotalCredits,
							courses_count: MOCK_SEM2_COURSES.length,
							passed_count: MOCK_SEM2_COURSES.filter(c => c.is_pass).length,
							failed_count: MOCK_SEM2_COURSES.filter(c => !c.is_pass).length
						}
					],
					cgpa: cgpa,
					overall_credits: sem1TotalCredits + sem2TotalCredits,
					overall_credit_points: (sem1GPA * sem1TotalCredits) + (sem2GPA * sem2TotalCredits)
				}
			})

			setCGPAResults(cgpaData)
			setShowCGPA(true)

			toast({
				title: '✅ CGPA Calculated',
				description: `Calculated CGPA using weighted semester GPAs.`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (e) {
			console.error('CGPA calculation error:', e)
			toast({
				title: '❌ Calculation Failed',
				description: 'Failed to calculate CGPA',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}

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
										<Link href="/grading/grades">Grading</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Test GPA/CGPA Calculator</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Page Header */}
					<div className="flex items-center gap-3 mb-2">
						<div className="h-10 w-10 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 flex items-center justify-center">
							<Calculator className="h-5 w-5 text-white" />
						</div>
						<div>
							<h1 className="text-2xl font-bold">GPA/CGPA Calculator (Test Page)</h1>
							<p className="text-sm text-muted-foreground">Testing vector dot product formulas for grade calculation</p>
						</div>
					</div>

					{/* Formula Reference Card */}
					<Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-800">
						<CardHeader className="pb-2">
							<CardTitle className="text-lg flex items-center gap-2">
								<BookOpen className="h-5 w-5" />
								Formula Reference
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="bg-white dark:bg-slate-900 p-4 rounded-lg border">
									<h4 className="font-semibold text-sm mb-2 text-blue-700 dark:text-blue-300">GPA (Semester)</h4>
									<code className="text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded block">
										GPA = (C⃗ · G⃗) / ΣCi = Σ(Ci × Gi) / ΣCi
									</code>
									<p className="text-xs text-muted-foreground mt-2">
										Where Ci = Credits, Gi = Grade Points
									</p>
								</div>
								<div className="bg-white dark:bg-slate-900 p-4 rounded-lg border">
									<h4 className="font-semibold text-sm mb-2 text-purple-700 dark:text-purple-300">CGPA (Cumulative)</h4>
									<code className="text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded block">
										CGPA = Σn(GPAn × TCn) / Σn(TCn)
									</code>
									<p className="text-xs text-muted-foreground mt-2">
										Where GPAn = Semester GPA, TCn = Total Credits per semester
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Grade Tables */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<div>
										<CardTitle className="text-lg">UG Grade Table</CardTitle>
										<CardDescription>Pass: CE ≥ 40%, Total ≥ 40%</CardDescription>
									</div>
									<Badge variant={gradeTablesSource === 'database' ? 'default' : 'secondary'} className="text-xs">
										{loadingGradeTables ? (
											<><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Loading</>
										) : (
											<><Database className="h-3 w-3 mr-1" /> {gradeTablesSource === 'database' ? 'Database' : 'Fallback'}</>
										)}
									</Badge>
								</div>
							</CardHeader>
							<CardContent>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="text-xs">Range</TableHead>
											<TableHead className="text-xs">GP</TableHead>
											<TableHead className="text-xs">Grade</TableHead>
											<TableHead className="text-xs">Description</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{ugGradeTable.filter(g => g.min >= 0).map((g, idx) => (
											<TableRow key={idx}>
												<TableCell className="text-xs">{g.min}-{g.max}</TableCell>
												<TableCell className="text-xs font-bold">{g.gradePoint}</TableCell>
												<TableCell className="text-xs"><Badge variant="outline">{g.letterGrade}</Badge></TableCell>
												<TableCell className="text-xs">{g.description}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<div>
										<CardTitle className="text-lg">PG Grade Table</CardTitle>
										<CardDescription>Pass: CE ≥ 50%, Total ≥ 50%</CardDescription>
									</div>
									<Badge variant={gradeTablesSource === 'database' ? 'default' : 'secondary'} className="text-xs">
										{loadingGradeTables ? (
											<><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Loading</>
										) : (
											<><Database className="h-3 w-3 mr-1" /> {gradeTablesSource === 'database' ? 'Database' : 'Fallback'}</>
										)}
									</Badge>
								</div>
							</CardHeader>
							<CardContent>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="text-xs">Range</TableHead>
											<TableHead className="text-xs">GP</TableHead>
											<TableHead className="text-xs">Grade</TableHead>
											<TableHead className="text-xs">Description</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{pgGradeTable.filter(g => g.min >= 0).map((g, idx) => (
											<TableRow key={idx}>
												<TableCell className="text-xs">{g.min}-{g.max}</TableCell>
												<TableCell className="text-xs font-bold">{g.gradePoint}</TableCell>
												<TableCell className="text-xs"><Badge variant="outline">{g.letterGrade}</Badge></TableCell>
												<TableCell className="text-xs">{g.description}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
					</div>

					{/* Selection Form */}
					<Card>
						<CardHeader className="pb-2">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
										<GraduationCap className="h-4 w-4 text-white" />
									</div>
									<div>
										<CardTitle className="text-lg">Select Parameters</CardTitle>
										<CardDescription>Choose institution, session, program and semester</CardDescription>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Button
										variant={useMockData ? "default" : "outline"}
										size="sm"
										onClick={() => setUseMockData(true)}
									>
										<Calculator className="h-3 w-3 mr-1" />
										Mock Data
									</Button>
									<Button
										variant={!useMockData ? "default" : "outline"}
										size="sm"
										onClick={() => setUseMockData(false)}
									>
										<Database className="h-3 w-3 mr-1" />
										Database
									</Button>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
								<div className="space-y-2">
									<Label>Institution</Label>
									<Select value={selectedInstitution} onValueChange={setSelectedInstitution} disabled={useMockData}>
										<SelectTrigger>
											<SelectValue placeholder="Select institution" />
										</SelectTrigger>
										<SelectContent>
											{institutions.map(inst => (
												<SelectItem key={inst.id} value={inst.id}>
													{inst.code} - {inst.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label>Session</Label>
									<Select value={selectedSession} onValueChange={setSelectedSession} disabled={useMockData || !selectedInstitution}>
										<SelectTrigger>
											<SelectValue placeholder="Select session" />
										</SelectTrigger>
										<SelectContent>
											{sessions.map(s => (
												<SelectItem key={s.id} value={s.id}>
													{s.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label>Program</Label>
									<Select value={selectedProgram} onValueChange={setSelectedProgram} disabled={useMockData || !selectedInstitution}>
										<SelectTrigger>
											<SelectValue placeholder="Select program" />
										</SelectTrigger>
										<SelectContent>
											{programs.map(p => (
												<SelectItem key={p.id} value={p.id}>
													{p.code} ({p.type})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label>Semester {loadingDropdowns && <Loader2 className="h-3 w-3 inline animate-spin ml-1" />}</Label>
									<Select value={selectedSemester} onValueChange={setSelectedSemester} disabled={useMockData || semesters.length === 0}>
										<SelectTrigger>
											<SelectValue placeholder={semesters.length === 0 ? "No semesters" : "All semesters"} />
										</SelectTrigger>
										<SelectContent>
											{semesters.map(s => (
												<SelectItem key={s} value={String(s)}>
													Semester {s}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							{useMockData && (
								<div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
									<p className="text-sm text-yellow-700 dark:text-yellow-300">
										<strong>Mock Data Mode:</strong> Using sample data to demonstrate GPA/CGPA calculations. Switch to Database mode to fetch real data from final_marks table.
									</p>
								</div>
							)}

							<div className="flex items-center gap-4 pt-2">
								<Badge variant="outline" className="text-sm">
									Program Type: <span className="font-bold ml-1">{programType}</span>
								</Badge>
								<div className="flex gap-2">
									{useMockData ? (
										<>
											<Button onClick={calculateResults} disabled={loading}>
												{loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
												Calculate GPA (Mock)
											</Button>
											<Button variant="outline" onClick={calculateCGPAResults} disabled={loading || studentResults.length === 0}>
												{loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TrendingUp className="h-4 w-4 mr-2" />}
												Calculate CGPA (Mock)
											</Button>
										</>
									) : (
										<>
											<Button onClick={fetchProgramResults} disabled={loading || !selectedInstitution || !selectedSession || !selectedProgram}>
												{loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
												Fetch & Calculate GPA
											</Button>
											<Button variant="outline" onClick={calculateCGPAResults} disabled={loading || studentResults.length === 0}>
												{loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TrendingUp className="h-4 w-4 mr-2" />}
												Calculate CGPA
											</Button>
										</>
									)}
								</div>
							</div>
						</CardContent>
					</Card>

					{/* GPA Results */}
					{studentResults.length > 0 && !showCGPA && (
						<>
							{/* Summary Cards */}
							<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
								<Card>
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Learners</p>
												<p className="text-xl font-bold">{studentResults.length}</p>
											</div>
											<Users className="h-5 w-5 text-blue-500" />
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Avg GPA</p>
												<p className="text-xl font-bold text-green-600">
													{(studentResults.reduce((sum, s) => sum + s.semester_gpa, 0) / studentResults.length).toFixed(2)}
												</p>
											</div>
											<Award className="h-5 w-5 text-green-500" />
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Highest GPA</p>
												<p className="text-xl font-bold text-purple-600">
													{Math.max(...studentResults.map(s => s.semester_gpa)).toFixed(2)}
												</p>
											</div>
											<TrendingUp className="h-5 w-5 text-purple-500" />
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Passed</p>
												<p className="text-xl font-bold text-green-600">
													{studentResults.filter(s => s.courses.every(c => c.is_pass)).length}
												</p>
											</div>
											<CheckCircle2 className="h-5 w-5 text-green-500" />
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Backlogs</p>
												<p className="text-xl font-bold text-red-600">
													{studentResults.filter(s => s.courses.some(c => !c.is_pass)).length}
												</p>
											</div>
											<AlertTriangle className="h-5 w-5 text-red-500" />
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Results Table */}
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-lg">GPA Results</CardTitle>
									<CardDescription>Semester-wise GPA calculated using dot product formula</CardDescription>
								</CardHeader>
								<CardContent>
									{studentResults.map(student => (
										<div key={student.student_id} className="mb-6 last:mb-0">
											<div className="flex items-center justify-between mb-3 p-3 bg-muted/50 rounded-lg">
												<div>
													<span className="font-bold">{student.register_no}</span>
													<span className="text-muted-foreground mx-2">-</span>
													<span>{student.student_name}</span>
												</div>
												<div className="flex items-center gap-4">
													<Badge variant="outline">Credits: {student.total_credits}</Badge>
													<Badge variant="outline">Credit Points: {student.total_credit_points.toFixed(1)}</Badge>
													<Badge className={student.semester_gpa >= 7 ? 'bg-green-600' : student.semester_gpa >= 5 ? 'bg-yellow-600' : 'bg-red-600'}>
														GPA: {student.semester_gpa.toFixed(2)}
													</Badge>
												</div>
											</div>

											<Table>
												<TableHeader>
													<TableRow>
														<TableHead className="text-xs">Course</TableHead>
														<TableHead className="text-xs text-center">Int</TableHead>
														<TableHead className="text-xs text-center">Ext</TableHead>
														<TableHead className="text-xs text-center">Total</TableHead>
														<TableHead className="text-xs text-center">%</TableHead>
														<TableHead className="text-xs text-center">Grade</TableHead>
														<TableHead className="text-xs text-center">GP</TableHead>
														<TableHead className="text-xs text-center">Cr</TableHead>
														<TableHead className="text-xs text-center">CP</TableHead>
														<TableHead className="text-xs text-center">Status</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{student.courses.map(course => (
														<TableRow key={course.course_id}>
															<TableCell className="text-xs">
																<span className="font-medium">{course.course_code}</span>
																<span className="text-muted-foreground ml-1">- {course.course_name}</span>
															</TableCell>
															<TableCell className="text-xs text-center">{course.internal_marks}/{course.internal_max}</TableCell>
															<TableCell className="text-xs text-center">{course.external_marks}/{course.external_max}</TableCell>
															<TableCell className="text-xs text-center font-medium">{course.total_marks}/{course.total_max}</TableCell>
															<TableCell className="text-xs text-center">{course.percentage.toFixed(1)}%</TableCell>
															<TableCell className="text-xs text-center">
																<Badge variant="outline">{course.letter_grade}</Badge>
															</TableCell>
															<TableCell className="text-xs text-center font-bold">{course.grade_point}</TableCell>
															<TableCell className="text-xs text-center">{course.credits}</TableCell>
															<TableCell className="text-xs text-center">{course.credit_points.toFixed(1)}</TableCell>
															<TableCell className="text-xs text-center">
																<Badge variant={course.is_pass ? "default" : "destructive"} className={course.is_pass ? 'bg-green-600' : 'bg-red-600'}>
																	{course.is_pass ? 'Pass' : 'Fail'}
																</Badge>
															</TableCell>
														</TableRow>
													))}
													<TableRow className="bg-muted/30">
														<TableCell colSpan={6} className="text-xs font-semibold text-right">
															GPA Calculation: Σ(Ci × Gi) / ΣCi = {student.total_credit_points.toFixed(1)} / {student.total_credits}
														</TableCell>
														<TableCell colSpan={4} className="text-xs font-bold text-green-600">
															= {student.semester_gpa.toFixed(2)}
														</TableCell>
													</TableRow>
												</TableBody>
											</Table>
										</div>
									))}
								</CardContent>
							</Card>
						</>
					)}

					{/* CGPA Results */}
					{showCGPA && cgpaResults.length > 0 && (
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-lg">CGPA Results</CardTitle>
								<CardDescription>Cumulative GPA calculated across all semesters</CardDescription>
							</CardHeader>
							<CardContent>
								{cgpaResults.map(result => (
									<div key={result.student_id} className="mb-6 last:mb-0">
										<div className="flex items-center justify-between mb-3 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
											<div>
												<span className="font-bold">{result.register_no}</span>
												<span className="text-muted-foreground mx-2">-</span>
												<span>{result.student_name}</span>
											</div>
											<div className="flex items-center gap-4">
												<Badge variant="outline">Total Credits: {result.overall_credits}</Badge>
												<Badge className="bg-purple-600 text-white text-lg px-4">
													CGPA: {result.cgpa.toFixed(2)}
												</Badge>
											</div>
										</div>

										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-xs">Semester</TableHead>
													<TableHead className="text-xs text-center">Courses</TableHead>
													<TableHead className="text-xs text-center">Passed</TableHead>
													<TableHead className="text-xs text-center">Failed</TableHead>
													<TableHead className="text-xs text-center">Total Credits (TCn)</TableHead>
													<TableHead className="text-xs text-center">GPA (GPAn)</TableHead>
													<TableHead className="text-xs text-center">GPAn × TCn</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{result.semesters.map(sem => (
													<TableRow key={sem.semester}>
														<TableCell className="text-xs font-medium">Semester {sem.semester}</TableCell>
														<TableCell className="text-xs text-center">{sem.courses_count}</TableCell>
														<TableCell className="text-xs text-center text-green-600">{sem.passed_count}</TableCell>
														<TableCell className="text-xs text-center text-red-600">{sem.failed_count}</TableCell>
														<TableCell className="text-xs text-center">{sem.total_credits}</TableCell>
														<TableCell className="text-xs text-center font-bold">{sem.gpa.toFixed(2)}</TableCell>
														<TableCell className="text-xs text-center">{sem.total_credit_points.toFixed(2)}</TableCell>
													</TableRow>
												))}
												<TableRow className="bg-muted/30">
													<TableCell colSpan={4} className="text-xs font-semibold text-right">
														CGPA = Σ(GPAn × TCn) / ΣTCn
													</TableCell>
													<TableCell className="text-xs text-center font-bold">{result.overall_credits}</TableCell>
													<TableCell className="text-xs text-center">-</TableCell>
													<TableCell className="text-xs text-center font-bold">{result.overall_credit_points.toFixed(2)}</TableCell>
												</TableRow>
												<TableRow className="bg-purple-50 dark:bg-purple-900/20">
													<TableCell colSpan={5} className="text-xs font-semibold text-right">
														CGPA = {result.overall_credit_points.toFixed(2)} / {result.overall_credits}
													</TableCell>
													<TableCell colSpan={2} className="text-sm font-bold text-purple-700 dark:text-purple-300">
														= {result.cgpa.toFixed(2)}
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>
								))}
							</CardContent>
						</Card>
					)}

					{/* Example Calculation Card */}
					<Card className="border-green-200 bg-green-50/50 dark:bg-green-900/10 dark:border-green-800">
						<CardHeader className="pb-2">
							<CardTitle className="text-lg flex items-center gap-2">
								<Calculator className="h-5 w-5" />
								Example Calculation (From Your Image)
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="bg-white dark:bg-slate-900 p-4 rounded-lg border">
									<h4 className="font-semibold text-sm mb-3 text-green-700 dark:text-green-300">Semester 1 GPA</h4>
									<div className="space-y-2 text-xs">
										<div className="grid grid-cols-3 gap-2 font-medium">
											<span>Course</span>
											<span>Credits (Ci)</span>
											<span>Grade Points (Gi)</span>
										</div>
										<div className="grid grid-cols-3 gap-2">
											<span>Course 1</span>
											<span>3</span>
											<span>8</span>
										</div>
										<div className="grid grid-cols-3 gap-2">
											<span>Course 2</span>
											<span>4</span>
											<span>9</span>
										</div>
										<div className="grid grid-cols-3 gap-2">
											<span>Course 3</span>
											<span>3</span>
											<span>7</span>
										</div>
										<div className="border-t pt-2 mt-2">
											<code className="block bg-slate-100 dark:bg-slate-800 p-2 rounded">
												GPA = (3×8 + 4×9 + 3×7) / (3+4+3)
												<br />
												GPA = (24 + 36 + 21) / 10 = 81/10 = <strong>8.1</strong>
											</code>
										</div>
									</div>
								</div>

								<div className="bg-white dark:bg-slate-900 p-4 rounded-lg border">
									<h4 className="font-semibold text-sm mb-3 text-purple-700 dark:text-purple-300">CGPA (2 Semesters)</h4>
									<div className="space-y-2 text-xs">
										<div className="grid grid-cols-3 gap-2 font-medium">
											<span>Semester</span>
											<span>GPA (GPAn)</span>
											<span>Credits (TCn)</span>
										</div>
										<div className="grid grid-cols-3 gap-2">
											<span>Sem 1</span>
											<span>8.1</span>
											<span>10</span>
										</div>
										<div className="grid grid-cols-3 gap-2">
											<span>Sem 2</span>
											<span>8.55</span>
											<span>10</span>
										</div>
										<div className="border-t pt-2 mt-2">
											<code className="block bg-slate-100 dark:bg-slate-800 p-2 rounded">
												CGPA = (8.1×10 + 8.55×10) / (10+10)
												<br />
												CGPA = (81 + 85.5) / 20 = 166.5/20 = <strong>8.33</strong>
											</code>
										</div>
									</div>
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
