/**
 * API key validation — looks up the key, checks status/expiry,
 * verifies the secret hash, checks the parent application status,
 * and updates last_used_at (non-blocking).
 */

import { getSupabaseServer } from '@/lib/supabase-server'
import { verifySecretKey } from './key-generator'

export interface ValidatedKey {
	appId: string
	appName: string
	accessKeyId: string
	allowedDomains: string[]
	institutionsId: string | null
	institutionCode: string | null
}

export interface KeyValidationError {
	error: string
	code: string
	status: number
}

export type KeyValidationResult =
	| { success: true; data: ValidatedKey }
	| { success: false; error: KeyValidationError }

/**
 * Validates an API key pair (access key ID + secret key).
 *
 * Steps:
 * 1. Look up the key by access_key_id
 * 2. Check key status is 'active'
 * 3. Check key has not expired
 * 4. Verify secret key hash
 * 5. Check parent application status is 'active'
 * 6. Update last_used_at (non-blocking, fire-and-forget)
 */
export async function validateApiKey(
	accessKeyId: string,
	secretKey: string,
): Promise<KeyValidationResult> {
	const supabase = getSupabaseServer()

	// 1. Look up key with joined application data
	const { data: keyRecord, error: lookupError } = await supabase
		.from('api_keys')
		.select(`
			id,
			app_id,
			access_key_id,
			secret_key_hash,
			status,
			expires_at,
			api_applications (
				id,
				name,
				status,
				allowed_domains,
				institutions_id,
				institution_code
			)
		`)
		.eq('access_key_id', accessKeyId)
		.single()

	if (lookupError || !keyRecord) {
		return {
			success: false,
			error: {
				error: 'Invalid API key',
				code: 'INVALID_KEY',
				status: 401,
			},
		}
	}

	// 2. Check key status
	if (keyRecord.status !== 'active') {
		return {
			success: false,
			error: {
				error: `API key is ${keyRecord.status}`,
				code: 'KEY_INACTIVE',
				status: 401,
			},
		}
	}

	// 3. Check expiry
	if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
		// Mark as expired (non-blocking)
		supabase
			.from('api_keys')
			.update({ status: 'expired' })
			.eq('id', keyRecord.id)
			.then(() => { /* fire-and-forget */ })

		return {
			success: false,
			error: {
				error: 'API key has expired',
				code: 'KEY_EXPIRED',
				status: 401,
			},
		}
	}

	// 4. Verify secret key hash
	const isValid = await verifySecretKey(secretKey, keyRecord.secret_key_hash)
	if (!isValid) {
		return {
			success: false,
			error: {
				error: 'Invalid API key',
				code: 'INVALID_KEY',
				status: 401,
			},
		}
	}

	// 5. Check application status
	const app = keyRecord.api_applications as unknown as {
		id: string
		name: string
		status: string
		allowed_domains: string[]
		institutions_id: string | null
		institution_code: string | null
	}

	if (!app || app.status !== 'active') {
		return {
			success: false,
			error: {
				error: 'Application is suspended',
				code: 'APP_SUSPENDED',
				status: 403,
			},
		}
	}

	// 6. Update last_used_at (non-blocking)
	supabase
		.from('api_keys')
		.update({ last_used_at: new Date().toISOString() })
		.eq('id', keyRecord.id)
		.then(() => { /* fire-and-forget */ })

	return {
		success: true,
		data: {
			appId: app.id,
			appName: app.name,
			accessKeyId: keyRecord.access_key_id,
			allowedDomains: app.allowed_domains || [],
			institutionsId: app.institutions_id,
			institutionCode: app.institution_code,
		},
	}
}
