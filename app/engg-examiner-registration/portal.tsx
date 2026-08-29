'use client'

// The Examiner Portal (spec §5–§7, §10).
//
// After sign-in an examiner sees only their own assignments. Selecting one shows
// the order particulars, the CoE's instructions, guidelines, check list and
// declaration, the question paper editor while the IST window is open, the claim
// form after submission, and their own activity history.
//
// The window is enforced on the SERVER — every route in /api/examiner-portal
// re-checks it. What this component does is explain the state rather than be the
// thing that protects the paper.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
	AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
	AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/common/use-toast'
import {
	Loader2, LogOut, FileText, Download, Clock, Lock, CheckCircle2, AlertTriangle, ArrowLeft,
	ShieldCheck, ListChecks, ScrollText, Receipt, History, Upload, Send, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIst, windowHint } from '@/lib/qp-portal/ist'
import { QP_LOG_ACTION_LABELS, type QpWindowState } from '@/types/qp-examiner-assignment'
import { PortalPaperEditor } from './portal-paper-editor'

interface PortalExaminer {
	id: string
	full_name: string
	email: string
	kind: 'internal' | 'external'
	designation?: string | null
	department?: string | null
	institution_name?: string | null
	has_signature?: boolean
	bank?: {
		account_holder?: string | null
		bank_name?: string | null
		account_number?: string | null
		branch?: string | null
		ifsc?: string | null
	}
}

interface AssignmentSummary {
	id: string
	course_code: string
	subject_title: string
	program_code: string | null
	semester: number | null
	set_label: string | null
	status: string
	valid_from: string
	valid_to: string
	window_state: QpWindowState
	window_hint: string
	order_ref_no: string | null
	return_remarks: string | null
	submitted_at: string | null
	accepted_at: string | null
	claim_submitted_at: string | null
	declaration_accepted_at: string | null
	has_checklist: boolean
	session_name: string | null
	session_label: string | null
	question_total: number
	question_done: number
}

interface Props {
	examiner: PortalExaminer
	onSignedOut: () => void
}

const WINDOW_TONE: Record<QpWindowState, string> = {
	pending: 'bg-slate-50 text-slate-700 border-slate-200',
	open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
	closed: 'bg-rose-50 text-rose-700 border-rose-200',
}

