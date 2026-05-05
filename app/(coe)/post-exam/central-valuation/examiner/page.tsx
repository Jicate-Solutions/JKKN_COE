'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
import { useToast } from '@/hooks/common/use-toast'
import { Input } from '@/components/ui/input'
import {
	UserCheck,
	Check,
	ChevronsUpDown,
	Loader2,
	X,
	CheckCircle2,
	AlertCircle,
	Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useSessionSync } from '@/hooks/use-session-sync'
import type {
	CentralValuationAllotmentRow,
	CentralValuationBoardRow,
	ExternalExaminer,
	InternalStaff,
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

type ExaminerRole = 'internal' | 'chief' | 'assistant'

export default function CentralValuationExaminerPage() {
	const { toast } = useToast()

	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [boards, setBoards] = useState<CentralValuationBoardRow[]>([])
	const [rows, setRows] = useState<CentralValuationAllotmentRow[]>([])

	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [selectedBoardCode, setSelectedBoardCode] = useState('')

	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [boardOpen, setBoardOpen] = useState(false)

	const [loadingRows, setLoadingRows] = useState(false)
	const [saveStatus, setSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})
	const [courseSearch, setCourseSearch] = useState('')
	const [courseCodeFilter, setCourseCodeFilter] = useState('')
	const [courseCodeOpen, setCourseCodeOpen] = useState(false)

	const uniqueCourseCodes = useMemo(() => {
		const seen = new Map<string, string>()
		for (const r of rows) {
			if (r.course_code && !seen.has(r.course_code)) {
				seen.set(r.course_code, r.course_name || '')
			}
		}
		return [...seen.entries()]
			.map(([code, name]) => ({ code, name }))
			.sort((a, b) => a.code.localeCompare(b.code))
	}, [rows])

	const filteredRows = useMemo(() => {
		const term = courseSearch.trim().toLowerCase()
		let out = rows
		if (courseCodeFilter) out = out.filter(r => r.course_code === courseCodeFilter)
		if (term) {
			out = out.filter(r =>
				(r.course_code || '').toLowerCase().includes(term) ||
				(r.course_name || '').toLowerCase().includes(term)
			)
		}
		return out
	}, [rows, courseSearch, courseCodeFilter])

	const effectiveInstitutionId = selectedInstitutionId || contextInstitutionId || ''

	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId])

	useEffect(() => {
		if (isReady && mustSelectInstitution) loadInstitutions()
	}, [isReady, mustSelectInstitution])

	useEffect(() => {
		if (isReady && effectiveInstitutionId) loadSessions(effectiveInstitutionId)
	}, [isReady, effectiveInstitutionId])

	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId) {
			loadBoards()
			setSelectedBoardCode('')
			setRows([])
		}
	}, [isReady, selectedSessionId, effectiveInstitutionId])

	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId && selectedBoardCode) {
			loadRows()
		} else {
			setRows([])
		}
		setCourseCodeFilter('')
	}, [isReady, selectedSessionId, effectiveInstitutionId, selectedBoardCode])

	const loadInstitutions = useCallback(async () => {
		try {
			const url = appendToUrl('/api/pre-exam/examiner-allotment?action=institutions')
			const r = await fetch(url)
			if (r.ok) setInstitutions(await r.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load institutions', variant: 'destructive' })
		}
	}, [appendToUrl, toast])

	const loadSessions = useCallback(async (institutionId: string) => {
		try {
			const url = appendToUrl(`/api/pre-exam/examiner-allotment?action=sessions&institutionId=${institutionId}`)
			const r = await fetch(url)
			if (r.ok) setSessions(await r.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load sessions', variant: 'destructive' })
		}
	}, [appendToUrl, toast])

	const loadBoards = useCallback(async () => {
		try {
			const r = await fetch(`/api/post-exam/central-valuation/boards?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}`)
			if (r.ok) setBoards(await r.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load boards', variant: 'destructive' })
		}
	}, [effectiveInstitutionId, selectedSessionId, toast])

	const loadRows = useCallback(async () => {
		try {
			setLoadingRows(true)
			const r = await fetch(`/api/post-exam/central-valuation/allotment?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}&board_code=${selectedBoardCode}`)
			if (!r.ok) throw new Error('Failed')
			setRows(await r.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load courses', variant: 'destructive' })
		} finally {
			setLoadingRows(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, selectedBoardCode, toast])

	const saveRow = useCallback(async (row: CentralValuationAllotmentRow) => {
		setSaveStatus(prev => ({ ...prev, [row.packet_id]: 'saving' }))
		try {
			const r = await fetch('/api/post-exam/central-valuation/allotment', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: effectiveInstitutionId,
					examination_session_id: selectedSessionId,
					packet_id: row.packet_id,
					internal: row.internal_examiner,
					external_examiner_id: row.external_examiner?.examiner_id || null,
					chief: row.chief_examiner,
					assistant: row.assistant_examiner,
				}),
			})
			if (!r.ok) throw new Error('Failed')
			setSaveStatus(prev => ({ ...prev, [row.packet_id]: 'saved' }))
			setTimeout(() => {
				setSaveStatus(prev => {
					const next = { ...prev }
					delete next[row.packet_id]
					return next
				})
			}, 2000)
		} catch {
			setSaveStatus(prev => ({ ...prev, [row.packet_id]: 'error' }))
			toast({ title: '❌ Save failed', description: `Failed to save ${row.course_code} P${row.packet_index}/${row.total_packets}`, variant: 'destructive' })
		}
	}, [effectiveInstitutionId, selectedSessionId, toast])

	const updateRowLocal = (packetId: string, patch: Partial<CentralValuationAllotmentRow>) => {
		setRows(prev => prev.map(r => {
			if (r.packet_id !== packetId) return r
			const updated = { ...r, ...patch }
			const evaluatorSet = Boolean(updated.internal_examiner || updated.external_examiner)
			updated.status = !evaluatorSet ? 'Not Assigned' : updated.chief_examiner ? 'Fully Allotted' : 'Paper Evaluator Set'
			return updated
		}))
	}

	const setInternal = (row: CentralValuationAllotmentRow, staff: InternalStaff | null) => {
		const patch: Partial<CentralValuationAllotmentRow> = { internal_examiner: staff }
		if (staff) patch.external_examiner = null
		updateRowLocal(row.packet_id, patch)
		const updated = { ...row, ...patch }
		saveRow(updated as CentralValuationAllotmentRow)
	}

	const setExternal = (row: CentralValuationAllotmentRow, ext: ExternalExaminer | null) => {
		const patch: Partial<CentralValuationAllotmentRow> = { external_examiner: ext }
		if (ext) patch.internal_examiner = null
		updateRowLocal(row.packet_id, patch)
		const updated = { ...row, ...patch }
		saveRow(updated as CentralValuationAllotmentRow)
	}

	const setChief = (row: CentralValuationAllotmentRow, staff: InternalStaff | null) => {
		updateRowLocal(row.packet_id, { chief_examiner: staff })
		const updated = { ...row, chief_examiner: staff }
		saveRow(updated as CentralValuationAllotmentRow)
	}

	const setAssistant = (row: CentralValuationAllotmentRow, staff: InternalStaff | null) => {
		updateRowLocal(row.packet_id, { assistant_examiner: staff })
		const updated = { ...row, assistant_examiner: staff }
		saveRow(updated as CentralValuationAllotmentRow)
	}

	return (
		<div className="space-y-4">
			<Card className="shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-base flex items-center gap-2">
						<UserCheck className="h-4 w-4 text-emerald-600" />
						Central Valuation - Examiner Allotment
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
						{mustSelectInstitution && (
							<div className="space-y-1.5">
								<Label className="text-xs">Institution</Label>
								<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
									<PopoverTrigger asChild>
										<Button variant="outline" role="combobox" className="w-full justify-between h-9 text-xs">
											<span className="flex-1 pr-2 truncate">
												{selectedInstitutionId ? institutions.find(i => i.id === selectedInstitutionId)?.name : 'Select institution'}
											</span>
											<ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[320px] p-0" align="start">
										<Command>
											<CommandInput placeholder="Search..." className="h-8 text-xs" />
											<CommandEmpty>No institution.</CommandEmpty>
											<CommandGroup className="max-h-56 overflow-auto">
												{institutions.map(i => (
													<CommandItem key={i.id} onSelect={() => { setSelectedInstitutionId(i.id); setInstitutionOpen(false) }} className="py-2 text-xs">
														<Check className={cn('mr-2 h-3.5 w-3.5', selectedInstitutionId === i.id ? 'opacity-100' : 'opacity-0')} />
														{i.name}
													</CommandItem>
												))}
											</CommandGroup>
										</Command>
									</PopoverContent>
								</Popover>
							</div>
						)}

						<div className="space-y-1.5">
							<Label className="text-xs">Session</Label>
							<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
								<PopoverTrigger asChild>
									<Button variant="outline" role="combobox" className="w-full justify-between h-9 text-xs" disabled={!effectiveInstitutionId}>
										<span className="flex-1 pr-2 truncate">
											{selectedSessionId ? sessions.find(s => s.id === selectedSessionId)?.session_name : 'Select session'}
										</span>
										<ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[320px] p-0" align="start">
									<Command>
										<CommandInput placeholder="Search..." className="h-8 text-xs" />
										<CommandEmpty>No session.</CommandEmpty>
										<CommandGroup className="max-h-56 overflow-auto">
											{sessions.map(s => (
												<CommandItem key={s.id} onSelect={() => { setSelectedSessionId(s.id); setSessionOpen(false) }} className="py-2 text-xs">
													<Check className={cn('mr-2 h-3.5 w-3.5', selectedSessionId === s.id ? 'opacity-100' : 'opacity-0')} />
													{s.session_name}
												</CommandItem>
											))}
										</CommandGroup>
									</Command>
								</PopoverContent>
							</Popover>
						</div>

						<div className="space-y-1.5">
							<Label className="text-xs">Board</Label>
							<Popover open={boardOpen} onOpenChange={setBoardOpen}>
								<PopoverTrigger asChild>
									<Button variant="outline" role="combobox" className="w-full justify-between h-9 text-xs" disabled={!selectedSessionId}>
										<span className="flex-1 pr-2 truncate">
											{selectedBoardCode ? boards.find(b => b.board_code === selectedBoardCode)?.board_name : 'Select board'}
										</span>
										<ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[320px] p-0" align="start">
									<Command>
										<CommandInput placeholder="Search..." className="h-8 text-xs" />
										<CommandEmpty>No board.</CommandEmpty>
										<CommandGroup className="max-h-56 overflow-auto">
											{boards.map(b => (
												<CommandItem key={b.board_code} onSelect={() => { setSelectedBoardCode(b.board_code); setBoardOpen(false) }} className="py-2 text-xs">
													<Check className={cn('mr-2 h-3.5 w-3.5', selectedBoardCode === b.board_code ? 'opacity-100' : 'opacity-0')} />
													{b.board_name}
												</CommandItem>
											))}
										</CommandGroup>
									</Command>
								</PopoverContent>
							</Popover>
						</div>

						<div className="space-y-1.5">
							<Label className="text-xs">Course</Label>
							<Popover open={courseCodeOpen} onOpenChange={setCourseCodeOpen}>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										role="combobox"
										className="w-full justify-between h-9 text-xs"
										disabled={!selectedBoardCode || uniqueCourseCodes.length === 0}
									>
										<span className="flex-1 pr-2 truncate">
											{courseCodeFilter
												? (() => {
													const m = uniqueCourseCodes.find(u => u.code === courseCodeFilter)
													return m?.name ? `${courseCodeFilter} — ${m.name}` : courseCodeFilter
												})()
												: !selectedBoardCode
													? 'Pick a board first'
													: uniqueCourseCodes.length === 0
														? 'No courses'
														: `All courses (${uniqueCourseCodes.length})`}
										</span>
										<ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[320px] p-0" align="start">
									<Command>
										<CommandInput placeholder="Search course..." className="h-8 text-xs" />
										<CommandEmpty>No course.</CommandEmpty>
										<CommandGroup className="max-h-56 overflow-auto">
											<CommandItem
												key="__all__"
												value="all courses"
												onSelect={() => { setCourseCodeFilter(''); setCourseCodeOpen(false) }}
												className="py-2 text-xs"
											>
												<Check className={cn('mr-2 h-3.5 w-3.5', !courseCodeFilter ? 'opacity-100' : 'opacity-0')} />
												<span className="flex-1 italic text-muted-foreground">All courses</span>
											</CommandItem>
											{uniqueCourseCodes.map(u => (
												<CommandItem
													key={u.code}
													value={`${u.code} ${u.name}`}
													onSelect={() => { setCourseCodeFilter(u.code); setCourseCodeOpen(false) }}
													className="py-2 text-xs"
												>
													<Check className={cn('mr-2 h-3.5 w-3.5', courseCodeFilter === u.code ? 'opacity-100' : 'opacity-0')} />
													<span className="flex-1">
														<span className="font-medium">{u.code}</span>
														<span className="text-muted-foreground ml-2">{u.name}</span>
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

			{selectedBoardCode && (
				<Card className="shadow-md">
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between flex-wrap gap-2">
							<div className="flex items-center gap-2">
								<CardTitle className="text-base">Packet Allotments</CardTitle>
								<Badge variant="outline">{filteredRows.length} / {rows.length} packets</Badge>
							</div>
							<div className="relative">
								<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
								<Input
									value={courseSearch}
									onChange={e => setCourseSearch(e.target.value)}
									placeholder="Filter by course code/name..."
									className="h-8 text-xs pl-6 w-[240px]"
								/>
							</div>
						</div>
					</CardHeader>
					<CardContent className="pt-0">
						{loadingRows ? (
							<div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								<span className="text-sm">Loading...</span>
							</div>
						) : rows.length === 0 ? (
							<div className="text-sm text-muted-foreground text-center py-8">
								No packets generated for this board yet.
							</div>
						) : (
							<div className="border rounded-lg overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow className="bg-slate-800 hover:bg-slate-800">
											<TableHead className="text-white text-xs w-10">#</TableHead>
											<TableHead className="text-white text-xs min-w-[140px]">Course Code</TableHead>
											<TableHead className="text-white text-xs min-w-[180px]">Course Name</TableHead>
											<TableHead className="text-white text-xs">Date</TableHead>
											<TableHead className="text-white text-xs text-center">Packet</TableHead>
											<TableHead className="text-white text-xs text-center">Sheets</TableHead>
											<TableHead className="text-white text-xs min-w-[220px]">Internal Examiner</TableHead>
											<TableHead className="text-white text-xs min-w-[220px]">External Examiner</TableHead>
											<TableHead className="text-white text-xs min-w-[220px]">Chief Examiner</TableHead>
											<TableHead className="text-white text-xs min-w-[220px]">Assistant Examiner</TableHead>
											<TableHead className="text-white text-xs">Status</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{filteredRows.length === 0 && (
											<TableRow>
												<TableCell colSpan={11} className="text-xs text-center text-muted-foreground py-4">
													No packets match &quot;{courseSearch}&quot;
												</TableCell>
											</TableRow>
										)}
										{filteredRows.map((row, idx) => {
											const prev = idx > 0 ? filteredRows[idx - 1] : null
											const isFirstOfCourse = !prev || prev.course_id !== row.course_id
											return (
												<TableRow key={row.packet_id} className={cn(idx % 2 === 0 ? 'bg-white dark:bg-slate-950' : 'bg-slate-50/70 dark:bg-slate-900/30')}>
													<TableCell className="text-xs">{idx + 1}</TableCell>
													<TableCell className="text-xs font-medium">
														{isFirstOfCourse ? row.course_code : <span className="text-muted-foreground/60">{row.course_code}</span>}
													</TableCell>
													<TableCell className="text-xs">
														{isFirstOfCourse ? row.course_name : <span className="text-muted-foreground/60">{row.course_name}</span>}
													</TableCell>
													<TableCell className="text-xs whitespace-nowrap">{row.valuation_date || <span className="text-muted-foreground">—</span>}</TableCell>
													<TableCell className="text-xs text-center">
														<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-mono">
															{row.packet_index}/{row.total_packets}
														</Badge>
													</TableCell>
													<TableCell className="text-xs text-center">{row.sheet_count}</TableCell>
													<TableCell className="text-xs">
														<StaffCombobox
															value={row.internal_examiner}
															onChange={staff => setInternal(row, staff)}
															institutionsId={effectiveInstitutionId}
															disabled={!!row.external_examiner}
															disabledReason="External assigned"
														/>
													</TableCell>
													<TableCell className="text-xs">
														<ExaminerCombobox
															value={row.external_examiner}
															onChange={ext => setExternal(row, ext)}
															institutionsId={effectiveInstitutionId}
															boardCode={row.board_code}
															disabled={!!row.internal_examiner}
															disabledReason="Internal assigned"
														/>
													</TableCell>
													<TableCell className="text-xs">
														<StaffCombobox
															value={row.chief_examiner}
															onChange={staff => setChief(row, staff)}
															institutionsId={effectiveInstitutionId}
														/>
													</TableCell>
													<TableCell className="text-xs">
														<StaffCombobox
															value={row.assistant_examiner}
															onChange={staff => setAssistant(row, staff)}
															institutionsId={effectiveInstitutionId}
														/>
													</TableCell>
													<TableCell className="text-xs whitespace-nowrap">
														{saveStatus[row.packet_id] === 'saving' ? (
															<Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving</Badge>
														) : saveStatus[row.packet_id] === 'saved' ? (
															<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" /> Saved</Badge>
														) : row.status === 'Fully Allotted' ? (
															<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Fully Allotted</Badge>
														) : row.status === 'Paper Evaluator Set' ? (
															<Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Evaluator Set</Badge>
														) : (
															<Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">Not Assigned</Badge>
														)}
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
		</div>
	)
}

/* --------------------------------------------------------------------------
 * StaffCombobox — search MyJKKN staff
 * ------------------------------------------------------------------------ */

function StaffCombobox({
	value,
	onChange,
	institutionsId,
	disabled,
	disabledReason,
}: {
	value: InternalStaff | null
	onChange: (staff: InternalStaff | null) => void
	institutionsId: string
	disabled?: boolean
	disabledReason?: string
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')
	const [results, setResults] = useState<InternalStaff[]>([])
	const [loading, setLoading] = useState(false)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		if (!open) return
		if (timerRef.current) clearTimeout(timerRef.current)
		timerRef.current = setTimeout(async () => {
			try {
				setLoading(true)
				const r = await fetch(`/api/post-exam/central-valuation/staff-search?institutions_id=${institutionsId}&search=${encodeURIComponent(search)}`)
				if (r.ok) setResults(await r.json())
			} finally {
				setLoading(false)
			}
		}, 300)
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [open, search, institutionsId])

	return (
		<div className="flex items-center gap-1 w-full">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						className="flex-1 min-w-0 justify-between h-8 text-xs truncate"
						disabled={disabled}
						title={disabled ? disabledReason : value?.staff_name}
					>
						<span className="flex-1 pr-2 truncate text-left">
							{value ? value.staff_name : disabled ? disabledReason : 'Select staff'}
						</span>
						<ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[320px] p-0" align="start">
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search staff..."
							className="h-8 text-xs"
							value={search}
							onValueChange={setSearch}
						/>
						{loading ? (
							<div className="py-4 text-center text-xs text-muted-foreground">
								<Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" />
								Loading...
							</div>
						) : (
							<>
								<CommandEmpty className="py-4 text-xs text-center">No staff found.</CommandEmpty>
								<CommandGroup className="max-h-56 overflow-auto">
									{results.map(s => (
										<CommandItem
											key={s.staff_id}
											value={s.staff_id}
											onSelect={() => {
												onChange(s)
												setOpen(false)
											}}
											className="py-2 text-xs"
										>
											<div className="flex-1">
												<div className="font-medium">{s.staff_name}</div>
												{s.staff_designation && (
													<div className="text-[10px] text-muted-foreground">{s.staff_designation}</div>
												)}
											</div>
										</CommandItem>
									))}
								</CommandGroup>
							</>
						)}
					</Command>
				</PopoverContent>
			</Popover>
			{value && !disabled && (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-7 shrink-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
					title="Remove examiner"
					onPointerDown={(e) => e.stopPropagation()}
					onClick={(e) => {
						e.preventDefault()
						e.stopPropagation()
						onChange(null)
					}}
				>
					<X className="h-3.5 w-3.5" />
				</Button>
			)}
		</div>
	)
}

/* --------------------------------------------------------------------------
 * ExaminerCombobox — search external examiners
 * ------------------------------------------------------------------------ */

function ExaminerCombobox({
	value,
	onChange,
	institutionsId,
	boardCode,
	disabled,
	disabledReason,
}: {
	value: ExternalExaminer | null
	onChange: (ext: ExternalExaminer | null) => void
	institutionsId: string
	boardCode?: string
	disabled?: boolean
	disabledReason?: string
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')
	const [results, setResults] = useState<ExternalExaminer[]>([])
	const [loading, setLoading] = useState(false)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		if (!open) return
		if (timerRef.current) clearTimeout(timerRef.current)
		timerRef.current = setTimeout(async () => {
			try {
				setLoading(true)
				const params = new URLSearchParams()
				if (search) params.set('search', search)
				if (boardCode) params.set('board_code', boardCode)
				const r = await fetch(`/api/post-exam/central-valuation/examiner-search?${params.toString()}`)
				if (r.ok) setResults(await r.json())
			} finally {
				setLoading(false)
			}
		}, 300)
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [open, search, boardCode])

	return (
		<div className="flex items-center gap-1 w-full">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						className="flex-1 min-w-0 justify-between h-8 text-xs truncate"
						disabled={disabled}
						title={disabled ? disabledReason : value?.full_name}
					>
						<span className="flex-1 pr-2 truncate text-left">
							{value ? value.full_name : disabled ? disabledReason : 'Select external'}
						</span>
						<ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[320px] p-0" align="start">
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search examiner..."
							className="h-8 text-xs"
							value={search}
							onValueChange={setSearch}
						/>
						{loading ? (
							<div className="py-4 text-center text-xs text-muted-foreground">
								<Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" />
								Loading...
							</div>
						) : (
							<>
								<CommandEmpty className="py-4 text-xs text-center">No examiner found.</CommandEmpty>
								<CommandGroup className="max-h-56 overflow-auto">
									{results.map(e => (
										<CommandItem
											key={e.examiner_id}
											value={e.examiner_id}
											onSelect={() => {
												onChange(e)
												setOpen(false)
											}}
											className="py-2 text-xs"
										>
											<div className="flex-1">
												<div className="font-medium">{e.full_name}</div>
												{e.institution_name && (
													<div className="text-[10px] text-muted-foreground">{e.institution_name}</div>
												)}
											</div>
										</CommandItem>
									))}
								</CommandGroup>
							</>
						)}
					</Command>
				</PopoverContent>
			</Popover>
			{value && !disabled && (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-7 shrink-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
					title="Remove external examiner"
					onPointerDown={(e) => e.stopPropagation()}
					onClick={(e) => {
						e.preventDefault()
						e.stopPropagation()
						onChange(null)
					}}
				>
					<X className="h-3.5 w-3.5" />
				</Button>
			)}
		</div>
	)
}
