// Image attachments for IA question papers — external API mirror of
// app/api/pre-exam/question-papers/[id]/image/route.ts, so MyJKKN authors write
// into the SAME public bucket as COE authors do. Without it a child app has to
// host question figures itself, and COE can never clean up the orphans.
//
// POST   /api/v1/ia/question-papers/{id}/image        (multipart: file)  → { data: { url, path } }
// DELETE /api/v1/ia/question-papers/{id}/image?path=… → { success: true }
//
// Permission: the module is resolved from the path segment `ia`, and the
// operation from the HTTP method — so POST needs `ia:create` and DELETE needs
// `ia:delete` (there is no per-method override).
//
// The stored path is kept on the question so a replace/remove can delete the old
// object instead of orphaning it; the public URL is what the PDF renderer loads.

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { institutionAllowed, paperIsEse, ESE_NOT_AVAILABLE } from '@/lib/ia/v1-helpers'

const BUCKET = 'question-images'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
}
// Same rule as the v1 PUT route. Unlike the COE console there is no CoE override
// on an API key — an approved or locked paper is closed to every caller.
const EDITABLE_STATUSES = ['draft', 'submitted']

/** `/api/v1/ia/question-papers/{id}/image` → the id segment. */
function idFromUrl(url: string): string {
	const segs = new URL(url).pathname.split('/').filter(Boolean)
	return segs[segs.length - 2]
}

/**
 * The paper must exist, belong to an institution this key may touch, not be an
 * end-semester paper, and still be writable. Returns an error response, or null.
 */
async function guardPaper(
	supabase: any,
	context: ExternalApiContext,
	id: string
): Promise<NextResponse | null> {
	const { data: paper } = await supabase
		.from('ia_question_papers')
		.select('id, status, institutions_id, template_id')
		.eq('id', id)
		.maybeSingle()
	if (!paper || !institutionAllowed(context, paper.institutions_id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}
	// End-semester papers are confidential to the examiner portal — an API key
	// must not be able to tell they exist, let alone attach a figure to one.
	if (await paperIsEse(supabase, paper)) {
		return NextResponse.json({ error: ESE_NOT_AVAILABLE }, { status: 404 })
	}
	if (!EDITABLE_STATUSES.includes(paper.status)) {
		return NextResponse.json(
			{ error: `Cannot edit images while paper is ${paper.status}` },
			{ status: 400 }
		)
	}
	return null
}

export const POST = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const id = idFromUrl(request.url)

		const denied = await guardPaper(supabase, context, id)
		if (denied) return denied

		const form = await request.formData()
		const file = form.get('file') as File | null
		if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

		const ext = ALLOWED_TYPES[file.type]
		if (!ext) {
			return NextResponse.json({ error: 'Invalid file type — use PNG, JPEG, WebP or GIF' }, { status: 400 })
		}
		if (file.size > MAX_FILE_SIZE) {
			return NextResponse.json({ error: 'Image too large — maximum 5 MB' }, { status: 400 })
		}

		const path = `${id}/${randomUUID()}.${ext}`
		const buffer = Buffer.from(await file.arrayBuffer())
		const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
			contentType: file.type,
			upsert: false,
		})
		if (upErr) {
			// A missing bucket is the one failure worth naming — the migration hasn't been run.
			const missingBucket = /bucket not found/i.test(upErr.message || '')
			console.error('[v1 QP image] upload failed:', upErr.message)
			return NextResponse.json(
				{
					error: missingBucket
						? `Storage bucket "${BUCKET}" is missing — run supabase/migrations/20260822_create_question_images_bucket.sql`
						: upErr.message,
				},
				{ status: 500 }
			)
		}

		const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
		return NextResponse.json(
			{ data: { url: pub.publicUrl, path, size: file.size, type: file.type } },
			{ status: 201 }
		)
	} catch (error: any) {
		console.error('Error in POST v1 question image:', error)
		return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
	}
})

export const DELETE = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const id = idFromUrl(request.url)

		const denied = await guardPaper(supabase, context, id)
		if (denied) return denied

		const path = new URL(request.url).searchParams.get('path') || ''
		// Only ever delete inside this paper's own folder.
		if (!path.startsWith(`${id}/`) || path.includes('..')) {
			return NextResponse.json({ error: 'Invalid image path' }, { status: 400 })
		}

		const { error } = await supabase.storage.from(BUCKET).remove([path])
		if (error) {
			console.error('[v1 QP image] delete failed:', error.message)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json({ success: true })
	} catch (error: any) {
		console.error('Error in DELETE v1 question image:', error)
		return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 })
	}
})
