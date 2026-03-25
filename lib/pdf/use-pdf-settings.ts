/**
 * PDF Settings React Hook
 *
 * Client-side hook for managing PDF institution settings.
 * Provides CRUD operations and preview functionality.
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { useToast } from '@/hooks'
import {
	type PdfInstitutionSettings,
	type PdfSettingsFormData,
	type TemplateType,
	DEFAULT_PDF_SETTINGS,
} from '@/types/pdf-settings'

// =============================================================================
// TYPES
// =============================================================================

interface UsePdfSettingsOptions {
	institutionCode?: string
	templateType?: TemplateType
	autoFetch?: boolean
}

interface UsePdfSettingsReturn {
	// Data
	settings: PdfInstitutionSettings | null
	allSettings: PdfInstitutionSettings[]
	loading: boolean
	error: string | null

	// Actions
	fetchSettings: (code?: string, type?: TemplateType) => Promise<void>
	fetchAllSettings: () => Promise<void>
	createSettings: (data: PdfSettingsFormData) => Promise<PdfInstitutionSettings | null>
	updateSettings: (id: string, data: Partial<PdfSettingsFormData>) => Promise<PdfInstitutionSettings | null>
	deleteSettings: (id: string) => Promise<boolean>
	toggleActive: (id: string) => Promise<PdfInstitutionSettings | null>
	duplicateSettings: (id: string, newTemplateType: TemplateType) => Promise<PdfInstitutionSettings | null>

	// Preview
	previewUrl: string | null
	previewLoading: boolean
	generatePreview: (settings: Partial<PdfSettingsFormData>, sampleData?: Record<string, string>) => Promise<void>
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

export function usePdfSettings(options: UsePdfSettingsOptions = {}): UsePdfSettingsReturn {
	const { institutionCode, templateType = 'default', autoFetch = true } = options
	const { toast } = useToast()

	// State
	const [settings, setSettings] = useState<PdfInstitutionSettings | null>(null)
	const [allSettings, setAllSettings] = useState<PdfInstitutionSettings[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)
	const [previewLoading, setPreviewLoading] = useState(false)

	// ==========================================================================
	// FETCH OPERATIONS
	// ==========================================================================

	const fetchSettings = useCallback(
		async (code?: string, type?: TemplateType) => {
			const instCode = code || institutionCode
			const tmplType = type || templateType

			if (!instCode) {
				setError('Institution code is required')
				return
			}

			setLoading(true)
			setError(null)

			try {
				const response = await fetch(
					`/api/pdf-settings?institution_code=${encodeURIComponent(instCode)}&template_type=${tmplType}`
				)

				if (!response.ok) {
					throw new Error('Failed to fetch PDF settings')
				}

				const data = await response.json()

				if (data.defaults) {
					// No settings found, using defaults
					setSettings(null)
				} else {
					setSettings(data)
				}
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Failed to fetch PDF settings'
				setError(errorMsg)
				console.error('Fetch settings error:', err)
			} finally {
				setLoading(false)
			}
		},
		[institutionCode, templateType]
	)

	const fetchAllSettings = useCallback(async () => {
		setLoading(true)
		setError(null)

		try {
			const response = await fetch('/api/pdf-settings')

			if (!response.ok) {
				throw new Error('Failed to fetch all PDF settings')
			}

			const data = await response.json()
			setAllSettings(data)
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Failed to fetch PDF settings'
			setError(errorMsg)
			console.error('Fetch all settings error:', err)
		} finally {
			setLoading(false)
		}
	}, [])

	// ==========================================================================
	// CRUD OPERATIONS
	// ==========================================================================

	const createSettings = useCallback(
		async (data: PdfSettingsFormData): Promise<PdfInstitutionSettings | null> => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch('/api/pdf-settings', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(data),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to create PDF settings')
				}

				const newSettings = await response.json()
				setSettings(newSettings)
				setAllSettings((prev) => [...prev, newSettings])

				toast({
					title: '✅ Settings Created',
					description: `PDF settings for ${data.institution_code} created successfully.`,
					className:
						'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
				})

				return newSettings
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Failed to create PDF settings'
				setError(errorMsg)
				toast({
					title: '❌ Create Failed',
					description: errorMsg,
					variant: 'destructive',
				})
				return null
			} finally {
				setLoading(false)
			}
		},
		[toast]
	)

	const updateSettings = useCallback(
		async (id: string, data: Partial<PdfSettingsFormData>): Promise<PdfInstitutionSettings | null> => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/pdf-settings/${id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(data),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to update PDF settings')
				}

				const updatedSettings = await response.json()
				setSettings(updatedSettings)
				setAllSettings((prev) => prev.map((s) => (s.id === id ? updatedSettings : s)))

				toast({
					title: '✅ Settings Updated',
					description: 'PDF settings updated successfully.',
					className:
						'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
				})

				return updatedSettings
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Failed to update PDF settings'
				setError(errorMsg)
				toast({
					title: '❌ Update Failed',
					description: errorMsg,
					variant: 'destructive',
				})
				return null
			} finally {
				setLoading(false)
			}
		},
		[toast]
	)

	const deleteSettings = useCallback(
		async (id: string): Promise<boolean> => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/pdf-settings/${id}`, {
					method: 'DELETE',
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to delete PDF settings')
				}

				setAllSettings((prev) => prev.filter((s) => s.id !== id))
				if (settings?.id === id) {
					setSettings(null)
				}

				toast({
					title: '✅ Settings Deleted',
					description: 'PDF settings deleted successfully.',
					className:
						'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
				})

				return true
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Failed to delete PDF settings'
				setError(errorMsg)
				toast({
					title: '❌ Delete Failed',
					description: errorMsg,
					variant: 'destructive',
				})
				return false
			} finally {
				setLoading(false)
			}
		},
		[settings, toast]
	)

	const toggleActive = useCallback(
		async (id: string): Promise<PdfInstitutionSettings | null> => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/pdf-settings/${id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'toggle_active' }),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to toggle active status')
				}

				const updatedSettings = await response.json()
				setAllSettings((prev) => prev.map((s) => (s.id === id ? updatedSettings : s)))
				if (settings?.id === id) {
					setSettings(updatedSettings)
				}

				toast({
					title: updatedSettings.active ? '✅ Activated' : '⏸️ Deactivated',
					description: `PDF settings ${updatedSettings.active ? 'activated' : 'deactivated'} successfully.`,
					className:
						'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
				})

				return updatedSettings
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Failed to toggle active status'
				setError(errorMsg)
				toast({
					title: '❌ Toggle Failed',
					description: errorMsg,
					variant: 'destructive',
				})
				return null
			} finally {
				setLoading(false)
			}
		},
		[settings, toast]
	)

	const duplicateSettings = useCallback(
		async (id: string, newTemplateType: TemplateType): Promise<PdfInstitutionSettings | null> => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/pdf-settings/${id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'duplicate', template_type: newTemplateType }),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to duplicate PDF settings')
				}

				const newSettings = await response.json()
				setAllSettings((prev) => [...prev, newSettings])

				toast({
					title: '✅ Settings Duplicated',
					description: `PDF settings duplicated as ${newTemplateType} template.`,
					className:
						'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
				})

				return newSettings
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Failed to duplicate PDF settings'
				setError(errorMsg)
				toast({
					title: '❌ Duplicate Failed',
					description: errorMsg,
					variant: 'destructive',
				})
				return null
			} finally {
				setLoading(false)
			}
		},
		[toast]
	)

	// ==========================================================================
	// PREVIEW
	// ==========================================================================

	const generatePreview = useCallback(
		async (settingsData: Partial<PdfSettingsFormData>, sampleData?: Record<string, string>) => {
			setPreviewLoading(true)
			setPreviewUrl(null)

			try {
				const response = await fetch('/api/pdf-settings/preview', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						settings: settingsData,
						sample_data: sampleData,
						template_type: settingsData.template_type || templateType,
					}),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to generate preview')
				}

				const result = await response.json()
				setPreviewUrl(result.preview_url)
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Failed to generate preview'
				toast({
					title: '❌ Preview Failed',
					description: errorMsg,
					variant: 'destructive',
				})
			} finally {
				setPreviewLoading(false)
			}
		},
		[templateType, toast]
	)

	// ==========================================================================
	// AUTO-FETCH ON MOUNT
	// ==========================================================================

	useEffect(() => {
		if (autoFetch && institutionCode) {
			fetchSettings()
		}
	}, [autoFetch, institutionCode, fetchSettings])

	return {
		settings,
		allSettings,
		loading,
		error,
		fetchSettings,
		fetchAllSettings,
		createSettings,
		updateSettings,
		deleteSettings,
		toggleActive,
		duplicateSettings,
		previewUrl,
		previewLoading,
		generatePreview,
	}
}

// =============================================================================
// HELPER HOOK: Use PDF settings form
// =============================================================================

export function usePdfSettingsForm(initialSettings?: PdfInstitutionSettings | null) {
	const [formData, setFormData] = useState<PdfSettingsFormData>(() => {
		if (initialSettings) {
			const { id, created_at, updated_at, created_by, updated_by, institution, ...rest } = initialSettings as any
			return rest
		}
		return { ...DEFAULT_PDF_SETTINGS }
	})

	const [errors, setErrors] = useState<Record<string, string>>({})

	const updateField = useCallback((field: keyof PdfSettingsFormData, value: any) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
		// Clear error when field is updated
		setErrors((prev) => {
			const newErrors = { ...prev }
			delete newErrors[field]
			return newErrors
		})
	}, [])

	const resetForm = useCallback(
		(newSettings?: PdfInstitutionSettings | null) => {
			if (newSettings) {
				const { id, created_at, updated_at, created_by, updated_by, institution, ...rest } = newSettings as any
				setFormData(rest)
			} else if (initialSettings) {
				const { id, created_at, updated_at, created_by, updated_by, institution, ...rest } = initialSettings as any
				setFormData(rest)
			} else {
				setFormData({ ...DEFAULT_PDF_SETTINGS })
			}
			setErrors({})
		},
		[initialSettings]
	)

	const validate = useCallback((): boolean => {
		const newErrors: Record<string, string> = {}

		if (!formData.institution_code?.trim()) {
			newErrors.institution_code = 'Institution code is required'
		}

		if (!formData.template_name?.trim()) {
			newErrors.template_name = 'Template name is required'
		} else if (formData.template_name.length > 100) {
			newErrors.template_name = 'Template name must be at most 100 characters'
		}

		// Validate WEF date format (YYYY-MM-DD)
		if (formData.wef_date && !/^\d{4}-\d{2}-\d{2}$/.test(formData.wef_date)) {
			newErrors.wef_date = 'Invalid date format (use YYYY-MM-DD)'
		}

		// Validate WEF time format (HH:mm)
		if (formData.wef_time && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(formData.wef_time)) {
			newErrors.wef_time = 'Invalid time format (use HH:mm)'
		}

		// Validate hex colors
		const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
		if (formData.primary_color && !hexColorRegex.test(formData.primary_color)) {
			newErrors.primary_color = 'Invalid hex color format'
		}
		if (formData.secondary_color && !hexColorRegex.test(formData.secondary_color)) {
			newErrors.secondary_color = 'Invalid hex color format'
		}
		if (formData.accent_color && !hexColorRegex.test(formData.accent_color)) {
			newErrors.accent_color = 'Invalid hex color format'
		}

		// Validate watermark opacity
		if (formData.watermark_opacity !== undefined) {
			if (formData.watermark_opacity < 0 || formData.watermark_opacity > 1) {
				newErrors.watermark_opacity = 'Opacity must be between 0 and 1'
			}
		}

		setErrors(newErrors)
		return Object.keys(newErrors).length === 0
	}, [formData])

	return {
		formData,
		setFormData,
		updateField,
		resetForm,
		errors,
		setErrors,
		validate,
	}
}
