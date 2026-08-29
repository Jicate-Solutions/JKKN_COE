// Examiner portal — the printable documents for one assignment.
//
// GET /api/examiner-portal/assignments/:id/documents?doc=order|claim|paper
//
//   order — the Examiner Order Copy (readable at any time; it IS the proof of
//           appointment, so it must not vanish when the window closes)
//   claim — the Claim Form, pre-filled from the portal profile
//   paper — a preview of the question paper as it will print. Gated by the
//           window, like the questions themselves.
//
// Every download is logged, which is what §10's "track download/view activity"
// asks for.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireAssignment, logAccess } from '@/lib/qp-portal/guard'
import { loadAssignmentBundle, buildOrderData, buildClaimData } from '@/lib/qp-portal/assignment-service'
import { generateExaminerOrderPdf, generateClaimFormPdf, orderFilename } from '@/lib/pdf/examiner-order'
import { buildPaperPdfHtml } from '@/lib/ia/build-paper-pdf-html'
import { contentDisposition } from '@/lib/ia/paper-filename'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type Doc = 'order' | 'claim' | 'paper'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const doc = (new URL(req.url).searchParams.get('doc') || 'order') as Doc

	if (!['order', 'claim', 'paper'].includes(doc)) {
		return NextResponse.json({ error: `Unknown document "${doc}"` }, { status: 400 })
	}

	// The paper preview is question content; the order and claim are not.
	const auth = await requireAssignment(req, id, {
		needQuestions: doc === 'paper',
		action: `download ${doc}`,
	})
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()
		const { assignment } = auth.access

		if (doc === 'paper') {
			const result = await buildPaperPdfHtml(supabase, assignment.paper_id, new URL(req.url).origin)
			if (!result) {
				return NextResponse.json({ error: 'The question paper could not be rendered.' }, { status: 500 })
			}
			await logAccess(req, {
				action: 'paper_pdf_download',
				examiner_id: auth.examiner.id,
				examiner_email: auth.examiner.email,
				assignment_id: id,
				paper_id: assignment.paper_id,
				institutions_id: assignment.institutions_id,
			})
			return new NextResponse(new Uint8Array(result.buffer), {
				status: 200,
				headers: {
					'Content-Type': 'application/pdf',
					'Content-Disposition': contentDisposition(result.filename),
					'Cache-Control': 'no-store, max-age=0',
				},
			})
		}

		const bundle = await loadAssignmentBundle(supabase, id)
		if (!bundle) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

		if (doc === 'claim') {
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

// POST marks the claim as submitted (spec §6 "Claim Form").
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const auth = await requireAssignment(req, id, { action: 'submit claim' })
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()
		const { assignment } = auth.access

		// A claim only makes sense once the work is done and accepted.
		if (!['submitted', 'accepted'].includes(assignment.status)) {
			return NextResponse.json(
				{ error: 'The claim form can be submitted once you have submitted the question paper.' },
				{ status: 400 }
			)
		}

		const now = new Date().toISOString()
		const { error } = await supabase
			.from('ia_qp_assignments')
			.update({ claim_submitted_at: now, updated_at: now })
			.eq('id', id)
		if (error) {
			console.error('[QP portal] claim submit failed:', error.message)
			return NextResponse.json({ error: 'The claim could not be recorded.' }, { status: 500 })
		}

		await logAccess(req, {
			action: 'claim_submit',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
		})

		return NextResponse.json({
			success: true,
			claim_submitted_at: now,
			message: 'Claim recorded. Download the claim form for your records.',
		})
	} catch (error) {
		console.error('[QP portal] claim POST failed:', error)
		return NextResponse.json({ error: 'The claim could not be recorded.' }, { status: 500 })
	}
}
