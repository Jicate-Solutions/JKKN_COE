"use client"

import { useState } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import {
	CheckCircle2,
	XCircle,
	AlertTriangle,
	Play,
	RotateCcw,
	Calculator,
	BookOpen,
	GraduationCap,
	FileText,
	Loader2,
	ArrowRight,
	Info,
	TestTube,
	Workflow,
	ClipboardList
} from "lucide-react"

// =====================================================
// TEST CASE TYPES
// =====================================================

interface TestCase {
	id: string
	name: string
	description: string
	category: 'gpa' | 'cgpa' | 'backlog' | 'workflow'
	input: any
	expectedOutput: any
	status: 'pending' | 'running' | 'passed' | 'failed'
	actualOutput?: any
	error?: string
}

interface WorkflowStep {
	id: string
	name: string
	description: string
	status: 'pending' | 'running' | 'completed' | 'failed'
	details?: string
}

// =====================================================
// GRADE TABLES (Same as API)
// =====================================================

const UG_GRADE_TABLE = [
	{ min: 90, max: 100, gradePoint: 10.0, letterGrade: 'O', description: 'Outstanding' },
	{ min: 80, max: 89, gradePoint: 9.0, letterGrade: 'D+', description: 'Excellent' },
	{ min: 75, max: 79, gradePoint: 8.0, letterGrade: 'D', description: 'Distinction' },
	{ min: 70, max: 74, gradePoint: 7.5, letterGrade: 'A+', description: 'Very Good' },
	{ min: 60, max: 69, gradePoint: 7.0, letterGrade: 'A', description: 'Good' },
	{ min: 50, max: 59, gradePoint: 6.0, letterGrade: 'B', description: 'Average' },
	{ min: 40, max: 49, gradePoint: 5.0, letterGrade: 'C', description: 'Satisfactory' },
	{ min: 0, max: 39, gradePoint: 0.0, letterGrade: 'U', description: 'Re-Appear' },
]

const PG_GRADE_TABLE = [
	{ min: 90, max: 100, gradePoint: 10.0, letterGrade: 'O', description: 'Outstanding' },
	{ min: 80, max: 89, gradePoint: 9.0, letterGrade: 'D+', description: 'Excellent' },
	{ min: 75, max: 79, gradePoint: 8.0, letterGrade: 'D', description: 'Distinction' },
	{ min: 70, max: 74, gradePoint: 7.5, letterGrade: 'A+', description: 'Very Good' },
	{ min: 60, max: 69, gradePoint: 7.0, letterGrade: 'A', description: 'Good' },
	{ min: 50, max: 59, gradePoint: 6.0, letterGrade: 'B', description: 'Average' },
	{ min: 0, max: 49, gradePoint: 0.0, letterGrade: 'U', description: 'Re-Appear' },
]

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function getGradeFromPercentage(percentage: number, programType: 'UG' | 'PG') {
	const gradeTable = programType === 'UG' ? UG_GRADE_TABLE : PG_GRADE_TABLE
	for (const grade of gradeTable) {
		if (percentage >= grade.min && percentage <= grade.max) {
			return grade
		}
	}
	return { gradePoint: 0, letterGrade: 'U', description: 'Re-Appear' }
}

function calculateGPA(courses: { credits: number; gradePoint: number }[]): number {
	if (courses.length === 0) return 0
	const totalCreditPoints = courses.reduce((sum, c) => sum + (c.credits * c.gradePoint), 0)
	const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0)
	return totalCredits > 0 ? Math.round((totalCreditPoints / totalCredits) * 100) / 100 : 0
}

function calculateCGPA(semesters: { gpa: number; credits: number }[]): number {
	if (semesters.length === 0) return 0
	const totalWeightedGPA = semesters.reduce((sum, s) => sum + (s.gpa * s.credits), 0)
	const totalCredits = semesters.reduce((sum, s) => sum + s.credits, 0)
	return totalCredits > 0 ? Math.round((totalWeightedGPA / totalCredits) * 100) / 100 : 0
}

function parseSemesterCode(code: string): number {
	const hyphenMatch = code.match(/-(\d+)$/)
	if (hyphenMatch) return parseInt(hyphenMatch[1], 10)
	const trailingMatch = code.match(/(\d+)$/)
	if (trailingMatch) return parseInt(trailingMatch[1], 10)
	return 0
}

function checkPassStatus(externalPercentage: number, totalPercentage: number, programType: 'UG' | 'PG'): boolean {
	const req = programType === 'UG' ? { ce: 40, total: 40 } : { ce: 50, total: 50 }
	return externalPercentage >= req.ce && totalPercentage >= req.total
}

