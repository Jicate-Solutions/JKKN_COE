'use client'

import { useMemo, useEffect } from 'react'
import { useInstitution } from '@/context/institution-context'

/**
 * Institution dropdown configuration for forms
 *
 * This hook provides all the logic needed for institution dropdowns in forms:
 * - Auto-selects institution based on user role and context
 * - Determines if field should be visible or hidden
 * - Provides default value for forms
 *
 * Behavior:
 * - super_admin with "All Institutions" selected: Show dropdown, user must select
 * - super_admin with specific institution selected: Auto-fill and hide dropdown
 * - Regular users (coe, deputy_coe, etc.): Auto-fill with their institution and hide
 *
 * @example
 * ```tsx
 * const {
 *   shouldShowField,
 *   defaultInstitutionCode,
 *   defaultInstitutionId,
 *   availableInstitutions,
 *   isLoading
 * } = useInstitutionField()
 *
 * // In form initialization
 * useEffect(() => {
 *   if (defaultInstitutionCode) {
 *     setFormData(prev => ({ ...prev, institution_code: defaultInstitutionCode }))
 *   }
 * }, [defaultInstitutionCode])
 *
 * // In form JSX
 * {shouldShowField && (
 *   <InstitutionDropdown ... />
 * )}
 * ```
 */
export function useInstitutionField() {
	const {
		currentInstitution,
		currentInstitutionCode,
		currentInstitutionId,
		selectedInstitution,
		availableInstitutions,
		canSwitchInstitution,
		isLoading,
		isInitialized,
		shouldFilter
	} = useInstitution()

	/**
	 * Determine if the institution dropdown should be visible
	 *
	 * Hidden when:
	 * - super_admin has selected a specific institution
	 * - Regular user (always has assigned institution)
	 *
	 * Visible when:
	 * - super_admin with "All Institutions" view (no specific selection)
	 */
	const shouldShowField = useMemo(() => {
		// If user can switch institutions (super_admin)
		if (canSwitchInstitution) {
			// Show field only when viewing "All Institutions" (no selection)
			return !selectedInstitution
		}
		// Regular users: always hide (auto-filled)
		return false
	}, [canSwitchInstitution, selectedInstitution])

	/**
	 * Default institution code to use in forms
	 * - For super_admin with selection: use selected institution
	 * - For regular users: use their assigned institution
	 * - For super_admin without selection: null (must choose)
	 */
	const defaultInstitutionCode = useMemo(() => {
		if (canSwitchInstitution) {
			// Super admin: use selected institution or null
			return selectedInstitution?.institution_code || null
		}
		// Regular user: use their assigned institution
		return currentInstitutionCode
	}, [canSwitchInstitution, selectedInstitution, currentInstitutionCode])

	/**
	 * Default institution ID to use in forms
	 */
	const defaultInstitutionId = useMemo(() => {
		if (canSwitchInstitution) {
			return selectedInstitution?.id || null
		}
		return currentInstitutionId
	}, [canSwitchInstitution, selectedInstitution, currentInstitutionId])

	/**
	 * Default institution object
	 */
	const defaultInstitution = useMemo(() => {
		if (canSwitchInstitution) {
			return selectedInstitution
		}
		return currentInstitution
	}, [canSwitchInstitution, selectedInstitution, currentInstitution])

	/**
	 * Check if form should auto-fill institution
	 */
	const shouldAutoFill = useMemo(() => {
		return !shouldShowField && !!defaultInstitutionCode
	}, [shouldShowField, defaultInstitutionCode])

	/**
	 * Check if institution is required but not yet determined
	 * (super_admin viewing all institutions but hasn't selected in form)
	 */
	const requiresSelection = useMemo(() => {
		return shouldShowField && !defaultInstitutionCode
	}, [shouldShowField, defaultInstitutionCode])

	return {
		// Field visibility
		shouldShowField,
		shouldAutoFill,
		requiresSelection,

		// Default values for forms
		defaultInstitutionCode,
		defaultInstitutionId,
		defaultInstitution,

		// Available options for dropdown
		availableInstitutions,

		// Loading state
		isLoading: isLoading || !isInitialized,

		// User role info
		canSwitchInstitution,
		isSuperAdmin: canSwitchInstitution,

		// Current filter state
		shouldFilter
	}
}

/**
 * Hook for managing institution field in form state
 *
 * Automatically updates form data when institution context changes
 *
 * @param setFormData - Function to update form state
 * @param fieldName - Name of the institution_code field (default: 'institution_code')
 *
 * @example
 * ```tsx
 * const [formData, setFormData] = useState({ institution_code: '', ... })
 * const institutionField = useInstitutionFormField(setFormData)
 *
 * // Returns same values as useInstitutionField plus auto-syncs form
 * ```
 */
export function useInstitutionFormField<T extends Record<string, unknown>>(
	setFormData: React.Dispatch<React.SetStateAction<T>>,
	fieldName: keyof T = 'institution_code' as keyof T
) {
	const institutionField = useInstitutionField()

	// Auto-update form when default institution changes
	useEffect(() => {
		if (institutionField.shouldAutoFill && institutionField.defaultInstitutionCode) {
			setFormData(prev => ({
				...prev,
				[fieldName]: institutionField.defaultInstitutionCode
			}))
		}
	}, [
		institutionField.shouldAutoFill,
		institutionField.defaultInstitutionCode,
		setFormData,
		fieldName
	])

	return institutionField
}

export type InstitutionFieldState = ReturnType<typeof useInstitutionField>
