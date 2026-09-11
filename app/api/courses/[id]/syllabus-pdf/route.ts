// Syllabus PDF for one COE course — staff side.
//
// GET /api/courses/:id/syllabus-pdf?format=official&disposition=inline
//
// Spec 2026-09-10 §5.2: the COE proxies MyJKKN's academic/syllabus PDF so the
// API key never reaches a browser. Session auth is enforced by proxy.ts for
// every /api route (access_token + coe_access cookies); nothing here writes.
//
// Falls back to courses.syllabus_pdf_url when MyJKKN has nothing published.
// A miss opens as a short readable page, since the buttons open a new tab.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
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
	const url = new URL(req.url)
	const format = parseLearningPathwayFormat(url.searchParams.get('format'))
	const disposition = url.searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline'

	const supabase = getSupabaseServer()
	const { data: course } = await supabase
		.from('courses')
		.select('id, course_code, course_name, regulation_code, institutions_id')
		.eq('id', id)
		.maybeSingle()
	if (!course) {
		return learningPathwayMessagePage(404, 'Course not found', 'That course is not in the COE course master.')
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
		if (result.kind === 'miss') return learningPathwayMissPage(result, course.course_code)

		return new NextResponse(result.bytes, {
			status: 200,
			headers: learningPathwayHeaders(result, result.filename, disposition),
		})
	} catch (error) {
		console.error('[Learning pathway] course proxy failed for', id, error)
		return learningPathwayMessagePage(500, 'Something went wrong', 'The syllabus could not be fetched. Try again.')
	}
}
