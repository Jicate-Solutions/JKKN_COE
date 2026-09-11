// Bulk examiner orders — preview the combined order PDF for one examiner.
//
// GET /api/pre-exam/qp-examiner-assignments/email/preview?institutions_id=&examination_session_id=&examiner_id=
//
// Exactly the document the bulk send would attach: every live appointment
// the examiner holds in the session, on one order.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { loadAssignmentBundle, buildCombinedOrderData, type AssignmentBundle } from '@/lib/qp-portal/assignment-service'
import { generateExaminerOrderPdf, orderFilename } from '@/lib/pdf/examiner-order'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'

export async function GET(req: NextRequest) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const { searchParams } = new URL(req.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		const examinerId = searchParams.get('examiner_id')
		if (!institutionsId || !sessionId || !examinerId) {
			return NextResponse.json({ error: 'institutions_id, examination_session_id and examiner_id are required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()
		const { data: rows } = await supabase
			.from('ia_qp_assignments')
			.select('id')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.eq('examiner_id', examinerId)
			.neq('status', 'cancelled')
			.order('course_code', { ascending: true })
		const bundles: AssignmentBundle[] = []
		for (const r of rows || []) {
			const b = await loadAssignmentBundle(supabase, r.id)
			if (b) bundles.push(b)
		}
		if (bundles.length === 0) return NextResponse.json({ error: 'No live appointment for this examiner in this session.' }, { status: 404 })

		const data = await buildCombinedOrderData(bundles)
		const pdf = await generateExaminerOrderPdf(data)
		return new NextResponse(new Uint8Array(pdf), {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="${orderFilename('ExaminerOrder', bundles.length > 1 ? `${bundles.length}_papers` : data.subject.course_code, data.examiner.full_name)}"`,
				'Cache-Control': 'no-store, max-age=0',
			},
		})
	} catch (error: any) {
		console.error('[QP email] preview failed:', error)
		return NextResponse.json({ error: error?.message || 'Failed to build the order preview' }, { status: 500 })
	}
}
