// Image attachments for End-Semester question papers.
//
// POST   /api/pre-exam/ese-question-papers/:id/image        (multipart: file) → { url, path }
// DELETE /api/pre-exam/ese-question-papers/:id/image?path=… → { success }
//
// Same public `question-images` bucket and same <paperId>/<uuid>.<ext> layout as
// the CIA papers, so the PDF renderer loads figures from both without knowing
// which table the paper came from.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseServer } from '@/lib/supabase-server'
import { hasAnyCoeRole } from '@/lib/auth/check-user-permission'

export const dynamic = 'force-dynamic'

const BUCKET = 'question-images'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
}
const EDITABLE_STATUSES = ['draft', 'submitted']
const UNRESTRICTED_ROLES = ['super_admin', 'coe']

/** Paper must exist and be writable by this caller. Returns an error response, or null. */
async function guardPaper(supabase: any, id: string): Promise<NextResponse | null> {
	const { data: paper } = await supabase
		.from('ese_question_papers')
		.select('id, status')
		.eq('id', id)
		.maybeSingle()
	if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
	if (!EDITABLE_STATUSES.includes(paper.status) && !(await hasAnyCoeRole(UNRESTRICTED_ROLES))) {
		return NextResponse.json({ error: `Cannot edit images while paper is ${paper.status}` }, { status: 400 })
	}
	return null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params

		const denied = await guardPaper(supabase, id)
		if (denied) return denied

		const form = await req.formData()
		const file = form.get('file') as File | null
		if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

		const ext = ALLOWED_TYPES[file.type]
		if (!ext) {
			return NextResponse.json({ error: 'Invalid file type — use PNG, JPEG, WebP or GIF' }, { status: 400 })
		}
		if (file.size > MAX_FILE_SIZE) {
			return NextResponse.json({ error: 'Image too large — maximum 5 MB' }, { status: 400 })
		}

		// Always inside this paper's own folder — the client never names the path.
		const path = `${id}/${randomUUID()}.${ext}`
		const buffer = Buffer.from(await file.arrayBuffer())
		const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
			contentType: file.type,
			upsert: false,
		})
		if (upErr) {
			const missingBucket = /bucket not found/i.test(upErr.message || '')
			console.error('[ESE image] upload failed:', upErr.message)
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
		return NextResponse.json({ url: pub.publicUrl, path, size: file.size, type: file.type })
	} catch (error) {
		console.error('[ESE image] POST failed:', error)
		return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
	}
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params

		const denied = await guardPaper(supabase, id)
		if (denied) return denied

		const path = new URL(req.url).searchParams.get('path') || ''
		// Only ever delete inside this paper's own folder.
		if (!path.startsWith(`${id}/`) || path.includes('..')) {
			return NextResponse.json({ error: 'Invalid image path' }, { status: 400 })
		}

		const { error } = await supabase.storage.from(BUCKET).remove([path])
		if (error) {
			console.error('[ESE image] delete failed:', error.message)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('[ESE image] DELETE failed:', error)
		return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 })
	}
}
