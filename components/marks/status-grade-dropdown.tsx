'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { VALID_STATUS_GRADES, type StatusGradeValue } from '@/types/status-grades'

interface StatusGradeDropdownProps {
	value: StatusGradeValue | '' | null
	onChange: (value: StatusGradeValue) => void
	disabled?: boolean
	placeholder?: string
	size?: 'sm' | 'default'
	showBadge?: boolean
}

const gradeConfig: Record<StatusGradeValue, { label: string; color: string; badgeClass: string }> = {
	'Commended': {
		label: 'Commended',
		color: 'text-green-700 dark:text-green-300',
		badgeClass: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
	},
	'Highly Commended': {
		label: 'Highly Commended',
		color: 'text-blue-700 dark:text-blue-300',
		badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
	},
	'AAA': {
		label: 'AAA (Absent)',
		color: 'text-red-700 dark:text-red-300',
		badgeClass: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
	}
}

/**
 * StatusGradeDropdown - Reusable dropdown component for selecting status grades.
 *
 * Supports three valid grades: Commended, Highly Commended, AAA (Absent)
 *
 * @example
 * ```tsx
 * <StatusGradeDropdown
 *   value={grade}
 *   onChange={setGrade}
 *   disabled={false}
 * />
 * ```
 */
export function StatusGradeDropdown({
	value,
	onChange,
	disabled = false,
	placeholder = 'Select grade...',
	size = 'default',
	showBadge = false
}: StatusGradeDropdownProps) {
	if (showBadge && value && value in gradeConfig) {
		const config = gradeConfig[value as StatusGradeValue]
		return (
			<Badge
				variant="outline"
				className={cn('font-medium', config.badgeClass)}
			>
				{config.label}
			</Badge>
		)
	}

	return (
		<Select
			value={value || ''}
			onValueChange={(v) => onChange(v as StatusGradeValue)}
			disabled={disabled}
		>
			<SelectTrigger
				className={cn(
					size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm',
					value && value in gradeConfig
						? gradeConfig[value as StatusGradeValue].color
						: ''
				)}
			>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{VALID_STATUS_GRADES.map((grade) => {
					const config = gradeConfig[grade]
					return (
						<SelectItem
							key={grade}
							value={grade}
							className={cn('text-sm', config.color)}
						>
							{config.label}
						</SelectItem>
					)
				})}
			</SelectContent>
		</Select>
	)
}

/**
 * StatusGradeBadge - Read-only badge display for a status grade value.
 */
export function StatusGradeBadge({ grade }: { grade: string | null }) {
	if (!grade || !(grade in gradeConfig)) {
		return (
			<Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
				Not Set
			</Badge>
		)
	}

	const config = gradeConfig[grade as StatusGradeValue]
	return (
		<Badge variant="outline" className={cn('font-medium', config.badgeClass)}>
			{config.label}
		</Badge>
	)
}
