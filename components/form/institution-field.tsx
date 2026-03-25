'use client'

import { memo, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstitutionField, useInstitutionFormField } from '@/hooks/use-institution-field'
import { Badge } from '@/components/ui/badge'

interface InstitutionFieldProps {
	/** Current value of institution_code */
	value: string
	/** Callback when value changes */
	onChange: (value: string) => void
	/** Error message to display */
	error?: string
	/** Whether the field is disabled */
	disabled?: boolean
	/** Whether to show as required */
	required?: boolean
	/** Label text */
	label?: string
	/** Placeholder text */
	placeholder?: string
	/** Additional class name */
	className?: string
	/** Use searchable select for large lists */
	searchable?: boolean
	/** Show lock icon when auto-filled */
	showLockIcon?: boolean
}

/**
 * InstitutionField Component
 *
 * A smart institution dropdown that automatically handles:
 * - Auto-filling based on user role and context
 * - Visibility based on super_admin selection state
 * - Loading states
 * - Error display
 *
 * Behavior:
 * - super_admin with "All Institutions": Shows dropdown, must select
 * - super_admin with specific institution: Auto-fills, shows locked badge
 * - Regular users: Auto-fills with their institution, shows locked badge
 *
 * @example
 * ```tsx
 * <InstitutionField
 *   value={formData.institution_code}
 *   onChange={(v) => setFormData({ ...formData, institution_code: v })}
 *   error={errors.institution_code}
 *   required
 * />
 * ```
 */
export const InstitutionField = memo(function InstitutionField({
	value,
	onChange,
	error,
	disabled = false,
	required = true,
	label = 'Institution',
	placeholder = 'Select institution...',
	className,
	searchable = true,
	showLockIcon = true
}: InstitutionFieldProps) {
	const {
		shouldShowField,
		shouldAutoFill,
		defaultInstitutionCode,
		defaultInstitution,
		availableInstitutions,
		isLoading
	} = useInstitutionField()

	// Auto-fill when component mounts or default changes
	useEffect(() => {
		if (shouldAutoFill && defaultInstitutionCode && !value) {
			onChange(defaultInstitutionCode)
		}
	}, [shouldAutoFill, defaultInstitutionCode, value, onChange])

	// Loading state
	if (isLoading) {
		return (
			<div className={cn("space-y-2", className)}>
				<Label>{label} {required && <span className="text-red-500">*</span>}</Label>
				<Skeleton className="h-10 w-full" />
			</div>
		)
	}

	// Auto-filled (locked) state - show badge instead of dropdown
	if (!shouldShowField && shouldAutoFill) {
		const institutionName = defaultInstitution?.institution_name ||
			defaultInstitution?.short_name ||
			defaultInstitutionCode ||
			'Institution'

		return (
			<div className={cn("space-y-2", className)}>
				<Label className="flex items-center gap-2">
					{label} {required && <span className="text-red-500">*</span>}
					{showLockIcon && (
						<Badge variant="secondary" className="text-xs font-normal gap-1">
							<Lock className="h-3 w-3" />
							Auto-filled
						</Badge>
					)}
				</Label>
				<div className="flex items-center gap-2 h-10 px-3 py-2 rounded-md border bg-muted/50 text-sm">
					<Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
					<span className="truncate">{institutionName}</span>
				</div>
				{/* Hidden input for form submission */}
				<input type="hidden" name="institution_code" value={value || defaultInstitutionCode || ''} />
			</div>
		)
	}

	// Dropdown state - show selectable field
	const options = availableInstitutions.map(inst => ({
		value: inst.institution_code,
		label: inst.institution_name || inst.institution_code,
		description: inst.short_name
	}))

	if (searchable && options.length > 5) {
		// Convert to SearchableSelectOption format directly
		const searchableOptions = options.map(o => ({
			value: o.value,
			label: `${o.label}${o.description ? ` (${o.description})` : ''}`
		}))

		return (
			<div className={cn("space-y-2", className)}>
				<Label htmlFor="institution_code">
					{label} {required && <span className="text-red-500">*</span>}
				</Label>
				<SearchableSelect
					options={searchableOptions}
					value={value}
					onValueChange={onChange}
					placeholder={placeholder}
					disabled={disabled}
					className={error ? 'border-red-500' : ''}
				/>
				{error && <p className="text-sm text-red-500">{error}</p>}
			</div>
		)
	}

	return (
		<div className={cn("space-y-2", className)}>
			<Label htmlFor="institution_code">
				{label} {required && <span className="text-red-500">*</span>}
			</Label>
			<Select
				value={value}
				onValueChange={onChange}
				disabled={disabled}
			>
				<SelectTrigger className={error ? 'border-red-500' : ''}>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					{options.map(opt => (
						<SelectItem key={opt.value} value={opt.value}>
							<div className="flex flex-col">
								<span>{opt.label}</span>
								{opt.description && (
									<span className="text-xs text-muted-foreground">{opt.description}</span>
								)}
							</div>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{error && <p className="text-sm text-red-500">{error}</p>}
		</div>
	)
})

/**
 * Compact version of InstitutionField for inline use
 */
export const InstitutionFieldCompact = memo(function InstitutionFieldCompact({
	value,
	onChange,
	error,
	disabled = false,
	placeholder = 'Institution...',
	className
}: Omit<InstitutionFieldProps, 'label' | 'required' | 'showLockIcon'>) {
	const {
		shouldShowField,
		shouldAutoFill,
		defaultInstitutionCode,
		defaultInstitution,
		availableInstitutions,
		isLoading
	} = useInstitutionField()

	useEffect(() => {
		if (shouldAutoFill && defaultInstitutionCode && !value) {
			onChange(defaultInstitutionCode)
		}
	}, [shouldAutoFill, defaultInstitutionCode, value, onChange])

	if (isLoading) {
		return <Skeleton className={cn("h-9 w-[180px]", className)} />
	}

	if (!shouldShowField && shouldAutoFill) {
		return (
			<div className={cn("flex items-center gap-1.5 text-sm text-muted-foreground", className)}>
				<Building2 className="h-3.5 w-3.5" />
				<span className="truncate max-w-[150px]">
					{defaultInstitution?.short_name || defaultInstitutionCode}
				</span>
			</div>
		)
	}

	return (
		<Select value={value} onValueChange={onChange} disabled={disabled}>
			<SelectTrigger className={cn("w-[180px] h-9", error ? 'border-red-500' : '', className)}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{availableInstitutions.map(inst => (
					<SelectItem key={inst.institution_code} value={inst.institution_code}>
						{inst.short_name || inst.institution_code}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
})

export default InstitutionField
