'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
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
import {
	Check,
	ChevronsUpDown,
	Loader2,
	Download,
	FileBarChart,
	UserCheck,
	Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useSessionSync } from '@/hooks/use-session-sync'
import { downloadCvPassPercentagePdf } from '@/lib/utils/generate-cv-pass-percentage-pdf'
import { downloadCvExaminerValuationPdf } from '@/lib/utils/generate-cv-examiner-valuation-pdf'
import { downloadCvPanelOfExaminersPdf } from '@/lib/utils/generate-cv-panel-of-examiners-pdf'
import { fetchImageAsBase64 } from '@/lib/utils/generate-semester-marksheet-pdf'

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

interface BoardOption {
	board_code: string
	board_name: string
}

interface PassPercentageRow {
	semester: number | string
	course_code: string
	course_name: string
	total_students: number
	appeared: number
	passed: number
	pass_percentage: number
}

interface ExaminerValuationRow {
	serial_number: number
	course_code: string
	bundle_no: string
	pocket_no: string
	papers_valued: number
	band_0_10: number
	band_11_20: number
	band_21_25: number
	band_26_29: number
	above_30: number
	pass_count: number
	fail_count: number
	cumulative_total: number
}

interface ExaminerValuationData {
	board_name: string
	examiner_name: string
	examiner_designation: string
	rows: ExaminerValuationRow[]
	totals: ExaminerValuationRow
}

interface PanelExaminerRow {
	serial_number: number
	examiner_name: string
	examiner_designation: string
	examiner_institution: string
	course_code: string
	bundle_no: string
	pocket_no: string
	papers_session: string
	cumulative_total: string | number
}

interface PanelChief {
	chief_name: string
	chief_designation: string
	rows: PanelExaminerRow[]
}

interface PanelData {
	board_name: string
	valuation_from_date: string | null
	valuation_to_date: string | null
	chiefs: PanelChief[]
}

interface ExaminerOption {
	examiner_key: string
	examiner_type: 'internal' | 'external' | 'chief' | 'assistant'
	examiner_name: string
	examiner_designation: string
}

