// Version history for one assignment — the question paper and the claim.
//
// GET /api/pre-exam/qp-examiner-assignments/:id/history
//
// Returns every submitted version of both, newest first, each with who
// submitted it, from where, and — when it was reopened — who authorised that
// and why. Read-only: versions are written only by the submit and reopen
// paths and are frozen by a database trigger.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'

export const dynamic = 'force-dynamic'

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const { id } = await params
		const supabase = getSupabaseServer()
		const withQuestions = new URL(req.url).searchParams.get('questions') === '1'

		const [paperRes, claimRes, assignRes] = await Promise.all([
			supabase
				.from('ia_qp_paper_versions')
				.select(
					withQuestions
						? '*'
						: 'id, assignment_id, paper_id, version, status, question_total, question_done, submitted_at, submitted_by_examiner_id, submitted_ip, submitted_user_agent, reopened_at, reopened_by, reopened_by_email, reopen_reason, reopen_remarks'
				)
				.eq('assignment_id', id)
				.order('version', { ascending: false }),
			supabase.from('ia_qp_claim_versions').select('*').eq('assignment_id', id).order('version', { ascending: false }),
			supabase
				.from('ia_qp_assignments')
				.select('id, paper_version, claim_version, status, claim_status, submitted_at, claim_submitted_at, reopened_at, reopen_reason, claim_reopened_at, claim_reopen_reason')
				.eq('id', id)
				.maybeSingle(),
		])

		if (paperRes.error || claimRes.error) {
			const message = paperRes.error?.message || claimRes.error?.message || 'history query failed'
			console.error('[QP assign] history fetch failed:', message)
			return NextResponse.json({ error: message }, { status: 500 })
		}

		return NextResponse.json({
			assignment: assignRes.data || null,
			paper_versions: paperRes.data || [],
			claim_versions: claimRes.data || [],
		})
	} catch (error) {
		console.error('[QP assign] history route failed:', error)
		return NextResponse.json({ error: 'Failed to load the version history' }, { status: 500 })
	}
}
