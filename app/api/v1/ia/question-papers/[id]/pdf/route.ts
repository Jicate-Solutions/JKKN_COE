import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { institutionAllowed } from '@/lib/ia/v1-helpers'
import { buildPaperPdf } from '@/lib/ia/build-paper-pdf'

/** /api/v1/ia/question-papers/{id}/pdf — A5 question-paper PDF. */

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

	const result = await buildPaperPdf(supabase, id, url.origin)
	if (!result) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

	return new NextResponse(result.buffer, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `inline; filename="${result.filename}"`,
			'Cache-Control': 'no-store, max-age=0',
		},
	})
})
