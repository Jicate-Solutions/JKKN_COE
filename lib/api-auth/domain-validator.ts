/**
 * Domain/origin validation for API requests.
 *
 * Supports:
 * - Exact match:    "https://app.example.com"
 * - Wildcard match: "*.example.com" matches "app.example.com", "sub.app.example.com"
 * - Empty allowed_domains or missing Origin header → allow (server-to-server)
 */

export interface DomainValidationResult {
	allowed: boolean
	reason?: string
}

/**
 * Validates whether the request origin is permitted by the application's allowed domains list.
 *
 * Rules:
 * - If allowedDomains is empty or not configured → allow (no restrictions)
 * - If there is no origin header → allow (server-to-server requests)
 * - Otherwise, the origin must match at least one allowed domain
 */
export function validateDomain(
	origin: string | null | undefined,
	allowedDomains: string[],
): DomainValidationResult {
	// No domain restrictions configured → allow all
	if (!allowedDomains || allowedDomains.length === 0) {
		return { allowed: true }
	}

	// No origin header (server-to-server) → allow
	if (!origin) {
		return { allowed: true }
	}

	// Extract hostname from origin URL
	let hostname: string
	try {
		const url = new URL(origin)
		hostname = url.hostname
	} catch {
		// If origin is already a hostname (no protocol), use as-is
		hostname = origin
	}

	for (const domain of allowedDomains) {
		if (matchDomain(hostname, domain)) {
			return { allowed: true }
		}
	}

	return {
		allowed: false,
		reason: `Origin "${origin}" is not in the allowed domains list`,
	}
}

/**
 * Matches a hostname against a domain pattern.
 * Supports exact match and wildcard prefix (*.example.com).
 */
function matchDomain(hostname: string, pattern: string): boolean {
	// Normalize: strip protocol if present in pattern
	let normalizedPattern = pattern
	try {
		const url = new URL(pattern)
		normalizedPattern = url.hostname
	} catch {
		// Already a hostname/pattern
	}

	const lowerHostname = hostname.toLowerCase()
	const lowerPattern = normalizedPattern.toLowerCase()

	// Exact match
	if (lowerHostname === lowerPattern) {
		return true
	}

	// Wildcard match: *.example.com
	if (lowerPattern.startsWith('*.')) {
		const suffix = lowerPattern.slice(1) // ".example.com"
		return lowerHostname.endsWith(suffix) && lowerHostname.length > suffix.length
	}

	return false
}
