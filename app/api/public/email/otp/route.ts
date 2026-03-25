import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * OTP Generation and Verification API
 * Generates OTP for email verification
 */

// Generate a 6-digit OTP
function generateOTP(): string {
	return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { email, action } = body

		if (!email?.trim()) {
			return NextResponse.json({ error: 'Email is required' }, { status: 400 })
		}

		const emailLower = email.toLowerCase().trim()
		const supabase = getSupabaseServer()

		if (action === 'send') {
			// Generate new OTP
			const otp = generateOTP()
			const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

			// Get client IP
			const forwardedFor = request.headers.get('x-forwarded-for')
			const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown'

			// Rate limiting: Check recent OTP requests
			const { data: recentRequests } = await supabase
				.from('examiner_email_verification')
				.select('id')
				.eq('email', emailLower)
				.gte('created_at', new Date(Date.now() - 60 * 1000).toISOString()) // Last 1 minute

			if (recentRequests && recentRequests.length >= 3) {
				return NextResponse.json({
					error: 'Too many OTP requests. Please wait a minute before trying again.'
				}, { status: 429 })
			}

			// Store OTP
			const { error: insertError } = await supabase
				.from('examiner_email_verification')
				.insert({
					email: emailLower,
					verification_code: otp,
					expires_at: expiresAt.toISOString(),
					ip_address: ip,
				})

			if (insertError) {
				console.error('Error storing OTP:', insertError)
				return NextResponse.json({ error: 'Failed to generate OTP' }, { status: 500 })
			}

			// In production, send email via SMTP
			// For now, we'll just return success
			// TODO: Integrate with email service

			console.log(`OTP for ${emailLower}: ${otp}`) // Remove in production

			return NextResponse.json({
				success: true,
				message: 'OTP sent to your email address. Please check your inbox.',
				// Remove in production - for testing only
				...(process.env.NODE_ENV === 'development' && { otp })
			})
		}

		if (action === 'verify') {
			const { otp } = body

			if (!otp?.trim()) {
				return NextResponse.json({ error: 'OTP is required' }, { status: 400 })
			}

			// Find valid OTP
			const { data: verification, error: fetchError } = await supabase
				.from('examiner_email_verification')
				.select('*')
				.eq('email', emailLower)
				.eq('verification_code', otp.trim())
				.eq('verified', false)
				.gte('expires_at', new Date().toISOString())
				.order('created_at', { ascending: false })
				.limit(1)
				.single()

			if (fetchError || !verification) {
				// Increment attempts
				await supabase
					.from('examiner_email_verification')
					.update({ attempts: supabase.rpc('increment_attempts') })
					.eq('email', emailLower)
					.eq('verified', false)

				return NextResponse.json({
					success: false,
					error: 'Invalid or expired OTP. Please try again.'
				}, { status: 400 })
			}

			// Mark as verified
			await supabase
				.from('examiner_email_verification')
				.update({ verified: true })
				.eq('id', verification.id)

			return NextResponse.json({
				success: true,
				message: 'Email verified successfully.',
				verified: true
			})
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
	} catch (e) {
		console.error('OTP API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
