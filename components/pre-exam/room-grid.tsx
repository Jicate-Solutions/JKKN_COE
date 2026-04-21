'use client'

import { cn } from '@/lib/utils'
import type { RoomAllocationResult, SeatAssignment } from '@/types/seating-allocation'

/** 8-color palette for up to 8 programs */
const PROGRAM_COLORS = [
	{ bg: 'bg-blue-100 border-blue-300', text: 'text-blue-800', dot: 'bg-blue-500' },
	{ bg: 'bg-emerald-100 border-emerald-300', text: 'text-emerald-800', dot: 'bg-emerald-500' },
	{ bg: 'bg-amber-100 border-amber-300', text: 'text-amber-800', dot: 'bg-amber-500' },
	{ bg: 'bg-purple-100 border-purple-300', text: 'text-purple-800', dot: 'bg-purple-500' },
	{ bg: 'bg-rose-100 border-rose-300', text: 'text-rose-800', dot: 'bg-rose-500' },
	{ bg: 'bg-cyan-100 border-cyan-300', text: 'text-cyan-800', dot: 'bg-cyan-500' },
	{ bg: 'bg-orange-100 border-orange-300', text: 'text-orange-800', dot: 'bg-orange-500' },
	{ bg: 'bg-indigo-100 border-indigo-300', text: 'text-indigo-800', dot: 'bg-indigo-500' },
]

function getColor(index: number) {
	return PROGRAM_COLORS[index % PROGRAM_COLORS.length]
}

interface RoomGridProps {
	roomResult: RoomAllocationResult
	programColorMap: Map<string, number>
}

export function RoomGrid({ roomResult, programColorMap }: RoomGridProps) {
	const { room, seats, students_seated, total_capacity } = roomResult
	const { rows, columns } = room

	// Build 2D grid from flat seats array
	const grid: (SeatAssignment | null)[][] = Array.from({ length: rows }, () =>
		Array.from({ length: columns }, () => null)
	)

	for (const seat of seats) {
		const r = seat.row_number - 1
		const c = seat.column_number - 1
		if (r >= 0 && r < rows && c >= 0 && c < columns) {
			grid[r][c] = seat
		}
	}

	return (
		<div className="space-y-3">
			{/* Room header */}
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-base font-semibold">
						Room {room.room_name}
					</h3>
					{(room.building || room.floor) && (
						<p className="text-sm text-muted-foreground">
							{[room.building, room.floor].filter(Boolean).join(', ')}
						</p>
					)}
				</div>
				<span className="text-sm text-muted-foreground">
					{students_seated} / {total_capacity} seated
				</span>
			</div>

			{/* Grid dimensions */}
			<p className="text-xs text-muted-foreground">
				{rows} x {columns} grid
			</p>

			{/* Seating grid table */}
			<div className="overflow-x-auto">
				<table className="w-full border-collapse">
					<thead>
						<tr>
							<th className="p-1 text-xs text-muted-foreground" />
							{Array.from({ length: columns }, (_, c) => (
								<th key={c} className="p-1 text-center text-xs font-medium text-muted-foreground">
									C{c + 1}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{grid.map((row, r) => (
							<tr key={r}>
								<td className="p-1 text-center text-xs font-medium text-muted-foreground">
									R{r + 1}
								</td>
								{row.map((seat, c) => {
									const student = seat?.student ?? null
									if (student) {
										const colorIndex = programColorMap.get(student.program_code) ?? 0
										const color = getColor(colorIndex)
										return (
											<td key={c} className="p-0.5">
												<div
													className={cn(
														'rounded border p-1.5 min-h-[3rem] flex flex-col justify-center',
														color.bg,
														color.text
													)}
												>
													<span className="font-bold truncate max-w-[80px] block" style={{ fontSize: '10px' }}>
														{student.stu_register_no}
													</span>
													<span className="truncate max-w-[80px] block" style={{ fontSize: '9px' }}>
														{student.student_name}
													</span>
												</div>
											</td>
										)
									}

									return (
										<td key={c} className="p-0.5">
											<div
												className={cn(
													'rounded border border-dashed border-muted-foreground/20 bg-muted/30',
													'p-1.5 min-h-[3rem] flex items-center justify-center'
												)}
											>
												<span className="text-xs text-muted-foreground/50">Empty</span>
											</div>
										</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}

interface ProgramLegendProps {
	programColorMap: Map<string, number>
}

export function ProgramLegend({ programColorMap }: ProgramLegendProps) {
	return (
		<div className="flex flex-wrap items-center gap-3">
			{Array.from(programColorMap.entries()).map(([programCode, colorIndex]) => {
				const color = getColor(colorIndex)
				return (
					<div key={programCode} className="flex items-center gap-1.5">
						<span className={cn('inline-block h-2.5 w-2.5 rounded-full', color.dot)} />
						<span className="text-xs font-medium">{programCode}</span>
					</div>
				)
			})}
		</div>
	)
}
