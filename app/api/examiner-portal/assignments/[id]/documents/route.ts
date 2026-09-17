// Examiner portal — the printable documents for one assignment.
//
// GET /api/examiner-portal/assignments/:id/documents?doc=order|claim
//
//   order — the Examiner Order Copy (readable at any time; it IS the proof of
//           appointment, so it must not vanish when the window closes)
//   claim — the Claim Form, in whatever state the claim has reached
//
// THE QUESTION PAPER IS NOT DOWNLOADABLE, AT ANY STAGE. There was a `doc=paper`
// branch here that rendered the whole paper to a PDF; it has been removed rather
// than merely hidden in the UI, because a route that returns the paper as a file
// defeats every other control — the examiner previews the paper inside the
// portal and nowhere else. Nothing may reintroduce a file-shaped answer here.
//
// Every download is logged, which is what §10's "track download/view activity"
// asks for.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireAssignment, logAccess } from '@/lib/qp-portal/guard'
import { loadAssignmentBundle, buildOrderData, buildClaimData } from '@/lib/qp-portal/assignment-service'
import { generateExaminerOrderPdf, generateClaimFormPdf, orderFilename } from '@/lib/pdf/examiner-order'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type Doc = 'order' | 'claim'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const doc = (new URL(req.url).searchParams.get('doc') || 'order') as Doc

	// `paper` is answered with the same 400 as any other unknown value: the route
	// must not hint that a downloadable paper ever existed here.
	if (!['order', 'claim'].includes(doc)) {
		return NextResponse.json({ error: `Unknown document "${doc}"` }, { status: 400 })
	}

	// Neither document carries question content, so neither is window-gated.
	const auth = await requireAssignment(req, id, { action: `download ${doc}` })
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()
		const { assignment } = auth.access

		const bundle = await loadAssignmentBundle(supabase, id)
		if (!bundle) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

		if (doc === 'claim') {
			// The claim is now submitted BEFORE the check list and signature, and
			// the printed form carries that signature. Until the submission is
			// completed the form would print unsigned, so it is not issued.
			if (auth.access.stage !== 'completed') {
				return NextResponse.json(
					{ error: 'Your claim form can be downloaded once you have finished the check list and signed.' },
					{ status: 409 }
				)
			}
			const data = await buildClaimData(supabase, bundle)
			const buffer = await generateClaimFormPdf(data)
			await logAccess(req, {
				action: 'claim_download',
				examiner_id: auth.examiner.id,
				examiner_email: auth.examiner.email,
				assignment_id: id,
				paper_id: assignment.paper_id,
				institutions_id: assignment.institutions_id,
			})
			return new NextResponse(new Uint8Array(buffer), {
				status: 200,
				headers: {
					'Content-Type': 'application/pdf',
					'Content-Disposition': `inline; filename="${orderFilename('ClaimForm', data.subject.course_code, data.examiner.full_name)}"`,
					'Cache-Control': 'no-store, max-age=0',
				},
			})
		}

		const data = await buildOrderData(bundle)
		const buffer = await generateExaminerOrderPdf(data)
		await logAccess(req, {
			action: 'order_download',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
			detail: { source: 'portal' },
		})
		return new NextResponse(new Uint8Array(buffer), {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="${orderFilename('ExaminerOrder', data.subject.course_code, data.examiner.full_name)}"`,
				'Cache-Control': 'no-store, max-age=0',
			},
		})
	} catch (error: any) {
		console.error('[QP portal] document', doc, 'failed for', id, error)
		return NextResponse.json(
			{ error: `The document could not be generated: ${error?.message || error}` },
			{ status: 500 }
		)
	}
}
