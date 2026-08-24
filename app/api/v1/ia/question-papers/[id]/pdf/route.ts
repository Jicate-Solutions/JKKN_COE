import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { institutionAllowed, paperIsEse, ESE_NOT_AVAILABLE } from '@/lib/ia/v1-helpers'
import { buildPaperPdfHtml } from '@/lib/ia/build-paper-pdf-html'
import { contentDisposition } from '@/lib/ia/paper-filename'

/**
 * /api/v1/ia/question-papers/{id}/pdf — A4 question-paper PDF.
 *
 * `?layout=2up` renders the A4-landscape sheet carrying two identical copies side
 * by side (cut down the middle) — the same option the COE console has had on
 * /api/pre-exam/question-papers/{id}/pdf. Without it a child app building its own
 * paper list (MyJKKN) can offer "PDF" but not "PDF (2-up)", even though the
 * renderer already supports the variant.
 */

// Headless Chromium needs the Node runtime and room for a cold-start render.
export const runtime = 'nodejs'
export const maxDuration = 60

export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const url = new URL(request.url)
	const segs = url.pathname.split('/').filter(Boolean)
	const id = segs[segs.length - 2] // .../{id}/pdf

	const { data: paper } = await supabase
		.from('ia_question_papers')
		.select('institutions_id, template_id')
		.eq('id', id)
		.maybeSingle()
	if (!paper || !institutionAllowed(context, paper.institutions_id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}
	// End-semester papers are confidential to the examiner portal.
	if (await paperIsEse(supabase, paper)) {
		return NextResponse.json({ error: ESE_NOT_AVAILABLE }, { status: 404 })
	}

	const variant = url.searchParams.get('layout') === '2up' ? '2up' : 'single'
	const result = await buildPaperPdfHtml(supabase, id, url.origin, variant)
	if (!result) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

	return new NextResponse(result.buffer, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': contentDisposition(result.filename),
			'Cache-Control': 'no-store, max-age=0',
		},
	})
})
