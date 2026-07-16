'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
	DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import {
	Loader2, MoreHorizontal, FileText, FileDown, Wand2, Save, Trash2, Send, CheckCircle2, Lock,
} from 'lucide-react'
import { K_LEVELS } from '@/types/ia-question-paper'
import type { IaQuestionPaper, IaPaperQuestion } from '@/types/ia-question-paper'

interface Institution {
	id: string
	name: string
	institution_code: string
}
interface SessionOpt {
	id: string
	session_name: string
	session_code: string
}

const CIA_ROUNDS = [1, 2, 3]

interface PaperDetail extends IaQuestionPaper {
	template_parts?: any[]
	course_outcomes?: { id: string; co_code: string; co_description?: string }[]
}

export default function QuestionPapersPage() {
	const { toast } = useToast()
	const { isReady, appendToUrl, mustSelectInstitution, institutionId } = useInstitutionFilter()

	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [localInstitutionId, setLocalInstitutionId] = useState('')
	const effectiveInstitutionId = institutionId || localInstitutionId || ''

	const [sessions, setSessions] = useState<SessionOpt[]>([])
	const [programs, setPrograms] = useState<string[]>([])
	const [semesters, setSemesters] = useState<number[]>([])

	const [sessionId, setSessionId] = useState('')
	const [programCode, setProgramCode] = useState('')
	const [semester, setSemester] = useState('')
	const [ciaRound, setCiaRound] = useState('1')

	const [papers, setPapers] = useState<IaQuestionPaper[]>([])
	const [loading, setLoading] = useState(false)
	const [generating, setGenerating] = useState(false)

	// Authoring
	const [sheetOpen, setSheetOpen] = useState(false)
	const [paper, setPaper] = useState<PaperDetail | null>(null)
	const [questions, setQuestions] = useState<IaPaperQuestion[]>([])
	const [loadingPaper, setLoadingPaper] = useState(false)
	const [savingPaper, setSavingPaper] = useState(false)

	// ===== Load base data =====
	useEffect(() => {
		if (isReady) fetchInstitutions()
	}, [isReady])

	useEffect(() => {
		if (isReady && effectiveInstitutionId) fetchSessions()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isReady, effectiveInstitutionId])

	useEffect(() => {
		if (effectiveInstitutionId && sessionId) fetchPrograms()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [effectiveInstitutionId, sessionId])

	useEffect(() => {
		if (effectiveInstitutionId && sessionId && programCode) fetchSemesters()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [programCode])

	useEffect(() => {
		if (effectiveInstitutionId && sessionId) fetchPapers()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [effectiveInstitutionId, sessionId, programCode, semester, ciaRound])

	const fetchInstitutions = async () => {
		try {
			const res = await fetch(appendToUrl('/api/pre-exam/internal-marks?action=institutions'))
			if (res.ok) {
				const data = await res.json()
				setInstitutions(
					(data || []).map((i: any) => ({
						id: i.id,
						name: i.name || i.institution_name,
						institution_code: i.institution_code,
					}))
				)
			}
		} catch (e) {
			console.error(e)
		}
	}

	const fetchSessions = async () => {
		try {
			const res = await fetch(`/api/examination-sessions?institutions_id=${effectiveInstitutionId}`)
			if (res.ok) {
				const data = await res.json()
				const list = data.data || data || []
				setSessions(
					list.map((s: any) => ({
						id: s.id,
						session_name: s.session_name,
						session_code: s.session_code,
					}))
				)
			}
		} catch (e) {
			console.error(e)
		}
	}

	const fetchPrograms = async () => {
		try {
			const res = await fetch(
				`/api/pre-exam/internal-mark-entry?action=filter-cascade&step=programs&institutions_id=${effectiveInstitutionId}&examination_session_id=${sessionId}`
			)
			if (res.ok) setPrograms(await res.json())
		} catch (e) {
			console.error(e)
		}
	}

	const fetchSemesters = async () => {
		try {
			const res = await fetch(
				`/api/pre-exam/internal-mark-entry?action=filter-cascade&step=semesters&institutions_id=${effectiveInstitutionId}&examination_session_id=${sessionId}&program_code=${encodeURIComponent(programCode)}`
			)
			if (res.ok) setSemesters(await res.json())
		} catch (e) {
			console.error(e)
		}
	}

	const fetchPapers = async () => {
		try {
			setLoading(true)
			let url = `/api/pre-exam/question-papers?institutions_id=${effectiveInstitutionId}&examination_session_id=${sessionId}&cia_round=${ciaRound}`
			if (programCode) url += `&program_code=${encodeURIComponent(programCode)}`
			if (semester) url += `&semester=${semester}`
			const res = await fetch(url)
			if (res.ok) setPapers(await res.json())
		} catch (e) {
			console.error(e)
		} finally {
			setLoading(false)
		}
	}

	const generate = async () => {
		if (!sessionId || !programCode || !semester) {
			toast({ title: 'Select session, program and semester first', variant: 'destructive' })
			return
		}
		try {
			setGenerating(true)
			const res = await fetch('/api/pre-exam/question-papers', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: effectiveInstitutionId,
					examination_session_id: sessionId,
					program_code: programCode,
					semester: Number(semester),
					cia_round: Number(ciaRound),
					cia_round_name: `CIA ${ciaRound}`,
				}),
			})
			const data = await res.json()
			if (!res.ok) throw new Error(data.error || 'Generation failed')
			toast({ title: 'Papers generated', description: data.message })
			fetchPapers()
		} catch (e: any) {
			toast({ title: 'Generation failed', description: e.message, variant: 'destructive' })
		} finally {
			setGenerating(false)
		}
	}

	// ===== Authoring =====
	const openPaper = async (p: IaQuestionPaper) => {
		setSheetOpen(true)
		setLoadingPaper(true)
		setPaper(null)
		setQuestions([])
		try {
			const res = await fetch(`/api/pre-exam/question-papers/${p.id}`)
			if (res.ok) {
				const data: PaperDetail = await res.json()
				setPaper(data)
				setQuestions(data.ia_paper_questions || [])
			}
		} catch (e) {
			console.error(e)
		} finally {
			setLoadingPaper(false)
		}
	}

	const editable = paper ? ['draft', 'submitted'].includes(paper.status) : false

	const updateQuestion = (qid: string, patch: Partial<IaPaperQuestion>) => {
		setQuestions(prev => prev.map(q => (q.id === qid ? { ...q, ...patch } : q)))
	}

	const updateOption = (qid: string, key: string, text: string) => {
		setQuestions(prev =>
			prev.map(q =>
				q.id === qid
					? { ...q, options: (q.options || []).map(o => (o.key === key ? { ...o, text } : o)) }
					: q
			)
		)
	}

	const saveQuestions = async (nextStatus?: string) => {
		if (!paper) return
		try {
			setSavingPaper(true)
			const res = await fetch(`/api/pre-exam/question-papers/${paper.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					questions: editable ? questions : undefined,
					subject_title: paper.subject_title,
					exam_date: paper.exam_date,
					...(nextStatus ? { status: nextStatus } : {}),
				}),
			})
			const data = await res.json()
			if (!res.ok) throw new Error(data.error || 'Save failed')
			toast({ title: nextStatus ? `Paper ${nextStatus}` : 'Saved' })
			if (nextStatus) {
				setSheetOpen(false)
				fetchPapers()
			} else if (data) {
				setPaper(data)
				setQuestions(data.ia_paper_questions || questions)
			}
		} catch (e: any) {
			toast({ title: 'Save failed', description: e.message, variant: 'destructive' })
		} finally {
			setSavingPaper(false)
		}
	}

	const setStatus = async (p: IaQuestionPaper, status: string) => {
		try {
			const res = await fetch(`/api/pre-exam/question-papers/${p.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status }),
			})
			if (!res.ok) {
				const d = await res.json()
				throw new Error(d.error || 'Update failed')
			}
			toast({ title: `Paper ${status}` })
			fetchPapers()
		} catch (e: any) {
			toast({ title: 'Update failed', description: e.message, variant: 'destructive' })
		}
	}

	const removePaper = async (p: IaQuestionPaper) => {
		if (!confirm(`Delete paper for ${p.course_code} (Set ${p.set_label || 'A'})?`)) return
		try {
			const res = await fetch(`/api/pre-exam/question-papers/${p.id}`, { method: 'DELETE' })
			if (!res.ok) {
				const d = await res.json()
				throw new Error(d.error || 'Delete failed')
			}
			toast({ title: 'Paper deleted' })
			fetchPapers()
		} catch (e: any) {
			toast({ title: 'Delete failed', description: e.message, variant: 'destructive' })
		}
	}

	const statusBadge = (status: string) => {
		const map: Record<string, string> = {
			draft: 'bg-amber-100 text-amber-700 border-amber-200',
			submitted: 'bg-blue-100 text-blue-700 border-blue-200',
			approved: 'bg-green-100 text-green-700 border-green-200',
			locked: 'bg-gray-200 text-gray-700 border-gray-300',
		}
		return <Badge variant="outline" className={map[status] || ''}>{status}</Badge>
	}

	// Group authoring questions by part
	const groupedQuestions = useMemo(() => {
		const map = new Map<string, IaPaperQuestion[]>()
		for (const q of questions) {
			const key = q.part_label || '—'
			if (!map.has(key)) map.set(key, [])
			map.get(key)!.push(q)
		}
		return map
	}, [questions])

	const partByLabel = useMemo(() => {
		const m = new Map<string, any>()
		for (const p of paper?.template_parts || []) m.set(p.part_label, p)
		return m
	}, [paper])

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink href="/">Home</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink href="#">Pre-Exam</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Question Papers</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					<div>
						<h1 className="text-2xl font-semibold flex items-center gap-2">
							<FileText className="h-6 w-6 text-primary" /> Question Papers
						</h1>
						<p className="text-sm text-muted-foreground">
							Generate papers from templates for registered courses, then author the questions.
						</p>
					</div>

					{/* Filters */}
					<Card>
						<CardContent className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2 lg:grid-cols-6">
							{mustSelectInstitution && (
								<div>
									<Label className="text-xs">Institution</Label>
									<Select value={localInstitutionId} onValueChange={setLocalInstitutionId}>
										<SelectTrigger>
											<SelectValue placeholder="Select" />
										</SelectTrigger>
										<SelectContent>
											{institutions.map(i => (
												<SelectItem key={i.id} value={i.id}>
													{i.institution_code}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
							<div>
								<Label className="text-xs">Exam Session</Label>
								<Select value={sessionId} onValueChange={setSessionId}>
									<SelectTrigger>
										<SelectValue placeholder="Select session" />
									</SelectTrigger>
									<SelectContent>
										{sessions.map(s => (
											<SelectItem key={s.id} value={s.id}>
												{s.session_name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label className="text-xs">Program</Label>
								<Select value={programCode} onValueChange={setProgramCode} disabled={!sessionId}>
									<SelectTrigger>
										<SelectValue placeholder="Program" />
									</SelectTrigger>
									<SelectContent>
										{programs.map(p => (
											<SelectItem key={p} value={p}>
												{p}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label className="text-xs">Semester</Label>
								<Select value={semester} onValueChange={setSemester} disabled={!programCode}>
									<SelectTrigger>
										<SelectValue placeholder="Sem" />
									</SelectTrigger>
									<SelectContent>
										{semesters.map(s => (
											<SelectItem key={s} value={String(s)}>
												{s}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label className="text-xs">CIA Round</Label>
								<Select value={ciaRound} onValueChange={setCiaRound}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{CIA_ROUNDS.map(r => (
											<SelectItem key={r} value={String(r)}>
												CIA {r}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex items-end">
								<Button onClick={generate} disabled={generating} className="w-full">
									{generating ? (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									) : (
										<Wand2 className="mr-2 h-4 w-4" />
									)}
									Generate
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* Papers table */}
					<Card>
						<CardHeader className="py-3">
							<span className="text-sm font-medium">
								{papers.length} paper{papers.length === 1 ? '' : 's'}
							</span>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Course</TableHead>
										<TableHead>Title</TableHead>
										<TableHead>Program</TableHead>
										<TableHead>Sem</TableHead>
										<TableHead>Set</TableHead>
										<TableHead className="text-right">Max</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="w-10" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{loading ? (
										<TableRow>
											<TableCell colSpan={8} className="py-10 text-center">
												<Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
											</TableCell>
										</TableRow>
									) : papers.length === 0 ? (
										<TableRow>
											<TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
												No papers. Pick a session/program/semester and click Generate.
											</TableCell>
										</TableRow>
									) : (
										papers.map(p => (
											<TableRow key={p.id}>
												<TableCell className="font-medium">{p.course_code}</TableCell>
												<TableCell className="max-w-[220px] truncate">{p.subject_title}</TableCell>
												<TableCell>{p.program_code}</TableCell>
												<TableCell>{p.semester}</TableCell>
												<TableCell>{p.set_label || 'A'}</TableCell>
												<TableCell className="text-right">{Number(p.max_marks) || 0}</TableCell>
												<TableCell>{statusBadge(p.status)}</TableCell>
												<TableCell>
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button variant="ghost" size="icon">
																<MoreHorizontal className="h-4 w-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem onClick={() => openPaper(p)}>
																<FileText className="mr-2 h-4 w-4" /> Author
															</DropdownMenuItem>
															<DropdownMenuItem asChild>
																<a href={`/api/pre-exam/question-papers/${p.id}/pdf`} target="_blank" rel="noreferrer">
																	<FileDown className="mr-2 h-4 w-4" /> Export PDF
																</a>
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															{p.status === 'submitted' && (
																<DropdownMenuItem onClick={() => setStatus(p, 'approved')}>
																	<CheckCircle2 className="mr-2 h-4 w-4" /> Approve
																</DropdownMenuItem>
															)}
															{p.status === 'approved' && (
																<DropdownMenuItem onClick={() => setStatus(p, 'locked')}>
																	<Lock className="mr-2 h-4 w-4" /> Lock
																</DropdownMenuItem>
															)}
															{p.status !== 'locked' && (
																<DropdownMenuItem className="text-destructive" onClick={() => removePaper(p)}>
																	<Trash2 className="mr-2 h-4 w-4" /> Delete
																</DropdownMenuItem>
															)}
														</DropdownMenuContent>
													</DropdownMenu>
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</div>
				<AppFooter />
			</SidebarInset>

			{/* ===== AUTHORING SHEET ===== */}
			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
					<SheetHeader>
						<SheetTitle>
							{paper ? `${paper.course_code} — ${paper.subject_title || ''}` : 'Question Paper'}
						</SheetTitle>
					</SheetHeader>

					{loadingPaper ? (
						<div className="py-16 text-center">
							<Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : paper ? (
						<div className="mt-4 space-y-4 pb-8">
							<div className="flex flex-wrap items-center gap-3 text-sm">
								{statusBadge(paper.status)}
								<span className="text-muted-foreground">
									Set {paper.set_label || 'A'} · Max {Number(paper.max_marks) || 0}
								</span>
								{!editable && (
									<span className="text-xs text-muted-foreground">(read-only — {paper.status})</span>
								)}
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div>
									<Label className="text-xs">Subject Title</Label>
									<Input
										value={paper.subject_title || ''}
										disabled={!editable}
										onChange={e => setPaper({ ...paper, subject_title: e.target.value })}
									/>
								</div>
								<div>
									<Label className="text-xs">Exam Date</Label>
									<Input
										type="date"
										value={paper.exam_date ? paper.exam_date.slice(0, 10) : ''}
										disabled={!editable}
										onChange={e => setPaper({ ...paper, exam_date: e.target.value })}
									/>
								</div>
							</div>

							{[...groupedQuestions.entries()].map(([label, qs]) => {
								const part = partByLabel.get(label)
								return (
									<div key={label} className="rounded-md border">
										<div className="border-b bg-muted/40 px-3 py-2">
											<div className="text-sm font-semibold">
												PART {label}
												{part
													? ` — (${part.num_questions} x ${part.marks_per_question} = ${part.num_questions * part.marks_per_question})`
													: ''}
											</div>
											{part?.instruction && (
												<div className="text-xs text-muted-foreground">{part.instruction}</div>
											)}
										</div>
										<div className="space-y-3 p-3">
											{qs.map(q => (
												<div key={q.id} className="rounded border bg-background p-2">
													<div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
														<span className="font-medium text-foreground">
															{q.is_choice_alternative ? '(OR) ' : ''}Q{q.question_number}
															{q.sub_label ? ` ${q.sub_label})` : ''}
														</span>
														<span>· {Number(q.marks) || 0} marks</span>
													</div>
													<Textarea
														rows={2}
														placeholder="Question text"
														value={q.question_text || ''}
														disabled={!editable}
														onChange={e => updateQuestion(q.id, { question_text: e.target.value })}
													/>

													{Array.isArray(q.options) && q.options.length > 0 && (
														<div className="mt-2 grid grid-cols-2 gap-2">
															{q.options.map(o => (
																<div key={o.key} className="flex items-center gap-1">
																	<span className="w-5 text-xs text-muted-foreground">{o.key})</span>
																	<Input
																		className="h-8"
																		placeholder={`Option ${o.key}`}
																		value={o.text}
																		disabled={!editable}
																		onChange={e => updateOption(q.id, o.key, e.target.value)}
																	/>
																</div>
															))}
														</div>
													)}

													<div className="mt-2 flex flex-wrap items-center gap-2">
														{Array.isArray(q.options) && q.options.length > 0 && (
															<div className="flex items-center gap-1">
																<Label className="text-xs">Answer</Label>
																<Select
																	value={q.correct_option || ''}
																	onValueChange={v => updateQuestion(q.id, { correct_option: v })}
																	disabled={!editable}
																>
																	<SelectTrigger className="h-8 w-16">
																		<SelectValue placeholder="—" />
																	</SelectTrigger>
																	<SelectContent>
																		{q.options.map(o => (
																			<SelectItem key={o.key} value={o.key}>
																				{o.key}
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															</div>
														)}
														{(part?.capture_co ?? true) && (
															<div className="flex items-center gap-1">
																<Label className="text-xs">CO</Label>
																<Select
																	value={q.co_code || ''}
																	onValueChange={v => updateQuestion(q.id, { co_code: v })}
																	disabled={!editable}
																>
																	<SelectTrigger className="h-8 w-24">
																		<SelectValue placeholder="CO" />
																	</SelectTrigger>
																	<SelectContent>
																		{(paper.course_outcomes || []).length === 0 ? (
																			<SelectItem value="__none" disabled>
																				No COs defined
																			</SelectItem>
																		) : (
																			(paper.course_outcomes || []).map(co => (
																				<SelectItem key={co.id} value={co.co_code}>
																					{co.co_code}
																				</SelectItem>
																			))
																		)}
																	</SelectContent>
																</Select>
															</div>
														)}
														{(part?.capture_klevel ?? true) && (
															<div className="flex items-center gap-1">
																<Label className="text-xs">K</Label>
																<Select
																	value={q.k_level || ''}
																	onValueChange={v => updateQuestion(q.id, { k_level: v })}
																	disabled={!editable}
																>
																	<SelectTrigger className="h-8 w-20">
																		<SelectValue placeholder="K" />
																	</SelectTrigger>
																	<SelectContent>
																		{K_LEVELS.map(k => (
																			<SelectItem key={k.code} value={k.code}>
																				{k.code}
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															</div>
														)}
													</div>
												</div>
											))}
										</div>
									</div>
								)
							})}

							{/* Actions */}
							<div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background py-3">
								<a
									href={`/api/pre-exam/question-papers/${paper.id}/pdf`}
									target="_blank"
									rel="noreferrer"
								>
									<Button variant="outline">
										<FileDown className="mr-2 h-4 w-4" /> PDF
									</Button>
								</a>
								{editable && (
									<Button variant="outline" onClick={() => saveQuestions()} disabled={savingPaper}>
										{savingPaper ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<Save className="mr-2 h-4 w-4" />
										)}
										Save
									</Button>
								)}
								{paper.status === 'draft' && (
									<Button onClick={() => saveQuestions('submitted')} disabled={savingPaper}>
										<Send className="mr-2 h-4 w-4" /> Submit
									</Button>
								)}
								{paper.status === 'submitted' && (
									<Button onClick={() => saveQuestions('approved')} disabled={savingPaper}>
										<CheckCircle2 className="mr-2 h-4 w-4" /> Approve
									</Button>
								)}
								{paper.status === 'approved' && (
									<Button onClick={() => saveQuestions('locked')} disabled={savingPaper}>
										<Lock className="mr-2 h-4 w-4" /> Lock
									</Button>
								)}
							</div>
						</div>
					) : (
						<div className="py-16 text-center text-muted-foreground">Failed to load paper.</div>
					)}
				</SheetContent>
			</Sheet>
		</SidebarProvider>
	)
}
