'use client'

import { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VALID_STATUS_GRADES, type StatusGradeUploadRow, type StatusType } from '@/types/status-grades'
import XLSX from '@/lib/utils/excel-compat'

interface StatusGradeImportDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onImport: (grades: { register_no: string; grade: string }[]) => Promise<void>
	statusType: StatusType
	courseName: string
}

/**
 * StatusGradeImportDialog - Dialog for importing status grades from Excel files.
 *
 * Features:
 * - File upload dropzone
 * - Parse and preview imported data
 * - Validate grades before import
 * - Show validation errors
 * - Confirm/Cancel
 */
export function StatusGradeImportDialog({
	open,
	onOpenChange,
	onImport,
	statusType,
	courseName
}: StatusGradeImportDialogProps) {
	const [previewRows, setPreviewRows] = useState<StatusGradeUploadRow[]>([])
	const [fileName, setFileName] = useState<string>('')
	const [isLoading, setIsLoading] = useState(false)
	const [isImporting, setIsImporting] = useState(false)
	const [parseError, setParseError] = useState<string | null>(null)

	const validCount = previewRows.filter(r => r.is_valid).length
	const invalidCount = previewRows.filter(r => !r.is_valid && r.errors.length > 0).length
	const skippedCount = previewRows.filter(r => !r.new_grade).length

	const resetState = useCallback(() => {
		setPreviewRows([])
		setFileName('')
		setIsLoading(false)
		setIsImporting(false)
		setParseError(null)
	}, [])

	const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		setIsLoading(true)
		setParseError(null)
		setFileName(file.name)

		try {
			const buffer = await file.arrayBuffer()
			const workbook = await XLSX.read(buffer)

			if (workbook.SheetNames.length === 0) {
				setParseError('The Excel file has no sheets')
				setIsLoading(false)
				return
			}

			const sheetName = workbook.SheetNames[0]
			const worksheet = workbook.Sheets[sheetName]
			const data = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet)

			if (data.length === 0) {
				setParseError('The Excel file has no data rows')
				setIsLoading(false)
				return
			}

			// Parse rows and validate
			const rows: StatusGradeUploadRow[] = data.map((row, index) => {
				const registerNo = String(row['Register No'] || row['register_no'] || row['Register Number'] || '').trim()
				const studentName = String(row['Student Name'] || row['student_name'] || row['Name'] || '').trim()
				const currentGrade = String(row['Current Grade'] || row['current_grade'] || '').trim()
				const newGrade = String(row['New Grade'] || row['new_grade'] || row['Grade'] || row['Status Grade'] || '').trim()

				const errors: string[] = []

				if (!registerNo) {
					errors.push('Register number is required')
				}

				if (newGrade && !VALID_STATUS_GRADES.includes(newGrade as any)) {
					errors.push(`Invalid grade "${newGrade}". Must be: ${VALID_STATUS_GRADES.join(', ')}`)
				}

				return {
					row_number: index + 2,
					register_no: registerNo,
					student_name: studentName,
					current_grade: currentGrade,
					new_grade: newGrade,
					errors,
					is_valid: errors.length === 0 && !!newGrade
				}
			})

			setPreviewRows(rows)
		} catch (err: any) {
			console.error('Excel parse error:', err)
			setParseError(`Failed to parse Excel file: ${err.message || 'Unknown error'}`)
		} finally {
			setIsLoading(false)
		}

		// Reset the input so the same file can be re-selected
		e.target.value = ''
	}, [])

	const handleImport = useCallback(async () => {
		const validRows = previewRows.filter(r => r.is_valid && r.new_grade)
		if (validRows.length === 0) return

		setIsImporting(true)
		try {
			await onImport(validRows.map(r => ({
				register_no: r.register_no,
				grade: r.new_grade
			})))
			resetState()
			onOpenChange(false)
		} catch (err) {
			// Error handled by parent
		} finally {
			setIsImporting(false)
		}
	}, [previewRows, onImport, resetState, onOpenChange])

	const handleClose = useCallback(() => {
		resetState()
		onOpenChange(false)
	}, [resetState, onOpenChange])

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<FileSpreadsheet className="h-5 w-5 text-emerald-600" />
						Import Status Grades
					</DialogTitle>
					<DialogDescription>
						Import status grades for {courseName} ({statusType === 'internal' ? 'Internal/CIA' : 'External'})
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-hidden space-y-4">
					{/* File Upload */}
					{previewRows.length === 0 && (
						<div className="space-y-4">
							<div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-emerald-400 transition-colors">
								<Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
								<p className="text-sm font-medium mb-1">Upload Excel File</p>
								<p className="text-xs text-muted-foreground mb-4">
									Expected columns: Register No, Student Name, New Grade
								</p>
								<label className="cursor-pointer">
									<input
										type="file"
										accept=".xlsx,.xls,.csv"
										onChange={handleFileChange}
										className="hidden"
										disabled={isLoading}
									/>
									<Button
										variant="outline"
										size="sm"
										className="pointer-events-none"
										disabled={isLoading}
									>
										{isLoading ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												Parsing...
											</>
										) : (
											<>
												<Upload className="h-4 w-4 mr-2" />
												Choose File
											</>
										)}
									</Button>
								</label>
							</div>

							{parseError && (
								<div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
									<div className="flex items-center gap-2 text-red-800 dark:text-red-200">
										<XCircle className="h-4 w-4" />
										<span className="text-sm font-medium">{parseError}</span>
									</div>
								</div>
							)}

							<div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
								<p className="text-xs text-blue-800 dark:text-blue-200 font-medium mb-1">
									Expected Excel Format:
								</p>
								<p className="text-xs text-blue-700 dark:text-blue-300">
									Valid grades: <strong>Commended</strong>, <strong>Highly Commended</strong>, <strong>AAA</strong> (Absent)
								</p>
							</div>
						</div>
					)}

					{/* Preview Section */}
					{previewRows.length > 0 && (
						<div className="space-y-3">
							{/* Summary */}
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2 text-sm">
									<FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
									<span className="font-medium">{fileName}</span>
									<span className="text-muted-foreground">({previewRows.length} rows)</span>
								</div>
								<Button
									variant="ghost"
									size="sm"
									onClick={resetState}
									className="text-xs"
								>
									Choose Different File
								</Button>
							</div>

							{/* Validation Summary */}
							<div className="flex gap-3">
								<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300">
									<CheckCircle className="h-3 w-3 mr-1" />
									{validCount} Valid
								</Badge>
								{invalidCount > 0 && (
									<Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300">
										<XCircle className="h-3 w-3 mr-1" />
										{invalidCount} Invalid
									</Badge>
								)}
								{skippedCount > 0 && (
									<Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300">
										<AlertTriangle className="h-3 w-3 mr-1" />
										{skippedCount} Empty (Skipped)
									</Badge>
								)}
							</div>

							{/* Preview Table */}
							<ScrollArea className="h-[350px] border rounded-lg">
								<Table>
									<TableHeader>
										<TableRow className="bg-muted/50">
											<TableHead className="w-12 text-xs">Row</TableHead>
											<TableHead className="text-xs">Register No</TableHead>
											<TableHead className="text-xs">Student Name</TableHead>
											<TableHead className="text-xs">Current Grade</TableHead>
											<TableHead className="text-xs">New Grade</TableHead>
											<TableHead className="text-xs">Status</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{previewRows.map((row, idx) => (
											<TableRow
												key={idx}
												className={cn(
													row.errors.length > 0 && 'bg-red-50/50 dark:bg-red-900/10',
													!row.new_grade && 'bg-gray-50/50 dark:bg-gray-900/10'
												)}
											>
												<TableCell className="text-xs text-muted-foreground">{row.row_number}</TableCell>
												<TableCell className="text-xs font-mono">{row.register_no || '-'}</TableCell>
												<TableCell className="text-xs">{row.student_name || '-'}</TableCell>
												<TableCell className="text-xs">{row.current_grade || '-'}</TableCell>
												<TableCell className="text-xs font-medium">
													{row.new_grade || <span className="text-muted-foreground">Empty</span>}
												</TableCell>
												<TableCell className="text-xs">
													{row.errors.length > 0 ? (
														<span className="text-red-600 dark:text-red-400" title={row.errors.join(', ')}>
															{row.errors[0]}
														</span>
													) : row.is_valid ? (
														<span className="text-green-600 dark:text-green-400">Ready</span>
													) : (
														<span className="text-muted-foreground">Skipped</span>
													)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</ScrollArea>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={handleClose} disabled={isImporting}>
						Cancel
					</Button>
					{previewRows.length > 0 && (
						<Button
							onClick={handleImport}
							disabled={validCount === 0 || isImporting}
							className="bg-emerald-600 hover:bg-emerald-700 text-white"
						>
							{isImporting ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Importing...
								</>
							) : (
								<>
									<Upload className="h-4 w-4 mr-2" />
									Import {validCount} Grades
								</>
							)}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
