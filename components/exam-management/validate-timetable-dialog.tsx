'use client'

import { useState } from 'react'
import XLSX from '@/lib/utils/excel-compat'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, CheckCircle, XCircle, FileSpreadsheet, Loader2, ShieldCheck } from 'lucide-react'
import { runTimetableValidation, hasAnyIssues } from '@/services/exam-management/validate-timetable-service'
import type { ValidationResult } from '@/types/validate-timetable'

interface ValidateTimetableDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	institutionsId: string
	examinationSessionId: string
	onValidationComplete?: (result: ValidationResult) => void
}

export function ValidateTimetableDialog({
	open,
	onOpenChange,
	institutionsId,
	examinationSessionId,
	onValidationComplete,
}: ValidateTimetableDialogProps) {
	const [loading, setLoading] = useState(false)
	const [result, setResult] = useState<ValidationResult | null>(null)
	const [error, setError] = useState<string | null>(null)

	const handleValidate = async () => {
		setLoading(true)
		setError(null)
		setResult(null)

		try {
			const data = await runTimetableValidation(institutionsId, examinationSessionId)
			setResult(data)
			onValidationComplete?.(data)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Validation failed')
		} finally {
			setLoading(false)
		}
	}

	const handleExportExcel = () => {
		if (!result) return

		const wb = XLSX.utils.book_new()

		// Sheet 1: Student Conflicts
		if (result.errors.student_conflicts.length > 0) {
			const conflictRows = result.errors.student_conflicts.flatMap(c =>
				c.courses.map((course, i) => ({
					'Register No': c.stu_register_no,
					'Student Name': i === 0 ? c.student_name : '',
					'Exam Date': c.exam_date,
					'Session': c.session,
					'Course Code': course.course_code,
					'Course Title': course.course_title,
					'QP Code': course.qp_code,
				}))
			)
			const ws1 = XLSX.utils.json_to_sheet(conflictRows)
			XLSX.utils.book_append_sheet(wb, ws1, 'Student Conflicts')
		}

		// Sheet 2: QP Code Mismatches
		if (result.errors.qp_code_mismatches.length > 0) {
			const qpRows = result.errors.qp_code_mismatches.flatMap(q =>
				q.courses.map(course => ({
					'QP Code': q.qp_code,
					'Course Code': course.course_code,
					'Course Title': course.course_title,
					'Exam Date': course.exam_date,
					'Session': course.session,
				}))
			)
			const ws2 = XLSX.utils.json_to_sheet(qpRows)
			XLSX.utils.book_append_sheet(wb, ws2, 'QP Code Mismatches')
		}

		// Sheet 3: Unscheduled Courses
		if (result.warnings.unscheduled_courses.length > 0) {
			// Deduplicate by course_code for cleaner report
			const seen = new Set<string>()
			const uniqRows = result.warnings.unscheduled_courses.filter(u => {
				if (seen.has(u.course_code)) return false
				seen.add(u.course_code)
				return true
			}).map(u => ({
				'Course Code': u.course_code,
				'Course Title': u.course_title,
				'QP Code': u.qp_code,
			}))
			const ws3 = XLSX.utils.json_to_sheet(uniqRows)
			XLSX.utils.book_append_sheet(wb, ws3, 'Unscheduled Courses')
		}

		// Sheet 4: Incomplete Timetables
		if (result.warnings.incomplete_timetables.length > 0) {
			const incompleteRows = result.warnings.incomplete_timetables.map(t => ({
				'Course Code': t.course_code,
				'Course Title': t.course_title,
				'Missing Fields': t.missing_fields.join(', '),
			}))
			const ws4 = XLSX.utils.json_to_sheet(incompleteRows)
			XLSX.utils.book_append_sheet(wb, ws4, 'Incomplete Timetables')
		}

		// Sheet 5: Summary
		const summaryRows = [
			{ 'Metric': 'Total Learners', 'Value': result.summary.total_students },
			{ 'Metric': 'Total Courses', 'Value': result.summary.total_courses },
			{ 'Metric': 'Timetable Entries', 'Value': result.summary.total_timetable_entries },
			{ 'Metric': 'Errors', 'Value': result.summary.errors_count },
			{ 'Metric': 'Warnings', 'Value': result.summary.warnings_count },
		]
		const ws5 = XLSX.utils.json_to_sheet(summaryRows)
		XLSX.utils.book_append_sheet(wb, ws5, 'Summary')

		XLSX.writeFile(wb, `timetable-validation-report.xlsx`)
	}

	const handleClose = (isOpen: boolean) => {
		if (!isOpen) {
			setResult(null)
			setError(null)
		}
		onOpenChange(isOpen)
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-w-[900px] max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldCheck className="h-5 w-5 text-blue-600" />
						Validate Timetable
					</DialogTitle>
				</DialogHeader>

				{/* Run Validation */}
				{!result && !loading && (
					<div className="flex flex-col items-center gap-4 py-8">
						<p className="text-sm text-muted-foreground text-center max-w-md">
							Run validation to check for scheduling conflicts, missing exams, QP code mismatches, and incomplete entries.
						</p>
						<Button onClick={handleValidate} size="lg" className="gap-2">
							<ShieldCheck className="h-4 w-4" />
							Run Validation
						</Button>
						{error && (
							<p className="text-sm text-destructive">{error}</p>
						)}
					</div>
				)}

				{/* Loading */}
				{loading && (
					<div className="flex flex-col items-center gap-3 py-12">
						<Loader2 className="h-8 w-8 animate-spin text-blue-600" />
						<p className="text-sm text-muted-foreground">Validating timetable...</p>
					</div>
				)}

				{/* Results */}
				{result && (
					<div className="space-y-4">
						{/* Summary Cards */}
						<div className="grid grid-cols-3 gap-3">
							<Card className={result.summary.errors_count > 0 ? 'border-red-200 bg-red-50 dark:bg-red-950/20' : 'border-green-200 bg-green-50 dark:bg-green-950/20'}>
								<CardContent className="p-3 flex items-center gap-3">
									{result.summary.errors_count > 0 ? (
										<XCircle className="h-8 w-8 text-red-500 shrink-0" />
									) : (
										<CheckCircle className="h-8 w-8 text-green-500 shrink-0" />
									)}
									<div>
										<p className="text-2xl font-bold">{result.summary.errors_count}</p>
										<p className="text-xs text-muted-foreground">Errors</p>
									</div>
								</CardContent>
							</Card>
							<Card className={result.summary.warnings_count > 0 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20' : 'border-green-200 bg-green-50 dark:bg-green-950/20'}>
								<CardContent className="p-3 flex items-center gap-3">
									{result.summary.warnings_count > 0 ? (
										<AlertTriangle className="h-8 w-8 text-amber-500 shrink-0" />
									) : (
										<CheckCircle className="h-8 w-8 text-green-500 shrink-0" />
									)}
									<div>
										<p className="text-2xl font-bold">{result.summary.warnings_count}</p>
										<p className="text-xs text-muted-foreground">Warnings</p>
									</div>
								</CardContent>
							</Card>
							<Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
								<CardContent className="p-3 flex items-center gap-3">
									<ShieldCheck className="h-8 w-8 text-blue-500 shrink-0" />
									<div>
										<p className="text-2xl font-bold">{result.summary.total_students}</p>
										<p className="text-xs text-muted-foreground">Learners / {result.summary.total_courses} Courses</p>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Success message */}
						{!hasAnyIssues(result) && (
							<div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800">
								<CheckCircle className="h-6 w-6 text-green-600" />
								<div>
									<p className="font-semibold text-green-800 dark:text-green-200">Timetable validated successfully</p>
									<p className="text-sm text-green-700 dark:text-green-300">No conflicts found. All courses are properly scheduled.</p>
								</div>
							</div>
						)}

						{/* Tabbed Results */}
						{hasAnyIssues(result) && (
							<Tabs defaultValue="errors" className="w-full">
								<div className="flex items-center justify-between">
									<TabsList>
										<TabsTrigger value="errors" className="gap-1.5">
											<XCircle className="h-3.5 w-3.5" />
											Errors ({result.summary.errors_count})
										</TabsTrigger>
										<TabsTrigger value="warnings" className="gap-1.5">
											<AlertTriangle className="h-3.5 w-3.5" />
											Warnings ({result.summary.warnings_count})
										</TabsTrigger>
									</TabsList>
									<Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExportExcel}>
										<FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
										Export Excel
									</Button>
								</div>

								{/* Errors Tab */}
								<TabsContent value="errors" className="space-y-4 mt-3">
									{/* Rule 1: Student Conflicts */}
									{result.errors.student_conflicts.length > 0 && (
										<div>
											<h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
												<Badge variant="destructive" className="text-[10px]">RULE 1</Badge>
												Student Exam Conflicts ({result.errors.student_conflicts.length})
											</h4>
											<div className="rounded-md border max-h-[250px] overflow-auto">
												<Table>
													<TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900/50">
														<TableRow>
															<TableHead className="text-xs w-[120px]">Register No</TableHead>
															<TableHead className="text-xs w-[150px]">Name</TableHead>
															<TableHead className="text-xs w-[100px]">Date</TableHead>
															<TableHead className="text-xs w-[60px]">Session</TableHead>
															<TableHead className="text-xs">Conflicting Courses</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{result.errors.student_conflicts.map((conflict, idx) => (
															<TableRow key={idx}>
																<TableCell className="text-xs font-mono">{conflict.stu_register_no}</TableCell>
																<TableCell className="text-xs">{conflict.student_name}</TableCell>
																<TableCell className="text-xs">{conflict.exam_date}</TableCell>
																<TableCell className="text-xs">
																	<Badge variant="outline" className="text-[10px]">{conflict.session}</Badge>
																</TableCell>
																<TableCell className="text-xs">
																	<div className="flex flex-wrap gap-1">
																		{conflict.courses.map(c => (
																			<Badge key={c.course_code} variant="secondary" className="text-[10px]">
																				{c.course_code}
																			</Badge>
																		))}
																	</div>
																</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											</div>
										</div>
									)}

									{/* Rule 3: QP Code Mismatches */}
									{result.errors.qp_code_mismatches.length > 0 && (
										<div>
											<h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
												<Badge variant="destructive" className="text-[10px]">RULE 3</Badge>
												QP Code Mismatches ({result.errors.qp_code_mismatches.length})
											</h4>
											<div className="rounded-md border max-h-[250px] overflow-auto">
												<Table>
													<TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900/50">
														<TableRow>
															<TableHead className="text-xs w-[120px]">QP Code</TableHead>
															<TableHead className="text-xs">Courses with Mismatched Schedules</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{result.errors.qp_code_mismatches.map((mismatch, idx) => (
															<TableRow key={idx}>
																<TableCell className="text-xs font-mono font-semibold">{mismatch.qp_code}</TableCell>
																<TableCell className="text-xs">
																	<div className="space-y-1">
																		{mismatch.courses.map(c => (
																			<div key={c.course_code} className="flex items-center gap-2">
																				<Badge variant="secondary" className="text-[10px]">{c.course_code}</Badge>
																				<span className="text-muted-foreground">{c.exam_date}</span>
																				<Badge variant="outline" className="text-[10px]">{c.session}</Badge>
																			</div>
																		))}
																	</div>
																</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											</div>
										</div>
									)}

									{result.summary.errors_count === 0 && (
										<div className="text-center py-6 text-sm text-muted-foreground">
											<CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
											No errors found
										</div>
									)}
								</TabsContent>

								{/* Warnings Tab */}
								<TabsContent value="warnings" className="space-y-4 mt-3">
									{/* Rule 2: Unscheduled Courses */}
									{result.warnings.unscheduled_courses.length > 0 && (
										<div>
											<h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
												<Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">RULE 2</Badge>
												Courses Registered but No Exam Scheduled
											</h4>
											<p className="text-xs text-muted-foreground mb-2">
												{(() => {
													const uniqueCodes = new Set(result.warnings.unscheduled_courses.map(u => u.course_code))
													return `${uniqueCodes.size} course(s) affecting ${result.warnings.unscheduled_courses.length} registration(s)`
												})()}
											</p>
											<div className="rounded-md border max-h-[250px] overflow-auto">
												<Table>
													<TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900/50">
														<TableRow>
															<TableHead className="text-xs w-[120px]">Register No</TableHead>
															<TableHead className="text-xs w-[150px]">Name</TableHead>
															<TableHead className="text-xs w-[120px]">Course Code</TableHead>
															<TableHead className="text-xs">Course Title</TableHead>
															<TableHead className="text-xs w-[100px]">QP Code</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{result.warnings.unscheduled_courses.slice(0, 100).map((u, idx) => (
															<TableRow key={idx}>
																<TableCell className="text-xs font-mono">{u.stu_register_no}</TableCell>
																<TableCell className="text-xs">{u.student_name}</TableCell>
																<TableCell className="text-xs font-mono">{u.course_code}</TableCell>
																<TableCell className="text-xs">{u.course_title}</TableCell>
																<TableCell className="text-xs font-mono">{u.qp_code}</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											</div>
											{result.warnings.unscheduled_courses.length > 100 && (
												<p className="text-xs text-muted-foreground mt-1">
													Showing first 100 of {result.warnings.unscheduled_courses.length} entries. Export Excel for full list.
												</p>
											)}
										</div>
									)}

									{/* Rule 5: Incomplete Timetables */}
									{result.warnings.incomplete_timetables.length > 0 && (
										<div>
											<h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
												<Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">RULE 5</Badge>
												Incomplete Timetable Entries ({result.warnings.incomplete_timetables.length})
											</h4>
											<div className="rounded-md border max-h-[250px] overflow-auto">
												<Table>
													<TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900/50">
														<TableRow>
															<TableHead className="text-xs w-[120px]">Course Code</TableHead>
															<TableHead className="text-xs">Course Title</TableHead>
															<TableHead className="text-xs w-[200px]">Missing Fields</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{result.warnings.incomplete_timetables.map((t, idx) => (
															<TableRow key={idx}>
																<TableCell className="text-xs font-mono">{t.course_code}</TableCell>
																<TableCell className="text-xs">{t.course_title}</TableCell>
																<TableCell className="text-xs">
																	<div className="flex flex-wrap gap-1">
																		{t.missing_fields.map(f => (
																			<Badge key={f} variant="outline" className="text-[10px] border-amber-300 text-amber-700">
																				{f}
																			</Badge>
																		))}
																	</div>
																</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											</div>
										</div>
									)}

									{result.summary.warnings_count === 0 && (
										<div className="text-center py-6 text-sm text-muted-foreground">
											<CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
											No warnings found
										</div>
									)}
								</TabsContent>
							</Tabs>
						)}

						{/* Action buttons */}
						<div className="flex justify-between pt-2 border-t">
							<Button variant="outline" size="sm" onClick={handleValidate} className="gap-1.5">
								<ShieldCheck className="h-3.5 w-3.5" />
								Re-validate
							</Button>
							{hasAnyIssues(result) && (
								<Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExportExcel}>
									<FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
									Export Report
								</Button>
							)}
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
