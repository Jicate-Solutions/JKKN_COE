// Examiner portal — e-mail one-time password sign-in.
//
// POST /api/examiner-portal/auth/otp  { action: 'send' | 'verify', email, code? }
//
// The alternative to Google for an examiner whose registered address is not
// Google-backed. Codes are stored hashed (ia_qp_portal_otps), expire in ten
// minutes, allow five attempts and are consumed on first success.
//
// Enumeration is avoided on purpose: 'send' answers the same way whether or not
// the address is in the panel, and only actually mails a code when it is.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/services/email-service'
import {
	completeLogin,
	generateOtp,
	hashOtp,
	otpMatches,
	OTP_MAX_ATTEMPTS,
	OTP_TTL_MINUTES,
} from '@/lib/qp-portal/login'
import { logAccess, requestOrigin } from '@/lib/qp-portal/guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Same wording whichever branch we took, so the reply reveals nothing. */
const SENT_MESSAGE = `If that address is registered as an examiner, a 6-digit code has been sent to it. The code is valid for ${OTP_TTL_MINUTES} minutes.`

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function otpEmailHtml(code: string, institutionName: string): string {
	return `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;">
	<p>Your sign-in code for the Examiner Portal is:</p>
	<p style="font-size:30px;font-weight:bold;letter-spacing:8px;margin:18px 0;">${code}</p>
	<p>The code is valid for ${OTP_TTL_MINUTES} minutes and can be used once.</p>
	<p style="font-size:12px;color:#555;">
		If you did not try to sign in, ignore this e-mail and do not share the code with anyone.
		Staff of the Office of the Controller of Examinations will never ask you for it.
	</p>
	<p>${institutionName}</p>
</div>`
}

export async function POST(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json().catch(() => ({}))
		const action = body.action === 'verify' ? 'verify' : 'send'
		const email = String(body.email || '').toLowerCase().trim()

		if (!email || !EMAIL_RE.test(email)) {
			return NextResponse.json({ error: 'Enter a valid e-mail address.' }, { status: 400 })
		}

		const { ip } = requestOrigin(req)

		// ── Send ───────────────────────────────────────────────────────────────
		if (action === 'send') {
			// Throttle by address: three codes a minute is plenty for a real person.
			const { data: recent } = await supabase
				.from('ia_qp_portal_otps')
				.select('id')
				.eq('email', email)
				.gte('created_at', new Date(Date.now() - 60_000).toISOString())
			if ((recent?.length || 0) >= 3) {
				return NextResponse.json(
					{ error: 'Too many codes requested. Wait a minute before trying again.' },
					{ status: 429 }
				)
			}

			const { data: examiner } = await supabase
				.from('examiners')
				.select('id, full_name, status, institution_code, institution_id')
				.eq('email', email)
				.maybeSingle()

			// Unknown or inactive address: log it and return the same message.
			if (!examiner || examiner.status !== 'ACTIVE') {
				await logAccess(req, {
					action: 'otp_requested',
					examiner_id: examiner?.id || null,
					examiner_email: email,
					denied: true,
					reason: examiner ? `examiner status is ${examiner.status}` : 'no examiner record',
				})
				return NextResponse.json({ success: true, message: SENT_MESSAGE })
			}

			const code = generateOtp()
			const { error: insErr } = await supabase.from('ia_qp_portal_otps').insert({
				email,
				code_hash: hashOtp(code, email),
				expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
				ip_address: ip,
			})
			if (insErr) {
				console.error('[QP portal] OTP store failed:', insErr.message)
				return NextResponse.json({ error: 'Could not send the code. Please try again.' }, { status: 500 })
			}

			let institutionName = 'Office of the Controller of Examinations'
			if (examiner.institution_id) {
				const { data: inst } = await supabase
					.from('institutions')
					.select('name')
					.eq('id', examiner.institution_id)
					.maybeSingle()
				if (inst?.name) institutionName = inst.name
			}

			const result = await sendEmail(
				{
					to: email,
					subject: 'Your Examiner Portal sign-in code',
					html: otpEmailHtml(code, institutionName),
				},
				examiner.institution_code || undefined
			)

			await logAccess(req, {
				action: 'otp_requested',
				examiner_id: examiner.id,
				examiner_email: email,
				institutions_id: examiner.institution_id,
				denied: !result.success,
				reason: result.success ? null : result.error || 'send failed',
			})

			if (!result.success) {
				console.error('[QP portal] OTP e-mail failed:', result.error)
				return NextResponse.json(
					{ error: 'The code could not be e-mailed just now. Try Google sign-in, or contact the Office of the Controller of Examinations.' },
					{ status: 502 }
				)
			}

			return NextResponse.json({ success: true, message: SENT_MESSAGE })
		}

		// ── Verify ─────────────────────────────────────────────────────────────
		const code = String(body.code || '').trim()
		if (!/^\d{6}$/.test(code)) {
			return NextResponse.json({ error: 'Enter the 6-digit code from the e-mail.' }, { status: 400 })
		}

		const { data: otp } = await supabase
			.from('ia_qp_portal_otps')
			.select('*')
			.eq('email', email)
			.is('consumed_at', null)
			.gte('expires_at', new Date().toISOString())
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle()

		if (!otp) {
			await logAccess(req, {
				action: 'access_denied',
				examiner_email: email,
				denied: true,
				reason: 'no live OTP for this address',
			})
			return NextResponse.json(
				{ error: 'That code has expired. Request a new one.' },
				{ status: 400 }
			)
		}

		if (otp.attempts >= OTP_MAX_ATTEMPTS) {
			// Burn it rather than leaving a guessable code alive.
			await supabase
				.from('ia_qp_portal_otps')
				.update({ consumed_at: new Date().toISOString() })
				.eq('id', otp.id)
			await logAccess(req, {
				action: 'access_denied',
				examiner_email: email,
				denied: true,
				reason: 'OTP attempt limit reached',
			})
			return NextResponse.json(
				{ error: 'Too many incorrect attempts. Request a new code.' },
				{ status: 429 }
			)
		}

		if (!otpMatches(code, email, otp.code_hash)) {
			await supabase
				.from('ia_qp_portal_otps')
				.update({ attempts: otp.attempts + 1 })
				.eq('id', otp.id)
			await logAccess(req, {
				action: 'access_denied',
				examiner_email: email,
				denied: true,
				reason: 'incorrect OTP',
				detail: { attempt: otp.attempts + 1 },
			})
			return NextResponse.json(
				{
					error: 'That code is not correct.',
					attempts_left: Math.max(OTP_MAX_ATTEMPTS - (otp.attempts + 1), 0),
				},
				{ status: 400 }
			)
		}

		// Consume before issuing the session so a replay of the same code fails.
		await supabase
			.from('ia_qp_portal_otps')
			.update({ consumed_at: new Date().toISOString() })
			.eq('id', otp.id)

		return await completeLogin(req, email, 'otp')
	} catch (error) {
		console.error('[QP portal] OTP route failed:', error)
		return NextResponse.json({ error: 'Sign-in failed. Please try again.' }, { status: 500 })
	}
}
