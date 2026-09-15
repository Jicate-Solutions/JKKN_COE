// Authenticated proxy for question-paper figures stored in Google Drive.
//
// GET    /api/examiner/question-paper/file/:fileId                 → image bytes
// DELETE /api/examiner/question-paper/file/:fileId[?assignmentId=] → { success }
//
// Drive files are private (no link sharing), so an <img src> cannot point at
// Drive. The figure's registry row (ia_question_paper_files) names its paper,
// and the viewer is authorised against THAT paper:
//   • examiner portal session → must hold a live assignment for the paper, and
//     be inside the assignment window (question content is window-gated)
//   • COE session (access_token + coe_access cookies) → any COE user
// DELETE additionally needs edit rights (portal: needEdit; COE: paper still
// draft/submitted unless super_admin/coe), mirroring the upload route.
//
// Listed as public in proxy.ts because the examiner portal has no COE cookies;
// every request is authenticated here.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { hasAnyCoeRole, resolveCallerEmail } from '@/lib/auth/check-user-permission'
import { requireAssignment } from '@/lib/qp-portal/guard'
import { readPortalSession } from '@/lib/qp-portal/session'
import { downloadDriveFile } from '@/lib/google/drive-upload'
import {
	getQuestionPaperFile, removeQuestionPaperFile, QUESTION_PAPER_TABLES, type QuestionPaperFileRow,
} from '@/lib/ia/question-paper-files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EDITABLE_STATUSES = ['draft', 'submitted']
const UNRESTRICTED_ROLES = ['super_admin', 'coe']

type Authz = { ok: true } | { ok: false; response: NextResponse }

/**
 * Prove the caller may see (or, with `edit`, change) this paper's figures.
 * A portal cookie is tried first; when it does not authorise, a COE session may
 * still — the same browser can hold both.
 */
async function authorise(
	req: NextRequest,
	row: QuestionPaperFileRow,
	opts: { edit: boolean; assignmentId?: string | null }
): Promise<Authz> {
	const denied = (status: number, error: string): Authz => ({
		ok: false,
		response: NextResponse.json({ error }, { status }),
	})

	let portalFailure: NextResponse | null = null
	if (await readPortalSession(req)) {
		// Which assignment? The client names it on DELETE; on GET (an <img> tag)
		// it is looked up from the paper.
		let assignmentId = opts.assignmentId || null
		if (!assignmentId) {
			const session = await readPortalSession(req)
			const { data } = await getSupabaseServer()
				.from('ia_qp_assignments')
				.select('id')
				.eq('paper_id', row.paper_id)
				.eq('examiner_id', session?.sub || '')
				.neq('status', 'cancelled')
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle()
			assignmentId = data?.id || null
		}
		if (assignmentId) {
			const auth = await requireAssignment(req, assignmentId, {
				needQuestions: true,
				needEdit: opts.edit,
				action: opts.edit ? 'remove figure' : 'view figure',
			})
			if (auth.ok && auth.access.assignment.paper_id === row.paper_id) return { ok: true }
			if (!auth.ok) portalFailure = auth.response
		}
	}

	if (req.cookies.get('coe_access')?.value && (await resolveCallerEmail())) {
		if (!opts.edit) return { ok: true }
		// The registry row says which table its paper lives in.
		const { data: paper } = await getSupabaseServer()
			.from(QUESTION_PAPER_TABLES[row.paper_kind || 'ia'])
			.select('status')
			.eq('id', row.paper_id)
			.maybeSingle()
		if (!paper) return denied(404, 'Paper not found')
		if (!EDITABLE_STATUSES.includes(paper.status) && !(await hasAnyCoeRole(UNRESTRICTED_ROLES))) {
			return denied(400, `Cannot edit images while paper is ${paper.status}`)
		}
		return { ok: true }
	}

	if (portalFailure) return { ok: false, response: portalFailure }
	return denied(401, 'Authentication required')
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
	const { fileId } = await params
	const row = await getQuestionPaperFile(fileId)
	if (!row) return NextResponse.json({ error: 'File not found' }, { status: 404 })

	const authz = await authorise(req, row, { edit: false })
	if (!authz.ok) return authz.response

	try {
		// The registry row already knows the type and name — one Drive call, not two.
		const file = await downloadDriveFile(row.drive_file_id, { mimeType: row.mime_type, name: row.filename })
		if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

		return new NextResponse(new Uint8Array(file.buffer), {
			status: 200,
			headers: {
				'Content-Type': row.mime_type || file.mimeType || 'application/octet-stream',
				'Content-Length': String(file.buffer.byteLength),
				'Content-Disposition': `inline; filename="${row.filename.replace(/"/g, '')}"`,
				// Per-viewer only — never let a shared cache hand a figure to the next user.
				'Cache-Control': 'private, max-age=3600',
				'X-Content-Type-Options': 'nosniff',
			},
		})
	} catch (error: any) {
		console.error('[QP file] Drive download failed:', error?.message || error)
		return NextResponse.json({ error: 'The image could not be loaded.' }, { status: 502 })
	}
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
	const { fileId } = await params
	const row = await getQuestionPaperFile(fileId)
	// Already gone is the desired end state.
	if (!row) return NextResponse.json({ success: true })

	const assignmentId = new URL(req.url).searchParams.get('assignmentId')
	const authz = await authorise(req, row, { edit: true, assignmentId })
	if (!authz.ok) return authz.response

	const removed = await removeQuestionPaperFile(row)
	if (!removed) return NextResponse.json({ error: 'The image could not be removed.' }, { status: 500 })
	return NextResponse.json({ success: true })
}
