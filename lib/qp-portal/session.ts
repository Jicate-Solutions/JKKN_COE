// Examiner-portal session: a signed, httpOnly, SameSite=Strict cookie.
//
// The portal is reached by people who have NO account in COE or MyJKKN — an
// external examiner from another college. They are identified only by the email
// on their `examiners` row, so the session is a short-lived JWT this app signs
// itself, verified server-side on every portal request.
//
// Deliberately NOT a client-decoded token: the existing registration page reads
// the Google JWT in the browser, which is fine for pre-filling a form but must
// never be the basis for releasing a question paper.

import { SignJWT, jwtVerify } from 'jose'
import { OAuth2Client } from 'google-auth-library'
import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import type { QpPortalSession, QpExaminerKind } from '@/types/qp-examiner-assignment'

export const PORTAL_COOKIE = 'examiner_portal_session'
/** Short enough that a walked-away browser stops being a way in. */
export const PORTAL_SESSION_HOURS = 8

const ISSUER = 'jkkn-coe'
const AUDIENCE = 'examiner-portal'

/**
 * Signing key. A dedicated secret is preferred; the service-role key is the
 * fallback so the portal works on an environment that has not added one yet.
 * Both are server-only values — neither is ever sent to the browser.
 */
function secretKey(): Uint8Array {
	const raw =
		process.env.EXAMINER_PORTAL_JWT_SECRET ||
		process.env.SUPABASE_SERVICE_ROLE_KEY ||
		''
	if (!raw) {
		throw new Error(
			'Examiner portal signing secret is missing — set EXAMINER_PORTAL_JWT_SECRET (or SUPABASE_SERVICE_ROLE_KEY).'
		)
	}
	return new TextEncoder().encode(raw)
}

export interface PortalIdentity {
	examinerId: string
	email: string
	name: string
	kind: QpExaminerKind
	via: 'google' | 'otp'
}

export async function signPortalSession(identity: PortalIdentity): Promise<string> {
	const now = Math.floor(Date.now() / 1000)
	return new SignJWT({
		email: identity.email,
		name: identity.name,
		kind: identity.kind,
		via: identity.via,
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(identity.examinerId)
		.setIssuer(ISSUER)
		.setAudience(AUDIENCE)
		.setIssuedAt(now)
		.setExpirationTime(now + PORTAL_SESSION_HOURS * 3600)
		.sign(secretKey())
}

/** Verify the cookie on a request. Returns null for missing, bad or expired. */
export async function readPortalSession(req: NextRequest): Promise<QpPortalSession | null> {
	const token = req.cookies.get(PORTAL_COOKIE)?.value
	if (!token) return null
	try {
		const { payload } = await jwtVerify(token, secretKey(), {
			issuer: ISSUER,
			audience: AUDIENCE,
		})
		if (!payload.sub || typeof payload.email !== 'string') return null
		return {
			sub: payload.sub,
			email: payload.email,
			name: typeof payload.name === 'string' ? payload.name : payload.email,
			kind: payload.kind === 'internal' ? 'internal' : 'external',
			via: payload.via === 'google' ? 'google' : 'otp',
			iat: Number(payload.iat || 0),
			exp: Number(payload.exp || 0),
		}
	} catch {
		// Tampered, expired or signed with a rotated secret — all are "no session".
		return null
	}
}

export function setPortalCookie(res: NextResponse, token: string): NextResponse {
	res.cookies.set(PORTAL_COOKIE, token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		// Strict is what makes this cookie unusable in a cross-site request, which
		// is why the portal routes need no separate CSRF token.
		sameSite: 'strict',
		path: '/',
		maxAge: PORTAL_SESSION_HOURS * 3600,
	})
	return res
}

export function clearPortalCookie(res: NextResponse): NextResponse {
	res.cookies.set(PORTAL_COOKIE, '', {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		path: '/',
		maxAge: 0,
	})
	return res
}

// ── Google verification ─────────────────────────────────────────────────────

let googleClient: OAuth2Client | null = null

/**
 * Verify a Google Identity Services credential server-side and return the
 * verified email. Signature, issuer, audience and expiry are all checked by the
 * library — this is what the browser-side decode in the registration form does
 * not do.
 */
export async function verifyGoogleCredential(
	credential: string
): Promise<{ email: string; name: string; picture?: string } | null> {
	const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
	if (!clientId) {
		console.error('[QP portal] NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set — Google sign-in is unavailable')
		return null
	}
	if (!googleClient) googleClient = new OAuth2Client(clientId)

	try {
		const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId })
		const payload = ticket.getPayload()
		if (!payload?.email || !payload.email_verified) return null
		return {
			email: payload.email.toLowerCase().trim(),
			name: payload.name || payload.email,
			picture: payload.picture,
		}
	} catch (e) {
		console.error('[QP portal] Google credential verification failed:', e)
		return null
	}
}
