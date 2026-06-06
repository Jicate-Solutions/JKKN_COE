/**
 * Student CIA View — precompute cache.
 *
 * student_cia_view_cache holds ONE row per (student, institution) with the full
 * all-sessions CIA view as JSONB. The endpoint reads this in a single indexed
 * lookup; on a miss it builds live (buildStudentCiaView) and back-fills the row.
 *
 * The cache always stores the UNFILTERED (all-sessions) view. A session-scoped
 * request slices the cached sessions in app code, so one cached row serves every
 * query shape for a learner.
 *
 * All cache access is best-effort: if the table has not been migrated yet (it is
 * applied manually in the Supabase SQL Editor), a read returns null and the
 * endpoint falls back to a live build — the feature works before the migration.
 */

import type { getSupabaseServer } from '@/lib/supabase-server'
import {
	buildStudentCiaView,
	CIA_VIEW_SCHEMA_VERSION,
	type StudentCiaView,
} from './build-student-cia-view'

type SupabaseServer = ReturnType<typeof getSupabaseServer>

const CACHE_TABLE = 'student_cia_view_cache'

export interface CachedCiaView {
	payload: StudentCiaView
	computedAt: string
}

/** Read the cached view by student_id (preferred) or register_number. */
export async function readCachedCiaView(
	supabase: SupabaseServer,
	opts: { studentId?: string | null; registerNumber?: string | null; institutionId: string },
): Promise<CachedCiaView | null> {
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
	if (data[0].schema_version !== CIA_VIEW_SCHEMA_VERSION) return null

	return {
		payload: data[0].payload as StudentCiaView,
		computedAt: data[0].computed_at as string,
	}
}

/** Upsert the cached view for a learner. Best-effort — never fails a read. */
export async function writeCachedCiaView(
	supabase: SupabaseServer,
	row: { studentId: string; institutionId: string; registerNumber: string | null; payload: StudentCiaView },
): Promise<void> {
	const { error } = await supabase
		.from(CACHE_TABLE)
		.upsert(
			{
				student_id: row.studentId,
				institutions_id: row.institutionId,
				register_number: row.registerNumber,
				payload: row.payload,
				schema_version: CIA_VIEW_SCHEMA_VERSION,
				computed_at: new Date().toISOString(),
			},
			{ onConflict: 'student_id,institutions_id' },
		)
	if (error) {
		console.error('[cia-view cache] write failed:', error)
	}
}

/**
 * Rebuild and store the cached view for a single learner. Returns the freshly
 * built view (or null if the learner could not be resolved). Best-effort: a
 * build/write error is logged and swallowed so a marks sync never fails on cache.
 */
export async function refreshStudentCiaCache(
	supabase: SupabaseServer,
	opts: { studentId: string; institutionId: string },
): Promise<StudentCiaView | null> {
	try {
		const result = await buildStudentCiaView(supabase, {
			studentId: opts.studentId,
			institutionId: opts.institutionId,
		})
		if (!result.ok) return null
		await writeCachedCiaView(supabase, {
			studentId: result.studentId,
			institutionId: result.institutionId,
			registerNumber: result.registerNumber,
			payload: result.view,
		})
		return result.view
	} catch (err) {
		console.error('[cia-view cache] refresh failed for', opts.studentId, err)
		return null
	}
}

/** Remove cached rows for the given learners (used when marks change). */
export async function invalidateStudentCiaCaches(
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
		console.error('[cia-view cache] invalidate failed:', error)
	}
}
