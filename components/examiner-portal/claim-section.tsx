'use client'

// The Claim Form screen: Pending | Submitted | Approved | Payment Completed.
//
// A claim's own lifecycle is separate from the question paper's, which is why it
// has its own sidebar entry rather than being a tab inside one assignment. The
// examiner drives only the first move — entering bank details and submitting.
// Approval and payment are the CoE's, and there is deliberately no control here
// that could advance a claim past 'submitted'.
//
// A claim opens only once the SUBMISSION is complete (check list and signature
// included), because the claim form carries that signature.

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
	Loader2, Receipt, Download, CheckCircle2, Clock, BadgeCheck, Wallet, Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIst } from '@/lib/qp-portal/ist'
import { QP_CLAIM_STATUS_LABELS, type QpClaimStatus } from '@/types/qp-examiner-assignment'

interface ClaimRow {
	id: string
	course_code: string
	subject_title: string
	program_code: string | null
	semester: number | null
	session_name: string | null
	session_label: string | null
	remuneration: number | null
	submission_stage: string
	claim_status: QpClaimStatus
	claim_submitted_at: string | null
	claim_approved_at: string | null
	claim_remarks: string | null
	payment_completed_at: string | null
	payment_reference: string | null
	payment_amount: number | null
}

interface Props {
	assignments: ClaimRow[]
	/** Current bank details from the profile, used to pre-fill a new claim. */
	bank: Record<string, string>
	onSubmitClaim: (assignmentId: string, bank: Record<string, string>) => Promise<void>
	onDownload: (assignmentId: string) => void
	loading?: boolean
}

const TABS: { key: QpClaimStatus; icon: typeof Clock }[] = [
	{ key: 'pending', icon: Clock },
	{ key: 'submitted', icon: Receipt },
	{ key: 'approved', icon: BadgeCheck },
	{ key: 'paid', icon: Wallet },
]

const TONE: Record<QpClaimStatus, string> = {
	pending: 'bg-amber-50 text-amber-700 border-amber-200',
	submitted: 'bg-blue-50 text-blue-700 border-blue-200',
	approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
	paid: 'bg-emerald-100 text-emerald-800 border-emerald-300',
}

const BANK_FIELDS: { key: string; label: string; placeholder?: string }[] = [
	{ key: 'account_holder', label: 'Bank account holder name' },
	{ key: 'account_number', label: 'Bank account number' },
	{ key: 'bank_name', label: 'Bank name' },
	{ key: 'branch', label: 'Branch name' },
	{ key: 'ifsc', label: 'IFSC code', placeholder: 'e.g. SBIN0001234' },
]

function subtitle(a: ClaimRow) {
	return [a.program_code, a.semester ? `Semester ${a.semester}` : null, a.session_label || a.session_name]
		.filter(Boolean)
		.join(' · ')
}

