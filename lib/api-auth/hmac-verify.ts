/**
 * HMAC-SHA256 Request Signing Verification for API v1.
 *
 * Provides non-repudiation: proves the request was sent by someone who
 * possesses the secret key, AND that the request body hasn't been tampered
 * with in transit.
 *
 * Clients sign requests by computing:
 *   HMAC-SHA256(secret_key, timestamp + method + path + body_hash)
 *
 * Required headers:
 *   X-Signature:  HMAC hex string
 *   X-Timestamp:  Unix timestamp (seconds) when request was signed
 *
 * The server recomputes the HMAC using the stored secret_key_hash
 * and compares signatures. Requests older than 5 minutes are rejected
 * to prevent replay attacks.
 */

const HEADER_SIGNATURE = 'x-signature'
const HEADER_TIMESTAMP = 'x-timestamp'
const MAX_AGE_SECONDS = 300 // 5-minute window to prevent replay attacks

export interface HmacVerifyResult {
	valid: boolean
	error?: string
	code?: string
}

/**
 * Compute HMAC-SHA256 using Web Crypto API (Edge Runtime compatible).
 */
async function computeHmac(key: string, message: string): Promise<string> {
	const encoder = new TextEncoder()
	const keyData = encoder.encode(key)
	const msgData = encoder.encode(message)

	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		keyData,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	)

	const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
	return Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

/**
 * Timing-safe string comparison.
 */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false
	const encoder = new TextEncoder()
	const bufA = encoder.encode(a)
	const bufB = encoder.encode(b)
	let result = 0
	for (let i = 0; i < bufA.length; i++) {
		result |= bufA[i] ^ bufB[i]
	}
	return result === 0
}

/**
 * Verify an HMAC-signed request.
 *
 * @param request - The incoming request
 * @param secretKey - The plain-text secret key (from validation step)
 * @returns HmacVerifyResult indicating validity or specific error
 */
export async function verifyRequestSignature(
	request: Request,
	secretKey: string,
): Promise<HmacVerifyResult> {
	const signature = request.headers.get(HEADER_SIGNATURE)
	const timestamp = request.headers.get(HEADER_TIMESTAMP)

	// If no signature headers present, HMAC signing is optional (backwards compatible)
	// Clients that want stronger security opt in by sending X-Signature + X-Timestamp
	if (!signature && !timestamp) {
		return { valid: true } // Allow unsigned requests for backwards compatibility
	}

	// If one header is present without the other, that's an error
	if (!signature || !timestamp) {
		return {
			valid: false,
			error: 'Both X-Signature and X-Timestamp headers are required when using request signing.',
			code: 'INCOMPLETE_SIGNATURE',
		}
	}

	// Validate timestamp format
	const ts = parseInt(timestamp, 10)
	if (isNaN(ts)) {
		return {
			valid: false,
			error: 'X-Timestamp must be a Unix timestamp in seconds.',
			code: 'INVALID_TIMESTAMP',
		}
	}

	// Reject stale requests (replay attack prevention)
	const now = Math.floor(Date.now() / 1000)
	const age = Math.abs(now - ts)
	if (age > MAX_AGE_SECONDS) {
		return {
			valid: false,
			error: `Request signature expired. Timestamp is ${age}s old (max ${MAX_AGE_SECONDS}s).`,
			code: 'SIGNATURE_EXPIRED',
		}
	}

	// Build the signing string: timestamp + method + path + body_hash
	const url = new URL(request.url)
	const method = request.method.toUpperCase()
	const path = url.pathname + url.search

	// Hash the body (empty string for GET/DELETE)
	let bodyHash = ''
	if (request.body) {
		try {
			const bodyText = await request.clone().text()
			if (bodyText) {
				const encoder = new TextEncoder()
				const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(bodyText))
				bodyHash = Array.from(new Uint8Array(hashBuffer))
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('')
			}
		} catch {
			// If body can't be read, use empty string
		}
	}

	const signingString = `${timestamp}.${method}.${path}.${bodyHash}`

	// Compute expected HMAC
	const expectedSignature = await computeHmac(secretKey, signingString)

	// Timing-safe comparison
	if (!timingSafeEqual(signature.toLowerCase(), expectedSignature.toLowerCase())) {
		return {
			valid: false,
			error: 'Request signature does not match. Verify your signing implementation.',
			code: 'SIGNATURE_MISMATCH',
		}
	}

	return { valid: true }
}
