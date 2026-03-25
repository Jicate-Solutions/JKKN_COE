"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import type { ExamRegistration, InstitutionOption, ExaminationSessionOption, CourseOfferingOption } from "@/types/exam-registrations"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { fetchInstitutions, fetchExaminationSessions, fetchCourseOfferings } from "@/services/exam-management/exam-registrations-service"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { PageTransition } from "@/components/common/page-transition"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import { Search, ChevronLeft, ChevronRight, ClipboardCheck, Filter, RefreshCw, ArrowRightLeft, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react"

interface LookupFilters {
	institutions_id: string
	examination_session_id: string
	program_code: string
	course_code: string
}

export default function ExamRegistrationsLookupPage() {
	const { toast } = useToast()

	// Institution filter integration
	const {
		isReady,
		mustSelectInstitution,
		institutionId,
		getInstitutionIdForCreate,
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<InstitutionOption[]>([])
	const [allExaminationSessions, setAllExaminationSessions] = useState<ExaminationSessionOption[]>([])
	const [allCourseOfferings, setAllCourseOfferings] = useState<CourseOfferingOption[]>([])

	// Cascading filter state
	const [filters, setFilters] = useState<LookupFilters>({
		institutions_id: '',
		examination_session_id: '',
		program_code: '',
		course_code: '',
	})

	// Lookup results
	const [registrations, setRegistrations] = useState<ExamRegistration[]>([])
	const [loading, setLoading] = useState(false)
	const [lookupPerformed, setLookupPerformed] = useState(false)

	// Selection state for bulk operations
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

	// Reassign sheet state
	const [reassignSheetOpen, setReassignSheetOpen] = useState(false)
	const [targetSessionId, setTargetSessionId] = useState('')
	const [reassignPreview, setReassignPreview] = useState<any>(null)
	const [reassigning, setReassigning] = useState(false)
	const [previewLoading, setPreviewLoading] = useState(false)

	// Pagination
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState<number>(50)

	// Search
	const [searchTerm, setSearchTerm] = useState("")

	// Load dropdown data
	useEffect(() => {
		const loadData = async () => {
			const [institutionsData, sessionsData, offeringsData] = await Promise.all([
				fetchInstitutions(),
				fetchExaminationSessions(),
				fetchCourseOfferings()
			])
			setInstitutions(institutionsData)
			setAllExaminationSessions(sessionsData)
			setAllCourseOfferings(offeringsData)
		}
		loadData()
	}, [])

	// Auto-set institution filter when ready
	useEffect(() => {
		if (isReady && institutionId && !mustSelectInstitution) {
			setFilters(prev => ({ ...prev, institutions_id: institutionId }))
		}
	}, [isReady, institutionId, mustSelectInstitution])

	// Cascading filter: sessions filtered by institution
	const filteredSessions = useMemo(() => {
		if (!filters.institutions_id) return allExaminationSessions
		return allExaminationSessions.filter(s => s.institutions_id === filters.institutions_id)
	}, [allExaminationSessions, filters.institutions_id])

	// Get unique program codes from course offerings (filtered by institution & session)
	const availableProgramCodes = useMemo(() => {
		let offerings = allCourseOfferings
		if (filters.institutions_id) {
			offerings = offerings.filter(c => c.institutions_id === filters.institutions_id)
		}
		if (filters.examination_session_id) {
			offerings = offerings.filter(c => c.examination_session_id === filters.examination_session_id)
		}
		const codes = [...new Set(offerings.map(c => c.program_code).filter(Boolean))]
		return codes.sort()
	}, [allCourseOfferings, filters.institutions_id, filters.examination_session_id])

	// Get unique course codes (filtered by institution, session, program)
	const availableCourseCodes = useMemo(() => {
		let offerings = allCourseOfferings
		if (filters.institutions_id) {
			offerings = offerings.filter(c => c.institutions_id === filters.institutions_id)
		}
		if (filters.examination_session_id) {
			offerings = offerings.filter(c => c.examination_session_id === filters.examination_session_id)
		}
		if (filters.program_code) {
			offerings = offerings.filter(c => c.program_code === filters.program_code)
		}
		const codes = [...new Set(offerings.map(c => c.course_code).filter(Boolean))]
		return codes.sort()
	}, [allCourseOfferings, filters.institutions_id, filters.examination_session_id, filters.program_code])

	// Clear dependent filters when parent changes
	const handleInstitutionChange = (value: string) => {
		setFilters({
			institutions_id: value,
			examination_session_id: '',
			program_code: '',
			course_code: '',
		})
		setLookupPerformed(false)
	}

	const handleSessionChange = (value: string) => {
		setFilters(prev => ({
			...prev,
			examination_session_id: value,
			program_code: '',
			course_code: '',
		}))
		setLookupPerformed(false)
	}

	const handleProgramChange = (value: string) => {
		setFilters(prev => ({
			...prev,
			program_code: value,
			course_code: '',
		}))
		setLookupPerformed(false)
	}

	const handleCourseChange = (value: string) => {
		setFilters(prev => ({ ...prev, course_code: value }))
		setLookupPerformed(false)
	}

	// Perform lookup
	const performLookup = useCallback(async () => {
		if (!filters.institutions_id) {
			toast({
				title: '⚠️ Institution Required',
				description: 'Please select an institution to search.',
				variant: 'destructive'
			})
			return
		}

		setLoading(true)
		setSelectedIds(new Set())

		try {
			const params = new URLSearchParams()
			if (filters.institutions_id) params.append('institutions_id', filters.institutions_id)
			if (filters.examination_session_id) params.append('examination_session_id', filters.examination_session_id)
			if (filters.program_code) params.append('program_code', filters.program_code)
			if (filters.course_code) params.append('course_code', filters.course_code)

			const response = await fetch(`/api/exam-management/exam-registrations/lookup?${params.toString()}`)
			if (!response.ok) {
				throw new Error('Lookup failed')
			}

			const result = await response.json()
			setRegistrations(result.data || [])
			setLookupPerformed(true)
			setCurrentPage(1)

			toast({
				title: '✅ Lookup Complete',
				description: `Found ${result.count || 0} registration(s).`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Lookup error:', error)
			toast({
				title: '❌ Lookup Failed',
				description: 'Failed to search registrations. Please try again.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}, [filters, toast])

	// Filter results by search term
	const filteredResults = useMemo(() => {
		if (!searchTerm) return registrations
		const q = searchTerm.toLowerCase()
		return registrations.filter(r => {
			const studentName = r.student_name?.toLowerCase() || ''
			const registerNo = r.stu_register_no?.toLowerCase() || ''
			const courseCode = r.course_offering?.course_code?.toLowerCase() || ''
			return studentName.includes(q) || registerNo.includes(q) || courseCode.includes(q)
		})
	}, [registrations, searchTerm])

	// Pagination
	const pageSizeOptions = useMemo(() => {
		const allSizes = [10, 20, 50, 100, 250, 500, 1000]
		const total = filteredResults.length
		const options = allSizes.filter(s => s < total)
		if (!options.includes(50)) options.unshift(50)
		if (total > 50) options.push(total)
		return options
	}, [filteredResults.length])
	const isShowAll = itemsPerPage >= filteredResults.length
	const effectivePerPage = isShowAll ? filteredResults.length || 1 : itemsPerPage
	const totalPages = Math.ceil(filteredResults.length / effectivePerPage) || 1
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = startIndex + effectivePerPage
	const pageItems = filteredResults.slice(startIndex, endIndex)

	// Selection handlers
	const toggleSelectAll = () => {
		if (selectedIds.size === pageItems.length) {
			setSelectedIds(new Set())
		} else {
			setSelectedIds(new Set(pageItems.map(r => r.id)))
		}
	}

	const toggleSelect = (id: string) => {
		const newSet = new Set(selectedIds)
		if (newSet.has(id)) {
			newSet.delete(id)
		} else {
			newSet.add(id)
		}
		setSelectedIds(newSet)
	}

	// Open reassign sheet and load preview
	const openReassignSheet = async () => {
		if (selectedIds.size === 0) {
			toast({
				title: '⚠️ No Selection',
				description: 'Please select registrations to reassign.',
				variant: 'destructive'
			})
			return
		}
		setReassignSheetOpen(true)
		setTargetSessionId('')
		setReassignPreview(null)
	}

	// Load reassign preview
	const loadReassignPreview = async () => {
		if (!targetSessionId || selectedIds.size === 0) return

		setPreviewLoading(true)
		try {
			const ids = [...selectedIds].join(',')
			const response = await fetch(`/api/exam-management/exam-registrations/reassign?ids=${ids}&new_session_id=${targetSessionId}`)
			if (!response.ok) throw new Error('Preview failed')
			const preview = await response.json()
			setReassignPreview(preview)
		} catch (error) {
			console.error('Preview error:', error)
			toast({
				title: '❌ Preview Failed',
				description: 'Could not load reassignment preview.',
				variant: 'destructive'
			})
		} finally {
			setPreviewLoading(false)
		}
	}

	// Execute reassignment
	const executeReassign = async () => {
		if (!targetSessionId || selectedIds.size === 0) return

		setReassigning(true)
		try {
			const response = await fetch('/api/exam-management/exam-registrations/reassign', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					registration_ids: [...selectedIds],
					new_examination_session_id: targetSessionId
				})
			})

			if (!response.ok) throw new Error('Reassign failed')

			const result = await response.json()

			toast({
				title: '✅ Reassignment Complete',
				description: `${result.results.success} succeeded, ${result.results.failed} failed, ${result.results.skipped} skipped.`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})

			setReassignSheetOpen(false)
			setSelectedIds(new Set())

			// Refresh lookup results
			performLookup()
		} catch (error) {
			console.error('Reassign error:', error)
			toast({
				title: '❌ Reassignment Failed',
				description: 'Could not reassign registrations.',
				variant: 'destructive'
			})
		} finally {
			setReassigning(false)
		}
	}

	// Get session name helper
	const getSessionName = (sessionId: string) => {
		const session = allExaminationSessions.find(s => s.id === sessionId)
		return session ? `${session.session_code} - ${session.session_name || ''}` : sessionId
	}

	// Get available target sessions (same institution, different from current filter)
	const availableTargetSessions = useMemo(() => {
		return filteredSessions.filter(s => s.id !== filters.examination_session_id)
	}, [filteredSessions, filters.examination_session_id])

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
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
											<Link href="/exam-management">Exam Management</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbLink asChild>
											<Link href="/exam-management/exam-registrations">Exam Registrations</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage>Registration Lookup</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</div>

						{/* Cascading Filter Card */}
						<Card>
							<CardHeader className="px-6 py-4 border-b">
								<div className="flex items-center gap-3">
									<div>
										<h2 className="text-base font-semibold">Registration Lookup</h2>
										<p className="text-xs text-muted-foreground">Filter by Institution, Session, Program, Course</p>
									</div>
								</div>
							</CardHeader>
							<CardContent className="p-6">
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
									{/* Institution Filter */}
									<div className="space-y-2">
										<Label className="text-xs font-medium">Institution *</Label>
										<Select
											value={filters.institutions_id}
											onValueChange={handleInstitutionChange}
											disabled={!mustSelectInstitution}
										>
											<SelectTrigger className="h-8 text-sm">
												<SelectValue placeholder="Select Institution" />
											</SelectTrigger>
											<SelectContent>
												{institutions.map(inst => (
													<SelectItem key={inst.id} value={inst.id}>
														{inst.institution_code} - {inst.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Session Filter */}
									<div className="space-y-2">
										<Label className="text-xs font-medium">Exam Session</Label>
										<Select
											value={filters.examination_session_id}
											onValueChange={handleSessionChange}
											disabled={!filters.institutions_id}
										>
											<SelectTrigger className="h-8 text-sm">
												<SelectValue placeholder="All Sessions" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="">All Sessions</SelectItem>
												{filteredSessions.map(session => (
													<SelectItem key={session.id} value={session.id}>
														{session.session_code} - {session.session_name || ''}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Program Filter */}
									<div className="space-y-2">
										<Label className="text-xs font-medium">Program Code</Label>
										<Select
											value={filters.program_code}
											onValueChange={handleProgramChange}
											disabled={!filters.institutions_id}
										>
											<SelectTrigger className="h-8 text-sm">
												<SelectValue placeholder="All Programs" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="">All Programs</SelectItem>
												{availableProgramCodes.map(code => (
													<SelectItem key={code} value={code!}>
														{code}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Course Filter */}
									<div className="space-y-2">
										<Label className="text-xs font-medium">Course Code</Label>
										<Select
											value={filters.course_code}
											onValueChange={handleCourseChange}
											disabled={!filters.institutions_id}
										>
											<SelectTrigger className="h-8 text-sm">
												<SelectValue placeholder="All Courses" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="">All Courses</SelectItem>
												{availableCourseCodes.map(code => (
													<SelectItem key={code} value={code!}>
														{code}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Search Button */}
									<div className="space-y-2">
										<Label className="text-xs font-medium opacity-0">Action</Label>
										<Button
											onClick={performLookup}
											disabled={!filters.institutions_id || loading}
											className="w-full h-8 text-sm"
										>
											{loading ? (
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											) : (
												<Search className="h-4 w-4 mr-2" />
											)}
											Search
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Results Card */}
						<TooltipProvider delayDuration={300}>
							<Card className="flex-1 flex flex-col min-h-0">
								<CardHeader className="flex-shrink-0 px-6 py-4 border-b">
									<div className="flex items-center justify-between">
										<div>
											<h2 className="text-base font-semibold">
												Lookup Results
												{lookupPerformed && <span className="ml-2 text-sm font-normal text-muted-foreground">({filteredResults.length} found)</span>}
											</h2>
											<p className="text-xs text-muted-foreground">{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select registrations to reassign'}</p>
										</div>

										<div className="flex items-center gap-2">
											{/* Search within results */}
											<div className="relative">
												<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
												<Input
													value={searchTerm}
													onChange={(e) => setSearchTerm(e.target.value)}
													placeholder="Filter results..."
													className="pl-8 h-8 text-sm w-[200px]"
												/>
											</div>

											{/* Reassign Button */}
											<Button
												variant="outline"
												size="sm"
												onClick={openReassignSheet}
												disabled={selectedIds.size === 0}
											>
												<ArrowRightLeft className="h-4 w-4 mr-2" />
												Reassign ({selectedIds.size})
											</Button>

											{/* Refresh */}
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="outline"
														size="sm"
														onClick={performLookup}
														disabled={loading || !lookupPerformed}
														className="h-8 w-8 p-0"
													>
														<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Refresh results</TooltipContent>
											</Tooltip>
										</div>
									</div>
								</CardHeader>

								<CardContent className="flex-1 overflow-auto p-0">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-muted/50">
											<TableRow>
												<TableHead className="w-12">
													<Checkbox
														checked={pageItems.length > 0 && selectedIds.size === pageItems.length}
														onCheckedChange={toggleSelectAll}
														disabled={pageItems.length === 0}
													/>
												</TableHead>
												<TableHead className="text-xs font-semibold">Register No</TableHead>
												<TableHead className="text-xs font-semibold">Learner Name</TableHead>
												<TableHead className="text-xs font-semibold">Session</TableHead>
												<TableHead className="text-xs font-semibold">Program</TableHead>
												<TableHead className="text-xs font-semibold">Course</TableHead>
												<TableHead className="text-xs font-semibold">Status</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{!lookupPerformed ? (
												<TableRow>
													<TableCell colSpan={7} className="h-32 text-center">
														<div className="flex flex-col items-center gap-2 text-muted-foreground">
															<Filter className="h-8 w-8 opacity-20" />
															<span className="text-sm">Use the filters above to search registrations</span>
														</div>
													</TableCell>
												</TableRow>
											) : loading ? (
												<TableRow>
													<TableCell colSpan={7} className="h-32 text-center">
														<div className="flex flex-col items-center gap-2 text-muted-foreground">
															<RefreshCw className="h-5 w-5 animate-spin" />
															<span className="text-sm">Loading...</span>
														</div>
													</TableCell>
												</TableRow>
											) : pageItems.length === 0 ? (
												<TableRow>
													<TableCell colSpan={7} className="h-32 text-center">
														<div className="flex flex-col items-center gap-2 text-muted-foreground">
															<ClipboardCheck className="h-8 w-8 opacity-20" />
															<span className="text-sm">No registrations found</span>
														</div>
													</TableCell>
												</TableRow>
											) : (
												pageItems.map(row => (
													<TableRow key={row.id}>
														<TableCell>
															<Checkbox
																checked={selectedIds.has(row.id)}
																onCheckedChange={() => toggleSelect(row.id)}
															/>
														</TableCell>
														<TableCell className="text-sm font-medium font-mono">
															{row.stu_register_no || '-'}
														</TableCell>
														<TableCell className="text-sm">
															{row.student_name || '-'}
														</TableCell>
														<TableCell className="text-sm">
															<Badge variant="outline" className="font-mono">
																{row.examination_session?.session_code || '-'}
															</Badge>
														</TableCell>
														<TableCell className="text-sm">
															{row.course_offering?.program_code || '-'}
														</TableCell>
														<TableCell className="text-sm">
															{row.course_offering?.course_code || '-'}
															<br />
															<span className="text-xs text-muted-foreground">
																{row.course_offering?.course_name || ''}
															</span>
														</TableCell>
														<TableCell>
															<Badge
																variant={row.registration_status === 'Approved' ? 'default' : 'secondary'}
																className={`text-xs ${
																	row.registration_status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
																	row.registration_status === 'Pending' ? 'bg-amber-100 text-amber-700' :
																	'bg-slate-100 text-slate-700'
																}`}
															>
																{row.registration_status}
															</Badge>
														</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>

									{/* Pagination */}
									{lookupPerformed && (
										<div className="flex items-center justify-between pt-3 px-4 pb-3 border-t">
											<div className="flex items-center gap-3">
												<p className="text-sm text-muted-foreground tabular-nums">
													{filteredResults.length === 0 ? 'No results' :
														`${startIndex + 1}\u2013${Math.min(endIndex, filteredResults.length)} of ${filteredResults.length}`}
												</p>
												<div className="flex items-center gap-1.5">
													<span className="text-xs text-muted-foreground">Rows</span>
													<Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
														<SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
														<SelectContent>
															{pageSizeOptions.map((size) => (
																<SelectItem key={size} value={String(size)}>
																	{size === filteredResults.length ? 'All' : size}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
											</div>
											<div className="flex items-center gap-1">
												<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 w-7 p-0">
													<ChevronLeft className="h-3.5 w-3.5" />
												</Button>
												<span className="text-xs text-muted-foreground px-2 tabular-nums">{currentPage} / {totalPages}</span>
												<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="h-7 w-7 p-0">
													<ChevronRight className="h-3.5 w-3.5" />
												</Button>
											</div>
										</div>
									)}
								</CardContent>
							</Card>
						</TooltipProvider>
					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>

			{/* Reassign Sheet */}
			<Sheet open={reassignSheetOpen} onOpenChange={setReassignSheetOpen}>
				<SheetContent className="sm:max-w-[600px] overflow-y-auto">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle className="text-lg font-semibold">Reassign Registrations</SheetTitle>
						<p className="text-sm text-muted-foreground">Move {selectedIds.size} selected registration(s) to a different exam session.</p>
					</SheetHeader>

					<div className="space-y-6 py-6">
						{/* Target Session Selection */}
						<div className="space-y-2">
							<Label className="text-sm font-medium">Target Exam Session *</Label>
							<Select value={targetSessionId} onValueChange={setTargetSessionId}>
								<SelectTrigger className="h-10 rounded-lg">
									<SelectValue placeholder="Select target session" />
								</SelectTrigger>
								<SelectContent>
									{availableTargetSessions.map(session => (
										<SelectItem key={session.id} value={session.id}>
											{session.session_code} - {session.session_name || ''}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Preview Button */}
						{targetSessionId && (
							<Button
								variant="outline"
								onClick={loadReassignPreview}
								disabled={previewLoading}
								className="w-full"
							>
								{previewLoading ? (
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								) : (
									<Search className="h-4 w-4 mr-2" />
								)}
								Preview Changes
							</Button>
						)}

						{/* Preview Results */}
						{reassignPreview && (
							<div className="space-y-4">
								<div className="grid grid-cols-3 gap-3">
									<Card className="p-3 bg-emerald-50 border-emerald-200">
										<div className="flex items-center gap-2">
											<CheckCircle2 className="h-4 w-4 text-emerald-600" />
											<span className="text-sm font-medium text-emerald-700">
												{reassignPreview.summary.will_succeed} Will Succeed
											</span>
										</div>
									</Card>
									<Card className="p-3 bg-red-50 border-red-200">
										<div className="flex items-center gap-2">
											<XCircle className="h-4 w-4 text-red-600" />
											<span className="text-sm font-medium text-red-700">
												{reassignPreview.summary.will_fail} Will Fail
											</span>
										</div>
									</Card>
									<Card className="p-3 bg-slate-50 border-slate-200">
										<div className="flex items-center gap-2">
											<AlertTriangle className="h-4 w-4 text-slate-600" />
											<span className="text-sm font-medium text-slate-700">
												{reassignPreview.summary.total} Total
											</span>
										</div>
									</Card>
								</div>

								{/* Preview Table */}
								<div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
									<Table>
										<TableHeader className="bg-muted/50 sticky top-0">
											<TableRow>
												<TableHead className="text-xs">Register No</TableHead>
												<TableHead className="text-xs">Current Session</TableHead>
												<TableHead className="text-xs">Status</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{reassignPreview.preview.map((item: any) => (
												<TableRow key={item.id} className="text-xs">
													<TableCell className="font-mono">{item.stu_register_no}</TableCell>
													<TableCell>{item.current_session}</TableCell>
													<TableCell>
														{item.will_succeed ? (
															<Badge className="bg-emerald-100 text-emerald-700 text-xs">
																Ready
															</Badge>
														) : (
															<Badge className="bg-red-100 text-red-700 text-xs">
																{item.reason}
															</Badge>
														)}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							</div>
						)}
					</div>

					<SheetFooter>
						<Button
							variant="outline"
							onClick={() => setReassignSheetOpen(false)}
							disabled={reassigning}
						>
							Cancel
						</Button>
						<Button
							onClick={executeReassign}
							disabled={!targetSessionId || reassigning || (reassignPreview && reassignPreview.summary.will_succeed === 0)}
							className="bg-amber-600 hover:bg-amber-700 text-white"
						>
							{reassigning ? (
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
							) : (
								<ArrowRightLeft className="h-4 w-4 mr-2" />
							)}
							Reassign {reassignPreview?.summary.will_succeed || selectedIds.size} Registrations
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</SidebarProvider>
	)
}