export default function CvReportPage() {
	const { toast } = useToast()

	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()

	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [boards, setBoards] = useState<BoardOption[]>([])
	const [examiners, setExaminers] = useState<ExaminerOption[]>([])

	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const [selectedBoardCode, setSelectedBoardCode] = useState('')
	const [selectedExaminerKey, setSelectedExaminerKey] = useState('')

	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [boardOpen, setBoardOpen] = useState(false)
	const [examinerOpen, setExaminerOpen] = useState(false)

	const [activeTab, setActiveTab] = useState<'pass-percentage' | 'examiner' | 'panel'>('pass-percentage')

	const [passPercentageRows, setPassPercentageRows] = useState<PassPercentageRow[]>([])
	const [examinerData, setExaminerData] = useState<ExaminerValuationData | null>(null)
	const [panelData, setPanelData] = useState<PanelData | null>(null)

	const [loadingPass, setLoadingPass] = useState(false)
	const [loadingExaminer, setLoadingExaminer] = useState(false)
	const [loadingPanel, setLoadingPanel] = useState(false)
	const [downloading, setDownloading] = useState(false)

	const effectiveInstitutionId = selectedInstitutionId || contextInstitutionId || ''

	const selectedInstitution = useMemo(
		() => institutions.find(i => i.id === effectiveInstitutionId),
		[institutions, effectiveInstitutionId]
	)
	const selectedSession = useMemo(
		() => sessions.find(s => s.id === selectedSessionId),
		[sessions, selectedSessionId]
	)
	const selectedBoard = useMemo(
		() => boards.find(b => b.board_code === selectedBoardCode),
		[boards, selectedBoardCode]
	)
	const selectedExaminer = useMemo(
		() => examiners.find(e => e.examiner_key === selectedExaminerKey),
		[examiners, selectedExaminerKey]
	)

	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId])

	const loadInstitutions = useCallback(async () => {
		try {
			const url = appendToUrl('/api/pre-exam/examiner-allotment?action=institutions')
			const r = await fetch(url)
			if (r.ok) setInstitutions(await r.json())
		} catch {
			toast({ title: 'Error', description: 'Failed to load institutions', variant: 'destructive' })
		}
	}, [appendToUrl, toast])

	const loadSessions = useCallback(async (institutionId: string) => {
		try {
			const url = appendToUrl(`/api/pre-exam/examiner-allotment?action=sessions&institutionId=${institutionId}`)
			const r = await fetch(url)
			if (r.ok) setSessions(await r.json())
		} catch {
			toast({ title: 'Error', description: 'Failed to load sessions', variant: 'destructive' })
		}
	}, [appendToUrl, toast])

	const loadBoards = useCallback(async () => {
		if (!effectiveInstitutionId || !selectedSessionId) return
		try {
			const r = await fetch(`/api/post-exam/central-valuation/boards?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}`)
			if (r.ok) {
				const data = await r.json()
				setBoards((data || []).map((b: any) => ({ board_code: b.board_code, board_name: b.board_name })))
			}
		} catch {
			toast({ title: 'Error', description: 'Failed to load boards', variant: 'destructive' })
		}
	}, [effectiveInstitutionId, selectedSessionId, toast])

	const loadExaminers = useCallback(async () => {
		if (!effectiveInstitutionId || !selectedSessionId || !selectedBoardCode) return
		try {
			const r = await fetch(
				`/api/reports/cv-report/examiner-valuation?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}&board_code=${selectedBoardCode}&action=list-examiners`
			)
			if (r.ok) setExaminers(await r.json())
		} catch {
			toast({ title: 'Error', description: 'Failed to load examiners', variant: 'destructive' })
		}
	}, [effectiveInstitutionId, selectedSessionId, selectedBoardCode, toast])

	const loadPassPercentage = useCallback(async () => {
		if (!effectiveInstitutionId || !selectedSessionId || !selectedBoardCode) return
		try {
			setLoadingPass(true)
			const r = await fetch(
				`/api/reports/cv-report/pass-percentage?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}&board_code=${selectedBoardCode}`
			)
			if (!r.ok) throw new Error('Failed')
			setPassPercentageRows(await r.json())
		} catch {
			toast({ title: 'Error', description: 'Failed to load pass percentage', variant: 'destructive' })
			setPassPercentageRows([])
		} finally {
			setLoadingPass(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, selectedBoardCode, toast])

	const loadExaminerValuation = useCallback(async () => {
		if (!effectiveInstitutionId || !selectedSessionId || !selectedBoardCode || !selectedExaminerKey) return
		try {
			setLoadingExaminer(true)
			const r = await fetch(
				`/api/reports/cv-report/examiner-valuation?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}&board_code=${selectedBoardCode}&examiner_key=${encodeURIComponent(selectedExaminerKey)}`
			)
			if (!r.ok) throw new Error('Failed')
			setExaminerData(await r.json())
		} catch {
			toast({ title: 'Error', description: 'Failed to load examiner valuation', variant: 'destructive' })
			setExaminerData(null)
		} finally {
			setLoadingExaminer(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, selectedBoardCode, selectedExaminerKey, toast])

	const loadPanelOfExaminers = useCallback(async () => {
		if (!effectiveInstitutionId || !selectedSessionId || !selectedBoardCode) return
		try {
			setLoadingPanel(true)
			const r = await fetch(
				`/api/reports/cv-report/panel-of-examiners?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}&board_code=${selectedBoardCode}`
			)
			if (!r.ok) throw new Error('Failed')
			const data = await r.json()
			console.log('[cv-report/panel-ui] Loaded panel data:', {
				board_name: data.board_name,
				chiefs_count: data.chiefs?.length || 0,
				chiefs: data.chiefs?.map((c: any) => ({ name: c.chief_name, examiner_rows: c.rows.length }))
			})
			setPanelData(data)
		} catch {
			toast({ title: 'Error', description: 'Failed to load panel of examiners', variant: 'destructive' })
			setPanelData(null)
		} finally {
			setLoadingPanel(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, selectedBoardCode, toast])

	useEffect(() => {
		if (isReady && mustSelectInstitution) loadInstitutions()
	}, [isReady, mustSelectInstitution, loadInstitutions])

	useEffect(() => {
		if (isReady && effectiveInstitutionId) loadSessions(effectiveInstitutionId)
	}, [isReady, effectiveInstitutionId, loadSessions])

	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId) {
			loadBoards()
			setSelectedBoardCode('')
			setSelectedExaminerKey('')
			setPassPercentageRows([])
			setExaminerData(null)
			setPanelData(null)
		}
	}, [isReady, selectedSessionId, effectiveInstitutionId, loadBoards])

	useEffect(() => {
		if (selectedBoardCode) {
			loadExaminers()
			setSelectedExaminerKey('')
			if (activeTab === 'pass-percentage') loadPassPercentage()
			if (activeTab === 'panel') loadPanelOfExaminers()
		}
	}, [selectedBoardCode, activeTab, loadExaminers, loadPassPercentage, loadPanelOfExaminers])

	useEffect(() => {
		if (activeTab === 'examiner' && selectedExaminerKey) loadExaminerValuation()
	}, [activeTab, selectedExaminerKey, loadExaminerValuation])

	useEffect(() => {
		if (activeTab === 'pass-percentage' && selectedBoardCode && passPercentageRows.length === 0) loadPassPercentage()
		if (activeTab === 'panel' && selectedBoardCode && !panelData) loadPanelOfExaminers()
	}, [activeTab])

	const handleDownloadPdf = useCallback(async () => {
		if (!selectedInstitution || !selectedSession || !selectedBoard) {
			toast({ title: 'Missing selection', description: 'Select institution, session and board.', variant: 'destructive' })
			return
		}
		setDownloading(true)
		try {
			if (activeTab === 'pass-percentage') {
				if (passPercentageRows.length === 0) {
					toast({ title: 'No data', description: 'No pass percentage data to export.', variant: 'destructive' })
					return
				}
				await downloadCvPassPercentagePdf({
					institution: { name: selectedInstitution.name, code: selectedInstitution.institution_code },
					session: { name: selectedSession.session_name, code: selectedSession.session_code },
					board: { code: selectedBoard.board_code, name: selectedBoard.board_name },
					rows: passPercentageRows,
				})
			} else if (activeTab === 'examiner') {
				if (!examinerData) {
					toast({ title: 'No data', description: 'No examiner data to export.', variant: 'destructive' })
					return
				}
				await downloadCvExaminerValuationPdf({
					institution: { name: selectedInstitution.name, code: selectedInstitution.institution_code },
					session: { name: selectedSession.session_name, code: selectedSession.session_code },
					board: { code: selectedBoard.board_code, name: selectedBoard.board_name },
					data: examinerData,
				})
			} else if (activeTab === 'panel') {
				if (!panelData) {
					toast({ title: 'No data', description: 'No panel data to export.', variant: 'destructive' })
					return
				}
				await downloadCvPanelOfExaminersPdf({
					institution: { name: selectedInstitution.name, code: selectedInstitution.institution_code },
					session: { name: selectedSession.session_name, code: selectedSession.session_code },
					board: { code: selectedBoard.board_code, name: selectedBoard.board_name },
					data: panelData,
				})
			}
			toast({ title: 'Downloaded', description: 'PDF generated successfully' })
		} catch (e: any) {
			console.error('[cv-report] PDF generation failed', e)
			toast({ title: 'PDF Error', description: e?.message || 'Failed to generate PDF', variant: 'destructive' })
		} finally {
			setDownloading(false)
		}
	}, [activeTab, selectedInstitution, selectedSession, selectedBoard, passPercentageRows, examinerData, panelData, toast])

	const passTotals = useMemo(() => {
		const total = passPercentageRows.reduce((s, r) => s + (r.total_students || 0), 0)
		const appeared = passPercentageRows.reduce((s, r) => s + (r.appeared || 0), 0)
		const passed = passPercentageRows.reduce((s, r) => s + (r.passed || 0), 0)
		const pct = appeared > 0 ? Math.round((passed / appeared) * 1000) / 10 : 0
		return { total, appeared, passed, pct }
	}, [passPercentageRows])

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<div className='flex flex-col gap-6 p-6'>
					<div>
						<h1 className='text-2xl font-bold tracking-tight'>Central Valuation Report</h1>
						<p className='text-muted-foreground text-sm'>
							Pass percentage, examiner valuation, and panel of examiners reports for Central Valuation.
						</p>
					</div>

			<Card>
				<CardHeader>
					<CardTitle className='text-base'>Filters</CardTitle>
					<CardDescription>Choose institution, session and board to load reports.</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4'>
						{mustSelectInstitution && (
							<div className='space-y-1.5'>
								<Label>Institution</Label>
								<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
									<PopoverTrigger asChild>
										<Button variant='outline' role='combobox' className='w-full justify-between'>
											{selectedInstitution?.name || 'Select institution'}
											<ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
										</Button>
									</PopoverTrigger>
									<PopoverContent className='w-[300px] p-0'>
										<Command>
											<CommandInput placeholder='Search institution...' />
											<CommandEmpty>No institution found.</CommandEmpty>
											<CommandGroup>
												{institutions.map(i => (
													<CommandItem
														key={i.id}
														value={i.name}
														onSelect={() => {
															setSelectedInstitutionId(i.id)
															setInstitutionOpen(false)
														}}
													>
														<Check className={cn('mr-2 h-4 w-4', effectiveInstitutionId === i.id ? 'opacity-100' : 'opacity-0')} />
														{i.name}
													</CommandItem>
												))}
											</CommandGroup>
										</Command>
									</PopoverContent>
								</Popover>
							</div>
						)}

						<div className='space-y-1.5'>
							<Label>Examination Session</Label>
							<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
								<PopoverTrigger asChild>
									<Button variant='outline' role='combobox' className='w-full justify-between' disabled={!effectiveInstitutionId}>
										{selectedSession?.session_name || 'Select session'}
										<ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
									</Button>
								</PopoverTrigger>
								<PopoverContent className='w-[300px] p-0'>
									<Command>
										<CommandInput placeholder='Search session...' />
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
													<Check className={cn('mr-2 h-4 w-4', selectedSessionId === s.id ? 'opacity-100' : 'opacity-0')} />
													{s.session_name}
												</CommandItem>
											))}
										</CommandGroup>
									</Command>
								</PopoverContent>
							</Popover>
						</div>

						<div className='space-y-1.5'>
							<Label>Board</Label>
							<Popover open={boardOpen} onOpenChange={setBoardOpen}>
								<PopoverTrigger asChild>
									<Button variant='outline' role='combobox' className='w-full justify-between' disabled={!selectedSessionId}>
										{selectedBoard?.board_name || 'Select board'}
										<ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
									</Button>
								</PopoverTrigger>
								<PopoverContent className='w-[300px] p-0'>
									<Command>
										<CommandInput placeholder='Search board...' />
										<CommandEmpty>No board found.</CommandEmpty>
										<CommandGroup>
											{boards.map(b => (
												<CommandItem
													key={b.board_code}
													value={b.board_name}
													onSelect={() => {
														setSelectedBoardCode(b.board_code)
														setBoardOpen(false)
													}}
												>
													<Check className={cn('mr-2 h-4 w-4', selectedBoardCode === b.board_code ? 'opacity-100' : 'opacity-0')} />
													{b.board_name}
												</CommandItem>
											))}
										</CommandGroup>
									</Command>
								</PopoverContent>
							</Popover>
						</div>

						{activeTab === 'examiner' && (
							<div className='space-y-1.5'>
								<Label>Examiner</Label>
								<Popover open={examinerOpen} onOpenChange={setExaminerOpen}>
									<PopoverTrigger asChild>
										<Button variant='outline' role='combobox' className='w-full justify-between' disabled={!selectedBoardCode}>
											{selectedExaminer?.examiner_name || 'Select examiner'}
											<ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
										</Button>
									</PopoverTrigger>
									<PopoverContent className='w-[320px] p-0'>
										<Command>
											<CommandInput placeholder='Search examiner...' />
											<CommandEmpty>No examiner found.</CommandEmpty>
											<CommandGroup>
												{examiners.map(e => (
													<CommandItem
														key={e.examiner_key}
														value={e.examiner_name}
														onSelect={() => {
															setSelectedExaminerKey(e.examiner_key)
															setExaminerOpen(false)
														}}
													>
														<Check className={cn('mr-2 h-4 w-4', selectedExaminerKey === e.examiner_key ? 'opacity-100' : 'opacity-0')} />
														<span className='flex-1'>{e.examiner_name}</span>
														<Badge variant='outline' className='ml-2 capitalize'>{e.examiner_type}</Badge>
													</CommandItem>
												))}
											</CommandGroup>
										</Command>
									</PopoverContent>
								</Popover>
							</div>
						)}
					</div>
				</CardContent>
			</Card>

			<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
				<div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
					<TabsList>
						<TabsTrigger value='pass-percentage' className='gap-2'>
							<FileBarChart className='h-4 w-4' />CV Pass Percentage
						</TabsTrigger>
						<TabsTrigger value='examiner' className='gap-2'>
							<UserCheck className='h-4 w-4' />CV for Examiner
						</TabsTrigger>
						<TabsTrigger value='panel' className='gap-2'>
							<Users className='h-4 w-4' />CV Panel of Examiners
						</TabsTrigger>
					</TabsList>
					<Button onClick={handleDownloadPdf} disabled={downloading || !selectedBoardCode}>
						{downloading ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <Download className='mr-2 h-4 w-4' />}
						Download PDF
					</Button>
				</div>

				<TabsContent value='pass-percentage' className='mt-4'>
					<Card>
						<CardHeader>
							<CardTitle className='text-base'>Pass Percentage — {selectedBoard?.board_name || 'No board selected'}</CardTitle>
							<CardDescription>Course-wise appeared, passed and pass % for the selected board.</CardDescription>
						</CardHeader>
						<CardContent>
							{!selectedBoardCode ? (
								<p className='text-muted-foreground text-sm'>Select a board to view the report.</p>
							) : loadingPass ? (
								<div className='flex items-center gap-2 text-muted-foreground text-sm'><Loader2 className='h-4 w-4 animate-spin' />Loading…</div>
							) : passPercentageRows.length === 0 ? (
								<p className='text-muted-foreground text-sm'>No published results found for this board.</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Semester</TableHead>
											<TableHead>Course Code</TableHead>
											<TableHead>Name of the Course</TableHead>
											<TableHead className='text-right'>Total</TableHead>
											<TableHead className='text-right'>Appeared</TableHead>
											<TableHead className='text-right'>Passed</TableHead>
											<TableHead className='text-right'>Pass %</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{passPercentageRows.map((r, idx) => (
											<TableRow key={`${r.course_code}-${idx}`}>
												<TableCell>{r.semester}</TableCell>
												<TableCell className='font-mono'>{r.course_code}</TableCell>
												<TableCell>{r.course_name}</TableCell>
												<TableCell className='text-right'>{r.total_students}</TableCell>
												<TableCell className='text-right'>{r.appeared}</TableCell>
												<TableCell className='text-right'>{r.passed}</TableCell>
												<TableCell className='text-right'>{r.pass_percentage}%</TableCell>
											</TableRow>
										))}
										<TableRow className='font-semibold bg-muted/50'>
											<TableCell colSpan={3}>Total</TableCell>
											<TableCell className='text-right'>{passTotals.total}</TableCell>
											<TableCell className='text-right'>{passTotals.appeared}</TableCell>
											<TableCell className='text-right'>{passTotals.passed}</TableCell>
											<TableCell className='text-right'>{passTotals.pct}%</TableCell>
										</TableRow>
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value='examiner' className='mt-4'>
					<Card>
						<CardHeader>
							<CardTitle className='text-base'>Valuation Report of the Examiner</CardTitle>
							<CardDescription>
								{examinerData ? `${examinerData.examiner_name} — ${examinerData.examiner_designation || ''}` : 'Select a board and examiner to load.'}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{!selectedBoardCode ? (
								<p className='text-muted-foreground text-sm'>Select a board first.</p>
							) : !selectedExaminerKey ? (
								<p className='text-muted-foreground text-sm'>Select an examiner to view valuation distribution.</p>
							) : loadingExaminer ? (
								<div className='flex items-center gap-2 text-muted-foreground text-sm'><Loader2 className='h-4 w-4 animate-spin' />Loading…</div>
							) : !examinerData || examinerData.rows.length === 0 ? (
								<p className='text-muted-foreground text-sm'>No valuation data found for this examiner.</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>S.No</TableHead>
											<TableHead>Course Code</TableHead>
											<TableHead>Bundle No.</TableHead>
											<TableHead>Pocket No.</TableHead>
											<TableHead className='text-right'>Papers</TableHead>
											<TableHead className='text-right'>0–10</TableHead>
											<TableHead className='text-right'>11–20</TableHead>
											<TableHead className='text-right'>21–25</TableHead>
											<TableHead className='text-right'>26–29</TableHead>
											<TableHead className='text-right'>Above 30</TableHead>
											<TableHead className='text-right'>Pass</TableHead>
											<TableHead className='text-right'>Fail</TableHead>
											<TableHead className='text-right'>Total</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{examinerData.rows.map((r) => (
											<TableRow key={r.serial_number}>
												<TableCell>{r.serial_number}</TableCell>
												<TableCell className='font-mono'>{r.course_code}</TableCell>
												<TableCell>{r.bundle_no}</TableCell>
												<TableCell>{r.pocket_no}</TableCell>
												<TableCell className='text-right'>{r.papers_valued}</TableCell>
												<TableCell className='text-right'>{r.band_0_10 || '-'}</TableCell>
												<TableCell className='text-right'>{r.band_11_20 || '-'}</TableCell>
												<TableCell className='text-right'>{r.band_21_25 || '-'}</TableCell>
												<TableCell className='text-right'>{r.band_26_29 || '-'}</TableCell>
												<TableCell className='text-right'>{r.above_30 || '-'}</TableCell>
												<TableCell className='text-right'>{r.pass_count}</TableCell>
												<TableCell className='text-right'>{r.fail_count}</TableCell>
												<TableCell className='text-right'>{r.cumulative_total}</TableCell>
											</TableRow>
										))}
										<TableRow className='font-semibold bg-muted/50'>
											<TableCell colSpan={4}>Grand Total</TableCell>
											<TableCell className='text-right'>{examinerData.totals.papers_valued}</TableCell>
											<TableCell className='text-right'>{examinerData.totals.band_0_10 || '-'}</TableCell>
											<TableCell className='text-right'>{examinerData.totals.band_11_20 || '-'}</TableCell>
											<TableCell className='text-right'>{examinerData.totals.band_21_25 || '-'}</TableCell>
											<TableCell className='text-right'>{examinerData.totals.band_26_29 || '-'}</TableCell>
											<TableCell className='text-right'>{examinerData.totals.above_30 || '-'}</TableCell>
											<TableCell className='text-right'>{examinerData.totals.pass_count}</TableCell>
											<TableCell className='text-right'>{examinerData.totals.fail_count}</TableCell>
											<TableCell className='text-right'>{examinerData.totals.cumulative_total}</TableCell>
										</TableRow>
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value='panel' className='mt-4'>
					<Card>
						<CardHeader>
							<CardTitle className='text-base'>Panel of Examiners — {panelData?.board_name || selectedBoard?.board_name || ''}</CardTitle>
							<CardDescription>
								{panelData && panelData.chiefs.length > 0
									? `${panelData.chiefs.length} Chief${panelData.chiefs.length > 1 ? 's' : ''}: ${panelData.chiefs.map(c => `${c.chief_name}${c.chief_designation ? ` (${c.chief_designation})` : ''}`).join(', ')}`
									: 'Select a board to load.'}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{!selectedBoardCode ? (
								<p className='text-muted-foreground text-sm'>Select a board first.</p>
							) : loadingPanel ? (
								<div className='flex items-center gap-2 text-muted-foreground text-sm'><Loader2 className='h-4 w-4 animate-spin' />Loading…</div>
							) : !panelData || panelData.chiefs.length === 0 || panelData.chiefs.every(c => c.rows.length === 0) ? (
								<p className='text-muted-foreground text-sm'>No examiners assigned for this board.</p>
							) : (
								<div className='space-y-8'>
									{panelData.chiefs.map((chief, chiefIdx) => (
										<div key={chiefIdx}>
											{chief.chief_name && (
												<div className='mb-4 pb-2 border-b'>
													<h3 className='font-semibold'>Chief: {chief.chief_name}</h3>
													{chief.chief_designation && <p className='text-sm text-muted-foreground'>{chief.chief_designation}</p>}
												</div>
											)}
											{chief.rows.length === 0 ? (
												<p className='text-sm text-muted-foreground italic'>No examiners assigned to this chief.</p>
											) : (
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>S.No</TableHead>
															<TableHead>Examiner</TableHead>
															<TableHead>Course Code</TableHead>
															<TableHead>Bundle</TableHead>
															<TableHead>Pocket</TableHead>
															<TableHead>Papers / Session</TableHead>
															<TableHead className='text-right'>Cumulative</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{chief.rows.map(r => (
															<TableRow key={`${chiefIdx}-${r.serial_number}`}>
																<TableCell>{r.serial_number}</TableCell>
																<TableCell>
																	<div className='font-medium'>{r.examiner_name}</div>
																	{r.examiner_designation && <div className='text-xs text-muted-foreground'>{r.examiner_designation}</div>}
																	{r.examiner_institution && <div className='text-xs text-muted-foreground'>{r.examiner_institution}</div>}
																</TableCell>
																<TableCell className='font-mono'>{r.course_code}</TableCell>
																<TableCell>{r.bundle_no}</TableCell>
																<TableCell>{r.pocket_no}</TableCell>
																<TableCell>{r.papers_session}</TableCell>
																<TableCell className='text-right'>{r.cumulative_total}</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											)}
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
			</div>
			<AppFooter />
		</SidebarInset>
	</SidebarProvider>
	)
}
