"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Save } from "lucide-react"
import { useToast } from "@/hooks/common/use-toast"

interface CourseRow {
	course_offering_id: string
	course_code: string
	course_name: string
	exam_date?: string
	start_time?: string
	end_time?: string
	room_name?: string
	existing_timetable_id?: string
}

export function CIARoundTimetableDialog({
	open,
	onClose,
	settingId,
	round,
	roundName,
}: {
	open: boolean
	onClose: () => void
	settingId: string
	round: number
	roundName: string
}) {
	const { toast } = useToast()
	const [rows, setRows] = useState<CourseRow[]>([])
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState<string | null>(null)

	useEffect(() => {
		if (!open || !settingId) return
		setLoading(true)
		fetch(`/api/pre-exam/cia-entry-settings/${settingId}/timetable/scope?round=${round}`)
			.then(r => r.json())
			.then((data: CourseRow[]) => setRows(Array.isArray(data) ? data : []))
			.catch(() => toast({ title: '❌ Failed to load courses', variant: 'destructive' }))
			.finally(() => setLoading(false))
	}, [open, settingId, round])

	const updateRow = (i: number, patch: Partial<CourseRow>) =>
		setRows(r => r.map((x, idx) => idx === i ? { ...x, ...patch } : x))

	const saveRow = async (row: CourseRow) => {
		if (!row.exam_date) {
			toast({ title: '⚠️ Enter exam date first', variant: 'destructive' })
			return
		}
		setSaving(row.course_offering_id)
		try {
			const res = await fetch(`/api/pre-exam/cia-entry-settings/${settingId}/timetable`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					round,
					course_offering_id: row.course_offering_id,
					exam_date: row.exam_date,
					start_time: row.start_time || null,
					end_time: row.end_time || null,
					room_name: row.room_name || null,
				}),
			})
			if (res.ok) {
				toast({ title: '✅ Saved', className: 'bg-green-50 border-green-200 text-green-800' })
			} else {
				const d = await res.json()
				toast({ title: '❌ Save failed', description: d.error, variant: 'destructive' })
			}
		} catch {
			toast({ title: '❌ Network error', variant: 'destructive' })
		} finally {
			setSaving(null)
		}
	}

	return (
		<Dialog open={open} onOpenChange={o => !o && onClose()}>
			<DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Schedule {roundName} Timetable</DialogTitle>
				</DialogHeader>
				{loading ? (
					<div className="py-8 flex items-center justify-center">
						<Loader2 className="h-5 w-5 animate-spin mr-2" />
						<span className="text-sm text-muted-foreground">Loading courses...</span>
					</div>
				) : rows.length === 0 ? (
					<p className="text-sm text-muted-foreground text-center py-8">No courses found for this setting scope.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="text-xs">Course</TableHead>
								<TableHead className="text-xs">Date</TableHead>
								<TableHead className="text-xs">Start</TableHead>
								<TableHead className="text-xs">End</TableHead>
								<TableHead className="text-xs">Room</TableHead>
								<TableHead className="text-xs"></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row, i) => (
								<TableRow key={row.course_offering_id}>
									<TableCell className="text-xs font-medium">{row.course_code} — {row.course_name}</TableCell>
									<TableCell>
										<Input type="date" value={row.exam_date || ''} onChange={e => updateRow(i, { exam_date: e.target.value })} className="h-8 text-xs w-36" />
									</TableCell>
									<TableCell>
										<Input type="time" value={row.start_time || ''} onChange={e => updateRow(i, { start_time: e.target.value })} className="h-8 text-xs w-24" />
									</TableCell>
									<TableCell>
										<Input type="time" value={row.end_time || ''} onChange={e => updateRow(i, { end_time: e.target.value })} className="h-8 text-xs w-24" />
									</TableCell>
									<TableCell>
										<Input value={row.room_name || ''} onChange={e => updateRow(i, { room_name: e.target.value })} className="h-8 text-xs" placeholder="Room" />
									</TableCell>
									<TableCell>
										<Button size="sm" variant="outline" className="h-8 w-8 p-0"
											disabled={saving === row.course_offering_id}
											onClick={() => saveRow(row)}>
											{saving === row.course_offering_id
												? <Loader2 className="h-3.5 w-3.5 animate-spin" />
												: <Save className="h-3.5 w-3.5" />}
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</DialogContent>
		</Dialog>
	)
}
