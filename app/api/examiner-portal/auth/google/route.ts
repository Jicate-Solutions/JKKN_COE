// Examiner portal — Google sign-in.
//
// POST /api/examiner-portal/auth/google  { credential }
//
// The credential is verified SERVER-SIDE with google-auth-library (signature,
// audience, issuer and expiry). The browser-side decode used by the public
// registration form is fine for pre-filling a form but must never gate access
// to a question paper.

import { NextRequest, NextResponse } from 'next/server'
import { verifyGoogleCredential } from '@/lib/qp-portal/session'
import { completeLogin } from '@/lib/qp-portal/login'
import { logAccess } from '@/lib/qp-portal/guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
	try {
		const { credential } = await req.json().catch(() => ({ credential: null }))
		if (!credential || typeof credential !== 'string') {
			return NextResponse.json({ error: 'Sign-in token missing.' }, { status: 400 })
		}

		const verified = await verifyGoogleCredential(credential)
		if (!verified) {
			await logAccess(req, {
				action: 'access_denied',
				denied: true,
				reason: 'Google credential failed verification',
				detail: { via: 'google' },
			})
			return NextResponse.json(
				{ error: 'Google sign-in could not be verified. Please try again.' },
				{ status: 401 }
			)
		}

		return await completeLogin(req, verified.email, 'google', verified.name)
	} catch (error) {
		console.error('[QP portal] Google sign-in failed:', error)
		return NextResponse.json({ error: 'Sign-in failed. Please try again.' }, { status: 500 })
	}
}
