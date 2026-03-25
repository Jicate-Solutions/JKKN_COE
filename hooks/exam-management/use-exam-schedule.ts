import { useState, useMemo, useCallback } from 'react'
import { useInterval } from '@/hooks/common/use-interval'

interface ExamSession {
	id: string
	examName: string
	courseCode: string
	courseName: string
	date: Date | string
	startTime: string
	endTime: string
	duration: number // in minutes
	venue?: string
	status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled'
}

interface ExamScheduleStats {
	total: number
	upcoming: number
	ongoing: number
	completed: number
	cancelled: number
	today: number
	thisWeek: number
}

/**
 * Custom hook for managing examination schedules
 *
 * @example
 * const {
 *   exams,
 *   upcomingExams,
 *   todayExams,
 *   stats,
 *   addExam,
 *   updateExamStatus
 * } = useExamSchedule(examSessions)
 */
export function useExamSchedule(initialExams: ExamSession[] = []) {
	const [exams, setExams] = useState<ExamSession[]>(initialExams)

	// Auto-update exam statuses based on current time
	const updateExamStatuses = useCallback(() => {
		const now = new Date()

		setExams((prevExams) =>
			prevExams.map((exam) => {
				const examDate = new Date(exam.date)
				const [startHour, startMinute] = exam.startTime.split(':').map(Number)
				const [endHour, endMinute] = exam.endTime.split(':').map(Number)

				const examStart = new Date(examDate)
				examStart.setHours(startHour, startMinute, 0)

				const examEnd = new Date(examDate)
				examEnd.setHours(endHour, endMinute, 0)

				let status: ExamSession['status'] = exam.status

				if (exam.status !== 'cancelled') {
					if (now < examStart) {
						status = 'upcoming'
					} else if (now >= examStart && now <= examEnd) {
						status = 'ongoing'
					} else if (now > examEnd) {
						status = 'completed'
					}
				}

				return { ...exam, status }
			})
		)
	}, [])

	// Update statuses every minute
	useInterval(updateExamStatuses, 60000) // 60 seconds

	// Get today's exams
	const todayExams = useMemo(() => {
		const today = new Date()
		today.setHours(0, 0, 0, 0)

		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		return exams.filter((exam) => {
			const examDate = new Date(exam.date)
			examDate.setHours(0, 0, 0, 0)
			return examDate >= today && examDate < tomorrow
		})
	}, [exams])

	// Get upcoming exams (sorted by date)
	const upcomingExams = useMemo(() => {
		return exams
			.filter((exam) => exam.status === 'upcoming')
			.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
	}, [exams])

	// Get this week's exams
	const thisWeekExams = useMemo(() => {
		const today = new Date()
		today.setHours(0, 0, 0, 0)

		const weekEnd = new Date(today)
		weekEnd.setDate(weekEnd.getDate() + 7)

		return exams.filter((exam) => {
			const examDate = new Date(exam.date)
			examDate.setHours(0, 0, 0, 0)
			return examDate >= today && examDate < weekEnd
		})
	}, [exams])

	// Get ongoing exams
	const ongoingExams = useMemo(() => {
		return exams.filter((exam) => exam.status === 'ongoing')
	}, [exams])

	// Calculate statistics
	const stats = useMemo((): ExamScheduleStats => {
		return {
			total: exams.length,
			upcoming: exams.filter((e) => e.status === 'upcoming').length,
			ongoing: exams.filter((e) => e.status === 'ongoing').length,
			completed: exams.filter((e) => e.status === 'completed').length,
			cancelled: exams.filter((e) => e.status === 'cancelled').length,
			today: todayExams.length,
			thisWeek: thisWeekExams.length
		}
	}, [exams, todayExams, thisWeekExams])

	// Add exam
	const addExam = useCallback((exam: ExamSession) => {
		setExams((prev) => [...prev, exam])
	}, [])

	// Update exam
	const updateExam = useCallback((id: string, updates: Partial<ExamSession>) => {
		setExams((prev) =>
			prev.map((exam) => (exam.id === id ? { ...exam, ...updates } : exam))
		)
	}, [])

	// Remove exam
	const removeExam = useCallback((id: string) => {
		setExams((prev) => prev.filter((exam) => exam.id !== id))
	}, [])

	// Cancel exam
	const cancelExam = useCallback((id: string) => {
		updateExam(id, { status: 'cancelled' })
	}, [updateExam])

	// Get exam by ID
	const getExamById = useCallback(
		(id: string) => {
			return exams.find((exam) => exam.id === id)
		},
		[exams]
	)

	// Get exams by date range
	const getExamsByDateRange = useCallback(
		(startDate: Date, endDate: Date) => {
			return exams.filter((exam) => {
				const examDate = new Date(exam.date)
				return examDate >= startDate && examDate <= endDate
			})
		},
		[exams]
	)

	// Check for exam conflicts (same date and overlapping time)
	const hasConflict = useCallback(
		(exam: ExamSession) => {
			return exams.some((existing) => {
				if (existing.id === exam.id) return false

				const sameDate =
					new Date(existing.date).toDateString() === new Date(exam.date).toDateString()

				if (!sameDate) return false

				// Check time overlap
				const existingStart = existing.startTime
				const existingEnd = existing.endTime
				const newStart = exam.startTime
				const newEnd = exam.endTime

				return (
					(newStart >= existingStart && newStart < existingEnd) ||
					(newEnd > existingStart && newEnd <= existingEnd) ||
					(newStart <= existingStart && newEnd >= existingEnd)
				)
			})
		},
		[exams]
	)

	return {
		exams,
		todayExams,
		upcomingExams,
		ongoingExams,
		thisWeekExams,
		stats,
		addExam,
		updateExam,
		removeExam,
		cancelExam,
		getExamById,
		getExamsByDateRange,
		hasConflict
	}
}
