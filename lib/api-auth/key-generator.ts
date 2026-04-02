/**
 * API key pair generation and verification.
 *
 * Key format:
 *   Access Key ID: ak_coe_ + 24 alphanumeric characters
 *   Secret Key:    sk_coe_ + 48 alphanumeric characters
 *
 * The secret key is never stored — only its SHA-256 hash is persisted.
 */

import { generateSecureRandom, sha256Hash } from './crypto'

export interface GeneratedKeyPair {
	accessKeyId: string
	secretKey: string
	secretKeyHash: string
}

const ACCESS_KEY_PREFIX = 'ak_coe_'
const SECRET_KEY_PREFIX = 'sk_coe_'
const ACCESS_KEY_RANDOM_LENGTH = 24
const SECRET_KEY_RANDOM_LENGTH = 48

/**
 * Generates a new API key pair.
 * Returns the access key ID, plain-text secret key, and the secret key hash.
 * The plain-text secret key must be shown to the user exactly once — it cannot be recovered.
 */
export async function generateApiKeyPair(): Promise<GeneratedKeyPair> {
	const accessKeyId = ACCESS_KEY_PREFIX + generateSecureRandom(ACCESS_KEY_RANDOM_LENGTH)
	const secretKey = SECRET_KEY_PREFIX + generateSecureRandom(SECRET_KEY_RANDOM_LENGTH)
	const secretKeyHash = await sha256Hash(secretKey)

	return {
		accessKeyId,
		secretKey,
		secretKeyHash,
	}
}

/**
 * Verifies a plain-text secret key against a stored hash.
 * Returns true if the key matches.
 */
export async function verifySecretKey(
	secretKey: string,
	storedHash: string,
): Promise<boolean> {
	const hash = await sha256Hash(secretKey)
	return hash === storedHash
}
