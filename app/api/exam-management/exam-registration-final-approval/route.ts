import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { parseProgramCodes } from '@/lib/exam-applications/program-levels'
import { batchLabel } from '@/lib/utils/batch-year'
import { CONCESSION_MIGRATION_HINT } from '@/lib/exam-fee-concessions/concessions'
import {
	learnerKeyOf,
	loadPendingFinalApprovalCohort,
	totalsOf,
} from '@/lib/exam-registration-final-approval/cohort'
import { FINAL_APPROVAL_PAYMENT_MODES } from '@/types/exam-registration-final-approval'
import type {
	FinalApprovalApprovedRow,
	FinalApprovalCohortResponse,
	FinalApprovalFilterOption,
	FinalApprovalLearner,
	FinalApprovalPaymentMode,
	FinalApprovalResult,
	FinalApprovalSkipped,
} from '@/types/exam-registration-final-approval'

/**
 * Final Exam Registration Approval API
 * =====================================================
 * GET  - learners whose exam application payment is approved and whose final
 *        registration approval is still pending, one row per learner with the
 *        consolidated fee.
 * POST - approve the selected learners. Every paper the learner applied for in
 *        the session is moved to fee_paid = true / registration_status =
 *        'Approved' and a learner-level exam_registration_fee_details row is
 *        written - in ONE database transaction (approve_final_exam_registration).
 *
 * Migration: supabase/migrations/20260912_exam_registration_final_approval.sql
 */

const VIEW_PERMISSION = 'page.exam_management.exam_registration_final_approval.view'
const APPROVE_PERMISSION = 'page.exam_management.exam_registration_final_approval.approve'

const MAX_LEARNERS_PER_APPROVAL = 1000

const MIGRATION_HINT =
	'Run supabase/migrations/20260912_exam_registration_final_approval.sql in the Supabase SQL Editor (creates exam_registration_fee_details and approve_final_exam_registration).'

const PAYMENT_MIGRATION_HINT =
	'Run supabase/migrations/20260919_final_approval_manual_late_fine.sql in the Supabase SQL Editor (lets the approval store the late fine and the mode of payment entered on this screen).'

/** Actual head less its waiver, to the paisa */
const net = (amount: number, waiver: number) => Math.round((amount - waiver) * 100) / 100

/** Upper bound on a hand-entered late fine - catches a slipped digit, not a policy */
const MAX_LATE_FINE = 100000

function optionsOf(
	learners: FinalApprovalLearner[],
	pick: (l: FinalApprovalLearner) => { value: string | null; label: string } | null,
	sort: (a: FinalApprovalFilterOption, b: FinalApprovalFilterOption) => number
): FinalApprovalFilterOption[] {
	const map = new Map<string, FinalApprovalFilterOption>()
	for (const l of learners) {
		const picked = pick(l)
		if (!picked || !picked.value) continue
		const existing = map.get(picked.value)
		if (existing) existing.count++
		else map.set(picked.value, { value: picked.value, label: picked.label, count: 1 })
	}
	return [...map.values()].sort(sort)
}

/** exam_registration_fee_details exists - i.e. the migration has been applied */
async function isMigrationReady(supabase: ReturnType<typeof getSupabaseServer>): Promise<boolean> {
	const { error } = await supabase.from('exam_registration_fee_details').select('id').limit(1)
	return !error
}

