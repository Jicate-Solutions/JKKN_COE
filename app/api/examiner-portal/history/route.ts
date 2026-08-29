// Examiner portal — the examiner's own submission history (spec §6).
//
// GET /api/examiner-portal/history?assignment_id=…
//
// Scoped to the signed-in examiner's own log lines. Refused attempts are
// deliberately included: an examiner who was locked out at 11 pm should be able
// to see that it happened and why.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireExaminer } from '@/lib/qp-portal/guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Events an examiner sees. Internal CoE actions are summarised, not itemised. */
const VISIBLE_ACTIONS = new Set([
	'login_google',
	'login_otp',
	'logout',
	'paper_view',
	'paper_save',
	'paper_submit',
	'paper_pdf_download',
	'order_download',
	'claim_download',
	'claim_submit',
	'checklist_save',
	'declaration_accept',
	'image_upload',
	'profile_update',
	'access_denied',
	'assignment_accepted',
	'assignment_returned',
	'window_extended',
])

export async function GET(req: NextRequest) {
	const auth = await requireExaminer(req)
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()
		const assignmentId = new URL(req.url).searchParams.get('assignment_id')

		let query = supabase
			.from('ia_qp_access_logs')
			.select('id, action, denied, reason, detail, assignment_id, created_at')
			.eq('examiner_id', auth.examiner.id)
			.order('created_at', { ascending: false })
			.order('id', { ascending: false })
			.limit(300)

		if (assignmentId) query = query.eq('assignment_id', assignmentId)

		const { data, error } = await query
		if (error) {
			console.error('[QP portal] history failed:', error.message)
			return NextResponse.json({ error: 'Could not load your history.' }, { status: 500 })
		}

		// IP and user-agent are intentionally not returned to the examiner — they
		// belong to the CoE audit view, not the portal.
		const rows = (data || []).filter(r => VISIBLE_ACTIONS.has(String(r.action)))

		return NextResponse.json({ data: rows, count: rows.length })
	} catch (error) {
		console.error('[QP portal] history route failed:', error)
		return NextResponse.json({ error: 'Could not load your history.' }, { status: 500 })
	}
}
