'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { type RoomSuggestion } from '@/types/seating-allocation'

interface RoomSuggestionPanelProps {
	suggestions: RoomSuggestion[]
	totalStudents: number
	onConfirm: (confirmed: RoomSuggestion[]) => void
	onCancel: () => void
}

export function RoomSuggestionPanel({
	suggestions,
	totalStudents,
	onConfirm,
	onCancel,
}: RoomSuggestionPanelProps) {
	const [rooms, setRooms] = useState<RoomSuggestion[]>(() =>
		suggestions.map((s) => ({ ...s, room: { ...s.room } }))
	)

	const totalCapacity = useMemo(
		() =>
			rooms.reduce(
				(sum, r) => sum + (r.is_selected ? r.suggested_seats : 0),
				0
			),
		[rooms]
	)

	const isValid = totalCapacity >= totalStudents

	const seatsNeeded = totalStudents - totalCapacity

	function toggleRoom(index: number) {
		setRooms((prev) =>
			prev.map((r, i) =>
				i === index ? { ...r, is_selected: !r.is_selected } : r
			)
		)
	}

	function updateSeats(index: number, seats: number) {
		setRooms((prev) =>
			prev.map((r, i) => {
				if (i !== index) return r
				const capped = Math.min(Math.max(0, seats), r.room.exam_capacity)
				return { ...r, suggested_seats: capped }
			})
		)
	}

	function handleConfirm() {
		onConfirm(rooms.filter((r) => r.is_selected))
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle>Room Allocation</CardTitle>
					<Badge variant={isValid ? 'default' : 'destructive'}>
						{totalCapacity} / {totalStudents} seats
					</Badge>
				</div>
				<p className="text-sm text-muted-foreground">
					System suggests rooms based on capacity. Adjust as needed.
				</p>
			</CardHeader>
			<CardContent className="space-y-3">
				{rooms.map((room, index) => (
					<div
						key={room.room.id}
						className={`flex items-center gap-4 rounded-lg border p-3 ${
							room.is_selected
								? 'border-primary/30 bg-primary/5'
								: 'border-muted bg-muted/30 opacity-60'
						}`}
					>
						<Checkbox
							checked={room.is_selected}
							onCheckedChange={() => toggleRoom(index)}
						/>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="font-medium text-sm">
									{room.room.room_code}
								</span>
								{room.room.building && (
									<span className="text-xs text-muted-foreground">
										{room.room.building}
										{room.room.floor ? `, Floor ${room.room.floor}` : ''}
									</span>
								)}
							</div>
							<div className="text-xs text-muted-foreground mt-0.5">
								{room.room.rows} x {room.room.columns} grid &middot;{' '}
								{room.room.exam_capacity} capacity
							</div>
						</div>
						<div className="flex items-center gap-2 shrink-0">
							<label className="text-xs text-muted-foreground">Seats:</label>
							<Input
								type="number"
								min={0}
								max={room.room.exam_capacity}
								value={room.suggested_seats}
								onChange={(e) =>
									updateSeats(index, parseInt(e.target.value, 10) || 0)
								}
								disabled={!room.is_selected}
								className="w-20 h-8 text-sm"
							/>
						</div>
					</div>
				))}

				{!isValid && (
					<p className="text-sm text-destructive font-medium">
						Not enough seats selected. Need {seatsNeeded} more.
					</p>
				)}

				<div className="flex justify-end gap-2 pt-2">
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={handleConfirm} disabled={!isValid}>
						Confirm Rooms
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
