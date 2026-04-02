'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from '@/components/ui/command'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/common/use-toast'
import { UserCheck, Check, ChevronsUpDown, Loader2, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useSessionSync } from '@/hooks/use-session-sync'
import { AllotmentReportTab } from './allotment-report-tab'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Institution {
	id: string
	name: string
	institution_code: string
}

interface Session {
	id: string
	session_name: string
	session_code: string
}

interface Board {
	board_code: string
	board_name: string
	board_type: string
	board_order: number
}

interface InternalExaminer {
	staff_id: string
	staff_name: string
	staff_mobile: string
	staff_designation: string
}

interface ExternalExaminer {
	examiner_id: string
	full_name: string
	mobile: string
	designation: string
	department: string
	institution_name: string
}

interface TimetableRow {
	serial_number: number
	timetable_id: string
	exam_date: string
	session: string
	exam_time: string | null
	batch_no: number
	batch_capacity: number
	course_id: string
	course_code: string
	course_title: string
	course_category: string
	board_code: string
	exam_duration: number | null
	student_count: number
	internal_examiner: InternalExaminer | null
	external_examiner: ExternalExaminer | null
	skilled_examiner: InternalExaminer | null
	programmer_examiner: InternalExaminer | null
}

interface StaffOption {
	id: string
	staff_code: string
	name: string
	designation: string
	department_code: string
	phone: string
}