// =====================================================
// TEST CASES DATA
// =====================================================

const initialTestCases: TestCase[] = [
	// GPA Calculation Tests
	{
		id: 'gpa-1',
		name: 'GPA Calculation - All Pass',
		description: 'Calculate GPA for a learner who passed all courses',
		category: 'gpa',
		input: {
			programType: 'UG',
			courses: [
				{ code: 'TAM101', credits: 3, percentage: 85 }, // D+ = 9.0
				{ code: 'ENG101', credits: 3, percentage: 78 }, // D = 8.0
				{ code: 'MAT101', credits: 4, percentage: 92 }, // O = 10.0
				{ code: 'PHY101', credits: 4, percentage: 65 }, // A = 7.0
				{ code: 'CHE101', credits: 3, percentage: 55 }, // B = 6.0
			]
		},
		expectedOutput: {
			gpa: 8.0, // (3*9 + 3*8 + 4*10 + 4*7 + 3*6) / 17 = 136/17 = 8.0
			totalCredits: 17,
			totalCreditPoints: 136
		},
		status: 'pending'
	},
	{
		id: 'gpa-2',
		name: 'GPA Calculation - With Fail',
		description: 'Calculate GPA for a learner with one failed course',
		category: 'gpa',
		input: {
			programType: 'UG',
			courses: [
				{ code: 'TAM101', credits: 3, percentage: 75 }, // D = 8.0
				{ code: 'ENG101', credits: 3, percentage: 68 }, // A = 7.0
				{ code: 'MAT101', credits: 4, percentage: 35 }, // U = 0.0 (FAIL)
				{ code: 'PHY101', credits: 4, percentage: 72 }, // A+ = 7.5
			]
		},
		expectedOutput: {
			gpa: 5.21, // (3*8 + 3*7 + 4*0 + 4*7.5) / 14 = 73/14 = 5.21
			totalCredits: 14,
			passedCourses: 3,
			failedCourses: 1
		},
		status: 'pending'
	},
	{
		id: 'gpa-3',
		name: 'GPA Calculation - PG Program',
		description: 'Calculate GPA for PG program (50% passing)',
		category: 'gpa',
		input: {
			programType: 'PG',
			courses: [
				{ code: 'MBA501', credits: 4, percentage: 88 }, // D+ = 9.0
				{ code: 'MBA502', credits: 4, percentage: 72 }, // A+ = 7.5
				{ code: 'MBA503', credits: 3, percentage: 48 }, // U = 0.0 (FAIL in PG)
				{ code: 'MBA504', credits: 3, percentage: 65 }, // A = 7.0
			]
		},
		expectedOutput: {
			gpa: 6.0, // (4*9 + 4*7.5 + 3*0 + 3*7) / 14 = 84/14 = 6.0
			totalCredits: 14,
			passedCourses: 3,
			failedCourses: 1
		},
		status: 'pending'
	},
	// CGPA Calculation Tests
	{
		id: 'cgpa-1',
		name: 'CGPA Calculation - Two Semesters',
		description: 'Calculate CGPA across two semesters',
		category: 'cgpa',
		input: {
			semesters: [
				{ semester: 1, gpa: 8.5, credits: 20 },
				{ semester: 2, gpa: 7.8, credits: 22 },
			]
		},
		expectedOutput: {
			cgpa: 8.13, // (8.5*20 + 7.8*22) / 42 = 341.6/42 = 8.13
			totalCredits: 42
		},
		status: 'pending'
	},
	{
		id: 'cgpa-2',
		name: 'CGPA Calculation - Four Semesters',
		description: 'Calculate CGPA across four semesters with varying credits',
		category: 'cgpa',
		input: {
			semesters: [
				{ semester: 1, gpa: 9.0, credits: 18 },
				{ semester: 2, gpa: 8.5, credits: 20 },
				{ semester: 3, gpa: 7.5, credits: 22 },
				{ semester: 4, gpa: 8.0, credits: 24 },
			]
		},
		expectedOutput: {
			cgpa: 8.19, // (9*18 + 8.5*20 + 7.5*22 + 8*24) / 84 = 688/84 = 8.19
			totalCredits: 84
		},
		status: 'pending'
	},
	// Semester Code Parsing Tests
	{
		id: 'parse-1',
		name: 'Parse Semester Code - UPH Format',
		description: 'Parse semester code UPH-1, UPH-2',
		category: 'workflow',
		input: { codes: ['UPH-1', 'UPH-2', 'UPH-3', 'UPH-4'] },
		expectedOutput: { parsed: [1, 2, 3, 4] },
		status: 'pending'
	},
	{
		id: 'parse-2',
		name: 'Parse Semester Code - MBA Format',
		description: 'Parse semester code MBA-1, MBA-2',
		category: 'workflow',
		input: { codes: ['MBA-1', 'MBA-2', 'MCA-3'] },
		expectedOutput: { parsed: [1, 2, 3] },
		status: 'pending'
	},
	{
		id: 'parse-3',
		name: 'Parse Semester Code - SEM Format',
		description: 'Parse semester code SEM1, SEM2 (no hyphen)',
		category: 'workflow',
		input: { codes: ['SEM1', 'SEM2', 'SEM3'] },
		expectedOutput: { parsed: [1, 2, 3] },
		status: 'pending'
	},
	// Pass/Fail Status Tests
	{
		id: 'pass-1',
		name: 'UG Pass Status - External 40%',
		description: 'UG learner with exactly 40% external (borderline pass)',
		category: 'workflow',
		input: {
			programType: 'UG',
			externalPercentage: 40,
			totalPercentage: 45
		},
		expectedOutput: { isPassed: true },
		status: 'pending'
	},
	{
		id: 'pass-2',
		name: 'UG Pass Status - External Below 40%',
		description: 'UG learner with external below 40% (fail)',
		category: 'workflow',
		input: {
			programType: 'UG',
			externalPercentage: 38,
			totalPercentage: 50
		},
		expectedOutput: { isPassed: false, failReason: 'External' },
		status: 'pending'
	},
	{
		id: 'pass-3',
		name: 'PG Pass Status - 50% Threshold',
		description: 'PG learner with exactly 50% (borderline pass)',
		category: 'workflow',
		input: {
			programType: 'PG',
			externalPercentage: 50,
			totalPercentage: 50
		},
		expectedOutput: { isPassed: true },
		status: 'pending'
	},
	{
		id: 'pass-4',
		name: 'PG Pass Status - Below 50%',
		description: 'PG learner with 48% external (fail)',
		category: 'workflow',
		input: {
			programType: 'PG',
			externalPercentage: 48,
			totalPercentage: 55
		},
		expectedOutput: { isPassed: false, failReason: 'External' },
		status: 'pending'
	},
	// Backlog Priority Tests
	{
		id: 'backlog-1',
		name: 'Backlog Priority - Critical',
		description: 'Backlog pending for 4+ semesters should be Critical',
		category: 'backlog',
		input: { semestersPending: 5, attemptCount: 2 },
		expectedOutput: { priority: 'Critical' },
		status: 'pending'
	},
	{
		id: 'backlog-2',
		name: 'Backlog Priority - High',
		description: 'Backlog pending for 2-3 semesters should be High',
		category: 'backlog',
		input: { semestersPending: 3, attemptCount: 2 },
		expectedOutput: { priority: 'High' },
		status: 'pending'
	},
	{
		id: 'backlog-3',
		name: 'Backlog Priority - Multiple Attempts',
		description: 'Backlog with 3+ attempts should be High',
		category: 'backlog',
		input: { semestersPending: 1, attemptCount: 3 },
		expectedOutput: { priority: 'High' },
		status: 'pending'
	},
]

