import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth, corsOptionsHandler } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { buildStudentCiaView, type StudentCiaView } from '@/lib/cia-view/build-student-cia-view'
import { readCachedCiaView, writeCachedCiaView } from '@/lib/cia-view/cache'

/**
 * GET /api/v1/student-cia-view
 *
 * Purpose-built aggregate endpoint: returns a learner's ENTIRE internal
 * assessment (CIA) view in a single fast call — every exam session, that
 * session's CIA round/component config, and the learner's component marks per
 * course per round. Replaces the 40+ separate /api/v1/* calls the MyJKKN
 * "Internal Marks" tab made per learner (examination-sessions + per-session
 * registrations + cia-settings + cia-marks/report per course per round), which
 * caused 429 storms on a shared per-key rate-limited API. Mirrors the model of
 * GET /api/v1/student-result-view.
 *
 * Permission: cia-report:read  (mapped from the path in permission-check.ts)
 * Auth:       X-API-Key-Id + X-API-Secret
 *
 * Query params:
 *   - student_id (UUID) OR register_number (string)   [exactly one, required]
 *   - institution_id (UUID)   required for global keys; auto-applied for scoped keys
 *   - examination_session_id (UUID, optional)  omit = all the learner's sessions
 *
 * Reads are served from the precomputed student_cia_view_cache when present; a
 * miss builds live and back-fills. Per-learner only — the marks query is scoped
 * to the resolved learner, so no other student's marks can leak.
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

	// --- Resolve & enforce institution scoping (identical to student-result-view) ---
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
	let view: StudentCiaView | null = null

	const cached = await readCachedCiaView(supabase, { studentId, registerNumber, institutionId })
	if (cached) {
		view = cached.payload
	} else {
		const result = await buildStudentCiaView(supabase, {
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
		await writeCachedCiaView(supabase, {
			studentId: result.studentId,
			institutionId: result.institutionId,
			registerNumber: result.registerNumber,
			payload: result.view,
		})
	}

	// --- Apply optional session filter to the (full) view ---
	const responseView: StudentCiaView = sessionId
		? { ...view, sessions: view.sessions.filter(s => s.examination_session_id === sessionId) }
		: view

	// Diagnostic (COE-side): proves the returned shape and per-session course
	// counts, including how many are arrears. Read this in the COE dev terminal.
	console.log(
		`[student-cia-view] register_number=${registerNumber ?? '-'} student_id=${studentId ?? '-'} `
		+ `inst=${institutionId} source=${cached ? 'cache' : 'build'} sessions=${responseView.sessions.length} → `
		+ responseView.sessions
			.map(s => {
				const arrear = s.courses.filter(c => c.is_regular === false).length
				return `${s.semester_label}[${s.courses.length}c,${arrear} arrear,${s.settings.length}set]`
			})
			.join(', '),
	)

	const response = NextResponse.json(responseView)
	response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=120')
	return response
})

// CORS preflight for browser-based consumers.
export const OPTIONS = corsOptionsHandler
