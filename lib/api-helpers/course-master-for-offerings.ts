import type { SupabaseClient } from '@supabase/supabase-js'

export interface CourseMasterBase {
	id: string
	course_code: string
}

export interface OfferingRef {
	course_id?: string | null
	course_code?: string | null
}

const CHUNK = 200

/**
 * Load the course master rows behind a set of course offerings and resolve each
 * offering to its master row by UUID.
 *
 * `course_offerings.course_code` is a denormalised copy of the master code. It can
 * lag a rename and, while two codes are being swapped, can even belong to a
 * different course for a while. Question papers and examiner appointments that
 * were linked through that string ended up on the wrong course (EE25C04 /
 * EE25C10, September 2026). `course_offerings.course_id` is the stable link, so
 * `masterFor()` consults it first and falls back to the code only for offerings
 * that carry no course_id.
 *
 * `select` must include `id` and `course_code`.
 */
export async function loadCourseMaster<T extends CourseMasterBase = CourseMasterBase & Record<string, any>>(
	supabase: SupabaseClient,
	institutionsId: string,
	offerings: OfferingRef[],
	select: string,
): Promise<{ rows: T[]; masterFor: (off: OfferingRef) => T | undefined }> {
	const ids = [...new Set(offerings.map(o => o.course_id).filter((v): v is string => Boolean(v)))]
	const codes = [...new Set(offerings.map(o => o.course_code).filter((v): v is string => Boolean(v)))]

	const byId = new Map<string, T>()
	for (let i = 0; i < ids.length; i += CHUNK) {
		const { data } = await supabase
			.from('courses')
			.select(select)
			.eq('institutions_id', institutionsId)
			.in('id', ids.slice(i, i + CHUNK))
		for (const row of (data ?? []) as unknown as T[]) byId.set(row.id, row)
	}
	for (let i = 0; i < codes.length; i += CHUNK) {
		const { data } = await supabase
			.from('courses')
			.select(select)
			.eq('institutions_id', institutionsId)
			.in('course_code', codes.slice(i, i + CHUNK))
		for (const row of (data ?? []) as unknown as T[]) if (!byId.has(row.id)) byId.set(row.id, row)
	}

	const byCode = new Map<string, T>()
	for (const row of byId.values()) byCode.set(row.course_code, row)

	return {
		rows: [...byId.values()],
		masterFor: off =>
			(off.course_id ? byId.get(off.course_id) : undefined)
			?? (off.course_code ? byCode.get(off.course_code) : undefined),
	}
}
