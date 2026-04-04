/**
 * Escape special characters in a string for safe use in PostgreSQL ILIKE patterns.
 *
 * Without escaping, user input like '%' or '_' acts as wildcards:
 *   - '%' matches any sequence of characters
 *   - '_' matches any single character
 *   - '\' is the escape character itself
 *
 * This function escapes all three so user input is treated as literal text.
 */
export function escapeLike(input: string): string {
	return input
		.replace(/\\/g, '\\\\')  // Escape backslash first
		.replace(/%/g, '\\%')    // Escape % wildcard
		.replace(/_/g, '\\_')    // Escape _ wildcard
}

/**
 * Validate and sanitize a search query parameter.
 * Returns null if invalid, or the escaped string if valid.
 */
export function sanitizeSearch(input: string | null, maxLength = 100): string | null {
	if (!input || input.trim().length === 0) return null
	const trimmed = input.trim()
	if (trimmed.length > maxLength) return null
	return escapeLike(trimmed)
}
