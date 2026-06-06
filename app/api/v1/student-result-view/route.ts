import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth, corsOptionsHandler } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { buildStudentResultView, type StudentResultView } from '@/lib/result-view/build-student-result-view'
import { readCachedView, writeCachedView } from '@/lib/result-view/cache'

/**
 * GET /api/v1/student-result-view
 *
 * Purpose-built aggregate endpoint: returns a learner's ENTIRE multi-semester
 * result view in a single fast call, replacing the ~20 separate /api/v1/* calls
 * the MyJKKN "Semester Result" page used to make per student. On result-day this
 * collapses 300+ students' load from thousands of calls to one each.
 *
 * Permission: results:read  (mapped from the path in permission-check.ts)
 * Auth:       X-API-Key-Id + X-API-Secret
 *
 * Query params:
 *   - student_id (UUID) OR register_number (string)   [exactly one, required]
 *   - institution_id (UUID)   required for global keys; auto-applied for scoped keys
 *   - examination_session_id (UUID, optional)  omit = all the learner's semesters
 *
 * Reads are served from the precomputed student_result_view_cache; a miss builds
 * live and back-fills the cache. The response carries the same visibility gate as
 * /api/v1/results, so undeclared semesters return is_published=false with no marks.
 */
export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const studentId = searchParams.get('student_id')
	const registerNumber = searchParams.get('register_number')
	const institutionIdParam = searchParams.get('institution_id') || searchParams.get('institutions_id')
	const sessionId = searchParams.get('examination_session_id')

	// --- Validate identifier: exactly one of student_id / register_number ---
	if ((!studentId && !registerNumber) || (studentId && registerNumber)) {
		return NextResponse.json(
			{ error: 'Provide exactly one of student_id or register_number' },
			{ status: 400 },
		)
	}

	// --- Resolve & enforce institution scoping ---
	const allowed = ctx.allowedInstitutionIds || []
	let institutionId: string | null = null

	if (institutionIdParam) {
		if (allowed.length > 0 && !allowed.includes(institutionIdParam)) {
			return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
		}
		institutionId = institutionIdParam
	} else if (allowed.length === 1) {
		institutionId = allowed[0]
	} else if (allowed.length > 1 && ctx.institutionsId && allowed.includes(ctx.institutionsId)) {
		institutionId = ctx.institutionsId
	} else if (allowed.length === 0) {
		return NextResponse.json(
			{ error: 'institution_id is required for global API keys' },
			{ status: 400 },
		)
	}

	if (!institutionId) {
		return NextResponse.json(
			{ error: 'institution_id is required to disambiguate this key\'s institutions' },
			{ status: 400 },
		)
	}

	// --- Serve from cache, else build live and back-fill ---
	let view: StudentResultView | null = null

	const cached = await readCachedView(supabase, { studentId, registerNumber, institutionId })
	if (cached) {
		view = cached.payload
	} else {
		const result = await buildStudentResultView(supabase, {
			studentId,
			registerNumber,
			institutionId,
			// Build the FULL view (all sessions) so the cached row serves every
			// query shape; a session filter is applied to the response below.
		})

		if (!result.ok) {
			return NextResponse.json({ error: 'Learner not found' }, { status: 404 })
		}

		view = result.view
		// Best-effort back-fill (does not block / fail the response).
		await writeCachedView(supabase, {
			studentId: result.studentId,
			institutionId: result.institutionId,
			registerNumber: result.registerNumber,
			payload: result.view,
		})
	}

	// --- Apply optional session filter to the (full) view ---
	const responseView: StudentResultView = sessionId
		? { ...view, sessions: view.sessions.filter(s => s.examination_session_id === sessionId) }
		: view

	// Diagnostic (COE-side): proves the returned shape and per-session course
	// counts, including how many are arrears. Read this in the COE dev terminal.
	console.log(
		`[student-result-view] register_number=${registerNumber ?? '-'} student_id=${studentId ?? '-'} `
		+ `inst=${institutionId} source=${cached ? 'cache' : 'build'} sessions=${responseView.sessions.length} → `
		+ responseView.sessions
			.map(s => {
				const arrear = s.courses.filter(c => c.is_regular === false).length
				return `${s.semester_label}[${s.courses.length}c,${arrear} arrear]`
			})
			.join(', '),
	)

	const response = NextResponse.json(responseView)
	response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=120')
	return response
})

// CORS preflight for browser-based consumers.
export const OPTIONS = corsOptionsHandler
