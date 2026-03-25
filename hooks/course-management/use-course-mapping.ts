import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/common/use-toast'
import type { CourseMapping } from '@/types/course-mapping'
import {
	loadExistingMappings,
	saveCourseMappings,
	deleteCourseMapping
} from '@/services/course-management/course-mapping-service'

export function useCourseMappings(
	institutionCode?: string,
	programCode?: string,
	regulationCode?: string
) {
	const { toast } = useToast()
	const [courseMappings, setCourseMappings] = useState<CourseMapping[]>([])
	const [loading, setLoading] = useState(false)

	// Fetch course mappings
	const fetchCourseMappings = useCallback(async () => {
		if (!institutionCode || !programCode || !regulationCode) {
			setCourseMappings([])
			return
		}

		try {
			setLoading(true)
			const data = await loadExistingMappings(institutionCode, programCode, regulationCode)
			setCourseMappings(data)
		} catch (error) {
			console.error('Error fetching course mappings:', error)
			toast({
				title: '❌ Fetch Failed',
				description: 'Failed to load course mappings.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}, [institutionCode, programCode, regulationCode, toast])

	// Refresh course mappings
	const refreshCourseMappings = useCallback(async () => {
		if (!institutionCode || !programCode || !regulationCode) {
			return
		}

		try {
			setLoading(true)
			const data = await loadExistingMappings(institutionCode, programCode, regulationCode)
			setCourseMappings(data)
			toast({
				title: '✅ Refreshed',
				description: `Loaded ${data.length} course mapping${data.length !== 1 ? 's' : ''}.`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error refreshing course mappings:', error)
			toast({
				title: '❌ Refresh Failed',
				description: 'Failed to load course mappings.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}, [institutionCode, programCode, regulationCode, toast])

	// Save course mappings (bulk operation)
	const saveAllCourseMappings = useCallback(async (mappings: CourseMapping[]) => {
		try {
			setLoading(true)
			const result = await saveCourseMappings(mappings)

			if (!result.success) {
				throw new Error(result.error || 'Failed to save course mappings')
			}

			setCourseMappings(mappings)
			toast({
				title: '✅ Mappings Saved',
				description: `Successfully saved ${mappings.length} course mapping${mappings.length !== 1 ? 's' : ''}.`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})

			return true
		} catch (error) {
			console.error('Save course mappings error:', error)
			toast({
				title: '❌ Save Failed',
				description: error instanceof Error ? error.message : 'Failed to save course mappings.',
				variant: 'destructive'
			})
			return false
		} finally {
			setLoading(false)
		}
	}, [toast])

	// Remove course mapping
	const removeCourseMapping = useCallback(async (id: string) => {
		try {
			await deleteCourseMapping(id)
			setCourseMappings(prev => prev.filter(item => item.id !== id))
			toast({
				title: '✅ Mapping Deleted',
				description: 'Course mapping has been removed.',
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error deleting course mapping:', error)
			toast({
				title: '❌ Delete Failed',
				description: 'Failed to delete course mapping.',
				variant: 'destructive'
			})
			throw error
		}
	}, [toast])

	// Load course mappings when parameters change
	useEffect(() => {
		fetchCourseMappings()
	}, [fetchCourseMappings])

	return {
		courseMappings,
		loading,
		setLoading,
		fetchCourseMappings,
		refreshCourseMappings,
		saveAllCourseMappings,
		removeCourseMapping,
		setCourseMappings
	}
}
