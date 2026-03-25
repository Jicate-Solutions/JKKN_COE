'use client'

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Trash2 } from 'lucide-react'

interface DeleteConfirmationDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	selectedCount: number
	onConfirm: () => void
}

export function DeleteConfirmationDialog({
	open,
	onOpenChange,
	selectedCount,
	onConfirm
}: DeleteConfirmationDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2 text-red-600">
						<Trash2 className="h-5 w-5" />
						Confirm Bulk Delete
					</AlertDialogTitle>
					<AlertDialogDescription className="space-y-2">
						<span className="block">
							Are you sure you want to delete {selectedCount} selected record(s)?
							This action cannot be undone.
						</span>
						<span className="block text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded border border-amber-200 dark:border-amber-800">
							<strong>Note:</strong> Only records with <strong>Draft</strong> status and <strong>Bulk Upload</strong> source can be deleted. Manual Entry records and non-Draft status records will be skipped.
						</span>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						className="bg-red-600 hover:bg-red-700"
					>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
