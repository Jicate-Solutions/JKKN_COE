'use client'

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronRight, AlertTriangle, ShieldCheck } from 'lucide-react'
import type { SeatingStudent, RoomColumnPlan, ColumnAssignment, CourseGroup } from '@/types/seating-allocation'
import { buildCourseGroups, validateAllocation, type AllocationViolation } from '@/lib/seating/column-allocator'

interface RoomSuggestionPanelProps {
	columnPlans: RoomColumnPlan[]
	students: SeatingStudent[]
	totalStudents: number
	onConfirm: (plans: RoomColumnPlan[]) => void
	onCancel: () => void
}

// Color palette for program badges
const PROGRAM_COLORS = [
	'bg-blue-100 text-blue-800 border-blue-200',
	'bg-green-100 text-green-800 border-green-200',
	'bg-amber-100 text-amber-800 border-amber-200',
	'bg-purple-100 text-purple-800 border-purple-200',
	'bg-pink-100 text-pink-800 border-pink-200',
	'bg-cyan-100 text-cyan-800 border-cyan-200',
	'bg-orange-100 text-orange-800 border-orange-200',
	'bg-indigo-100 text-indigo-800 border-indigo-200',
]

// Per-room color theme — applied to container border + header strip
// so consecutive rooms in the list are easy to tell apart at a glance.
const ROOM_THEMES = [
	{ border: 'border-sky-300', header: 'bg-sky-50', strip: 'bg-sky-500', label: 'text-sky-900' },
	{ border: 'border-violet-300', header: 'bg-violet-50', strip: 'bg-violet-500', label: 'text-violet-900' },
	{ border: 'border-emerald-300', header: 'bg-emerald-50', strip: 'bg-emerald-500', label: 'text-emerald-900' },
	{ border: 'border-rose-300', header: 'bg-rose-50', strip: 'bg-rose-500', label: 'text-rose-900' },
	{ border: 'border-amber-300', header: 'bg-amber-50', strip: 'bg-amber-500', label: 'text-amber-900' },
	{ border: 'border-teal-300', header: 'bg-teal-50', strip: 'bg-teal-500', label: 'text-teal-900' },
	{ border: 'border-fuchsia-300', header: 'bg-fuchsia-50', strip: 'bg-fuchsia-500', label: 'text-fuchsia-900' },
	{ border: 'border-lime-300', header: 'bg-lime-50', strip: 'bg-lime-500', label: 'text-lime-900' },
]