// =====================================================
// GET - pending cohort
// =====================================================
export async function GET(request: Request) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutions_id = searchParams.get('institutions_id') || ''
		const examination_session_id = searchParams.get('examination_session_id') || ''
		// Multi-select: `program_codes=UCA,UCS` (comma list); `program_code` still works
		const programFilter = new Set(
			parseProgramCodes(searchParams.get('program_codes') || searchParams.get('program_code'))
		)
		const regulationFilter = String(searchParams.get('regulation_code') || '').trim()
		// Multi-select admission years: `batches=2024,2023`; 0 = not mapped
		const batchFilter = new Set(
			String(searchParams.get('batches') || '')
				.split(',')
				.map(v => v.trim())
				.filter(Boolean)
				.map(Number)
				.filter(Number.isFinite)
		)

		if (!institutions_id) return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		if (!examination_session_id) return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })

		const [cohort, migrationReady] = await Promise.all([
			loadPendingFinalApprovalCohort(supabase, { institutions_id, examination_session_id }),
			isMigrationReady(supabase),
		])

		const all = cohort.learners

		const filtered = all.filter(l => {
			if (programFilter.size > 0 && !programFilter.has(l.program_code || '')) return false
			if (regulationFilter && regulationFilter !== 'all' && (l.regulation_code || '') !== regulationFilter) return false
			if (batchFilter.size > 0 && !batchFilter.has(l.batch_year)) return false
			return true
		})

		const response: FinalApprovalCohortResponse = {
			data: filtered,
			filters: {
				regulations: optionsOf(
					all,
					l => l.regulation_code ? { value: l.regulation_code, label: l.regulation_code } : null,
					(a, b) => a.value.localeCompare(b.value)
				),
				programs: optionsOf(
					all,
					l => l.program_code ? { value: l.program_code, label: l.program_name ? `${l.program_code} - ${l.program_name}` : l.program_code } : null,
					(a, b) => a.value.localeCompare(b.value)
				),
				batches: optionsOf(
					all,
					l => ({ value: String(l.batch_year), label: batchLabel(l.batch_year) }),
					// Newest batch first; "Not Mapped" (0) sinks to the end
					(a, b) => Number(b.value) - Number(a.value)
				),
			},
			summary: totalsOf(filtered),
			migration_ready: migrationReady,
			charge_columns_ready: cohort.charge_columns_ready,
		}

		return NextResponse.json(response)
	} catch (e) {
		console.error('[final-approval] GET error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

// =====================================================
// POST - approve the selected learners
// =====================================================
export async function POST(request: Request) {
	try {
		const perm = await requireUserPermission(APPROVE_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const body = await request.json()

		const institutions_id = String(body.institutions_id || '')
		const examination_session_id = String(body.examination_session_id || '')
		const requested: any[] = Array.isArray(body.learners) ? body.learners : []

		if (!institutions_id) return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		if (!examination_session_id) return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })

		// ── Mode of payment: the fee is collected at this step ──
		const payment_mode = String(body.payment_mode || '').trim() as FinalApprovalPaymentMode
		const payment_transaction_id = String(body.payment_transaction_id || '').trim() || null
		if (!FINAL_APPROVAL_PAYMENT_MODES.includes(payment_mode)) {
			return NextResponse.json({ error: 'Select the mode of payment (Cash or Online)' }, { status: 400 })
		}
		if (payment_mode === 'Online' && !payment_transaction_id) {
			return NextResponse.json({ error: 'Enter the payment transaction id for an online payment' }, { status: 400 })
		}
		if (payment_transaction_id && payment_transaction_id.length > 255) {
			return NextResponse.json({ error: 'Payment transaction id is too long (255 characters at most)' }, { status: 400 })
		}

		// The client sends learner keys only. Which paper rows those learners hold
		// is re-derived from the database, so a stale screen can never approve a
		// paper that has since been withdrawn.
		// The late-payment fine is the one amount the office keys in by hand.
		const wanted = new Map<string, { register_number: string; late_fine: number }>()
		for (const entry of requested) {
			const register_number = String(entry?.register_number || entry?.stu_register_no || '').trim()
			const key = learnerKeyOf({ student_id: entry?.student_id || entry?.id || null, register_number })
			if (!key || key === 'sid:') continue

			const rawFine = entry?.late_fine
			const late_fine = rawFine == null || rawFine === '' ? 0 : Number(rawFine)
			if (!Number.isFinite(late_fine) || late_fine < 0 || late_fine > MAX_LATE_FINE) {
				return NextResponse.json(
					{ error: `Late fine for ${register_number || key} must be an amount between 0 and ${MAX_LATE_FINE}.` },
					{ status: 400 }
				)
			}
			wanted.set(key, { register_number: register_number || key, late_fine: Math.round(late_fine * 100) / 100 })
		}

		if (wanted.size === 0) {
			return NextResponse.json({ error: 'Select at least one learner to approve' }, { status: 400 })
		}
		if (wanted.size > MAX_LEARNERS_PER_APPROVAL) {
			return NextResponse.json(
				{ error: `Too many learners in one request (${wanted.size}). Approve in batches of at most ${MAX_LEARNERS_PER_APPROVAL}.` },
				{ status: 400 }
			)
		}

		const cohort = await loadPendingFinalApprovalCohort(supabase, { institutions_id, examination_session_id })

		// ── Match the selection against what is actually still pending ──
		const selected: FinalApprovalLearner[] = []
		const matchedKeys = new Set<string>()
		for (const learner of cohort.learners) {
			const sidKey = learner.student_id ? `sid:${learner.student_id}` : null
			const hit = wanted.has(learner.key) ? learner.key : sidKey && wanted.has(sidKey) ? sidKey : null
			if (!hit) continue
			matchedKeys.add(hit)
			const late_fine = wanted.get(hit)?.late_fine || 0
			selected.push({
				...learner,
				late_fine,
				final_amount: Math.round((learner.final_amount + late_fine) * 100) / 100,
			})
		}

		const skipped: FinalApprovalSkipped[] = []
		for (const [key, entry] of wanted) {
			if (matchedKeys.has(key)) continue
			skipped.push({
				register_number: entry.register_number,
				reason: 'No subject registration is awaiting final approval (already approved, withdrawn, or not applied)',
			})
		}

		// ── Validation (section 9 of the spec) ──
		for (const learner of selected) {
			if (learner.total_subjects === 0) {
				skipped.push({ register_number: learner.register_number, reason: 'No registered subject' })
			}
		}
		const approvable = selected.filter(l => l.total_subjects > 0)

		if (approvable.length === 0) {
			return NextResponse.json(
				{
					error: 'None of the selected learners is awaiting final approval. Refresh the list and try again.',
					skipped,
				},
				{ status: 400 }
			)
		}

		const registrationIds = approvable.flatMap(l => l.subjects.map(s => s.registration_id))
		const feeDetails = approvable.map(l => ({
			institutions_id,
			institution_code: cohort.institution?.institution_code || null,
			examination_session_id,
			session_code: cohort.session?.session_code || null,
			student_id: l.student_id,
			stu_register_no: l.register_number,
			student_name: l.student_name || null,
			regulation_code: l.regulation_code,
			program_code: l.program_code,
			semester: l.semester,
			total_subjects: l.total_subjects,
			// The learner-level record holds what was actually collected: NET heads
			exam_fee: net(l.exam_fee, l.concession_exam_fee),
			application_fee: net(l.application_fee, l.concession_application_fee),
			mark_statement_fee: net(l.mark_statement_fee, l.concession_mark_statement_fee),
			late_fine: l.late_fine,
			concession_amount: l.concession_amount,
			final_amount: l.final_amount,
		}))

		// ── Fee concessions: what comes off which paper row ──
		// The exam-fee waiver is taken paper by paper until it is used up; the
		// application / mark statement waivers come off the anchor row that carries
		// those heads. Unapprove puts exactly these amounts back.
		const concessions = approvable
			.filter(l => l.concession_id && l.concession_amount > 0)
			.map(l => {
				const byRow = new Map<string, { registration_id: string; fee_amount: number; application_fee: number; mark_statement_fee: number }>()
				const rowOf = (registration_id: string) => {
					let row = byRow.get(registration_id)
					if (!row) {
						row = { registration_id, fee_amount: 0, application_fee: 0, mark_statement_fee: 0 }
						byRow.set(registration_id, row)
					}
					return row
				}

				let remaining = l.concession_exam_fee
				for (const subject of l.subjects) {
					if (remaining <= 0) break
					const take = Math.min(remaining, subject.exam_fee)
					if (take <= 0) continue
					rowOf(subject.registration_id).fee_amount = net(take, 0)
					remaining = net(remaining, take)
				}
				if (l.anchor_registration_id) {
					if (l.concession_application_fee > 0) rowOf(l.anchor_registration_id).application_fee = l.concession_application_fee
					if (l.concession_mark_statement_fee > 0) rowOf(l.anchor_registration_id).mark_statement_fee = l.concession_mark_statement_fee
				}
				return { concession_id: l.concession_id, adjustments: [...byRow.values()] }
			})

		// The entered fine is also stamped on the learner's anchor paper row (and any
		// fine an older build stamped is cleared) so the paper-level reports agree
		// with exam_registration_fee_details. Needs the late_fine column.
		const lateFines = cohort.charge_columns_ready
			? approvable
				.filter(l => l.anchor_registration_id)
				.map(l => ({ registration_id: l.anchor_registration_id, late_fine: l.late_fine }))
			: null

		// ── One transaction: every paper of every selected learner, or nothing ──
		const { data: rpcData, error: rpcError } = await supabase.rpc('approve_final_exam_registration', {
			p_registration_ids: registrationIds,
			p_fee_details: feeDetails,
			p_approved_by: perm.userId || null,
			p_late_fines: lateFines,
			// Cash carries no transaction id
			p_payment: { payment_mode, payment_transaction_id: payment_mode === 'Online' ? payment_transaction_id : null },
			// Named only when there is one to apply, so approvals without a
			// concession keep working before 20260921_exam_fee_concessions.sql is run
			...(concessions.length > 0 ? { p_concessions: concessions } : {}),
		})

		if (rpcError) {
			const msg = rpcError.message || ''
			const missingFunction = rpcError.code === 'PGRST202' || /could not find the function/i.test(msg)
			const missingTable = /exam_registration_fee_details/i.test(msg) && /does not exist/i.test(msg)
			if (missingTable) {
				return NextResponse.json({ error: `Final approval is not set up yet. ${MIGRATION_HINT}` }, { status: 503 })
			}
			// p_late_fines / p_payment arrive with the 20260919 migration
			if (missingFunction) {
				const hint = concessions.length > 0 ? CONCESSION_MIGRATION_HINT : PAYMENT_MIGRATION_HINT
				return NextResponse.json({ error: `Final approval needs a database update. ${hint}` }, { status: 503 })
			}
			console.error('[final-approval] approve_final_exam_registration failed:', rpcError)
			// P0001 carries the function's own user-facing message (stale selection etc.)
			return NextResponse.json({ error: msg || 'Final approval failed', skipped }, { status: rpcError.code === 'P0001' ? 409 : 500 })
		}

		const totals = totalsOf(approvable)
		const subjectsUpdated = Number((rpcData as any)?.subjects_updated ?? registrationIds.length)
		const studentsApproved = Number((rpcData as any)?.students_approved ?? approvable.length)

		const approvedAt = String((rpcData as any)?.approved_at || new Date().toISOString())
		const approved: FinalApprovalApprovedRow[] = approvable.map(l => ({
			id: l.key,
			student_id: l.student_id,
			stu_register_no: l.register_number,
			student_name: l.student_name,
			program_code: l.program_code,
			program_name: l.program_name,
			regulation_code: l.regulation_code,
			learner_semester: l.semester || 0,
			total_subjects: l.total_subjects,
			exam_fee: net(l.exam_fee, l.concession_exam_fee),
			application_fee: net(l.application_fee, l.concession_application_fee),
			mark_statement_fee: net(l.mark_statement_fee, l.concession_mark_statement_fee),
			late_fine: l.late_fine,
			concession_amount: l.concession_amount,
			final_amount: l.final_amount,
			fee_paid: true,
			payment_status: 'Payment Approved',
			registration_status: 'Approved',
			payment_mode,
			payment_transaction_id: payment_mode === 'Online' ? payment_transaction_id : null,
			approved_at: approvedAt,
		}))

		const result: FinalApprovalResult = {
			success: skipped.length === 0,
			message: `Final registration approval completed successfully. Learners approved: ${studentsApproved}, subjects updated: ${subjectsUpdated}.`,
			students_approved: studentsApproved,
			subjects_updated: subjectsUpdated,
			totals,
			payment_mode,
			payment_transaction_id: payment_mode === 'Online' ? payment_transaction_id : null,
			approved,
			skipped,
		}

		return NextResponse.json(result)
	} catch (e) {
		console.error('[final-approval] POST error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
