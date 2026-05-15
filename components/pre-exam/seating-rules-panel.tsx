'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, ChevronUp, Save, Loader2, RotateCcw } from 'lucide-react'
import { useToast } from '@/hooks/common/use-toast'
import type { SeatingRules } from '@/types/seating-allocation'
import { DEFAULT_SEATING_RULES } from '@/types/seating-allocation'

interface SeatingRulesPanelProps {
	institutionId: string
	rules: SeatingRules
	onChange: (rules: SeatingRules) => void
}

interface RuleMeta {
	key: keyof SeatingRules
	label: string
	short: string
	description: string
}

const RULES: RuleMeta[] = [
	{
		key: 'rule_1_minimize_rooms',
		label: 'Rule 1 — Minimize Rooms',
		short: 'Pack rooms to capacity before opening new ones.',
		description: 'When ON: fills earlier rooms tightly before assigning anyone to later rooms. When OFF: spreads learners evenly across every available room.',
	},
	{
		key: 'rule_2_same_program_separation',
		label: 'Rule 2 — Same Program Separation',
		short: 'No same-program learners in the same row across columns.',
		description: 'When ON: prevents two learners from the same program from sitting beside each other across columns. When OFF: same program can repeat in a row.',
	},
	{
		key: 'rule_3_shared_course_c2',
		label: 'Rule 3 — Shared Course Not in C2',
		short: 'Shared course codes restricted to C1/C3.',
		description: 'When ON: when two programs share a course code, those learners are blocked from column C2 to avoid paper-sharing risk. When OFF: shared courses may go in C2.',
	},
	{
		key: 'rule_4_room_continuity',
		label: 'Rule 4 — Room Continuity',
		short: 'Same program stays in continuous rooms.',
		description: 'When ON: a program that started in Room N continues into Room N+1 before any new program is introduced. When OFF: programs may be split across non-adjacent rooms.',
	},
	{
		key: 'rule_5_equal_distribution',
		label: 'Rule 5 — Equal Distribution',
		short: 'Avoid sparse last rooms.',
		description: 'When ON: if the last room has very few learners, re-runs allocation with denser packing so earlier rooms absorb the overflow. When OFF: accepts whatever the first pass produces.',
	},
]

export function SeatingRulesPanel({ institutionId, rules, onChange }: SeatingRulesPanelProps) {
	const { toast } = useToast()
	const [open, setOpen] = useState(false)
	const [saving, setSaving] = useState(false)

	const enabledCount = Object.values(rules).filter(Boolean).length
	const totalCount = RULES.length

	const handleToggle = (key: keyof SeatingRules, value: boolean) => {
		onChange({ ...rules, [key]: value })
	}

	const handleReset = () => {
		onChange({ ...DEFAULT_SEATING_RULES })
	}

	const handleSaveAsDefault = async () => {
		if (!institutionId) {
			toast({
				title: '❌ Institution required',
				description: 'Select an institution before saving rule defaults.',
				variant: 'destructive',
			})
			return
		}
		setSaving(true)
		try {
			const res = await fetch('/api/pre-exam/seating/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ institutions_id: institutionId, ...rules }),
			})
			if (!res.ok) {
				const data = await res.json().catch(() => ({}))
				throw new Error(data.error || 'Failed to save')
			}
			toast({
				title: '✅ Defaults saved',
				description: 'These rule toggles are now the institution default.',
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (err) {
			console.error('Save defaults error:', err)
			toast({
				title: '❌ Save failed',
				description: err instanceof Error ? err.message : 'Failed to save defaults.',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}

	return (
		<Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-muted/30">
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors rounded-lg"
				>
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium">Allocation Rules</span>
						<span className="text-[11px] text-muted-foreground">
							{enabledCount} of {totalCount} enabled
						</span>
					</div>
					{open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent className="px-3 pb-3 pt-1 space-y-3">
				<p className="text-[11px] text-muted-foreground">
					Toggle rules off to override the institution default for this allocation only. Save as default to make changes permanent for everyone in this institution.
				</p>

				<div className="space-y-2">
					{RULES.map(rule => (
						<div
							key={rule.key}
							className="flex items-start justify-between gap-3 rounded-md border bg-white px-3 py-2"
						>
							<div className="space-y-0.5 flex-1 min-w-0">
								<Label htmlFor={rule.key} className="text-xs font-semibold cursor-pointer">
									{rule.label}
								</Label>
								<p className="text-[11px] text-muted-foreground leading-snug">{rule.short}</p>
								<p className="text-[10px] text-muted-foreground/80 leading-snug">{rule.description}</p>
							</div>
							<Switch
								id={rule.key}
								checked={rules[rule.key]}
								onCheckedChange={(v) => handleToggle(rule.key, v)}
								className="mt-1"
							/>
						</div>
					))}
				</div>

				<div className="flex flex-wrap items-center justify-end gap-2 pt-1">
					<Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-xs">
						<RotateCcw className="mr-1 h-3 w-3" />
						Reset to all on
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={handleSaveAsDefault}
						disabled={saving || !institutionId}
						className="h-7 text-xs"
					>
						{saving ? (
							<><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Saving...</>
						) : (
							<><Save className="mr-1 h-3 w-3" /> Save as institution default</>
						)}
					</Button>
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}
