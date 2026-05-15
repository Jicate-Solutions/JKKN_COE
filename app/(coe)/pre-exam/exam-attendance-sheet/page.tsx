"use client"

import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/common/use-toast"
import { Loader2, Check, ChevronsUpDown, ClipboardList, Download, FileText, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useSessionSync } from "@/hooks/use-session-sync"
import {
	fetchSessions as fetchSessionsService,
	fetchExamDates as fetchExamDatesService,
	fetchSessionTypes as fetchSessionTypesService,
	fetchAttendanceSheetData,
} from "@/services/pre-exam/exam-attendance-sheet-service"
import { generateExamAttendanceSheetPDF } from "@/lib/utils/generate-exam-attendance-sheet-pdf"
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SeatingArrangementTab } from '@/components/pre-exam/seating-arrangement-tab'
import type { SeatingRoom } from '@/types/seating-allocation'

interface ExaminationSession {
	id: string
	session_name: string
	session_code: string
}

interface ExamDateOption {
	exam_date: string
}

interface SessionTypeOption {
	session: string
}

export default function ExamAttendanceSheetPage() {
	const { toast } = useToast()

	// Global institution filter — institution comes from the header dropdown
	const {
		isReady,
		institutionId,
		mustSelectInstitution,
	} = useInstitutionFilter()

	// Dropdown data
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [examDates, setExamDates] = useState<ExamDateOption[]>([])
	const [sessionTypes, setSessionTypes] = useState<SessionTypeOption[]>([])

	// Selected values
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [selectedExamDate, setSelectedExamDate] = useState<string>("")
	const [selectedSessionType, setSelectedSessionType] = useState<string>("")

	// Practical batch selection
	const [practicalBatches, setPracticalBatches] = useState<any[]>([])
	const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set())
	const [batchSearch, setBatchSearch] = useState('')

	// Rooms (used by seating arrangement tab — fetched at parent so the
	// "Start From Room" dropdown can sit in the top filter row)
	const [rooms, setRooms] = useState<SeatingRoom[]>([])
	const [loadingRooms, setLoadingRooms] = useState(false)
	const [startingRoomId, setStartingRoomId] = useState<string>('') // empty = start from first room

	// Active tab — the Start From Room dropdown is only meaningful for seating
	const [activeTab, setActiveTab] = useState<string>('attendance-sheet')

	// Loading states
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingDates, setLoadingDates] = useState(false)
	const [loadingSessionTypes, setLoadingSessionTypes] = useState(false)
	const [generating, setGenerating] = useState(false)
	const [progressText, setProgressText] = useState('')
	const [progressPercent, setProgressPercent] = useState(0)

	// Popover open states
	const [sessionOpen, setSessionOpen] = useState(false)
	const [examDateOpen, setExamDateOpen] = useState(false)

	// When global institution changes → reset and load sessions + rooms
	useEffect(() => {
		// Reset all downstream selections
		setSelectedSessionId("")
		setSelectedExamDate("")
		setSelectedSessionType("")
		setSessions([])
		setExamDates([])
		setSessionTypes([])
		setRooms([])
		setStartingRoomId('')

		if (isReady && institutionId) {
			loadSessions(institutionId)
			loadRooms(institutionId)
		}
	}, [isReady, institutionId])

	const loadSessions = async (instId: string) => {
		try {
			setLoadingSessions(true)
			const data = await fetchSessionsService(instId)
			setSessions(data)
		} catch (error) {
			console.error('Error fetching sessions:', error)
		} finally {
			setLoadingSessions(false)
		}
	}

	const loadRooms = async (instId: string) => {
		try {
			setLoadingRooms(true)
			const res = await fetch(`/api/pre-exam/seating/rooms?institutions_id=${instId}`)
			if (!res.ok) throw new Error('Failed to fetch rooms')
			const data: SeatingRoom[] = await res.json()
			setRooms(Array.isArray(data) ? data : [])
		} catch (error) {
			console.error('Error fetching rooms:', error)
			setRooms([])
		} finally {
			setLoadingRooms(false)
		}
	}

	// Session → Exam Dates
	useEffect(() => {
		if (selectedSessionId && institutionId) {
			setSelectedExamDate("")
			setSelectedSessionType("")
			setExamDates([])
			setSessionTypes([])
			loadExamDates(institutionId, selectedSessionId)
		}
	}, [selectedSessionId])

	const loadExamDates = async (instId: string, sessionId: string) => {
		try {
			setLoadingDates(true)
			const data = await fetchExamDatesService(instId, sessionId)
			setExamDates(data)
		} catch (error) {
			console.error('Error fetching exam dates:', error)
		} finally {
			setLoadingDates(false)
		}
	}

	// Exam Date → Session Types (FN/AN)
	useEffect(() => {
		if (selectedExamDate && institutionId && selectedSessionId) {
			setSelectedSessionType("")
			setSessionTypes([])
			loadSessionTypes(institutionId, selectedSessionId, selectedExamDate)
		}
	}, [selectedExamDate])

	const loadSessionTypes = async (instId: string, sessionId: string, examDate: string) => {
		try {
			setLoadingSessionTypes(true)
			const data = await fetchSessionTypesService(instId, sessionId, examDate)
			setSessionTypes(data)
			if (data.length === 1) {
				setSelectedSessionType(data[0].session)
			}
		} catch (error) {
			console.error('Error fetching session types:', error)
		} finally {
			setLoadingSessionTypes(false)
		}
	}

	// When session type changes, check for practical batches
	useEffect(() => {
		setPracticalBatches([])
		setSelectedBatchIds(new Set())
		setBatchSearch('')

		if (selectedSessionType && selectedExamDate && selectedSessionId && institutionId) {
			fetch(
				`/api/pre-exam/exam-attendance-sheet/batches?institution_id=${institutionId}&examination_session_id=${selectedSessionId}&exam_date=${selectedExamDate}&session=${selectedSessionType}`
			)
				.then(res => res.json())
				.then(data => {
					if (Array.isArray(data) && data.length > 0) {
						setPracticalBatches(data)
					} else {
						setPracticalBatches([])
					}
				})
				.catch(() => setPracticalBatches([]))
		}
	}, [selectedSessionType, selectedExamDate, selectedSessionId, institutionId])

	// Generate PDF
	const handleGeneratePDF = async () => {
		if (!institutionId || !selectedSessionId || !selectedExamDate || !selectedSessionType) {
			toast({ title: '❌ Missing Selection', description: 'Please select all filters before generating.', variant: 'destructive' })
			return
		}

		try {
			setGenerating(true)
			setProgressPercent(0)
			setProgressText('Fetching data...')

			// Yield to let UI update
			await new Promise(r => setTimeout(r, 0))

			let pdfData: any = null
			let totalStudentCount = 0
			let totalSheetCount = 0
			let hasPractical = false

			const batchIdsToProcess = selectedBatchIds.size > 0 ? Array.from(selectedBatchIds) : [undefined]

			for (let i = 0; i < batchIdsToProcess.length; i++) {
				const batchId = batchIdsToProcess[i]
				setProgressText(`Fetching data (${i + 1}/${batchIdsToProcess.length})...`)
				await new Promise(r => setTimeout(r, 0))

				const response = await fetchAttendanceSheetData(
					institutionId,
					selectedSessionId,
					selectedExamDate,
					selectedSessionType,
					batchId
				)

				if (response.success && response.data && response.data.sheets.length > 0) {
					if (!pdfData) {
						pdfData = response.data
					} else {
						pdfData.sheets.push(...response.data.sheets)
					}
					totalStudentCount += response.total_students || 0
					totalSheetCount += response.total_sheets || response.data.sheets.length
					if (batchId) hasPractical = true
				}
			}

			if (!pdfData || pdfData.sheets.length === 0) {
				toast({ title: '❌ No Data', description: 'No exam registrations found for the selected criteria.', variant: 'destructive' })
				return
			}

			setProgressPercent(10)
			setProgressText('Loading logos...')
			await new Promise(r => setTimeout(r, 0))

			// Set exam_type for signature label changes (practical/project use different labels)
			if (hasPractical) {
				pdfData.exam_type = 'Practical'
			}
			const defaultLogoUrl = '/jkkn_logo.png'
			const defaultSecondaryLogoUrl = '/jkkncas_logo.png'

			const logoUrl = pdfData.logo_image || defaultLogoUrl
			try {
				const logoRes = await fetch(logoUrl)
				if (logoRes.ok) {
					const blob = await logoRes.blob()
					pdfData.logo_image = await blobToBase64(blob)
				}
			} catch { /* continue without logo */ }

			const rightLogoUrl = pdfData.right_logo_image || defaultSecondaryLogoUrl
			try {
				const logoRes = await fetch(rightLogoUrl)
				if (logoRes.ok) {
					const blob = await logoRes.blob()
					pdfData.right_logo_image = await blobToBase64(blob)
				}
			} catch { /* continue without logo */ }

			// Convert student photo URLs to base64 (parallel batches)
			const allStudents = pdfData.sheets.flatMap(sheet => sheet.students)
			const studentsWithPhotos = allStudents.filter(s => s.student_photo_url)
			const totalPhotos = studentsWithPhotos.length
			const BATCH_SIZE = 30
			let photosProcessed = 0

			setProgressText(`Loading photos (0/${totalPhotos})...`)
			setProgressPercent(15)
			await new Promise(r => setTimeout(r, 0))

			for (let i = 0; i < studentsWithPhotos.length; i += BATCH_SIZE) {
				const batch = studentsWithPhotos.slice(i, i + BATCH_SIZE)
				await Promise.all(batch.map(async (student) => {
					try {
						const photoRes = await fetch(student.student_photo_url!)
						if (photoRes.ok) {
							const blob = await photoRes.blob()
							student.student_photo_url = await blobToBase64(blob)
						} else {
							student.student_photo_url = null
						}
					} catch {
						student.student_photo_url = null
					}
				}))
				photosProcessed = Math.min(i + BATCH_SIZE, totalPhotos)
				const photoProgress = 15 + Math.round((photosProcessed / totalPhotos) * 70)
				setProgressPercent(photoProgress)
				setProgressText(`Loading photos (${photosProcessed}/${totalPhotos})...`)
				// Yield to UI so progress bar updates and screen doesn't freeze
				await new Promise(r => setTimeout(r, 0))
			}

			setProgressPercent(90)
			setProgressText('Generating PDF...')
			await new Promise(r => setTimeout(r, 0))

			generateExamAttendanceSheetPDF(pdfData)

			setProgressPercent(100)
			setProgressText('Done!')

			toast({
				title: '✅ PDF Generated',
				description: `${totalSheetCount} sheet(s) with ${totalStudentCount} total students.`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (error: any) {
			console.error('Error generating PDF:', error)
			toast({ title: '❌ Generation Failed', description: error.message || 'Failed to generate attendance sheet PDF.', variant: 'destructive' })
		} finally {
			setGenerating(false)
			setProgressPercent(0)
			setProgressText('')
		}
	}

	const formatExamDate = (dateStr: string): string => {
		if (!dateStr) return ''
		try {
			const date = new Date(dateStr)
			if (isNaN(date.getTime())) return dateStr
			return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`
		} catch {
			return dateStr
		}
	}

	const isFormComplete = !!(institutionId && selectedSessionId && selectedExamDate && selectedSessionType)
	const needsInstitution = mustSelectInstitution && !institutionId

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader>
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem><BreadcrumbLink asChild><Link href="/dashboard">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>Pre-Exam</BreadcrumbPage></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>Exam Preparation</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex flex-1 flex-col gap-4 p-4">
					{/* Page Header */}
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
							<ClipboardList className="h-5 w-5 text-primary" />
						</div>
						<div className="min-w-0">
							<h1 className="text-xl sm:text-2xl font-bold leading-tight">Exam Preparation</h1>
							<p className="text-xs sm:text-sm text-muted-foreground">Generate attendance sheets and seating arrangements</p>
						</div>
					</div>

					{/* Prompt to select institution from global filter */}
					{needsInstitution && (
						<Card className="border-amber-200 bg-amber-50">
							<CardContent className="pt-6">
								<p className="text-sm text-amber-800">Please select an institution from the global filter in the header to proceed.</p>
							</CardContent>
						</Card>
					)}

					{/* Tabs — only show when institution is selected */}
					{!needsInstitution && (
						<Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
							<TabsList
								className="w-fit h-11 rounded-xl border border-slate-200/70 bg-gradient-to-r from-indigo-50 via-white to-sky-50 p-1.5 shadow-sm"
							>
								<TabsTrigger
									value="attendance-sheet"
									className="gap-1.5 rounded-lg px-3 sm:px-4 py-1.5 text-sm font-medium text-slate-600 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-violet-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-indigo-500/30 hover:text-slate-900"
								>
									<FileText className="h-4 w-4 shrink-0" />
									<span className="hidden xs:inline sm:inline">Attendance</span>
									<span className="hidden sm:inline"> Sheet</span>
								</TabsTrigger>
								<TabsTrigger
									value="seating-arrangement"
									className="gap-1.5 rounded-lg px-3 sm:px-4 py-1.5 text-sm font-medium text-slate-600 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-emerald-500/30 hover:text-slate-900"
								>
									<LayoutGrid className="h-4 w-4 shrink-0" />
									<span className="hidden xs:inline sm:inline">Seating</span>
									<span className="hidden sm:inline"> Arrangement</span>
								</TabsTrigger>
							</TabsList>

							{/* Shared Filter Card */}
							<Card>
								<CardHeader>
									<CardTitle className="text-base">Select Exam Details</CardTitle>
								</CardHeader>
								<CardContent>
									<div className={cn(
									"grid grid-cols-1 gap-4",
									activeTab === 'seating-arrangement' ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3",
									generating && "opacity-50 pointer-events-none"
								)}>
										{/* Exam Session Dropdown */}
										{mustSelectSession && (
										<div className="space-y-2">
											<Label>Exam Session</Label>
											<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
												<PopoverTrigger asChild>
													<Button
														variant="outline"
														role="combobox"
														aria-expanded={sessionOpen}
														className="w-full justify-between font-normal"
														disabled={!institutionId || loadingSessions || generating}
													>
														{loadingSessions ? (
															<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...</>
														) : selectedSessionId ? (
															sessions.find(s => s.id === selectedSessionId)?.session_name || "Select..."
														) : (
															"Select session..."
														)}
														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[400px] p-0">
													<Command>
														<CommandInput placeholder="Search session..." />
														<CommandList>
															<CommandEmpty>No session found.</CommandEmpty>
															<CommandGroup>
																{sessions.map(session => (
																	<CommandItem
																		key={session.id}
																		value={session.session_name}
																		onSelect={() => {
																			setSelectedSessionId(session.id)
																			setSessionOpen(false)
																		}}
																	>
																		<Check className={cn("mr-2 h-4 w-4", selectedSessionId === session.id ? "opacity-100" : "opacity-0")} />
																		{session.session_name}
																	</CommandItem>
																))}
															</CommandGroup>
														</CommandList>
													</Command>
												</PopoverContent>
											</Popover>
										</div>
										)}

										{/* Exam Date Dropdown */}
										<div className="space-y-2">
											<Label>Exam Date</Label>
											<Popover open={examDateOpen} onOpenChange={setExamDateOpen}>
												<PopoverTrigger asChild>
													<Button
														variant="outline"
														role="combobox"
														aria-expanded={examDateOpen}
														className="w-full justify-between font-normal"
														disabled={!selectedSessionId || loadingDates || generating}
													>
														{loadingDates ? (
															<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...</>
														) : selectedExamDate ? (
															formatExamDate(selectedExamDate)
														) : (
															"Select date..."
														)}
														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[300px] p-0">
													<Command>
														<CommandInput placeholder="Search date..." />
														<CommandList>
															<CommandEmpty>No dates found.</CommandEmpty>
															<CommandGroup>
																{examDates.map(d => (
																	<CommandItem
																		key={d.exam_date}
																		value={d.exam_date}
																		onSelect={() => {
																			setSelectedExamDate(d.exam_date)
																			setExamDateOpen(false)
																		}}
																	>
																		<Check className={cn("mr-2 h-4 w-4", selectedExamDate === d.exam_date ? "opacity-100" : "opacity-0")} />
																		{formatExamDate(d.exam_date)}
																	</CommandItem>
																))}
															</CommandGroup>
														</CommandList>
													</Command>
												</PopoverContent>
											</Popover>
										</div>

										{/* Session Type (FN/AN) */}
										<div className="space-y-2">
											<Label>Session (FN/AN)</Label>
											<Select
												value={selectedSessionType}
												onValueChange={setSelectedSessionType}
												disabled={!selectedExamDate || loadingSessionTypes || generating}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder={loadingSessionTypes ? "Loading..." : "Select session..."} />
												</SelectTrigger>
												<SelectContent>
													{sessionTypes.map(st => (
														<SelectItem key={st.session} value={st.session}>
															{st.session === 'FN' ? 'FN (Forenoon)' : st.session === 'AN' ? 'AN (Afternoon)' : st.session}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										{/* Start From Room — only for seating tab.
										    Rooms before the chosen room are skipped for roll-number allotment. */}
										{activeTab === 'seating-arrangement' && (
											<div className="space-y-2">
												<Label>Start From Room</Label>
												<Select
													value={startingRoomId || '__auto__'}
													onValueChange={(v) => setStartingRoomId(v === '__auto__' ? '' : v)}
													disabled={!institutionId || loadingRooms || generating}
												>
													<SelectTrigger className="w-full">
														<SelectValue placeholder={loadingRooms ? "Loading..." : "Auto (first room)"} />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="__auto__">Auto (first room)</SelectItem>
														{rooms.map(r => (
															<SelectItem key={r.id} value={r.id}>
																{r.room_code}{r.building ? ` — ${r.building}${r.floor ? `, Floor ${r.floor}` : ''}` : ''}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										)}
									</div>
								</CardContent>
							</Card>

							{/* Attendance Sheet Tab */}
							<TabsContent value="attendance-sheet" className="mt-0 flex flex-col gap-4">
								{/* Practical Batch Selector (only shown when practical batches exist) */}
								{practicalBatches.length > 0 && (() => {
									const filteredBatches = practicalBatches.filter((b: any) => {
										if (!batchSearch.trim()) return true
										const search = batchSearch.toLowerCase()
										return (
											(b.course_code || '').toLowerCase().includes(search) ||
											(b.course_name || '').toLowerCase().includes(search) ||
											`batch ${b.batch_no}`.includes(search)
										)
									})
									return (
										<Card>
											<CardContent className="pt-6">
												<div className="space-y-2">
													<Label>Practical Batches</Label>
													<div className="border rounded-md p-2 space-y-2 max-h-48 overflow-y-auto">
														{/* Search */}
														<Input
															placeholder="Search batches..."
															value={batchSearch}
															onChange={e => setBatchSearch(e.target.value)}
															className="h-7 text-xs"
														/>
														{/* Select All / Clear */}
														<div className="flex items-center justify-between border-b pb-1.5">
															<div className="flex items-center gap-2">
																<Checkbox
																	checked={selectedBatchIds.size === filteredBatches.length && filteredBatches.length > 0}
																	onCheckedChange={(checked) => {
																		if (checked) {
																			setSelectedBatchIds(new Set(filteredBatches.map(b => b.id)))
																		} else {
																			setSelectedBatchIds(new Set())
																		}
																	}}
																/>
																<span className="text-xs font-medium">Select All</span>
															</div>
															{selectedBatchIds.size > 0 && (
																<Button variant="ghost" size="sm" className="h-5 text-[10px] text-muted-foreground" onClick={() => setSelectedBatchIds(new Set())}>
																	Clear
																</Button>
															)}
														</div>
														{/* Batch checkboxes */}
														{filteredBatches.map((b: any) => (
															<div key={b.id} className="flex items-center gap-2">
																<Checkbox
																	checked={selectedBatchIds.has(b.id)}
																	onCheckedChange={(checked) => {
																		const next = new Set(selectedBatchIds)
																		if (checked) next.add(b.id)
																		else next.delete(b.id)
																		setSelectedBatchIds(next)
																	}}
																/>
																<span className="text-xs">
																	{b.course_code} - Batch {b.batch_no} ({b.exam_date} {b.session}, Cap: {b.batch_capacity})
																</span>
															</div>
														))}
														{filteredBatches.length === 0 && (
															<p className="text-xs text-muted-foreground text-center py-1">No batches match search</p>
														)}
													</div>
												</div>
											</CardContent>
										</Card>
									)
								})()}

								{/* Generate Button + Progress */}
								<div className="flex flex-col gap-3">
									<div className="flex justify-end">
										<Button
											onClick={handleGeneratePDF}
											disabled={!isFormComplete || generating}
											className="gap-2 w-full sm:w-auto"
											size="lg"
										>
											{generating ? (
												<><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF...</>
											) : (
												<><Download className="h-4 w-4" /> Generate Attendance Sheet</>
											)}
										</Button>
									</div>

									{generating && (
										<div className="space-y-1.5">
											<div className="flex items-center justify-between text-sm text-muted-foreground">
												<span>{progressText}</span>
												<span>{progressPercent}%</span>
											</div>
											<div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
												<div
													className="h-full rounded-full bg-primary transition-all duration-300"
													style={{ width: `${progressPercent}%` }}
												/>
											</div>
										</div>
									)}
								</div>
							</TabsContent>

							{/* Seating Arrangement Tab */}
							<TabsContent value="seating-arrangement" className="mt-0">
								<SeatingArrangementTab
									key={`${institutionId}|${selectedSessionId}|${selectedExamDate}|${selectedSessionType}`}
									institutionId={institutionId || ''}
									examinationSessionId={selectedSessionId}
									examDate={selectedExamDate}
									sessionType={selectedSessionType}
									sessionName={sessions.find(s => s.id === selectedSessionId)?.session_name || ''}
									isFormComplete={isFormComplete}
									rooms={rooms}
									startingRoomId={startingRoomId}
								/>
							</TabsContent>
						</Tabs>
					)}
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}
