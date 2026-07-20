import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { buildPaperPdfHtml } from '@/lib/ia/build-paper-pdf-html'

export const dynamic = 'force-dynamic'
// Headless Chromium needs the Node runtime and room for a cold-start render.
export const runtime = 'nodejs'
export const maxDuration = 60

// GET - render a printable A4 question paper PDF
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params
		const origin = new URL(_req.url).origin

		const result = await buildPaperPdfHtml(supabase, id, origin)
		if (!result) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

		return new NextResponse(result.buffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="${result.filename}"`,
				'Cache-Control': 'no-store, max-age=0',
			},
		})
	} catch (error) {
		console.error('Error in GET paper PDF:', error)
		return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
	}
}
