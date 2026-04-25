"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Plus, Trash2 } from "lucide-react"
import type { RoundRule } from "@/types/mark-conversion-rule"

export function RoundRuleEditor({
	availableComponents,
	value,
	onChange,
}: {
	availableComponents: string[]
	value: Record<string, RoundRule>
	onChange: (rules: Record<string, RoundRule>) => void
}) {
	const roundNames = Object.keys(value)

	const addRound = () => {
		const next = { ...value }
		const n = roundNames.length + 1
		const name = `CIA-${n}`
		next[name] = { components: [], cap_total: 100 }
		onChange(next)
	}
	const renameRound = (oldName: string, newName: string) => {
		if (!newName || newName === oldName || newName in value) return
		const next: Record<string, RoundRule> = {}
		for (const [k, v] of Object.entries(value)) {
			next[k === oldName ? newName : k] = v
		}
		onChange(next)
	}
	const removeRound = (name: string) => {
		const next = { ...value }
		delete next[name]
		onChange(next)
	}
	const toggleComponent = (roundName: string, code: string) => {
		const round = value[roundName]
		if (!round) return
		const has = round.components.includes(code)
		const components = has ? round.components.filter(c => c !== code) : [...round.components, code]
		onChange({ ...value, [roundName]: { ...round, components } })
	}
	const updateCap = (roundName: string, cap: number) => {
		const round = value[roundName]
		if (!round) return
		onChange({ ...value, [roundName]: { ...round, cap_total: cap } })
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<p className="text-xs text-muted-foreground">
					For each round, select which components roll up and set the total cap.
				</p>
				<Button size="sm" variant="outline" onClick={addRound} type="button">
					<Plus className="h-3.5 w-3.5 mr-1" />
					Add Round
				</Button>
			</div>
			{roundNames.length === 0 && (
				<p className="text-xs italic text-muted-foreground">No rounds defined yet.</p>
			)}
			{roundNames.map(roundName => {
				const round = value[roundName]
				return (
					<Card key={roundName} className="border-dashed">
						<CardHeader className="pb-2 pt-3 px-4">
							<div className="flex items-center justify-between gap-2">
								<Input
									value={roundName}
									onBlur={e => renameRound(roundName, e.target.value.trim())}
									className="h-7 w-32 text-sm font-semibold"
								/>
								<div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground">Cap</span>
									<Input
										type="number"
										min={0}
										value={round.cap_total}
										onChange={e => updateCap(roundName, Number(e.target.value) || 0)}
										className="h-7 w-20 text-xs"
									/>
									<Button
										size="icon"
										variant="ghost"
										type="button"
										onClick={() => removeRound(roundName)}
										className="h-7 w-7 text-destructive"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</Button>
								</div>
							</div>
						</CardHeader>
						<CardContent className="px-4 pb-3">
							<div className="grid grid-cols-3 gap-2">
								{availableComponents.length === 0 && (
									<p className="col-span-3 text-xs italic text-muted-foreground">
										Configure components in the previous section first.
									</p>
								)}
								{availableComponents.map(code => {
									const checked = round.components.includes(code)
									return (
										<label
											key={code}
											className="flex items-center gap-1.5 text-xs cursor-pointer"
										>
											<Checkbox
												checked={checked}
												onCheckedChange={() => toggleComponent(roundName, code)}
											/>
											{code}
										</label>
									)
								})}
							</div>
							{round.components.length > 0 && (
								<div className="mt-2 flex flex-wrap gap-1">
									{round.components.map(c => (
										<Badge key={c} variant="secondary" className="text-xs">
											{c}
										</Badge>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				)
			})}
		</div>
	)
}
