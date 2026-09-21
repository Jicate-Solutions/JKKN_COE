import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Program and semester dropdowns for the Generate Register Number page.
 *
 * Both come from `course_mapping`, the same source the bulk exam-registration
 * page uses. The local `programs` / `semesters` mirror tables are not reliably
 * populated per institution, so querying them returns empty dropdowns.
 *
 * course_mapping is also the right source for the semester specifically: it is
 * where /api/myjkkn/learner-profiles resolves a learner's semester_id from, so
 * the id handed back here is the same one learner records carry.
 *
 *   GET ?type=programs&institution_code=CAS
 *   GET ?type=semesters&institution_code=CAS&program_code=BCS
 */

/**
 * Page through a course_mapping selection.
 *
 * A single .range(0, 9999) is capped server-side and silently truncates, which
 * would drop whole programs off the dropdown. Ordering is by `id` because it is
 * unique — paging on a non-unique key duplicates and skips rows across pages.
 */
async function fetchAllMappings(
	supabase: ReturnType<typeof getSupabaseServer>,
	columns: string,
	filters: { institution_code: string; program_code?: string }
) {
	// Deliberately NOT filtered by is_active. Older course_mapping rows carry a
	// NULL is_active, and `.eq('is_active', true)` drops NULLs - which would empty
	// the dropdown entirely. A retired program showing up is recoverable; an empty
	// dropdown is not.
	const PAGE = 1000
	const MAX_ROWS = 100000
	const rows: any[] = []
	let offset = 0

	while (rows.length < MAX_ROWS) {
		let query = supabase
			.from('course_mapping')
			.select(columns)
			.eq('institution_code', filters.institution_code)
			.order('id', { ascending: true })
			.range(offset, offset + PAGE - 1)

		if (filters.program_code) query = query.eq('program_code', filters.program_code)

		const { data, error } = await query
		if (error) throw error
		if (!data || data.length === 0) break

		rows.push(...data)
		if (data.length < PAGE) break
		offset += PAGE
	}

	return rows
}

/** Program display names, keyed by program code, from the MyJKKN reference cache. */
async function fetchProgramNames(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionCode: string
) {
	const names = new Map<string, { program_name: string; program_order: number }>()

	const { data, error } = await supabase
		.from('myjkkn_reference_cache')
		.select('entity_data, entity_name')
		.eq('entity_type', 'program')
		.eq('is_active', true)
		.range(0, 9999)

	if (error) {
		// Names are cosmetic — the dropdown still works with bare codes.
		console.warn('[register-numbers/lookups] program name cache unavailable:', error.message)
		return names
	}

	for (const row of data || []) {
		const entity = (row as any).entity_data || {}
		// Cache rows carry every institution; keep the ones for this one.
		if (institutionCode && entity?.institution?.counselling_code !== institutionCode) continue
		const code = entity.program_id || entity.program_code || ''
		if (!code || names.has(code)) continue
		names.set(code, {
			program_name: (row as any).entity_name || entity.program_name || code,
			program_order: entity.program_order ?? 999,
		})
	}

	return names
}

/** '<PROG>-6' / 'SEMESTER IV' / '4' -> 4 */
function parseSemesterNumber(value: string): number {
	const roman = value.match(/(?:SEMESTER|SEM)\s*([IVXLC]+)/i)
	if (roman) {
		const map: Record<string, number> = {
			I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
		}
		const found = map[roman[1].toUpperCase()]
		if (found) return found
	}
	const digits = value.match(/(\d+)/)
	return digits ? parseInt(digits[1], 10) : 0
}

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const type = searchParams.get('type')
		const institutionCode = searchParams.get('institution_code') || ''
		const programCode = searchParams.get('program_code') || ''

		if (!type || !['programs', 'semesters'].includes(type)) {
			return NextResponse.json({ error: 'type must be "programs" or "semesters"' }, { status: 400 })
		}
		if (!institutionCode) {
			return NextResponse.json({ error: 'institution_code is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		if (type === 'programs') {
			const [rows, names] = await Promise.all([
				fetchAllMappings(supabase, 'id, program_code', { institution_code: institutionCode }),
				fetchProgramNames(supabase, institutionCode),
			])

			// Deduplicate by CODE — course_mapping holds one row per course, so a
			// program repeats across every course, regulation and semester.
			const seen = new Set<string>()
			const programs: { program_code: string; program_name: string; program_order: number }[] = []
			for (const row of rows) {
				const code = row.program_code
				if (!code || seen.has(code)) continue
				seen.add(code)
				const meta = names.get(code)
				programs.push({
					program_code: code,
					program_name: meta?.program_name || code,
					program_order: meta?.program_order ?? 999,
				})
			}

			programs.sort(
				(a, b) => a.program_order - b.program_order || a.program_code.localeCompare(b.program_code)
			)

			console.log(
				`[register-numbers/lookups] programs for ${institutionCode}: ${programs.length} (from ${rows.length} mappings)`
			)
			return NextResponse.json(programs)
		}

		// type === 'semesters'
		if (!programCode) {
			return NextResponse.json({ error: 'program_code is required for semesters' }, { status: 400 })
		}

		const rows = await fetchAllMappings(supabase, 'id, semester_id, semester_code', {
			institution_code: institutionCode,
			program_code: programCode,
		})

		// Deduplicate by semester_code — the same semester recurs for every course
		// and regulation. semester_id can be null on older mapping rows, so the code
		// is the key and the id is carried along when present.
		const seen = new Set<string>()
		const semesters: { semester_id: string | null; semester_code: string; semester_number: number }[] = []
		for (const row of rows) {
			const code = row.semester_code
			if (!code || seen.has(code)) continue
			seen.add(code)
			semesters.push({
				semester_id: row.semester_id || null,
				semester_code: code,
				semester_number: parseSemesterNumber(code),
			})
		}

		semesters.sort(
			(a, b) => a.semester_number - b.semester_number || a.semester_code.localeCompare(b.semester_code)
		)

		console.log(
			`[register-numbers/lookups] semesters for ${institutionCode}/${programCode}: ${semesters.length} (from ${rows.length} mappings)`
		)
		return NextResponse.json(semesters)
	} catch (error) {
		console.error('[register-numbers/lookups] error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		)
	}
}
