import type { SupabaseClient } from '@supabase/supabase-js'
import type { CourseCodeCascade } from '@/types/courses'

/** Keep `.in()` lists short — long UUID lists get truncated in the GET/PATCH URL. */
const IN_CHUNK = 100
const PAGE = 1000

/**
 * Decide what a code that mirrors `course_code` (display_code / qp_code) should
 * become after the course code is renamed from `oldCode` to `newCode`.
 *
 * - `incoming`  — the value sent in the request body (undefined when not sent)
 * - `existing`  — the value currently stored on the row
 *
 * A mirror that is empty or still equals the OLD code follows the new code.
 * A deliberately different value is left alone (returns undefined = don't touch).
 *
 * The same rule is enforced in the database by trg_courses_mirror_codes
 * (migration 20260925_course_code_cascade_triggers.sql); this copy keeps the
 * API response and audit log accurate and covers databases without the trigger.
 */
export function mirroredCodeAfterRename(
	incoming: unknown,
	existing: unknown,
	oldCode: string,
	newCode: string,
): string | undefined {
	const effective = incoming !== undefined ? incoming : existing
	const value = effective === null || effective === undefined ? '' : String(effective).trim()
	return value === '' || value === oldCode ? newCode : undefined
}

function chunks<T>(items: T[], size: number): T[][] {
	const out: T[][] = []
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
	return out
}

/**
 * Offerings whose results are already out must keep the code they were examined
 * under: an offering is FROZEN when its examination session is 'Results Declared'
 * or any of its final_marks rows is Published or locked. Mirrors
 * public.course_offering_is_frozen() in the trigger migration.
 */
async function findFrozenOfferings(
	supabase: SupabaseClient,
	offerings: Array<{ id: string; examination_session_id: string | null }>,
	declaredSessionIds: Set<string>,
	errors: string[],
): Promise<Set<string>> {
	const frozen = new Set<string>()
	for (const offering of offerings) {
		if (offering.examination_session_id && declaredSessionIds.has(offering.examination_session_id)) frozen.add(offering.id)
	}
	for (const chunk of chunks(offerings.map(o => o.id), IN_CHUNK)) {
		const { data, error } = await supabase
			.from('final_marks')
			.select('course_offering_id')
			.in('course_offering_id', chunk)
			.or('result_status.eq.Published,is_locked.eq.true')
			.range(0, PAGE - 1)
		if (error) {
			errors.push(`final_marks: ${error.message}`)
			continue
		}
		for (const row of data ?? []) frozen.add(String(row.course_offering_id))
	}
	return frozen
}

async function declaredSessions(supabase: SupabaseClient, errors: string[]): Promise<Set<string>> {
	const { data, error } = await supabase
		.from('examination_sessions')
		.select('id')
		.eq('session_status', 'Results Declared')
	if (error) errors.push(`examination_sessions: ${error.message}`)
	return new Set((data ?? []).map(row => String(row.id)))
}

/**
 * Report and, where still needed, apply the propagation of a `courses.course_code`
 * rename to the tables that denormalise it.
 *
 * The authoritative cascade is the database trigger chain installed by
 * migration 20260925_course_code_cascade_triggers.sql (courses → course_mapping,
 * open course_offerings, question papers and examiner appointments by course_id;
 * course_offerings → exam_registrations by course_offering_id). It runs inside
 * the same transaction as the courses UPDATE, so by the time this helper runs the
 * dependent rows normally already carry the new code. This helper therefore:
 *   1. counts the rows linked to the course (what the UI reports),
 *   2. leaves FROZEN offerings (results declared / published / locked) and their
 *      registrations and papers untouched, reporting them as "kept", and
 *   3. rewrites only open rows that still carry a different code — a no-op when
 *      the trigger is installed, a safety net when it is not.
 *
 * Rows are matched by the course UUID, never by the old code string (the same
 * code can be carried by duplicate master rows). exam_registrations has no
 * course_id column; all statuses are covered and the Approved share is reported.
 *
 * Call this AFTER the courses row has been updated successfully. Failures are
 * collected in `errors` rather than thrown.
 */
