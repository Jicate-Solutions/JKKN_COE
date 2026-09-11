// Examiner portal — the syllabus of the course being set.
//
// GET /api/examiner-portal/assignments/:id/syllabus?format=official
//
// The question paper must be set within the prescribed syllabus, so this is
// readable at ANY time the assignment is active — it is not question content
// and is not window-gated. Resolution (MyJKKN, then the COE course master)
// lives in lib/myjkkn/learning-pathway.ts and is shared with the staff route.

import { NextRequest, NextResponse } from 'next/server'
import { requireAssignment, logAccess } from '@/lib/qp-portal/guard'
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const auth = await requireAssignment(req, id, { action: 'view syllabus' })
	if (!auth.ok) return auth.response

	const { assignment } = auth.access
	const format = parseLearningPathwayFormat(new URL(req.url).searchParams.get('format'))

	const log = (source: string, detail: Record<string, unknown>) =>
		logAccess(req, {
			action: 'syllabus_view',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: assignment.id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
			module: 'document',
			performed_by_role: 'examiner',
			detail: { source, format, course_id: assignment.course_id || null, course_code: assignment.course_code, ...detail },
		})

	try {
		const result = await resolveLearningPathwayPdf({
			courseId: assignment.course_id,
			courseCode: assignment.course_code,
			courseTitle: assignment.subject_title,
			institutionsId: assignment.institutions_id,
			format,
			ifNoneMatch: req.headers.get('if-none-match'),
		})

		if (result.kind === 'not_modified') return new NextResponse(null, { status: 304 })
		if (result.kind === 'miss') {
			await log('none', { renderer_down: result.rendererDown, attempts: result.attempts, ...result.detail })
			return learningPathwayMissPage(result, assignment.course_code)
		}

		await log(result.source, result.detail)
		return new NextResponse(result.bytes, {
			status: 200,
			headers: learningPathwayHeaders(result, result.filename),
		})
	} catch (error) {
		console.error('[QP portal] syllabus failed for', id, error)
		return learningPathwayMessagePage(500, 'Something went wrong', 'The syllabus could not be fetched. Try again.')
	}
}
