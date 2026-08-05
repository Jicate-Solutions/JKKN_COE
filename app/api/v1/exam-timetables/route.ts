import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth, corsOptionsHandler } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

// CORS preflight for browser-based child apps
export const OPTIONS = corsOptionsHandler

/**
 * GET /api/v1/exam-timetables
 *
 * Read-only exam timetable feed for MyJKKN and other child applications.
 * **View only:** there are no create/update/delete operations on this resource —
 * timetables are authored in the COE portal.
 *
 * Permission required: timetables:read
 * Auth: X-API-Key-Id + X-API-Secret headers
 *
 * INSTITUTION MAPPING: MyJKKN keeps SF and aided institutions separate while COE
 * collapses both into one row, so callers pass MyJKKN ids via
 * `myjkkn_institution_ids` and we resolve them through
 * `institutions.myjkkn_institution_ids`. `institution_code` / `institutions_id`
 * remain available for COE-native callers.
 *
 * Query params:
 *   id                      single timetable UUID (returns one record)
 *   myjkkn_institution_ids  csv of MyJKKN institution UUIDs
 *   institutions_id         csv of COE institution UUIDs
 *   institution_code        csv of COE institution codes (e.g. CAS,JKKNCP)
 *   examination_session_id  csv of examination session UUIDs
 *   session_code            csv of examination session codes (e.g. NOV2025)
 *   exam_type               csv — Theory | Practical | Project | Field Work | Group Project
 *   course_code             csv of course codes
 *   program_code            csv of programme codes (resolved via course_offerings)
 *   session                 csv — FN | AN
 *   exam_date               exact date (YYYY-MM-DD)
 *   from / to               date window (YYYY-MM-DD), inclusive
 *   is_published            true (default) | false | all
 *   search                  matches course_code or course_name
 *   limit                   default 500, max 5000
 *   offset                  default 0
 *
 * Only published rows are returned unless the caller asks otherwise — an
 * unpublished timetable is still being drafted and must not reach learners.
 */

const EXAM_TYPES = ['Theory', 'Practical', 'Project', 'Field Work', 'Group Project'] as const
const EXAM_SESSIONS = ['FN', 'AN'] as const

const TIMETABLE_SELECT = `
	id, institutions_id, examination_session_id, course_offering_id, course_id,
	exam_date, exam_time, session, duration_minutes, exam_mode, exam_type,
	batch_capacity, is_published, instructions, created_at, updated_at,
	courses ( id, course_code, course_name )
`

// PostgREST sends filters in the query string, so a very long `.in()` list can
// blow past the URL limit. Chunking keeps every request well inside it.
const IN_CHUNK = 200

interface InstitutionRow {
	id: string
	institution_code: string
	name: string
	myjkkn_institution_ids: string[] | null
}

function csv(param: string | null): string[] {
	if (!param) return []
	return param.split(',').map(v => v.trim()).filter(Boolean)
}

function chunk<T>(items: T[], size = IN_CHUNK): T[][] {
	const out: T[][] = []
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
	return out
}

function unique<T>(items: (T | null | undefined)[]): T[] {
	return Array.from(new Set(items.filter(Boolean) as T[]))
}

/** "10:00:00" + 180 minutes → "13:00:00". Null when either side is unknown. */
function addMinutes(time: string | null, minutes: number | null): string | null {
	if (!time || !minutes) return null
	const [h, m] = time.split(':').map(Number)
	if (Number.isNaN(h) || Number.isNaN(m)) return null
	const total = h * 60 + m + minutes
	const hh = String(Math.floor(total / 60) % 24).padStart(2, '0')
	const mm = String(total % 60).padStart(2, '0')
	return `${hh}:${mm}:00`
}

/** Chunked `.in()` fetch — avoids the query-string length ceiling. */
async function fetchIn(
	supabase: any,
	table: string,
	column: string,
	values: string[],
	select: string,
): Promise<any[]> {
	if (!values.length) return []
	const results: any[] = []
	for (const part of chunk(values)) {
		const { data, error } = await supabase.from(table).select(select).in(column, part)
		if (error) {
			console.error(`v1 exam-timetables: failed to fetch ${table}:`, error)
			continue
		}
		if (data) results.push(...data)
	}
	return results
}

// =====================================================
// Institution scope
// =====================================================

async function loadInstitutions(supabase: any): Promise<InstitutionRow[]> {
	const { data } = await supabase
		.from('institutions')
		.select('id, institution_code, name, myjkkn_institution_ids')
	return (data || []) as InstitutionRow[]
}

