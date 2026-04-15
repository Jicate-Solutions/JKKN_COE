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

	// Rule validation — runs on every plan change
	const violations = useMemo(
		() => validateAllocation(plans, students),
		[plans, students]
	)
	const hasViolations = violations.length > 0

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

					return (
						<div
							key={plan.room.id}
							className={`rounded-lg border ${
								hasAssignments
									? 'border-primary/30 bg-primary/5'
									: 'border-muted bg-muted/30'
							}`}
						>
							{/* Room header */}
							<div
								className="flex items-center gap-3 p-3 cursor-pointer"
								onClick={() => toggleExpand(roomIdx)}
							>
								{isExpanded ? (
									<ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
								) : (
									<ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
								)}
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="font-medium text-sm">{plan.room.room_code}</span>
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
									<div className="text-sm font-medium">{plan.total_seats}</div>
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

										return (
											<div key={colNum} className="space-y-1">
												<div className="flex items-center justify-between">
													<span className="text-xs font-semibold text-muted-foreground">
														C{colNum}
													</span>
													<Button
														variant="ghost"
														size="sm"
														className="h-5 text-[10px] px-1.5"
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
															<SelectTrigger className="h-7 text-xs flex-1 min-w-0">
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
															className="w-16 h-7 text-xs"
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

				{/* Rule violations */}
				{hasViolations && (
					<div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
						<div className="flex items-center gap-1.5">
							<AlertTriangle className="h-4 w-4 text-red-600" />
							<p className="text-xs font-semibold text-red-800">
								{violations.length} Rule Violation{violations.length !== 1 ? 's' : ''} Detected
							</p>
						</div>
						{violations.slice(0, 5).map((v, i) => (
							<p key={i} className="text-[11px] text-red-700 pl-5">
								<span className="font-medium">{v.room_code}</span>: {v.details}
								<span className="text-red-500 ml-1">({v.rule})</span>
							</p>
						))}
						{violations.length > 5 && (
							<p className="text-[10px] text-red-500 pl-5">+{violations.length - 5} more</p>
						)}
					</div>
				)}

				{!hasViolations && isValid && (
					<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2">
						<ShieldCheck className="h-4 w-4 text-emerald-600" />
						<p className="text-xs font-medium text-emerald-800">All rules satisfied</p>
					</div>
				)}

				<div className="flex justify-end gap-2 pt-2">
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={handleConfirm} disabled={!isValid || hasViolations}>
						Confirm & Generate
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
