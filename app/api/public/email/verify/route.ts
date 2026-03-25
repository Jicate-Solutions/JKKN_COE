import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import dns from 'dns'
import { promisify } from 'util'

const resolveMx = promisify(dns.resolveMx)

/**
 * Email Verification API
 * Validates email format, checks for typos, and verifies MX records
 */
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { email } = body

		if (!email?.trim()) {
			return NextResponse.json({
				valid: false,
				error: 'Email is required'
			}, { status: 400 })
		}

		const emailLower = email.toLowerCase().trim()

		// Step 1: Basic format validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(emailLower)) {
			return NextResponse.json({
				valid: false,
				error: 'Invalid email format'
			})
		}

		// Step 2: Check for common typos
		const domain = emailLower.split('@')[1]
		const typoMap: Record<string, string> = {
			'gmial.com': 'gmail.com',
			'gmal.com': 'gmail.com',
			'gamil.com': 'gmail.com',
			'gnail.com': 'gmail.com',
			'gmail.co': 'gmail.com',
			'gmaill.com': 'gmail.com',
			'yaho.com': 'yahoo.com',
			'yahooo.com': 'yahoo.com',
			'yahoo.co': 'yahoo.com',
			'hotmal.com': 'hotmail.com',
			'hotmial.com': 'hotmail.com',
			'outloo.com': 'outlook.com',
			'outlok.com': 'outlook.com',
		}

		if (typoMap[domain]) {
			return NextResponse.json({
				valid: false,
				error: `Possible typo detected. Did you mean ${emailLower.split('@')[0]}@${typoMap[domain]}?`,
				suggestion: `${emailLower.split('@')[0]}@${typoMap[domain]}`
			})
		}

		// Step 3: MX Record validation
		try {
			const mxRecords = await resolveMx(domain)
			if (!mxRecords || mxRecords.length === 0) {
				return NextResponse.json({
					valid: false,
					error: `The domain "${domain}" does not accept emails. Please check your email address.`
				})
			}
		} catch (dnsError: any) {
			// ENOTFOUND means domain doesn't exist
			if (dnsError.code === 'ENOTFOUND' || dnsError.code === 'ENODATA') {
				return NextResponse.json({
					valid: false,
					error: `The domain "${domain}" does not exist. Please check your email address.`
				})
			}
			// For other DNS errors, we'll allow the email (might be temporary issue)
			console.warn('DNS lookup warning:', dnsError.message)
		}

		// Step 4: Check if email already registered
		const supabase = getSupabaseServer()
		const { data: existingExaminer } = await supabase
			.from('examiners')
			.select('id, status, full_name')
			.eq('email', emailLower)
			.single()

		if (existingExaminer) {
			return NextResponse.json({
				valid: true,
				exists: true,
				status: existingExaminer.status,
				message: existingExaminer.status === 'ACTIVE'
					? 'This email is already registered as an active examiner.'
					: existingExaminer.status === 'PENDING'
					? 'A registration with this email is pending approval.'
					: 'This email has a previous registration record.'
			})
		}

		return NextResponse.json({
			valid: true,
			exists: false,
			message: 'Email is valid and available for registration.'
		})
	} catch (e) {
		console.error('Email verification error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
