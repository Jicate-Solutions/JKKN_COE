'use client'

import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronDown, Lock, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COE_ROLE_TAGS, COE_ROLE_TAG_CONFIG, type CoeRoleTag } from '@/lib/coe-calendar/visibility'

/**
 * Audience tag multi-select.
 *
 * `ALL` is exclusive — the database CHECK rejects it combined with anything
 * else — so picking it replaces the current selection rather than adding to it.
 */
export function RoleTagPicker({
	value,
	onChange,
	className,
}: {
	value: CoeRoleTag[]
	onChange: (tags: CoeRoleTag[]) => void
	className?: string
}) {
	const isAll = value.includes('ALL')
	// Unique per instance — the event form and the category dialog can both be
	// mounted at once, and duplicate ids would cross-wire the labels.
	const fieldId = useId()

	const toggle = (tag: CoeRoleTag) => {
		if (tag === 'ALL') {
			onChange(['ALL'])
			return
		}
		const next = value.filter(t => t !== 'ALL')
		onChange(next.includes(tag) ? next.filter(t => t !== tag) : [...next, tag])
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" className={cn('w-full justify-between font-normal', className)}>
					<span className="truncate">
						{value.length === 0
							? 'Select audience'
							: isAll
								? 'Everyone'
								: value.map(t => COE_ROLE_TAG_CONFIG[t].label).join(', ')}
					</span>
					<ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[320px] p-2" align="start">
				<div className="space-y-0.5">
					{COE_ROLE_TAGS.map(tag => {
						const checked = value.includes(tag)
						// Dimmed, not disabled: ALL cannot be unticked, so picking a
						// specific tag has to stay reachable as the way out of it.
						const dimmed = isAll && tag !== 'ALL'
						const id = `${fieldId}-${tag}`
						return (
							<div
								key={tag}
								className={cn(
									'flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors',
									'hover:bg-slate-50 dark:hover:bg-white/5',
									dimmed && 'opacity-40',
								)}
							>
								<Checkbox
									id={id}
									checked={checked}
									onCheckedChange={() => toggle(tag)}
									className="mt-0.5"
								/>
								<label htmlFor={id} className="min-w-0 cursor-pointer select-none">
									<span className="block text-sm font-medium leading-tight">
										{COE_ROLE_TAG_CONFIG[tag].label}
									</span>
									<span className="block text-xs text-slate-500 dark:text-slate-400 leading-tight">
										{COE_ROLE_TAG_CONFIG[tag].description}
									</span>
								</label>
							</div>
						)
					})}
				</div>
				<p className="text-xs text-slate-400 px-2 pt-2 border-t mt-2">
					Choosing <span className="font-medium">All</span> replaces the other selections.
				</p>
			</PopoverContent>
		</Popover>
	)
}

export function RoleTagChips({ tags, compact }: { tags: CoeRoleTag[]; compact?: boolean }) {
	if (!tags?.length) return <span className="text-xs text-slate-400">—</span>

	if (tags.includes('ALL')) {
		return (
			<Badge className="bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300 border-0 text-xs gap-1">
				<Users className="h-3 w-3" /> Everyone
			</Badge>
		)
	}

	return (
		<div className="flex flex-wrap gap-1">
			{tags.map(tag => (
				<Badge
					key={tag}
					className={cn(
						'border-0 text-xs',
						tag === 'COE_OFFICE'
							? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
							: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
					)}
				>
					{tag === 'COE_OFFICE' && <Lock className="h-3 w-3 mr-1" />}
					{compact ? tag : COE_ROLE_TAG_CONFIG[tag]?.label || tag}
				</Badge>
			))}
		</div>
	)
}
