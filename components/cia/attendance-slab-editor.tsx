"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2 } from "lucide-react"
import type { AttendanceSlab } from "@/types/mark-conversion-rule"

export function AttendanceSlabEditor({
	value,
	onChange,
}: {
	value: AttendanceSlab[]
	onChange: (slabs: AttendanceSlab[]) => void
}) {
	const add = () => onChange([...value, { min_pct: 0, max_pct: 0, award_pct: 0 }])
	const update = (i: number, patch: Partial<AttendanceSlab>) =>
		onChange(value.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
	const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

	// Preview for sample percentages
	const preview = [92, 87, 74].map(pct => {
		const slab = value.find(s => pct >= s.min_pct && pct <= s.max_pct)
		return { pct, award: slab?.award_pct ?? 0 }
	})

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<p className="text-xs text-muted-foreground">
					Define attendance % slabs. Lower-bound inclusive, upper-bound inclusive.
				</p>
				<Button size="sm" variant="outline" onClick={add} type="button">
					<Plus className="h-3.5 w-3.5 mr-1" />
					Add Slab
				</Button>
			</div>
			<div className="space-y-1.5">
				{value.length === 0 && (
					<p className="text-xs italic text-muted-foreground">No slabs defined yet.</p>
				)}
				{value.map((slab, i) => (
					<div key={i} className="flex items-center gap-2">
						<Input
							type="number"
							step="0.01"
							value={slab.min_pct}
							onChange={e => update(i, { min_pct: Number(e.target.value) })}
							className="h-8 w-24 text-xs"
							placeholder="Min %"
						/>
						<span className="text-xs text-muted-foreground">to</span>
						<Input
							type="number"
							step="0.01"
							value={slab.max_pct}
							onChange={e => update(i, { max_pct: Number(e.target.value) })}
							className="h-8 w-24 text-xs"
							placeholder="Max %"
						/>
						<span className="text-xs text-muted-foreground">→ Award</span>
						<Input
							type="number"
							step="0.01"
							value={slab.award_pct}
							onChange={e => update(i, { award_pct: Number(e.target.value) })}
							className="h-8 w-24 text-xs"
							placeholder="Award %"
						/>
						<span className="text-xs text-muted-foreground">%</span>
						<Button
							size="icon"
							variant="ghost"
							type="button"
							onClick={() => remove(i)}
							className="h-7 w-7 text-destructive"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</Button>
					</div>
				))}
			</div>
			<div className="rounded-md border bg-muted/30 p-3 text-xs">
				<p className="font-semibold mb-1">Preview</p>
				{preview.map(p => (
					<p key={p.pct}>
						{p.pct}% → award {p.award}% of max
					</p>
				))}
			</div>
		</div>
	)
}
