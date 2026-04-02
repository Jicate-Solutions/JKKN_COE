/**
 * Cryptographic utilities for API key management.
 * Uses Web Crypto API for Edge Runtime compatibility.
 */

/**
 * Computes a SHA-256 hash of the input string.
 * Returns the hash as a lowercase hex string.
 */
export async function sha256Hash(input: string): Promise<string> {
	const encoder = new TextEncoder()
	const data = encoder.encode(input)
	const hashBuffer = await crypto.subtle.digest('SHA-256', data)
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generates a cryptographically secure random string of the specified length.
 * Uses only alphanumeric characters (a-z, A-Z, 0-9).
 */
export function generateSecureRandom(length: number): string {
	const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	const values = new Uint8Array(length)
	crypto.getRandomValues(values)
	let result = ''
	for (let i = 0; i < length; i++) {
		result += charset[values[i] % charset.length]
	}
	return result
}
