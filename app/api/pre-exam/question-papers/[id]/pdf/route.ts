import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { buildPaperPdfHtml } from '@/lib/ia/build-paper-pdf-html'
import { contentDisposition } from '@/lib/ia/paper-filename'

export const dynamic = 'force-dynamic'
// Headless Chromium needs the Node runtime and room for a cold-start render.
export const runtime = 'nodejs'
export const maxDuration = 60

// GET - render a printable A4 question paper PDF
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	try {
		const supabase = getSupabaseServer()
		const url = new URL(_req.url)
		const origin = url.origin
		const variant = url.searchParams.get('layout') === '2up' ? '2up' : 'single'

		// Distinguish "paper missing" from "renderer failed" so the client shows a real reason.
		const { data: exists, error: existErr } = await supabase
			.from('ia_question_papers')
			.select('id')
			.eq('id', id)
			.maybeSingle()
		if (existErr) {
			console.error('[QP PDF] existence check error for', id, existErr.message)
			return NextResponse.json({ error: `Lookup failed: ${existErr.message}` }, { status: 500 })
		}
		if (!exists) {
			return NextResponse.json({ error: `Paper not found (id ${id}). The list may be stale — refresh.` }, { status: 404 })
		}

		const result = await buildPaperPdfHtml(supabase, id, origin, variant)
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
		console.error('[QP PDF] render error for', id, error)
		return NextResponse.json({ error: `PDF generation failed: ${error?.message || error}` }, { status: 500 })
	}
}
