import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { institutionAllowed } from '@/lib/ia/v1-helpers'
import { buildPaperPdfHtml } from '@/lib/ia/build-paper-pdf-html'
import { contentDisposition } from '@/lib/ia/paper-filename'

/** /api/v1/ia/question-papers/{id}/pdf — A4 question-paper PDF. */

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
		.select('institutions_id')
		.eq('id', id)
		.maybeSingle()
	if (!paper || !institutionAllowed(context, paper.institutions_id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}

	const result = await buildPaperPdfHtml(supabase, id, url.origin)
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
