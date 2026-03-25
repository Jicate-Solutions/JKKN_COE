"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X, Search, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@/components/ui/command"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"

export interface SearchableSelectOption {
	value: string
	label: string
	description?: string
}

interface SearchableSelectProps {
	value: string
	onValueChange: (value: string) => void
	options: SearchableSelectOption[]
	placeholder?: string
	emptyText?: string
	searchPlaceholder?: string
	className?: string
	loading?: boolean
	loadingText?: string
	onSearchChange?: (search: string) => void
	disabled?: boolean
	error?: boolean
	clearable?: boolean
	wrapText?: boolean
}

export function SearchableSelect({
	value,
	onValueChange,
	options,
	placeholder = "Select option...",
	emptyText = "No results found.",
	searchPlaceholder = "Search...",
	className,
	loading = false,
	loadingText = "Loading...",
	onSearchChange,
	disabled = false,
	error = false,
	clearable = true,
	wrapText = true,
}: SearchableSelectProps) {
	const [open, setOpen] = React.useState(false)
	const [searchValue, setSearchValue] = React.useState("")

	// Find the selected option
	const selectedOption = React.useMemo(
		() => options.find((option) => option.value === value),
		[options, value]
	)

	// Filter options with contains search (%value%)
	const filteredOptions = React.useMemo(() => {
		// If external search handler is provided, don't filter locally
		if (onSearchChange) return options

		if (!searchValue.trim()) return options

		const query = searchValue.toLowerCase().trim()
		return options.filter((option) => {
			const labelMatch = option.label.toLowerCase().includes(query)
			const valueMatch = option.value.toLowerCase().includes(query)
			const descriptionMatch = option.description?.toLowerCase().includes(query)
			return labelMatch || valueMatch || descriptionMatch
		})
	}, [options, searchValue, onSearchChange])

	// Handle search change with debouncing for external handler
	React.useEffect(() => {
		if (onSearchChange && searchValue.trim() && open) {
			const timer = setTimeout(() => {
				onSearchChange(searchValue)
			}, 300)
			return () => clearTimeout(timer)
		}
	}, [searchValue, onSearchChange, open])

	// Handle selection - toggle behavior (click same value to unselect)
	const handleSelect = (selectedValue: string) => {
		if (selectedValue === value) {
			onValueChange("")
		} else {
			onValueChange(selectedValue)
		}
		setOpen(false)
		setSearchValue("")
	}

	// Handle clear
	const handleClear = (e: React.MouseEvent) => {
		e.stopPropagation()
		e.preventDefault()
		// Close popover if open
		setOpen(false)
		// Clear the value
		onValueChange("")
	}

	// Reset search when popover closes
	React.useEffect(() => {
		if (!open) {
			setSearchValue("")
		}
	}, [open])

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled || loading}
					className={cn(
						"w-full justify-between h-10 font-normal",
						error && "border-destructive",
						!value && "text-muted-foreground",
						className
					)}
				>
					<span className={cn(
						"flex-1 text-left",
						wrapText ? "whitespace-normal line-clamp-2 break-words" : "truncate"
					)}>
						{loading ? (
							<span className="flex items-center gap-2">
								<Loader2 className="h-4 w-4 animate-spin" />
								{loadingText}
							</span>
						) : selectedOption ? (
							selectedOption.label
						) : (
							placeholder
						)}
					</span>
					<div className="flex items-center gap-1 ml-2 shrink-0">
						{clearable && value && !disabled && !loading && (
							<span
								role="button"
								tabIndex={0}
								className="p-0.5 rounded hover:bg-muted"
								onClick={handleClear}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault()
										onValueChange("")
										setOpen(false)
									}
								}}
							>
								<X className="h-4 w-4 opacity-50 hover:opacity-100 cursor-pointer transition-opacity" />
							</span>
						)}
						<ChevronsUpDown className="h-4 w-4 opacity-50" />
					</div>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[--radix-popover-trigger-width] p-0"
				align="start"
			>
				<Command shouldFilter={false}>
					{/* Custom search input with clear button */}
					<div className="flex items-center border-b px-3">
						<Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
						<input
							className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
							placeholder={searchPlaceholder}
							value={searchValue}
							onChange={(e) => setSearchValue(e.target.value)}
						/>
						{searchValue && (
							<X
								className="h-4 w-4 shrink-0 opacity-50 hover:opacity-100 cursor-pointer transition-opacity"
								onClick={() => setSearchValue("")}
							/>
						)}
					</div>
					<CommandList>
						{loading ? (
							<div className="flex items-center justify-center p-4">
								<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
							</div>
						) : filteredOptions.length === 0 ? (
							<CommandEmpty>{emptyText}</CommandEmpty>
						) : (
							<CommandGroup>
								{filteredOptions.map((option) => (
									<CommandItem
										key={option.value}
										value={option.value}
										onSelect={() => handleSelect(option.value)}
										className="cursor-pointer"
									>
										<Check
											className={cn(
												"mr-2 h-4 w-4 shrink-0",
												value === option.value ? "opacity-100" : "opacity-0"
											)}
										/>
										<div className={cn(
											"flex-1 min-w-0",
											wrapText ? "whitespace-normal" : ""
										)}>
											<span className={cn(
												wrapText ? "break-words" : "truncate block"
											)}>
												{option.label}
											</span>
											{option.description && (
												<span className={cn(
													"text-xs text-muted-foreground block",
													wrapText ? "break-words" : "truncate"
												)}>
													{option.description}
												</span>
											)}
										</div>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

// Helper function to convert simple arrays to options
export function toSearchableOptions(
	items: string[]
): SearchableSelectOption[] {
	return items.map((item) => ({
		value: item,
		label: item,
	}))
}

// Helper function to convert code/name arrays to options
export function toCodeNameOptions(
	items: Array<{ id?: string; code: string; name?: string }>
): SearchableSelectOption[] {
	return items.map((item) => ({
		value: item.code,
		label: item.name ? `${item.code} - ${item.name}` : item.code,
		description: item.name,
	}))
}
