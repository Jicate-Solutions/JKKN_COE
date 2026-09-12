// Printable A4 PDF of one End-Semester paper's ANSWER KEY / scheme of valuation.
//
// GET /api/pre-exam/ese-question-papers/:id/answer-key-pdf
//
// The key is written by the examiner under each question (questions[].answer_key)
// and is never printed on the question paper itself — this is the document the
// valuers get. Same letterhead and heading as the paper, one page footer per
// sheet, no two-page squeeze.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { buildAnswerKeyPdfHtml } from '@/lib/ia/build-paper-pdf-html'
import { contentDisposition } from '@/lib/ia/paper-filename'

export const dynamic = 'force-dynamic'
// Headless Chromium needs the Node runtime and room for a cold-start render.
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	try {
		const supabase = getSupabaseServer()

		// Distinguish "paper missing" from "renderer failed" so the client shows a
		// real reason rather than a blank 500.
		const { data: exists, error: existErr } = await supabase
			.from('ese_question_papers')
			.select('id')
			.eq('id', id)
			.maybeSingle()
		if (existErr) {
			console.error('[ESE AK PDF] existence check failed for', id, existErr.message)
			return NextResponse.json({ error: `Lookup failed: ${existErr.message}` }, { status: 500 })
		}
		if (!exists) {
			return NextResponse.json(
				{ error: `Paper not found (id ${id}). The list may be stale — refresh.` },
				{ status: 404 }
			)
		}

		const result = await buildAnswerKeyPdfHtml(supabase, id, 'ese')
		if (!result) {
			return NextResponse.json({ error: 'PDF renderer returned no output' }, { status: 500 })
		}

		return new NextResponse(result.buffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': contentDisposition(result.filename),
				'Cache-Control': 'no-store, max-age=0',
			},
		})
	} catch (error: any) {
		console.error('[ESE AK PDF] render failed for', id, error)
		return NextResponse.json(
			{ error: `PDF generation failed: ${error?.message || error}` },
			{ status: 500 }
		)
	}
}
