'use client'

import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { XCircle, X, AlertTriangle } from 'lucide-react'
import type { UploadSummary, UploadError } from '@/types/external-marks'

interface UploadErrorDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	uploadSummary: UploadSummary
	uploadErrors: UploadError[]
}

export function UploadErrorDialog({
	open,
	onOpenChange,
	uploadSummary,
	uploadErrors
}: UploadErrorDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
				<AlertDialogHeader className="flex-shrink-0">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
								<XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
							</div>
							<div>
								<AlertDialogTitle className="text-xl font-bold text-red-600 dark:text-red-400">
									Upload Errors
								</AlertDialogTitle>
								<AlertDialogDescription className="text-sm text-muted-foreground mt-1">
									Some records failed during upload
								</AlertDialogDescription>
							</div>
						</div>
						<button
							onClick={() => onOpenChange(false)}
							className="rounded-full p-1.5 hover:bg-muted transition-colors"
						>
							<X className="h-5 w-5 text-muted-foreground" />
						</button>
					</div>
				</AlertDialogHeader>

				<div className="flex-1 overflow-y-auto space-y-4 pr-2">
					{/* Upload Summary Cards */}
					{uploadSummary.total > 0 && (
						<div className="grid grid-cols-4 gap-3">
							<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
								<div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Total</div>
								<div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{uploadSummary.total}</div>
							</div>
							<div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
								<div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Success</div>
								<div className="text-2xl font-bold text-green-700 dark:text-green-300">{uploadSummary.success}</div>
							</div>
							<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3">
								<div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Failed</div>
								<div className="text-2xl font-bold text-red-700 dark:text-red-300">{uploadSummary.failed}</div>
							</div>
							<div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
								<div className="text-xs text-yellow-600 dark:text-yellow-400 font-medium mb-1">Skipped</div>
								<div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{uploadSummary.skipped}</div>
							</div>
						</div>
					)}

					{/* Error List */}
					<div className="flex-1 overflow-y-auto max-h-[300px] border rounded-lg p-4 bg-muted/30">
						<div className="space-y-2">
							{uploadErrors.map((error, index) => (
								<div key={index} className="p-3 bg-background border border-red-200 rounded-md">
									<div className="flex items-start gap-2">
										<Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300">
											Row {error.row}
										</Badge>
										<span className="text-xs text-muted-foreground">
											{error.dummy_number} | {error.course_code}
										</span>
									</div>
									<div className="mt-2 space-y-1">
										{(error.errors || []).map((err: string, i: number) => (
											<div key={i} className="flex items-start gap-2 text-sm">
												<XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
												<span className="text-red-700 dark:text-red-300">{err}</span>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Help Tips */}
					<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
						<div className="flex items-start gap-2">
							<AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
							<div>
								<h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">Common Fixes:</h4>
								<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
									<li>Ensure dummy numbers match existing student registrations</li>
									<li>Verify course codes exist in the system</li>
									<li>Check attendance status - absent students cannot have marks entered</li>
									<li>Total marks obtained cannot exceed marks out of</li>
									<li>All marks values should be non-negative</li>
									<li>Download the template for proper column format</li>
								</ul>
							</div>
						</div>
					</div>
				</div>

				<AlertDialogFooter>
					<AlertDialogAction onClick={() => onOpenChange(false)}>
						Close
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
