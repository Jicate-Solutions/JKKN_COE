import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/common/use-toast'
import type { ExamRoom, ExamRoomFormData } from '@/types/exam-rooms'
import {
	fetchExamRooms,
	createExamRoom,
	updateExamRoom,
	deleteExamRoom
} from '@/services/exam-management/exam-rooms-service'

export function useExamRooms() {
	const { toast } = useToast()
	const [examRooms, setExamRooms] = useState<ExamRoom[]>([])
	const [loading, setLoading] = useState(true)

	// Fetch exam rooms
	const fetchExamRoomsData = useCallback(async () => {
		try {
			setLoading(true)
			const data = await fetchExamRooms()
			setExamRooms(data)
		} catch (error) {
			console.error('Error fetching exam rooms:', error)
			toast({
				title: '❌ Fetch Failed',
				description: 'Failed to load exam rooms.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}, [toast])

	// Refresh exam rooms
	const refreshExamRooms = useCallback(async () => {
		try {
			setLoading(true)
			const data = await fetchExamRooms()
			setExamRooms(data)
			toast({
				title: '✅ Refreshed',
				description: `Loaded ${data.length} exam room${data.length !== 1 ? 's' : ''}.`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error refreshing exam rooms:', error)
			toast({
				title: '❌ Refresh Failed',
				description: 'Failed to load exam rooms.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}, [toast])

	// Save exam room (create or update)
	const saveExamRoom = useCallback(async (data: ExamRoomFormData, editing: ExamRoom | null) => {
		try {
			let savedExamRoom: ExamRoom

			if (editing) {
				savedExamRoom = await updateExamRoom(data)
				setExamRooms(prev => prev.map(item => item.id === editing.id ? savedExamRoom : item))
				toast({
					title: '✅ Exam Room Updated',
					description: 'Exam room has been updated successfully.',
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			} else {
				savedExamRoom = await createExamRoom(data)
				setExamRooms(prev => [savedExamRoom, ...prev])
				toast({
					title: '✅ Exam Room Created',
					description: 'Exam room has been created successfully.',
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			}

			return savedExamRoom
		} catch (error) {
			console.error('Save exam room error:', error)
			toast({
				title: '❌ Operation Failed',
				description: error instanceof Error ? error.message : 'Failed to save exam room.',
				variant: 'destructive'
			})
			throw error
		}
	}, [toast])

	// Remove exam room
	const removeExamRoom = useCallback(async (id: string) => {
		try {
			await deleteExamRoom(id)
			setExamRooms(prev => prev.filter(item => item.id !== id))
			toast({
				title: '✅ Exam Room Deleted',
				description: 'Exam room has been removed.',
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error deleting exam room:', error)
			toast({
				title: '❌ Delete Failed',
				description: 'Failed to delete exam room.',
				variant: 'destructive'
			})
			throw error
		}
	}, [toast])

	// Load exam rooms on mount
	useEffect(() => {
		fetchExamRoomsData()
	}, [fetchExamRoomsData])

	return {
		examRooms,
		loading,
		setLoading,
		fetchExamRoomsData,
		refreshExamRooms,
		saveExamRoom,
		removeExamRoom,
	}
}
