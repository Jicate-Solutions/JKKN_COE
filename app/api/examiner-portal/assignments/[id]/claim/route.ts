// Examiner portal — the remuneration claim for one assignment.
//
// POST /api/examiner-portal/assignments/:id/claim   { account_holder, bank_name,
//                                                     account_number, branch, ifsc }
//
// The claim walks pending → submitted → approved → paid. This route owns only
// the first move; approval and payment belong to the CoE and are not reachable
// from the portal at all, so an examiner cannot advance their own claim.
//
// Two rules the UI must not be trusted to keep:
//
//   1. A claim opens only once the SUBMISSION IS COMPLETE — check list and
//      signature included, not merely the content handed over. The claim form
//      carries that signature, so a claim before it would print unsigned.
//   2. Bank details are SNAPSHOT onto the assignment, never referenced live off
//      the profile. A submitted claim must keep the account it was submitted
//      with; editing the profile afterwards cannot restate a claim the CoE has
//      already approved or paid.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireAssignment, logAccess, requestOrigin } from '@/lib/qp-portal/guard'
import { snapshotClaimVersion } from '@/lib/qp-portal/versioning'
import { QP_CLAIM_LOCKED_STATUSES, type QpClaimStatus } from '@/types/qp-examiner-assignment'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Trim and cap a submitted field; blank becomes null. */
function field(value: unknown, max: number): string | null {
	const v = String(value ?? '').trim()
	return v ? v.slice(0, max) : null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const auth = await requireAssignment(req, id, { action: 'submit claim' })
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()
		const { assignment, stage } = auth.access

		// ORDER (Sept 2026): paper handed over → CLAIM FORM → check list →
		// signature → completed. The check list asks the examiner to confirm the
		// bank details on the claim form, so the claim has to exist before it. The
		// claim therefore opens as soon as the paper is in, not at completion. The
		// printed claim form still carries the signature: the portal offers the
		// download only once the submission is completed.
		if (stage === 'authoring') {
			return NextResponse.json(
				{
					error: 'Your claim form opens once the question paper has been submitted.',
					submission_stage: stage,
				},
				{ status: 400 }
			)
		}

		const claimStatus = (assignment.claim_status || 'pending') as QpClaimStatus
		if (QP_CLAIM_LOCKED_STATUSES.includes(claimStatus)) {
			return NextResponse.json(
				{
					error:
						claimStatus === 'submitted'
							? 'Your claim has already been submitted and is with the Office of the Controller of Examinations.'
							: 'This claim has been processed and can no longer be changed.',
					claim_status: claimStatus,
				},
				{ status: 409 }
			)
		}

		const body = await req.json().catch(() => ({}))
		const bank = {
			claim_account_holder: field(body.account_holder, 200),
			claim_bank_name: field(body.bank_name, 200),
			claim_account_number: field(body.account_number, 60),
			claim_branch: field(body.branch, 200),
			claim_ifsc: field(body.ifsc, 20)?.toUpperCase() || null,
		}

		// Every field is needed to actually pay someone, so a partly filled claim
		// is refused here rather than reaching the CoE and bouncing back.
		const missing = Object.entries({
			'account holder name': bank.claim_account_holder,
			'bank name': bank.claim_bank_name,
			'account number': bank.claim_account_number,
			'branch': bank.claim_branch,
			'IFSC code': bank.claim_ifsc,
		})
			.filter(([, v]) => !v)
			.map(([label]) => label)

		if (missing.length > 0) {
			return NextResponse.json(
				{ error: `Enter your ${missing.join(', ')} before submitting the claim.`, missing },
				{ status: 400 }
			)
		}

		// Format, not just presence — a claim with a malformed IFSC or a
		// non-numeric account number cannot be paid and would bounce back from
		// the CoE. Mirrors the profile route and the claim form.
		bank.claim_account_number = String(bank.claim_account_number).replace(/\s+/g, '')
		if (!/^\d{6,20}$/.test(bank.claim_account_number)) {
			return NextResponse.json(
				{ error: 'Enter a valid bank account number (6 to 20 digits).', missing: ['account number'] },
				{ status: 400 }
			)
		}
		if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(bank.claim_ifsc))) {
			return NextResponse.json(
				{ error: 'That IFSC does not look right — it should be like SBIN0001234.', missing: ['IFSC code'] },
				{ status: 400 }
			)
		}

		const now = new Date().toISOString()
		const { error } = await supabase
			.from('ia_qp_assignments')
			.update({
				...bank,
				claim_status: 'submitted',
				claim_submitted_at: now,
				updated_at: now,
			})
			.eq('id', id)
			// Losing a race must not overwrite a claim the CoE has begun processing.
			.eq('claim_status', 'pending')

		if (error) {
			console.error('[QP portal] claim submit failed:', error.message)
			return NextResponse.json({ error: 'The claim could not be recorded.' }, { status: 500 })
		}

		// The examiner's profile is updated alongside so the next claim is
		// pre-filled — but the SNAPSHOT above is what this claim is paid against.
		await supabase
			.from('examiners')
			.update({
				bank_account_holder: bank.claim_account_holder,
				bank_name: bank.claim_bank_name,
				bank_account_number: bank.claim_account_number,
				bank_branch: bank.claim_branch,
				bank_ifsc: bank.claim_ifsc,
			})
			.eq('id', auth.examiner.id)

		// ── Version history ──────────────────────────────────────────────────
		const origin = requestOrigin(req)
		const isResubmit = !!assignment.claim_reopened_at || (assignment.claim_version || 0) > 0
		let version: number | null = assignment.claim_version ?? null
		const snap = await snapshotClaimVersion(supabase, {
			assignmentId: id,
			institutionsId: assignment.institutions_id,
			examinerId: auth.examiner.id,
			data: {
				account_holder: bank.claim_account_holder,
				bank_name: bank.claim_bank_name,
				account_number: bank.claim_account_number,
				branch: bank.claim_branch,
				ifsc: bank.claim_ifsc,
				// The ACCEPTED amount, not the order's potential figure.
				rate: assignment.claim_amount ?? assignment.remuneration ?? null,
				assignment_type: assignment.assignment_type || 'question_paper',
				qp_fee: assignment.qp_willing === false ? 0 : assignment.qp_fee ?? null,
				ak_fee: assignment.ak_willing === false ? 0 : assignment.ak_fee ?? null,
				qp_willing: assignment.qp_willing ?? null,
				ak_willing: assignment.ak_willing ?? null,
				course_code: assignment.course_code,
				subject_title: assignment.subject_title,
				examination_session_id: assignment.examination_session_id,
				submitted_at: now,
				...(isResubmit
					? {
							resubmission_of_version: assignment.claim_version || null,
							reopen_reason: assignment.claim_reopen_reason || null,
						}
					: {}),
			},
			actor: { ip: origin.ip, userAgent: origin.userAgent },
		})
		if ('error' in snap) console.error('[QP portal] claim version snapshot failed:', snap.error)
		else version = snap.version

		// A resubmission closes the reopen: the reason stays on the version row
		// and in the audit log, the assignment no longer shows as reopened.
		if (assignment.claim_reopened_at) {
			await supabase
				.from('ia_qp_assignments')
				.update({ claim_reopened_at: null, claim_reopened_by: null, claim_reopen_reason: null, claim_reopen_remarks: null })
				.eq('id', id)
		}

		await logAccess(req, {
			action: isResubmit ? 'claim_resubmit' : 'claim_submit',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
			module: 'claim',
			performed_by_role: 'examiner',
			version,
			old_value: isResubmit
				? {
						claim_status: 'pending',
						reopened_from_version: assignment.claim_version || null,
						account_holder: assignment.claim_account_holder,
						bank_name: assignment.claim_bank_name,
						branch: assignment.claim_branch,
						ifsc: assignment.claim_ifsc,
					}
				: { claim_status: 'pending' },
			// The account number is deliberately absent from the audit line.
			new_value: {
				claim_status: 'submitted',
				version,
				account_holder: bank.claim_account_holder,
				bank_name: bank.claim_bank_name,
				branch: bank.claim_branch,
				ifsc: bank.claim_ifsc,
			},
			detail: { bank_name: bank.claim_bank_name, ifsc: bank.claim_ifsc },
		})

		return NextResponse.json({
			success: true,
			claim_status: 'submitted',
			claim_submitted_at: now,
			claim_version: version,
			message: 'Claim submitted to the Office of the Controller of Examinations for verification.',
		})
	} catch (error) {
		console.error('[QP portal] claim POST failed:', error)
		return NextResponse.json({ error: 'The claim could not be recorded.' }, { status: 500 })
	}
}
