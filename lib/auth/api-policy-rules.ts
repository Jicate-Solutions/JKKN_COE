/**
 * Every API permission rule proxy.ts enforces, in matching order: the
 * hand-written rules first, then the ones generated from the screens.
 *
 * API_POLICY_GENERATED controls the generated set only:
 *   enforce (default) — a request that fails a rule is answered 403
 *   report            — it is let through and logged ("would deny")
 *   off               — the generated rules are ignored
 */

import { API_POLICY, type ApiPolicyRule } from '@/lib/auth/api-policy'
import { GENERATED_API_POLICY } from '@/lib/auth/api-policy.generated'

export type GeneratedPolicyMode = 'enforce' | 'report' | 'off'

export function generatedPolicyMode(): GeneratedPolicyMode {
	const mode = (process.env.API_POLICY_GENERATED || '').toLowerCase()
	return mode === 'report' || mode === 'off' ? mode : 'enforce'
}

const GENERATED: readonly ApiPolicyRule[] = GENERATED_API_POLICY.map((rule) => ({ ...rule, generated: true }))

export const ALL_API_POLICY_RULES: readonly ApiPolicyRule[] = [...API_POLICY, ...GENERATED]

/** The rules in force under the current API_POLICY_GENERATED mode. */
export function activeApiPolicyRules(): readonly ApiPolicyRule[] {
	return generatedPolicyMode() === 'off' ? API_POLICY : ALL_API_POLICY_RULES
}
