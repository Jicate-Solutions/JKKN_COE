// Printable A4 PDF for one End-Semester question paper.
//
// GET /api/pre-exam/ese-question-papers/:id/pdf[?layout=2up]
//
// Same renderer as the CIA papers — it is told which table to read from, and an
// ESE paper prints the examination's own heading rather than a CIA round.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { buildPaperPdfHtml } from '@/lib/ia/build-paper-pdf-html'
import { contentDisposition } from '@/lib/ia/paper-filename'

export const dynamic = 'force-dynamic'
// Headless Chromium needs the Node runtime and room for a cold-start render.
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	try {
		const supabase = getSupabaseServer()
		const url = new URL(req.url)
		const variant = url.searchParams.get('layout') === '2up' ? '2up' : 'single'

		// Distinguish "paper missing" from "renderer failed" so the client shows a
		// real reason rather than a blank 500.
		const { data: exists, error: existErr } = await supabase
			.from('ese_question_papers')
			.select('id')
			.eq('id', id)
			.maybeSingle()
		if (existErr) {
			console.error('[ESE PDF] existence check failed for', id, existErr.message)
			return NextResponse.json({ error: `Lookup failed: ${existErr.message}` }, { status: 500 })
		}
		if (!exists) {
			return NextResponse.json(
				{ error: `Paper not found (id ${id}). The list may be stale — refresh.` },
				{ status: 404 }
			)
		}

		const result = await buildPaperPdfHtml(supabase, id, url.origin, variant, 'ese')
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
		console.error('[ESE PDF] render failed for', id, error)
		return NextResponse.json(
			{ error: `PDF generation failed: ${error?.message || error}` },
			{ status: 500 }
		)
	}
}
