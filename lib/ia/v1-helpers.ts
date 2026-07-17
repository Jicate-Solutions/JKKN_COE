// Helpers shared by /api/v1/ia/* endpoints.
import type { ExternalApiContext } from '@/types/api-management'

/**
 * Resolve the COE institution for an external API request.
 *
 * NOTE ON MAPPING: MyJKKN has separate SF & aided institutions, but COE collapses
 * both to ONE institution (e.g. institution_code = "CAS"). Callers therefore scope
 * by the COE institution_code, not a MyJKKN institution id. The COE
 * `institutions.myjkkn_institution_ids` array holds the MyJKKN ids that map to it.
 *
 * Precedence:
 *   1. explicit `institution_code` (query/body) — must be within the key's allowed set
 *   2. the key's own institutionCode (if the key is institution-scoped)
 *
 * @returns { id, institution_code } or an { error } string.
 */
export async function resolveInstitutionForKey(
	supabase: any,
	context: ExternalApiContext,
	institutionCode?: string | null
): Promise<{ id: string; institution_code: string } | { error: string }> {
	const code = institutionCode || context.institutionCode || null
	if (!code) return { error: 'institution_code is required' }

	const { data: inst } = await supabase
		.from('institutions')
		.select('id, institution_code')
		.ilike('institution_code', code)
		.maybeSingle()

	if (!inst) return { error: `Institution "${code}" not found` }

	// Enforce key scope when the key is restricted to specific institutions
	if (context.allowedInstitutionIds && context.allowedInstitutionIds.length > 0) {
		if (!context.allowedInstitutionIds.includes(inst.id)) {
			return { error: `API key is not authorised for institution "${code}"` }
		}
	}
	return { id: inst.id, institution_code: inst.institution_code }
}

/** Guard a resolved institutions_id against the key's allowed set. */
export function institutionAllowed(context: ExternalApiContext, institutionsId?: string | null): boolean {
	if (!context.allowedInstitutionIds || context.allowedInstitutionIds.length === 0) return true
	return !!institutionsId && context.allowedInstitutionIds.includes(institutionsId)
}
