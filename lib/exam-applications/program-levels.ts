import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveProgramLevel } from '@/lib/exam-fee/calculate'
import type { ProgramLevel } from '@/lib/exam-fee-catalog'

/**
 * Programme -> UG / PG / MCA tier
 * =====================================================
 * The Exam Application filters offer "All UG" and "All PG" as one click, so every
 * programme option has to carry its tier.
 *
 * The tier cannot be guessed from the code alone - JKKN's MCA code is "PCA",
 * which every UG/PG heuristic reads as plain PG - so the explicit
 * exam_fee_program_levels map is loaded first and the heuristic only fills gaps.
 * This is the same resolution the fee engine uses, so a programme can never be
 * grouped as UG here while being priced as PG.
 *
 * Only the tier map is loaded, not the whole fee rate book: the arrear picker
 * needs the grouping but has no use for rates.
 */
export async function loadProgramLevelMap(
	supabase: SupabaseClient,
	institutions_id: string
): Promise<Map<string, ProgramLevel>> {
	const byProgram = new Map<string, ProgramLevel>()

	const { data, error } = await supabase
		.from('exam_fee_program_levels')
		.select('program_code, program_level')
		.eq('institutions_id', institutions_id)
		.eq('is_active', true)
		.range(0, 9999)

	if (error) {
		// The map is an optional refinement - fall back to the heuristic for every
		// programme rather than failing the filter.
		console.error('[exam-applications] exam_fee_program_levels error:', error.message)
		return byProgram
	}

	for (const row of data || []) {
		if (row.program_code) {
			byProgram.set(String(row.program_code).trim().toUpperCase(), row.program_level as ProgramLevel)
		}
	}

	return byProgram
}

/** The tier for one programme: explicit map first, heuristic second */
export function levelOf(
	programCode: string | null | undefined,
	map: Map<string, ProgramLevel>
): ProgramLevel {
	return resolveProgramLevel(programCode, map)
}

/**
 * Parse a `program_codes=UZO,UCC` query parameter.
 *
 * An empty result means "every programme" - the filters treat no selection and
 * all-selected as the same thing, so a cleared filter never returns nothing.
 */
export function parseProgramCodes(raw: string | null | undefined): string[] {
	return [...new Set(
		String(raw || '')
			.split(',')
			.map(c => c.trim().toUpperCase())
			.filter(c => c && c !== 'ALL')
	)]
}