// =====================================================
// WORKFLOW STEPS
// =====================================================

const workflowSteps: WorkflowStep[] = [
	{
		id: 'step-1',
		name: '1. Final Marks Generation',
		description: 'Generate final marks from internal + external marks',
		status: 'pending',
		details: `
			a. Upload internal marks (CIA)
			b. Upload external marks (CE)
			c. Calculate total marks and percentage
			d. Determine pass/fail status based on program type (UG: 40%, PG: 50%)
		`
	},
	{
		id: 'step-2',
		name: '2. Grade Assignment',
		description: 'Assign grades based on percentage',
		status: 'pending',
		details: `
			a. Apply UG or PG grade table based on program
			b. Calculate grade points for each course
			c. Calculate credit points (credits × grade points)
		`
	},
	{
		id: 'step-3',
		name: '3. GPA Calculation',
		description: 'Calculate semester GPA',
		status: 'pending',
		details: `
			Formula: GPA = Σ(Ci × Gi) / ΣCi
			Where:
			  Ci = Credits for course i
			  Gi = Grade point for course i
		`
	},
	{
		id: 'step-4',
		name: '4. Part-wise Grouping',
		description: 'Group courses by Part (I, II, III, IV, V)',
		status: 'pending',
		details: `
			UG Parts:
			  Part I  - Language I (Tamil/Hindi/French)
			  Part II - Language II (English)
			  Part III - Core/Major subjects
			  Part IV - Allied/Skill Enhancement
			  Part V  - Extension Activities
		`
	},
	{
		id: 'step-5',
		name: '5. CGPA Calculation',
		description: 'Calculate cumulative GPA across semesters',
		status: 'pending',
		details: `
			Formula: CGPA = Σ(GPAn × TCn) / ΣTCn
			Where:
			  GPAn = GPA of semester n
			  TCn = Total credits of semester n
		`
	},
	{
		id: 'step-6',
		name: '6. Backlog Tracking',
		description: 'Track and manage failed courses',
		status: 'pending',
		details: `
			a. Create backlog record for failed courses
			b. Assign priority (Critical/High/Normal/Low)
			c. Track attempt count and semesters pending
			d. Mark as cleared when passed in arrear exam
		`
	},
]

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function TestGPAWorkflowPage() {
	const { toast } = useToast()
	const [testCases, setTestCases] = useState<TestCase[]>(initialTestCases)
	const [workflow, setWorkflow] = useState<WorkflowStep[]>(workflowSteps)
	const [running, setRunning] = useState(false)
	const [activeTab, setActiveTab] = useState<'tests' | 'workflow' | 'grades'>('tests')

	// Run a single test case
	const runTestCase = (testCase: TestCase): TestCase => {
		const result = { ...testCase, status: 'running' as const }

		try {
			let actualOutput: any = {}

			if (testCase.category === 'gpa') {
				const { programType, courses } = testCase.input
				const processedCourses = courses.map((c: any) => {
					const grade = getGradeFromPercentage(c.percentage, programType)
					return {
						...c,
						gradePoint: grade.gradePoint,
						creditPoints: c.credits * grade.gradePoint,
						isPassed: checkPassStatus(c.percentage, c.percentage, programType)
					}
				})

				const gpa = calculateGPA(processedCourses.map((c: any) => ({ credits: c.credits, gradePoint: c.gradePoint })))
				const totalCredits = processedCourses.reduce((sum: number, c: any) => sum + c.credits, 0)
				const totalCreditPoints = processedCourses.reduce((sum: number, c: any) => sum + c.creditPoints, 0)

				actualOutput = {
					gpa: Math.round(gpa * 100) / 100,
					totalCredits,
					totalCreditPoints: Math.round(totalCreditPoints * 100) / 100,
					passedCourses: processedCourses.filter((c: any) => c.isPassed).length,
					failedCourses: processedCourses.filter((c: any) => !c.isPassed).length
				}
			} else if (testCase.category === 'cgpa') {
				const { semesters } = testCase.input
				const cgpa = calculateCGPA(semesters)
				const totalCredits = semesters.reduce((sum: any, s: any) => sum + s.credits, 0)

				actualOutput = {
					cgpa: Math.round(cgpa * 100) / 100,
					totalCredits
				}
			} else if (testCase.id.startsWith('parse')) {
				const { codes } = testCase.input
				actualOutput = { parsed: codes.map(parseSemesterCode) }
			} else if (testCase.id.startsWith('pass')) {
				const { programType, externalPercentage, totalPercentage } = testCase.input
				const isPassed = checkPassStatus(externalPercentage, totalPercentage, programType)
				actualOutput = {
					isPassed,
					failReason: !isPassed ? 'External' : undefined
				}
			} else if (testCase.category === 'backlog') {
				const { semestersPending, attemptCount } = testCase.input
				let priority = 'Normal'
				if (semestersPending >= 4) priority = 'Critical'
				else if (semestersPending >= 2 || attemptCount >= 3) priority = 'High'
				actualOutput = { priority }
			}

			// Compare with expected output
			const passed = JSON.stringify(actualOutput) === JSON.stringify(testCase.expectedOutput) ||
				(actualOutput.gpa !== undefined && Math.abs(actualOutput.gpa - testCase.expectedOutput.gpa) < 0.02) ||
				(actualOutput.cgpa !== undefined && Math.abs(actualOutput.cgpa - testCase.expectedOutput.cgpa) < 0.02)

			return {
				...result,
				status: passed ? 'passed' : 'failed',
				actualOutput
			}
		} catch (error) {
			return {
				...result,
				status: 'failed',
				error: error instanceof Error ? error.message : 'Unknown error'
			}
		}
	}

	// Run all test cases
	const runAllTests = async () => {
		setRunning(true)

		const results: TestCase[] = []
		for (const tc of testCases) {
			await new Promise(resolve => setTimeout(resolve, 200)) // Simulate async
			const result = runTestCase(tc)
			results.push(result)
			setTestCases([...results, ...testCases.slice(results.length)])
		}

		setTestCases(results)
		setRunning(false)

		const passed = results.filter(t => t.status === 'passed').length
		const failed = results.filter(t => t.status === 'failed').length

		toast({
			title: `Tests Complete: ${passed}/${results.length} passed`,
			description: failed > 0 ? `${failed} test(s) failed. Review details below.` : 'All tests passed!',
			className: failed === 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
		})
	}

	// Reset all tests
	const resetTests = () => {
		setTestCases(initialTestCases)
	}

	// Count test results
	const passedCount = testCases.filter(t => t.status === 'passed').length
	const failedCount = testCases.filter(t => t.status === 'failed').length
	const pendingCount = testCases.filter(t => t.status === 'pending').length

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
									<BreadcrumbPage>Test GPA Workflow</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Page Header */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-lg bg-gradient-to-r from-green-500 to-teal-600 flex items-center justify-center">
								<TestTube className="h-5 w-5 text-white" />
							</div>
							<div>
								<h1 className="text-2xl font-bold">GPA/CGPA Test Cases & Workflow</h1>
								<p className="text-sm text-muted-foreground">Validate calculations and understand the workflow</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Button variant="outline" size="sm" onClick={resetTests} disabled={running}>
								<RotateCcw className="h-4 w-4 mr-1" />
								Reset
							</Button>
							<Button onClick={runAllTests} disabled={running}>
								{running ? (
									<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running...</>
								) : (
									<><Play className="h-4 w-4 mr-2" /> Run All Tests</>
								)}
							</Button>
						</div>
					</div>

					{/* Test Summary */}
					<div className="grid grid-cols-4 gap-3">
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Total Tests</p>
										<p className="text-xl font-bold">{testCases.length}</p>
									</div>
									<ClipboardList className="h-5 w-5 text-blue-500" />
								</div>
							</CardContent>
						</Card>
						<Card className="bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-green-600">Passed</p>
										<p className="text-xl font-bold text-green-600">{passedCount}</p>
									</div>
									<CheckCircle2 className="h-5 w-5 text-green-500" />
								</div>
							</CardContent>
						</Card>
						<Card className="bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-red-600">Failed</p>
										<p className="text-xl font-bold text-red-600">{failedCount}</p>
									</div>
									<XCircle className="h-5 w-5 text-red-500" />
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Pending</p>
										<p className="text-xl font-bold text-orange-600">{pendingCount}</p>
									</div>
									<AlertTriangle className="h-5 w-5 text-orange-500" />
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Progress Bar */}
					{running && (
						<Progress value={(testCases.filter(t => t.status !== 'pending').length / testCases.length) * 100} className="h-2" />
					)}

					{/* Tabs */}
					<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
						<TabsList>
							<TabsTrigger value="tests" className="gap-2">
								<TestTube className="h-4 w-4" />
								Test Cases
							</TabsTrigger>
							<TabsTrigger value="workflow" className="gap-2">
								<Workflow className="h-4 w-4" />
								Workflow
							</TabsTrigger>
							<TabsTrigger value="grades" className="gap-2">
								<Calculator className="h-4 w-4" />
								Grade Tables
							</TabsTrigger>
						</TabsList>

						{/* Test Cases Tab */}
						<TabsContent value="tests" className="mt-4 space-y-4">
							{/* GPA Tests */}
							<Card>
								<CardHeader className="py-3">
									<CardTitle className="text-lg flex items-center gap-2">
										<Calculator className="h-5 w-5 text-blue-500" />
										GPA Calculation Tests
									</CardTitle>
								</CardHeader>
								<CardContent>
									<Accordion type="multiple" className="w-full">
										{testCases.filter(t => t.category === 'gpa').map(tc => (
											<AccordionItem key={tc.id} value={tc.id}>
												<AccordionTrigger className="hover:no-underline">
													<div className="flex items-center gap-3">
														{tc.status === 'passed' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
														{tc.status === 'failed' && <XCircle className="h-5 w-5 text-red-500" />}
														{tc.status === 'pending' && <AlertTriangle className="h-5 w-5 text-gray-400" />}
														{tc.status === 'running' && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
														<span className="font-medium">{tc.name}</span>
														<Badge variant="outline" className="text-xs">{tc.input.programType}</Badge>
													</div>
												</AccordionTrigger>
												<AccordionContent>
													<div className="space-y-3 p-4 bg-muted/30 rounded-lg">
														<p className="text-sm text-muted-foreground">{tc.description}</p>

														<div className="grid grid-cols-2 gap-4">
															<div>
																<h4 className="text-sm font-semibold mb-2">Input Courses:</h4>
																<Table>
																	<TableHeader>
																		<TableRow className="text-xs">
																			<TableHead>Code</TableHead>
																			<TableHead>Credits</TableHead>
																			<TableHead>%</TableHead>
																		</TableRow>
																	</TableHeader>
																	<TableBody>
																		{tc.input.courses.map((c: any, i: number) => (
																			<TableRow key={i} className="text-xs">
																				<TableCell>{c.code}</TableCell>
																				<TableCell>{c.credits}</TableCell>
																				<TableCell>{c.percentage}%</TableCell>
																			</TableRow>
																		))}
																	</TableBody>
																</Table>
															</div>

															<div>
																<h4 className="text-sm font-semibold mb-2">Expected Output:</h4>
																<div className="text-sm space-y-1">
																	<p>GPA: <strong>{tc.expectedOutput.gpa}</strong></p>
																	<p>Total Credits: <strong>{tc.expectedOutput.totalCredits}</strong></p>
																</div>

																{tc.actualOutput && (
																	<>
																		<h4 className="text-sm font-semibold mb-2 mt-4">Actual Output:</h4>
																		<div className="text-sm space-y-1">
																			<p>GPA: <strong className={tc.status === 'passed' ? 'text-green-600' : 'text-red-600'}>{tc.actualOutput.gpa}</strong></p>
																			<p>Total Credits: <strong>{tc.actualOutput.totalCredits}</strong></p>
																			{tc.actualOutput.passedCourses !== undefined && (
																				<p>Passed: {tc.actualOutput.passedCourses}, Failed: {tc.actualOutput.failedCourses}</p>
																			)}
																		</div>
																	</>
																)}
															</div>
														</div>
													</div>
												</AccordionContent>
											</AccordionItem>
										))}
									</Accordion>
								</CardContent>
							</Card>

							{/* CGPA Tests */}
							<Card>
								<CardHeader className="py-3">
									<CardTitle className="text-lg flex items-center gap-2">
										<GraduationCap className="h-5 w-5 text-purple-500" />
										CGPA Calculation Tests
									</CardTitle>
								</CardHeader>
								<CardContent>
									<Accordion type="multiple" className="w-full">
										{testCases.filter(t => t.category === 'cgpa').map(tc => (
											<AccordionItem key={tc.id} value={tc.id}>
												<AccordionTrigger className="hover:no-underline">
													<div className="flex items-center gap-3">
														{tc.status === 'passed' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
														{tc.status === 'failed' && <XCircle className="h-5 w-5 text-red-500" />}
														{tc.status === 'pending' && <AlertTriangle className="h-5 w-5 text-gray-400" />}
														<span className="font-medium">{tc.name}</span>
													</div>
												</AccordionTrigger>
												<AccordionContent>
													<div className="space-y-3 p-4 bg-muted/30 rounded-lg">
														<p className="text-sm text-muted-foreground">{tc.description}</p>
														<div className="grid grid-cols-2 gap-4">
															<div>
																<h4 className="text-sm font-semibold mb-2">Input Semesters:</h4>
																<Table>
																	<TableHeader>
																		<TableRow className="text-xs">
																			<TableHead>Sem</TableHead>
																			<TableHead>GPA</TableHead>
																			<TableHead>Credits</TableHead>
																		</TableRow>
																	</TableHeader>
																	<TableBody>
																		{tc.input.semesters.map((s: any, i: number) => (
																			<TableRow key={i} className="text-xs">
																				<TableCell>{s.semester}</TableCell>
																				<TableCell>{s.gpa}</TableCell>
																				<TableCell>{s.credits}</TableCell>
																			</TableRow>
																		))}
																	</TableBody>
																</Table>
															</div>
															<div>
																<h4 className="text-sm font-semibold mb-2">Expected:</h4>
																<p className="text-sm">CGPA: <strong>{tc.expectedOutput.cgpa}</strong></p>
																{tc.actualOutput && (
																	<>
																		<h4 className="text-sm font-semibold mb-2 mt-4">Actual:</h4>
																		<p className="text-sm">CGPA: <strong className={tc.status === 'passed' ? 'text-green-600' : 'text-red-600'}>{tc.actualOutput.cgpa}</strong></p>
																	</>
																)}
															</div>
														</div>
													</div>
												</AccordionContent>
											</AccordionItem>
										))}
									</Accordion>
								</CardContent>
							</Card>

							{/* Workflow & Backlog Tests */}
							<Card>
								<CardHeader className="py-3">
									<CardTitle className="text-lg flex items-center gap-2">
										<FileText className="h-5 w-5 text-orange-500" />
										Workflow & Backlog Tests
									</CardTitle>
								</CardHeader>
								<CardContent>
									<Accordion type="multiple" className="w-full">
										{testCases.filter(t => t.category === 'workflow' || t.category === 'backlog').map(tc => (
											<AccordionItem key={tc.id} value={tc.id}>
												<AccordionTrigger className="hover:no-underline">
													<div className="flex items-center gap-3">
														{tc.status === 'passed' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
														{tc.status === 'failed' && <XCircle className="h-5 w-5 text-red-500" />}
														{tc.status === 'pending' && <AlertTriangle className="h-5 w-5 text-gray-400" />}
														<span className="font-medium">{tc.name}</span>
														<Badge variant="outline" className="text-xs">{tc.category}</Badge>
													</div>
												</AccordionTrigger>
												<AccordionContent>
													<div className="space-y-3 p-4 bg-muted/30 rounded-lg">
														<p className="text-sm text-muted-foreground">{tc.description}</p>
														<div className="grid grid-cols-2 gap-4 text-sm">
															<div>
																<h4 className="font-semibold mb-2">Input:</h4>
																<pre className="text-xs bg-muted p-2 rounded">{JSON.stringify(tc.input, null, 2)}</pre>
															</div>
															<div>
																<h4 className="font-semibold mb-2">Expected:</h4>
																<pre className="text-xs bg-muted p-2 rounded">{JSON.stringify(tc.expectedOutput, null, 2)}</pre>
																{tc.actualOutput && (
																	<>
																		<h4 className="font-semibold mb-2 mt-4">Actual:</h4>
																		<pre className={`text-xs p-2 rounded ${tc.status === 'passed' ? 'bg-green-100 dark:bg-green-900/20' : 'bg-red-100 dark:bg-red-900/20'}`}>
																			{JSON.stringify(tc.actualOutput, null, 2)}
																		</pre>
																	</>
																)}
															</div>
														</div>
													</div>
												</AccordionContent>
											</AccordionItem>
										))}
									</Accordion>
								</CardContent>
							</Card>
						</TabsContent>

						{/* Workflow Tab */}
						<TabsContent value="workflow" className="mt-4">
							<Card>
								<CardHeader>
									<CardTitle className="text-lg flex items-center gap-2">
										<Workflow className="h-5 w-5 text-blue-500" />
										GPA/CGPA Calculation Workflow
									</CardTitle>
									<CardDescription>Step-by-step process for calculating grades and tracking results</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{workflow.map((step, index) => (
											<div key={step.id} className="relative">
												{index < workflow.length - 1 && (
													<div className="absolute left-6 top-12 bottom-0 w-0.5 bg-muted-foreground/20" />
												)}
												<div className="flex gap-4">
													<div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0">
														{index + 1}
													</div>
													<div className="flex-1 bg-muted/30 rounded-lg p-4">
														<h3 className="font-semibold text-lg">{step.name}</h3>
														<p className="text-sm text-muted-foreground mb-2">{step.description}</p>
														<pre className="text-xs bg-background p-3 rounded whitespace-pre-wrap">{step.details}</pre>
													</div>
												</div>
											</div>
										))}
									</div>

									{/* Formula Reference */}
									<Alert className="mt-6">
										<Info className="h-4 w-4" />
										<AlertTitle>Formula Reference</AlertTitle>
										<AlertDescription>
											<div className="grid grid-cols-2 gap-4 mt-2">
												<div className="p-3 bg-muted/50 rounded">
													<h4 className="font-semibold mb-1">GPA Formula</h4>
													<code className="text-sm">GPA = Σ(Ci × Gi) / ΣCi</code>
													<p className="text-xs text-muted-foreground mt-1">Ci = Credits, Gi = Grade Point</p>
												</div>
												<div className="p-3 bg-muted/50 rounded">
													<h4 className="font-semibold mb-1">CGPA Formula</h4>
													<code className="text-sm">CGPA = Σ(GPAn × TCn) / ΣTCn</code>
													<p className="text-xs text-muted-foreground mt-1">GPAn = Semester GPA, TCn = Semester Credits</p>
												</div>
											</div>
										</AlertDescription>
									</Alert>
								</CardContent>
							</Card>
						</TabsContent>

						{/* Grade Tables Tab */}
						<TabsContent value="grades" className="mt-4">
							<div className="grid grid-cols-2 gap-4">
								{/* UG Grade Table */}
								<Card>
									<CardHeader className="pb-3">
										<CardTitle className="text-lg flex items-center gap-2">
											<BookOpen className="h-5 w-5 text-blue-500" />
											UG Grade Conversion Table
										</CardTitle>
										<CardDescription>For Part I, II, III, IV, V courses</CardDescription>
									</CardHeader>
									<CardContent>
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Range</TableHead>
													<TableHead>Grade</TableHead>
													<TableHead>Points</TableHead>
													<TableHead>Description</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{UG_GRADE_TABLE.map(g => (
													<TableRow key={g.letterGrade}>
														<TableCell>{g.min}-{g.max}%</TableCell>
														<TableCell>
															<Badge variant="outline" className={g.letterGrade === 'U' ? 'text-red-600' : ''}>{g.letterGrade}</Badge>
														</TableCell>
														<TableCell className="font-bold">{g.gradePoint}</TableCell>
														<TableCell className="text-sm text-muted-foreground">{g.description}</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
										<Alert className="mt-4">
											<Info className="h-4 w-4" />
											<AlertTitle>UG Passing Requirements</AlertTitle>
											<AlertDescription>
												<ul className="text-sm mt-1">
													<li>CIA (Internal): No minimum</li>
													<li>CE (External): 40% minimum</li>
													<li>Total: 40% minimum</li>
												</ul>
											</AlertDescription>
										</Alert>
									</CardContent>
								</Card>

								{/* PG Grade Table */}
								<Card>
									<CardHeader className="pb-3">
										<CardTitle className="text-lg flex items-center gap-2">
											<GraduationCap className="h-5 w-5 text-purple-500" />
											PG Grade Conversion Table
										</CardTitle>
										<CardDescription>For Part A and Part B courses</CardDescription>
									</CardHeader>
									<CardContent>
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Range</TableHead>
													<TableHead>Grade</TableHead>
													<TableHead>Points</TableHead>
													<TableHead>Description</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{PG_GRADE_TABLE.map(g => (
													<TableRow key={g.letterGrade}>
														<TableCell>{g.min}-{g.max}%</TableCell>
														<TableCell>
															<Badge variant="outline" className={g.letterGrade === 'U' ? 'text-red-600' : ''}>{g.letterGrade}</Badge>
														</TableCell>
														<TableCell className="font-bold">{g.gradePoint}</TableCell>
														<TableCell className="text-sm text-muted-foreground">{g.description}</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
										<Alert className="mt-4">
											<Info className="h-4 w-4" />
											<AlertTitle>PG Passing Requirements</AlertTitle>
											<AlertDescription>
												<ul className="text-sm mt-1">
													<li>CIA (Internal): No minimum</li>
													<li>CE (External): 50% minimum</li>
													<li>Total: 50% minimum</li>
												</ul>
											</AlertDescription>
										</Alert>
									</CardContent>
								</Card>
							</div>

							{/* Part Classification */}
							<Card className="mt-4">
								<CardHeader className="pb-3">
									<CardTitle className="text-lg">UG Course Part Classification</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="grid grid-cols-5 gap-3">
										{[
											{ name: 'Part I', desc: 'Language I (Tamil/Hindi/French etc.)', color: 'bg-blue-500' },
											{ name: 'Part II', desc: 'Language II (English)', color: 'bg-green-500' },
											{ name: 'Part III', desc: 'Core/Major Subjects', color: 'bg-purple-500' },
											{ name: 'Part IV', desc: 'Allied/Skill Enhancement/Foundation', color: 'bg-orange-500' },
											{ name: 'Part V', desc: 'Extension Activities/Projects', color: 'bg-pink-500' },
										].map(part => (
											<div key={part.name} className="border rounded-lg overflow-hidden">
												<div className={`h-2 ${part.color}`} />
												<div className="p-3">
													<h4 className="font-semibold">{part.name}</h4>
													<p className="text-xs text-muted-foreground">{part.desc}</p>
												</div>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