// Per-column color theme — column number has semantic meaning (C1/C2/C3/C4)
// so keep the mapping stable regardless of room.
const COLUMN_THEMES: Record<number, { label: string; badge: string; input: string }> = {
	1: { label: 'text-blue-700', badge: 'bg-blue-100 text-blue-800 border-blue-300', input: 'border-blue-300 focus-visible:ring-blue-400' },
	2: { label: 'text-amber-700', badge: 'bg-amber-100 text-amber-800 border-amber-300', input: 'border-amber-300 focus-visible:ring-amber-400' },
	3: { label: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300', input: 'border-emerald-300 focus-visible:ring-emerald-400' },
	4: { label: 'text-purple-700', badge: 'bg-purple-100 text-purple-800 border-purple-300', input: 'border-purple-300 focus-visible:ring-purple-400' },
	5: { label: 'text-rose-700', badge: 'bg-rose-100 text-rose-800 border-rose-300', input: 'border-rose-300 focus-visible:ring-rose-400' },
	6: { label: 'text-cyan-700', badge: 'bg-cyan-100 text-cyan-800 border-cyan-300', input: 'border-cyan-300 focus-visible:ring-cyan-400' },
}
const DEFAULT_COLUMN_THEME = { label: 'text-slate-700', badge: 'bg-slate-100 text-slate-800 border-slate-300', input: 'border-slate-300 focus-visible:ring-slate-400' }

export function RoomSuggestionPanel({
	columnPlans,
	students,
	totalStudents,
	onConfirm,
	onCancel,
}: RoomSuggestionPanelProps) {
	const [plans, setPlans] = useState<RoomColumnPlan[]>(() =>
		columnPlans.map(p => ({ ...p, room: { ...p.room }, columns: p.columns.map(c => ({ ...c })) }))
	)
	const [expandedRooms, setExpandedRooms] = useState<Set<number>>(() => {
		// Expand rooms that have assignments
		const expanded = new Set<number>()
		plans.forEach((p, i) => { if (p.columns.length > 0) expanded.add(i) })
		return expanded
	})

	// Build course group options for dropdowns
	const courseGroups = useMemo(() => buildCourseGroups(students), [students])
	const courseOptions = useMemo(() =>
		courseGroups.map(g => ({
			value: `${g.program_code}|${g.course_code}`,
			label: `${g.program_code}-${g.course_code}`,
			program_code: g.program_code,
			course_code: g.course_code,
			total_count: g.count,
			program_type: g.program_type,
		})),
		[courseGroups]
	)

	// Program color map
	const programColorMap = useMemo(() => {
		const map = new Map<string, string>()
		const uniquePrograms = [...new Set(students.map(s => s.program_code))].sort()
		uniquePrograms.forEach((p, i) => {
			map.set(p, PROGRAM_COLORS[i % PROGRAM_COLORS.length])
		})
		return map
	}, [students])

	// Calculate allocated counts per course group across all rooms
	const allocatedCounts = useMemo(() => {
		const counts = new Map<string, number>()
		for (const plan of plans) {
			for (const col of plan.columns) {
				const key = `${col.program_code}|${col.course_code}`
				counts.set(key, (counts.get(key) || 0) + col.count)
			}
		}
		return counts
	}, [plans])

	const totalSeated = useMemo(
		() => plans.reduce((sum, p) => sum + p.total_seats, 0),
		[plans]
	)

	const isValid = totalSeated >= totalStudents

	// Rule 1 (Room Minimization) can be bypassed by the user when they have
	// operational reasons to spread learners across more rooms (e.g. practical
	// labs, seat-swap to cover adjacent buildings, per-floor invigilator limits).
	// Rules 2 and 3 are hard blockers — they affect exam integrity.
	const [skipRule1, setSkipRule1] = useState(false)

	// Rule validation — runs on every plan change
	const allViolations = useMemo(
		() => validateAllocation(plans, students),
		[plans, students]
	)
	const rule1Violations = useMemo(
		() => allViolations.filter(v => v.rule.startsWith('Rule 1')),
		[allViolations]
	)
	const hardViolations = useMemo(
		() => allViolations.filter(v => !v.rule.startsWith('Rule 1')),
		[allViolations]
	)
	const violations = skipRule1 ? hardViolations : allViolations
	const hasViolations = violations.length > 0
	const hasHardViolations = hardViolations.length > 0

	const toggleExpand = (index: number) => {
		setExpandedRooms(prev => {
			const next = new Set(prev)
			if (next.has(index)) next.delete(index)
			else next.add(index)
			return next
		})
	}

	const updateColumnAssignment = useCallback((
		roomIdx: number,
		colIdx: number,
		field: 'course' | 'count',
		value: string | number
	) => {
		setPlans(prev => prev.map((plan, ri) => {
			if (ri !== roomIdx) return plan
			const newColumns = plan.columns.map((col, ci) => {
				if (ci !== colIdx) return col
				if (field === 'course') {
					const [program_code, course_code] = (value as string).split('|')
					const group = courseGroups.find(
						g => g.program_code === program_code && g.course_code === course_code
					)
					return {
						...col,
						program_code,
						course_code,
						course_category: group?.is_common ? 'common' as const : (group?.program_type === 'PG' ? 'pg' as const : 'ug' as const),
					}
				}
				// field === 'count'
				const maxRows = plan.room.rows
				const capped = Math.min(Math.max(0, value as number), maxRows)
				return { ...col, count: capped }
			})
			return {
				...plan,
				columns: newColumns,
				total_seats: newColumns.reduce((s, c) => s + c.count, 0),
			}
		}))
	}, [courseGroups])

	const addColumnAssignment = useCallback((roomIdx: number, colNum: number) => {
		setPlans(prev => prev.map((plan, ri) => {
			if (ri !== roomIdx) return plan
			const newCol: ColumnAssignment = {
				room_id: plan.room.id,
				column_number: colNum,
				program_code: '',
				course_code: '',
				count: 0,
				course_category: 'ug',
			}
			const newColumns = [...plan.columns, newCol]
			return {
				...plan,
				columns: newColumns,
				total_seats: newColumns.reduce((s, c) => s + c.count, 0),
			}
		}))
	}, [])

	const removeColumnAssignment = useCallback((roomIdx: number, colIdx: number) => {
		setPlans(prev => prev.map((plan, ri) => {
			if (ri !== roomIdx) return plan
			const newColumns = plan.columns.filter((_, ci) => ci !== colIdx)
			return {
				...plan,
				columns: newColumns,
				total_seats: newColumns.reduce((s, c) => s + c.count, 0),
			}
		}))
	}, [])

	function handleConfirm() {
		onConfirm(plans)
	}

	// Get remaining (unallocated) count for a course group
	function getRemainingForCourse(programCode: string, courseCode: string): number {
		const group = courseGroups.find(
			g => g.program_code === programCode && g.course_code === courseCode
		)
		if (!group) return 0
		const allocated = allocatedCounts.get(`${programCode}|${courseCode}`) || 0
		return group.count - allocated
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle>Room Allocation</CardTitle>
					<Badge variant={isValid ? 'default' : 'destructive'}>
						{totalSeated} / {totalStudents} seats
					</Badge>
				</div>
				<p className="text-sm text-muted-foreground">
					System auto-assigns courses to columns. Adjust as needed.
				</p>
			</CardHeader>
			<CardContent className="space-y-2">
				{plans.map((plan, roomIdx) => {
					const isExpanded = expandedRooms.has(roomIdx)
					const hasAssignments = plan.columns.length > 0
					const roomTheme = ROOM_THEMES[roomIdx % ROOM_THEMES.length]

					return (
						<div
							key={plan.room.id}
							className={`rounded-lg border-2 overflow-hidden bg-white ${
								hasAssignments
									? roomTheme.border
									: 'border-muted'
							}`}
						>
							{/* Room header */}
							<div
								className="flex items-center gap-3 p-3 cursor-pointer relative"
								onClick={() => toggleExpand(roomIdx)}
							>
								{/* Vertical color strip on the left edge */}
								{hasAssignments && (
									<span className={`absolute left-0 top-0 bottom-0 w-1 ${roomTheme.strip}`} aria-hidden />
								)}
								{isExpanded ? (
									<ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
								) : (
									<ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
								)}
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className={`font-semibold text-sm ${hasAssignments ? roomTheme.label : ''}`}>
											{plan.room.room_code}
										</span>
										{plan.room.building && (
											<span className="text-xs text-muted-foreground">
												{plan.room.building}
												{plan.room.floor ? `, Floor ${plan.room.floor}` : ''}
											</span>
										)}
									</div>
									{/* Compact column summary when collapsed */}
									{!isExpanded && hasAssignments && (
										<div className="flex flex-wrap gap-1 mt-1">
											{plan.columns.map((col, ci) => (
												<span
													key={ci}
													className={`text-[10px] px-1.5 py-0.5 rounded border ${
														programColorMap.get(col.program_code) || PROGRAM_COLORS[0]
													}`}
												>
													C{col.column_number}: {col.program_code}-{col.course_code} ({col.count})
												</span>
											))}
										</div>
									)}
								</div>
								<div className="text-right shrink-0">
									<div className={`text-sm font-bold ${hasAssignments ? roomTheme.label : ''}`}>{plan.total_seats}</div>
									<div className="text-[10px] text-muted-foreground">
										{plan.room.rows}×{plan.room.columns}
									</div>
								</div>
							</div>

							{/* Expanded column assignments */}
							{isExpanded && (
								<div className="px-3 pb-3 space-y-2 border-t border-border/50 pt-2">
									{/* Column assignments grouped by column number */}
									{Array.from({ length: plan.room.columns }, (_, ci) => ci + 1).map(colNum => {
										const colAssignments = plan.columns
											.map((col, origIdx) => ({ col, origIdx }))
											.filter(({ col }) => col.column_number === colNum)
										const colTheme = COLUMN_THEMES[colNum] || DEFAULT_COLUMN_THEME

										return (
											<div key={colNum} className="space-y-1">
												<div className="flex items-center justify-between">
													<span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded border ${colTheme.badge}`}>
														C{colNum}
													</span>
													<Button
														variant="ghost"
														size="sm"
														className={`h-5 text-[10px] px-1.5 font-medium ${colTheme.label}`}
														onClick={(e) => {
															e.stopPropagation()
															addColumnAssignment(roomIdx, colNum)
														}}
													>
														+ Add
													</Button>
												</div>
												{colAssignments.map(({ col, origIdx }) => (
													<div key={origIdx} className="flex items-center gap-2 pl-4">
														<Select
															value={col.program_code && col.course_code ? `${col.program_code}|${col.course_code}` : ''}
															onValueChange={(v) => updateColumnAssignment(roomIdx, origIdx, 'course', v)}
														>
															<SelectTrigger className={`h-7 text-xs flex-1 min-w-0 ${colTheme.input}`}>
																<SelectValue placeholder="Select course..." />
															</SelectTrigger>
															<SelectContent>
																{courseOptions.map(opt => {
																	const remaining = getRemainingForCourse(opt.program_code, opt.course_code)
																	const isCurrent = col.program_code === opt.program_code && col.course_code === opt.course_code
																	return (
																		<SelectItem
																			key={opt.value}
																			value={opt.value}
																			className="text-xs"
																		>
																			<span className={`inline-block px-1 py-0.5 rounded text-[10px] mr-1 border ${
																				programColorMap.get(opt.program_code) || PROGRAM_COLORS[0]
																			}`}>
																				{opt.program_type}
																			</span>
																			{opt.label}
																			<span className="text-muted-foreground ml-1">
																				({isCurrent ? remaining + col.count : remaining} left)
																			</span>
																		</SelectItem>
																	)
																})}
															</SelectContent>
														</Select>
														<Input
															type="number"
															min={0}
															max={plan.room.rows}
															value={col.count}
															onChange={(e) =>
																updateColumnAssignment(roomIdx, origIdx, 'count', parseInt(e.target.value, 10) || 0)
															}
															className={`w-16 h-7 text-xs font-semibold ${colTheme.input}`}
														/>
														<Button
															variant="ghost"
															size="sm"
															className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
															onClick={(e) => {
																e.stopPropagation()
																removeColumnAssignment(roomIdx, origIdx)
															}}
														>
															×
														</Button>
													</div>
												))}
												{colAssignments.length === 0 && (
													<p className="text-[10px] text-muted-foreground pl-4 italic">No assignment</p>
												)}
											</div>
										)
									})}
								</div>
							)}
						</div>
					)
				})}

				{!isValid && (
					<p className="text-sm text-destructive font-medium">
						Not enough seats allocated. Need {totalStudents - totalSeated} more.
					</p>
				)}

				{/* Unallocated courses summary */}
				{courseGroups.some(g => {
					const allocated = allocatedCounts.get(`${g.program_code}|${g.course_code}`) || 0
					return allocated < g.count
				}) && (
					<div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
						<p className="text-xs font-medium text-amber-800 mb-1">Unallocated Courses:</p>
						<div className="flex flex-wrap gap-1">
							{courseGroups.filter(g => {
								const allocated = allocatedCounts.get(`${g.program_code}|${g.course_code}`) || 0
								return allocated < g.count
							}).map(g => {
								const allocated = allocatedCounts.get(`${g.program_code}|${g.course_code}`) || 0
								return (
									<span
										key={`${g.program_code}|${g.course_code}`}
										className={`text-[10px] px-1.5 py-0.5 rounded border ${
											programColorMap.get(g.program_code) || PROGRAM_COLORS[0]
										}`}
									>
										{g.program_code}-{g.course_code}: {g.count - allocated} remaining
									</span>
								)
							})}
						</div>
					</div>
				)}

				{/* Rule violations (hard blockers — rules 2, 3, ...) */}
				{hasHardViolations && (
					<div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
						<div className="flex items-center gap-1.5">
							<AlertTriangle className="h-4 w-4 text-red-600" />
							<p className="text-xs font-semibold text-red-800">
								{hardViolations.length} Rule Violation{hardViolations.length !== 1 ? 's' : ''} Detected
							</p>
						</div>
						{hardViolations.slice(0, 5).map((v, i) => (
							<p key={i} className="text-[11px] text-red-700 pl-5">
								<span className="font-medium">{v.room_code}</span>: {v.details}
								<span className="text-red-500 ml-1">({v.rule})</span>
							</p>
						))}
						{hardViolations.length > 5 && (
							<p className="text-[10px] text-red-500 pl-5">+{hardViolations.length - 5} more</p>
						)}
					</div>
				)}

				{/* Rule 1 advisory — user can override */}
				{rule1Violations.length > 0 && (
					<div className={`rounded-lg border p-3 space-y-2 ${
						skipRule1
							? 'border-amber-200 bg-amber-50'
							: 'border-red-200 bg-red-50'
					}`}>
						<div className="flex items-center gap-1.5">
							<AlertTriangle className={`h-4 w-4 ${skipRule1 ? 'text-amber-600' : 'text-red-600'}`} />
							<p className={`text-xs font-semibold ${skipRule1 ? 'text-amber-800' : 'text-red-800'}`}>
								Rule 1: Room Minimization {skipRule1 ? '(Skipped by user)' : ''}
							</p>
						</div>
						{rule1Violations.map((v, i) => (
							<p key={i} className={`text-[11px] pl-5 ${skipRule1 ? 'text-amber-700' : 'text-red-700'}`}>
								{v.details}
							</p>
						))}
						<label className="flex items-center gap-2 pl-5 pt-1 cursor-pointer">
							<Checkbox
								checked={skipRule1}
								onCheckedChange={(checked) => setSkipRule1(checked === true)}
							/>
							<span className="text-[11px] text-muted-foreground">
								Skip Rule 1 — I have a reason to use more rooms than the minimum (e.g. practical batches, floor limits, invigilator coverage)
							</span>
						</label>
					</div>
				)}

				{!hasViolations && isValid && (
					<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2">
						<ShieldCheck className="h-4 w-4 text-emerald-600" />
						<p className="text-xs font-medium text-emerald-800">
							{rule1Violations.length > 0 && skipRule1
								? 'Rule 1 skipped by user. Rules 2 & 3 satisfied.'
								: 'All rules satisfied'}
						</p>
					</div>
				)}

				<div className="flex justify-end gap-2 pt-2">
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={handleConfirm} disabled={!isValid || hasHardViolations}>
						Confirm & Generate
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