interface ExaminerOption {
	id: string
	full_name: string
	mobile: string
	designation: string
	department: string
	institution_name: string
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ExaminerAllotmentPage() {
	const { toast } = useToast()

	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	// Data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [boards, setBoards] = useState<Board[]>([])
	const [rows, setRows] = useState<TimetableRow[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [selectedBoardCode, setSelectedBoardCode] = useState('')

	// Combobox open states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [boardOpen, setBoardOpen] = useState(false)

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingBoards, setLoadingBoards] = useState(false)
	const [loadingRows, setLoadingRows] = useState(false)

	// Per-row save indicators: timetable_id-examiner_type -> 'saving' | 'saved' | 'error'
	const [saveStatus, setSaveStatus] = useState<Record<string, string>>({})

	const effectiveInstitutionId = selectedInstitutionId || contextInstitutionId || ''

	// ---------------------------------------------------------------------------
	// Auto-fill institution
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId])

	// ---------------------------------------------------------------------------
	// Load institutions
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && mustSelectInstitution) {
			loadInstitutions()
		}
	}, [isReady, mustSelectInstitution])

	// ---------------------------------------------------------------------------
	// Cascading loads
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && effectiveInstitutionId) {
			loadSessions(effectiveInstitutionId)
			setSelectedSessionId('')
			setSessions([])
			setSelectedBoardCode('')
			setBoards([])
			setRows([])
		}
	}, [isReady, effectiveInstitutionId])

	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId) {
			loadBoards(effectiveInstitutionId, selectedSessionId)
			setSelectedBoardCode('')
			setBoards([])
			setRows([])
		}
	}, [isReady, selectedSessionId])

	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId) {
			loadRows(effectiveInstitutionId, selectedSessionId, selectedBoardCode || undefined)
		}
	}, [isReady, selectedSessionId, selectedBoardCode])

	// ---------------------------------------------------------------------------
	// Data loaders
	// ---------------------------------------------------------------------------

	const loadInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/pre-exam/examiner-allotment?action=institutions')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed')
			setInstitutions(await response.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load institutions', variant: 'destructive' })
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, toast])

	const loadSessions = useCallback(async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			const url = appendToUrl(`/api/pre-exam/examiner-allotment?action=sessions&institutionId=${institutionId}`)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed')
			setSessions(await response.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load sessions', variant: 'destructive' })
		} finally {
			setLoadingSessions(false)
		}
	}, [appendToUrl, toast])

	const loadBoards = useCallback(async (institutionId: string, sessionId: string) => {
		try {
			setLoadingBoards(true)
			const url = appendToUrl(
				`/api/pre-exam/examiner-allotment?action=boards&institutionId=${institutionId}&sessionId=${sessionId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed')
			setBoards(await response.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load boards', variant: 'destructive' })
		} finally {
			setLoadingBoards(false)
		}
	}, [appendToUrl, toast])

	const loadRows = useCallback(async (institutionId: string, sessionId: string, boardCode?: string) => {
		try {
			setLoadingRows(true)
			let url = `/api/pre-exam/examiner-allotment?action=timetable-rows&institutionId=${institutionId}&sessionId=${sessionId}`
			if (boardCode) url += `&boardCode=${boardCode}`
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed')
			setRows(await response.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load timetable data', variant: 'destructive' })
		} finally {
			setLoadingRows(false)
		}
	}, [toast])

	// ---------------------------------------------------------------------------
	// Auto-save examiner assignment
	// ---------------------------------------------------------------------------

	const saveExaminer = useCallback(async (
		timetableId: string,
		examinerType: 'internal' | 'external' | 'skilled' | 'programmer',
		data: Record<string, any>
	) => {
		const key = `${timetableId}-${examinerType}`
		setSaveStatus(prev => ({ ...prev, [key]: 'saving' }))

		try {
			const response = await fetch('/api/pre-exam/examiner-allotment', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					timetable_id: timetableId,
					examiner_type: examinerType,
					institutions_id: effectiveInstitutionId,
					...data,
				}),
			})

			if (response.ok) {
				setSaveStatus(prev => ({ ...prev, [key]: 'saved' }))
				setTimeout(() => {
					setSaveStatus(prev => {
						const next = { ...prev }
						if (next[key] === 'saved') delete next[key]
						return next
					})
				}, 2000)
			} else {
				setSaveStatus(prev => ({ ...prev, [key]: 'error' }))
				toast({ title: '❌ Failed', description: 'Failed to save examiner', variant: 'destructive' })
			}
		} catch {
			setSaveStatus(prev => ({ ...prev, [key]: 'error' }))
			toast({ title: '❌ Error', description: 'Network error', variant: 'destructive' })
		}
	}, [effectiveInstitutionId, toast])

	// ---------------------------------------------------------------------------
	// Remove examiner assignment
	// ---------------------------------------------------------------------------

	const removeExaminer = useCallback(async (
		timetableId: string,
		examinerType: 'internal' | 'external' | 'skilled' | 'programmer',
	) => {
		const key = `${timetableId}-${examinerType}`
		setSaveStatus(prev => ({ ...prev, [key]: 'saving' }))

		try {
			const response = await fetch(
				`/api/pre-exam/examiner-allotment?timetable_id=${timetableId}&examiner_type=${examinerType}`,
				{ method: 'DELETE' }
			)

			if (response.ok) {
				setRows(prev => prev.map(r =>
					r.timetable_id === timetableId
						? { ...r, [`${examinerType}_examiner`]: null }
						: r
				))
				setSaveStatus(prev => ({ ...prev, [key]: 'saved' }))
				setTimeout(() => {
					setSaveStatus(prev => {
						const next = { ...prev }
						if (next[key] === 'saved') delete next[key]
						return next
					})
				}, 2000)
			} else {
				setSaveStatus(prev => ({ ...prev, [key]: 'error' }))
				toast({ title: '❌ Failed', description: 'Failed to remove examiner', variant: 'destructive' })
			}
		} catch {
			setSaveStatus(prev => ({ ...prev, [key]: 'error' }))
			toast({ title: '❌ Error', description: 'Network error', variant: 'destructive' })
		}
	}, [toast])

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	const formatDate = (dateStr: string): string => {
		if (!dateStr) return ''
		const d = new Date(dateStr)
		return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
	}

	const formatDuration = (hours: number | null): string => {
		if (!hours) return '—'
		const wholeHours = Math.floor(hours)
		const mins = Math.round((hours - wholeHours) * 60)
		if (mins === 0) return `${wholeHours} Hr${wholeHours !== 1 ? 's' : ''}`
		return `${wholeHours}h ${mins}m`
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<>

					{/* Loading context */}
					{!isReady && (
						<Card className="shadow-sm">
							<CardContent className="p-4">
								<div className="flex items-center justify-center gap-2 text-muted-foreground">
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
									<span className="text-sm">Loading institution context...</span>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Filters */}
					{isReady && (
						<Card className="shadow-sm">
							<CardContent className="p-2">
								<div className={cn(
									'grid grid-cols-1 gap-3',
									mustSelectInstitution ? 'md:grid-cols-3' : 'md:grid-cols-2'
								)}>

									{/* Institution */}
									{mustSelectInstitution && (
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">
												Institution <span className="text-red-500">*</span>
											</Label>
											<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
												<PopoverTrigger asChild>
													<Button
														variant="outline"
														role="combobox"
														className="w-full justify-between h-9 text-left text-xs truncate"
														disabled={loadingInstitutions}
													>
														<span className="flex-1 pr-2 truncate">
															{selectedInstitutionId
																? institutions.find(i => i.id === selectedInstitutionId)?.name
																: loadingInstitutions ? 'Loading...' : 'Select institution...'}
														</span>
														<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[400px] p-0" align="start">
													<Command>
														<CommandInput placeholder="Search institution..." className="h-8 text-xs" />
														<CommandEmpty className="text-xs py-4">No institution found.</CommandEmpty>
														<CommandGroup className="max-h-56 overflow-auto">
															{institutions.map(inst => (
																<CommandItem
																	key={inst.id}
																	value={`${inst.institution_code} ${inst.name}`}
																	onSelect={() => {
																		setSelectedInstitutionId(inst.id)
																		setInstitutionOpen(false)
																	}}
																	className="py-2 text-xs"
																>
																	<Check className={cn(
																		'mr-2 h-3.5 w-3.5 shrink-0',
																		selectedInstitutionId === inst.id ? 'opacity-100' : 'opacity-0'
																	)} />
																	<span className="flex-1 line-clamp-2">
																		{inst.institution_code} - {inst.name}
																	</span>
																</CommandItem>
															))}
														</CommandGroup>
													</Command>
												</PopoverContent>
											</Popover>
										</div>
									)}

									{/* Exam Session */}
									{mustSelectSession && (
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">
											Exam Session <span className="text-red-500">*</span>
										</Label>
										<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													className="w-full justify-between h-9 text-left text-xs truncate"
													disabled={!effectiveInstitutionId || loadingSessions}
												>
													<span className="flex-1 pr-2 truncate">
														{selectedSessionId
															? sessions.find(s => s.id === selectedSessionId)?.session_name
															: loadingSessions ? 'Loading...' : 'Select session...'}
													</span>
													<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[300px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search session..." className="h-8 text-xs" />
													<CommandEmpty className="text-xs py-4">No session found.</CommandEmpty>
													<CommandGroup className="max-h-56 overflow-auto">
														{sessions.map(session => (
															<CommandItem
																key={session.id}
																value={`${session.session_code} ${session.session_name}`}
																onSelect={() => {
																	setSelectedSessionId(session.id)
																	setSessionOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn(
																	'mr-2 h-3.5 w-3.5 shrink-0',
																	selectedSessionId === session.id ? 'opacity-100' : 'opacity-0'
																)} />
																<span className="flex-1 line-clamp-2">
																	{session.session_name}
																</span>
															</CommandItem>
														))}
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
									)}

									{/* Board (optional filter) */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Board</Label>
										<Popover open={boardOpen} onOpenChange={setBoardOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													className="w-full justify-between h-9 text-left text-xs truncate"
													disabled={!selectedSessionId || loadingBoards}
												>
													<span className="flex-1 pr-2 truncate">
														{selectedBoardCode
															? (() => { const b = boards.find(b => b.board_code === selectedBoardCode); return b ? `${b.board_name}${b.board_type ? ` (${b.board_type})` : ''}` : selectedBoardCode })()
															: loadingBoards ? 'Loading...' : 'All Boards'}
													</span>
													<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[300px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search board..." className="h-8 text-xs" />
													<CommandEmpty className="text-xs py-4">No board found.</CommandEmpty>
													<CommandGroup className="max-h-56 overflow-auto">
														<CommandItem
															value="all-boards"
															onSelect={() => {
																setSelectedBoardCode('')
																setBoardOpen(false)
															}}
															className="py-2 text-xs"
														>
															<Check className={cn(
																'mr-2 h-3.5 w-3.5 shrink-0',
																!selectedBoardCode ? 'opacity-100' : 'opacity-0'
															)} />
															All Boards
														</CommandItem>
														{boards.map(board => (
															<CommandItem
																key={board.board_code}
																value={`${board.board_code} ${board.board_name} ${board.board_type}`}
																onSelect={() => {
																	setSelectedBoardCode(board.board_code)
																	setBoardOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn(
																	'mr-2 h-3.5 w-3.5 shrink-0',
																	selectedBoardCode === board.board_code ? 'opacity-100' : 'opacity-0'
																)} />
																<span className="flex-1 line-clamp-2">
																	{board.board_name}{board.board_type ? ` (${board.board_type})` : ''}
																</span>
															</CommandItem>
														))}
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Tabs: Examiner Allotment + Allotment Report */}
					{isReady && (
						<Tabs defaultValue="allotment" className="space-y-4">
							<TabsList className="grid w-full max-w-md grid-cols-2 bg-emerald-50 dark:bg-emerald-950/30 p-1 h-10 rounded-lg border border-emerald-200 dark:border-emerald-800">
								<TabsTrigger value="allotment" className="text-xs gap-1.5 rounded-md data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:font-semibold text-emerald-700 dark:text-emerald-300 dark:data-[state=active]:bg-emerald-600">
									<UserCheck className="h-3.5 w-3.5" />
									Examiner Allotment
								</TabsTrigger>
								<TabsTrigger value="report" className="text-xs gap-1.5 rounded-md data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:font-semibold text-emerald-700 dark:text-emerald-300 dark:data-[state=active]:bg-emerald-600">
									<FileText className="h-3.5 w-3.5" />
									Allotment Report
								</TabsTrigger>
							</TabsList>

							{/* ---- Tab 1: Examiner Allotment ---- */}
							<TabsContent value="allotment" className="space-y-4">
								{/* Loading rows */}
								{loadingRows && (
									<Card className="shadow-sm">
										<CardContent className="p-4">
											<div className="flex items-center justify-center gap-2 text-muted-foreground">
												<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
												<span className="text-sm">Loading timetable data...</span>
											</div>
										</CardContent>
									</Card>
								)}

								{/* Data table */}
								{!loadingRows && selectedSessionId && rows.length > 0 && (
									<Card className="shadow-md">
										<CardHeader className="pb-3">
											<div className="flex items-center justify-between flex-wrap gap-2">
												<CardTitle className="flex items-center gap-2 font-grotesk text-base">
													<div className="h-2 w-2 rounded-full bg-slate-700" />
													Examiner Allotment
												</CardTitle>
												<Badge
													variant="outline"
													className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700"
												>
													{rows.length} Batches
												</Badge>
											</div>
										</CardHeader>

										<CardContent className="pt-0">
											<div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto shadow-sm">
												<Table>
													<TableHeader>
														<TableRow className="bg-slate-800 dark:bg-slate-900 hover:bg-slate-800 dark:hover:bg-slate-900">
															<TableHead className="w-10 text-white font-semibold text-xs">#</TableHead>
															<TableHead className="text-white font-semibold text-xs">Date &amp; Session</TableHead>
															<TableHead className="text-white font-semibold text-xs w-10">Batch</TableHead>
															<TableHead className="text-white font-semibold text-xs min-w-[200px]">Course Code &amp; Name</TableHead>
															<TableHead className="text-white font-semibold text-xs w-16 text-center">Students</TableHead>
															<TableHead className="text-white font-semibold text-xs min-w-[220px]">Internal Examiner</TableHead>
															<TableHead className="text-white font-semibold text-xs min-w-[220px]">External Examiner</TableHead>
															<TableHead className="text-white font-semibold text-xs min-w-[220px]">Skilled</TableHead>
															<TableHead className="text-white font-semibold text-xs min-w-[220px]">Programmer</TableHead>
															<TableHead className="text-white font-semibold text-xs w-20 text-center">Duration</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{rows.map((row, idx) => (
															<TableRow key={row.timetable_id} className={cn(
																'hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors',
																idx % 2 === 0 ? 'bg-white dark:bg-slate-950' : 'bg-slate-50/70 dark:bg-slate-900/30'
															)}>
																<TableCell className="text-xs py-2 font-medium">{idx + 1}</TableCell>
																<TableCell className="text-xs py-2 whitespace-nowrap">
																	{formatDate(row.exam_date)} {row.session}
																</TableCell>
																<TableCell className="text-xs py-2 text-center font-semibold">{row.batch_no}</TableCell>
																<TableCell className="text-xs py-2">
																	<div className="font-semibold">{row.course_code}</div>
																	<div className="text-muted-foreground text-[11px] line-clamp-2">{row.course_title}</div>
																</TableCell>
																<TableCell className="text-xs py-2 text-center">
																	<Badge variant="outline" className="text-xs">
																		{row.student_count}
																	</Badge>
																</TableCell>
																<TableCell className="py-1">
																	<InternalExaminerCell
																		row={row}
																		effectiveInstitutionId={effectiveInstitutionId}
																		saveStatus={saveStatus[`${row.timetable_id}-internal`]}
																		onSelect={(staff) => {
																			setRows(prev => prev.map(r =>
																				r.timetable_id === row.timetable_id
																					? { ...r, internal_examiner: { staff_id: staff.id, staff_name: staff.name, staff_mobile: staff.phone, staff_designation: staff.designation } }
																					: r
																			))
																			saveExaminer(row.timetable_id, 'internal', {
																				staff_id: staff.id,
																				staff_name: staff.name,
																				staff_mobile: staff.phone,
																				staff_designation: staff.designation,
																			})
																		}}
																		onRemove={() => removeExaminer(row.timetable_id, 'internal')}
																	/>
																</TableCell>
																<TableCell className="py-1">
																	<ExternalExaminerCell
																		row={row}
																		saveStatus={saveStatus[`${row.timetable_id}-external`]}
																		onSelect={(examiner) => {
																			setRows(prev => prev.map(r =>
																				r.timetable_id === row.timetable_id
																					? { ...r, external_examiner: examiner }
																					: r
																			))
																			saveExaminer(row.timetable_id, 'external', {
																				examiner_id: examiner.examiner_id,
																			})
																		}}
																		onRemove={() => removeExaminer(row.timetable_id, 'external')}
																	/>
																</TableCell>
																<TableCell className="py-1">
																	<SkilledExaminerCell
																		row={row}
																		effectiveInstitutionId={effectiveInstitutionId}
																		saveStatus={saveStatus[`${row.timetable_id}-skilled`]}
																		onSelect={(staff) => {
																			setRows(prev => prev.map(r =>
																				r.timetable_id === row.timetable_id
																					? { ...r, skilled_examiner: { staff_id: staff.id, staff_name: staff.name, staff_mobile: staff.phone, staff_designation: staff.designation } }
																					: r
																			))
																			saveExaminer(row.timetable_id, 'skilled', {
																				staff_id: staff.id,
																				staff_name: staff.name,
																				staff_mobile: staff.phone,
																				staff_designation: staff.designation,
																			})
																		}}
																		onRemove={() => removeExaminer(row.timetable_id, 'skilled')}
																	/>
																</TableCell>
																<TableCell className="py-1">
																	<ProgrammerExaminerCell
																		row={row}
																		effectiveInstitutionId={effectiveInstitutionId}
																		saveStatus={saveStatus[`${row.timetable_id}-programmer`]}
																		onSelect={(staff) => {
																			setRows(prev => prev.map(r =>
																				r.timetable_id === row.timetable_id
																					? { ...r, programmer_examiner: { staff_id: staff.id, staff_name: staff.name, staff_mobile: staff.phone, staff_designation: staff.designation } }
																					: r
																			))
																			saveExaminer(row.timetable_id, 'programmer', {
																				staff_id: staff.id,
																				staff_name: staff.name,
																				staff_mobile: staff.phone,
																				staff_designation: staff.designation,
																			})
																		}}
																		onRemove={() => removeExaminer(row.timetable_id, 'programmer')}
																	/>
																</TableCell>
																<TableCell className="text-xs py-2 text-center">
																	{formatDuration(row.exam_duration)}
																</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											</div>
										</CardContent>
									</Card>
								)}

								{/* Empty state */}
								{!loadingRows && selectedSessionId && rows.length === 0 && (
									<Card className="shadow-sm">
										<CardContent className="p-8">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<UserCheck className="h-8 w-8 opacity-40" />
												<p className="text-sm font-medium">No practical/project batches found</p>
												<p className="text-xs">Ensure published practical timetable entries exist for this session</p>
											</div>
										</CardContent>
									</Card>
								)}
							</TabsContent>

							{/* ---- Tab 2: Allotment Report ---- */}
							<TabsContent value="report">
								<AllotmentReportTab
									institutionId={effectiveInstitutionId}
									institutionCode={institutions.find(i => i.id === effectiveInstitutionId)?.institution_code || ''}
									sessionId={selectedSessionId}
									sessionName={sessions.find(s => s.id === selectedSessionId)?.session_name || ''}
									boards={boards}
									boardCode={selectedBoardCode}
									isReady={isReady}
								/>
							</TabsContent>
						</Tabs>
					)}

		</>
	)
}

// ---------------------------------------------------------------------------
// Internal Examiner Cell (search MyJKKN staff)
// ---------------------------------------------------------------------------

function InternalExaminerCell({
	row,
	effectiveInstitutionId,
	saveStatus,
	onSelect,
	onRemove,
}: {
	row: TimetableRow
	effectiveInstitutionId: string
	saveStatus?: string
	onSelect: (staff: StaffOption) => void
	onRemove: () => void
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')
	const [options, setOptions] = useState<StaffOption[]>([])
	const [loading, setLoading] = useState(false)
	const debounceRef = useRef<NodeJS.Timeout | null>(null)

	const handleSearch = (value: string) => {
		setSearch(value)
		if (debounceRef.current) clearTimeout(debounceRef.current)
		if (value.length < 2) { setOptions([]); return }
		debounceRef.current = setTimeout(async () => {
			setLoading(true)
			try {
				const url = `/api/pre-exam/examiner-allotment?action=staff-search&institutionId=${effectiveInstitutionId}&search=${encodeURIComponent(value)}`
				const res = await fetch(url)
				const data = await res.json()
				setOptions(Array.isArray(data) ? data : [])
			} catch {
				setOptions([])
			} finally {
				setLoading(false)
			}
		}, 400)
	}

	const current = row.internal_examiner

	return (
		<div className="flex items-center gap-1">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						className={cn(
							'w-full justify-between h-8 text-left text-xs',
							current ? 'font-medium' : 'text-muted-foreground'
						)}
					>
						<span className="flex-1 pr-1 truncate">
							{current ? current.staff_name : 'Select staff...'}
						</span>
						<ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[300px] p-0" align="start">
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search staff name..."
							className="h-8 text-xs"
							value={search}
							onValueChange={handleSearch}
						/>
						{loading && (
							<div className="flex items-center justify-center py-4">
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							</div>
						)}
						{!loading && search.length >= 2 && options.length === 0 && (
							<CommandEmpty className="text-xs py-4">No staff found.</CommandEmpty>
						)}
						{!loading && search.length < 2 && (
							<div className="text-xs text-muted-foreground text-center py-4">
								Type at least 2 characters to search
							</div>
						)}
						<CommandGroup className="max-h-56 overflow-auto">
							{options.map(staff => (
								<CommandItem
									key={staff.id}
									value={staff.id}
									onSelect={() => {
										onSelect(staff)
										setOpen(false)
										setSearch('')
										setOptions([])
									}}
									className="py-2 text-xs"
								>
									<div className="flex-1">
										<div className="font-medium">{staff.name}</div>
										<div className="text-muted-foreground text-[10px]">
											{staff.designation} {staff.department_code ? `• ${staff.department_code}` : ''} {staff.phone ? `• ${staff.phone}` : ''}
										</div>
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					</Command>
				</PopoverContent>
			</Popover>
			{current && (
				<button
					type="button"
					onClick={onRemove}
					className="h-5 w-5 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0 transition-colors"
					title="Remove examiner"
				>
					<X className="h-3 w-3" />
				</button>
			)}
			{saveStatus === 'saving' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
			{saveStatus === 'saved' && <Check className="h-3 w-3 text-green-600 shrink-0" />}
		</div>
	)
}

// ---------------------------------------------------------------------------
// External Examiner Cell (search examiners table)
// ---------------------------------------------------------------------------

function ExternalExaminerCell({
	row,
	saveStatus,
	onSelect,
	onRemove,
}: {
	row: TimetableRow
	saveStatus?: string
	onSelect: (examiner: ExternalExaminer) => void
	onRemove: () => void
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')
	const [options, setOptions] = useState<ExaminerOption[]>([])
	const [loading, setLoading] = useState(false)
	const debounceRef = useRef<NodeJS.Timeout | null>(null)

	const handleSearch = (value: string) => {
		setSearch(value)
		if (debounceRef.current) clearTimeout(debounceRef.current)
		if (value.length < 2) { setOptions([]); return }
		debounceRef.current = setTimeout(async () => {
			setLoading(true)
			try {
				const url = `/api/pre-exam/examiner-allotment?action=examiner-search&search=${encodeURIComponent(value)}`
				const res = await fetch(url)
				const data = await res.json()
				setOptions(Array.isArray(data) ? data : [])
			} catch {
				setOptions([])
			} finally {
				setLoading(false)
			}
		}, 400)
	}

	const current = row.external_examiner

	return (
		<div className="flex items-center gap-1">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						className={cn(
							'w-full justify-between h-8 text-left text-xs',
							current ? 'font-medium' : 'text-muted-foreground'
						)}
					>
						<span className="flex-1 pr-1 truncate">
							{current ? current.full_name : 'Select examiner...'}
						</span>
						<ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[350px] p-0" align="start">
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search examiner name..."
							className="h-8 text-xs"
							value={search}
							onValueChange={handleSearch}
						/>
						{loading && (
							<div className="flex items-center justify-center py-4">
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							</div>
						)}
						{!loading && search.length >= 2 && options.length === 0 && (
							<CommandEmpty className="text-xs py-4">No examiner found.</CommandEmpty>
						)}
						{!loading && search.length < 2 && (
							<div className="text-xs text-muted-foreground text-center py-4">
								Type at least 2 characters to search
							</div>
						)}
						<CommandGroup className="max-h-56 overflow-auto">
							{options.map(examiner => (
								<CommandItem
									key={examiner.id}
									value={examiner.id}
									onSelect={() => {
										onSelect({
											examiner_id: examiner.id,
											full_name: examiner.full_name,
											mobile: examiner.mobile,
											designation: examiner.designation,
											department: examiner.department,
											institution_name: examiner.institution_name,
										})
										setOpen(false)
										setSearch('')
										setOptions([])
									}}
									className="py-2 text-xs"
								>
									<div className="flex-1">
										<div className="font-medium">{examiner.full_name}</div>
										<div className="text-muted-foreground text-[10px]">
											{examiner.designation} • {examiner.department}
										</div>
										<div className="text-muted-foreground text-[10px]">
											{examiner.institution_name} {examiner.mobile ? `• ${examiner.mobile}` : ''}
										</div>
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					</Command>
				</PopoverContent>
			</Popover>
			{current && (
				<button
					type="button"
					onClick={onRemove}
					className="h-5 w-5 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0 transition-colors"
					title="Remove examiner"
				>
					<X className="h-3 w-3" />
				</button>
			)}
			{saveStatus === 'saving' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
			{saveStatus === 'saved' && <Check className="h-3 w-3 text-green-600 shrink-0" />}
		</div>
	)
}

// ---------------------------------------------------------------------------
// Skilled Examiner Cell (search MyJKKN staff, must differ from internal)
// ---------------------------------------------------------------------------

function ProgrammerExaminerCell({
	row,
	effectiveInstitutionId,
	saveStatus,
	onSelect,
	onRemove,
}: {
	row: TimetableRow
	effectiveInstitutionId: string
	saveStatus?: string
	onSelect: (staff: StaffOption) => void
	onRemove: () => void
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')
	const [options, setOptions] = useState<StaffOption[]>([])
	const [loading, setLoading] = useState(false)
	const debounceRef = useRef<NodeJS.Timeout | null>(null)

	const handleSearch = (value: string) => {
		setSearch(value)
		if (debounceRef.current) clearTimeout(debounceRef.current)
		if (value.length < 2) { setOptions([]); return }
		debounceRef.current = setTimeout(async () => {
			setLoading(true)
			try {
				const url = `/api/pre-exam/examiner-allotment?action=staff-search&institutionId=${effectiveInstitutionId}&search=${encodeURIComponent(value)}`
				const res = await fetch(url)
				const data = await res.json()
				setOptions(Array.isArray(data) ? data : [])
			} catch {
				setOptions([])
			} finally {
				setLoading(false)
			}
		}, 400)
	}

	const current = row.programmer_examiner

	return (
		<div className="flex items-center gap-1">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						className={cn(
							'w-full justify-between h-8 text-left text-xs',
							current ? 'font-medium' : 'text-muted-foreground'
						)}
					>
						<span className="flex-1 pr-1 truncate">
							{current ? current.staff_name : 'Select programmer...'}
						</span>
						<ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[300px] p-0" align="start">
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search staff name..."
							className="h-8 text-xs"
							value={search}
							onValueChange={handleSearch}
						/>
						{loading && (
							<div className="flex items-center justify-center py-4">
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							</div>
						)}
						{!loading && search.length >= 2 && options.length === 0 && (
							<CommandEmpty className="text-xs py-4">No staff found.</CommandEmpty>
						)}
						{!loading && search.length < 2 && (
							<div className="text-xs text-muted-foreground text-center py-4">
								Type at least 2 characters to search
							</div>
						)}
						<CommandGroup className="max-h-56 overflow-auto">
							{options.map(staff => (
								<CommandItem
									key={staff.id}
									value={staff.id}
									onSelect={() => {
										onSelect(staff)
										setOpen(false)
										setSearch('')
										setOptions([])
									}}
									className="py-2 text-xs"
								>
									<div className="flex-1">
										<div className="font-medium">{staff.name}</div>
										<div className="text-muted-foreground text-[10px]">
											{staff.designation} {staff.department_code ? `• ${staff.department_code}` : ''} {staff.phone ? `• ${staff.phone}` : ''}
										</div>
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					</Command>
				</PopoverContent>
			</Popover>
			{current && (
				<button
					type="button"
					onClick={onRemove}
					className="h-5 w-5 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0 transition-colors"
					title="Remove examiner"
				>
					<X className="h-3 w-3" />
				</button>
			)}
			{saveStatus === 'saving' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
			{saveStatus === 'saved' && <Check className="h-3 w-3 text-green-600 shrink-0" />}
		</div>
	)
}

function SkilledExaminerCell({
	row,
	effectiveInstitutionId,
	saveStatus,
	onSelect,
	onRemove,
}: {
	row: TimetableRow
	effectiveInstitutionId: string
	saveStatus?: string
	onSelect: (staff: StaffOption) => void
	onRemove: () => void
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')
	const [options, setOptions] = useState<StaffOption[]>([])
	const [loading, setLoading] = useState(false)
	const debounceRef = useRef<NodeJS.Timeout | null>(null)
	const { toast } = useToast()

	const handleSearch = (value: string) => {
		setSearch(value)
		if (debounceRef.current) clearTimeout(debounceRef.current)
		if (value.length < 2) { setOptions([]); return }
		debounceRef.current = setTimeout(async () => {
			setLoading(true)
			try {
				const url = `/api/pre-exam/examiner-allotment?action=staff-search&institutionId=${effectiveInstitutionId}&search=${encodeURIComponent(value)}`
				const res = await fetch(url)
				const data = await res.json()
				setOptions(Array.isArray(data) ? data : [])
			} catch {
				setOptions([])
			} finally {
				setLoading(false)
			}
		}, 400)
	}

	const current = row.skilled_examiner
	const internalStaffId = row.internal_examiner?.staff_id

	return (
		<div className="flex items-center gap-1">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						className={cn(
							'w-full justify-between h-8 text-left text-xs',
							current ? 'font-medium' : 'text-muted-foreground'
						)}
					>
						<span className="flex-1 pr-1 truncate">
							{current ? current.staff_name : 'Select skilled...'}
						</span>
						<ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[300px] p-0" align="start">
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search staff name..."
							className="h-8 text-xs"
							value={search}
							onValueChange={handleSearch}
						/>
						{loading && (
							<div className="flex items-center justify-center py-4">
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							</div>
						)}
						{!loading && search.length >= 2 && options.length === 0 && (
							<CommandEmpty className="text-xs py-4">No staff found.</CommandEmpty>
						)}
						{!loading && search.length < 2 && (
							<div className="text-xs text-muted-foreground text-center py-4">
								Type at least 2 characters to search
							</div>
						)}
						<CommandGroup className="max-h-56 overflow-auto">
							{options.map(staff => {
								const isSameAsInternal = internalStaffId && staff.id === internalStaffId
								return (
									<CommandItem
										key={staff.id}
										value={staff.id}
										onSelect={() => {
											if (isSameAsInternal) {
												toast({ title: '⚠️ Same as Internal', description: 'Skilled must be a different person from Internal Examiner', variant: 'destructive' })
												return
											}
											onSelect(staff)
											setOpen(false)
											setSearch('')
											setOptions([])
										}}
										className={cn('py-2 text-xs', isSameAsInternal && 'opacity-40')}
									>
										<div className="flex-1">
											<div className="font-medium">
												{staff.name}
												{isSameAsInternal && <span className="text-red-500 ml-1">(Internal)</span>}
											</div>
											<div className="text-muted-foreground text-[10px]">
												{staff.designation} {staff.department_code ? `• ${staff.department_code}` : ''} {staff.phone ? `• ${staff.phone}` : ''}
											</div>
										</div>
									</CommandItem>
								)
							})}
						</CommandGroup>
					</Command>
				</PopoverContent>
			</Popover>
			{current && (
				<button
					type="button"
					onClick={onRemove}
					className="h-5 w-5 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0 transition-colors"
					title="Remove examiner"
				>
					<X className="h-3 w-3" />
				</button>
			)}
			{saveStatus === 'saving' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
			{saveStatus === 'saved' && <Check className="h-3 w-3 text-green-600 shrink-0" />}
		</div>
	)
}
