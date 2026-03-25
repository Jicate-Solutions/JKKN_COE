'use client'

import { useState, memo, useCallback } from 'react'
import { Building2, Check, ChevronsUpDown, Globe, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from '@/components/ui/command'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { useInstitution, Institution } from '@/context/institution-context'

// Color palette for institutions - more vibrant and easily visible
const institutionColors = [
	{ bg: 'bg-gradient-to-br from-emerald-500 to-teal-600', light: 'bg-emerald-50 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-700', accent: 'emerald' },
	{ bg: 'bg-gradient-to-br from-blue-500 to-indigo-600', light: 'bg-blue-50 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-700', accent: 'blue' },
	{ bg: 'bg-gradient-to-br from-purple-500 to-violet-600', light: 'bg-purple-50 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-700', accent: 'purple' },
	{ bg: 'bg-gradient-to-br from-amber-500 to-orange-600', light: 'bg-amber-50 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-700', accent: 'amber' },
	{ bg: 'bg-gradient-to-br from-rose-500 to-pink-600', light: 'bg-rose-50 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-300 dark:border-rose-700', accent: 'rose' },
	{ bg: 'bg-gradient-to-br from-teal-500 to-cyan-600', light: 'bg-teal-50 dark:bg-teal-900/40', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-300 dark:border-teal-700', accent: 'teal' },
	{ bg: 'bg-gradient-to-br from-indigo-500 to-blue-600', light: 'bg-indigo-50 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-300 dark:border-indigo-700', accent: 'indigo' },
	{ bg: 'bg-gradient-to-br from-cyan-500 to-sky-600', light: 'bg-cyan-50 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-300 dark:border-cyan-700', accent: 'cyan' },
]

function getInstitutionColor(index: number) {
	return institutionColors[index % institutionColors.length]
}

function getInstitutionInitials(name: string, code?: string): string {
	// If name looks like a code (short, no spaces), use the code instead
	if (!name || name.length <= 5) {
		const source = code || name
		if (!source) return '?'
		return source.substring(0, 2).toUpperCase()
	}
	const words = name.split(' ').filter(w => w.length > 0)
	if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
	return (words[0][0] + words[1][0]).toUpperCase()
}

interface InstitutionSelectorProps {
	/** Variant: 'default' for sidebar, 'compact' for header, 'compact-light' for light header */
	variant?: 'default' | 'compact' | 'compact-light'
	/** Custom class name */
	className?: string
}

/**
 * InstitutionSelector Component
 *
 * Displays the current institution context and allows super_admin users
 * to switch between institutions.
 */
export const InstitutionSelector = memo(function InstitutionSelector({
	variant = 'default',
	className
}: InstitutionSelectorProps) {
	const {
		currentInstitution,
		currentInstitutionCode,
		selectedInstitution,
		availableInstitutions,
		canSwitchInstitution,
		isLoading,
		selectInstitution,
		clearInstitutionSelection
	} = useInstitution()

	const [open, setOpen] = useState(false)

	const handleSelect = useCallback((institution: Institution | null) => {
		if (institution) {
			selectInstitution(institution)
		} else {
			clearInstitutionSelection()
		}
		setOpen(false)
	}, [selectInstitution, clearInstitutionSelection])

	// Find color for current selection
	const selectedIndex = selectedInstitution
		? availableInstitutions.findIndex(i => i.institution_code === selectedInstitution.institution_code)
		: -1
	const selectedColor = selectedIndex >= 0 ? getInstitutionColor(selectedIndex) : null

	// If user can't switch institutions, show read-only badge
	if (!canSwitchInstitution) {
		if (variant === 'compact') {
			return (
				<div className={cn("flex items-center gap-2 px-2 py-1 text-xs text-white/90", className)}>
					<Building2 className="h-3.5 w-3.5" />
					<span className="truncate max-w-[120px]">
						{currentInstitution?.short_name || currentInstitution?.institution_code || currentInstitutionCode || 'No Institution'}
					</span>
				</div>
			)
		}
		if (variant === 'compact-light') {
			return (
				<div className={cn("flex items-center gap-2 px-2 py-1 text-xs text-slate-600 dark:text-slate-300", className)}>
					<Building2 className="h-3.5 w-3.5" />
					<span className="truncate max-w-[120px]">
						{currentInstitution?.short_name || currentInstitution?.institution_code || currentInstitutionCode || 'No Institution'}
					</span>
				</div>
			)
		}
		return (
			<div className={cn("flex items-center gap-2 px-3 py-2 text-sm", className)}>
				<Building2 className="h-4 w-4 text-muted-foreground" />
				<span className="text-muted-foreground">
					{currentInstitution?.institution_name || currentInstitutionCode || 'No Institution'}
				</span>
			</div>
		)
	}

	// Super admin: show selector
	const isCompact = variant === 'compact' || variant === 'compact-light'
	const isLightVariant = variant === 'compact-light'

	// Display text: institution_code for compact header, institution_name for default
	const displayText = selectedInstitution
		? (isCompact
			? selectedInstitution.institution_code
			: (selectedInstitution.institution_name || selectedInstitution.institution_code))
		: 'All Institutions'

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					role="combobox"
					aria-expanded={open}
					aria-label="Select institution"
					className={cn(
						"group relative overflow-hidden transition-all duration-300",
						isCompact
							? isLightVariant
								? cn(
									"h-9 px-3 gap-2 rounded-full",
									"bg-gradient-to-r from-white to-slate-50 dark:from-slate-800 dark:to-slate-900",
									"border-2",
									selectedColor ? selectedColor.border : "border-emerald-200 dark:border-emerald-800",
									"hover:shadow-md hover:scale-[1.02]",
									"text-slate-700 dark:text-slate-200"
								)
								: cn(
									"h-9 px-3 gap-2 rounded-full",
									"bg-white/15 hover:bg-white/25 backdrop-blur-sm",
									"border border-white/20 hover:border-white/40",
									"text-white hover:text-white",
									"shadow-sm hover:shadow-md"
								)
							: "w-[280px] justify-between",
						className
					)}
					disabled={isLoading}
				>
					{/* Gradient background effect for light variant */}
					{isLightVariant && selectedColor && (
						<div className={cn(
							"absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity",
							`bg-gradient-to-r ${selectedColor.bg}`
						)} />
					)}

					<div className={cn("flex items-center gap-2 truncate relative z-10", isCompact && "text-xs font-medium")}>
						{selectedInstitution ? (
							<>
								{/* Colored dot indicator */}
								<div className={cn(
									"h-2.5 w-2.5 rounded-full ring-2 ring-white/50 shadow-sm",
									selectedColor?.bg || "bg-emerald-500"
								)} />
								<Globe className={cn(isCompact ? "h-3.5 w-3.5" : "h-4 w-4", "shrink-0 opacity-70")} />
							</>
						) : (
							<>
								{/* Rainbow gradient for "All Institutions" */}
								<div className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500 ring-2 ring-white/50 shadow-sm animate-pulse" />
								<Sparkles className={cn(isCompact ? "h-3.5 w-3.5" : "h-4 w-4", "shrink-0 text-amber-400")} />
							</>
						)}
						<span className={cn("truncate", isCompact && "max-w-[100px]")}>{displayText}</span>
					</div>
					<ChevronsUpDown className={cn(isCompact ? "h-3.5 w-3.5" : "h-4 w-4", "shrink-0 opacity-60 group-hover:opacity-100 transition-opacity")} />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className={cn(
					"w-[360px] p-0 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
				)}
				align={isCompact ? "end" : "start"}
				sideOffset={8}
			>
				<Command className="bg-white dark:bg-slate-900">
					{/* Compact header */}
					<div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Building2 className="h-4 w-4 text-white" />
								<span className="text-sm font-semibold text-white">Select Institution</span>
							</div>
							<span className="text-[10px] font-medium text-white/80 bg-white/20 px-2 py-0.5 rounded-full">
								{availableInstitutions.length}
							</span>
						</div>
					</div>

					{/* Search */}
					<div className="p-2 border-b border-slate-100 dark:border-slate-800">
						<CommandInput
							placeholder="Search..."
							className="h-9 text-sm"
						/>
					</div>

					<CommandList className="max-h-[280px]">
						<CommandEmpty className="py-6 text-center">
							<Building2 className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
							<p className="text-sm text-slate-500">No institution found</p>
						</CommandEmpty>

						{/* All Institutions option */}
						<CommandGroup className="p-2">
							<CommandItem
								onSelect={() => handleSelect(null)}
								className={cn(
									"cursor-pointer rounded-lg px-3 py-2.5 transition-colors",
									!selectedInstitution
										? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
										: "hover:bg-slate-50 dark:hover:bg-slate-800"
								)}
							>
								<div className="flex items-center gap-3 w-full">
									<div className={cn(
										"h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
										!selectedInstitution
											? "bg-gradient-to-br from-emerald-500 to-teal-500"
											: "bg-slate-200 dark:bg-slate-700"
									)}>
										<Globe className="h-4 w-4 text-white" />
									</div>
									<div className="flex-1 min-w-0">
										<span className="font-semibold text-sm">All Institutions</span>
										<p className="text-[11px] text-slate-500 dark:text-slate-400">View all data</p>
									</div>
									{!selectedInstitution && (
										<Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" strokeWidth={2.5} />
									)}
								</div>
							</CommandItem>
						</CommandGroup>

						<CommandSeparator />

						{/* Institution list */}
						<CommandGroup className="p-2">
							<div className="space-y-1">
								{availableInstitutions.map((institution, index) => {
									const color = getInstitutionColor(index)
									const isSelected = selectedInstitution?.institution_code === institution.institution_code

									return (
										<CommandItem
											key={institution.id || institution.institution_code}
											value={`${institution.institution_code} ${institution.institution_name || ''}`}
											onSelect={() => handleSelect(institution)}
											className={cn(
												"cursor-pointer rounded-lg px-3 py-2.5 transition-colors",
												isSelected
													? cn(color.light, color.text)
													: "hover:bg-slate-50 dark:hover:bg-slate-800"
											)}
										>
											<div className="flex items-center gap-3 w-full">
												{/* Code badge */}
												<div className={cn(
													"h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-[10px] shrink-0",
													color.bg
												)}>
													{institution.institution_code}
												</div>
												<div className="flex-1 min-w-0">
													<span className={cn(
														"font-medium text-sm block truncate",
														isSelected ? color.text : "text-slate-700 dark:text-slate-200"
													)}>
														{institution.institution_name || institution.institution_code}
													</span>
													{institution.institution_name && institution.institution_name !== institution.institution_code && (
														<span className="text-[10px] text-slate-400 dark:text-slate-500">
															{institution.institution_code}
														</span>
													)}
												</div>
												{isSelected && (
													<Check className={cn("h-4 w-4 shrink-0", color.text)} strokeWidth={2.5} />
												)}
											</div>
										</CommandItem>
									)
								})}
							</div>
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
})

/**
 * InstitutionBadge Component
 *
 * Compact badge showing current institution context.
 */
export function InstitutionBadge() {
	const { currentInstitution, currentInstitutionCode, canSwitchInstitution, selectedInstitution, availableInstitutions } = useInstitution()

	// Find color for current selection
	const selectedIndex = selectedInstitution
		? availableInstitutions.findIndex(i => i.institution_code === selectedInstitution.institution_code)
		: -1
	const selectedColor = selectedIndex >= 0 ? getInstitutionColor(selectedIndex) : null

	// Super admin with no selection: show "All"
	if (canSwitchInstitution && !selectedInstitution) {
		return (
			<Badge className="gap-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white border-0 shadow-sm">
				<Globe className="h-3 w-3" />
				All Institutions
			</Badge>
		)
	}

	// Show current institution with color
	if (currentInstitution || currentInstitutionCode) {
		return (
			<Badge
				variant="outline"
				className={cn(
					"gap-1.5",
					selectedColor ? cn(selectedColor.light, selectedColor.text, selectedColor.border) : ""
				)}
			>
				<Building2 className="h-3 w-3" />
				{currentInstitution?.short_name || currentInstitution?.institution_code || currentInstitutionCode}
			</Badge>
		)
	}

	return null
}

/**
 * InstitutionIndicator Component
 *
 * Small indicator showing if institution filtering is active.
 */
export function InstitutionIndicator() {
	const { canSwitchInstitution, selectedInstitution, currentInstitutionCode, availableInstitutions } = useInstitution()

	// Find color for current selection
	const selectedIndex = selectedInstitution
		? availableInstitutions.findIndex(i => i.institution_code === selectedInstitution.institution_code)
		: -1

	// Super admin with no selection: gradient (seeing all)
	if (canSwitchInstitution && !selectedInstitution) {
		return (
			<div
				className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500 animate-pulse"
				title="Viewing all institutions"
			/>
		)
	}

	// Filtered by institution: use institution color
	if (currentInstitutionCode) {
		const color = selectedIndex >= 0 ? getInstitutionColor(selectedIndex) : { bg: 'bg-orange-500' }
		return (
			<div
				className={cn("h-2.5 w-2.5 rounded-full", color.bg)}
				title={`Filtered by ${currentInstitutionCode}`}
			/>
		)
	}

	return null
}