type ScopeResult =
	| { ids: string[]; institutions: InstitutionRow[] }
	| { error: string; status: number }

/**
 * Narrows the institutions a request may read.
 *
 * The API key's own scope always wins — a caller cannot widen it by naming
 * institutions the key was never granted.
 */
function resolveScope(
	all: InstitutionRow[],
	context: ExternalApiContext,
	params: { myjkknIds: string[]; institutionIds: string[]; institutionCodes: string[] },
): ScopeResult {
	let pool = all

	if (context.allowedInstitutionIds?.length) {
		const allowed = new Set(context.allowedInstitutionIds)
		const requestedOutside = params.institutionIds.filter(id => !allowed.has(id))
		if (requestedOutside.length) {
			return { error: 'Access denied for this institution', status: 403 }
		}
		pool = pool.filter(i => allowed.has(i.id))
	}

	if (params.myjkknIds.length) {
		const wanted = new Set(params.myjkknIds)
		pool = pool.filter(i => (i.myjkkn_institution_ids || []).some(m => wanted.has(m)))
	}

	if (params.institutionIds.length) {
		const wanted = new Set(params.institutionIds)
		pool = pool.filter(i => wanted.has(i.id))
	}

	if (params.institutionCodes.length) {
		const wanted = new Set(params.institutionCodes.map(c => c.toUpperCase()))
		pool = pool.filter(i => wanted.has((i.institution_code || '').toUpperCase()))
	}

	if (!pool.length) {
		return { error: 'No institution matched the request scope', status: 404 }
	}

	return { ids: pool.map(i => i.id), institutions: pool }
}

// =====================================================
// Row enrichment
// =====================================================

/**
 * Attaches the fields child apps actually render — institution, examination
 * session, course and programme — none of which live on exam_timetables itself.
 * Programme comes from course_offerings, which has no FK to exam_timetables, so
 * it is fetched rather than embedded.
 */
async function enrichRows(
	supabase: any,
	rows: any[],
	institutionMap: Map<string, InstitutionRow>,
): Promise<any[]> {
	if (!rows.length) return []

	const sessionIds = unique(rows.map(r => r.examination_session_id))
	const offeringIds = unique(rows.map(r => r.course_offering_id))

	const [sessionRows, offeringRows] = await Promise.all([
		fetchIn(supabase, 'examination_sessions', 'id', sessionIds, 'id, session_code, session_name, month_year'),
		fetchIn(supabase, 'course_offerings', 'id', offeringIds, 'id, institutions_id, program_id, program_code, semester, section'),
	])

	const sessionMap = new Map(sessionRows.map((s: any) => [s.id, s]))
	const offeringMap = new Map(offeringRows.map((o: any) => [o.id, o]))

	const programCodes = unique(offeringRows.map((o: any) => o.program_code))
	const programIds = unique(offeringRows.map((o: any) => o.program_id))

	const [byCode, byId] = await Promise.all([
		programCodes.length
			? fetchIn(supabase, 'programs', 'program_code', programCodes, 'id, institutions_id, program_code, program_name, program_type')
			: Promise.resolve([]),
		programIds.length
			? fetchIn(supabase, 'programs', 'id', programIds, 'id, institutions_id, program_code, program_name, program_type')
			: Promise.resolve([]),
	])

	// The same programme code can exist in more than one institution, so the
	// institution-qualified key is tried first and the bare code is the fallback.
	const programByInstitutionCode = new Map<string, any>()
	const programByCode = new Map<string, any>()
	byCode.forEach((p: any) => {
		programByInstitutionCode.set(`${p.institutions_id}|${p.program_code}`, p)
		if (!programByCode.has(p.program_code)) programByCode.set(p.program_code, p)
	})
	const programById = new Map(byId.map((p: any) => [p.id, p]))

	return rows.map(row => {
		const inst = institutionMap.get(row.institutions_id)
		const sess: any = sessionMap.get(row.examination_session_id)
		const offering: any = offeringMap.get(row.course_offering_id)
		const program: any =
			(offering?.program_code && programByInstitutionCode.get(`${row.institutions_id}|${offering.program_code}`)) ||
			(offering?.program_id && programById.get(offering.program_id)) ||
			(offering?.program_code && programByCode.get(offering.program_code)) ||
			null

		return {
			id: row.id,

			// Institution
			institutions_id: row.institutions_id,
			institution_code: inst?.institution_code || null,
			institution_name: inst?.name || null,
			myjkkn_institution_ids: inst?.myjkkn_institution_ids || [],

			// Examination session
			examination_session_id: row.examination_session_id,
			session_code: sess?.session_code || null,
			session_name: sess?.session_name || null,
			month_year: sess?.month_year || null,

			// Course
			course_id: row.course_id,
			course_code: row.courses?.course_code || null,
			course_name: row.courses?.course_name || null,

			// Programme (via course offering)
			course_offering_id: row.course_offering_id,
			program_id: offering?.program_id || null,
			program_code: offering?.program_code || program?.program_code || null,
			program_name: program?.program_name || null,
			program_type: program?.program_type || null,
			semester: offering?.semester ?? null,
			section: offering?.section ?? null,

			// Schedule
			exam_date: row.exam_date,
			exam_time: row.exam_time,
			exam_end_time: addMinutes(row.exam_time, row.duration_minutes),
			session: row.session,
			session_label: row.session === 'FN' ? 'Forenoon' : row.session === 'AN' ? 'Afternoon' : null,
			duration_minutes: row.duration_minutes,

			// Exam attributes
			exam_type: row.exam_type,
			exam_mode: row.exam_mode,
			batch_capacity: row.batch_capacity,
			is_published: row.is_published,
			instructions: row.instructions,

			created_at: row.created_at,
			updated_at: row.updated_at,
		}
	})
}

