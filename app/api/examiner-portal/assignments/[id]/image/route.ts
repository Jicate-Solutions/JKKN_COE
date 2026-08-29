// Examiner portal — figures attached to a question.
//
// POST   /api/examiner-portal/assignments/:id/image   (multipart: file)
// DELETE /api/examiner-portal/assignments/:id/image?path=…
//
// Mirrors /api/pre-exam/question-papers/:id/image (same `question-images`
// bucket, same <paperId>/<uuid>.<ext> layout, so the PDF renderer finds them),
// but the caller is authorised by the portal session and the assignment window
// instead of by a COE role.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireAssignment, logAccess } from '@/lib/qp-portal/guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BUCKET = 'question-images'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const auth = await requireAssignment(req, id, { needQuestions: true, needEdit: true, action: 'upload figure' })
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()
		const paperId = auth.access.assignment.paper_id

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
		const path = `${paperId}/${randomUUID()}.${ext}`
		const buffer = Buffer.from(await file.arrayBuffer())
		const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
			contentType: file.type,
			upsert: false,
		})
		if (upErr) {
			const missingBucket = /bucket not found/i.test(upErr.message || '')
			console.error('[QP portal] image upload failed:', upErr.message)
			return NextResponse.json(
				{
					error: missingBucket
						? 'Image storage is not configured. Contact the Office of the Controller of Examinations.'
						: 'The image could not be uploaded. Please try again.',
				},
				{ status: 500 }
			)
		}

		const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)

		await logAccess(req, {
			action: 'image_upload',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: id,
			paper_id: paperId,
			institutions_id: auth.access.assignment.institutions_id,
			detail: { path, bytes: file.size, type: file.type },
		})

		return NextResponse.json({ url: pub.publicUrl, path, size: file.size, type: file.type })
	} catch (error) {
		console.error('[QP portal] image POST failed:', error)
		return NextResponse.json({ error: 'Failed to upload the image' }, { status: 500 })
	}
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const auth = await requireAssignment(req, id, { needQuestions: true, needEdit: true, action: 'remove figure' })
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()
		const paperId = auth.access.assignment.paper_id
		const path = new URL(req.url).searchParams.get('path') || ''

		// Only ever delete inside this assignment's own paper folder.
		if (!path.startsWith(`${paperId}/`) || path.includes('..')) {
			return NextResponse.json({ error: 'Invalid image path' }, { status: 400 })
		}

		const { error } = await supabase.storage.from(BUCKET).remove([path])
		if (error) {
			console.error('[QP portal] image delete failed:', error.message)
			return NextResponse.json({ error: 'The image could not be removed.' }, { status: 500 })
		}
		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('[QP portal] image DELETE failed:', error)
		return NextResponse.json({ error: 'Failed to remove the image' }, { status: 500 })
	}
}
