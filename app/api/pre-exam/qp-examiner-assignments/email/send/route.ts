// Bulk examiner orders — send.
//
// POST /api/pre-exam/qp-examiner-assignments/email/send
//   { institutions_id, examination_session_id, examiner_ids: string[],
//     custom_message?: string, cc?: string[] }
//
// One e-mail per examiner, carrying ONE combined order that lists every live
// appointment they hold in the session. Processed synchronously (serverless
// kills background work once the response is sent) and reported per examiner,
// so a failure for one address never hides the ones that went out.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { sendExaminerOrderEmail } from '@/lib/qp-portal/send-order'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'
/** A single request handles this many examiners; the tab sends in pages. */
const MAX_PER_REQUEST = 25

export async function POST(req: NextRequest) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const body = await req.json().catch(() => ({}))
		const institutionsId = String(body.institutions_id || '')
		const sessionId = String(body.examination_session_id || '')
		const examinerIds: string[] = Array.isArray(body.examiner_ids) ? body.examiner_ids.map(String) : []
		if (!institutionsId || !sessionId) {
			return NextResponse.json({ error: 'institutions_id and examination_session_id are required' }, { status: 400 })
		}
		if (examinerIds.length === 0) {
			return NextResponse.json({ error: 'Select at least one examiner.' }, { status: 400 })
		}
		if (examinerIds.length > MAX_PER_REQUEST) {
			return NextResponse.json({ error: `Send at most ${MAX_PER_REQUEST} examiners per request.` }, { status: 400 })
		}

		const supabase = getSupabaseServer()
		const { data: rows, error } = await supabase
			.from('ia_qp_assignments')
			.select('id, examiner_id, course_code')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.in('examiner_id', examinerIds)
			.neq('status', 'cancelled')
			.order('course_code', { ascending: true })
		if (error) return NextResponse.json({ error: error.message }, { status: 500 })

		const byExaminer = new Map<string, string[]>()
		for (const r of rows || []) {
			if (!byExaminer.has(r.examiner_id)) byExaminer.set(r.examiner_id, [])
			byExaminer.get(r.examiner_id)!.push(r.id)
		}

		const results: Array<{
			examiner_id: string
			ok: boolean
			to?: string
			error?: string
			assignment_ids: string[]
			sent_at?: string
		}> = []

		for (const examinerId of examinerIds) {
			const ids = byExaminer.get(examinerId) || []
			if (ids.length === 0) {
				results.push({ examiner_id: examinerId, ok: false, error: 'No live appointment in this session.', assignment_ids: [] })
				continue
			}
			try {
				const r = await sendExaminerOrderEmail(supabase, ids, {
					variant: 'appointment',
					customMessage: body.custom_message || null,
					cc: Array.isArray(body.cc) ? body.cc : undefined,
					by: { userId: perm.userId, email: perm.email },
					req,
					source: 'bulk',
				})
				results.push(
					r.ok
						? { examiner_id: examinerId, ok: true, to: r.to, assignment_ids: r.assignmentIds, sent_at: r.sentAt }
						: { examiner_id: examinerId, ok: false, error: r.error, assignment_ids: r.assignmentIds }
				)
			} catch (e: any) {
				results.push({ examiner_id: examinerId, ok: false, error: e?.message || 'send failed', assignment_ids: ids })
			}
		}

		const sent = results.filter(r => r.ok).length
		return NextResponse.json({
			success: true,
			sent,
			failed: results.length - sent,
			results,
			message: `${sent} of ${results.length} examiner${results.length === 1 ? '' : 's'} e-mailed.`,
		})
	} catch (error: any) {
		console.error('[QP email] bulk send failed:', error)
		return NextResponse.json({ error: error?.message || 'Failed to send examiner orders' }, { status: 500 })
	}
}
