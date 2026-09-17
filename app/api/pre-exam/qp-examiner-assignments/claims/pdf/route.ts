// The Claim Form of one examiner for one session, for the CoE office.
//
// GET /api/pre-exam/qp-examiner-assignments/claims/pdf?institutions_id=&examination_session_id=&examiner_id=[&download=1]
//
// The same document the examiner downloads in the portal: one form per session
// covering every paper they have claimed, with the bank account it was
// submitted with and their signature. It is anchored on the examiner's latest
// claimed appointment; buildClaimData gathers the rest of the session.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { loadAssignmentBundle, buildClaimData } from '@/lib/qp-portal/assignment-service'
import { generateClaimFormPdf, orderFilename } from '@/lib/pdf/examiner-order'
import { logAccess } from '@/lib/qp-portal/guard'

export const dynamic = 'force-dynamic'
// Chromium needs the Node runtime and room for a cold start.
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
			return NextResponse.json(
				{ error: 'institutions_id, examination_session_id and examiner_id are required' },
				{ status: 400 }
			)
		}

		const supabase = getSupabaseServer()
		const { data: anchor, error } = await supabase
			.from('ia_qp_assignments')
			.select('id, paper_id, claim_version')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.eq('examiner_id', examinerId)
			.neq('status', 'cancelled')
			.in('claim_status', ['submitted', 'approved', 'paid'])
			.order('claim_submitted_at', { ascending: false, nullsFirst: false })
			.order('id', { ascending: true })
			.limit(1)
			.maybeSingle()
		if (error) return NextResponse.json({ error: error.message }, { status: 500 })
		if (!anchor) {
			return NextResponse.json({ error: 'This examiner has not submitted a claim in this session.' }, { status: 404 })
		}

		const bundle = await loadAssignmentBundle(supabase, anchor.id)
		if (!bundle) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

		const data = await buildClaimData(supabase, bundle)
		const buffer = await generateClaimFormPdf(data)
		const papers = data.papers || []
		const filename = orderFilename(
			'ClaimForm',
			papers.length > 1 ? `${papers.length}_papers` : data.subject.course_code,
			data.examiner.full_name
		)

		await logAccess(req, {
			action: 'claim_download',
			examiner_id: examinerId,
			assignment_id: anchor.id,
			paper_id: anchor.paper_id,
			institutions_id: institutionsId,
			performed_by_user_id: perm.userId,
			performed_by_email: perm.email,
			performed_by_role: 'coe',
			module: 'claim',
			version: anchor.claim_version || null,
			detail: { by: perm.email, source: 'coe', papers: papers.map(p => p.course_code) },
		})

		const disposition = searchParams.get('download') === '1' ? 'attachment' : 'inline'
		return new NextResponse(new Uint8Array(buffer), {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `${disposition}; filename="${filename}"`,
				'Cache-Control': 'no-store, max-age=0',
			},
		})
	} catch (error: any) {
		console.error('[QP claims] claim PDF failed:', error)
		return NextResponse.json(
			{ error: `Could not generate the claim form: ${error?.message || error}` },
			{ status: 500 }
		)
	}
}
