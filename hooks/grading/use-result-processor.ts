import { useState, useCallback, useMemo } from 'react'

interface StudentMark {
	studentId: string
	studentName: string
	rollNumber: string
	courseCode: string
	internalMarks?: number
	externalMarks?: number
	totalMarks: number
	maxMarks: number
	isAbsent?: boolean
	isMalpractice?: boolean
}

interface ProcessedResult extends StudentMark {
	percentage: number
	grade: string
	gradePoint: number
	status: 'pass' | 'fail' | 'absent' | 'malpractice'
}

interface ResultStatistics {
	totalStudents: number
	passCount: number
	failCount: number
	absentCount: number
	malpracticeCount: number
	passPercentage: number
	averageMarks: number
	highestMarks: number
	lowestMarks: number
	averagePercentage: number
}

/**
 * Custom hook for processing examination results
 *
 * @example
 * const {
 *   processedResults,
 *   statistics,
 *   processResults,
 *   filterByStatus,
 *   sortByMarks
 * } = useResultProcessor()
 */
export function useResultProcessor() {
	const [results, setResults] = useState<ProcessedResult[]>([])

	// Process raw marks into results with grades
	const processResults = useCallback((
		marks: StudentMark[],
		passingPercentage = 50,
		gradingFn?: (percentage: number) => { grade: string; gradePoint: number }
	) => {
		const defaultGrading = (percentage: number) => {
			if (percentage >= 90) return { grade: 'O', gradePoint: 10 }
			if (percentage >= 80) return { grade: 'A+', gradePoint: 9 }
			if (percentage >= 70) return { grade: 'A', gradePoint: 8 }
			if (percentage >= 60) return { grade: 'B+', gradePoint: 7 }
			if (percentage >= 55) return { grade: 'B', gradePoint: 6 }
			if (percentage >= 50) return { grade: 'C', gradePoint: 5 }
			return { grade: 'U', gradePoint: 0 }
		}

		const gradeCalculator = gradingFn || defaultGrading

		const processed: ProcessedResult[] = marks.map((mark) => {
			let status: ProcessedResult['status'] = 'pass'
			const percentage = (mark.totalMarks / mark.maxMarks) * 100

			if (mark.isMalpractice) {
				status = 'malpractice'
			} else if (mark.isAbsent) {
				status = 'absent'
			} else if (percentage < passingPercentage) {
				status = 'fail'
			}

			const { grade, gradePoint } = gradeCalculator(percentage)

			return {
				...mark,
				percentage: Math.round(percentage * 100) / 100,
				grade: status === 'absent' ? 'AB' : status === 'malpractice' ? 'MP' : grade,
				gradePoint: status === 'pass' ? gradePoint : 0,
				status
			}
		})

		setResults(processed)
		return processed
	}, [])

	// Calculate statistics
	const statistics = useMemo((): ResultStatistics => {
		if (results.length === 0) {
			return {
				totalStudents: 0,
				passCount: 0,
				failCount: 0,
				absentCount: 0,
				malpracticeCount: 0,
				passPercentage: 0,
				averageMarks: 0,
				highestMarks: 0,
				lowestMarks: 0,
				averagePercentage: 0
			}
		}

		let passCount = 0
		let failCount = 0
		let absentCount = 0
		let malpracticeCount = 0
		let totalMarks = 0
		let totalPercentage = 0
		let highestMarks = -Infinity
		let lowestMarks = Infinity
		let validCount = 0

		for (const r of results) {
			switch (r.status) {
				case 'pass': passCount++; break
				case 'fail': failCount++; break
				case 'absent': absentCount++; break
				case 'malpractice': malpracticeCount++; break
			}
			if (r.status !== 'absent' && r.status !== 'malpractice') {
				validCount++
				totalMarks += r.totalMarks
				totalPercentage += r.percentage
				if (r.totalMarks > highestMarks) highestMarks = r.totalMarks
				if (r.totalMarks < lowestMarks) lowestMarks = r.totalMarks
			}
		}

		return {
			totalStudents: results.length,
			passCount,
			failCount,
			absentCount,
			malpracticeCount,
			passPercentage:
				results.length > 0
					? Math.round((passCount / results.length) * 100 * 100) / 100
					: 0,
			averageMarks:
				validCount > 0
					? Math.round((totalMarks / validCount) * 100) / 100
					: 0,
			highestMarks: validCount > 0 ? highestMarks : 0,
			lowestMarks: validCount > 0 ? lowestMarks : 0,
			averagePercentage:
				validCount > 0
					? Math.round((totalPercentage / validCount) * 100) / 100
					: 0
		}
	}, [results])

	// Filter results by status
	const filterByStatus = useCallback(
		(status: ProcessedResult['status']) => {
			return results.filter((r) => r.status === status)
		},
		[results]
	)

	// Sort results by marks
	const sortByMarks = useCallback(
		(ascending = false) => {
			return [...results].sort((a, b) =>
				ascending ? a.totalMarks - b.totalMarks : b.totalMarks - a.totalMarks
			)
		},
		[results]
	)

	// Sort results by percentage
	const sortByPercentage = useCallback(
		(ascending = false) => {
			return [...results].sort((a, b) =>
				ascending ? a.percentage - b.percentage : b.percentage - a.percentage
			)
		},
		[results]
	)

	// Get top performers
	const getTopPerformers = useCallback(
		(count = 10) => {
			return sortByMarks().slice(0, count)
		},
		[sortByMarks]
	)

	// Get students needing attention (borderline cases)
	const getBorderlineCases = useCallback(
		(passingPercentage = 50, threshold = 5) => {
			return results.filter((r) => {
				const diff = Math.abs(r.percentage - passingPercentage)
				return diff <= threshold && r.status !== 'absent' && r.status !== 'malpractice'
			})
		},
		[results]
	)

	// Export results to CSV format
	const exportToCSV = useCallback(() => {
		const headers = [
			'Roll Number',
			'Student Name',
			'Course Code',
			'Internal Marks',
			'External Marks',
			'Total Marks',
			'Max Marks',
			'Percentage',
			'Grade',
			'Grade Point',
			'Status'
		]

		const rows = results.map((r) => [
			r.rollNumber,
			r.studentName,
			r.courseCode,
			r.internalMarks || 'N/A',
			r.externalMarks || 'N/A',
			r.totalMarks,
			r.maxMarks,
			r.percentage,
			r.grade,
			r.gradePoint,
			r.status
		])

		return [headers, ...rows].map((row) => row.join(',')).join('\n')
	}, [results])

	return {
		results,
		processedResults: results,
		statistics,
		processResults,
		filterByStatus,
		sortByMarks,
		sortByPercentage,
		getTopPerformers,
		getBorderlineCases,
		exportToCSV,
		setResults
	}
}
