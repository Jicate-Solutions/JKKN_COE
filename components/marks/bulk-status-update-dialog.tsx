'use client'

import { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusGradeDropdown, StatusGradeBadge } from '@/components/marks/status-grade-dropdown'
import { VALID_STATUS_GRADES, type StatusGradeValue, type StatusGradeRow } from '@/types/status-grades'

interface BulkStatusUpdateDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	students: StatusGradeRow[]
	onApply: (studentIds: string[], grade: StatusGradeValue) => Promise<void>
}

/**
 * BulkStatusUpdateDialog - Dialog for applying a grade to multiple students at once.
 *
 * Features:
 * - Grade selection dropdown
 * - Select all / individual student selection
 * - Preview changes before applying
 * - Confirm/Cancel
 */
export function BulkStatusUpdateDialog({
	open,
	onOpenChange,
	students,
	onApply
}: BulkStatusUpdateDialogProps) {
	const [selectedGrade, setSelectedGrade] = useState<StatusGradeValue | ''>('')
	const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
	const [isApplying, setIsApplying] = useState(false)
	const [selectAll, setSelectAll] = useState(false)

	const resetState = useCallback(() => {
		setSelectedGrade('')
		setSelectedStudentIds(new Set())
		setIsApplying(false)
		setSelectAll(false)
	}, [])

	const handleSelectAll = useCallback((checked: boolean) => {
		setSelectAll(checked)
		if (checked) {
			setSelectedStudentIds(new Set(students.map(s => s.student_id)))
		} else {
			setSelectedStudentIds(new Set())
		}
	}, [students])

	const handleToggleStudent = useCallback((studentId: string, checked: boolean) => {
		setSelectedStudentIds(prev => {
			const next = new Set(prev)
			if (checked) {
				next.add(studentId)
			} else {
				next.delete(studentId)
			}
			return next
		})
	}, [])

	const handleApply = useCallback(async () => {
		if (!selectedGrade || selectedStudentIds.size === 0) return

		setIsApplying(true)
		try {
			await onApply(Array.from(selectedStudentIds), selectedGrade)
			resetState()
			onOpenChange(false)
		} catch (err) {
			// Error handled by parent
		} finally {
			setIsApplying(false)
		}
	}, [selectedGrade, selectedStudentIds, onApply, resetState, onOpenChange])

	const handleClose = useCallback(() => {
		resetState()
		onOpenChange(false)
	}, [resetState, onOpenChange])

	// Count how many will change
	const changedCount = students.filter(s =>
		selectedStudentIds.has(s.student_id) && s.current_grade !== selectedGrade
	).length

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Users className="h-5 w-5 text-emerald-600" />
						Bulk Update Status Grades
					</DialogTitle>
					<DialogDescription>
						Apply a status grade to multiple students at once.
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-hidden space-y-4">
					{/* Grade Selection */}
					<div className="space-y-2">
						<Label className="text-sm font-medium">Select Grade to Apply</Label>
						<div className="w-[250px]">
							<StatusGradeDropdown
								value={selectedGrade}
								onChange={(v) => setSelectedGrade(v)}
								placeholder="Choose a grade..."
							/>
						</div>
					</div>

					{/* Student Selection */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label className="text-sm font-medium">Select Students</Label>
							<div className="flex items-center gap-3">
								<Badge variant="outline" className="text-xs">
									{selectedStudentIds.size} of {students.length} selected
								</Badge>
								{selectedGrade && changedCount > 0 && (
									<Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300">
										{changedCount} will change
									</Badge>
								)}
							</div>
						</div>

						<ScrollArea className="h-[350px] border rounded-lg">
							<Table>
								<TableHeader>
									<TableRow className="bg-muted/50">
										<TableHead className="w-10">
											<Checkbox
												checked={selectAll}
												onCheckedChange={(checked) => handleSelectAll(!!checked)}
											/>
										</TableHead>
										<TableHead className="text-xs w-12">#</TableHead>
										<TableHead className="text-xs">Register No</TableHead>
										<TableHead className="text-xs">Student Name</TableHead>
										<TableHead className="text-xs">Current Grade</TableHead>
										{selectedGrade && <TableHead className="text-xs">New Grade</TableHead>}
									</TableRow>
								</TableHeader>
								<TableBody>
									{students.map((student, idx) => {
										const isSelected = selectedStudentIds.has(student.student_id)
										const willChange = isSelected && selectedGrade && student.current_grade !== selectedGrade

										return (
											<TableRow
												key={student.student_id}
												className={cn(
													isSelected && 'bg-emerald-50/50 dark:bg-emerald-900/10',
													willChange && 'bg-amber-50/50 dark:bg-amber-900/10'
												)}
											>
												<TableCell>
													<Checkbox
														checked={isSelected}
														onCheckedChange={(checked) => handleToggleStudent(student.student_id, !!checked)}
													/>
												</TableCell>
												<TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
												<TableCell className="text-xs font-mono">{student.register_no}</TableCell>
												<TableCell className="text-xs">{student.student_name}</TableCell>
												<TableCell>
													<StatusGradeBadge grade={student.current_grade} />
												</TableCell>
												{selectedGrade && (
													<TableCell>
														{isSelected ? (
															<StatusGradeBadge grade={selectedGrade} />
														) : (
															<span className="text-xs text-muted-foreground">-</span>
														)}
													</TableCell>
												)}
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						</ScrollArea>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={handleClose} disabled={isApplying}>
						Cancel
					</Button>
					<Button
						onClick={handleApply}
						disabled={!selectedGrade || selectedStudentIds.size === 0 || isApplying}
						className="bg-emerald-600 hover:bg-emerald-700 text-white"
					>
						{isApplying ? (
							<>
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								Applying...
							</>
						) : (
							<>
								Apply to {selectedStudentIds.size} Student{selectedStudentIds.size !== 1 ? 's' : ''}
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
