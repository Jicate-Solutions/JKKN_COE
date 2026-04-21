'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/common/use-toast'
import {
	CalendarRange,
	Check,
	ChevronsUpDown,
	Loader2,
	CalendarCog,
	Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useSessionSync } from '@/hooks/use-session-sync'
import type {
	CentralValuationBoardRow,
	BoardValuationWindow,
} from '@/types/central-valuation'

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

interface CourseDateRow {
	course_id: string
	course_code: string
	course_name: string
	board_code: string
	valuation_date: string | null
	packet_count: number
	sheet_count: number
}

export default function CentralValuationDatesPage() {
	const { toast } = useToast()

	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const effectiveInstitutionId = selectedInstitutionId || contextInstitutionId || ''

	const [boards, setBoards] = useState<CentralValuationBoardRow[]>([])
	const [loadingBoards, setLoadingBoards] = useState(false)

	const [windowSheetOpen, setWindowSheetOpen] = useState(false)
	const [editingBoard, setEditingBoard] = useState<CentralValuationBoardRow | null>(null)
	const [fromDate, setFromDate] = useState('')
	const [toDate, setToDate] = useState('')
	const [savingWindow, setSavingWindow] = useState(false)

	const [courseBoardCode, setCourseBoardCode] = useState('')
	const [courseBoardOpen, setCourseBoardOpen] = useState(false)
	const [courseDates, setCourseDates] = useState<CourseDateRow[]>([])
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [dirtyDates, setDirtyDates] = useState<Record<string, string | null>>({})
	const [savingCourseDates, setSavingCourseDates] = useState(false)
	const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set())
	const [bulkDate, setBulkDate] = useState('')

	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId])

	useEffect(() => {
		if (isReady && mustSelectInstitution) loadInstitutions()
	}, [isReady, mustSelectInstitution])

	useEffect(() => {
		if (isReady && effectiveInstitutionId) {
			loadSessions(effectiveInstitutionId)
		}
	}, [isReady, effectiveInstitutionId])

	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId) {
			loadBoards()
		}
	}, [isReady, selectedSessionId, effectiveInstitutionId])

	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId && courseBoardCode) {
			loadCourseDates(courseBoardCode)
		} else {
			setCourseDates([])
			setDirtyDates({})
			setSelectedCourseIds(new Set())
		}
	}, [isReady, selectedSessionId, effectiveInstitutionId, courseBoardCode])

	const loadInstitutions = useCallback(async () => {
		try {
			const url = appendToUrl('/api/pre-exam/examiner-allotment?action=institutions')
			const r = await fetch(url)
			if (!r.ok) throw new Error('Failed')
			setInstitutions(await r.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load institutions', variant: 'destructive' })
		}
	}, [appendToUrl, toast])

	const loadSessions = useCallback(async (institutionId: string) => {
		try {
			const url = appendToUrl(`/api/pre-exam/examiner-allotment?action=sessions&institutionId=${institutionId}`)
			const r = await fetch(url)
			if (!r.ok) throw new Error('Failed')
			setSessions(await r.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load sessions', variant: 'destructive' })
		}
	}, [appendToUrl, toast])

	const loadBoards = useCallback(async () => {
		try {
			setLoadingBoards(true)
			const r = await fetch(`/api/post-exam/central-valuation/boards?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}`)
			if (!r.ok) throw new Error('Failed')
			setBoards(await r.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load boards', variant: 'destructive' })
		} finally {
			setLoadingBoards(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, toast])

	const loadCourseDates = useCallback(async (boardCode: string) => {
		try {
			setLoadingCourses(true)
			const r = await fetch(`/api/post-exam/central-valuation/course-dates?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}&board_code=${boardCode}`)
			if (!r.ok) throw new Error('Failed')
			const rows = (await r.json()) as CourseDateRow[]
			setCourseDates(rows)
			setDirtyDates({})
			setSelectedCourseIds(new Set())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load courses', variant: 'destructive' })
		} finally {
			setLoadingCourses(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, toast])

	const openWindowSheet = (b: CentralValuationBoardRow) => {
		setEditingBoard(b)
		setFromDate(b.window?.from_date || '')
		setToDate(b.window?.to_date || '')
		setWindowSheetOpen(true)
	}

	const saveWindow = async () => {
		if (!editingBoard || !fromDate || !toDate) {
			toast({ title: '❌ Missing fields', description: 'From-date and to-date are required', variant: 'destructive' })
			return
		}
		if (new Date(toDate) < new Date(fromDate)) {
			toast({ title: '❌ Invalid range', description: 'To-date must be after from-date', variant: 'destructive' })
			return
		}
		try {
			setSavingWindow(true)
			const r = await fetch('/api/post-exam/central-valuation/board-windows', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: effectiveInstitutionId,
					examination_session_id: selectedSessionId,
					board_code: editingBoard.board_code,
					board_name: editingBoard.board_name,
					from_date: fromDate,
					to_date: toDate,
				}),
			})
			if (!r.ok) {
				const j = await r.json().catch(() => ({}))
				throw new Error(j.error || 'Failed')
			}
			toast({
				title: '✅ Saved',
				description: `Window set for ${editingBoard.board_name}`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			setWindowSheetOpen(false)
			loadBoards()
		} catch (e: any) {
			toast({ title: '❌ Save failed', description: e.message || 'Unknown error', variant: 'destructive' })
		} finally {
			setSavingWindow(false)
		}
	}

	const currentWindow: BoardValuationWindow | null = useMemo(() => {
		if (!courseBoardCode) return null
		const b = boards.find(b => b.board_code === courseBoardCode)
		return b?.window || null
	}, [courseBoardCode, boards])

	const handleCourseDateChange = (courseId: string, value: string) => {
		setDirtyDates(prev => ({ ...prev, [courseId]: value || null }))
	}

	const applyBulkDate = () => {
		if (!bulkDate) {
			toast({ title: '⚠ Pick a date first', variant: 'destructive' })
			return
		}
		if (currentWindow) {
			if (bulkDate < currentWindow.from_date || bulkDate > currentWindow.to_date) {
				toast({
					title: '❌ Out of window',
					description: `Must be within ${currentWindow.from_date} to ${currentWindow.to_date}`,
					variant: 'destructive',
				})
				return
			}
		}
		const newDirty = { ...dirtyDates }
		for (const id of selectedCourseIds) newDirty[id] = bulkDate
		setDirtyDates(newDirty)
	}

	const saveCourseDates = async () => {
		const entries = Object.entries(dirtyDates)
			.filter(([courseId]) => {
				const c = courseDates.find(c => c.course_id === courseId)
				return !!c
			})
			.map(([courseId, val]) => {
				const c = courseDates.find(c => c.course_id === courseId)!
				return {
					course_id: courseId,
					board_code: c.board_code,
					valuation_date: val,
				}
			})

		if (entries.length === 0) {
			toast({ title: 'Nothing to save', description: 'No changes made' })
			return
		}
		try {
			setSavingCourseDates(true)
			const r = await fetch('/api/post-exam/central-valuation/course-dates', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: effectiveInstitutionId,
					examination_session_id: selectedSessionId,
					entries,
				}),
			})
			if (!r.ok) {
				const j = await r.json().catch(() => ({}))
				throw new Error(j.error || 'Failed')
			}
			const res = await r.json()
			toast({
				title: '✅ Saved',
				description: `${res.upserted} updated, ${res.deleted} cleared`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			loadCourseDates(courseBoardCode)
		} catch (e: any) {
			toast({ title: '❌ Save failed', description: e.message || 'Unknown error', variant: 'destructive' })
		} finally {
			setSavingCourseDates(false)
		}
	}

	const toggleCourseSelect = (courseId: string) => {
		const next = new Set(selectedCourseIds)
		if (next.has(courseId)) next.delete(courseId)
		else next.add(courseId)
		setSelectedCourseIds(next)
	}

	const toggleAllSelect = () => {
		if (selectedCourseIds.size === courseDates.length) setSelectedCourseIds(new Set())
		else setSelectedCourseIds(new Set(courseDates.map(c => c.course_id)))
	}

	const boardsWithWindow = boards.filter(b => !!b.window)

	return (
		<div className="space-y-4">
			{/* Institution + session picker */}
			<Card className="shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-base flex items-center gap-2">
						<CalendarCog className="h-4 w-4 text-violet-600" />
						Central Valuation Dates
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{mustSelectInstitution && (
							<div className="space-y-1.5">
								<Label className="text-xs font-medium">Institution</Label>
								<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
									<PopoverTrigger asChild>
										<Button variant="outline" role="combobox" className="w-full justify-between h-9 text-left text-xs truncate">
											<span className="flex-1 pr-2 truncate">
												{selectedInstitutionId
													? institutions.find(i => i.id === selectedInstitutionId)?.name || 'Select institution'
													: 'Select institution'}
											</span>
											<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[320px] p-0" align="start">
										<Command>
											<CommandInput placeholder="Search institution..." className="h-8 text-xs" />
											<CommandEmpty className="text-xs py-4">No institution found.</CommandEmpty>
											<CommandGroup className="max-h-56 overflow-auto">
												{institutions.map(i => (
													<CommandItem
														key={i.id}
														value={`${i.institution_code} ${i.name}`}
														onSelect={() => {
															setSelectedInstitutionId(i.id)
															setInstitutionOpen(false)
														}}
														className="py-2 text-xs"
													>
														<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', selectedInstitutionId === i.id ? 'opacity-100' : 'opacity-0')} />
														<span className="flex-1">{i.name}</span>
													</CommandItem>
												))}
											</CommandGroup>
										</Command>
									</PopoverContent>
								</Popover>
							</div>
						)}

						<div className="space-y-1.5">
							<Label className="text-xs font-medium">Session</Label>
							<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										role="combobox"
										className="w-full justify-between h-9 text-left text-xs truncate"
										disabled={!effectiveInstitutionId}
									>
										<span className="flex-1 pr-2 truncate">
											{selectedSessionId
												? sessions.find(s => s.id === selectedSessionId)?.session_name || 'Select session'
												: 'Select session'}
										</span>
										<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[320px] p-0" align="start">
									<Command>
										<CommandInput placeholder="Search session..." className="h-8 text-xs" />
										<CommandEmpty className="text-xs py-4">No session found.</CommandEmpty>
										<CommandGroup className="max-h-56 overflow-auto">
											{sessions.map(s => (
												<CommandItem
													key={s.id}
													value={`${s.session_code} ${s.session_name}`}
													onSelect={() => {
														setSelectedSessionId(s.id)
														setSessionOpen(false)
													}}
													className="py-2 text-xs"
												>
													<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', selectedSessionId === s.id ? 'opacity-100' : 'opacity-0')} />
													<span className="flex-1">{s.session_name}</span>
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

			{isReady && selectedSessionId && effectiveInstitutionId && (
				<Tabs defaultValue="board-windows" className="space-y-4">
					<TabsList className="grid w-full max-w-md grid-cols-2 bg-violet-50 dark:bg-violet-950/30 p-1 h-10 rounded-lg border border-violet-200 dark:border-violet-800">
						<TabsTrigger value="board-windows" className="text-xs gap-1.5 rounded-md data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:font-semibold text-violet-700 dark:text-violet-300">
							<CalendarRange className="h-3.5 w-3.5" />
							Board Windows
						</TabsTrigger>
						<TabsTrigger value="course-dates" className="text-xs gap-1.5 rounded-md data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:font-semibold text-violet-700 dark:text-violet-300">
							<CalendarCog className="h-3.5 w-3.5" />
							Course Dates
						</TabsTrigger>
					</TabsList>

					{/* Tab 1: Board Windows */}
					<TabsContent value="board-windows" className="space-y-4">
						<Card className="shadow-md">
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between flex-wrap gap-2">
									<CardTitle className="text-base">Board Valuation Windows</CardTitle>
									<Badge variant="outline">{boards.length} boards</Badge>
								</div>
							</CardHeader>
							<CardContent className="pt-0">
								{loadingBoards ? (
									<div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
										<Loader2 className="h-4 w-4 animate-spin" />
										<span className="text-sm">Loading boards...</span>
									</div>
								) : boards.length === 0 ? (
									<div className="text-sm text-muted-foreground text-center py-8">
										No boards with answer sheet packets in this session.
									</div>
								) : (
									<div className="border rounded-lg overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow className="bg-slate-800 hover:bg-slate-800">
													<TableHead className="text-white text-xs">Board Code</TableHead>
													<TableHead className="text-white text-xs">Board Name</TableHead>
													<TableHead className="text-white text-xs">Type</TableHead>
													<TableHead className="text-white text-xs text-center">Courses</TableHead>
													<TableHead className="text-white text-xs">From</TableHead>
													<TableHead className="text-white text-xs">To</TableHead>
													<TableHead className="text-white text-xs text-right">Action</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{boards.map((b, idx) => (
													<TableRow key={b.board_code} className={cn(idx % 2 === 0 ? 'bg-white dark:bg-slate-950' : 'bg-slate-50/70 dark:bg-slate-900/30')}>
														<TableCell className="text-xs font-medium">{b.board_code}</TableCell>
														<TableCell className="text-xs">{b.board_name}</TableCell>
														<TableCell className="text-xs">{b.board_type || '-'}</TableCell>
														<TableCell className="text-xs text-center">{b.course_count}</TableCell>
														<TableCell className="text-xs">{b.window?.from_date || <span className="text-muted-foreground">—</span>}</TableCell>
														<TableCell className="text-xs">{b.window?.to_date || <span className="text-muted-foreground">—</span>}</TableCell>
														<TableCell className="text-xs text-right">
															<Button size="sm" variant="outline" onClick={() => openWindowSheet(b)}>
																{b.window ? 'Edit' : 'Set'}
															</Button>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								)}
							</CardContent>
						</Card>
					</TabsContent>

					{/* Tab 2: Course Dates */}
					<TabsContent value="course-dates" className="space-y-4">
						<Card className="shadow-sm">
							<CardHeader className="pb-3">
								<CardTitle className="text-base">Select Board</CardTitle>
							</CardHeader>
							<CardContent>
								<Popover open={courseBoardOpen} onOpenChange={setCourseBoardOpen}>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											role="combobox"
											className="w-full md:w-[320px] justify-between h-9 text-left text-xs truncate"
											disabled={boardsWithWindow.length === 0}
										>
											<span className="flex-1 pr-2 truncate">
												{courseBoardCode
													? (boards.find(b => b.board_code === courseBoardCode)?.board_name || courseBoardCode)
													: boardsWithWindow.length === 0
														? 'Set a board window first'
														: 'Select board'}
											</span>
											<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[320px] p-0" align="start">
										<Command>
											<CommandInput placeholder="Search board..." className="h-8 text-xs" />
											<CommandEmpty className="text-xs py-4">No board found.</CommandEmpty>
											<CommandGroup className="max-h-56 overflow-auto">
												{boardsWithWindow.map(b => (
													<CommandItem
														key={b.board_code}
														value={`${b.board_code} ${b.board_name}`}
														onSelect={() => {
															setCourseBoardCode(b.board_code)
															setCourseBoardOpen(false)
														}}
														className="py-2 text-xs"
													>
														<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', courseBoardCode === b.board_code ? 'opacity-100' : 'opacity-0')} />
														<span className="flex-1">
															{b.board_name}
															<span className="text-muted-foreground ml-1">({b.window?.from_date} → {b.window?.to_date})</span>
														</span>
													</CommandItem>
												))}
											</CommandGroup>
										</Command>
									</PopoverContent>
								</Popover>

								{currentWindow && (
									<p className="mt-2 text-xs text-muted-foreground">
										Valuation window: <span className="font-medium text-foreground">{currentWindow.from_date}</span> to <span className="font-medium text-foreground">{currentWindow.to_date}</span>
									</p>
								)}
							</CardContent>
						</Card>

						{courseBoardCode && (
							<Card className="shadow-md">
								<CardHeader className="pb-3">
									<div className="flex items-center justify-between flex-wrap gap-2">
										<CardTitle className="text-base">
											Courses in {boards.find(b => b.board_code === courseBoardCode)?.board_name}
										</CardTitle>
										<div className="flex items-center gap-2 flex-wrap">
											<Input
												type="date"
												value={bulkDate}
												onChange={e => setBulkDate(e.target.value)}
												min={currentWindow?.from_date}
												max={currentWindow?.to_date}
												className="h-8 text-xs w-[150px]"
												placeholder="Bulk date"
											/>
											<Button
												size="sm"
												variant="outline"
												onClick={applyBulkDate}
												disabled={selectedCourseIds.size === 0 || !bulkDate}
											>
												Apply to {selectedCourseIds.size} selected
											</Button>
											<Button
												size="sm"
												onClick={saveCourseDates}
												disabled={Object.keys(dirtyDates).length === 0 || savingCourseDates}
												className="bg-violet-600 hover:bg-violet-700"
											>
												{savingCourseDates ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
												Save ({Object.keys(dirtyDates).length})
											</Button>
										</div>
									</div>
								</CardHeader>
								<CardContent className="pt-0">
									{loadingCourses ? (
										<div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
											<Loader2 className="h-4 w-4 animate-spin" />
											<span className="text-sm">Loading courses...</span>
										</div>
									) : courseDates.length === 0 ? (
										<div className="text-sm text-muted-foreground text-center py-8">
											No courses with packets for this board.
										</div>
									) : (
										<div className="border rounded-lg overflow-x-auto">
											<Table>
												<TableHeader>
													<TableRow className="bg-slate-800 hover:bg-slate-800">
														<TableHead className="text-white text-xs w-10">
															<Checkbox
																checked={selectedCourseIds.size === courseDates.length && courseDates.length > 0}
																onCheckedChange={toggleAllSelect}
															/>
														</TableHead>
														<TableHead className="text-white text-xs">Course Code</TableHead>
														<TableHead className="text-white text-xs">Course Name</TableHead>
														<TableHead className="text-white text-xs text-center">Packets</TableHead>
														<TableHead className="text-white text-xs text-center">Sheets</TableHead>
														<TableHead className="text-white text-xs">Valuation Date</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{courseDates.map((c, idx) => {
														const liveDate = dirtyDates[c.course_id] !== undefined
															? dirtyDates[c.course_id] || ''
															: (c.valuation_date || '')
														return (
															<TableRow
																key={c.course_id}
																className={cn(
																	idx % 2 === 0 ? 'bg-white dark:bg-slate-950' : 'bg-slate-50/70 dark:bg-slate-900/30',
																	dirtyDates[c.course_id] !== undefined && 'bg-amber-50 dark:bg-amber-900/10'
																)}
															>
																<TableCell className="text-xs">
																	<Checkbox
																		checked={selectedCourseIds.has(c.course_id)}
																		onCheckedChange={() => toggleCourseSelect(c.course_id)}
																	/>
																</TableCell>
																<TableCell className="text-xs font-medium">{c.course_code}</TableCell>
																<TableCell className="text-xs">{c.course_name}</TableCell>
																<TableCell className="text-xs text-center">{c.packet_count}</TableCell>
																<TableCell className="text-xs text-center">{c.sheet_count}</TableCell>
																<TableCell className="text-xs">
																	<Input
																		type="date"
																		value={liveDate}
																		min={currentWindow?.from_date}
																		max={currentWindow?.to_date}
																		onChange={e => handleCourseDateChange(c.course_id, e.target.value)}
																		className="h-8 text-xs w-[150px]"
																	/>
																</TableCell>
															</TableRow>
														)
													})}
												</TableBody>
											</Table>
										</div>
									)}
								</CardContent>
							</Card>
						)}
					</TabsContent>
				</Tabs>
			)}

			{/* Sheet: set board window */}
			<Sheet open={windowSheetOpen} onOpenChange={setWindowSheetOpen}>
				<SheetContent className="sm:max-w-[480px]">
					<SheetHeader>
						<SheetTitle>{editingBoard?.board_name}</SheetTitle>
						<SheetDescription>Set the Central Valuation window for this board.</SheetDescription>
					</SheetHeader>
					<div className="space-y-4 mt-6">
						<div className="space-y-1.5">
							<Label className="text-xs">From date</Label>
							<Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9" />
						</div>
						<div className="space-y-1.5">
							<Label className="text-xs">To date</Label>
							<Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9" />
						</div>
					</div>
					<SheetFooter className="mt-6">
						<Button variant="outline" onClick={() => setWindowSheetOpen(false)}>Cancel</Button>
						<Button onClick={saveWindow} disabled={savingWindow} className="bg-violet-600 hover:bg-violet-700">
							{savingWindow ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
							Save Window
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</div>
	)
}
