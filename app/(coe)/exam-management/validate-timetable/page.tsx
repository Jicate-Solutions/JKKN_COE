'use client'

import { useState, useEffect, useCallback } from 'react'
import XLSX from '@/lib/utils/excel-compat'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { ShieldCheck, Loader2, CheckCircle, XCircle, AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { runTimetableValidation, hasAnyIssues } from '@/services/exam-management/validate-timetable-service'
import type { ValidationResult } from '@/types/validate-timetable'
import Link from 'next/link'

interface Institution {
	id: string
	institution_code: string
	name: string
}

interface ExaminationSession {
	id: string
	session_name: string
	session_code: string
}

export default function ValidateTimetablePage() {
	const { toast } = useToast()
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	// Data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])

	// Selected
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const [selectedSessionId, setSelectedSessionId] = useState('')

	// Validation
	const [loading, setLoading] = useState(false)
	const [result, setResult] = useState<ValidationResult | null>(null)

	// Fetch institutions
	const fetchInstitutions = useCallback(async () => {
		try {
			const url = appendToUrl('/api/master/institutions')
			const res = await fetch(url)
			const data = await res.json()
			setInstitutions(data || [])
		} catch (err) {
			console.error('Error fetching institutions:', err)
		}
	}, [appendToUrl])

	useEffect(() => {
		if (isReady) fetchInstitutions()
	}, [isReady, fetchInstitutions])

	// Auto-select for normal users
	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId && institutions.length > 0) {
			const exists = institutions.find(i => i.id === contextInstitutionId)
			if (exists) setSelectedInstitutionId(exists.id)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId, institutions])

	// Fetch sessions when institution selected
	useEffect(() => {
		if (!selectedInstitutionId) {
			setSessions([])
			setSelectedSessionId('')
			return
		}
		const fetchSessions = async () => {
			try {
				const res = await fetch(`/api/exam-management/examination-sessions?institutions_id=${selectedInstitutionId}`)
				if (!res.ok) {
					console.error('Error fetching sessions:', res.status, res.statusText)
					setSessions([])
					return
				}
				const data = await res.json()
				setSessions(Array.isArray(data) ? data : [])
			} catch (err) {
				console.error('Error fetching sessions:', err)
				setSessions([])
			}
		}
		fetchSessions()
	}, [selectedInstitutionId])

	const handleValidate = async () => {
		if (!selectedInstitutionId || !selectedSessionId) {
			toast({
				title: 'Missing Selection',
				description: 'Please select an institution and examination session.',
				variant: 'destructive',
			})
			return
		}

		setLoading(true)
		setResult(null)

		try {
			const data = await runTimetableValidation(selectedInstitutionId, selectedSessionId)
			setResult(data)

			if (!hasAnyIssues(data)) {
				toast({
					title: '✅ Validation Passed',
					description: 'No conflicts found. Timetable is ready for publish.',
					className: 'bg-green-50 border-green-200 text-green-800',
				})
			} else {
				toast({
					title: '⚠️ Issues Found',
					description: `${data.summary.errors_count} error(s), ${data.summary.warnings_count} warning(s) detected.`,
					variant: 'destructive',
				})
			}
		} catch (err) {
			toast({
				title: '❌ Validation Failed',
				description: err instanceof Error ? err.message : 'An error occurred',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	const handleExportExcel = () => {
		if (!result) return

		const wb = XLSX.utils.book_new()

		if (result.errors.student_conflicts.length > 0) {
			const rows = result.errors.student_conflicts.flatMap(c =>
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
			XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Student Conflicts')
		}

		if (result.errors.qp_code_mismatches.length > 0) {
			const rows = result.errors.qp_code_mismatches.flatMap(q =>
				q.courses.map(c => ({
					'QP Code': q.qp_code,
					'Course Code': c.course_code,
					'Course Title': c.course_title,
					'Exam Date': c.exam_date,
					'Session': c.session,
				}))
			)
			XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'QP Code Mismatches')
		}

		if (result.warnings.unscheduled_courses.length > 0) {
			const seen = new Set<string>()
			const rows = result.warnings.unscheduled_courses.filter(u => {
				if (seen.has(u.course_code)) return false
				seen.add(u.course_code)
				return true
			}).map(u => ({
				'Course Code': u.course_code,
				'Course Title': u.course_title,
				'QP Code': u.qp_code,
			}))
			XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Unscheduled Courses')
		}

		if (result.warnings.incomplete_timetables.length > 0) {
			const rows = result.warnings.incomplete_timetables.map(t => ({
				'Course Code': t.course_code,
				'Course Title': t.course_title,
				'Missing Fields': t.missing_fields.join(', '),
			}))
			XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Incomplete Timetables')
		}

		const summaryRows = [
			{ Metric: 'Total Learners', Value: result.summary.total_students },
			{ Metric: 'Total Courses', Value: result.summary.total_courses },
			{ Metric: 'Timetable Entries', Value: result.summary.total_timetable_entries },
			{ Metric: 'Errors', Value: result.summary.errors_count },
			{ Metric: 'Warnings', Value: result.summary.warnings_count },
		]
		XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

		XLSX.writeFile(wb, 'timetable-validation-report.xlsx')
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader breadcrumbs={
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem><BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbLink asChild><Link href="/exam-management/exam-timetables">Exam Timetable</Link></BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>Validate Timetable</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				} />

				<div className="flex flex-1 flex-col gap-4 p-4">
					{/* Header */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
								<ShieldCheck className="h-5 w-5 text-blue-600" />
							</div>
							<div>
								<h1 className="text-lg font-bold">Validate Timetable</h1>
								<p className="text-xs text-muted-foreground">Check for scheduling conflicts, missing exams, and QP code mismatches</p>
							</div>
						</div>
					</div>

					{/* Filters */}
					<Card>
						<CardContent className="p-4">
							<div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
								{mustSelectInstitution && (
									<div className="space-y-1.5">
										<Label className="text-xs font-semibold">Institution <span className="text-red-500">*</span></Label>
										<Select value={selectedInstitutionId} onValueChange={(v) => { setSelectedInstitutionId(v); setSelectedSessionId(''); setResult(null) }}>
											<SelectTrigger className="h-9 text-xs">
												<SelectValue placeholder="Select Institution" />
											</SelectTrigger>
											<SelectContent>
												{institutions.map(inst => (
													<SelectItem key={inst.id} value={inst.id} className="text-xs">
														{inst.institution_code} - {inst.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}

								<div className="space-y-1.5">
									<Label className="text-xs font-semibold">Examination Session <span className="text-red-500">*</span></Label>
									<Select value={selectedSessionId} onValueChange={(v) => { setSelectedSessionId(v); setResult(null) }} disabled={!selectedInstitutionId}>
										<SelectTrigger className="h-9 text-xs">
											<SelectValue placeholder="Select Session" />
										</SelectTrigger>
										<SelectContent>
											{sessions.map(s => (
												<SelectItem key={s.id} value={s.id} className="text-xs">
													{s.session_name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div>
									<Button
										onClick={handleValidate}
										disabled={!selectedInstitutionId || !selectedSessionId || loading}
										className="gap-2 w-full"
									>
										{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
										{loading ? 'Validating...' : 'Run Validation'}
									</Button>
								</div>

								{result && hasAnyIssues(result) && (
									<div>
										<Button variant="outline" onClick={handleExportExcel} className="gap-2 w-full">
											<FileSpreadsheet className="h-4 w-4 text-green-600" />
											Export Report
										</Button>
									</div>
								)}
							</div>
						</CardContent>
					</Card>

					{/* Results */}
					{result && (
						<>
							{/* Summary Cards */}
							<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
								<Card className={result.summary.errors_count > 0 ? 'border-red-200 bg-red-50 dark:bg-red-950/20' : 'border-green-200 bg-green-50 dark:bg-green-950/20'}>
									<CardContent className="p-4 text-center">
										{result.summary.errors_count > 0 ? <XCircle className="h-6 w-6 text-red-500 mx-auto mb-1" /> : <CheckCircle className="h-6 w-6 text-green-500 mx-auto mb-1" />}
										<p className="text-2xl font-bold">{result.summary.errors_count}</p>
										<p className="text-xs text-muted-foreground">Errors</p>
									</CardContent>
								</Card>
								<Card className={result.summary.warnings_count > 0 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20' : 'border-green-200 bg-green-50 dark:bg-green-950/20'}>
									<CardContent className="p-4 text-center">
										{result.summary.warnings_count > 0 ? <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-1" /> : <CheckCircle className="h-6 w-6 text-green-500 mx-auto mb-1" />}
										<p className="text-2xl font-bold">{result.summary.warnings_count}</p>
										<p className="text-xs text-muted-foreground">Warnings</p>
									</CardContent>
								</Card>
								<Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
									<CardContent className="p-4 text-center">
										<p className="text-2xl font-bold">{result.summary.total_students}</p>
										<p className="text-xs text-muted-foreground">Learners</p>
									</CardContent>
								</Card>
								<Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20">
									<CardContent className="p-4 text-center">
										<p className="text-2xl font-bold">{result.summary.total_courses}</p>
										<p className="text-xs text-muted-foreground">Courses</p>
									</CardContent>
								</Card>
								<Card className="border-slate-200 bg-slate-50 dark:bg-slate-950/20">
									<CardContent className="p-4 text-center">
										<p className="text-2xl font-bold">{result.summary.total_timetable_entries}</p>
										<p className="text-xs text-muted-foreground">Timetable Entries</p>
									</CardContent>
								</Card>
							</div>

							{/* Rules Status */}
							{result.rules && result.rules.length > 0 && (
								<Card>
									<CardContent className="p-4">
										<h3 className="text-sm font-semibold mb-3">Validation Rules Status</h3>
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
											{result.rules.map(rule => (
												<div
													key={rule.rule}
													className={`flex items-center gap-3 rounded-lg border p-3 ${
														rule.status === 'passed'
															? 'border-green-200 bg-green-50 dark:bg-green-950/20'
															: rule.type === 'error'
																? 'border-red-200 bg-red-50 dark:bg-red-950/20'
																: 'border-amber-200 bg-amber-50 dark:bg-amber-950/20'
													}`}
												>
													{rule.status === 'passed' ? (
														<CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
													) : rule.type === 'error' ? (
														<XCircle className="h-5 w-5 text-red-500 shrink-0" />
													) : (
														<AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
													)}
													<div className="min-w-0">
														<div className="flex items-center gap-1.5">
															<Badge variant="outline" className="text-[10px] shrink-0">RULE {rule.rule}</Badge>
															{rule.status === 'failed' && (
																<span className="text-xs font-semibold text-muted-foreground">({rule.count})</span>
															)}
														</div>
														<p className="text-xs font-medium mt-0.5 truncate">{rule.name}</p>
													</div>
												</div>
											))}
										</div>
									</CardContent>
								</Card>
							)}

							{/* Success Message */}
							{!hasAnyIssues(result) && (
								<Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
									<CardContent className="p-6 flex items-center gap-4">
										<CheckCircle className="h-10 w-10 text-green-600 shrink-0" />
										<div>
											<h3 className="font-bold text-green-800 dark:text-green-200 text-lg">Timetable Validated Successfully</h3>
											<p className="text-sm text-green-700 dark:text-green-300">
												No conflicts found. All {result.summary.total_courses} courses are properly scheduled for {result.summary.total_students} learners.
												The timetable is ready for publishing.
											</p>
										</div>
									</CardContent>
								</Card>
							)}

							{/* Detailed Results */}
							{hasAnyIssues(result) && (
								<Card>
									<CardContent className="p-4">
										<Tabs defaultValue={result.summary.errors_count > 0 ? 'errors' : 'warnings'}>
											<TabsList className="mb-3">
												<TabsTrigger value="errors" className="gap-1.5">
													<XCircle className="h-3.5 w-3.5" />
													Errors ({result.summary.errors_count})
												</TabsTrigger>
												<TabsTrigger value="warnings" className="gap-1.5">
													<AlertTriangle className="h-3.5 w-3.5" />
													Warnings ({result.summary.warnings_count})
												</TabsTrigger>
											</TabsList>

											{/* Errors Tab */}
											<TabsContent value="errors" className="space-y-6">
												{result.errors.student_conflicts.length > 0 && (
													<div>
														<h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
															<Badge variant="destructive" className="text-[10px]">RULE 1</Badge>
															Student Exam Conflicts ({result.errors.student_conflicts.length})
														</h4>
														<p className="text-xs text-muted-foreground mb-2">
															These learners have multiple exams scheduled in the same date and session.
														</p>
														<div className="rounded-md border max-h-[400px] overflow-auto">
															<Table>
																<TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900/50">
																	<TableRow>
																		<TableHead className="text-xs">Register No</TableHead>
																		<TableHead className="text-xs">Name</TableHead>
																		<TableHead className="text-xs">Date</TableHead>
																		<TableHead className="text-xs">Session</TableHead>
																		<TableHead className="text-xs">Conflicting Courses</TableHead>
																	</TableRow>
																</TableHeader>
																<TableBody>
																	{result.errors.student_conflicts.map((c, idx) => (
																		<TableRow key={idx}>
																			<TableCell className="text-xs font-mono">{c.stu_register_no}</TableCell>
																			<TableCell className="text-xs">{c.student_name}</TableCell>
																			<TableCell className="text-xs">{c.exam_date}</TableCell>
																			<TableCell className="text-xs">
																				<Badge variant="outline" className="text-[10px]">{c.session}</Badge>
																			</TableCell>
																			<TableCell className="text-xs">
																				<div className="flex flex-wrap gap-1">
																					{c.courses.map(course => (
																						<Badge key={course.course_code} variant="secondary" className="text-[10px]">
																							{course.course_code}
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

												{result.errors.qp_code_mismatches.length > 0 && (
													<div>
														<h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
															<Badge variant="destructive" className="text-[10px]">RULE 3</Badge>
															QP Code Mismatches ({result.errors.qp_code_mismatches.length})
														</h4>
														<p className="text-xs text-muted-foreground mb-2">
															Courses with the same QP code are scheduled on different dates or sessions.
														</p>
														<div className="rounded-md border max-h-[400px] overflow-auto">
															<Table>
																<TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900/50">
																	<TableRow>
																		<TableHead className="text-xs">QP Code</TableHead>
																		<TableHead className="text-xs">Courses with Mismatched Schedules</TableHead>
																	</TableRow>
																</TableHeader>
																<TableBody>
																	{result.errors.qp_code_mismatches.map((m, idx) => (
																		<TableRow key={idx}>
																			<TableCell className="text-xs font-mono font-semibold">{m.qp_code}</TableCell>
																			<TableCell className="text-xs">
																				<div className="space-y-1">
																					{m.courses.map(c => (
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
													<div className="text-center py-8 text-muted-foreground">
														<CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-500" />
														<p className="font-medium">No errors found</p>
													</div>
												)}
											</TabsContent>

											{/* Warnings Tab */}
											<TabsContent value="warnings" className="space-y-6">
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
														<div className="rounded-md border max-h-[400px] overflow-auto">
															<Table>
																<TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900/50">
																	<TableRow>
																		<TableHead className="text-xs">Register No</TableHead>
																		<TableHead className="text-xs">Name</TableHead>
																		<TableHead className="text-xs">Course Code</TableHead>
																		<TableHead className="text-xs">Course Title</TableHead>
																		<TableHead className="text-xs">QP Code</TableHead>
																	</TableRow>
																</TableHeader>
																<TableBody>
																	{result.warnings.unscheduled_courses.slice(0, 200).map((u, idx) => (
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
														{result.warnings.unscheduled_courses.length > 200 && (
															<p className="text-xs text-muted-foreground mt-1">
																Showing first 200 of {result.warnings.unscheduled_courses.length}. Export Excel for full list.
															</p>
														)}
													</div>
												)}

												{result.warnings.incomplete_timetables.length > 0 && (
													<div>
														<h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
															<Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">RULE 5</Badge>
															Incomplete Timetable Entries ({result.warnings.incomplete_timetables.length})
														</h4>
														<div className="rounded-md border max-h-[400px] overflow-auto">
															<Table>
																<TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900/50">
																	<TableRow>
																		<TableHead className="text-xs">Course Code</TableHead>
																		<TableHead className="text-xs">Course Title</TableHead>
																		<TableHead className="text-xs">Missing Fields</TableHead>
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
													<div className="text-center py-8 text-muted-foreground">
														<CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-500" />
														<p className="font-medium">No warnings found</p>
													</div>
												)}
											</TabsContent>
										</Tabs>
									</CardContent>
								</Card>
							)}
						</>
					)}
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
