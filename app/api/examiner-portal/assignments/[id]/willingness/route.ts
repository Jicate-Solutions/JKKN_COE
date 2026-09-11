// Examiner portal — confirm what the examiner is willing to do.
//
// POST /api/examiner-portal/assignments/:id/willingness
//   { qp_willing?: boolean, ak_willing?: boolean }
//
// An appointment names its components (question paper, answer key, or both);
// the examiner decides, per component, whether they will do it. That decision
// is what:
//
//   • enables or disables the question fields and the answer-key fields
//   • makes the answer key mandatory (only when accepted)
//   • sets the claim — the accepted components' fees, never the type's total
//
// It can be changed any time before the paper is handed over (stage
// 'authoring'); afterwards the claim is settled and the choice is locked. The
// choice is not window-gated: it exposes no question content, and confirming
// before the window opens is the normal case.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireAssignment, logAccess } from '@/lib/qp-portal/guard'
import { componentsForType, computeClaim } from '@/lib/qp-portal/fees'
import type { QpAssignmentType } from '@/types/qp-examiner-assignment'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const LOCKED_STATUSES = ['submitted', 'accepted', 'cancelled']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const auth = await requireAssignment(req, id, { action: 'confirm willingness' })
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()
		const { assignment, stage } = auth.access

		if (stage !== 'authoring' || LOCKED_STATUSES.includes(assignment.status)) {
			return NextResponse.json(
				{
					error:
						'Your willingness is locked once the question paper has been handed over. Contact the Office of the Controller of Examinations if it needs changing.',
				},
				{ status: 409 }
			)
		}

		const type: QpAssignmentType = (assignment.assignment_type as QpAssignmentType) || 'question_paper'
		const components = componentsForType(type)
		const body = await req.json().catch(() => ({}))

		// Setting the paper is the appointment itself: it is always "willing" when
		// the type carries it, whatever the client sends. The answer key is the
		// only choice, and it must be answered explicitly.
		const qpWilling = components.qp
		const akWilling = components.ak ? body.ak_willing === true : false
		if (components.ak && typeof body.ak_willing !== 'boolean') {
			return NextResponse.json({ error: 'Say whether you are willing to prepare the answer key.' }, { status: 400 })
		}

		const claim = computeClaim({
			assignment_type: type,
			qp_fee: assignment.qp_fee,
			ak_fee: assignment.ak_fee,
			qp_willing: qpWilling,
			ak_willing: akWilling,
		})

		const now = new Date().toISOString()
		const { error } = await supabase
			.from('ia_qp_assignments')
			.update({
				qp_willing: qpWilling,
				ak_willing: akWilling,
				willingness_confirmed_at: now,
				claim_amount: claim.total,
				updated_at: now,
			})
			.eq('id', id)
		if (error) {
			console.error('[QP portal] willingness save failed:', error.message)
			return NextResponse.json({ error: 'Your choice could not be saved.' }, { status: 500 })
		}

		await logAccess(req, {
			action: 'willingness_confirmed',
			module: 'assignment',
			performed_by_role: 'examiner',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
			old_value: {
				qp_willing: assignment.qp_willing ?? null,
				ak_willing: assignment.ak_willing ?? null,
				claim_amount: assignment.claim_amount ?? null,
			},
			new_value: { qp_willing: qpWilling, ak_willing: akWilling, claim_amount: claim.total },
			detail: { assignment_type: type, qp_fee: assignment.qp_fee ?? null, ak_fee: assignment.ak_fee ?? null },
		})

		const declinedAll = !qpWilling && !akWilling
		return NextResponse.json({
			success: true,
			qp_willing: qpWilling,
			ak_willing: akWilling,
			willingness_confirmed_at: now,
			claim_amount: claim.total,
			claim_breakdown: claim,
			message: declinedAll
				? 'Recorded. You have declined both parts of this appointment, so there is no payable claim.'
				: `Recorded. Your claim for this paper is ₹${claim.total.toLocaleString('en-IN')}.`,
		})
	} catch (error) {
		console.error('[QP portal] willingness POST failed:', error)
		return NextResponse.json({ error: 'Your choice could not be saved.' }, { status: 500 })
	}
}
