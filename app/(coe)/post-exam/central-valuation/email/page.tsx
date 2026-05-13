'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
import { useToast } from '@/hooks/common/use-toast'
import {
	ChevronDown,
	ChevronRight,
	Check,
	ChevronsUpDown,
	Mail,
	Eye,
	RefreshCw,
	Send,
	CheckCircle2,
	XCircle,
	Loader2,
	AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useSessionSync } from '@/hooks/use-session-sync'
import type {
	CentralValuationExaminerAggregateRow,
	CentralValuationExaminerType,
} from '@/types/central-valuation-email'
import type { CentralValuationBoardRow } from '@/types/central-valuation'

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

const ROLE_LABEL: Record<CentralValuationExaminerType, string> = {
	internal: 'Internal',
	external: 'External',
	chief: 'Chief',
	assistant: 'Assistant',
}

const ROLE_COLOR: Record<CentralValuationExaminerType, string> = {
	internal: 'bg-blue-50 text-blue-700 border-blue-200',
	external: 'bg-purple-50 text-purple-700 border-purple-200',
	chief: 'bg-amber-50 text-amber-700 border-amber-200',
	assistant: 'bg-slate-50 text-slate-700 border-slate-200',
}

export default function CentralValuationEmailPage() {
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
	const [rows, setRows] = useState<CentralValuationExaminerAggregateRow[]>([])

	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const { selectedSessionId, setSelectedSessionId } = useSessionSync()
	const [selectedBoardCode, setSelectedBoardCode] = useState('')

	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [boardOpen, setBoardOpen] = useState(false)

	const [loadingRows, setLoadingRows] = useState(false)
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const [roleFilter, setRoleFilter] = useState<Record<CentralValuationExaminerType, boolean>>({
		internal: true,
		external: true,
		chief: true,
		assistant: true,
	})
	const [sending, setSending] = useState(false)
	const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null)

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
		}
	}, [isReady, selectedSessionId, effectiveInstitutionId])

	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId) {
			loadRows()
		}
	}, [isReady, selectedSessionId, effectiveInstitutionId, selectedBoardCode])

	const loadInstitutions = useCallback(async () => {
		const url = appendToUrl('/api/pre-exam/examiner-allotment?action=institutions')
		const r = await fetch(url)
		if (r.ok) setInstitutions(await r.json())
	}, [appendToUrl])

	const loadSessions = useCallback(async (institutionId: string) => {
		const url = appendToUrl(`/api/pre-exam/examiner-allotment?action=sessions&institutionId=${institutionId}`)
		const r = await fetch(url)
		if (r.ok) setSessions(await r.json())
	}, [appendToUrl])

	const loadBoards = useCallback(async () => {
		const r = await fetch(`/api/post-exam/central-valuation/boards?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}`)
		if (r.ok) setBoards(await r.json())
	}, [effectiveInstitutionId, selectedSessionId])

	const loadRows = useCallback(async () => {
		try {
			setLoadingRows(true)
			let url = `/api/post-exam/central-valuation/email/assignments?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}`
			if (selectedBoardCode) url += `&board_code=${selectedBoardCode}`
			const r = await fetch(url)
			if (!r.ok) throw new Error('Failed')
			setRows(await r.json())
			setSelected(new Set())
			setExpanded(new Set())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load assignments', variant: 'destructive' })
		} finally {
			setLoadingRows(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, selectedBoardCode, toast])

	const visibleRows = rows.filter(r => roleFilter[r.examiner_type])

	const rowKey = (r: CentralValuationExaminerAggregateRow) => `${r.examiner_type}:${r.examiner_key}`

	const toggleSelect = (key: string) => {
		const next = new Set(selected)
		if (next.has(key)) next.delete(key)
		else next.add(key)
		setSelected(next)
	}

	const toggleSelectAll = () => {
		if (selected.size === visibleRows.length) setSelected(new Set())
		else setSelected(new Set(visibleRows.map(rowKey)))
	}

	const toggleExpand = (key: string) => {
		const next = new Set(expanded)
		if (next.has(key)) next.delete(key)
		else next.add(key)
		setExpanded(next)
	}

	const previewPdf = (r: CentralValuationExaminerAggregateRow) => {
		let url = `/api/post-exam/central-valuation/email/pdf-preview?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}&examiner_type=${r.examiner_type}&examiner_key=${r.examiner_key}`
		if (selectedBoardCode) url += `&board_code=${selectedBoardCode}`
		window.open(url, '_blank')
	}

	const sendSelected = async (onlyFailed = false) => {
		const targetRows = onlyFailed
			? visibleRows.filter(r => r.last_email_status === 'FAILED')
			: visibleRows.filter(r => selected.has(rowKey(r)))

		if (targetRows.length === 0) {
			toast({ title: '⚠ Nothing to send', description: 'No recipients selected' })
			return
		}

		const missingEmails = targetRows.filter(r => !r.examiner_email)
		if (missingEmails.length > 0) {
			toast({
				title: '⚠ Missing email addresses',
				description: `${missingEmails.length} examiner(s) have no email on record`,
				variant: 'destructive',
			})
		}

		const sendable = targetRows.filter(r => !!r.examiner_email)
		if (sendable.length === 0) return

		try {
			setSending(true)
			setSendProgress({ done: 0, total: sendable.length })

			const body = {
				institutions_id: effectiveInstitutionId,
				examination_session_id: selectedSessionId,
				board_code: selectedBoardCode || undefined,
				recipients: sendable.map(r => ({ examiner_type: r.examiner_type, examiner_key: r.examiner_key })),
			}

			const r = await fetch('/api/post-exam/central-valuation/email/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (!r.ok) throw new Error('Send failed')
			const result = await r.json()

			toast({
				title: '📧 Send complete',
				description: `Sent: ${result.sent} · Failed: ${result.failed}`,
				className: result.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200 text-green-800',
			})
			loadRows()
			setSelected(new Set())
		} catch (e: any) {
			toast({ title: '❌ Send failed', description: e.message, variant: 'destructive' })
		} finally {
			setSending(false)
			setSendProgress(null)
		}
	}

	return (
		<div className="space-y-4">
			<Card className="shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-base flex items-center gap-2">
						<Mail className="h-4 w-4 text-amber-600" />
						Central Valuation - Send Appointments
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						{mustSelectInstitution && (
							<div className="space-y-1.5">
								<Label className="text-xs">Institution</Label>
								<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
									<PopoverTrigger asChild>
										<Button variant="outline" role="combobox" className="w-full justify-between h-9 text-xs">
											<span className="flex-1 pr-2 truncate">
												{selectedInstitutionId ? institutions.find(i => i.id === selectedInstitutionId)?.name : 'Select'}
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
											{selectedSessionId ? sessions.find(s => s.id === selectedSessionId)?.session_name : 'Select'}
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
							<Label className="text-xs">Board (optional)</Label>
							<Popover open={boardOpen} onOpenChange={setBoardOpen}>
								<PopoverTrigger asChild>
									<Button variant="outline" role="combobox" className="w-full justify-between h-9 text-xs" disabled={!selectedSessionId}>
										<span className="flex-1 pr-2 truncate">
											{selectedBoardCode ? (() => { const b = boards.find(b => b.board_code === selectedBoardCode); return b ? `${b.board_code}-${b.board_name}` : selectedBoardCode })() : 'All boards'}
										</span>
										<ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[320px] p-0" align="start">
									<Command>
										<CommandInput placeholder="Search..." className="h-8 text-xs" />
										<CommandEmpty>No board.</CommandEmpty>
										<CommandGroup className="max-h-56 overflow-auto">
											<CommandItem value="all-boards" onSelect={() => { setSelectedBoardCode(''); setBoardOpen(false) }} className="py-2 text-xs">
												<Check className={cn('mr-2 h-3.5 w-3.5', !selectedBoardCode ? 'opacity-100' : 'opacity-0')} />
												All boards
											</CommandItem>
											{boards.map(b => (
												<CommandItem key={b.board_code} value={`${b.board_code} ${b.board_name}`} onSelect={() => { setSelectedBoardCode(b.board_code); setBoardOpen(false) }} className="py-2 text-xs">
													<Check className={cn('mr-2 h-3.5 w-3.5', selectedBoardCode === b.board_code ? 'opacity-100' : 'opacity-0')} />
													{b.board_code}-{b.board_name}
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
				<Card className="shadow-md">
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between flex-wrap gap-3">
							<CardTitle className="text-base">Examiners ({visibleRows.length})</CardTitle>
							<div className="flex items-center gap-2 flex-wrap">
								{(['internal', 'external', 'chief', 'assistant'] as CentralValuationExaminerType[]).map(role => (
									<label key={role} className="flex items-center gap-1.5 text-xs cursor-pointer">
										<Checkbox
											checked={roleFilter[role]}
											onCheckedChange={checked => setRoleFilter(prev => ({ ...prev, [role]: !!checked }))}
										/>
										<span className={cn('px-1.5 py-0.5 rounded text-xs font-medium border', ROLE_COLOR[role])}>
											{ROLE_LABEL[role]}
										</span>
									</label>
								))}

								<Button
									size="sm"
									variant="outline"
									onClick={() => sendSelected(true)}
									disabled={sending}
								>
									<RefreshCw className="h-3.5 w-3.5 mr-1" />
									Resend Failed
								</Button>
								<Button
									size="sm"
									onClick={() => sendSelected(false)}
									disabled={sending || selected.size === 0}
									className="bg-amber-600 hover:bg-amber-700"
								>
									{sending ? (
										<Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
									) : (
										<Send className="h-3.5 w-3.5 mr-1" />
									)}
									Send ({selected.size})
								</Button>
							</div>
						</div>
						{sendProgress && (
							<div className="text-xs text-muted-foreground mt-2">
								Sending: {sendProgress.done} / {sendProgress.total}
							</div>
						)}
					</CardHeader>
					<CardContent className="pt-0">
						{loadingRows ? (
							<div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								<span className="text-sm">Loading...</span>
							</div>
						) : visibleRows.length === 0 ? (
							<div className="text-sm text-muted-foreground text-center py-8">
								No examiners assigned yet. Go to Examiner Allotment to assign.
							</div>
						) : (
							<div className="border rounded-lg overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow className="bg-slate-800 hover:bg-slate-800">
											<TableHead className="text-white text-xs w-10">
												<Checkbox
													checked={selected.size === visibleRows.length && visibleRows.length > 0}
													onCheckedChange={toggleSelectAll}
												/>
											</TableHead>
											<TableHead className="text-white text-xs w-10"></TableHead>
											<TableHead className="text-white text-xs">Examiner</TableHead>
											<TableHead className="text-white text-xs">Role</TableHead>
											<TableHead className="text-white text-xs">Email</TableHead>
											<TableHead className="text-white text-xs text-center">Courses</TableHead>
											<TableHead className="text-white text-xs">Last Status</TableHead>
											<TableHead className="text-white text-xs text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{visibleRows.map((r, idx) => {
											const k = rowKey(r)
											const isExpanded = expanded.has(k)
											return (
												<Fragment key={k}>
													<TableRow className={cn(idx % 2 === 0 ? 'bg-white dark:bg-slate-950' : 'bg-slate-50/70 dark:bg-slate-900/30')}>
														<TableCell className="text-xs">
															<Checkbox checked={selected.has(k)} onCheckedChange={() => toggleSelect(k)} />
														</TableCell>
														<TableCell className="text-xs">
															<Button
																variant="ghost"
																size="sm"
																className="h-6 w-6 p-0"
																onClick={() => toggleExpand(k)}
															>
																{isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
															</Button>
														</TableCell>
														<TableCell className="text-xs font-medium">{r.examiner_name || '(unnamed)'}</TableCell>
														<TableCell className="text-xs">
															<Badge variant="outline" className={ROLE_COLOR[r.examiner_type]}>
																{ROLE_LABEL[r.examiner_type]}
															</Badge>
														</TableCell>
														<TableCell className="text-xs">
															{r.examiner_email ? (
																r.examiner_email
															) : (
																<span className="inline-flex items-center gap-1 text-red-600">
																	<AlertCircle className="h-3.5 w-3.5" /> missing
																</span>
															)}
														</TableCell>
														<TableCell className="text-xs text-center">{r.courses.length}</TableCell>
														<TableCell className="text-xs">
															{r.last_email_status === 'SENT' ? (
																<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" /> Sent</Badge>
															) : r.last_email_status === 'FAILED' ? (
																<Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>
															) : (
																<span className="text-muted-foreground">—</span>
															)}
														</TableCell>
														<TableCell className="text-xs text-right">
															<Button size="sm" variant="ghost" onClick={() => previewPdf(r)}>
																<Eye className="h-3.5 w-3.5 mr-1" /> Preview
															</Button>
														</TableCell>
													</TableRow>
													{isExpanded && (
														<TableRow>
															<TableCell colSpan={8} className="bg-slate-50 dark:bg-slate-900/20 p-0">
																<div className="p-3">
																	<Table>
																		<TableHeader>
																			<TableRow>
																				<TableHead className="text-[10px] h-7">Course Code</TableHead>
																				<TableHead className="text-[10px] h-7">Course Name</TableHead>
																				<TableHead className="text-[10px] h-7">Date</TableHead>
																				<TableHead className="text-[10px] h-7 text-center">Packet</TableHead>
																				<TableHead className="text-[10px] h-7 text-center">Sheets</TableHead>
																			</TableRow>
																		</TableHeader>
																		<TableBody>
																			{r.courses.map((c, i) => (
																				<TableRow key={i}>
																					<TableCell className="text-xs py-1 font-medium">{c.course_code}</TableCell>
																					<TableCell className="text-xs py-1">{c.course_name}</TableCell>
																					<TableCell className="text-xs py-1">{c.valuation_date || '—'}</TableCell>
																					<TableCell className="text-xs py-1 text-center font-mono">{c.packet_index && c.total_packets ? `${c.packet_index}/${c.total_packets}` : c.packet_count}</TableCell>
																					<TableCell className="text-xs py-1 text-center">{c.sheet_count}</TableCell>
																				</TableRow>
																			))}
																		</TableBody>
																	</Table>
																</div>
															</TableCell>
														</TableRow>
													)}
												</Fragment>
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
