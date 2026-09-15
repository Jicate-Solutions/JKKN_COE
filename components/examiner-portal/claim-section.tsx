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
import { QP_CLAIM_STATUS_LABELS, type QpClaimStatus, type QpAssignmentType } from '@/types/qp-examiner-assignment'
import { computeClaim, componentsForType, formatRupees } from '@/lib/qp-portal/fees'
import { TAB_TONE, type Tone } from './tones'

/** Which colour each claim tab lights up in: amber = your action, blue = with the CoE, green = done. */
const TAB_CLAIM_TONE: Record<QpClaimStatus, Tone> = {
	pending: 'warning',
	submitted: 'info',
	approved: 'success',
	paid: 'success',
}

interface ClaimRow {
	id: string
	course_code: string
	subject_title: string
	program_code: string | null
	semester: number | null
	session_name: string | null
	session_label: string | null
	remuneration: number | null
	/** Type, per-component fees, confirmed willingness and the accepted claim. */
	assignment_type?: QpAssignmentType | null
	qp_fee?: number | null
	ak_fee?: number | null
	qp_willing?: boolean | null
	ak_willing?: boolean | null
	claim_amount?: number | null
	submission_stage: string
	claim_status: QpClaimStatus
	claim_submitted_at: string | null
	claim_approved_at: string | null
	claim_remarks: string | null
	payment_completed_at: string | null
	payment_reference: string | null
	payment_amount: number | null
	claim_version?: number | null
	claim_reopened_at?: string | null
	claim_reopen_reason?: string | null
	claim_reopen_remarks?: string | null
	/** The account this claim was submitted with (null until submitted). */
	claim_account_holder?: string | null
	claim_bank_name?: string | null
	claim_account_number?: string | null
	claim_branch?: string | null
	claim_ifsc?: string | null
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

// Every field is mandatory: all five are needed to actually pay someone.
// `validate` returns the message to show, or null when the value is acceptable.
// The same rules run on the server (claim route), so a stale tab gets the same
// answer.
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
const ACCOUNT_RE = /^\d{6,20}$/

const BANK_FIELDS: {
	key: string
	label: string
	placeholder?: string
	hint?: string
	validate: (v: string) => string | null
}[] = [
	{
		key: 'account_holder',
		label: 'Bank account holder name',
		placeholder: 'Name exactly as printed in the passbook',
		validate: v => (v.trim().length < 2 ? 'Enter the account holder name as printed in the passbook.' : null),
	},
	{
		key: 'account_number',
		label: 'Bank account number',
		placeholder: 'Digits only',
		validate: v => (!ACCOUNT_RE.test(v.replace(/\s+/g, '')) ? 'Enter a valid account number (6 to 20 digits).' : null),
	},
	{
		key: 'bank_name',
		label: 'Bank name',
		placeholder: 'e.g. State Bank of India',
		validate: v => (v.trim().length < 2 ? 'Enter the bank name.' : null),
	},
	{
		key: 'branch',
		label: 'Branch name',
		placeholder: 'e.g. Kumarapalayam',
		validate: v => (v.trim().length < 2 ? 'Enter the branch name.' : null),
	},
	{
		key: 'ifsc',
		label: 'IFSC code',
		placeholder: 'e.g. SBIN0001234',
		hint: '11 characters: 4 letters, a zero, then 6 letters or digits.',
		validate: v => (!IFSC_RE.test(v.trim().toUpperCase()) ? 'That IFSC does not look right — it should be like SBIN0001234.' : null),
	},
]

/** The amount this claim pays: the accepted components, never the order's potential figure. */
function claimAmount(a: ClaimRow): number | null {
	if (a.claim_amount != null) return Number(a.claim_amount)
	if (a.assignment_type) {
		return computeClaim({
			assignment_type: a.assignment_type,
			qp_fee: a.qp_fee,
			ak_fee: a.ak_fee,
			qp_willing: a.qp_willing,
			ak_willing: a.ak_willing,
		}).total
	}
	return a.remuneration ?? null
}

/** Question Paper Setting ₹1,250 ✓ / Answer Key ₹0 (declined) / Claim ₹1,250 */
function ClaimBreakdown({ a }: { a: ClaimRow }) {
	const type = a.assignment_type || 'question_paper'
	const c = componentsForType(type)
	const claim = computeClaim({
		assignment_type: type,
		qp_fee: a.qp_fee ?? (type !== 'answer_key' ? a.remuneration : null),
		ak_fee: a.ak_fee,
		qp_willing: a.qp_willing,
		ak_willing: a.ak_willing,
	})
	const line = (label: string, willing: boolean | null | undefined, fee: number | null | undefined, paid: number) => (
		<div className="flex items-center justify-between gap-3 text-xs">
			<span className={cn('flex items-center gap-1.5', willing === false && 'text-muted-foreground line-through')}>
				<span className={cn('inline-block h-3.5 w-3.5 rounded-sm border text-[10px] leading-3 text-center', willing !== false ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300')}>
					{willing !== false ? '✓' : ''}
				</span>
				{label}
				{willing === false && <span className="no-underline text-[10px]">(declined)</span>}
				{willing == null && <span className="text-[10px] text-amber-700">(not yet confirmed)</span>}
			</span>
			<span className={cn('font-medium', willing === false && 'text-muted-foreground')}>
				{willing === false ? formatRupees(0) : formatRupees(fee ?? paid)}
			</span>
		</div>
	)
	return (
		<div className="rounded-md border bg-slate-50 p-2.5 space-y-1">
			{c.qp && line('Question Paper Setting', a.qp_willing, a.qp_fee ?? a.remuneration, claim.qp)}
			{c.ak && line('Answer Key', a.ak_willing, a.ak_fee, claim.ak)}
			<div className="flex items-center justify-between border-t pt-1 text-sm">
				<span className="font-medium">Claim</span>
				<span className="font-semibold text-emerald-700">{formatRupees(claimAmount(a) ?? claim.total)}</span>
			</div>
		</div>
	)
}

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
	// Which fields the examiner has left; a message only appears after that, so
	// an empty form is not red before anyone has typed.
	const [touched, setTouched] = useState<Record<string, boolean>>({})

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

	// The account the examiner last submitted a claim with. The profile is kept
	// in step by the claim route, but the claim snapshot is the authoritative
	// "last details" — it is what the CoE actually paid against.
	const lastClaimBank = useMemo(() => {
		const last = assignments
			.filter(a => a.claim_account_number && a.claim_submitted_at)
			.sort((x, y) => String(y.claim_submitted_at).localeCompare(String(x.claim_submitted_at)))[0]
		return last
			? {
					account_holder: last.claim_account_holder,
					account_number: last.claim_account_number,
					bank_name: last.claim_bank_name,
					branch: last.claim_branch,
					ifsc: last.claim_ifsc,
				}
			: null
	}, [assignments])

	const beginClaim = (a: ClaimRow) => {
		setOpenForm(a.id)
		setError(null)
		setTouched({})
		const src = lastClaimBank || bank
		setForm({
			account_holder: src.account_holder || '',
			account_number: src.account_number || '',
			bank_name: src.bank_name || '',
			branch: src.branch || '',
			ifsc: src.ifsc || '',
		})
	}

	const submit = async (id: string) => {
		// Show every message at once if someone reaches Submit with a gap left.
		setTouched(Object.fromEntries(BANK_FIELDS.map(f => [f.key, true])))
		if (!complete) return
		setBusy(true)
		setError(null)
		try {
			await onSubmitClaim(id, {
				...form,
				account_number: String(form.account_number || '').replace(/\s+/g, ''),
				ifsc: String(form.ifsc || '').trim().toUpperCase(),
			})
			setOpenForm(null)
		} catch (e: any) {
			setError(e?.message || 'The claim could not be submitted.')
		} finally {
			setBusy(false)
		}
	}

	const fieldErrors = useMemo(
		() => Object.fromEntries(BANK_FIELDS.map(f => [f.key, f.validate(String(form[f.key] || ''))])),
		[form]
	)
	const complete = BANK_FIELDS.every(f => !fieldErrors[f.key])

	const header = (a: ClaimRow) => (
		<div className="min-w-0">
			<p className="font-medium">
				{a.course_code} — {a.subject_title}
			</p>
			<p className="text-sm text-muted-foreground mt-0.5">{subtitle(a)}</p>
		</div>
	)

	const downloadButton = (a: ClaimRow) => (
		<Button
			variant="outline"
			size="sm"
			onClick={() => onDownload(a.id)}
			title="One claim form per examination session — every paper you have claimed in this session is listed on it."
		>
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

					<ClaimBreakdown a={a} />

					{status === 'pending' && (
						<>
							{a.claim_reopened_at && (
								<div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm">
									<p className="font-medium text-orange-900">
										Claim form reopened by the Office of the Controller of Examinations
										{a.claim_version ? ` · V${a.claim_version} is on record` : ''}
									</p>
									<p className="text-orange-800 mt-1">Reason: {a.claim_reopen_reason}</p>
									{a.claim_reopen_remarks && <p className="text-orange-800">{a.claim_reopen_remarks}</p>}
									<p className="text-xs text-orange-700 mt-1">
										Reopened on {formatIst(a.claim_reopened_at)}. Correct the details below and submit again — the
										resubmission is saved as V{(a.claim_version || 0) + 1} and the earlier version is kept.
									</p>
								</div>
							)}
							<p className="text-sm text-muted-foreground">
								<span className="font-medium text-foreground">Action required:</span> complete your bank
								details to claim
								{claimAmount(a) != null ? ` ${formatRupees(claimAmount(a))}` : ''}.
							</p>
							<p className="text-xs rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-800">
								The form is pre-filled from the bank details you confirmed on the check list.{' '}
								<span className="font-semibold text-rose-700">Check them once more — the claim is paid to this account.</span>
							</p>

							{openForm === a.id ? (
								<div className="space-y-3 rounded-md border p-3.5 bg-slate-50">
									<p className="text-xs text-muted-foreground">
										All fields are mandatory. <span className="text-rose-600">*</span>
									</p>
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
										{BANK_FIELDS.map(f => {
											const message = touched[f.key] ? fieldErrors[f.key] : null
											return (
												<div key={f.key} className={f.key === 'account_holder' ? 'sm:col-span-2' : ''}>
													<Label htmlFor={`claim-${f.key}`} className="text-xs">
														{f.label} <span className="text-rose-600">*</span>
													</Label>
													<Input
														id={`claim-${f.key}`}
														value={form[f.key] || ''}
														placeholder={f.placeholder}
														required
														aria-required
														aria-invalid={!!message}
														inputMode={f.key === 'account_number' ? 'numeric' : undefined}
														autoCapitalize={f.key === 'ifsc' ? 'characters' : undefined}
														maxLength={f.key === 'ifsc' ? 11 : f.key === 'account_number' ? 20 : 200}
														onChange={e =>
															setForm(p => ({
																...p,
																[f.key]: f.key === 'ifsc' ? e.target.value.toUpperCase() : e.target.value,
															}))
														}
														onBlur={() => setTouched(p => ({ ...p, [f.key]: true }))}
														disabled={busy}
														className={cn('h-9 mt-1 bg-white', message && 'border-rose-500 focus-visible:ring-rose-500')}
													/>
													{message ? (
														<p className="text-xs text-rose-600 mt-1">{message}</p>
													) : f.hint ? (
														<p className="text-xs text-muted-foreground mt-1">{f.hint}</p>
													) : null}
												</div>
											)
										})}
									</div>
									<p className="text-xs text-muted-foreground">
										{lastClaimBank
											? 'Pre-filled from your last claim — check them before submitting. '
											: ''}
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
									{a.claim_version ? ` · version V${a.claim_version}` : ''}
								</p>
							</div>
							<p className="text-xs text-slate-700 flex items-start gap-1.5">
								<Lock className="h-3.5 w-3.5 shrink-0 mt-px" />
								This submission has already been finalized. Any reopening and subsequent modification will be permanently recorded in the audit log.
							</p>
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
				<h1 className="text-2xl font-semibold tracking-tight text-slate-900">Claim Form</h1>
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
					<TabsList className="flex-wrap h-auto p-1 bg-slate-100 border">
						{TABS.map(({ key, icon: Icon }) => (
							<TabsTrigger key={key} value={key} className={cn('gap-1.5 px-4 py-1.5', TAB_TONE[TAB_CLAIM_TONE[key]])}>
								<Icon className="h-3.5 w-3.5" />
								{QP_CLAIM_STATUS_LABELS[key].replace('Claim ', '')}
								{byStatus[key].length > 0 && (
									<span className="ml-1 rounded-full bg-black/10 px-1.5 text-[11px] leading-4">
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
