"use client"

import { useState, useEffect, useCallback } from "react"
import { useSessionSync } from '@/hooks/use-session-sync'
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { Check, ChevronsUpDown, Download, FileText, LayoutGrid, Shield, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

// =====================================================
// TYPES
// =====================================================

interface Institution {
	id: string
	institution_code: string
	institution_name: string
}

interface ExamSession {
	id: string
	session_name: string
}

interface Program {
	id: string
	program_code: string
	program_name: string
}

interface Semester {
	semester: number
	label: string
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function NADReportPage() {
	const { selectedSessionId: globalSessionId, setSelectedSessionId: setGlobalSessionId } = useSessionSync()
	const { toast } = useToast()
	const { hasAnyRole, hasPermission } = useAuth()
	const { isReady, appendToUrl, institutionId: contextInstitutionId, shouldFilter, mustSelectInstitution } = useInstitutionFilter()

	// NAD access: same logic as the dashboard used
	const canAccessNAD = hasAnyRole(['super_admin', 'coe', 'deputy_coe', 'nad_coordinator']) || hasPermission('nad.view')
	const canExportNAD = hasAnyRole(['super_admin', 'coe', 'deputy_coe', 'nad_coordinator']) || hasPermission('nad.export')

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExamSession[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [semesters, setSemesters] = useState<Semester[]>([])
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingSemesters, setLoadingSemesters] = useState(false)

	// Selected filter values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	// Session is mirrored from useSessionSync so it stays in sync with the
	// global session selector (when present). Writes still flow through
	// setGlobalSessionId so selecting a session here also updates the global.
	const selectedSessionId = globalSessionId || ""
	const setSelectedSessionId = setGlobalSessionId
	const [selectedProgramId, setSelectedProgramId] = useState<string>("")
	const [selectedSemesters, setSelectedSemesters] = useState<number[]>([])

	// Hide-when-global flags: if the institution or session was already
	// determined at a global level (header filter / session sync), hide
	// the corresponding in-page dropdown. Normal users with a locked-in
	// institution see just Program + Semester.
	const institutionIsGlobal = !mustSelectInstitution && !!contextInstitutionId
	const sessionIsGlobal = !!globalSessionId

	// Combobox open state
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [semesterOpen, setSemesterOpen] = useState(false)

	// Download-in-progress state (one per button so they can be clicked independently)
	const [downloadingOfficial, setDownloadingOfficial] = useState(false)
	const [downloadingPivot, setDownloadingPivot] = useState(false)

	const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
	const selectedProgram = programs.find(p => p.id === selectedProgramId)

	// =====================================================
	// DROPDOWN FETCHING — Institution → Session → Program → Semester
	// =====================================================

	// Load institutions once context is ready.
	// The exam-attendance dropdowns endpoint respects the institution-filter
	// query params (via appendToUrl), so normal users get just their own
	// institution and super_admins get the full list.
	useEffect(() => {
		if (!isReady) return

		let cancelled = false
		const fetchInstitutions = async () => {
			try {
				setLoadingInstitutions(true)
				const url = appendToUrl('/api/exam-management/exam-attendance/dropdowns?type=institutions')
				const res = await fetch(url)
				if (!res.ok) throw new Error('Failed to load institutions')
				const data = await res.json()
				if (cancelled) return

				setInstitutions(data)

				// Auto-select logic:
				// - If only one institution (normal user), pick it automatically.
				// - If super_admin with a specific institution chosen globally, pick that.
				if (data.length === 1) {
					setSelectedInstitutionId(data[0].id)
				} else if (shouldFilter && contextInstitutionId) {
					setSelectedInstitutionId(contextInstitutionId)
				} else if (!mustSelectInstitution && contextInstitutionId) {
					setSelectedInstitutionId(contextInstitutionId)
				}
			} catch (error) {
				if (cancelled) return
				console.error('Error fetching institutions:', error)
				toast({
					title: "Failed to load institutions",
					description: error instanceof Error ? error.message : "Unknown error",
					variant: "destructive"
				})
			} finally {
				if (!cancelled) setLoadingInstitutions(false)
			}
		}
		fetchInstitutions()
		return () => { cancelled = true }
	}, [isReady, appendToUrl, shouldFilter, contextInstitutionId, mustSelectInstitution, toast])

	// Institution → Sessions
	// Only clears the session when it's NOT globally-sourced (otherwise
	// picking a new institution on this page would nuke the header's
	// session sync for every other page).
	useEffect(() => {
		if (!selectedInstitutionId) {
			setSessions([])
			setPrograms([])
			setSemesters([])
			if (!sessionIsGlobal) setSelectedSessionId("")
			setSelectedProgramId("")
			setSelectedSemesters([])
			return
		}

		// Clear downstream state when institution changes
		if (!sessionIsGlobal) setSelectedSessionId("")
		setSelectedProgramId("")
		setSelectedSemesters([])
		setSessions([])
		setPrograms([])
		setSemesters([])

		let cancelled = false
		const fetchSessions = async () => {
			try {
				setLoadingSessions(true)
				const res = await fetch(`/api/grading/galley-report?type=sessions&institution_id=${selectedInstitutionId}`)
				if (res.ok) {
					const data = await res.json()
					if (!cancelled) setSessions(data)
				}
			} catch (error) {
				console.error('Error fetching sessions:', error)
			} finally {
				if (!cancelled) setLoadingSessions(false)
			}
		}
		fetchSessions()
		return () => { cancelled = true }
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedInstitutionId])

	// Session → Programs
	useEffect(() => {
		if (!selectedSessionId || !selectedInstitutionId) return

		setSelectedProgramId("")
		setSelectedSemesters([])
		setPrograms([])
		setSemesters([])

		let cancelled = false
		const fetchPrograms = async () => {
			try {
				setLoadingPrograms(true)
				const res = await fetch(`/api/grading/galley-report?type=programs&institution_id=${selectedInstitutionId}&session_id=${selectedSessionId}`)
				if (res.ok) {
					const data = await res.json()
					if (!cancelled) setPrograms(data)
				}
			} catch (error) {
				console.error('Error fetching programs:', error)
			} finally {
				if (!cancelled) setLoadingPrograms(false)
			}
		}
		fetchPrograms()
		return () => { cancelled = true }
	}, [selectedSessionId, selectedInstitutionId])

	// Program → Semesters
	useEffect(() => {
		if (!selectedProgramId || !selectedSessionId || !selectedInstitutionId) {
			setSemesters([])
			return
		}

		setSelectedSemesters([])

		let cancelled = false
		const fetchSemesters = async () => {
			try {
				setLoadingSemesters(true)
				const program = programs.find(p => p.id === selectedProgramId)
				const programCode = program?.program_code || selectedProgramId
				const res = await fetch(`/api/grading/galley-report?type=semesters&institution_id=${selectedInstitutionId}&session_id=${selectedSessionId}&program_id=${programCode}`)
				if (res.ok) {
					const data = await res.json()
					if (!cancelled) setSemesters(data)
				}
			} catch (error) {
				console.error('Error fetching semesters:', error)
			} finally {
				if (!cancelled) setLoadingSemesters(false)
			}
		}
		fetchSemesters()
		return () => { cancelled = true }
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedProgramId, selectedSessionId, selectedInstitutionId])

	// =====================================================
	// SEMESTER SELECTION HELPERS
	// =====================================================

	const handleSemesterToggle = (sem: number) => {
		setSelectedSemesters(prev =>
			prev.includes(sem) ? prev.filter(s => s !== sem) : [...prev, sem]
		)
	}

	const handleSelectAllSemesters = () => {
		setSelectedSemesters(semesters.map(s => s.semester))
	}

	const handleClearSemesters = () => {
		setSelectedSemesters([])
	}

	// =====================================================
	// DOWNLOAD HANDLERS
	// =====================================================

	const buildParams = useCallback(() => {
		const params = new URLSearchParams()
		if (selectedInstitutionId) params.set('institution_id', selectedInstitutionId)
		if (selectedSessionId) params.set('examination_session_id', selectedSessionId)
		// Export endpoints filter by fm.program_id (UUID). selectedProgramId
		// already holds the UUID from the galley-report response.
		if (selectedProgramId) params.set('program_id', selectedProgramId)
		if (selectedSemesters.length === 1) params.set('semester', String(selectedSemesters[0]))
		return params
	}, [selectedInstitutionId, selectedSessionId, selectedProgramId, selectedSemesters])

	// NAD ABC CSV Export (Official Upload Format - one row per subject)
	const handleExportNADCSV = useCallback(async () => {
		setDownloadingOfficial(true)
		toast({
			title: "Generating NAD CSV",
			description: "Preparing NAD/ABC compliant export file...",
			className: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200"
		})

		try {
			const response = await fetch(`/api/result-analytics/nad-csv-export?${buildParams().toString()}`)

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to generate NAD CSV export')
			}

			const contentType = response.headers.get('content-type')
			if (contentType?.includes('application/json')) {
				const data = await response.json()
				toast({
					title: "No Data Found",
					description: data.message || "No published results found for the selected filters",
					variant: "destructive"
				})
				return
			}

			const blob = await response.blob()
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `nad_abc_export_${new Date().toISOString().split('T')[0]}.csv`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)

			toast({
				title: "✅ Export Complete",
				description: "NAD/ABC CSV file has been downloaded successfully.",
				className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200"
			})
		} catch (error) {
			console.error('NAD CSV export error:', error)
			toast({
				title: "❌ Export Failed",
				description: error instanceof Error ? error.message : "Failed to generate NAD CSV export",
				variant: "destructive"
			})
		} finally {
			setDownloadingOfficial(false)
		}
	}, [buildParams, toast])

	// NAD Pivot CSV Export (Consolidated Format - one row per learner with SUB1-SUBn columns)
	const handleExportNADPivotCSV = useCallback(async () => {
		setDownloadingPivot(true)
		toast({
			title: "Generating NAD Pivot CSV",
			description: "Preparing pivot export (one row per learner with SUB columns)...",
			className: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200"
		})

		try {
			const response = await fetch(`/api/result-analytics/nad-pivot-export?${buildParams().toString()}`)

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to generate NAD Pivot CSV export')
			}

			const contentType = response.headers.get('content-type')
			if (contentType?.includes('application/json')) {
				const data = await response.json()
				toast({
					title: "No Data Found",
					description: data.message || "No published results found for the selected filters",
					variant: "destructive"
				})
				return
			}

			const blob = await response.blob()
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `nad_pivot_export_${new Date().toISOString().split('T')[0]}.csv`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)

			toast({
				title: "✅ Export Complete",
				description: "NAD Pivot CSV (one row per learner with SUB1-SUBn columns) downloaded.",
				className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200"
			})
		} catch (error) {
			console.error('NAD Pivot CSV export error:', error)
			toast({
				title: "❌ Export Failed",
				description: error instanceof Error ? error.message : "Failed to generate NAD Pivot CSV export",
				variant: "destructive"
			})
		} finally {
			setDownloadingPivot(false)
		}
	}, [buildParams, toast])

	// =====================================================
	// RENDER
	// =====================================================

	const hasRequiredFilters = selectedInstitutionId !== "" && selectedSessionId !== "" && selectedProgramId !== ""
	const canDownload = canExportNAD && hasRequiredFilters

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<div className="flex-1 space-y-6 p-4 md:p-8">
					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/">Home</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink>Reports</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>NAD Report</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page title */}
					<div className="flex items-center gap-3">
						<div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
							<Shield className="h-6 w-6 text-white" />
						</div>
						<div>
							<h1 className="text-2xl font-bold tracking-tight">NAD Report</h1>
							<p className="text-sm text-muted-foreground">Download NAD/ABC compliant CSV exports.</p>
						</div>
					</div>

					{/* Permission denied */}
					{!canAccessNAD && (
						<Card>
							<CardContent className="p-12 text-center">
								<AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
								<p className="text-sm text-muted-foreground">
									You do not have permission to access the NAD report.
								</p>
							</CardContent>
						</Card>
					)}

					{/* Filter bar */}
					{canAccessNAD && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Report Filters</CardTitle>
								<CardDescription>Pick an institution, examination session, and program to enable downloads.</CardDescription>
							</CardHeader>
							<CardContent className={cn(
								"grid grid-cols-1 gap-4",
								// Session is always shown now; column count depends only on whether
								// the institution filter is visible.
								institutionIsGlobal
									? "md:grid-cols-3"  // Session + Program + Semester
									: "md:grid-cols-2 lg:grid-cols-4"  // Institution + Session + Program + Semester
							)}>
								{/* Institution — hidden when it's already determined globally */}
								{!institutionIsGlobal && (
									<div className="space-y-2">
										<Label>Institution <span className="text-red-500">*</span></Label>
										<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
											<PopoverTrigger asChild>
												<Button variant="outline" role="combobox" className="w-full justify-between" disabled={loadingInstitutions}>
													<span className="truncate">
														{selectedInstitution
															? `${selectedInstitution.institution_code} - ${selectedInstitution.institution_name}`
															: loadingInstitutions ? "Loading..." : "Select institution"}
													</span>
													<ChevronsUpDown className="h-3 w-3 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search institution..." />
													<CommandList>
														<CommandEmpty>No institution found.</CommandEmpty>
														<CommandGroup>
															{institutions.map(i => (
																<CommandItem
																	key={i.id}
																	value={`${i.institution_code} ${i.institution_name}`}
																	onSelect={() => {
																		setSelectedInstitutionId(i.id)
																		setInstitutionOpen(false)
																	}}
																>
																	<Check className={cn("mr-2 h-4 w-4", selectedInstitutionId === i.id ? "opacity-100" : "opacity-0")} />
																	{i.institution_code} - {i.institution_name}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								)}

								{/* Examination Session — always shown so the session can be picked/overridden here */}
								{(
									<div className="space-y-2">
										<Label>Examination Session <span className="text-red-500">*</span></Label>
										<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													className="w-full justify-between"
													disabled={!selectedInstitutionId || loadingSessions}
												>
													<span className="truncate">
														{selectedSessionId
															? sessions.find(s => s.id === selectedSessionId)?.session_name
															: !selectedInstitutionId ? "Select institution first" : loadingSessions ? "Loading..." : "Select session"}
													</span>
													<ChevronsUpDown className="h-3 w-3 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search session..." />
													<CommandList>
														<CommandEmpty>No session found.</CommandEmpty>
														<CommandGroup>
															{sessions.map(s => (
																<CommandItem
																	key={s.id}
																	value={s.session_name}
																	onSelect={() => {
																		setSelectedSessionId(s.id)
																		setSessionOpen(false)
																	}}
																>
																	<Check className={cn("mr-2 h-4 w-4", selectedSessionId === s.id ? "opacity-100" : "opacity-0")} />
																	{s.session_name}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								)}

								{/* Program */}
								<div className="space-y-2">
									<Label>Program <span className="text-red-500">*</span></Label>
									<Popover open={programOpen} onOpenChange={setProgramOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												className="w-full justify-between"
												disabled={!selectedSessionId || loadingPrograms}
											>
												<span className="truncate">
													{selectedProgramId
														? `${selectedProgram?.program_code} - ${selectedProgram?.program_name}`
														: !selectedSessionId ? "Select session first" : loadingPrograms ? "Loading..." : "Select program"}
												</span>
												<ChevronsUpDown className="h-3 w-3 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search program..." />
												<CommandList>
													<CommandEmpty>No program found.</CommandEmpty>
													<CommandGroup>
														{programs.map(p => (
															<CommandItem
																key={p.id}
																value={`${p.program_code} ${p.program_name}`}
																onSelect={() => {
																	setSelectedProgramId(p.id)
																	setProgramOpen(false)
																}}
															>
																<Check className={cn("mr-2 h-4 w-4", selectedProgramId === p.id ? "opacity-100" : "opacity-0")} />
																{p.program_code} - {p.program_name}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Semester (optional multi) */}
								<div className="space-y-2">
									<Label>
										Semester <span className="text-xs text-muted-foreground">(Optional - Multi)</span>
									</Label>
									<Popover open={semesterOpen} onOpenChange={setSemesterOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												className="w-full justify-between"
												disabled={!selectedProgramId || loadingSemesters}
											>
												<span className="truncate">
													{selectedSemesters.length === 0
														? "All Semesters"
														: selectedSemesters.length === 1
															? `Sem ${selectedSemesters[0]}`
															: `${selectedSemesters.length} selected`}
												</span>
												<ChevronsUpDown className="h-3 w-3 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
											<Command>
												<CommandList>
													<CommandGroup>
														<CommandItem onSelect={handleSelectAllSemesters}>
															<Check className={cn("mr-2 h-4 w-4", selectedSemesters.length === semesters.length && semesters.length > 0 ? "opacity-100" : "opacity-0")} />
															Select All
														</CommandItem>
														<CommandItem onSelect={handleClearSemesters}>
															<Check className={cn("mr-2 h-4 w-4", selectedSemesters.length === 0 ? "opacity-100" : "opacity-0")} />
															Clear All
														</CommandItem>
													</CommandGroup>
													<CommandGroup>
														{semesters.map(sem => (
															<CommandItem
																key={sem.semester}
																onSelect={() => handleSemesterToggle(sem.semester)}
															>
																<Check className={cn("mr-2 h-4 w-4", selectedSemesters.includes(sem.semester) ? "opacity-100" : "opacity-0")} />
																{sem.label}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>
							</CardContent>

							{/* Selected semesters pills */}
							{selectedSemesters.length > 0 && (
								<CardContent className="pt-0">
									<div className="flex flex-wrap gap-1">
										<span className="text-xs text-muted-foreground mr-1">Selected:</span>
										{selectedSemesters.map(sem => (
											<Badge
												key={sem}
												variant="secondary"
												className="text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
												onClick={() => handleSemesterToggle(sem)}
											>
												Sem {sem} ×
											</Badge>
										))}
									</div>
								</CardContent>
							)}
						</Card>
					)}

					{/* Download buttons */}
					{canAccessNAD && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Download</CardTitle>
								<CardDescription>
									{canExportNAD
										? "Choose the export format for the NAD/ABC portal upload."
										: "You do not have the nad.export permission. Contact an administrator."}
								</CardDescription>
							</CardHeader>
							<CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Official CSV */}
								<div className="rounded-lg border p-4 space-y-3">
									<div className="flex items-center gap-2">
										<FileText className="h-5 w-5 text-blue-600" />
										<h3 className="font-semibold">NAD CSV (Official)</h3>
									</div>
									<p className="text-xs text-muted-foreground">
										24 fixed columns, one row per subject. Use for NAD portal audit uploads.
									</p>
									<Button
										onClick={handleExportNADCSV}
										disabled={!canDownload || downloadingOfficial}
										className="w-full"
										variant="outline"
									>
										{downloadingOfficial ? (
											<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
										) : (
											<><Download className="h-4 w-4 mr-2" /> Download NAD CSV</>
										)}
									</Button>
								</div>

								{/* Pivot CSV */}
								<div className="rounded-lg border p-4 space-y-3">
									<div className="flex items-center gap-2">
										<LayoutGrid className="h-5 w-5 text-violet-600" />
										<h3 className="font-semibold">NAD Pivot CSV</h3>
									</div>
									<p className="text-xs text-muted-foreground">
										One row per learner with SUB1..SUBn columns. Use for ABC portal bulk upload.
									</p>
									<Button
										onClick={handleExportNADPivotCSV}
										disabled={!canDownload || downloadingPivot}
										className="w-full"
									>
										{downloadingPivot ? (
											<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
										) : (
											<><Download className="h-4 w-4 mr-2" /> Download NAD Pivot CSV</>
										)}
									</Button>
								</div>
							</CardContent>
						</Card>
					)}
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
