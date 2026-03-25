'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileSpreadsheet, Upload, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import type { ImportPreviewRow, LookupMode } from '@/types/external-marks'

interface ImportPreviewDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	previewData: ImportPreviewRow[]
	loading: boolean
	onUpload: () => void
	lookupMode?: LookupMode
}

export function ImportPreviewDialog({
	open,
	onOpenChange,
	previewData,
	loading,
	onUpload,
	lookupMode = 'dummy_number'
}: ImportPreviewDialogProps) {
	const validCount = previewData.filter(r => r.isValid).length
	const invalidCount = previewData.filter(r => !r.isValid).length

	// Determine mode from first row if available, fallback to prop
	const effectiveMode = previewData.length > 0 ? previewData[0].lookup_mode : lookupMode
	const isRegisterMode = effectiveMode === 'register_number'

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<FileSpreadsheet className="h-5 w-5" />
						Import Preview {isRegisterMode ? '(Register Number Mode)' : '(Dummy Number Mode)'}
					</DialogTitle>
					<DialogDescription>
						Review the imported data before uploading. Rows with errors will be highlighted.
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto border rounded-lg">
					<Table>
						<TableHeader className="sticky top-0 bg-muted">
							<TableRow>
								<TableHead className="w-[60px] text-xs">Row</TableHead>
								<TableHead className="text-xs">Institution</TableHead>
								{isRegisterMode ? (
									<>
										<TableHead className="text-xs">Register No</TableHead>
										<TableHead className="text-xs">Subject Code</TableHead>
										<TableHead className="text-xs">Session Code</TableHead>
									</>
								) : (
									<>
										<TableHead className="text-xs">Dummy No</TableHead>
										<TableHead className="text-xs">Course Code</TableHead>
									</>
								)}
								<TableHead className="text-xs text-center">Marks</TableHead>
								<TableHead className="text-xs text-center">Out Of</TableHead>
								<TableHead className="text-xs">Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{previewData.map((row) => (
								<TableRow
									key={row.row}
									className={row.isValid ? '' : 'bg-red-50 dark:bg-red-900/10'}
								>
									<TableCell className="text-xs font-mono">{row.row}</TableCell>
									<TableCell className="text-xs font-medium">{row.institution_code || '-'}</TableCell>
									{isRegisterMode ? (
										<>
											<TableCell className="text-xs">{row.register_number || '-'}</TableCell>
											<TableCell className="text-xs font-mono">{row.subject_code || '-'}</TableCell>
											<TableCell className="text-xs font-mono">{row.session_code || '-'}</TableCell>
										</>
									) : (
										<>
											<TableCell className="text-xs">{row.dummy_number || '-'}</TableCell>
											<TableCell className="text-xs font-mono">{row.course_code || '-'}</TableCell>
										</>
									)}
									<TableCell className="text-xs text-center">{row.total_marks_obtained}</TableCell>
									<TableCell className="text-xs text-center">{row.marks_out_of}</TableCell>
									<TableCell>
										{row.isValid ? (
											<CheckCircle className="h-4 w-4 text-green-600" />
										) : (
											<div className="flex items-start gap-1">
												<XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
												<span className="text-xs text-red-600">{row.errors.join(', ')}</span>
											</div>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				<div className="grid grid-cols-3 gap-3 mt-4">
					<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
						<div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Total Rows</div>
						<div className="text-xl font-bold text-blue-700 dark:text-blue-300">{previewData.length}</div>
					</div>
					<div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
						<div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Valid</div>
						<div className="text-xl font-bold text-green-700 dark:text-green-300">
							{validCount}
						</div>
					</div>
					<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3">
						<div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Invalid</div>
						<div className="text-xl font-bold text-red-700 dark:text-red-300">
							{invalidCount}
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={onUpload}
						disabled={validCount === 0 || loading}
					>
						{loading ? (
							<>
								<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
								Uploading...
							</>
						) : (
							<>
								<Upload className="h-4 w-4 mr-2" />
								Upload {validCount} Records
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
