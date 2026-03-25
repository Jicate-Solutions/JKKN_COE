import { useMemo } from 'react'

interface GradeConfig {
	minPercentage: number
	maxPercentage: number
	grade: string
	gradePoint: number
	description: string
}

const DEFAULT_GRADING_SCALE: GradeConfig[] = [
	{ minPercentage: 90, maxPercentage: 100, grade: 'O', gradePoint: 10, description: 'Outstanding' },
	{ minPercentage: 80, maxPercentage: 89, grade: 'A+', gradePoint: 9, description: 'Excellent' },
	{ minPercentage: 70, maxPercentage: 79, grade: 'A', gradePoint: 8, description: 'Very Good' },
	{ minPercentage: 60, maxPercentage: 69, grade: 'B+', gradePoint: 7, description: 'Good' },
	{ minPercentage: 55, maxPercentage: 59, grade: 'B', gradePoint: 6, description: 'Above Average' },
	{ minPercentage: 50, maxPercentage: 54, grade: 'C', gradePoint: 5, description: 'Average' },
	{ minPercentage: 0, maxPercentage: 49, grade: 'U', gradePoint: 0, description: 'Fail' }
]

interface CourseResult {
	courseCode: string
	courseName: string
	credits: number
	marksObtained: number
	maxMarks: number
}

interface CalculatedResult extends CourseResult {
	percentage: number
	grade: string
	gradePoint: number
	creditPoints: number
}

interface CGPAResult {
	results: CalculatedResult[]
	totalCredits: number
	totalCreditPoints: number
	cgpa: number
	percentage: number
	overallGrade: string
}

/**
 * Custom hook for grade and CGPA calculations
 *
 * @example
 * const { calculateGrade, calculateCGPA, gradingScale } = useGradeCalculator()
 *
 * const grade = calculateGrade(85)
 * const cgpaResult = calculateCGPA(courseResults)
 */
export function useGradeCalculator(customGradingScale?: GradeConfig[]) {
	const gradingScale = customGradingScale || DEFAULT_GRADING_SCALE

	// Calculate grade for a percentage
	const calculateGrade = useMemo(
		() => (percentage: number): GradeConfig => {
			const grade = gradingScale.find(
				(config) =>
					percentage >= config.minPercentage && percentage <= config.maxPercentage
			)

			return (
				grade || {
					minPercentage: 0,
					maxPercentage: 0,
					grade: 'N/A',
					gradePoint: 0,
					description: 'Not Available'
				}
			)
		},
		[gradingScale]
	)

	// Calculate percentage from marks
	const calculatePercentage = useMemo(
		() => (marksObtained: number, maxMarks: number): number => {
			if (maxMarks === 0) return 0
			return Math.round((marksObtained / maxMarks) * 100 * 100) / 100 // Round to 2 decimals
		},
		[]
	)

	// Calculate CGPA from multiple course results
	const calculateCGPA = useMemo(
		() => (courseResults: CourseResult[]): CGPAResult => {
			const calculatedResults: CalculatedResult[] = courseResults.map((result) => {
				const percentage = calculatePercentage(result.marksObtained, result.maxMarks)
				const gradeInfo = calculateGrade(percentage)
				const creditPoints = gradeInfo.gradePoint * result.credits

				return {
					...result,
					percentage,
					grade: gradeInfo.grade,
					gradePoint: gradeInfo.gradePoint,
					creditPoints
				}
			})

			const totalCredits = calculatedResults.reduce(
				(sum, result) => sum + result.credits,
				0
			)
			const totalCreditPoints = calculatedResults.reduce(
				(sum, result) => sum + result.creditPoints,
				0
			)

			const cgpa =
				totalCredits > 0
					? Math.round((totalCreditPoints / totalCredits) * 100) / 100
					: 0

			// Calculate overall percentage (weighted average)
			const totalMarksObtained = calculatedResults.reduce(
				(sum, result) => sum + result.marksObtained,
				0
			)
			const totalMaxMarks = calculatedResults.reduce(
				(sum, result) => sum + result.maxMarks,
				0
			)
			const overallPercentage = calculatePercentage(totalMarksObtained, totalMaxMarks)
			const overallGradeInfo = calculateGrade(overallPercentage)

			return {
				results: calculatedResults,
				totalCredits,
				totalCreditPoints,
				cgpa,
				percentage: overallPercentage,
				overallGrade: overallGradeInfo.grade
			}
		},
		[calculateGrade, calculatePercentage]
	)

	// Get pass/fail status
	const isPassing = useMemo(
		() => (percentage: number): boolean => {
			const grade = calculateGrade(percentage)
			return grade.gradePoint > 0
		},
		[calculateGrade]
	)

	// Calculate grade points for a specific mark
	const getGradePoint = useMemo(
		() => (marksObtained: number, maxMarks: number): number => {
			const percentage = calculatePercentage(marksObtained, maxMarks)
			const grade = calculateGrade(percentage)
			return grade.gradePoint
		},
		[calculateGrade, calculatePercentage]
	)

	return {
		gradingScale,
		calculateGrade,
		calculatePercentage,
		calculateCGPA,
		isPassing,
		getGradePoint
	}
}
