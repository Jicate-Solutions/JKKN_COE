import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProgramOption {
	program_code: string
	program_name: string
}

/**
 * Active programmes for one institution.
 *
 * `programs` is unique on (institution_code, program_code), so a bare code is
 * only meaningful within a single institution — every lookup here is scoped.
 */
export async function fetchInstitutionPrograms(
	supabase: SupabaseClient,
	institutionsId: string,
): Promise<ProgramOption[]> {
	const { data, error } = await supabase
		.from('programs')
		.select('program_code, program_name')
		.eq('institutions_id', institutionsId)
		.eq('is_active', true)
		.order('program_code')
		.range(0, 9999)

	if (error) {
		console.error('fetchInstitutionPrograms error:', error)
		return []
	}
	return (data || []) as ProgramOption[]
}

export type ResolveProgramsResult =
	| { ok: true; codes: string[] | null }
	| { ok: false; unknown: string[] }

/**
 * Validates programme codes against the institution's master list and rewrites
 * them to the master's casing.
 *
 * Matching is case-insensitive so an Excel import typing `bca` still resolves,
 * but the stored value is always the canonical spelling — otherwise the same
 * programme would appear under several casings and array overlap filters would
 * miss rows.
 *
 * Returning the unknown codes lets the caller name them; the database trigger
 * is the backstop, not the primary error path.
 */
export async function resolveProgramCodes(
	supabase: SupabaseClient,
	institutionsId: string,
	codes: string[] | null | undefined,
): Promise<ResolveProgramsResult> {
	if (!codes || codes.length === 0) return { ok: true, codes: null }

	const programs = await fetchInstitutionPrograms(supabase, institutionsId)
	const byUpper = new Map(programs.map(p => [p.program_code.toUpperCase(), p.program_code]))

	const unknown = codes.filter(c => !byUpper.has(c.toUpperCase()))
	if (unknown.length > 0) return { ok: false, unknown }

	return { ok: true, codes: codes.map(c => byUpper.get(c.toUpperCase())!) }
}