export function ClaimSection({ assignments, bank, onSubmitClaim, onDownload, loading }: Props) {
	const [openForm, setOpenForm] = useState<string | null>(null)
	const [form, setForm] = useState<Record<string, string>>({})
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// A claim only exists once the submission is complete. Everything earlier is
	// still question-paper work and has no place on this screen.
	const claimable = useMemo(
		() => assignments.filter(a => a.submission_stage === 'completed'),
		[assignments]
	)

	const byStatus = useMemo(() => {
		const m: Record<QpClaimStatus, ClaimRow[]> = { pending: [], submitted: [], approved: [], paid: [] }
		for (const a of claimable) m[a.claim_status || 'pending']?.push(a)
		return m
	}, [claimable])

	const beginClaim = (a: ClaimRow) => {
		setOpenForm(a.id)
		setError(null)
		setForm({
			account_holder: bank.account_holder || '',
			account_number: bank.account_number || '',
			bank_name: bank.bank_name || '',
			branch: bank.branch || '',
			ifsc: bank.ifsc || '',
		})
	}

	const submit = async (id: string) => {
		setBusy(true)
		setError(null)
		try {
			await onSubmitClaim(id, form)
			setOpenForm(null)
		} catch (e: any) {
			setError(e?.message || 'The claim could not be submitted.')
		} finally {
			setBusy(false)
		}
	}

	const complete = BANK_FIELDS.every(f => String(form[f.key] || '').trim())

	const header = (a: ClaimRow) => (
		<div className="min-w-0">
			<p className="font-medium">
				{a.course_code} — {a.subject_title}
			</p>
			<p className="text-sm text-muted-foreground mt-0.5">{subtitle(a)}</p>
		</div>
	)

	const downloadButton = (a: ClaimRow) => (
		<Button variant="outline" size="sm" onClick={() => onDownload(a.id)}>
			<Download className="h-4 w-4 mr-1.5" />
			Download claim form
		</Button>
	)

	const renderCard = (a: ClaimRow) => {
		const status = (a.claim_status || 'pending') as QpClaimStatus
		return (
			<Card key={a.id}>
				<CardContent className="p-4 space-y-3">
					<div className="flex flex-wrap items-start justify-between gap-3">
						{header(a)}
						<Badge variant="outline" className={cn('shrink-0', TONE[status])}>
							{QP_CLAIM_STATUS_LABELS[status]}
						</Badge>
					</div>

					{status === 'pending' && (
						<>
							<p className="text-sm text-muted-foreground">
								<span className="font-medium text-foreground">Action required:</span> complete your bank
								details to claim
								{a.remuneration != null ? ` Rs. ${Number(a.remuneration).toFixed(2)}` : ''}.
							</p>

							{openForm === a.id ? (
								<div className="space-y-3 rounded-md border p-3.5 bg-slate-50">
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
										{BANK_FIELDS.map(f => (
											<div key={f.key} className={f.key === 'account_holder' ? 'sm:col-span-2' : ''}>
												<Label className="text-xs">{f.label}</Label>
												<Input
													value={form[f.key] || ''}
													placeholder={f.placeholder}
													onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
													disabled={busy}
													className="h-9 mt-1 bg-white"
												/>
											</div>
										))}
									</div>
									<p className="text-xs text-muted-foreground">
										These details are recorded against this claim. Changing them later on your profile
										will not alter a claim you have already submitted.
									</p>
									{error && <p className="text-sm text-rose-600">{error}</p>}
									<div className="flex flex-wrap justify-end gap-2">
										<Button variant="ghost" size="sm" onClick={() => setOpenForm(null)} disabled={busy}>
											Cancel
										</Button>
										<Button size="sm" onClick={() => submit(a.id)} disabled={busy || !complete}>
											{busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
											Submit claim
										</Button>
									</div>
								</div>
							) : (
								<div className="flex flex-wrap gap-2">
									<Button size="sm" onClick={() => beginClaim(a)}>
										<Receipt className="h-4 w-4 mr-1.5" />
										Complete Claim Form
									</Button>
									{downloadButton(a)}
								</div>
							)}
						</>
					)}

					{status === 'submitted' && (
						<>
							<div className="rounded-md border bg-blue-50/60 border-blue-200 p-3 text-sm">
								<p className="font-medium text-blue-900">Your claim has been submitted to the CoE.</p>
								<p className="text-blue-800 mt-0.5">
									Status: Under verification
									{a.claim_submitted_at && ` · submitted ${formatIst(a.claim_submitted_at)}`}
								</p>
							</div>
							<div className="flex flex-wrap gap-2">{downloadButton(a)}</div>
						</>
					)}

					{status === 'approved' && (
						<>
							<div className="rounded-md border bg-emerald-50 border-emerald-200 p-3 text-sm">
								<p className="font-medium text-emerald-900 flex items-center gap-1.5">
									<CheckCircle2 className="h-4 w-4" />
									Claim approved by the CoE
								</p>
								<p className="text-emerald-800 mt-0.5">
									Status: Payment processing
									{a.claim_approved_at && ` · approved ${formatIst(a.claim_approved_at)}`}
								</p>
								{a.claim_remarks && <p className="text-emerald-800 mt-1">{a.claim_remarks}</p>}
							</div>
							<div className="flex flex-wrap gap-2">{downloadButton(a)}</div>
						</>
					)}

					{status === 'paid' && (
						<>
							<div className="rounded-md border bg-emerald-50 border-emerald-300 p-3 text-sm">
								<p className="font-medium text-emerald-900 flex items-center gap-1.5">
									<Wallet className="h-4 w-4" />
									Payment completed
								</p>
								<div className="mt-1 space-y-0.5 text-emerald-800">
									{a.payment_completed_at && <p>Payment date: {formatIst(a.payment_completed_at, false)}</p>}
									{a.payment_amount != null && <p>Amount: Rs. {Number(a.payment_amount).toFixed(2)}</p>}
									{a.payment_reference && <p>Reference: {a.payment_reference}</p>}
								</div>
							</div>
							<div className="flex flex-wrap gap-2">{downloadButton(a)}</div>
						</>
					)}
				</CardContent>
			</Card>
		)
	}

	if (loading) {
		return (
			<div className="py-20 flex justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		)
	}

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-xl font-semibold">Claim Form</h1>
				<p className="text-sm text-muted-foreground mt-0.5">
					Remuneration claims for the question papers you have completed.
				</p>
			</div>

			{claimable.length === 0 ? (
				<Card>
					<CardContent className="p-10 text-center space-y-2">
						<Lock className="h-8 w-8 mx-auto text-muted-foreground" />
						<p className="font-medium">No claims are open yet</p>
						<p className="text-sm text-muted-foreground max-w-md mx-auto">
							A claim opens once you have completed a question paper submission — the paper itself, the
							check list and your signature.
						</p>
					</CardContent>
				</Card>
			) : (
				<Tabs defaultValue={byStatus.pending.length > 0 ? 'pending' : 'submitted'}>
					<TabsList className="flex-wrap h-auto">
						{TABS.map(({ key, icon: Icon }) => (
							<TabsTrigger key={key} value={key} className="gap-1.5">
								<Icon className="h-3.5 w-3.5" />
								{QP_CLAIM_STATUS_LABELS[key].replace('Claim ', '')}
								{byStatus[key].length > 0 && (
									<span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[11px] leading-4">
										{byStatus[key].length}
									</span>
								)}
							</TabsTrigger>
						))}
					</TabsList>

					{TABS.map(({ key }) => (
						<TabsContent key={key} value={key} className="pt-4 space-y-3">
							{byStatus[key].length === 0 ? (
								<Card>
									<CardContent className="p-8 text-center text-sm text-muted-foreground">
										Nothing here.
									</CardContent>
								</Card>
							) : (
								byStatus[key].map(renderCard)
							)}
						</TabsContent>
					))}
				</Tabs>
			)}
		</div>
	)
}
