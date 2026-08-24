'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from '@/components/ui/command'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { PROGRAM_LEVELS, type ProgramLevel } from '@/lib/exam-fee-catalog'

// =====================================================
// Programme multi-select
// -----------------------------------------------------
// Picks the programmes a fee rate is scoped to. Selecting none means the rate
// is the TIER rate — it applies to every programme at its UG / PG / MCA level,
// which is how every rate configured before this field existed behaves.
//
// "All UG" / "All PG" / "All MCA" tick every programme at that tier in one go;
// the tier of each programme comes from the caller (the explicit fee-tier map
// where there is one, the UG/PG heuristic otherwise), so the shortcut agrees
// with what the fee engine will actually charge.
// =====================================================

export interface ProgramOption {
	program_code: string
	program_name: string
	level: ProgramLevel
}

interface ProgramMultiSelectProps {
	programs: ProgramOption[]
	/** Selected programme codes (UPPER). Empty = the tier rate. */
	value: string[]
	onChange: (codes: string[]) => void
	disabled?: boolean
	loading?: boolean
	invalid?: boolean
	/** Shown when nothing is selected */
	placeholder?: string
	className?: string
}

export function ProgramMultiSelect({
	programs,
	value,
	onChange,
	disabled,
	loading,
	invalid,
	placeholder = 'All programmes (tier rate)',
	className,
}: ProgramMultiSelectProps) {
	const [open, setOpen] = useState(false)

	const selected = useMemo(() => new Set(value.map((c) => c.toUpperCase())), [value])

	const nameByCode = useMemo(() => {
		const map = new Map<string, string>()
		for (const p of programs) map.set(p.program_code.toUpperCase(), p.program_name)
		return map
	}, [programs])

	// Only offer a tier shortcut for tiers that actually have programmes
	const codesByLevel = useMemo(() => {
		const map = new Map<ProgramLevel, string[]>()
		for (const p of programs) {
			const list = map.get(p.level) || []
			list.push(p.program_code.toUpperCase())
			map.set(p.level, list)
		}
		return map
	}, [programs])

	const toggle = (code: string) => {
		const upper = code.toUpperCase()
		if (selected.has(upper)) onChange(value.filter((c) => c.toUpperCase() !== upper))
		else onChange([...value, upper])
	}

	// A tier shortcut is a toggle: tick the whole tier, or clear it if it is
	// already fully selected.
	const toggleLevel = (level: ProgramLevel) => {
		const codes = codesByLevel.get(level) || []
		if (codes.length === 0) return
		const allOn = codes.every((c) => selected.has(c))
		if (allOn) {
			const drop = new Set(codes)
			onChange(value.filter((c) => !drop.has(c.toUpperCase())))
		} else {
			const next = new Set(value.map((c) => c.toUpperCase()))
			codes.forEach((c) => next.add(c))
			onChange([...next])
		}
	}

	const levelIsFull = (level: ProgramLevel) => {
		const codes = codesByLevel.get(level) || []
		return codes.length > 0 && codes.every((c) => selected.has(c))
	}

	return (
		<div className={cn('space-y-1.5', className)}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						role="combobox"
						aria-expanded={open}
						disabled={disabled || loading}
						className={cn(
							'w-full justify-between bg-white font-normal',
							value.length === 0 && 'text-muted-foreground',
							invalid && 'border-red-500'
						)}
					>
						<span className="truncate">
							{loading
								? 'Loading programmes...'
								: value.length === 0
									? placeholder
									: `${value.length} programme${value.length > 1 ? 's' : ''} selected`}
						</span>
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[320px] p-0" align="start">
					{/* Tier shortcuts */}
					<div className="flex flex-wrap items-center gap-1.5 p-2">
						{PROGRAM_LEVELS.filter((l) => (codesByLevel.get(l) || []).length > 0).map((level) => (
							<Button
								key={level}
								type="button"
								size="sm"
								variant={levelIsFull(level) ? 'default' : 'outline'}
								className="h-7 px-2 text-xs"
								onClick={() => toggleLevel(level)}
							>
								All {level}
								<span className="ml-1 opacity-60">({(codesByLevel.get(level) || []).length})</span>
							</Button>
						))}
						{value.length > 0 && (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="h-7 px-2 text-xs text-muted-foreground"
								onClick={() => onChange([])}
							>
								Clear
							</Button>
						)}
					</div>
					<Separator />

					<Command>
						<CommandInput placeholder="Search programme or code..." className="h-9" />
						<CommandList className="max-h-[260px]">
							<CommandEmpty>No programme found.</CommandEmpty>
							{programs.map((p) => {
								const code = p.program_code.toUpperCase()
								const isSelected = selected.has(code)
								return (
									<CommandItem
										key={code}
										value={`${p.program_code} ${p.program_name}`}
										onSelect={() => toggle(code)}
										className="gap-2"
									>
										<Checkbox checked={isSelected} className="pointer-events-none" />
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm">{p.program_name}</p>
											<p className="text-xs text-muted-foreground">{p.program_code}</p>
										</div>
										<Badge variant="secondary" className="shrink-0 text-[10px]">
											{p.level}
										</Badge>
										{isSelected && <Check className="h-3.5 w-3.5 text-blue-600" />}
									</CommandItem>
								)
							})}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>

			{/* Selected chips — a rate scoped to the wrong programme is expensive to
			    find later, so the choice stays visible without opening the list. */}
			{value.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{value.map((code) => (
						<Badge
							key={code}
							variant="secondary"
							className="gap-1 pr-1 text-xs font-normal"
							title={nameByCode.get(code.toUpperCase()) || code}
						>
							{code}
							{!disabled && (
								<button
									type="button"
									onClick={() => toggle(code)}
									className="rounded-sm opacity-60 hover:opacity-100"
									aria-label={`Remove ${code}`}
								>
									<X className="h-3 w-3" />
								</button>
							)}
						</Badge>
					))}
				</div>
			)}
		</div>
	)
}
