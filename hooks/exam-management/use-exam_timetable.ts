import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/common/use-toast'
import type { ExamTimetable, ExamTimetableFormData } from '@/types/exam_timetable'
import {
	fetchExamTimetables as fetchExamTimetablesService,
	createExamTimetable,
	updateExamTimetable,
	deleteExamTimetable
} from '@/services/exam-management/exam_timetable-service'

export function useExamTimetables() {
	const { toast } = useToast()
	const [examTimetables, setExamTimetables] = useState<ExamTimetable[]>([])
	const [loading, setLoading] = useState(true)

	// Fetch exam timetables
	const fetchExamTimetables = useCallback(async () => {
		try {
			setLoading(true)
			const data = await fetchExamTimetablesService()
			setExamTimetables(data)
		} catch (error) {
			console.error('Error fetching exam timetables:', error)
			toast({
				title: '❌ Fetch Failed',
				description: 'Failed to load exam timetables.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}, [toast])

	// Refresh exam timetables
	const refreshExamTimetables = useCallback(async () => {
		try {
			setLoading(true)
			const data = await fetchExamTimetablesService()
			setExamTimetables(data)
			toast({
				title: '✅ Refreshed',
				description: `Loaded ${data.length} exam timetables.`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error refreshing exam timetables:', error)
			toast({
				title: '❌ Refresh Failed',
				description: 'Failed to load exam timetables.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}, [toast])

	// Save exam timetable (create or update)
	const saveExamTimetable = useCallback(async (data: ExamTimetableFormData, editing: ExamTimetable | null) => {
		try {
			let savedExamTimetable: ExamTimetable

			if (editing) {
				savedExamTimetable = await updateExamTimetable(editing.id, data)
				setExamTimetables(prev => prev.map(item => item.id === editing.id ? savedExamTimetable : item))
				toast({
					title: '✅ Record Updated',
					description: 'Record has been updated successfully.',
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			} else {
				savedExamTimetable = await createExamTimetable(data)
				setExamTimetables(prev => [savedExamTimetable, ...prev])
				toast({
					title: '✅ Record Created',
					description: 'Record has been created successfully.',
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			}

			return savedExamTimetable
		} catch (error) {
			console.error('Save exam timetable error:', error)
			toast({
				title: '❌ Operation Failed',
				description: error instanceof Error ? error.message : 'Failed to save record.',
				variant: 'destructive'
			})
			throw error
		}
	}, [toast])

	// Remove exam timetable
	const removeExamTimetable = useCallback(async (id: string) => {
		try {
			await deleteExamTimetable(id)
			setExamTimetables(prev => prev.filter(item => item.id !== id))
			toast({
				title: '✅ Record Deleted',
				description: 'Record has been removed.',
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error deleting exam timetable:', error)
			toast({
				title: '❌ Delete Failed',
				description: 'Failed to delete record.',
				variant: 'destructive'
			})
			throw error
		}
	}, [toast])

	// Load exam timetables on mount
	useEffect(() => {
		fetchExamTimetables()
	}, [fetchExamTimetables])

	return {
		examTimetables,
		loading,
		setLoading,
		fetchExamTimetables,
		refreshExamTimetables,
		saveExamTimetable,
		removeExamTimetable,
	}
}
