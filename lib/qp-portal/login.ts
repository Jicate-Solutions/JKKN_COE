// Turning a verified e-mail address into a portal session.
//
// Both sign-in routes (Google and OTP) end here, so the rules that decide who
// may enter the portal are written once:
//
//   • the address must exist in `examiners` (the panel is the register of who
//     may set papers — the portal never creates an account)
//   • that examiner must be ACTIVE
//   • they must hold at least one assignment, or the portal has nothing to show
//     and they are pointed back at the registration form instead

import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomInt, timingSafeEqual } from 'crypto'
import { getSupabaseServer } from '@/lib/supabase-server'
import { signPortalSession, setPortalCookie } from './session'
import { logAccess } from './guard'
import type { QpExaminerKind } from '@/types/qp-examiner-assignment'

export interface LoginOutcome {
	response: NextResponse
}

/**
 * Complete a sign-in for a verified address. `via` records which method proved
 * the address, and is stamped on every subsequent log line for the session.
 */
export async function completeLogin(
	req: NextRequest,
	email: string,
	via: 'google' | 'otp',
	fallbackName?: string
): Promise<NextResponse> {
	const supabase = getSupabaseServer()
	const normalized = email.toLowerCase().trim()

	const { data: examiner, error } = await supabase
		.from('examiners')
		.select('id, full_name, email, status, is_internal, institution_id')
		.eq('email', normalized)
		.maybeSingle()

	if (error) {
		console.error('[QP portal] login lookup failed:', error.message)
		return NextResponse.json({ error: 'Sign-in failed. Please try again.' }, { status: 500 })
	}

	if (!examiner) {
		await logAccess(req, {
			action: 'access_denied',
			examiner_email: normalized,
			denied: true,
			reason: 'no examiner record for this address',
			detail: { via },
		})
		return NextResponse.json(
			{
				error: 'not_registered',
				// The verified identity is handed back so the registration form can
				// prefill from a SERVER-verified address rather than a token the
				// browser decoded for itself.
				email: normalized,
				name: fallbackName || null,
				message: `${normalized} is not in the examiner panel. Complete the registration form below, or sign in with the address the Office of the Controller of Examinations has on record for you.`,
			},
			{ status: 404 }
		)
	}

	if (examiner.status !== 'ACTIVE') {
		await logAccess(req, {
			action: 'access_denied',
			examiner_id: examiner.id,
			examiner_email: normalized,
			denied: true,
			reason: `examiner status is ${examiner.status}`,
			detail: { via },
		})
		return NextResponse.json(
			{
				error: 'not_active',
				email: normalized,
				name: examiner.full_name || fallbackName || null,
				status: examiner.status,
				message:
					examiner.status === 'PENDING'
						? 'Your registration is awaiting approval by the Office of the Controller of Examinations.'
						: 'Your examiner registration is not active. Contact the Office of the Controller of Examinations.',
			},
			{ status: 403 }
		)
	}

	const kind: QpExaminerKind = examiner.is_internal ? 'internal' : 'external'
	const token = await signPortalSession({
		examinerId: examiner.id,
		email: normalized,
		name: examiner.full_name || fallbackName || normalized,
		kind,
		via,
	})

	// How many live assignments they hold — the page uses this to decide between
	// the portal dashboard and the "nothing assigned yet" card.
	const { count } = await supabase
		.from('ia_qp_assignments')
		.select('id', { count: 'exact', head: true })
		.eq('examiner_id', examiner.id)
		.neq('status', 'cancelled')

	await supabase
		.from('examiners')
		.update({ portal_last_login_at: new Date().toISOString() })
		.eq('id', examiner.id)

	await logAccess(req, {
		action: via === 'google' ? 'login_google' : 'login_otp',
		examiner_id: examiner.id,
		examiner_email: normalized,
		institutions_id: examiner.institution_id,
		detail: { assignments: count || 0 },
	})

	const res = NextResponse.json({
		success: true,
		examiner: {
			id: examiner.id,
			full_name: examiner.full_name,
			email: normalized,
			kind,
		},
		assignment_count: count || 0,
	})
	return setPortalCookie(res, token)
}

// ── One-time passwords ──────────────────────────────────────────────────────

export const OTP_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5

/** Six digits from a cryptographic source — never Math.random for a credential. */
export function generateOtp(): string {
	return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Hash bound to the address, so a leaked hash cannot be replayed for another. */
export function hashOtp(code: string, email: string): string {
	return createHash('sha256').update(`${code}:${email.toLowerCase().trim()}`).digest('hex')
}

/** Constant-time hash comparison. */
export function otpMatches(code: string, email: string, storedHash: string): boolean {
	const candidate = Buffer.from(hashOtp(code, email), 'utf8')
	const stored = Buffer.from(storedHash || '', 'utf8')
	if (candidate.length !== stored.length) return false
	return timingSafeEqual(candidate, stored)
}
