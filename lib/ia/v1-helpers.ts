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

// ─────────────────────────────────────────────────────────────────────────────
// End-semester papers are OUT OF SCOPE for /api/v1.
//
// /api/v1/ia/* exists so MyJKKN staff can author their own INTERNAL (CIA) papers.
// An end-semester paper is written by an appointed question-paper setter inside
// the examiner portal and is confidential until the exam — it must never be
// listed, read, edited or rendered through an external API key.
//
// The marker is ia_paper_templates.exam_scope ('cia' | 'ese' | 'all'); a paper
// inherits it from the template it was built from.
// ─────────────────────────────────────────────────────────────────────────────

/** Template scopes an external API key may see. */
export const V1_ALLOWED_SCOPES = ['cia', 'all'] as const

export const ESE_NOT_AVAILABLE =
	'End-semester question papers are not available on this API — they are authored by the appointed examiner in the question-paper setter portal.'

/** Ids of this institution's ESE-only templates (empty array = nothing to hide). */
export async function eseTemplateIds(supabase: any, institutionsId: string): Promise<string[]> {
	const { data } = await supabase
		.from('ia_paper_templates')
		.select('id')
		.eq('institutions_id', institutionsId)
		.eq('exam_scope', 'ese')
	return (data || []).map((t: any) => t.id)
}

/**
 * Drop ESE papers from a question-papers query.
 * NOTE: a plain `not.in` would also drop rows whose template_id is NULL (SQL
 * three-valued logic), so NULL is allowed back explicitly — those are legacy CIA
 * papers with no template.
 */
export function excludeEsePapers(query: any, eseIds: string[]) {
	if (eseIds.length === 0) return query
	return query.or(`template_id.is.null,template_id.not.in.(${eseIds.join(',')})`)
}

/** Is this paper built from an ESE template? Used to 404 single-paper routes. */
export async function paperIsEse(supabase: any, paper: any): Promise<boolean> {
	if (!paper?.template_id) return false
	const { data } = await supabase
		.from('ia_paper_templates')
		.select('exam_scope')
		.eq('id', paper.template_id)
		.maybeSingle()
	return data?.exam_scope === 'ese'
}
