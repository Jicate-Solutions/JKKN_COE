'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/common/use-toast'
import {
	Mail, Send, Users, Filter, CheckCircle2, AlertCircle, Loader2, Calendar, Clock, MapPin,
	GraduationCap, FileText, Search, ChevronRight, ArrowLeft,
} from 'lucide-react'
import type { Examiner, AppointmentType } from '@/types/examiner'
import { APPOINTMENT_TYPE_OPTIONS } from '@/types/examiner'

interface Board {
	id: string
	board_code: string
	board_name: string
	board_type?: string
}

export default function SendEmailPage() {
	const { toast } = useToast()

	// Data
	const [examiners, setExaminers] = useState<Examiner[]>([])
	const [boards, setBoards] = useState<Board[]>([])
	const [loading, setLoading] = useState(true)
	const [sending, setSending] = useState(false)

	// Selection state
	const [selectedExaminers, setSelectedExaminers] = useState<string[]>([])
	const [selectAll, setSelectAll] = useState(false)

	// Filter state
	const [boardFilter, setBoardFilter] = useState('all')
	const [searchTerm, setSearchTerm] = useState('')

	// Form state
	const [appointmentType, setAppointmentType] = useState<AppointmentType>('UG_VALUATION')
	const [appointmentDate, setAppointmentDate] = useState('')
	const [reportingTime, setReportingTime] = useState('09:00')
	const [venue, setVenue] = useState('')
	const [examName, setExamName] = useState('')
	const [subjectName, setSubjectName] = useState('')
	const [customMessage, setCustomMessage] = useState('')

	// Results
	const [sendResult, setSendResult] = useState<{
		sent: number
		failed: number
		errors: Array<{ email: string; error: string }>
	} | null>(null)

	// Fetch data
	useEffect(() => {
		fetchData()
	}, [])

	const fetchData = async () => {
		try {
			setLoading(true)
			const [examinersRes, boardsRes] = await Promise.all([
				fetch('/api/examiners?status=ACTIVE'),
				fetch('/api/master/boards'),
			])

			if (examinersRes.ok) {
				const data = await examinersRes.json()
				setExaminers(data)
			}

			if (boardsRes.ok) {
				const data = await boardsRes.json()
				setBoards(data)
			}
		} catch (error) {
			console.error('Error fetching data:', error)
		} finally {
			setLoading(false)
		}
	}

	// Filtered examiners
	const filteredExaminers = useMemo(() => {
		let data = examiners

		if (boardFilter !== 'all') {
			data = data.filter((e) =>
				e.boards?.some((b) => b.board_id === boardFilter && b.is_active)
			)
		}

		if (searchTerm) {
			const q = searchTerm.toLowerCase()
			data = data.filter((e) =>
				[e.full_name, e.email, e.department, e.institution_name]
					.filter(Boolean)
					.some((v) => String(v).toLowerCase().includes(q))
			)
		}

		return data
	}, [examiners, boardFilter, searchTerm])

	// Handle select all
	useEffect(() => {
		if (selectAll) {
			setSelectedExaminers(filteredExaminers.map((e) => e.id))
		} else if (selectedExaminers.length === filteredExaminers.length) {
			// Only clear if user unchecked select all
		}
	}, [selectAll, filteredExaminers])

	const handleSelectExaminer = (id: string, checked: boolean) => {
		if (checked) {
			setSelectedExaminers((prev) => [...prev, id])
		} else {
			setSelectedExaminers((prev) => prev.filter((i) => i !== id))
			setSelectAll(false)
		}
	}

	const handleSelectAll = (checked: boolean) => {
		setSelectAll(checked)
		if (checked) {
			setSelectedExaminers(filteredExaminers.map((e) => e.id))
		} else {
			setSelectedExaminers([])
		}
	}

	// Validation
	const canSend = selectedExaminers.length > 0 && appointmentDate && reportingTime && venue && examName

	// Send emails
	const handleSend = async () => {
		if (!canSend) {
			toast({
				title: '⚠️ Missing Information',
				description: 'Please fill all required fields and select at least one examiner.',
				variant: 'destructive',
			})
			return
		}

		try {
			setSending(true)
			setSendResult(null)

			const res = await fetch('/api/examiners/send-appointment', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					examiner_ids: selectedExaminers,
					appointment_type: appointmentType,
					board_id: boardFilter !== 'all' ? boardFilter : undefined,
					appointment_date: appointmentDate,
					reporting_time: reportingTime,
					venue,
					exam_name: examName,
					subject_name: subjectName,
					custom_message: customMessage,
				}),
			})

			const data = await res.json()

			if (!res.ok) {
				throw new Error(data.error || 'Failed to send emails')
			}

			setSendResult({
				sent: data.sent_count,
				failed: data.failed_count,
				errors: data.errors || [],
			})

			if (data.sent_count > 0) {
				toast({
					title: '✅ Emails Sent',
					description: `Successfully sent ${data.sent_count} appointment email(s).`,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
			}

			if (data.failed_count > 0) {
				toast({
					title: '⚠️ Some Emails Failed',
					description: `${data.failed_count} email(s) failed to send.`,
					variant: 'destructive',
				})
			}
		} catch (error) {
			toast({
				title: '❌ Send Failed',
				description: error instanceof Error ? error.message : 'Please try again.',
				variant: 'destructive',
			})
		} finally {
			setSending(false)
		}
	}

	const selectedBoard = boards.find((b) => b.id === boardFilter)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
						{/* Breadcrumb */}
						<div className="flex items-center gap-2">
							<Breadcrumb>
								<BreadcrumbList>
									<BreadcrumbItem>
										<BreadcrumbLink asChild>
											<Link href="/dashboard">Dashboard</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbLink asChild>
											<Link href="/exam-management/examiners">Examiners</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage>Send Appointment Email</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</div>

						<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
							{/* Left: Examiner Selection */}
							<div className="lg:col-span-2">
								<Card className="border-slate-200">
									<CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-xl">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-3">
												<div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
													<Users className="h-5 w-5" />
												</div>
												<div>
													<CardTitle className="text-lg">Select Examiners</CardTitle>
													<CardDescription className="text-blue-100">
														Choose examiners to send appointment emails
													</CardDescription>
												</div>
											</div>
											<Badge className="bg-white/20 text-white border-0">
												{selectedExaminers.length} selected
											</Badge>
										</div>
									</CardHeader>
									<CardContent className="p-4">
										{/* Filters */}
										<div className="flex flex-wrap gap-3 mb-4">
											<Select value={boardFilter} onValueChange={setBoardFilter}>
												<SelectTrigger className="w-[200px]">
													<SelectValue placeholder="Filter by Board" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="all">All Boards</SelectItem>
													{boards.map((board) => (
														<SelectItem key={board.id} value={board.id}>
															{board.board_name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>

											<div className="relative flex-1 min-w-[200px]">
												<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
												<Input
													value={searchTerm}
													onChange={(e) => setSearchTerm(e.target.value)}
													placeholder="Search examiners..."
													className="pl-8"
												/>
											</div>
										</div>

										{/* Examiner Table */}
										<div className="rounded-lg border border-slate-200 overflow-hidden">
											<Table>
												<TableHeader className="bg-slate-50">
													<TableRow>
														<TableHead className="w-12">
															<Checkbox
																checked={selectAll}
																onCheckedChange={handleSelectAll}
															/>
														</TableHead>
														<TableHead>Name</TableHead>
														<TableHead>Email</TableHead>
														<TableHead>Institution</TableHead>
														<TableHead>Type</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{loading ? (
														<TableRow>
															<TableCell colSpan={5} className="text-center py-8">
																<Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
															</TableCell>
														</TableRow>
													) : filteredExaminers.length === 0 ? (
														<TableRow>
															<TableCell colSpan={5} className="text-center py-8 text-gray-500">
																No examiners found
															</TableCell>
														</TableRow>
													) : (
														filteredExaminers.map((examiner) => (
															<TableRow key={examiner.id} className="hover:bg-slate-50">
																<TableCell>
																	<Checkbox
																		checked={selectedExaminers.includes(examiner.id)}
																		onCheckedChange={(c) => handleSelectExaminer(examiner.id, c as boolean)}
																	/>
																</TableCell>
																<TableCell>
																	<div>
																		<p className="font-medium">{examiner.full_name}</p>
																		<p className="text-xs text-gray-500">{examiner.designation}</p>
																	</div>
																</TableCell>
																<TableCell className="text-sm">{examiner.email}</TableCell>
																<TableCell className="text-sm max-w-[200px] truncate">
																	{examiner.institution_name || '-'}
																</TableCell>
																<TableCell>
																	<Badge variant="outline" className="text-xs">
																		{examiner.examiner_type}
																	</Badge>
																</TableCell>
															</TableRow>
														))
													)}
												</TableBody>
											</Table>
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Right: Email Configuration */}
							<div className="space-y-4">
								<Card className="border-slate-200">
									<CardHeader className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-t-xl">
										<div className="flex items-center gap-3">
											<div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
												<Mail className="h-5 w-5" />
											</div>
											<div>
												<CardTitle className="text-lg">Email Configuration</CardTitle>
												<CardDescription className="text-emerald-100">
													Set appointment details
												</CardDescription>
											</div>
										</div>
									</CardHeader>
									<CardContent className="p-4 space-y-4">
										{/* Appointment Type */}
										<div className="space-y-2">
											<Label className="flex items-center gap-2">
												<GraduationCap className="h-4 w-4 text-gray-500" />
												Appointment Type <span className="text-red-500">*</span>
											</Label>
											<Select value={appointmentType} onValueChange={(v) => setAppointmentType(v as AppointmentType)}>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{APPOINTMENT_TYPE_OPTIONS.map((opt) => (
														<SelectItem key={opt.value} value={opt.value}>
															{opt.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										{/* Exam Name */}
										<div className="space-y-2">
											<Label className="flex items-center gap-2">
												<FileText className="h-4 w-4 text-gray-500" />
												Examination Name <span className="text-red-500">*</span>
											</Label>
											<Input
												value={examName}
												onChange={(e) => setExamName(e.target.value)}
												placeholder="e.g., November 2024 Semester Exams"
											/>
										</div>

										{/* Date & Time */}
										<div className="grid grid-cols-2 gap-3">
											<div className="space-y-2">
												<Label className="flex items-center gap-2">
													<Calendar className="h-4 w-4 text-gray-500" />
													Date <span className="text-red-500">*</span>
												</Label>
												<Input
													type="date"
													value={appointmentDate}
													onChange={(e) => setAppointmentDate(e.target.value)}
												/>
											</div>
											<div className="space-y-2">
												<Label className="flex items-center gap-2">
													<Clock className="h-4 w-4 text-gray-500" />
													Time <span className="text-red-500">*</span>
												</Label>
												<Input
													type="time"
													value={reportingTime}
													onChange={(e) => setReportingTime(e.target.value)}
												/>
											</div>
										</div>

										{/* Venue */}
										<div className="space-y-2">
											<Label className="flex items-center gap-2">
												<MapPin className="h-4 w-4 text-gray-500" />
												Venue <span className="text-red-500">*</span>
											</Label>
											<Input
												value={venue}
												onChange={(e) => setVenue(e.target.value)}
												placeholder="e.g., Main Building, Room 101"
											/>
										</div>

										{/* Subject (Optional) */}
										<div className="space-y-2">
											<Label>Subject/Course (Optional)</Label>
											<Input
												value={subjectName}
												onChange={(e) => setSubjectName(e.target.value)}
												placeholder="For practical exams"
											/>
										</div>

										{/* Custom Message */}
										<div className="space-y-2">
											<Label>Additional Message (Optional)</Label>
											<Textarea
												value={customMessage}
												onChange={(e) => setCustomMessage(e.target.value)}
												placeholder="Any additional instructions..."
												rows={3}
											/>
										</div>

										{/* Send Button */}
										<Button
											onClick={handleSend}
											disabled={!canSend || sending}
											className="w-full bg-emerald-600 hover:bg-emerald-700 h-12"
										>
											{sending ? (
												<>
													<Loader2 className="h-5 w-5 mr-2 animate-spin" />
													Sending...
												</>
											) : (
												<>
													<Send className="h-5 w-5 mr-2" />
													Send to {selectedExaminers.length} Examiner(s)
												</>
											)}
										</Button>
									</CardContent>
								</Card>

								{/* Send Results */}
								{sendResult && (
									<Card className={sendResult.failed > 0 ? 'border-yellow-200 bg-yellow-50' : 'border-green-200 bg-green-50'}>
										<CardContent className="p-4">
											<div className="flex items-start gap-3">
												{sendResult.failed > 0 ? (
													<AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
												) : (
													<CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
												)}
												<div>
													<p className="font-semibold text-gray-900">
														{sendResult.failed > 0 ? 'Partial Success' : 'All Emails Sent'}
													</p>
													<p className="text-sm text-gray-600 mt-1">
														{sendResult.sent} sent, {sendResult.failed} failed
													</p>
													{sendResult.errors.length > 0 && (
														<div className="mt-2 text-sm">
															<p className="font-medium text-red-700">Failed:</p>
															{sendResult.errors.map((e, i) => (
																<p key={i} className="text-red-600">
																	{e.email}: {e.error}
																</p>
															))}
														</div>
													)}
												</div>
											</div>
										</CardContent>
									</Card>
								)}
							</div>
						</div>
					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
