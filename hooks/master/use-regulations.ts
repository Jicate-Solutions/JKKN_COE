import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/common/use-toast'
import type { Regulation, RegulationFormData, InstitutionOption } from '@/types/regulations'
import {
	fetchRegulations as fetchRegulationsService,
	createRegulation,
	updateRegulation,
	deleteRegulation,
	fetchInstitutions as fetchInstitutionsService
} from '@/services/master/regulations-service'

export function useRegulations() {
	const { toast } = useToast()
	const [regulations, setRegulations] = useState<Regulation[]>([])
	const [loading, setLoading] = useState(true)
	const [institutions, setInstitutions] = useState<InstitutionOption[]>([])

	// Fetch regulations
	const fetchRegulations = useCallback(async () => {
		try {
			setLoading(true)
			const data = await fetchRegulationsService()
			setRegulations(data)
		} catch (error) {
			console.error('Error fetching regulations:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to load regulations'

			// Check if regulations table doesn't exist
			if (errorMessage.includes('Regulations table not found')) {
				toast({
					title: '❌ Database Setup Required',
					description: 'The regulations table needs to be created. Please contact your administrator.',
					variant: 'destructive',
					className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
				})
			} else {
				toast({
					title: '❌ Fetch Failed',
					description: errorMessage,
					variant: 'destructive',
					className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
				})
			}
		} finally {
			setLoading(false)
		}
	}, [toast])

	// Fetch institutions for dropdown
	const fetchInstitutions = useCallback(async () => {
		try {
			const data = await fetchInstitutionsService()
			setInstitutions(data)
		} catch (error) {
			console.error('Error fetching institutions:', error)
		}
	}, [])

	// Refresh regulations
	const refreshRegulations = useCallback(async () => {
		try {
			setLoading(true)
			const data = await fetchRegulationsService()
			setRegulations(data)
			toast({
				title: '✅ Refreshed',
				description: `Loaded ${data.length} regulation${data.length !== 1 ? 's' : ''}.`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error refreshing regulations:', error)
			toast({
				title: '❌ Refresh Failed',
				description: 'Failed to load regulations.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
			})
		} finally {
			setLoading(false)
		}
	}, [toast])

	// Save regulation (create or update)
	const saveRegulation = useCallback(async (data: RegulationFormData, editing: Regulation | null) => {
		try {
			let savedRegulation: Regulation

			if (editing) {
				savedRegulation = await updateRegulation(editing.id, data)
				setRegulations(prev => prev.map(item => item.id === editing.id ? savedRegulation : item))
				toast({
					title: '✅ Regulation Updated',
					description: `${savedRegulation.regulation_code} has been successfully updated.`,
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			} else {
				savedRegulation = await createRegulation(data)
				setRegulations(prev => [savedRegulation, ...prev])
				toast({
					title: '✅ Regulation Created',
					description: `${savedRegulation.regulation_code} has been successfully created.`,
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			}

			return savedRegulation
		} catch (error) {
			console.error('Save regulation error:', error)
			toast({
				title: '❌ Save Failed',
				description: error instanceof Error ? error.message : 'Failed to save regulation.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
			})
			throw error
		}
	}, [toast])

	// Remove regulation
	const removeRegulation = useCallback(async (id: number) => {
		const regulationName = regulations.find(r => r.id === id)?.regulation_code || 'Regulation'

		try {
			await deleteRegulation(id)
			setRegulations(prev => prev.filter(item => item.id !== id))
			toast({
				title: '✅ Regulation Deleted',
				description: `${regulationName} has been successfully deleted.`,
				className: 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200'
			})
		} catch (error) {
			console.error('Error deleting regulation:', error)
			toast({
				title: '❌ Delete Failed',
				description: 'Failed to delete regulation. Please try again.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
			})
			throw error
		}
	}, [regulations, toast])

	// Load data on mount
	useEffect(() => {
		fetchRegulations()
		fetchInstitutions()
	}, [fetchRegulations, fetchInstitutions])

	return {
		regulations,
		loading,
		setLoading,
		institutions,
		fetchRegulations,
		refreshRegulations,
		saveRegulation,
		removeRegulation,
	}
}