export async function cascadeCourseCodeChange(
	supabase: SupabaseClient,
	courseId: string,
	oldCode: string,
	newCode: string,
): Promise<CourseCodeCascade> {
	const result: CourseCodeCascade = {
		old_code: oldCode,
		new_code: newCode,
		course_mapping: 0,
		course_offerings: 0,
		course_offerings_kept: 0,
		exam_registrations: 0,
		exam_registrations_approved: 0,
		exam_registrations_kept: 0,
		question_papers: 0,
		errors: [],
	}
	const updated_at = new Date().toISOString()

	// 1. course_mapping — curriculum-level, always follows the master
	{
		const { count, error } = await supabase
			.from('course_mapping')
			.select('id', { count: 'exact', head: true })
			.eq('course_id', courseId)
		if (error) result.errors.push(`course_mapping (count): ${error.message}`)
		else result.course_mapping = count ?? 0

		const { error: patchError } = await supabase
			.from('course_mapping')
			.update({ course_code: newCode, updated_at })
			.eq('course_id', courseId)
			.neq('course_code', newCode)
		if (patchError) result.errors.push(`course_mapping: ${patchError.message}`)
	}

	// 2. course_offerings — split into open / frozen
	const offerings: Array<{ id: string; examination_session_id: string | null }> = []
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await supabase
			.from('course_offerings')
			.select('id, examination_session_id')
			.eq('course_id', courseId)
			.order('id')
			.range(from, from + PAGE - 1)
		if (error) {
			result.errors.push(`course_offerings (lookup): ${error.message}`)
			break
		}
		for (const row of data ?? []) {
			offerings.push({ id: String(row.id), examination_session_id: row.examination_session_id ? String(row.examination_session_id) : null })
		}
		if (!data || data.length < PAGE) break
	}

	const declared = await declaredSessions(supabase, result.errors)
	const frozen = await findFrozenOfferings(supabase, offerings, declared, result.errors)
	const openIds = offerings.filter(o => !frozen.has(o.id)).map(o => o.id)
	const frozenIds = offerings.filter(o => frozen.has(o.id)).map(o => o.id)
	result.course_offerings = openIds.length
	result.course_offerings_kept = frozenIds.length

	for (const chunk of chunks(openIds, IN_CHUNK)) {
		const { error } = await supabase
			.from('course_offerings')
			.update({ course_code: newCode, updated_at })
			.in('id', chunk)
			.neq('course_code', newCode)
		if (error) result.errors.push(`course_offerings: ${error.message}`)
	}

	// 3. exam_registrations of OPEN offerings (all statuses), chunked by offering id
	for (const chunk of chunks(openIds, IN_CHUNK)) {
		const { count: total, error: countError } = await supabase
			.from('exam_registrations')
			.select('id', { count: 'exact', head: true })
			.in('course_offering_id', chunk)
		if (countError) result.errors.push(`exam_registrations (count): ${countError.message}`)
		else result.exam_registrations += total ?? 0

		const { count: approved } = await supabase
			.from('exam_registrations')
			.select('id', { count: 'exact', head: true })
			.in('course_offering_id', chunk)
			.eq('registration_status', 'Approved')
		result.exam_registrations_approved += approved ?? 0

		const { error: patchError } = await supabase
			.from('exam_registrations')
			.update({ course_code: newCode, updated_at })
			.in('course_offering_id', chunk)
			.neq('course_code', newCode)
		if (patchError) result.errors.push(`exam_registrations: ${patchError.message}`)
	}

	// 4. registrations of FROZEN offerings — counted only, never written
	for (const chunk of chunks(frozenIds, IN_CHUNK)) {
		const { count, error } = await supabase
			.from('exam_registrations')
			.select('id', { count: 'exact', head: true })
			.in('course_offering_id', chunk)
		if (error) result.errors.push(`exam_registrations (kept count): ${error.message}`)
		else result.exam_registrations_kept += count ?? 0
	}

	// 5. question papers (ESE + internal) by course_id, skipping frozen offerings;
	//    examiner appointments by course_id, skipping sessions with declared results
	for (const table of ['ese_question_papers', 'ia_question_papers'] as const) {
		const { data, error } = await supabase
			.from(table)
			.select('id, course_offering_id, course_code')
			.eq('course_id', courseId)
			.range(0, PAGE - 1)
		if (error) {
			result.errors.push(`${table}: ${error.message}`)
			continue
		}
		const open = (data ?? []).filter(row => !row.course_offering_id || !frozen.has(String(row.course_offering_id)))
		result.question_papers += open.length
		const stale = open.filter(row => row.course_code !== newCode).map(row => String(row.id))
		for (const chunk of chunks(stale, IN_CHUNK)) {
			const { error: patchError } = await supabase
				.from(table)
				.update({ course_code: newCode, updated_at })
				.in('id', chunk)
			if (patchError) result.errors.push(`${table}: ${patchError.message}`)
		}
	}
	{
		const { data, error } = await supabase
			.from('ia_qp_assignments')
			.select('id, examination_session_id, course_code')
			.eq('course_id', courseId)
			.range(0, PAGE - 1)
		if (error) result.errors.push(`ia_qp_assignments: ${error.message}`)
		else {
			const open = (data ?? []).filter(row => !row.examination_session_id || !declared.has(String(row.examination_session_id)))
			result.question_papers += open.length
			const stale = open.filter(row => row.course_code !== newCode).map(row => String(row.id))
			for (const chunk of chunks(stale, IN_CHUNK)) {
				const { error: patchError } = await supabase
					.from('ia_qp_assignments')
					.update({ course_code: newCode, updated_at })
					.in('id', chunk)
				if (patchError) result.errors.push(`ia_qp_assignments: ${patchError.message}`)
			}
		}
	}

	return result
}
