// E-mail the examiner order for one assignment.
//
// POST /api/pre-exam/qp-examiner-assignments/:id/send-order
//   { custom_message?: string, cc?: string[] }
//
// The PDF is rebuilt from the assignment as it stands, so a re-send after a
// window change or a type change carries the current order. The sending itself
// lives in lib/qp-portal/send-order.ts, shared with the change-type action.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { sendExaminerOrderEmail } from '@/lib/qp-portal/send-order'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const body = await req.json().catch(() => ({}))

		const result = await sendExaminerOrderEmail(supabase, id, {
			variant: body.variant === 'updated' ? 'updated' : 'appointment',
			changeSummary: body.change_summary || null,
			customMessage: body.custom_message || null,
			cc: Array.isArray(body.cc) ? body.cc : undefined,
			by: { userId: perm.userId, email: perm.email },
			req,
		})
		if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

		return NextResponse.json({ success: true, message: result.message, sent_at: result.sentAt })
	} catch (error: any) {
		console.error('[QP assign] send-order failed for', id, error)
		return NextResponse.json({ error: error?.message || 'Failed to send the examiner order' }, { status: 500 })
	}
}
