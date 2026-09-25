// Syllabus PDF for one COE course — the ONE address every screen uses.
//
// GET /api/courses/:id/syllabus-pdf?format=official&disposition=inline
//
// Spec 2026-09-10 §5.2: the COE proxies MyJKKN's academic/syllabus PDF so the
// API key never reaches a browser. `:id` is courses.id, which is also the key
// MyJKKN itself prefers (bos_course_syllabi.course_id), so the same link
// always opens the CURRENT published version and never pins an old row.
//
// Two audiences share it, so proxy.ts lists this path as public and the
// route authenticates both itself (same pattern as the figure proxy under
// app/api/examiner/question-paper/file):
//   • examiner portal session → must hold a live assignment for THIS course;
//     the view is written to ia_qp_access_logs against that assignment. The
//     syllabus is not question content, so it is not window-gated.
//   • COE session (access_token + coe_access cookies) → any COE user.
// A browser can hold both cookies; the portal one is tried first.
//
// Falls back to courses.syllabus_pdf_url when MyJKKN has nothing published.
// A miss opens as a short readable page, since the buttons open a new tab.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { resolveCallerEmail } from '@/lib/auth/check-user-permission'
import { requireAssignment, logAccess } from '@/lib/qp-portal/guard'
import { readPortalSession } from '@/lib/qp-portal/session'
import type { QpAssignment } from '@/types/qp-examiner-assignment'
import {
	resolveLearningPathwayPdf,
	parseLearningPathwayFormat,
	learningPathwayHeaders,
	learningPathwayMissPage,
	learningPathwayMessagePage,
} from '@/lib/myjkkn/learning-pathway'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type Viewer =
	| { kind: 'coe'; email: string }
	| { kind: 'examiner'; assignment: QpAssignment; examiner: { id: string; email: string } }

/**
 * Who is asking, and may they see this course's syllabus? Examiners are
 * authorised through their newest live assignment for the course, so the
 * audit row and any refusal carry the assignment id exactly as the portal's
 * own routes do.
 */
async function authorise(req: NextRequest, courseId: string): Promise<Viewer | null> {
	const session = await readPortalSession(req)
	if (session) {
		const { data } = await getSupabaseServer()
			.from('ia_qp_assignments')
			.select('id')
			.eq('course_id', courseId)
			.eq('examiner_id', session.sub || '')
			.neq('status', 'cancelled')
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle()
		if (data?.id) {
			const auth = await requireAssignment(req, data.id, { action: 'view syllabus' })
			if (auth.ok) {
				return {
					kind: 'examiner',
					assignment: auth.access.assignment,
					examiner: { id: auth.examiner.id, email: auth.examiner.email },
				}
			}
		}
	}

	if (req.cookies.get('coe_access')?.value) {
		const email = await resolveCallerEmail()
		if (email) return { kind: 'coe', email }
	}

	return null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const url = new URL(req.url)
	const format = parseLearningPathwayFormat(url.searchParams.get('format'))
	const disposition = url.searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline'

	const viewer = await authorise(req, id)
	if (!viewer) {
		return learningPathwayMessagePage(
			401,
			'Sign in to open the syllabus',
			'Your session has ended or this course is not assigned to you. Sign in again and reopen the syllabus from the page.'
		)
	}

	const supabase = getSupabaseServer()
	const { data: course } = await supabase
		.from('courses')
		.select('id, course_code, course_name, regulation_code, institutions_id')
		.eq('id', id)
		.maybeSingle()
	if (!course) {
		return learningPathwayMessagePage(404, 'Course not found', 'That course is not in the COE course master.')
	}

	// Examiner views are audited like every other portal read; staff views are not.
	const log = (source: string, detail: Record<string, unknown>) => {
		if (viewer.kind !== 'examiner') return Promise.resolve()
		const { assignment, examiner } = viewer
		return logAccess(req, {
			action: 'syllabus_view',
			examiner_id: examiner.id,
			examiner_email: examiner.email,
			assignment_id: assignment.id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
			module: 'document',
			performed_by_role: 'examiner',
			detail: { source, format, course_id: course.id, course_code: course.course_code, ...detail },
		})
	}

	try {
		const result = await resolveLearningPathwayPdf({
			courseId: course.id,
			courseCode: course.course_code,
			courseTitle: course.course_name,
			regulation: course.regulation_code,
			institutionsId: course.institutions_id,
			format,
			ifNoneMatch: req.headers.get('if-none-match'),
		})

		if (result.kind === 'not_modified') return new NextResponse(null, { status: 304 })
		if (result.kind === 'miss') {
			await log('none', { renderer_down: result.rendererDown, attempts: result.attempts, ...result.detail })
			return learningPathwayMissPage(result, course.course_code)
		}

		await log(result.source, result.detail)
		return new NextResponse(result.bytes, {
			status: 200,
			headers: learningPathwayHeaders(result, result.filename, disposition),
		})
	} catch (error) {
		console.error('[Learning pathway] course proxy failed for', id, error)
		return learningPathwayMessagePage(500, 'Something went wrong', 'The syllabus could not be fetched. Try again.')
	}
}
