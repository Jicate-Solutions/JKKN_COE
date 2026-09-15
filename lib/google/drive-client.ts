/**
 * Shared Google Drive client (ported from MyJKKN lib/google/drive-client.ts).
 *
 * Two auth paths, tried in this order:
 *
 * Path A — OAuth2 with refresh token (personal Gmail):
 *   GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET,
 *   GOOGLE_DRIVE_REFRESH_TOKEN. Files are owned by that Gmail user.
 *
 * Path B — JWT service account (Google Workspace / Shared Drive):
 *   GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY, and optionally
 *   GOOGLE_DRIVE_IMPERSONATE_SUBJECT (domain-wide delegation). Files are owned
 *   by the impersonated user / Shared Drive — a bare service account on a
 *   personal Gmail has no storage quota and fails with 403.
 *
 * Both paths need GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID. Node runtime only —
 * every API route that imports this must declare `export const runtime = 'nodejs'`.
 */
import { google } from 'googleapis'

function drivePrivateKey(): string {
	let key = process.env.GOOGLE_DRIVE_PRIVATE_KEY ?? ''
	if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
		key = key.slice(1, -1)
	}
	return key.replace(/\\n/g, '\n').trim()
}

function hasOAuth2Credentials(): boolean {
	return !!(
		process.env.GOOGLE_DRIVE_REFRESH_TOKEN &&
		process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID &&
		process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
	)
}

/** True when enough env is present for one of the two auth paths. Callers answer 503 otherwise. */
export function isDriveConfigured(): boolean {
	if (!process.env.GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID) return false
	if (hasOAuth2Credentials()) return true
	return !!(process.env.GOOGLE_DRIVE_CLIENT_EMAIL && drivePrivateKey().includes('PRIVATE KEY'))
}

export type DriveClient = ReturnType<typeof buildDriveClient>

// One client per server process. The auth object inside caches its access
// token until expiry, so reusing it saves the ~0.7 s token exchange that a
// fresh JWT paid on EVERY upload, figure view and PDF render. Keyed by the
// credentials so a changed .env (or a test) gets a fresh client.
let cached: { key: string; client: DriveClient } | null = null

function credentialsKey(): string {
	return [
		process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
		process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
		process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
		process.env.GOOGLE_DRIVE_IMPERSONATE_SUBJECT,
		drivePrivateKey().slice(-40),
	].join('|')
}

export function createDriveClient(): DriveClient {
	const key = credentialsKey()
	if (cached && cached.key === key) return cached.client
	const client = buildDriveClient()
	cached = { key, client }
	return client
}

function buildDriveClient() {
	if (hasOAuth2Credentials()) {
		const oauth2 = new google.auth.OAuth2(
			process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
			process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
		)
		oauth2.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
		return google.drive({ version: 'v3', auth: oauth2 })
	}

	const auth = new google.auth.JWT({
		email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
		key: drivePrivateKey(),
		scopes: ['https://www.googleapis.com/auth/drive'],
		subject: process.env.GOOGLE_DRIVE_IMPERSONATE_SUBJECT || undefined,
	})
	return google.drive({ version: 'v3', auth })
}
