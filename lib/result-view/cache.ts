/**
 * Student Result View — precompute cache (C2).
 *
 * student_result_view_cache holds ONE row per (student, institution) with the
 * full all-semesters view as JSONB. The endpoint reads this in a single indexed
 * lookup; on a miss it builds live (buildStudentResultView) and back-fills the
 * row. At result-publish time we proactively refresh affected learners so
 * result-day reads are served straight from the cache.
 *
 * The cache always stores the UNFILTERED (all-semesters) view. A session-scoped
 * request slices the cached semesters in app code, so one cached row serves
 * every query shape for a learner.
 */

import type { getSupabaseServer } from '@/lib/supabase-server'
import {
	buildStudentResultView,
	RESULT_VIEW_SCHEMA_VERSION,
	type StudentResultView,
} from './build-student-result-view'

type SupabaseServer = ReturnType<typeof getSupabaseServer>

const CACHE_TABLE = 'student_result_view_cache'

export interface CachedView {
	payload: StudentResultView
	computedAt: string
}

/** Read the cached view by student_id (preferred) or register_number. */
export async function readCachedView(
	supabase: SupabaseServer,
	opts: { studentId?: string | null; registerNumber?: string | null; institutionId: string },
): Promise<CachedView | null> {
	let query = supabase
		.from(CACHE_TABLE)
		.select('payload, computed_at, schema_version')
		.eq('institutions_id', opts.institutionId)
		.limit(1)

	if (opts.studentId) {
		query = query.eq('student_id', opts.studentId)
	} else if (opts.registerNumber) {
		query = query.eq('register_number', opts.registerNumber)
	} else {
		return null
	}

	const { data, error } = await query
	if (error || !data || data.length === 0) return null

	// Stale-schema guard: a row built by older logic is treated as a miss so the
	// read path rebuilds it (and re-stamps the current version).
	if (data[0].schema_version !== RESULT_VIEW_SCHEMA_VERSION) return null

	return {
		payload: data[0].payload as StudentResultView,
		computedAt: data[0].computed_at as string,
	}
}

/** Upsert the cached view for a learner. */
export async function writeCachedView(
	supabase: SupabaseServer,
	row: { studentId: string; institutionId: string; registerNumber: string | null; payload: StudentResultView },
): Promise<void> {
	const { error } = await supabase
		.from(CACHE_TABLE)
		.upsert(
			{
				student_id: row.studentId,
				institutions_id: row.institutionId,
				register_number: row.registerNumber,
				payload: row.payload,
				schema_version: RESULT_VIEW_SCHEMA_VERSION,
				computed_at: new Date().toISOString(),
			},
			{ onConflict: 'student_id,institutions_id' },
		)
	if (error) {
		// Cache writes are best-effort — never fail a read because of them.
		console.error('[result-view cache] write failed:', error)
	}
}

/**
 * Rebuild and store the cached view for a single learner. Returns the freshly
 * built view (or null if the learner could not be resolved). Best-effort: a
 * build/write error is logged and swallowed so a publish never fails on cache.
 */
export async function refreshStudentResultCache(
	supabase: SupabaseServer,
	opts: { studentId: string; institutionId: string },
): Promise<StudentResultView | null> {
	try {
		const result = await buildStudentResultView(supabase, {
			studentId: opts.studentId,
			institutionId: opts.institutionId,
		})
		if (!result.ok) return null
		await writeCachedView(supabase, {
			studentId: result.studentId,
			institutionId: result.institutionId,
			registerNumber: result.registerNumber,
			payload: result.view,
		})
		return result.view
	} catch (err) {
		console.error('[result-view cache] refresh failed for', opts.studentId, err)
		return null
	}
}

/**
 * Refresh the cache for many learners in bounded-concurrency batches. Called at
 * publish time so result-day reads land on warm rows. Best-effort; returns the
 * count successfully refreshed.
 */
export async function refreshManyStudentResultCaches(
	supabase: SupabaseServer,
	students: Array<{ studentId: string; institutionId: string }>,
	concurrency = 10,
): Promise<number> {
	// Deduplicate (student, institution) pairs.
	const seen = new Set<string>()
	const unique = students.filter(s => {
		if (!s.studentId || !s.institutionId) return false
		const key = `${s.studentId}::${s.institutionId}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})

	let refreshed = 0
	for (let i = 0; i < unique.length; i += concurrency) {
		const batch = unique.slice(i, i + concurrency)
		const results = await Promise.all(
			batch.map(s => refreshStudentResultCache(supabase, s)),
		)
		refreshed += results.filter(Boolean).length
	}
	return refreshed
}

/** Remove cached rows for the given learners (used on withdraw/unpublish). */
export async function invalidateStudentResultCaches(
	supabase: SupabaseServer,
	students: Array<{ studentId: string; institutionId: string }>,
): Promise<void> {
	const studentIds = Array.from(new Set(students.map(s => s.studentId).filter(Boolean)))
	const institutionIds = Array.from(new Set(students.map(s => s.institutionId).filter(Boolean)))
	if (studentIds.length === 0 || institutionIds.length === 0) return

	const { error } = await supabase
		.from(CACHE_TABLE)
		.delete()
		.in('student_id', studentIds)
		.in('institutions_id', institutionIds)
	if (error) {
		console.error('[result-view cache] invalidate failed:', error)
	}
}
