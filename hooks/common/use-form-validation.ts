import { useState, useCallback } from 'react'

/**
 * Validation Rule Types
 */
export interface ValidationRule {
	type: 'required' | 'pattern' | 'min' | 'max' | 'range' | 'url' | 'email' | 'custom'
	message: string
	value?: any
	pattern?: RegExp
	validator?: (value: any, formData?: any) => boolean
}

export interface FieldValidationRules {
	[fieldName: string]: ValidationRule[]
}

export interface ValidationErrors {
	[fieldName: string]: string
}

/**
 * useFormValidation Hook
 *
 * A reusable form validation hook that supports multiple validation rules per field
 *
 * @example
 * ```tsx
 * const { errors, validate, clearErrors, clearError } = useFormValidation({
 *   course_code: [
 *     { type: 'required', message: 'Course code is required' },
 *     { type: 'pattern', pattern: /^[A-Za-z0-9\-_]+$/, message: 'Invalid format' }
 *   ],
 *   credits: [
 *     { type: 'required', message: 'Credits is required' },
 *     { type: 'range', value: [0, 10], message: 'Credits must be between 0 and 10' }
 *   ]
 * })
 * ```
 */
export function useFormValidation(validationRules: FieldValidationRules) {
	const [errors, setErrors] = useState<ValidationErrors>({})

	/**
	 * Validates a single field based on its rules
	 */
	const validateField = useCallback(
		(fieldName: string, fieldValue: any, formData?: any): string | null => {
			const rules = validationRules[fieldName]
			if (!rules) return null

			for (const rule of rules) {
				switch (rule.type) {
					case 'required': {
						if (
							fieldValue === undefined ||
							fieldValue === null ||
							(typeof fieldValue === 'string' && !fieldValue.trim()) ||
							(typeof fieldValue === 'number' && isNaN(fieldValue))
						) {
							return rule.message
						}
						break
					}

					case 'pattern': {
						if (fieldValue && rule.pattern && !rule.pattern.test(String(fieldValue))) {
							return rule.message
						}
						break
					}

					case 'min': {
						const numValue = Number(fieldValue)
						if (fieldValue && !isNaN(numValue) && numValue < rule.value) {
							return rule.message
						}
						break
					}

					case 'max': {
						const numValue = Number(fieldValue)
						if (fieldValue && !isNaN(numValue) && numValue > rule.value) {
							return rule.message
						}
						break
					}

					case 'range': {
						const numValue = Number(fieldValue)
						const [min, max] = rule.value as [number, number]
						if (fieldValue && !isNaN(numValue) && (numValue < min || numValue > max)) {
							return rule.message
						}
						break
					}

					case 'url': {
						if (fieldValue && fieldValue.trim()) {
							try {
								new URL(fieldValue)
							} catch {
								return rule.message
							}
						}
						break
					}

					case 'email': {
						const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
						if (fieldValue && !emailPattern.test(String(fieldValue))) {
							return rule.message
						}
						break
					}

					case 'custom': {
						if (rule.validator && !rule.validator(fieldValue, formData)) {
							return rule.message
						}
						break
					}
				}
			}

			return null
		},
		[validationRules]
	)

	/**
	 * Validates all fields in the form data
	 * Returns true if validation passes, false otherwise
	 */
	const validate = useCallback(
		(formData: any): boolean => {
			const newErrors: ValidationErrors = {}

			// Validate each field that has rules
			for (const fieldName of Object.keys(validationRules)) {
				const fieldValue = formData[fieldName]
				const error = validateField(fieldName, fieldValue, formData)
				if (error) {
					newErrors[fieldName] = error
				}
			}

			setErrors(newErrors)
			return Object.keys(newErrors).length === 0
		},
		[validationRules, validateField]
	)

	/**
	 * Validates a single field and updates errors state
	 * Useful for real-time validation on blur/change
	 */
	const validateSingleField = useCallback(
		(fieldName: string, fieldValue: any, formData?: any): boolean => {
			const error = validateField(fieldName, fieldValue, formData)
			setErrors((prev) => {
				if (error) {
					return { ...prev, [fieldName]: error }
				} else {
					const { [fieldName]: _, ...rest } = prev
					return rest
				}
			})
			return !error
		},
		[validateField]
	)

	/**
	 * Clears all validation errors
	 */
	const clearErrors = useCallback(() => {
		setErrors({})
	}, [])

	/**
	 * Clears validation error for a specific field
	 */
	const clearError = useCallback((fieldName: string) => {
		setErrors((prev) => {
			const { [fieldName]: _, ...rest } = prev
			return rest
		})
	}, [])

	/**
	 * Sets a custom error for a field (useful for server-side validation errors)
	 */
	const setFieldError = useCallback((fieldName: string, error: string) => {
		setErrors((prev) => ({ ...prev, [fieldName]: error }))
	}, [])

	/**
	 * Sets multiple errors at once
	 */
	const setMultipleErrors = useCallback((newErrors: ValidationErrors) => {
		setErrors((prev) => ({ ...prev, ...newErrors }))
	}, [])

	return {
		errors,
		validate,
		validateSingleField,
		clearErrors,
		clearError,
		setFieldError,
		setMultipleErrors,
	}
}

/**
 * Common validation rule presets for reusability
 */
export const ValidationPresets = {
	required: (message = 'This field is required'): ValidationRule => ({
		type: 'required',
		message,
	}),

	alphanumericWithSpecial: (
		message = 'Only letters, numbers, hyphens, and underscores allowed'
	): ValidationRule => ({
		type: 'pattern',
		pattern: /^[A-Za-z0-9\-_]+$/,
		message,
	}),

	alphanumeric: (message = 'Only letters and numbers allowed'): ValidationRule => ({
		type: 'pattern',
		pattern: /^[A-Za-z0-9]+$/,
		message,
	}),

	numeric: (message = 'Only numbers allowed'): ValidationRule => ({
		type: 'pattern',
		pattern: /^\d+$/,
		message,
	}),

	minValue: (min: number, message?: string): ValidationRule => ({
		type: 'min',
		value: min,
		message: message || `Value must be at least ${min}`,
	}),

	maxValue: (max: number, message?: string): ValidationRule => ({
		type: 'max',
		value: max,
		message: message || `Value cannot exceed ${max}`,
	}),

	range: (min: number, max: number, message?: string): ValidationRule => ({
		type: 'range',
		value: [min, max],
		message: message || `Value must be between ${min} and ${max}`,
	}),

	url: (message = 'Please enter a valid URL (e.g., https://example.com)'): ValidationRule => ({
		type: 'url',
		message,
	}),

	email: (message = 'Please enter a valid email address'): ValidationRule => ({
		type: 'email',
		message,
	}),

	custom: (validator: (value: any, formData?: any) => boolean, message: string): ValidationRule => ({
		type: 'custom',
		validator,
		message,
	}),
}
