"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2 } from "lucide-react"
import type { FinalRule, FinalFormula } from "@/types/mark-conversion-rule"

export function FinalRuleEditor({
	availableRounds,
	availableComponents,
	value,
	onChange,
}: {
	availableRounds: string[]
	availableComponents: string[]
	value: FinalRule
	onChange: (rule: FinalRule) => void
}) {
	const v: FinalRule = value || {
		formula: 'average',
		rounds: [],
		compare_to: 'course.internal_max_marks',
	}

	const toggleRound = (r: string) => {
		const has = v.rounds.includes(r)
		onChange({ ...v, rounds: has ? v.rounds.filter(x => x !== r) : [...v.rounds, r] })
	}
	const addExtra = () => {
		const extras = [...(v.extras || []), { component: availableComponents[0] || '', marks: 0 }]
		onChange({ ...v, extras })
	}
	const updateExtra = (i: number, patch: Partial<{ component: string; marks: number }>) => {
		const extras = (v.extras || []).map((e, idx) => (idx === i ? { ...e, ...patch } : e))
		onChange({ ...v, extras })
	}
	const removeExtra = (i: number) => {
		const extras = (v.extras || []).filter((_, idx) => idx !== i)
		onChange({ ...v, extras })
	}

	return (
		<div className="space-y-4">
			<p className="text-xs text-muted-foreground">
				Define how round totals roll up into the final CIA mark. The result is scaled to{' '}
				<code>course.internal_max_marks</code>.
			</p>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="space-y-1.5">
					<Label className="text-xs font-semibold">Formula</Label>
					<Select
						value={v.formula}
						onValueChange={val => onChange({ ...v, formula: val as FinalFormula })}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="sum">Sum</SelectItem>
							<SelectItem value="average">Average</SelectItem>
							<SelectItem value="best_of">Best-of-N</SelectItem>
						</SelectContent>
					</Select>
				</div>
				{v.formula === 'best_of' && (
					<div className="space-y-1.5">
						<Label className="text-xs font-semibold">Best of (N)</Label>
						<Input
							type="number"
							min={1}
							value={v.best_of ?? 2}
							onChange={e => onChange({ ...v, best_of: Number(e.target.value) || 1 })}
							className="h-8 text-xs"
						/>
					</div>
				)}
			</div>

			<div className="space-y-1.5">
				<Label className="text-xs font-semibold">Rounds included</Label>
				<div className="flex flex-wrap gap-3">
					{availableRounds.length === 0 && (
						<p className="text-xs italic text-muted-foreground">
							Define rounds in the previous section first.
						</p>
					)}
					{availableRounds.map(r => (
						<label key={r} className="flex items-center gap-1.5 text-xs cursor-pointer">
							<Checkbox checked={v.rounds.includes(r)} onCheckedChange={() => toggleRound(r)} />
							{r}
						</label>
					))}
				</div>
			</div>

			<div className="space-y-1.5">
				<div className="flex items-center justify-between">
					<Label className="text-xs font-semibold">Extras (separate addends)</Label>
					<Button size="sm" variant="outline" type="button" onClick={addExtra}>
						<Plus className="h-3.5 w-3.5 mr-1" />
						Add Extra
					</Button>
				</div>
				{(v.extras || []).length === 0 && (
					<p className="text-xs italic text-muted-foreground">
						Optional. Used when a component (e.g. bonus attendance marks) is added outside any round.
					</p>
				)}
				{(v.extras || []).map((ex, i) => (
					<div key={i} className="flex items-center gap-2">
						<Select
							value={ex.component}
							onValueChange={val => updateExtra(i, { component: val })}
						>
							<SelectTrigger className="h-7 w-40 text-xs">
								<SelectValue placeholder="Component" />
							</SelectTrigger>
							<SelectContent>
								{availableComponents.map(c => (
									<SelectItem key={c} value={c}>
										{c}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<span className="text-xs text-muted-foreground">marks</span>
						<Input
							type="number"
							min={0}
							value={ex.marks}
							onChange={e => updateExtra(i, { marks: Number(e.target.value) || 0 })}
							className="h-7 w-24 text-xs"
						/>
						<Button
							size="icon"
							variant="ghost"
							type="button"
							onClick={() => removeExtra(i)}
							className="h-7 w-7 text-destructive"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</Button>
					</div>
				))}
			</div>

			<div className="rounded-md border bg-muted/30 p-3 text-xs">
				<p className="font-semibold mb-1">Rule summary</p>
				<p>
					{v.formula === 'best_of'
						? `Best ${v.best_of || 'N'} of ${v.rounds.length || 0} rounds`
						: v.formula === 'average'
						? `Average of ${v.rounds.length || 0} rounds`
						: `Sum of ${v.rounds.length || 0} rounds`}
					{(v.extras || []).length > 0 && ` + ${(v.extras || []).length} extra addend(s)`}
				</p>
				<p className="text-muted-foreground">
					Result is scaled to course.internal_max_marks.
				</p>
			</div>
		</div>
	)
}