async function portalFetch(url: string, init: RequestInit = {}) {
	const res = await fetch(url, init)
	const text = await res.text()
	let json: any = null
	try {
		json = text ? JSON.parse(text) : null
	} catch {
		if (!res.ok) throw new Error(text.slice(0, 200) || `HTTP ${res.status}`)
	}
	if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`)
	return json
}

export function ExaminerPortal({ examiner, onSignedOut }: Props) {
	const { toast } = useToast()

	const [assignments, setAssignments] = useState<AssignmentSummary[]>([])
	const [loading, setLoading] = useState(true)
	const [openId, setOpenId] = useState<string | null>(null)
	const [detail, setDetail] = useState<any>(null)
	const [detailLoading, setDetailLoading] = useState(false)

	// Checklist + declaration + submit
	const [checklist, setChecklist] = useState<Record<string, string>>({})
	const [declarationAccepted, setDeclarationAccepted] = useState(false)
	const [submitOpen, setSubmitOpen] = useState(false)
	const [submitting, setSubmitting] = useState(false)

	// Profile
	const [profile, setProfile] = useState<any>(null)
	const [profileSaving, setProfileSaving] = useState(false)
	const [signatureBusy, setSignatureBusy] = useState(false)

	// History
	const [history, setHistory] = useState<any[]>([])

	// ── Load the dashboard ────────────────────────────────────────────────
	const loadAssignments = useCallback(async () => {
		setLoading(true)
		try {
			const json = await portalFetch('/api/examiner-portal/assignments')
			setAssignments(json.data || [])
		} catch (e: any) {
			toast({ title: 'Could not load your assignments', description: e.message, variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}, [toast])

	useEffect(() => {
		loadAssignments()
	}, [loadAssignments])

	// ── Open one assignment ───────────────────────────────────────────────
	const openAssignment = async (id: string) => {
		setOpenId(id)
		setDetail(null)
		setDetailLoading(true)
		try {
			const json = await portalFetch(`/api/examiner-portal/assignments/${id}`)
			setDetail(json)
			setChecklist((json.assignment?.checklist as Record<string, string>) || {})
			setDeclarationAccepted(!!json.assignment?.declaration_accepted_at)
		} catch (e: any) {
			toast({ title: 'Could not open this paper', description: e.message, variant: 'destructive' })
			setOpenId(null)
		} finally {
			setDetailLoading(false)
		}
	}

	const reloadDetail = async () => {
		if (openId) await openAssignment(openId)
		await loadAssignments()
	}

	// ── Profile ───────────────────────────────────────────────────────────
	const loadProfile = useCallback(async () => {
		try {
			setProfile(await portalFetch('/api/examiner-portal/profile'))
		} catch {
			/* the profile tab shows its own empty state */
		}
	}, [])

	const saveProfile = async () => {
		setProfileSaving(true)
		try {
			await portalFetch('/api/examiner-portal/profile', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bank_account_holder: profile?.bank?.account_holder || '',
					bank_name: profile?.bank?.bank_name || '',
					bank_account_number: profile?.bank?.account_number || '',
					bank_branch: profile?.bank?.branch || '',
					bank_ifsc: profile?.bank?.ifsc || '',
					mobile: profile?.mobile || '',
				}),
			})
			toast({ title: 'Your details have been saved' })
			loadProfile()
		} catch (e: any) {
			toast({ title: 'Could not save', description: e.message, variant: 'destructive' })
		} finally {
			setProfileSaving(false)
		}
	}

	const uploadSignature = async (file: File | undefined) => {
		if (!file) return
		setSignatureBusy(true)
		try {
			const form = new FormData()
			form.append('file', file)
			await portalFetch('/api/examiner-portal/profile', { method: 'POST', body: form })
			toast({ title: 'Signature saved' })
			loadProfile()
		} catch (e: any) {
			toast({ title: 'Could not upload the signature', description: e.message, variant: 'destructive' })
		} finally {
			setSignatureBusy(false)
		}
	}

	// ── History ───────────────────────────────────────────────────────────
	const loadHistory = useCallback(async (assignmentId?: string) => {
		try {
			const json = await portalFetch(
				`/api/examiner-portal/history${assignmentId ? `?assignment_id=${assignmentId}` : ''}`
			)
			setHistory(json.data || [])
		} catch {
			setHistory([])
		}
	}, [])

	// ── Save checklist / declaration ──────────────────────────────────────
	const saveChecklist = async () => {
		if (!openId) return
		try {
			await portalFetch(`/api/examiner-portal/assignments/${openId}/paper`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ checklist, declaration_accepted: declarationAccepted }),
			})
			toast({ title: 'Check list saved' })
			reloadDetail()
		} catch (e: any) {
			toast({ title: 'Could not save', description: e.message, variant: 'destructive' })
		}
	}

	// ── Submit ────────────────────────────────────────────────────────────
	const submitPaper = async () => {
		if (!openId) return
		setSubmitting(true)
		try {
			const json = await portalFetch(`/api/examiner-portal/assignments/${openId}/paper`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ submit: true, checklist, declaration_accepted: declarationAccepted }),
			})
			toast({ title: 'Question paper submitted', description: json.message })
			setSubmitOpen(false)
			reloadDetail()
		} catch (e: any) {
			toast({ title: 'Not submitted', description: e.message, variant: 'destructive' })
		} finally {
			setSubmitting(false)
		}
	}

	const submitClaim = async () => {
		if (!openId) return
		try {
			const json = await portalFetch(`/api/examiner-portal/assignments/${openId}/documents`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			})
			toast({ title: 'Claim recorded', description: json.message })
			reloadDetail()
		} catch (e: any) {
			toast({ title: 'Could not record the claim', description: e.message, variant: 'destructive' })
		}
	}

	const signOut = async () => {
		try {
			await fetch('/api/examiner-portal/session', { method: 'DELETE' })
		} finally {
			onSignedOut()
		}
	}

	const openDoc = (id: string, doc: 'order' | 'claim' | 'paper') => {
		window.open(`/api/examiner-portal/assignments/${id}/documents?doc=${doc}`, '_blank', 'noopener')
	}

	const counts = useMemo(
		() => ({
			open: assignments.filter(a => a.window_state === 'open' && !['submitted', 'accepted'].includes(a.status)).length,
			submitted: assignments.filter(a => ['submitted', 'accepted'].includes(a.status)).length,
			closing: assignments.filter(
				a =>
					a.window_state === 'open' &&
					!['submitted', 'accepted'].includes(a.status) &&
					new Date(a.valid_to).getTime() - Date.now() < 3 * 86_400_000
			).length,
		}),
		[assignments]
	)

	// ── Header ────────────────────────────────────────────────────────────
	const header = (
		<div className="bg-white border-b sticky top-0 z-20">
			<div className="h-1 bg-gradient-to-r from-green-600 via-emerald-500 to-green-600" />
			<div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
				<Image src="/jkkncet_logo.png" alt="" width={44} height={44} className="object-contain shrink-0" />
				<div className="min-w-0 flex-1">
					<p className="font-semibold text-sm leading-tight truncate">Examiner Portal</p>
					<p className="text-xs text-muted-foreground truncate">
						{examiner.full_name} · {examiner.email}
					</p>
				</div>
				<Badge variant="outline" className="hidden sm:inline-flex">
					<ShieldCheck className="h-3.5 w-3.5 mr-1" />
					{examiner.kind === 'internal' ? 'Internal' : 'External'}
				</Badge>
				<Button variant="outline" size="sm" onClick={signOut}>
					<LogOut className="h-4 w-4 sm:mr-1.5" />
					<span className="hidden sm:inline">Sign out</span>
				</Button>
			</div>
		</div>
	)

	// ── Assignment detail ─────────────────────────────────────────────────
	if (openId) {
		const a = detail?.assignment
		const content = detail?.content
		const state: QpWindowState = detail?.window_state || 'closed'
		const canEdit = !!detail?.can_edit
		const released = !!detail?.questions_released

		const checklistClauses = content?.checklist?.body || []
		const checklistComplete =
			checklistClauses.length > 0 && checklistClauses.every((c: any) => checklist[c.id])

		return (
			<div className="min-h-screen bg-gray-50">
				{header}
				<div className="max-w-5xl mx-auto px-4 py-4 space-y-4 pb-16">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							setOpenId(null)
							setDetail(null)
							loadAssignments()
						}}
					>
						<ArrowLeft className="h-4 w-4 mr-1.5" />
						All assignments
					</Button>

					{detailLoading || !detail ? (
						<div className="py-20 flex justify-center">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : (
						<>
							{/* Paper header */}
							<Card>
								<CardContent className="p-4">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="min-w-0">
											<h1 className="text-lg font-semibold">
												{a.course_code} — {a.subject_title}
											</h1>
											<p className="text-sm text-muted-foreground mt-0.5">
												{[a.program_code, a.semester ? `Semester ${a.semester}` : null, a.set_label ? `Set ${a.set_label}` : null, a.session_label || a.session_name]
													.filter(Boolean)
													.join(' · ')}
											</p>
											{a.order_ref_no && (
												<p className="text-xs text-muted-foreground mt-1">Order: {a.order_ref_no}</p>
											)}
										</div>
										<div className="text-right space-y-1">
											<Badge variant="outline" className={WINDOW_TONE[state]}>
												{state === 'open' ? <Clock className="h-3.5 w-3.5 mr-1" /> : <Lock className="h-3.5 w-3.5 mr-1" />}
												{detail.window_hint || windowHint(a.valid_from, a.valid_to)}
											</Badge>
											<p className="text-xs text-muted-foreground">
												{formatIst(a.valid_from, false)} → {formatIst(a.valid_to)}
											</p>
										</div>
									</div>

									{a.return_remarks && (
										<div className="mt-3 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm">
											<p className="font-medium text-orange-900 flex items-center gap-1.5">
												<AlertTriangle className="h-4 w-4" />
												Returned for revision
											</p>
											<p className="text-orange-800 mt-1">{a.return_remarks}</p>
										</div>
									)}

									{a.status === 'accepted' && (
										<div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-center gap-2">
											<CheckCircle2 className="h-4 w-4" />
											Accepted by the Office of the Controller of Examinations on {formatIst(a.accepted_at)}.
										</div>
									)}

									<div className="mt-3 flex flex-wrap gap-2">
										<Button variant="outline" size="sm" onClick={() => openDoc(openId, 'order')}>
											<Download className="h-4 w-4 mr-1.5" />
											Examiner order
										</Button>
										{released && (
											<Button variant="outline" size="sm" onClick={() => openDoc(openId, 'paper')}>
												<FileText className="h-4 w-4 mr-1.5" />
												Preview paper PDF
											</Button>
										)}
										{['submitted', 'accepted'].includes(a.status) && (
											<Button variant="outline" size="sm" onClick={() => openDoc(openId, 'claim')}>
												<Receipt className="h-4 w-4 mr-1.5" />
												Claim form
											</Button>
										)}
										<Button variant="ghost" size="sm" onClick={reloadDetail}>
											<RefreshCw className="h-4 w-4 mr-1.5" />
											Refresh
										</Button>
									</div>
								</CardContent>
							</Card>

							<Tabs
								defaultValue={released ? 'paper' : 'instructions'}
								onValueChange={v => {
									if (v === 'history') loadHistory(openId)
									if (v === 'claim') loadProfile()
								}}
							>
								<TabsList className="flex-wrap h-auto">
									<TabsTrigger value="paper">Question paper</TabsTrigger>
									<TabsTrigger value="instructions">Instructions</TabsTrigger>
									<TabsTrigger value="guidelines">Guidelines</TabsTrigger>
									<TabsTrigger value="checklist">Check list</TabsTrigger>
									<TabsTrigger value="claim">Claim</TabsTrigger>
									<TabsTrigger value="history">History</TabsTrigger>
								</TabsList>

								{/* Question paper */}
								<TabsContent value="paper" className="pt-4">
									{!released ? (
										<Card className={cn('border-2', state === 'pending' ? 'border-slate-200' : 'border-rose-200')}>
											<CardContent className="p-8 text-center space-y-2">
												<Lock className="h-8 w-8 mx-auto text-muted-foreground" />
												<p className="font-medium">
													{state === 'pending'
														? 'This question paper is not open yet'
														: 'The access period has ended'}
												</p>
												<p className="text-sm text-muted-foreground max-w-md mx-auto">
													{state === 'pending'
														? `The paper becomes available on ${formatIst(a.valid_from)}. Until then you can read the instructions and download your order.`
														: `Access closed on ${formatIst(a.valid_to)}. If you still need to work on this paper, contact the Office of the Controller of Examinations to have the period reopened.`}
												</p>
											</CardContent>
										</Card>
									) : (
										<>
											<PortalPaperEditor
												assignmentId={openId}
												questions={detail.questions || []}
												templateParts={detail.template_parts || []}
												courseOutcomes={detail.course_outcomes || []}
												baseUpdatedAt={detail.paper?.updated_at || null}
												readOnly={!canEdit}
												onSaved={info => {
													setAssignments(prev =>
														prev.map(x =>
															x.id === openId
																? { ...x, question_done: info.question_done, question_total: info.question_total }
																: x
														)
													)
												}}
											/>

											{canEdit && (
												<Card className="mt-4">
													<CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
														<div className="text-sm">
															<p className="font-medium">Ready to submit?</p>
															<p className="text-muted-foreground text-xs mt-0.5">
																Complete the check list and accept the declaration first. Once
																submitted the paper is locked unless the Office of the Controller
																of Examinations returns it to you.
															</p>
														</div>
														<Button onClick={() => setSubmitOpen(true)}>
															<Send className="h-4 w-4 mr-1.5" />
															Submit question paper
														</Button>
													</CardContent>
												</Card>
											)}
										</>
									)}
								</TabsContent>

								{/* Instructions + Guidelines */}
								{(['instructions', 'guidelines'] as const).map(key => (
									<TabsContent key={key} value={key} className="pt-4">
										<Card>
											<CardContent className="p-5">
												<h2 className="font-semibold flex items-center gap-2">
													<ScrollText className="h-4 w-4" />
													{content?.[key]?.title || (key === 'instructions' ? 'Instructions' : 'Guidelines')}
												</h2>
												{content?.[key]?.subtitle && (
													<p className="text-sm text-muted-foreground mt-1">{content[key].subtitle}</p>
												)}
												<ol className="mt-3 space-y-2 text-sm list-decimal pl-5">
													{(content?.[key]?.body || []).map((c: any) => (
														<li key={c.id}>
															{c.text}
															{c.note && <span className="text-muted-foreground italic"> ({c.note})</span>}
														</li>
													))}
												</ol>
												{content?.[key]?.footer_note && (
													<p className="mt-3 text-sm italic text-muted-foreground">{content[key].footer_note}</p>
												)}
												{content?.[key]?.contact_email && (
													<p className="mt-3 text-sm">
														Queries: <strong>{content[key].contact_email}</strong>
													</p>
												)}
											</CardContent>
										</Card>
									</TabsContent>
								))}

								{/* Check list + declaration */}
								<TabsContent value="checklist" className="pt-4 space-y-4">
									<Card>
										<CardContent className="p-5">
											<h2 className="font-semibold flex items-center gap-2">
												<ListChecks className="h-4 w-4" />
												{content?.checklist?.title || 'Check List'}
											</h2>
											<div className="mt-3 divide-y">
												{(content?.checklist?.body || []).map((c: any) => (
													<div key={c.id} className="py-2.5 flex items-start justify-between gap-4">
														<span className="text-sm">{c.text}</span>
														<div className="flex gap-1 shrink-0">
															{['YES', 'NO'].map(v => (
																<Button
																	key={v}
																	type="button"
																	size="sm"
																	variant={checklist[c.id] === v ? 'default' : 'outline'}
																	className={cn(
																		'h-7 px-3 text-xs',
																		checklist[c.id] === v && v === 'NO' && 'bg-amber-600 hover:bg-amber-700'
																	)}
																	disabled={!canEdit}
																	onClick={() => setChecklist(prev => ({ ...prev, [c.id]: v }))}
																>
																	{v}
																</Button>
															))}
														</div>
													</div>
												))}
											</div>
										</CardContent>
									</Card>

									<Card>
										<CardContent className="p-5">
											<h2 className="font-semibold flex items-center gap-2">
												<ShieldCheck className="h-4 w-4" />
												{content?.declaration?.title || 'Declaration'}
											</h2>
											<ol className="mt-3 space-y-2 text-sm list-decimal pl-5">
												{(content?.declaration?.body || []).map((c: any) => (
													<li key={c.id}>{c.text}</li>
												))}
											</ol>
											<label className="mt-4 flex items-start gap-2.5 cursor-pointer">
												<Checkbox
													checked={declarationAccepted}
													onCheckedChange={v => setDeclarationAccepted(v === true)}
													disabled={!canEdit || !!a.declaration_accepted_at}
													className="mt-0.5"
												/>
												<span className="text-sm">
													I accept the declaration above.
													{a.declaration_accepted_at && (
														<span className="block text-xs text-muted-foreground mt-0.5">
															Accepted on {formatIst(a.declaration_accepted_at)}
														</span>
													)}
												</span>
											</label>
											{canEdit && (
												<div className="mt-4 flex justify-end">
													<Button onClick={saveChecklist}>Save check list &amp; declaration</Button>
												</div>
											)}
										</CardContent>
									</Card>
								</TabsContent>

								{/* Claim */}
								<TabsContent value="claim" className="pt-4 space-y-4">
									<Card>
										<CardContent className="p-5">
											<h2 className="font-semibold flex items-center gap-2">
												<Receipt className="h-4 w-4" />
												{content?.claim?.title || 'Claim Form'}
											</h2>
											<ol className="mt-3 space-y-1.5 text-sm list-decimal pl-5 text-muted-foreground">
												{(content?.claim?.body || []).map((c: any) => (
													<li key={c.id}>{c.text}</li>
												))}
											</ol>

											{!['submitted', 'accepted'].includes(a.status) ? (
												<p className="mt-4 text-sm text-muted-foreground">
													The claim form becomes available once you have submitted the question paper.
												</p>
											) : (
												<div className="mt-4 space-y-4">
													<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
														{[
															['Account holder', 'account_holder'],
															['Bank name', 'bank_name'],
															['Account number', 'account_number'],
															['Branch', 'branch'],
															['IFSC', 'ifsc'],
														].map(([label, key]) => (
															<div key={key}>
																<Label className="text-xs">{label}</Label>
																<Input
																	value={profile?.bank?.[key] || ''}
																	onChange={e =>
																		setProfile((p: any) => ({
																			...(p || {}),
																			bank: { ...(p?.bank || {}), [key]: e.target.value },
																		}))
																	}
																	className="h-9 mt-1"
																/>
															</div>
														))}
													</div>

													<div>
														<Label className="text-xs">Specimen signature</Label>
														<div className="mt-1 flex items-center gap-3">
															{profile?.signature_url ? (
																// eslint-disable-next-line @next/next/no-img-element
																<img
																	src={profile.signature_url}
																	alt="Signature"
																	className="h-12 border rounded bg-white object-contain px-2"
																/>
															) : (
																<span className="text-sm text-muted-foreground">Not uploaded</span>
															)}
															<label className="cursor-pointer">
																<input
																	type="file"
																	accept="image/png,image/jpeg,image/webp"
																	className="hidden"
																	onChange={e => uploadSignature(e.target.files?.[0])}
																/>
																<span className="inline-flex items-center h-9 px-3 rounded-md border text-sm hover:bg-muted">
																	{signatureBusy ? (
																		<Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
																	) : (
																		<Upload className="h-4 w-4 mr-1.5" />
																	)}
																	{profile?.signature_url ? 'Replace' : 'Upload'}
																</span>
															</label>
														</div>
														<p className="text-xs text-muted-foreground mt-1">
															Kept privately and pasted onto your claim form. PNG, JPEG or WebP, under 1 MB.
														</p>
													</div>

													<div className="flex flex-wrap gap-2 justify-end">
														<Button variant="outline" onClick={saveProfile} disabled={profileSaving}>
															{profileSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
															Save bank details
														</Button>
														<Button variant="outline" onClick={() => openDoc(openId, 'claim')}>
															<Download className="h-4 w-4 mr-1.5" />
															Download claim form
														</Button>
														{!a.claim_submitted_at ? (
															<Button onClick={submitClaim}>Submit claim</Button>
														) : (
															<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 self-center">
																Claim submitted {formatIst(a.claim_submitted_at, false)}
															</Badge>
														)}
													</div>
												</div>
											)}
										</CardContent>
									</Card>
								</TabsContent>

								{/* History */}
								<TabsContent value="history" className="pt-4">
									<Card>
										<CardContent className="p-0">
											<div className="divide-y max-h-[520px] overflow-y-auto">
												{history.length === 0 && (
													<div className="p-8 text-center text-sm text-muted-foreground">
														No activity recorded for this paper yet.
													</div>
												)}
												{history.map(h => (
													<div key={h.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
														<span className={cn(h.denied && 'text-rose-600')}>
															{QP_LOG_ACTION_LABELS[h.action] || h.action}
															{h.reason && <span className="text-xs block text-rose-600">{h.reason}</span>}
														</span>
														<span className="text-xs text-muted-foreground shrink-0">
															{formatIst(h.created_at)}
														</span>
													</div>
												))}
											</div>
										</CardContent>
									</Card>
								</TabsContent>
							</Tabs>
						</>
					)}
				</div>

				{/* Submit confirmation */}
				<AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Submit this question paper?</AlertDialogTitle>
							<AlertDialogDescription asChild>
								<div className="space-y-2 text-sm">
									<p>
										The paper is sent to the Office of the Controller of Examinations and locked. You
										will not be able to edit it unless it is returned to you for revision.
									</p>
									{!checklistComplete && (
										<p className="text-amber-700 flex items-start gap-1.5">
											<AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
											Answer every item on the check list first.
										</p>
									)}
									{!declarationAccepted && (
										<p className="text-amber-700 flex items-start gap-1.5">
											<AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
											Accept the declaration first.
										</p>
									)}
								</div>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Not yet</AlertDialogCancel>
							<AlertDialogAction
								onClick={e => {
									e.preventDefault()
									submitPaper()
								}}
								disabled={submitting || !checklistComplete || !declarationAccepted}
							>
								{submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
								Submit
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		)
	}

	// ── Dashboard ─────────────────────────────────────────────────────────
	return (
		<div className="min-h-screen bg-gray-50">
			{header}
			<div className="max-w-5xl mx-auto px-4 py-5 space-y-4 pb-16">
				<div>
					<h1 className="text-xl font-semibold">Assigned Question Papers</h1>
					<p className="text-sm text-muted-foreground mt-0.5">
						{counts.open} open for entry · {counts.submitted} submitted
						{counts.closing > 0 && (
							<span className="text-amber-700"> · {counts.closing} closing within 3 days</span>
						)}
					</p>
				</div>

				{loading ? (
					<div className="py-20 flex justify-center">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				) : assignments.length === 0 ? (
					<Card>
						<CardContent className="p-10 text-center space-y-2">
							<FileText className="h-8 w-8 mx-auto text-muted-foreground" />
							<p className="font-medium">No question papers are assigned to you yet</p>
							<p className="text-sm text-muted-foreground max-w-md mx-auto">
								When the Office of the Controller of Examinations appoints you as a question paper
								setter, the paper will appear here and you will receive the order by e-mail.
							</p>
						</CardContent>
					</Card>
				) : (
					<div className="space-y-3">
						{assignments.map(a => (
							<Card
								key={a.id}
								className="cursor-pointer hover:shadow-md transition-shadow"
								onClick={() => openAssignment(a.id)}
							>
								<CardContent className="p-4">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="font-medium">
												{a.course_code} — {a.subject_title}
											</p>
											<p className="text-sm text-muted-foreground mt-0.5">
												{[a.program_code, a.semester ? `Semester ${a.semester}` : null, a.set_label ? `Set ${a.set_label}` : null, a.session_label || a.session_name]
													.filter(Boolean)
													.join(' · ')}
											</p>
											<div className="flex flex-wrap items-center gap-2 mt-2">
												<Badge variant="outline" className={WINDOW_TONE[a.window_state]}>
													{a.window_hint}
												</Badge>
												{a.status === 'submitted' && (
													<Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
														Submitted
													</Badge>
												)}
												{a.status === 'accepted' && (
													<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
														Accepted
													</Badge>
												)}
												{a.status === 'returned' && (
													<Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
														Returned for revision
													</Badge>
												)}
											</div>
										</div>
										<div className="text-right shrink-0">
											<p className="text-xs text-muted-foreground">
												{formatIst(a.valid_from, false)}
												<br />
												to {formatIst(a.valid_to)}
											</p>
											{a.question_total > 0 && (
												<p className="text-xs mt-2">
													{a.question_done} / {a.question_total} entered
												</p>
											)}
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
