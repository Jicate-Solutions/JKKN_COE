// Question-paper figure upload → Google Drive (private).
//
// POST /api/examiner/question-paper/upload   (multipart/form-data)
//   file          the image (PNG / JPEG / WebP / GIF, ≤ 5 MB)
//   paperId       COE author: the paper being edited (ia_question_papers or
//                 ese_question_papers — both are tried)
//   assignmentId  external examiner: their ia_qp_assignments row; the paper is
//                 derived from it and is ALWAYS an ese_question_papers row
//
// → { url, driveUrl, driveFileId, filename, size, sizeBytes, type }
//
// `url` is the authenticated proxy path (/api/examiner/question-paper/file/<id>)
// that the editor preview and the PDF renderer load; `driveUrl` is the retained
// Drive web-view link. The file is NEVER link-shared — question papers are
// confidential examination content.
//
// Two audiences share this route, so it is listed as public in proxy.ts and
// does its own authentication:
//   • assignmentId → examiner-portal session + assignment window + edit rights
//                    (lib/qp-portal/guard.ts), exactly as the old portal image route
//   • paperId      → COE session (access_token + coe_access cookies), and the
//                    paper must be draft/submitted unless the caller is super_admin/coe
//
// Replaces app/api/pre-exam/question-papers/[id]/image and
// app/api/examiner-portal/assignments/[id]/image (Supabase `question-images`).

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { hasAnyCoeRole, resolveCallerEmail } from '@/lib/auth/check-user-permission'
import { requireAssignment, logAccess } from '@/lib/qp-portal/guard'
import { isDriveConfigured } from '@/lib/google/drive-client'
import { uploadQuestionPaperToFolder } from '@/lib/google/drive-upload'
import {
	registerQuestionPaperFile, questionPaperFileUrl, loadQuestionPaper, type QuestionPaperRef,
} from '@/lib/ia/question-paper-files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])

// Same rule as the paper PUT route: everyone else may only touch draft/submitted papers.
const EDITABLE_STATUSES = ['draft', 'submitted']
const UNRESTRICTED_ROLES = ['super_admin', 'coe']

async function institutionCode(institutionsId: string | null): Promise<string | null> {
	if (!institutionsId) return null
	const { data } = await getSupabaseServer()
		.from('institutions')
		.select('institution_code')
		.eq('id', institutionsId)
		.maybeSingle()
	return data?.institution_code || null
}

/** COE caller: a resolvable email AND the COE-access cookie the middleware normally checks. */
async function requireCoeCaller(req: NextRequest): Promise<string | null> {
	if (!req.cookies.get('coe_access')?.value) return null
	return resolveCallerEmail()
}

export async function POST(req: NextRequest) {
	if (!isDriveConfigured()) {
		return NextResponse.json(
			{ error: 'File storage is not configured. Contact the Office of the Controller of Examinations.' },
			{ status: 503 }
		)
	}

	let form: FormData
	try {
		form = await req.formData()
	} catch {
		return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
	}
	const assignmentId = String(form.get('assignmentId') || '').trim()
	const paperIdField = String(form.get('paperId') || '').trim()

	// ── Who is uploading, and for which paper ──────────────────────────────
	let paper: QuestionPaperRef | null = null
	let uploader: { kind: 'coe' | 'examiner'; who: string; examinerId?: string; assignmentId?: string }

	if (assignmentId) {
		const auth = await requireAssignment(req, assignmentId, {
			needQuestions: true,
			needEdit: true,
			action: 'upload figure',
		})
		if (!auth.ok) return auth.response
		// An examiner appointment is always for an End-Semester paper.
		paper = await loadQuestionPaper(auth.access.assignment.paper_id, 'ese')
		if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
		uploader = { kind: 'examiner', who: auth.examiner.email, examinerId: auth.examiner.id, assignmentId }
	} else if (paperIdField) {
		const email = await requireCoeCaller(req)
		if (!email) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
		paper = await loadQuestionPaper(paperIdField)
		if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
		if (!EDITABLE_STATUSES.includes(paper.status) && !(await hasAnyCoeRole(UNRESTRICTED_ROLES))) {
			return NextResponse.json({ error: `Cannot edit images while paper is ${paper.status}` }, { status: 400 })
		}
		uploader = { kind: 'coe', who: email }
	} else {
		return NextResponse.json({ error: 'paperId or assignmentId is required' }, { status: 400 })
	}

	// ── The file ───────────────────────────────────────────────────────────
	const file = form.get('file')
	if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
	if (!ALLOWED_TYPES.has(file.type)) {
		return NextResponse.json({ error: 'Invalid file type — use PNG, JPEG, WebP or GIF' }, { status: 400 })
	}
	if (file.size > MAX_FILE_SIZE) {
		return NextResponse.json({ error: 'Image too large — maximum 5 MB' }, { status: 400 })
	}

	try {
		const instCode = await institutionCode(paper.institutions_id)
		const uploaded = await uploadQuestionPaperToFolder({
			file,
			filename: file.name,
			mimeType: file.type,
			paperId: paper.id,
			institutionCode: instCode,
			courseCode: paper.course_code,
		})

		// The registry row and the audit line are independent writes.
		await Promise.all([
			registerQuestionPaperFile({
				paperId: paper.id,
				paperKind: paper.kind,
				institutionsId: paper.institutions_id,
				driveFileId: uploaded.driveFileId,
				driveUrl: uploaded.url,
				filename: uploaded.filename,
				mimeType: uploaded.mimeType,
				sizeBytes: uploaded.sizeBytes,
				uploadedByKind: uploader.kind,
				uploadedBy: uploader.who,
			}),
			uploader.kind === 'examiner'
				? logAccess(req, {
						action: 'image_upload',
						examiner_id: uploader.examinerId,
						examiner_email: uploader.who,
						assignment_id: uploader.assignmentId,
						paper_id: paper.id,
						institutions_id: paper.institutions_id,
						detail: { drive_file_id: uploaded.driveFileId, bytes: file.size, type: file.type },
					})
				: Promise.resolve(),
		])

		return NextResponse.json({
			url: questionPaperFileUrl(uploaded.driveFileId),
			driveUrl: uploaded.url,
			driveFileId: uploaded.driveFileId,
			filename: uploaded.filename,
			size: file.size,
			sizeBytes: file.size,
			type: file.type,
		})
	} catch (error: any) {
		console.error('[QP upload] Drive upload failed:', error?.message || error)
		return NextResponse.json({ error: 'The image could not be uploaded. Please try again.' }, { status: 500 })
	}
}
