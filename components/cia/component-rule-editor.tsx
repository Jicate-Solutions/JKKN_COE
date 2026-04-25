"use client"

import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import type { ComponentRule } from "@/types/mark-conversion-rule"

const ALL_COMPONENTS = [
	{ code: 'test_1', name: 'Test 1' },
	{ code: 'test_2', name: 'Test 2' },
	{ code: 'test_3', name: 'Test 3' },
	{ code: 'assignment', name: 'Assignment' },
	{ code: 'quiz', name: 'Quiz' },
	{ code: 'mid_term', name: 'Mid Term' },
	{ code: 'presentation', name: 'Presentation' },
	{ code: 'attendance', name: 'Attendance' },
	{ code: 'lab', name: 'Lab' },
	{ code: 'project', name: 'Project' },
	{ code: 'seminar', name: 'Seminar' },
	{ code: 'viva', name: 'Viva' },
	{ code: 'other', name: 'Other' },
]

export function ComponentRuleEditor({
	value,
	onChange,
}: {
	value: Record<string, ComponentRule>
	onChange: (rules: Record<string, ComponentRule>) => void
}) {
	const toggle = (code: string) => {
		const next = { ...value }
		if (code in next) delete next[code]
		else next[code] = code === 'attendance' ? { strategy: 'use_slabs' } : { raw_out_of: 0, converts_to: 0 }
		onChange(next)
	}
	const updateField = (code: string, patch: Partial<ComponentRule>) => {
		onChange({ ...value, [code]: { ...value[code], ...patch } })
	}

	return (
		<div className="space-y-2">
			<p className="text-xs text-muted-foreground">
				Check a component to include it. Set <code>raw_out_of</code> (what the faculty enters) and <code>converts_to</code> (the CIA scale).
				Attendance uses the slab table automatically.
			</p>
			<div className="rounded-md border divide-y">
				{ALL_COMPONENTS.map(comp => {
					const rule = value[comp.code]
					const enabled = !!rule
					return (
						<div key={comp.code} className="flex items-center gap-3 px-3 py-2">
							<Checkbox
								checked={enabled}
								onCheckedChange={() => toggle(comp.code)}
								id={`comp-${comp.code}`}
							/>
							<label htmlFor={`comp-${comp.code}`} className="text-xs font-medium flex-1 cursor-pointer">
								{comp.name}
							</label>
							{enabled && comp.code === 'attendance' && (
								<Badge variant="outline" className="text-xs">Uses slabs</Badge>
							)}
							{enabled && comp.code !== 'attendance' && (
								<>
									<span className="text-xs text-muted-foreground">Raw /</span>
									<Input
										type="number"
										min={0}
										value={rule.raw_out_of ?? ''}
										onChange={e => updateField(comp.code, { raw_out_of: Number(e.target.value) || 0 })}
										className="h-7 w-20 text-xs"
										placeholder="50"
									/>
									<span className="text-xs text-muted-foreground">→</span>
									<Input
										type="number"
										min={0}
										value={rule.converts_to ?? ''}
										onChange={e => updateField(comp.code, { converts_to: Number(e.target.value) || 0 })}
										className="h-7 w-20 text-xs"
										placeholder="60"
									/>
								</>
							)}
						</div>
					)
				})}
			</div>
		</div>
	)
}