// =====================================================
// GET
// =====================================================

export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const allInstitutions = await loadInstitutions(supabase)
		const institutionMap = new Map(allInstitutions.map(i => [i.id, i]))

		const scope = resolveScope(allInstitutions, context, {
			myjkknIds: [
				...csv(searchParams.get('myjkkn_institution_ids')),
				...csv(searchParams.get('myjkkn_institution_id')),
			],
			institutionIds: csv(searchParams.get('institutions_id')),
			institutionCodes: csv(searchParams.get('institution_code')),
		})
		if ('error' in scope) {
			return NextResponse.json({ error: scope.error }, { status: scope.status })
		}

		// ---- single record ----
		const id = searchParams.get('id')
		if (id) {
			const { data, error } = await supabase
				.from('exam_timetables')
				.select(TIMETABLE_SELECT)
				.eq('id', id)
				.maybeSingle()

			if (error || !data) {
				return NextResponse.json({ error: 'Exam timetable not found' }, { status: 404 })
			}
			if (!scope.ids.includes(data.institutions_id)) {
				return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
			}

			const [enriched] = await enrichRows(supabase, [data], institutionMap)
			return NextResponse.json({ data: enriched, request_id: context.requestId })
		}

		// ---- filters ----
		const sessionIds = csv(searchParams.get('examination_session_id'))
		const sessionCodes = csv(searchParams.get('session_code'))
		const examTypes = csv(searchParams.get('exam_type'))
		const courseCodes = csv(searchParams.get('course_code'))
		const programCodes = csv(searchParams.get('program_code'))
		const daySessions = csv(searchParams.get('session')).map(s => s.toUpperCase())
		const examDate = searchParams.get('exam_date')
		const from = searchParams.get('from')
		const to = searchParams.get('to')
		const publishedParam = (searchParams.get('is_published') || 'true').toLowerCase()
		const search = (searchParams.get('search') || '').trim()
		const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 500, 1), 5000)
		const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

		const invalidType = examTypes.find(t => !(EXAM_TYPES as readonly string[]).includes(t))
		if (invalidType) {
			return NextResponse.json(
				{ error: `Invalid exam_type "${invalidType}". Valid values: ${EXAM_TYPES.join(', ')}` },
				{ status: 400 },
			)
		}

		const invalidSession = daySessions.find(s => !(EXAM_SESSIONS as readonly string[]).includes(s))
		if (invalidSession) {
			return NextResponse.json(
				{ error: `Invalid session "${invalidSession}". Valid values: FN, AN` },
				{ status: 400 },
			)
		}

		// Examination session codes → ids (within scope)
		let resolvedSessionIds: string[] | null = sessionIds.length ? sessionIds : null
		if (sessionCodes.length) {
			const { data: sessions } = await supabase
				.from('examination_sessions')
				.select('id')
				.in('institutions_id', scope.ids)
				.in('session_code', sessionCodes)

			const codeIds = (sessions || []).map((s: any) => s.id)
			resolvedSessionIds = resolvedSessionIds
				? resolvedSessionIds.filter(sid => codeIds.includes(sid))
				: codeIds
			if (!resolvedSessionIds.length) return emptyPage(context, limit, offset)
		}

		// Course codes / free-text search → course ids (within scope)
		let resolvedCourseIds: string[] | null = null
		if (courseCodes.length || search) {
			let courseQuery = supabase
				.from('courses')
				.select('id')
				.in('institutions_id', scope.ids)
				.range(0, 9999)

			if (courseCodes.length) courseQuery = courseQuery.in('course_code', courseCodes)
			if (search) {
				const safe = search.replace(/[,()]/g, ' ')
				courseQuery = courseQuery.or(`course_code.ilike.%${safe}%,course_name.ilike.%${safe}%`)
			}

			const { data: courses } = await courseQuery
			resolvedCourseIds = (courses || []).map((c: any) => c.id)
			if (!resolvedCourseIds.length) return emptyPage(context, limit, offset)
		}

		// Programme codes → course offering ids (programme lives on the offering)
		let resolvedOfferingIds: string[] | null = null
		if (programCodes.length) {
			let offeringQuery = supabase
				.from('course_offerings')
				.select('id')
				.in('institutions_id', scope.ids)
				.in('program_code', programCodes)
				.range(0, 9999)

			if (resolvedSessionIds) offeringQuery = offeringQuery.in('examination_session_id', resolvedSessionIds)

			const { data: offerings } = await offeringQuery
			resolvedOfferingIds = (offerings || []).map((o: any) => o.id)
			if (!resolvedOfferingIds.length) return emptyPage(context, limit, offset)
		}

		const applyFilters = (q: any, offeringIds?: string[]) => {
			q = q.in('institutions_id', scope.ids)
			if (offeringIds) q = q.in('course_offering_id', offeringIds)
			if (resolvedSessionIds) q = q.in('examination_session_id', resolvedSessionIds)
			if (resolvedCourseIds) q = q.in('course_id', resolvedCourseIds)
			if (examTypes.length) q = q.in('exam_type', examTypes)
			if (daySessions.length) q = q.in('session', daySessions)
			if (examDate) q = q.eq('exam_date', examDate)
			if (from) q = q.gte('exam_date', from)
			if (to) q = q.lte('exam_date', to)
			if (publishedParam === 'true') q = q.eq('is_published', true)
			else if (publishedParam === 'false') q = q.eq('is_published', false)
			// exam_date is not unique, so `id` is the tiebreaker that keeps
			// paginated reads from duplicating or skipping rows.
			return q
				.order('exam_date', { ascending: true })
				.order('exam_time', { ascending: true, nullsFirst: false })
				.order('id', { ascending: true })
		}

		let rows: any[] = []
		let total = 0

		if (resolvedOfferingIds) {
			// The offering-id list can be long, so it is paged through in chunks
			// and sorted/sliced in memory rather than sent as one giant filter.
			for (const part of chunk(resolvedOfferingIds)) {
				const { data, error } = await applyFilters(
					supabase.from('exam_timetables').select(TIMETABLE_SELECT),
					part,
				).range(0, 9999)

				if (error) {
					console.error('v1 exam-timetables fetch error:', error)
					return NextResponse.json({ error: 'Failed to fetch exam timetables' }, { status: 500 })
				}
				if (data) rows.push(...data)
			}

			rows.sort((a, b) =>
				String(a.exam_date).localeCompare(String(b.exam_date)) ||
				String(a.exam_time || '').localeCompare(String(b.exam_time || '')) ||
				String(a.id).localeCompare(String(b.id)),
			)
			total = rows.length
			rows = rows.slice(offset, offset + limit)
		} else {
			const { data, error, count } = await applyFilters(
				supabase.from('exam_timetables').select(TIMETABLE_SELECT, { count: 'exact' }),
			).range(offset, offset + limit - 1)

			if (error) {
				console.error('v1 exam-timetables fetch error:', error)
				return NextResponse.json({ error: 'Failed to fetch exam timetables' }, { status: 500 })
			}
			rows = data || []
			total = count ?? rows.length
		}

		const enriched = await enrichRows(supabase, rows, institutionMap)

		return NextResponse.json({
			data: enriched,
			count: enriched.length,
			total,
			limit,
			offset,
			request_id: context.requestId,
		})
	} catch (error) {
		console.error('v1 exam-timetables GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

function emptyPage(context: ExternalApiContext, limit: number, offset: number) {
	return NextResponse.json({
		data: [],
		count: 0,
		total: 0,
		limit,
		offset,
		request_id: context.requestId,
	})
}
