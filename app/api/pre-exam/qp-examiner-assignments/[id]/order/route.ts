// The Examiner Order Copy for one assignment (spec §8).
//
// GET /api/pre-exam/qp-examiner-assignments/:id/order        → PDF
// GET /api/pre-exam/qp-examiner-assignments/:id/order?preview=1 → HTML preview
//
// Design comes from pdf_institution_settings + ia_qp_portal_content(order), so
// the same route serves every institution's own layout.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { loadAssignmentBundle, buildOrderData } from '@/lib/qp-portal/assignment-service'
import { generateExaminerOrderPdf, buildExaminerOrderHtml, orderFilename } from '@/lib/pdf/examiner-order'
import { logAccess } from '@/lib/qp-portal/guard'

export const dynamic = 'force-dynamic'
// Chromium needs the Node runtime and room for a cold start.
export const runtime = 'nodejs'
export const maxDuration = 60

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const bundle = await loadAssignmentBundle(supabase, id)
		if (!bundle) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

		const data = await buildOrderData(bundle)

		// An HTML preview keeps the design screen fast — no Chromium round trip.
		if (new URL(req.url).searchParams.get('preview') === '1') {
			return new NextResponse(buildExaminerOrderHtml(data), {
				status: 200,
				headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
			})
		}

		const buffer = await generateExaminerOrderPdf(data)
		const filename = orderFilename('ExaminerOrder', data.subject.course_code, data.examiner.full_name)

		await logAccess(req, {
			action: 'order_download',
			examiner_id: bundle.assignment.examiner_id,
			assignment_id: id,
			paper_id: bundle.assignment.paper_id,
			institutions_id: bundle.assignment.institutions_id,
			detail: { by: perm.email, source: 'coe' },
		})

		return new NextResponse(new Uint8Array(buffer), {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="${filename}"`,
				'Cache-Control': 'no-store, max-age=0',
			},
		})
	} catch (error: any) {
		console.error('[QP assign] order PDF failed for', id, error)
		return NextResponse.json(
			{ error: `Could not generate the examiner order: ${error?.message || error}` },
			{ status: 500 }
		)
	}
}
