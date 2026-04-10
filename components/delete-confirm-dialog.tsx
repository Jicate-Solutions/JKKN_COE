'use client'

import { useState } from 'react'
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogCancel,
	AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/common/use-toast'

/** Human-readable names for database tables */
const TABLE_LABELS: Record<string, string> = {
	course_mapping: 'Course Mappings',
	course_offerings: 'Course Offerings',
	courses: 'Courses',
	courses_temp: 'Temp Courses',
	exam_registrations: 'Exam Registrations',
	exam_timetables: 'Exam Timetables',
	exam_attendance: 'Exam Attendance',
	examination_sessions: 'Examination Sessions',
	examiner_assignments: 'Examiner Assignments',
	examiner_appointments: 'Examiner Appointments',
	examiner_email_logs: 'Email Logs',
	internal_marks: 'Internal Marks',
	final_marks: 'Final Marks',
	cia_marks: 'CIA Marks',
	marks_entry: 'Marks Entries',
	marks_upload_batches: 'Upload Batches',
	marks_correction_log: 'Correction Logs',
	answer_sheets: 'Answer Sheets',
	answer_sheet_packets: 'Answer Sheet Packets',
	student_backlogs: 'Learner Backlogs',
	student_dummy_numbers: 'Dummy Numbers',
	student_grades: 'Learner Grades',
	semester_results: 'Semester Results',
	seat_allocations: 'Seat Allocations',
	room_allocations: 'Room Allocations',
	programs: 'Programs',
	semesters: 'Semesters',
	students: 'Learners',
	admissions: 'Admissions',
	faculty_coe: 'Faculty',
	regulations: 'Regulations',
	departments: 'Departments',
	degrees: 'Degrees',
	sections: 'Sections',
	board: 'Boards',
	grades: 'Grades',
	academic_years: 'Academic Years',
	institutions: 'Institutions',
	practical_email_batches: 'Practical Batches',
	practical_batch_students: 'Practical Batch Learners',
	cia_entry_settings: 'CIA Settings',
	revaluation_marks: 'Revaluation Marks',
	bos_course_reviews: 'BOS Reviews',
	bos_meetings: 'BOS Meetings',
	bos_members: 'BOS Members',
	bos_documents: 'BOS Documents',
	bos_meeting_attendees: 'BOS Attendees',
	bos_ta_da_claims: 'BOS TA/DA Claims',
	lib_items: 'Library Items',
	lib_catalogue_records: 'Catalogue Records',
	lib_lending_transactions: 'Lending Transactions',
	lib_late_charges: 'Late Charges',
	lib_members: 'Library Members',
	lib_procurement_orders: 'Procurement Orders',
	lib_procurement_requests: 'Procurement Requests',
	lib_suppliers: 'Suppliers',
	lib_budget_heads: 'Budget Heads',
}

function getTableLabel(tableName: string): string {
	return TABLE_LABELS[tableName] || tableName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface Dependency {
	table: string
	column: string
	count: number
}

interface DeleteConfirmDialogProps {
	/** The entity to delete (null = dialog closed) */
	target: { id: string; name?: string } | null
	/** Display title, e.g., "Delete Course" */
	title: string
	/** API URL pattern. Use {id} for ID placeholder, or pass full URL without placeholder for query param style */
	apiUrl: string
	/** Called after successful deletion with the deleted entity's ID */
	onDeleted: (id: string) => void
	/** Called when dialog closes */
	onClose: () => void
}

/**
 * Reusable delete confirmation dialog with dependency checking.
 *
 * Flow:
 * 1. User clicks delete → dialog opens with "Are you sure?"
 * 2. User confirms → API call checks dependencies
 * 3. If dependencies found → dialog shows what will be deleted
 * 4. User confirms again → API call with ?force=true → deletes with cascade
 *
 * Usage:
 * ```tsx
 * <DeleteConfirmDialog
 *   target={deleteTarget}
 *   title="Delete Course"
 *   apiUrl="/api/master/courses?id={id}"
 *   onDeleted={(id) => setItems(prev => prev.filter(i => i.id !== id))}
 *   onClose={() => setDeleteTarget(null)}
 * />
 * ```
 */
export function DeleteConfirmDialog({
	target,
	title,
	apiUrl,
	onDeleted,
	onClose,
}: DeleteConfirmDialogProps) {
	const { toast } = useToast()
	const [loading, setLoading] = useState(false)
	const [dependencies, setDependencies] = useState<Dependency[] | null>(null)
	const [totalCount, setTotalCount] = useState(0)

	const buildUrl = (force: boolean) => {
		let url = apiUrl.replace('{id}', target?.id || '')
		if (force) {
			url += url.includes('?') ? '&force=true' : '?force=true'
		}
		return url
	}

	const handleClose = () => {
		setDependencies(null)
		setTotalCount(0)
		setLoading(false)
		onClose()
	}

	const handleDelete = async (force: boolean) => {
		if (!target) return

		setLoading(true)
		try {
			const response = await fetch(buildUrl(force), { method: 'DELETE' })
			const data = await response.json()

			if (response.status === 409 && data.has_dependencies) {
				// Show dependency warning - don't close dialog
				setDependencies(data.dependencies)
				setTotalCount(data.total_count)
				setLoading(false)
				return
			}

			if (!response.ok) {
				throw new Error(data.error || 'Failed to delete')
			}

			// Success
			onDeleted(target.id)
			toast({
				title: 'Deleted Successfully',
				description: `${target.name || 'Record'} has been deleted.`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
			})
			handleClose()
		} catch (error) {
			console.error('Delete error:', error)
			toast({
				title: 'Delete Failed',
				description: error instanceof Error ? error.message : 'Failed to delete. Please try again.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
			setLoading(false)
		}
	}

	const hasDeps = dependencies !== null

	return (
		<AlertDialog open={!!target} onOpenChange={(open) => { if (!open) handleClose() }}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						{hasDeps && <AlertTriangle className="h-5 w-5 text-amber-500" />}
						{hasDeps ? 'Warning: Related Records Found' : title}
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3">
							{!hasDeps ? (
								<p>
									Are you sure you want to delete <strong className="text-foreground">{target?.name || 'this record'}</strong>? This action cannot be undone.
								</p>
							) : (
								<>
									<p>
										<strong className="text-foreground">{target?.name || 'This record'}</strong> is linked to <strong className="text-foreground">{totalCount}</strong> related record{totalCount !== 1 ? 's' : ''} that will also be deleted:
									</p>
									<div className="rounded-md border bg-muted/50 p-3 space-y-1.5 max-h-48 overflow-y-auto">
										{dependencies!.map((dep) => (
											<div key={`${dep.table}-${dep.column}`} className="flex items-center justify-between text-sm">
												<span className="text-foreground font-medium">{getTableLabel(dep.table)}</span>
												<span className="text-muted-foreground tabular-nums bg-background rounded px-2 py-0.5 text-xs font-medium">
													{dep.count} record{dep.count !== 1 ? 's' : ''}
												</span>
											</div>
										))}
									</div>
									<p className="text-amber-600 dark:text-amber-400 font-medium text-xs">
										All listed records will be permanently deleted. This action cannot be undone.
									</p>
								</>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={(e) => {
							e.preventDefault()
							handleDelete(hasDeps)
						}}
						disabled={loading}
						className={hasDeps
							? 'bg-amber-600 hover:bg-amber-700 text-white'
							: 'bg-red-600 hover:bg-red-700 text-white'
						}
					>
						{loading ? (
							<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking...</>
						) : hasDeps ? (
							'Delete All'
						) : (
							'Delete'
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
